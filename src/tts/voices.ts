import type { Lang } from './text/common';

export type Gender = 'female' | 'male';

export interface VoiceDef {
  id: string;
  name: string;
  lang: Lang;
  gender: Gender;
  engine: 'kokoro' | 'piper';
  /** Kokoro voice key or Piper model path (relative to the piper-voices repo). */
  key: string;
  sizeMB: number;
  model: string;
  license: string;
  blurb: string;
  sample: string;
}

export const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';

export const VOICES: VoiceDef[] = [
  {
    id: 'en-f', name: 'Ava', lang: 'en', gender: 'female', engine: 'kokoro', key: 'af_heart', sizeMB: 326,
    model: 'Kokoro-82M · heart', license: 'Apache-2.0',
    blurb: 'Warm and expressive. Natural for stories and articles.',
    sample: "Hi, I'm Ava. On the 3rd of May, at 7:45 pm, I'll read you anything: stories, notes, or the news.",
  },
  {
    id: 'en-m', name: 'Leo', lang: 'en', gender: 'male', engine: 'kokoro', key: 'am_michael', sizeMB: 326,
    model: 'Kokoro-82M · michael', license: 'Apache-2.0',
    blurb: 'Calm, grounded narrator. Great for long reads.',
    sample: "Hello, I'm Leo. It costs $4.99, it's 21 km away, and Dr. Smith arrives in 1999. I read it all naturally.",
  },
  {
    id: 'de-f', name: 'Lena', lang: 'de', gender: 'female', engine: 'piper', key: 'de/de_DE/kerstin/medium/de_DE-kerstin-medium', sizeMB: 63,
    model: 'Piper VITS · Kerstin', license: 'CC0',
    blurb: 'Klare, freundliche Stimme in Hochdeutsch.',
    sample: 'Hallo, ich bin Lena. Am 3. Mai um 14:30 Uhr lese ich dir alles vor, z. B. Artikel, Bücher oder Notizen.',
  },
  {
    id: 'de-m', name: 'Jonas', lang: 'de', gender: 'male', engine: 'piper', key: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium', sizeMB: 63,
    model: 'Piper VITS · Thorsten', license: 'CC0',
    blurb: 'Ruhiger Erzähler mit natürlicher Betonung.',
    sample: 'Guten Tag, ich bin Jonas. Das kostet 5,99 €, ist 120 km entfernt, und 1989 fiel die Mauer.',
  },
];

export const voiceById = (id: string) => VOICES.find((v) => v.id === id)!;
export const voiceFor = (lang: Lang, gender: Gender) => VOICES.find((v) => v.lang === lang && v.gender === gender)!;
