// Service worker for FWR Recyclers.
//
// It deliberately caches almost nothing. Chrome needs a service worker with a fetch handler
// before it will offer to install an app, but this site is served by the Vite dev server, whose
// module URLs are NOT content-hashed. Caching application code would therefore serve stale
// JavaScript after a deploy, with no way for a user to clear it. So everything goes straight to
// the network, and the only cached thing is a page to show when the network is gone.
const CACHE = 'fwr-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      // Take over at once rather than waiting for every tab to close.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only page loads get a fallback. API calls and assets go to the network untouched, so the
  // app never shows data that is quietly out of date.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});
