// Foot planting: a grounded foot stays put in world space while the body moves, turns or is pushed, and re-plants
// with a short procedural step (eased, lifted arc) once it falls too far behind where the clip wants it. Clips are
// authored in character space, so without this every root motion (walking at a different speed, pushback, turning to
// track the opponent, dashes, sidesteps) drags the planted feet across the floor.
import * as THREE from 'three';
import { POSE } from './rig.js';

const GROUND = 0.071; // ankle height of a flat foot on the floor, in pose units
const LOCKABLE = new Set(['idle', 'walkF', 'walkB', 'dashF', 'dashB', 'side', 'crouch', 'rise', 'block', 'hit', 'move', 'win', 'intro']);
// states where the body turns to face the opponent: the planted feet keep their heading too (pivot = step)
const HOLD_YAW = new Set(['idle', 'walkF', 'walkB', 'crouch', 'rise', 'block', 'hit']);
const _c = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3(), _wv = new THREE.Vector3(), _j = new THREE.Vector3();
// release blend: critically damped decay of the offset (and its velocity) between the displayed foot and the
// clip's, half-life ~3 frames
const REL_Y = 2 * Math.LN2 / 3, REL_E = Math.exp(-REL_Y);

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep

export class FootPlanter {
  constructor(f) {
    this.f = f;
    this.feet = { L: this.fresh(), R: this.fresh() };
    this.onStep = null; // callback(side, length) when a procedural step lands
  }
  fresh() {
    return { on: false, w: new THREE.Vector3(), yaw: 0, step: null, off: new THREE.Vector3(), offYaw: 0, offV: new THREE.Vector3(), offYawV: 0,
      last: new THREE.Vector3(), lastYaw: 0, lv: new THREE.Vector3(), lvYaw: 0, has: false, pw: new THREE.Vector3(), pwYaw: 0, hasPw: false };
  }
  reset() { this.feet.L = this.fresh(); this.feet.R = this.fresh(); }

  // p: the logic pose (foot targets are rewritten in place, before the rig solves the legs)
  apply(p) {
    const f = this.f, ls = f.rig.legScale || 1;
    const speed = Math.hypot(f.pos.x - f.prevPos.x, f.pos.z - f.prevPos.z); // m per frame
    if (speed > 0.5) { this.reset(); return; } // teleport (round start, throws): re-acquire from the clip
    const allowed = LOCKABLE.has(f.state) && !f.airborne && f.pos.y <= 0.002 && !f.ragdoll;
    // heavy knockback and sliding attacks skid on the floor instead of stepping
    const skid = Math.abs(f.slide) > 3.2 || (f.state === 'move' && speed > 0.047);
    const holdYaw = HOLD_YAW.has(f.state);
    const maxErr = 0.1 * ls;
    for (const s of ['L', 'R']) {
      const F = this.feet[s], O = this.feet[s === 'L' ? 'R' : 'L'];
      const sgn = s === 'L' ? 1 : -1;
      const fi = POSE['foot' + s][0], ri = POSE['footRot' + s][0];
      _c.set(p[fi] * sgn, p[fi + 1], p[fi + 2]).multiplyScalar(ls);
      const want = f.charToWorld(_c, _w);
      const wantYaw = f.yaw + p[ri + 1] * sgn;
      const grounded = p[fi + 1] <= GROUND + 0.004;
      // the clip's own foot velocity (world), for a release that keeps the displayed foot's velocity too
      const wv = F.hasPw ? _wv.subVectors(want, F.pw) : _wv.set(0, 0, 0), wvYaw = F.hasPw ? angDiff(wantYaw, F.pwYaw) : 0;
      F.pw.copy(want); F.pwYaw = wantYaw; F.hasPw = true;
      let tgt = null, yaw = wantYaw;
      if (!allowed || !grounded || skid) {
        if (F.on) {
          // released (the clip lifts the foot, a jump, a knockdown): inertialization. The difference between the
          // displayed foot and the clip's, and the difference of their velocities, decay together on a critically
          // damped curve, so the foot leaves the floor with the speed it had (none, if it was planted) and eases into
          // the clip's motion: a plain decaying offset starts it at full speed from one frame to the next
          F.off.copy(F.has ? F.last : F.w).sub(want); F.off.y = 0;
          F.offV.copy(F.has ? F.lv : _j.set(0, 0, 0)).sub(wv); F.offV.y = 0;
          F.offYaw = angDiff(F.has ? F.lastYaw : F.yaw, wantYaw); F.offYawV = (F.has ? F.lvYaw : 0) - wvYaw;
          F.on = false; F.step = null;
        }
        if (F.off.lengthSq() + F.offV.lengthSq() > 1e-8 || Math.abs(F.offYaw) + Math.abs(F.offYawV) > 1e-4) {
          tgt = _t.copy(want).add(F.off); yaw = wantYaw + F.offYaw;
          _j.copy(F.offV).addScaledVector(F.off, REL_Y);
          F.off.add(_j).multiplyScalar(REL_E); F.offV.addScaledVector(_j, -REL_Y).multiplyScalar(REL_E);
          const jy = F.offYawV + F.offYaw * REL_Y;
          F.offYaw = REL_E * (F.offYaw + jy); F.offYawV = REL_E * (F.offYawV - jy * REL_Y);
        } else { F.off.set(0, 0, 0); F.offV.set(0, 0, 0); F.offYaw = 0; F.offYawV = 0; }
      } else {
        if (!F.on) { F.on = true; F.w.copy(want).add(F.off); F.yaw = wantYaw + F.offYaw; F.off.set(0, 0, 0); F.offYaw = 0; F.offV.set(0, 0, 0); F.offYawV = 0; F.step = null; }
        F.w.y = want.y;
        if (F.step) {
          const S = F.step;
          S.t = Math.min(1, S.t + 1 / S.dur);
          const k = ease(S.t);
          tgt = _t.lerpVectors(S.from, want, k);
          // lift profile with zero vertical speed at take-off and touch-down (sin^2): the foot peels off the floor
          // and settles back instead of jerking up and slapping down
          const sn = Math.sin(Math.PI * S.t);
          tgt.y += S.h * sn * sn;
          yaw = S.fromYaw + angDiff(wantYaw, S.fromYaw) * k;
          if (S.t >= 1) { F.w.copy(want); F.yaw = wantYaw; F.step = null; this.onStep?.(s, S.len); }
        } else {
          if (!holdYaw) F.yaw = wantYaw; // attacks pivot on the planted foot
          const err = Math.hypot(want.x - F.w.x, want.z - F.w.z), yerr = Math.abs(angDiff(wantYaw, F.yaw));
          // the leg could not reach the lock last frame (body pushed or rising away from it): step as well
          const hip = f.rig.world['upperleg01.' + s]?.p, L = f.rig.leg?.[s];
          let far = false;
          if (hip && L) { f.worldToChar(F.w, _c); far = _c.distanceTo(hip) > (L.a + L.b) * 0.97; } // a straightening leg steps
          // one foot at a time, unless the body runs away from both (dash)
          if ((err > maxErr || yerr > 0.55 || (far && err > maxErr * 0.35)) && (!O.step || err > 2 * maxErr)) {
            F.step = { from: F.w.clone(), fromYaw: F.yaw, t: 0, len: err,
              dur: Math.round(THREE.MathUtils.clamp(4 + err / ls * 26, 6, 11)), h: Math.min(0.08, 0.026 + err * 0.24) * ls };
          }
          tgt = _t.copy(F.w); yaw = F.yaw;
        }
      }
      if (tgt) {
        // displayed foot velocity (for the next release)
        if (F.has) { F.lv.subVectors(tgt, F.last); F.lvYaw = angDiff(yaw, F.lastYaw); } else { F.lv.set(0, 0, 0); F.lvYaw = 0; }
        F.last.copy(tgt); F.lastYaw = yaw;
        f.worldToChar(tgt, _c);
        p[fi] = _c.x / ls * sgn; p[fi + 1] = _c.y / ls; p[fi + 2] = _c.z / ls;
        p[ri + 1] = angDiff(yaw, f.yaw) * sgn;
      }
      F.has = !!tgt;
    }
  }
}
