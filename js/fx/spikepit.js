// The spike pit of Rafa's PUÑETALITY (js/fight/fatality.js): the ground gives way behind the loser and opens into a
// pit lined with rusty iron spikes. Drawn only.
//
// The hole is real: the stage's floor meshes under it (found by casting rays down over the pit) get copies of their
// materials that leave out the fragments inside its outline (a rounded rectangle, its edge broken by a few waves; it
// opens out from the middle with `open`), the depth of field's depth too. Under it: the pit (walls of rough stone,
// darker the deeper, a floor of dirt and gravel with old bones), the broken edge of the slab round the opening, the
// spikes (a field of them, and a few "hero" spikes placed where the body will land, so that they come out through it;
// those take blood from their tips down), and the rubble that falls in as it opens.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the outline in the pit's normalized frame (u along its length / a, v across / b): a superellipse of exponent 4, its
// radius broken by a few waves; the same function in GLSL and here
const EDGE_GLSL = `
float pitR0( float ph ) { float c = abs( cos( ph ) ), s = abs( sin( ph ) ); return pow( c * c * c * c + s * s * s * s, -0.25 ); }
float pitR( float ph ) { return pitR0( ph ) * ( 1.0 + 0.03 * sin( 5.0 * ph + 1.0 ) + 0.02 * sin( 11.0 * ph + 2.0 ) + 0.012 * sin( 23.0 * ph + 0.5 ) ); }`;
const pitR0 = (ph) => { const c = Math.abs(Math.cos(ph)), s = Math.abs(Math.sin(ph)); return Math.pow(c ** 4 + s ** 4, -0.25); };
const pitR = (ph) => pitR0(ph) * (1 + 0.03 * Math.sin(5 * ph + 1) + 0.02 * Math.sin(11 * ph + 2) + 0.012 * Math.sin(23 * ph + 0.5));

// uniforms shared by the holed floors: the pit's centre and axes (world xz), half-sizes, how open
function holeUniforms() {
  return { uPitC: { value: new THREE.Vector2() }, uPitAx: { value: new THREE.Vector2(1, 0) }, uPitAB: { value: new THREE.Vector2(1, 1) }, uPitOpen: { value: 0 } };
}
const HOLE_V = 'varying vec3 vPitW;\n';
const HOLE_VB = `vec4 pitW = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  pitW = instanceMatrix * pitW;
#endif
vPitW = ( modelMatrix * pitW ).xyz;
`;
const HOLE_F = `varying vec3 vPitW; uniform vec2 uPitC, uPitAx, uPitAB; uniform float uPitOpen;${EDGE_GLSL}
bool inPit() {
  if ( uPitOpen <= 0.0 || abs( vPitW.y ) > 0.12 ) return false;
  vec2 d = vPitW.xz - uPitC;
  vec2 q = vec2( dot( d, uPitAx ), dot( d, vec2( -uPitAx.y, uPitAx.x ) ) ) / uPitAB;
  return length( q ) < pitR( atan( q.y, q.x ) ) * uPitOpen;
}`;
function holeMaterial(mat, U) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  if (mat.defines) m.defines = { ...mat.defines };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HOLE_V).replace('#include <project_vertex>', HOLE_VB + '#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HOLE_F).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif ( inPit() ) discard;');
    if (!sh.fragmentShader.includes('inPit() ) discard')) console.warn('spike pit: floor not patched', mat.type);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|pit';
  return m;
}
function holeDepth(U) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  d.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HOLE_V).replace('#include <project_vertex>', HOLE_VB + '#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HOLE_F).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif ( inPit() ) discard;');
  };
  d.customProgramCacheKey = () => 'pitDepth';
  return d;
}

// textures: rough stone blocks for the walls (darkened towards the bottom by the vertex colours), dirt for the floor,
// rust for the spikes
function stoneTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), R = rng(5);
  g.fillStyle = '#5b5550'; g.fillRect(0, 0, N, N);
  // courses of rough blocks
  for (let row = 0; row < 8; row++) {
    const h = N / 8, off = (row % 2) * 40;
    for (let x = -off; x < N; x += 70 + R() * 50) {
      const w = 60 + R() * 50, l = 70 + R() * 45;
      g.fillStyle = `rgb(${l},${l * 0.94},${l * 0.88})`;
      g.fillRect(x + 3, row * h + 3, w - 6, h - 6);
    }
  }
  for (let i = 0; i < 9000; i++) { const v = R(); g.fillStyle = v < 0.5 ? `rgba(0,0,0,${R() * 0.12})` : `rgba(255,250,240,${R() * 0.06})`; g.fillRect(R() * N, R() * N, 1 + R() * 3, 1 + R() * 3); }
  // damp streaks and old stains running down
  for (let i = 0; i < 40; i++) { const x = R() * N, gr = g.createLinearGradient(0, 0, 0, N); gr.addColorStop(0, 'rgba(30,25,20,0)'); gr.addColorStop(1, `rgba(${R() < 0.3 ? '60,10,8' : '20,18,14'},${0.2 + R() * 0.3})`); g.fillStyle = gr; g.fillRect(x, R() * N * 0.4, 3 + R() * 10, N); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function dirtTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), R = rng(9);
  g.fillStyle = '#3a3128'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2500; i++) { const l = 30 + R() * 60; g.fillStyle = `rgb(${l},${l * 0.85},${l * 0.7})`; const r = 0.5 + R() * 2.5; g.beginPath(); g.arc(R() * N, R() * N, r, 0, 6.28); g.fill(); }
  for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(55,8,6,${0.2 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * N, R() * N, 8 + R() * 25, 6 + R() * 18, R() * 3, 0, 6.28); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return t;
}
function rustTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), R = rng(13);
  g.fillStyle = '#4a3a30'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 6000; i++) { const k = R(); g.fillStyle = k < 0.4 ? `rgba(130,62,28,${R() * 0.5})` : k < 0.7 ? `rgba(70,45,35,${R() * 0.5})` : `rgba(160,150,140,${R() * 0.2})`; g.fillRect(R() * N, R() * N, 1 + R() * 4, 1 + R() * 4); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// one spike: a forged iron shaft (six-sided, thicker at its foot) ending in a point, slightly bent, along +Y from 0 to h
function spikeGeo(h, r, R, tipLen = 0.24) {
  const tip = Math.min(tipLen, h * 0.32), prof = [[r * 1.35, 0], [r * 1.12, 0.06], [r, 0.2 * h], [r * 0.9, h - tip], [r * 0.55, h - tip * 0.55], [0, h]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 6);
  const p = g.attributes.position, bend = (R() - 0.5) * 0.06, bz = (R() - 0.5) * 0.06;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = (y / h) ** 2; p.setX(i, p.getX(i) + bend * k); p.setZ(i, p.getZ(i) + bz * k); }
  g.computeVertexNormals();
  // (darker towards the bottom, in the pit's shadow)
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = 0.25 + 0.75 * Math.min(1, p.getY(i) / h); col.set([k, k, k], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class SpikePit {
  // center: the pit's middle (world, on the floor), ax: its length's direction (unit, horizontal); a, b: half-sizes of
  // the opening (m); D: depth; heroes: [[along, across, tipY], ...] spikes to place exactly (pit frame, tip height)
  // clear(u, v): where the body will lie (the field's spikes there are short stubs, under it)
  constructor(scene, stage, center, ax, { a = 0.9, b = 1.1, D = 1.7, heroes = [], clear = null } = {}) {
    this.scene = scene; this.stage = stage; this.c = center.clone().setY(0); this.ax = ax.clone().setY(0).normalize();
    this.a = a; this.b = b; this.D = D; this.R = rng(17);
    this.side = new THREE.Vector3(-this.ax.z, 0, this.ax.x);
    this.U = holeUniforms();
    this.U.uPitC.value.set(this.c.x, this.c.z); this.U.uPitAx.value.set(this.ax.x, this.ax.z); this.U.uPitAB.value.set(a, b);
    this.group = new THREE.Group(); this.group.name = 'spikePit';
    // the pit's own frame: x along, z across (so that the pit frame's (u, v) = (x, z))
    this.group.position.copy(this.c);
    this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(this.ax, new THREE.Vector3(0, 1, 0), this.side));
    scene.add(this.group);
    this.clear = clear;
    this._build(heroes);
    this._hole();
    this.rubble = [];
  }
  // pit frame (along, across) -> world
  toWorld(u, v, y, out = new THREE.Vector3()) { return out.copy(this.c).addScaledVector(this.ax, u).addScaledVector(this.side, v).setY(y); }

  _build(heroes) {
    const a = this.a, b = this.b, D = this.D, R = this.R, G = this.group;
        // walls: down from the outline to the floor (the outline at full size: under the floor while the hole opens), the
    // stone rough (its radius broken a little), darker the deeper (vertex colours)
    const stone = stoneTexture();
    const wallMat = new THREE.MeshStandardMaterial({ map: stone, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    const NW = 96, NY = 9, wp = [], wc = [], wu = [], wi = [];
    let per = 0;
    for (let i = 0; i <= NW; i++) {
      const ph = i / NW * Math.PI * 2, r = pitR(ph);
      if (i > 0) { const ph0 = (i - 1) / NW * Math.PI * 2, r0 = pitR(ph0); per += Math.hypot(Math.cos(ph) * r * a - Math.cos(ph0) * r0 * a, Math.sin(ph) * r * b - Math.sin(ph0) * r0 * b); }
      for (let j = 0; j <= NY; j++) {
        const y = -0.012 - (D - 0.012) * j / NY, jag = j === 0 ? 1 : 1 + 0.035 * (R() - 0.3) + 0.04 * j / NY;
        wp.push(Math.cos(ph) * r * a * jag, y, Math.sin(ph) * r * b * jag);
        const k = 0.16 + 0.84 * Math.pow(Math.min(1, Math.max(0, (y + D) / D)), 1.6);
        wc.push(k, k * 0.97, k * 0.94);
        wu.push(per * 0.8, y * 0.8);
      }
    }
    for (let i = 0; i < NW; i++) for (let j = 0; j < NY; j++) { const v0 = i * (NY + 1) + j, v1 = v0 + NY + 1; wi.push(v0, v1, v0 + 1, v1, v1 + 1, v0 + 1); }
    const box = new THREE.BufferGeometry();
    box.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); box.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3)); box.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
    box.setIndex(wi); box.computeVertexNormals();
    const walls = new THREE.Mesh(box, wallMat); walls.receiveShadow = true; G.add(walls);
    // the floor: dirt, old blood, a few bones
    const floorMat = new THREE.MeshStandardMaterial({ map: dirtTexture(), color: 0x6b6258, roughness: 1 });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.3 * a, 2.3 * b).rotateX(-Math.PI / 2), floorMat);
    fl.position.y = -D; fl.receiveShadow = true; G.add(fl);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0x6f6656, roughness: 0.8 });
    const bones = [];
    for (let i = 0; i < 6; i++) {
      const len = 0.25 + R() * 0.2, sh = new THREE.CylinderGeometry(0.012, 0.014, len, 8);
      const e1 = new THREE.SphereGeometry(0.026, 8, 6); e1.translate(0, len / 2, 0); e1.scale(1.3, 0.8, 1);
      const e2 = new THREE.SphereGeometry(0.024, 8, 6); e2.translate(0, -len / 2, 0); e2.scale(1.2, 0.8, 1);
      const bg = mergeGeometries([sh.toNonIndexed(), e1.toNonIndexed(), e2.toNonIndexed()]);
      bg.rotateZ(Math.PI / 2 + (R() - 0.5) * 0.3); bg.rotateY(R() * Math.PI); bg.translate((R() - 0.5) * a * 1.5, -D + 0.02, (R() - 0.5) * b * 1.5);
      bones.push(bg);
    }
    const bm = new THREE.Mesh(mergeGeometries(bones), boneMat); bm.receiveShadow = true; G.add(bm);
    // the broken edge of the slab round the opening: a band 18 cm deep along the outline (scaled with the opening)
    const ring = [], rv = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const ph = i / N * Math.PI * 2, r = pitR(ph);
      const u = Math.cos(ph) * r * a, v = Math.sin(ph) * r * b;
      ring.push([u, v]);
    }
    const ep = [], en = [], eu = [], ei = [];
    for (let i = 0; i <= N; i++) {
      const [u, v] = ring[i], [u1, v1] = ring[Math.min(N, i + 1)], [u0, v0] = ring[Math.max(0, i - 1)];
      const tx = u1 - u0, tz = v1 - v0, l = Math.hypot(tx, tz) || 1;
      // (facing into the hole)
      const nx = tz / l, nz = -tx / l, inward = nx * u + nz * v > 0 ? -1 : 1;
      for (const [y, j] of [[0.002, 0], [-0.07, 0.4], [-0.18, 1]]) {
        const jag = j > 0.5 ? (R() - 0.5) * 0.04 : 0;
        ep.push(u + jag * u, y + (j > 0.5 ? (R() - 0.5) * 0.05 : 0), v + jag * v); en.push(nx * inward, 0, nz * inward); eu.push(i / N * 12, j);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) { const p0 = i * 3 + j, p1 = (i + 1) * 3 + j; ei.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1); }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.setAttribute('normal', new THREE.Float32BufferAttribute(en, 3)); eg.setAttribute('uv', new THREE.Float32BufferAttribute(eu, 2));
    eg.setIndex(ei);
    this.edgeU = { uOpen: { value: 0 } };
    const edgeMat = new THREE.MeshStandardMaterial({ map: stone, color: 0x8a8580, roughness: 0.95, side: THREE.DoubleSide });
    edgeMat.onBeforeCompile = (sh) => {
      sh.uniforms.uOpen = this.edgeU.uOpen;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uOpen;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed.xz *= max( uOpen, 0.001 );');
    };
    edgeMat.customProgramCacheKey = () => 'pitEdge';
    this.edge = new THREE.Mesh(eg, edgeMat); this.edge.receiveShadow = true; G.add(this.edge);
    // the spikes: a field of them on a jittered grid (clear of the heroes), and the heroes
    this.rust = rustTexture();
    const spikeMat = new THREE.MeshStandardMaterial({ map: this.rust, vertexColors: true, roughness: 0.58, metalness: 0.3 });
    const field = [];
    this.spikePts = [];
    const nu = 5, nv = 6;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const u = (-1 + (i + 0.5) * 2 / nu) * a * 1.05 + (R() - 0.5) * 0.12, v = (-1 + (j + 0.5) * 2 / nv) * b * 1.05 + (R() - 0.5) * 0.12;
      if (heroes.some(([hu, hv]) => Math.hypot(hu - u, hv - v) < 0.2)) continue;
      { const qu = u / a, qv = v / b; if (Math.hypot(qu, qv) > pitR(Math.atan2(qv, qu)) - 0.07) continue; }
      const stub = this.clear?.(u, v);
      const h = stub ? 0.3 + R() * 0.14 : D - 0.62 + (R() - 0.5) * 0.25, r = (0.022 + R() * 0.012) * (stub ? 1.15 : 1);
      const g = spikeGeo(h, r, R); g.translate(u, -D, v);
      field.push(g); this.spikePts.push([u, v, -D + h]);
    }
    const fm = new THREE.Mesh(mergeGeometries(field), spikeMat); fm.castShadow = true; fm.receiveShadow = true; G.add(fm);
    // the heroes: each its own mesh, blood from the tip down (uBlood: how far, m)
    this.heroes = heroes.map(([u, v, tipY], k) => {
      const h = tipY + D, r = 0.034 + 0.004 * (k % 2);
      const U = { uBlood: { value: 0 }, uTip: { value: tipY } };
      const mt = spikeMat.clone();
      mt.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vSpY; varying vec2 vSpXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSpY = position.y; vSpXZ = position.xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSpY; varying vec2 vSpXZ; uniform float uBlood, uTip;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float spD = uTip - vSpY;
            float spRun = uBlood * ( 0.55 + 0.45 * sin( atan( vSpXZ.y, vSpXZ.x ) * 3.0 + 1.7 ) );
            float spB = 1.0 - smoothstep( spRun * 0.85, spRun, spD );
            spB *= step( 0.001, uBlood );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.16, 0.006, 0.008 ), spB );`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.12, spB );')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix( metalnessFactor, 0.0, spB );');
      };
      mt.customProgramCacheKey = () => 'pitHero';
      const g = spikeGeo(h, r, R, 0.15); g.translate(0, -D, 0);
      // (spike-local y in the shader is the pit's y: the mesh only moves in u, v)
      const m = new THREE.Mesh(g, mt); m.position.set(u, 0, v); m.castShadow = true; G.add(m);
      return { m, U, u, v, tipY };
    });
    this.mats = [wallMat, floorMat, boneMat, edgeMat, spikeMat, ...this.heroes.map((h) => h.m.material)];
    this.geos = [box, fl.geometry, bm.geometry, eg, fm.geometry, ...this.heroes.map((h) => h.m.geometry)];
    this.textures = [stone, floorMat.map, this.rust];
  }

  // the floors under the pit: their materials holed
  _hole() {
    this.patched = [];
    const root = this.stage?.group || this.scene;
    root.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(), hits = new Set();
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const p = this.toWorld(i / 3 * this.a * 1.35, j / 3 * this.b * 1.35, 2);
      rc.set(p, new THREE.Vector3(0, -1, 0)); rc.far = 2.3;
      for (const h of rc.intersectObject(root, true)) if (Math.abs(h.point.y) < 0.12 && h.object.isMesh && !h.object.isSkinnedMesh) hits.add(h.object);
    }
    for (const o of hits) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const holed = mats.map((mt) => holeMaterial(mt, this.U));
      for (const h of holed) h.userData.splitDepth = this.depth || (this.depth = holeDepth(this.U));
      this.patched.push({ o, mat: o.material });
      o.material = Array.isArray(o.material) ? holed : holed[0];
    }
  }
  // a crack across the floor from a to b (world): jagged, a few branches off it, dark in the middle with chipped edges;
  // it runs from a to b as grow (setCrack) goes 0..1. Clipped by the hole like the floor
  crack(a, b, seed = 3) {
    const R = rng(seed), dir = b.clone().sub(a).setY(0), len = dir.length(); dir.normalize();
    const sd = new THREE.Vector3(-dir.z, 0, dir.x), lines = [];
    const n = Math.max(12, Math.round(len * 14)), main = [];
    let off = 0;
    for (let i = 0; i <= n; i++) { const k = i / n; off = off * 0.8 + (R() - 0.5) * 0.06; main.push([a.clone().addScaledVector(dir, len * k).addScaledVector(sd, off * Math.min(1, k * 6)), k]); }
    lines.push({ pts: main, w0: 0.05, w1: 0.022 });
    for (let j = 0; j < 7; j++) {
      const i0 = 2 + Math.floor(R() * (n - 3)), [p0, k0] = main[i0];
      const bd = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (R() < 0.5 ? -1 : 1) * (0.45 + R() * 0.7)), bs = new THREE.Vector3(-bd.z, 0, bd.x);
      const bl = 0.12 + R() * 0.32, m = 7, br = [];
      let o2 = 0;
      for (let i = 0; i <= m; i++) { o2 = o2 * 0.7 + (R() - 0.5) * 0.03; br.push([p0.clone().addScaledVector(bd, bl * i / m).addScaledVector(bs, o2), k0 + bl * i / m / len * 1.6]); }
      lines.push({ pts: br, w0: 0.022, w1: 0.003 });
    }
    // five vertices across: soft outer edge, chipped lighter rim, dark core
    const P = [], C = [], K = [], I = [];
    const across = [[-1, 0.05, 0], [-0.4, 0.06, 0.55], [0, 0.0, 0.97], [0.4, 0.06, 0.55], [1, 0.05, 0]];
    for (const L of lines) {
      const base = P.length / 3, m = L.pts.length;
      for (let i = 0; i < m; i++) {
        const [p, k] = L.pts[i], q = L.pts[Math.min(m - 1, i + 1)][0], o = L.pts[Math.max(0, i - 1)][0];
        const t = q.clone().sub(o).setY(0).normalize(), nn = new THREE.Vector3(-t.z, 0, t.x);
        const w = (L.w0 + (L.w1 - L.w0) * i / (m - 1)) * (0.7 + 0.6 * R()) * 0.5;
        for (const [x, l, al] of across) { P.push(p.x + nn.x * x * w, 0.004, p.z + nn.z * x * w); C.push(l * 0.55, l * 0.5, l * 0.45, al); K.push(k); }
      }
      for (let i = 0; i < m - 1; i++) for (let j = 0; j < 4; j++) { const v0 = base + i * 5 + j, v1 = v0 + 5; I.push(v0, v0 + 1, v1, v1, v0 + 1, v1 + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4)); g.setAttribute('aK', new THREE.Float32BufferAttribute(K, 1));
    g.setIndex(I);
    this.crackU = { uGrow: { value: 0 } };
    const base = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    base.onBeforeCompile = (sh) => {
      sh.uniforms.uGrow = this.crackU.uGrow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aK; varying float vK;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvK = aK;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vK; uniform float uGrow;').replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif ( vK > uGrow ) discard;');
    };
    base.customProgramCacheKey = () => 'pitCrack';
    const mat = holeMaterial(base, this.U);
    this.crackMesh = new THREE.Mesh(g, mat); this.crackMesh.renderOrder = 2; this.crackMesh.userData.noGTAO = true; this.crackMesh.userData.noAO = true;
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);
    this.mats.push(base, mat); this.geos.push(g);
  }
  setCrack(k) { if (this.crackMesh) { this.crackU.uGrow.value = k; this.crackMesh.visible = k > 0; } }
  setOpen(k) { this.U.uPitOpen.value = k; this.edgeU.uOpen.value = k; this.group.visible = k > 0.001; }
  // is a world point over the opening (fully open)?
  over(p, margin = 0) {
    const d = new THREE.Vector3(p.x - this.c.x, 0, p.z - this.c.z);
    const u = d.dot(this.ax) / this.a, v = d.dot(this.side) / this.b;
    return Math.hypot(u, v) < pitR(Math.atan2(v, u)) - margin;
  }
  // rubble falling in as it opens: chunks round the edge at radius k of the outline
  crumble(k, n, mat) {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const ph = R() * Math.PI * 2, r = pitR(ph) * k * (0.9 + 0.1 * R());
      const p = this.toWorld(Math.cos(ph) * r * this.a, Math.sin(ph) * r * this.b, -0.02);
      const s = 0.04 + R() * 0.09;
      // (broken slabs of the floor: flat, their edges ragged, three shapes)
      if (!this.rubbleGeos) {
        this.rubbleGeos = [0, 1, 2].map((k) => {
          const g = new THREE.BoxGeometry(1, 1, 1, 2, 1, 2).toNonIndexed(), p = g.attributes.position, r2 = rng(31 + k), seen = new Map();
          for (let j = 0; j < p.count; j++) {
            const key = `${p.getX(j).toFixed(3)},${p.getY(j).toFixed(3)},${p.getZ(j).toFixed(3)}`;
            if (!seen.has(key)) seen.set(key, [(r2() - 0.5) * 0.35, (r2() - 0.5) * 0.25, (r2() - 0.5) * 0.35]);
            const o = seen.get(key);
            p.setXYZ(j, p.getX(j) + o[0], p.getY(j) * (p.getY(j) > 0 ? 1 : 1 + o[1]) , p.getZ(j) + o[2]);
          }
          g.computeVertexNormals();
          return g;
        });
      }
      const m = new THREE.Mesh(this.rubbleGeos[i % 3], mat);
      m.scale.set(s, s * (0.28 + R() * 0.2), s * (0.65 + R() * 0.45)); m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this.rubble.push({ m, p, prev: p.clone(), v: new THREE.Vector3((R() - 0.5) * 0.4, -R() * 0.5, (R() - 0.5) * 0.4), w: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(10), q: new THREE.Quaternion(), r: s, rest: false });
    }
  }
  step(onLand) {
    const dt = 1 / 60;
    for (const c of this.rubble) {
      c.prev.copy(c.p);
      if (c.rest) continue;
      c.v.y -= 9.81 * dt; c.p.addScaledVector(c.v, dt);
      c.q.premultiply(new THREE.Quaternion().setFromAxisAngle(c.w.clone().normalize(), c.w.length() * dt));
      if (c.p.y < -this.D + c.r * 0.6) { c.p.y = -this.D + c.r * 0.6; if (c.v.y < -2) onLand?.(c); c.v.set(c.v.x * 0.3, Math.abs(c.v.y) * 0.15, c.v.z * 0.3); c.w.multiplyScalar(0.3); if (Math.abs(c.v.y) < 0.2) c.rest = true; }
    }
  }
  draw(alpha) { for (const c of this.rubble) { c.m.position.lerpVectors(c.prev, c.p, alpha); c.m.quaternion.copy(c.q); } }
  restore() {
    for (const { o, mat } of this.patched) {
      const cur = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of cur) m.dispose();
      o.material = mat;
    }
    this.patched = [];
    this.depth?.dispose();
    for (const c of this.rubble) this.scene.remove(c.m);
    this.rubble = []; for (const g of this.rubbleGeos || []) g.dispose();
    this.scene.remove(this.group);
    if (this.crackMesh) this.scene.remove(this.crackMesh);
    for (const m of this.mats) m.dispose(); for (const g of this.geos) g.dispose(); for (const t of this.textures) t?.dispose();
  }
}

// The blood on a body run through by the spikes (world space: the body lies still on them). Each wound: where a spike
// comes out (x, z: its axis, vertical) and how far the blood has spread round it (m): the shirt soaks out from a dark
// hole, ragged; and down the sides and the back, what faces down soaks in runs as the blood finds its way to the
// spikes and drips off (back: 0..1). Patched copies of the body's materials (built behind the move's black).
const SOAK_N = 6;
function soakMaterial(mat, U) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  if (mat.defines) m.defines = { ...mat.defines };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkW; varying vec3 vSkN;')
      .replace('#include <project_vertex>', 'vSkW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vSkN = normalize( mat3( modelMatrix ) * objectNormal );\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSkW; varying vec3 vSkN; uniform vec4 uSoak[ ${SOAK_N} ]; uniform float uSoakBack;
float skH( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float skN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( skH( i ), skH( i + vec3( 1, 0, 0 ) ), f.x ), mix( skH( i + vec3( 0, 1, 0 ) ), skH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( skH( i + vec3( 0, 0, 1 ) ), skH( i + vec3( 1, 0, 1 ) ), f.x ), mix( skH( i + vec3( 0, 1, 1 ) ), skH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float skM = 0.0, skHole = 0.0;
        float skNz = skN( vSkW * 19.0 ) * 0.65 + skN( vSkW * 53.0 ) * 0.35;
        for ( int i = 0; i < ${SOAK_N}; i++ ) {
          vec4 s = uSoak[ i ];
          if ( s.w <= 0.0 || vSkW.y > s.z ) continue;
          float r = length( vSkW.xz - s.xy );
          // (ragged: big lobes and a fine edge)
          float lob = skN( vSkW * 7.0 + float( i ) * 3.1 );
          skM = max( skM, 1.0 - smoothstep( s.w * ( 0.3 + 0.45 * lob + 0.2 * skNz ), s.w * ( 0.55 + 0.7 * lob + 0.3 * skNz ), r ) );
          if ( s.z < 8.0 ) continue;
          skHole = max( skHole, 1.0 - smoothstep( 0.02, 0.036 + 0.01 * skNz, r ) );
        }
        float skDown = uSoakBack * smoothstep( 0.0, -0.55, vSkN.y ) * smoothstep( 0.42, 0.62, skN( vSkW * vec3( 26.0, 5.0, 26.0 ) ) * 0.8 + 0.35 * uSoakBack );
        float skB = max( skM, skDown );
        diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.15, 0.005, 0.008 ), vec3( 0.035, 0.0, 0.002 ), skHole ), max( skB * 0.97, skHole ) );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.2, max( skB, skHole ) );')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n\t#ifdef USE_SHEEN\n\t\tmaterial.sheenColor *= 1.0 - skB;\n\t#endif');
    if (!sh.fragmentShader.includes('skHole = max')) console.warn('spike pit: body not patched', mat.type);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|soak';
  return m;
}
export class BodySoak {
  constructor(f) {
    this.U = { uSoak: { value: Array.from({ length: SOAK_N }, () => new THREE.Vector4(0, 0, 0, 0)) }, uSoakBack: { value: 0 } };
    this.items = [];
    for (const mesh of Object.values(f.ch.meshes)) {
      const mt = mesh.material;
      if (!mesh.isSkinnedMesh || Array.isArray(mt) || mt.transparent || mt.alphaTest > 0 || /hair|eye|cornea|lash|teeth|beard|tongue/i.test(mesh.name)) continue;
      const sk = soakMaterial(mt, this.U);
      this.items.push({ mesh, mat: mt, sk });
      mesh.material = sk;
    }
  }
  // wound i: its spike's axis (world x, z) and how far it has spread (m; 0: none); top: only below this height
  set(i, x, z, r, top = 9) { this.U.uSoak.value[i].set(x, z, top, r); }
  back(k) { this.U.uSoakBack.value = k; }
  restore() { for (const it of this.items) { it.mesh.material = it.mat; it.sk.dispose(); } this.items = []; }
}
