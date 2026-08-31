/**
 * Zap Track - JSW Electrical Department - Service Worker
 * Enables offline caching, background synchronization, and Progressive Web App installation
 */

const CACHE_NAME = 'zap-track-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/firebase-config.js',
  './js/app.js',
  './manifest.json',
  './assets/images/jsw-logo.png',
  './assets/images/jsw-logo-card.png',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/icon-maskable-512x512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32x32.png'
];

// External CDN dependencies to pre-cache if available
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// 1. Install Event: Cache core app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline app shell');
      // Cache local assets reliably
      cache.addAll(STATIC_ASSETS);
      // Attempt external fonts/icons without failing install if offline
      EXTERNAL_ASSETS.forEach(url => {
        fetch(url, { mode: 'no-cors' })
          .then(res => cache.put(url, res))
          .catch(() => console.log('[SW] CDN asset cached on next online cycle:', url));
      });
    })
  );
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Purging legacy cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-first with instant offline cache fallback
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Stale-While-Revalidate for app shell and assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If network fails and no direct match, return index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('/');
          }
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
