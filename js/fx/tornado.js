// The whirlwind of Alejandro's PUÑETALITY (js/fight/fatality.js): what a man running round another at an impossible
// speed whips up. Drawn only, stepped with the fight's frames.
//
// - The wall of wind: three nested funnels (open cones, wider at the top) of streaky, scrolling noise, dust-coloured,
//   turning red as the blood is taken up into it; their spin follows the runner's speed.
// - Particles: dust and grit low down, blood mist and drops caught in the rotation, rising and spreading; some
//   debris (dry leaves, scraps of paper, gravel) tumbling round.
// - On the floor: the track he wears into it, a dark scuffed ring, and the dust skirt at the foot of the funnel.
// - Afterimages of the runner: copies of his body, a few steps behind him round the circle, fading.
import * as THREE from 'three';

function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// (the funnel's wall not a clean cone: it bulges and pinches in rolls that climb it and turn with the wind, so that its
// outline wavers instead of drawing two straight lines)
const WALL_VS = `
uniform float uTime, uSpin, uSeed;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vUv = uv;
  vec3 p = position;
  float w = sin( uv.y * 11.0 - uTime * 2.3 + uSeed * 5.0 ) * 0.07 + sin( uv.x * 18.85 + uv.y * 5.0 - uSpin * 1.7 + uSeed ) * 0.05 + sin( uv.x * 37.7 - uv.y * 9.0 + uTime * 4.0 ) * 0.025;
  p.xz *= 1.0 + w * smoothstep( 0.0, 0.15, uv.y );
  vN = normalize( mat3( modelMatrix ) * normal );
  vec4 wp = modelMatrix * vec4( p, 1.0 ); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WALL_FS = `
uniform float uTime, uSpin, uI, uRed, uLayer, uSeed;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float vn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float fbm( vec2 p ) { float a = 0.5, s = 0.0; for ( int i = 0; i < 4; i++ ) { s += a * vn( p ); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  // u round the funnel (wrapping), v up it; the streaks lean with the spin and rise
  float u = vUv.x, v = vUv.y;
  vec2 q = vec2( u * 7.0 - uSpin * ( 0.9 + 0.25 * uLayer ) + v * 2.2, v * 2.4 - uTime * 0.7 + uSeed );
  float n = fbm( q * vec2( 1.0, 0.55 ) );
  float streak = fbm( vec2( u * 26.0 - uSpin * 1.3 + v * 7.0, v * 1.2 + uSeed * 3.0 ) );
  // (the wrap seam: blend u with u - 1)
  float n2 = fbm( vec2( ( u - 1.0 ) * 7.0 - uSpin * ( 0.9 + 0.25 * uLayer ) + v * 2.2, v * 2.4 - uTime * 0.7 + uSeed ) * vec2( 1.0, 0.55 ) );
  n = mix( n, n2, smoothstep( 0.9, 1.0, u ) );
  float a = smoothstep( 0.48, 0.86, n * 0.75 + streak * 0.45 );
  // thicker low down, thin and frayed at the top, gone at the very bottom edge
  a *= smoothstep( 0.0, 0.08, v ) * ( 1.0 - smoothstep( 0.55, 1.0, v ) ) * ( 1.15 - 0.5 * v );
  // edge-on it is thicker (seen through more of it)
  vec3 V = normalize( cameraPosition - vW );
  float rim = 1.0 - abs( dot( V, vN ) );
  // (but the very edge fades: a hard rim drew the cone's outline)
  a *= ( 0.35 + 0.9 * rim * rim * ( 1.0 - smoothstep( 0.78, 1.0, rim ) ) ) * uI;
  vec3 dust = mix( vec3( 0.36, 0.33, 0.28 ), vec3( 0.62, 0.57, 0.49 ), streak );
  vec3 blood = mix( vec3( 0.14, 0.006, 0.008 ), vec3( 0.38, 0.03, 0.03 ), streak );
  vec3 c = mix( dust, blood, uRed * ( 0.75 + 0.25 * n ) );
  gl_FragColor = vec4( c, a * ( 0.7 - 0.15 * uLayer ) );
}`;

const PT_VS = `
attribute vec4 aP; attribute vec3 aC;
uniform float uViewH;
varying vec4 vC;
void main() {
  vec4 mv = viewMatrix * vec4( position, 1.0 );
  gl_PointSize = aP.x * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z;
  gl_Position = projectionMatrix * mv;
  vC = vec4( aC, aP.y );
}`;
const PT_FS = `
varying vec4 vC;
void main() { float d = length( gl_PointCoord - 0.5 ) * 2.0; if ( d > 1.0 ) discard; gl_FragColor = vec4( vC.rgb, vC.a * exp( -d * d * 3.2 ) ); }`;

// the track worn into the floor: a ring of dark scuffs, streaks along it
function trackTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), R = rng(31);
  g.translate(N / 2, N / 2);
  for (let i = 0; i < 1600; i++) {
    const a = R() * Math.PI * 2, r = N * (0.36 + (R() - 0.5) * 0.09 * (1 + R())), len = 0.05 + R() * 0.25;
    g.strokeStyle = `rgba(255,255,255,${0.04 + R() * 0.1})`; g.lineWidth = 1 + R() * 4;
    g.beginPath(); g.arc(0, 0, r, a, a + len); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Tornado {
  constructor(scene, center, R) {
    this.scene = scene; this.c = center.clone(); this.R = R; this.r = rng(77);
    this.group = new THREE.Group(); this.group.name = 'tornado';
    this.group.position.copy(center); this.group.position.y = 0;
    scene.add(this.group);
    // the wall of wind
    this.walls = [];
    for (let k = 0; k < 3; k++) {
      const rb = R * (0.88 + 0.16 * k), rt = R * (1.35 + 0.35 * k), h = 3.0 + 0.5 * k;
      const g = new THREE.CylinderGeometry(rt, rb, h, 64, 16, true);
      g.translate(0, h / 2, 0);
      const U = { uTime: { value: 0 }, uSpin: { value: 0 }, uI: { value: 0 }, uRed: { value: 0 }, uLayer: { value: k }, uSeed: { value: k * 3.7 } };
      const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 13 - k; m.frustumCulled = false; m.userData.noGTAO = true; m.userData.noAO = true;
      this.group.add(m); this.walls.push({ m, U });
    }
    // particles: [r, theta, y, kind(0 dust, 1 blood), size, alpha, life, age]
    this.N = 1400;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.N * 3); this.aP = new Float32Array(this.N * 4); this.aC = new Float32Array(this.N * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aP', new THREE.BufferAttribute(this.aP, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aC', new THREE.BufferAttribute(this.aC, 3).setUsage(THREE.DynamicDrawUsage));
    this.ptU = { uViewH: { value: 900 } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.ptU, vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false; this.points.renderOrder = 12; this.points.userData.noGTAO = true; this.points.userData.noAO = true;
    scene.add(this.points);
    this.ps = [];
    // debris: dry leaves, paper scraps, grit (tumbling planes)
    const dg = new THREE.PlaneGeometry(1, 1);
    this.debrisMat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide, vertexColors: false });
    this.debris = new THREE.InstancedMesh(dg, this.debrisMat, 140);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.frustumCulled = false; this.debris.castShadow = false; this.debris.userData.noGTAO = true;
    const cols = [new THREE.Color(0.32, 0.2, 0.08), new THREE.Color(0.45, 0.32, 0.12), new THREE.Color(0.85, 0.83, 0.78), new THREE.Color(0.3, 0.3, 0.3), new THREE.Color(0.2, 0.25, 0.1)];
    this.ds = [];
    for (let i = 0; i < 140; i++) {
      const R0 = this.r;
      this.debris.setColorAt(i, cols[i % cols.length]);
      this.ds.push({ r: R * (0.8 + 0.6 * R0()), th: R0() * Math.PI * 2, y: R0() * 2.4, s: 0.015 + R0() * 0.04, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(R0() * 6, R0() * 6, R0() * 6)), w: new THREE.Vector3(R0() - 0.5, R0() - 0.5, R0() - 0.5).multiplyScalar(14), up: 0.3 + R0() * 0.8, on: false });
    }
    this.debris.count = 0;
    scene.add(this.debris);
    // the track on the floor
    const tg = new THREE.PlaneGeometry(R * 2.9, R * 2.9); tg.rotateX(-Math.PI / 2);
    this.trackMat = new THREE.MeshStandardMaterial({ color: 0x0b0a09, alphaMap: trackTexture(), transparent: true, opacity: 0, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.track = new THREE.Mesh(tg, this.trackMat);
    this.track.position.set(center.x, 0.0012, center.z); this.track.renderOrder = 2; this.track.userData.noGTAO = true; this.track.receiveShadow = true;
    scene.add(this.track);
    this.I = 0; this.red = 0; this.spin = 0; this.time = 0; this.w = 0;
  }

  // one frame: I (0..1) how strong, w the runner's angular speed (rad/s), red (0..1) how much blood it has taken up
  step(I, w, red, wear) {
    const dt = 1 / 60, R = this.R, rand = this.r;
    this.I = I; this.red = red; this.w = w; this.time += dt; this.spin += w * dt / (Math.PI * 2) * 0.55;
    // new particles while it blows
    const want = Math.round(I * 34);
    for (let i = 0; i < want && this.ps.length < this.N; i++) {
      const blood = rand() < red * 0.65;
      this.ps.push({ r: R * (blood ? 0.35 + 0.9 * rand() : 0.75 + 0.55 * rand()), th: rand() * Math.PI * 2, y: blood ? 0.4 + rand() * 1.4 : rand() * rand() * 1.2,
        kind: blood ? 1 : 0, s: blood ? 0.015 + rand() * 0.05 : 0.06 + rand() * 0.22, a: blood ? 0.55 + rand() * 0.3 : 0.06 + rand() * 0.1, life: 1.2 + rand() * 1.6, age: 0, up: 0.3 + rand() * 0.9, wm: 0.7 + rand() * 0.5 });
    }
    let n = 0;
    for (const p of this.ps) {
      p.age += dt;
      if (p.age >= p.life) continue;
      // the rotation, faster near the runner's circle; rising, spreading outwards as it goes up
      p.th += w * p.wm * dt * (0.55 + 0.45 * Math.exp(-Math.abs(p.r - R) * 2.5));
      p.y += p.up * dt * (0.4 + I);
      if (p.kind !== 2) p.r += (0.06 + 0.12 * p.y / 3) * dt * (p.kind ? 0.6 : 1);
      this.ps[n++] = p;
    }
    this.ps.length = n;
    // debris: picked up as it gets going, carried round and up, tumbling
    const nd = Math.floor(I * this.ds.length);
    for (let i = 0; i < this.ds.length; i++) {
      const d = this.ds[i];
      if (i >= nd) continue;
      d.on = true;
      d.th += w * 0.85 * dt; d.y += d.up * dt * 0.6; if (d.y > 2.8) d.y = 0.05;
      d.q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(d.w.x, d.w.y, d.w.z).normalize(), d.w.length() * dt));
    }
    this.trackMat.opacity = Math.min(0.75, wear * 0.75);
  }

  draw(viewH) {
    const c = this.c;
    for (const W of this.walls) { W.U.uTime.value = this.time; W.U.uSpin.value = this.spin; W.U.uI.value = this.I; W.U.uRed.value = this.red; W.m.visible = this.I > 0.002; }
    this.ptU.uViewH.value = viewH || 900;
    const dust = [0.5, 0.46, 0.4], blood = [0.3, 0.015, 0.02], smoke = [0.42, 0.42, 0.43];
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i], k = p.age / p.life;
      this.pos[i * 3] = c.x + Math.sin(p.th) * p.r; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = c.z + Math.cos(p.th) * p.r;
      this.aP[i * 4] = p.s * (1 + k * (p.kind ? 0.5 : 1.5)); this.aP[i * 4 + 1] = p.a * Math.min(1, k * 6) * (1 - k);
      const col = p.kind === 1 ? blood : p.kind === 2 ? smoke : dust;
      this.aC.set(col, i * 3);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.ps.length);
    for (const k of ['position', 'aP', 'aC']) g.attributes[k].needsUpdate = true;
    const m = new THREE.Matrix4(), s = new THREE.Vector3();
    let n = 0;
    for (const d of this.ds) {
      if (!d.on) continue;
      m.compose(new THREE.Vector3(c.x + Math.sin(d.th) * d.r, d.y, c.z + Math.cos(d.th) * d.r), d.q, s.setScalar(d.s));
      this.debris.setMatrixAt(n++, m);
    }
    this.debris.count = n;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group, this.points, this.debris, this.track);
    for (const W of this.walls) { W.m.geometry.dispose(); W.m.material.dispose(); }
    this.points.geometry.dispose(); this.points.material.dispose();
    this.debris.geometry.dispose(); this.debrisMat.dispose(); this.debris.dispose?.();
    this.track.geometry.dispose(); this.trackMat.alphaMap?.dispose(); this.trackMat.dispose();
  }
}

// Afterimages: k copies of a fighter's meshes on his own skeleton, each turned back round the circle's centre by its
// share of the arc he has just run, see-through and fading
export class Afterimages {
  constructor(scene, ch, k = 5) {
    this.scene = scene; this.groups = []; this.mats = [];
    const parts = Object.values(ch.meshes).filter((m) => m.isSkinnedMesh && !m.material.transparent && !/eye|cornea|lash|teeth|beard/i.test(m.name));
    for (let i = 0; i < k; i++) {
      const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.visible = false;
      for (const mesh of parts) {
        const mt = mesh.material.clone();
        if (mesh.material.defines) mt.defines = { ...mesh.material.defines };
        mt.onBeforeCompile = mesh.material.onBeforeCompile; mt.customProgramCacheKey = mesh.material.customProgramCacheKey;
        mt.userData = { ...mesh.material.userData };
        mt.transparent = true; mt.depthWrite = false; mt.opacity = 0.5;
        const c = new THREE.SkinnedMesh(mesh.geometry, mt);
        c.bindMode = THREE.DetachedBindMode; c.bind(ch.skeleton, new THREE.Matrix4()); c.bindMatrixInverse.identity();
        c.frustumCulled = false; c.castShadow = false; c.renderOrder = 5; c.userData.noGTAO = true;
        grp.add(c); this.mats.push(mt);
      }
      scene.add(grp); this.groups.push(grp);
    }
  }
  // center: the circle's centre; dth: the angle between afterimages (rad, behind him); a: their opacity (0 hidden)
  draw(center, dth, a) {
    const m = new THREE.Matrix4(), T = new THREE.Matrix4(), Ti = new THREE.Matrix4();
    T.makeTranslation(center.x, 0, center.z); Ti.makeTranslation(-center.x, 0, -center.z);
    this.groups.forEach((g, i) => {
      const k = i + 1;
      g.visible = a > 0.01;
      if (!g.visible) return;
      g.matrix.copy(T).multiply(m.makeRotationY(-dth * k)).multiply(Ti);
      g.matrixWorldNeedsUpdate = true; g.updateMatrixWorld(true);
      const op = a * Math.pow(0.68, k);
      for (const c of g.children) c.material.opacity = op;
    });
  }
  dispose() { for (const g of this.groups) this.scene.remove(g); for (const m of this.mats) m.dispose(); }
}
