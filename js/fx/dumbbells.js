// Camilo's dumbbells (his PUÑETALITY, js/fight/fatality.js): a pair of 20 kg hex dumbbells as a gym has them, heads of
// black rubber cast in a hexagon with softened edges, steel collars, a knurled steel handle, the weight on the end
// plates. Built from code. One in each fist (js/fx/aloesword.js attachInFist), and once dropped, loose on the floor.
//
// Frame of each: the origin at the middle of the handle (where the fist closes), +Y along the handle (the index
// finger's side), X / Z across. uniforms: blood (0..1, on the heads, more on the -Y one that comes down on the head).
import * as THREE from 'three';

export const DB = { handle: 0.13, r: 0.0145, collar: 0.012, head: 0.085, hexR: 0.07 };
const H0 = DB.handle / 2 + DB.collar, H1 = H0 + DB.head;   // where each head starts and ends along the handle

function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the knurling: a diamond cross-hatch as a normal map, wrapped round the handle
function knurlTexture() {
  const N = 128, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // two sets of grooves crossing at 60 degrees: the height is the lower of two triangle waves
    const u = x / N, v = y / N, k = 10;
    const a = Math.abs(((u * k + v * k) % 1) - 0.5) * 2, b = Math.abs(((u * k - v * k + 10) % 1) - 0.5) * 2;
    const ga = (Math.abs((((u + 1 / N) * k + v * k) % 1) - 0.5) * 2 - a) * N / k, gb = (Math.abs((((u + 1 / N) * k - v * k + 10) % 1) - 0.5) * 2 - b) * N / k;
    const useA = a < b, dx = useA ? ga : gb, dy = useA ? ga : -gb;
    const nx = -dx * 0.6, ny = -dy * 0.6, l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 4); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
// the end plate: a steel disc with the weight cast in it
function plateTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(N / 2, N / 2, 10, N / 2, N / 2, N / 2);
  gr.addColorStop(0, '#9da3a8'); gr.addColorStop(0.7, '#7d8388'); gr.addColorStop(1, '#5a5f63');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  // brushed rings
  const R = rng(5);
  for (let r = 8; r < N / 2; r += 2) { g.strokeStyle = `rgba(${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},0.04)`; g.beginPath(); g.arc(N / 2, N / 2, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#1b1c1e'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('20', N / 2, N / 2 - 18); g.font = 'bold 38px sans-serif'; g.fillText('KG', N / 2, N / 2 + 34);
  g.strokeStyle = 'rgba(20,20,22,0.8)'; g.lineWidth = 5; g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 14, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// the rubber's own grain (roughness: a little worn and shinier at the edges where hands and the floor have polished it)
function rubberTexture() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), R = rng(9), img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = 150 + (R() - 0.5) * 60; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
  return t;
}

const NOISE = `
float dbH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float dbN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( dbH( i ), dbH( i + vec2( 1, 0 ) ), f.x ), mix( dbH( i + vec2( 0, 1 ) ), dbH( i + vec2( 1, 1 ) ), f.x ), f.y ); }`;
// blood on a part: object-space position decides where (the -Y head the most, its end face and edges first)
function bloodPatch(mat, U, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
    sh.uniforms.uDbBlood = U.blood;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDbP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvDbP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vDbP; uniform float uDbBlood;${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dbB = 0.0;
        if ( uDbBlood > 0.001 ) {
          float lowHead = 1.0 - smoothstep( ${(-H1).toFixed(3)}, ${(-H0).toFixed(3)} + 0.01, vDbP.y ), upHead = smoothstep( ${H0.toFixed(3)} + 0.03, ${H1.toFixed(3)}, vDbP.y );
          float n = dbN( vDbP.xz * 70.0 + vDbP.y * 30.0 ) * 0.6 + dbN( vDbP.xy * 160.0 + vDbP.z * 40.0 ) * 0.4;
          float m = lowHead * 1.1 + upHead * 0.35 + 0.12 * ( 1.0 - smoothstep( 0.0, 0.03, abs( vDbP.y ) - ${(DB.handle / 2).toFixed(3)} ) );
          dbB = smoothstep( 0.55, 0.62, m * n * ( 0.5 + uDbBlood ) + 0.25 * uDbBlood - 0.15 );
        }
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.13, 0.004, 0.006 ), dbB );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.12, dbB );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix( metalnessFactor, 0.0, dbB );');
  };
  mat.customProgramCacheKey = () => 'dumbbell' + key;
}

// one dumbbell (shared geometries and materials between the pair: `kit`)
function makeKit() {
  const U = { blood: { value: 0 } };
  // the head: a hexagon with rounded corners, extruded with a bevel, its axis along Y
  const hx = new THREE.Shape(), rr = DB.hexR, cr = 0.012;
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + Math.PI / 6, a1 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
    const p0 = new THREE.Vector2(Math.cos(a0) * rr, Math.sin(a0) * rr), p1 = new THREE.Vector2(Math.cos(a1) * rr, Math.sin(a1) * rr);
    const s = p0.clone().lerp(p1, cr / p0.distanceTo(p1)), e = p0.clone().lerp(p1, 1 - cr / p0.distanceTo(p1));
    if (i === 0) hx.moveTo(s.x, s.y); else hx.lineTo(s.x, s.y);
    hx.lineTo(e.x, e.y);
    const a2 = ((i + 2) / 6) * Math.PI * 2 + Math.PI / 6, p2 = new THREE.Vector2(Math.cos(a2) * rr, Math.sin(a2) * rr);
    const n = p1.clone().lerp(p2, cr / p1.distanceTo(p2));
    hx.quadraticCurveTo(p1.x, p1.y, n.x, n.y);
  }
  const bev = 0.007;
  const headG = new THREE.ExtrudeGeometry(hx, { depth: DB.head - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.9, bevelSegments: 3, curveSegments: 4 });
  headG.translate(0, 0, bev); headG.rotateX(-Math.PI / 2); // (along +Y, from 0 to the head's length)
  headG.computeVertexNormals();
  const rubber = new THREE.MeshPhysicalMaterial({ color: 0x101012, roughness: 0.78, roughnessMap: rubberTexture(), metalness: 0, sheen: 0.2, sheenColor: new THREE.Color(0.1, 0.1, 0.11), sheenRoughness: 0.6, clearcoat: 0.08, clearcoatRoughness: 0.7 });
  bloodPatch(rubber, U, 'r');
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.28, clearcoat: 0.3, clearcoatRoughness: 0.2 });
  bloodPatch(steel, U, 's');
  const knurl = new THREE.MeshPhysicalMaterial({ color: 0xb8bdc2, metalness: 0.9, roughness: 0.42, normalMap: knurlTexture(), normalScale: new THREE.Vector2(0.9, 0.9) });
  bloodPatch(knurl, U, 'k');
  const plateMat = new THREE.MeshPhysicalMaterial({ map: plateTexture(), metalness: 0.75, roughness: 0.35 });
  bloodPatch(plateMat, U, 'p');
  return {
    U, mats: [rubber, steel, knurl, plateMat], headG,
    handleG: new THREE.CylinderGeometry(DB.r, DB.r, DB.handle, 28, 1, true),
    collarG: new THREE.CylinderGeometry(0.024, 0.026, DB.collar, 28),
    plateG: new THREE.CircleGeometry(0.034, 32),
    rubber, steel, knurl, plateMat,
  };
}
function makeOne(K) {
  const g = new THREE.Group(); g.name = 'dumbbell';
  const handle = new THREE.Mesh(K.handleG, K.knurl);
  g.add(handle);
  for (const sg of [1, -1]) {
    const collar = new THREE.Mesh(K.collarG, K.steel); collar.position.y = sg * (DB.handle / 2 + DB.collar / 2); g.add(collar);
    const head = new THREE.Mesh(K.headG, K.rubber);
    head.position.y = sg * H0; if (sg < 0) head.rotation.z = Math.PI;
    g.add(head);
    const plate = new THREE.Mesh(K.plateG, K.plateMat);
    plate.position.y = sg * (H1 + 0.0008); plate.rotation.x = sg > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(plate);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// the pair: { L, R } groups, the shared uniforms and the points of each (the -Y head's end face, for the blood)
export function makeDumbbells() {
  const K = makeKit();
  const L = makeOne(K), R = makeOne(K);
  return { L, R, U: K.U, mats: K.mats, geos: [K.headG, K.handleG, K.collarG, K.plateG], low: new THREE.Vector3(0, -H1, 0), high: new THREE.Vector3(0, H1, 0), H0, H1 };
}

// where a dumbbell's grip sits in a fist (tools/swordgrip.mjs with RG=0.0145, fist 0.75: the handle is thicker than
// the sword's)
export const DB_GRIP = { x: -0.024, z: -0.018, tilt: 0.1 };
export const DB_FIST = 0.75;

// a dumbbell let go: falls, lands on a flat of its hexagons, does not roll (that is what the hexagons are for), thuds
export class LooseDumbbell {
  constructor(g, scene) {
    this.g = g; this.scene = scene;
    // from wherever it is drawn now: taken out of the fist into the scene, its world transform kept
    g.updateWorldMatrix(true, false);
    const m = g.matrixWorld.clone();
    g.parent?.remove(g);
    scene.add(g);
    m.decompose(g.position, g.quaternion, g.scale);
    g.scale.setScalar(1);
    this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
    this.prevP = g.position.clone(); this.prevQ = g.quaternion.clone();
    this.p = g.position.clone(); this.q = g.quaternion.clone();
    this.landed = 0;
  }
  // one frame (dt = 1/60): gravity, the floor, the hexagon settling flat
  step(onLand) {
    this.prevP.copy(this.p); this.prevQ.copy(this.q);
    if (this.rest) return;
    const dt = 1 / 60;
    this.v.y -= 9.81 * dt;
    this.p.addScaledVector(this.v, dt);
    if (this.w.lengthSq() > 1e-8) this.q.premultiply(new THREE.Quaternion().setFromAxisAngle(this.w.clone().normalize(), this.w.length() * dt));
    // lowest point: the heads' rims (radius ~ the hexagon's) round the handle's axis
    const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);
    const lowest = Math.sqrt(Math.max(0, 1 - ax.y * ax.y)) * DB.hexR * 0.93 + Math.abs(ax.y) * H1;
    if (this.p.y - lowest < 0) {
      this.p.y = lowest;
      if (this.v.y < -0.6) onLand?.(this, -this.v.y);
      this.v.y = -this.v.y * 0.18; this.v.x *= 0.4; this.v.z *= 0.4; this.w.multiplyScalar(0.3);
      // the handle settles level, the hexagon on a flat
      const lev = new THREE.Vector3(ax.x, 0, ax.z).normalize();
      if (lev.lengthSq() > 0.5) this.q.slerp(new THREE.Quaternion().setFromUnitVectors(ax, lev).multiply(this.q), 0.5);
      if (++this.landed > 12 && this.v.lengthSq() < 0.01) this.rest = true;
    }
  }
  draw(alpha) { this.g.position.lerpVectors(this.prevP, this.p, alpha); this.g.quaternion.slerpQuaternions(this.prevQ, this.q, alpha); }
  dispose() { this.scene.remove(this.g); }
}
