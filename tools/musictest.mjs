// Background audio check in the real game: the menu track streams after the first click, the stage track replaces it
// in a fight, the street crowd bed and the KO cheer decode; no page errors.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.gz': 'application/gzip', '.mp3': 'audio/mpeg' };
const served = {};
// (range requests: media elements stream with Range headers)
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(root, u);
  fs.readFile(p, (e, d) => {
    if (u.endsWith('.mp3')) served[u] = (served[u] || 0) + (e ? -1000 : 1);
    if (e) { r.writeHead(404); return r.end(); }
    const ct = types[path.extname(p)] || 'application/octet-stream';
    const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    if (m) { const a = +m[1], z = m[2] ? +m[2] : d.length - 1; r.writeHead(206, { 'Content-Type': ct, 'Content-Range': `bytes ${a}-${z}/${d.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': z - a + 1 }); return r.end(d.subarray(a, z + 1)); }
    r.writeHead(200, { 'Content-Type': ct, 'Accept-Ranges': 'bytes', 'Content-Length': d.length }); r.end(d);
  });
}).listen(0, '127.0.0.1');
await new Promise(r => srv.on('listening', r)); const PORT = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console ' + m.text()); });
await p.goto(`http://127.0.0.1:${PORT}/index.html?q=low&nodynres=1`, { timeout: 240000 });
const t0 = Date.now();
while (Date.now() - t0 < 240000) { if (await p.evaluate(() => window.__game?.state === 'title').catch(() => false)) break; await p.waitForTimeout(500); }
const st = () => p.evaluate(() => { const A = window.__game.audio, el = A.musicEl; return { ctx: A.ctx?.state, track: A.musicTrack, src: el?.src?.replace(/^.*assets/, 'assets'), paused: el?.paused, t: el ? +el.currentTime.toFixed(2) : null, ready: el?.readyState, gain: A.musicGain ? +A.musicGain.gain.value.toFixed(2) : null, amb: A.amb?.kind || null, ambNodes: A.amb?.nodes.length ?? null }; });
console.log('before click', JSON.stringify(await st()));
await p.mouse.click(5, 5);   // first touch anywhere: audio starts, the menu music with it
await p.waitForTimeout(4000);
console.log('title     ', JSON.stringify(await st()));
await p.waitForTimeout(3000);
console.log('title +3s ', JSON.stringify(await st()));
// a fight on the street stage (versus through the debug entry used by the other tests)
await p.evaluate(() => window.__game.startFight('rafa', 'camilo', { human2: true, stage: 'street' }));
const t1 = Date.now();
while (Date.now() - t1 < 300000) { if (await p.evaluate(() => window.__game?.state === 'fight').catch(() => false)) break; await p.waitForTimeout(500); }
await p.waitForTimeout(5000);
console.log('fight     ', JSON.stringify(await st()));
const cheer = await p.evaluate(async () => { const A = window.__game.audio; A.crowdSwell(); const buf = await A.loadBuffer('assets/sfx/cheer.mp3'); const amb = await A.loadBuffer('assets/sfx/crowd_loop.mp3'); return { cheer: buf?.duration, crowd: amb?.duration }; });
console.log('crowd     ', JSON.stringify(cheer));
await p.evaluate(() => window.__game.backToTitle());
await p.waitForTimeout(6000);
console.log('back title', JSON.stringify(await st()));
await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
console.log('served', JSON.stringify(served));
console.log(errs.length ? errs.join('\n') : 'no page errors');
await b.close(); srv.close();
