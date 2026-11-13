// KTX2 on the stages, in the real game: every stage built as a fight starts, with its pictures GPU-compressed
// (assets/ktx2.json, tools/ktx2assets.py stage) and with the pictures (?ktx2=0). For each stage: how many of its
// textures are compressed, how many are pictures or drawn by code (canvas), the graphics memory they take
// (compressed: the transcoded mip levels; the rest: 4 bytes a pixel and a third more for the mips), and page errors.
// It fails if a stage that has pictures gets none compressed, or a stage takes more memory with KTX2 than without.
// usage: node stagektx2test.mjs [stages...]   (from a folder with playwright; GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.gz': 'application/gzip' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const PORT = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const stages = process.argv.slice(2).length ? process.argv.slice(2) : ['porche', 'terrace', 'street', 'festival', 'neon', 'pc', 'gym'];
let fails = 0;
for (const st of stages) {
  const res = {};
  for (const ktx of [1, 0]) {
    const p = await b.newPage({ viewport: { width: 640, height: 360 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&p1=alejandro&p2=rafa&stage=${st}&q=high&nodynres=1&norender=1&ktx2=${ktx}`);
    await p.waitForFunction(() => window.__game?.state === 'fight' && window.__game.stage, null, { timeout: 600000, polling: 500 });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const g = window.__game, seen = new Set(); let comp = 0, img = 0, nc = 0, ni = 0, nCanvas = 0;
      g.stage.group.traverse((o) => {
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'alphaMap', 'emissiveMap', 'metalnessMap']) {
          // (by picture: clones of a texture share it on the graphics card, js/stage/street.js facades)
          const t = m[k]; if (!t || seen.has(t.source || t)) continue; seen.add(t.source || t);
          if (t.isCompressedTexture) { nc++; comp += t.mipmaps.reduce((a, q) => a + q.data.byteLength, 0); }
          else if (t.image) {
            ni++; if (t.image instanceof HTMLCanvasElement) nCanvas++;
            const w = t.image.width || t.image.naturalWidth || 0, h = t.image.height || t.image.naturalHeight || 0;
            img += w * h * 4 * (t.generateMipmaps === false ? 1 : 4 / 3);
          }
        }
      });
      return { ktx2: g.ktx2On, compressed: nc, other: ni, canvas: nCanvas, MB: +((comp + img) / 1e6).toFixed(1), compMB: +(comp / 1e6).toFixed(1) };
    });
    res[ktx] = { ...r, errs };
    await p.close();
  }
  const pictures = res[0].other - res[0].canvas;
  const ok = !res[1].errs.length && !res[0].errs.length && (pictures === 0 || res[1].compressed > 0) && res[1].MB <= res[0].MB + 0.05;
  if (!ok) fails++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${st.padEnd(9)} pictures ${String(pictures).padStart(2)}  drawn ${String(res[0].canvas).padStart(2)}  `
    + `${res[0].MB} MB -> ${res[1].MB} MB (${res[1].compressed} compressed, ${res[1].compMB} MB)${res[1].errs.length || res[0].errs.length ? '  errors: ' + [...res[1].errs, ...res[0].errs].join(' | ') : ''}`);
}
console.log(fails ? 'STAGE KTX2 FAIL' : 'STAGE KTX2 OK');
await b.close(); srv.close();
process.exit(fails ? 1 : 0);
