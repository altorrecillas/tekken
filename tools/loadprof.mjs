// First load of the game on a throttled network (a phone on WiFi by default): when the loading screen shows its text,
// when the title can be used, how much was downloaded before it, the boot phases (window.__bootTimes) and the files
// that weigh most. Software rendering here makes the GPU work (texture uploads, shaders) much slower than on a phone.
// usage: node loadprof.mjs [Mbps=20] [latency ms=40]   (playwright next to this file or GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path'; import zlib from 'zlib';
import { fileURLToPath } from 'url';
const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), MBPS = +(process.argv[2] || 20), RTT = +(process.argv[3] || 40);
const T = { '.js': 'text/javascript', '.html': 'text/html', '.mp3': 'audio/mpeg', '.json': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.gz': 'application/gzip', '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };
// like GitHub Pages: text files gzip-compressed on the fly
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } const ext = path.extname(f); const h = { 'Content-Type': T[ext] || 'application/octet-stream' }; if (['.js', '.html', '.json', '.css', '.ttf', '.webmanifest'].includes(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) { d = zlib.gzipSync(d); h['Content-Encoding'] = 'gzip'; } h['Content-Length'] = d.length; res.writeHead(200, h); res.end(d); }); });
await new Promise((r) => server.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 500 } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: RTT, downloadThroughput: MBPS * 125000, uploadThroughput: 4 * 125000 });
const res = new Map(); let bytes = 0;
cdp.on('Network.responseReceived', (e) => res.set(e.requestId, { url: e.response.url.replace(/^http:\/\/localhost:\d+\//, ''), t: Date.now() }));
cdp.on('Network.loadingFinished', (e) => { const r = res.get(e.requestId); if (r) { r.size = e.encodedDataLength; r.done = Date.now(); bytes += e.encodedDataLength; } });
const t0 = Date.now();
await p.goto(`http://localhost:${server.address().port}/index.html?q=medium`, { waitUntil: 'commit' });
const mark = {};
for (let i = 0; i < 3000; i++) {
  const s = await p.evaluate(() => ({
    logo: (() => { const el = document.querySelector('#loading .logo'); return !!el && document.fonts && [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Bebas' && f.status === 'loaded'); })(),
    bar: parseFloat(document.querySelector('#loading .bar i')?.style.width || '0'),
    title: window.__game?.state === 'title' && !!document.querySelector('#title.on') && !document.querySelector('#loading.on'),
    fighters: (window.__game?.match?.fighters || []).length,
  })).catch(() => ({}));
  const t = ((Date.now() - t0) / 1000).toFixed(1);
  if (s.logo && !mark.logo) mark.logo = t;
  if (s.bar > 0 && !mark.bar) mark.bar = t;
  if (s.title && !mark.title) { mark.title = t; mark.bytesAtTitle = (bytes / 1048576).toFixed(1); }
  if (s.title && s.fighters >= 2 && !mark.fighters) mark.fighters = t;
  if (mark.title && mark.fighters) break;
  await p.waitForTimeout(100);
}
const bt = await p.evaluate(() => window.__bootTimes).catch(() => null); console.log("boot phases (ms from main.js start):", JSON.stringify(bt)); console.log(`network ${MBPS} Mbps, ${RTT} ms: logo text visible ${mark.logo}s, bar moves ${mark.bar}s, title usable ${mark.title}s (${mark.bytesAtTitle} MB downloaded), showcase fighters ${mark.fighters}s`);
const list = [...res.values()].filter((r) => r.size).sort((a, b) => b.size - a.size).slice(0, 18);
for (const r of list) console.log(`  ${(r.size / 1024).toFixed(0).padStart(6)} KB  done ${((r.done - t0) / 1000).toFixed(1)}s  ${r.url}`);
console.log('requests', res.size, 'total', (bytes / 1048576).toFixed(1), 'MB');
await b.close(); server.close();
