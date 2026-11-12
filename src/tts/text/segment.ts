import type { Lang } from './common';

export interface Span {
  start: number;
  end: number;
}

export interface Block extends Span {
  heading: boolean;
  /** Pause class after the block: soft line break vs. real paragraph */
  paragraphEnd: boolean;
}

const ABBR: Record<Lang, Set<string>> = {
  en: new Set(('mr mrs ms dr prof sr jr st mt vs etc e.g i.e eg ie inc ltd co dept gov sen rep gen capt lt sgt fig no vol ch ' +
    'p pp approx est jan feb mar apr jun jul aug sep sept oct nov dec a.m p.m u.s u.k ave rd blvd').split(' ')),
  de: new Set(('z.b d.h u.a usw bzw ca evtl ggf inkl exkl zzgl vgl bspw sog max mind gem nr str dr prof hr fr st tel abs kap ' +
    'abb jh jhd mio mrd tsd std min sek etc s bd chr v n jan feb mär apr jun jul aug sep sept okt nov dez insb ehem u.ä o.ä ' +
    'z.t i.d.r u.u s.o s.u v.a e.v').split(' ')),
};

const DE_MONTHS = /^(Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/;

/**
 * Splits a document into blocks (paragraphs, headings, list items). Single newlines inside running
 * prose (e.g. text pasted from a PDF) are treated as soft wraps and joined.
 */
export function splitBlocks(text: string): Block[] {
  const lines: Span[] = [];
  let pos = 0;
  for (const line of text.split('\n')) {
    lines.push({ start: pos, end: pos + line.length });
    pos += line.length + 1;
  }
  const blocks: Block[] = [];
  let cur: Span | null = null;
  const flush = (paragraphEnd: boolean) => {
    if (!cur) return;
    const raw = text.slice(cur.start, cur.end);
    const trimmedStart = cur.start + (raw.length - raw.trimStart().length);
    const trimmedEnd = cur.end - (raw.length - raw.trimEnd().length);
    if (trimmedEnd > trimmedStart) {
      const body = text.slice(trimmedStart, trimmedEnd);
      const heading = body.length < 90 && !/[.!?…:;,"')\]]$/.test(body) && !body.includes('. ') && /^[\p{Lu}\d#]/u.test(body);
      blocks.push({ start: trimmedStart, end: trimmedEnd, heading, paragraphEnd });
    }
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const s = text.slice(l.start, l.end);
    if (!s.trim()) { flush(true); continue; }
    if (!cur) { cur = { ...l }; continue; }
    const prev = text.slice(cur.start, cur.end).trimEnd();
    const softWrap = !/[.!?…:;"')\]]$/.test(prev) && /^\s*[\p{Ll}]/u.test(s);
    if (softWrap) { cur.end = l.end; continue; }
    flush(false);
    cur = { ...l };
  }
  flush(true);
  return blocks;
}

function isBoundary(text: string, i: number, end: number, lang: Lang): { ok: boolean; after: number } {
  // i points at a terminal punctuation char. Swallow runs of terminal punctuation + closing quotes.
  let j = i + 1;
  while (j < end && /[.!?…"')\]»“”]/.test(text[j])) j++;
  if (j >= end) return { ok: true, after: end };
  if (!/\s/.test(text[j])) return { ok: false, after: j };
  let k = j;
  while (k < end && /\s/.test(text[k])) k++;
  if (k >= end) return { ok: true, after: end };
  const next = text[k];
  const ch = text[i];

  if (ch === '.') {
    // Token before the period
    let s = i - 1;
    while (s >= 0 && /[\p{L}\p{N}.]/u.test(text[s])) s--;
    const token = text.slice(s + 1, i);
    const lower = token.toLowerCase();
    if (ABBR[lang].has(lower) || ABBR[lang].has(lower.replace(/\.$/, ''))) return { ok: false, after: j };
    if (/^\p{L}$/u.test(token)) return { ok: false, after: j }; // initials: J. R. R. Tolkien, z. B.
    if (/^\p{L}(\.\p{L})+$/u.test(token)) return { ok: false, after: j }; // e.g / U.S
    if (lang === 'de' && /^\d{1,4}$/.test(token)) {
      const rest = text.slice(k, k + 12);
      if (DE_MONTHS.test(rest) || /^[\p{Ll}]/u.test(rest)) return { ok: false, after: j };
      const before = text.slice(Math.max(0, s - 12), s + 1);
      if (/(der|die|das|den|dem|des|am|im|zum|zur|vom|beim|seit|bis|ab)\s*$/i.test(before)) return { ok: false, after: j };
    }
    if (/[\p{Ll}]/u.test(next)) return { ok: false, after: j };
  }
  return { ok: true, after: k };
}

/** Sentence spans inside a block. */
export function splitSentences(text: string, block: Span, lang: Lang): Span[] {
  const out: Span[] = [];
  let start = block.start;
  for (let i = block.start; i < block.end; i++) {
    if (!/[.!?…]/.test(text[i])) continue;
    const { ok, after } = isBoundary(text, i, block.end, lang);
    if (!ok) { i = Math.max(i, after - 1); continue; }
    // trim trailing whitespace from the sentence
    let e = after;
    while (e > start && /\s/.test(text[e - 1])) e--;
    if (e > start) out.push({ start, end: e });
    start = after;
    i = after - 1;
  }
  if (start < block.end) {
    const tail = text.slice(start, block.end);
    if (tail.trim()) out.push({ start, end: block.end });
  }
  return out;
}

/**
 * Splits an over-long sentence at clause boundaries so the acoustic model keeps good intonation
 * (and stays under the model's token limit).
 */
export function splitLong(text: string, span: Span, max = 240): Span[] {
  const parts: Span[] = [];
  let s = span.start;
  while (span.end - s > max) {
    const window = text.slice(s, s + max);
    let cut = -1;
    for (const re of [/[;:](?=\s)/g, /,(?=\s)/g, /\s[–—-]\s/g, /\s(?:and|but|or|und|aber|oder|weil|denn|dass|which|that)\s/g, /\s/g]) {
      let m: RegExpExecArray | null;
      let last = -1;
      re.lastIndex = 0;
      while ((m = re.exec(window))) if (m.index > max * 0.35) last = m.index + (m[0].trim() ? 1 : 0);
      if (last > 0) { cut = last; break; }
    }
    if (cut <= 0) cut = max;
    parts.push({ start: s, end: s + cut });
    s += cut;
    while (s < span.end && /\s/.test(text[s])) s++;
  }
  if (span.end > s) parts.push({ start: s, end: span.end });
  return parts;
}
