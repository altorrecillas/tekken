// Voice check in the real game: announcer lines and every fighter's shout sets load and play without errors.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.gz': 'application/gzip', '.mp3': 'audio/mpeg' };
let mp3 = 0, mp3fail = 0;
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(root, u); fs.readFile(p, (e, d) => { if (u.endsWith('.mp3')) { if (e) mp3fail++; else mp3++; } if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise(r => srv.on('listening', r)); const PORT = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console ' + m.text()); });
await p.goto(`http://127.0.0.1:${PORT}/index.html?q=low&nodynres=1`);
const t0 = Date.now();
while (Date.now() - t0 < 240000) { if (await p.evaluate(() => window.__game?.state === 'title').catch(() => false)) break; await p.waitForTimeout(500); }
await p.click('#title [data-act="arcade"]');   // user gesture: audio starts, select screen preloads every voice
await p.waitForTimeout(8000);
const r = await p.evaluate(async () => {
  const A = window.__game.audio;
  const sets = {};
  for (const [v, set] of Object.entries(A.voiceSets || {})) sets[v] = Object.fromEntries(Object.entries(set).map(([k, l]) => [k, l.length]));
  // play one of each kind for every fighter: no exceptions, a source is started each time
  let played = 0;
  for (const id of ['alejandro', 'arnau', 'camilo', 'rafa', 'zapponi', 'dani']) for (const k of ['attack', 'hurt', 'hurtBig', 'ko', 'win']) {
    A.voiceSrc = A.voiceSrc || {}; const before = A.voiceSrc[id];
    A.voice({ id, pos: { x: 0 } }, k);
    if (A.voiceSrc[id] && A.voiceSrc[id] !== before) played++;
  }
  for (const k of ['round1', 'fight', 'ko', 'win_rafa', 'win_dani']) A.announce(k);
  return { sets, played, ann: Object.keys(A.voiceClips || {}).length, ctx: A.ctx?.state };
});
console.log(JSON.stringify(r));
console.log('mp3 served', mp3, 'missing', mp3fail);
console.log(errs.length ? errs.join('\n') : 'no page errors');
await b.close(); srv.close();
