// The themed costumes (js/fight/costumes.js outfit, assets/chars/<id>/<outfit>/), in the real game: for each one, a
// fight started in it and the select screen's preview switched to it and back. Checks that the costume's own
// garments are the ones built (their parts there, the ones it takes off gone, the body showing what the costume
// leaves bare), that the other costumes still show the fighter's own clothes, and that nothing failed to load.
// usage: node costumetest.mjs   (playwright next to this file or GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webp': 'image/webp',
  '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(0, r));
let ok = true;
const errors = [];
const check = (c, what) => { console.log((c ? '  ok   ' : '  FAIL ') + what); if (!c) ok = false; };
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 900, height: 500 } })).newPage();
p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
p.on('response', (r) => { if (r.status() >= 400 && /assets\/chars\//.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
const waitFor = async (fn, arg, ms = 180000, what = 'condition') => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(250); }
  throw new Error('timeout: ' + what);
};
try {
  await p.goto(`http://localhost:${server.address().port}/index.html?q=low&nodynres=1&norender=1`);
  await waitFor(() => window.__game?.state === 'title', null, 180000, 'title');
  const list = await p.evaluate(async () => {
    const { COSTUMES } = await import('./js/fight/costumes.js');
    return Object.entries(COSTUMES).flatMap(([id, cs]) => cs.map((c, i) => ({ id, i, name: c.name, outfit: c.outfit || null })).filter((c) => c.outfit));
  });
  check(list.length >= 3, `themed costumes: ${list.map((c) => `${c.id} ${c.name}`).join(', ')}`);
  for (const c of list) {
    const want = await (await fetch(`http://localhost:${server.address().port}/assets/chars/${c.id}/${c.outfit}/mesh.json`)).json();
    const own = want.parts.filter((x) => !x.bodyIndex).map((x) => x.name);
    // a fight in it
    await p.evaluate(({ id, i }) => { const g = window.__game; g.mode = 'versus'; g.startFight(id, g.roster.find((x) => x !== id), { training: true, costumes: [i, 0] }); }, c);
    await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'fight', null, 180000, 'fight ' + c.id);
    const r = await p.evaluate(({ own, hide }) => {
      const ch = window.__game.match.fighters[0].ch, names = Object.keys(ch.meshes);
      return { names, has: own.every((n) => names.includes(n)), gone: hide.every((n) => !names.includes(n)), body: ch.meshes.body.geometry.index.count / 3 };
    }, { own, hide: want.hide || [] });
    const bodyTris = want.parts.find((x) => x.bodyIndex).index.n / 3;
    check(r.has && r.gone, `${c.id} ${c.name}: in the fight with ${own.join(', ')}${(want.hide || []).length ? `, without ${want.hide.join(', ')}` : ''}`);
    check(r.body === bodyTris, `${c.id} ${c.name}: the body shows what the costume leaves bare (${r.body} triangles, ${bodyTris} built)`);
    // the select screen's preview: into the costume and back to the first one
    await p.evaluate(() => window.__game.backToTitle());
    await waitFor(() => window.__game.state === 'title', null, 120000, 'title again');
    const pv = await p.evaluate(async ({ id, i, own, hide }) => {
      const g = window.__game; g.mode = 'versus'; g.toSelect();
      g.sel.i = [g.roster.indexOf(id), (g.roster.indexOf(id) + 1) % g.roster.length]; g.sel.c = [0, 0]; g.refreshSel();
      const wait = async (f) => { for (let k = 0; k < 400 && !f(); k++) await new Promise((r) => setTimeout(r, 100)); return f(); };
      await wait(() => g.match?.fighters[0]?.id === id);
      const before = Object.keys(g.match.fighters[0].ch.meshes);
      g.sel.c = [i, 0]; g.refreshSel();
      await wait(() => g.match?.fighters[0]?.ch.costumeIdx === i && own.every((n) => g.match.fighters[0].ch.meshes[n]) && hide.every((n) => !g.match.fighters[0].ch.meshes[n]));
      const during = Object.keys(g.match.fighters[0].ch.meshes);
      g.sel.c = [0, 0]; g.refreshSel();
      await wait(() => g.match?.fighters[0]?.ch.costumeIdx === 0 && hide.every((n) => g.match.fighters[0].ch.meshes[n]));
      const after = Object.keys(g.match.fighters[0].ch.meshes);
      g.toTitle();
      return { before, during, after };
    }, { ...c, own, hide: want.hide || [] });
    const hide = want.hide || [];
    check(own.every((n) => pv.during.includes(n)) && hide.every((n) => !pv.during.includes(n)), `${c.id}: the select preview switches into ${c.name}`);
    check(hide.every((n) => pv.after.includes(n)) && pv.after.join() === pv.before.join(), `${c.id}: and back to the fighter's own clothes`);
  }
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? 'COSTUMES OK' : 'COSTUMES FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
