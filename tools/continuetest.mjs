// CONTINUAR (arcade run kept on the device), in the real game:
//  - a fresh device shows no CONTINUAR;
//  - an arcade fight under way, the game sent to the background (another app, the phone locked) and the page closed:
//    the title offers CONTINUAR with the fighter and the rung of the ladder, and the fight comes back exactly where it
//    was (health, positions, clock, round, rival), stands still for the 3-2-1 and then goes on;
//  - the run saves itself every few seconds of fight;
//  - GUARDAR Y SALIR from the pause keeps it (also if the game then goes to the background at the title); a fight won
//    moves CONTINUAR to the next rival;
//  - winning the last fight (champion) clears it.
// usage: node continuetest.mjs [outDir]   (playwright next to this file or GAME_ROOT=<game folder>)
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
const ctx = await b.newContext({ viewport: { width: 760, height: 400 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + e.stack));
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const waitFor = async (fn, arg, ms = 120000, what = 'condition') => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(200); }
  throw new Error('timeout: ' + what);
};
const title = async () => { await waitFor(() => window.__game?.state === 'title' && !!document.querySelector('#title.on'), null, 180000, 'title'); };
const contBtn = () => p.evaluate(() => { const b = document.querySelector('#title .menu button[data-act="continue"]'); return b && !b.hidden ? b.textContent.replace(/\s+/g, ' ').trim() : null; });
// the fight as it stands (what must come back)
const state = () => p.evaluate(() => {
  const g = window.__game, m = g.match;
  return { phase: m.phase, frame: m.frame, round: m.round, wins: m.wins.slice(), timer: m.timer, ids: m.fighters.map((f) => f.id),
    hp: m.fighters.map((f) => f.hp), pos: m.fighters.map((f) => [f.pos.x, f.pos.z].map((v) => +v.toFixed(6))), st: m.fighters.map((f) => f.state), stage: g.arcade && g.arcade.stage };
});
const t0 = Date.now();
try {
  await p.goto(URL_);
  await title();
  check(await contBtn() === null, 'a fresh device: no CONTINUAR on the title');
  const N = await p.evaluate(() => window.__game.roster.length - 1); // (rivals in the ladder)
  const rung = (k) => new RegExp(`${k}/${N}`);

  // ---------------------------------------------------------------- an arcade fight under way
  await p.click('#title .menu button[data-act="arcade"]');
  await waitFor(() => window.__game.state === 'select', null, 20000, 'select');
  await p.keyboard.press('KeyU');
  await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'intro', null, 120000, 'arcade fight');
  await p.waitForTimeout(800);
  await p.keyboard.press('KeyU'); // (skips the intro)
  await waitFor(() => window.__game.match.phase === 'fight', null, 60000, 'round 1');
  for (let i = 0; i < 8; i++) { await p.keyboard.down(i % 2 ? 'KeyD' : 'KeyU'); await p.waitForTimeout(160); await p.keyboard.up(i % 2 ? 'KeyD' : 'KeyU'); }
  // (something to recognise it by)
  await p.evaluate(() => { const m = window.__game.match; m.fighters[1].hp -= 37; m.timer = 41; });
  await p.waitForTimeout(300);

  // ---------------------------------------------------------------- the app goes to the background and is closed
  const before = await p.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const g = window.__game, m = g.match;
    return { phase: m.phase, frame: m.frame, round: m.round, wins: m.wins.slice(), timer: m.timer, ids: m.fighters.map((f) => f.id),
      hp: m.fighters.map((f) => f.hp), pos: m.fighters.map((f) => [f.pos.x, f.pos.z].map((v) => +v.toFixed(6))), st: m.fighters.map((f) => f.state), stage: g.arcade.stage, state: g.state };
  });
  check(before.state === 'pause', `sent to the background mid-fight: the fight pauses (frame ${before.frame}, hp ${before.hp})`);
  await p.goto('about:blank'); // (the page is gone)
  await p.goto(URL_);
  await title();
  const lbl = await contBtn();
  check(!!lbl && /CONTINUAR/.test(lbl) && /ARCADE/.test(lbl) && rung(1).test(lbl), `reopened: the title offers "${lbl}"`);
  check(await p.evaluate(() => document.querySelector('#title .menu button.sel')?.dataset.act) === 'continue', 'CONTINUAR comes first and is selected');
  await p.screenshot({ path: path.join(OUT, 'continue_title.png') });

  // ---------------------------------------------------------------- CONTINUAR
  await p.click('#title .menu button[data-act="continue"]');
  await waitFor(() => window.__game.state === 'fight' && window.__game.match && window.__game.resumeT > 0, null, 120000, 'resumed fight');
  const back = await state();
  const same = (k) => JSON.stringify(back[k]) === JSON.stringify(before[k]);
  check(['frame', 'round', 'wins', 'timer', 'ids', 'hp', 'pos', 'st', 'phase', 'stage'].every(same),
    `the fight is back exactly where it was (frame ${back.frame}, hp ${back.hp}, clock ${back.timer}, ${back.ids.join(' vs ')}, positions ${JSON.stringify(back.pos)})`);
  await p.waitForTimeout(1500);
  const still = await state();
  check(still.frame === back.frame, 'it stands still for the 3-2-1');
  await waitFor(() => !(window.__game.resumeT > 0), null, 10000, 'countdown over');
  await p.waitForTimeout(800);
  check((await state()).frame > back.frame, 'then it goes on');
  await p.screenshot({ path: path.join(OUT, 'continue_fight.png') });

  // ---------------------------------------------------------------- it saves itself as the fight goes on
  await p.waitForTimeout(3600);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('pdb_save')));
  const savedFrame = saved && saved.fight ? saved.fight.frame : -1;
  check(savedFrame > back.frame, `saved by itself every few seconds of fight (now at frame ${savedFrame})`);

  // ---------------------------------------------------------------- GUARDAR Y SALIR
  await p.keyboard.press('Escape');
  await waitFor(() => window.__game.state === 'pause', null, 5000, 'pause');
  const quitLbl = await p.evaluate(() => document.querySelector('#pause .menu.local [data-act="quit"]').textContent);
  check(quitLbl === 'GUARDAR Y SALIR', `the arcade pause offers "${quitLbl}"`);
  const atQuit = await state();
  await p.click('#pause .menu.local [data-act="quit"]');
  await title();
  check(rung(1).test(await contBtn() || ''), 'back at the title, CONTINUAR is still there');
  // (the game sent to the background at the title must not overwrite the saved moment)
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  await p.click('#title .menu button[data-act="continue"]');
  await waitFor(() => window.__game.state === 'fight' && window.__game.resumeT > 0, null, 120000, 'resumed again');
  const back2 = await state();
  check(back2.frame === atQuit.frame && JSON.stringify(back2.hp) === JSON.stringify(atQuit.hp), `and goes on from the moment it was left (frame ${back2.frame})`);

  // ---------------------------------------------------------------- a fight won: CONTINUAR moves to the next rival
  await waitFor(() => !(window.__game.resumeT > 0), null, 10000, 'countdown over');
  await p.evaluate(() => { const m = window.__game.match; m.wins[0] = (m.opts.rounds || 2) - 1; m.endRound(0, 'ko'); });
  // (the results screen of the fight: SIGUIENTE COMBATE)
  await waitFor(() => window.__game.state === 'results', null, 180000, 'results');
  await p.click('#overlay .actions button[data-act="next"]');
  await waitFor(() => window.__game.arcade.stage === 1 && window.__game.state === 'fight' && window.__game.match.phase === 'intro', null, 180000, 'next fight');
  const s2 = await p.evaluate(() => JSON.parse(localStorage.getItem('pdb_save')));
  check(s2 && s2.arcade.stage === 1 && s2.fight === null, 'a fight won: the run is saved at the next rival, from its start');
  await p.goto(URL_);
  await title();
  check(rung(2).test(await contBtn() || ''), `reopened: "${await contBtn()}"`);

  // ---------------------------------------------------------------- the last fight won: nothing left to continue
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('pdb_save')); s.arcade.stage = s.arcade.ladder.length - 1; s.fight = null; localStorage.setItem('pdb_save', JSON.stringify(s)); });
  await p.goto(URL_);
  await title();
  check(rung(N).test(await contBtn() || ''), `a run at the last rival: CONTINUAR ${N}/${N}`);
  await p.click('#title .menu button[data-act="continue"]');
  await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'intro', null, 120000, 'last fight');
  await p.evaluate(() => { const m = window.__game.match; m.startRound(); m.wins[0] = (m.opts.rounds || 2) - 1; m.endRound(0, 'ko'); });
  await waitFor(() => /CAMPEÓN/.test(document.querySelector('#overlay')?.textContent || ''), null, 180000, 'champion');
  check(await p.evaluate(() => localStorage.getItem('pdb_save')) === null, 'champion: the run is over, nothing left to continue');
  await p.click('#overlay .actions button[data-act="champ"]');
  // (the champion's ending first: a tap shows all of it, another goes on)
  await waitFor(() => window.__game.state === 'ending' && !!document.querySelector('#ending.on'), null, 120000, 'the ending');
  await p.waitForTimeout(400);
  await p.mouse.click(450, 250); await p.waitForTimeout(300); await p.mouse.click(450, 250);
  await waitFor(() => !!document.querySelector('#overlay.on .actions [data-a="ok"]'), null, 30000, 'champion banner');
  await p.click('#overlay .actions [data-a="ok"]');
  await title();
  check(await contBtn() === null, 'and the title shows no CONTINUAR');
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await p.screenshot({ path: path.join(OUT, 'continue_fail.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `CONTINUE OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'CONTINUE FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
