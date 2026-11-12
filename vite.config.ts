import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Cross-origin isolation unlocks SharedArrayBuffer, which lets ONNX Runtime run
// multi-threaded WASM (≈2–4× faster synthesis). `credentialless` keeps CORS fetches
// to the Hugging Face model hub working without them sending CORP headers.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Use ONNX Runtime's non-bundled build: it loads its Emscripten glue (.mjs) from a separate
      // file, so its pthread workers boot ORT itself. With the default bundled build inlined into
      // our worker, every pthread would boot our whole TTS worker and the thread pool deadlocks.
      { find: /^onnxruntime-web$/, replacement: fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.min.mjs', import.meta.url)) },
    ],
  },
  server: { headers: isolation, port: 5173 },
  preview: { headers: isolation, port: 4173 },
  worker: { format: 'es' },
  optimizeDeps: {
    // These ship their own WASM loaders and must not be pre-bundled.
    exclude: ['onnxruntime-web', 'phonemizer', 'kokoro-js', '@huggingface/transformers'],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
