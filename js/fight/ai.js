// CPU opponent: produces controller input frames (screen space) from a plan queue.
import { B1, B2, B3, B4 } from './input.js';

// Per level: react (frames; a move seen with less than half of this left before it lands is not guarded, bar a snap
// guess), block (chance to guard a move seen in time), lowRead (to guard a low one low), aggr, punish (a blocked
// unsafe move), juggle, think (frames a pause lasts), side (sidestep), throwBreak (also the tech roll), and
//   open:    share of the pauses in neutral spent stepping in instead of waiting. Standing still guards highs and mids
//            by itself (js/fight/fighter.js), so a CPU that mostly waited blocked nearly everything, the easy one most
//   recover: chance to have the guard up when a hit stun or a block stun ends (otherwise it steps in or hits back)
//   snap:    chance to guard a move seen too late anyway
//   rage:    chance per decision within reach to fire the rage art once it is ready
//   string:  chance to carry a jab on into a string
// Every roll is made once per thing seen (a stun, a move of the opponent, a launch): rolled again at every decision
// while it lasted, a 15 % punish was nearer 50 %.
const LEVELS = {
  1: { react: 28, block: 0.15, lowRead: 0.1, aggr: 0.3, punish: 0.08, juggle: 0.08, think: 16, side: 0.02, throwBreak: 0.03, open: 0.6, recover: 0.3, snap: 0.03, rage: 0.015, string: 0.3 },
  2: { react: 22, block: 0.3, lowRead: 0.22, aggr: 0.38, punish: 0.2, juggle: 0.25, think: 13, side: 0.04, throwBreak: 0.12, open: 0.45, recover: 0.5, snap: 0.08, rage: 0.03, string: 0.45 },
  3: { react: 20, block: 0.38, lowRead: 0.3, aggr: 0.42, punish: 0.28, juggle: 0.38, think: 12, side: 0.06, throwBreak: 0.22, open: 0.4, recover: 0.56, snap: 0.08, rage: 0.035, string: 0.48 },
  4: { react: 16, block: 0.5, lowRead: 0.42, aggr: 0.47, punish: 0.42, juggle: 0.52, think: 10, side: 0.09, throwBreak: 0.35, open: 0.3, recover: 0.68, snap: 0.12, rage: 0.05, string: 0.52 },
  5: { react: 12, block: 0.62, lowRead: 0.55, aggr: 0.54, punish: 0.6, juggle: 0.72, think: 8, side: 0.12, throwBreak: 0.5, open: 0.2, recover: 0.8, snap: 0.18, rage: 0.08, string: 0.58 },
};

const BTN = { 1: B1, 2: B2, 3: B3, 4: B4 };

// command string -> list of input frames {fwd, up, press, n}
function encode(cmd) {
  const out = [];
  if (cmd.startsWith('f,f')) {
    out.push({ fwd: 1, up: 0, press: 0, n: 2 }, { fwd: 0, up: 0, press: 0, n: 2 });
    cmd = 'f' + cmd.slice(3);
  }
  let fwd = 0, up = 0, press = 0;
  for (const t of cmd.split('+')) {
    if (t === 'f') fwd = 1; else if (t === 'b') fwd = -1;
    else if (t === 'd') up = -1; else if (t === 'u') up = 1;
    else if (t === 'df') { fwd = 1; up = -1; } else if (t === 'db') { fwd = -1; up = -1; }
    else if (t === 'uf') { fwd = 1; up = 1; }
    else if (BTN[t]) press |= BTN[t];
  }
  if (up < 0 && press) out.push({ fwd, up, press: 0, n: 2 }); // be crouched first
  out.push({ fwd, up, press, n: 2 });
  out.push({ fwd: up < 0 ? fwd : 0, up: up < 0 ? up : 0, press: 0, n: 3 });
  return out;
}

export class AIController {
  constructor(level = 3) {
    this.setLevel(level);
    this.plan = [];
    this.cool = 0;
    this.prevHeld = 0;
    this.marks = {};
  }
  setLevel(l) { this.level = l; this.P = LEVELS[Math.max(1, Math.min(5, l))]; }
  attach(f, match) { this.f = f; this.match = match; }

  push(cmd) { this.plan.push(...encode(cmd)); }
  hold(fwd, up, n) { this.plan.push({ fwd, up, press: 0, n }); }
  wait(n) { this.plan.push({ fwd: 0, up: 0, press: 0, n }); }

  poll() {
    const f = this.f, m = this.match;
    if (!f || !m) return { dx: 0, dy: 0, held: 0, pressed: 0 };
    // a plan of attacks made while the opponent was close (a juggle, a string) is dropped once he has been knocked
    // out of reach onto the floor: punching the air two metres away from a body lying down looks broken
    const o = f.opp;
    const od = o ? f.dist() : 0;
    if (o && this.plan.length && ((['down', 'land', 'getup'].includes(o.state) && od > 1.9) || (o.state === 'air' && od > 2.4)) && this.plan.some((q) => q.press)) {
      this.plan.length = 0;
    }
    if (!this.plan.length) this.decide();
    let cur = this.plan[0] || { fwd: 0, up: 0, press: 0, n: 1 };
    if (this.plan.length) { cur.n--; if (cur.n <= 0) this.plan.shift(); }
    const held = cur.press;
    const pressed = held & ~this.prevHeld;
    this.prevHeld = held;
    const dx = cur.fwd * m.screenForward(f);
    return { dx, dy: cur.up, held, pressed };
  }

  has(move) { return !!this.f.moves[move]; }
  // true the first time a decision sees this instance of something whose frames count up from 0 (a move of the
  // opponent, a stun, a launch): the same move used again starts its count over
  once(tag, obj, t) {
    const s = this.marks[tag] || (this.marks[tag] = { obj: null, t: 0 });
    const fresh = s.obj !== obj || t < s.t;
    s.obj = obj; s.t = t;
    return fresh;
  }
  // a pause in neutral: guarded where it stands (crouched now and then), or stepping in with the guard down
  pause(n, crouch = 0) {
    if (Math.random() < this.P.open) this.hold(1, 0, n);
    else this.hold(0, Math.random() < crouch ? -1 : 0, n);
  }

  decide() {
    const f = this.f, o = f.opp, P = this.P, m = this.match;
    const r = Math.random();
    const d = f.dist();
    if (m.phase !== 'fight') { this.wait(10); return; }
    // --- being thrown: try to break
    if (f.state === 'thrown') { if (r < P.throwBreak) { this.plan.push({ fwd: 0, up: 0, press: B1 | B2, n: 2 }); } this.wait(20); return; }
    // --- knocked down: get up (sometimes delayed)
    if (f.state === 'down') { if (r < 0.6) this.plan.push({ fwd: 0, up: 0, press: B3, n: 2 }); this.wait(8 + Math.floor(Math.random() * 20)); return; }
    // --- hitting the floor: tech roll back up (reaction skill shared with throw breaks)
    if (f.state === 'land' && f.sf <= 8 && f.hp > 0) { if (r < (P.throwBreak ?? 0.4)) this.plan.push({ fwd: 0, up: 0, press: B1, n: 2 }); this.wait(12); return; }
    if (['air', 'land', 'getup', 'tech', 'throwing'].includes(f.state)) { this.wait(4); return; }
    // --- in block or hit stun: once per stun, a punish if the blocked move left a gap, and whether the guard is up
    // when the stun ends; if not, it steps in (or hits back) the moment it can
    if (f.state === 'block' || f.state === 'hit') {
      if (this.once('stun', f.state, f.sf)) {
        const am = o.move;
        if (f.state === 'block' && am && am.hit && am.hit.blk <= -10 && Math.random() < P.punish) {
          this.wait(Math.max(1, f.stun - 1));
          this.push(am.hit.blk <= -13 && this.has('uppercut') ? 'df+2' : '1');
          if (Math.random() < 0.6) { this.wait(10); this.push('2'); }
          return;
        }
        if (Math.random() >= P.recover) {
          this.hold(0, f.crouching ? -1 : 0, Math.max(1, f.stun));
          if (Math.random() < P.aggr * 0.5) this.push('1'); else this.hold(1, 0, 8 + Math.floor(Math.random() * 8));
          return;
        }
      }
      this.hold(f.state === 'block' ? -1 : 0, f.crouching ? -1 : 0, 4); return;
    }
    // --- opponent juggled: follow up
    if (o.state === 'air' && o.pos.y > 0.2 && d < 2.2 && this.once('air', o, o.sf) && Math.random() < P.juggle) {
      if (d > 1.3) this.push('f,f');
      // let the body come down into reach before swinging: the first hit meets it falling through ~0.7 m
      // (swinging at once, the first strikes of the juggle went under a body still a metre and more up)
      const g = 17 * 0.92, vy = o.vel.y, y0 = o.pos.y;
      const disc = vy * vy + 2 * g * (y0 - 0.7);
      if (disc > 0) {
        const tFall = (vy + Math.sqrt(disc)) / g;
        this.wait(Math.max(1, Math.round(tFall * 60) - 10 - (d > 1.3 ? 6 : 0)));
      }
      const juggles = this.f.style.juggle || ['1', '1', '2', '4'];
      for (const c of juggles) { this.push(c); this.wait(8 + Math.floor(Math.random() * 4)); }
      return;
    }
    // --- opponent down: pressure with lows or wait
    if (o.state === 'down' || o.state === 'land') {
      if (d > 1.6) { this.hold(1, 0, 10); return; }
      if (Math.random() < 0.35) this.push('d+3'); else this.wait(10);
      return;
    }
    // --- react to an incoming attack
    if (o.state === 'move' && o.move && o.move.hit && o.mf < o.move.hit.f[0]) {
      const lvl = o.move.hit.lvl;
      const inRange = d < 1.9;
      if (inRange && this.once('seen', o.move, o.mf)) {
        const timeLeft = o.move.hit.f[0] - o.mf;
        if (timeLeft > P.react * 0.5 || Math.random() < P.snap) {
          if (Math.random() < P.side && lvl !== 'low') { this.push(Math.random() < 0.5 ? 'u' : 'd'); this.wait(6); return; }
          if (Math.random() < P.block) {
            const low = lvl === 'low' ? Math.random() < P.lowRead + 0.2 : Math.random() < 0.08;
            if (lvl === 'throw') { this.push('d'); this.hold(0, -1, 14); return; }
            this.hold(-1, low ? -1 : 0, timeLeft + 12);
            return;
          }
        }
      }
    }
    // --- whiff punish: opponent in recovery
    if (o.state === 'move' && o.move && o.move.hit && o.mf > o.move.hit.f[1] + 2 && d < 1.6 && this.once('whiff', o.move, o.mf) && Math.random() < P.punish * 0.7) {
      this.push(Math.random() < 0.5 && this.has('uppercut') ? 'df+2' : '1'); this.wait(10); this.push('2');
      return;
    }
    // --- rage art when available and in range
    if (f.rage && !f.rageUsed && d < 1.35 && Math.random() < P.rage) { this.push('1+2+3+4'); this.wait(20); return; }
    // --- neutral game
    const aggr = P.aggr;
    if (d > 2.4) {
      if (Math.random() < 0.35) this.push('f,f'); else this.hold(1, 0, 14 + Math.floor(Math.random() * 12));
      return;
    }
    if (d > 1.45) {
      const x = Math.random();
      if (x < aggr * 0.35) { this.push(this.pick(['f,f+2', ...(this.f.style.longRange || [])])); return; }
      if (x < aggr) { this.hold(1, 0, 8 + Math.floor(Math.random() * 10)); return; }
      if (x < aggr + 0.1) { this.push('b,b'.replace('b,b', 'b')); this.hold(-1, 0, 10); return; }
      this.pause(P.think);
      return;
    }
    // close range
    const x = Math.random();
    if (x < aggr) {
      const opts = this.f.style.aiMoves || ['1', '1', '2', 'd+3', 'df+1', 'df+2', '3', '4', 'd+4', '1+3'];
      const cmd = this.pick(opts);
      this.push(cmd);
      // natural strings
      if (cmd === '1' && Math.random() < P.string) { this.wait(10); this.push('2'); if (Math.random() < P.string * 0.7 && this.f.style.onetwoFinish) { this.wait(12); this.push('4'); } }
      this.wait(4 + Math.floor(Math.random() * P.think));
    } else if (x < aggr + 0.2) {
      this.hold(-1, 0, 10 + Math.floor(Math.random() * 12)); // guard / back off
    } else if (x < aggr + 0.27) {
      this.push(Math.random() < 0.5 ? 'u' : 'd'); this.wait(8);
    } else {
      this.pause(P.think + 4, 0.25);
    }
  }

  pick(a) { return a[Math.floor(Math.random() * a.length)]; }
}
