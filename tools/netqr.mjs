// Online versus with no internet at all: two QR codes, as two phones on a WiFi without internet (or on one phone's
// hotspot) would pair. The host's offer is drawn as a QR; the other phone's camera (Chromium's fake camera fed a
// video of that QR, read by jsQR as on an iPhone) reads it and shows its answer as a QR; the host's camera reads that
// one (fed straight to its scanner here) and both are in. Checked too: a QR of another game or another version is
// turned down, the fight starts and stays in sync, and a lost link with no internet says so (no way back).
// usage: node netqr.mjs [outDir]   (playwright next to this file or GAME_ROOT=<game folder>; ffmpeg)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || '.');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f.endsWith('/') ? f + 'index.html' : f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(0, r));
// no internet: no room server, no STUN
const URL_ = `http://localhost:${server.address().port}/index.html?q=low&nodynres=1&netdebug=1&norender=1&lankey=none&sig=ws://127.0.0.1:9/none`;

const errors = [];
let ok = true;
const check = (c, what) => { console.log((c ? '  ok   ' : '  FAIL ') + what); if (!c) ok = false; };
const watch = (p, n) => {
  p.on('pageerror', (e) => errors.push(`${n} PAGEERROR ${e.message}\n${e.stack}`));
  p.on('console', (m) => { const t = m.text(); if (t.startsWith('[net]')) console.log(`  (${n} ${t})`); if (m.type() === 'error' && !/404|ERR_CONNECTION_REFUSED|WebSocket|Failed to load resource/.test(t)) errors.push(`${n} ${t}`); });
};
const waitFor = async (p, fn, arg, ms = 60000, what = 'condition') => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(200); }
  throw new Error('timeout: ' + what);
};
// the text of the QR drawn in a page, read back with jsQR from its own pixels
const decodeIn = (p, sel) => p.evaluate(async (sel) => {
  const c = document.querySelector(sel + ' canvas');
  const jsQR = (await import('/vendor/qr/jsqr.js')).default;
  const img = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const r = jsQR(img.data, img.width, img.height);
  return r && r.data;
}, sel);

const gl = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const vp = { viewport: { width: 760, height: 400 } };
const bh = await chromium.launch({ args: [...gl, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const H = await (await bh.newContext(vp)).newPage();
watch(H, 'host');
let bg = null, G = null;
const t0 = Date.now();
try {
  await H.goto(URL_);
  await waitFor(H, () => !!document.querySelector('#title.on'), null, 180000, 'title');
  await H.click('#title .menu button[data-act="vsmenu"]'); await H.click('#title .menu button[data-act="online"]');
  await waitFor(H, () => /Sin internet/.test(document.querySelector('#online [data-k=list]')?.textContent || ''), null, 15000, 'no internet notice');
  check(true, 'no internet: the WiFi list says so and points to the QR codes');
  await H.click('#online [data-a=qrhost]');
  await waitFor(H, () => !!document.querySelector('#online .ol-room [data-k=qr]')?.dataset.text, null, 30000, 'host QR');
  const offer = await H.evaluate(() => document.querySelector('#online .ol-room [data-k=qr]').dataset.text);
  const modules = await H.evaluate(() => +document.querySelector('#online .ol-room [data-k=qr] canvas').dataset.modules);
  check(/^PDB1\|[\d.]+-\w+\|o\|/.test(offer) && offer.length < 240, `the host shows its connection as a QR (${offer.length} characters, ${modules}×${modules} squares)`);
  check(await decodeIn(H, '#online .ol-room [data-k=qr]') === offer, 'the QR drawn reads back as the same text');
  await H.screenshot({ path: path.join(OUT, 'netqr_host.png') });

  // the other phone's camera sees that QR on the host's screen: a video of it for the fake camera
  const png = path.join(OUT, 'qr_offer.png'), y4m = path.join(OUT, 'qr_offer.y4m');
  const dataURL = await H.evaluate(() => document.querySelector('#online .ol-room [data-k=qr] canvas').toDataURL('image/png'));
  fs.writeFileSync(png, Buffer.from(dataURL.split(',')[1], 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-vf', 'scale=300:300,pad=640:480:170:90:color=white,format=yuv420p', '-t', '2', '-r', '10', y4m]);
  bg = await chromium.launch({ args: [...gl, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
  G = await (await bg.newContext(vp)).newPage();
  watch(G, 'guest');
  await G.goto(URL_);
  await waitFor(G, () => !!document.querySelector('#title.on'), null, 180000, 'guest title');
  await G.click('#title .menu button[data-act="vsmenu"]'); await G.click('#title .menu button[data-act="online"]');
  await G.click('#online [data-a=qrjoin]');
  // the real one, through the camera
  await waitFor(G, () => !!document.querySelector('#online .ol-joinqr [data-k=mine] [data-k=qr]')?.dataset.text, null, 60000, 'the camera read the QR');
  const answer = await G.evaluate(() => document.querySelector('#online .ol-joinqr [data-k=qr]').dataset.text);
  check(/^PDB1\|[\d.]+-\w+\|a\|/.test(answer) && await decodeIn(G, '#online .ol-joinqr [data-k=mine] [data-k=qr]') === answer, `the guest's camera read the host's QR (jsQR) and shows its answer as a QR (${answer.length} characters)`);
  await G.screenshot({ path: path.join(OUT, 'netqr_guest.png') });
  // the host's camera: first a QR of another game, then an answer from another version (turned down with a clear
  // message), then the real answer
  const wrong = [];
  for (const t of ['PMJ1|1.00|a|abcd|efgh|' + 'A'.repeat(43) + '=|', answer.replace(/^PDB1\|[^|]+/, 'PDB1|0.9-old')]) {
    await H.evaluate((t) => window.__online.scanner.feed(t), t);
    await H.waitForTimeout(500);
    wrong.push(await H.evaluate(() => document.querySelector('#online .ol-room [data-k=msg]').textContent));
  }
  check(/no es de una partida/.test(wrong[0]) && /versión 0\.9/.test(wrong[1]), `a QR from another app or another version is turned down ("${wrong[0].slice(0, 34)}…" / "${wrong[1].slice(0, 34)}…")`);
  await H.evaluate((t) => window.__online.scanner.feed(t), answer);
  await waitFor(H, () => !document.querySelector('#online [data-a=go]').disabled, null, 30000, 'QR room: guest in');
  await waitFor(G, () => !!document.querySelector('#online .ol-wait'), null, 30000, 'QR guest connected');
  check(true, 'connected with no internet: the host sees the guest, the guest waits for the start');

  // a quick fight
  await H.click('#online [data-a=go]');
  await Promise.all([H, G].map((p) => waitFor(p, () => window.__game.state === 'select', null, 20000, 'select')));
  await H.keyboard.press('KeyU');
  await G.keyboard.press('KeyD'); await G.waitForTimeout(150); await G.keyboard.press('KeyU');
  await Promise.all([H, G].map((p) => waitFor(p, () => window.__online.phase === 'fight' && !!window.__online.session, null, 120000, 'fight')));
  await H.waitForTimeout(1500);
  await H.keyboard.press('KeyU');
  for (let i = 0; i < 25; i++) { await H.keyboard.down(i % 2 ? 'KeyD' : 'KeyI'); await G.keyboard.down(i % 3 ? 'KeyJ' : 'ArrowLeft'); await H.waitForTimeout(140); await H.keyboard.up(i % 2 ? 'KeyD' : 'KeyI'); await G.keyboard.up(i % 3 ? 'KeyJ' : 'ArrowLeft'); }
  const st = await Promise.all([H, G].map((p) => p.evaluate(() => ({ ...window.__online.session.stats, frame: window.__game.match.frame, ids: window.__game.match.fighters.map((f) => f.id).join(' vs ') }))));
  check(st[0].checks > 2 && st[0].desyncs === 0 && st[1].desyncs === 0 && st[0].ids === st[1].ids, `QR fight: ${st[0].ids}, ${st[0].checks} state checks, all agreeing (frames ${st[0].frame}/${st[1].frame})`);

  // with no internet a lost link has no way back: both are told
  await G.evaluate(() => window.__online.net.host.link.pc.close());
  await waitFor(G, () => window.__online.phase === 'lobby', null, 30000, 'guest out');
  await waitFor(H, () => window.__online.phase === 'lobby' || window.__online.phase === 'room', null, 30000, 'host out');
  check(true, 'a lost link with no internet: both told, back to the menu (no way back without a room server)');
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await H.screenshot({ path: path.join(OUT, 'netqr_fail_host.png') }).catch(() => {});
  if (G) await G.screenshot({ path: path.join(OUT, 'netqr_fail_guest.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `NETQR OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'NETQR FAILED');
await bh.close(); if (bg) await bg.close();
server.close();
process.exit(ok ? 0 : 1);
