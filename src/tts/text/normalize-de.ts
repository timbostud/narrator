import { deCardinal, deCardinalAttr, deDecimal, deFraction, deOrdinal, deYear } from './numbers-de';
import { collapse, spellAcronyms, verbaliseWeb } from './common';

export const DE_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_ALT = 'Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan\\.|Feb\\.|Mär\\.|Apr\\.|Jun\\.|Jul\\.|Aug\\.|Sep\\.|Sept\\.|Okt\\.|Nov\\.|Dez\\.';
const MONTH_FULL: Record<string, string> = {
  jan: 'Januar', jän: 'Jänner', feb: 'Februar', mär: 'März', apr: 'April', mai: 'Mai', jun: 'Juni', jul: 'Juli',
  aug: 'August', sep: 'September', okt: 'Oktober', nov: 'November', dez: 'Dezember',
};
const fullMonth = (m: string) => MONTH_FULL[m.toLowerCase().slice(0, 3)] ?? m;

/** Prepositions / articles that put a following ordinal into the dative/accusative "-en" form. */
const EN_CASE = /(?:^|\s)(am|vom|zum|im|beim|dem|den|des|seit dem|ab dem|bis zum|bis|ab|seit|zur|einem|einen|eines|diesem|diesen|ihrem|seinem|unserem|jedem)\s*$/i;
const E_CASE = /(?:^|\s)(der|die|das|dieser|diese|dieses|jeder|jede|jedes)\s*$/i;

function ordinalEnding(before: string): 'e' | 'en' | 'er' {
  if (EN_CASE.test(before)) return 'en';
  if (E_CASE.test(before)) return 'e';
  return 'er';
}

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bz\.\s?B\./g, 'zum Beispiel'], [/\bd\.\s?h\./g, 'das heißt'], [/\bu\.\s?a\./g, 'unter anderem'],
  [/\bu\.\s?Ä\./g, 'und Ähnliches'], [/\bo\.\s?Ä\./g, 'oder Ähnliches'], [/\bu\.\s?U\./g, 'unter Umständen'],
  [/\bi\.\s?d\.\s?R\./g, 'in der Regel'], [/\bz\.\s?T\./g, 'zum Teil'], [/\bu\.\s?v\.\s?m\./g, 'und vieles mehr'],
  [/\bs\.\s?o\./g, 'siehe oben'], [/\bs\.\s?u\./g, 'siehe unten'], [/\bv\.\s?a\./g, 'vor allem'],
  [/\bu\.\s?s\.\s?w\./g, 'und so weiter'], [/\busw\./g, 'und so weiter'], [/\bbzw\./g, 'beziehungsweise'],
  [/\bca\./g, 'circa'], [/\bevtl\./g, 'eventuell'], [/\bggf\./g, 'gegebenenfalls'], [/\binkl\./g, 'inklusive'],
  [/\bexkl\./g, 'exklusive'], [/\bzzgl\./g, 'zuzüglich'], [/\bvgl\./gi, 'vergleiche'], [/\bbspw\./g, 'beispielsweise'],
  [/\bsog\./g, 'sogenannte'], [/\bmax\./g, 'maximal'], [/\bmind\./g, 'mindestens'], [/\bgem\./g, 'gemäß'],
  [/\behem\./g, 'ehemalige'], [/\binsb\./g, 'insbesondere'], [/\bu\.\s?Ä\./g, 'und Ähnliches'],
  [/\bNr\./g, 'Nummer'], [/\bStr\./g, 'Straße'], [/(?<=\p{L})str\./gu, 'straße'], [/\bDr\./g, 'Doktor'],
  [/\bProf\./g, 'Professor'], [/\bHr\./g, 'Herr'], [/\bFr\.(?=\s+[A-ZÄÖÜ][a-zäöüß]+)/g, 'Frau'],
  [/\bSt\./g, 'Sankt'], [/\bTel\./g, 'Telefon'], [/\bAbs\./g, 'Absatz'], [/\bKap\./g, 'Kapitel'], [/\bAbb\./g, 'Abbildung'],
  [/\bJh\./g, 'Jahrhundert'], [/\bJhd\./g, 'Jahrhundert'], [/\bMio\./g, 'Millionen'], [/\bMrd\./g, 'Milliarden'],
  [/\bTsd\./g, 'Tausend'], [/\bStd\./g, 'Stunden'], [/\bMin\./g, 'Minuten'], [/\bSek\./g, 'Sekunden'],
  [/\betc\./g, 'et cetera'], [/\bGmbH\b/g, 'Geh Emm Beh Hah'], [/\bAG\b/g, 'Ah Geh'], [/\be\.\s?V\./g, 'eingetragener Verein'],
  [/\bS\.(?=\s*\d)/g, 'Seite'], [/\bBd\.(?=\s*\d)/g, 'Band'], [/\bv\.\s?Chr\./g, 'vor Christus'], [/\bn\.\s?Chr\./g, 'nach Christus'],
];

const UNITS: Array<[string, string, string, boolean?]> = [
  // [pattern, singular, plural, feminine?]
  ['km/h', 'Kilometer pro Stunde', 'Kilometer pro Stunde'], ['m/s', 'Meter pro Sekunde', 'Meter pro Sekunde'],
  ['km²', 'Quadratkilometer', 'Quadratkilometer'], ['m²', 'Quadratmeter', 'Quadratmeter'], ['m³', 'Kubikmeter', 'Kubikmeter'],
  ['qm', 'Quadratmeter', 'Quadratmeter'],
  ['km', 'Kilometer', 'Kilometer'], ['cm', 'Zentimeter', 'Zentimeter'], ['mm', 'Millimeter', 'Millimeter'], ['m', 'Meter', 'Meter'],
  ['kg', 'Kilogramm', 'Kilogramm'], ['mg', 'Milligramm', 'Milligramm'], ['g', 'Gramm', 'Gramm'], ['t', 'Tonne', 'Tonnen', true],
  ['ml', 'Milliliter', 'Milliliter'], ['l', 'Liter', 'Liter'],
  ['°C', 'Grad Celsius', 'Grad Celsius'], ['°', 'Grad', 'Grad'],
  ['kWh', 'Kilowattstunde', 'Kilowattstunden', true], ['kW', 'Kilowatt', 'Kilowatt'], ['PS', 'PS', 'PS'], ['W', 'Watt', 'Watt'],
  ['GB', 'Gigabyte', 'Gigabyte'], ['MB', 'Megabyte', 'Megabyte'], ['TB', 'Terabyte', 'Terabyte'],
  ['GHz', 'Gigahertz', 'Gigahertz'], ['MHz', 'Megahertz', 'Megahertz'], ['Hz', 'Hertz', 'Hertz'],
  ['Std\\.?', 'Stunde', 'Stunden', true], ['h', 'Stunde', 'Stunden', true], ['Min\\.?', 'Minute', 'Minuten', true],
  ['min', 'Minute', 'Minuten', true], ['Sek\\.?', 'Sekunde', 'Sekunden', true], ['s', 'Sekunde', 'Sekunden', true],
  ['Mio\\.?', 'Million', 'Millionen', true], ['Mrd\\.?', 'Milliarde', 'Milliarden', true],
];

/** "1.234.567,89" → { int: "1234567", frac: "89" } */
function parseDe(raw: string): { int: string; frac?: string } {
  const [i, f] = raw.split(',');
  return { int: i.replace(/\./g, ''), frac: f };
}

function spellNumber(raw: string): string {
  const neg = raw.startsWith('-');
  const { int, frac } = parseDe(neg ? raw.slice(1) : raw);
  const words = frac ? deDecimal(int, frac) : deCardinal(int);
  return (neg ? 'minus ' : '') + words;
}

function money(amount: string, unit: [string, string] = ['Euro', 'Cent']): string {
  const { int, frac } = parseDe(amount);
  const iv = parseInt(int || '0', 10);
  const fv = frac ? parseInt(frac.padEnd(2, '0').slice(0, 2), 10) : 0;
  if (!iv && fv) return `${deCardinalAttr(fv)} ${unit[1]}`;
  const head = `${deCardinalAttr(int)} ${unit[0]}`;
  return fv ? `${head} ${deCardinal(fv)}` : head;
}

/** Feminine-noun heuristic for the "ein/eine" choice before an unknown noun. */
function looksFeminine(noun: string): boolean {
  return /(ung|heit|keit|schaft|ion|tät|ik|ur|ie|ei|enz|anz|e)$/.test(noun) && !/^(Name|Junge|Kunde|Käse|Gedanke|Glaube|Wille|Friede|Buchstabe|Affe|Löwe|Hase|Experte|Kollege)$/.test(noun);
}

export function normalizeGerman(input: string): string {
  let t = input;

  for (const [re, rep] of ABBREVIATIONS) t = t.replace(re, rep);
  t = verbaliseWeb(t, 'de');

  // Full dates 12.11.2026 / 3.5.26 / 12. November 2026
  t = t.replace(/(^|[^\d.,])(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})?(?![\d,])/g, (m, pre: string, d, mo, y, offset: number, whole: string) => {
    const mi = +mo - 1;
    if (mi < 0 || mi > 11 || +d < 1 || +d > 31) return m;
    const before = whole.slice(0, offset) + pre;
    const year = y ? ` ${deYear(y.length === 2 ? 2000 + +y : +y)}` : '';
    return `${pre}${deOrdinal(+d, ordinalEnding(before))} ${DE_MONTHS[mi]}${year}`;
  });
  t = t.replace(new RegExp(`(\\d{1,2})\\.\\s?(${MONTH_ALT})(?:\\s+(\\d{4}))?`, 'g'), (_m, d, mo, y, offset: number, whole: string) =>
    `${deOrdinal(+d, ordinalEnding(whole.slice(0, offset)))} ${fullMonth(mo)}${y ? ` ${deYear(+y)}` : ''}`);
  // ISO dates
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => {
    const mi = +mo - 1;
    if (mi < 0 || mi > 11) return m;
    return `${deOrdinal(+d, 'er')} ${DE_MONTHS[mi]} ${deYear(+y)}`;
  });

  // Money: 5,99 €, 1.299 €, € 5, 3 EUR, $10
  t = t.replace(/(-?\d[\d.]*(?:,\d+)?)\s?(?:€|EUR|Euro)(?![\p{L}])/gu, (_m, a) => money(a));
  t = t.replace(/(?:€|EUR)\s?(\d[\d.]*(?:,\d+)?)/g, (_m, a) => money(a));
  t = t.replace(/(?:\$|USD)\s?(\d[\d.]*(?:,\d+)?)|(\d[\d.]*(?:,\d+)?)\s?(?:\$|USD)/g, (_m, a, b) => money(a ?? b, ['Dollar', 'Cent']));
  t = t.replace(/(?:£|GBP)\s?(\d[\d.]*(?:,\d+)?)|(\d[\d.]*(?:,\d+)?)\s?(?:£|GBP)/g, (_m, a, b) => money(a ?? b, ['Pfund', 'Pence']));
  t = t.replace(/(\d[\d.]*(?:,\d+)?)\s?(?:CHF|Fr\.)/g, (_m, a) => money(a, ['Franken', 'Rappen']));

  // Times: 14:30 Uhr, 8 Uhr, 9.15 Uhr
  t = t.replace(/\b([01]?\d|2[0-4])[:.]([0-5]\d)\s?Uhr\b/g, (_m, h, mi) => `${deCardinalAttr(h, true).replace(/^eine$/, 'ein')} Uhr${+mi ? ' ' + deCardinal(mi) : ''}`);
  t = t.replace(/\b([01]?\d|2[0-4])\s?Uhr\b/g, (_m, h) => `${+h === 1 ? 'ein' : deCardinal(h)} Uhr`);
  t = t.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!:)/g, (_m, h, mi) => `${+h === 1 ? 'ein' : deCardinal(h)} Uhr${+mi ? ' ' + deCardinal(mi) : ''}`);

  // Percent / per mille
  t = t.replace(/(-?\d[\d.]*(?:,\d+)?)\s?%/g, (_m, n) => `${spellNumber(n)} Prozent`);
  t = t.replace(/(-?\d[\d.]*(?:,\d+)?)\s?‰/g, (_m, n) => `${spellNumber(n)} Promille`);

  // Fractions
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/g, (_m, a, b) => deFraction(+a, +b));
  t = t.replace(/½/g, ' einhalb').replace(/¼/g, ' ein Viertel').replace(/¾/g, ' drei Viertel');

  // Year ranges and number ranges: 1990–1995, 5-10 → "bis"
  t = t.replace(/\b(1[1-9]\d\d|20\d\d)\s?[–-]\s?(1[1-9]\d\d|20\d\d)\b/g, (_m, a, b) => `${deYear(+a)} bis ${deYear(+b)}`);
  t = t.replace(/(\d[\d.,]*)\s?[–-]\s?(\d[\d.,]*)(?=\s|$|[^\d])/g, '$1 bis $2');

  // Years in context
  t = t.replace(/\b(im Jahre?|Jahre?|seit|bis|von|um|anno|ab|Sommer|Winter|Herbst|Frühjahr|Frühling|Ende|Anfang|Mitte|in den)\s+(1[1-9]\d\d|20\d\d)(?![\d.,])/g,
    (_m, w, y) => `${w} ${deYear(+y)}`);
  t = t.replace(/\b(1[1-9]\d\d|20\d\d)(er)\b/g, (_m, y, er) => `${deYear(+y)}${er}`); // 1990er
  t = t.replace(/\b(1[1-9]\d\d)(?=\s*(?:v\.|n\.)?\s*Chr)/g, (_m, y) => deYear(+y));

  // Units after numbers
  for (const [u, sing, plur, fem] of UNITS) {
    const re = new RegExp(`(-?\\d[\\d.]*(?:,\\d+)?)\\s?${u.replace('/', '\\/')}(?![\\p{L}\\d])`, 'gu');
    t = t.replace(re, (_m, n: string) => {
      const isOne = n === '1';
      const words = isOne ? (fem ? 'eine' : 'ein') : spellNumber(n);
      return `${words} ${isOne ? sing : plur}`;
    });
  }

  // Ordinals: "der 2. Weltkrieg", "zum 1. Mal", "Platz 3." stays cardinal at sentence end
  t = t.replace(/(\d+)\.(?=\s+(?:[a-zäöüß]|[A-ZÄÖÜ][a-zäöüß]+))/g, (m, n, offset: number, whole: string) => {
    const before = whole.slice(0, offset);
    const after = whole.slice(offset + m.length);
    const nextWord = after.match(/^\s+(\S+)/)?.[1] ?? '';
    const preceded = /(der|die|das|den|dem|des|am|im|zum|zur|vom|beim|seit|bis|ab|jeder|jede|jedes|einem|einen|eines)\s*$/i.test(before);
    const lower = /^[a-zäöüß]/.test(nextWord);
    if (!preceded && !lower) return m;
    return deOrdinal(+n, ordinalEnding(before) === 'er' && lower ? 'e' : ordinalEnding(before));
  });

  // "1 Haus" → "ein Haus", "1 Stunde" → "eine Stunde"
  t = t.replace(/(^|[^\d.,])1\s+([A-ZÄÖÜ][a-zäöüß]+)/g, (_m, pre, noun) => `${pre}${looksFeminine(noun) ? 'eine' : 'ein'} ${noun}`);

  // Bare 1100–1999 are almost always years in running text ("1989 fiel die Mauer")
  t = t.replace(/(^|[^\d.,])(1[1-9]\d\d)(?![\d.,]\d)/g, (_m, pre, y) => `${pre}${deYear(+y)}`);

  // Signed / plain numbers (German format: 1.234.567,89)
  t = t.replace(/(^|[\s(])-(\d)/g, '$1minus $2');
  t = t.replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+,\d+\b|\b\d+\b/g, (m) => spellNumber(m));

  // Symbols
  t = t
    .replace(/\s&\s/g, ' und ')
    .replace(/\s\+\s/g, ' plus ')
    .replace(/\s=\s/g, ' gleich ')
    .replace(/§§\s?/g, 'Paragrafen ')
    .replace(/§\s?/g, 'Paragraf ')
    .replace(/(?<=\p{L})\/(?=\p{L})/gu, ' oder ')
    .replace(/[*_~^|<>{}[\]\\#]/g, ' ')
    .replace(/[()]/g, ', ');

  t = spellAcronyms(t, 'de');
  return collapse(t);
}
