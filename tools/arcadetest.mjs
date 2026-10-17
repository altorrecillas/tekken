// Arcade run in the real game: difficulty toggle, four fights forced to a win, one match end per fight, no extra
// fighters in the scene, loading card, champion banner, back to the title, announcer clips loaded.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.gz': 'application/gzip', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise(r => srv.on('listening', r)); const PORT = srv.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console ' + m.text()); });
const results = [];
const ok = (cond, msg) => { results.push((cond ? 'PASS ' : 'FAIL ') + msg); console.log((cond ? 'PASS ' : 'FAIL ') + msg); };
await p.goto(`http://127.0.0.1:${PORT}/index.html?q=low&nodynres=1`);
const g = (fn) => p.evaluate(fn);
const waitFor = async (fn, to = 240000, label = '') => { const t0 = Date.now(); while (Date.now() - t0 < to) { try { if (await g(fn)) return true; } catch (e) { /* page busy */ } await p.waitForTimeout(500); } console.log('timeout', label); return false; };
ok(await waitFor(() => window.__game?.state === 'title', 240000, 'title'), 'title');
// difficulty: NORMAL -> DIFÍCIL -> FÁCIL -> NORMAL, remembered
const lbl = () => g(() => document.querySelector('#title .diffv')?.textContent);
const l0 = await lbl();
await p.click('#title [data-act="difficulty"]'); const l1 = await lbl();
await p.click('#title [data-act="difficulty"]'); const l2 = await lbl();
await p.click('#title [data-act="difficulty"]'); const l3 = await lbl();
ok(l0 === 'NORMAL' && l1 === 'DIFÍCIL' && l2 === 'FÁCIL' && l3 === 'NORMAL', `difficulty cycles ${l0} > ${l1} > ${l2} > ${l3}`);
ok(await g(() => localStorage.getItem('pdb_diff')) === 'normal', 'difficulty saved');
// arcade with Zapponi
await p.click('#title [data-act="arcade"]');
await waitFor(() => window.__game?.state === 'select', 30000, 'select');
const bar = await g(() => document.querySelector('#select .stagebar')?.textContent);
ok(/DIFICULTAD NORMAL/.test(bar || ''), 'select bar shows difficulty: ' + bar);
// (desktop: one click picks the fighter; touch screens need a second tap)
await p.click('#select .card[data-id="zapponi"]');
let ends = 0;
// record every loading card shown (a MutationObserver: polling can miss a short load)
await g(() => { window.__cards = []; const f = document.querySelector('#fade'); new MutationObserver(() => { if (f.classList.contains('busy')) window.__cards.push(document.querySelector('#fadeStep').textContent + ' | ' + document.querySelector('#fadeVs').textContent); }).observe(f, { attributes: true, attributeFilter: ['class'] }); });
await g(() => { window.__ends = 0; const G = window.__game; const orig = G.onMatchEnd.bind(G); G.onMatchEnd = (m) => { window.__ends++; return orig(m); }; });
const seen = [];
const RIVALS = await g(() => window.__game.roster.length - 1); // everybody but the player's pick
for (let k = 0; k < RIVALS; k++) {
  // the loading card shows the matchup while the fight loads
  let card = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const s = await g(() => ({ st: window.__game.state, busy: document.querySelector('#fade').classList.contains('busy'), vs: document.querySelector('#fadeVs')?.textContent, step: document.querySelector('#fadeStep')?.textContent, ph: window.__game.match?.phase }));
    if (s.st === 'fight' && s.ph === 'fight') break;
    await p.waitForTimeout(250);
  }
  const info = await g(() => { const G = window.__game; let n = 0; G.scene.traverse(o => { if (o.userData?.fighter && o.parent === G.scene) n++; }); return { opp: G.match.fighters[1].id, stage: G.arcade.stage, n, ai: G.match.fighters[1].ctrl?.level }; });
  seen.push(info.opp);
  ok(info.n === 2, `fight ${k + 1}: ${info.n} fighter models in the scene (vs ${info.opp}, CPU level ${info.ai}, arcade step ${info.stage + 1})`);
  card = (await g(() => window.__cards.slice(-1)[0])) || '';
  // (the card only appears when loading takes over 120 ms: a fighter already in memory loads without it)
  ok(card === '' || new RegExp(`COMBATE \\d DE ${RIVALS}`).test(card), `fight ${k + 1}: loading card "${card || 'none, instant load'}"`);
  // force the win: last round to P1
  await g(() => { window.__stageMark = window.__game.arcade.stage; const m = window.__game.match; m.wins[0] = (m.opts.rounds || 2) - 1; m.endRound(0, 'ko'); });
  await waitFor(() => window.__game.match?.phase === 'matchEnd' || window.__game.state !== 'fight', 180000, 'matchEnd');
  const before = await g(() => window.__ends);
  // hold on the win screen past the auto-advance point, pressing buttons too (used to fire every frame)
  await p.waitForTimeout(1500);
  for (let i = 0; i < 4; i++) { await p.keyboard.press('KeyU'); await p.waitForTimeout(200); }
  // the arcade moves on (next fight, or the champion banner after the last one)
  await waitFor(() => (window.__game.arcade?.stage ?? 0) > window.__stageMark || document.querySelector('#overlay').classList.contains('on'), 180000, 'advance');
  await p.waitForTimeout(4000);
  const after = await g(() => window.__ends);
  ok(after - before === 1, `fight ${k + 1}: match end handled ${after - before} time(s)`);
  const st = await g(() => ({ stage: window.__game.arcade?.stage, state: window.__game.state }));
  ok(st.stage === k + 1, `fight ${k + 1}: arcade moved exactly one step (now ${st.stage}, ${st.state})`);
  // the results screen: on to the next rival (after the final: the champion); the presses on the win screen may
  // already have taken the first button
  const act = await g(() => { const b = document.querySelector('#overlay.on .actions button.primary[data-act]'); return b ? b.dataset.act : null; });
  if (act) await p.click(`#overlay .actions button[data-act="${act}"]`);
}
ok(new Set(seen).size === RIVALS && !seen.includes('zapponi') && seen.includes('dani'), 'fought all the others: ' + seen.join(', '));
ok(await waitFor(() => /CAMPEÓN/.test(document.querySelector('#overlay')?.textContent || ''), 30000, 'champion'), 'champion banner after the last fight');
// (the final's CONTINUAR plays the champion's ending: a tap shows all of it, another goes on to the champion screen)
ok(await waitFor(() => window.__game.state === 'ending' && !!document.querySelector('#ending.on'), 120000, 'ending'), 'the champion\'s ending');
await p.waitForTimeout(400);
await p.mouse.click(480, 270); await p.waitForTimeout(300); await p.mouse.click(480, 270);
ok(await waitFor(() => !!document.querySelector('#overlay.on .actions [data-a="ok"]'), 60000, 'champion screen'), 'the champion screen');
await p.click('#overlay .actions [data-a="ok"]');
ok(await waitFor(() => window.__game.state === 'title' && !document.querySelector('#overlay').classList.contains('on'), 90000, 'title again'), 'MENÚ PRINCIPAL goes back to the title');
const vc = await g(() => Object.keys(window.__game.audio.voiceClips || {}).length);
ok(vc === 18, `announcer clips loaded: ${vc}/18`);
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
console.log(results.filter(r => r.startsWith('PASS')).length + '/' + results.length + ' passed');
await b.close(); srv.close();
