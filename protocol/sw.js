const CACHE = 'protocol-v12';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/state.js',
  '/device-identity.js',
  '/meal-state.js',
  '/meal-logic.js',
  '/meal-display.js',
  '/checklist-logic.js',
  '/tab-nav.js',
  '/render-coordinator.js',
  '/day-completion.js',
  '/update-coordinator.js',
  '/protocol.json',
  '/meals.json',
  '/finance.js',
  '/finance-forms.js',
  '/app-mode.js',
  '/finance-budget.js',
  '/finance-transactions.js',
  '/csv-import.js',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=DM+Mono:wght@300;400&display=swap'
];

// Install: cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  // Don't skipWaiting — wait to be activated so we can notify the user
});

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first with background revalidation (stale-while-revalidate)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isApiLikeCrossOrigin = !isSameOrigin && e.request.destination === '';

  // Never cache API-like requests (for example sync calls to a Worker domain).
  if (e.request.method !== 'GET' || isApiLikeCrossOrigin) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response && response.status === 200) {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => null);

        return cached || fetchPromise;
      })
    )
  );
});

// When a new SW is waiting, notify all open clients
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});