// Saved texts, stored locally in IndexedDB.
import { createStore } from './store';

export interface Doc {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** Resume position (sentence index) and how far through the text that is (0–1). */
  position: number;
  progress: number;
}

const DB = 'narrator';
const STORE = 'docs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const library = createStore<Doc[]>([]);

const sort = (docs: Doc[]) => [...docs].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

const SAMPLES: Array<Pick<Doc, 'title' | 'text'>> = [
  {
    title: 'Welcome to Narrator',
    text: `Welcome to Narrator.

Paste any text, and one of four natural voices will read it to you. Everything runs on your device, so nothing you read ever leaves it.

The narrator understands what it reads. A ticket for $4.99, a letter from Dr. Smith in 1999, a meeting on March 3rd at 7:45 pm, or a rise of 12.5%: all of it comes out the way a person would say it.

Try swiping this card in the library, or pull on anything made of glass. It squeezes.`,
  },
  {
    title: 'Willkommen bei Narrator',
    text: `Willkommen bei Narrator.

Füge einen beliebigen Text ein, und eine natürliche Stimme liest ihn dir vor. Alles läuft direkt auf deinem Gerät.

Der Erzähler versteht, was er liest: Am 3. Mai um 14:30 Uhr kostet ein Ticket 5,99 €. Die Strecke ist ca. 120 km lang, d. h. etwa 1,5 Stunden Fahrt. 1989 fiel die Mauer, und der 2. Teil folgt z. B. nächste Woche.

Mischst du Deutsch und Englisch, wechselt die Stimme automatisch die Sprache.`,
  },
];

export async function loadLibrary() {
  try {
    let docs = await tx<Doc[]>('readonly', (s) => s.getAll() as IDBRequest<Doc[]>);
    if (!docs.length && !localStorage.getItem('narrator.seeded')) {
      localStorage.setItem('narrator.seeded', '1');
      const now = Date.now();
      docs = SAMPLES.map((s, i) => ({ ...s, id: crypto.randomUUID(), createdAt: now - i, updatedAt: now - i, pinned: false, position: 0, progress: 0 }));
      await Promise.all(docs.map((d) => tx('readwrite', (s) => s.put(d))));
    }
    library.set(sort(docs));
  } catch (e) {
    console.warn('Library unavailable', e);
  }
}

export async function saveDoc(doc: Doc) {
  library.set((all) => sort([doc, ...all.filter((d) => d.id !== doc.id)]));
  try { await tx('readwrite', (s) => s.put(doc)); } catch (e) { console.warn(e); }
}

export async function patchDoc(id: string, patch: Partial<Doc>, touch = false) {
  const cur = library.get().find((d) => d.id === id);
  if (!cur) return;
  await saveDoc({ ...cur, ...patch, updatedAt: touch ? Date.now() : cur.updatedAt });
}

export async function deleteDoc(id: string): Promise<Doc | undefined> {
  const doc = library.get().find((d) => d.id === id);
  library.set((all) => all.filter((d) => d.id !== id));
  try { await tx('readwrite', (s) => s.delete(id)); } catch (e) { console.warn(e); }
  return doc;
}

export function newDoc(text = '', title = ''): Doc {
  const now = Date.now();
  return { id: crypto.randomUUID(), title, text, createdAt: now, updatedAt: now, pinned: false, position: 0, progress: 0 };
}

export function autoTitle(text: string): string {
  const first = text.trim().split(/\n|(?<=[.!?])\s/)[0] ?? '';
  return first.length > 48 ? first.slice(0, 46).trimEnd() + '…' : first || 'Untitled';
}
