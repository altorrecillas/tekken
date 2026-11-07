// The game kept on the phone (sw.js, js/engine/offline.js), end to end on a local server with ?sw=1: installed, the
// second visit served from the phone, an offline reload and an offline fight, then a new version published: the
// NUEVA VERSIÓN button comes up and a tap switches to it. usage: GAME_ROOT=<game folder> node swtest.mjs (playwright)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
let served = 0, bumped = false;
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } served++; if (bumped && p.endsWith('sw.js')) d = Buffer.concat([d, Buffer.from('\n// new version')]); r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r));
const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(base + 'index.html?sw=1&q=low&nodynres=1&norender=1');
await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 180000 });
await p.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 60000 });
// wait for the install to finish (the shell stored)
await p.waitForFunction(async () => { const c = await caches.open('pdb-files'); return (await c.keys()).length > 100; }, null, { timeout: 180000, polling: 1000 });
const n1 = await p.evaluate(async () => (await (await caches.open('pdb-files')).keys()).length);
console.log('cached after install:', n1, 'files');
// second visit: from the phone (count what the server serves), then offline
served = 0;
await p.reload();
await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 180000 });
console.log('reload: controlled =', await p.evaluate(() => !!navigator.serviceWorker.controller), ', files served by the server:', served);
await ctx.setOffline(true);
await p.reload();
await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 180000 });
console.log('offline reload: title reached, errors:', errs.length ? errs.slice(0, 3) : 'none');
// a new version published: the button comes up, a tap switches to it
await ctx.setOffline(false); bumped = true;
await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
await p.waitForSelector('#swUpdate', { timeout: 120000 });
console.log('update button:', await p.textContent('#swUpdate'));
const nav = p.waitForNavigation({ timeout: 120000 });
await p.click('#swUpdate');
await nav;
await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 180000 });
console.log('after update: title again, button gone =', !(await p.$('#swUpdate')));
await ctx.setOffline(true);
// a fight offline (the fighters and stage used before are stored)
await p.evaluate(() => { const g = window.__game; g.mode = 'versus'; g.startFight(g.showcaseIds?.[0] || 'alejandro', g.showcaseIds?.[1] || 'rafa', { human2: false }); });
await p.waitForFunction(() => window.__game.state === 'fight' || window.__game.state === 'overlay', null, { timeout: 240000 });
console.log('offline fight:', await p.evaluate(() => window.__game.state));
await b.close(); srv.close();
