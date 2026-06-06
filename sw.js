const CACHE = 'michelangelo-v3';
const BASE = self.location.pathname.replace(/sw\.js$/, '');

const PRECACHE = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.json`,
  `${BASE}icons/icon.svg`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}js/app.js`,
  `${BASE}js/program.js`,
  `${BASE}js/db.js`,
  `${BASE}js/progression.js`,
  `${BASE}js/config.example.js`,
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

function isApiRequest(url) {
  return url.includes('supabase.co')
    || url.includes('github.com/login')
    || url.includes('githubusercontent.com');
}

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

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  if (isApiRequest(request.url)) return;

  if (request.mode === 'navigate') {
    e.respondWith(
      caches.match(`${BASE}index.html`).then(cached => {
        const network = fetch(request).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(`${BASE}index.html`, copy));
          return res;
        });
        return cached || network.catch(() => caches.match(BASE));
      })
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !SHELL.has(request.url)) return;

  e.respondWith(cacheFirst(request));
});