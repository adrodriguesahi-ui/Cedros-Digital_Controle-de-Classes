const CACHE_NAME = 'clube-digital-v26';
const ASSETS = [
  './login.html',
  './manifest.json',
  './icon-192.png?v=3',
  './icon-512.png?v=3',
  './icon-512-maskable.png?v=3',
  './apple-touch-icon.png?v=3',
  './logo.png?v=3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache:'reload' busca direto do servidor — sem ele, a versão nova do cache
    // podia ser montada com arquivos velhos do cache HTTP do navegador.
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Only cache same-origin requests — never intercept calls to Supabase (or
  // any other external API), otherwise admin data would be served stale.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  // HTML: network-first. The app updates often (login, permissions, admin
  // panel), and a cache-first HTML response can get a visitor permanently
  // stuck on an old version — including old, less-restrictive login logic.
  // Falls back to the cached copy only when offline. cache:'reload' forces a
  // real network round-trip instead of letting fetch() silently resolve from
  // the browser's own HTTP cache — without it, "network-first" here was only
  // nominal, and a visitor could stay on stale HTML indefinitely.
  if (event.request.mode === 'navigate' || event.request.destination === 'document' || new URL(event.request.url).pathname.endsWith('/clube.js')) {
    event.respondWith(
      fetch(event.request, { cache: 'reload' })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (icons, manifest): cache-first, they rarely change.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
