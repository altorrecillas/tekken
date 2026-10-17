// Rollback netcode, the model the big fighting games use online (GGPO): both phones run the whole fight.
//  - Each phone plays its own input a fixed `delay` of frames after reading it (one or two frames on a WiFi), and
//    sends it at once, so the other phone usually has it before it needs it.
//  - When the other phone's input for a frame has not arrived yet, that frame is played with a prediction: the
//    same directions and buttons held, no new press.
//  - A snapshot of the fight is taken at the start of every frame (js/net/simstate.js). When an input arrives that
//    differs from what was predicted, the fight goes back to that frame and is replayed up to now within the same
//    screen refresh: a late packet costs a correction of a frame or two instead of a freeze.
//  - The phone that is ahead in time slows down a little until both play the same frame at the same moment, so
//    neither has to predict much more than the other.
//  - Every 30 frames both phones hash the confirmed state and compare. Should they ever disagree (a bug, or two
//    browsers rounding a sine differently), the host's state is sent over and the other phone replays from it.
// Inputs travel on the unreliable 'fast' channel: every packet repeats all the inputs the other phone has not
// confirmed yet, so a lost packet is covered by the next one, and it carries the frame numbers the clocks are
// synchronised with. The state checks go on the reliable channel.
import { Snap, saveMatch, loadMatch, hashSnap, packSnap, unpackSnap } from './simstate.js';
import { SLOWMO } from '../fight/match.js';

const FPS = 60, DT = 1 / FPS;
const HIST = 1024;               // frames of input kept (replays, a resync, resends)
// frames played ahead of the other phone's newest input before waiting for it: 300 ms, enough to ride out a WiFi
// hiccup or a phone stuck a moment (a garbage collection, a first texture) without the fight freezing. Phones
// stutter more than computers: with 8 frames (the GGPO default) a simulated phone with hiccups of 150-450 ms made
// the other one wait 6.4 s in two minutes, with 18 (and the catch-up below) 1.4 s (tools/netsession.mjs)
export const MAX_PREDICT = 18;
// frames one refresh may play: after a phone was stuck, it catches up at once (the time it lost is not lost, or
// the other phone would have to wait for it)
const MAX_STEPS = 24;
const RING = MAX_PREDICT + 3;    // snapshots kept (a rewind never goes further back than the predicted frames)
export const CHECK_EVERY = 30;   // frames between two state checks
const PKT_INPUT = 0x31, HEAD = 20;

// one frame of input in 12 bits: dx and dy (-1..1, screen terms), the four buttons held and those newly pressed
export function packIn(i) { return ((i.dx + 1) & 3) | (((i.dy + 1) & 3) << 2) | ((i.held & 15) << 4) | ((i.pressed & 15) << 8); }
export function unpackIn(v, out = {}) { out.dx = (v & 3) - 1; out.dy = ((v >> 2) & 3) - 1; out.held = (v >> 4) & 15; out.pressed = (v >> 8) & 15; return out; }
export const NEUTRAL = packIn({ dx: 0, dy: 0, held: 0, pressed: 0 });
const FINAL_EVERY = 120;
// the guess for a frame not heard yet: the newest input known, held on, with no new press
const predict = (v) => v & 0xff;

export class RollbackSession {
  // o: { match, local (0 or 1), delay, host, poll() -> this phone's input, send(ArrayBuffer), sendRel(obj),
  //      rtt() -> ms, gate (FxGate, optional), onFrame(match) after each frame played for the first time }
  constructor(o) {
    this.m = o.match; this.local = o.local; this.host = !!o.host;
    this.delay = Math.max(0, Math.min(8, o.delay | 0));
    this.maxPredict = Math.min(MAX_PREDICT, o.maxPredict || MAX_PREDICT); // (the tests try smaller windows)
    this.poll = o.poll; this.send = o.send; this.sendRel = o.sendRel || (() => {});
    this.rtt = o.rtt || (() => 0);
    this.gate = o.gate || null; this.onFrame = o.onFrame || null;
    // onFinal(frame, snap): every FINAL_EVERY frames, the snapshot of a frame's start once nothing can change it any
    // more (every input before it confirmed): what a replay of a moment of the fight can start from
    this.onFinal = o.onFinal || null;
    this.lin = new Uint16Array(HIST).fill(NEUTRAL); // this phone's inputs, by frame
    this.rin = new Uint16Array(HIST).fill(NEUTRAL); // the other phone's (confirmed)
    this.used = new Uint16Array(HIST);              // the other phone's input each frame was played with
    this.linMax = this.delay - 1;                   // newest frame with this phone's input
    this.rinMax = this.delay - 1;                   // newest frame with the other's (every frame before it too)
    this.theyHave = this.delay;                     // frames of our input the other phone has confirmed
    this.frame = this.m.frame;                      // the next frame to play
    this.simFrame = this.frame;
    this.snaps = Array.from({ length: RING }, () => new Snap());
    this.rewindTo = Infinity;
    this.acc = 0; this.alpha = 1;
    this.localAdv = 0; this.remoteAdv = 0; this.heard = 0;
    this.myHash = new Map(); this.finalHash = new Map(); this.theirHash = new Map(); this.ckpt = new Map(); this.checked = -1;
    this.endAt = null;           // frame at whose end the match was over (confirmed once its inputs are)
    // the confirmed inputs of both fighters, frame by frame (fighter 0's, fighter 1's): the whole fight in a few
    // tens of kilobytes, enough to replay it exactly (the simulation is deterministic)
    this.log = new Uint16Array(8192); this.logN = 0;
    this.paused = false; this.stopped = false;
    this.stallT = 0;             // seconds waiting for the other phone (now)
    this.stats = { frames: 0, rollbacks: 0, rolled: 0, maxRoll: 0, predicted: 0, stalls: 0, stallMs: 0, checks: 0, desyncs: 0, resyncs: 0, sent: 0, got: 0, lastDesync: -1 };
    this._in = [{}, {}];
    this.m.fighters.forEach((f, i) => { f.ctrl = { poll: () => this._input(i) }; });
  }

  // the input of player i for the frame being played (the match asks once per fighter and frame)
  _input(i) {
    const F = this.simFrame, k = F % HIST;
    let v;
    if (i === this.local) v = this.lin[k];
    else {
      v = F <= this.rinMax ? this.rin[k] : this.rinMax >= 0 ? predict(this.rin[this.rinMax % HIST]) : NEUTRAL;
      this.used[k] = v;
    }
    return unpackIn(v, this._in[i]);
  }

  // one frame: snapshot of its start, then the simulation
  _advance(replay) {
    const F = this.frame, m = this.m, s = this.snaps[F % RING];
    saveMatch(m, s);
    if (F % CHECK_EVERY === 0 && F > 0) this._checkpoint(F, s);
    if (this.onFinal && F % FINAL_EVERY === 0 && F - 1 <= this.rinMax) this.onFinal(F, s);
    this.simFrame = F;
    if (F > this.rinMax && !replay) this.stats.predicted++;
    if (this.gate) { this.gate.replay = replay; this.gate.frame = F; }
    m.step();
    if (this.gate) this.gate.replay = false;
    this.frame = F + 1;
    if (!replay) { this.stats.frames++; this.onFrame?.(m); }
  }

  // back to the start of frame `to` and replayed up to now with what is known now
  _rewind(to) {
    const target = this.frame, s = this.snaps[to % RING];
    if (s.frame !== to || to >= target) return;
    loadMatch(this.m, s);
    this.frame = to;
    if (this.endAt !== null && this.endAt > to) this.endAt = null; // (the replay says again if it still happens)
    const n = target - to;
    this.stats.rollbacks++; this.stats.rolled += n; this.stats.maxRoll = Math.max(this.stats.maxRoll, n);
    while (this.frame < target) this._advance(true);
  }

  // ------------------------------------------------------------------ every screen refresh
  update(dt) {
    if (this.rewindTo < this.frame) this._rewind(this.rewindTo);
    this.rewindTo = Infinity;
    let n = 0;
    if (!this.paused && !this.stopped) {
      const rate = (this.m.slowmo > 0 ? SLOWMO : 1) * this._syncRate();
      this.acc = Math.min(this.acc + dt * rate, DT * MAX_STEPS);
      let waited = false;
      while (this.acc >= DT && n < MAX_STEPS) {
        // too far ahead of the other phone's inputs: wait for them (the fight stands still)
        if (this.frame - this.rinMax > this.maxPredict) { waited = true; this.acc = Math.min(this.acc, DT); break; }
        // this phone's input, played `delay` frames from now on both phones
        const F = ++this.linMax;
        this.lin[F % HIST] = packIn(this.poll());
        this._advance(false);
        this.acc -= DT; n++;
      }
      // stallT: how long the fight has stood still waiting (a refresh that played frames, even up to the limit, is
      // no wait: counting those made the 'waiting' notice show while the fight was going on)
      if (n) this.stallT = 0;
      else if (waited) { if (this.stallT === 0) this.stats.stalls++; this.stallT += dt; this.stats.stallMs += dt * 1000; }
      this.waited = waited;
      this.alpha = Math.max(0, Math.min(1, this.acc / DT));
    }
    this._sendInputs();
    this._checkHashes();
    this.logConfirmed();
    return n;
  }
  // frames whose both inputs are known go to the log (for the replay)
  logConfirmed() {
    const upto = Math.min(this.rinMax, this.linMax, this.frame - 1);
    while (this.logN <= upto) {
      const f = this.logN, k = f % HIST;
      if (this.log.length < (f + 1) * 2) { const l = new Uint16Array(this.log.length * 2); l.set(this.log); this.log = l; }
      this.log[f * 2 + this.local] = this.lin[k]; this.log[f * 2 + 1 - this.local] = this.rin[k];
      this.logN++;
    }
  }

  // the phone that is ahead slows down until both play the same frame at the same time: a little for a frame or
  // two (unnoticeable), up to half speed when the other phone cannot keep up (a slow phone), which is smoother than
  // running into the prediction limit and freezing
  _syncRate() {
    const ahead = (this.localAdv - this.remoteAdv) / 2;
    return ahead > 0.6 ? 1 - Math.min(0.45, (ahead - 0.6) * 0.12) : 1;
  }

  // ------------------------------------------------------------------ the inputs on the wire
  // [kind u8][0 u8][count u16][first frame u32][frames of theirs we have u32][our frame u32][advantage i16 /16][0 u16]
  // [inputs u16 × count], from the first frame the other phone has not confirmed
  _sendInputs() {
    const first = this.theyHave, n = Math.max(0, Math.min(this.linMax - first + 1, 200));
    const buf = new ArrayBuffer(HEAD + n * 2), d = new DataView(buf);
    d.setUint8(0, PKT_INPUT); d.setUint16(2, n, true);
    d.setUint32(4, first, true); d.setUint32(8, this.rinMax + 1, true); d.setUint32(12, this.frame, true);
    d.setInt16(16, Math.max(-32000, Math.min(32000, Math.round(this.localAdv * 16))), true);
    for (let k = 0; k < n; k++) d.setUint16(HEAD + k * 2, this.lin[(first + k) % HIST], true);
    this.send(buf);
    this.stats.sent++;
  }
  // a packet from the other phone (checked: it comes from another device)
  receive(buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < HEAD) return;
    const d = new DataView(buf), n = d.getUint16(2, true);
    if (d.getUint8(0) !== PKT_INPUT || buf.byteLength !== HEAD + n * 2) return;
    const first = d.getUint32(4, true), have = d.getUint32(8, true), cur = d.getUint32(12, true);
    this.stats.got++; this.heard = performance.now();
    if (have > this.theyHave && have <= this.linMax + 1) this.theyHave = have;
    // where the other phone is now: its frame when it sent this, plus half a round trip; and how far ahead of it
    // this one is (the other side's own estimate comes in the packet)
    const est = cur + this.rtt() / 2 * FPS / 1000;
    this.localAdv += (this.frame - est - this.localAdv) * 0.15;
    this.remoteAdv = d.getInt16(16, true) / 16;
    for (let k = 0; k < n; k++) {
      const f = first + k;
      if (f <= this.rinMax) continue;
      if (f !== this.rinMax + 1 || f - this.frame >= HIST - 64) break;
      const v = d.getUint16(HEAD + k * 2, true) & 0xfff;
      this.rin[f % HIST] = v; this.rinMax = f;
      // played already with another guess: rewind there on the next refresh
      if (f < this.frame && this.used[f % HIST] !== v) this.rewindTo = Math.min(this.rewindTo, f);
    }
  }

  // ------------------------------------------------------------------ both phones agree?
  _checkpoint(F, s) {
    this.myHash.set(F, hashSnap(this.m, s));
    if (this.host) (this.ckpt.get(F) || this.ckpt.set(F, new Snap()).get(F)).copyFrom(s);
  }
  // checkpoints whose every earlier input is known are final: sent and compared
  _checkHashes() {
    for (const [F, h] of this.myHash) {
      if (F <= this.checked || F - 1 > this.rinMax || F >= this.frame) continue;
      this.finalHash.set(F, h);
      this.checked = F;
      this.sendRel({ t: 'nh', f: F, h });
      this._compare(F);
    }
    for (const F of this.myHash.keys()) if (F <= this.checked) this.myHash.delete(F);
    for (const F of this.finalHash.keys()) if (F < this.checked - CHECK_EVERY * 8) this.finalHash.delete(F);
    for (const F of this.ckpt.keys()) if (F < this.checked - CHECK_EVERY * 8) this.ckpt.delete(F);
    for (const F of this.theirHash.keys()) if (F < this.checked - CHECK_EVERY * 16) this.theirHash.delete(F);
  }
  _compare(F) {
    const a = this.finalHash.get(F), b = this.theirHash.get(F);
    if (a === undefined || b === undefined) return;
    this.theirHash.delete(F);
    if (a === b) { this.stats.checks++; return; }
    this.stats.desyncs++; this.stats.lastDesync = F;
    console.warn(`[net] the two phones disagree at frame ${F}${this.host ? ': sending this state' : ': waiting for the host\'s state'}`);
    const s = this.ckpt.get(F);
    if (this.host && s && s.frame === F) this.sendRel({ t: 'nsync', s: packSnap(this.m, s) });
  }
  // reliable messages for the session (the online module passes them on)
  receiveRel(msg) {
    if (!msg) return;
    if (msg.t === 'nh') { this.theirHash.set(msg.f | 0, msg.h >>> 0); this._compare(msg.f | 0); } else if (msg.t === 'nsync' && !this.host) this._resync(msg.s);
  }
  // the host's state for frame F: loaded, and replayed up to now with the inputs known
  _resync(packed) {
    const s = unpackSnap(this.m, packed);
    if (!s) return false;
    const F = s.frame, target = this.frame;
    if (F > target || target - F > HIST - 64 || F - 1 > this.rinMax) return false;
    loadMatch(this.m, s);
    this.onLoad?.(this.m);
    this.frame = F;
    if (this.endAt !== null && this.endAt > F) this.endAt = null;
    for (const k of [...this.finalHash.keys()]) if (k >= F) this.finalHash.delete(k);
    this.checked = Math.min(this.checked, F);
    while (this.frame < target) this._advance(true);
    this.stats.resyncs++;
    return true;
  }

  // the match told it is over at this frame (Match.step -> game.onMatchEnd)
  matchEnded() { this.endAt = this.m.frame; }
  // over for sure: no input still to come can change it
  get endConfirmed() { return this.endAt !== null && this.endAt - 1 <= this.rinMax && this.m.endSent; }
  // frames this phone is playing on guesses (0 = everything confirmed)
  get ahead() { return Math.max(0, this.frame - 1 - this.rinMax); }
}

// Effects shown once: a frame played for the first time shows its sparks, sounds and announcements at once; when the
// same frame is replayed after a rewind, an effect it already showed (on that frame or one next to it) is not shown
// again, and one that only the corrected past has is shown now.
export class FxGate {
  constructor() { this.replay = false; this.frame = 0; this.done = new Map(); this.late = []; this._n = 0; }
  run(key, fn, args) {
    const F = this.frame;
    let list = this.done.get(key);
    if (!list) this.done.set(key, (list = []));
    if (this.replay) {
      for (const f of list) if (Math.abs(f - F) <= 3) return;
      list.push(F);
      // (vectors copied now: the simulation reuses its scratch ones)
      const a = args ? args.map((x) => (x && x.isVector3 ? x.clone() : x)) : null;
      this.late.push(() => fn(a));
      return;
    }
    list.push(F);
    fn(args);
  }
  // after a refresh: the effects found by a replay, and old bookkeeping forgotten
  flush() {
    const l = this.late;
    this.late = [];
    for (const fn of l) fn();
    if (++this._n % 120 === 0) for (const [k, list] of this.done) { const keep = list.filter((f) => f > this.frame - 40); if (keep.length) this.done.set(k, keep); else this.done.delete(k); }
  }
  // a proxy of a presentation object (fx, hud, audio, camera) whose calls go through the gate; `skip`: methods
  // that do nothing online (the camera's mode follows the match state instead), `pass`: plain queries
  wrap(name, target, { skip = [], pass = [] } = {}) {
    const gate = this;
    if (!target) return null;
    return new Proxy(target, {
      get(t, k) {
        const v = t[k];
        if (typeof v !== 'function') return v;
        if (pass.includes(k)) return v.bind(t);
        if (skip.includes(k)) return () => {};
        return (...args) => gate.run(name + '.' + String(k) + '|' + args.map(argKey).join('|'), (a) => v.apply(t, a), args);
      },
      set(t, k, v) { if (!skip.includes(k)) t[k] = v; return true; },
    });
  }
}
// what tells two calls apart: fighters by side, numbers rounded, words as they are (positions do not count)
function argKey(a) {
  if (a == null) return '';
  const t = typeof a;
  if (t === 'number') return String(Math.round(a * 100) / 100);
  if (t === 'string') return a;
  if (t === 'boolean') return a ? 't' : 'f';
  if (a.ch && a.index !== undefined) return 'F' + a.index;
  if (a.bone) return a.bone;
  return '';
}
