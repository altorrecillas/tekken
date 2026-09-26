// Render cost of a fight frame at a given quality: draw calls / triangles of the scene pass and of the whole
// frame (post chain included), texture count and estimated texture memory (with mipmaps).
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise(r => srv.on('listening', r)); const PORT = srv.address().port;
const [qual = 'medium', stage = 'street', extra = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto(`http://127.0.0.1:${PORT}/index.html?demo=1&p1=rafa&p2=alejandro&simonly=400&q=${qual}&nodynres=1&stage=${stage}${extra}`, { timeout: 240000 });
await p.waitForFunction('window.__ready===true', null, { timeout: 900000, polling: 500 });
const res = await p.evaluate(async () => {
  const g = window.__game, r = g.renderer;
  r.info.autoReset = false; r.info.reset();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const frame = { calls: r.info.render.calls, tris: r.info.render.triangles };
  r.info.reset(); r.render(g.scene, g.camera);
  const scene = { calls: r.info.render.calls, tris: r.info.render.triangles };
  r.info.autoReset = true;
  const texs = new Set();
  g.scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { for (const k in m) if (m[k] && m[k].isTexture) texs.add(m[k]); if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) texs.add(u.value); } });
  let bytes = 0, big = 0;
  for (const t of texs) { const im = t.image; if (!im) continue; const w = im.width || im.videoWidth || 0, h = im.height || 0; bytes += w * h * 4 * 1.33; if (Math.max(w, h) > 1024) big++; }
  const cv = r.domElement;
  return { frame, scene, textures: texs.size, texMB: +(bytes / 1e6).toFixed(0), over1024: big, pr: r.getPixelRatio(), buffer: cv.width + 'x' + cv.height, mem: r.info.memory, dpr: devicePixelRatio, quality: g.quality };
});
console.log(qual, stage, extra, JSON.stringify(res));
await b.close(); srv.close();
