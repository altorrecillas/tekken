// The game kept on the phone (sw.js, written by tools/swbuild.py): registered only on the published site
// (tekken.torrecillas.cat, GitHub Pages; ?sw=1 to try it elsewhere). On a development server it is taken away, so the
// files there are always the ones just changed. When a newer version has been stored and waits, onUpdate(apply) is
// called: apply() switches to it and reloads the page.
const PUBLISHED = /(^|\.)torrecillas\.cat$|\.github\.io$/;

export function setupOffline(onUpdate) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const q = new URLSearchParams(location.search);
  if (!PUBLISHED.test(location.hostname) && q.get('sw') !== '1') {
    navigator.serviceWorker.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    return;
  }
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ready = () => {
      // (only an update: the first install has nothing to replace)
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      onUpdate?.(() => reg.waiting?.postMessage('skip'));
    };
    ready();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') ready(); });
    });
    // a long session: look for a new version every half hour
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !navigator.serviceWorker.controller) return; reloading = true; location.reload(); });
}
