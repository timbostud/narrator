# Narrator

An installable web app (PWA) that reads any text aloud with **natural neural voices in English and
German**, entirely on your device, with an interface built on Apple's **Liquid Glass** design language.

The full product spec (the improved version of the original brief) is in [SPEC.md](SPEC.md).

## Voices

| Language | Voice | Model | Size |
|---|---|---|---|
| English, female | **Ava** | Kokoro-82M `af_heart` | 326 MB (shared) |
| English, male | **Leo** | Kokoro-82M `am_michael` | same model |
| German, female | **Lena** | Piper VITS `de_DE-kerstin-medium` | 63 MB |
| German, male | **Jonas** | Piper VITS `de_DE-thorsten-medium` | 63 MB |

Each voice downloads once (into the Origin Private File System) and then works offline.
With **Auto** language, each paragraph is detected separately, so mixed English/German texts switch voices
by themselves.

### What makes it sound right

Most TTS mistakes are text mistakes, so the app has its own text front-end for each language
(`src/tts/text/`, covered by `npm test`):

- **English:** `$4.99` → *four dollars and ninety-nine cents*, `1999` → *nineteen ninety-nine*,
  `March 3rd` → *March third*, `7:45 pm`, `12.5%`, `5–10 km`, `Dr.`/`St.`/`e.g.`/`i.e.`, acronyms (`FBI`).
- **German:** `Am 3. Mai` → *Am dritten Mai* (case follows the preposition), `12.11.2026`,
  `5,99 €` → *fünf Euro neunundneunzig*, `14:30 Uhr`, `1989` → *neunzehnhundertneunundachtzig*,
  `1 Stunde` → *eine Stunde*, `z. B.`, `d. h.`, `usw.`, `ca.`, `km/h`, …
- Sentence splitting that knows abbreviations, so it doesn't break after "Dr." or "z. B.". Clause-aware
  chunking for long sentences, and natural pauses between clauses, sentences and paragraphs.
- Audio post-processing: silence trimming, de-click fades, and loudness levelling across voices.

## Design

- **Refraction, not just blur:** each glass shape gets a generated displacement map (squircle bezel
  profile) driven through an SVG `feDisplacementMap` with slight chromatic dispersion, via
  `backdrop-filter: url(#…)`. Chromium browsers show true refraction; others fall back to frosted glass.
- **Specular light** follows the pointer, or device tilt on phones.
- **Liquid lens** tab bar and segmented controls: drag the selection and it stretches with velocity.
- **Squeeze on pull:** cards and rows stretch toward your finger and squeeze across (volume-preserving),
  with rubber-band limits and a jelly spring-back. Glass buttons *grow* when pressed, like in iOS 26.
- Swipe library rows right to play and left to delete (with undo). Long-press to pin. Pull down to create.
  Swipe the mini player sideways to skip sentences or up to expand it. Drag the player sheet down to close it.
- Every motion is a spring (`src/ui/physics.ts`), so animations can be interrupted and keep their momentum.
  Honours *Reduce Motion*. Settings offer Liquid, Frosted and Tinted glass.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # text normalization tests
npm run build      # production build in dist/
```

Synthesis runs multi-threaded when the page is cross-origin isolated. The dev/preview servers send the
headers, and `public/sw.js` adds them on static hosts such as GitHub Pages.

## Performance notes (measured)

- German (Piper medium): ~0.12–0.17 RTF, about 6–8× faster than real time on CPU.
- English (Kokoro fp32, CPU, 8 threads): about 1.0–1.3 RTF on the dev machine. When a device is slower than
  real time, the player pre-buffers just enough audio up front (`B ≥ D·(rtf−1)/rtf`) so playback doesn't
  stall. On GPUs where Kokoro's WebGPU path works, it runs several times faster. Every GPU result is
  validated, and a GPU that produces bad audio is remembered and skipped.
- Kokoro q8 was measured about 2.5× slower than fp32 in WASM, which is why fp32 is used.

## Credits

Kokoro-82M by hexgrad (Apache-2.0) via kokoro-js · Piper by Rhasspy, with voices Thorsten (Thorsten-Voice) and Kerstin
(CC0) · ONNX Runtime Web · espeak-ng via piper-phonemize.
