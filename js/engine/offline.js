// The game kept on the phone (sw.js, written by tools/swbuild.py), for playing with no connection: registered on the
// published site (tekken.torrecillas.cat, GitHub Pages; ?sw=1 to try it elsewhere), taken away elsewhere. It always
// asks the server first, so the files are never older than the server's; a new worker takes over at once (the page
// reloads once when it does). onUpdate(apply) stays for a worker left waiting by an older one.
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
