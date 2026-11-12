// Model storage. Voice models are large (63–326 MB). Chromium's Cache API fails on entries of
// this size ("Unexpected internal error"), so models live in the Origin Private File System,
// which is built for big files. A small ".ok" marker is written last, so a download that was
// interrupted halfway is never mistaken for a complete model.

const DIR = 'narrator-models';

const keyFor = (url: string) => url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-200);

async function dir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create: true });
  } catch {
    return null;
  }
}

export async function cacheGet(url: string): Promise<File | null> {
  const d = await dir();
  if (!d) return null;
  try {
    await d.getFileHandle(keyFor(url) + '.ok');
    const f = await (await d.getFileHandle(keyFor(url))).getFile();
    return f.size ? f : null;
  } catch {
    return null;
  }
}

type SyncHandle = { truncate(n: number): void; write(b: Uint8Array, o?: { at: number }): number; flush(): void; close(): void };

async function writeFile(d: FileSystemDirectoryHandle, name: string, data: Uint8Array) {
  const fh = await d.getFileHandle(name, { create: true });
  if ('createWritable' in fh) {
    const w = await (fh as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
    await w.write(data as Uint8Array<ArrayBuffer>);
    await w.close();
  } else {
    // Safari: synchronous access handles (available in workers)
    const h = await (fh as unknown as { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle();
    h.truncate(0);
    h.write(data, { at: 0 });
    h.flush();
    h.close();
  }
}

export async function cachePut(url: string, data: Uint8Array): Promise<void> {
  const d = await dir();
  if (!d) return;
  try {
    await writeFile(d, keyFor(url), data);
    await writeFile(d, keyFor(url) + '.ok', new Uint8Array([1]));
  } catch (e) {
    console.warn('Could not store model', url, e);
  }
}

export async function cacheClear(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(DIR, { recursive: true });
  } catch { /* nothing stored */ }
}

export async function isCached(url: string): Promise<boolean> {
  return !!(await cacheGet(url));
}

/** Fetch with progress, served from (and saved to) the model store. */
export async function fetchCached(url: string, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const hit = await cacheGet(url);
  if (hit) {
    const buf = await hit.arrayBuffer();
    onProgress?.(buf.byteLength, buf.byteLength);
    return buf;
  }
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded, total || loaded);
  }
  const buf = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  await cachePut(url, buf);
  return buf.buffer;
}

/** Adapter so transformers.js (used by Kokoro) stores its files in the same place. */
export const transformersCache = {
  async match(request: string | Request): Promise<Response | undefined> {
    const url = typeof request === 'string' ? request : request.url;
    const f = await cacheGet(url);
    return f ? new Response(f, { headers: { 'content-length': String(f.size) } }) : undefined;
  },
  async put(request: string | Request, response: Response): Promise<void> {
    const url = typeof request === 'string' ? request : request.url;
    await cachePut(url, new Uint8Array(await response.arrayBuffer()));
  },
};
