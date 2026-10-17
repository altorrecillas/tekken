// ENTRENAMIENTO, in the real game:
//  - every combo trial of every fighter can be done: a scripted player tries each step with a range of timings (the
//    best timing of each step kept before the next is searched) until the trial is passed;
//  - the partner blocks when told to (all the jabs of a string), the input history fills in;
//  - a recording: after the countdown the player drives the partner, then the partner plays it back in a loop.
// usage: node trainingtest.mjs [outDir] [--fighters a,b]   (playwright next to this file or GAME_ROOT=<game folder>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--fighters') || '.');
const ONLY = argv.includes('--fighters') ? argv[argv.indexOf('--fighters') + 1].split(',') : null;
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
const t0 = Date.now();
try {
  await p.goto(URL_);
  await waitFor(() => window.__game?.state === 'title' && !!document.querySelector('#title.on'), null, 180000, 'title');
  const roster = await p.evaluate(() => window.__game.roster.slice());
  for (const id of roster.filter((x) => !ONLY || ONLY.includes(x))) {
    await p.evaluate((id) => { const g = window.__game; g.mode = 'training'; const other = g.roster.find((x) => x !== id); g.startFight(id, other, { training: true }); }, id);
    await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'fight' && window.__game.training.m === window.__game.match, null, 180000, 'training ' + id);
    // the trials, searched with the simulation stepped here (no screen frames needed)
    const res = await p.evaluate(async (id) => {
      const g = window.__game, T = g.training, m = g.match, [a, bb] = m.fighters;
      const { B1, B2, B3, B4 } = await import('./js/fight/input.js');
      const BTN = { 1: B1, 2: B2, 3: B3, 4: B4 };
      // a command as input frames (as the CPU player types them): direction first when crouching, then the press
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
      const trials = T.trials(), report = [];
      const attempt = (trial, delays) => {
        // fresh positions at the trial distance, the partner standing
        m.startRound(); m.phase = 'fight'; m.pt = 0; m.hitstop = 0;
        T.s.action = 'stand'; T.s.guard = 'none';
        T.trial = null;
        // (a moment standing still, as a real round has before it starts: the pose filters settle)
        a.ctrl = { poll: () => ({ dx: 0, dy: 0, held: 0, pressed: 0 }) };
        for (let f = 0; f < 50; f++) { m.step(); m.events.length = 0; }
        a.pos.set(-0.55, 0, 0); bb.pos.set(0.55, 0, 0); a.prevPos.copy(a.pos); bb.prevPos.copy(bb.pos);
        a.yaw = Math.PI / 2; bb.yaw = -Math.PI / 2;
        T.trial = { ...trial, at: 0, ok: false };
        const plan = [];
        trial.steps.forEach(([cmd], k) => { if (k) plan.push({ fwd: 0, up: 0, press: 0, n: delays[k - 1] }); plan.push(...encode(cmd)); });
        plan.push({ fwd: 0, up: 0, press: 0, n: 120 });
        let i = 0, left = plan[0].n;
        a.ctrl = { poll: () => { const q = plan[Math.min(i, plan.length - 1)]; const r = { dx: q.fwd * m.screenForward(a), dy: q.up, held: q.press, pressed: q.press }; if (--left <= 0 && i < plan.length - 1) { i++; left = plan[i].n; } return r; } };
        let maxAt = 0;
        for (let f = 0; f < 420 && !T.trial.ok; f++) {
          m.step(); T.trialEvents(); m.events.length = 0;
          maxAt = Math.max(maxAt, T.trial.at);
          if (i >= plan.length - 1 && left < 60 && T.trial.at === 0) break;
        }
        return T.trial.ok ? trial.steps.length : maxAt;
      };
      const D = [3, 5, 7, 9, 11, 13, 15, 17, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60];
      for (const tr of trials) {
        const delays = [];
        let reached = 0;
        for (let k = 1; k < tr.steps.length; k++) {
          let best = null;
          for (const d of D) { const at = attempt(tr, [...delays, d, ...Array(Math.max(0, tr.steps.length - 2 - delays.length)).fill(10)]); if (at > k) { best = d; break; } }
          if (best === null) break;
          delays.push(best); reached = k;
        }
        const at = tr.steps.length === 1 ? attempt(tr, []) : attempt(tr, delays.concat(Array(Math.max(0, tr.steps.length - 1 - delays.length)).fill(10)));
        report.push({ name: tr.name, steps: tr.steps.map((s) => s[0]).join(' '), ok: at >= tr.steps.length, at, delays });
      }
      a.ctrl = T.p1;
      T.trial = null;
      return report;
    }, id);
    for (const r of res) check(r.ok, `${id}: ${r.name} (${r.steps}) ${r.ok ? 'done with gaps ' + r.delays.join('/') : 'stuck at step ' + (r.at + 1)}`);
  }

  // ---------------------------------------------------------------- guard, input history, recording
  const id = roster[0];
  await p.evaluate((id) => { const g = window.__game; g.mode = 'training'; g.startFight(id, g.roster[1], { training: true }); }, id);
  await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'fight' && window.__game.training.m === window.__game.match, null, 180000, 'training');
  await p.evaluate(() => { const T = window.__game.training; T.s.guard = 'all'; T.s.action = 'stand'; });
  // (in reach before every jab: a blocked jab pushes the partner back)
  for (let i = 0; i < 6; i++) {
    await p.evaluate(() => { const [a, b] = window.__game.match.fighters; const d = b.pos.clone().sub(a.pos).setY(0).normalize(); b.pos.copy(a.pos).addScaledVector(d, 1.0); b.prevPos.copy(b.pos); });
    await p.keyboard.down('KeyU'); await p.waitForTimeout(80); await p.keyboard.up('KeyU'); await p.waitForTimeout(450);
  }
  const g1 = await p.evaluate(() => ({ blocks: window.__game.match.stats[1].blocks, hist: document.querySelectorAll('#inputHist.on div').length }));
  check(g1.blocks >= 3, `the partner set to block blocks the jabs (${g1.blocks} blocked)`);
  check(g1.hist >= 3, `input history on screen (${g1.hist} rows)`);
  await p.evaluate(() => { window.__game.training.s.guard = 'none'; });
  await p.keyboard.press('KeyR');
  await waitFor(() => window.__game.training.recording === 2, null, 10000, 'recording after the countdown');
  // the player drives the partner: towards and a few punches
  await p.keyboard.down('KeyA');
  for (let i = 0; i < 4; i++) { await p.keyboard.down('KeyU'); await p.waitForTimeout(90); await p.keyboard.up('KeyU'); await p.waitForTimeout(250); }
  await p.keyboard.up('KeyA');
  await p.keyboard.press('KeyR');
  await waitFor(() => !window.__game.training.recording, null, 5000, 'recording stopped');
  const rec = await p.evaluate(() => ({ len: window.__game.training.recLen, act: window.__game.training.s.action }));
  check(rec.len > 30 && rec.act === 'play', `recorded ${rec.len} frames, the partner plays it back`);
  await waitFor(() => window.__game.match.fighters[1].state === 'move', null, 15000, 'playback attacks');
  check(true, 'the partner repeats the recording (attacks on its own)');
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await p.screenshot({ path: path.join(OUT, 'training_fail.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `TRAINING OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'TRAINING FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
