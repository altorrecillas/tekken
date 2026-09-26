// Body volumes fitted to a character's skinned mesh: elliptical capsules for the torso and the head (so bellies and
// broad chests count), round capsules for the limbs. The rig uses them to keep hands, elbows and feet out of the
// own body and the opponent's; tools/animaudit.mjs uses them to measure what still goes through.
import * as THREE from 'three';

const SIDED = { shoulder01: 'uarm', upperarm01: 'uarm', upperarm02: 'uarm', lowerarm01: 'farm', lowerarm02: 'farm', wrist: 'hand',
  upperleg01: 'thigh', upperleg02: 'thigh', lowerleg01: 'shin', lowerleg02: 'shin', foot: 'foot' };
const TORSO = { root: 'hips', spine05: 'hips', pelvis: 'hips', spine04: 'belly', spine03: 'belly', spine02: 'chest', spine01: 'chest',
  breast: 'chest', clavicle: 'chest', neck01: 'neck', neck02: 'neck', neck03: 'neck', head: 'head' };
// mesh parts that make up the silhouette (skin and clothes; hair, eyes, teeth and gear are left out)
const SOLID = new Set(['body', 'head', 'shirt', 'jacket', 'shorts', 'pants', 'socks', 'shoes', 'polo', 'top']);
export const TORSO_SEGS = ['hips', 'belly', 'chest', 'upper', 'neck', 'head'];
export const LIMB_SEGS = ['uarm.L', 'uarm.R', 'farm.L', 'farm.R', 'hand.L', 'hand.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R'];

function segOfBone(name, parent) {
  for (let n = name; n; n = parent[n]) {
    const [base, side] = n.split('.');
    if (SIDED[base] && side) return SIDED[base] + '.' + side;
    if (TORSO[base]) return TORSO[base];
  }
  return null;
}

// segment endpoints: [bone, rest-space offset from the bone head]; 'frame' = bone whose rotation carries the
// elliptical cross-section
function segDefs(rest) {
  const R = (n) => rest[n].head;
  const neck = R('neck01'), sp2 = R('spine02');
  const upperAt = sp2.clone().lerp(neck, 0.62); // pecs below, collarbones / trapezius above
  const d = {
    hips: { a: ['root', [0, -0.085, 0]], b: ['spine04', [0, 0, 0]], frame: 'root', ell: true },
    belly: { a: ['spine04', [0, 0, 0]], b: ['spine02', [0, 0, 0]], frame: 'spine04', ell: true },
    chest: { a: ['spine02', [0, 0, 0]], b: ['spine01', upperAt.clone().sub(R('spine01')).toArray()], frame: 'spine01', ell: true, from: 'chest', t: [0, 0.62] },
    upper: { a: ['spine01', upperAt.clone().sub(R('spine01')).toArray()], b: ['neck01', [0, -0.02, 0]], frame: 'spine01', ell: true, from: 'chest', t: [0.62, 1] },
    neck: { a: ['neck01', [0, 0, 0]], b: ['head', [0, 0, 0]], frame: 'neck01' },
    head: { a: ['head', [0, 0.02, 0]], b: ['head', rest.head.tail.clone().sub(R('head')).multiplyScalar(0.95).toArray()], frame: 'head', ell: true },
  };
  for (const s of ['L', 'R']) {
    d['uarm.' + s] = { a: ['upperarm01.' + s, [0, 0, 0]], b: ['lowerarm01.' + s, [0, 0, 0]] };
    d['farm.' + s] = { a: ['lowerarm01.' + s, [0, 0, 0]], b: ['wrist.' + s, [0, 0, 0]] };
    const hk = R('finger3-1.' + s).clone().sub(R('wrist.' + s));
    d['hand.' + s] = { a: ['wrist.' + s, hk.clone().multiplyScalar(0.15).toArray()], b: ['wrist.' + s, hk.clone().multiplyScalar(1.25).toArray()] };
    d['thigh.' + s] = { a: ['upperleg01.' + s, [0, 0, 0]], b: ['lowerleg01.' + s, [0, 0, 0]] };
    d['shin.' + s] = { a: ['lowerleg01.' + s, [0, 0, 0]], b: ['foot.' + s, [0, 0, 0]] };
    // heel to the ball of the foot (the toes bend on their own and stay flat on the floor)
    const ball = R('toe3-1.' + s).clone().sub(R('foot.' + s));
    d['foot.' + s] = { a: ['foot.' + s, [0, -0.02, -0.03]], b: ['foot.' + s, ball.toArray()] };
  }
  return d;
}

const pct = (arr, q) => {
  if (!arr.length) return 0;
  const a = Float64Array.from(arr).sort();
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
};

// fit the volumes to the bind-pose mesh (rest local rotations are identity, so vertex positions are rest space)
// Hand size relative to the MakeHuman base mesh. The base hands are anatomically average, which next to these
// bodies (and closed into fists) read as too small; fighting games draw them a little larger.
export const HAND_SCALE = 1.2;

export function fitBody(ch, parentMap) {
  const defs = segDefs(ch.rest);
  const boneNames = ch.meta.bones.map(b => b.name);
  const verts = {};
  for (const [pname, mesh] of Object.entries(ch.meshes)) {
    if (!SOLID.has(pname)) continue;
    const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    for (let i = 0; i < P.count; i++) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
      if (best < 0) continue;
      const seg = segOfBone(boneNames[best], parentMap);
      if (!seg) continue;
      (verts[seg] || (verts[seg] = [])).push(P.getX(i), P.getY(i), P.getZ(i));
    }
  }
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  const vols = {};
  for (const [name, def] of Object.entries(defs)) {
    const A = ch.rest[def.a[0]].head.clone().add(new THREE.Vector3(...def.a[1]));
    const B = ch.rest[def.b[0]].head.clone().add(new THREE.Vector3(...def.b[1]));
    // vertices come from the whole bone region (chest + upper share theirs, split along the axis)
    let rA = A, rB = B, t0 = 0, t1 = 1;
    if (def.from) { rA = ch.rest.spine02.head.clone(); rB = ch.rest.neck01.head.clone().add(new THREE.Vector3(0, -0.02, 0)); [t0, t1] = def.t; }
    const ab = rB.clone().sub(rA), l2 = Math.max(ab.lengthSq(), 1e-9);
    const src = verts[def.from || name] || [];
    const vol = { name, def, co: new THREE.Vector3(), r: 0.04, rx: 0.1, rz: 0.1, ell: !!def.ell };
    if (def.ell) {
      const dx = [], dz = [];
      for (let i = 0; i < src.length; i += 3) {
        v.set(src[i], src[i + 1], src[i + 2]);
        const t = v.clone().sub(rA).dot(ab) / l2;
        if (t <= t0 + 0.02 || t >= t1 - 0.02) continue;
        c.copy(rA).addScaledVector(ab, t);
        dx.push(v.x - c.x); dz.push(v.z - c.z);
      }
      const x0 = pct(dx, 0.03), x1 = pct(dx, 0.97), z0 = pct(dz, 0.03), z1 = pct(dz, 0.97);
      vol.co.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      vol.rx = Math.max(0.03, (x1 - x0) / 2 * 0.95); vol.rz = Math.max(0.03, (z1 - z0) / 2 * 0.95);
      vol.r = Math.min(vol.rx, vol.rz);
    } else {
      const rr = [];
      const abl = B.clone().sub(A), ll2 = Math.max(abl.lengthSq(), 1e-9);
      for (let i = 0; i < src.length; i += 3) {
        v.set(src[i], src[i + 1], src[i + 2]);
        const t = v.clone().sub(A).dot(abl) / ll2;
        if (t < 0.15 || t > 0.85) continue;
        rr.push(v.distanceTo(c.copy(A).addScaledVector(abl, t)));
      }
      vol.r = Math.max(0.02, pct(rr, name.startsWith('hand') ? 0.6 : 0.75));
    }
    // the hands are drawn larger than the base mesh (the rig scales the wrist bone): so are their volumes
    if (name.startsWith('hand')) {
      vol.r *= HAND_SCALE;
      vol.def = { ...def, a: [def.a[0], def.a[1].map(x => x * HAND_SCALE)], b: [def.b[0], def.b[1].map(x => x * HAND_SCALE)] };
    }
    vols[name] = vol;
  }
  return vols;
}

// Current segment geometry in character space from the rig's world transforms (or in world space with toWorld).
export class BodyState {
  constructor(vols) {
    this.vols = vols;
    this.seg = {};
    for (const [n, vol] of Object.entries(vols)) {
      this.seg[n] = { vol, A: new THREE.Vector3(), B: new THREE.Vector3(), X: new THREE.Vector3(1, 0, 0), Z: new THREE.Vector3(0, 0, 1), ok: false };
    }
  }
  // world: rig.world (character space); xf: optional {pos, yaw} to express the result in world space
  update(world, xf = null) {
    const c = xf ? Math.cos(xf.yaw) : 1, s = xf ? Math.sin(xf.yaw) : 0;
    const toW = (p) => { if (xf) p.set(p.x * c + p.z * s, p.y, -p.x * s + p.z * c).add(xf.pos); };
    const rot = (p) => { if (xf) p.set(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); };
    for (const n in this.seg) {
      const o = this.seg[n], d = o.vol.def;
      const wa = world[d.a[0]], wb = world[d.b[0]];
      if (!wa || !wb) { o.ok = false; continue; }
      o.ok = true;
      o.A.set(d.a[1][0], d.a[1][1], d.a[1][2]).applyQuaternion(wa.q).add(wa.p);
      o.B.set(d.b[1][0], d.b[1][1], d.b[1][2]).applyQuaternion(wb.q).add(wb.p);
      if (o.vol.ell) {
        const fq = world[d.frame].q;
        _co.copy(o.vol.co).applyQuaternion(fq);
        o.A.add(_co); o.B.add(_co);
        o.X.set(1, 0, 0).applyQuaternion(fq); o.Z.set(0, 0, 1).applyQuaternion(fq);
        rot(o.X); rot(o.Z);
      }
      toW(o.A); toW(o.B);
      if (o.vol.ell) {
        // cross-section axes exactly perpendicular to the segment axis (the frame bone is not always aligned with it)
        _ax2.subVectors(o.B, o.A).normalize();
        o.X.addScaledVector(_ax2, -o.X.dot(_ax2)).normalize();
        o.Z.addScaledVector(_ax2, -o.Z.dot(_ax2)).addScaledVector(o.X, -o.Z.dot(o.X)).normalize();
      }
    }
    return this;
  }
}
const _co = new THREE.Vector3(), _ax2 = new THREE.Vector3();

// closest points between segments p0p1 and q0q1 -> [s, t] (Ericson, Real-Time Collision Detection 5.1.9)
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();
export function closestParams(p0, p1, q0, q1) {
  _d1.subVectors(p1, p0); _d2.subVectors(q1, q0); _r.subVectors(p0, q0);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return [0, 0];
  if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = _d1.dot(_r);
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = _d1.dot(_d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return [s, t];
}

// Penetration depth of a capsule (q0-q1, radius rq) into segment state t (> 0 = inside, metres).
const _pc = new THREE.Vector3(), _tc = new THREE.Vector3(), _dd = new THREE.Vector3(), _ax = new THREE.Vector3();
export function capsuleDepth(q0, q1, rq, t) {
  if (!t.ok) return -1;
  const [s, u] = closestParams(q0, q1, t.A, t.B);
  _pc.lerpVectors(q0, q1, s); _tc.lerpVectors(t.A, t.B, u);
  _dd.subVectors(_pc, _tc);
  const v = t.vol;
  if (!v.ell) return rq + v.r - _dd.length();
  // elliptical cross-section; past the ends the axial offset counts too (rounded caps)
  _ax.subVectors(t.B, t.A); const al = _ax.length();
  let da = 0;
  if (al > 1e-6) { _ax.multiplyScalar(1 / al); da = _dd.dot(_ax); _dd.addScaledVector(_ax, -da); }
  const rc = Math.min(v.rx, v.rz);
  const dx = _dd.dot(t.X), dz = _dd.dot(t.Z), dl = Math.hypot(dx, dz, da);
  const e = Math.hypot(dx / (v.rx + rq), dz / (v.rz + rq), da / (rc + rq));
  if (e >= 1) return -(e - 1) * rc;
  return dl < 1e-6 ? rc + rq : dl * (1 / e - 1);
}

// Move point p (a sphere of radius r) out of segment state t onto its surface. Returns the push length (0 = outside).
// dirHint: preferred exit direction when p sits on the axis.
export function pushOut(p, r, t, dirHint = null) {
  if (!t.ok) return 0;
  const [, u] = closestParams(p, p, t.A, t.B);
  _tc.lerpVectors(t.A, t.B, u);
  _dd.subVectors(p, _tc);
  const v = t.vol;
  if (!v.ell) {
    const R = v.r + r, d = _dd.length();
    if (d >= R) return 0;
    if (d < 1e-6) { if (!dirHint) return 0; _dd.copy(dirHint); } else _dd.multiplyScalar(1 / d);
    p.copy(_tc).addScaledVector(_dd, R);
    return R - d;
  }
  _ax.subVectors(t.B, t.A); const al = _ax.length();
  let da = 0;
  if (al > 1e-6) { _ax.multiplyScalar(1 / al); da = _dd.dot(_ax); _dd.addScaledVector(_ax, -da); }
  const rc = Math.min(v.rx, v.rz);
  const dx = _dd.dot(t.X), dz = _dd.dot(t.Z);
  const e = Math.hypot(dx / (v.rx + r), dz / (v.rz + r), da / (rc + r));
  if (e >= 1) return 0;
  if (e < 1e-4) {
    if (!dirHint) return 0;
    // straight out along the hint, scaled to the ellipse radius in that direction
    const hx = dirHint.dot(t.X), hz = dirHint.dot(t.Z);
    const k = 1 / Math.max(1e-4, Math.hypot(hx / (v.rx + r), hz / (v.rz + r)));
    p.copy(_tc).addScaledVector(t.X, hx * k).addScaledVector(t.Z, hz * k).addScaledVector(_ax, da);
    return k;
  }
  // scale the offset so the normalised distance becomes 1 (radial exit through the nearest part of the ellipse)
  const before = Math.hypot(dx, dz, da);
  p.copy(_tc).addScaledVector(t.X, dx / e).addScaledVector(t.Z, dz / e).addScaledVector(_ax, da / e);
  return before / e - before;
}
