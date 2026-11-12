import { cleanText, type Lang } from './common';
import { detectLang } from './detect';
import { normalizeEnglish } from './normalize-en';
import { normalizeGerman } from './normalize-de';
import { splitBlocks, splitLong, splitSentences } from './segment';

export type { Lang };

export interface Word {
  start: number;
  end: number;
  /** Relative speaking weight (≈ syllables + pause) used for word-level highlighting. */
  weight: number;
}

export interface Chunk {
  id: number;
  sentence: number;
  start: number;
  end: number;
  lang: Lang;
  /** What the model actually receives. */
  spoken: string;
  /** Base pause after this chunk in ms (scaled by user pause factor and speed). */
  pauseAfter: number;
  words: Word[];
}

export interface Sentence {
  index: number;
  start: number;
  end: number;
  lang: Lang;
  firstChunk: number;
}

export interface Plan {
  text: string;
  sentences: Sentence[];
  chunks: Chunk[];
  langs: Lang[];
}

export function normalize(text: string, lang: Lang): string {
  const cleaned = cleanText(text).replace(/\n+/g, ' ');
  return lang === 'de' ? normalizeGerman(cleaned) : normalizeEnglish(cleaned);
}

function syllables(word: string): number {
  return Math.max(1, word.match(/[aeiouyäöüáéíóúàèìòùâêîôû]+/gi)?.length ?? 1);
}

function wordsOf(text: string, start: number, end: number, lang: Lang): Word[] {
  const out: Word[] = [];
  const re = /\S+/g;
  const slice = text.slice(start, end);
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice))) {
    const raw = m[0];
    const core = raw.replace(/^[^\p{L}\p{N}$€£¥§#]+|[^\p{L}\p{N}%°€]+$/gu, '');
    if (!core) continue;
    const spoken = /\d|[$€£%&§°]/.test(core) ? normalize(raw, lang) : core;
    let weight = spoken.split(/\s+/).reduce((a, w) => a + syllables(w), 0);
    if (/[,;:]$/.test(raw)) weight += 0.8;
    if (/[.!?…]$/.test(raw)) weight += 1.2;
    const lead = raw.search(/[\p{L}\p{N}$€£¥§#]/u);
    out.push({ start: start + m.index + lead, end: start + m.index + lead + core.length, weight });
  }
  return out;
}

export interface PrepareOptions {
  /** Fixed language, or 'auto' to detect per paragraph. */
  lang: Lang | 'auto';
}

/** Turns raw text into sentences (for highlighting) and synthesis chunks (for the voice). */
export function prepare(text: string, opts: PrepareOptions): Plan {
  const docLang: Lang = opts.lang === 'auto' ? detectLang(text, 'en') : opts.lang;
  const blocks = splitBlocks(text);
  const sentences: Sentence[] = [];
  const chunks: Chunk[] = [];
  const langs = new Set<Lang>();

  for (const block of blocks) {
    const blockText = text.slice(block.start, block.end);
    const lang: Lang = opts.lang === 'auto' ? detectLang(blockText, docLang) : opts.lang;
    langs.add(lang);
    const spans = block.heading ? [{ start: block.start, end: block.end }] : splitSentences(text, block, lang);
    spans.forEach((span, si) => {
      const sentence: Sentence = { index: sentences.length, start: span.start, end: span.end, lang, firstChunk: chunks.length };
      sentences.push(sentence);
      const parts = splitLong(text, span);
      parts.forEach((p, pi) => {
        const raw = text.slice(p.start, p.end);
        let spoken = normalize(raw, lang);
        if (!/[\p{L}\p{N}]/u.test(spoken)) return;
        const lastOfSentence = pi === parts.length - 1;
        const lastOfBlock = lastOfSentence && si === spans.length - 1;
        // Headings get a full stop so the model uses falling, final intonation.
        if (block.heading && !/[.!?…]$/.test(spoken)) spoken += '.';
        if (lastOfSentence && !/[.!?…,;:]$/.test(spoken)) spoken += '.';
        let pause: number;
        if (!lastOfSentence) pause = /[;:]$/.test(raw.trim()) ? 220 : 140;
        else if (block.heading) pause = 750;
        else if (lastOfBlock) pause = block.paragraphEnd ? 650 : 420;
        else pause = /[?!]["')\]]*$/.test(raw.trim()) ? 380 : 320;
        chunks.push({
          id: chunks.length,
          sentence: sentence.index,
          start: p.start,
          end: p.end,
          lang,
          spoken,
          pauseAfter: pause,
          words: wordsOf(text, p.start, p.end, lang),
        });
      });
      if (sentences.at(-1) && chunks.length === sentence.firstChunk) sentences.pop();
    });
  }
  return { text, sentences, chunks, langs: [...langs] };
}
