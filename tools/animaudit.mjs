// Animation audit. Plays every move of every fighter against a standing opponent that takes the hit and against one
// that blocks, plus the movement states, throws, Rage Art, intro / win poses and AI fights, and measures per frame:
//  - limbs going through the own body or the opponent's (volumes fitted to each fighter's skinned mesh, so bellies
//    and broad chests count), hands and arms through the head, legs through each other;
//  - joints past anatomical limits (neck, spine twist, hip, knee-over-toe alignment, elbow/knee folding, wrist, ankle);
//  - body parts under the floor;
//  - single-frame pops (position and rotation spikes against their neighbourhood).
// usage: node --import ./register.mjs animaudit.mjs [--fighters a,b] [--moves m1,m2] [--opps a,b] [--ai frames]
//        [--only moves|motion|throws|rage|poses|ai] [--json out.json] [--top N]
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { AIController } = await import(GAME + '/js/fight/ai.js');
const { B1 } = await import(GAME + '/js/fight/input.js');

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const ALL = ['alejandro', 'arnau', 'camilo', 'rafa', 'zapponi', 'dani'];
const FIGHTERS = (opt('fighters') || ALL.join(',')).split(',');
const OPPS = (opt('opps') || 'camilo,zapponi').split(',');
const ONLY_MOVES = opt('moves') ? opt('moves').split(',') : null;
const ONLY = opt('only') ? opt('only').split(',') : null;
const AI_FRAMES = +(opt('ai') || 2400);
const TOP = +(opt('top') || 40);
const run = (k) => !ONLY || ONLY.includes(k);

// ------------------------------------------------------------------ loading
const cache = {};
function load(id) {
  if (cache[id]) return cache[id];
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`));
  const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  return (cache[id] = { id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
}
const mat = () => new THREE.MeshBasicMaterial();

// ------------------------------------------------------------------ body model (the rig's own volumes)
const { BodyState, capsuleDepth } = await import(GAME + '/js/anim/body.js');
const _qa = new THREE.Vector3(), _qb = new THREE.Vector3(), _q = new THREE.Quaternion();
// penetration depth of segment q (optionally only its [q0,q1] fraction) into segment t
function depth(q, t, qFrom = 0, qTo = 1) {
  if (!q.ok || !t.ok) return -1;
  _qa.lerpVectors(q.A, q.B, qFrom); _qb.lerpVectors(q.A, q.B, qTo);
  const rq = q.vol.ell ? Math.min(q.vol.rx, q.vol.rz) : q.vol.r;
  return capsuleDepth(_qa, _qb, rq, t);
}
function segState(f, st) { st.update(f.rig.world, { pos: f.pos, yaw: f.yaw }); return st.seg; }

// ------------------------------------------------------------------ issue bookkeeping
const ISS = {};
let curScenario = '';
function report(kind, who, where, detail, amount, ctx) {
  const k = `${kind}|${who}|${where}|${detail}`;
  const o = ISS[k] || (ISS[k] = { kind, who, where, detail, n: 0, max: 0, ctx: '', scen: new Set() });
  o.n++; o.scen.add(curScenario);
  if (amount > o.max) { o.max = amount; o.ctx = ctx; }
}
function whereOf(f) {
  if (f.state === 'move' && f.move) return `move:${f.moveName}`;
  if (f.state === 'rageArt') return `rageArt:${f.clipName}`;
  return `${f.state}:${f.clipName}`;
}
function frameOf(f) { return f.state === 'move' || f.state === 'rageArt' ? f.mf : Math.round(f.cf); }

// ------------------------------------------------------------------ checks
const SELF = [
  // [query, target, tolerance m, query fraction from..to, label]
  ...['L', 'R'].flatMap(s => [
    [`hand.${s}`, 'hips', 0.015], [`hand.${s}`, 'belly', 0.015], [`hand.${s}`, 'chest', 0.015], [`hand.${s}`, 'upper', 0.015], [`hand.${s}`, 'head', 0.012], [`hand.${s}`, 'neck', 0.015],
    [`hand.${s}`, 'thigh.L', 0.02], [`hand.${s}`, 'thigh.R', 0.02],
    [`farm.${s}`, 'hips', 0.02], [`farm.${s}`, 'belly', 0.02], [`farm.${s}`, 'chest', 0.02, 0.25, 1], [`farm.${s}`, 'head', 0.015], [`farm.${s}`, 'neck', 0.02],
    [`farm.${s}`, 'thigh.L', 0.025], [`farm.${s}`, 'thigh.R', 0.025],
    [`uarm.${s}`, 'belly', 0.03, 0.45, 1], [`uarm.${s}`, 'hips', 0.03, 0.45, 1], [`uarm.${s}`, 'head', 0.02, 0.3, 1],
    [`shin.${s}`, 'belly', 0.02, 0, 0.35], [`shin.${s}`, 'chest', 0.02, 0, 0.35], [`foot.${s}`, 'hips', 0.015], [`foot.${s}`, 'belly', 0.015], [`foot.${s}`, 'chest', 0.015], [`foot.${s}`, 'head', 0.01],
  ]),
  ['hand.L', 'hand.R', 0.02], ['farm.L', 'farm.R', 0.02], ['hand.L', 'farm.R', 0.02], ['hand.R', 'farm.L', 0.02],
  ['thigh.L', 'thigh.R', 0.035, 0.3, 1], ['shin.L', 'shin.R', 0.015], ['foot.L', 'foot.R', 0.015], ['foot.L', 'shin.R', 0.015], ['foot.R', 'shin.L', 0.015],
  ['shin.L', 'thigh.R', 0.02, 0.2, 1], ['shin.R', 'thigh.L', 0.02, 0.2, 1],
];
const LIMBS = ['hand.L', 'hand.R', 'farm.L', 'farm.R', 'uarm.L', 'uarm.R', 'foot.L', 'foot.R', 'shin.L', 'shin.R', 'thigh.L', 'thigh.R'];
const TARGETS = ['head', 'neck', 'upper', 'chest', 'belly', 'hips', 'uarm.L', 'uarm.R', 'farm.L', 'farm.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'hand.L', 'hand.R', 'foot.L', 'foot.R'];
const GROUND_EXEMPT = new Set(['down', 'land', 'ko', 'thrown']);

const eul = new THREE.Euler();
function relEuler(qa, qb) { // rotation of b relative to a, YXZ
  _q.copy(qa).invert().multiply(qb);
  return eul.setFromQuaternion(_q, 'YXZ');
}
const deg = (r) => r * 180 / Math.PI;
const angBetween = (u, v) => Math.acos(Math.max(-1, Math.min(1, u.dot(v) / Math.max(1e-9, u.length() * v.length()))));

function checkFighter(f, segs, ctxBase) {
  const who = f.id, where = whereOf(f), fr = frameOf(f);
  const ctx = `${ctxBase} · ${f.id} ${where} f${fr}`;
  // --- self intersections
  for (const [a, b, tol, q0 = 0, q1 = 1] of SELF) {
    const d = depth(segs[a], segs[b], q0, q1);
    if (d > tol) report('self', who, where, `${a}→${b}`, d - tol, ctx + ` (${(d * 100).toFixed(1)}cm)`);
  }
  // --- floor
  if (!GROUND_EXEMPT.has(f.state)) {
    for (const [n, s] of Object.entries(segs)) {
      if (!s.ok) continue;
      const r = s.vol.ell ? Math.min(s.vol.rx, s.vol.rz) : s.vol.r;
      // the foot capsule's ball end sits on the sole (the joint is ~3 cm above the floor, not a full radius)
      const lo = n.startsWith('foot') ? Math.min(s.A.y - r, s.B.y - 0.03) : Math.min(s.A.y, s.B.y) - r;
      const tol = n.startsWith('foot') ? 0.02 : 0.015;
      if (lo < -tol) report('floor', who, where, n, -lo - tol, ctx + ` (${(-lo * 100).toFixed(1)}cm)`);
    }
  } else {
    for (const n of ['head', 'chest', 'hips', 'belly']) {
      const s = segs[n]; if (!s.ok) continue;
      const lo = Math.min(s.A.y, s.B.y) - (s.vol.ell ? Math.min(s.vol.rx, s.vol.rz) : s.vol.r);
      if (lo < -0.04) report('floor', who, where, n + ' (lying)', -lo - 0.04, ctx + ` (${(-lo * 100).toFixed(1)}cm)`);
    }
  }
  // --- joints
  const W = f.rig.world;
  if (W.head && W.spine01 && W.spine05) {
    const e = relEuler(W.spine01.q, W.head.q);
    if (Math.abs(e.y) > 1.45) report('joint', who, where, 'neck yaw>83°', deg(Math.abs(e.y)) - 83, ctx + ` (${deg(e.y).toFixed(0)}°)`);
    if (e.x > 0.95) report('joint', who, where, 'neck flexion>55°', deg(e.x) - 55, ctx + ` (${deg(e.x).toFixed(0)}°)`);
    if (e.x < -0.95) report('joint', who, where, 'neck extension>55°', deg(-e.x) - 55, ctx + ` (${deg(e.x).toFixed(0)}°)`);
    if (Math.abs(e.z) > 0.7) report('joint', who, where, 'neck roll>40°', deg(Math.abs(e.z)) - 40, ctx + ` (${deg(e.z).toFixed(0)}°)`);
    const t = relEuler(W.spine05.q, W.spine01.q);
    if (Math.abs(t.y) > 1.1) report('joint', who, where, 'spine twist>63°', deg(Math.abs(t.y)) - 63, ctx + ` (${deg(t.y).toFixed(0)}°)`);
    if (t.x < -0.75) report('joint', who, where, 'spine backbend>43°', deg(-t.x) - 43, ctx + ` (${deg(t.x).toFixed(0)}°)`);
    if (Math.abs(t.z) > 0.7) report('joint', who, where, 'spine side bend>40°', deg(Math.abs(t.z)) - 40, ctx + ` (${deg(t.z).toFixed(0)}°)`);
  }
  const rootQ = W.root?.q;
  for (const s of ['L', 'R']) {
    const sg = s === 'L' ? 1 : -1;
    const H = W['upperleg01.' + s]?.p, K = W['lowerleg01.' + s]?.p, A = W['foot.' + s]?.p;
    const T = W['foot.' + s] ? f.ch.rest['toe3-1.' + s].head.clone().sub(f.ch.rest['foot.' + s].head).applyQuaternion(W['foot.' + s].q).add(A) : null;
    if (H && K && A && rootQ) {
      const u = new THREE.Vector3().subVectors(K, H).applyQuaternion(_q.copy(rootQ).invert()).normalize();
      // thigh elevation from hanging straight down, against a limit that depends on the direction it is raised:
      // forwards (flexion) 130, outwards (abduction, kicks with the hip turned over) 115, backwards (extension)
      // 40, across the body (adduction) 35 degrees
      const elev = Math.acos(Math.max(-1, Math.min(1, -u.y)));
      const az = Math.atan2(u.x * sg, u.z); // 0 forwards, +90 outwards, 180 back, -90 across
      const A_ = [[-180, 40], [-90, 35], [0, 130], [90, 115], [180, 40]];
      const azd = deg(az);
      let lim = 40;
      for (let i = 1; i < A_.length; i++) if (azd <= A_[i][0]) { const [a0, l0] = A_[i - 1], [a1, l1] = A_[i]; lim = l0 + (l1 - l0) * (azd - a0) / (a1 - a0); break; }
      if (elev > 0.35 && deg(elev) > lim) {
        const dirName = Math.abs(azd) < 45 ? 'flexion' : azd >= 45 && azd <= 135 ? 'abduction' : azd <= -45 && azd >= -135 ? 'adduction' : 'extension';
        report('joint', who, where, `hip ${dirName} past limit ${s}`, deg(elev) - lim, ctx + ` (${deg(elev).toFixed(0)}° at ${azd.toFixed(0)}°, limit ${lim.toFixed(0)}°)`);
      }
      const inner = angBetween(new THREE.Vector3().subVectors(H, K), new THREE.Vector3().subVectors(A, K));
      if (inner < 0.52) report('joint', who, where, `knee folded<30° ${s}`, 30 - deg(inner), ctx + ` (${deg(inner).toFixed(0)}°)`);
      // knee over the toes: a bent knee must point roughly where the foot points
      const bend = Math.PI - inner;
      if (T && bend > 0.35 && A.y < 0.12 && !['down', 'land', 'ko', 'getup', 'tech', 'air', 'thrown'].includes(f.state)) {
        const mid = new THREE.Vector3().addVectors(H, A).multiplyScalar(0.5);
        const kd = new THREE.Vector3().subVectors(K, mid); kd.y = 0;
        const fd = new THREE.Vector3().subVectors(T, A); fd.y = 0;
        if (kd.length() > 0.02 && fd.length() > 0.03) {
          const a = angBetween(kd, fd);
          if (a > 0.96) report('joint', who, where, `knee vs toes>55° ${s}`, deg(a) - 55, ctx + ` (${deg(a).toFixed(0)}°)`);
        }
      }
      if (T) {
        const ank = angBetween(new THREE.Vector3().subVectors(K, A), new THREE.Vector3().subVectors(T, A));
        if (ank < 1.13) report('joint', who, where, `ankle dorsiflexion ${s}`, 65 - deg(ank), ctx + ` (${deg(ank).toFixed(0)}°)`);
        if (ank > 3.0) report('joint', who, where, `ankle plantarflexion ${s}`, deg(ank) - 172, ctx + ` (${deg(ank).toFixed(0)}°)`);
      }
    }
    const S = W['upperarm01.' + s]?.p, E = W['lowerarm01.' + s]?.p, Wr = W['wrist.' + s]?.p;
    const F3 = W['wrist.' + s] ? f.rig.knuckle[s].clone().applyQuaternion(W['wrist.' + s].q).add(Wr) : null;
    if (S && E && Wr) {
      const inner = angBetween(new THREE.Vector3().subVectors(S, E), new THREE.Vector3().subVectors(Wr, E));
      if (inner < 0.49) report('joint', who, where, `elbow folded<28° ${s}`, 28 - deg(inner), ctx + ` (${deg(inner).toFixed(0)}°)`);
      if (F3) {
        const wa = angBetween(new THREE.Vector3().subVectors(Wr, E), new THREE.Vector3().subVectors(F3, Wr));
        if (wa > 1.13) report('joint', who, where, `wrist bent>65° ${s}`, deg(wa) - 65, ctx + ` (${deg(wa).toFixed(0)}°)`);
      }
    }
  }
}

function checkPair(a, b, sa, sb, ctxBase) {
  const where = `${whereOf(a)} vs ${whereOf(b)}`;
  const ctx = `${ctxBase} · ${a.id} ${whereOf(a)} f${frameOf(a)} / ${b.id} ${whereOf(b)} f${frameOf(b)}`;
  const strikeA = a.state === 'move' && a.move?.hit ? a.move.hit.limb : null;
  const strikeB = b.state === 'move' && b.move?.hit ? b.move.hit.limb : null;
  const limbSeg = { handL: 'hand.L', handR: 'hand.R', footL: 'foot.L', footR: 'foot.R', kneeL: 'shin.L', kneeR: 'shin.R', forearmR: 'farm.R', forearmL: 'farm.L', head: 'head', belly: 'belly' };
  for (const qa of LIMBS.concat(['head', 'upper', 'chest', 'belly', 'hips'])) {
    for (const tb of TARGETS) {
      // torso-torso once (a's torso into b's torso), limbs both ways below
      const d = depth(sa[qa], sb[tb]);
      const tol = (limbSeg[strikeA] === qa ? 0.045 : 0.03);
      if (d > tol) report('cross', a.id, where, `${a.id}.${qa}→${b.id}.${tb}`, d - tol, ctx + ` (${(d * 100).toFixed(1)}cm)`);
    }
  }
  for (const qb of LIMBS) {
    for (const ta of ['head', 'neck', 'upper', 'chest', 'belly', 'hips']) {
      const d = depth(sb[qb], sa[ta]);
      const tol = (limbSeg[strikeB] === qb ? 0.045 : 0.03);
      if (d > tol) report('cross', b.id, `${whereOf(b)} vs ${whereOf(a)}`, `${b.id}.${qb}→${a.id}.${ta}`, d - tol, ctx + ` (${(d * 100).toFixed(1)}cm)`);
    }
  }
}

// ------------------------------------------------------------------ pops
const POP_BONES = [['wrist', 0.05], ['lowerarm01', 0.04], ['foot', 0.05], ['lowerleg01', 0.04]];
const POP_CENTRE = [['head', 0.03], ['spine01', 0.025], ['spine05', 0.02]];
const ROT_BONES = ['head', 'spine01', 'root', 'wrist.L', 'wrist.R', 'foot.L', 'foot.R'];
function popTracker(f) {
  const names = [...POP_BONES.flatMap(([n, t]) => [[n + '.L', t], [n + '.R', t]]), ...POP_CENTRE];
  return { f, names, P: [], Q: [], meta: [] };
}
function popPush(T, frozen) {
  const f = T.f, W = f.rig.world;
  if (frozen) { T.P.length = 0; T.Q.length = 0; T.meta.length = 0; return; }
  T.P.push(T.names.map(([n]) => W[n]?.p.clone() || new THREE.Vector3()));
  T.Q.push(ROT_BONES.map(n => W[n]?.q.clone() || new THREE.Quaternion()));
  T.meta.push({ where: whereOf(f), fr: frameOf(f), ctx: curScenario });
  const N = 9;
  if (T.P.length > N) { T.P.shift(); T.Q.shift(); T.meta.shift(); }
  if (T.P.length < N) return;
  const c = 4; // frame under test (centre of the window)
  for (let j = 0; j < T.names.length; j++) {
    const acc = [];
    for (let i = 1; i < N - 1; i++) acc.push(T.P[i + 1][j].clone().sub(T.P[i][j].clone().multiplyScalar(2)).add(T.P[i - 1][j]).length());
    const a = acc[c - 1];
    const others = acc.filter((_, i) => Math.abs(i - (c - 1)) >= 2);
    const ctxMax = Math.max(...others);
    if (a > T.names[j][1] && a > 2.2 * ctxMax) {
      const m = T.meta[c];
      const mp = T.meta[c - 1];
      const tr = mp.where !== m.where ? `${mp.where} → ${m.where}` : m.where;
      report('pop', f.id, tr, T.names[j][0], a * 100, `${m.ctx} · ${f.id} ${m.where} f${m.fr} (${(a * 100).toFixed(1)}cm/f², context ${(ctxMax * 100).toFixed(1)})`);
    }
  }
  for (let j = 0; j < ROT_BONES.length; j++) {
    const w = [];
    for (let i = 1; i < N; i++) w.push(T.Q[i - 1][j].clone().invert().multiply(T.Q[i][j]));
    const al = [];
    for (let i = 1; i < w.length; i++) al.push(2 * Math.acos(Math.min(1, Math.abs(w[i - 1].clone().invert().multiply(w[i]).w))));
    const a = al[c - 1];
    const others = al.filter((_, i) => Math.abs(i - (c - 1)) >= 2);
    const ctxMax = Math.max(...others);
    const thr = ROT_BONES[j].startsWith('wrist') || ROT_BONES[j].startsWith('foot') ? 0.4 : 0.25;
    if (a > thr && a > 2.2 * ctxMax) {
      const m = T.meta[c], mp = T.meta[c - 1];
      const tr = mp.where !== m.where ? `${mp.where} → ${m.where}` : m.where;
      report('pop', f.id, tr, ROT_BONES[j] + ' (rot)', deg(a), `${m.ctx} · ${f.id} ${m.where} f${m.fr} (${deg(a).toFixed(0)}°/f², context ${deg(ctxMax).toFixed(0)})`);
    }
  }
}

// ------------------------------------------------------------------ harness
class Dummy { constructor() { this.q = []; this.hold = null; } poll() { return this.q.shift() || this.hold || { dx: 0, dy: 0, held: 0, pressed: 0 }; } }
const stubGame = () => ({
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {}, trail() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, hideBars() {}, introNames() {}, winner() {} },
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  audio: null, stage: { arenaRadius: 9 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
});
const bodies = {};
function makeMatch(p1, p2) {
  const chars = [buildCharacter(load(p1), mat), buildCharacter(load(p2), mat)];
  const m = new Match(stubGame(), chars, [p1, p2], { rounds: 99, time: 99999 });
  m.hpScale = 60;
  m.fighters.forEach((f) => { f.ctrl = new Dummy(); bodies[f.id] = f.rig.vols; f.bstate = new BodyState(f.rig.vols); });
  return m;
}
function place(m, d) {
  m.startRound(); m.phase = 'fight'; m.pt = 0; m.rageLock = null; m.throwLock = null; m.hitstop = 0;
  const [a, b] = m.fighters;
  a.pos.set(-d / 2, 0, 0); b.pos.set(d / 2, 0, 0); a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
  // (the planted feet were set at the round-start spots: re-acquire them here, or both feet step on frame 1)
  for (const f of m.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.feet?.reset(); f.ctrl.q.length = 0; f.ctrl.hold = null; delete f.updateGuard; f.hp = f.maxHp * 60; }
}
function simulate(m, frames, script, stop) {
  const [a, b] = m.fighters;
  const segs = [{}, {}];
  const pops = [popTracker(a), popTracker(b)];
  for (let i = 0; i < frames; i++) {
    script?.(i);
    const frozen = m.hitstop > 0;
    m.step(); m.events.length = 0;
    if (m.phase !== 'fight') break;
    segs[0] = segState(a, a.bstate); segs[1] = segState(b, b.bstate);
    const cb = `${curScenario}`;
    checkFighter(a, segs[0], cb); checkFighter(b, segs[1], cb);
    checkPair(a, b, segs[0], segs[1], cb);
    popPush(pops[0], frozen || m.hitstop > 0); popPush(pops[1], frozen || m.hitstop > 0);
    if (stop?.(i)) break;
  }
}
const settled = (f) => ['idle'].includes(f.state) && f.sf > 12;

// ------------------------------------------------------------------ scenarios
const t0 = Date.now();
let scenarios = 0;
for (const id of FIGHTERS) {
  for (const oppId of OPPS) {
    const opp = oppId === id ? (id === 'camilo' ? 'rafa' : 'camilo') : oppId;
    const m = makeMatch(id, opp);
    const [a, b] = m.fighters;
    const moveNames = Object.keys(a.moves).filter(n => n !== 'throwExec' && (!ONLY_MOVES || ONLY_MOVES.includes(n)));
    if (run('moves')) {
      for (const mv of moveNames) {
        for (const [dist, variant] of [[1.05, 'hit'], [1.45, 'hit'], [1.15, 'block']]) {
          curScenario = `${id} ${mv} @${dist}m vs ${opp} (${variant})`;
          scenarios++;
          place(m, dist);
          if (variant === 'hit') b.updateGuard = function () { this.guard = 'none'; };
          let started = false;
          simulate(m, 320, (i) => {
            if (i === 16) {
              if (mv === 'rageArt') { a.rage = true; a.rageUsed = false; m.onRageStart(a); }
              a.startMove(mv); started = true;
            }
          }, (i) => started && i > 40 && settled(a) && (settled(b) || b.state === 'crouch'));
        }
      }
    }
    if (run('motion') && oppId === OPPS[0]) {
      curScenario = `${id} movement vs ${opp}`;
      scenarios++;
      place(m, 2.2);
      const C = a.ctrl;
      const plan = [];
      const hold = (n, inp) => { for (let k = 0; k < n; k++) plan.push(inp); };
      const N = { dx: 0, dy: 0, held: 0, pressed: 0 };
      hold(10, N); hold(50, { dx: 1, dy: 0, held: 0, pressed: 0 }); hold(14, N);
      hold(50, { dx: -1, dy: 0, held: 0, pressed: 0 }); hold(14, N);
      // dash forward / back: tap, release, tap
      hold(3, { dx: 1, dy: 0 }); hold(3, N); hold(3, { dx: 1, dy: 0 }); hold(34, N);
      hold(3, { dx: -1, dy: 0 }); hold(3, N); hold(3, { dx: -1, dy: 0 }); hold(40, N);
      // crouch, crouch walk-off, stand
      hold(50, { dx: 0, dy: -1 }); hold(24, N);
      // sidesteps (quick taps) both ways
      hold(3, { dx: 0, dy: -1 }); hold(34, N); hold(3, { dx: 0, dy: 1 }); hold(34, N);
      // jump up / forward
      hold(12, { dx: 0, dy: 1 }); hold(60, N); hold(12, { dx: 1, dy: 1 }); hold(70, N);
      simulate(m, plan.length, (i) => { const p = plan[i]; C.hold = { dx: p.dx || 0, dy: p.dy || 0, held: 0, pressed: 0 }; });
    }
    if (run('throws') && oppId === OPPS[0]) {
      for (const tm of Object.keys(a.moves).filter(n => a.moves[n].throw)) {
        for (const tech of [false, true]) {
          curScenario = `${id} ${tm} vs ${opp}${tech ? ' (victim techs)' : ''}`;
          scenarios++;
          place(m, 1.0);
          simulate(m, 260, (i) => {
            if (i === 12) a.startMove(tm);
            if (tech && b.state === 'land' && b.sf === 2) b.ctrl.q.push({ dx: 0, dy: 0, held: B1, pressed: B1 });
          }, (i) => i > 60 && settled(a) && settled(b));
        }
      }
      // launcher into a tech roll
      curScenario = `${id} uppercut vs ${opp} (victim techs)`;
      scenarios++;
      place(m, 1.05); b.updateGuard = function () { this.guard = 'none'; };
      simulate(m, 260, (i) => {
        if (i === 12) a.startMove('uppercut');
        if (b.state === 'land' && b.sf === 2) b.ctrl.q.push({ dx: 0, dy: 0, held: B1, pressed: B1 });
      }, (i) => i > 60 && settled(a) && settled(b));
    }
    if (run('poses') && oppId === OPPS[0]) {
      for (const st of ['intro', 'win']) {
        curScenario = `${id} ${st} pose`;
        scenarios++;
        place(m, 2.6);
        a.setState(st); a.snapPose = true; a.play(st, 1);
        simulate(m, st === 'intro' ? 110 : 140, () => { if (a.state !== st) { a.setState(st); } });
      }
    }
    if (run('ai') && oppId === OPPS[0] && AI_FRAMES > 0) {
      curScenario = `${id} AI fight vs ${opp}`;
      scenarios++;
      place(m, 2.2);
      const ais = [new AIController(5), new AIController(5)];
      m.fighters.forEach((f, i) => { ais[i].attach(f, m); f.ctrl = ais[i]; });
      simulate(m, AI_FRAMES);
      m.fighters.forEach((f) => { f.ctrl = new Dummy(); });
    }
  }
}

// ------------------------------------------------------------------ report
const list = Object.values(ISS).map(o => ({ ...o, score: o.max * Math.sqrt(o.n), scen: [...o.scen] }));
const byKind = {};
for (const o of list) (byKind[o.kind] || (byKind[o.kind] = [])).push(o);
const unit = { self: 'cm', cross: 'cm', floor: 'cm', joint: '°', pop: '' };
console.log(`animaudit: ${scenarios} scenarios, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const f of FIGHTERS) {
  const b = bodies[f]; if (!b) continue;
  console.log(`body ${f}: ` + ['hips', 'belly', 'chest', 'upper', 'head'].map(n => `${n} ${(b[n].rx * 100).toFixed(0)}x${(b[n].rz * 100).toFixed(0)}cm (z+${(b[n].co.z * 100).toFixed(0)})`).join(', ') +
    ' · ' + ['uarm.L', 'farm.L', 'hand.L', 'thigh.L', 'shin.L', 'foot.L'].map(n => `${n} r${(b[n].r * 100).toFixed(1)}`).join(' '));
}
for (const kind of ['self', 'cross', 'floor', 'joint', 'pop']) {
  const arr = (byKind[kind] || []).sort((x, y) => y.score - x.score);
  console.log(`\n== ${kind}: ${arr.length} distinct issues, ${arr.reduce((s, o) => s + o.n, 0)} frames ==`);
  for (const o of arr.slice(0, TOP)) {
    const mx = kind === 'self' || kind === 'cross' || kind === 'floor' ? (o.max * 100).toFixed(1) + unit[kind] : kind === 'joint' ? '+' + o.max.toFixed(0) + '°' : o.max.toFixed(1);
    console.log(`${String(o.n).padStart(5)}  ${mx.padStart(7)}  ${o.who.padEnd(9)} ${o.where.padEnd(34)} ${o.detail}\n                  worst: ${o.ctx}`);
  }
}
const jo = opt('json');
if (jo) fs.writeFileSync(jo, JSON.stringify(list, null, 1));
