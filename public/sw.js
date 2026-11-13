/* FLOWI service worker.
   With internet nothing changes: every file comes from the server, so a new version shows up at once.
   Without internet (or when the server does not answer in a few seconds) the program's own files — the page,
   scripts, styles, fonts, pictures — come from the last saved copy, so the program still opens.
   Data (/api/...) is never touched here: the program keeps its own small copy of the menu and rooms. */
const CACHE = 'flowi-shell-v1';
const SHELL = '/__shell';
const WAIT = 4000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const appPage = (url) => /^\/(c\/[a-z0-9-]+\/?|app\/?)$/i.test(url.pathname);
const KINDS = ['script', 'style', 'font', 'image', 'manifest'];

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(key);
  const fresh = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    return res;
  });
  if (!saved) return fresh;
  fresh.catch(() => {}); // answered from the copy below
  const late = new Promise((ok) => setTimeout(() => ok(null), WAIT));
  const res = await Promise.race([fresh.catch(() => null), late]);
  return res && (res.ok || res.status < 500) ? res : saved;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    if (appPage(url)) e.respondWith(networkFirst(req, SHELL));
    return;
  }
  if (KINDS.includes(req.destination)) e.respondWith(networkFirst(req, url.pathname + url.search));
});
