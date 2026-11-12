// Audio post-processing applied to every synthesized chunk.

/** Removes leading/trailing near-silence, keeping a short natural pad. */
export function trimSilence(x: Float32Array, sampleRate: number, padMs = 35, thresholdDb = -46): Float32Array {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak === 0) return x;
  const thr = peak * Math.pow(10, thresholdDb / 20);
  const win = Math.max(1, Math.round(sampleRate * 0.005));
  const loud = (i: number) => {
    let s = 0;
    for (let j = i; j < Math.min(x.length, i + win); j++) s = Math.max(s, Math.abs(x[j]));
    return s > thr;
  };
  let a = 0;
  while (a < x.length && !loud(a)) a += win;
  let b = x.length - win;
  while (b > a && !loud(b)) b -= win;
  const pad = Math.round((sampleRate * padMs) / 1000);
  return x.slice(Math.max(0, a - pad), Math.min(x.length, b + win + pad));
}

/** Raised-cosine fades to avoid clicks at chunk boundaries. */
export function fade(x: Float32Array, sampleRate: number, ms = 8): Float32Array {
  const n = Math.min(Math.floor(x.length / 2), Math.round((sampleRate * ms) / 1000));
  for (let i = 0; i < n; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
    x[i] *= g;
    x[x.length - 1 - i] *= g;
  }
  return x;
}

/**
 * Levels loudness to a target RMS (speech-gated) with a soft peak limiter, so all four voices and all
 * sentences play at the same perceived volume.
 */
export function level(x: Float32Array, targetDb = -19, ceiling = 0.92): Float32Array {
  // Speech-gated RMS: ignore the quietest frames
  const frame = 512;
  const energies: number[] = [];
  for (let i = 0; i < x.length; i += frame) {
    let s = 0;
    const end = Math.min(x.length, i + frame);
    for (let j = i; j < end; j++) s += x[j] * x[j];
    energies.push(s / (end - i));
  }
  const sorted = [...energies].sort((a, b) => a - b);
  const gated = sorted.slice(Math.floor(sorted.length * 0.3));
  const rms = Math.sqrt(gated.reduce((a, b) => a + b, 0) / Math.max(1, gated.length));
  if (!rms) return x;
  const gain = Math.min(6, Math.pow(10, targetDb / 20) / rms);
  for (let i = 0; i < x.length; i++) {
    const v = x[i] * gain;
    // tanh-style soft clip above the ceiling
    const a = Math.abs(v);
    x[i] = a <= ceiling ? v : Math.sign(v) * (ceiling + (1 - ceiling) * Math.tanh((a - ceiling) / (1 - ceiling)));
  }
  return x;
}

export function postProcess(x: Float32Array, sampleRate: number): Float32Array {
  return level(fade(trimSilence(x, sampleRate), sampleRate));
}

/** 16-bit PCM WAV encoder. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
