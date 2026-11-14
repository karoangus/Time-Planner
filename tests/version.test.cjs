const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const appVersion = JSON.parse(fs.readFileSync('app-version.json', 'utf8'));
const sw = fs.readFileSync('service-worker.js', 'utf8');
const offlineJs = fs.readFileSync('js/offline.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const V = pkg.version;

test('all version carriers agree on the same version', () => {
  assert.equal(appVersion.version, V, 'app-version.json');
  assert.equal(lock.version, V, 'package-lock.json');
  assert.equal(lock.packages && lock.packages[''] && lock.packages[''].version, V, 'package-lock packages root');
  const match = offlineJs.match(/LP_APP_VERSION\s*=\s*'([^']+)'/);
  assert.ok(match, 'LP_APP_VERSION not found in js/offline.js');
  assert.equal(match[1], V, 'LP_APP_VERSION');
  assert.ok(sw.includes(`const LP_APP_VERSION = '${V}'`), 'service-worker.js version');
  assert.ok(sw.includes("const CACHE_NAME = 'time-planner-v' + LP_APP_VERSION"), 'CACHE_NAME derives from the version');
  assert.ok(index.includes(`./css/offline.css?v=${V}`), 'offline.css is versioned');
  assert.ok(index.includes(`./js/offline.js?v=${V}`), 'offline.js is versioned');
  assert.ok(index.includes(`./pwa.js?v=${V}`), 'pwa.js is versioned');
  assert.ok(index.includes('id="settingsVersion"'), 'settings page shows the version');
});

test('js/offline.js and the inline app script of index.html parse', () => {
  assert.doesNotThrow(() => new vm.Script(offlineJs), 'js/offline.js has a syntax error');
  const appScript = index.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(appScript, 'inline app script not found');
  assert.doesNotThrow(() => new vm.Script(appScript[1]), 'inline app script has a syntax error');
});

test('offline.html fallback is fully standalone and Persian', () => {
  const html = fs.readFileSync('offline.html', 'utf8');
  assert.doesNotMatch(html, /<link\s[^>]*href=/i, 'must not load external CSS/links');
  assert.doesNotMatch(html, /<script\s[^>]*src=/i, 'must not load external scripts');
  assert.doesNotMatch(html, /url\(\s*['"]?\.?\.?\//, 'must not reference local asset files');
  assert.match(html, /آفلاین/);
  assert.match(html, /<html lang="fa" dir="rtl">/);
});

test('index.html wires banner, badge and settings card with the expected ids', () => {
  for (const id of ['offlineBanner', 'offlineBadge', 'settingsCard', 'settingsVersion', 'onlineStatus',
    'persistStatus', 'offlineReadyAt', 'updateHint', 'btnEnsureOffline', 'btnOfflineTest', 'lpPerfToggle']) {
    assert.ok(index.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.ok(sw.includes('./offline.html'), 'fallback page must be precached');
});

test('v1.1.0 additions: display_override, offline-card wiring, no-store fetch, install helpers', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  assert.deepEqual(manifest.display_override, ['standalone', 'minimal-ui']);
  assert.match(sw, /cache:\s*'no-store'/, 'network-first fetch must bypass the HTTP cache');
  for (const token of ['lpTriggerInstall', 'lpCanInstall', 'renderOfflineCard', 'ensurePersist']) {
    assert.ok(offlineJs.includes(token), `js/offline.js must define ${token}`);
  }
  for (const id of ['offlineStatusText', 'btnInstallApp']) {
    assert.ok(index.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  for (const cls of ['offline-banner', 'offline-badge', 'offline-card', 'offline-status']) {
    assert.ok(index.includes(cls), `index.html is missing class ${cls}`);
    assert.ok(fs.readFileSync('css/offline.css', 'utf8').includes(`.${cls}`), `css/offline.css is missing .${cls}`);
  }
  const offlineHtml = fs.readFileSync('offline.html', 'utf8');
  assert.match(offlineHtml, /href="\.\/"/, 'offline.html must link back to the app (recovery)');
});
