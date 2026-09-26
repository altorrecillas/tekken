// Network audit: bytes needed before the title is interactive, bytes for a full session (all fighters, both
// stages), and asset files that are never requested.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const served = new Map(); let phase = 'boot';
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(root, u); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); served.set(u, { phase, bytes: 0, status: 404 }); return r.end(); } if (!served.has(u)) served.set(u, { phase, bytes: d.length, status: 200 }); r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise(r => srv.on('listening', r)); const PORT = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${PORT}/index.html?frames=0&q=low&nodynres=1`, { timeout: 240000 });
await p.waitForFunction('window.__ready===true', null, { timeout: 600000, polling: 500 });
phase = 'background';
await p.waitForTimeout(25000); // background roster prefetch
phase = 'fights';
for (const [a, bb, st] of [['alejandro', 'arnau', 'street'], ['camilo', 'rafa', 'terrace'], ['zapponi', 'alejandro', 'street']]) {
  await p.evaluate(([a, bb, st]) => window.__game.startFight(a, bb, { training: true, stage: st }), [a, bb, st]);
  await p.waitForFunction(`JSON.parse(window.__debug()).state === 'fight'`, null, { timeout: 300000, polling: 500 });
  await p.waitForTimeout(3000);
}
await b.close(); srv.close();
const sum = (ph) => [...served.values()].filter(v => !ph || v.phase === ph).reduce((a, v) => a + v.bytes, 0);
console.log('boot (to interactive title) MB', (sum('boot') / 1e6).toFixed(1), ' files', [...served.values()].filter(v => v.phase === 'boot').length);
console.log('background prefetch MB', (sum('background') / 1e6).toFixed(1));
console.log('first fights MB', (sum('fights') / 1e6).toFixed(1));
console.log('404:', [...served.entries()].filter(([u, v]) => v.status === 404).map(([u]) => u).join(' ') || 'none');
console.log('errors:', errs.join(' | ') || 'none');
const all = [];
const walk = (d) => { for (const f of fs.readdirSync(path.join(root, d))) { const rel = d + '/' + f; const st = fs.statSync(path.join(root, rel)); if (st.isDirectory()) walk(rel); else all.push([rel, st.size]); } };
walk('assets');
const unused = all.filter(([f]) => !served.has('/' + f)).sort((x, y) => y[1] - x[1]);
console.log('never requested:', (unused.reduce((a, [, s]) => a + s, 0) / 1e6).toFixed(1), 'MB in', unused.length, 'files');
for (const [f, s] of unused) console.log('  ', (s / 1e6).toFixed(2), f);
const top = [...served.entries()].filter(([u, v]) => v.phase === 'boot').sort((x, y) => y[1].bytes - x[1].bytes).slice(0, 12);
console.log('largest boot files:'); for (const [u, v] of top) console.log('  ', (v.bytes / 1e6).toFixed(2), u);
