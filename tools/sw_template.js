// Puños de Barrio's service worker: the game kept on the phone. WRITTEN BY tools/swbuild.py from tools/sw_template.js
// (edit the template, not sw.js). VERSION: the game's; SHELL: stored on install; HASH: every served file and a short
// hash of it (what it stores). Every request goes to the server first and its answer is stored; the stored copy is
// used when there is no connection. Same-origin GETs only: the online mode's signalling and anything else go to the network.
const VERSION = /*VERSION*/;
const SHELL = /*SHELL*/;
const HASH = /*HASH*/;
const CACHE = 'pdb-files';
const SCOPE = new URL(self.registration.scope).pathname;

// the path of a request inside the game ('index.html' for the page itself, whatever its query), or null
function pathOf(req) {
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith(SCOPE)) return null;
  let p = decodeURIComponent(u.pathname.slice(SCOPE.length));
  if (req.mode === 'navigate' && (p === '' || p === 'index.html')) p = 'index.html';
  return HASH[p] ? p : null;
}
// stored with its hash in a header of its own
async function put(c, p, res) {
  const h = new Headers(res.headers);
  h.set('x-pdb-hash', HASH[p]);
  h.delete('content-encoding'); h.delete('content-length');
  const body = await res.arrayBuffer();
  const copy = new Response(body, { status: 200, statusText: 'OK', headers: h });
  await c.put(SCOPE + p, copy.clone());
  return copy;
}
async function fresh(c, p) {
  const hit = await c.match(SCOPE + p);
  if (hit && hit.headers.get('x-pdb-hash') === HASH[p]) return hit;
  // (no-cache: asked of the server again, never the browser's possibly older copy stored under the new hash)
  const res = await fetch(SCOPE + p, { cache: 'no-cache' });
  if (!res.ok) throw new Error(p + ' ' + res.status);
  return put(c, p, res);
}
// a part of a stored file (the music is streamed in ranges)
async function ranged(req, res) {
  const r = req.headers.get('range');
  if (!r) return res;
  const buf = await res.arrayBuffer(), n = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(r) || [];
  let a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : n - 1;
  if (!m[1] && m[2]) { a = Math.max(0, n - +m[2]); b = n - 1; }
  b = Math.min(b, n - 1);
  const h = new Headers(res.headers);
  h.set('Content-Range', `bytes ${a}-${b}/${n}`); h.set('Content-Length', String(b - a + 1)); h.set('Accept-Ranges', 'bytes');
  return new Response(buf.slice(a, b + 1), { status: 206, statusText: 'Partial Content', headers: h });
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // (a few at a time: a phone's connection is not flooded)
    const list = SHELL.slice();
    await Promise.all(Array.from({ length: 6 }, async () => { while (list.length) { const p = list.shift(); try { await fresh(c, p); } catch (err) { /* fetched when needed */ } } }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // what changed or went away since the last version: dropped
    const c = await caches.open(CACHE);
    for (const req of await c.keys()) {
      const p = decodeURIComponent(new URL(req.url).pathname.slice(SCOPE.length));
      const hit = await c.match(req);
      if (!HASH[p] || hit?.headers.get('x-pdb-hash') !== HASH[p]) await c.delete(req);
    }
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); if (e.data === 'version') e.source?.postMessage({ version: VERSION }); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const p = pathOf(req);
  if (!p) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    // the server first, always (a file changed on it is never served from an old copy: the development server is the
    // same site), its answer stored for later; the stored copy only when the network fails or does not answer in a
    // few seconds (no connection): then the game plays from the phone
    try {
      const res = await Promise.race([fetch(SCOPE + p, { cache: 'no-cache' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 6000))]);
      if (!res.ok) throw new Error(String(res.status));
      return ranged(req, await put(c, p, res));
    } catch (err) {
      const old = await c.match(SCOPE + p);
      if (old) return ranged(req, old);
      return fetch(req);
    }
  })());
});
