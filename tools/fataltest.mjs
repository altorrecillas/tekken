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
  await winFight(WHO, WHO === 'noemi' || WHO === 'rafa' ? 'camilo' : 'rafa', 0, false);
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
  const F = await p.evaluate(() => { const s = window.__game.match.fighters[0].style.fatal; return { cut: s.cut, title: s.title, len: s.len, hit: s.hit, burst: s.burst, evap: s.evap, land: s.land, ash: s.ash }; });
  const at = async (f, name) => {
    await waitFor((f) => window.__game.match.pt >= f || window.__game.state === 'results', f, 240000, 'frame ' + f);
    await p.screenshot({ path: path.join(OUT, `fatal_${WHO}_${name}.png`) });
  };
  // (read what it is like as soon as the frame comes, before the slow screenshot lets the move run on)
  const atRead = async (f, name, fn) => {
    await waitFor((f) => window.__game.match.pt >= f || window.__game.state === 'results', f, 240000, 'frame ' + f);
    const v = await p.evaluate(fn);
    await p.screenshot({ path: path.join(OUT, `fatal_${WHO}_${name}.png`) });
    return v;
  };
  if (WHO === 'orion') {
    await at(240, 'beams');
    const be = await p.evaluate(() => { const f = window.__game.fatal; return { on: f.beams.beams[0].m.visible && f.beams.beams[1].m.visible, char: +f.burn.U.uBnChar.value.toFixed(2), flames: f.fl.ps.length, clip: window.__game.match.fighters[1].clipName }; });
    check(be.on && be.char > 0.3 && be.flames > 10 && be.clip === 'fatalBeamHit', `the beams from his eyes burn the loser (burn ${be.char}, ${be.flames} flames)`);
    await at(F.ash[1] + 10, 'ash');
    const as = await p.evaluate(() => { const f = window.__game.fatal; return { ash: +f.burn.U.uBnAsh.value.toFixed(2), pile: +f.pile.mesh.scale.x.toFixed(2), beams: f.beams.beams[0].m.visible }; });
    check(as.ash > 0.99 && as.pile > 0.8 && !as.beams, `the loser has crumbled to a pile of ash (${as.pile}), the beams off`);
  } else if (WHO === 'zapponi') {
    await at(140, 'helmet');
    const hb = await p.evaluate(() => { const f = window.__game.fatal; return { bike: !!f.bk?.group.visible, helmet: !!f.hel?.group.visible }; });
    check(hb.bike && hb.helmet, 'his bike has rolled up to him and his helmet is on');
    await at(F.cut + 30, 'split');
    const sp = await p.evaluate(() => { const g = window.__game, f = g.fatal, L = g.match.fighters[1]; return { cut: f.hv.cut, drawn: L.drawnBy === f.hv, th: f.hv.H.map((h) => +h.th.toFixed(2)), drops: f.blood.drops.length }; });
    check(sp.cut && sp.drawn && sp.th[0] > 0.4 && sp.th[1] > 0.4, `the loser is split down his middle, the halves falling to either side (${sp.th.join(', ')} rad), ${sp.drops} drops of blood in the air`);
    await at(410, 'stop');
    const st = await p.evaluate(() => { const g = window.__game, m = g.match, W = m.fighters[0]; return { clip: W.clipName, d: +Math.hypot(W.pos.x - m.fatalW0.x, W.pos.z - m.fatalW0.z).toFixed(2), onBike: g.fatal.bk.group.parent === W.ch.group }; });
    check(st.clip === 'fatal_look' && st.d > 4 && st.onBike, `he has stopped on his bike past the loser (${st.d} m from where he started) and looks back`);
  } else if (WHO === 'rafa') {
    await at(132, 'pit');
    const pi = await p.evaluate(() => { const f = window.__game.fatal; return { open: f.pit.U.uPitOpen.value, holed: f.pit.patched.length, crack: f.pit.crackU.uGrow.value }; });
    check(pi.open > 0.99 && pi.holed > 0 && pi.crack > 0.99, `the ground has cracked and given way behind the loser (${pi.holed} floor meshes holed)`);
    await at(F.land + 40, 'spikes');
    const sp = await p.evaluate(() => { const g = window.__game, f = g.fatal, L = g.match.fighters[1]; return { y: +L.pos.y.toFixed(2), clip: L.clipName, blood: Math.min(...f.pit.heroes.map((h) => h.U.uBlood.value)), soak: f.soak.U.uSoak.value[0].w, drops: f.blood.drops.length }; });
    check(sp.y < -0.5 && sp.clip === 'fatalImpaled' && sp.blood > 0.3 && sp.soak > 0.05, `the loser is down on the spikes (${sp.y} m), blood running down them, ${sp.drops} drops of blood in the air`);
    await at(350, 'edge');
    const ed = await p.evaluate(() => { const g = window.__game, m = g.match, W = m.fighters[0]; return { clip: W.clipName, d: +Math.hypot(W.pos.x - m.fatalL0.x, W.pos.z - m.fatalL0.z).toFixed(2) }; });
    check(ed.clip === 'fatal_bump' && ed.d < 0.5, `Rafa at the pit's edge looking down (${ed.d} m from where the loser stood)`);
  } else if (WHO === 'alejandro') {
    await at(60, 'stretch');
    await at(230, 'run');
    const ru = await p.evaluate(() => { const g = window.__game, m = g.match, W = m.fighters[0], L = m.fighters[1]; return { r: +Math.hypot(W.pos.x - L.pos.x, W.pos.z - L.pos.z).toFixed(2), clip: W.clipName, I: +g.fatal.torn.I.toFixed(2) }; });
    check(ru.clip === 'fatal_run' && ru.r > 1 && ru.r < 1.4 && ru.I > 0.5, `he runs round the loser (${ru.r} m from him), the whirlwind up (${ru.I})`);
    await at(F.evap[1] + 10, 'gone');
    const go = await p.evaluate(() => { const f = window.__game.fatal; return { gone: f.evap.U.uEvGone.value, drops: f.blood.drops.length }; });
    check(go.gone > 0.99, `the loser is gone in the wind (${go.gone.toFixed(2)}), ${go.drops} drops of blood in the air`);
    await at(420, 'stop');
    const st = await p.evaluate(() => { const m = window.__game.match, W = m.fighters[0]; return { clip: W.clipName, moving: Math.hypot(W.pos.x - W.prevPos.x, W.pos.z - W.prevPos.z) }; });
    check(st.clip === 'fatal_stop' && st.moving < 0.001, `he has stopped (${st.clip})`);
  } else if (WHO === 'dani') {
    await at(60, 'racket');
    check(await p.evaluate(() => { const f = window.__game.fatal; return !!f.rk && f.rk.group.visible && f.ball.mesh.visible; }), 'the racket in his hand, the ball in the other');
    await at(F.hit + 12, 'swell');
    const sw = await p.evaluate(() => +(window.__game.fatal.gib.swollen || 1).toFixed(2));
    check(sw > 1.2, `the ball in the loser's chest, he swells (x${sw})`);
    await at(F.burst + 30, 'burst');
    const bu = await p.evaluate(() => { const f = window.__game.fatal; return { burst: f.gib.burst, pieces: f.gib.pieces.length, drops: f.blood.drops.length, drawn: window.__game.match.fighters[1].drawnBy === f.gib }; });
    check(bu.burst && bu.drawn && bu.pieces === 7, `he bursts: ${bu.pieces} pieces of him flying, ${bu.drops} drops of blood in the air`);
    await at(360, 'after');
    const af = await p.evaluate(() => { const f = window.__game.fatal; return { down: f.gib.pieces.filter((P) => P.p.y < 0.3).length, fallen: f.gib.pieces.filter((P) => P.R.stand && P.fall?.done).length }; });
    check(af.down >= 6 && af.fallen === 2, `all of him on the floor (${af.down} of 7 pieces), the shins standing and then fallen (${af.fallen})`);
  } else if (WHO === 'aleix') {
    const pd = await atRead(80, 'pad', () => { const f = window.__game.fatal; return { on: !!f.pad && f.pad.root.visible, s: +f.pad.pad.scale.x.toFixed(2), pt: window.__game.match.pt }; });
    check(pd.on && pd.s < 1.5, `the controller is out, in his hands, its real size (x${pd.s} at frame ${pd.pt})`);
    const gi = await atRead(160, 'giant', () => { const f = window.__game.fatal; return { s: +f.pad.pad.scale.x.toFixed(1), y: +f.pad.root.position.y.toFixed(2), pt: window.__game.match.pt }; });
    check(gi.s > 16 && gi.y > 2, `it has grown giant over his head (x${gi.s}, at ${gi.y} m, frame ${gi.pt})`);
    const cr = await atRead(F.cut + 16, 'crush', () => { const f = window.__game.fatal, L = window.__game.match.fighters[1]; return { sy: +L.ch.group.scale.y.toFixed(3), y: +f.pad.root.position.y.toFixed(2), drops: f.blood.drops.length }; });
    check(cr.sy < 0.08 && cr.y < 0.6, `the loser is flattened under it (to ${cr.sy} of his height), ${cr.drops} drops of blood in the air`);
    await at(400, 'pixels');
    const px = await p.evaluate(() => { const f = window.__game.fatal; return { gone: !f.pad.root.visible, dis: f.pad.U.dis.value }; });
    check(px.gone && px.dis >= 0.99, 'it has broken up into pixels: only the stain is left');
  } else if (WHO === 'camilo') {
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
  check(await p.evaluate(() => !window.__game.fatal.m && !document.querySelector('#lensBlood.on') && !window.__game.scene.getObjectByName('spikePit')), 'back at the title, all of it is gone');
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
