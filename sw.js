const CACHE_NAME = 'nocturna-v4';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './calendar-core.js',
  './manifest.json',
  './icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App files: network first so updates show up straight away,
  // falling back to the cache when offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return response;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Firebase SDK files are versioned in the URL, so cache-first is safe.
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return response;
      }))
    );
  }
  // Everything else (Firestore, Auth, Bubweb) goes straight to the network.
});

// Tapping a notification opens Nocturna on that day.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  const date = new URL(target).searchParams.get('date');
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((c) => c.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.focus();
      if (date) existing.postMessage({ type: 'open-date', date });
      return;
    }
    await self.clients.openWindow(target);
  })());
});
