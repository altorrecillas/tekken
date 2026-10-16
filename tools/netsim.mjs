// Checks of the fight simulation for the online mode, without a browser or a network:
//  1. determinism: two matches fed the same inputs stay identical to the bit, frame after frame;
//  2. rollback: a snapshot loaded back and replayed gives exactly the frames it gave the first time, also after
//     playing other inputs in between (nothing the simulation needs is missing from js/net/simstate.js);
//  3. the network copy: a snapshot through packSnap / JSON / unpackSnap into another match of the same two fighters
//     goes on identically;
//  4. the rollback session itself (js/net/rollback.js): two of them joined by a fake network with latency, jitter
//     and loss play a whole match and agree on every checkpoint (see the 'session' part).
// The inputs come from two CPU players (Math.random seeded) recorded once, so the fight has everything: strings,
// throws and their escapes, launches and juggles, Rage Arts, knockouts, rounds and the end of the match.
// usage: node --import ./register.mjs netsim.mjs [--pairs a:b,c:d] [--frames N] [--only det,rollback,pack,session]
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
if (!globalThis.btoa) { globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64'); globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary'); }
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { AIController } = await import(GAME + '/js/fight/ai.js');
const { Ragdolls } = await import(GAME + '/js/fight/ragdoll.js');
const { Snap, saveMatch, loadMatch, hashSnap, packSnap, unpackSnap } = await import(GAME + '/js/net/simstate.js');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PAIRS = (opt('pairs') || 'alejandro:rafa,zapponi:camilo,dani:arnau,rafa:rafa').split(',').map((p) => p.split(':'));
const FRAMES = +(opt('frames') || 5400);
const ONLY = opt('only') ? opt('only').split(',') : null;
const run = (k) => !ONLY || ONLY.includes(k);

// ------------------------------------------------------------------ seeded randomness (the CPU players)
let seed = 12345;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = rnd;

// ------------------------------------------------------------------ fighters and a match without a screen
const cache = {};
function load(id) {
  if (cache[id]) return cache[id];
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`));
  const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  return (cache[id] = { id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
}
const mat = () => new THREE.MeshBasicMaterial();
const noop = new Proxy({}, { get: () => () => {} });
const stages = { arenaRadius: 6.2, clampWalk(p, r = 0) { const lim = 6.15 - r; if (p.x > lim) p.x = lim; else if (p.x < -lim) p.x = -lim; return p; } };

// the same presentation stand-in the online session gives the match: effects do nothing, a knockout spawns the
// ragdoll (a flag for the simulation), a new round clears them all
function makeMatch(ids, stats) {
  const chars = ids.map((id) => buildCharacter(load(id), mat));
  const rag = new Ragdolls(null); rag.drivePos = false;
  const game = {
    fx: noop, hud: noop, audio: null, stage: stages,
    camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
    ragdolls: { clear() { for (const f of m.fighters) f.ragdoll = null; rag.clear(); }, freeze() { rag.freeze(); } },
    onKO(att, def, p) { rag.spawn(def, att, p); if (stats) stats.kos++; },
    onMatchEnd(mm) { if (stats) stats.ended = mm.frame; },
  };
  const m = new Match(game, chars, ids, { det: true });
  m.crand = () => 0.5; m.later = () => {};
  return m;
}
// controllers that hand the match the recorded input of the frame being simulated
function replay(m, rec) {
  m.fighters.forEach((f, i) => { f.ctrl = { poll: () => rec[m.frame - 1]?.[i] || { dx: 0, dy: 0, held: 0, pressed: 0 } }; });
}

let failures = 0;
const check = (c, what) => { console.log((c ? '  ok   ' : '  FAIL ') + what); if (!c) failures++; };
const snap = new Snap();
const hashOf = (m) => hashSnap(m, saveMatch(m, snap), true);

for (const ids of (run('det') || run('rollback') || run('pack') ? PAIRS : [])) {
  console.log(`\n== ${ids.join(' vs ')} ==`);
  // ---------------------------------------------------------------- the recording: two CPU players
  seed = 1000 + ids.join('').length * 77;
  const stats = { kos: 0, ended: 0 };
  const R = makeMatch(ids, stats);
  const ais = [new AIController(5), new AIController(4)];
  const rec = [];
  R.fighters.forEach((f, i) => { ais[i].attach(f, R); f.ctrl = { poll: () => { const v = ais[i].poll(); (rec[R.frame - 1] || (rec[R.frame - 1] = []))[i] = { ...v }; return v; } }; });
  R.startIntro();
  const hashes = [hashOf(R)];
  const seen = { throws: 0, rage: 0, rounds: new Set(), states: new Set() };
  let tStep = 0;
  for (let i = 0; i < FRAMES; i++) {
    const t0 = performance.now(); R.step(); tStep += performance.now() - t0;
    hashes.push(hashOf(R));
    if (R.throwLock && R.throwLock.t === 1) seen.throws++;
    if (R.rageLock && R.rageLock.t === 1) seen.rage++;
    seen.rounds.add(R.round);
    for (const f of R.fighters) seen.states.add(f.state);
  }
  console.log(`  recorded ${FRAMES} frames (${(tStep / FRAMES).toFixed(3)} ms a step): rounds ${[...seen.rounds].join(',')}, ${stats.kos} KOs, ${seen.throws} throws, ${seen.rage} Rage Arts, match end at ${stats.ended || '-'}, states ${seen.states.size}`);

  // ---------------------------------------------------------------- 1. determinism
  if (run('det')) {
    const A = makeMatch(ids);
    replay(A, rec); A.startIntro();
    let bad = -1;
    if (hashOf(A) !== hashes[0]) bad = 0;
    for (let i = 0; i < FRAMES && bad < 0; i++) { A.step(); if (hashOf(A) !== hashes[i + 1]) bad = i + 1; }
    check(bad < 0, `the same inputs give the same fight, bit for bit${bad >= 0 ? ` (differs from frame ${bad})` : ''}`);
  }

  // ---------------------------------------------------------------- 2. rollback
  if (run('rollback')) {
    const B = makeMatch(ids);
    replay(B, rec); B.startIntro();
    const wrong = rec.map((fr) => fr && fr.map((x) => ({ dx: -x.dx, dy: x.dy ? 0 : -1, held: x.held ^ 5, pressed: x.pressed ? 0 : 2 })));
    const s0 = new Snap();
    let bad = -1, rewinds = 0, maxBack = 0, tSave = 0, tLoad = 0, saves = 0;
    let next = 3;
    for (let fr = 0; fr < FRAMES && bad < 0;) {
      if (fr === next) {
        // rewind: save here, play 1..10 frames of other inputs (a misprediction), load and replay the real ones
        const n = 1 + Math.floor(rnd() * 10);
        let t0 = performance.now(); saveMatch(B, s0); tSave += performance.now() - t0; saves++;
        const real = B.fighters.map((f) => f.ctrl);
        B.fighters.forEach((f, i) => { f.ctrl = { poll: () => wrong[B.frame - 1]?.[i] || { dx: 1, dy: 0, held: 0, pressed: 0 } }; });
        for (let k = 0; k < n && fr + k < FRAMES; k++) B.step();
        t0 = performance.now(); loadMatch(B, s0); tLoad += performance.now() - t0;
        B.fighters.forEach((f, i) => { f.ctrl = real[i]; });
        if (hashOf(B) !== hashes[fr]) { bad = fr; break; }
        rewinds++; maxBack = Math.max(maxBack, n);
        next = fr + 1 + Math.floor(rnd() * 12);
      }
      B.step(); fr++;
      if (hashOf(B) !== hashes[fr]) bad = fr;
    }
    check(bad < 0, `${rewinds} rewinds of up to ${maxBack} frames replay exactly${bad >= 0 ? ` (differs at frame ${bad})` : ''}`);
    console.log(`        snapshot ${snap.nf} numbers + ${snap.nr} references; save ${(tSave / saves * 1000).toFixed(0)} µs, load ${(tLoad / saves * 1000).toFixed(0)} µs`);
  }

  // ---------------------------------------------------------------- 3. the network copy
  if (run('pack')) {
    const A = makeMatch(ids);
    replay(A, rec); A.startIntro();
    let bad = null, copies = 0, bytes = 0;
    for (let fr = 1; fr < FRAMES - 300 && !bad; fr++) {
      A.step();
      if (fr % 700 !== 0) continue;
      // a fresh match of the same two fighters takes the copy and plays on: every frame as recorded (a knocked-out
      // body travels as a flag, which is all the simulation reads of it)
      const wire = JSON.stringify(packSnap(A, saveMatch(A, new Snap())));
      bytes = wire.length;
      const C = makeMatch(ids);
      replay(C, rec); C.startIntro();
      loadMatch(C, unpackSnap(C, JSON.parse(wire)));
      copies++;
      if (hashOf(C) !== hashes[fr]) { bad = `on arrival, frame ${fr}`; break; }
      for (let k = 1; k <= 300; k++) { C.step(); if (hashOf(C) !== hashes[fr + k]) { bad = `${k} frames after ${fr}`; break; } }
    }
    check(!bad, `${copies} copies through the network format (${(bytes / 1024).toFixed(1)} KB each) go on identically${bad ? ` (differs: ${bad})` : ''}`);
  }
}

// ------------------------------------------------------------------ 4. two rollback sessions over a fake network
if (run('session')) {
  const { sessionTest } = await import('./netsession.mjs');
  failures += await sessionTest({ makeMatch, load, check, rnd });
}

console.log(failures ? `\nNETSIM FAILED (${failures})` : '\nNETSIM OK');
process.exit(failures ? 1 : 0);
