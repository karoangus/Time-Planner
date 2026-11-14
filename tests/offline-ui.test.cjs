// تست یکپارچگی بخش «تنظیمات و آفلاین» (js/offline.js) در یک DOM حداقلی موقلی
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const V = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const CACHE_NAME = 'time-planner-v' + V;

function makeEnv({ online = true, persistedStorage = false, cachedUrls = [], controller = {} } = {}) {
  const elements = new Map();
  const mkElement = () => ({
    hidden: false, disabled: false, textContent: '', innerHTML: '', style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, addEventListener(name, cb) { this['on_' + name] = cb; }, remove() {},
    appendChild() {}
  });
  const storage = new Map();
  const localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k)
  };
  const cached = new Set(cachedUrls);
  const cacheStub = {
    keys: async () => [...cached],
    match: async url => (cached.has(url) ? { ok: true } : undefined)
  };
  const listeners = {};
  const documentElement = { classList: { toggle(cls, on) { documentElement._perf = Boolean(on); } } };
  const document = {
    readyState: 'complete',
    documentElement,
    body: mkElement(),
    createElement: mkElement,
    getElementById(id) { if (!elements.has(id)) elements.set(id, mkElement()); return elements.get(id); },
    addEventListener() {}
  };
  const navigator = {
    onLine: online,
    storage: { persisted: async () => persistedStorage, persist: async () => true },
    serviceWorker: { controller, register: async () => ({}), ready: Promise.resolve({ active: {} }) }
  };
  const caches = { has: async name => name === CACHE_NAME, open: async () => cacheStub };
  const fetch = async () => ({ ok: true, json: async () => ({ version: V }) });
  const window = { addEventListener: (name, cb) => { listeners[name] = cb; }, caches };
  const console_ = { log() {}, warn() {}, error() {}, table() {} };
  const context = vm.createContext({ window, navigator, document, localStorage, caches, fetch, console: console_, setTimeout: () => 0 });
  vm.runInContext(fs.readFileSync('js/offline.js', 'utf8'), context);
  return { context, elements, localStorage, documentElement, listeners, navigator };
}

const flush = () => new Promise(r => setImmediate(r));

test('lpInit renders the running version and keeps banner hidden while online', async () => {
  const env = makeEnv({ online: true });
  await flush();
  assert.equal(env.elements.get('settingsVersion').textContent, 'v' + V);
  assert.equal(env.elements.get('offlineBanner').hidden, true);
  assert.equal(env.elements.get('offlineBadge').hidden, true);
  assert.match(env.elements.get('onlineStatus').textContent, /آنلاین/);
  // ذخیرهٔ دائمی درخواست شد و وضعیتش نمایش داده شد
  assert.match(env.elements.get('persistStatus').textContent, /فعال|غیرفعال/);
});

test('going offline shows banner, badge and offline status; going back hides them', async () => {
  const env = makeEnv({ online: true });
  await flush();
  env.navigator.onLine = false;
  env.listeners.offline();
  assert.equal(env.elements.get('offlineBanner').hidden, false);
  assert.equal(env.elements.get('offlineBadge').hidden, false);
  assert.match(env.elements.get('onlineStatus').textContent, /آفلاین/);
  env.navigator.onLine = true;
  env.listeners.online();
  assert.equal(env.elements.get('offlineBanner').hidden, true);
  assert.equal(env.elements.get('offlineBadge').hidden, true);
});

test('lpEnsureOfflineReady persists storage, verifies the cache and stamps the ready time', async () => {
  const allUrls = ['./', './offline.html', `./css/offline.css?v=${V}`, `./js/offline.js?v=${V}`,
    './assets/app.css', './assets/vendor/jspdf.umd.min.js', './assets/fonts/Vazirmatn-variable.woff2', './manifest.webmanifest'];
  const env = makeEnv({ online: false, cachedUrls: allUrls });
  await flush();
  await env.context.window.lpEnsureOfflineReady();
  assert.equal(env.localStorage.getItem('time_planner_storage_persisted'), '1');
  const readyAt = env.localStorage.getItem('time_planner_offline_ready_at');
  assert.ok(readyAt && !Number.isNaN(Date.parse(readyAt)), 'expected an ISO ready timestamp');
  assert.match(env.elements.get('persistStatus').textContent, /فعال/);
});

test('lpTestOffline passes when every critical asset is cached and fails otherwise', async () => {
  const critical = ['./', './offline.html', `./css/offline.css?v=${V}`, `./js/offline.js?v=${V}`,
    './assets/app.css', './assets/vendor/jspdf.umd.min.js', './assets/fonts/Vazirmatn-variable.woff2', './manifest.webmanifest'];
  const okEnv = makeEnv({ cachedUrls: critical });
  await flush();
  const okResults = await okEnv.context.window.lpTestOffline();
  assert.ok(okResults.every(r => r.ok), 'all checks should pass with a full cache');
  const badEnv = makeEnv({ cachedUrls: critical.slice(0, 2) });
  await flush();
  const badResults = await badEnv.context.window.lpTestOffline();
  assert.ok(badResults.some(r => !r.ok), 'missing critical assets must be reported');
});

test('lp-perf toggle flips the html class and persists the choice', async () => {
  const env = makeEnv();
  await flush();
  env.elements.get('lpPerfToggle').on_click; // دکمه از طریق addEventListener وصل شده
  const toggle = env.elements.get('lpPerfToggle');
  assert.equal(typeof toggle.on_click, 'function');
  toggle.on_click();
  assert.equal(env.localStorage.getItem('time_planner_lp_perf'), '1');
  assert.equal(env.documentElement._perf, true);
  toggle.on_click();
  assert.equal(env.localStorage.getItem('time_planner_lp_perf'), '0');
  assert.equal(env.documentElement._perf, false);
});

test('renderOfflineCard reports readiness once cache/persist are set and flips the install button', async () => {
  const env = makeEnv({ cachedUrls: ['./'] });
  await flush();
  // caches.has برای کش نسخهٔ فعلی true است → متن آمادهٔ آفلاین
  assert.match(env.elements.get('offlineStatusText').textContent, /آماده برای اجرای آفلاین|ذخیره/);
  assert.match(env.elements.get('btnInstallApp').innerHTML, /نصب/);
});
