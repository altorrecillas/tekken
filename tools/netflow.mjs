// The online versus end to end, on two "phones" (browsers with their own storage, like two devices) paired through
// a local stand-in for the PeerJS cloud (mocksignal.mjs), as a player would go through it:
//  - the host creates a fight; the other phone finds it by itself on the "WiFi" (or types the code) and joins;
//  - names on both sides, the rules set by the host reach the guest, ¡A LUCHAR! takes both to the select;
//  - each phone picks its fighter and sees the other's cursor; the host's stage reaches the guest;
//  - both load and start the intro together; the fight runs with both players pressing buttons, and the rollback
//    sessions agree on every state check (none corrected);
//  - a shared pause (paused on one phone, both stop; resumed with the countdown on both);
//  - the guest's WiFi dropping mid-fight: it comes back by itself to the same seat and the fight goes on;
//  - the end of the fight on both phones, the score; the replay on one phone ends exactly as the fight did;
//  - REVANCHA on both and a second fight;
//  - giving up a fight from the pause (the rival wins it on both), CAMBIAR LUCHADOR back to the select;
//  - the guest leaves: the host is told and its room stays open.
// usage: node netflow.mjs [outDir] [chromium|webkit (the guest's engine)] [code|wifi]   (CLOUD=1: the real PeerJS server)
// (playwright next to this file or GAME_ROOT=<game folder>; ?norender=1 keeps two software-GL pages fast)
import { chromium, webkit } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
import { mockSignal } from './mocksignal.mjs';

const ROOT = process.env.GAME_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '.';
const ENGINE = process.argv[3] || 'chromium';
const HOW = process.argv[4] || 'wifi';
const RENDER = !!process.env.RENDER; // draw the frames (screenshots look real; much slower in software GL)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.gz': 'application/gzip', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f.endsWith('/') ? f + 'index.html' : f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(0, r));
// CLOUD=1: the real PeerJS server instead of the local stand-in (needs internet)
const CLOUD = !!process.env.CLOUD;
const sig = CLOUD ? { close() {} } : await mockSignal();
const URL_ = `http://localhost:${server.address().port}/index.html?q=low&nodynres=1&netdebug=1&lankey=${CLOUD ? 'pdbtest' + Date.now() % 1e6 : 'testnet'}${CLOUD ? '' : `&sig=${encodeURIComponent(sig.url)}`}${RENDER ? '' : '&norender=1'}`;

const errors = [];
let ok = true;
const check = (c, what) => { console.log((c ? '  ok   ' : '  FAIL ') + what); if (!c) ok = false; };
const watch = (p, n) => {
  p.on('pageerror', (e) => errors.push(`${n} PAGEERROR ${e.message}\n${e.stack}`));
  p.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[net]')) console.log(`  (${n} ${t})`);
    if (m.type() === 'error' && !/404|ERR_CONNECTION_REFUSED|WebSocket|Failed to load resource/.test(t)) errors.push(`${n} ${t}`);
  });
};
const waitFor = async (p, fn, arg, ms = 60000, what = 'condition') => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(200); }
  throw new Error('timeout: ' + what);
};
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name) }).catch(() => {});
const S = (p) => p.evaluate(() => { const o = window.__online, s = o.session, m = window.__game.match; return { phase: o.phase, state: window.__game.state, frame: m && m.frame, mphase: m && m.phase, round: m && m.round,
  hp: m && m.fighters.map((f) => f.hp), maxHp: m && m.fighters.map((f) => f.maxHp), wins: m && m.wins, stats: s ? { ...s.stats } : o.lastStats, rinMax: s && s.rinMax, sframe: s && s.frame, paused: o.paused, score: o.score }; });
// hold some keys for a while on a page (this phone's player)
async function press(p, keys, ms) { for (const k of keys) await p.keyboard.down(k); await p.waitForTimeout(ms); for (const k of keys) await p.keyboard.up(k); }
// a little fight: each phone mashes its own pattern of moves for `sec` seconds
async function brawl(H, G, sec) {
  const t = Date.now();
  const hostSeq = [['KeyD'], ['KeyU'], ['KeyI'], ['KeyD', 'KeyJ'], ['KeyS', 'KeyK'], ['KeyA'], ['KeyU', 'KeyJ'], ['KeyD', 'KeyD'], ['KeyI']];
  const guestSeq = [['ArrowLeft'], ['KeyK'], ['KeyJ'], ['ArrowLeft', 'KeyU'], ['ArrowDown', 'KeyI'], ['ArrowRight'], ['KeyI', 'KeyK'], ['KeyW'], ['KeyU']];
  let i = 0;
  while (Date.now() - t < sec * 1000) {
    await Promise.all([press(H, hostSeq[i % hostSeq.length], 90 + (i % 3) * 60), press(G, guestSeq[(i * 7) % guestSeq.length], 80 + (i % 4) * 50)]);
    i++;
  }
}

const vp = { viewport: { width: 760, height: 400 } };
const args = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };
const bc = await chromium.launch(args);
const bw = ENGINE === 'webkit' ? await webkit.launch() : bc;
const H = await (await bc.newContext(vp)).newPage();
const G = await (await bw.newContext(vp)).newPage();
watch(H, 'host'); watch(G, `guest ${ENGINE}`);
const t0 = Date.now();
try {
  await Promise.all([H, G].map((p) => p.goto(URL_)));
  await Promise.all([H, G].map((p) => waitFor(p, () => !!document.querySelector('#title.on'), null, 180000, 'title')));
  check(true, `both phones at the title (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  // ---------------------------------------------------------------- the room
  await H.click('#title .menu button[data-act="vsmenu"]'); await H.click('#title .menu button[data-act="online"]');
  await G.click('#title .menu button[data-act="vsmenu"]'); await G.click('#title .menu button[data-act="online"]');
  await H.fill('#online [data-k=name]', 'Alex'); await H.press('#online [data-k=name]', 'Enter');
  await G.fill('#online [data-k=name]', 'Dani'); await G.press('#online [data-k=name]', 'Enter');
  await H.click('#online [data-a=host]');
  await waitFor(H, () => /^\d{4}$/.test(document.querySelector('#online [data-k=code]')?.textContent || ''), null, 20000, 'room code');
  const code = await H.evaluate(() => document.querySelector('#online [data-k=code]').textContent);
  check(true, `the host shows a room code (${code})`);
  check(await H.evaluate(() => document.querySelector('#online [data-a=go]').disabled), '¡A LUCHAR! waits for the other phone');
  if (HOW === 'wifi') {
    await waitFor(G, (c) => !!document.querySelector(`#online .ol-game[data-code="${c}"]`), code, 20000, 'game found on the WiFi');
    check(true, `the other phone finds the game on its WiFi by itself: "${await G.evaluate(() => document.querySelector('#online .ol-game').textContent)}"`);
    await G.click(`#online .ol-game[data-code="${code}"]`);
  } else {
    await G.click('#online [data-a=join]');
    await G.fill('#online .ol-codein', code);
  }
  await waitFor(G, () => !!document.querySelector('#online .ol-wait'), null, 30000, 'guest connected');
  await waitFor(H, () => !document.querySelector('#online [data-a=go]').disabled, null, 10000, 'host sees the guest');
  await waitFor(G, () => /Alex/.test(document.querySelector('#online .ol-wait').textContent), null, 10000, 'guest sees the host name');
  check(await H.evaluate(() => /Dani/.test(document.querySelector('#online .ol-slots').textContent)), 'names: the host sees "Dani", the guest sees "Alex"');
  // the host picks 1 round to win and 30 s
  await H.click('#online [data-a=rule][data-k=rounds][data-v="1"]');
  await H.click('#online [data-a=rule][data-k=time][data-v="30"]');
  await waitFor(G, () => /RONDAS PARA GANAR 1/.test(document.querySelector('#online .ol-rules').textContent.replace(/\s+/g, ' ')), null, 5000, 'rules on the guest');
  check(true, 'the rules set by the host show on the guest');
  await waitFor(H, () => (window.__online.net.guests[0]?.pongs || 0) > 1, null, 10000, 'pings');
  await shot(H, 'net_room_host.png'); await shot(G, 'net_room_guest.png');

  // ---------------------------------------------------------------- the select
  await H.click('#online [data-a=go]');
  await Promise.all([H, G].map((p) => waitFor(p, () => window.__game.state === 'select' && window.__game.mode === 'online', null, 20000, 'select')));
  check(true, '¡A LUCHAR! takes both phones to the fighters\' select');
  // host: Rafa (keys: right x3 then confirm); guest: Zapponi by tapping its card twice (touch-like) / clicking
  // (the mouse out of the way first: left where ¡A LUCHAR! was clicked it rests on a card, and a card under a mouse
  // takes the cursor, as a hover preview)
  await H.mouse.move(4, 4); await G.mouse.move(4, 4); await H.waitForTimeout(300);
  await H.evaluate(() => { window.__game.sel.i[0] = 0; window.__game.refreshSel(); window.__game.selMoved(0); });
  await waitFor(G, () => window.__game.sel.i[0] === 0, null, 5000, 'the host\'s cursor at the start');
  for (let i = 0; i < 3; i++) { await H.keyboard.press('KeyD'); await H.waitForTimeout(150); }
  await waitFor(G, () => window.__game.sel.i[0] === 3, null, 5000, 'the host\'s cursor on the guest');
  check(true, 'the guest sees the host\'s cursor move');
  await H.keyboard.press('KeyW'); // stage
  const hostStage = await H.evaluate(() => window.__game.stagePick);
  await waitFor(G, (st) => window.__game.stagePick === st, hostStage, 5000, 'stage on the guest');
  check(true, `the host's stage reaches the guest (${hostStage})`);
  await G.evaluate(() => { const c = document.querySelector('#select .card[data-id="zapponi"]'); c.click(); });
  await G.waitForTimeout(200);
  await G.evaluate(() => { const c = document.querySelector('#select .card[data-id="zapponi"]'); if (!window.__game.sel.done[1]) c.click(); });
  await waitFor(H, () => window.__game.sel.done[1] && window.__game.sel.i[1] === window.__game.roster.indexOf('zapponi'), null, 5000, 'guest pick on host');
  check(true, 'the guest picks Zapponi and the host sees it ready');
  await shot(H, 'net_select_host.png');
  await H.keyboard.press('KeyU');

  // ---------------------------------------------------------------- the fight
  await Promise.all([H, G].map((p) => waitFor(p, () => window.__online.phase === 'fight' && !!window.__online.session, null, 120000, 'fight')));
  const s0 = await Promise.all([S(H), S(G)]);
  check(s0[0].state === 'fight' && s0[1].state === 'fight', `both phones in the fight (host ${JSON.stringify(s0[0].hp)}, guest ${JSON.stringify(s0[1].hp)})`);
  const ids = await Promise.all([H, G].map((p) => p.evaluate(() => window.__game.match.fighters.map((f) => f.id).join(' vs '))));
  check(ids[0] === 'rafa vs zapponi' && ids[1] === ids[0], `the same fighters on both: ${ids[0]}`);
  // skip the intro with a button on the guest's phone: both skip it at the same frame
  await G.waitForTimeout(1500);
  await press(G, ['KeyU'], 120);
  await Promise.all([H, G].map((p) => waitFor(p, () => window.__game.match.phase === 'fight' || window.__game.match.round >= 1, null, 30000, 'round 1')));
  check(true, 'the intro skipped from the guest\'s phone ends on both');
  await brawl(H, G, 8);
  // (the two scripted players press at random: now and then eight seconds go by without a blow landing; they go on
  // a little longer before the check)
  for (let k = 0; k < 2; k++) {
    const st = await S(H);
    if (st.hp.some((h, i) => h < st.maxHp[i])) break;
    await brawl(H, G, 6);
  }
  const s1 = await Promise.all([S(H), S(G)]);
  console.log(`  host:  frame ${s1[0].frame} hp ${s1[0].hp} ${JSON.stringify(s1[0].stats)}`);
  console.log(`  guest: frame ${s1[1].frame} hp ${s1[1].hp} ${JSON.stringify(s1[1].stats)}`);
  check(s1[0].stats.checks > 3 && s1[1].stats.checks > 3, `state checks going on (${s1[0].stats.checks}, ${s1[1].stats.checks})`);
  check(s1[0].stats.desyncs === 0 && s1[1].stats.desyncs === 0, 'both phones agree on every check');
  check(s1[0].hp.some((h, i) => h < s1[0].maxHp[i]), `blows landed (hp ${s1[0].hp} of ${s1[0].maxHp})`);
  await shot(H, 'net_fight_host.png'); await shot(G, 'net_fight_guest.png');

  // ---------------------------------------------------------------- shared pause
  await H.keyboard.press('Escape');
  await waitFor(G, () => window.__online.paused && document.querySelector('#pause.on.net'), null, 5000, 'pause on the guest');
  const pf = await Promise.all([S(H), S(G)]);
  await H.waitForTimeout(1200);
  const pf2 = await Promise.all([S(H), S(G)]);
  check(pf2[0].frame === pf[0].frame && pf2[1].frame === pf[1].frame, `paused on the host's phone: both stand still (frames ${pf[0].frame}/${pf[1].frame})`);
  await shot(G, 'net_pause_guest.png');
  await G.keyboard.press('Escape'); // the guest goes on: countdown on both
  await Promise.all([H, G].map((p) => waitFor(p, () => !window.__online.paused, null, 8000, 'resumed')));
  check(true, 'the guest resumes: after the countdown both go on');

  // ---------------------------------------------------------------- the WiFi drops on the guest's phone
  // (its connection closed under it): it knocks again with the code by itself and the fight goes on where it was
  const fCut = (await S(H)).frame;
  await G.evaluate(() => window.__online.net.host.link.pc.close());
  await waitFor(G, () => window.__online.lostOn, null, 15000, 'the guest notices the cut');
  check(true, 'cut: the guest shows RECONECTANDO');
  await waitFor(G, () => !window.__online.lostOn && window.__online.net && window.__online.net.open, null, 40000, 'guest back');
  await waitFor(H, () => !window.__online.lostOn, null, 15000, 'host panel gone');
  await brawl(H, G, 3);
  const sc = await Promise.all([S(H), S(G)]);
  check(sc[0].frame > fCut + 60 && sc[1].stats.desyncs === 0 && sc[0].stats.desyncs === 0, `back in the same seat by itself: the fight goes on (frame ${fCut} -> ${sc[0].frame}), still in sync`);

  // ---------------------------------------------------------------- the end of the fight (30 s round)
  await brawl(H, G, 4);
  await Promise.all([H, G].map((p) => waitFor(p, () => window.__online.phase === 'results', null, 90000, 'results')));
  await Promise.all([H, G].map((p) => waitFor(p, () => !!document.querySelector('#overlay.on .ol-results'), null, 8000, 'results screen')));
  const r = await Promise.all([S(H), S(G)]);
  check(JSON.stringify(r[0].score) === JSON.stringify(r[1].score) && r[0].score[0] + r[0].score[1] === 1, `the fight is over on both, same score ${JSON.stringify(r[0].score)}`);
  const lastStats = [r[0].stats, r[1].stats];
  await shot(H, 'net_results_host.png'); await shot(G, 'net_results_guest.png');
  // (how the fight ended, for the replay below: read now, a JUGADA puts its own match in the game)
  const orig = await H.evaluate(() => ({ hp: window.__online.match.fighters.map((f) => f.hp), wins: window.__online.match.wins.slice() }));

  // ---------------------------------------------------------------- JUGADA DEL COMBATE (on the host's phone)
  // the best play again from the last final snapshot before it: the victim loses exactly the play's damage
  if (await H.evaluate(() => !!document.querySelector('#overlay [data-a=hl]'))) {
    const best = await H.evaluate(() => {
      const g = window.__game, B = window.__online.match.best, play = g.playHighlight.bind(g);
      window.__hlTrace = [];
      g.playHighlight = (src, onEnd) => {
        play(src, onEnd);
        const m = g.hl?.m; if (!m) return;
        window.__hlStart = m.frame;
        const step = m.step.bind(m);
        m.step = () => { step(); window.__hlTrace.push([m.frame, m.fighters[0].hp, m.fighters[1].hp]); };
      };
      return { att: B.att, f0: B.f0, f1: B.f1, dmg: B.dmg, hits: B.hits };
    });
    await H.click('#overlay [data-a=hl]');
    await waitFor(H, () => window.__game.state === 'highlight' && document.querySelector('#hlTag.on'), null, 120000, 'highlight running');
    await waitFor(H, () => window.__game.state !== 'highlight' && !!document.querySelector('#overlay.on .ol-results'), null, 240000, 'highlight to the end');
    const tr = await H.evaluate(() => ({ start: window.__hlStart, t: window.__hlTrace }));
    const hpAt = (f) => { const e = tr.t.find((x) => x[0] === f); return e ? e[2 - best.att] : null; };
    const before = best.f0 > tr.start ? hpAt(best.f0) : null, after = hpAt(best.f1);
    check(before !== null && after !== null && (Math.abs(before - after - best.dmg) < 0.01 || after <= 0),
      `▶ JUGADA from the snapshot of frame ${tr.start}: ${best.hits} hits, the victim goes from ${before} to ${after} (play's damage ${best.dmg}), then the results again`);
  } else check(true, 'no play of this fight is worth a JUGADA (no button, as it should be)');

  // ---------------------------------------------------------------- the replay (on the guest's phone)
  // the fight again from both players' recorded inputs: it must end exactly as it was played
  await G.click('#overlay [data-a=replay]');
  await waitFor(G, () => window.__game.replaying && window.__game.match.frame > 10 && document.querySelector('#replayTag.on'), null, 60000, 'replay running');
  check(true, 'REPETICIÓN plays the fight again on the guest\'s phone (REPETICIÓN tag on screen)');
  await waitFor(G, () => window.__game.match.phase === 'matchEnd', null, 240000, 'replay to the end');
  const rep = await G.evaluate(() => ({ hp: window.__game.match.fighters.map((f) => f.hp), wins: window.__game.match.wins.slice() }));
  check(JSON.stringify(rep) === JSON.stringify(orig), `the replay ends exactly as the fight did (hp ${rep.hp}, rounds ${rep.wins}${JSON.stringify(rep) === JSON.stringify(orig) ? '' : '; the fight: hp ' + orig.hp + ', rounds ' + orig.wins})`);
  await G.keyboard.press('KeyU'); // (any key ends it)
  await waitFor(G, () => !window.__game.replaying && !!document.querySelector('#overlay.on .ol-results'), null, 15000, 'back to the results');
  check(true, 'a key ends the replay and the results come back');

  // ---------------------------------------------------------------- rematch
  await H.click('#overlay [data-a=rematch]');
  await waitFor(G, () => /quiere la revancha/.test(document.querySelector('#overlay .ol-state')?.textContent || ''), null, 5000, 'host choice on guest');
  check(true, 'the guest sees that the host wants a rematch');
  await G.click('#overlay [data-a=rematch]');
  await Promise.all([H, G].map((p) => waitFor(p, () => window.__online.phase === 'fight' && !!window.__online.session && window.__game.match.frame > 30, null, 120000, 'second fight')));
  check(true, 'REVANCHA on both: a second fight starts');
  await brawl(H, G, 4);
  const s2 = await Promise.all([S(H), S(G)]);
  check(s2[0].stats.desyncs === 0 && s2[1].stats.desyncs === 0 && s2[0].stats.checks > 1, `second fight in sync too (${s2[0].stats.checks} checks)`);
  console.log(`  netcode, first fight: host ${JSON.stringify(lastStats[0])}\n                       guest ${JSON.stringify(lastStats[1])}`);

  // ---------------------------------------------------------------- giving up, and back to the select
  await G.keyboard.press('Escape');
  await waitFor(G, () => document.querySelector('#pause.on.net'), null, 5000, 'guest pause menu');
  await waitFor(H, () => window.__online.paused, null, 5000, 'host paused too');
  await G.evaluate(() => [...document.querySelectorAll('#pause .menu.net button')].find((b) => b.dataset.act === 'forfeit').click());
  await Promise.all([H, G].map((p) => waitFor(p, () => !!document.querySelector('#overlay.on .ol-results'), null, 15000, 'results after forfeit')));
  const ff = await Promise.all([S(H), S(G)]);
  check(ff[0].score[0] === r[0].score[0] + 1 && JSON.stringify(ff[0].score) === JSON.stringify(ff[1].score) && /abandonado/.test(await H.evaluate(() => document.querySelector('.ol-why').textContent)),
    `ABANDONAR COMBATE: the fight goes to the rival on both phones (score ${JSON.stringify(ff[0].score)})`);
  // the host wants other fighters, the guest a rematch: back to the select (the room is not left)
  await H.click('#overlay [data-a=select]');
  await G.click('#overlay [data-a=rematch]');
  await Promise.all([H, G].map((p) => waitFor(p, () => window.__game.state === 'select' && window.__online.phase === 'select', null, 30000, 'select again')));
  check(true, 'CAMBIAR LUCHADOR on one phone takes both back to the select');

  // ---------------------------------------------------------------- the guest leaves
  await G.click('#selBack');
  await waitFor(H, () => window.__online.phase === 'room' && !!document.querySelector('#online .ol-room'), null, 30000, 'host back in the room');
  check(await H.evaluate(() => /^\d{4}$/.test(document.querySelector('#online [data-k=code]').textContent)), 'the guest leaves: the host is told and its room stays open with the same code');
  await waitFor(G, () => window.__online.phase === 'lobby', null, 20000, 'guest in the lobby');
  check(true, 'the guest is back in the online menu');
} catch (e) {
  ok = false;
  console.log('  FAIL ' + e.message);
  await shot(H, 'net_fail_host.png'); await shot(G, 'net_fail_guest.png');
  for (const [n, p] of [['host', H], ['guest', G]]) console.log(`  ${n}:`, JSON.stringify(await S(p).catch((x) => x.message)));
}
if (errors.length) { ok = false; console.log('errors:\n' + errors.join('\n')); }
console.log(ok ? `NETFLOW OK (${((Date.now() - t0) / 1000).toFixed(0)} s)` : 'NETFLOW FAILED');
await bc.close(); if (bw !== bc) await bw.close();
sig.close(); server.close();
process.exit(ok ? 0 : 1);
