# Narrator — Product & Engineering Spec

> This is the improved, build-ready version of the original request:
> *"a really good narrator with natural voices, 2 different for English and German, very good grammatical
> voice output, an Apple-like app with Liquid Glass design, swipe gestures, and items that squeeze when you
> pull on them."*

## 1. Goal

A **local-first, installable web app (PWA)** that reads any text aloud with **natural neural voices** in
**English and German**. It must sound human, read numbers, dates, money, times and abbreviations
*correctly for each language*, and feel like a first-party Apple app built with the **iOS 26 Liquid Glass**
design language: refractive glass controls, specular light that reacts to movement, and spring-physics
gestures where things stretch, squeeze and wobble when you pull them.

## 2. Voices (4 total, one female + one male per language)

All synthesis runs **on-device** (WebAssembly / ONNX Runtime in a Web Worker). No cloud TTS and no API keys,
and the app works offline after each voice is downloaded once.

| Language | Voice | Gender | Model | Why |
|---|---|---|---|---|
| English | **Ava** | female | Kokoro-82M `af_heart` | Kokoro is currently the most natural small open TTS model; `af_heart` is its top-graded voice |
| English | **Leo** | male | Kokoro-82M `am_michael` | Warm, calm male narrator voice from the same model |
| German | **Lena** | female | Piper VITS `de_DE-kerstin-medium` | Clear, neutral Hochdeutsch female voice |
| German | **Jonas** | male | Piper VITS `de_DE-thorsten-high` | The highest-quality open German voice (Thorsten-Voice) |

The engine code is our own: phonemization (espeak-ng → IPA → Piper phoneme IDs), ONNX inference,
chunk scheduling, loudness levelling, silence trimming and de-clicking. The voice *weights* are open models
(Apache-2.0 / CC0), downloaded on demand and cached in the browser.

## 3. "Very good grammatical output": the text front-end

The models only see what we feed them, so most of the quality comes from the text front-end.

1. **Sentence segmentation** with `Intl.Segmenter`, made aware of abbreviations (`Dr.`, `z. B.`, `e.g.`,
   ordinals like `3.` in German), so sentences never split in the wrong place.
2. **Language detection per paragraph** (stop-word scoring), so mixed EN/DE texts switch automatically to
   the voice of the same gender in the other language.
3. **Normalization, per language:**
   - **English:** cardinals, ordinals (`21st`), years (`1999` → *nineteen ninety-nine*, `2026` → *twenty
     twenty-six*), decimals, negatives, money (`$4.99` → *four dollars and ninety-nine cents*, `€`, `£`),
     percentages, times (`7:45 pm`), ranges (`5–10` → *five to ten*), fractions, units (`km`, `kg`, `°C`,
     `mph`), abbreviations (`Mr.`, `Dr.`, `St.`, `e.g.`, `i.e.`, `etc.`, `vs.`), URLs and e-mails.
   - **German:** compound numerals (`21` → *einundzwanzig*, `1.234.567` with `.` as thousands separator),
     decimal comma (`3,14` → *drei Komma eins vier*), *ein/eins* agreement, ordinals with case after
     prepositions (`am 3. Mai` → *am dritten Mai*), full dates (`12.11.2026`), years (`1990` →
     *neunzehnhundertneunzig*), times (`14:30 Uhr` → *vierzehn Uhr dreißig*), money (`5,99 €` → *fünf Euro
     neunundneunzig*), `%`, units (`km/h`, `°C`), abbreviations (`z. B.`, `d. h.`, `usw.`, `bzw.`, `ca.`,
     `Nr.`, `Str.`, `ggf.`, `inkl.`, `Mio.`, `Mrd.` …).
4. **Prosody:** natural pauses between clauses, sentences, paragraphs and headings (user-adjustable).
   Long sentences are split at clause boundaries so the model keeps good intonation.
5. **Audio post-processing:** trim model silence, 8 ms fades (no clicks), RMS levelling so every voice and
   every sentence plays at the same loudness.

## 4. Design: Liquid Glass

Studied from Apple's WWDC25 material and the references on liquidglassdesign.com:

- **Glass is a material, not a blur.** It *refracts*: content bends at the curved edge, like a lens.
  Implemented with a generated displacement map + SVG `feDisplacementMap` (Chromium), falling back to
  blur + saturation elsewhere.
- **Specular light:** a moving highlight and rim light that follow the pointer, or device tilt on phones.
- **Adaptive tint:** glass picks up the colour of the content behind it.
- **Glass is for the floating layer only:** tab bar, mini-player, buttons, sliders and sheets. Body text sits
  on solid surfaces so it stays readable (Apple's HIG rule). Honour *Reduce Transparency* and *Reduce Motion*.
- **Morphing:** the tab bar's selection is a liquid lens. You can drag it between tabs, and it stretches with
  velocity and settles with a spring.
- **Press = grow, not shrink:** glass buttons swell and brighten under the finger, as in iOS 26.
- **Sliders:** the thumb turns into a clear magnifying lens while it's dragged.

## 5. Interaction & physics

- Everything is driven by **critically/under-damped springs** (stiffness/damping/mass), never by CSS
  easing curves, so motion can be interrupted and keeps its velocity.
- **Squeeze on pull:** when you drag an item, it **stretches along the pull direction and squeezes on the
  other axis** (volume-preserving squash and stretch), with **rubber-band resistance** past its limits.
  On release it springs back with a small wobble.
- **Library rows:** swipe left to delete, swipe right to pin or play. Haptics where supported.
- **Mini-player:** swipe up to expand into the full player. The full player is dragged down to dismiss
  and rubber-bands.
- **Pull-to-create** on the library list.

## 6. Features

- Reader: paste or type text, or import `.txt`/`.md`. Auto language, voice chips, speed (0.5×–2×), pause
  length.
- Live **karaoke highlighting** of the current sentence and word, plus tap-a-sentence-to-jump.
- Streaming playback: starts after the first sentence is synthesized, while the next ones are prefetched.
- Library of saved texts (IndexedDB), with pin, delete and resume position.
- Voice gallery with previews, download progress and cache size.
- Export the narration as WAV.
- Media Session (lock-screen / hardware media keys), installable PWA, offline.

## 7. Tech

Vite + React 19 + TypeScript. TTS runs in a module Web Worker: `kokoro-js` (English), our own Piper
runtime on `onnxruntime-web` (German), and `phonemizer` (espeak-ng WASM). Vitest covers the normalizers.
No UI framework. Glass, springs and gestures are hand-written.
