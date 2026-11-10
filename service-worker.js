// Time Planner — سرویس‌ورکر آفلاین (v1.0.0)
// استراتژی:
//   • صفحات/CSS/JS/JSON → network-first با fallback به کش (آخرین نسخهٔ آنلاین؛ اگر نت نبود نسخهٔ ذخیره‌شده)
//   • تصاویر/فونت/صوت → cache-first (سریع و پایدار)
//   • نصب (install) با { cache: 'reload' } تا کش همیشه از شبکهٔ تازه پر شود + skipWaiting و claim
//   • ناوبری‌های بدون کش → offline.html (صفحهٔ fallback کاملاً مستقل)
const LP_APP_VERSION = '1.0.0';
const CACHE_NAME = 'time-planner-v' + LP_APP_VERSION;
const V = '?v=' + LP_APP_VERSION;
const APP_SHELL = [
  './', './index.html', './offline.html', './manifest.webmanifest', './app-version.json',
  './css/offline.css' + V, './js/offline.js' + V, './pwa.js' + V,
  './assets/app.css', './assets/fonts/Vazirmatn-variable.woff2',
  './assets/vendor/jspdf.umd.min.js', './assets/vendor/html2canvas.min.js',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png', './assets/icons/apple-touch-icon.png'
];
const BINARY_EXT = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'mp3', 'wav', 'ogg'];

function putInCache(cache, request, response) {
  if (response && response.ok) {
    cache.put(request, response.clone()).catch(() => {});
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // همهٔ کش‌های قدیمی (از جمله نسخه‌های time-planner-shell-v*) پاک می‌شوند
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('time-planner-') && key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

async function networkFirst(request, isNavigation) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    putInCache(cache, request, response);
    return response;
  } catch (error) {
    const candidates = isNavigation
      ? ['./index.html', './', request, './offline.html']
      : [request];
    for (const candidate of candidates) {
      const hit = await cache.match(candidate);
      if (hit) return hit;
    }
    return new Response('آفلاین هستید و نسخهٔ ذخیره‌شده در این دستگاه پیدا نشد.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;

  const ext = (url.pathname.split('.').pop() || '').toLowerCase();
  const isBinary = BINARY_EXT.includes(ext);
  const isNavigation = request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if (isBinary) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(hit => hit || fetch(request).then(response => {
          putInCache(cache, request, response);
          return response;
        }))
      )
    );
    return;
  }
  // HTML / CSS / JS / JSON (و همهٔ بقیهٔ درخواست‌های متنی) → network-first
  event.respondWith(networkFirst(request, isNavigation));
});
