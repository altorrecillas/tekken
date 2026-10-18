// Voice check in the real game: announcer lines, every fighter's shout sets and victory line load and play without
// errors; a line said opens the speaker's mouth (talkLevel) while it lasts.
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
// (once the roster has loaded and the title's fighters have walked in: before that a slow machine's page is stuck for
// seconds at a time compiling them, and the click would time out)
while (Date.now() - t0 < 300000) { if (await p.evaluate(() => window.__game?.state === 'title' && window.__bootTimes?.roster != null && !window.__game.entrance).catch(() => false)) break; await p.waitForTimeout(500); }
await p.click('#title [data-act="arcade"]', { timeout: 120000 });   // user gesture: audio starts, select screen preloads every voice
await p.waitForTimeout(8000);
const r = await p.evaluate(async () => {
  const A = window.__game.audio;
  const sets = {};
  for (const [v, set] of Object.entries(A.voiceSets || {})) sets[v] = Object.fromEntries(Object.entries(set).map(([k, l]) => [k, l.length]));
  // play one of each kind for every fighter: no exceptions, a source is started each time
  let played = 0;
  for (const id of ['alejandro', 'arnau', 'camilo', 'rafa', 'zapponi', 'dani', 'noemi']) for (const k of ['attack', 'hurt', 'hurtBig', 'ko', 'win']) {
    A.voiceSrc = A.voiceSrc || {}; const before = A.voiceSrc[id];
    A.voice({ id, pos: { x: 0 } }, k);
    if (A.voiceSrc[id] && A.voiceSrc[id] !== before) played++;
  }
  for (const k of ['round1', 'fight', 'ko', 'win_rafa', 'win_dani']) A.announce(k);
  // the victory lines and the presentation's lines: loaded with their loudness curve, said, the mouth moving while
  // they last
  const lines = {};
  for (const kind of ['quote', 'intro']) for (const id of window.__game.roster) {
    const q = A.lines?.[kind + ':' + id];
    lines[kind + ' ' + id] = { s: q?.buf ? +q.buf.duration.toFixed(2) : 0, env: q?.env?.length || 0, talk: 0 };
  }
  for (const kind of ['quote', 'intro']) for (const id of window.__game.roster) {
    A.line({ id, pos: { x: 0 } }, kind);
    let peak = 0;
    for (let i = 0; i < 12; i++) { await new Promise((ok) => setTimeout(ok, 60)); peak = Math.max(peak, A.talkLevel(id)); }
    lines[kind + ' ' + id].talk = +peak.toFixed(2);
    A.hush();
  }
  return { sets, played, ann: Object.keys(A.voiceClips || {}).length, ctx: A.ctx?.state, lines };
});
console.log(JSON.stringify(r));
const bad = Object.entries(r.lines || {}).filter(([, l]) => !(l.s > 0.8 && l.env > 40 && l.talk > 0.2));
console.log(bad.length ? 'FAIL spoken lines: ' + bad.map(([id, l]) => `${id} ${JSON.stringify(l)}`).join(', ') : `spoken lines (victory and presentation): all ${Object.keys(r.lines).length} load, play and move the mouth`);
console.log('mp3 served', mp3, 'missing', mp3fail);
console.log(errs.length ? errs.join('\n') : 'no page errors');
await b.close(); srv.close();
