// A small Piper (VITS) runtime: piper-phonemize (espeak-ng, WASM) → phoneme IDs → ONNX inference.
// Using Piper's own phonemizer gives exactly the phoneme stream the German voices were trained on.
import * as ort from 'onnxruntime-web';
// Loaded as a plain asset and evaluated at runtime: it's an Emscripten CommonJS script, and
// bundling it changes how it detects its environment (it hung in the production bundle).
import phonemizeJs from '../../node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.js?url';
import phonemizeWasm from '../../node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url';
import phonemizeData from '../../node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data?url';
import { fetchCached } from './cache';

interface PiperConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  num_speakers: number;
}

interface PhonemizeModule {
  callMain(args: string[]): number;
}

let sink: ((line: string) => void) | null = null;
let modulePromise: Promise<PhonemizeModule> | null = null;

async function loadFactory(): Promise<(o: object) => Promise<PhonemizeModule>> {
  const code = await (await fetch(phonemizeJs)).text();
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`${code}\n;return createPiperPhonemize;`)() as (o: object) => Promise<PhonemizeModule>;
}

function phonemizer(): Promise<PhonemizeModule> {
  if (!modulePromise) {
    modulePromise = loadFactory().then((create) => create({
      print: (line: string) => sink?.(line),
      printErr: (line: string) => console.warn('[piper-phonemize]', line),
      locateFile: (url: string) => (url.endsWith('.wasm') ? phonemizeWasm : url.endsWith('.data') ? phonemizeData : url),
    }));
    modulePromise.catch((e) => { console.error('piper-phonemize failed to load', e); modulePromise = null; });
  }
  return modulePromise;
}

/** Text → Piper phoneme IDs (with BOS/EOS and padding), for an espeak voice like "de". */
async function phonemeIds(text: string, voice: string): Promise<number[]> {
  const mod = await phonemizer();
  const ids: number[] = [];
  const lines: string[] = [];
  sink = (l) => lines.push(l);
  try {
    mod.callMain(['-l', voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  } finally {
    sink = null;
  }
  for (const l of lines) {
    try {
      const parsed = JSON.parse(l) as { phoneme_ids?: number[] };
      if (parsed.phoneme_ids) ids.push(...parsed.phoneme_ids);
    } catch { /* non-JSON output */ }
  }
  return ids;
}

export class PiperVoice {
  private constructor(
    private session: ort.InferenceSession,
    private config: PiperConfig,
    readonly device: 'gpu' | 'cpu',
  ) {}

  get sampleRate() {
    return this.config.audio.sample_rate;
  }

  /**
   * CPU only, on purpose: the medium VITS voices already synthesize ~8× faster than real time in
   * multi-threaded WASM, while ONNX Runtime's WebGPU backend rejects or hangs on some VITS ops.
   */
  static async load(url: string, onProgress?: (loaded: number, total: number) => void): Promise<PiperVoice> {
    const [cfgBuf, model] = await Promise.all([fetchCached(`${url}.onnx.json`), fetchCached(`${url}.onnx`, onProgress), phonemizer()]);
    const config = JSON.parse(new TextDecoder().decode(cfgBuf)) as PiperConfig;
    const session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return new PiperVoice(session, config, 'cpu');
  }

  async synthesize(text: string, speed = 1): Promise<Float32Array> {
    const ids = await phonemeIds(text, this.config.espeak.voice);
    if (ids.length < 3) return new Float32Array(0);
    const { noise_scale, length_scale, noise_w } = this.config.inference;
    const feeds: Record<string, ort.Tensor> = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([noise_scale, length_scale / speed, noise_w]), [3]),
    };
    if (this.config.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
    const out = await this.session.run(feeds);
    const audio = out[this.session.outputNames[0]];
    return new Float32Array(audio.data as Float32Array);
  }
}
