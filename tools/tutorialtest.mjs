// TUTORIAL, in the real game: started as the title menu does (mode tutorial, the gym), every lesson of every fighter
// is passed by a scripted player (the simulation stepped here, the lesson checked every frame as js/main.js does),
// then the end: the achievement and the overlay back to the menu.
// usage: node tutorialtest.mjs [outDir] [--fighters a,b]   (playwright next to this file or GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--fighters') || '.');
const ONLY = argv.includes('--fighters') ? argv[argv.indexOf('--fighters') + 1].split(',') : null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
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
const t0 = Date.now();
try {
  await p.goto(URL_);
  await waitFor(() => window.__game?.state === 'title' && !!document.querySelector('#title.on'), null, 180000, 'title');
  check(await p.evaluate(() => !!document.querySelector('#title .menu.main [data-act="tutorial"]')), 'TUTORIAL in the title menu');
  const roster = await p.evaluate(() => window.__game.roster.slice());
  for (const id of roster.filter((x) => !ONLY || ONLY.includes(x))) {
    // as the menu does: TUTORIAL, the fighter picked, straight into the gym (no stage select)
    await p.evaluate((id) => { const g = window.__game; g.titleAction('tutorial'); g.sel.i[0] = g.roster.indexOf(id); g.confirmSel(0); }, id);
    await waitFor(() => { const g = window.__game; return g.state === 'fight' && g.match?.phase === 'fight' && g.tutorial.m === g.match; }, null, 180000, 'tutorial ' + id);
    const info = await p.evaluate(() => ({ stage: window.__game.stageKey, panel: !!document.querySelector('#tutPanel.on'), n: window.__game.tutorial.list.length }));
    check(info.stage === 'gym' && info.panel, `${id}: tutorial in the gym, lesson panel on (${info.n} lessons)`);
    const res = await p.evaluate(async () => {
      const g = window.__game, T = g.tutorial, m = g.match, [a, bb] = m.fighters;
      const { B1, B2, B3, B4, BLOCK } = await import('./js/fight/input.js');
      const BTN = { 1: B1, 2: B2, 3: B3, 4: B4 };
      const NO = { fwd: 0, up: 0, press: 0 };
      const encode = (cmd) => {
        const out = []; let fwd = 0, up = 0, press = 0;
        if (cmd.startsWith('f,f')) { out.push({ fwd: 1, up: 0, press: 0, n: 2 }, { fwd: 0, up: 0, press: 0, n: 2 }); cmd = 'f' + cmd.slice(3); }
        for (const t of cmd.split('+')) {
          if (t === 'f') fwd = 1; else if (t === 'b') fwd = -1; else if (t === 'd') up = -1; else if (t === 'u') up = 1;
          else if (t === 'df') { fwd = 1; up = -1; } else if (t === 'db') { fwd = -1; up = -1; } else if (t === 'uf') { fwd = 1; up = 1; } else if (BTN[t]) press |= BTN[t];
        }
        if (up < 0 && press) out.push({ fwd, up, press: 0, n: 2 });
        out.push({ fwd, up, press, n: 2 });
        return out;
      };
      const dist = () => Math.hypot(a.pos.x - bb.pos.x, a.pos.z - bb.pos.z);
      // a plan: steps of {fwd, up, press, n} or {near: metres} (walk in until that close) or {wait: frames}
      const runner = (plan) => {
        let i = 0, left = -1;
        return () => {
          while (i < plan.length) {
            const q = plan[i];
            if (q.near !== undefined) { if (dist() > q.near && ['idle', 'walkF', 'walkB', 'crouch', 'guard'].includes(a.state)) return { fwd: 1, up: 0, press: 0 }; i++; continue; }
            if (left < 0) left = q.n ?? q.wait ?? 1;
            if (left-- > 0) return q.wait !== undefined ? NO : q;
            i++; left = -1;
          }
          return NO;
        };
      };
      const seqWith = (cmds, gap) => { const out = [{ near: 0.95 }]; cmds.forEach((c, k) => { if (k) out.push({ wait: gap }); out.push(...encode(c)); }); out.push({ wait: 90 }); return out; };
      // each lesson: attempts (plans, tried in turn, each from the lesson's start), or a reactive bot
      const st = a.style;
      const specials = (st.commands || []).filter(([, k]) => a.moves[k]?.hit).map(([c]) => c);
      const gaps = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28];
      const BOTS = {
        'MOVERSE': [[{ fwd: 1, up: 0, press: 0, n: 50 }, { fwd: -1, up: 0, press: 0, n: 120 }]],
        'DASH': [[{ fwd: 1, up: 0, press: 0, n: 2 }, { wait: 3 }, { fwd: 1, up: 0, press: 0, n: 2 }, { wait: 30 }]],
        'ESQUIVA LATERAL': [[{ fwd: 0, up: 1, press: 0, n: 2 }, { wait: 40 }]],
        'LOS CUATRO BOTONES': [[{ near: 0.9 }, ...encode('1'), { wait: 45 }, { near: 0.9 }, ...encode('2'), { wait: 55 }, { near: 0.9 }, ...encode('3'), { wait: 60 }, { near: 0.9 }, ...encode('4'), { wait: 70 }]],
        'LA CADENA 1, 2': gaps.map((d) => seqWith(['1', '2'], d)),
        'TU CADENA PROPIA': gaps.flatMap((d) => gaps.map((e) => [{ near: 0.95 }, ...encode('1'), { wait: d }, ...encode('2'), { wait: e }, ...encode('3'), { wait: 90 }])),
        'LANZAR Y REMATAR': [20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60].flatMap((d) => [6, 10, 14, 18, 24].map((e) => [{ near: 0.95 }, ...encode('df+2'), { wait: d }, ...encode('1'), { wait: e }, ...encode('2'), { wait: 100 }])),
        'TUS ESPECIALES': [[...specials.flatMap((c) => [{ near: 0.9 }, ...encode(c), { wait: 110 }])]],
        'AGARRAR': [0, 1, 2].map(() => [{ wait: 30 }, { near: 0.95 }, { fwd: 0, up: 0, press: B1 | B3, n: 2 }, { wait: 150 }]),
        'LAS PAREDES': [['4', 'f+2', 'b+4', '3+4', 'f,f+4', '1+2', 'b+3', 'f+4', 'd+4', 'df+2'].flatMap((c) => [{ near: 0.95 }, ...encode(c), { wait: 120 }])],
      };
      // reactive bots: watching the partner
      const react = {
        'BLOQUEAR': () => ({ fwd: -1, up: 0, press: 0 }),
        'BLOQUEO BAJO': () => ({ fwd: -1, up: -1, press: 0 }),
        'LA PARADA': () => { const mv = bb.state === 'move' ? bb.move : null; const left = mv?.hit ? mv.hit.f[0] - bb.mf : 99; return { fwd: 0, up: 0, press: left === 3 ? BLOCK : 0, held: left <= 3 && left >= 0 ? BLOCK : 0 }; },
        'ZAFARSE': () => ({ fwd: 0, up: 0, press: a.state === 'thrown' ? B1 : 0 }),
        'RAGE ART': () => (a.rage && ['idle', 'walkF', 'walkB', 'crouch', 'guard'].includes(a.state) ? (dist() > 1.0 ? { fwd: 1, up: 0, press: 0 } : { fwd: 0, up: 0, press: B1 | B2 | B3 | B4 }) : { fwd: dist() > 1.0 ? 1 : 0, up: 0, press: 0 }),
      };
      const p1 = a.ctrl, report = [];
      const drive = (fn) => { a.ctrl = { poll: () => { const q = fn(); return { dx: q.fwd * m.screenForward(a), dy: q.up, held: q.held ?? q.press, pressed: q.press }; } }; };
      const steps = (n) => { for (let f = 0; f < n && !T.ok; f++) { m.step(); T.tick(1 / 60, new Set()); m.events.length = 0; } return T.ok; };
      for (let li = 0; li < T.list.length; li++) {
        const L = T.list[li];
        const start = T.i;
        let done = false, tries = 0;
        if (react[L.name]) { drive(react[L.name]); done = steps(1500); tries = 1; }
        else {
          for (const plan of BOTS[L.name] || []) {
            tries++;
            T.set(start); // (the lesson from its start: positions as they are, counters cleared)
            drive(runner(plan));
            if (steps(plan.reduce((s, q) => s + (q.n || q.wait || 60), 0) + 200)) { done = true; break; }
            // back to a fresh distance for the next try (a training round restarted, the lesson kept)
            if (L.name !== 'LAS PAREDES') { const i = T.i; m.startRound(); m.phase = 'fight'; m.pt = 0; T.set(i); for (let f = 0; f < 30; f++) { a.ctrl = { poll: () => ({ dx: 0, dy: 0, held: 0, pressed: 0 }) }; m.step(); m.events.length = 0; } }
          }
        }
        report.push({ name: L.name, ok: done, tries, dbg: done ? '' : JSON.stringify({ ev: T.hitEv.slice(-5), d: +dist().toFixed(2), sa: a.state, sb: bb.state, thr: m.stats[0].throws }) });
        a.ctrl = { poll: () => ({ dx: 0, dy: 0, held: 0, pressed: 0 }) };
        for (let f = 0; f < 40; f++) { m.step(); m.events.length = 0; }
        if (li < T.list.length - 1) T.next(); else if (done) T.next(); else T.finish();
      }
      a.ctrl = p1;
      return { report, done: T.done, ach: g.progress.has('tutorial') };
    });
    for (const r of res.report) check(r.ok, `${id}: ${r.name}${r.ok ? ` (${r.tries} ${r.tries === 1 ? 'try' : 'tries'})` : ' NOT DONE ' + r.dbg}`);
    check(res.done && res.ach, `${id}: tutorial completed, achievement PRIMERA CLASE`);
    await waitFor(() => document.querySelector('#overlay.on')?.textContent.includes('TUTORIAL COMPLETADO'), null, 8000, 'end overlay');
    await p.screenshot({ path: path.join(OUT, `tutorial_end_${id}.png`) });
    await p.evaluate(() => window.__game.overlayCb.ok());
    await waitFor(() => window.__game.state === 'title', null, 60000, 'back to the title');
    // the player's own training settings untouched by the tutorial
    const s = await p.evaluate(() => ({ ...window.__game.training.s, script: window.__game.training.script }));
    check(!s.script && s.history !== false, `${id}: training settings given back (history ${s.history}), no script left`);
  }
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await p.screenshot({ path: path.join(OUT, 'tutorial_fail.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `TUTORIAL OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'TUTORIAL FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
