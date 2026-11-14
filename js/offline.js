// Time Planner — آفلاین واقعی، ذخیرهٔ دائمی و وضعیت اتصال (نسخهٔ 1.1.0)
// این فایل هیچ وابستگی بیرونی ندارد؛ در بدترین حالت (نت ملی) از کش اجرا می‌شود.
const LP_APP_VERSION = '1.1.0';
const LP_CACHE_NAME = 'time-planner-v' + LP_APP_VERSION;
const LP_PERF_KEY = 'time_planner_lp_perf';
const LP_READY_KEY = 'time_planner_offline_ready_at';
const LP_PERSIST_KEY = 'time_planner_storage_persisted';

// چند فایل حیاتی برای «تست آفلاین» (فهرست کامل کش در service-worker.js است)
const LP_CRITICAL_URLS = [
  ['./', 'صفحهٔ اصلی (navigation)'],
  ['./offline.html', 'صفحهٔ fallback آفلاین'],
  ['./css/offline.css?v=' + LP_APP_VERSION, 'CSS آفلاین'],
  ['./js/offline.js?v=' + LP_APP_VERSION, 'JS آفلاین'],
  ['./assets/app.css', 'استایل اصلی'],
  ['./assets/vendor/jspdf.umd.min.js', 'کتابخانهٔ jsPDF'],
  ['./assets/fonts/Vazirmatn-variable.woff2', 'فونت وزیرمتن'],
  ['./manifest.webmanifest', 'مانیفست PWA']
];

const toFaDigits = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

// اگر showToast هنوز لود نشده یا در دسترس نیست، از یک toast مستقل استفاده می‌کنیم
function lpToast(msg, type = 'info') {
  if (typeof showToast === 'function') { showToast(msg, type); return; }
  const colors = { success: '#10b981', error: '#ef4444', info: '#6366f1' };
  const t = document.createElement('div');
  t.textContent = msg;
  t.setAttribute('role', 'status');
  t.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:80;' +
    'background:' + (colors[type] || colors.info) + ';color:#fff;padding:.7rem 1.2rem;border-radius:.8rem;' +
    'font-family:Vazirmatn,Tahoma,sans-serif;font-size:.85rem;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw;text-align:center;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function lpSetHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.hidden = Boolean(hidden);
}

// ---------- وضعیت آنلاین / آفلاین ----------
function lpRenderOnlineStatus() {
  const online = navigator.onLine !== false;
  lpSetHidden('offlineBanner', online);
  lpSetHidden('offlineBadge', online);
  const el = document.getElementById('onlineStatus');
  if (el) {
    el.textContent = online ? '🟢 آنلاین' : '🔴 آفلاین (نسخهٔ ذخیره‌شده)';
    el.style.color = online ? '#047857' : '#b45309';
  }
}
window.addEventListener('online', lpRenderOnlineStatus);
window.addEventListener('offline', lpRenderOnlineStatus);

// ---------- ذخیرهٔ دائمی (persistent storage) ----------
async function lpPersistStorage() {
  try {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
      try { localStorage.setItem(LP_PERSIST_KEY, 'unsupported'); } catch (_) {}
      return false;
    }
    let persisted = false;
    if (typeof navigator.storage.persisted === 'function') {
      persisted = await navigator.storage.persisted();
    }
    if (!persisted) persisted = await navigator.storage.persist();
    try { localStorage.setItem(LP_PERSIST_KEY, persisted ? '1' : '0'); } catch (_) {}
    return persisted;
  } catch (e) {
    console.warn('storage.persist failed:', e);
    return false;
  }
}

async function lpRenderPersistStatus() {
  const el = document.getElementById('persistStatus');
  if (!el) return;
  try {
    let persisted = false;
    if (navigator.storage && typeof navigator.storage.persisted === 'function') {
      persisted = await navigator.storage.persisted();
    } else {
      persisted = localStorage.getItem(LP_PERSIST_KEY) === '1';
    }
    el.textContent = persisted
      ? '✅ فعال (مقاوم در برابر پاک‌سازی خودکار)'
      : '⚠️ غیرفعال — دکمهٔ «ذخیره آفلاین» را بزنید';
    el.style.color = persisted ? '#047857' : '#b45309';
  } catch (_) {
    const flag = localStorage.getItem(LP_PERSIST_KEY);
    el.textContent = flag === '1' ? '✅ فعال' : (flag === 'unsupported' ? 'پشتیبانی نمی‌شود' : 'نامشخص');
  }
}

function lpRenderOfflineReadyAt() {
  const el = document.getElementById('offlineReadyAt');
  if (!el) return;
  try {
    const iso = localStorage.getItem(LP_READY_KEY);
    el.textContent = iso
      ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
      : '—';
  } catch (_) { el.textContent = '—'; }
}

// ---------- حالت سبک (html.lp-perf) — خاموش کردن بلورها ----------
function lpApplyPerf(enabled) {
  document.documentElement.classList.toggle('lp-perf', Boolean(enabled));
  const btn = document.getElementById('lpPerfToggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(Boolean(enabled)));
    btn.innerHTML = enabled
      ? '<span>⚡</span> حالت سبک: روشن'
      : '<span>⚡</span> حالت سبک (خاموش‌کردن بلور)';
  }
}
function lpTogglePerf() {
  const next = localStorage.getItem(LP_PERF_KEY) !== '1';
  try { localStorage.setItem(LP_PERF_KEY, next ? '1' : '0'); } catch (_) {}
  lpApplyPerf(next);
  lpToast(next ? 'حالت سبک روشن شد — بلورها خاموش شدند ⚡' : 'حالت سبک خاموش شد', 'info');
}

// ---------- ذخیره آفلاین (دکمهٔ اصلی تنظیمات) ----------
window.lpEnsureOfflineReady = async function lpEnsureOfflineReady() {
  const btn = document.getElementById('btnEnsureOffline');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>⏳</span> در حال ذخیره…'; }
  try {
    // ۱) حافظهٔ دائمی را درخواست کن (تا مرورگر زیر فشار حافظه پاکش نکند)
    const persisted = await lpPersistStorage();

    // ۲) ثبت و فعال‌سازی Service Worker
    let swReady = false;
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./service-worker.js');
        const reg = await navigator.serviceWorker.ready;
        swReady = Boolean(reg && (reg.active || reg.waiting || reg.installing));
      } catch (e) {
        console.error('SW register/ready failed:', e);
      }
    }

    // ۳) صبر کن کش پر شود (حداکثر ~۶ ثانیه) و تعداد فایل‌های کش‌شده را بشمار
    let cachedCount = 0;
    let hasCache = false;
    if (window.caches) {
      for (let i = 0; i < 20; i++) {
        try {
          hasCache = await caches.has(LP_CACHE_NAME);
          if (hasCache) {
            const cache = await caches.open(LP_CACHE_NAME);
            cachedCount = (await cache.keys()).length;
            if (cachedCount >= LP_CRITICAL_URLS.length) break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 300));
      }
    }

    try { localStorage.setItem(LP_READY_KEY, new Date().toISOString()); } catch (_) {}
    await renderOfflineCard();

    if (swReady && hasCache && cachedCount > 0) {
      lpToast(`برنامه روی این دستگاه ذخیره شد ✅ — ${toFaDigits(cachedCount)} فایل در کش${persisted ? ' + ذخیرهٔ دائمی فعال' : ''}`, 'success');
    } else if (!('serviceWorker' in navigator)) {
      lpToast('این مرورگر Service Worker را پشتیبانی نمی‌کند؛ از کروم یا سافاری استفاده کنید', 'error');
    } else {
      lpToast('ذخیره کامل نشد — یک‌بار آنلاین صفحه را تازه کنید و دوباره این دکمه را بزنید', 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
};

// ---------- تست آفلاین ----------
window.lpTestOffline = async function lpTestOffline() {
  const results = [];
  const check = (label, ok) => results.push({ label, ok: Boolean(ok) });

  const swController = 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
  check('Service Worker کنترل‌کنندهٔ صفحه است', swController);

  if (window.caches) {
    let cache = null;
    try {
      check('کش نسخهٔ ' + LP_APP_VERSION + ' وجود دارد', await caches.has(LP_CACHE_NAME));
      cache = await caches.open(LP_CACHE_NAME);
    } catch (_) { cache = null; }
    for (const [url, label] of LP_CRITICAL_URLS) {
      let hit = false;
      try { hit = cache ? Boolean(await cache.match(url)) : false; } catch (_) { hit = false; }
      check(label, hit);
    }
  } else {
    check('Cache Storage در دسترس است', false);
  }

  try { console.table(results.map(r => ({ 'آیتم': r.label, 'وضعیت': r.ok ? '✅' : '❌' }))); } catch (_) { console.log(results); }

  const failed = results.filter(r => !r.ok);
  if (failed.length === 0) {
    lpToast('تست موفق ✅ — همهٔ فایل‌های حیاتی در حافظهٔ این دستگاه هست؛ حتی در نت ملی برنامه باز می‌شود.', 'success');
  } else {
    lpToast('تست ناقص ❌ — این موارد در کش نیستند: ' + failed.map(f => f.label).join('، ') + '. یک‌بار آنلاین باز کنید و «ذخیره آفلاین» را بزنید.', 'error');
  }
  return results;
};

// ---------- به‌روز بودن نسخه (فقط وقتی اینترنت هست) ----------
async function lpCheckVersion() {
  try {
    const res = await fetch('./app-version.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.version && data.version !== LP_APP_VERSION) {
      lpSetHidden('updateHint', false);
    }
  } catch (_) { /* آفلاین هستیم؛ نسخهٔ محلی معتبر است */ }
}

// ---------- نصب PWA (lpCanInstall / lpTriggerInstall) ----------
let lpDeferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  lpDeferredInstallPrompt = event;
  renderOfflineCard();
});
window.addEventListener('appinstalled', () => {
  lpDeferredInstallPrompt = null;
  renderOfflineCard();
});

const lpIsStandalone = () => Boolean(
  (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
  (window.navigator && window.navigator.standalone === true)
);
const lpIsIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.lpCanInstall = function lpCanInstall() {
  return !lpIsStandalone();
};

window.lpTriggerInstall = async function lpTriggerInstall() {
  if (lpIsStandalone()) {
    lpToast('برنامه همین حالا نصب شده و از آیکون اجرا می‌شود ✅', 'info');
    renderOfflineCard();
    return;
  }
  if (lpDeferredInstallPrompt) {
    const promptEvent = lpDeferredInstallPrompt;
    lpDeferredInstallPrompt = null;
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (e) {
      console.warn('install prompt failed:', e);
    }
    renderOfflineCard();
    return;
  }
  // مرورگرهای بدون beforeinstallprompt (مثل سافاری iOS): راهنمای دستی
  if (lpIsIOS()) {
    lpSetHidden('installHelp', false);
    lpToast('آیفون/آیپد: Safari ← دکمهٔ اشتراک‌گذاری ← «Add to Home Screen»', 'info');
    return;
  }
  lpToast('از منوی مرورگر «Install app» یا «Add to Home screen» را بزنید', 'info');
};

// نام مستعار سازگار با پرامپت اصلی
window.ensurePersist = lpPersistStorage;

// ---------- کارت وضعیت آفلاین (کش + پایداری + نصب) ----------
async function renderOfflineCard() {
  lpRenderOnlineStatus();
  await lpRenderPersistStatus();
  lpRenderOfflineReadyAt();
  const t = document.getElementById('offlineStatusText');
  if (t) {
    let cacheOk = false;
    try { cacheOk = window.caches ? await caches.has(LP_CACHE_NAME) : false; } catch (_) { cacheOk = false; }
    const persisted = localStorage.getItem(LP_PERSIST_KEY) === '1';
    t.textContent = cacheOk
      ? '✅ آماده برای اجرای آفلاین' + (persisted ? ' — ذخیرهٔ دائمی فعال' : '')
      : (navigator.onLine !== false
          ? '⬆️ یک‌بار «ذخیره آفلاین» را بزنید تا برای نت ملی آماده شود'
          : '❌ هنوز ذخیره نشده — اتصال را برقرار و «ذخیره آفلاین» را بزنید');
    t.style.color = cacheOk ? '#047857' : '#b45309';
  }
  const installBtn = document.getElementById('btnInstallApp');
  if (installBtn) {
    installBtn.innerHTML = lpIsStandalone() ? '<span>✅</span> نصب شده است' : '<span>📲</span> نصب روی گوشی';
  }
}
window.renderOfflineCard = renderOfflineCard;

// ---------- راه‌اندازی ----------
function lpInit() {
  const v = document.getElementById('settingsVersion');
  if (v) v.textContent = 'v' + LP_APP_VERSION;

  lpApplyPerf(localStorage.getItem(LP_PERF_KEY) === '1');

  document.getElementById('btnEnsureOffline')?.addEventListener('click', window.lpEnsureOfflineReady);
  document.getElementById('btnOfflineTest')?.addEventListener('click', window.lpTestOffline);
  document.getElementById('btnInstallApp')?.addEventListener('click', window.lpTriggerInstall);
  document.getElementById('lpPerfToggle')?.addEventListener('click', lpTogglePerf);

  renderOfflineCard();
  // تلاش ملایم برای ذخیرهٔ دائمی (نتیجه در کارت تنظیمات نمایش داده می‌شود)
  lpPersistStorage().then(() => renderOfflineCard());

  lpCheckVersion();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', lpInit);
} else {
  lpInit();
}
