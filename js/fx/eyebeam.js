// Orión's eye beams and the fire they start (his PUÑETALITY, js/fight/fatality.js): drawn only.
//  EyeBeams: the two beams from his eyes to a point (white-hot cores in a red glow, rippling along), the flares at his
//    eyes and where they strike, the red scanning fan he sweeps over the loser first, the charge (sparks of light
//    drawn into his eyes)
//  Sprites: camera-facing quads (instanced) for flames (standing up, additive), smoke (soft, dark), embers and sparks
//    (small, bright, falling or rising), each with its own life
//  AshPile: what is left: a mound of grey ash with embers glowing in it, smoking
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3();

// ------------------------------------------------------------------ the beams
const BEAM_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 ); }`;
const BEAM_FS = `varying vec2 vUv; uniform float uI, uTime, uLen;
  float h( float x ) { return fract( sin( x * 91.7 ) * 43758.5 ); }
  float n( float x ) { float i = floor( x ), f = fract( x ); return mix( h( i ), h( i + 1.0 ), f * f * ( 3.0 - 2.0 * f ) ); }
  void main() {
    float x = vUv.y * 2.0 - 1.0, along = vUv.x * uLen;
    float wob = 0.85 + 0.3 * n( along * 6.0 - uTime * 40.0 ) ;
    float core = exp( -x * x / ( 0.012 * wob ) );
    float glow = exp( -x * x / ( 0.22 * wob ) ) * ( 0.6 + 0.4 * n( along * 2.0 - uTime * 25.0 ) );
    // (it fades in from his eye over the first few centimetres)
    float ends = smoothstep( 0.0, 0.03, vUv.x );
    vec3 c = vec3( 1.0, 0.07, 0.02 ) * glow * 1.6 + vec3( 1.0, 0.85, 0.75 ) * core * 2.4;
    gl_FragColor = vec4( c * uI * ends, 1.0 );
  }`;
const FLARE_FS = `varying vec2 vUv; uniform float uI, uTime, uRot;
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length( p );
    float a = atan( p.y, p.x ) + uRot;
    float rays = pow( abs( cos( a * 3.0 ) ), 40.0 ) * exp( -r * 2.2 ) + pow( abs( cos( a * 3.0 + 0.52 ) ), 60.0 ) * exp( -r * 3.5 ) * 0.6;
    float g = exp( -r * r * 9.0 ), core = exp( -r * r * 90.0 );
    vec3 c = vec3( 1.0, 0.1, 0.03 ) * ( g * 1.3 + rays * 1.1 ) + vec3( 1.0, 0.9, 0.85 ) * core * 2.5;
    gl_FragColor = vec4( c * uI * ( 1.0 - smoothstep( 0.8, 1.0, r ) ), 1.0 );
  }`;
const FAN_FS = `varying vec2 vUv; uniform float uI, uTime;
  void main() {
    // the scanning sheet: faint near his eyes, brighter towards its far edge (the line it draws), scan lines across it
    float edge = smoothstep( 0.8, 1.0, vUv.x ), body = vUv.x * 0.25;
    float lines = 0.7 + 0.3 * sin( vUv.y * 80.0 - uTime * 10.0 );
    float side = smoothstep( 0.0, 0.08, vUv.y ) * smoothstep( 1.0, 0.92, vUv.y );
    gl_FragColor = vec4( vec3( 1.0, 0.08, 0.04 ) * ( body * lines + edge * 2.0 ) * side * uI, 1.0 );
  }`;
function quad() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; }
function addMat(fs, U) { return new THREE.ShaderMaterial({ uniforms: U, vertexShader: BEAM_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }); }

export class EyeBeams {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.beams = [0, 1].map(() => { const U = { uI: { value: 0 }, uTime: { value: 0 }, uLen: { value: 1 } }; const m = new THREE.Mesh(quad(), addMat(BEAM_FS, U)); m.frustumCulled = false; m.renderOrder = 6; this.group.add(m); return { m, U }; });
    this.flares = [0, 1, 2].map(() => { const U = { uI: { value: 0 }, uTime: { value: 0 }, uRot: { value: Math.random() * 3 } }; const m = new THREE.Mesh(quad(), addMat(FLARE_FS, U)); m.frustumCulled = false; m.renderOrder = 7; this.group.add(m); return { m, U }; });
    const FU = { uI: { value: 0 }, uTime: { value: 0 } };
    this.fan = { m: new THREE.Mesh(quad(), addMat(FAN_FS, FU)), U: FU }; this.fan.m.frustumCulled = false; this.fan.m.renderOrder = 5; this.group.add(this.fan.m);
    // the light the beams throw (made now, so that no shader has to be built again when it comes on)
    this.light = new THREE.PointLight(new THREE.Color(1.0, 0.18, 0.06), 0, 6, 1.6); this.group.add(this.light);
  }
  // a ribbon from a to b, w wide, turned to face the camera
  ribbon(mesh, a, b, w, cam) {
    _d.subVectors(b, a); const len = _d.length(); _d.normalize();
    _c.subVectors(cam.position, a).normalize();
    _s.crossVectors(_d, _c).normalize().multiplyScalar(w / 2);
    const p = mesh.geometry.attributes.position;
    p.setXYZ(0, a.x - _s.x, a.y - _s.y, a.z - _s.z); p.setXYZ(1, b.x - _s.x, b.y - _s.y, b.z - _s.z);
    p.setXYZ(2, b.x + _s.x, b.y + _s.y, b.z + _s.z); p.setXYZ(3, a.x + _s.x, a.y + _s.y, a.z + _s.z);
    p.needsUpdate = true; mesh.geometry.computeBoundingSphere();
    return len;
  }
  // a square of side s at p, facing the camera
  billboard(mesh, p, s, cam) {
    _c.set(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(s / 2); _s.set(0, 1, 0).applyQuaternion(cam.quaternion).multiplyScalar(s / 2);
    const q = mesh.geometry.attributes.position;
    q.setXYZ(0, p.x - _c.x - _s.x, p.y - _c.y - _s.y, p.z - _c.z - _s.z); q.setXYZ(1, p.x + _c.x - _s.x, p.y + _c.y - _s.y, p.z + _c.z - _s.z);
    q.setXYZ(2, p.x + _c.x + _s.x, p.y + _c.y + _s.y, p.z + _c.z + _s.z); q.setXYZ(3, p.x - _c.x + _s.x, p.y - _c.y + _s.y, p.z - _c.z + _s.z);
    q.needsUpdate = true; mesh.geometry.computeBoundingSphere();
  }
  // eyes: [left, right] world points; target: where the beams strike; I: the beams (0..1); glow: the eyes' flares (0..1,
  // more while charging); fan: the scan {I, top, bottom, width} or null; cam: the camera; time: seconds
  draw({ eyes, target, I = 0, glow = 0, impact = 0, fan = null, cam, time = 0 }) {
    for (let k = 0; k < 2; k++) {
      const B = this.beams[k];
      B.m.visible = I > 0.001;
      if (B.m.visible) { B.U.uLen.value = this.ribbon(B.m, eyes[k], target, 0.05 + 0.03 * I, cam); B.U.uI.value = I; B.U.uTime.value = time; }
      const F = this.flares[k];
      F.m.visible = glow > 0.001;
      if (F.m.visible) { this.billboard(F.m, eyes[k], 0.12 + 0.3 * glow, cam); F.U.uI.value = glow; F.U.uRot.value = time * 0.7 + k; }
    }
    const H = this.flares[2];
    H.m.visible = impact > 0.001;
    if (H.m.visible) { this.billboard(H.m, target, 0.22 + 0.22 * impact, cam); H.U.uI.value = impact * 0.6; H.U.uRot.value = -time * 1.3; }
    this.light.intensity = 6 * Math.max(I, glow * 0.4);
    if (I > 0.001) this.light.position.copy(target).lerp(eyes[0], 0.2); else this.light.position.copy(eyes[0]);
    const Fm = this.fan.m;
    Fm.visible = !!fan && fan.I > 0.001;
    if (Fm.visible) {
      // a sheet from between his eyes to a horizontal line across the loser
      _a.addVectors(eyes[0], eyes[1]).multiplyScalar(0.5);
      const p = Fm.geometry.attributes.position, w = fan.width / 2, sd = fan.side;
      p.setXYZ(0, _a.x - sd.x * 0.01, _a.y, _a.z - sd.z * 0.01); p.setXYZ(1, fan.at.x - sd.x * w, fan.at.y, fan.at.z - sd.z * w);
      p.setXYZ(2, fan.at.x + sd.x * w, fan.at.y, fan.at.z + sd.z * w); p.setXYZ(3, _a.x + sd.x * 0.01, _a.y, _a.z + sd.z * 0.01);
      p.needsUpdate = true; Fm.geometry.computeBoundingSphere();
      // (uv: x from his eyes to the line; y across)
      const uv = Fm.geometry.attributes.uv; uv.setXY(0, 0, 0); uv.setXY(1, 1, 0); uv.setXY(2, 1, 1); uv.setXY(3, 0, 1); uv.needsUpdate = true;
      this.fan.U.uI.value = fan.I; this.fan.U.uTime.value = time;
    }
  }
  // (shown, invisible to the eye, for the first frames: their shaders are built behind the move's moment of black)
  warm(cam) {
    for (const o of [...this.beams, ...this.flares, this.fan]) { o.m.visible = true; o.U.uI.value = 0; }
    for (const b of this.beams) this.ribbon(b.m, _a.set(0, 1, 0), _b.set(0, 1.1, 0.1), 0.01, cam);
    for (const f of this.flares) this.billboard(f.m, _a.set(0, 1, 0), 0.01, cam);
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
}

// ------------------------------------------------------------------ sprites: flames, smoke, embers
const SPR_VS = `attribute vec3 iPos; attribute vec4 iData; uniform float uUpright; varying vec2 vUv; varying vec4 vD;
  void main() {
    vUv = uv; vD = iData;
    float s = iData.x;
    vec3 R = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
    vec3 U = mix( vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] ), vec3( 0.0, 1.0, 0.0 ), uUpright );
    // (flames stand up, taller than wide, their foot at the point)
    vec2 o = position.xy * vec2( s, s * ( 1.0 + uUpright * 0.9 ) ) + vec2( 0.0, uUpright * s * 0.75 );
    gl_Position = projectionMatrix * viewMatrix * vec4( iPos + R * o.x + U * o.y, 1.0 );
  }`;
const SPR_NOISE = `float sH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
  float sN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( sH( i ), sH( i + vec2( 1, 0 ) ), f.x ), mix( sH( i + vec2( 0, 1 ) ), sH( i + vec2( 1, 1 ) ), f.x ), f.y ); }`;
const FS = {
  // iData: size, age 0..1, seed, brightness
  fire: `varying vec2 vUv; varying vec4 vD; uniform float uTime; ${SPR_NOISE}
    void main() {
      float t = vD.y, sd = vD.z;
      vec2 p = vUv;
      float n = sN( vec2( p.x * 2.5 + sd * 10.0, p.y * 2.2 - uTime * 2.6 - sd * 5.0 ) ) * 0.55 + sN( vec2( p.x * 6.0 - sd * 3.0, p.y * 5.0 - uTime * 4.5 ) ) * 0.3 + sN( vec2( p.x * 13.0, p.y * 11.0 - uTime * 7.0 ) ) * 0.15;
      // a soft tongue of flame: a rounded foot, licking up and thinning, its outline torn and flickering
      float y = p.y + ( n - 0.5 ) * 0.3;
      float w = mix( 0.46, 0.06, pow( clamp( y, 0.0, 1.0 ), 1.2 ) ) * ( 0.7 + 0.6 * n );
      float dx = abs( p.x - 0.5 + ( n - 0.5 ) * 0.35 * p.y );
      float shape = ( 1.0 - smoothstep( w * 0.15, w, dx ) ) * smoothstep( 0.0, 0.18, p.y ) * ( 1.0 - smoothstep( 0.35 + 0.45 * n, 1.0, p.y ) );
      shape *= 0.55 + 0.45 * n;
      float heat = shape * ( 1.0 - t * 0.9 ) * ( 1.0 - p.y * 0.7 );
      vec3 c = mix( vec3( 0.55, 0.05, 0.0 ), vec3( 1.0, 0.33, 0.04 ), smoothstep( 0.05, 0.4, heat ) );
      c = mix( c, vec3( 1.0, 0.68, 0.22 ), smoothstep( 0.4, 0.75, heat ) );
      c = mix( c, vec3( 1.0, 0.9, 0.65 ), smoothstep( 0.85, 1.0, heat ) );
      float a = shape * smoothstep( 0.0, 0.15, t ) * ( 1.0 - smoothstep( 0.5, 1.0, t ) ) * vD.w;
      gl_FragColor = vec4( c * a * 1.1, a );
    }`,
  smoke: `varying vec2 vUv; varying vec4 vD; uniform float uTime; ${SPR_NOISE}
    void main() {
      float t = vD.y, sd = vD.z;
      vec2 p = vUv - 0.5; float r = length( p );
      float n = sN( vUv * 3.0 + sd * 13.0 + vec2( 0.0, -uTime * 0.3 ) ) * 0.6 + sN( vUv * 7.0 - sd * 5.0 ) * 0.4;
      float a = ( 1.0 - smoothstep( 0.15, 0.5, r + ( n - 0.5 ) * 0.25 ) ) * smoothstep( 0.0, 0.15, t ) * ( 1.0 - smoothstep( 0.4, 1.0, t ) ) * vD.w;
      gl_FragColor = vec4( vec3( 0.05, 0.045, 0.045 ) + vec3( 0.06, 0.03, 0.01 ) * ( 1.0 - t ), a * 0.55 );
    }`,
  ember: `varying vec2 vUv; varying vec4 vD; uniform float uTime;
    void main() {
      float t = vD.y; vec2 p = vUv - 0.5; float r = length( p );
      float a = exp( -r * r * 40.0 ) * ( 1.0 - smoothstep( 0.5, 1.0, t ) ) * vD.w * ( 0.7 + 0.3 * sin( uTime * 30.0 + vD.z * 50.0 ) );
      vec3 c = mix( vec3( 1.0, 0.85, 0.5 ), vec3( 1.0, 0.25, 0.03 ), t );
      gl_FragColor = vec4( c * a * 2.0, a );
    }`,
};
export class Sprites {
  constructor(scene, kind, N) {
    this.kind = kind; this.N = N; this.scene = scene;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = this.geo = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(N * 3); this.data = new Float32Array(N * 4);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3)); g.setAttribute('iData', new THREE.InstancedBufferAttribute(this.data, 4));
    g.instanceCount = 0;
    this.U = { uTime: { value: 0 }, uUpright: { value: kind === 'fire' ? 1 : 0 } };
    const add = kind !== 'smoke';
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: SPR_VS, fragmentShader: FS[kind], transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = kind === 'smoke' ? 4 : 5;
    scene.add(this.mesh);
    this.ps = [];
  }
  // p: where; v: velocity; s: size; life: seconds; o: { grow, up (buoyancy), drag, grav, bright, swirl }
  emit(p, v, s, life, o = {}) {
    if (this.ps.length >= this.N) return;
    this.ps.push({ p: p.clone(), v: v.clone(), s, s0: s, life, age: 0, seed: Math.random(), grow: o.grow ?? 1, up: o.up ?? 0, drag: o.drag ?? 0.5, grav: o.grav ?? 0, bright: o.bright ?? 1, swirl: o.swirl ?? 0, floor: o.floor ?? -100 });
  }
  step(dt) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.age += dt; if (q.age >= q.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      q.v.y += (q.up - q.grav) * dt;
      q.v.multiplyScalar(Math.max(0, 1 - q.drag * dt));
      if (q.swirl) { q.v.x += Math.sin(q.age * 7 + q.seed * 30) * q.swirl * dt; q.v.z += Math.cos(q.age * 6 + q.seed * 20) * q.swirl * dt; }
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.floor) { q.p.y = q.floor; q.v.y = Math.abs(q.v.y) * 0.3; q.v.x *= 0.5; q.v.z *= 0.5; }
      q.s = q.s0 * (1 + (q.grow - 1) * (q.age / q.life));
    }
  }
  draw(time) {
    const ps = this.ps, n = Math.min(ps.length, this.N);
    for (let i = 0; i < n; i++) { const q = ps[i]; this.pos[i * 3] = q.p.x; this.pos[i * 3 + 1] = q.p.y; this.pos[i * 3 + 2] = q.p.z; this.data.set([q.s, q.age / q.life, q.seed, q.bright], i * 4); }
    this.geo.instanceCount = n;
    this.geo.attributes.iPos.needsUpdate = true; this.geo.attributes.iData.needsUpdate = true;
    this.U.uTime.value = time;
  }
  // (one of each, invisible, for the first frames: the shader is built behind the black)
  warm() { this.emit(new THREE.Vector3(0, -50, 0), new THREE.Vector3(), 0.01, 0.2); }
  clear() { this.ps.length = 0; this.geo.instanceCount = 0; }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.mesh.material.dispose(); }
}

// ------------------------------------------------------------------ the ash pile
export class AshPile {
  constructor(scene, at) {
    this.scene = scene;
    const g = new THREE.SphereGeometry(0.5, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const n = 1 + 0.18 * Math.sin(a * 3 + 1.3) + 0.1 * Math.sin(a * 7 + 0.4) + 0.06 * Math.sin(a * 13);
      p.setXYZ(i, x * n * 1.25, y * (0.42 + 0.12 * Math.sin(a * 5)), z * n);
    }
    g.computeVertexNormals();
    // (embers in it: a speckled emissive map)
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i++) { const r = 1 + Math.random() * 4; x.fillStyle = `rgba(255,${80 + Math.random() * 120 | 0},20,${0.5 + Math.random() * 0.5})`; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, r, 0, 6.3); x.fill(); }
    const em = new THREE.CanvasTexture(c); em.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 1, metalness: 0, emissive: new THREE.Color(1, 0.5, 0.2), emissiveMap: em, emissiveIntensity: 0 });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.position.copy(at).setY(0); this.mesh.scale.setScalar(0.001); this.mesh.receiveShadow = true; this.mesh.castShadow = true;
    scene.add(this.mesh);
  }
  set(grow, embers) { this.mesh.scale.setScalar(Math.max(0.001, grow)); this.mat.emissiveIntensity = embers * 2.2; this.mesh.visible = grow > 0.002; }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.emissiveMap.dispose(); this.mat.dispose(); }
}
