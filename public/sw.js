const CACHE_NAME = 'chrono-keep-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first strategy for all requests to ensure we always get the latest files if online.
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Only cache successful responses (e.g. ignore 404s)
        if (response.ok && e.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails, fallback to cache
        return caches.match(e.request);
      })
  );
});
