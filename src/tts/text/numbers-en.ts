// English number verbalisation (US style, no "and" inside hundreds).

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion'];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]}-${ONES[o]}` : TENS[t];
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return below100(r);
  return r ? `${ONES[h]} hundred ${below100(r)}` : `${ONES[h]} hundred`;
}

/** Cardinal for an integer given as a digit string (any length up to quadrillions). */
export function enCardinal(digits: string | number): string {
  let s = String(digits).replace(/^0+(?=\d)/, '');
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (!/^\d+$/.test(s)) return String(digits);
  if (s.length > 18) return s.split('').map((d) => ONES[+d]).join(' ');
  if (s === '0') return 'zero';
  const groups: number[] = [];
  for (let i = s.length; i > 0; i -= 3) groups.unshift(+s.slice(Math.max(0, i - 3), i));
  const parts: string[] = [];
  groups.forEach((g, i) => {
    if (!g) return;
    const scale = SCALES[groups.length - 1 - i];
    parts.push(scale ? `${below1000(g)} ${scale}` : below1000(g));
  });
  return (neg ? 'minus ' : '') + parts.join(' ');
}

const ORD_IRREGULAR: Record<string, string> = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
};

export function enOrdinal(n: string | number): string {
  const card = enCardinal(n);
  const m = card.match(/([a-z]+)$/);
  if (!m) return card;
  const last = m[1];
  let ord: string;
  if (ORD_IRREGULAR[last]) ord = ORD_IRREGULAR[last];
  else if (last.endsWith('y')) ord = last.slice(0, -1) + 'ieth';
  else ord = last + 'th';
  return card.slice(0, -last.length) + ord;
}

/** Years the way people say them: 1999 → nineteen ninety-nine, 2007 → two thousand seven. */
export function enYear(n: number): string {
  if (n < 1000 || n > 2999) return enCardinal(n);
  if (n >= 2000 && n < 2010) return enCardinal(n);
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return n % 1000 === 0 ? enCardinal(n) : `${below100(hi)} hundred`;
  if (lo < 10) return `${below100(hi)} oh ${ONES[lo]}`;
  return `${below100(hi)} ${below100(lo)}`;
}

/** "3.14" → "three point one four". Integer part uses the cardinal. */
export function enDecimal(intPart: string, frac: string): string {
  const i = intPart === '' ? 'zero' : enCardinal(intPart);
  return `${i} point ${frac.split('').map((d) => ONES[+d]).join(' ')}`;
}

export function enDigits(s: string): string {
  return s.split('').map((d) => (/\d/.test(d) ? ONES[+d] : d)).join(' ');
}

const FRACTIONS: Record<string, [string, string]> = {
  '2': ['half', 'halves'], '3': ['third', 'thirds'], '4': ['quarter', 'quarters'],
};

export function enFraction(num: number, den: number): string {
  const f = FRACTIONS[String(den)];
  const n = enCardinal(num);
  if (f) return `${n} ${num === 1 ? f[0] : f[1]}`;
  if (den <= 20) {
    const o = enOrdinal(den);
    return `${n} ${num === 1 ? o : o + 's'}`;
  }
  return `${n} over ${enCardinal(den)}`;
}
