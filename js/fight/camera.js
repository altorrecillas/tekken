// Fighting-game camera: side view perpendicular to the fighters' axis, springs, shake, cinematic modes.
import * as THREE from 'three';

const _cv = new THREE.Vector3();
function damp(cur, tgt, lambda, dt) { return THREE.MathUtils.lerp(cur, tgt, 1 - Math.exp(-lambda * dt)); }
function dampV(cur, tgt, lambda, dt) { return cur.lerp(tgt, 1 - Math.exp(-lambda * dt)); }

export class FightCamera {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'fight';
    this.pos = new THREE.Vector3(0, 1.5, 5);
    this.look = new THREE.Vector3(0, 1, 0);
    this.normal = new THREE.Vector3(0, 0, 1); // camera side of the fighters' axis
    this.trauma = 0;
    this.t = 0;
    this.fov = 34;
    this.punchAmt = 0;
    this.punchDir = new THREE.Vector3();
    this.fighters = null;
    this.focus = null;
    this._right = new THREE.Vector3(1, 0, 0);
    this._fwd = new THREE.Vector3(0, 0, -1);
    this.noiseSeed = Math.random() * 100;
    this._focus = new THREE.Vector3();
    this._want = new THREE.Vector3();
    this.clampCam = null; // stage-provided bounds for cinematic cameras
    this.focusPt = null;
    this.normalFrom = null; // online: the match's own side view (Match.viewN), followed instead of the fighters' axis
  }
  right() { return this._right; }
  forwardFlat() { return this._fwd; }
  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  punch(att, a) { this.punchAmt = Math.max(this.punchAmt, a); }
  setMode(m, snap = false, focus = null) {
    this.mode = m; this.modeT = 0; this.focus = focus; this._koSide = false;
    if (snap) this.snap = true;
  }

  update(dt, fighters) {
    this.t += dt;
    this.modeT = (this.modeT || 0) + dt;
    const [a, b] = fighters;
    const pa = a.pos, pb = b.pos;
    const mid = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
    const axis = new THREE.Vector3().subVectors(pb, pa); axis.y = 0;
    const sep = axis.length();
    if (sep > 1e-3) axis.multiplyScalar(1 / sep); else axis.set(1, 0, 0);
    let n = new THREE.Vector3(-axis.z, 0, axis.x);
    if (n.dot(this.normal) < 0) n.negate();
    // keep P1 on the left in normal play: flip only when strongly required
    // (online the fight keeps the side view itself: the screen shows exactly the side the controls are read with)
    if (this.normalFrom) this.normal.copy(this.normalFrom);
    else this.normal.lerp(n, 1 - Math.exp(-4 * dt)).normalize();
    let tp = new THREE.Vector3(), tl = new THREE.Vector3(), fov = 34, lam = 6, focusPt = null;
    const airY = Math.max(pa.y, pb.y);
    if (this.mode === 'fight' || this.mode === 'throw') {
      // framing: feet stay ~8% above the bottom edge, heads well clear of the HUD
      // juggles / jumping knees: the body rises through the clip's root motion while pos.y stays 0, so frame
      // on the highest head and pull back until it clears the HUD
      const top = Math.max(a.headWorld ? a.headWorld.y : 1.65, b.headWorld ? b.headWorld.y : 1.65);
      const lift = Math.max(airY, top - 1.7);
      let dist = THREE.MathUtils.clamp(2.5 + sep * 1.0, 3.8, 7.5) + lift * 0.9 + (this.mode === 'throw' ? -0.45 : 0);
      tl.copy(mid).setY(0.95 + lift * 0.5);
      // touch screens: the on-screen controls own the bottom corners, so the fighters sit higher and a bit
      // smaller in the frame (feet clear of the stick and the buttons)
      if (this.touchFrame) { tl.y -= 0.16; dist += 0.3; }
      dist = Math.max(dist, (top + 0.12 - tl.y) / Math.tan(fov * Math.PI / 360) / 0.9);
      tp.copy(mid).addScaledVector(this.normal, dist).setY(1.22 + lift * 0.45 + sep * 0.04);
      fov = 34;
    } else if (this.mode === 'intro') {
      // driven by the match clock so the cut to the second fighter matches the name card even at low fps
      const t = this.introT ?? this.modeT;
      const f = t < 1.68 ? a : b;
      const lt = t < 1.68 ? t : t - 1.68;
      const fp = f.pos;
      const facing = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      const side = new THREE.Vector3(-facing.z, 0, facing.x);
      // aim from the fighter's own head so tall fighters are not cropped by the letterbox
      const hy = f.headWorld ? f.headWorld.y : 1.72;
      tl.copy(fp).setY(hy - 0.38 + lt * 0.1);
      tp.copy(fp).addScaledVector(facing, 1.9 - lt * 0.35).addScaledVector(side, 0.9 - lt * 0.25).setY(1.0 + lt * 0.25);
      fov = 30; lam = lt < 0.05 ? 1000 : 3;
    } else if (this.mode === 'ko') {
      // three-quarter side shot: fallen fighter nearer the lens (lying along the axis, seen full length), winner
      // standing beyond, both large. A depth shot from behind the loser can't fit his head and the winner's at once
      const f = this.focus || b;
      const w = this.koWinner && this.koWinner !== f ? this.koWinner : (f === a ? b : a);
      const fp = f.ragdoll ? f.ragdoll.center() : f.pos;
      const wp = w.pos;
      const toW = new THREE.Vector3().subVectors(wp, fp).setY(0);
      const sepKO = Math.max(0.5, toW.length());
      if (toW.lengthSq() < 1e-4) toW.set(1, 0, 0); toW.normalize();
      const n = new THREE.Vector3(-toW.z, 0, toW.x);
      // camera on the stage's showpiece side (looking along koView), unless the bounds leave no room there
      if (this.koView ? n.dot(this.koView) > 0 : n.dot(this.normal) < 0) n.negate();
      if (this._koSide) n.negate();
      // frame the real extent along the axis: every ragdoll joint of the loser plus the winner's body
      let lo = Infinity, hi = -Infinity;
      const acc = (p, r) => { const sp = (p.x - fp.x) * toW.x + (p.z - fp.z) * toW.z; lo = Math.min(lo, sp - r); hi = Math.max(hi, sp + r); };
      if (f.ragdoll) for (const k in f.ragdoll.p) acc(f.ragdoll.p[k], 0.2); else acc(fp, 0.9);
      acc(wp, 0.45);
      const tanH = Math.tan(THREE.MathUtils.degToRad(32) / 2) * (this.cam.aspect || 16 / 9);
      const d = Math.max(3.8, (hi - lo) * 0.5 / 0.84 / tanH + 0.3) - this.modeT * 0.05;
      const mid = new THREE.Vector3().copy(fp).addScaledVector(toW, (lo + hi) / 2);
      tl.copy(mid).setY(0.75);
      tp.copy(mid).addScaledVector(n, d).addScaledVector(toW, -0.6).setY(1.2 + this.modeT * 0.02);
      if (this.clampCam) {
        const want = this._want.copy(tp);
        this.clampCam(tp);
        // blocked on this side (crowd barrier, wall): flip to the other side for the rest of the KO
        if (!this._koSide && want.distanceToSquared(tp) > 0.25) this._koSide = true;
      }
      fov = 32; lam = 2.5;
      // rack focus: the fallen fighter first, then the winner
      focusPt = this.modeT < 0.9 ? this._focus.copy(fp).setY(0.3) : this._focus.copy(wp).setY(1.2);
    } else if (this.mode === 'win') {
      const f = this.focus || a;
      const fp = f.pos;
      const facing = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      const side = new THREE.Vector3(-facing.z, 0, facing.x);
      const t = Math.min(1, this.modeT / 3);
      // framed from the fighter's own head (the letterbox eats the top of a fixed-height shot on tall fighters)
      const hy = f.headWorld ? f.headWorld.y : 1.6;
      // eye-level lens, head top ~10 deg under the letterbox edge, a medium shot (thighs up) when settled
      tl.copy(fp).setY(hy - 0.25 + t * 0.05);
      tp.copy(fp).addScaledVector(facing, 2.9 - t * 0.6).addScaledVector(side, 0.8 - t * 0.5).setY(hy - 0.12 + t * 0.07);
      // rule of thirds: the winner stands right of centre, the name card takes the left of the frame
      const fw = _cv.subVectors(tl, tp).setY(0).normalize();
      tl.x -= -fw.z * 0.42; tl.z -= fw.x * 0.42;
      fov = 32; lam = 2;
    } else if (this.mode === 'ending') {
      // the champion's ending: a slow swing round in front of him at eye level, a medium shot, the champion right of
      // centre (his story takes the left of the screen)
      const f = this.focus || a;
      const fp = f.pos, hy = f.headWorld ? f.headWorld.y : 1.6;
      const ang = f.yaw + Math.sin(this.modeT * 0.11) * 0.85;
      const dir = _cv.set(Math.sin(ang), 0, Math.cos(ang));
      tl.copy(fp).setY(hy - 0.32);
      tp.copy(fp).addScaledVector(dir, 2.75).setY(hy - 0.02);
      tl.x -= -dir.z * -0.5; tl.z -= dir.x * -0.5;
      fov = 34; lam = 1.6;
    } else if (this.mode === 'rage') {
      const f = this.focus || a;
      const fp = f.pos;
      const facing = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
      const side = new THREE.Vector3(-facing.z, 0, facing.x);
      const t = this.modeT;
      tl.copy(fp).addScaledVector(facing, 0.45).setY(1.15);
      tp.copy(fp).addScaledVector(facing, 1.6 - t * 0.3).addScaledVector(side, 1.9 - t * 0.9).setY(0.75 + t * 0.2);
      fov = 40; lam = 5;
    } else if (this.mode === 'select') {
      // framed high enough that the card row does not hide the legs
      // pulled back so the fighter stands head to toe between the title panel and the card row
      // wide phone screens: the card row takes a third of the height, so the fighter is framed higher
      const wide = (this.cam.aspect || 1.78) > 1.95;
      tl.set(0, wide ? 0.46 : 0.66, 0); tp.set(0, wide ? 1.0 : 1.1, wide ? 6.9 : 6.44); fov = 32;
    }
    // stage bounds: no camera behind crowd barriers, walls or the balustrade. The fight camera keeps its framing
    // by widening the lens as much as it had to move in; cinematic shots are simply held inside
    if (this.clampCam && this.mode !== 'select' && this.mode !== 'ko') {
      const want = this._want.copy(tp);
      this.clampCam(tp);
      if (this.mode === 'fight' || this.mode === 'throw') {
        const dw = want.distanceTo(tl), da = tp.distanceTo(tl);
        if (da < dw - 1e-3) fov = Math.min(64, 2 * Math.atan(Math.tan(fov * Math.PI / 360) * dw / Math.max(da, 0.5)) * 180 / Math.PI);
      }
    }
    // depth-of-field subject for the cinematic modes (the look target unless a mode names one)
    this.focusPt = focusPt;
    if (this.snap) { this.pos.copy(tp); this.look.copy(tl); this.fov = fov; this.snap = false; }
    dampV(this.pos, tp, lam, dt);
    dampV(this.look, tl, lam * 1.3, dt);
    this.fov = damp(this.fov, fov, 4, dt);
    // punch-in on heavy hits
    this.punchAmt = Math.max(0, this.punchAmt - dt * 2.5);
    const cp = this.pos.clone();
    const toLook = new THREE.Vector3().subVectors(this.look, cp);
    cp.addScaledVector(toLook.normalize(), this.punchAmt * 0.25);
    // shake (trauma^2, smooth noise)
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const tt = this.t * 28 + this.noiseSeed;
    const nx = Math.sin(tt * 1.13) * 0.6 + Math.sin(tt * 2.71) * 0.4;
    const ny = Math.sin(tt * 1.37 + 1.7) * 0.6 + Math.sin(tt * 3.17) * 0.4;
    const nr = Math.sin(tt * 1.91 + 0.4);
    this.cam.position.copy(cp);
    this.cam.position.x += nx * s * 0.08; this.cam.position.y += ny * s * 0.06;
    this.cam.lookAt(this.look);
    this.cam.rotateZ(nr * s * 0.025);
    this.cam.fov = this.fov;
    this.cam.updateProjectionMatrix();
    // basis for input mapping
    this._right.set(1, 0, 0).applyQuaternion(this.cam.quaternion); this._right.y = 0; this._right.normalize();
    this._fwd.set(0, 0, -1).applyQuaternion(this.cam.quaternion); this._fwd.y = 0; this._fwd.normalize();
  }
}
