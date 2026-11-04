// The PUÑETALITY in the real game: a fight won by Noemí's player, the button on the win screen (shown to the winner,
// with its countdown), a real click on it, the whole move played (the sword out, the loser cut in two, his halves on
// the floor, the title), then the results, the achievement unlocked, and no errors (shaders included). Then the
// other way round: a CPU Noemí who wins gets no button. Screenshots at a few moments (fatal_*.png).
// usage: node fataltest.mjs [outDir] [--fighter camilo] [--cpu]   (playwright next to this file or GAME_ROOT=<game>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv.slice(2).find((a, i, A) => !a.startsWith('--') && A[i - 1] !== '--fighter') || '.');
const CPU_ONLY = process.argv.includes('--cpu');  // (only the CPU winner's part)
// (--fighter camilo: his move instead of Noemí's)
const WHO = process.argv.includes('--fighter') ? process.argv[process.argv.indexOf('--fighter') + 1] : 'noemi';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/index.html?q=low&nodynres=1`;

let ok = true;
const errors = [];
const check = (c, what) => { console.log((c ? '  ok   ' : '  FAIL ') + what); if (!c) ok = false; };
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + e.stack));
p.on('console', (m) => { if ((m.type() === 'error' || /Shader Error|not patched/.test(m.text())) && !/404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 400)); });
const waitFor = async (fn, arg, ms = 120000, what = 'condition') => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(100); }
  throw new Error('timeout: ' + what);
};
// a fight between a and b won at once by fighter `winner` (0 or 1); human2: player 2 is a person
const winFight = async (a, bId, winner, human2) => {
  await p.evaluate(([a, bId, human2]) => { const g = window.__game; g.mode = 'versus'; g.startFight(a, bId, { human2 }); }, [a, bId, human2]);
  await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'intro', null, 120000, 'fight');
  await p.evaluate((w) => { const m = window.__game.match; m.startRound(); m.wins[w] = (m.opts.rounds || 2) - 1; m.endRound(w, 'ko'); }, winner);
  await waitFor(() => window.__game.match.phase === 'matchEnd', null, 60000, 'win screen');
};
const t0 = Date.now();
try {
  await p.goto(URL_);
  await waitFor(() => window.__game?.state === 'title' && !!document.querySelector('#title.on') && window.__bootTimes?.roster != null && !window.__game.entrance, null, 300000, 'title');
  await p.click('#title [data-act="arcade"]', { force: true, timeout: 90000 });
  await waitFor(() => window.__game.state === 'select', null, 30000, 'select');
  await p.evaluate(() => { try { const k = 'pdb_progress'; const d = JSON.parse(localStorage.getItem(k) || '{}'); if (d.ach) delete d.ach.punetality; localStorage.setItem(k, JSON.stringify(d)); window.__game.progress.d.ach && delete window.__game.progress.d.ach.punetality; } catch (e) { /* none */ } });

  // ---------------------------------------------------------------- Noemí's player wins: the button, a click, the move
  if (!CPU_ONLY) {
  await winFight(WHO, WHO === 'camilo' ? 'rafa' : 'camilo', 0, false);
  await waitFor(() => document.querySelector('#fatalBtn.on'), null, 30000, 'the PUÑETALITY button');
  const bar0 = await p.evaluate(() => document.querySelector('#fatalBtn .bar i').style.transform);
  await p.waitForTimeout(800);
  const bar1 = await p.evaluate(() => document.querySelector('#fatalBtn .bar i').style.transform);
  check(bar0 !== bar1, `the button is on the win screen with its countdown (${bar0} → ${bar1})`);
  // (a real click; the software renderer takes its time to get round to it)
  await p.click('#fatalBtn', { timeout: 120000, noWaitAfter: true });
  await waitFor(() => window.__game.match.phase === 'fatal', null, 10000, 'the move starting');
  check(true, 'a click on the button starts the move');
  check(await p.evaluate(() => !document.querySelector('#fatalBtn.on')), 'the button goes away');
  const F = await p.evaluate(() => { const s = window.__game.match.fighters[0].style.fatal; return { cut: s.cut, title: s.title, len: s.len }; });
  const at = async (f, name) => {
    await waitFor((f) => window.__game.match.pt >= f || window.__game.state === 'results', f, 240000, 'frame ' + f);
    await p.screenshot({ path: path.join(OUT, `fatal_${WHO}_${name}.png`) });
  };
  if (WHO === 'camilo') {
    await at(70, 'dumbbells');
    check(await p.evaluate(() => { const f = window.__game.fatal; return !!f.db && f.db.L.visible && f.db.R.visible; }), 'the dumbbells are out, one in each hand');
    await at(F.cut + 12, 'crush');
    const cr = await p.evaluate(() => { const f = window.__game.fatal; return { sy: +f.crush.sy.toFixed(2), drops: f.blood.drops.length }; });
    check(cr.sy < 0.5, `the loser's head is crushed under them (to ${cr.sy} of its height), ${cr.drops} drops of blood in the air`);
    await at(320, 'after');
    const af = await p.evaluate(() => { const g = window.__game, f = g.fatal, L = g.match.fighters[1], h = L.ch.bones.head.getWorldPosition(new (L.pos.constructor)()); return { head: +h.y.toFixed(2), loose: f.loose.length, phone: !!g.match.fighters[0].ch.winProp?.visible }; });
    check(af.head < 0.35 && af.loose === 2 && af.phone, `the body has folded to the floor (head at ${af.head} m), the dumbbells dropped (${af.loose}), his phone out (${af.phone})`);
  } else {
  await at(70, 'sword');
  check(await p.evaluate(() => { const f = window.__game.fatal; return !!f.sw && f.sw.group.visible && f.sw.U.grow.value > 0.99; }), 'the aloe vera sword is out in her hand');
  await at(F.cut + 20, 'cut');
  check(await p.evaluate(() => { const f = window.__game.fatal; return f.split.cut && window.__game.match.fighters[1].drawnBy === f.split; }), 'the loser is cut in two (drawn as two halves)');
  await at(330, 'halves');
  const fell = await p.evaluate(() => { const P = window.__game.fatal.split.P; return { chest: +P.chest.p.y.toFixed(2), hips: +P.pelvis.p.y.toFixed(2), drops: window.__game.fatal.blood.drops.length }; });
  check(fell.chest < 0.35 && fell.hips < 0.35, `both halves are on the floor (chest ${fell.chest} m, hips ${fell.hips} m), ${fell.drops} drops of blood in the air`);
  }
  await at(F.title + 40, 'title');
  check(await p.evaluate(() => !!document.querySelector('#fatalTitle.on')), 'its name is up: PUÑETALITY');
  await waitFor(() => window.__game.state === 'results', null, 240000, 'results');
  check(true, 'the results come after it');
  check(await p.evaluate(() => !!window.__game.progress.d.ach.punetality), 'the achievement ¡PUÑETALITY! is unlocked');
  await p.screenshot({ path: path.join(OUT, 'fatal_results.png') });
  await p.evaluate(() => { document.querySelector('#overlay').classList.remove('on'); window.__game.backToTitle?.(); });
  await waitFor(() => window.__game.state === 'title', null, 60000, 'title again');
  check(await p.evaluate(() => !window.__game.fatal.m && !document.querySelector('#lensBlood.on')), 'back at the title, all of it is gone');
  }

  // ---------------------------------------------------------------- a CPU Noemí wins: no button
  if (await p.evaluate(() => window.__game.state === 'title')) {
    await p.click('#title [data-act="arcade"]', { force: true, timeout: 90000 });
    await waitFor(() => window.__game.state === 'select', null, 30000, 'select');
  }
  await winFight('camilo', 'noemi', 1, false);
  await waitFor(() => window.__game.match.pt > 60, null, 120000, 'the CPU win screen going on');
  const cpu = await p.evaluate(() => ({ pt: window.__game.match.pt, on: !!document.querySelector('#fatalBtn.on'), humans: window.__game.match.humans }));
  check(!cpu.on, `a CPU winner gets no button (frame ${cpu.pt} of the win screen, people ${JSON.stringify(cpu.humans)})`);
  await waitFor(() => window.__game.state === 'results', null, 400000, 'results (CPU)');
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await p.screenshot({ path: path.join(OUT, 'fataltest_fail.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `PUÑETALITY OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'PUÑETALITY FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
