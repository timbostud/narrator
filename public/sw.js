// Offline shell + cross-origin isolation.
// Voice models are cached separately by the app (Cache Storage "narrator-models-v1").
// This worker also adds COOP/COEP headers so multi-threaded WASM works on static hosts
// (e.g. GitHub Pages) that can't set response headers themselves.
const CACHE = 'narrator-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('narrator-shell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

function isolate(res) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Works from any subfolder: the app shell is keyed by the worker's scope.
    const shell = self.registration.scope;
    if (req.mode === 'navigate') {
      try {
        const res = await fetch(req);
        if (res.ok) await cache.put(shell, res.clone());
        return isolate(res);
      } catch {
        return isolate((await cache.match(shell)) || Response.error());
      }
    }
    const hit = await cache.match(req);
    if (hit) return isolate(hit);
    const res = await fetch(req);
    if (res.ok && (url.pathname.includes('/assets/') || /\.(svg|webmanifest|wasm|data)$/.test(url.pathname))) {
      await cache.put(req, res.clone());
    }
    return isolate(res);
  })());
});
