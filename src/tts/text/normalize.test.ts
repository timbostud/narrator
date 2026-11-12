import { describe, expect, it } from 'vitest';
import { deCardinal, deOrdinal, deYear } from './numbers-de';
import { enCardinal, enOrdinal, enYear } from './numbers-en';
import { normalizeEnglish } from './normalize-en';
import { normalizeGerman } from './normalize-de';
import { prepare } from './prepare';
import { cleanText } from './common';

const en = (s: string) => normalizeEnglish(cleanText(s));
const de = (s: string) => normalizeGerman(cleanText(s));

describe('English numbers', () => {
  it('cardinals', () => {
    expect(enCardinal(0)).toBe('zero');
    expect(enCardinal(21)).toBe('twenty-one');
    expect(enCardinal(105)).toBe('one hundred five');
    expect(enCardinal(1234567)).toBe('one million two hundred thirty-four thousand five hundred sixty-seven');
  });
  it('ordinals', () => {
    expect(enOrdinal(1)).toBe('first');
    expect(enOrdinal(12)).toBe('twelfth');
    expect(enOrdinal(21)).toBe('twenty-first');
    expect(enOrdinal(40)).toBe('fortieth');
    expect(enOrdinal(103)).toBe('one hundred third');
  });
  it('years', () => {
    expect(enYear(1999)).toBe('nineteen ninety-nine');
    expect(enYear(1905)).toBe('nineteen oh five');
    expect(enYear(1900)).toBe('nineteen hundred');
    expect(enYear(2007)).toBe('two thousand seven');
    expect(enYear(2026)).toBe('twenty twenty-six');
  });
});

describe('English normalization', () => {
  it('money', () => {
    expect(en('It costs $4.99.')).toBe('It costs four dollars and ninety-nine cents.');
    expect(en('£2.50 each')).toBe('two pounds and fifty pence each');
    expect(en('a $5M deal')).toBe('a five million dollars deal');
  });
  it('dates and times', () => {
    expect(en('Meet me on March 3rd at 7:45 pm.')).toBe('Meet me on March third at seven forty-five p m.');
    expect(en('Born in 1969.')).toBe('Born in nineteen sixty-nine.');
    expect(en('2026-11-12')).toBe('November twelfth, twenty twenty-six');
    expect(en('at 10:00')).toBe("at ten o'clock");
  });
  it('abbreviations, units, percent, ranges', () => {
    expect(en('Dr. Smith lives on Baker St. now.')).toBe('Doctor Smith lives on Baker Street now.');
    expect(en('It is 5 km away, i.e. far.')).toBe('It is five kilometers away, that is, far.');
    expect(en('Growth was 12.5%.')).toBe('Growth was twelve point five percent.');
    expect(en('Pages 5-10')).toBe('Pages five to ten');
    expect(en('the 1990s')).toBe('the nineteen nineties');
    expect(en('the 21st century')).toBe('the twenty-first century');
    expect(en('I was 5 in the morning')).toBe('I was five in the morning');
  });
  it('acronyms', () => {
    expect(en('The FBI and NASA')).toBe('The eff bee eye and NASA');
  });
});

describe('German numbers', () => {
  it('cardinals', () => {
    expect(deCardinal(1)).toBe('eins');
    expect(deCardinal(21)).toBe('einundzwanzig');
    expect(deCardinal(101)).toBe('einhunderteins');
    expect(deCardinal(1234)).toBe('eintausendzweihundertvierunddreißig');
    expect(deCardinal(2000000)).toBe('zwei Millionen');
    expect(deCardinal(1001000)).toBe('eine Million eintausend');
  });
  it('ordinals', () => {
    expect(deOrdinal(1)).toBe('erste');
    expect(deOrdinal(3, 'en')).toBe('dritten');
    expect(deOrdinal(7)).toBe('siebte');
    expect(deOrdinal(8)).toBe('achte');
    expect(deOrdinal(12, 'er')).toBe('zwölfter');
    expect(deOrdinal(20)).toBe('zwanzigste');
    expect(deOrdinal(21)).toBe('einundzwanzigste');
    expect(deOrdinal(100)).toBe('einhundertste');
    expect(deOrdinal(103)).toBe('einhundertdritte');
  });
  it('years', () => {
    expect(deYear(1990)).toBe('neunzehnhundertneunzig');
    expect(deYear(1800)).toBe('achtzehnhundert');
    expect(deYear(2026)).toBe('zweitausendsechsundzwanzig');
  });
});

describe('German normalization', () => {
  it('dates with case agreement', () => {
    expect(de('Am 3. Mai fahren wir.')).toBe('Am dritten Mai fahren wir.');
    expect(de('Heute ist der 12.11.2026.')).toBe('Heute ist der zwölfte November zweitausendsechsundzwanzig.');
    expect(de('Berlin, 1.4.1990')).toBe('Berlin, erster April neunzehnhundertneunzig');
  });
  it('money, time, percent', () => {
    expect(de('Das kostet 5,99 €.')).toBe('Das kostet fünf Euro neunundneunzig.');
    expect(de('Nur 1 € heute')).toBe('Nur ein Euro heute');
    expect(de('Treffen um 14:30 Uhr.')).toBe('Treffen um vierzehn Uhr dreißig.');
    expect(de('um 1 Uhr')).toBe('um ein Uhr');
    expect(de('Plus 3,5 % Zinsen')).toBe('Plus drei Komma fünf Prozent Zinsen');
    expect(de('1.299 Euro')).toBe('eintausendzweihundertneunundneunzig Euro');
  });
  it('abbreviations, ordinals, units', () => {
    expect(de('Das ist z. B. gut, d.h. sehr gut.')).toBe('Das ist zum Beispiel gut, das heißt sehr gut.');
    expect(de('Zum 1. Mal fahren wir 120 km/h.')).toBe('Zum ersten Mal fahren wir einhundertzwanzig Kilometer pro Stunde.');
    expect(de('der 2. Weltkrieg')).toBe('der zweite Weltkrieg');
    expect(de('Es dauert 1 Stunde.')).toBe('Es dauert eine Stunde.');
    expect(de('1989 fiel die Mauer.')).toBe('neunzehnhundertneunundachtzig fiel die Mauer.');
    expect(de('Es sind 21 Grad.')).toBe('Es sind einundzwanzig Grad.');
  });
});

describe('prepare()', () => {
  it('splits sentences without breaking at abbreviations and detects language per paragraph', () => {
    const text = 'Dr. Smith arrived at 5 pm. He was late!\n\nAm 3. Mai kommt z. B. Herr Müller. Das ist schön.';
    const plan = prepare(text, { lang: 'auto' });
    expect(plan.sentences.map((s) => text.slice(s.start, s.end))).toEqual([
      'Dr. Smith arrived at 5 pm.',
      'He was late!',
      'Am 3. Mai kommt z. B. Herr Müller.',
      'Das ist schön.',
    ]);
    expect(plan.sentences.map((s) => s.lang)).toEqual(['en', 'en', 'de', 'de']);
    expect(plan.chunks[0].spoken).toBe('Doctor Smith arrived at five p m.');
  });
  it('keeps word offsets pointing at the original text', () => {
    const text = 'Hello, world! It costs $5.';
    const plan = prepare(text, { lang: 'en' });
    const words = plan.chunks.flatMap((c) => c.words.map((w) => text.slice(w.start, w.end)));
    expect(words).toEqual(['Hello', 'world', 'It', 'costs', '$5']);
  });
});
