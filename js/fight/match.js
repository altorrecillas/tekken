// Match: runs the fixed-step fight simulation, hit resolution, round flow and events.
import * as THREE from 'three';
import { Fighter, FPS } from './fighter.js';
import { B1, B2 } from './input.js';
import { THROWS } from './throws.js';
import { newStats, newPlay, newBest, playScore, PF } from './stats.js';

const _h1 = new THREE.Vector3(), _h2 = new THREE.Vector3();
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

const _l1 = new THREE.Vector3(), _l2 = new THREE.Vector3(), _l3 = new THREE.Vector3(), _l4 = new THREE.Vector3();
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3();
const LEG_PAIRS = [[['upperleg01.', 'lowerleg01.'], ['upperleg01.', 'lowerleg01.'], 'thigh.', 'thigh.'],
  [['lowerleg01.', 'foot.'], ['lowerleg01.', 'foot.'], 'shin.', 'shin.'],
  [['upperleg01.', 'lowerleg01.'], ['lowerleg01.', 'foot.'], 'thigh.', 'shin.'],
  [['lowerleg01.', 'foot.'], ['upperleg01.', 'lowerleg01.'], 'shin.', 'thigh.']];
// distance between segments p0p1 and q0q1
function segSegDist(p0, p1, q0, q1) {
  const d1 = _s1.subVectors(p1, p0), d2 = _s2.subVectors(q1, q0), r = _s3.subVectors(p0, q0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s, t;
  const c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  t = e > 1e-9 ? (b * s + f) / e : 0;
  if (t < 0) { t = 0; s = a > 1e-9 ? Math.min(1, Math.max(0, -c / a)) : 0; }
  else if (t > 1) { t = 1; s = a > 1e-9 ? Math.min(1, Math.max(0, (b - c) / a)) : 0; }
  const px = p0.x + d1.x * s - (q0.x + d2.x * t), py = p0.y + d1.y * s - (q0.y + d2.y * t), pz = p0.z + d1.z * s - (q0.z + d2.z * t);
  return Math.hypot(px, py, pz);
}

function segPointDist(a, b, p) {
  const ab = _v.subVectors(b, a);
  const t = Math.max(0, Math.min(1, _w.subVectors(p, a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
  return _w.copy(a).addScaledVector(ab, t).distanceTo(p);
}

// speed of the simulation in slow motion (KO, Rage Art)
export const SLOWMO = 0.28;
const _r = new THREE.Vector3();

// frames into a fighter's shot of the presentation when he says his line
const INTRO_LINE = 14;

export class Match {
  constructor(game, chars, ids, opts = {}) {
    this.game = game;
    this.fx = game.fx;
    this.hud = game.hud;
    this.camera = game.camCtl;
    this.audio = game.audio;
    this.opts = { rounds: 2, time: 60, ...opts };
    // det (online): the fight depends on nothing but the inputs, as both phones run it and must get exactly the
    // same. It keeps its own side view (the direction the camera looks across the fighters, which turns the
    // screen's left / right into back / forward and sets the sidestep side; the camera follows it) instead of
    // reading the camera each phone draws with, and counts slow motion in simulation frames instead of seconds
    this.det = !!opts.det;
    this.viewN = new THREE.Vector3(0, 0, 1);
    // cosmetic chances (which voice line) and delayed announcements: the online session replays both exactly
    this.crand = Math.random;
    this.later = (ms, fn) => setTimeout(fn, ms);
    this.fighters = [new Fighter(this, 0, chars[0], ids[0]), new Fighter(this, 1, chars[1], ids[1])];
    // (drawn only: a fighter saying his line opens his mouth with it, see Fighter.syncRender)
    for (const f of this.fighters) f.talk = () => this.audio?.talkLevel?.(f.id) || 0;
    this.wins = [0, 0];
    this.round = 0;
    this.phase = 'none';
    this.pt = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.timer = this.opts.time;
    this.frame = 0;
    this.events = [];
    this.arenaR = game.stage?.arenaRadius || 7;
    this.training = !!opts.training;
    // the tallies of the match and its best play (js/fight/stats.js)
    this.stats = [newStats(), newStats()];
    this.play = [newPlay(), newPlay()];
    this.best = newBest();
  }

  // -------------------------------------------------------------- tallies and the play of the match
  // a blow of a play by att (start: the frame its first move started)
  notePlay(att, dmg, flags, start) {
    const P = this.play[att.index];
    if (!P.on) { P.on = 1; P.f0 = Math.max(0, start); P.hits = 0; P.dmg = 0; P.flags = 0; P.round = this.round; }
    P.f1 = this.frame; P.hits++; P.dmg += dmg; P.flags |= flags;
  }
  // a play is over once its victim is back on his feet (a knockout keeps it open until the round is over); the best
  // so far is kept (seq tells the recorder there is a new one)
  closePlays(force = false) {
    for (const att of this.fighters) {
      const P = this.play[att.index];
      if (!P.on) continue;
      if (!force && (att.opp.comboHits > 0 || (P.flags & PF.KO) || this.frame - P.f1 < 20 || this.throwLock || this.rageLock)) continue;
      P.on = 0;
      const sc = playScore(P), B = this.best;
      if (sc > B.score) { B.score = sc; B.att = att.index; B.f0 = P.f0; B.f1 = P.f1; B.hits = P.hits; B.dmg = P.dmg; B.flags = P.flags; B.round = P.round; B.seq++; }
    }
  }
  tally(att, def, dmg) {
    const S = this.stats[att.index];
    S.hits++; S.dmg += dmg;
    if (def.comboHits > S.combo) S.combo = def.comboHits;
    if (def.comboDmg > S.comboDmg) S.comboDmg = def.comboDmg;
    return S;
  }

  // -------------------------------------------------------------- helpers used by fighters
  screenForward(f) {
    // +1 if pressing "right" moves f towards the opponent
    const right = this.det ? _r.set(this.viewN.z, 0, -this.viewN.x) : this.camera.right();
    const d = _v.subVectors(f.opp.pos, f.pos);
    return d.dot(right) >= 0 ? 1 : -1;
  }
  sideSign(f) {
    // sidestep dir +1 = into the screen (away from the camera)
    const ax = f.axis(new THREE.Vector3());
    const perp = new THREE.Vector3(-ax.z, 0, ax.x);
    return perp.dot(this.det ? _r.copy(this.viewN).negate() : this.camera.forwardFlat()) >= 0 ? 1 : -1;
  }
  // det: the side the camera watches from, perpendicular to the fighters' axis, turning as they circle round (the
  // camera's own rule, at the simulation's fixed step)
  stepView() {
    const [a, b] = this.fighters, n = this.viewN;
    const ax = b.pos.x - a.pos.x, az = b.pos.z - a.pos.z, l = Math.hypot(ax, az);
    if (l < 1e-3) return;
    let nx = -az / l, nz = ax / l;
    if (nx * n.x + nz * n.z < 0) { nx = -nx; nz = -nz; }
    const k = 1 - Math.exp(-4 / FPS);
    n.x += (nx - n.x) * k; n.z += (nz - n.z) * k; n.y = 0;
    n.normalize();
  }
  sfx(name, f, p) { this.audio?.play(name, p || f?.pos); }
  onMoveStart(f, m) {
    if (m.sfxStart) this.sfx(m.sfxStart, f);
    if (m.hit && m.hit.dmg >= 13 && this.fx.trail) {
      const bone = { handL: 'wrist.L', handR: 'wrist.R', footL: 'foot.L', footR: 'foot.R', kneeR: 'lowerleg01.R', kneeL: 'lowerleg01.L', forearmR: 'lowerarm02.R', forearmL: 'lowerarm02.L' }[m.hit.limb];
      if (bone) f.pendingTrail = { bone, at: Math.max(0, m.hit.f[0] - 7), dur: (m.hit.f[1] - Math.max(0, m.hit.f[0] - 7) + 3) / 60, move: m };
      else f.pendingTrail = null;
    } else f.pendingTrail = null;
    // the limb's swish a few frames before it can land (a blow cut short never swishes)
    f.pendingWhoosh = m.hit ? { at: Math.max(0, m.hit.f[0] - 5), move: m } : null;
    f.voiceT = (f.voiceT || 0) - 1;
    if (m.hit && m.hit.dmg >= 16 && this.crand() < 0.55) this.audio?.voice(f, 'attack');
  }
  onLand(f, ko) {
    this.fx.dust(f.pos, ko ? 1.6 : 1.1);
    this.camera.shake(ko ? 0.5 : 0.28);
    this.sfx('bodyfall', f);
  }

  // -------------------------------------------------------------- round flow
  startRound() {
    this.round++;
    const [a, b] = this.fighters;
    for (const f of this.fighters) { f.reset(); f.hp = f.maxHp * (this.hpScale || 1); f.ko = false; }
    a.pos.set(-1.25, 0, 0); b.pos.set(1.25, 0, 0);
    a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
    for (const f of this.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.snapPose = true; f.play('idle', 1); f.animate(); f.prevPose.set(f.pose); }
    this.timer = this.opts.time;
    this.hitstop = 0; this.slowmo = 0; this.timeScale = 1;
    this.phase = 'ready'; this.pt = 0;
    this.hud.roundStart(this.round, this.wins, this.fighters);
    this.camera.setMode('fight', true);
    this.game.ragdolls?.clear?.();
  }

  // the presentation: the camera on each fighter in turn, his name and title, and his line (styles.js introSay, said
  // INTRO_LINE frames into his shot; the shot lasts until his voice has ended, introLen). A button skips it
  startIntro() {
    const [a, b] = this.fighters;
    a.pos.set(-1.4, 0, 0); b.pos.set(1.4, 0, 0);
    a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
    for (const f of this.fighters) { f.reset(); f.setState('intro'); f.snapPose = true; f.play('intro', 1); f.prevPos.copy(f.pos); f.prevYaw = f.yaw; }
    const shot = (f) => Math.max(100, INTRO_LINE + (f.style.introLen || 0) + 22);
    this.introCut = shot(a); this.introEnd = this.introCut + shot(b);
    // the second fighter performs while the camera is on him: the cut lands mid-gesture
    b.cf = -(this.introCut - 12);
    this.phase = 'intro'; this.pt = 0;
    this.camera.setMode('intro', true);
    this.hud.hideAll();
  }

  // one fixed simulation step
  step() {
    this.frame++;
    this.pt++;
    const [a, b] = this.fighters;
    if (this.det) {
      this.stepView();
      // slow motion lasts as many simulation frames as the seconds it is set to take at SLOWMO speed
      if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - 1 / (FPS * SLOWMO));
    }
    if (this.phase === 'intro') {
      for (const f of this.fighters) { f.readInput(); f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.animate(); }
      const skip = a.inp.pressed || b.inp.pressed, cut = this.introCut || 100;
      if (this.pt === 1) this.hud.introNames(this.fighters, 0);
      if (this.pt === cut + 1) this.hud.introNames(this.fighters, 1);
      for (const [f, at] of [[a, INTRO_LINE], [b, cut + INTRO_LINE]]) {
        if (this.pt === at && f.style.introSay) { this.audio?.line?.(f, 'intro'); this.hud.introLine?.(f.index, f.style.introSay); }
      }
      if (this.pt > (this.introEnd || 220) || (skip && this.pt > 20)) { this.audio?.hush?.(); this.startRound(); }
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop--;
      for (const f of this.fighters) {
        f.readInput(); // buffer presses during hitstop
        f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.prevPose.set(f.pose);
      }
      return;
    }
    if (this.phase === 'ready') {
      for (const f of this.fighters) { f.readInput(); f.physics(); f.animate(); f.inp.pressed = 0; f.pending = 0; }
      if (this.pt === 1) {
        this.hud.announce(this.round === 3 ? 'RONDA FINAL' : `RONDA ${this.round}`, 'round'); this.audio?.announce(this.round === 3 ? 'final' : 'round' + Math.min(5, this.round));
        // (both fighters a round from winning: the stage's angrier track comes in; heard only, the simulation never
        // depends on it)
        const need = this.opts.rounds;
        if (!this.training && need > 1 && this.wins[0] >= need - 1 && this.wins[1] >= need - 1) this.audio?.finalRound?.();
      }
      if (this.pt === 80) { this.hud.announce('¡A LUCHAR!', 'fight'); this.audio?.announce('fight'); }
      if (this.pt >= 100) { this.phase = 'fight'; this.pt = 0; }
      return;
    }
    if (this.phase === 'fight' || this.phase === 'ko' || this.phase === 'end') {
      for (const f of this.fighters) {
        f.readInput();
        if (this.phase !== 'fight' && !f.ko) { f.inp.pressed = 0; f.pending = 0; f.inp.fwd = 0; f.inp.up = 0; f.inp.d = 5; }
      }
      for (const f of this.fighters) if (!f.ragdoll) f.think();
      for (const f of this.fighters) if (!f.ragdoll) f.physics();
      this.separate();
      for (const f of this.fighters) if (!f.ragdoll) f.animate();
      for (const f of this.fighters) {
        const pt = f.pendingTrail;
        if (pt && f.state === 'move' && f.move === pt.move && f.mf >= pt.at) { this.fx.trail?.(f, { bone: pt.bone }, pt.dur); f.pendingTrail = null; }
        const pw = f.pendingWhoosh;
        if (pw && f.state === 'move' && f.move === pw.move && f.mf >= pw.at) { this.audio?.whoosh(pw.move.sfx, f.stats.power, f.pos); f.pendingWhoosh = null; }
      }
      for (const f of this.fighters) { if (!f.ragdoll) f.hurtVolumes(); if (f.invuln > 0) f.invuln--; }
      if (this.phase === 'fight') {
        this.checkHit(a); this.checkHit(b);
        this.checkThrowLock();
        this.stepRageArt();
        this.updateRage();
      }
      if (this.phase === 'fight' && !this.training) {
        if (this.frame % FPS === 0 && this.timer > 0) {
          this.timer--;
          if (this.timer <= 0) this.endRound(a.hp / a.maxHp === b.hp / b.maxHp ? -1 : (a.hp / a.maxHp > b.hp / b.maxHp ? 0 : 1), 'time');
        }
      }
      if (this.training) {
        for (const f of this.fighters) if (f.hp < f.maxHp && f.state === 'idle' && f.sf > 60) f.hp = Math.min(f.maxHp, f.hp + 2);
      }
      this.closePlays();
      if (this.phase === 'ko') {
        if (this.pt === 3) this.hud.announce('K.O.', 'ko');
        if (this.pt > 200) this.afterRound();
      }
      if (this.phase === 'end') {
        if (this.pt > 150) this.afterRound();
      }
      this.hud.update(this);
    }
    if (this.phase === 'matchEnd') {
      for (const f of this.fighters) { f.readInput(); if (f.ragdoll) continue; f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.animate(); }
      // the winner says his line on its frame of his win pose (styles.js: say, sayAt), its subtitle with it; a button
      // ends the win screen once it has been said
      const W = this.fighters[this.winner]?.style || {}, sayAt = W.sayAt || 80;
      if (W.say && this.pt === sayAt) { this.audio?.say?.(this.fighters[this.winner]); this.hud.say?.(this.fighters[this.winner]); }
      const minT = W.say ? sayAt + (W.sayLen || 120) : 60;
      // (once: this runs every frame of the win screen)
      if (!this.endSent && this.pt > 60 && ((this.pt > minT && (a.inp.pressed || b.inp.pressed)) || this.pt > Math.max(420, minT + 60))) { this.endSent = true; this.game.onMatchEnd(this); }
    }
  }

  separate() {
    const [a, b] = this.fighters;
    // pushbox measured between the hips (clip root motion moves them well past the root position)
    const ha = a.boneWorld('spine05', _h1), hb = b.boneWorld('spine05', _h2);
    const d = _v.subVectors(hb, ha); const dy = d.y; d.y = 0;
    const dist = d.length();
    // chest to chest with the guards touching, never through each other; an attacker stepping into a strike may
    // close in further until the strike has landed (clinch-range moves: headbutt, belly bump, knee)
    const closing = (f) => f.state === 'move' && f.move?.hit && f.mf <= f.move.hit.f[1] + 4;
    const minD = a.bodyR + b.bodyR + (closing(a) || closing(b) ? 0.2 : 0.4);
    const overlapY = Math.abs(dy) < 0.9;
    const ignore = a.state === 'thrown' || b.state === 'thrown' || a.state === 'down' || b.state === 'down' || a.ragdoll || b.ragdoll;
    if (dist < minD && overlapY && !ignore) {
      const push = (minD - dist) / 2;
      const n = dist > 1e-4 ? d.multiplyScalar(1 / dist) : new THREE.Vector3(1, 0, 0);
      a.pos.addScaledVector(n, -push); b.pos.addScaledVector(n, push);
    }
    // legs: the pushbox only spaces the hips; at close range the lead legs (both near the centre line) would pass
    // through each other, so the closest thigh / shin pair pushes the bodies apart too
    if (!ignore && overlapY && a.rig.vols && b.rig.vols && a.state !== 'throwing' && b.state !== 'throwing') {
      let worst = 0;
      for (const sa of ['L', 'R']) for (const sb of ['L', 'R']) {
        for (const [ta, tb, ra, rb] of LEG_PAIRS) {
          const A0 = a.boneWorld(ta[0] + sa, _l1), A1 = a.boneWorld(ta[1] + sa, _l2);
          const B0 = b.boneWorld(tb[0] + sb, _l3), B1 = b.boneWorld(tb[1] + sb, _l4);
          const dmin = segSegDist(A0, A1, B0, B1);
          const need = a.rig.vols[ra + sa].r + b.rig.vols[rb + sb].r + 0.01;
          if (need - dmin > worst) worst = need - dmin;
        }
      }
      if (worst > 0.002) {
        const hd = _v.subVectors(b.pos, a.pos); hd.y = 0;
        const l = hd.length();
        if (l > 1e-4) { hd.multiplyScalar(Math.min(worst, 0.04) / 2 / l); a.pos.sub(hd); b.pos.add(hd); }
      }
    }
    // a fighter lying on the floor is an obstacle for the other's feet: stand next to him, not on his legs
    for (const [st, ly] of [[a, b], [b, a]]) {
      if (!['down', 'land', 'ko'].includes(ly.state) || ly.ragdoll || st.ragdoll || ['down', 'land', 'ko', 'thrown', 'air'].includes(st.state)) continue;
      const h = ly.boneWorld('head', _h1), fL = ly.boneWorld('foot.L', _h2), fR = ly.boneWorld('foot.R', _w);
      fL.add(fR).multiplyScalar(0.5);
      const sp = st.boneWorld('spine05', _v);
      // 2D distance from the standing hips to the lying body (head -> feet)
      const ax = fL.x - h.x, az = fL.z - h.z, l2 = ax * ax + az * az;
      const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((sp.x - h.x) * ax + (sp.z - h.z) * az) / l2)) : 0;
      const cx = h.x + ax * t, cz = h.z + az * t;
      let dx = sp.x - cx, dz = sp.z - cz;
      const dd = Math.hypot(dx, dz), R = 0.5;
      if (dd < R) {
        if (dd < 1e-4) { dx = st.pos.x - ly.pos.x; dz = st.pos.z - ly.pos.z; } // straight away from him
        const k = (R - dd) / Math.max(1e-4, Math.hypot(dx, dz));
        st.pos.x += dx * k; st.pos.z += dz * k;
      }
    }
    // arena bounds, then the stage's own obstacles (pool edge, crowd barriers)
    for (const f of this.fighters) {
      const r = Math.hypot(f.pos.x, f.pos.z);
      if (r > this.arenaR) { f.pos.x *= this.arenaR / r; f.pos.z *= this.arenaR / r; }
      this.game.stage?.clampWalk?.(f.pos, 0.3);
    }
  }

  onTech(f) {
    this.hud.popup(f.index, 'RECUPERACIÓN', 'info');
    this.fx.dust(f.pos, 0.8);
    this.sfx('step', f);
    this.events.push({ t: 'tech', f });
    this.lastTechFrame = this.frame;
  }

  // -------------------------------------------------------------- hits
  checkHit(att) {
    const m = att.move;
    if (att.state !== 'move' || !m || !m.hit || att.moveHit) return;
    const h = m.hit;
    // a strike that reaches its target up to three frames early (procedural stops, blend lag) is latched and lands
    // on its first active frame, so the frame data stays the same
    if (att.mf < h.f[0] - 3 || att.mf > h.f[1]) return;
    const def = att.opp;
    if (def.invuln > 0 || def.state === 'thrown' || def.state === 'throwing' || def.ko || def.state === 'rageArt' || def.state === 'rageHit') return;
    if (def.state === 'move' && def.move.invuln && def.mf >= def.move.invuln[0] && def.mf <= def.move.invuln[1]) return;
    if ((def.state === 'down' || def.state === 'land') && h.lvl !== 'low') return;
    if (def.state === 'getup' || def.state === 'tech') return;
    const crouched = def.crouching || def.state === 'crouch' || (def.move && def.move.lowProfile && def.mf >= def.move.lowProfile[0] && def.mf <= def.move.lowProfile[1]);
    if (h.lvl === 'high' && crouched && !['hit', 'air'].includes(def.state)) return;
    if (h.lvl === 'low' && (def.state === 'jump' || (def.move && def.move.airborne && def.mf >= def.move.airborne[0] && def.mf <= def.move.airborne[1]))) return;
    let p = att.limbWorld(h.limb);
    const vols = def.hurtVolumes();
    let hitVol = null;
    for (const v of vols) {
      if (segPointDist(v[0], v[1], p) < v[2] + h.r) { hitVol = v; break; }
    }
    if (att.mf < h.f[0]) { if (hitVol) att.latchedHit = { p: p.clone(), zone: hitVol[3] }; return; }
    if (!hitVol && att.latchedHit) { p = att.latchedHit.p; hitVol = vols.find(v => v[3] === att.latchedHit.zone) || vols[2]; }
    att.latchedHit = null;
    if (!hitVol) return;
    if (h.lvl === 'throw') {
      att.moveHit = true;
      if (crouched || def.airborne || def.state === 'air' || def.state === 'down') { att.moveHit = false; return; }
      this.startThrow(att, def, m);
      return;
    }
    att.moveHit = true;
    att.moveConnected = true;
    const canBlock = def.guard !== 'none';
    if (h.rage) {
      if (canBlock && (def.guard === 'high')) { this.applyBlock(att, def, m, p); return; }
      this.startRageArt(att, def, p); return;
    }
    let blocked = false;
    if (canBlock) {
      if (def.guard === 'high' && (h.lvl === 'high' || h.lvl === 'mid' || h.lvl === 'smid')) blocked = true;
      if (def.guard === 'low' && (h.lvl === 'low' || h.lvl === 'smid')) blocked = true;
    }
    if (blocked) this.applyBlock(att, def, m, p);
    else this.applyHit(att, def, m, p, hitVol);
  }

  applyBlock(att, def, m, p) {
    const h = m.hit;
    const remaining = m.total - att.mf;
    def.stun = Math.max(6, remaining + (h.blk ?? -2));
    const low = def.guard === 'low';
    def.setState('block');
    def.crouching = low;
    def.play(low ? 'blockLow' : 'blockHigh', 2);
    def.slide = (h.push || 0.2) * 8.5 + 0.8;
    att.slide = 0.6;
    def.impulse(new THREE.Vector3().subVectors(def.pos, att.pos).setY(0).normalize(), 0.25, true);
    this.hitstop = 5;
    this.fx.blockSpark(p, def);
    this.camera.shake(0.08);
    this.audio?.hit('block', 1, p);
    this.events.push({ t: 'block', f: def });
    this.stats[def.index].blocks++;
    const adv = def.stun - remaining;
    this.lastEvent = `${m.name}: bloqueado <b style="color:${adv >= 0 ? '#7dff9a' : '#ff8a7a'}">${adv >= 0 ? '+' : ''}${adv}</b> frames`;
  }

  applyHit(att, def, m, p, vol) {
    const h = m.hit;
    // power crush: an armoured startup absorbs highs and mids (damage is taken, the move keeps going)
    const arm = def.state === 'move' && def.move && def.move.armor;
    if (arm && def.mf >= arm[0] && def.mf <= arm[1] && h.lvl !== 'low' && !h.launch && !h.rage) {
      const dmg = Math.max(1, Math.round(h.dmg * att.stats.power * 0.6));
      if (def.hp - dmg > 0) {
        def.hp -= dmg;
        this.hitstop = 6;
        this.fx.hitSpark(p, false, false, def, att);
        this.camera.shake(0.16);
        this.audio?.hit('block', 1.3, p);
        this.hud.popup(def.index, 'POWER CRUSH', 'info');
        def.hitFlash = 0.6;
        this.stats[att.index].hits++; this.stats[att.index].dmg += dmg;
        this.events.push({ t: 'hit', att, def, dmg, ch: false, heavy: false });
        this.lastEvent = `${m.name}: absorbido por power crush (${dmg} dmg)`;
        return;
      }
    }
    const ch = def.state === 'move' && def.move.hit && def.mf < def.move.hit.f[0];
    const inAir = def.state === 'air' || def.airborne;
    const scale = inAir ? Math.max(0.35, Math.pow(0.8, def.juggles)) : (def.comboHits > 0 ? 0.9 : 1);
    let dmg = h.dmg * att.stats.power * (ch ? 1.25 : 1) * scale * (att.rage ? 1.1 : 1);
    dmg = Math.max(1, Math.round(dmg));
    def.hp = Math.max(0, def.hp - dmg);
    def.comboHits++; def.comboDmg += dmg;
    { const S = this.tally(att, def, dmg); if (ch) S.counters++; if (h.launch && !inAir) S.launches++; }
    this.notePlay(att, dmg, (ch ? PF.CH : 0) | (h.launch && !inAir ? PF.LAUNCH : 0), this.frame - att.mf);
    def.move = null;
    def.crouching = false;
    const heavy = h.dmg >= 16 || h.launch || h.kd;
    const ko = def.hp <= 0;
    const dirBack = 1;
    let stop = heavy ? 11 : 8;
    if (ch) stop += 3;
    if (ko) stop = 18;
    this.hitstop = stop;
    this.fx.hitSpark(p, heavy || ch, ch, def, att);
    if (h.fx === 'electric') { this.fx.electric?.(p, def); this.sfx('zap', def); }
    this.camera.shake(heavy ? 0.42 : 0.2);
    this.camera.punch(att, heavy ? 1 : 0.4);
    this.audio?.hit(m.sfx === 'slap' ? 'slap' : heavy ? (m.sfx === 'kick' ? 'kickHeavy' : 'heavy') : (m.sfx === 'kick' ? 'kick' : 'light'), att.stats.power, p, { ch, ko });
    if (ko) this.audio?.voice(def, 'ko');
    else if (this.crand() < (heavy ? 0.8 : 0.4)) this.audio?.voice(def, heavy ? 'hurtBig' : 'hurt');
    if (ch) { this.hud.popup(att.index, 'COUNTER HIT', 'ch'); }
    def.hitFlash = 1;
    const blowDir = new THREE.Vector3().subVectors(def.pos, att.pos).setY(0).normalize();
    def.impulse(blowDir, (heavy ? 0.9 : 0.5) * (ch ? 1.3 : 1), h.lvl !== 'low');
    const kd = h.kd || (ch && h.ch && h.ch.kd);
    if (ko) {
      if (ch) this.stats[att.index].chKOs++;
      def.ko = true;
      def.setState('air'); def.airborne = true; def.play('air', 2);
      def.vel.y = Math.max(def.vel.y, heavy ? 4.8 : 3.8);
      def.slide = 4.5 + (h.push || 0.3) * 4;
      def.juggles++;
      this.onKO(att, def, p);
    } else if (inAir) {
      // (knocked up again and a little further: close enough for the next blow of the juggle)
      def.juggles++;
      def.vel.y = Math.max(def.vel.y * 0.3, 3.6 * Math.pow(0.86, def.juggles));
      def.slide = 0.6 + (h.push || 0.2) * 2;
      def.setState('air'); def.play('air', 2);
    } else if (h.launch) {
      // launched straight up, within reach of the juggle (the launcher's recovery can be cancelled: Fighter.juggleCancel)
      def.setState('air'); def.airborne = true; def.play('air', 3);
      def.vel.y = h.launch; def.slide = 0.45; def.juggles = 1;
      this.hud.popup(att.index, 'LAUNCH!', 'info');
    } else if (kd && h.lvl === 'low') {
      // swept: the feet go out from under him, a short low fall onto the back close to where he stood
      def.setState('air'); def.airborne = true; def.play('swept', 2);
      def.vel.y = 2.2; def.slide = 1.4 + (h.push || 0.3) * 2; def.juggles = 3;
    } else if (kd) {
      def.setState('air'); def.airborne = true; def.play('air', 2);
      def.vel.y = 3.2; def.slide = 3.6 + (h.push || 0.3) * 3; def.juggles = 3;
    } else {
      const remaining = m.total - att.mf;
      def.stun = Math.max(10, remaining + (h.hitAdv ?? 4) + (ch ? 6 : 0));
      def.setState('hit');
      const zone = vol[3];
      const react = h.react || (zone === 'head' || zone === 'high' ? 'hitHigh' : zone === 'low' ? 'hitLow' : 'hitMid');
      def.play(react, 2);
      def.slide = (h.push || 0.2) * 9 + 0.5;
    }
    att.slide = heavy ? 0.4 : 0.2;
    if (def.comboHits >= 2) this.hud.combo(att.index, def.comboHits, def.comboDmg);
    this.events.push({ t: 'hit', att, def, dmg, ch, heavy });
    if (heavy || ch) this.lastHeavyFrame = this.frame;
    const adv = def.state === 'hit' ? def.stun - (m.total - att.mf) : null;
    this.lastEvent = `${m.name}: ${ch ? 'COUNTER ' : ''}golpe ${dmg} dmg` +
      (adv === null ? ` · <b style="color:#ffd34d">${h.launch ? 'LANZADO' : 'DERRIBO'}</b>` : ` · <b style="color:${adv >= 0 ? '#7dff9a' : '#ff8a7a'}">${adv >= 0 ? '+' : ''}${adv}</b> frames`);
  }

  // horizontal distance between two fighters' hips (spine05), which is where their bodies actually are
  hipDist(a, b) {
    const ha = a.boneWorld('spine05', _h1), hb = b.boneWorld('spine05', _h2);
    return Math.hypot(hb.x - ha.x, hb.z - ha.z);
  }

  // -------------------------------------------------------------- rage
  updateRage() {
    for (const f of this.fighters) {
      if (!f.rage && !f.rageUsed && f.hp > 0 && f.hp <= f.maxHp * 0.3 && this.phase === 'fight') {
        f.rage = true;
        this.hud.popup(f.index, '¡FURIA!', 'ch');
        this.audio?.voice(f, 'attack');
        this.events.push({ t: 'rage', f });
      }
    }
  }

  onRageStart(f) {
    this.hud.popup(f.index, 'RAGE ART', 'ch');
    this.slowmo = 0.25;
    this.events.push({ t: 'rageStart', f });
  }

  startRageArt(att, def, p) {
    // cinematic three-hit sequence; both fighters locked
    att.setState('rageArt'); att.rage = false;
    def.setState('rageHit'); def.move = null; def.crouching = false;
    // the sequence's strikes are made for a victim at arm's reach: never start it from inside the attacker's arm
    // (measured hip to hip: the strike's root motion carries the attacker's body well past his position)
    { const ax = att.axis(new THREE.Vector3()), d = this.hipDist(att, def);
      if (d < 0.97) def.pos.addScaledVector(ax, 0.97 - d); }
    this.rageLock = { att, def, t: 0, p };
    this.stats[att.index].rageArts++;
    this.slowmo = 0.5;
    this.camera.setMode('rage', false, att);
    this.hud.announce('RAGE ART', 'fight');
    this.fx.hitSpark(p, true, true, def, att);
    this.hitstop = 12;
    this.events.push({ t: 'rageArt', att, def });
  }

  stepRageArt() {
    const L = this.rageLock;
    if (!L) return;
    const { att, def } = L;
    L.t++;
    const ax = att.axis(new THREE.Vector3());
    const seq = [
      { at: 0, clip: 'uppercut', dmg: 0.07, heavy: true, d: 0.8 },
      { at: 34, clip: 'straight', dmg: 0.07, heavy: true, d: 0.95 },
      { at: 70, clip: att.style.rageFinisher || 'roundhouse', dmg: 0.18, heavy: true, final: true, d: 1.05 },
    ];
    // the victim is held at the reach of the strike in progress (closer and the arms go through him)
    // (the victim is only drawn in once the attacker's arm has come back from the opening strike)
    let dd = L.t < 9 ? 0.97 : seq[0].d;
    for (const s of seq) if (L.t >= s.at && s.at > 0) dd = s.d;
    const hd = this.hipDist(att, def);
    def.pos.addScaledVector(ax, (dd - hd) * 0.25);
    for (const s of seq) {
      const mv = att.moves[s.clip];
      if (L.t === s.at + 1 && mv) { att.move = mv; att.mf = 0; att.play(s.clip, 3, mv.clip); att.stateHold = mv; }
      if (mv && L.t === s.at + 1 + mv.hit.f[0]) {
        const dmg = Math.round(def.maxHp * s.dmg * att.stats.power);
        def.hp = Math.max(0, def.hp - dmg);
        def.comboHits++; def.comboDmg += dmg;
        this.tally(att, def, dmg);
        this.notePlay(att, dmg, PF.RAGE, this.frame - L.t);
        const hp = att.limbWorld(mv.hit.limb);
        this.fx.hitSpark(hp, true, true, def, att);
        if (mv.hit.fx === 'electric') { this.fx.electric?.(hp, def); this.sfx('zap', def); }
        this.camera.shake(0.6); this.hitstop = s.final ? 16 : 10;
        this.audio?.hit('heavy', 1.3, hp);
        this.audio?.voice(def, 'hurtBig');
        def.impulse(ax, 1.2, true);
        // uppercut to the chin, straight to the face, kick to the head: the head snaps back every time
        def.play('hitHigh', 2);
        this.hud.combo(att.index, def.comboHits, def.comboDmg);
        this.events.push({ t: 'hit', att, def, dmg, ch: true, heavy: true });
        if (s.final) {
          this.rageLock = null;
          att.setState('move'); att.move = mv; att.mf = mv.hit.f[1];
          def.setState('air'); def.airborne = true; def.play('air', 2);
          def.vel.y = 4.6; def.slide = 6.5; def.juggles = 4;
          this.camera.setMode('fight');
          if (def.hp <= 0) { def.ko = true; this.stats[att.index].rageKOs++; this.onKO(att, def, hp); }
          return;
        }
      }
    }
    // advance the attacker's scripted clip
    if (att.move) att.mf++;
  }

  // -------------------------------------------------------------- throws
  startThrow(att, def, m) {
    const T = THROWS[m.throwType || 'knee'] || THROWS.knee;
    const ex = att.moves[T.exec] || att.moves.throwExec;
    att.setState('throwing');
    att.throwMove = ex;
    att.play(T.exec, 5, ex.clip);
    att.throwPartner = def;
    att.throwDmg = Math.round((m.throwDmg || 35) * att.stats.power);
    att.throwBreak = m === att.moves.throw || att.moveName === 'throw' ? B1 : B2;
    def.setState('thrown');
    def.play(T.victim, 6);
    def.move = null; def.crouching = false;
    def.pending = 0;
    att.gripFn = T.att; def.gripFn = T.def;
    // the thrower keeps his heading for the whole throw (the victim may pass behind him)
    // the paths are tuned for two average torsos pressed together; bigger bellies stand a little further apart
    // (how far the front of the belly / chest sits ahead of the spine, from the fitted body volumes)
    const front = (f) => { const v = f.rig.vols; return v ? Math.max(v.belly.co.z + v.belly.rz, v.chest.co.z + v.chest.rz) : 0.19; };
    const dOff = THREE.MathUtils.clamp(front(att) + front(def) - 0.38, -0.06, 0.08);
    this.throwLock = { att, def, t: 0, T, dealt: 0, dOff, yaw0: att.yaw, ax: new THREE.Vector3(Math.sin(att.yaw), 0, Math.cos(att.yaw)) };
    this.sfx('grab', att);
    this.camera.setMode('throw');
  }

  endThrowGrips(L) { L.att.gripFn = null; L.def.gripFn = null; }

  checkThrowLock() {
    const L = this.throwLock;
    if (!L) return;
    L.t++;
    const { att, def, T } = L;
    // the victim follows the throw's path relative to the thrower
    const P = T.path(L.t);
    att.yaw = L.yaw0;
    const sd = P.side || 0; // sideways offset (to the thrower's right)
    const d = P.d + (L.dOff || 0) * Math.sign(P.d || 1);
    const tx = att.pos.x + L.ax.x * d - L.ax.z * sd, tz = att.pos.z + L.ax.z * d + L.ax.x * sd;
    // (pulled in progressively over the first frames: half the gap in one frame jerked the whole body)
    const pull = L.t < 8 ? 0.12 + 0.38 * (L.t / 8) : 0.5;
    def.pos.x += (tx - def.pos.x) * pull; def.pos.z += (tz - def.pos.z) * pull;
    def.pos.y = P.y; def.vel.y = 0;
    def.yaw = L.yaw0 + Math.PI + (P.yaw || 0);
    if (L.t <= T.breakBy && (def.inp.pressed & att.throwBreak)) {
      // break!
      this.throwLock = null;
      this.endThrowGrips(L);
      def.pos.y = 0;
      att.setState('hit'); att.stun = 16; att.play('hitHigh', 3);
      def.setState('hit'); def.stun = 16; def.play('hitHigh', 3);
      att.slide = 3; def.slide = 3;
      this.hud.popup(def.index, 'ESCAPE', 'info');
      this.stats[def.index].escapes++;
      this.sfx('block', def);
      this.camera.setMode('fight');
      return;
    }
    for (const e of T.events) {
      if (L.t !== e.t) continue;
      const dmg = Math.max(1, Math.round(att.throwDmg * e.dmg));
      def.hp = Math.max(0, def.hp - dmg);
      L.dealt += dmg;
      { const S = this.stats[att.index]; if (L.dealt === dmg) S.hits++; S.dmg += dmg; } // (one blow: the first damage of the throw)
      { const P = this.play[att.index]; if (P.on && P.flags & PF.THROW) { P.dmg += dmg; P.f1 = this.frame; } else this.notePlay(att, dmg, PF.THROW, this.frame - L.t - 12); }
      if (e.kind === 'slam') {
        this.hitstop = 10;
        this.fx.dust(def.pos, 1.8);
        this.fx.hitSpark(def.boneWorld('spine03'), true, false, def, att);
        this.camera.shake(0.6);
        this.audio?.hit('slam', 1.3, def.pos);
        this.audio?.voice(def, 'hurtBig');
      } else {
        const hp = def.boneWorld(e.at || 'spine03');
        this.hitstop = 6;
        this.fx.hitSpark(hp, false, false, def, att);
        this.camera.shake(0.22);
        this.audio?.hit(e.kind === 'knee' ? 'kick' : 'heavy', 1, hp);
        this.audio?.voice(def, 'hurt');
      }
      this.hud.combo(att.index, 1, L.dealt);
    }
    if (L.t >= T.end) {
      this.throwLock = null;
      this.endThrowGrips(L);
      this.stats[att.index].throws++;
      this.camera.setMode('fight');
      def.pos.y = 0;
      // the suplex flip ends a full turn round (same orientation): take the lying pose over without blending
      def.snapPose = true; def.snapSmooth = true;
      if (def.hp <= 0) { def.ko = true; def.setState('ko'); def.play('lie', 4); this.stats[att.index].throwKOs++; this.onKO(att, def, def.pos.clone()); }
      else { def.setState('down'); def.play('lie', 6); def.downT = 0; }
    }
  }

  // -------------------------------------------------------------- KO / round end
  onKO(att, def, p) {
    const P = this.play[att.index], S = this.stats[att.index];
    S.kos++;
    if (att.hp >= att.maxHp) S.perfects++;
    if (P.on) P.flags |= PF.KO | (this.wins[att.index] + 1 >= this.opts.rounds ? PF.FINAL : 0) | (att.hp >= att.maxHp ? PF.PERFECT : 0);
    this.phase = 'ko'; this.pt = 0;
    this.slowmo = 1.6;
    this.koWinner = att.index;
    this.camera.setMode('ko', false, def);
    this.camera.koWinner = att;
    this.audio?.announce('ko');
    this.fx.koFlash();
    this.game.onKO?.(att, def, p);
    const perfect = att.hp >= att.maxHp;
    if (perfect) this.later(1800, () => { this.hud.announce('¡PERFECTO!', 'perfect'); this.audio?.announce('perfect'); });
  }

  endRound(winner, reason) {
    this.phase = 'end'; this.pt = 0;
    this.koWinner = winner;
    if (reason === 'time' && (winner === 0 || winner === 1)) this.stats[winner].timeWins++;
    this.hud.announce(reason === 'time' ? 'TIEMPO' : 'K.O.', reason === 'time' ? 'time' : 'ko');
    this.audio?.announce(reason === 'time' ? 'time' : 'ko');
  }

  afterRound() {
    this.closePlays(true);
    const w = this.koWinner;
    if ((w === 0 || w === 1) && this.fighters[w].hp <= this.fighters[w].maxHp * 0.1) this.stats[w].comebacks++;
    if (w === 0 || w === 1) this.wins[w]++;
    else { this.wins[0]++; this.wins[1]++; }
    const need = this.opts.rounds;
    if (this.wins[0] >= need || this.wins[1] >= need) {
      const winner = this.wins[0] >= need && this.wins[1] >= need ? (this.fighters[0].hp >= this.fighters[1].hp ? 0 : 1) : (this.wins[0] >= need ? 0 : 1);
      this.winner = winner;
      this.phase = 'matchEnd'; this.pt = 0;
      const wf = this.fighters[winner];
      // winner stands up and poses
      wf.reset(); wf.setState('win'); wf.play('win', 10);
      this.game.ragdolls?.freeze?.();
      this.camera.setMode('win', false, wf);
      this.hud.winner(wf, this.wins, this.crand());
      this.hud.hideBars?.();
      this.audio?.announce('win_' + wf.id);
      if (!wf.style.say) this.audio?.voice(wf, 'win'); // (a fighter with a line says it a moment later instead)
    } else {
      this.startRound();
    }
  }
}
