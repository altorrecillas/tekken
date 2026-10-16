// Touch-control integration test on an emulated phone (landscape): menus by tap, then stick drags and button
// presses through real multi-touch events (CDP), checking the fighter's state after each gesture.
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); }).listen(0, '127.0.0.1');
await new Promise(r => srv.on('listening', r)); const PORT = srv.address().port;
const W = 844, H = 390;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const cdp = await ctx.newCDPSession(p);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const dbg = async () => JSON.parse(await p.evaluate('window.__debug()'));
const wait = (ms) => p.waitForTimeout(ms);
const box = async (sel) => { const el = await p.$(sel); return el ? el.boundingBox() : null; };
const tapSel = async (sel) => { try { await p.waitForSelector(sel, { state: 'visible', timeout: 20000 }); } catch (e) { /* reported below */ } const bb = await box(sel); if (!bb) { console.log('NO BOX', sel, await p.evaluate('window.__debug()'), await p.evaluate(`document.querySelector('#touch').className`)); throw new Error('no ' + sel); } await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
const results = [];
const check = (name, ok, info = '') => { const l = `${ok ? 'PASS' : 'FAIL'} ${name} ${info}`; results.push(l); console.log(l); };
await p.goto(`http://127.0.0.1:${PORT}/index.html?frames=0&q=low&nodynres=1`, { timeout: 240000 });
await p.waitForFunction('window.__ready===true', null, { timeout: 600000, polling: 500 });
await wait(800);
check('touch UI detected', await p.evaluate("document.body.classList.contains('touchui')"));
check('touch controls hidden on title', await p.evaluate(`!document.querySelector('#touch').classList.contains('on')`));
// VERSUS: a submenu (2 players on this screen needs a gamepad on a touch screen; online on two phones)
await tapSel('#title .menu button[data-act=vsmenu]');
await wait(500);
check('VERSUS opens its submenu, 2 players marked as needing a gamepad', await p.evaluate(`!document.querySelector('#title .menu.vs').hidden && document.querySelector('#title .menu.main').hidden && document.querySelector('#title .menu.vs [data-act=versus]').classList.contains('off') && /MANDO/.test(document.querySelector('#title .menu.vs [data-act=versus]').textContent)`));
await tapSel('#title .menu.vs button[data-act=back]');
await wait(500);
check('VOLVER goes back to the main menu', await p.evaluate(`!document.querySelector('#title .menu.main').hidden && document.querySelector('#title .menu.vs').hidden`));
// menus by tap
await tapSel('#title .menu button[data-act=training]');
await wait(900);
check('select screen', (await dbg()).state === 'select');
await p.waitForSelector('#select .card[data-id=zapponi]', { state: 'visible', timeout: 20000 });
const cb = await box('#select .card[data-id=zapponi]');
// quick double tap (what iOS reads as double-tap zoom): first previews, second must still confirm
await p.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
const st1 = await p.evaluate("JSON.parse(window.__debug()).state");
await p.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
let d;
check('first tap previews (no confirm)', st1 === 'select');
await p.waitForFunction(`JSON.parse(window.__debug()).state === 'fight'`, null, { timeout: 300000, polling: 300 });
await p.waitForFunction(`(() => { const d = JSON.parse(window.__debug()); return d.phase === 'fight'; })()`, null, { timeout: 300000, polling: 300 });
await wait(400);
check('fight started as zapponi', (await dbg()).f[0].id === 'zapponi');
check('canvas buffer matches layout viewport', await p.evaluate(`(() => { const c = document.querySelector('#game'), r = c.width / c.height, v = innerWidth / innerHeight; return Math.abs(r - v) < 0.02; })()`), await p.evaluate(`document.querySelector('#game').width + 'x' + document.querySelector('#game').height`));
check('page not zoomed', await p.evaluate('(visualViewport?.scale ?? 1) === 1'));
check('touch controls visible in fight', await p.evaluate(`document.querySelector('#touch').classList.contains('on')`));
// stick: drag right from a point in the left zone -> walk forward (P1 faces right)
const x0 = 150, y0 = 300;
await touch('touchStart', [[x0, y0, 1]]); await wait(60);
await touch('touchMove', [[x0 + 60, y0, 1]]); await wait(700);
d = await dbg();
check('stick right -> walk forward', ['walkF', 'dashF'].includes(d.f[0].st), `(state ${d.f[0].st})`);
const px0 = d.f[0].pos[0], fr0 = d.frame;
// wait for simulated time, not wall time (software GL renders a few frames per second)
await p.waitForFunction(`JSON.parse(window.__debug()).frame >= ${fr0 + 30}`, null, { timeout: 300000, polling: 200 });
d = await dbg();
check('fighter moved right', d.f[0].pos[0] > px0 + 0.05, `(x ${px0} -> ${d.f[0].pos[0]})`);
await touch('touchEnd', []); await wait(400);
// stick down (crouch)
await touch('touchStart', [[x0, y0 - 40, 1]]); await wait(40); await touch('touchMove', [[x0, y0 + 20, 1]]); await wait(400);
d = await dbg(); check('stick down -> crouch', d.f[0].st === 'crouch', `(state ${d.f[0].st})`);
await touch('touchEnd', []); await wait(500);
// button 1 (jab)
const tb = async (n) => { const bb = await box(`#touch .tb.b${n}`); return [bb.x + bb.width / 2, bb.y + bb.height / 2]; };
let [bx, by] = await tb(1);
await touch('touchStart', [[bx, by, 2]]); await wait(90); await touch('touchEnd', []);
await wait(60); d = await dbg();
check('button 1 -> jab', d.f[0].mv === 'jab' || d.f[0].st === 'move', `(state ${d.f[0].st} mv ${d.f[0].mv})`);
await wait(700);
// chord 1+2 (Zapponi: lariat) by touching the gap between 1 and 2
const [ax, ay] = await tb(1), [cx2, cy2] = await tb(2);
await touch('touchStart', [[(ax + cx2) / 2, (ay + cy2) / 2, 3]]); await wait(90); await touch('touchEnd', []);
await wait(80); d = await dbg();
check('chord 1+2 -> lariat', d.f[0].mv === 'lariat', `(mv ${d.f[0].mv})`);
await wait(1200);
// stick down-forward held + button 2 (uppercut), two fingers
[bx, by] = await tb(2);
await touch('touchStart', [[x0, y0 - 30, 1]]); await wait(40);
await touch('touchMove', [[x0 + 45, y0 + 15, 1]]); await wait(120);
await touch('touchStart', [[x0 + 45, y0 + 15, 1], [bx, by, 4]]); await wait(90);
await touch('touchEnd', [[x0 + 45, y0 + 15, 1]]); await wait(60);
d = await dbg();
check('df + 2 -> uppercut', d.f[0].mv === 'uppercut', `(mv ${d.f[0].mv})`);
await touch('touchEnd', []); await wait(1200);
// slide from 3 to 4 (two presses in one stroke)
const [b3x, b3y] = await tb(3), [b4x, b4y] = await tb(4);
const seen = new Set();
await touch('touchStart', [[b3x, b3y, 5]]); await wait(50); seen.add((await dbg()).f[0].mv);
for (let k = 1; k <= 4; k++) { await touch('touchMove', [[b3x + (b4x - b3x) * k / 4, b3y + (b4y - b3y) * k / 4, 5]]); await wait(30); }
await wait(700); seen.add((await dbg()).f[0].mv);
await touch('touchEnd', []);
check('slide 3 -> 4 registers a new press', [...seen].some(m => m === 'roundhouse' || m === 'frontKick'), `(moves ${[...seen].join(',')})`);
await wait(1500);
// pause button, then resume by tap
await tapSel('#touchPause'); await wait(300);
check('pause by tap', (await dbg()).state === 'pause');
await tapSel('#pause .menu button[data-act=resume]'); await wait(300);
check('resume by tap', (await dbg()).state === 'fight');
// pause -> move list -> back
await tapSel('#touchPause'); await wait(250);
await tapSel('#pause .menu button[data-act=movelist]'); await wait(300);
check('move list opens', await p.evaluate(`document.querySelector('#overlay').classList.contains('on')`));
await tapSel('#overlay .actions [data-a=ok]'); await wait(300);
check('move list back to pause', (await dbg()).state === 'pause');
await tapSel('#pause .menu button[data-act=quit]');
await p.waitForFunction(`JSON.parse(window.__debug()).state === 'title'`, null, { timeout: 300000, polling: 300 });
check('quit to title by tap', true);
// options: open, change size, save
await tapSel('#title .menu button[data-act=options]'); await wait(400);
await p.selectOption('#optTz', '1.18'); await tapSel('#overlay .actions [data-a=ok]'); await wait(400);
check('options saved (large controls)', await p.evaluate(`JSON.parse(localStorage.getItem('pdb_touch')).size === 1.18`));
check('page not zoomed at end', await p.evaluate('(visualViewport?.scale ?? 1) === 1'));
console.log('errors:', errs.length ? errs.join(' | ') : 'none');
await b.close(); srv.close();
