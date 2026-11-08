// KTX2 in the real game: a fight's presentation with the fighters' textures GPU-compressed (assets/ktx2.json) and
// the same one with the pictures (?ktx2=0). For each: how many of the fighters' textures are compressed, the graphics
// memory they take (compressed: the transcoded mip levels; pictures: 4 bytes a pixel and a third more for the mips),
// page errors, and a close-up of the first fighter's face in the presentation to compare.
// usage: node ktx2test.mjs [outDir] [p1] [p2]   (from a folder with playwright; GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const [out = '.', p1 = 'aleix', p2 = 'noemi'] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const PORT = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const res = {};
for (const ktx of [1, 0]) {
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); if (/KTX2/.test(m.text())) console.log('  console:', m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&p1=${p1}&p2=${p2}&q=high&nodynres=1&readyon=intro&readyat=75&ktx2=${ktx}`);
  await p.waitForFunction('window.__ready === true', null, { timeout: 900000, polling: 500 });
  const r = await p.evaluate(() => {
    const g = window.__game, seen = new Set(); let comp = 0, img = 0, nc = 0, ni = 0;
    for (const f of g.match.fighters) f.ch.group.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) {
        const t = m[k]; if (!t || seen.has(t)) continue; seen.add(t);
        if (t.isCompressedTexture) { nc++; comp += t.mipmaps.reduce((a, q) => a + q.data.byteLength, 0); }
        else if (t.image) { ni++; const w = t.image.width || t.image.naturalWidth || 0, h = t.image.height || t.image.naturalHeight || 0; img += w * h * 4 * 4 / 3; }
      }
    });
    return { ktx2: g.ktx2On, compressed: nc, pictures: ni, MB: +((comp + img) / 1e6).toFixed(1) };
  });
  res[ktx] = r;
  console.log(`${ktx ? 'KTX2   ' : 'pictures'}: ${JSON.stringify(r)} errors ${errs.length ? errs.join(' | ') : 'none'}`);
  if (errs.length) fails++;
  await p.screenshot({ timeout: 300000, path: path.join(out, `ktx2_${ktx ? 'on' : 'off'}.png`) });
  await p.close();
}
const ok = res[1].ktx2 && res[1].compressed > 0 && res[1].MB < res[0].MB * 0.5;
console.log(ok ? `KTX2 OK: ${res[0].MB} MB of textures -> ${res[1].MB} MB` : 'KTX2 FAIL');
if (!ok) fails++;
await b.close(); srv.close();
process.exit(fails ? 1 : 0);
