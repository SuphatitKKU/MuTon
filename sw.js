const CACHE_NAME = 'muton-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: stale-while-revalidate for static, passthrough for Firebase/Auth
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip Firebase, Google Auth, and API calls — let them go direct to network
  if (
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('accounts.google') ||
    url.hostname.includes('securetoken') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('google.com')
  ) {
    return;
  }

  // For same-origin requests: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});
