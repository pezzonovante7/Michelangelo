const CACHE = 'michelangelo-v9';
const BASE = self.location.pathname.replace(/sw\.js$/, '');

// NOTE: do NOT list js/config.js here — it is gitignored and 404s on the server.
// cache.addAll() is atomic, so a single 404 fails the entire SW install. config.js
// is fetched lazily at runtime (with its own fallback) and doesn't need precaching.
const PRECACHE = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.json`,
  `${BASE}icons/icon.svg`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}icons/icon-512-maskable.png`,
  `${BASE}js/app.js`,
  `${BASE}js/program.js`,
  `${BASE}js/db.js`,
  `${BASE}js/progression.js`,
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
];

const SHELL = new Set(PRECACHE.map(url => new URL(url, self.location.origin).href));

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Support immediate activation from the page when we detect a new SW (helps deploys take effect without manual hard refresh)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isApiRequest(url) {
  return url.includes('supabase.co')
    || url.includes('github.com/login')
    || url.includes('githubusercontent.com');
}

// Cache-first: for immutable/static assets (icons, fonts, pinned CDN lib).
// Returns the cached copy instantly and refreshes it in the background.
function cacheFirst(request) {
  return caches.match(request).then(cached => {
    const network = fetch(request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  });
}

// Network-first: for the app's OWN code (HTML + JS). Always tries to fetch the
// freshest version so deploys take effect immediately; falls back to cache only
// when offline. Without this, a cache-first strategy serves stale app.js forever
// and code fixes never reach the user.
function networkFirst(request, fallbackUrl) {
  return fetch(request).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(fallbackUrl || request, copy));
    }
    return res;
  }).catch(() =>
    caches.match(request).then(cached =>
      cached || (fallbackUrl ? caches.match(fallbackUrl) : caches.match(BASE))
    )
  );
}

// Our own application code — must always be served network-first so updates land.
function isAppCode(url) {
  if (url.origin !== self.location.origin) return false;
  return url.pathname.endsWith('.js') || url.pathname.endsWith('.html');
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  if (isApiRequest(request.url)) return;

  // HTML navigations: always try the network first, fall back to cached shell offline.
  if (request.mode === 'navigate') {
    e.respondWith(networkFirst(request, `${BASE}index.html`));
    return;
  }

  const url = new URL(request.url);

  // App's own JS/HTML: network-first so fixes deploy without a stale-cache trap.
  if (isAppCode(url)) {
    e.respondWith(networkFirst(request));
    return;
  }

  // Everything else we care about (icons, fonts, pinned Supabase lib): cache-first.
  if (url.origin !== self.location.origin && !SHELL.has(request.url) && !request.url.includes('supabase-js@2')) return;

  e.respondWith(cacheFirst(request));
});