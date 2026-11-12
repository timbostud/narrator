// German number verbalisation (Duden spelling: numbers below one million are written as one word).

const ONES = [
  'null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn',
];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
const BIG: Array<[string, string]> = [
  ['Million', 'Millionen'],
  ['Milliarde', 'Milliarden'],
  ['Billion', 'Billionen'],
  ['Billiarde', 'Billiarden'],
];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (!o) return TENS[t];
  return `${o === 1 ? 'ein' : ONES[o]}und${TENS[t]}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const head = h ? `${h === 1 ? 'ein' : ONES[h]}hundert` : '';
  return head + (r ? below100(r) : '');
}

function below1e6(n: number): string {
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  let head = '';
  if (th) head = (th === 1 ? 'ein' : below1000(th).replace(/eins$/, 'ein')) + 'tausend';
  return head + (r ? below1000(r) : '');
}

/** Cardinal for an integer digit string. `eins` stays `eins` (standalone form). */
export function deCardinal(digits: string | number): string {
  let s = String(digits).replace(/^0+(?=\d)/, '');
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (!/^\d+$/.test(s)) return String(digits);
  if (s.length > 18) return s.split('').map((d) => ONES[+d]).join(' ');
  if (s === '0') return 'null';
  const low = +s.slice(-6);
  const groups: number[] = [];
  for (let i = s.length - 6; i > 0; i -= 3) groups.unshift(+s.slice(Math.max(0, i - 3), i));
  const parts: string[] = [];
  groups.forEach((g, i) => {
    if (!g) return;
    const [sg, pl] = BIG[groups.length - 1 - i];
    parts.push(g === 1 ? `eine ${sg}` : `${below1e6(g).replace(/eins$/, 'ein')} ${pl}`);
  });
  if (low) parts.push(below1e6(low));
  return (neg ? 'minus ' : '') + parts.join(' ');
}

/** Attributive form: "1 Euro" → "ein Euro", "21 Euro" → "einundzwanzig Euro", "1 Stunde" → "eine Stunde". */
export function deCardinalAttr(digits: string | number, feminine = false): string {
  const c = deCardinal(digits);
  if (c === 'eins') return feminine ? 'eine' : 'ein';
  return c.replace(/eins$/, 'ein');
}

const ORD_IRREGULAR: Record<string, string> = { eins: 'erst', drei: 'dritt', sieben: 'siebt', acht: 'acht' };

/**
 * Ordinal stem + ending. `ending` is the inflection added after the stem: 'e' (der dritte),
 * 'en' (am dritten), 'er' (dritter), 'es' (drittes).
 */
export function deOrdinal(n: string | number, ending: 'e' | 'en' | 'er' | 'es' | 'em' = 'e'): string {
  const num = typeof n === 'number' ? n : parseInt(n, 10);
  const card = deCardinal(num);
  const r = num % 100;
  let stem: string;
  if (r === 0 || r >= 20) {
    stem = card + 'st'; // zwanzigste, hundertste, tausendste
  } else {
    const tail = card.match(/(eins|drei|sieben|acht)$/);
    stem = tail ? card.slice(0, -tail[1].length) + ORD_IRREGULAR[tail[1]] : card + 't';
  }
  return stem + ending;
}

export function deDecimal(intPart: string, frac: string): string {
  const i = intPart === '' ? 'null' : deCardinal(intPart);
  return `${i} Komma ${frac.split('').map((d) => ONES[+d]).join(' ')}`;
}

/** Years: 1100–1999 are read in hundreds (neunzehnhundertneunzig), others as cardinals. */
export function deYear(n: number): string {
  if (n >= 1100 && n <= 1999) {
    const hi = Math.floor(n / 100);
    const lo = n % 100;
    return `${below100(hi)}hundert${lo ? below100(lo) : ''}`;
  }
  return deCardinal(n);
}

export function deDigits(s: string): string {
  return s.split('').map((d) => (/\d/.test(d) ? ONES[+d] : d)).join(' ');
}

const FRACTIONS: Record<string, string> = { '2': 'halb', '3': 'Drittel', '4': 'Viertel' };

export function deFraction(num: number, den: number): string {
  if (den === 2) return num === 1 ? 'ein halb' : `${deCardinal(num)} Halbe`;
  const name = FRACTIONS[String(den)] ?? (den < 20 ? deOrdinal(den, 'e').replace(/e$/, 'el') : `${deCardinal(den)}stel`);
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return `${num === 1 ? 'ein' : deCardinal(num)} ${cap}`;
}
