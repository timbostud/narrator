import type { Lang } from './common';

const EN = new Set(('the and is are was were of to in that it you with for on this have has be not he she they we what will would can ' +
  'an my your at from by as but or if there their which when who been do does did just than then them these those our its about into').split(' '));
const DE = new Set(('der die das und ist nicht ich du sie wir ein eine einen zu mit auf für den dem des von sich es auch wie nach wird ' +
  'sind war aber oder wenn dass noch bei im aus über nur schon kann hat haben wurde werden mein dein unser euch ihr man doch also sehr').split(' '));

/** Returns a signed score: > 0 means German, < 0 English. */
export function langScore(text: string): number {
  const words = text.toLowerCase().match(/[a-zäöüß]+/g) ?? [];
  let score = 0;
  for (const w of words) {
    if (DE.has(w)) score += 1;
    if (EN.has(w)) score -= 1;
  }
  score += (text.match(/[äöüß]/gi)?.length ?? 0) * 0.6;
  score -= (text.match(/\b(th|wh)\w+/gi)?.length ?? 0) * 0.3;
  score += (text.match(/\b\w+(ung|heit|keit|lich|chen|schaft)\b/gi)?.length ?? 0) * 0.5;
  return score;
}

export function detectLang(text: string, fallback: Lang = 'en'): Lang {
  const s = langScore(text);
  if (Math.abs(s) < 1) return fallback;
  return s > 0 ? 'de' : 'en';
}
