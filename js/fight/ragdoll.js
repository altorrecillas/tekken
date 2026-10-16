// Verlet ragdoll used for knock-outs. Particles sit on joints; bone rotations are rebuilt from them.
import * as THREE from 'three';

const G = 9.81;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function basis(x, y, out) {
  const X = x.clone().normalize();
  const Y = y.clone().addScaledVector(X, -y.dot(X)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
function perp(v, axis) { return v.clone().addScaledVector(axis, -v.dot(axis)); }

// joints: name -> [bone, offset (rest, char space), radius, mass]
const JOINTS = {
  pelvis: ['root', [0, 0, 0], 0.13, 3], belly: ['spine03', [0, 0, 0.02], 0.13, 2], chest: ['spine01', [0, 0.02, 0.02], 0.14, 3],
  neck: ['neck01', [0, 0, 0], 0.06, 1], head: ['head', [0, 0.1, 0.02], 0.11, 1.5],
  shL: ['upperarm01.L', [0, 0, 0], 0.06, 1], shR: ['upperarm01.R', [0, 0, 0], 0.06, 1],
  elL: ['lowerarm01.L', [0, 0, 0], 0.05, 0.7], elR: ['lowerarm01.R', [0, 0, 0], 0.05, 0.7],
  wrL: ['wrist.L', [0, 0, 0], 0.045, 0.5], wrR: ['wrist.R', [0, 0, 0], 0.045, 0.5],
  hipL: ['upperleg01.L', [0, 0, 0], 0.08, 1.5], hipR: ['upperleg01.R', [0, 0, 0], 0.08, 1.5],
  knL: ['lowerleg01.L', [0, 0, 0], 0.06, 1], knR: ['lowerleg01.R', [0, 0, 0], 0.06, 1],
  anL: ['foot.L', [0, 0, 0], 0.05, 0.7], anR: ['foot.R', [0, 0, 0], 0.05, 0.7],
  toL: ['foot.L', [0, -0.05, 0.14], 0.035, 0.3], toR: ['foot.R', [0, -0.05, 0.14], 0.035, 0.3],
};
const STICKS = [
  ['pelvis', 'belly'], ['belly', 'chest'], ['chest', 'neck'], ['neck', 'head'],
  ['chest', 'shL'], ['chest', 'shR'], ['shL', 'shR'], ['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'],
  ['pelvis', 'hipL'], ['pelvis', 'hipR'], ['hipL', 'hipR'], ['hipL', 'knL'], ['knL', 'anL'], ['hipR', 'knR'], ['knR', 'anR'],
  ['anL', 'toL'], ['anR', 'toR'], ['knL', 'toL'], ['knR', 'toR'],
  // torso rigidity
  ['shL', 'pelvis'], ['shR', 'pelvis'], ['hipL', 'chest'], ['hipR', 'chest'], ['shL', 'hipL'], ['shR', 'hipR'], ['shL', 'hipR'], ['shR', 'hipL'],
  ['neck', 'shL'], ['neck', 'shR'], ['head', 'chest'], ['head', 'shL'], ['head', 'shR'], ['belly', 'hipL'], ['belly', 'hipR'], ['belly', 'shL'], ['belly', 'shR'],
];
// joint limits as min distances (prevents limbs folding through themselves)
const MINS = [['shL', 'wrL', 0.45], ['shR', 'wrR', 0.45], ['hipL', 'anL', 0.5], ['hipR', 'anR', 0.5], ['head', 'pelvis', 0.9], ['head', 'belly', 0.75],
  ['wrL', 'chest', 0.2], ['wrR', 'chest', 0.2], ['anL', 'anR', 0.12], ['knL', 'knR', 0.12], ['elL', 'belly', 0.14], ['elR', 'belly', 0.14]];

class Ragdoll {
  constructor(f, impulse) {
    this.isRagdoll = true;
    this.f = f;
    this.rig = f.rig;
    this.p = {}; this.o = {}; this.r = {}; this.m = {};
    // current world positions of the joints
    for (const k in JOINTS) {
      const [bn, off, rad, mass] = JOINTS[k];
      const w = this.rig.world[bn];
      const cp = w ? w.p.clone().add(new THREE.Vector3(...off).applyQuaternion(w.q)) : this.rig.rest[bn].clone().add(new THREE.Vector3(...off));
      const wp = f.charToWorld(cp, new THREE.Vector3());
      this.p[k] = wp; this.o[k] = wp.clone(); this.r[k] = rad; this.m[k] = mass;
    }
    // initial velocity: fighter motion + impulse
    const dt = 1 / 60;
    const ax = f.axis(new THREE.Vector3());
    // horizontal launch capped: the body should land ~2 m away (a tight KO shot), not skid across the stage
    const v = new THREE.Vector3().addScaledVector(ax, -Math.min(1.6, f.slide * 0.8)).setY(Math.max(1.5, f.vel.y * 0.9));
    for (const k in this.p) this.o[k].addScaledVector(v, -dt);
    if (impulse) {
      const { point, dir, strength } = impulse;
      for (const k in this.p) {
        const d = this.p[k].distanceTo(point);
        const w = Math.max(0, 1 - d / 0.6);
        this.o[k].addScaledVector(dir, -strength * w * dt / Math.sqrt(this.m[k]));
      }
    }
    // rest lengths (from the rest pose, so the body keeps its proportions)
    const rest = (k) => { const [bn, off] = JOINTS[k]; return this.rig.rest[bn].clone().add(new THREE.Vector3(...off)); };
    this.sticks = STICKS.map(([a, b]) => [a, b, rest(a).distanceTo(rest(b))]);
    this.mins = MINS.map(([a, b, frac]) => [a, b, rest(a).distanceTo(rest(b)) * frac]);
    for (const [a, b, L] of this.mins) { /* scale min distance by limb length */ }
    this.restP = {}; for (const k in JOINTS) this.restP[k] = rest(k);
    this.sleep = 0;
    this.frozen = false;
    // group placed at origin: character space == world space while ragdolled
    f.ragdoll = this;
  }

  step(dt) {
    if (this.frozen) return;
    const P = this.p, O = this.o;
    let energy = 0;
    for (const k in P) {
      const p = P[k], o = O[k];
      const vx = (p.x - o.x) * 0.995, vy = (p.y - o.y) * 0.995, vz = (p.z - o.z) * 0.995;
      energy += vx * vx + vy * vy + vz * vz;
      o.copy(p);
      p.x += vx; p.y += vy - G * dt * dt; p.z += vz;
    }
    for (let it = 0; it < 10; it++) {
      for (const [a, b, L] of this.sticks) this.solve(a, b, L, false);
      for (const [a, b, L] of this.mins) this.solve(a, b, L, true);
      // ground + friction
      for (const k in P) {
        const p = P[k], r = this.r[k];
        if (p.y < r) {
          p.y = r;
          const o = O[k];
          o.x += (p.x - o.x) * 0.12; o.z += (p.z - o.z) * 0.12; // friction
          if (o.y < p.y) o.y = p.y + (o.y - p.y) * 0; // kill bounce
        }
        // stage walls / pool edge / barriers: the joint stops against them (inelastic)
        if (this.clampWalk) this.clampWalk(p, r);
      }
    }
    this.energy = energy;
    if (energy < 1e-7) { if (++this.sleep > 90) this.frozen = true; } else this.sleep = 0;
  }

  solve(a, b, L, minOnly) {
    const pa = this.p[a], pb = this.p[b];
    _a.subVectors(pb, pa);
    const d = _a.length() || 1e-6;
    if (minOnly && d >= L) return;
    const ma = this.m[a], mb = this.m[b];
    const diff = (d - L) / d;
    const wa = mb / (ma + mb), wb = ma / (ma + mb);
    pa.addScaledVector(_a, diff * wa);
    pb.addScaledVector(_a, -diff * wb);
  }

  // rebuild bone rotations from particle positions (on the rig's render skeleton: the simulation's stays as the
  // knockout left it)
  apply() { this.rig.renderScope(() => this._apply()); }
  _apply() {
    const f = this.f, rig = this.rig, b = rig.b, P = this.p, R = this.restP;
    const g = f.ch.group;
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
    // pelvis frame
    const X = _b.subVectors(P.hipL, P.hipR), Y = _c.subVectors(P.belly, P.pelvis);
    const X0 = new THREE.Vector3().subVectors(R.hipL, R.hipR), Y0 = new THREE.Vector3().subVectors(R.belly, R.pelvis);
    const qPel = basis(X, Y, new THREE.Quaternion()).multiply(basis(X0, Y0, new THREE.Quaternion()).invert());
    b.root.quaternion.copy(qPel);
    b.root.position.copy(P.pelvis);
    rig._fk('root');
    // chest frame
    const Xc = new THREE.Vector3().subVectors(P.shL, P.shR), Yc = new THREE.Vector3().subVectors(P.neck, P.belly);
    const Xc0 = new THREE.Vector3().subVectors(R.shL, R.shR), Yc0 = new THREE.Vector3().subVectors(R.neck, R.belly);
    const qChest = basis(Xc, Yc, new THREE.Quaternion()).multiply(basis(Xc0, Yc0, new THREE.Quaternion()).invert());
    const spine = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'];
    spine.forEach((n, i) => {
      const t = (i + 1) / spine.length;
      const qw = qPel.clone().slerp(qChest, t);
      rig._setLocal(n, qw);
    });
    // neck/head: direction neck->head with chest X as twist reference
    const hd = new THREE.Vector3().subVectors(P.head, P.neck), hd0 = new THREE.Vector3().subVectors(R.head, R.neck);
    const qHead = basis(hd, Xc, new THREE.Quaternion()).multiply(basis(hd0, Xc0, new THREE.Quaternion()).invert());
    ['neck01', 'neck02', 'neck03'].forEach((n, i) => rig._setLocal(n, qChest.clone().slerp(qHead, (i + 1) / 4)));
    rig._setLocal('head', qHead);
    // limbs
    for (const s of ['L', 'R']) {
      const A = rig.arm[s];
      rig._fk(`clavicle.${s}`); rig._fk(`shoulder01.${s}`);
      this.limb(`upperarm01.${s}`, `upperarm02.${s}`, `lowerarm01.${s}`, P['sh' + s], P['el' + s], P['wr' + s], A, false);
      rig._fk(`lowerarm02.${s}`); rig._fk(`wrist.${s}`);
      const L = rig.leg[s];
      rig._fk(`pelvis.${s}`);
      this.limb(`upperleg01.${s}`, `upperleg02.${s}`, `lowerleg01.${s}`, P['hip' + s], P['kn' + s], P['an' + s], L, true);
      rig._fk(`lowerleg02.${s}`);
      // foot: align heel->toe
      const ft = new THREE.Vector3().subVectors(P['to' + s], P['an' + s]);
      const ft0 = new THREE.Vector3().subVectors(R['to' + s], R['an' + s]);
      const shin = new THREE.Vector3().subVectors(P['an' + s], P['kn' + s]);
      const shin0 = new THREE.Vector3().subVectors(R['an' + s], R['kn' + s]);
      const qFoot = basis(ft, shin.negate(), new THREE.Quaternion()).multiply(basis(ft0, shin0.negate(), new THREE.Quaternion()).invert());
      rig._setLocal(`foot.${s}`, qFoot);
    }
  }

  limb(up, up2, lo, S, E, W, C, isLeg) {
    const rig = this.rig;
    const x = new THREE.Vector3().subVectors(E, S).normalize();
    const l = new THREE.Vector3().subVectors(W, E).normalize();
    let fold = perp(l, x);
    if (fold.lengthSq() < 1e-6) fold = perp(isLeg ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 0, 1), x);
    const qUp = basis(x, fold, new THREE.Quaternion()).multiply(C.rUp);
    rig._setLocal(up, qUp);
    rig.b[up2].quaternion.identity(); rig._fk(up2);
    const r = perp(x.clone().negate(), l);
    const qLo = basis(l, r.lengthSq() > 1e-6 ? r : fold.clone().negate(), new THREE.Quaternion()).multiply(C.rLo);
    rig._setLocal(lo, qLo);
  }

  // approximate world position (for camera focus)
  center() { return this.p.pelvis; }
}

export class Ragdolls {
  // drivePos: the knocked-out fighter's position follows the body (off online, where the position belongs to the
  // simulation both phones run and the ragdoll is only drawn)
  constructor(scene) { this.list = []; this.scene = scene; this.drivePos = true; }
  spawn(def, att, point) {
    const dir = new THREE.Vector3().subVectors(def.pos, att.pos).setY(0).normalize().setY(0.35).normalize();
    const heavy = 1;
    const rd = new Ragdoll(def, { point: point || def.boneWorld('spine02'), dir, strength: 3 * heavy });
    rd.clampWalk = this.clampWalk || null;
    this.list.push(rd);
    return rd;
  }
  step(dt) { for (const r of this.list) r.step(dt); }
  sync() {
    for (const r of this.list) {
      r.apply();
      // keep the logical position in sync for the camera
      if (this.drivePos) r.f.pos.copy(r.p.pelvis).setY(0);
    }
  }
  freeze() { for (const r of this.list) r.frozen = true; }
  clear() { for (const r of this.list) r.f.ragdoll = null; this.list.length = 0; }
}
