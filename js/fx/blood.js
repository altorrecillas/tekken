// Blood for the PUÑETALITY (js/fight/fatality.js): drops (each a little wet sphere, stretched along its motion like a
// film frame's blur), a red mist, a few chunks, the splats the drops leave where they land and pools that spread, and
// drops on the camera's lens (an overlay canvas). Stepped with the fight's frames (step) and drawn between them
// (render: alpha), so a slow-motion shot moves smoothly and a capture of frame N always shows the same thing.
import * as THREE from 'three';

const G = 9.81, DT = 1 / 60;
const MAXD = 3200, MAXM = 160, MAXDEC = 180;
const FLOOR = 0.0;
function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const DROP_VS = `
attribute vec3 iPos, iPrev, iVel; attribute vec3 iSA;
uniform float uAlpha, uShutter;
varying vec2 vQ; varying float vA; varying float vB; varying float vH;
void main() {
  vB = iSA.z;
  vec3 wp = mix( iPrev, iPos, uAlpha );
  vec4 mv = viewMatrix * vec4( wp, 1.0 );
  vec3 vv = mat3( viewMatrix ) * iVel;
  float sp = length( vv.xy );
  // (nrm to the right of dir, as x is to the right of y: the quad keeps its winding, or it is culled as a back face)
  vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2( 0.0, 1.0 ), nrm = vec2( dir.y, -dir.x );
  // drawn as a capsule: the drop smeared along its path over the shutter (1/60 s of the fight's time: in slow motion
  // the drops hang in the air, sharp), trailing behind it
  float r = iSA.x, hl = 0.5 * sp * uShutter;
  mv.xy += dir * ( position.y * 2.0 * ( r + hl ) - hl ) + nrm * position.x * 2.0 * r;
  gl_Position = projectionMatrix * mv;
  // (in units of the drop's radius: across, along)
  // (a drop right in front of the lens would be a big pale smear: they fade out there)
  vQ = vec2( position.x * 2.0, position.y * 2.0 * ( r + hl ) / r ); vH = hl / r; vA = iSA.y * smoothstep( 0.2, 0.55, -mv.z );
}`;
const DROP_FS = `
uniform vec3 uLight;
varying vec2 vQ; varying float vA; varying float vB; varying float vH;
void main() {
  vec2 q = vec2( vQ.x, max( abs( vQ.y ) - vH, 0.0 ) );
  float d = length( q );
  if ( d > 1.0 ) discard;
  // a wet sphere (dark red, bright red from an artery), a point of light; a smeared drop is fainter
  vec3 n = vec3( q.x, q.y * sign( vQ.y ), sqrt( max( 0.0, 1.0 - d * d ) ) );
  float dif = 0.3 + 0.7 * max( dot( n, uLight ), 0.0 );
  float spec = pow( max( dot( reflect( -uLight, n ), vec3( 0.0, 0.0, 1.0 ) ), 0.0 ), 28.0 );
  vec3 c = mix( vec3( 0.2, 0.004, 0.007 ), vec3( 0.5, 0.01, 0.018 ), vB ) * dif * ( 0.65 + 0.35 * n.z ) + vec3( 1.0, 0.86, 0.82 ) * spec * 0.7;
  gl_FragColor = vec4( c, vA * ( 1.0 - smoothstep( 0.7, 1.0, d ) ) / ( 1.0 + vH * 0.35 ) );
}`;
const MIST_VS = `
attribute vec3 iPos, iPrev; attribute vec2 iSA;
uniform float uAlpha;
varying vec2 vQ; varying float vA;
void main() {
  vec4 mv = viewMatrix * vec4( mix( iPrev, iPos, uAlpha ), 1.0 );
  mv.xy += position.xy * iSA.x * 2.0;
  gl_Position = projectionMatrix * mv;
  vQ = position.xy * 2.0; vA = iSA.y;
}`;
const MIST_FS = `
varying vec2 vQ; varying float vA;
float h( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
void main() {
  float d = length( vQ );
  if ( d > 1.0 ) discard;
  float a = exp( -d * d * 3.2 ) * ( 0.75 + 0.25 * h( floor( vQ * 6.0 ) + vA ) );
  gl_FragColor = vec4( vec3( 0.16, 0.006, 0.008 ), a * vA );
}`;

// the splats' shapes (white, alpha = how thick): 0 a round splat with drops flung round it, 1 a splat drawn out
// along +x (a drop that landed moving), 2 a scatter of small drops, 3 a pool (smooth, a wavy edge)
function splatTexture(kind, seed) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), R = rng(seed);
  g.translate(N / 2, N / 2);
  const blob = (x, y, r, a = 1, wob = 0.25, k = 14) => {
    g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath();
    const ph = R() * 6.28, ph2 = R() * 6.28;
    for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI * 2, rr = r * (1 + wob * 0.5 * Math.sin(t * 3 + ph) + wob * 0.3 * Math.sin(t * 7 + ph2) + wob * 0.2 * (R() - 0.5)); if (i) g.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); else g.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); }
    g.closePath(); g.fill();
  };
  if (kind === 0) {
    blob(0, 0, 58, 0.95, 0.35);
    for (let i = 0; i < 26; i++) { const a = R() * 6.28, d = 70 + R() * 50, r = 2 + R() * 7; blob(Math.cos(a) * d, Math.sin(a) * d, r, 0.9, 0.2); }
    for (let i = 0; i < 9; i++) { const a = R() * 6.28; g.save(); g.rotate(a); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(70, 0, 22 + R() * 18, 3 + R() * 3, 0, 0, 6.28); g.fill(); g.restore(); }
  } else if (kind === 1) {
    blob(-40, 0, 40, 0.95, 0.3);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.ellipse(10, 0, 80, 22, 0, 0, 6.28); g.fill();
    for (let i = 0; i < 18; i++) { const x = 30 + R() * 90, y = (R() - 0.5) * 70 * (x / 120), r = 2 + R() * 6 * (1 - x / 140); blob(x, y, Math.max(1.5, r), 0.9, 0.2); }
    for (let i = 0; i < 6; i++) { g.save(); g.rotate((R() - 0.5) * 0.6); g.beginPath(); g.ellipse(80 + R() * 30, 0, 26, 2.5, 0, 0, 6.28); g.fill(); g.restore(); }
  } else if (kind === 2) {
    for (let i = 0; i < 40; i++) { const a = R() * 6.28, d = Math.pow(R(), 0.7) * 110, r = 2 + R() * 9; blob(Math.cos(a) * d, Math.sin(a) * d, r, 0.9, 0.25); }
  } else {
    const gr = g.createRadialGradient(0, 0, 40, 0, 0, 120);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.85, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i <= 64; i++) { const t = i / 64 * 6.28, rr = 112 * (1 + 0.08 * Math.sin(t * 3 + 1) + 0.05 * Math.sin(t * 7 + 2) + 0.03 * Math.sin(t * 13)); if (i) g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); else g.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Blood {
  constructor(scene) {
    this.scene = scene;
    this.R = rng(1234);
    // drops
    const quad = new THREE.PlaneGeometry(1, 1);
    const mk = (n, attrs) => {
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index; g.setAttribute('position', quad.attributes.position);
      const A = {};
      for (const [k, sz] of attrs) { A[k] = new THREE.InstancedBufferAttribute(new Float32Array(n * sz), sz).setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, A[k]); }
      g.instanceCount = 0;
      return [g, A];
    };
    [this.dg, this.dA] = mk(MAXD, [['iPos', 3], ['iPrev', 3], ['iVel', 3], ['iSA', 3]]);
    this.dropU = { uAlpha: { value: 1 }, uShutter: { value: 1 / 60 }, uLight: { value: new THREE.Vector3(0.3, 0.6, 0.75).normalize() } };
    this.dropMesh = new THREE.Mesh(this.dg, new THREE.ShaderMaterial({ uniforms: this.dropU, vertexShader: DROP_VS, fragmentShader: DROP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.dropMesh.frustumCulled = false; this.dropMesh.renderOrder = 12;
    [this.mg, this.mA] = mk(MAXM, [['iPos', 3], ['iPrev', 3], ['iSA', 2]]);
    this.mistU = { uAlpha: { value: 1 } };
    this.mistMesh = new THREE.Mesh(this.mg, new THREE.ShaderMaterial({ uniforms: this.mistU, vertexShader: MIST_VS, fragmentShader: MIST_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mistMesh.frustumCulled = false; this.mistMesh.renderOrder = 11;
    for (const m of [this.dropMesh, this.mistMesh]) { m.userData.noGTAO = true; m.userData.noAO = true; }
    this.drops = []; this.mist = [];
    // splats on the floor: wet, glossy, dark
    this.decals = [0, 1, 2, 3].map((k) => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.11, 0.003, 0.005), map: splatTexture(k, 11 + k * 7), transparent: true, depthWrite: false,
        roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      });
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(g, mat, MAXDEC);
      im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.renderOrder = 3;
      im.userData.noGTAO = true; im.userData.noAO = true;
      return { im, list: [] };
    });
    // chunks
    const cg = [0, 1, 2].map((k) => {
      const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, R = rng(77 + k);
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + R() * 0.5), p.getY(i) * (0.55 + R() * 0.4), p.getZ(i) * (0.8 + R() * 0.5));
      g.computeVertexNormals();
      return g;
    });
    this.chunkMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.16, 0.01, 0.012), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
    // (bits of brain, pale and wet, and of bone or teeth)
    this.chunkMats = {
      flesh: this.chunkMat,
      brain: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.55, 0.3, 0.28), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.5, sheenColor: new THREE.Color(0.6, 0.25, 0.25) }),
      bone: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.72, 0.66, 0.56), roughness: 0.45, clearcoat: 0.4 }),
    };
    this.chunkGeos = cg; this.chunks = [];
    this.group = new THREE.Group(); this.group.name = 'blood';
    this.group.add(this.dropMesh, this.mistMesh, ...this.decals.map((d) => d.im));
    scene.add(this.group);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  // ------------------------------------------------------------------ spawning
  // n drops from p along dir (unit) at speed (min, max), within a cone of `spread` (rad); size (m): radius range
  spray(p, dir, n, { speed = [1.5, 4], spread = 0.35, size = [0.002, 0.006], life = 3, drag = 0.25, bright = 0 } = {}) {
    const R = this.R;
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    t1.set(dir.z, 0, -dir.x); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize(); t2.crossVectors(dir, t1);
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= MAXD) this.drops.shift();
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * Math.tan(spread);
      const v = dir.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize().multiplyScalar(speed[0] + (speed[1] - speed[0]) * R());
      const s = size[0] + (size[1] - size[0]) * Math.pow(R(), 2.2);
      this.drops.push({ p: p.clone(), prev: p.clone(), v, s, a: 0.92, life: life * (0.7 + 0.6 * R()), age: 0, drag, b: bright });
    }
  }
  // drops that just run off a surface (seeping from the cut): slow, heavy, falling
  dribble(p, n, size = [0.0025, 0.006]) { this.spray(p, new THREE.Vector3(0, -1, 0), n, { speed: [0.05, 0.4], spread: 0.6, size, drag: 0.6 }); }
  puff(p, n, { size = [0.05, 0.12], speed = 0.6, life = 1.2 } = {}) {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      if (this.mist.length >= MAXM) this.mist.shift();
      const v = new THREE.Vector3(R() - 0.5, R() * 0.6, R() - 0.5).normalize().multiplyScalar(speed * (0.3 + R()));
      this.mist.push({ p: p.clone(), prev: p.clone(), v, s0: size[0] * (0.7 + 0.6 * R()), s1: size[1] * (0.8 + 0.5 * R()), a: 0.32 + R() * 0.2, life: life * (0.7 + 0.6 * R()), age: 0 });
    }
  }
  gore(p, dir, n, kind = 'flesh') {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.chunkGeos[i % 3], this.chunkMats[kind] || this.chunkMat);
      const s = (kind === 'bone' ? 0.004 : 0.006) + R() * (kind === 'bone' ? 0.005 : 0.009);
      m.scale.setScalar(s); m.castShadow = true; m.userData.noGTAO = true;
      this.group.add(m);
      const v = dir.clone().multiplyScalar(1.2 + R() * 2.2).add(new THREE.Vector3((R() - 0.5) * 2, R() * 2.2, (R() - 0.5) * 2));
      this.chunks.push({ m, p: p.clone(), prev: p.clone(), v, q: new THREE.Quaternion(), w: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(18), r: s, landed: false });
    }
  }
  // a splat on the floor at p (y ignored): kind (0-3), size (m), angle (rad, the way it was going), grow: frames to
  // spread to its full size (a pool)
  splat(p, size, kind = 0, angle = 0, grow = 0) {
    const D = this.decals[kind];
    if (D.list.length >= MAXDEC) D.list.shift();
    D.list.push({ x: p.x, z: p.z, size, angle, grow, age: 0, y: FLOOR + 0.0015 + (this._dy = ((this._dy || 0) + 0.00007) % 0.003) });
  }

  // ------------------------------------------------------------------ simulation (one fight frame)
  step() {
    const D = this.drops;
    let n = 0;
    for (let i = 0; i < D.length; i++) {
      const d = D[i];
      d.age += DT;
      if (d.age >= d.life) continue;
      d.prev.copy(d.p);
      d.v.y -= G * DT; d.v.multiplyScalar(Math.exp(-d.drag * DT));
      d.p.addScaledVector(d.v, DT);
      if (d.p.y <= FLOOR + 0.002) {
        // landed: a splat for the bigger ones, drawn out the way it was going if it came in fast and flat
        const hs = Math.hypot(d.v.x, d.v.z);
        if (d.s > 0.0035 || this.R() < 0.2) {
          const flat = hs > 1.2 && hs > Math.abs(d.v.y) * 0.6;
          this.splat(d.p, d.s * (flat ? 13 : 9) * (0.8 + 0.4 * this.R()) * (1 + Math.min(1.5, hs * 0.15)), flat ? 1 : (this.R() < 0.7 ? 0 : 2), Math.atan2(-d.v.z, d.v.x));
        }
        continue;
      }
      D[n++] = d;
    }
    D.length = n;
    const M = this.mist;
    n = 0;
    for (const m of M) {
      m.age += DT;
      if (m.age >= m.life) continue;
      m.prev.copy(m.p);
      m.v.multiplyScalar(Math.exp(-2.5 * DT)); m.v.y -= 0.4 * DT;
      m.p.addScaledVector(m.v, DT);
      M[n++] = m;
    }
    M.length = n;
    for (const c of this.chunks) {
      c.prev.copy(c.p);
      if (c.rest) continue;
      c.v.y -= G * DT;
      c.p.addScaledVector(c.v, DT);
      c.q.premultiply(this._q.setFromAxisAngle(this._p.copy(c.w).normalize(), c.w.length() * DT));
      if (c.p.y < c.r * 0.7) {
        c.p.y = c.r * 0.7;
        if (!c.landed) { c.landed = true; if (c.m.material === this.chunkMat) this.splat(c.p, c.r * 7, 0, 0); }
        c.v.y = Math.abs(c.v.y) * 0.25; c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.6);
        if (c.v.lengthSq() < 0.02) c.rest = true;
      }
    }
    for (const Dc of this.decals) for (const s of Dc.list) s.age++;
  }

  // ------------------------------------------------------------------ drawing (alpha: between the last two frames)
  // rate: how fast the fight's time runs (slow motion: the shutter takes in less of the drops' motion)
  render(alpha, camera, rate = 1) {
    this.dropU.uAlpha.value = alpha; this.mistU.uAlpha.value = alpha;
    this.dropU.uShutter.value = rate / 60;
    // the light from above, a little towards the lens (view space)
    if (camera) this.dropU.uLight.value.set(0.25, 0.85, 0.45).normalize();
    const A = this.dA, D = this.drops;
    for (let i = 0; i < D.length; i++) {
      const d = D[i], fade = Math.min(1, (d.life - d.age) / 0.25);
      A.iPos.setXYZ(i, d.p.x, d.p.y, d.p.z); A.iPrev.setXYZ(i, d.prev.x, d.prev.y, d.prev.z); A.iVel.setXYZ(i, d.v.x, d.v.y, d.v.z);
      A.iSA.setXYZ(i, d.s, d.a * fade, d.b || 0);
    }
    this.dg.instanceCount = D.length;
    for (const k in A) A[k].needsUpdate = true;
    const MA = this.mA, M = this.mist;
    for (let i = 0; i < M.length; i++) {
      const m = M[i], t = m.age / m.life;
      MA.iPos.setXYZ(i, m.p.x, m.p.y, m.p.z); MA.iPrev.setXYZ(i, m.prev.x, m.prev.y, m.prev.z);
      MA.iSA.setXY(i, m.s0 + (m.s1 - m.s0) * Math.sqrt(t), m.a * Math.min(1, t * 8) * (1 - t) * (1 - t));
    }
    this.mg.instanceCount = M.length;
    for (const k in MA) MA[k].needsUpdate = true;
    for (const c of this.chunks) { c.m.position.lerpVectors(c.prev, c.p, alpha); c.m.quaternion.copy(c.q); }
    for (const Dc of this.decals) {
      const im = Dc.im;
      Dc.list.forEach((s, i) => {
        // a splat spreads out over its first frames (a pool over `grow` of them)
        const k = s.grow ? 1 - Math.exp(-s.age / s.grow * 2.2) : 1 - Math.exp(-s.age / 2.5);
        const sz = s.size * (0.55 + 0.45 * k);
        this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.angle);
        this._m.compose(this._p.set(s.x, s.y, s.z), this._q, this._s.set(sz, 1, sz));
        im.setMatrixAt(i, this._m);
      });
      im.count = Dc.list.length;
      im.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    this.drops.length = 0; this.mist.length = 0;
    for (const c of this.chunks) this.group.remove(c.m);
    this.chunks.length = 0;
    for (const D of this.decals) { D.list.length = 0; D.im.count = 0; }
    this.dg.instanceCount = 0; this.mg.instanceCount = 0;
  }
  dispose() {
    this.clear();
    this.scene.remove(this.group);
    for (const D of this.decals) { D.im.material.map?.dispose(); D.im.material.dispose(); D.im.geometry.dispose(); }
    this.dropMesh.material.dispose(); this.mistMesh.material.dispose(); this.dg.dispose(); this.mg.dispose();
    for (const g of this.chunkGeos) g.dispose();
    for (const k in this.chunkMats) this.chunkMats[k].dispose();
  }
}

// Blood on the camera's lens: a few drops land on it (the overlay canvas over the game), towards the edges of the
// picture, see-through and darker at their rims as blood on glass is, some flung out into a streak; the bigger ones
// slowly run down; all fade
export class LensBlood {
  constructor(canvas) {
    this.c = canvas; this.g = canvas?.getContext('2d'); this.drops = []; this.R = rng(99);
  }
  splash(n = 5, power = 1) {
    if (!this.g) return;
    const R = this.R;
    for (let i = 0; i < n; i++) {
      // (away from the middle of the picture, where the action is)
      let x, y;
      do { x = 0.04 + R() * 0.92; y = 0.08 + R() * 0.8; } while (Math.hypot((x - 0.5) * 1.6, y - 0.5) < 0.42);
      const big = R() < 0.3;
      const r = (big ? 0.014 + R() * 0.012 : 0.004 + R() * 0.008) * power;
      this.drops.push({ x, y, r, run: big ? 0.015 + R() * 0.03 : 0, age: 0, life: 3.2 + R() * 2, seed: (R() * 1e6) | 0, ang: R() * 6.28, streak: R() < 0.4 ? 1.6 + R() * 1.6 : 1, sprite: null });
    }
  }
  // one drop drawn once into a little canvas of its own (size in pixels)
  sprite(d, px) {
    const R = rng(d.seed), S = Math.ceil(px * (2.6 + d.streak)), c = document.createElement('canvas');
    c.width = c.height = S * 2;
    const g = c.getContext('2d');
    g.translate(S, S); g.rotate(d.ang); g.scale(d.streak, 1);
    const shape = (k) => {
      g.beginPath();
      const p1 = R() * 6.28, p2 = R() * 6.28;
      for (let i = 0; i <= 36; i++) { const t = i / 36 * 6.28, rr = px * k * (1 + 0.16 * Math.sin(t * 3 + p1) + 0.09 * Math.sin(t * 7 + p2)); if (i) g.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); else g.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
      g.closePath();
    };
    // the body: thin in the middle, a darker ring where it is thick at its edge
    const body = g.createRadialGradient(-px * 0.15, -px * 0.2, px * 0.05, 0, 0, px * 1.15);
    body.addColorStop(0, 'rgba(150,6,14,0.3)'); body.addColorStop(0.65, 'rgba(110,3,10,0.48)'); body.addColorStop(0.92, 'rgba(60,0,5,0.8)'); body.addColorStop(1, 'rgba(40,0,3,0.5)');
    g.fillStyle = body; shape(1); g.fill();
    // light through it at one side, a bright point at the other
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,90,80,0.22)'; g.lineWidth = px * 0.12; g.beginPath(); g.arc(0, 0, px * 0.7, 2.2, 3.6); g.stroke();
    g.fillStyle = 'rgba(255,225,220,0.5)'; g.beginPath(); g.ellipse(-px * 0.38, -px * 0.42, px * 0.15, px * 0.07, -0.7, 0, 6.28); g.fill();
    g.restore();
    // a spray of fine drops round it, flung along the streak
    for (let i = 0; i < 9; i++) {
      const t = (R() - 0.5) * 2.2, dd = px * (1.3 + R() * 1.6), rr = px * (0.05 + R() * 0.12);
      g.fillStyle = `rgba(90,2,8,${0.5 + R() * 0.35})`; g.beginPath(); g.arc(Math.cos(t) * dd, Math.sin(t) * dd, rr, 0, 6.28); g.fill();
    }
    return { c, S };
  }
  // (they age with the fight's frames: a slow-motion shot keeps them longer, a capture of frame N always has them)
  age(dt) { for (const d of this.drops) d.age += dt; this.drops = this.drops.filter((d) => d.age < d.life); }
  update(dt) {
    const c = this.c, g = this.g;
    if (!g) return;
    if (dt) this.age(dt);
    if (!this.drops.length) { if (this._on) { g.clearRect(0, 0, c.width, c.height); c.classList.remove('on'); this._on = false; } return; }
    const w = c.clientWidth | 0, h = c.clientHeight | 0;
    if (w < 8 || h < 8) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; for (const d of this.drops) d.sprite = null; }
    g.clearRect(0, 0, w, h);
    c.classList.add('on'); this._on = true;
    const M = Math.min(w, h);
    for (const d of this.drops) {
      const px = d.r * M;
      d.sprite ||= this.sprite(d, px);
      const a = Math.min(1, d.age * 12) * Math.min(1, (d.life - d.age) / 1.4);
      const fall = d.run * Math.max(0, d.age - 0.5) * h;
      const x = d.x * w, y = d.y * h + fall;
      g.globalAlpha = a;
      if (fall > 0) {
        // the trail it leaves, thinning upwards
        const gr = g.createLinearGradient(x, y - fall, x, y);
        gr.addColorStop(0, 'rgba(90,2,8,0)'); gr.addColorStop(1, 'rgba(90,2,8,0.55)');
        g.fillStyle = gr; g.fillRect(x - px * 0.18, y - fall, px * 0.36, fall);
      }
      g.drawImage(d.sprite.c, x - d.sprite.S, y - d.sprite.S);
    }
    g.globalAlpha = 1;
  }
  clear() { this.drops.length = 0; if (this.g) { this.g.clearRect(0, 0, this.c.width, this.c.height); this.c.classList.remove('on'); this._on = false; } }
}
