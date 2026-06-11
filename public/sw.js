/* ========================================
   Savoraapp Service Worker v9
   Robuust: cache NOOIT HTML, alleen CSS/JS/fonts/images
   Dit voorkomt "redirected response" errors volledig
   ======================================== */

const CACHE_NAME = 'savoraapp-v9';

// Alleen statische assets cachen — NOOIT .html bestanden
const STATIC_ASSETS = [
  '/tailwind-built.css',
  '/styles.css',
  '/landing.css'
];

// URL-patronen die we NIET willen cachen
function shouldNotCache(url) {
  const path = url.pathname;

  // Nooit HTML pagina's cachen
  if (path.endsWith('.html')) return true;
  if (path === '/') return true;  // root = index.html

  // Nooit API calls cachen
  if (path.startsWith('/api/')) return true;

  // Nooit admin pagina's
  if (path.includes('/admin')) return true;

  // Nooit non-HTTP protocollen
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

  return false;
}

// Is dit een cachebaar statisch asset? (CSS, JS, fonts, images)
function isCacheableAsset(url) {
  const path = url.pathname;

  // Expliciet in de lijst
  if (STATIC_ASSETS.includes(path)) return true;

  // Afbeeldingen
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(path)) return true;

  // Fonts
  if (/\.(woff2?|ttf|otf|eot)$/i.test(path)) return true;

  // JS/CSS bestanden
  if (/\.(js|css)$/i.test(path)) return true;

  return false;
}

// ============================================
// INSTALL: cache alleen statische assets
// ============================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.log('[SW] Cache addAll failed:', err);
      });
    })
  );
  self.skipWaiting();
});

// ============================================
// ACTIVATE: wis ALLE oude caches
// ============================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================
// FETCH: network-first voor alles, cache als fallback
// HTML pagina's: nooit cachen, direct naar netwerk
// Statische assets: cache-first met netwerk fallback
// ============================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Laat de browser non-HTTP requests zelf afhandelen
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // Nooit API calls aanraken
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Nooit HTML pagina's aanraken — dit voorkomt de "redirected response" error
  if (shouldNotCache(url)) {
    return;
  }

  // Alleen statische assets (CSS, JS, images, fonts) worden gecacht
  if (!isCacheableAsset(url)) {
    return;
  }

  // Cache-first voor statische assets met redirect handling
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Serve uit cache, en update cache op de achtergrond
        caches.open(CACHE_NAME).then((cache) => {
          fetch(request, { redirect: 'follow' }).then((response) => {
            if (response.ok && !response.redirected) {
              cache.put(request, response);
            }
          }).catch(() => {});
        });
        return cached;
      }

      // Niet in cache: fetch van netwerk
      return fetch(request, { redirect: 'follow' }).then((response) => {
        if (!response || response.status !== 200 || request.method !== 'GET') {
          return response;
        }

        // GEEN redirected responses cachen
        if (response.redirected) {
          return response;
        }

        // Cache de response
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
        });

        return response;
      });
    })
  );
});
