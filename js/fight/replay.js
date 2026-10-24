// Playing a moment of a fight again (JUGADA DEL COMBATE). A fight with det on depends on nothing but the two
// fighters' inputs (js/fight/match.js), so it can be replayed exactly from a snapshot of the simulation and the
// inputs that followed it. Local fights record both here: every input of every frame, and a snapshot of the
// simulation every 1.5 s of the last few seconds; when the match finds a new best play, the snapshot from before it
// is kept, so the best play of the whole match can always be replayed. (Online the session keeps the inputs of the
// whole fight, and a replay starts from its first frame.)
import { Snap, saveMatch } from '../net/simstate.js';
import { packIn, unpackIn, NEUTRAL } from '../net/rollback.js';

const RING = 5, EVERY = 90;
// frames shown before the first blow of the play and after its last one (more after a knockout: the body flies)
export const LEAD = 70, TAIL = 70, KO_TAIL = 150;
const NONE = { dx: 0, dy: 0, held: 0, pressed: 0 };

export class FightRecorder {
  constructor(match) {
    this.m = match;
    this.log = new Uint16Array(2 * 60 * 240);
    this.from = -1; // the first frame recorded (a fight resumed from a save starts recording there)
    this.ring = [];
    this.best = null; // { snap, seq }
    this.seq = 0;
  }
  // a fighter's controls, recorded as they are read
  wrap(ctrl, i) {
    const self = this, m = this.m;
    return { poll() { const r = ctrl ? ctrl.poll() : NONE; self.put(m.frame - 1, i, r); return r; }, get level() { return ctrl?.level; } };
  }
  put(f, i, r) {
    if (f < 0) return;
    if (this.from < 0) this.from = f;
    const k = f * 2 + i;
    if (k >= this.log.length) { const l = new Uint16Array(Math.max(this.log.length * 2, k + 2)); l.fill(NEUTRAL); l.set(this.log); this.log = l; }
    this.log[k] = packIn(r);
  }
  // after every simulated frame: the snapshot ring, and the snapshot for a new best play
  afterStep() {
    const m = this.m;
    if (m.frame % EVERY === 0 && m.frame > this.from) {
      const s = this.ring.length < RING ? new Snap() : this.ring.shift();
      saveMatch(m, s); this.ring.push(s);
    }
    const B = m.best;
    if (B.seq !== this.seq) {
      this.seq = B.seq;
      const want = Math.max(0, B.f0 - LEAD);
      let pick = null;
      for (const s of this.ring) if (s.frame <= want) pick = s;
      pick ||= this.ring[0];
      this.best = pick ? { snap: new Snap().copyFrom(pick), seq: B.seq } : null;
    }
  }
  // what a replay of the best play needs (null if it cannot be played: recorded from too late, or nothing kept)
  bestReplay() {
    const B = this.m.best;
    if (!this.best || this.best.seq !== B.seq || this.best.snap.frame < this.from) return null;
    return { snap: this.best.snap, from: Math.max(this.best.snap.frame, B.f0 - LEAD), to: B.f1 + (B.flags & 4 ? KO_TAIL : TAIL), ctrl: (i) => logCtrl(this, i) };
  }
}

// controls that play a recorded log (r: { log, from }) back, frame by frame, then nothing
export function logCtrl(r, i, m = null) {
  const out = {};
  return {
    bind(match) { m = match; return this; },
    poll() { const f = m.frame - 1, k = f * 2 + i; return unpackIn(f >= 0 && k < r.log.length ? r.log[k] : NEUTRAL, out); },
  };
}

// the presentation objects of a replay seen through a switch: while it is fast-forwarding to the moment to show,
// effects, sounds, the HUD and the camera stay quiet
export function quietFacade(g) {
  const st = { quiet: true };
  const wrap = (target, pass = [], mute = []) => new Proxy(target, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (pass.includes(k)) return v.bind(t);
      if (mute.includes(k)) return () => undefined;
      return (...a) => (st.quiet ? undefined : v.apply(t, a));
    },
    set(t, k, v) { if (!st.quiet) t[k] = v; return true; },
  });
  return {
    st,
    // (the winner's line is left out: the play ends on his first moments of glory, it would be cut off)
    fx: wrap(g.fx), hud: wrap(g.hud, [], ['say', 'introLine']), audio: wrap(g.audio, ['talkLevel'], ['say', 'line', 'hush']), camCtl: wrap(g.camCtl, ['right', 'forwardFlat']),
    get stage() { return g.stage; },
    ragdolls: { clear() { g.ragdolls.clear(); }, freeze() { if (!st.quiet) g.ragdolls.freeze(); } },
    onKO(att, def, p) { if (!st.quiet) g.onKO(att, def, p); },
    onMatchEnd() {},
  };
}
