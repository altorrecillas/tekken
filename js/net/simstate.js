// The whole fight simulation (the match, both fighters, their rigs and foot planters) saved into a flat buffer and
// loaded back, for the rollback netcode: a snapshot at the start of every frame, a rewind when an input from the
// other phone arrives late and changes the past, a hash of the state so that both phones can check they still
// agree and, if they ever drift apart, the host's state sent over to the other phone.
//
// One function per object walks its state with an `io` that either writes or reads, so saving and loading can
// never disagree on the layout: `x = io.num(x)` stores x when saving and hands back the stored value when loading;
// vectors and pose arrays are copied in place. Numbers go to a Float64Array (exact), everything else (state names,
// moves, clips, the fighter being thrown...) to a list of references, which `encodeRefs` turns into names for the
// network. Whatever a frame recomputes from scratch before using it (the opponent's body volumes, the grip and look
// targets, the render skeleton) is left out. tools/netsim.mjs checks that nothing that matters is missing: a fight
// rewound and replayed must come out identical to the bit.
import * as THREE from 'three';
import { THROWS } from '../fight/throws.js';
import { STAT_KEYS, PLAY_KEYS, BEST_KEYS } from '../fight/stats.js';

export class Snap {
  constructor(n = 4096) { this.f = new Float64Array(n); this.r = []; this.nf = 0; this.nr = 0; this.frame = -1; }
  copyFrom(o) {
    if (this.f.length < o.nf) this.f = new Float64Array(o.f.length);
    this.f.set(o.f.subarray(0, o.nf)); this.nf = o.nf;
    for (let j = 0; j < o.nr; j++) this.r[j] = o.r[j];
    this.r.length = this.nr = o.nr; this.frame = o.frame;
    return this;
  }
}

class IO {
  begin(snap, reading) { this.s = snap; this.reading = reading; this.i = 0; this.j = 0; return this; }
  _room(n) { const s = this.s; if (this.i + n > s.f.length) { const f = new Float64Array(Math.max(s.f.length * 2, this.i + n + 1024)); f.set(s.f); s.f = f; } }
  num(x) { if (this.reading) return this.s.f[this.i++]; this._room(1); this.s.f[this.i++] = x; return x; }
  // a number that may be undefined (stored as NaN)
  numU(x) { const v = this.num(x === undefined || x === null ? NaN : +x); return v !== v ? undefined : v; }
  bool(x) { return this.num(x ? 1 : 0) === 1; }
  ref(o) { if (this.reading) return this.s.r[this.j++]; this.s.r[this.j++] = o === undefined ? null : o; return o; }
  vec(v) {
    const f = this.reading ? this.s.f : (this._room(3), this.s.f);
    if (this.reading) { v.x = f[this.i]; v.y = f[this.i + 1]; v.z = f[this.i + 2]; } else { f[this.i] = v.x; f[this.i + 1] = v.y; f[this.i + 2] = v.z; }
    this.i += 3;
    return v;
  }
  quat(q) {
    const f = this.reading ? this.s.f : (this._room(4), this.s.f);
    if (this.reading) { q.set(f[this.i], f[this.i + 1], f[this.i + 2], f[this.i + 3]); } else { f[this.i] = q.x; f[this.i + 1] = q.y; f[this.i + 2] = q.z; f[this.i + 3] = q.w; }
    this.i += 4;
    return q;
  }
  // a typed array of fixed length, in place (Float32 values are exact in a Float64)
  arr(a) {
    if (this.reading) a.set(this.s.f.subarray(this.i, this.i + a.length)); else { this._room(a.length); this.s.f.set(a, this.i); }
    this.i += a.length;
    return a;
  }
  // an optional vector (undefined / null when absent)
  vecU(v) {
    const has = this.bool(!!v);
    if (!has) return this.reading ? undefined : v;
    return this.vec(v || new THREE.Vector3());
  }
  end() { if (!this.reading) { this.s.nf = this.i; this.s.nr = this.j; this.s.r.length = this.j; } }
}

const POSES = ['pose', 'prevPose', 'blendFrom', 'base', 'basePrev', 'offX', 'offV'];
const NUMS = ['yaw', 'prevYaw', 'inertH', 'sf', 'mf', 'cf', 'cfRate', 'blendT', 'blendDur', 'ubc', 'yawRate', 'stun', 'juggles',
  'comboHits', 'comboDmg', 'slide', 'pending', 'pendingT', 'downT', 'invuln', 'downHold', 'upHold', 'lastDy', 'sideDir', 'hp', 'maxHp',
  'jumpFwd', 'advPrev', 'throwDmg', 'throwBreak', 'voiceT', 'shakeT', 'breath', 'hitFlash', 'counterFlash', 'spin'];
const BOOLS = ['snapPose', 'snapSmooth', 'moveHit', 'moveConnected', 'crouching', 'airborne', 'ko', 'rage', 'rageUsed'];
// (ragdoll: the knocked-out body, which for the simulation is only a flag)
const REFS = ['state', 'move', 'moveName', 'clip', 'clipName', 'guard', 'throwPartner', 'throwMove', 'stateHold', 'gripFn', 'ragdoll'];

function ioFoot(F, io) {
  F.on = io.bool(F.on); io.vec(F.w); F.yaw = io.num(F.yaw);
  const hasStep = io.bool(!!F.step);
  if (hasStep) {
    const S = F.step || (F.step = { from: new THREE.Vector3(), fromYaw: 0, t: 0, len: 0, dur: 1, h: 0 });
    io.vec(S.from); S.fromYaw = io.num(S.fromYaw); S.t = io.num(S.t); S.len = io.num(S.len); S.dur = io.num(S.dur); S.h = io.num(S.h);
  } else if (io.reading) F.step = null;
  io.vec(F.off); F.offYaw = io.num(F.offYaw); io.vec(F.offV); F.offYawV = io.num(F.offYawV);
  io.vec(F.last); F.lastYaw = io.num(F.lastYaw); io.vec(F.lv); F.lvYaw = io.num(F.lvYaw); F.has = io.bool(F.has);
  io.vec(F.pw); F.pwYaw = io.num(F.pwYaw); F.hasPw = io.bool(F.hasPw);
}

function ioRig(rig, io) {
  const names = rig._snapBones || (rig._snapBones = Object.keys(rig.b));
  const W = rig.world;
  for (const n of names) {
    const has = io.bool(!!W[n]);
    if (has) { const w = W[n] || (W[n] = { q: new THREE.Quaternion(), p: new THREE.Vector3() }); io.quat(w.q); io.vec(w.p); } else if (io.reading) delete W[n];
  }
  for (const k of ['L', 'R', 'kL', 'kR']) io.vec(rig.bendDir[k]);
  for (const k of ['L', 'R', 'fL', 'fR']) io.vec(rig.pushS[k]);
  rig.look.yaw = io.num(rig.look.yaw); rig.look.pitch = io.num(rig.look.pitch); rig.look.init = io.bool(rig.look.init);
  rig.logicDriven = io.bool(rig.logicDriven); rig.snapLook = io.bool(rig.snapLook);
  // (kept from the last frame that had an opponent to strike at)
  rig.striking = io.ref(rig.striking);
}

function ioFighter(f, io) {
  io.vec(f.pos); io.vec(f.prevPos); io.vec(f.vel);
  for (const k of POSES) io.arr(f[k]);
  for (const k of NUMS) f[k] = io.numU(f[k]);
  for (const k of BOOLS) f[k] = io.bool(f[k]);
  for (const k of REFS) f[k] = io.ref(f[k]);
  // a strike that touched three frames early, landing on its first active frame
  if (io.bool(!!f.latchedHit)) {
    const L = io.reading ? { p: new THREE.Vector3(), zone: null } : f.latchedHit;
    io.vec(L.p); L.zone = io.ref(L.zone);
    if (io.reading) f.latchedHit = L;
  } else if (io.reading) f.latchedHit = null;
  // the swoosh behind a heavy strike, still to start
  if (io.bool(!!f.pendingTrail)) {
    const T = io.reading ? {} : f.pendingTrail;
    T.bone = io.ref(T.bone); T.at = io.num(T.at); T.dur = io.num(T.dur); T.move = io.ref(T.move);
    if (io.reading) f.pendingTrail = T;
  } else if (io.reading) f.pendingTrail = null;
  // input: the frame's own (which is also the newest of the history, unless a reset emptied it) and the history
  // that dashes and double taps are read from
  const alias = io.bool(!!f.inp && f.hist[0] === f.inp);
  const n = io.num(f.hist.length);
  const ioInp = (o) => { o.d = io.num(o.d); o.fwd = io.num(o.fwd); o.up = io.num(o.up); o.held = io.num(o.held); o.pressed = io.num(o.pressed); return o; };
  if (io.reading) {
    f.hist.length = 0;
    for (let i = 0; i < n; i++) f.hist.push(ioInp({}));
  } else for (let i = 0; i < n; i++) ioInp(f.hist[i]);
  if (alias) { if (io.reading) f.inp = f.hist[0]; } else if (io.bool(!!f.inp)) { if (io.reading) f.inp = ioInp({}); else ioInp(f.inp); } else if (io.reading) f.inp = undefined;
  // secondary motion and filters
  const S = f.spring;
  io.vec(S.sp); io.vec(S.sv); io.vec(S.np); io.vec(S.nv);
  if (io.bool(!!f.overlap)) {
    const O = f.overlap || (f.overlap = { s: new Float32Array(6), v: new Float32Array(6), init: false });
    io.arr(O.s); io.arr(O.v); O.init = io.bool(O.init);
  } else if (io.reading) f.overlap = undefined;
  if (io.bool(!!f.smooth)) {
    const Sm = f.smooth || (f.smooth = { x: new Float32Array(f.pose.length), v: new Float32Array(f.pose.length), init: false });
    io.arr(Sm.x); io.arr(Sm.v); Sm.init = io.bool(Sm.init);
  } else if (io.reading) f.smooth = undefined;
  if (io.bool(!!f.tight)) {
    const G = f.tight || (f.tight = { x: 0, v: 0 });
    G.x = io.num(G.x); G.v = io.num(G.v);
  } else if (io.reading) f.tight = undefined;
  // the head the opponent looks at (taken with the hurt volumes, used on the next frame)
  f.headWorld = io.vecU(f.headWorld);
  ioFoot(f.feet.feet.L, io); ioFoot(f.feet.feet.R, io);
  ioRig(f.rig, io);
}

function ioMatch(m, io) {
  for (const k of ['frame', 'pt', 'hitstop', 'timeScale', 'slowmo', 'timer', 'round', 'winner', 'koWinner', 'lastHeavyFrame', 'lastTechFrame', 'hpScale']) m[k] = io.numU(m[k]);
  m.wins[0] = io.num(m.wins[0]); m.wins[1] = io.num(m.wins[1]);
  m.endSent = io.bool(m.endSent);
  m.phase = io.ref(m.phase); m.lastEvent = io.ref(m.lastEvent);
  // the tallies and the play of the match (js/fight/stats.js)
  for (const S of m.stats) for (const k of STAT_KEYS) S[k] = io.num(S[k]);
  for (const P of m.play) for (const k of PLAY_KEYS) P[k] = io.num(P[k]);
  for (const k of BEST_KEYS) m.best[k] = io.num(m.best[k]);
  io.vec(m.viewN);
  const F = m.fighters;
  if (io.bool(!!m.rageLock)) {
    const L = io.reading ? { p: new THREE.Vector3() } : m.rageLock;
    L.att = F[io.num(L.att ? L.att.index : 0)]; L.def = F[io.num(L.def ? L.def.index : 1)];
    L.t = io.num(L.t); io.vec(L.p);
    if (io.reading) m.rageLock = L;
  } else if (io.reading) m.rageLock = null;
  if (io.bool(!!m.throwLock)) {
    const L = io.reading ? { ax: new THREE.Vector3() } : m.throwLock;
    L.att = F[io.num(L.att ? L.att.index : 0)]; L.def = F[io.num(L.def ? L.def.index : 1)];
    L.t = io.num(L.t); L.T = io.ref(L.T); L.dealt = io.num(L.dealt); L.dOff = io.num(L.dOff); L.yaw0 = io.num(L.yaw0); io.vec(L.ax);
    if (io.reading) m.throwLock = L;
  } else if (io.reading) m.throwLock = null;
  for (const f of F) ioFighter(f, io);
}

const _io = new IO();
export function saveMatch(m, snap) { _io.begin(snap, false); ioMatch(m, _io); _io.end(); snap.frame = m.frame; return snap; }
export function loadMatch(m, snap) { _io.begin(snap, true); ioMatch(m, _io); if (_io.i !== snap.nf || _io.j !== snap.nr) throw new Error(`snapshot layout mismatch (${_io.i}/${snap.nf}, ${_io.j}/${snap.nr})`); return m; }

// ------------------------------------------------------------------ references by name (network)
// every object a snapshot can point at, by a name that is the same on both phones
function registry(m) {
  if (m._snapReg) return m._snapReg;
  const key = new Map(), obj = new Map();
  const add = (k, o) => { if (!o) return; if (!key.has(o)) key.set(o, k); obj.set(k, o); };
  m.fighters.forEach((f, i) => {
    add('F' + i, f);
    for (const n in f.moves) { add(`m${i}:${n}`, f.moves[n]); add(`mc${i}:${n}`, f.moves[n].clip); }
    for (const n in f.clips) add(`c${i}:${n}`, f.clips[n]);
  });
  for (const t in THROWS) { add('T:' + t, THROWS[t]); add('Ta:' + t, THROWS[t].att); add('Td:' + t, THROWS[t].def); }
  return (m._snapReg = { key, obj });
}

// the references as JSON-friendly tokens: 's…' a string, 'o…' a named object, 'rd' a ragdoll, null nothing
export function encodeRefs(m, snap) {
  const R = registry(m), out = new Array(snap.nr);
  for (let j = 0; j < snap.nr; j++) {
    const r = snap.r[j];
    if (r == null) out[j] = null;
    else if (typeof r === 'string') out[j] = 's' + r;
    else if (R.key.has(r)) out[j] = 'o' + R.key.get(r);
    else if (r.isRagdoll || r === RAGDOLL_WANTED) out[j] = 'rd';
    else out[j] = null;
  }
  return out;
}
// tokens back to references (ragdolls: whatever body this phone has for that fighter, or a marker to spawn one)
export function decodeRefs(m, tokens, snap) {
  const R = registry(m);
  snap.r.length = snap.nr = tokens.length;
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    snap.r[j] = t == null ? null : t[0] === 's' ? t.slice(1) : t === 'rd' ? RAGDOLL_WANTED : R.obj.get(t.slice(1)) ?? null;
  }
  return snap;
}
// a ragdoll the other phone has and this one must spawn (see the online session)
export const RAGDOLL_WANTED = { wanted: true };

// the snapshot for the network: the numbers (base64 of the Float64Array) and the reference tokens
export function packSnap(m, snap) {
  const bytes = new Uint8Array(snap.f.buffer, 0, snap.nf * 8);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { frame: snap.frame, nf: snap.nf, f: btoa(s), r: encodeRefs(m, snap) };
}
export function unpackSnap(m, o, snap = new Snap()) {
  if (!o || typeof o.f !== 'string' || !Array.isArray(o.r) || (o.nf | 0) <= 0) return null;
  const bin = atob(o.f);
  if (bin.length !== (o.nf | 0) * 8) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (snap.f.length < o.nf) snap.f = new Float64Array(o.nf);
  snap.f.set(new Float64Array(bytes.buffer)); snap.nf = o.nf | 0; snap.frame = o.frame | 0;
  decodeRefs(m, o.r.map((t) => (t == null ? null : String(t))), snap);
  return snap;
}

// ------------------------------------------------------------------ hash
// Numbers rounded to 1e-5 (a hundredth of a millimetre), so that a last-bit difference between two browsers' sin or
// exp does not count as a disagreement while any real one does; references by name.
// (exact: every bit of every number, for the tests)
export function hashSnap(m, snap, exact = false) {
  const R = registry(m);
  let h = 0x811c9dc5 | 0, g = 0x9747b28c | 0;
  const mix = (x) => { h = Math.imul(h ^ x, 0x01000193); g = Math.imul(g ^ x, 0x5bd1e995); g ^= g >>> 13; };
  const f = snap.f;
  if (exact) {
    const u = new Uint32Array(f.buffer, 0, snap.nf * 2);
    for (let i = 0; i < u.length; i++) mix(u[i]);
  } else for (let i = 0; i < snap.nf; i++) {
    const v = f[i];
    if (v !== v) { mix(0x7fc00000); continue; }
    const q = Math.round(v * 1e5);
    mix(q | 0); mix((q / 4294967296) | 0);
  }
  for (let j = 0; j < snap.nr; j++) {
    const r = snap.r[j];
    const s = r == null ? '~' : typeof r === 'string' ? r : R.key.get(r) || (r.isRagdoll || r === RAGDOLL_WANTED ? 'rd' : '?');
    for (let k = 0; k < s.length; k++) mix(s.charCodeAt(k));
    mix(0x2c);
  }
  return ((h >>> 0) ^ (g >>> 3)) >>> 0;
}
