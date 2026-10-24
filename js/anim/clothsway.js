// Clothes that swing. A coat, a jacket or a shirt hanging below the waist was skinned to the hips like a shell: in a
// dash, a spin or a landing its hem moved with the body as if starched. Here a damped spring at the hips, driven by
// their acceleration (turns included: the point that drives it is the hem's centre, away from the hips' pivot) and by
// gravity once the hips tilt, lets the hem lag behind; the cloth material's vertex shader moves each hem vertex by
// that lag times its share of freedom: nothing at the waist, all of it at the hem, nothing on the sleeves. A vertex
// only moves outwards or along the cloth, never into the body (the share falls to nothing where the lag points into
// the cloth's own inside): the trailing side of a coat flares, the side the legs push stays where the skin is.
// In a spin the hem also flares out all round (the hips' turning speed, squared, through a second spring), straight
// out from the hips' axis: outwards by its nature. Drawn only: the simulation and the netplay snapshot never see it. The shadow and the depth of field's depth move
// with it (the same uniform). js/anim/hairsway.js is the same idea for the hair.
import * as THREE from 'three';

// garments that hang free below the waist, and how far their hem swings (a long, light coat most)
const KIND = { jacket: 1.0, top: 0.5, shirt: 0.55, polo: 0.55 };
const ARM = /^(clavicle|shoulder|upperarm|lowerarm|wrist|finger|metacarpal)/;

// The vertex shader part: the hem's lag (uClothSway, in the hips' rest frame) times the vertex's freedom, before
// skinning. clothFree.w = 1 - freedom (a mesh without the attribute reads w = 1: still).
// u = { value: Vector3 lag, flare: { value: metres }, axis: { value: Vector3 (the hips' axis, rest frame) } }
export function addClothSway(sh, u) {
  sh.uniforms.uClothSway = u; sh.uniforms.uClothFlare = u.flare; sh.uniforms.uClothAxis = u.axis;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uClothSway;\nuniform float uClothFlare;\nuniform vec3 uClothAxis;\nattribute vec4 clothFree;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
	{
		float free_ = 1.0 - clothFree.w, l_ = length( uClothSway );
		if ( free_ > 0.0 ) {
			if ( l_ > 1e-6 ) transformed += uClothSway * free_ * clamp( dot( normal, uClothSway / l_ ) + 0.6, 0.0, 1.0 );
			vec2 r_ = transformed.xz - uClothAxis.xz;
			if ( uClothFlare > 0.0 && dot( r_, r_ ) > 1e-8 ) transformed.xz += normalize( r_ ) * uClothFlare * free_;
		}
	}`);
}
export function clothSwayDepth(u) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => addClothSway(sh, u);
  d.customProgramCacheKey = () => 'clothswayDepth';
  return d;
}

// At load: the freedom of every vertex of the swinging garments (from the rest pose: below a line a little over the
// hip joints, growing to the hem; off the arms), and a sway uniform on their materials. Returns the parts set up.
export function setupClothSway(meshes, meta) {
  const names = meta.bones.map(b => b.name);
  const head = (n) => meta.bones[names.indexOf(n)]?.head;
  const hipL = head('upperleg01.L'), hipR = head('upperleg01.R');
  if (!hipL || !hipR) return [];
  const waist = (hipL[1] + hipR[1]) / 2 + 0.1;
  const arm = names.map(n => ARM.test(n));
  const parts = [];
  for (const [name, m] of Object.entries(meshes)) {
    const amp = KIND[name];
    if (!amp || !m.isSkinnedMesh || !m.material?.userData?.cloth) continue;
    const g = m.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    let lo = Infinity;
    for (let i = 0; i < P.count; i++) lo = Math.min(lo, P.getY(i));
    if (lo > waist - 0.04) continue; // (it ends above the waist: nothing hangs)
    const out = new Float32Array(P.count * 4);
    const c = new THREE.Vector3(); let cw = 0;
    for (let i = 0; i < P.count; i++) {
      out[i * 4 + 3] = 1;
      const t = (waist - P.getY(i)) / (waist - lo);
      if (t <= 0) continue;
      let aw = 0;
      for (let k = 0; k < 4; k++) if (arm[SI.getComponent(i, k)]) aw += SW.getComponent(i, k);
      const x = Math.min(1, t), f = x * x * (3 - 2 * x) * Math.max(0, 1 - aw * 10) * amp;
      if (f <= 0) continue;
      out[i * 4 + 3] = 1 - Math.min(1, f);
      c.x += P.getX(i) * f; c.y += P.getY(i) * f; c.z += P.getZ(i) * f; cw += f;
    }
    if (!cw) continue;
    g.setAttribute('clothFree', new THREE.BufferAttribute(out, 4));
    const axis = new THREE.Vector3((hipL[0] + hipR[0]) / 2, 0, (hipL[2] + hipR[2]) / 2);
    const u = m.material.userData.clothSway = { value: new THREE.Vector3(), flare: { value: 0 }, axis: { value: axis } };
    m.material.needsUpdate = true;
    m.customDepthMaterial = clothSwayDepth(u);
    parts.push({ name, u, centre: c.multiplyScalar(1 / cw) });
  }
  return parts;
}

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _g = new THREE.Vector3();
const GRAVITY = new THREE.Vector3(0, -9.8, 0);

export class ClothSway {
  // spring frequency (Hz), damping ratio, share of the hips' acceleration that reaches the hem, largest swing (m)
  static TUNE = { f: 2.4, zeta: 0.32, gain: 0.4, max: 0.07 };
  // the flare in a spin: metres per (rad/s) squared, its spring (Hz, damping) and the most it opens (m)
  static FLARE = { k: 0.0006, f: 3, zeta: 0.45, max: 0.09 };
  constructor(ch, amount = 1) {
    this.parts = ch.clothSway || [];
    this.hips = ch.bones?.spine05;
    this.amount = amount;
    if (!this.parts.length || !this.hips || amount <= 0) { this.parts = []; return; }
    // the point that drives the spring: the hems' centre, in the hips bone's frame
    const c = new THREE.Vector3();
    for (const p of this.parts) c.add(p.centre);
    this.anchor = c.multiplyScalar(1 / this.parts.length).sub(new THREE.Vector3(...ch.meta.bones.find(b => b.name === 'spine05').head));
    const T = ClothSway.TUNE, w = 2 * Math.PI * T.f;
    this.k = w * w; this.c = 2 * T.zeta * w; this.gain = T.gain; this.max = T.max;
    this.off = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.p1 = null; this.v1 = null; this.t = null;
    const F = ClothSway.FLARE, wf = 2 * Math.PI * F.f;
    this.fk = wf * wf; this.fc = 2 * F.zeta * wf; this.flare = 0; this.flareV = 0; this.yaw1 = null; this.spin = 0;
  }

  // now: the fight's clock in seconds; frozen: hitstop (as js/anim/hairsway.js)
  update(now, frozen = false) {
    if (!this.parts.length) return;
    const dt = this.t !== null ? now - this.t : 0;
    this.t = now;
    if (dt === 0 && this.p1) return;
    this.hips.updateWorldMatrix(true, false);
    const P = _p.copy(this.anchor).applyMatrix4(this.hips.matrixWorld);
    // the hips' heading (their forward axis on the ground), for the turning speed
    this.hips.getWorldQuaternion(_q);
    _f.set(0, 0, 1).applyQuaternion(_q);
    const yaw = Math.atan2(_f.x, _f.z);
    if (!this.p1 || dt < 0 || dt > 0.25 || frozen) {
      if (!this.p1) { this.p1 = P.clone(); this.v1 = new THREE.Vector3(); }
      else { this.p1.copy(P); this.v1.set(0, 0, 0); }
      this.yaw1 = yaw;
      return;
    }
    let dyaw = yaw - this.yaw1; this.yaw1 = yaw;
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    // (a heading that flips because the hips lie flat is not a spin: only while they are fairly upright)
    const upright = Math.max(0, new THREE.Vector3(0, 1, 0).applyQuaternion(_q).y);
    this.spin += (dyaw / dt * upright - this.spin) * Math.min(1, dt * 20);
    const V = _v.copy(P).sub(this.p1).divideScalar(dt);
    if (V.lengthSq() > 25 * 25) { this.p1.copy(P); this.v1.set(0, 0, 0); return; }
    const A = _a.copy(V).sub(this.v1).divideScalar(dt);
    this.p1.copy(P); this.v1.copy(V);
    this.hips.getWorldQuaternion(_q);
    _g.copy(GRAVITY).applyQuaternion(_q).sub(GRAVITY).multiplyScalar(-0.25);
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) {
      _f.copy(A).multiplyScalar(-this.gain).add(_g).addScaledVector(this.off, -this.k).addScaledVector(this.vel, -this.c);
      this.vel.addScaledVector(_f, h);
      this.off.addScaledVector(this.vel, h);
    }
    const F = ClothSway.FLARE, target = Math.min(F.max, F.k * this.spin * this.spin);
    for (let i = 0; i < n; i++) {
      this.flareV += ((target - this.flare) * this.fk - this.flareV * this.fc) * h;
      this.flare += this.flareV * h;
    }
    this.flare = Math.max(0, Math.min(F.max * 1.3, this.flare));
    let l = this.off.length();
    if (l > 3 * this.max) { this.off.multiplyScalar(3 * this.max / l); this.vel.multiplyScalar(0.5); l = 3 * this.max; }
    const shown = l > 1e-6 ? this.max * Math.tanh(l / this.max) / l : 1;
    _q.invert();
    for (const p of this.parts) { p.u.value.copy(this.off).multiplyScalar(shown * this.amount).applyQuaternion(_q); p.u.flare.value = this.flare * this.amount; }
  }
}
