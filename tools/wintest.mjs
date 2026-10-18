// The win screens in the real game: a fight won by each fighter in turn, his line said on its frame of the win pose
// (its subtitle on screen, his mouth moving with it), Camilo's phone in his hand only then, and a button press not
// ending the win screen until the line has been said. Screenshots of each fighter mid-line (win_<id>.png).
// usage: node wintest.mjs [outDir] [--fighters a,b] [--shots]   (playwright next to this file or GAME_ROOT=<game>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--fighters') || '.');
const ONLY = argv.includes('--fighters') ? argv[argv.indexOf('--fighters') + 1].split(',') : null;
const SHOTS = argv.includes('--shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream' };
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
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const waitFor = async (fn, arg, ms = 120000, what = 'condition') => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(100); }
  throw new Error('timeout: ' + what);
};
const t0 = Date.now();
try {
  await p.goto(URL_);
  // (once the whole roster has loaded and the title's fighters have walked in: before that a slow or busy machine's
  // page is stuck compiling the showcase for long stretches and a click times out)
  await waitFor(() => window.__game?.state === 'title' && !!document.querySelector('#title.on') && window.__bootTimes?.roster != null && !window.__game.entrance, null, 300000, 'title');
  // (a click: the audio starts, the select screen fetches every voice and line; forced: the title menu may still be
  // sliding in on a slow machine)
  await p.click('#title [data-act="arcade"]', { force: true, timeout: 90000 });
  await waitFor(() => window.__game.state === 'select', null, 30000, 'select');
  await p.waitForTimeout(3000);
  const roster = await p.evaluate(() => window.__game.roster.slice());
  for (const id of roster.filter((x) => !ONLY || ONLY.includes(x))) {
    await p.evaluate((id) => { const g = window.__game; g.mode = 'versus'; g.startFight(id, g.roster.find((x) => x !== id), { human2: false }); }, id);
    await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'intro', null, 120000, 'fight ' + id);
    // the fight won by him at once; from the moment a win screen without a line could be skipped (frame 61) his
    // player mashes a button: the screen must stay until the line has been said. Every drawn frame of the win screen
    // is recorded in the page (a slow machine draws few of them, the simulation steps several frames per drawing)
    await p.evaluate(async () => {
      const g = window.__game, m = g.match, W = m.fighters[0];
      const { B1 } = await import('./js/fight/input.js');
      const { POSE } = await import('./js/anim/rig.js');
      W.ctrl = { poll: () => { const on = m.phase === 'matchEnd' && m.pt > 61; return { dx: 0, dy: 0, held: on ? B1 : 0, pressed: on ? B1 : 0 }; } };
      const rec = window.__rec = { rows: [], jaw: null, done: false };
      const tick = () => {
        if (m.phase === 'matchEnd') {
          const prop = W.ch.winProp;
          rec.rows.push([m.pt, !!g.audio.talk?.[W.id], document.querySelector('#winner .quote.on')?.textContent || '', prop ? prop.visible : null, !!m.endSent, W.cf]);
          // the mouth follows the line's loudness: a loud moment opens the jaw when he is drawn
          if (rec.jaw === null && g.audio.talk?.[W.id]) {
            const was = W.talk; W.talk = () => 0.8; W.syncRender(1); rec.jaw = W.renderPose[POSE.jaw[0]]; W.talk = was; W.syncRender(1);
          }
          if (m.endSent) { rec.done = true; return; }
        }
        requestAnimationFrame(tick);
      };
      tick();
      m.startRound(); m.wins[0] = (m.opts.rounds || 2) - 1; m.endRound(0, 'ko');
    });
    // (--shots: a screenshot of him mid-line)
    for (let shot = !SHOTS, t = Date.now(); ;) {
      const st = await p.evaluate(() => ({ done: window.__rec.done, pt: window.__game.match.pt, ph: window.__game.match.phase, at: window.__game.match.fighters[0].style.sayAt }));
      if (!shot && st.ph === 'matchEnd' && st.pt >= st.at + 30) { shot = true; await p.screenshot({ path: path.join(OUT, `win_${id}.png`) }); }
      if (st.done) break;
      if (Date.now() - t > 240000) throw new Error('timeout: win screen ' + id);
      await p.waitForTimeout(50);
    }
    const r = await p.evaluate(() => {
      const W = window.__game.match.fighters[0], rows = window.__rec.rows, from = W.ch.winProp?.userData.from ?? 0;
      const said = rows.find((x) => x[1]), sub = rows.filter((x) => x[2]).map((x) => x[2]).pop() || '';
      const prop = rows[0][3] === null ? null : { before: rows.filter((x) => x[5] < from).every((x) => !x[3]), during: rows.filter((x) => x[5] >= from).every((x) => x[3]) };
      return { sayAt: W.style.sayAt, sayLen: W.style.sayLen, said: said ? said[0] : -1, subtitle: sub, prop, ended: rows[rows.length - 1][0], jaw: window.__rec.jaw ?? 0, frames: rows.length };
    });
    const S = await p.evaluate((id) => window.__game.match.fighters[0].style.say, id);
    check(r.said >= r.sayAt && r.said <= r.sayAt + 12, `${id}: the line starts with frame ${r.said} of the win pose (sayAt ${r.sayAt}; ${r.frames} drawings recorded)`);
    check(r.subtitle === `“${S}”`, `${id}: subtitle ${r.subtitle}`);
    check(r.ended >= r.sayAt + r.sayLen && r.ended < r.sayAt + r.sayLen + 40, `${id}: a button mashed from frame 61 ends the win screen just after the line (frame ${r.ended}, line until ${r.sayAt + r.sayLen})`);
    check(r.jaw > 0.2, `${id}: the mouth opens with the line's loud moments (jaw ${r.jaw.toFixed(2)})`);
    if (r.prop) check(r.prop.before && r.prop.during, `${id}: the phone appears in his hand during the win pose (hidden before: ${r.prop.before}, shown after: ${r.prop.during})`);
    await waitFor(() => window.__game.state === 'results', null, 60000, 'results ' + id);
    await p.evaluate(() => { document.querySelector('#overlay').classList.remove('on'); window.__game.backToTitle?.(); });
    await waitFor(() => window.__game.state === 'title', null, 60000, 'title again');
  }
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await p.screenshot({ path: path.join(OUT, 'wintest_fail.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `WIN SCREENS OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'WIN SCREENS FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
