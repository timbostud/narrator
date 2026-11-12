// Language-independent clean-up that runs before the language-specific normalizers.

export type Lang = 'en' | 'de';

/** Typographic + markup clean-up. Keeps punctuation the models use for prosody. */
export function cleanText(input: string): string {
  let t = input.normalize('NFC');
  t = t
    .replace(/\r\n?/g, '\n')
    // Markdown links / images → their label
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Markdown emphasis, code, headings, quotes, list bullets
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_](\S[^*_]*?)[*_](?=\W|$)/g, '$1$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+•▪◦‣]\s+/gm, '')
    // Emoji and pictographs are not spoken
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    // Unify quotes and apostrophes
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟«»″]/g, '"')
    // Dashes used as parenthetical breaks become a comma pause
    .replace(/\s+[–—]\s+/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/\.{3,}|…/g, '…')
    // Thin / non-breaking spaces
    .replace(/[    ]/g, ' ')
    .replace(/[ \t]+/g, ' ');
  return t;
}

/** Spells out unpronounceable all-caps acronyms (FBI, USB, BMW) letter by letter. */
const EN_LETTERS: Record<string, string> = {
  A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff', G: 'jee', H: 'aitch', I: 'eye', J: 'jay',
  K: 'kay', L: 'el', M: 'em', N: 'en', O: 'oh', P: 'pee', Q: 'cue', R: 'ar', S: 'ess', T: 'tee',
  U: 'you', V: 'vee', W: 'double-you', X: 'ex', Y: 'why', Z: 'zee',
};
const DE_LETTERS: Record<string, string> = {
  A: 'Ah', B: 'Beh', C: 'Zeh', D: 'Deh', E: 'Eh', F: 'Eff', G: 'Geh', H: 'Hah', I: 'Ih', J: 'Jott',
  K: 'Kah', L: 'Ell', M: 'Emm', N: 'Enn', O: 'Oh', P: 'Peh', Q: 'Kuh', R: 'Err', S: 'Ess', T: 'Teh',
  U: 'Uh', V: 'Fau', W: 'Weh', X: 'Ix', Y: 'Üpsilon', Z: 'Zett', Ä: 'Äh', Ö: 'Öh', Ü: 'Üh',
};

/** Acronyms people pronounce as words rather than letters. */
const WORD_ACRONYMS = new Set([
  'NASA', 'NATO', 'UNESCO', 'UNICEF', 'AIDS', 'LASER', 'RADAR', 'SCUBA', 'FIFA', 'UEFA', 'OPEC', 'ASAP',
  'GIF', 'JPEG', 'PIN', 'RAM', 'ROM', 'SIM', 'WIFI', 'COVID', 'IKEA', 'LEGO', 'ADAC', 'DAX', 'TÜV',
  'BAföG', 'ISO', 'OK', 'NRW', 'UFO', 'GAU', 'KITA', 'AKW', 'ZDF', 'APP',
]);
// ARD/ZDF/AKW are letter-spelled in German but harmless either way; keep them out of the word list
WORD_ACRONYMS.delete('ZDF');
WORD_ACRONYMS.delete('AKW');

export function spellAcronyms(t: string, lang: Lang): string {
  const table = lang === 'de' ? DE_LETTERS : EN_LETTERS;
  // SHOUTED RUNS OF CAPITALS are normal words: lower-case them instead of spelling them.
  t = t.replace(/\b[A-ZÄÖÜ]{2,}(?:[\s,'-]+[A-ZÄÖÜ]{2,}){2,}\b/g, (m) => m.toLowerCase());
  return t.replace(/\b([A-ZÄÖÜ]{2,5})(s?)\b/g, (m, word: string, plural: string) => {
    if (WORD_ACRONYMS.has(word)) return m;
    const hasVowel = /[AEIOUÄÖÜ]/.test(word);
    // Short acronyms and vowel-less ones are spelled; longer ones with vowels (e.g. "STOP") are read.
    if (word.length > 3 && hasVowel) return m;
    const spelled = word.split('').map((c) => table[c] ?? c).join(' ');
    return spelled + (plural ? (lang === 'de' ? 's' : "'s") : '');
  });
}

/** URLs and e-mail addresses read as "example dot com". */
export function verbaliseWeb(t: string, lang: Lang): string {
  const dot = lang === 'de' ? ' Punkt ' : ' dot ';
  const at = lang === 'de' ? ' ät ' : ' at ';
  t = t.replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, (m) => m.replace(/@/, at).replace(/\./g, dot));
  t = t.replace(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|de|io|dev|app|ai|co|uk|eu|at|ch|gov|edu|info))(?:\/[^\s)]*)?/gi,
    (_m, host: string) => host.replace(/\./g, dot));
  return t;
}

export function collapse(t: string): string {
  return t.replace(/[ \t]+/g, ' ').replace(/ ([,.;:!?…])/g, '$1').replace(/,\s*,/g, ',').trim();
}
