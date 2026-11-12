/// <reference lib="webworker" />
// All neural inference runs here so the UI stays at 60/120 fps.
import * as ort from 'onnxruntime-web';
import ortWasm from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import ortGlue from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import { KokoroTTS } from 'kokoro-js';
import { env as hfEnv } from '@huggingface/transformers';
import { PiperVoice } from './piper';
import { cacheGet, fetchCached, transformersCache } from './cache';
import { postProcess, trimSilence } from './dsp';
import { KOKORO_MODEL, PIPER_BASE, voiceById } from './voices';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

ort.env.wasm.wasmPaths = { wasm: ortWasm, mjs: ortGlue };
// Kokoro's 326 MB model is too big for the Cache API in Chromium; store it in OPFS instead.
hfEnv.useBrowserCache = false;
hfEnv.useCustomCache = true;
hfEnv.customCache = transformersCache;
// Measured: synthesis speed scales well up to ~8 threads; keep two cores free for UI + audio.
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2)) : 1;

/**
 * Some GPUs return NaN, silence or truncated audio from Kokoro on WebGPU, so every GPU result is
 * checked: finite, audible, and at least ~40% of the duration the text should take to say.
 */
function plausible(samples: Float32Array, sampleRate: number, text: string, speed: number): boolean {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!Number.isFinite(v)) return false;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  // Measured failure mode: a single click followed by near-silence. Judge the *speech* length.
  const speech = trimSilence(samples, sampleRate, 0).length / sampleRate;
  const expected = text.replace(/\s+/g, ' ').length / 15 / speed; // ≈15 characters per second
  return peak > 0.02 && speech > Math.max(0.3, expected * 0.4);
}

let kokoroCpuOnly = false;

function rejectGpu(engine: 'kokoro') {
  kokoroCpuOnly = true;
  post({ type: 'gpu-rejected', engine });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms} ms`)), ms))]);
}

const KOKORO_ONNX = `https://huggingface.co/${KOKORO_MODEL}/resolve/main/onnx/model.onnx`;

const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, transfer);

let wantGpu = true;
let gpuOk: Promise<boolean> | null = null;
const hasGpu = () =>
  (gpuOk ??= (async () => {
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      return !!(gpu && (await gpu.requestAdapter()));
    } catch {
      return false;
    }
  })());

let kokoro: Promise<{ tts: KokoroTTS; device: 'gpu' | 'cpu' }> | null = null;
const piper = new Map<string, Promise<PiperVoice>>();

function loadKokoro(): Promise<{ tts: KokoroTTS; device: 'gpu' | 'cpu' }> {
  if (!kokoro) {
    kokoro = (async () => {
      // Download the big model file ourselves first (with progress, into the shared model store),
      // so the GPU attempt below can be time-limited without counting download time.
      // fp32 is both the best-sounding and (measured) the fastest CPU variant: q8 is ~2.5× slower in WASM.
      if (!(await cacheGet(KOKORO_ONNX))) {
        await fetchCached(KOKORO_ONNX, (loaded, total) => {
          // Both English voices share one model, so report to both.
          for (const id of ['en-f', 'en-m']) post({ type: 'progress', voiceId: id, loaded, total });
        });
      }
      if (wantGpu && !kokoroCpuOnly && (await hasGpu())) {
        try {
          const tts = await withTimeout(KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'fp32', device: 'webgpu' }), 30000);
          const probeText = 'Hello there, this is a quick check of the graphics chip.';
          const probe = await withTimeout(tts.generate(probeText, { voice: 'af_heart' }), 20000);
          if (plausible(probe.audio, probe.sampling_rate, probeText, 1)) return { tts, device: 'gpu' as const };
          console.warn('Kokoro on WebGPU produced invalid audio on this GPU, using CPU');
        } catch (e) {
          console.warn('Kokoro on WebGPU failed, using CPU', e);
        }
        rejectGpu('kokoro');
      }
      const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'fp32', device: 'wasm' });
      return { tts, device: 'cpu' as const };
    })();
    kokoro.catch(() => { kokoro = null; });
  }
  return kokoro;
}

function loadPiper(voiceId: string): Promise<PiperVoice> {
  let p = piper.get(voiceId);
  if (!p) {
    const v = voiceById(voiceId);
    p = PiperVoice.load(PIPER_BASE + v.key, (loaded, total) => post({ type: 'progress', voiceId, loaded, total }));
    p.catch(() => piper.delete(voiceId));
    piper.set(voiceId, p);
  }
  return p;
}

async function ensure(voiceId: string): Promise<'gpu' | 'cpu'> {
  const v = voiceById(voiceId);
  if (v.engine === 'kokoro') return (await loadKokoro()).device;
  return (await loadPiper(voiceId)).device;
}

async function synth(voiceId: string, text: string, speed: number): Promise<{ samples: Float32Array; sampleRate: number }> {
  const v = voiceById(voiceId);
  if (v.engine === 'kokoro') {
    const { tts, device } = await loadKokoro();
    const audio = await tts.generate(text, { voice: v.key as 'af_heart', speed });
    if (device === 'gpu' && !plausible(audio.audio, audio.sampling_rate, text, speed)) {
      // The GPU produced bad audio: switch to CPU for good and redo this sentence.
      console.warn('Kokoro GPU output rejected; switching to CPU');
      rejectGpu('kokoro');
      kokoro = null;
      const cpu = await loadKokoro();
      for (const id of ['en-f', 'en-m']) post({ type: 'ready', voiceId: id, device: cpu.device });
      return synth(voiceId, text, speed);
    }
    return { samples: new Float32Array(audio.audio), sampleRate: audio.sampling_rate };
  }
  const voice = await loadPiper(voiceId);
  return { samples: await voice.synthesize(text, speed), sampleRate: voice.sampleRate };
}

// Jobs run strictly one at a time (ONNX sessions are not re-entrant); stale jobs can be dropped.
const queue: Extract<ToWorker, { type: 'synth' }>[] = [];
let busy = false;

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      await ensure(job.voiceId); // model loading shouldn't count toward the speed measurement
      const t0 = performance.now();
      const { samples, sampleRate } = await synth(job.voiceId, job.text, job.speed);
      const out = postProcess(samples, sampleRate);
      post({ type: 'audio', id: job.id, samples: out, sampleRate, ms: performance.now() - t0 }, [out.buffer]);
    } catch (e) {
      post({ type: 'error', id: job.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  busy = false;
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'config':
      wantGpu = msg.gpu;
      kokoroCpuOnly = msg.gpuBlocked.includes('kokoro');
      break;
    case 'load':
      try {
        const device = await ensure(msg.voiceId);
        post({ type: 'ready', voiceId: msg.voiceId, device });
      } catch (e) {
        post({ type: 'load-error', voiceId: msg.voiceId, message: e instanceof Error ? e.message : String(e) });
      }
      break;
    case 'synth':
      queue.push(msg);
      void pump();
      break;
    case 'cancel': {
      const drop = new Set(msg.ids);
      for (let i = queue.length - 1; i >= 0; i--) {
        if (drop.has(queue[i].id)) {
          post({ type: 'error', id: queue[i].id, message: 'cancelled' });
          queue.splice(i, 1);
        }
      }
      break;
    }
  }
};

post({ type: 'hello', threads: ort.env.wasm.numThreads ?? 1, isolated: self.crossOriginIsolated });
