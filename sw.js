/* CampusRoom Service Worker — network-first, self-updating */
const CACHE_VERSION = "v3-" + "20260816"; // bump this date string whenever you want to force a refresh
const CACHE_NAME = "campusroom-" + CACHE_VERSION;

const PRECACHE_URLS = [
  "/Campus-room/",
  "/Campus-room/index.html"
];

// INSTALL: cache the basics, then activate immediately (don't wait for old tabs to close)
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)).catch(()=>{})
  );
});

// ACTIVATE: delete every old cache version, take control of all open tabs right away
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null))
    ).then(()=> self.clients.claim())
  );
});

// FETCH:
// - For page navigations (HTML) and any request to our own site: ALWAYS go to the network first.
//   Only fall back to cache if the network fails (offline).
// - For cross-origin requests (Firebase, Cloudinary, Google Fonts, etc): never intercept —
//   let the browser handle them directly. This is critical: intercepting Firebase Auth/Firestore
//   requests is what caused sign-in and data loading to hang before.
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests on our own origin. Everything else (Firebase, Cloudinary, POST requests)
  // passes straight through untouched.
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then(networkResponse => {
        // Save a fresh copy for offline fallback, then return the live network response.
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
        return networkResponse;
      })
      .catch(() =>
        // Offline fallback: serve the last cached copy if we have one.
        caches.match(req).then(cached => cached || caches.match("/Campus-room/index.html"))
      )
  );
});
