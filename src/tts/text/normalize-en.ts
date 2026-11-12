import { enCardinal, enDecimal, enFraction, enOrdinal, enYear } from './numbers-en';
import { collapse, spellAcronyms, verbaliseWeb } from './common';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_RE = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\\.?';
const MONTH_ABBR: Record<string, string> = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August',
  sep: 'September', sept: 'September', oct: 'October', nov: 'November', dec: 'December',
};
const fullMonth = (m: string) => {
  const key = m.replace('.', '').toLowerCase();
  return key.startsWith('sep') ? 'September' : MONTH_ABBR[key.slice(0, 3)] ?? m;
};

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bMr\./g, 'Mister'], [/\bMrs\./g, 'Missus'], [/\bMs\./g, 'Miz'], [/\bDr\.(?=\s+[A-Z])/g, 'Doctor'],
  [/\bProf\./g, 'Professor'], [/\bJr\./g, 'Junior'], [/\bSr\./g, 'Senior'], [/\bSt\.(?=\s+[A-Z])/g, 'Saint'],
  [/(?<=[A-Z][a-z]+ )St\./g, 'Street'], [/\bAve\./g, 'Avenue'], [/\bRd\./g, 'Road'], [/\bBlvd\./g, 'Boulevard'],
  [/\bMt\./g, 'Mount'], [/\bvs\.?(?=\s)/g, 'versus'], [/\betc\./g, 'et cetera'], [/\be\.\s?g\.,?/gi, 'for example,'],
  [/\bi\.\s?e\.,?/gi, 'that is,'], [/\bapprox\./gi, 'approximately'], [/\bInc\./g, 'Incorporated'],
  [/\bLtd\./g, 'Limited'], [/\bCo\.(?=\s|$)/g, 'Company'], [/\bDept\./g, 'Department'], [/\bGov\./g, 'Governor'],
  [/\bSen\./g, 'Senator'], [/\bRep\./g, 'Representative'], [/\bGen\./g, 'General'], [/\bCapt\./g, 'Captain'],
  [/\bLt\./g, 'Lieutenant'], [/\bSgt\./g, 'Sergeant'], [/\bFig\.(?=\s*\d)/g, 'Figure'], [/\bNo\.(?=\s*\d)/g, 'number'],
  [/\bvol\.(?=\s*\d)/gi, 'volume'], [/\bch\.(?=\s*\d)/gi, 'chapter'], [/\bp\.(?=\s*\d)/g, 'page'], [/\bpp\.(?=\s*\d)/g, 'pages'],
  [/\ba\.m\.(?=\s+[A-Z])/gi, 'a m.'], [/\bp\.m\.(?=\s+[A-Z])/gi, 'p m.'], [/\ba\.m\./gi, 'a m'], [/\bp\.m\./gi, 'p m'],
  [/\bU\.S\.A?\./g, 'U S'], [/\bU\.K\./g, 'U K'], [/\bw\/o\b/g, 'without'], [/\bw\/(?=\s)/g, 'with'],
];

// Units after a number: [regex for unit, singular, plural]
const UNITS: Array<[string, string, string]> = [
  ['km/h', 'kilometer per hour', 'kilometers per hour'], ['mph', 'mile per hour', 'miles per hour'],
  ['km', 'kilometer', 'kilometers'], ['cm', 'centimeter', 'centimeters'], ['mm', 'millimeter', 'millimeters'],
  ['m', 'meter', 'meters'], ['mi', 'mile', 'miles'], ['ft', 'foot', 'feet'], ['(?<=\\d)in', 'inch', 'inches'],
  ['kg', 'kilogram', 'kilograms'], ['mg', 'milligram', 'milligrams'], ['g', 'gram', 'grams'], ['lbs?', 'pound', 'pounds'],
  ['oz', 'ounce', 'ounces'], ['ml', 'milliliter', 'milliliters'], ['l', 'liter', 'liters'],
  ['°C', 'degree Celsius', 'degrees Celsius'], ['°F', 'degree Fahrenheit', 'degrees Fahrenheit'], ['°', 'degree', 'degrees'],
  ['kWh', 'kilowatt hour', 'kilowatt hours'], ['kW', 'kilowatt', 'kilowatts'], ['W', 'watt', 'watts'],
  ['GB', 'gigabyte', 'gigabytes'], ['MB', 'megabyte', 'megabytes'], ['TB', 'terabyte', 'terabytes'], ['KB', 'kilobyte', 'kilobytes'],
  ['GHz', 'gigahertz', 'gigahertz'], ['MHz', 'megahertz', 'megahertz'], ['Hz', 'hertz', 'hertz'],
  ['hrs?', 'hour', 'hours'], ['h', 'hour', 'hours'], ['mins?', 'minute', 'minutes'], ['secs?', 'second', 'seconds'], ['ms', 'millisecond', 'milliseconds'],
];

function num(s: string): string {
  return s.replace(/,/g, '');
}

/** Verbalise a numeric literal (with optional decimals) as English words. */
function spellNumber(raw: string): string {
  const s = num(raw);
  const m = s.match(/^(-?)(\d*)\.(\d+)$/);
  if (m) return (m[1] ? 'minus ' : '') + enDecimal(m[2], m[3]);
  return enCardinal(s);
}

const CURRENCIES: Record<string, [string, string, string, string]> = {
  $: ['dollar', 'dollars', 'cent', 'cents'],
  '€': ['euro', 'euros', 'cent', 'cents'],
  '£': ['pound', 'pounds', 'penny', 'pence'],
  '¥': ['yen', 'yen', '', ''],
};

function money(sym: string, amount: string, scale?: string): string {
  const [one, many, sub1, subN] = CURRENCIES[sym];
  const a = num(amount);
  if (scale) return `${spellNumber(a)} ${scale} ${many}`;
  const [i, f] = a.split('.');
  const iv = parseInt(i || '0', 10);
  const fv = f ? parseInt(f.padEnd(2, '0').slice(0, 2), 10) : 0;
  const parts: string[] = [];
  if (iv || !fv) parts.push(`${enCardinal(String(iv))} ${iv === 1 ? one : many}`);
  if (fv && sub1) parts.push(`${enCardinal(fv)} ${fv === 1 ? sub1 : subN}`);
  return parts.join(' and ');
}

export function normalizeEnglish(input: string): string {
  let t = input;

  for (const [re, rep] of ABBREVIATIONS) t = t.replace(re, rep);
  t = verbaliseWeb(t, 'en');

  // ISO dates 2026-11-12
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => {
    const mi = +mo - 1;
    if (mi < 0 || mi > 11 || +d < 1 || +d > 31) return m;
    return `${MONTHS[mi]} ${enOrdinal(+d)}, ${enYear(+y)}`;
  });
  // "March 3, 2024" / "March 3rd" → ordinal day
  t = t.replace(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, 'g'), (_m, mo, d, y) =>
    `${fullMonth(mo)} ${enOrdinal(+d)}${y ? `, ${enYear(+y)}` : ''}`);
  // "3 March 2024" / "3rd of March"
  t = t.replace(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:,?\\s+(\\d{4})\\b)?`, 'g'), (_m, d, mo, y) =>
    `the ${enOrdinal(+d)} of ${fullMonth(mo)}${y ? `, ${enYear(+y)}` : ''}`);

  // Money: $1,234.56, $5 million, €3, £2.50
  t = t.replace(/([$€£¥])\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(thousand|million|billion|trillion|[KkMB]n?)\b)?/g, (_m, sym, amt, scale) => {
    const sc = scale ? ({ k: 'thousand', K: 'thousand', M: 'million', B: 'billion', bn: 'billion', Bn: 'billion' } as Record<string, string>)[scale] ?? scale : undefined;
    return money(sym, amt, sc);
  });
  t = t.replace(/(\d[\d,]*(?:\.\d+)?)\s?(€|EUR|USD|GBP)\b/g, (_m, amt, cur) =>
    money(cur === 'USD' ? '$' : cur === 'GBP' ? '£' : '€', amt));

  // Times: 7:45 pm, 10:00, 9am
  t = t.replace(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s?([ap])(?:\.\s?m(?=\.)|\s?m\b)/gi, (_m, h, mi, _s, ap) =>
    `${clock(+h, +mi)} ${ap.toLowerCase()} m`);
  t = t.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!:)/g, (_m, h, mi) => clock(+h, +mi, true));
  t = t.replace(/\b(1[0-2]|0?[1-9])\s?([ap])(?:\.m(?=\.)|m\b)/gi, (_m, h, ap) => `${enCardinal(+h)} ${ap.toLowerCase()} m`);

  // Ordinals 1st 22nd 103rd
  t = t.replace(/\b(\d[\d,]*)(st|nd|rd|th)\b/gi, (_m, n) => enOrdinal(num(n)));
  // Decades: 1990s, '90s
  t = t.replace(/\b(\d{2})(\d0)s\b/g, (_m, a, b) => {
    const w = enYear(+(a + b));
    return w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 's';
  });
  t = t.replace(/'(\d)0s\b/g, (_m, d) => (['', '', 'twenties', 'thirties', 'forties', 'fifties', 'sixties', 'seventies', 'eighties', 'nineties'][+d] || _m));

  // Percent
  t = t.replace(/(-?\d[\d,]*(?:\.\d+)?)\s?%/g, (_m, n) => `${spellNumber(n)} percent`);

  // Fractions 1/2, 3/4 (avoid dates like 12/11/2026)
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/g, (_m, a, b) => enFraction(+a, +b));
  t = t.replace(/½/g, ' one half').replace(/¼/g, ' one quarter').replace(/¾/g, ' three quarters');

  // Ranges 5-10, 1990–1995
  t = t.replace(/\b(\d{4})\s?[-–]\s?(\d{4})\b/g, (_m, a, b) => `${enYear(+a)} to ${enYear(+b)}`);
  t = t.replace(/\b(\d[\d,.]*)\s?[–-]\s?(\d[\d,.]*)\b/g, '$1 to $2');

  // Units after numbers
  for (const [u, sing, plur] of UNITS) {
    const re = new RegExp(`(-?\\d[\\d,]*(?:\\.\\d+)?)\\s?${u.replace('/', '\\/')}(?![\\p{L}\\d])`, 'gu');
    t = t.replace(re, (_m, n) => `${spellNumber(n)} ${num(n) === '1' ? sing : plur}`);
  }

  // Years in context: "in 1999", "since 2010", standalone 4-digit in 1100–2099 near year words
  t = t.replace(/\b(in|since|by|from|until|till|year|around|circa|before|after|of|during|summer|winter|spring|fall|autumn)\s+(1[1-9]\d\d|20\d\d)\b/gi,
    (_m, w, y) => `${w} ${enYear(+y)}`);
  t = t.replace(/\b(1[1-9]\d\d|20\d\d)(?=\s*(?:AD|BC|CE|BCE)\b)/g, (_m, y) => enYear(+y));

  // Bare 1100–1999 read as years ("1969 was the year…"); "1,969" with a separator stays a cardinal.
  t = t.replace(/(^|[^\d.,])(1[1-9]\d\d)(?![\d.,]\d)/g, (_m, pre, y) => `${pre}${enYear(+y)}`);

  // Signed / plain numbers (with thousands separators and decimals)
  t = t.replace(/(^|[\s(])-(\d)/g, '$1minus $2');
  t = t.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d*\.\d+\b|\b\d+\b/g, (m) => spellNumber(m));

  // Symbols
  t = t
    .replace(/\s&\s/g, ' and ')
    .replace(/\s\+\s/g, ' plus ')
    .replace(/\s=\s/g, ' equals ')
    .replace(/(?<=\s)#(?=\w)/g, 'number ')
    .replace(/(?<=\p{L})\/(?=\p{L})/gu, ' or ')
    .replace(/[§]/g, 'section ')
    .replace(/[*_~^|<>{}[\]\\]/g, ' ')
    .replace(/[()]/g, ', ');

  t = spellAcronyms(t, 'en');
  return collapse(t);
}

function clock(h: number, m: number, bare = false): string {
  if (m === 0) return bare && h > 12 ? `${enCardinal(h)} hundred` : bare ? `${enCardinal(h)} o'clock` : enCardinal(h);
  if (m < 10) return `${enCardinal(h)} oh ${enCardinal(m)}`;
  return `${enCardinal(h)} ${enCardinal(m)}`;
}
