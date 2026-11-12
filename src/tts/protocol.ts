export type ToWorker =
  | { type: 'config'; gpu: boolean; gpuBlocked: Array<'kokoro' | 'piper'> }
  | { type: 'load'; voiceId: string }
  | { type: 'synth'; id: number; voiceId: string; text: string; speed: number }
  | { type: 'cancel'; ids: number[] };

export type FromWorker =
  | { type: 'hello'; threads: number; isolated: boolean }
  | { type: 'gpu-rejected'; engine: 'kokoro' | 'piper' }
  | { type: 'progress'; voiceId: string; loaded: number; total: number }
  | { type: 'ready'; voiceId: string; device: 'gpu' | 'cpu' }
  | { type: 'load-error'; voiceId: string; message: string }
  | { type: 'audio'; id: number; samples: Float32Array; sampleRate: number; ms: number }
  | { type: 'error'; id: number; message: string };
