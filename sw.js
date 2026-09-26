const CACHE_NAME = 'cedros-digital-v7';
const ASSETS = [
  './login.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
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
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
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
