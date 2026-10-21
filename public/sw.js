const CACHE_NAME = 'mangaflow-v4';

// 1. Static UI shell assets pre-cached for native PWA performance
const STATIC_SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/filter',
  '/profile/following',
  '/profile/sync',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 2. Chapter Data API: Stale-While-Revalidate
  // Caches chapter metadata & page URL lists so the reader can reopen offline
  if (url.pathname.startsWith('/api/chapter/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkFetch = fetch(event.request)
          .then((res) => {
            if (res && res.status === 200) {
              cache.put(event.request, res.clone());
            }
            return res;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  // 3. Chapter Panel Images: Cache-First
  // Ensures panels already requested are instantly served offline (e.g. in Airplane Mode)
  if (url.pathname.startsWith('/api/proxy') || event.request.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const networkResponse = await fetch(event.request);
          // Only cache successful image responses (never cache 403 or 500 errors)
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return new Response('Panel offline', { status: 503, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // 4. Standard Site Navigation: Network-First with Cache Fallback
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
