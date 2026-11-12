// Dev-only benchmark: /?kbench&dtype=fp32&device=wasm
import * as ort from 'onnxruntime-web';
import ortWasm from '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import { KokoroTTS } from 'kokoro-js';

export async function kokoroBench(root: HTMLElement) {
  const p = new URLSearchParams(location.search);
  ort.env.wasm.wasmPaths = { wasm: ortWasm };
  ort.env.wasm.numThreads = crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;
  const log = (s: string) => { root.textContent += s + '\n'; };
  root.style.cssText = 'white-space:pre;color:#fff;font:14px monospace;padding:16px';
  log(`cores=${navigator.hardwareConcurrency} threads=${ort.env.wasm.numThreads}`);
  for (const spec of (p.get('specs') ?? 'fp32:wasm,q4:wasm').split(',')) {
    const [dtype, device] = spec.split(':');
    try {
      const t0 = performance.now();
      const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: dtype as 'fp32', device: device as 'wasm' });
      log(`${spec} load ${Math.round(performance.now() - t0)}ms`);
      for (let i = 0; i < 2; i++) {
        const t = performance.now();
        const a = await tts.generate('The quick brown fox jumps over the lazy dog, and then it runs away into the forest.', { voice: 'af_heart' });
        const sec = a.audio.length / a.sampling_rate;
        let peak = 0; for (const v of a.audio) peak = Math.max(peak, Math.abs(v));
        const ms = performance.now() - t;
        log(`  run${i} ${Math.round(ms)}ms for ${sec.toFixed(2)}s RTF=${(ms / 1000 / sec).toFixed(2)} peak=${peak.toFixed(2)}`);
      }
    } catch (e) {
      log(`${spec} FAILED ${e}`);
    }
  }
  log('KBENCH DONE');
}
