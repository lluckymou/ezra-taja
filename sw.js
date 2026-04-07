const CACHE = 'ezra-taja-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/css/fonts.css',
  './assets/js/game.js',
  './assets/js/combat.js',
  './assets/js/world.js',
  './assets/js/renderer.js',
  './assets/js/hud.js',
  './assets/js/map.js',
  './assets/js/i18n.js',
  './assets/js/state.js',
  './assets/lang/en.json',
  './assets/lang/pt.json',
  './assets/lang/ko.json',
  './assets/img/icon.svg',
  './assets/img/pause.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
