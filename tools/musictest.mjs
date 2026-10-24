// Background audio check in the real game: the menu track streams after the first click, a stage track replaces it in
// a fight (the stage's own style: one of its tracks), the next fight on that stage starts on another of them, the
// final round brings in the stage's final track, a track that ends gives way to the next, the stage's acoustics and
// the menus' recorded sounds load, the festival's lights follow the music's beat, the street crowd bed and the KO
// cheer decode; no page errors. Ends with MUSIC OK or MUSIC FAILED.
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
const fails = [];
const key = () => p.evaluate(() => window.__game.audio.musicKey);
const fightOn = async (stage) => {
  await p.evaluate((s) => window.__game.startFight('rafa', 'camilo', { human2: true, stage: s }), stage);
  const t = Date.now();
  while (Date.now() - t < 300000) { if (await p.evaluate(() => window.__game?.state === 'fight').catch(() => false)) break; await p.waitForTimeout(500); }
  await p.waitForTimeout(4000);
};
const k1 = await key();
if (!/^street_[abc]$/.test(k1 || '')) fails.push('street fight plays ' + k1);
const sp = await p.evaluate(() => ({ space: window.__game.audio.space, ui: Object.keys(window.__game.audio.ui || {}).sort().join(',') }));
console.log('space/ui  ', JSON.stringify(sp));
if (sp.space !== 'street') fails.push('acoustics ' + sp.space);
if (sp.ui !== 'ui_back,ui_move,ui_ok') fails.push('menu sounds ' + sp.ui);
// the final round: the stage's angrier track
await p.evaluate(() => window.__game.audio.finalRound());
await p.waitForTimeout(2500);
const kf = await key();
console.log('final     ', kf, JSON.stringify(await st()));
if (kf !== 'street_final') fails.push('final round plays ' + kf);
// a new fight on the same stage starts on its next track
await fightOn('street');
const k2 = await key();
console.log('next fight', k2);
if (!/^street_[abc]$/.test(k2 || '') || k2 === k1) fails.push(`next fight plays ${k2} after ${k1}`);
// the end of a track: the next one comes in
await p.evaluate(() => { const el = window.__game.audio.musicEl; el.currentTime = Math.max(0, el.duration - 1); });
await p.waitForTimeout(4000);
const k3 = await key();
console.log('after end ', k3, JSON.stringify(await st()));
if (!/^street_[abc]$/.test(k3 || '') || k3 === k2) fails.push(`after the end plays ${k3} after ${k2}`);
// the festival: its lights keep the music's beat
await fightOn('festival');
// (the stage's beat is the one of its last drawn frame, and in software rendering a frame can take a second: of a few
// samples, one must find the two together; the music's beat must move at its tempo)
const smp = [];
for (let i = 0; i < 8; i++) { smp.push(await p.evaluate(() => [window.__game.audio.musicKey, window.__game.audio.musicBeat(), window.__game.stage.beat, performance.now()])); await p.waitForTimeout(500); }
console.log('festival  ', JSON.stringify(smp.map(([k, m, b]) => [k, +m.toFixed(2), +b.toFixed(2)])));
const f0 = smp[0], f1 = smp[smp.length - 1], rate = (f1[1] - f0[1]) / ((f1[3] - f0[3]) / 1000) * 60;
const together = Math.min(...smp.map(([, m, b]) => Math.abs(m - b)));
if (!/^festival_/.test(f0[0] || '') || !(rate > 60 && rate < 200) || together > 0.6) fails.push(`festival beat: ${rate.toFixed(0)} bpm, closest ${together.toFixed(2)} beats`);
await p.evaluate(() => window.__game.backToTitle());
await p.waitForTimeout(6000);
console.log('back title', JSON.stringify(await st()));
if (await key() !== 'menu') fails.push('title plays ' + await key());
await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
console.log('served', JSON.stringify(served));
console.log(errs.length ? errs.join('\n') : 'no page errors');
if (errs.length) fails.push(errs.length + ' page errors');
console.log(fails.length ? 'MUSIC FAILED: ' + fails.join('; ') : 'MUSIC OK');
await b.close(); srv.close();
