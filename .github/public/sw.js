/* ========================================
   Savoraapp Service Worker V2
   Fix: chrome-extension:// requests worden genegeerd
   ======================================== */

const CACHE_NAME = 'savoraapp-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/css/styles.css',
  '/js/main.js',
  '/js/verification.js',
  '/js/countries.js',
  '/js/analytics.js',
  '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(() => {
      // Silent fail — app works without cache
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: only cache http:// and https:// requests
// FIX: ignore chrome-extension://, file://, etc.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ONLY handle http:// and https:// — skip chrome-extension://, file://, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return; // Let browser handle non-HTTP requests normally
  }

  // Skip API calls (don't cache dynamic data)
  if (url.pathname.startsWith('/api/')) {
    return; // Let API requests go to network
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        // Only cache successful GET requests
        if (!response || response.status !== 200 || request.method !== 'GET') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
        });
        return response;
      }).catch(() => {
        // Offline: return nothing (app still works)
      });
    })
  );
});
