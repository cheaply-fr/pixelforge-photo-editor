/* PixelForge's service worker keeps the static editor shell available after a successful online visit. */
const CACHE_NAME = 'pixelforge-shell-v3';
// Library fonts and their glyph metadata are cached on first use in their own
// cache (URLs carry ?v=<asset version>), so shell cache bumps never evict them
// and a font used once keeps working offline (docs/font-library-contract.md).
const FONT_CACHE_NAME = 'pixelforge-fonts-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/pixel-logo.svg', '/icons/pixelforge-192.png', '/icons/pixelforge-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('pixelforge-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Health reads must reach the network; cache busting queries must not grow the shell cache.
  const path = new URL(request.url).pathname;
  if (path === '/release.json' || path === '/api/readyz.json' || path === '/api/readyz' || path === '/health') return;

  if (path.startsWith('/fonts/')) {
    event.respondWith(
      caches.open(FONT_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) void cache.put(request, response.clone());
            return response;
          });
        }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate' && path.startsWith('/help')) {
    // Help Center pages are separate static documents: network first, then the
    // copy cached under their own URL. They must never replace the editor shell.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/help'))),
    );
    return;
  }

  if (request.mode === 'navigate') {
    // Always check the network first so a deploy can replace a cached HTML shell.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Hashed Vite assets are immutable; cache the first successful response and reuse it offline.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
