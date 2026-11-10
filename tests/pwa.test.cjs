const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
const swSource = fs.readFileSync('service-worker.js', 'utf8');
const swVersion = (swSource.match(/LP_APP_VERSION\s*=\s*'([^']+)'/) || [])[1];

test('manifest and app shell assets exist, including correctly sized install icons', () => {
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const png = fs.readFileSync(icon.src);
    assert.equal(png.readUInt32BE(16), parseInt(icon.sizes, 10));
    assert.equal(png.readUInt32BE(20), parseInt(icon.sizes, 10));
  }
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-touch-icon/);
  assert.doesNotMatch(html, /https:\/\/(cdn|cdnjs|fonts\.google)/);
  // ارجاع‌های کش‌شده با شماره‌نسخه همراه‌اند تا به‌روزرسانی‌ها واقعاً به دستگاه‌ها برسد
  assert.ok(html.includes(`./css/offline.css?v=${swVersion}`));
  assert.ok(html.includes(`./js/offline.js?v=${swVersion}`));
  assert.ok(html.includes(`./pwa.js?v=${swVersion}`));
});

test('offline shell files exist and are referenced by the service worker', () => {
  for (const file of ['offline.html', 'app-version.json', 'css/offline.css', 'js/offline.js', 'pwa.js']) {
    assert.ok(fs.existsSync(file), `missing ${file}`);
    assert.ok(swSource.includes(file), `service worker does not precache ${file}`);
  }
  assert.ok(swSource.includes("const CACHE_NAME = 'time-planner-v' + LP_APP_VERSION"), 'CACHE_NAME derives from the app version');
  assert.match(swSource, /cache:\s*'reload'/, 'install must precache with { cache: \'reload\' }');
  assert.match(swSource, /skipWaiting/);
  assert.match(swSource, /clients\.claim/);
});

test('service worker precaches on install with reload, purges legacy caches, serves offline', async () => {
  const listeners = {};
  class FakeRequest { constructor(url, opts) { this.url = url; this.cache = opts && opts.cache; } }
  const cache = {
    addAll: async files => {
      cache.files = files.map(f => (typeof f === 'string' ? f : f.url));
      cache.modes = files.map(f => (typeof f === 'string' ? undefined : f.cache));
      for (const file of cache.files) {
        const path = file.split('?')[0];
        assert.ok(fs.existsSync(path), `missing ${path}`);
      }
    },
    match: async (request) => {
      if (typeof request === 'string') return request === './offline.html' ? 'offline fallback' : 'offline index';
      return 'cached asset';
    }
  };
  const deleted = [];
  const caches = {
    open: async () => cache,
    keys: async () => ['time-planner-shell-v1', 'time-planner-v0.9.0', `time-planner-v${swVersion}`, 'another-app'],
    delete: async key => deleted.push(key)
  };
  const self = { addEventListener: (name, cb) => { listeners[name] = cb; },
    location: { origin: 'https://example.com' }, registration: { scope: 'https://example.com/planner/' },
    skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const context = vm.createContext({ self, caches, URL, Promise, Request: FakeRequest,
    fetch: async () => { throw Error('offline'); },
    Response: class { constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; } } });
  vm.runInContext(swSource, context);
  let task;
  listeners.install({ waitUntil: promise => { task = promise; } });
  await task;
  assert.ok(cache.files.includes('./assets/vendor/html2canvas.min.js'));
  assert.ok(cache.files.includes('./offline.html'));
  assert.ok(cache.files.includes(`./js/offline.js?v=${swVersion}`));
  assert.ok(cache.modes.every(mode => mode === 'reload'), 'every precached request must bypass HTTP cache');
  listeners.activate({ waitUntil: promise => { task = promise; } });
  await task;
  assert.deepEqual(deleted.sort(), ['time-planner-shell-v1', 'time-planner-v0.9.0']);

  // ناوبری در حالت آفلاین → index.html ذخیره‌شده (نه خطای شبکه)
  let response;
  listeners.fetch({ request: { url: 'https://example.com/planner/', method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await response, 'offline index');
  // فایل CSS در حالت آفلاین → از کش
  listeners.fetch({ request: { url: 'https://example.com/planner/css/offline.css?v=' + swVersion, method: 'GET', mode: 'no-cors' }, respondWith: promise => { response = promise; } });
  assert.equal(await response, 'cached asset');
  // درخواست غیر GET اصلاً مدیریت نمی‌شود
  response = null;
  listeners.fetch({ request: { url: 'https://example.com/planner/', method: 'POST', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(response, null);
  // مسیر بیرون از scope برنامه مدیریت نمی‌شود
  listeners.fetch({ request: { url: 'https://example.com/other/', method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(response, null);
});

test('install button prompts in supported browsers and provides iOS instructions', async () => {
  function setup(ios) {
    const listeners = {};
    const classes = () => ({ values: new Set(['hidden']), add(x) { this.values.add(x); }, remove(x) { this.values.delete(x); } });
    const button = { classList: classes(), addEventListener: (event, cb) => { listeners.button = cb; } };
    const help = { classList: classes() };
    const window = { matchMedia: () => ({ matches: false }), addEventListener: (name, cb) => { listeners[name] = cb; } };
    const navigator = { userAgent: ios ? 'iPhone' : 'Chrome', platform: '', maxTouchPoints: 0 };
    vm.runInNewContext(fs.readFileSync('pwa.js', 'utf8'), { window, navigator, document: { getElementById: id => id === 'installApp' ? button : help }, console });
    return { listeners, button, help };
  }
  const chrome = setup(false);
  let prompted = false;
  let prevented = false;
  chrome.listeners.beforeinstallprompt({ preventDefault() { prevented = true; }, prompt: async () => { prompted = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  assert.equal(prevented, true);
  assert.equal(chrome.button.classList.values.has('hidden'), false);
  await chrome.listeners.button();
  assert.equal(prompted, true);
  assert.equal(chrome.button.classList.values.has('hidden'), true);
  const ios = setup(true);
  assert.equal(ios.button.classList.values.has('hidden'), false);
  await ios.listeners.button();
  assert.equal(ios.help.classList.values.has('hidden'), false);
});
