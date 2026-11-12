// Main-thread client for the synthesis worker.
import { createStore } from '../lib/store';
import { cacheClear, isCached } from './cache';
import type { FromWorker, ToWorker } from './protocol';
import { KOKORO_MODEL, PIPER_BASE, VOICES, voiceById } from './voices';

export type VoiceStatus = 'unknown' | 'remote' | 'cached' | 'loading' | 'ready' | 'error';
export interface VoiceState {
  status: VoiceStatus;
  progress: number;
  device?: 'gpu' | 'cpu';
  error?: string;
}

let preferGpu = true;

export const voiceStates = createStore<Record<string, VoiceState>>(
  Object.fromEntries(VOICES.map((v) => [v.id, { status: 'unknown', progress: 0 }])),
);
export const engineInfo = createStore<{ threads: number; isolated: boolean; lastRtf?: number }>({ threads: 1, isolated: false });

/** Smoothed real-time factor per voice (seconds of compute per second of audio). */
const rtfByVoice = new Map<string, number>();
export const measuredRtf = (voiceId: string) => rtfByVoice.get(voiceId);

function patch(id: string, s: Partial<VoiceState>) {
  voiceStates.set((prev) => ({ ...prev, [id]: { ...prev[id], ...s } }));
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: { samples: Float32Array; sampleRate: number }) => void; reject: (e: Error) => void; chars: number; voiceId: string }>();
const loaders = new Map<string, { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'narrator-tts' });
  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    switch (m.type) {
      case 'hello':
        engineInfo.set((p) => ({ ...p, threads: m.threads, isolated: m.isolated }));
        break;
      case 'gpu-rejected':
        // Remember per device, so the slow GPU probe isn't repeated on every launch.
        try { localStorage.setItem(`narrator.gpu-bad.${m.engine}`, '1'); } catch { /* private mode */ }
        break;
      case 'progress':
        patch(m.voiceId, { status: 'loading', progress: m.total ? m.loaded / m.total : 0 });
        break;
      case 'ready':
        patch(m.voiceId, { status: 'ready', progress: 1, error: undefined, device: m.device });
        if (voiceById(m.voiceId).engine === 'kokoro') {
          for (const v of VOICES) if (v.engine === 'kokoro' && v.id !== m.voiceId && voiceStates.get()[v.id].status !== 'ready') patch(v.id, { status: 'cached', progress: 1 });
        }
        loaders.get(m.voiceId)?.resolve();
        break;
      case 'load-error':
        patch(m.voiceId, { status: 'error', error: m.message });
        loaders.get(m.voiceId)?.reject(new Error(m.message));
        loaders.delete(m.voiceId);
        break;
      case 'audio': {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (p) {
          const audioSec = m.samples.length / m.sampleRate;
          const rtf = m.ms / 1000 / Math.max(0.05, audioSec);
          const prev = rtfByVoice.get(p.voiceId);
          // Both English voices share one model, so they share a speed estimate.
          const ids = voiceById(p.voiceId).engine === 'kokoro' ? VOICES.filter((v) => v.engine === 'kokoro').map((v) => v.id) : [p.voiceId];
          for (const id of ids) rtfByVoice.set(id, prev === undefined ? rtf : prev * 0.6 + rtf * 0.4);
          engineInfo.set((s) => ({ ...s, lastRtf: rtf }));
          p.resolve({ samples: m.samples, sampleRate: m.sampleRate });
        }
        break;
      }
      case 'error': {
        const p = pending.get(m.id);
        pending.delete(m.id);
        p?.reject(new Error(m.message));
        break;
      }
    }
  };
  worker.onerror = (e) => console.error('TTS worker error', e);
  const gpuBlocked = (['kokoro', 'piper'] as const).filter((e) => {
    try { return localStorage.getItem(`narrator.gpu-bad.${e}`) === '1'; } catch { return false; }
  });
  worker.postMessage({ type: 'config', gpu: preferGpu, gpuBlocked: [...gpuBlocked] } satisfies ToWorker);
  return worker;
}

function resetWorker() {
  worker?.terminate();
  worker = null;
  loaders.clear();
  pending.forEach((p) => p.reject(new Error('cancelled')));
  pending.clear();
}

/** GPU (WebGPU) is much faster where available; switching restarts the engine. */
export function setAcceleration(gpu: boolean) {
  if (gpu === preferGpu) return;
  preferGpu = gpu;
  // Turning GPU on explicitly means "try again", even where it failed before.
  if (gpu) for (const e of ['kokoro', 'piper']) try { localStorage.removeItem(`narrator.gpu-bad.${e}`); } catch { /* ignore */ }
  if (!worker) return;
  resetWorker();
  voiceStates.set((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.status === 'ready' || v.status === 'loading' ? { status: 'cached', progress: 1 } : v])));
}

const send = (m: ToWorker) => getWorker().postMessage(m);

export function loadVoice(voiceId: string): Promise<void> {
  const existing = loaders.get(voiceId);
  if (existing) return existing.promise;
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  loaders.set(voiceId, { promise, resolve, reject });
  const cur = voiceStates.get()[voiceId];
  patch(voiceId, { status: 'loading', progress: cur.status === 'cached' ? 1 : 0, error: undefined });
  send({ type: 'load', voiceId });
  return promise;
}

export interface SynthJob {
  id: number;
  promise: Promise<{ samples: Float32Array; sampleRate: number }>;
}

export function synthesize(voiceId: string, text: string, speed: number): SynthJob {
  const id = nextId++;
  const promise = new Promise<{ samples: Float32Array; sampleRate: number }>((resolve, reject) => {
    pending.set(id, { resolve, reject, chars: text.length, voiceId });
  });
  void loadVoice(voiceId).catch(() => {});
  send({ type: 'synth', id, voiceId, text, speed });
  return { id, promise };
}

export function cancel(ids: number[]) {
  if (ids.length) send({ type: 'cancel', ids });
}

/** Checks Cache Storage so the Voices screen can show what's already on the device. */
export async function refreshCacheStatus() {
  const kokoroCached = await isCached(`https://huggingface.co/${KOKORO_MODEL}/resolve/main/onnx/model.onnx`);
  for (const v of VOICES) {
    const cur = voiceStates.get()[v.id];
    if (cur.status === 'loading' || cur.status === 'ready') continue;
    const cached = v.engine === 'kokoro' ? kokoroCached : await isCached(`${PIPER_BASE}${v.key}.onnx`);
    patch(v.id, { status: cached ? 'cached' : 'remote', progress: cached ? 1 : 0 });
  }
}

export async function clearModelCache() {
  resetWorker();
  await cacheClear();
  await Promise.all(['narrator-models-v1', 'transformers-cache', 'kokoro-voices'].map((n) => caches.delete(n).catch(() => false)));
  for (const v of VOICES) patch(v.id, { status: 'remote', progress: 0 });
}

/** Warm the worker early so WASM compiles while the user is still typing. */
export function warmUp() {
  getWorker();
}
