// CampusRoom Service Worker v2
// Bump VERSION on every deploy (and whenever you replace the logo or icons).
// Old caches are deleted automatically.
const VERSION = 'cr-2026-11-28-1';
const CACHE = 'campusroom-' + VERSION;

// Set to true for the FIRST deploy only. Phones stuck on the old cached app
// switch over straight away and open windows reload once.
// After that, set it back to false so users get the "New version available" banner.
const FIRST_ROLLOUT = false;

// Third-party files kept for offline use (these versioned URLs never change)
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Inter:wght@400;500&display=swap',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

function isCdn(url) {
  return (
    (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) ||
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com'
  );
}

// Install: save the CDN files for offline use
self.addEventListener('install', (event) => {
  if (FIRST_ROLLOUT) self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(CDN_ASSETS.map((u) => cache.add(u))))
  );
});

// Activate: delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => {
        if (!FIRST_ROLLOUT) return;
        return self.clients
          .matchAll({ type: 'window' })
          .then((list) => list.forEach((c) => c.navigate(c.url).catch(() => {})));
      })
  );
});

// The page asks the waiting worker to take over when the user taps Refresh
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Other sites: only Firebase SDK files and Google Fonts are cached.
  // Firestore, Auth, Cloudinary, S3 and AdSense always go live.
  if (url.origin !== self.location.origin) {
    if (isCdn(url)) event.respondWith(cacheFirst(req));
    return;
  }

  // Never cache serverless functions (AI, verification codes)
  if (url.pathname.startsWith('/api/')) return;

  const dest = req.destination;
  if (
    req.mode === 'navigate' ||
    dest === 'script' ||
    dest === 'style' ||
    dest === 'manifest' ||
    url.pathname.endsWith('.json')
  ) {
    event.respondWith(networkFirst(req));
  } else if (dest === 'image' || dest === 'font') {
    event.respondWith(cacheFirst(req));
  }
});

// Try the network first so users never get an old app.
// The cache is only used when the phone is offline.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req, { cache: 'no-cache' });
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const home =
        (await cache.match(self.registration.scope)) ||
        (await cache.match(new URL('index.html', self.registration.scope).href));
      if (home) return home;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

// Push notifications
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const icon = new URL('icon-192.png', self.registration.scope).href;
  const options = {
    body: data.body || 'You have a new notification',
    icon: icon,
    badge: icon,
    vibrate: [200, 100, 200],
    data: { url: data.url || self.registration.scope },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(data.title || 'CampusRoom', options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const target = new URL(
    (event.notification.data && event.notification.data.url) || './',
    self.registration.scope
  ).href;
  event.waitUntil(clients.openWindow(target));
});
