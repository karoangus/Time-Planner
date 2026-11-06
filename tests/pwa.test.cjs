const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));

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
  assert.match(html, /manifest.webmanifest/);
  assert.match(html, /apple-touch-icon/);
  assert.doesNotMatch(html, /https:\/\/(cdn|cdnjs|fonts\.google)/);
});

test('service worker precaches local assets and serves offline under a subpath', async () => {
  const listeners = {};
  const cache = {
    addAll: async files => {
      for (const file of files) assert.ok(fs.existsSync(file), `missing ${file}`);
      cache.files = files;
    },
    match: async request => typeof request === 'string' ? 'offline index' : 'cached asset'
  };
  const deleted = [];
  const caches = {
    open: async () => cache,
    keys: async () => ['time-planner-shell-v0', 'time-planner-shell-v1', 'another-app'],
    delete: async key => deleted.push(key)
  };
  const self = { addEventListener: (name, cb) => { listeners[name] = cb; },
    location: { origin: 'https://example.com' }, registration: { scope: 'https://example.com/planner/' },
    skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const context = vm.createContext({ self, caches, URL, Promise, fetch: async () => { throw Error('offline'); } });
  vm.runInContext(fs.readFileSync('service-worker.js', 'utf8'), context);
  let task;
  listeners.install({ waitUntil: promise => { task = promise; } });
  await task;
  assert.ok(cache.files.includes('./assets/vendor/html2canvas.min.js'));
  listeners.activate({ waitUntil: promise => { task = promise; } });
  await task;
  assert.deepEqual(deleted, ['time-planner-shell-v0']);
  let response;
  listeners.fetch({ request: { url: 'https://example.com/planner/', method: 'GET', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await response, 'offline index');
  listeners.fetch({ request: { url: 'https://example.com/planner/assets/app.css', method: 'GET', mode: 'no-cors' }, respondWith: promise => { response = promise; } });
  assert.equal(await response, 'cached asset');
  response = null;
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
