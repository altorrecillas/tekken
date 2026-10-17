// The end of a local fight, in the real game:
//  - an arcade fight played out (both fighters CPU players, quick knockouts) ends on the results screen: who won,
//    both fighters' tallies, the play of the match and what next;
//  - VER JUGADA shows the play again in slow motion and comes back to the results; the replay comes out exactly as
//    the fight was played (health and position of both fighters compared frame by frame);
//  - SIGUIENTE COMBATE goes on to the next rival.
// usage: node resultstest.mjs [outDir]   (playwright next to this file or GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || '.');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/index.html?q=low&nodynres=1&norender=1&hp=0.3`;

let ok = true;
const errors = [];
const check = (c, what) => { console.log((c ? '  ok   ' : '  FAIL ') + what); if (!c) ok = false; };
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 500 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + e.stack));
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const waitFor = async (fn, arg, ms = 120000, what = 'condition') => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(200); }
  throw new Error('timeout: ' + what);
};
const t0 = Date.now();
try {
  await p.goto(URL_);
  await waitFor(() => window.__game?.state === 'title' && !!document.querySelector('#title.on'), null, 180000, 'title');
  await p.click('#title .menu button[data-act="arcade"]');
  await waitFor(() => window.__game.state === 'select', null, 20000, 'select');
  await p.keyboard.press('KeyU');
  await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'intro', null, 120000, 'arcade fight');
  // the player's fighter becomes a CPU player too (through the recorder, like the real controls); every frame's
  // health and position are noted to be compared with the replay
  await p.evaluate(async () => {
    const { AIController } = await import('./js/fight/ai.js');
    const g = window.__game, m = g.match;
    const ai = new AIController(5); ai.attach(m.fighters[0], m);
    m.fighters[0].ctrl = g.rec.wrap(ai, 0);
    const log = (window.__fightLog = {});
    const step = m.step.bind(m);
    m.step = () => { step(); log[m.frame] = m.fighters.map((f) => `${f.hp}:${f.pos.x.toFixed(5)}:${f.pos.z.toFixed(5)}:${f.state}`).join('|'); };
  });
  check(await p.evaluate(() => window.__game.match.det === true), 'arcade fights are deterministic (det) and recorded');
  await waitFor(() => window.__game.state === 'results', null, 600000, 'results screen');
  const res = await p.evaluate(() => {
    const g = window.__game, m = g.match;
    return { rows: document.querySelectorAll('#overlay .rs-stats tr').length, title: document.querySelector('#overlay .results h3')?.textContent,
      play: document.querySelector('#overlay .rs-play b')?.textContent || null, btns: [...document.querySelectorAll('#overlay .actions button')].map((x) => x.dataset.act),
      stats: m.stats, best: m.best, winner: m.winner };
  });
  check(res.rows === 8, `results: "${res.title}", ${res.rows} rows of tallies`);
  check(res.stats[0].hits + res.stats[1].hits > 0 && res.stats[res.winner].dmg > 0, `tallies: ${JSON.stringify(res.stats)}`);
  check(!!res.play && res.btns.includes('hl'), `the play of the match: "${res.play}" (score ${res.best.score}, frames ${res.best.f0}-${res.best.f1})`);
  await p.screenshot({ path: path.join(OUT, 'results.png') });

  // ---------------------------------------------------------------- VER JUGADA
  await p.evaluate(() => {
    document.querySelector('#overlay .actions button[data-act="hl"]').click();
    const g = window.__game, m = g.hl.m, log = (window.__hlLog = {});
    const step = m.step.bind(m);
    m.step = () => { step(); log[m.frame] = m.fighters.map((f) => `${f.hp}:${f.pos.x.toFixed(5)}:${f.pos.z.toFixed(5)}:${f.state}`).join('|'); };
  });
  await waitFor(() => window.__game.state === 'highlight' && window.__game.hl?.phase === 'play', null, 30000, 'highlight playing');
  check(await p.evaluate(() => document.querySelector('#hlTag').classList.contains('on')), `the banner: "${await p.evaluate(() => document.querySelector('#hlTag b').textContent)}"`);
  await waitFor(() => window.__game.state === 'results', null, 180000, 'back to the results');
  const cmp = await p.evaluate(() => {
    const a = window.__fightLog, h = window.__hlLog;
    let same = 0, diff = 0, first = null;
    for (const k of Object.keys(h)) { if (!(k in a)) continue; if (a[k] === h[k]) same++; else { diff++; first ??= { k, fight: a[k], replay: h[k] }; } }
    return { same, diff, first, n: Object.keys(h).length };
  });
  check(cmp.same > 30 && cmp.diff === 0, `the replay is the fight to the frame: ${cmp.same} frames identical, ${cmp.diff} different${cmp.first ? ' ' + JSON.stringify(cmp.first) : ''}`);
  check(await p.evaluate(() => !!document.querySelector('#overlay.on .results')), 'and the results are back');

  // ---------------------------------------------------------------- next rival
  const next = await p.evaluate(() => [...document.querySelectorAll('#overlay .actions button')].map((x) => x.dataset.act)[0]);
  await p.click(`#overlay .actions button[data-act="${next}"]`);
  if (next === 'next') {
    await waitFor(() => window.__game.state === 'fight' && window.__game.arcade.stage === 1 && window.__game.match?.phase === 'intro', null, 180000, 'next fight');
    check(true, 'SIGUIENTE COMBATE: the next rival');
  } else {
    await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'intro', null, 180000, 'rematch');
    check(true, 'REVANCHA (the CPU player lost the first fight): the same rival again');
  }
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await p.screenshot({ path: path.join(OUT, 'results_fail.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `RESULTS OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'RESULTS FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
