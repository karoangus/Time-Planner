// The install event is available in supporting Chromium browsers; iOS uses Safari's Share menu.
let installPrompt = null;
const installButton = document.getElementById('installApp');
const installHelp = document.getElementById('installHelp');
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (!isStandalone && isIOS) installButton.classList.remove('hidden');

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton.classList.remove('hidden');
});

installButton.addEventListener('click', async () => {
  if (!installPrompt) {
    if (isIOS) installHelp.classList.remove('hidden');
    return;
  }
  const prompt = installPrompt;
  installPrompt = null;
  installButton.classList.add('hidden');
  await prompt.prompt();
  await prompt.userChoice;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton.classList.add('hidden');
  installHelp.classList.add('hidden');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.error('Service worker registration failed:', error);
    });
  });
}
