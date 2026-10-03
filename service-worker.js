// Service worker : précache de toute l'application (hors ligne complet).
// Aucune dépendance externe : tout est servi depuis le cache local.
const VERSION = 'v1.6.1';
const CACHE = `ma-maison-${VERSION}`;
const CORE = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/catalog.js', './js/cams.js', './js/data.js', './js/dom.js', './js/drivers.js', './js/gl.js',
  './js/house3d.js', './js/plan.js', './js/editor.js', './js/robot.js', './js/icons.js', './js/sheets.js', './js/store.js', './js/views.js', './js/version.js', './js/world.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ma-maison-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    // Stale-while-revalidate : réponse immédiate depuis le cache, mise à jour en arrière-plan
    const refresh = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(refresh); return hit; }
    const res = await refresh;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('./index.html')) || new Response('Hors ligne', { status: 503 });
    return new Response('', { status: 504 });
  })());
});
