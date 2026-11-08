// DESAFÍOS flow test: title -> DESAFÍOS -> SUPERVIVENCIA -> select -> stage -> a one-round fight (won by knocking the
// CPU out from the page), the health carried into the next fight (+20 %), a fight lost -> the records table with the
// run in it; then CONTRARRELOJ: its clock on the HUD, a fight won adds its fight time; RÉCORDS from the menu.
// usage: node chaltest.mjs (from a folder with playwright; GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r)); const PORT = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
let errors = 0;
p.on('pageerror', (e) => { errors++; console.log('PAGEERROR', e.message); });
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('console.error', m.text()); });
await p.goto(`http://127.0.0.1:${PORT}/index.html?q=low&nodynres=1`);
await p.evaluate(() => { try { localStorage.removeItem('pdb_records'); } catch (e) {} });
const st = async () => JSON.parse(await p.evaluate(() => (window.__debug ? window.__debug() : '{}')));
const waitState = async (s, to = 300000) => { const t0 = Date.now(); while (Date.now() - t0 < to) { const d = await st(); if (d.state === s) return d; await p.waitForTimeout(800); } throw new Error('timeout waiting ' + s + ' last=' + JSON.stringify(await st())); };
const key = async (k) => { await p.keyboard.down(k); await p.waitForTimeout(200); await p.keyboard.up(k); await p.waitForTimeout(600); };
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
// a fight decided from the page: the loser's health to nothing, as if knocked out
const finish = async (winner) => p.evaluate((w) => { const m = window.__game.match; const L = m.fighters[1 - w]; L.hp = 1; m.fighters[w].hp = Math.max(1, m.fighters[w].hp); }, winner);
const waitFight = async () => { await waitState('fight'); for (let i = 0; i < 1200; i++) { const ph = await p.evaluate(() => window.__game.match?.phase); if (ph === 'fight') return; await p.waitForTimeout(500); } throw new Error('no fight phase'); };
// the knockout: a heavy blow from the winner lands on a fighter left with 1 HP (the fight's own rules decide it)
const koBy = async (w) => {
  await finish(w);
  // (no PUÑETALITY from the computer: the test goes straight on to the results)
  await p.evaluate(() => { window.__game.match.cpuFatal = false; });
  await p.evaluate((w) => { const m = window.__game.match; const A = m.fighters[w], B = m.fighters[1 - w]; B.hp = 0; B.ko = true; B.setState('air'); B.airborne = true; B.play('air', 2); B.vel.y = 3; m.onKO(A, B, B.pos.clone()); }, w);
  // (the win screen goes on to the results on a button, once the knockout has been shown)
  const t0 = Date.now();
  while (Date.now() - t0 < 400000) {
    const d = await st();
    if (d.state === 'results') return;
    if (d.phase === 'matchEnd') await key('KeyU'); else await p.waitForTimeout(1000);
  }
  throw new Error('no results: ' + JSON.stringify(await st()));
};

await waitState('title');
await p.click('#title .menu.main [data-act="chalmenu"]'); await p.waitForTimeout(500);
check(!(await p.$eval('#title .menu.chal', (e) => e.hidden)), 'DESAFÍOS menu opens');
await p.click('#title .menu.chal [data-act="survival"]');
await waitState('select');
check((await p.$eval('#select .stagebar', (e) => e.textContent)).startsWith('SUPERVIVENCIA'), 'select screen says SUPERVIVENCIA');
await key('KeyU'); await waitState('stage'); await key('KeyU');
await waitFight();
let g = await p.evaluate(() => ({ rounds: window.__game.match.opts.rounds, kind: window.__game.chal?.kind, hud: document.querySelector('#chalHud').className, txt: document.querySelector('#chalHud').textContent }));
check(g.rounds === 1 && g.kind === 'survival', `one-round survival fight (${JSON.stringify(g)})`);
check(g.hud.includes('on') && /VICTORIA/.test(g.txt), 'HUD shows the wins');
// fight 1 won with 30 % left -> the next starts on 50 %
await p.evaluate(() => { const f = window.__game.match.fighters[0]; f.hp = Math.round(f.maxHp * 0.3); });
await koBy(0);
let sub = await p.$eval('#overlay .panel', (e) => e.textContent);
check(/1 COMBATE GANADO/.test(sub), 'results: 1 fight won');
await p.click('#overlay .actions [data-act="next"]').catch(async () => { await key('Enter'); });
await waitFight();
g = await p.evaluate(() => { const f = window.__game.match.fighters[0]; return { frac: f.hp / f.maxHp, i: window.__game.chal.i }; });
check(Math.abs(g.frac - 0.5) < 0.03 && g.i === 1, `health carried over: ${(g.frac * 100).toFixed(0)} % (expected 50 %)`);
// fight 2 lost -> FIN -> records
await koBy(1);
sub = await p.$eval('#overlay .panel', (e) => e.textContent);
check(/FIN DE LA SUPERVIVENCIA/.test(sub), 'results: run over');
await p.click('#overlay .actions [data-act="end"]').catch(async () => { await key('Enter'); });
await waitState('overlay', 20000);
const rec = await p.evaluate(() => ({ html: document.querySelector('#overlay .panel').innerHTML, ls: localStorage.getItem('pdb_records') }));
check(/NUEVO RÉCORD/.test(rec.html) && /tr class="new"/.test(rec.html), 'records: new record lit up');
check(JSON.parse(rec.ls).survival[0].n === 1, 'records kept on the device');
// MENÚ -> CONTRARRELOJ
await p.click('#overlay [data-a="back"]'); await waitState('title');
await p.click('#title .menu.main [data-act="chalmenu"]'); await p.waitForTimeout(400);
await p.click('#title .menu.chal [data-act="timeattack"]');
await waitState('select'); await key('KeyU'); await waitState('stage'); await key('KeyU');
await waitFight();
await p.waitForTimeout(3000);
g = await p.evaluate(() => ({ txt: document.querySelector('#chalHud').textContent, ff: window.__game.match.fightFrames || 0, n: window.__game.chal.ladder.length }));
check(/⏱ \d:\d\d\.\d\d/.test(g.txt) && g.ff > 0 && g.n === 7, `time attack clock on the HUD: ${g.txt}, ${g.ff} fight frames, ${g.n} rivals`);
await koBy(0);
const t1 = await p.evaluate(() => window.__game.chal.frames);
sub = await p.$eval('#overlay .panel', (e) => e.textContent);
check(t1 > 0 && /COMBATE 1 DE 7/.test(sub), `results: 1 of 7 and the time (${t1} frames)`);
const restartHidden = await p.$eval('#pause .menu.local [data-act="restart"]', (e) => e.hidden).catch(() => null);
await p.click('#overlay .actions [data-act="menu"]').catch(async () => { await key('Escape'); });
await waitState('title');
await p.click('#title .menu.main [data-act="chalmenu"]'); await p.waitForTimeout(400);
check(/1 MARCAS/.test(await p.$eval('#title .menu.chal [data-act="records"]', (e) => e.textContent)), 'menu counts the records');
await p.click('#title .menu.chal [data-act="records"]'); await waitState('overlay', 10000);
check(/SUPERVIVENCIA/.test(await p.$eval('#overlay .panel', (e) => e.textContent)), 'RÉCORDS table opens');
check(errors === 0, 'no page errors');
await b.close(); srv.close();
console.log(fails.length ? `CHALTEST FAIL (${fails.length})` : 'CHALTEST OK');
