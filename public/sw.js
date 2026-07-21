const CACHE_NAME = 'chrono-keep-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/main.ts',
  './src/style.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // We don't fail the whole install if some files fail to cache
      // because Vite might change file names on build.
      return Promise.allSettled(ASSETS.map(url => cache.add(url)));
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});
