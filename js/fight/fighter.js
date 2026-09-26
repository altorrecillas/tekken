// Fighter: state machine, movement physics, animation playback and hit/hurt volumes.
import * as THREE from 'three';
import { Rig, newPose, lerpPose, POSE } from '../anim/rig.js';
import { BodyState } from '../anim/body.js';
import { FootPlanter } from '../anim/feet.js';
import { buildClips, buildMoves, commandList } from './moves.js';
import { STYLES } from './styles.js';
import { B1, B2, B3, B4 } from './input.js';

export const FPS = 60;
const DT = 1 / FPS;
const GRAV = 17;

// numpad notation relative to facing: 6 = forward
function toNumpad(fwd, up) {
  return 5 + fwd + up * 3;
}
const DIRCODE = { f: 6, b: 4, u: 8, d: 2, uf: 9, ub: 7, df: 3, db: 1, n: 5 };
const BTN = { 1: B1, 2: B2, 3: B3, 4: B4 };

function parseCommand(str) {
  // "f,f+2", "df+1", "1+2", "f+1+2", "d+4"
  const parts = str.split(',');
  let motion = null;
  let last = parts[parts.length - 1];
  if (parts.length > 1) motion = parts.slice(0, -1).join(',') + ',' + last.split('+')[0];
  const toks = last.split('+');
  let dir = null, mask = 0;
  for (const t of toks) {
    if (DIRCODE[t] !== undefined) dir = DIRCODE[t];
    else if (BTN[t]) mask |= BTN[t];
  }
  if (motion === 'f,f') { dir = 6; }
  return { motion, dir, mask, str };
}

const GUARD_STATES = new Set(['idle', 'walkF', 'walkB', 'block', 'crouch', 'rise', 'dashB', 'side']);
const UBS_SKIP = new Set(['throwing', 'thrown', 'rageArt', 'rageHit', 'ko', 'win', 'lose', 'intro', 'down', 'land', 'getup', 'tech', 'air']);
const _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3(), _u3 = new THREE.Vector3(), _u4 = new THREE.Vector3(), _u5 = new THREE.Vector3();
// channels of the anti-pop filter and their natural frequency (rad/s); spine and neck have their own springs
const SMOOTH_CH = [['rootPos', 50], ['rootRot', 50], ['handL', 75], ['poleL', 60], ['twistL', 60], ['wristL', 60], ['fistL', 45], ['clavL', 60],
  ['handR', 75], ['poleR', 60], ['twistR', 60], ['wristR', 60], ['fistR', 45], ['clavR', 60], ['kneeL', 55], ['kneeR', 55],
  ['jaw', 40], ['aimL', 60], ['aimR', 60], ['hgL', 60], ['hgPosL', 60], ['hgR', 60], ['hgPosR', 60]]
  .map(([n, w]) => [POSE[n][0], POSE[n][1], w]);
const ROOT_END = Math.max(POSE.rootPos[0], POSE.rootRot[0]);
const LIMB_BONE = {
  handL: 'wrist.L', handR: 'wrist.R', footL: 'foot.L', footR: 'foot.R', kneeL: 'lowerleg01.L', kneeR: 'lowerleg01.R',
  head: 'head', belly: 'spine04', forearmR: 'lowerarm02.R', forearmL: 'lowerarm02.L', elbowR: 'lowerarm01.R', elbowL: 'lowerarm01.L',
};

export class Fighter {
  constructor(match, index, ch, id) {
    this.match = match;
    this.index = index;
    this.ch = ch;
    this.id = id;
    this.style = STYLES[id];
    this.stats = this.style.stats;
    this.rig = new Rig(ch);
    this.clips = buildClips(this.style);
    this.moves = buildMoves(this.style);
    this.commands = commandList(this.style).map(([c, m]) => ({ ...parseCommand(c), move: m })).filter(c => this.moves[c.move]);
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.prevYaw = 0;
    this.pose = newPose(); this.prevPose = newPose(); this.renderPose = newPose(); this.blendFrom = newPose();
    this.tmpPose = newPose();
    // inertialized transitions: the clip pose before secondary layers, its previous frame, and the decaying offset
    this.base = newPose(); this.basePrev = newPose(); this.offX = newPose(); this.offV = newPose();
    this._s0 = newPose(); this._s1 = newPose(); this.inertH = 0; this.snapPose = true;
    this.feet = new FootPlanter(this);
    this.feet.onStep = (side, len) => { if (len > 0.14 && this.match.phase === 'fight') this.match.sfx?.('step', this); };
    this.maxHp = this.stats.health;
    this.hp = this.maxHp;
    this.hist = [];
    this.ctrl = null;
    this.reset();
    // hit sphere offsets (in rest space) from bone head to the striking surface
    const R = ch.rest;
    const off = (a, b, t) => R[b].head.clone().sub(R[a].head).multiplyScalar(t);
    this.limbOffset = {
      handL: off('wrist.L', 'finger3-1.L', 0.75), handR: off('wrist.R', 'finger3-1.R', 0.75),
      footL: off('foot.L', 'toe3-1.L', 0.55), footR: off('foot.R', 'toe3-1.R', 0.55),
      kneeL: new THREE.Vector3(0, 0, 0.04), kneeR: new THREE.Vector3(0, 0, 0.04),
      head: new THREE.Vector3(0, 0.1, 0.06), belly: new THREE.Vector3(0, 0, 0.14),
      forearmR: new THREE.Vector3(), forearmL: new THREE.Vector3(), elbowR: new THREE.Vector3(), elbowL: new THREE.Vector3(),
    };
    this.bodyR = 0.16 * Math.sqrt(this.stats.weight);
    // secondary motion: damped springs driven by impacts (spine / neck pitch-yaw-roll)
    this.spring = { sp: new THREE.Vector3(), sv: new THREE.Vector3(), np: new THREE.Vector3(), nv: new THREE.Vector3() };
    this.shakeT = 0;
    this.breath = Math.random() * 10;
  }

  // impact impulse in character space: dir = world direction of the blow, amt ~ 0..1
  impulse(dirWorld, amt, high = true) {
    const d = this.worldToChar(dirWorld.clone().add(this.pos), new THREE.Vector3());
    const k = amt * 9;
    // pushed backwards -> pitch back (negative), sideways -> roll/yaw
    this.spring.sv.x += -d.z * k * (high ? 0.6 : 1.0);
    this.spring.sv.z += d.x * k * 0.5;
    this.spring.sv.y += d.x * k * 0.4;
    if (high) { this.spring.nv.x += -d.z * k * 1.4; this.spring.nv.y += d.x * k * 1.2; this.spring.nv.z += d.x * k * 0.6; }
    this.shakeT = 1;
  }

  stepSprings() {
    const S = this.spring, dt = 1 / 60;
    for (const [p, v, k, c] of [[S.sp, S.sv, 170, 14], [S.np, S.nv, 220, 16]]) {
      v.addScaledVector(p, -k * dt).multiplyScalar(Math.exp(-c * dt));
      p.addScaledVector(v, dt);
    }
  }

  reset() {
    this.state = 'idle'; this.sf = 0;
    if (this.overlap) this.overlap.init = false;
    this.move = null; this.mf = 0; this.moveHit = false; this.moveConnected = false;
    this.clip = this.clips.idle; this.cf = 0; this.blendT = 1; this.blendDur = 1;
    this.feet?.reset(); this.ubc = 0; this.snapSmooth = true; this.yawRate = 0;
    this.stun = 0; this.juggles = 0; this.comboHits = 0; this.comboDmg = 0;
    this.slide = 0; this.vel.set(0, 0, 0); this.pos.y = 0;
    this.pending = 0; this.pendingT = 0; this.downT = 0; this.invuln = 0;
    this.crouching = false; this.airborne = false; this.guard = 'none';
    this.downHold = 0; this.upHold = 0; this.lastDy = 0;
    this.sideDir = 0; this.throwPartner = null; this.throwMove = null;
    this.ko = false; this.hitFlash = 0; this.counterFlash = 0;
    this.hist.length = 0;
    this.rage = false;
    this.rageUsed = false;
  }

  get opp() { return this.match.fighters[1 - this.index]; }

  // axis towards opponent (unit, ground plane)
  axis(out = new THREE.Vector3()) {
    out.subVectors(this.opp.pos, this.pos); out.y = 0;
    const l = out.length();
    return l > 1e-5 ? out.multiplyScalar(1 / l) : out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  dist() { const d = new THREE.Vector3().subVectors(this.opp.pos, this.pos); d.y = 0; return d.length(); }

  play(name, blend = 4, clip = null) {
    const c = clip || this.clips[name];
    if (!c) return;
    // inertialization (instead of a cross-fade from a frozen pose): keep the offset between what is on screen and
    // the new clip, and its velocity, and decay it on a critically damped spring, so the body carries its momentum
    // through the switch. Offsets are taken against the new clip one frame back (it is sampled at 0 next frame).
    if (this.snapPose) { this.offX.fill(0); this.offV.fill(0); this.inertH = 0; this.snapPose = false; }
    else {
      c.sample(0, this._s0); c.sample(1, this._s1);
      const X = this.offX, V = this.offV, B = this.base, P = this.basePrev, s0 = this._s0, s1 = this._s1;
      for (let i = 0; i < X.length; i++) {
        const d = s1[i] - s0[i];
        X[i] = B[i] - (s0[i] - d);
        V[i] = (B[i] - P[i]) - d;
      }
      this.inertH = Math.max(0.8, blend * 0.36);
    }
    this.blendFrom.set(this.pose);
    this.clip = c; this.clipName = name; this.cf = 0; this.cfRate = 1;
    this.blendT = 1; this.blendDur = Math.max(1, blend);
  }

  setState(s) { this.state = s; this.sf = 0; }

  // ------------------------------------------------------------------ input
  readInput() {
    const raw = this.ctrl ? this.ctrl.poll() : { dx: 0, dy: 0, held: 0, pressed: 0 };
    const fwd = raw.dx * this.match.screenForward(this);
    const d = toNumpad(fwd, raw.dy);
    const f = { d, fwd, up: raw.dy, held: raw.held, pressed: raw.pressed };
    this.hist.unshift(f);
    if (this.hist.length > 40) this.hist.pop();
    this.inp = f;
    if (raw.pressed & (B1 | B2 | B3 | B4)) {
      this.pending |= raw.pressed & (B1 | B2 | B3 | B4);
      if (!this.pendingT) this.pendingT = 2; // small window to merge simultaneous presses
    }
    return f;
  }

  tapped(dir, within = 16) {
    // pattern: dir (now) <- not dir <- dir, within N frames
    const h = this.hist;
    if (!h.length || h[0].d !== dir) return false;
    let i = 1;
    while (i < h.length && h[i].d === dir) i++;
    if (i > 6) return false; // current press must be fresh
    let j = i;
    while (j < h.length && j < within && h[j].d !== dir) j++;
    if (j >= within || j >= h.length) return false;
    let k = j;
    while (k < h.length && h[k].d === dir) k++;
    return k - j <= 8; // first tap was short
  }

  matchCommand(mask, d) {
    const fdash = this.tapped(6, 18) || (this.state === 'dashF');
    const cands = this.commands;
    const dirClass = (x) => (x === 1 || x === 2 || x === 3 ? 'd' : x === 7 || x === 8 || x === 9 ? 'u' : 'n');
    // exact
    for (const c of cands) {
      if (c.mask !== mask) continue;
      if (c.motion === 'f,f,f' || c.motion === 'f,f') { if (fdash) return c; continue; }
      if (c.dir === null ? (d === 5 || d === 4 || d === 6) && c.mask === mask && !cands.some(x => x.mask === mask && x.dir === d && !x.motion) : c.dir === d) return c;
    }
    // fallback: direction class
    for (const c of cands) {
      if (c.mask !== mask || c.motion) continue;
      if (c.dir !== null && dirClass(c.dir) === dirClass(d) && dirClass(d) !== 'n' && (c.dir === 2 || c.dir === 8)) return c;
    }
    for (const c of cands) if (c.mask === mask && c.dir === null && !c.motion) return c;
    // single button from a multi-press
    if (mask & (mask - 1)) {
      for (const b of [B1, B2, B3, B4]) if (mask & b) return this.matchCommand(b, d);
    }
    return null;
  }

  canAct() {
    return ['idle', 'walkF', 'walkB', 'crouch', 'rise', 'dashF', 'dashB', 'side'].includes(this.state) ||
      (this.state === 'move' && this.mf >= this.move.total - 4) ||
      (this.state === 'dashF' && this.sf > 4);
  }

  startMove(name, from = null) {
    const m = this.moves[name];
    if (!m) return false;
    this.move = m; this.moveName = name; this.mf = 0; this.moveHit = false; this.moveConnected = false; this.latchedHit = null;
    this.setState('move');
    this.play(name, from === 'cancel' ? 3 : 4, m.clip);
    this.advPrev = 0;
    this.crouching = !!m.stayCrouch;
    this.match.onMoveStart(this, m);
    return true;
  }

  // ------------------------------------------------------------------ per-frame logic
  think() {
    const inp = this.inp;
    if (this.pendingT > 0) this.pendingT--;
    // track holds for crouch/sidestep/jump disambiguation
    this.downHold = inp.up < 0 ? this.downHold + 1 : 0;
    this.upHold = inp.up > 0 ? this.upHold + 1 : 0;
    const s = this.state;
    this.sf++;

    // string cancels
    if (s === 'move' && this.pending && this.pendingT === 0 && this.move.cancel) {
      const c = this.move.cancel;
      if (this.mf >= c.from && this.mf <= c.to) {
        for (const k in c.next) {
          if (c.next[k] && this.pending === BTN[k]) { this.pending = 0; this.startMove(c.next[k], 'cancel'); return; }
        }
      }
    }
    // new attacks
    if (this.pending && this.pendingT === 0) {
      if (this.canAct()) {
        let cmd = this.matchCommand(this.pending, inp.d);
        if (cmd && cmd.move === 'rageArt' && !(this.rage && !this.rageUsed)) cmd = this.matchCommand(B1 | B2, inp.d);
        this.pending = 0;
        if (cmd) {
          if (cmd.move === 'rageArt') { this.rageUsed = true; this.match.onRageStart?.(this); }
          const mv = this.moves[cmd.move];
          if (mv.crouchStart && !this.crouching && cmd.dir !== 2 && cmd.dir !== 1 && cmd.dir !== 3) { /* allowed */ }
          this.startMove(cmd.move);
          return;
        }
      } else if (!(s === 'move' && this.mf > this.move.total - 10)) {
        this.pending = 0; // drop presses that cannot be buffered
      }
    }

    switch (s) {
      case 'idle': case 'walkF': case 'walkB': {
        if (inp.up < 0) { this.setState('crouch'); this.crouching = true; this.play('crouch', 5); break; }
        if (inp.up > 0) { this.setState('prejump'); this.play('jump', 3); break; }
        if (inp.fwd > 0) {
          if (this.tapped(6, 18) && s !== 'walkF') { this.setState('dashF'); this.play('dashF', 3); this.match.sfx('step', this); break; }
          if (s !== 'walkF') { this.setState('walkF'); this.play('walkF', 6); }
        } else if (inp.fwd < 0) {
          if (this.tapped(4, 18) && s !== 'walkB') { this.setState('dashB'); this.play('dashB', 3); this.match.sfx('step', this); break; }
          if (s !== 'walkB') { this.setState('walkB'); this.play('walkB', 6); }
        } else if (s !== 'idle') { this.setState('idle'); this.play('idle', 7); }
        break;
      }
      case 'crouch': {
        if (this.clipName === 'crouch' && this.cf >= 6) this.play('crouchIdle', 3);
        if (inp.up >= 0) {
          // quick tap = sidestep towards the camera
          if (this.sf < 8) { this.startSide(-1); break; }
          this.setState('rise'); this.crouching = false; this.play('idle', 7);
        }
        break;
      }
      case 'rise':
        if (this.sf > 8) this.setState('idle');
        break;
      case 'prejump':
        if (inp.up <= 0 && this.sf < 7) { this.startSide(1); break; }
        if (this.sf >= 7) {
          this.setState('jump'); this.airborne = true;
          this.vel.y = 5.2; this.jumpFwd = inp.fwd;
          this.match.sfx('step', this);
        }
        break;
      case 'jump':
        if (this.pos.y <= 0 && this.vel.y <= 0 && this.sf > 4) {
          this.pos.y = 0; this.vel.y = 0; this.airborne = false; this.setState('idle'); this.play('idle', 6);
          this.match.fx.dust(this.pos, 0.6); this.match.sfx('land', this);
        }
        break;
      case 'dashF': if (this.sf >= 16) { this.setState('idle'); this.play('idle', 6); } break;
      case 'dashB': if (this.sf >= 22) { this.setState('idle'); this.play('idle', 6); } break;
      case 'side': if (this.sf >= 22) { this.setState('idle'); this.play('idle', 6); } break;
      case 'move': {
        this.mf++;
        if (this.mf >= this.move.total) {
          const stay = this.move.stayCrouch && inp.up < 0;
          this.move = null;
          if (stay) { this.setState('crouch'); this.sf = 10; this.play('crouchIdle', 4); }
          else { this.crouching = false; this.setState('idle'); this.play('idle', 6); }
        }
        break;
      }
      case 'block': case 'hit':
        if (--this.stun <= 0) {
          this.comboHits = 0; this.comboDmg = 0; this.juggles = 0;
          if (this.crouching && inp.up < 0) { this.setState('crouch'); this.sf = 10; this.play('crouchIdle', 5); }
          else { this.crouching = false; this.setState('idle'); this.play('idle', 6); }
        }
        break;
      case 'air':
        if (this.pos.y <= 0 && this.vel.y <= 0 && this.sf > 2) {
          this.pos.y = 0; this.vel.y = 0; this.airborne = false;
          if (this.hp <= 0) { this.setState('ko'); this.match.onLand(this, true); break; }
          this.setState('land'); this.play('land', 4);
          this.match.onLand(this, false);
        }
        break;
      case 'land':
        // tech (ukemi): a button tapped as the body hits the floor springs straight back up, rolling away from the
        // attacker, invulnerable, out of range of ground follow-ups
        if (this.sf <= 10 && this.hp > 0 && (inp.pressed & (B1 | B2 | B3 | B4))) {
          this.setState('tech'); this.play('getup', 2); this.cfRate = 1.7; this.invuln = 24; this.slide = 6;
          this.comboHits = 0; this.comboDmg = 0; this.juggles = 0;
          this.match.onTech?.(this);
          break;
        }
        if (this.sf >= 14) { this.setState('down'); this.play('lie', 4); this.downT = 0; }
        break;
      case 'tech':
        if (this.cf >= 34) { this.setState('idle'); this.play('idle', 4); }
        break;
      case 'down':
        this.downT++;
        if ((this.downT > 14 && (inp.pressed || inp.up !== 0 || inp.fwd !== 0)) || this.downT > 55) {
          this.setState('getup'); this.play('getup', 3); this.invuln = 24;
          this.comboHits = 0; this.comboDmg = 0; this.juggles = 0;
        }
        break;
      case 'getup':
        if (this.sf >= 34) { this.setState('idle'); this.play('idle', 5); }
        break;
      case 'throwing':
        if (this.sf >= this.throwMove.total) { this.setState('idle'); this.play('idle', 6); this.throwPartner = null; }
        break;
      case 'thrown':
        break;
      case 'win': case 'intro': case 'ko': case 'lose': case 'rageArt': case 'rageHit':
        break;
    }
    // guard status
    this.updateGuard();
  }

  startSide(dir) {
    this.setState('side'); this.sideDir = dir; this.crouching = false;
    this.play('side', 3);
    this.match.sfx('step', this);
  }

  updateGuard() {
    const s = this.state, inp = this.inp;
    this.guard = 'none';
    if (['idle', 'walkB', 'rise', 'dashB', 'block'].includes(s) && inp.fwd <= 0 && inp.up >= 0) this.guard = 'high';
    if ((s === 'crouch' || (s === 'block' && this.crouching)) && (inp.d === 1 || inp.d === 2)) this.guard = 'low';
    if (s === 'side' && this.sf > 12) this.guard = 'high';
  }

  // ------------------------------------------------------------------ physics
  physics() {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    const ax = this.axis();
    const s = this.state;
    const walk = this.stats.walk;
    let fwd = 0;
    if (s === 'walkF') fwd = 0.9 * walk * (this.rig.legScale || 1);
    else if (s === 'walkB') fwd = -0.75 * walk * (this.rig.legScale || 1);
    else if (s === 'dashF') fwd = (this.sf < 12 ? 4.2 : 1.5) * walk * Math.min(1, (this.sf + 1) / 3); // 2-frame ramp
    else if (s === 'dashB') fwd = (this.sf < 14 ? -3.6 : -0.8) * walk * Math.min(1, (this.sf + 1) / 3);
    else if (s === 'jump') fwd = (this.jumpFwd || 0) * 1.6;
    if (s === 'move' && this.move.advance) {
      const a = this.advanceAt(this.mf);
      let step = (a - this.advPrev) * FPS;
      // once the strike has connected at close range, stop stepping into the opponent's body
      if (step > 0 && this.moveConnected && this.opp && this.pos.distanceTo(this.opp.pos) < this.bodyR + this.opp.bodyR + 0.75) step = 0;
      // ... and the body stops closing in as soon as the striking fist / foot is already on the opponent (the rig
      // had to hold it back last frame): a strike that arrives early stays extended on the surface
      if (step > 0 && this.move.hit) {
        const lim = this.move.hit.limb, sd = lim.slice(-1);
        const ps = lim.startsWith('hand') ? this.rig.pushS?.[sd] : lim.startsWith('foot') ? this.rig.pushS?.['f' + sd] : null;
        if (ps && ps.lengthSq() > 0.035 * 0.035) step = 0;
      }
      // ... nor step closer than the strike needs: an arm or leg thrown from inside its own reach goes through the
      // opponent (clinch moves - headbutt, belly bump, knee, throws - are meant to close right in)
      if (step > 0 && this.opp && this.move.hit) {
        const limb = this.move.hit.limb, clinch = this.move.throw || limb === 'head' || limb === 'belly' || limb === 'kneeR' || limb === 'kneeL';
        const near = this.bodyR + this.opp.bodyR + (clinch ? 0.12 : limb.startsWith('foot') ? 0.5 : 0.42);
        // hip to hip (the clip's root motion carries the body ahead of this.pos)
        const ha = this.boneWorld('spine05', _u1), hb = this.opp.boneWorld('spine05', _u2);
        const hd = Math.hypot(hb.x - ha.x, hb.z - ha.z);
        if (hd - step * DT < near) step = Math.max(0, (hd - near) * FPS);
      }
      fwd += step;
      this.advPrev = a;
    }
    if (s === 'crouch' || s === 'rise') fwd = 0;
    this.pos.addScaledVector(ax, fwd * DT);
    // sidestep: circle around the opponent
    if (s === 'side') {
      const perp = new THREE.Vector3(-ax.z, 0, ax.x); // left of axis
      const sp = this.sf < 16 ? 2.4 : 0.6;
      this.pos.addScaledVector(perp, this.sideDir * sp * DT * this.match.sideSign(this));
    }
    // knockback slide (decays)
    if (Math.abs(this.slide) > 0.001) {
      this.pos.addScaledVector(ax, -this.slide * DT);
      this.slide *= this.airborne ? 0.97 : 0.86;
    }
    // vertical (a thrown fighter's height is scripted by the throw)
    if (s === 'thrown') this.vel.y = 0;
    else if (this.airborne || this.pos.y > 0 || this.vel.y !== 0) {
      this.vel.y -= GRAV * DT * (this.state === 'air' ? 0.92 : 1);
      this.pos.y += this.vel.y * DT;
      if (this.pos.y < 0 && this.state !== 'air' && this.state !== 'jump') { this.pos.y = 0; this.vel.y = 0; }
    }
    // facing: track the opponent unless committed to an attack's active phase
    const tracking = !(s === 'move' && this.mf > (this.move.hit ? this.move.hit.f[0] - 5 : 999)) && !['air', 'land', 'down', 'thrown', 'throwing', 'ko'].includes(s);
    const target = Math.atan2(ax.x, ax.z);
    let dy = target - this.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    // the turn rate eases in and is capped (~10 degrees a frame): facing a small drift is corrected at once, but an
    // opponent thrown or dashed behind is a quick turn round, not a half-turn snapped in one frame
    let rate = 0;
    if (tracking) rate = THREE.MathUtils.clamp(dy * (s === 'side' ? 0.35 : 0.5), -0.18, 0.18);
    else if (s === 'move') rate = dy * 0.04;
    this.yawRate = (this.yawRate || 0) + (rate - (this.yawRate || 0)) * 0.45;
    this.yaw += this.yawRate;
  }

  advanceAt(f) {
    const adv = this.move.advance;
    for (let i = 1; i < adv.length; i++) if (f <= adv[i][0]) {
      const t = (f - adv[i - 1][0]) / Math.max(1, adv[i][0] - adv[i - 1][0]);
      return adv[i - 1][1] + (adv[i][1] - adv[i - 1][1]) * t;
    }
    return adv[adv.length - 1][1];
  }

  // ------------------------------------------------------------------ animation
  animate() {
    this.prevPose.set(this.pose);
    this.basePrev.set(this.base);
    const c = this.clip;
    const f = (this.state === 'move' || this.state === 'rageArt') ? this.mf : this.cf;
    c.sample(f, this.tmpPose);
    this.cf += (this.state === 'walkF' || this.state === 'walkB') ? this.stats.walk : (this.cfRate || 1);
    if (this.inertH > 0) {
      // exact critically damped decay of the transition offset (half-life inertH frames, dt = 1 frame)
      const y = 2 * Math.LN2 / this.inertH, e = Math.exp(-y);
      const X = this.offX, V = this.offV, B = this.base, T = this.tmpPose;
      let m = 0;
      for (let i = 0; i < X.length; i++) {
        const x = X[i], v = V[i], j1 = v + x * y;
        X[i] = e * (x + j1); V[i] = e * (v - j1 * y);
        B[i] = T[i] + X[i];
        m = Math.max(m, Math.abs(X[i]) + Math.abs(V[i]));
      }
      if (m < 1e-4) this.inertH = 0;
    } else this.base.set(this.tmpPose);
    this.pose.set(this.base);
    // close quarters: the guard tightens (fists in towards the chin) instead of pushing through the opponent's.
    // The amount eases in and out on a critically damped curve (~8 frames): switched off with the state, it threw
    // the guard hands 15 cm forward on the first frame of every move at close range
    {
      let k = 0;
      if (GUARD_STATES.has(this.state) && this.opp && !this.ragdoll) { const d = this.dist(); if (d < 1.5) k = THREE.MathUtils.smoothstep(1.5 - d, 0, 0.5); }
      const G = this.tight || (this.tight = { x: k, v: 0 });
      if (this.snapSmooth) { G.x = k; G.v = 0; }
      const w = 25 / 60, e = Math.exp(-w), j0 = G.x - k, j1 = G.v + j0 * w;
      G.x = e * (j0 + j1) + k; G.v = e * (G.v - j1 * w);
      if (G.x > 1e-4) for (const s of ['L', 'R']) { const i = POSE['hgPos' + s][0]; this.pose[i + 2] *= 1 - 0.5 * G.x; this.pose[i + 1] -= 0.025 * G.x; }
    }
    this.smoothPose(this.pose);
    const sp = POSE.spine[0], nk = POSE.neck[0];
    // overlapping action: torso and head chase the clip on slightly under-damped springs, so strikes get a
    // little lag, follow-through and settle instead of snapping from key to key
    const O = this.overlap || (this.overlap = { s: new Float32Array(6), v: new Float32Array(6), init: false });
    if (!O.init) { for (let i = 0; i < 3; i++) { O.s[i] = this.pose[sp + i]; O.s[3 + i] = this.pose[nk + i]; } O.v.fill(0); O.init = true; }
    for (let i = 0; i < 6; i++) {
      const idx = i < 3 ? sp + i : nk + i - 3;
      const w = i < 3 ? 34 : 24, z = i < 3 ? 0.62 : 0.5; // natural frequency (rad/s) and damping ratio
      O.v[i] += (w * w * (this.pose[idx] - O.s[i]) - 2 * z * w * O.v[i]) / 60;
      O.s[i] += O.v[i] / 60;
      this.pose[idx] = O.s[i];
    }
    // secondary motion layers: impact springs + breathing
    this.stepSprings();
    const S = this.spring;
    this.pose[sp] += S.sp.x; this.pose[sp + 1] += S.sp.y; this.pose[sp + 2] += S.sp.z;
    this.pose[nk] += S.np.x; this.pose[nk + 1] += S.np.y; this.pose[nk + 2] += S.np.z;
    if (['idle', 'walkF', 'walkB', 'crouch', 'block'].includes(this.state)) {
      this.breath += 1 / 60;
      this.pose[sp] += Math.sin(this.breath * 2.1) * 0.012;
    }
    // upper-body spacing: a torso leaning into a strike at close range must not bury the head or chest in the
    // opponent (the pushbox only separates the hips). Measured on last frame's skeleton, corrected by leaning back
    // (spine and hip pitch) on a smooth integrator, so the strike still reaches but the bodies never interpenetrate.
    this.upperBodySpacing();
    // planted feet stay put in the world; they step when the body leaves them behind
    this.feet.apply(this.pose);
    this.applyRig(this.pose);
  }

  // Anti-pop filter: every channel except the feet (the planter owns them) follows the clip on a critically damped
  // second-order spring. Velocity breaks at keys (a hand stopping dead on its chamber pose, a strike starting at
  // full speed, a fast transition) are spread over two or three frames; the lag is about one frame.
  smoothPose(p) {
    const Sm = this.smooth || (this.smooth = { x: new Float32Array(p.length), v: new Float32Array(p.length), init: false });
    if (!Sm.init || this.snapSmooth) { Sm.x.set(p); Sm.v.fill(0); Sm.init = true; this.snapSmooth = false; return; }
    // exact update of x'' = -2w x' - w^2 (x - target) over one frame (unconditionally stable at any w)
    const dt = 1 / 60;
    // airborne and thrown bodies turn over fast (a swept fall, a suplex flip): the root follows the clip more
    // tightly there, or the body lags behind its own feet (the feet are not filtered) and lands still upright
    const fastRoot = this.state === 'air' || this.state === 'thrown';
    for (const [o, n, w0] of SMOOTH_CH) {
      const w = fastRoot && o <= ROOT_END ? 400 : w0;
      const e = Math.exp(-w * dt);
      for (let i = o; i < o + n; i++) {
        const j0 = Sm.x[i] - p[i], j1 = Sm.v[i] + j0 * w;
        Sm.x[i] = e * (j0 + j1 * dt) + p[i];
        Sm.v[i] = e * (Sm.v[i] - j1 * w * dt);
        p[i] = Sm.x[i];
      }
    }
  }

  upperBodySpacing() {
    const o = this.opp;
    const skip = !o || o.ragdoll || this.ragdoll || UBS_SKIP.has(this.state) || (this.state === 'move' && this.move?.throw);
    if (skip || !this.rig.world.head || !o.rig.world.neck01) { this.ubc = (this.ubc || 0) * 0.8; if (this.ubc < 1e-3) this.ubc = 0; }
    else {
      const A = o.boneWorld('spine05', _u1), B = o.boneWorld('neck01', _u2);
      const rT = o.bodyR + 0.03;
      let pen = -1;
      for (const [bn, r] of [['head', 0.11], ['spine02', 0.13]]) {
        const P = this.boneWorld(bn, _u3);
        const ab = _u4.subVectors(B, A), t = THREE.MathUtils.clamp(_u5.subVectors(P, A).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
        const d = P.distanceTo(_u5.copy(A).addScaledVector(ab, t));
        pen = Math.max(pen, r + rT - d);
      }
      // lever: hip -> head length times cos(lean) turns a head displacement into a pitch angle
      const hip = this.rig.world.spine05.p, head = this.rig.world.head.p;
      const L = Math.max(0.3, hip.distanceTo(head)), cl = Math.max(0.35, (head.y - hip.y) / L);
      if (pen > 0) this.ubc = Math.min(0.75, (this.ubc || 0) + pen / (L * cl) * 0.7);
      else if (pen < -0.04) { this.ubc = (this.ubc || 0) * 0.86; if (this.ubc < 1e-3) this.ubc = 0; }
    }
    if (this.ubc > 0) {
      const sp = POSE.spine[0], rr = POSE.rootRot[0], nk = POSE.neck[0];
      this.pose[sp] -= this.ubc * 0.6; this.pose[rr] -= this.ubc * 0.4;
      this.pose[nk] += this.ubc * 0.35; // keep the eyes on the opponent while leaning back
    }
  }

  applyRig(p) {
    // look at opponent head (character space)
    const oh = this.lookAt || this.opp.headWorld || new THREE.Vector3(this.opp.pos.x, 1.55, this.opp.pos.z);
    this.rig.lookTarget = this.worldToChar(oh, this.rig.lookTarget || new THREE.Vector3());
    // the opponent's body volumes in this character's space: fists and kicking feet stop on them
    const o = this.opp;
    if (o && o.rig.body && this.rig.body && !o.ragdoll && !this.ragdoll) {
      const xf = this._oxf || (this._oxf = { pos: new THREE.Vector3(), yaw: 0 });
      xf.yaw = o.yaw - this.yaw;
      this.worldToChar(o.pos, xf.pos);
      const st = this._obst || (this._obst = new BodyState(o.rig.vols));
      st.update(o.rig.world, xf);
      this.rig.obstacles = st;
      this.rig.striking = (this.state === 'move' || this.state === 'rageArt') && this.move?.hit && this.mf <= this.move.hit.f[1] + 3 ? this.move.hit.limb : null;
      // strikes stop on the torso and head; arms and legs may cross (guards touching, a kick checked by a shin)
      // guard hands only keep clear of a standing opponent (a body rolling up from the floor would shove them about);
      // strikes stop on any of him
      const standing = !['down', 'land', 'getup', 'tech', 'ko', 'air', 'thrown'].includes(o.state);
      this.rig.obstacleList = standing || this.rig.striking ? (this._obstList || (this._obstList = ['head', 'neck', 'upper', 'chest', 'belly', 'hips'].map(n => st.seg[n]))) : null;
      this.rig.obstacleLimbs = standing ? (this._obstLimbs || (this._obstLimbs = ['hand.L', 'hand.R', 'farm.L', 'farm.R'].map(n => st.seg[n]))) : null;
      this.rig.obstacleStrike = this._obstStrike || (this._obstStrike = ['head', 'neck', 'upper', 'chest', 'belly', 'hips', 'uarm.L', 'uarm.R', 'farm.L', 'farm.R', 'hand.L', 'hand.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'].map(n => st.seg[n]));
    } else { this.rig.obstacles = null; this.rig.obstacleList = null; this.rig.obstacleLimbs = null; }
    this.rig.floorY = -this.pos.y;
    // throws: hands grip the other fighter's body (bone + offset in his character space)
    const G = this.rig.grip;
    G.L.w = 0; G.R.w = 0;
    if (this.gripFn && this.match.throwLock && o) {
      const spec = this.gripFn(this.match.throwLock.t);
      const c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
      for (const s of ['L', 'R']) {
        const g = spec[s];
        if (!g || g[2] <= 0 || !o.rig.world[g[0]]) continue;
        const w = o.boneWorld(g[0], _u1), off = g[1];
        w.x += off[0] * c + off[2] * sn; w.y += off[1]; w.z += -off[0] * sn + off[2] * c;
        this.worldToChar(w, G[s].p); G[s].w = g[2];
      }
    }
    this.rig.apply(p, true);
  }

  worldToChar(w, out) {
    out.copy(w).sub(this.pos);
    const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
    const x = out.x * c + out.z * s, z = -out.x * s + out.z * c;
    out.x = x; out.z = z;
    return out;
  }
  charToWorld(v, out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    out.set(v.x * c + v.z * s, v.y, -v.x * s + v.z * c).add(this.pos);
    return out;
  }

  // world-space position of a bone (logic pose)
  boneWorld(name, out = new THREE.Vector3()) {
    this.rig.bonePos(name, out);
    return this.charToWorld(out, out);
  }

  limbWorld(limb, out = new THREE.Vector3()) {
    const bn = LIMB_BONE[limb];
    const w = this.rig.world[bn];
    if (!w) return this.boneWorld(bn, out);
    const off = this.limbOffset[limb] || new THREE.Vector3();
    out.copy(off).applyQuaternion(w.q).add(w.p);
    return this.charToWorld(out, out);
  }

  fistWorld(s) {
    const w = this.rig.world['wrist.' + s];
    if (!w || !this.rig.knuckle) return this.boneWorld('wrist.' + s);
    const p = this.rig.knuckle[s].clone().multiplyScalar(1.1).applyQuaternion(w.q).add(w.p);
    return this.charToWorld(p, p);
  }

  // hurt capsules in world space: [a, b, r, zone]
  hurtVolumes() {
    const V = (n) => this.boneWorld(n);
    const w = Math.sqrt(this.stats.weight);
    const head = this.boneWorld('head'); head.y += 0.09;
    const neck = V('neck01');
    const chest = V('spine01'), belly = V('spine04'), hips = V('spine05');
    this.headWorld = head.clone();
    return [
      [head, head, 0.12, 'head'],
      [neck, chest, 0.11 * w, 'high'],
      [chest, belly, 0.17 * w, 'mid'],
      [belly, hips, 0.18 * w, 'mid'],
      [V('upperarm01.L'), V('lowerarm01.L'), 0.06, 'high'], [V('lowerarm01.L'), V('wrist.L'), 0.05, 'high'],
      [V('upperarm01.R'), V('lowerarm01.R'), 0.06, 'high'], [V('lowerarm01.R'), V('wrist.R'), 0.05, 'high'],
      // the fists count too: a strike stopped on the guard (the rig lands it on the glove) connects there
      [V('wrist.L'), this.fistWorld('L'), 0.05, 'high'], [V('wrist.R'), this.fistWorld('R'), 0.05, 'high'],
      [V('upperleg01.L'), V('lowerleg01.L'), 0.09 * w, 'low'], [V('lowerleg01.L'), V('foot.L'), 0.065, 'low'],
      [V('upperleg01.R'), V('lowerleg01.R'), 0.09 * w, 'low'], [V('lowerleg01.R'), V('foot.R'), 0.065, 'low'],
    ];
  }

  // ------------------------------------------------------------------ render sync
  syncRender(alpha) {
    lerpPose(this.renderPose, this.prevPose, this.pose, alpha);
    // eyes squeeze while taking a hit, shut when knocked out
    this.rig.lidClose = this.ko ? 0.92 : (this.state === 'hit' || this.state === 'air' || this.state === 'thrown') ? 0.55 : 0;
    this.rig.apply(this.renderPose);
    const g = this.ch.group;
    g.position.lerpVectors(this.prevPos, this.pos, alpha);
    let dy = this.yaw - this.prevYaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    g.rotation.y = this.prevYaw + dy * alpha;
  }
}
