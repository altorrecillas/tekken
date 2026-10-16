// Particle effects: impact sparks (streaks + glow), flashes, shockwave rings, dust, sweat.
import * as THREE from 'three';

const MAXP = 1500;
const MAXS = 600;

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
function smokeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}
// impact star: a hot core with a few long, thin spikes (reads as a camera flare on heavy hits)
function starTex() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); const img = g.createImageData(n, n);
  const spikes = [0.0, 0.8, 1.57, 2.2, 3.14, 3.9, 4.71, 5.5];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) / (n / 2) - 1, dy = (y + 0.5) / (n / 2) - 1, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    let v = Math.exp(-r * r * 60) + Math.exp(-r * 6) * 0.25;
    for (let k = 0; k < spikes.length; k++) {
      let d = Math.abs(((a - spikes[k]) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const w = k % 2 ? 0.035 : 0.06, len = k % 2 ? 0.55 : 1.0;
      v += Math.exp(-((d / w) ** 2)) * Math.max(0, 1 - r / len) ** 2 * 0.9;
    }
    const i = (y * n + x) * 4; const q = Math.min(255, Math.round(v * 255));
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = q;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

function ringTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  // a thin shockwave band (a thick one reads as a soap bubble)
  const gr = g.createRadialGradient(64, 64, 46, 64, 64, 63);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// point sprites sized in world units against the actual render height (independent of pixel ratio / dynamic resolution)
const PT_VIEW_H = { value: 900 };
const VS = `
attribute float size; attribute float alpha; attribute vec3 pcolor; uniform float uViewH;
varying float vAlpha; varying vec3 vColor;
void main(){ vAlpha = alpha; vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * projectionMatrix[1][1] * uViewH * 0.3056 / -mv.z;
  gl_Position = projectionMatrix * mv; }`;
const FS = `
uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha); }`;

class PointPool {
  constructor(scene, tex, blending, max = MAXP, depthWrite = false) {
    this.max = max;
    this.p = []; // particles
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uViewH: PT_VIEW_H }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite, blending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }
  add(o) { if (this.p.length < this.max) this.p.push(o); }
  update(dt) {
    const P = this.p;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vel.y -= (q.grav || 0) * dt;
      q.vel.multiplyScalar(Math.exp(-(q.drag || 0) * dt));
      q.p.addScaledVector(q.vel, dt);
      if (q.floor && q.p.y < 0.01) { q.p.y = 0.01; q.vel.y *= -0.2; q.vel.x *= 0.6; q.vel.z *= 0.6; }
      const t = q.age / q.life;
      this.pos[n * 3] = q.p.x; this.pos[n * 3 + 1] = q.p.y; this.pos[n * 3 + 2] = q.p.z;
      this.size[n] = q.s0 + (q.s1 - q.s0) * t;
      this.alpha[n] = q.a0 * (q.fadeIn ? Math.min(1, t * 6) : 1) * Math.pow(1 - t, q.fadePow || 1);
      this.col[n * 3] = q.c.r; this.col[n * 3 + 1] = q.c.g; this.col[n * 3 + 2] = q.c.b;
      P[n++] = q;
    }
    P.length = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'size', 'alpha', 'pcolor']) this.geo.attributes[k].needsUpdate = true;
  }
}

class StreakPool {
  // spark streaks as camera-facing quads (GL lines are always 1 px wide): bright heads that bloom, fading tails
  constructor(scene) {
    this.max = MAXS; this.s = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXS * 4 * 3); this.col = new Float32Array(MAXS * 4 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array(MAXS * 6);
    for (let i = 0; i < MAXS; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 11;
    scene.add(this.mesh);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._d = new THREE.Vector3(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  add(o) { if (this.s.length < this.max) this.s.push(o); }
  update(dt, camera) {
    const S = this.s; let n = 0;
    const cam = camera ? camera.position : this._v.set(0, 1.5, 5);
    for (let i = 0; i < S.length; i++) {
      const q = S[i]; q.age += dt;
      if (q.age >= q.life) continue;
      q.vel.y -= 6 * dt; q.vel.multiplyScalar(Math.exp(-3.5 * dt));
      q.p.addScaledVector(q.vel, dt);
      const t = 1 - q.age / q.life;
      const head = this._a.copy(q.p), tail = this._b.copy(q.p).addScaledVector(q.vel, -q.len);
      const dir = this._d.subVectors(head, tail);
      const view = this._v.subVectors(cam, head);
      const side = this._s.crossVectors(dir, view);
      const ls = side.length();
      if (ls < 1e-9) side.set(0, 0.001, 0); else side.multiplyScalar((q.w || 0.006) * (0.4 + 0.6 * t) / ls);
      // needle: full width at the hot head, tapering to a point at the tail
      this.pos.set([head.x + side.x, head.y + side.y, head.z + side.z, head.x - side.x, head.y - side.y, head.z - side.z,
        tail.x, tail.y, tail.z, tail.x, tail.y, tail.z], n * 12);
      const c = q.c, h = t * 3, tl = t * 0.15;
      const hr = (c.r * 0.6 + 0.4) * h, hg = (c.g * 0.6 + 0.4) * h, hb = (c.b * 0.6 + 0.4) * h;
      this.col.set([hr, hg, hb, hr, hg, hb, c.r * tl, c.g * tl, c.b * tl, c.r * tl, c.g * tl, c.b * tl], n * 12);
      S[n++] = q;
    }
    S.length = n;
    this.geo.setDrawRange(0, n * 6);
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}

const _tv1 = new THREE.Vector3(), _tv2 = new THREE.Vector3(), _tv3 = new THREE.Vector3(), _tv4 = new THREE.Vector3();
// Ribbon trail that follows a limb during a strike
class Trail {
  constructor(scene, color) {
    this.max = 24;
    this.pts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 2 * 3);
    this.alpha = new Float32Array(this.max * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: color } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color * vA, vA); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    scene.add(this.mesh);
    this.life = 0;
  }
  push(p, t) {
    this.pts.unshift({ p: p.clone(), t });
    if (this.pts.length > this.max) this.pts.pop();
  }
  build(camera, now, fade) {
    const n = this.pts.length;
    if (n === 0) return;
    const cam = camera.position;
    const dir = _tv1, view = _tv2, side = _tv3, prev = _tv4;
    let havePrev = false;
    for (let i = 0; i < this.max; i++) {
      const k = Math.min(i, n - 1);
      const cur = this.pts[k].p;
      // central difference along the path; keep the ribbon's side orientation continuous so it never twists
      dir.subVectors(this.pts[Math.max(k - 1, 0)].p, this.pts[Math.min(k + 1, n - 1)].p);
      view.subVectors(cam, cur);
      side.crossVectors(dir, view);
      if (side.lengthSq() < 1e-12) { if (havePrev) side.copy(prev); else side.set(0, 1, 0); }
      side.normalize();
      if (havePrev && side.dot(prev) < 0) side.negate();
      prev.copy(side); havePrev = true;
      const age = now - this.pts[k].t;
      const f = 1 - i / this.max;
      const a = Math.max(0, 1 - age / 0.12) * f * f * fade;
      const w = 0.045 * Math.sqrt(f) + 0.004;
      this.pos.set([cur.x + side.x * w, cur.y + side.y * w, cur.z + side.z * w, cur.x - side.x * w, cur.y - side.y * w, cur.z - side.z * w], i * 6);
      this.alpha[i * 2] = a * 0.5; this.alpha[i * 2 + 1] = a * 0.5;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

export function setFxViewHeight(h) { PT_VIEW_H.value = h; }

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.glow = new PointPool(scene, softTex(), THREE.AdditiveBlending);
    this.stars = new PointPool(scene, starTex(), THREE.AdditiveBlending, 32);
    this.smoke = new PointPool(scene, smokeTex(), THREE.NormalBlending, 400);
    this.streaks = new StreakPool(scene);
    this.rings = [];
    this.ringMat = new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flashLight = new THREE.PointLight(0xffc28a, 0, 4, 2);
    scene.add(this.flashLight);
    this.koFlashT = 0;
    this.screenFlash = 0;
    this.trails = [];
    this.clock = 0;
  }

  trail(fighter, limb, duration, color = new THREE.Color(0.9, 0.95, 1.0)) {
    this.trails.push({ fighter, limb, t0: this.clock, dur: duration, tr: new Trail(this.scene, color) });
  }

  // One spark, ring, dust cloud, swoosh and sweat spray far below the stage while a fight loads: the first of each
  // compiled its shaders on the spot in the middle of the fight (a stutter on a phone, and online a phone stuck
  // for a moment makes the other one wait for it)
  warmup() {
    const p = new THREE.Vector3(0, -60, 0);
    this.hitSpark(p, true, true, null, null);
    this.hitSpark(p, false, false, null, null);
    this.blockSpark(p);
    this.dust(p, 1);
    this.sweat(p, 2);
    const tr = new Trail(this.scene, new THREE.Color(0.9, 0.95, 1.0));
    tr.push(p, this.clock); tr.push(p.clone().setX(0.3), this.clock);
    this.trails.push({ fighter: null, limb: null, t0: this.clock, dur: 0, tr });
    for (const r of this.rings) r.m.frustumCulled = false; // (drawn although out of sight: that is when it compiles)
  }

  updateTrails() {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const T = this.trails[i];
      const age = this.clock - T.t0;
      if (age > T.dur + 0.2) { T.tr.dispose(this.scene); this.trails.splice(i, 1); continue; }
      if (age <= T.dur && T.fighter) {
        const b = T.fighter.ch.bones[T.limb.bone];
        if (b) { const p = new THREE.Vector3(); b.getWorldPosition(p); T.tr.push(p, this.clock); }
      }
      T.tr.build(this.camera, this.clock, 1);
    }
  }

  hitSpark(p, heavy, ch, victim, attacker) {
    const col = ch ? new THREE.Color(1.0, 0.35, 0.12) : heavy ? new THREE.Color(1.0, 0.72, 0.35) : new THREE.Color(1.0, 0.9, 0.7);
    // fewer, thinner needles sprayed in a cone through the victim (a uniform sphere of flat quads reads as clip art)
    const n = heavy ? 16 : 10;
    const hd = new THREE.Vector3();
    if (attacker && victim) { hd.subVectors(victim.pos, attacker.pos).setY(0); if (hd.lengthSq() > 1e-6) hd.normalize(); }
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3().randomDirection().multiplyScalar(0.6).addScaledVector(hd, 0.8).normalize();
      const sp = (heavy ? 7 : 5) * (0.5 + Math.random());
      this.streaks.add({ p: p.clone(), vel: d.multiplyScalar(sp), age: 0, life: 0.14 + Math.random() * 0.2, c: col, len: 0.03 + Math.random() * 0.03, w: heavy ? 0.005 : 0.0035 });
    }
    // core flash
    this.glow.add({ p: p.clone(), vel: new THREE.Vector3(), age: 0, life: heavy ? 0.14 : 0.09, s0: heavy ? 0.6 : 0.4, s1: heavy ? 1.1 : 0.7, a0: 1, c: new THREE.Color(1.6, 1.3, 1.0), fadePow: 1.6 });
    if (heavy || ch) this.stars.add({ p: p.clone(), vel: new THREE.Vector3(), age: 0, life: ch ? 0.14 : 0.1, s0: ch ? 1.5 : 1.1, s1: ch ? 2.4 : 1.7, a0: 1, c: ch ? new THREE.Color(1.8, 0.9, 0.5) : new THREE.Color(1.6, 1.35, 1.0) });
    // coloured halo: brief and fading fast, so it never lingers as a flat disc over the bodies
    this.glow.add({ p: p.clone(), vel: new THREE.Vector3(), age: 0, life: heavy ? 0.18 : 0.12, s0: 0.25, s1: heavy ? 1.0 : 0.6, a0: 0.28, c: col, fadePow: 2.4 });
    for (let i = 0; i < (heavy ? 10 : 5); i++) {
      this.glow.add({ p: p.clone(), vel: new THREE.Vector3().randomDirection().multiplyScalar(1 + Math.random() * 2), age: 0, life: 0.25 + Math.random() * 0.2,
        s0: 0.12, s1: 0.02, a0: 0.9, c: col, drag: 4 });
    }
    // sweat droplets from the victim
    // sweat sprays off the face, not out of the crown
    if (victim && heavy) this.sweat(victim.boneWorld('head').add(new THREE.Vector3(Math.sin(victim.yaw) * 0.1, 0.03, Math.cos(victim.yaw) * 0.1)), 10);
    if (heavy) this.ring(p, ch ? 1.2 : 0.9, col);
    // the flash sits a little in front of the contact (towards the lens) so it grazes both bodies instead of
    // blowing out the cloth it touches
    this.flashLight.position.copy(p).addScaledVector(_tv1.subVectors(this.camera.position, p).normalize(), 0.45);
    this.flashLight.intensity = heavy ? 6 : 3;
    this.flashLight.color.copy(col);
  }

  blockSpark(p) {
    const col = new THREE.Color(0.55, 0.8, 1.0);
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Vector3().randomDirection();
      this.streaks.add({ p: p.clone(), vel: d.multiplyScalar(3 + Math.random() * 3), age: 0, life: 0.12 + Math.random() * 0.15, c: col, len: 0.012 });
    }
    this.glow.add({ p: p.clone(), vel: new THREE.Vector3(), age: 0, life: 0.1, s0: 0.35, s1: 0.6, a0: 0.8, c: new THREE.Color(0.8, 1.0, 1.3), fadePow: 1.6 });
    this.ring(p, 0.5, col);
  }

  ring(p, size, col) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ringMat.clone());
    m.material.color.copy(col);
    m.position.copy(p);
    m.renderOrder = 12;
    this.scene.add(m);
    this.rings.push({ m, age: 0, life: 0.22, size });
  }

  sweat(p, n) {
    // droplets as short motion-stretched glints (not discs): thin streaks along the velocity, dim and cool
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2.6, Math.random() * 2.2 + 0.3, (Math.random() - 0.5) * 2.6);
      const q = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.1));
      this.streaks.add({ p: q, vel: v, age: 0, life: 0.3 + Math.random() * 0.25, c: new THREE.Color(0.11, 0.125, 0.15), len: 0.012 + Math.random() * 0.01, w: 0.0018 });
    }
  }

  dust(pos, amt = 1) {
    const n = Math.round(14 * amt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.4;
      const p = new THREE.Vector3(pos.x + Math.cos(a) * r * 0.5, 0.05 + Math.random() * 0.1, pos.z + Math.sin(a) * r * 0.5);
      const v = new THREE.Vector3(Math.cos(a) * (0.6 + Math.random()) * amt, 0.2 + Math.random() * 0.5, Math.sin(a) * (0.6 + Math.random()) * amt);
      const dc = (this.dustColor || new THREE.Color(0.75, 0.68, 0.58)).clone().multiplyScalar(this.dustLight ?? 0.8);
      this.smoke.add({ p, vel: v, age: 0, life: 0.5 + Math.random() * 0.4, s0: 0.22, s1: 0.8 * amt, a0: 0.18, c: dc, drag: 2.4, fadeIn: true, fadePow: 1.5 });
    }
  }

  koFlash() { this.koFlashT = 1; }

  aura(f, dt) {
    // rage aura: embers rising from the body
    const bones = ['spine02', 'spine04', 'upperarm01.L', 'upperarm01.R', 'lowerarm01.L', 'lowerarm01.R', 'upperleg01.L', 'upperleg01.R', 'head', 'wrist.L', 'wrist.R'];
    const n = Math.random() < dt * 40 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const b = f.ch.bones[bones[Math.floor(Math.random() * bones.length)]];
      if (!b) continue;
      const p = new THREE.Vector3(); b.getWorldPosition(p);
      p.x += (Math.random() - 0.5) * 0.15; p.z += (Math.random() - 0.5) * 0.15;
      this.glow.add({ p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3), age: 0, life: 0.5 + Math.random() * 0.4,
        s0: 0.05 + Math.random() * 0.05, s1: 0.0, a0: 0.8, c: new THREE.Color(1.0, 0.25 + Math.random() * 0.2, 0.05), drag: 1.5 });
    }
  }

  update(dt) {
    this.clock += dt;
    this.glow.update(dt); this.stars.update(dt); this.smoke.update(dt); this.streaks.update(dt, this.camera);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); continue; }
      r.m.quaternion.copy(this.camera.quaternion);
      // fast ease-out expansion, quadratic fade
      r.m.scale.setScalar(r.size * (0.25 + 1.15 * (1 - (1 - t) * (1 - t))));
      r.m.material.opacity = (1 - t) * (1 - t) * 0.85;
    }
    this.flashLight.intensity *= Math.exp(-dt * 22);
    this.koFlashT = Math.max(0, this.koFlashT - dt * 1.5);
  }
}
