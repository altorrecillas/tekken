// A PUÑETALITY frame by frame (?fatalnow=1): the move's frame, the shader programs built so far and each drawn frame's
// time. A new program after the black start (its first 12 frames) is a hitch in the move: the graphics card building
// a shader the moment something appears (Alejandro's whirlwind stopped dead two seconds in, 16 programs at once; the
// warm-up in js/fight/fatality.js draw builds them behind the black). Software GL: the times are slow, the programs tell.
// usage: node fatalprof.mjs [p1] [p2] [quality]   (EXTRA='&fatalwarm=0' to measure without the warm-up; playwright
//        next to this file or GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, ''), [p1 = 'alejandro', p2 = 'rafa', q = 'low'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.gz': 'application/gzip' };
const srv = http.createServer((qq, r) => { const p = path.join(root, decodeURIComponent(qq.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r));
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/index.html?demo=1&p1=${p1}&p2=${p2}&fatalnow=1&q=${q}&nodynres=1${process.env.EXTRA || ""}`);
await p.waitForFunction(() => window.__game?.match?.phase === 'fatal', null, { timeout: 900000, polling: 200 });
await p.evaluate((stop) => {
  window.__stopAt = stop;
  const g = window.__game, L = (window.__log = []);
  // (and the new programs' names after the black start: which material, and its program key's start)
  const known = new Set((g.renderer.info.programs || []).map((x) => x.id)); window.__newProg = [];
  const tick = () => {
    const m = g.match, ps = g.renderer.info.programs || [];
    L.push([m?.pt ?? -1, ps.length, performance.now()]);
    for (const x of ps) if (!known.has(x.id)) {
      known.add(x.id);
      if ((m?.pt ?? 0) < 12) continue;
      // (who uses it: the objects whose material was drawn with this program)
      const users = [];
      g.scene.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const mt of ms) if (g.renderer.properties.get(mt).currentProgram === x) {
          let chain = '', q = o.parent; for (let k = 0; k < 3 && q; k++, q = q.parent) chain += '<' + (q.name || q.type);
          const wp = o.getWorldPosition(new o.position.constructor());
          users.push(`${o.name || o.type}(${o.geometry?.type || ''})${chain}:${mt.type}${mt.transparent ? '/t' : ''}${mt.map ? '+map' : ''} @${wp.x.toFixed(1)},${wp.y.toFixed(1)},${wp.z.toFixed(1)}`);
        } });
      window.__newProg.push(`pt ${m.pt}: ${x.name} [${[...new Set(users)].slice(0, 5).join(', ') || 'a depth or shadow pass'}]`);
    }
    if (m?.phase === 'fatal' && m.pt < (+window.__stopAt || 480)) requestAnimationFrame(tick); else window.__done = true;
  };
  requestAnimationFrame(tick);
}, +(process.env.STOP || 480));
await p.waitForFunction(() => window.__done, null, { timeout: 2400000, polling: 1000 });
const log = await p.evaluate(() => window.__log);
let prev = null;
for (const [pt, n, at] of log) {
  if (prev && (n !== prev[1] || at - prev[2] > 400)) console.log(`pt ${pt}: programs ${prev[1]} -> ${n}, frame ${Math.round(at - prev[2])} ms`);
  prev = [pt, n, at];
}
for (const x of await p.evaluate(() => window.__newProg)) console.log('  new program ' + x);
const dts = log.slice(1).map((x, i) => x[2] - log[i][2]).sort((a, c) => a - c);
console.log('frames', log.length, 'median ms', Math.round(dts[dts.length >> 1]), 'programs at end', log.at(-1)[1]);
await b.close(); srv.close();
