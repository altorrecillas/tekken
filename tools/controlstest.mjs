// The configurable controls in the real game (OPCIONES -> CONTROLES, js/ui/controls.js): keys changed by clicking a
// slot and pressing the new key, a key taken from another action or from the other player swapping with the slot's old
// one, Esc cancelling, Supr clearing, a reserved key refused; a (simulated) pad driving the screen and changing its
// buttons; RESTAURAR; everything kept after a reload; the menus following the new keys (a key given to another action
// stops accepting); a training fight played with the new key and the new pad button; the pause key and the screen
// opened from the pause; EXTRAS -> CONTROLES listing the keys as they are. Screenshots: controls_*.png.
// usage: node controlstest.mjs [outDir]   (playwright next to this file or GAME_ROOT=<game>)
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || '.');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webp': 'image/webp',
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
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
ctx.setDefaultTimeout(120000);
// a pad the page can see: an Xbox one (the screen names its buttons A B X Y LB RB...), connected when the test says
await ctx.addInitScript(() => {
  window.__pad = { id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  window.__padOn = false;
  navigator.getGamepads = () => [window.__padOn ? window.__pad : null, null, null, null];
});
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + '\n' + e.stack));
p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const waitFor = async (fn, arg, ms = 120000, what = 'condition') => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(100); }
  throw new Error('timeout: ' + what);
};
// the game reads the keys and the pad once per drawn frame: a press is held long enough for a slow machine to see it
const key = async (k, hold = 160) => { await p.keyboard.down(k); await p.waitForTimeout(hold); await p.keyboard.up(k); await p.waitForTimeout(220); };
const btn = async (i, hold = 200) => {
  await p.evaluate((i) => { const x = window.__pad.buttons[i]; x.pressed = true; x.value = 1; }, i); await p.waitForTimeout(hold);
  await p.evaluate((i) => { const x = window.__pad.buttons[i]; x.pressed = false; x.value = 0; }, i); await p.waitForTimeout(260);
};
const maps = () => p.evaluate(async () => { const I = await import('./js/fight/input.js'); return JSON.parse(JSON.stringify({ k: I.KEYMAPS, pad: I.PADMAP })); });
const ui = () => p.evaluate(() => {
  const c = window.__game.controlsUI;
  return { open: c.open, tab: c.tab, wait: c.wait ? `${c.wait.a}:${c.wait.s}` : null, msg: document.querySelector('.ctl-msg')?.textContent || '', state: window.__game.state };
});
const slot = (g, r, s) => `.ctl-grid .slot[data-g="${g}"][data-r="${r}"][data-s="${s}"]`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const t0 = Date.now();
try {
  // (once the whole roster has loaded and the title's fighters have walked in: a slow machine's page is stuck for
  // seconds at a time before that, compiling them)
  const booted = () => window.__game?.state === 'title' && !!document.querySelector('#title.on') && window.__bootTimes?.roster != null && !window.__game.entrance;
  await p.goto(URL_);
  await waitFor(booted, null, 300000, 'title');
  await p.waitForTimeout(1000);
  const D = await maps();

  // ---- OPCIONES -> CONFIGURAR
  await p.click('#title [data-act="options"]', { force: true });
  await waitFor(() => !!document.querySelector('#overlay.on #optCtl'), null, 10000, 'options');
  await p.click('#optCtl');
  await waitFor(() => !!document.querySelector('#overlay.on .ctl'), null, 10000, 'controls screen');
  check((await ui()).tab === 'p1' && (await p.textContent(slot(1, 0, 0))) === 'U', 'OPCIONES -> CONFIGURAR opens the controls on the first player\'s keys (1 = U)');
  await p.screenshot({ path: path.join(OUT, 'controls_keys.png') });

  // ---- a free key into a slot
  await p.click(slot(1, 0, 0));
  check((await ui()).wait === 'b1:0' && (await p.getAttribute(slot(1, 0, 0), 'class')).includes('wait'), 'a click on 1\'s slot waits for a key');
  await key('o');
  let m = await maps();
  check(same(m.k.p1.b1, ['KeyO', 'KeyY']) && (await p.textContent(slot(1, 0, 0))) === 'O' && !(await ui()).wait, `O is now 1 (${JSON.stringify(m.k.p1.b1)})`);

  // ---- a key taken from another action swaps
  await p.click(slot(1, 1, 0));
  await key('o');
  m = await maps();
  check(same(m.k.p1.b2, ['KeyO', null]) && same(m.k.p1.b1, ['KeyI', 'KeyY']), `O given to 2: 1 takes 2's old key I (1 ${JSON.stringify(m.k.p1.b1)}, 2 ${JSON.stringify(m.k.p1.b2)})`);
  check(/se queda con «I»/.test((await ui()).msg), `the screen says what swapped: ${(await ui()).msg}`);

  // ---- a key taken from the other player swaps between the players
  await p.click('.ctl-tabs [data-tab="p2"]');
  check((await p.textContent(slot(1, 0, 0))) === '4 NUM', 'the second player\'s tab (1 = 4 NUM)');
  await p.click(slot(1, 0, 0));
  await key('a');
  m = await maps();
  check(m.k.p2.b1[0] === 'KeyA' && m.k.p1.left[0] === 'Numpad4', `A (the first player's left) given to the second player's 1: the first player's left takes 4 NUM (${m.k.p1.left[0]})`);
  check(/J1 · Izquierda/.test((await ui()).msg), `… and the screen names the other player: ${(await ui()).msg}`);

  // ---- Esc cancels, Supr clears, a reserved key is refused
  await p.click(slot(1, 1, 0)); await key('Escape');
  m = await maps();
  check(!(await ui()).wait && same(m.k.p2.b2, D.k.p2.b2) && (await ui()).open, 'Esc while a slot waits: nothing changes and the screen stays');
  await p.click(slot(1, 1, 1)); await key('Delete');
  m = await maps();
  check(same(m.k.p2.b2, ['Numpad5', null]) && (await p.getAttribute(slot(1, 1, 1), 'class')).includes('empty'), 'Supr leaves the slot empty');
  await p.click(slot(1, 2, 0)); await key('F2');
  check((await ui()).wait === 'b3:0' && /reservada/.test((await ui()).msg), `a reserved key (F2) is refused and the slot keeps waiting: ${(await ui()).msg}`);
  await key('Escape');

  // ---- the pad: R1 to its tab, the d-pad to a slot, A to change it, LB pressed: swaps with 1+2
  await p.evaluate(() => { window.__padOn = true; });
  await btn(5);
  let u = await ui();
  check(u.tab === 'pad' && /Mando Xbox/.test(u.msg) && (await p.textContent(slot(0, 0, 0))) === 'X', `RB goes to the pad's tab, named as an Xbox pad (1 = X): ${u.msg.slice(0, 40)}…`);
  await p.screenshot({ path: path.join(OUT, 'controls_pad.png') });
  // (from 1+3's main slot, the last one clicked: left, left -> 3's main slot)
  await btn(14); await btn(14);
  const sel = await p.evaluate(() => { const e = document.querySelector('.ctl .sel'); return e && `${e.dataset.g}${e.dataset.r}${e.dataset.s}`; });
  check(sel === '020', `the d-pad moves over the slots (on ${sel}: 3, main)`);
  await btn(0);
  check((await ui()).wait === 'b3:0', 'A opens the slot (A itself is not taken)');
  await btn(4);
  m = await maps();
  check(same(m.pad.b3, [4, null]) && same(m.pad.b12, [0, null]), `LB is now 3; 1+2 takes 3's old button A (3 ${JSON.stringify(m.pad.b3)}, 1+2 ${JSON.stringify(m.pad.b12)})`);
  await btn(0); await btn(13);
  m = await maps();
  check(!(await ui()).wait && same(m.pad.b3, [4, null]), 'the d-pad cancels a slot waiting for a button');
  await btn(3);
  check(same((await maps()).pad.b3, [null, null]) && await p.evaluate(() => [...document.querySelectorAll('.ctl td.warn')].some((td) => /^3/.test(td.textContent))), 'Y clears the slot; a fighter\'s button without any is marked');
  await p.click('.ctl [data-a="restore"]');
  m = await maps();
  check(same(m.pad, D.pad) && same(m.k, (await maps()).k) && !same(m.k, D.k), 'RESTAURAR MANDO: the pad as it was, the keys untouched');
  await btn(15); await btn(0); await btn(10);
  m = await maps();
  check(same(m.pad.b3, [0, 10]), `LS into 3's second slot (${JSON.stringify(m.pad.b3)})`);
  // ---- B goes back to OPCIONES, unsaved choices there kept
  await btn(1);
  check(!(await ui()).open && !!(await p.$('#overlay.on #optCtl')), 'B goes back to OPCIONES');
  await p.click('#overlay .actions [data-a="back"]');
  await waitFor(() => window.__game.state === 'title', null, 10000, 'title');
  await p.evaluate(() => { window.__padOn = false; });

  // ---- kept after a reload
  const saved = await p.evaluate(() => localStorage.getItem('pdb_controls'));
  await p.reload();
  await waitFor(booted, null, 300000, 'title after reload');
  await p.waitForTimeout(1000);
  m = await maps();
  check(!!saved && same(m.k.p1.b1, ['KeyI', 'KeyY']) && same(m.k.p1.b2, ['KeyO', null]) && m.k.p1.left[0] === 'Numpad4' && same(m.k.p2.b1, ['KeyA', 'Digit7']) && same(m.k.p2.b2, ['Numpad5', null]) && same(m.pad.b3, [0, 10]),
    'everything is still there after reloading the page');

  // ---- the menus follow the keys: S down, A (now the second player's 1) accepts, K (the first player's 4) goes back, U (no longer anything) does nothing
  await p.evaluate(() => { window.__game.menu.idx = 0; window.__game.refreshMenu(); });
  await key('s'); await key('a');
  check(await p.evaluate(() => window.__game.titleMenu === 'vs'), 'the title menu: S down and A (now a 1) accepts VERSUS');
  await key('k');
  check(await p.evaluate(() => window.__game.titleMenu === 'main'), '… K (a 4) goes back');
  await key('u');
  check(await p.evaluate(() => window.__game.titleMenu === 'main' && window.__game.state === 'title'), '… and U, not used any more, does nothing');

  // ---- a training fight with the new keys: O is 2, the pad's LS is 3; Enter pauses; CONTROLES from the pause
  await p.evaluate(() => { const g = window.__game; g.mode = 'training'; g.startFight('alejandro', 'arnau', { training: true }); });
  await waitFor(() => window.__game.state === 'fight' && window.__game.match?.phase === 'fight', null, 180000, 'training fight');
  await p.waitForTimeout(1000);
  // (the moves the fighter starts after a press, from standing still: a move starts in state 'move' at its frame 0
  // (moveName stays on the last one); and the moves his 2 and his 3 alone are)
  const moveOf = async (press) => {
    await waitFor(() => window.__game.match.fighters[0].state === 'idle', null, 10000, 'fighter idle');
    await p.evaluate(() => {
      const f = window.__game.match.fighters[0]; window.__mv = [];
      let last = -1;
      const t = () => { if (!window.__mv) return; if (f.state === 'move' && f.mf < last) window.__mv.push(f.moveName); if (f.state === 'move' && last < 0) window.__mv.push(f.moveName); last = f.state === 'move' ? f.mf : -1; requestAnimationFrame(t); };
      t();
    });
    await press();
    await p.waitForTimeout(900);
    return p.evaluate(() => { const s = window.__mv; window.__mv = null; return s; });
  };
  const alone = await p.evaluate(() => { const f = window.__game.match.fighters[0]; return Object.fromEntries(['1', '2', '3', '4'].map((b) => [b, f.commands.find((c) => c.str === b)?.move])); });
  const mvO = await moveOf(() => key('o', 120));
  check(mvO[0] === alone['2'], `O (now 2) does his 2 in the fight (${mvO.join(',')}; 2 = ${alone['2']})`);
  await p.evaluate(() => { window.__padOn = true; });
  const mvL = await moveOf(() => btn(10, 120));
  check(mvL[0] === alone['3'], `the pad's LS (now 3) does his 3 (${mvL.join(',')}; 3 = ${alone['3']})`);
  await p.evaluate(() => { window.__padOn = false; });
  await p.waitForTimeout(800);
  await key('Enter');
  check((await ui()).state === 'pause', 'Enter (the first player\'s pause key) pauses');
  check(await p.evaluate(() => !document.querySelector('#pause .menu.local [data-act="controls"]').hidden), 'the pause menu has CONTROLES');
  await p.click('#pause .menu.local [data-act="controls"]');
  u = await ui();
  check(u.open && u.state === 'overlay-pause', 'CONTROLES from the pause opens the screen over the paused fight');
  await key('Escape');
  check((await ui()).state === 'pause', 'Esc goes back to the pause');
  await key('Escape');
  check((await ui()).state === 'fight', 'Esc again goes on with the fight');
  await p.evaluate(() => { window.__game.backToTitle(); });
  await waitFor(() => window.__game.state === 'title', null, 60000, 'title');

  // ---- EXTRAS -> CONTROLES lists the keys as they are; CONFIGURAR -> RESTAURAR TECLADO
  // (the pad plugged in: its buttons are listed with the names printed on it)
  await p.evaluate(() => { window.__padOn = true; window.__game.showControls(); });
  let help = await p.textContent('#overlay .panel table');
  check(/1 = I \/ Y/.test(help) && /2 = O/.test(help) && /3 = A \/ LS/.test(help), `EXTRAS -> CONTROLES lists the new keys and buttons (${help.match(/1 = I \/ Y[^·]*/)?.[0]}, 3 = A / LS on the pad)`);
  await p.click('#overlay .actions [data-a="ok"]');
  await waitFor(() => !!document.querySelector('#overlay.on .ctl'), null, 10000, 'controls from the help');
  await p.click('.ctl [data-a="restore"]');
  m = await maps();
  check(same(m.k, D.k) && same(m.pad.b3, [0, 10]), 'RESTAURAR TECLADO: both players\' keys as they were (the pad untouched)');
  await p.screenshot({ path: path.join(OUT, 'controls_restored.png') });
  await key('Escape');
  help = await p.textContent('#overlay .panel table');
  check(/1 = U \/ Y/.test(help), 'back on the help, which lists the default keys again');
  await p.evaluate(() => { window.__padOn = false; });
  // (a set of controls saved by hand: a reserved key, a d-pad button, a key twice, actions missing; the second
  // player's 3 on U, which the first player's 1 has by default)
  await p.evaluate(() => localStorage.setItem('pdb_controls', JSON.stringify({ v: 1, p1: { b1: ['KeyQ', 'Escape'], b2: ['KeyQ', null], b4: ['KeyQ', 'KeyZ'] }, p2: { b3: ['KeyU', null] }, pad: { b1: [12, null] } })));
  await p.reload();
  await waitFor(() => window.__game?.state === 'title', null, 300000, 'title after the bad save');
  m = await maps();
  check(same(m.k.p1.b2, ['KeyQ', null]) && same(m.k.p1.b4, [null, 'KeyZ']) && same(m.k.p2.b3, ['KeyU', null]) && same(m.k.p1.b1, [null, 'KeyY']) && same(m.pad.b1, D.pad.b1) && same(m.k.p1.left, D.k.p1.left),
    `a bad save: what is wrong falls back to the defaults, a key twice kept once, a default giving way to the save (1 ${JSON.stringify(m.k.p1.b1)}, 2 ${JSON.stringify(m.k.p1.b2)}, 4 ${JSON.stringify(m.k.p1.b4)})`);
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await p.screenshot({ path: path.join(OUT, 'controls_fail.png') }).catch(() => {});
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `CONTROLS OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'CONTROLS FAILED');
await b.close(); server.close();
process.exit(ok ? 0 : 1);
