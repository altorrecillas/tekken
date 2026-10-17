// EXTRAS and what unlocks them, in the real game:
//  - a fresh device: no achievements, every ending locked, CABEZONES locked;
//  - the arcade won (from a saved run at its last rival): the results, the champion's ending (typed out, a tap shows
//    it all, another goes on), the champion screen with what it unlocked; achievements announced by a toast;
//  - EXTRAS: the achievement list, the ending in the gallery (played again), CABEZONES on (bigger heads);
//  - the select screen: the champion's costume now in the list, a costume change recolours the fighter; a mirror
//    match in VERSUS dresses the second player differently.
// usage: node extrastest.mjs [outDir]   (playwright next to this file or GAME_ROOT=<game folder>)
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
const URL_ = `http://localhost:${server.address().port}/index.html?q=low&nodynres=1&norender=1`;

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
const title = () => waitFor(() => window.__game?.state === 'title' && !!document.querySelector('#title.on'), null, 180000, 'title');
const t0 = Date.now();
try {
  await p.goto(URL_);
  await title();
  // ---------------------------------------------------------------- a fresh device
  await p.click('#title .menu button[data-act="extras"]');
  const fresh = await p.evaluate(() => ({ heads: document.querySelector('#title .menu.extras button[data-act="bighead"]').textContent, endings: document.querySelector('#title .menu.extras button[data-act="endings"]').textContent }));
  check(/🔒/.test(fresh.heads) && /0 \//.test(fresh.endings), `a fresh device: "${fresh.heads.trim()}", "${fresh.endings.trim()}"`);
  await p.click('#title .menu.extras button[data-act="achievements"]');
  const achs = await p.evaluate(() => ({ n: document.querySelectorAll('#overlay .ach').length, on: document.querySelectorAll('#overlay .ach.on').length }));
  check(achs.n >= 20 && achs.on === 0, `LOGROS: ${achs.n} achievements, ${achs.on} unlocked`);
  await p.click('#overlay .actions [data-a="ok"]');
  await waitFor(() => window.__game.titleMenu === 'extras', null, 5000, 'extras again');

  // ---------------------------------------------------------------- the arcade won
  // (a run at its last rival; the toasts watched as they come)
  await p.evaluate(() => {
    const g = window.__game, ids = g.roster, p1 = ids[0];
    localStorage.setItem('pdb_save', JSON.stringify({ f: 2, v: 'x', t: Date.now(), arcade: { p1, ladder: ids.filter((x) => x !== p1), stage: ids.length - 2, diff: 'hard', costume: 1 }, fight: null }));
    window.__toasts = [];
    const el = document.querySelector('#achToast');
    new MutationObserver(() => { if (el.classList.contains('on')) window.__toasts.push(el.querySelector('b')?.textContent); }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  await p.goto(URL_);
  await title();
  await p.evaluate(() => {
    window.__toasts = [];
    const el = document.querySelector('#achToast');
    new MutationObserver(() => { if (el.classList.contains('on')) window.__toasts.push(el.querySelector('b')?.textContent); }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  await p.click('#title .menu button[data-act="continue"]');
  await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'intro', null, 120000, 'last fight');
  check(await p.evaluate(() => window.__game.match.fighters[0].ch.costumeIdx === 1), 'the run goes on in the costume it was started with');
  await p.evaluate(() => { const m = window.__game.match; m.startRound(); m.wins[0] = (m.opts.rounds || 2) - 1; m.endRound(0, 'ko'); });
  await waitFor(() => window.__game.state === 'results', null, 180000, 'results of the final');
  check(/CAMPEÓN/.test(await p.evaluate(() => document.querySelector('#overlay .results h3').textContent)), 'the final\'s results: ¡CAMPEÓN DEL BARRIO!');
  await p.click('#overlay .actions button[data-act="champ"]');
  await waitFor(() => window.__game.state === 'ending' && document.querySelector('#ending.on'), null, 120000, 'the ending');
  const end = await p.evaluate(() => ({ ttl: document.querySelector('#ending .ttl').textContent, who: document.querySelector('#ending .who').textContent, cam: window.__game.camCtl.mode }));
  check(!!end.ttl && /FINAL DE/.test(end.who) && end.cam === 'ending', `the ending: "${end.who}: ${end.ttl}" (camera ${end.cam})`);
  await p.waitForTimeout(1200);
  const partial = await p.evaluate(() => document.querySelector('#ending .txt').textContent.length);
  await p.mouse.click(450, 250);
  await p.waitForTimeout(300);
  const full = await p.evaluate(() => ({ len: document.querySelector('#ending .txt').textContent.length, done: document.querySelector('#ending').classList.contains('done') }));
  check(full.done && full.len > partial, `typed out (${partial} characters after 1.2 s), a tap shows it all (${full.len})`);
  await p.screenshot({ path: path.join(OUT, 'ending.png') });
  await p.mouse.click(450, 250);
  await waitFor(() => !!document.querySelector('#overlay.on .unlocks'), null, 20000, 'champion screen');
  const un = await p.evaluate(() => [...document.querySelectorAll('#overlay .unlocks li')].map((li) => li.textContent));
  check(un.length === 3, `champion screen with what it unlocked: ${un.join(' · ')}`);
  const prog = await p.evaluate(() => { const d = window.__game.progress.d, id = window.__game.roster[0]; return { champ: !!d.champ[id], end: !!d.endings[id], heads: d.bigHeadUnlocked, ach: Object.keys(d.ach) }; });
  check(prog.champ && prog.end && prog.heads && ['arcade', 'arcadeHard', 'firstWin'].every((a) => prog.ach.includes(a)), `unlocked: champion's costume, ending, CABEZONES; achievements ${prog.ach.join(', ')}`);
  await p.click('#overlay .actions [data-a="ok"]');
  await title();

  // ---------------------------------------------------------------- EXTRAS again
  await p.click('#title .menu button[data-act="extras"]');
  await p.click('#title .menu.extras button[data-act="endings"]');
  check(await p.evaluate(() => document.querySelectorAll('#overlay .endc.on').length === 1), 'FINALES: the ending unlocked can be watched');
  await p.click('#overlay .endc.on');
  await waitFor(() => window.__game.state === 'ending', null, 60000, 'ending from the gallery');
  await p.waitForTimeout(500);
  await p.mouse.click(450, 250); await p.waitForTimeout(300); await p.mouse.click(450, 250);
  await waitFor(() => window.__game.state === 'title' && window.__game.titleMenu === 'extras', null, 120000, 'back to EXTRAS');
  check(true, 'and back to EXTRAS');
  await p.click('#title .menu.extras button[data-act="bighead"]');
  await waitFor(() => window.__game.match?.fighters?.[0]?.ch?.bones?.head?.scale.x > 1.5, null, 60000, 'big heads');
  check(/SÍ/.test(await p.evaluate(() => document.querySelector('#title .menu.extras button[data-act="bighead"]').textContent)), 'CABEZONES: SÍ (the title fighters with big heads)');
  await p.click('#title .menu.extras button[data-act="bighead"]');
  await p.click('#title .menu.extras button[data-act="back"]');

  // ---------------------------------------------------------------- costumes at the select screen
  await p.click('#title .menu button[data-act="arcade"]');
  await waitFor(() => window.__game.state === 'select' && window.__game.match, null, 30000, 'select');
  const cos0 = await p.evaluate(() => document.querySelector('#select .left .cos')?.textContent.replace(/\s+/g, ' ').trim());
  await p.keyboard.press('KeyE'); await p.waitForTimeout(300);
  await p.keyboard.press('KeyE'); await p.waitForTimeout(300);
  const cos2 = await p.evaluate(() => ({ txt: document.querySelector('#select .left .cos').textContent.replace(/\s+/g, ' ').trim(), mode: Object.values(window.__game.match.fighters[0].ch.meshes).map((m) => m.material?.userData?.costume?.mode.value).filter((v) => v !== undefined) }));
  check(/TRAJE/.test(cos0) && /1\/3/.test(cos0), `costume row: "${cos0}" (the champion's costume unlocked: three to choose from)`);
  check(/CAMPEÓN/.test(cos2.txt) && cos2.mode.some((v) => v > 0), `Q / E: "${cos2.txt}", the garments recoloured (modes ${cos2.mode.join(',')})`);
  await p.click('#selBack');
  await title();
  // a mirror match: the second player in another costume
  await p.evaluate(() => { window.__game.mode = 'versus'; window.__game.toSelect(); const s = window.__game.sel; s.i = [0, 0]; s.c = [0, 0]; window.__game.refreshSel(); });
  const mir = await p.evaluate(() => window.__game.selCostumes());
  check(mir[0] !== mir[1], `a mirror match: costumes ${mir.join(' and ')}`);
  // (the toasts come one after another, four seconds each)
  await waitFor(() => window.__toasts.length >= 3, null, 30000, 'toasts');
  check(true, `toasts announced the achievements: ${(await p.evaluate(() => window.__toasts)).join(' · ')}`);
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await p.screenshot({ path: path.join(OUT, 'extras_fail.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `EXTRAS OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'EXTRAS FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
