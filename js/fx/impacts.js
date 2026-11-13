// What a fight does to the stage (drawn only, from the match's events; the simulation never reads any of it):
//  - a crack in the floor where a big knockdown lands (Match.onLand, event 'crack'): a star of fractures round a
//    crushed centre, pieces of the floor thrown up and rolling to a stop, a ring of dust; it stays until the round ends
//  - a fighter slammed into a wall or a barrier (Match.wallImpact, event 'wall'): what that thing is made of answers.
//    A barrier rattles (bright chips of paint, a puff off the floor), a tree drops bark and a shower of leaves, a wall
//    takes a crack where the back met it
// The stage colours its own floor and its dust (stage.crackColor / stage.debrisColor, stage.dustColor)
import * as THREE from 'three';

const MAX_DECALS = 6, MAX_CHUNKS = 96, MAX_LEAVES = 60;

// a star of fractures round a crushed centre: dark gaps with a pale chipped lip, rings of shorter cracks, the
// crushed middle darker and grainy. Alpha is the crack, colour is ignored (the material's colour tints it)
function crackTexture(seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  // the crushed centre: grainy dark, fading out
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 70);
  gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 70, 0, 7); g.fill();
  for (let i = 0; i < 260; i++) { const a = rnd() * 6.3, r = Math.pow(rnd(), 0.7) * 62; g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.5})`; g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2 + rnd() * 4, 2 + rnd() * 4); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  // main fractures: jagged, branching, thinning out
  const paths = [];
  const branch = (x, y, a, w, len) => {
    const pts = [[x, y]];
    let d = 0;
    while (d < len) {
      const st = 9 + rnd() * 14; a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * st; y += Math.sin(a) * st; d += st; pts.push([x, y]);
      if (w > 1.6 && rnd() < 0.16) paths.push(branch(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), w * 0.55, (len - d) * (0.4 + rnd() * 0.4)));
    }
    return { pts, w };
  };
  const n = 9 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) { const a = (i + rnd() * 0.6) / n * Math.PI * 2, r0 = 18 + rnd() * 20; paths.push(branch(Math.cos(a) * r0, Math.sin(a) * r0, a, 6.5 + rnd() * 4, 120 + rnd() * 110)); }
  // rings: short arcs between the fractures, where the floor bent and broke round the impact
  for (const R of [55, 95, 140]) {
    const k = 7 + Math.floor(rnd() * 5);
    for (let i = 0; i < k; i++) {
      if (rnd() < 0.35) continue;
      const a0 = rnd() * 6.3, a1 = a0 + 0.25 + rnd() * 0.5, pts = [];
      for (let t = 0; t <= 1.001; t += 0.25) { const a = a0 + (a1 - a0) * t, r = R * (0.9 + rnd() * 0.2); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      paths.push({ pts, w: R < 60 ? 2.6 : R < 100 ? 2.0 : 1.4 });
    }
  }
  const stroke = (p, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); p.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  // (a wide soft shadow round each crack first, then the crack itself: it reads sunk into the floor)
  for (const p of paths) stroke(p, p.w * 3.2, 'rgba(255,255,255,0.16)');
  for (const p of paths) stroke(p, p.w, 'rgba(255,255,255,0.95)');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// a soft ring for the dust wave rolling out along the floor
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class ImpactFX {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx;
    this.tex = [crackTexture(0x51ed), crackTexture(0xbeef42), crackTexture(0x7a11)];
    this.ringTex = ringTexture();
    this.decals = []; this.waves = [];
    // pieces of floor, bark, paint: one instanced mesh of small rough stones, tinted per piece
    const g = new THREE.DodecahedronGeometry(1, 0);
    this.chunkMesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), MAX_CHUNKS);
    this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunkMesh.castShadow = true; this.chunkMesh.frustumCulled = false; this.chunkMesh.count = 0;
    this.chunkMesh.setColorAt(0, new THREE.Color());
    scene.add(this.chunkMesh);
    this.chunks = [];
    // leaves: small flat quads, double sided, see-sawing down
    const lg = new THREE.PlaneGeometry(0.07, 0.05);
    this.leafMesh = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: 0x5f7d32, roughness: 0.8, side: THREE.DoubleSide }), MAX_LEAVES);
    this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leafMesh.frustumCulled = false; this.leafMesh.count = 0;
    this.leafMesh.setColorAt(0, new THREE.Color());
    scene.add(this.leafMesh);
    this.leaves = [];
    this._o = new THREE.Object3D(); this._c = new THREE.Color();
  }

  // the stage changed: its colours (asked again at each crack: a stage may darken its floor when wet)
  setStage(stage) { this.stage = stage; this.clear(); }

  // the round is over: the floor is whole again
  clear() {
    for (const d of this.decals) { this.scene.remove(d.m); d.m.material.dispose(); d.m.geometry.dispose(); }
    for (const w of this.waves) { this.scene.remove(w.m); w.m.material.dispose(); w.m.geometry.dispose(); }
    this.decals = []; this.waves = []; this.chunks = []; this.leaves = [];
    this.chunkMesh.count = 0; this.leafMesh.count = 0;
  }

  // a big knockdown: the floor cracks under the body
  floorCrack(pos, power = 1) {
    const S = this.stage || {};
    const size = 1.5 + 0.9 * Math.min(1.5, power);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
      map: this.tex[Math.floor(Math.random() * this.tex.length)], color: S.crackColor ?? 0x0c0b0a, transparent: true, opacity: 0,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true,
    }));
    m.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    m.position.set(pos.x, 0.004 + this.decals.length * 0.0004, pos.z);
    m.renderOrder = 1;
    this.scene.add(m);
    this.decals.push({ m, age: 0, op: 0.94, grow: 0.12 });
    if (this.decals.length > MAX_DECALS) { const d = this.decals.shift(); this.scene.remove(d.m); d.m.material.dispose(); d.m.geometry.dispose(); }
    // pieces of the floor thrown up round the body, a ring of dust rolling out, the dust cloud
    const col = new THREE.Color(S.debrisColor ?? 0x55534f);
    const n = Math.round(14 + 10 * Math.min(1.5, power));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.15 + Math.random() * 0.45;
      const p = new THREE.Vector3(pos.x + Math.cos(a) * r, 0.03, pos.z + Math.sin(a) * r);
      const v = new THREE.Vector3(Math.cos(a) * (0.6 + Math.random() * 1.6), 1.2 + Math.random() * 2.8 * Math.min(1.3, power), Math.sin(a) * (0.6 + Math.random() * 1.6));
      this.chunk(p, v, 0.012 + Math.random() * 0.03, col.clone().multiplyScalar(0.7 + Math.random() * 0.5));
    }
    this.wave(pos, 2.2 + power);
    this.fx?.dust?.(pos, 1.5 + 0.5 * Math.min(1.5, power));
  }

  // slammed into a wall (pos: where the back met it, n: out of it)
  wall(pos, n, kind, power = 1) {
    const S = this.stage || {};
    const side = new THREE.Vector3(-n.z, 0, n.x);
    if (kind === 'barrier' || kind === 'machine') {
      // a crowd barrier (or a gym machine): the frame rattles, flakes of paint and grit jump off it, a puff of dust off the foot plate
      for (let i = 0; i < 10; i++) {
        const p = pos.clone().addScaledVector(side, (Math.random() - 0.5) * 0.6).setY(0.4 + Math.random() * 0.8);
        const v = n.clone().multiplyScalar(0.6 + Math.random() * 1.2).addScaledVector(side, (Math.random() - 0.5) * 1.6); v.y = 0.6 + Math.random() * 1.5;
        this.chunk(p, v, 0.006 + Math.random() * 0.01, this._c.setHex(Math.random() < 0.5 ? 0xb8bcc0 : 0x8c8f93).clone());
      }
      this.fx?.sparks?.(pos.clone().setY(1.0), 5, false);
      this.fx?.dust?.(pos.clone().addScaledVector(n, 0.25), 0.9);
    } else if (kind === 'tree') {
      // a plane tree: bark chips off the trunk, the canopy shakes down a shower of leaves
      for (let i = 0; i < 12; i++) {
        const p = pos.clone().addScaledVector(side, (Math.random() - 0.5) * 0.3).setY(0.6 + Math.random() * 0.9);
        const v = n.clone().multiplyScalar(0.4 + Math.random()).addScaledVector(side, (Math.random() - 0.5) * 1.8); v.y = 0.5 + Math.random() * 1.6;
        this.chunk(p, v, 0.008 + Math.random() * 0.016, this._c.setHex(Math.random() < 0.5 ? 0x6b5640 : 0xa89878).clone());
      }
      const top = pos.clone().addScaledVector(n, -0.35);
      for (let i = 0; i < 40; i++) this.leaf(new THREE.Vector3(top.x + (Math.random() - 0.5) * 3.5, 3.6 + Math.random() * 2.2, top.z + (Math.random() - 0.5) * 3.5), Math.random() * 0.6);
      this.fx?.dust?.(pos.clone().addScaledVector(n, 0.2), 0.7);
    } else {
      // masonry: a crack where the back met it, grit and dust spilling down it
      const size = 1.2 + 0.5 * Math.min(1.5, power);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
        map: this.tex[Math.floor(Math.random() * this.tex.length)], color: S.wallCrackColor ?? 0x15130f, transparent: true, opacity: 0,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.position.copy(pos).addScaledVector(n, -0.01); m.lookAt(pos.clone().add(n)); m.rotateZ(Math.random() * 6.3);
      this.scene.add(m);
      this.decals.push({ m, age: 0, op: 0.8, grow: 0.08 });
      if (this.decals.length > MAX_DECALS) { const d = this.decals.shift(); this.scene.remove(d.m); d.m.material.dispose(); d.m.geometry.dispose(); }
      const col = new THREE.Color(S.debrisColor ?? 0x8a8378);
      for (let i = 0; i < 16; i++) {
        const v = n.clone().multiplyScalar(0.5 + Math.random() * 1.2).addScaledVector(side, (Math.random() - 0.5) * 1.6); v.y = Math.random() * 1.2;
        this.chunk(pos.clone(), v, 0.01 + Math.random() * 0.02, col.clone().multiplyScalar(0.7 + Math.random() * 0.5));
      }
      this.fx?.dust?.(pos.clone().setY(0), 1.0);
    }
  }

  chunk(p, v, s, c) {
    if (this.chunks.length >= MAX_CHUNKS) this.chunks.shift();
    this.chunks.push({ p, v, s, c, age: 0, life: 2.6 + Math.random() * 1.4, rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 10) });
  }
  leaf(p, delay) {
    if (this.leaves.length >= MAX_LEAVES) this.leaves.shift();
    const g = 0.7 + Math.random() * 0.45;
    this.leaves.push({ p, age: -delay, life: 3.2 + Math.random() * 1.5, ph: Math.random() * 6.3, w: 2 + Math.random() * 2, drift: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5), c: new THREE.Color(0.32 * g, 0.42 * g, 0.16 * g) });
  }
  wave(pos, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.ringTex, color: this.stage?.dustColor ?? 0xbcb3a5, transparent: true, opacity: 0.5, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.03, pos.z); m.renderOrder = 2;
    this.scene.add(m);
    this.waves.push({ m, age: 0, life: 0.55, size });
  }

  update(dt) {
    for (const d of this.decals) {
      d.age += dt;
      // (the crack runs out from the middle in a blink, then stays)
      const k = Math.min(1, d.age / d.grow);
      d.m.material.opacity = d.op * Math.min(1, k * 1.6);
      d.m.scale.setScalar(0.55 + 0.45 * (1 - Math.pow(1 - k, 3)));
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.age += dt;
      const t = w.age / w.life;
      if (t >= 1) { this.scene.remove(w.m); w.m.material.dispose(); w.m.geometry.dispose(); this.waves.splice(i, 1); continue; }
      w.m.scale.setScalar(0.3 + w.size * (1 - Math.pow(1 - t, 2)));
      w.m.material.opacity = 0.45 * (1 - t);
    }
    const o = this._o;
    let n = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const q = this.chunks[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      q.v.y -= 9.8 * dt;
      q.p.addScaledVector(q.v, dt);
      if (q.p.y < q.s) {
        // bounce, lose most of it to the floor, roll to a stop
        q.p.y = q.s; q.v.y = Math.abs(q.v.y) > 0.6 ? -q.v.y * 0.3 : 0; q.v.x *= 0.6; q.v.z *= 0.6; q.spin.multiplyScalar(0.6);
      }
      q.rot.x += q.spin.x * dt; q.rot.y += q.spin.y * dt; q.rot.z += q.spin.z * dt;
      // (shrinks away at the end of its life)
      const sc = q.s * Math.min(1, (q.life - q.age) / 0.5);
      o.position.copy(q.p); o.rotation.copy(q.rot); o.scale.set(sc, sc * 0.7, sc); o.updateMatrix();
      this.chunkMesh.setMatrixAt(n, o.matrix); this.chunkMesh.setColorAt(n, q.c);
      this.chunks[n++] = q;
    }
    this.chunks.length = n; this.chunkMesh.count = n;
    this.chunkMesh.instanceMatrix.needsUpdate = true; if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;
    n = 0;
    for (let i = 0; i < this.leaves.length; i++) {
      const q = this.leaves[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      if (q.age > 0 && q.p.y > 0.01) {
        // see-sawing down: a slow fall with a side to side swing
        q.p.y = Math.max(0.01, q.p.y - (0.9 + 0.35 * Math.sin(q.age * q.w + q.ph)) * dt);
        q.p.addScaledVector(q.drift, dt); q.p.x += Math.cos(q.age * q.w + q.ph) * 0.4 * dt;
      }
      const sc = Math.min(1, (q.life - q.age) / 0.6);
      o.position.copy(q.p); o.rotation.set(q.p.y > 0.02 ? Math.sin(q.age * q.w + q.ph) * 0.9 : -Math.PI / 2, q.ph, 0); o.scale.setScalar(Math.max(0.0001, sc)); o.updateMatrix();
      this.leafMesh.setMatrixAt(n, o.matrix); this.leafMesh.setColorAt(n, q.c);
      this.leaves[n++] = q;
    }
    this.leaves.length = n; this.leafMesh.count = n;
    this.leafMesh.instanceMatrix.needsUpdate = true; if (this.leafMesh.instanceColor) this.leafMesh.instanceColor.needsUpdate = true;
  }
}
