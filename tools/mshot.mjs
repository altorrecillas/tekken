// Mobile capture: node mshot.mjs "<path?query>" out.png <profile> [actions]
// profiles: phoneL (844x390 @3, touch), phoneP (390x844), phoneS (667x375 @2), tablet (1180x820 @2, touch)
// actions: comma list of  tap:x:y | wait:ms | ready | shot:file  (x,y in CSS px; negative = from right/bottom)
import { chromium, devices } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.css': 'text/css', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const log = [];
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); log.push('404 ' + q.url); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise(r => srv.on('listening', r)); const PORT = srv.address().port;
const [url, out, prof = 'phoneL', actions = ''] = process.argv.slice(2);
const P = {
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  phoneP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  phoneS: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}[prof];
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ ...P, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const p = await ctx.newPage();
const seen = new Set();
p.on('console', m => { const t = m.type() + ': ' + m.text(); if (t.includes('GPU stall') || t.includes('GL Driver') || seen.has(t)) return; seen.add(t); console.log(t); });
p.on('pageerror', e => console.log('PAGEERROR: ' + e.message));
const sep = url.includes('?') ? '&' : '?';
await p.goto(`http://127.0.0.1:${PORT}/${url}${sep}nodynres=1`, { timeout: 240000 });
const W = P.viewport.width, H = P.viewport.height;
const xy = (x, y) => [x < 0 ? W + x : x, y < 0 ? H + y : y];
for (const a of actions.split(',').filter(Boolean)) {
  const [k, ...v] = a.split(':');
  if (k === 'ready') { try { await p.waitForFunction('window.__ready===true', null, { timeout: 900000, polling: 500 }); } catch (e) { console.log('TIMEOUT ready'); } }
  else if (k === 'wait') await p.waitForTimeout(+v[0]);
  else if (k === 'tap') { const [x, y] = xy(+v[0], +v[1]); await p.touchscreen.tap(x, y); }
  else if (k === 'sel') { const el = await p.$(v.join(':')); if (el) { const bb = await el.boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); } else console.log('NOSEL ' + v.join(':')); }
  else if (k === 'shot') { await p.screenshot({ path: v[0] }); console.log('shot ' + v[0]); }
  else if (k === 'eval') { console.log('EVAL', await p.evaluate(v.join(':'))); }
}
await p.screenshot({ path: out, timeout: 400000 });
console.log('404s:', log.length ? log.join(' ') : 'none');
await b.close(); srv.close();
