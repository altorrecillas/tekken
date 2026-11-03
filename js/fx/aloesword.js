// Noemí's aloe vera sword (her PUÑETALITY, js/fight/fatality.js): a blade grown from a fleshy aloe leaf, waxy
// grey-green with the pale flecks of a young leaf, soft teeth along both edges and the leaf's crescent cross-section;
// a grip wrapped in gauze, two leaflets of the plant's crown as the guard and a pharmacy's green cross, lit, on the
// pommel. Built from code, nothing to download.
//
// Frame of the group: the origin is where the fist closes round the grip, +Y runs along the blade to the tip, +Z is
// across the blade (the cutting edge's side), X is the flat's normal. uniforms: grow (0..1, how much of the blade has
// come out of the hilt, a green glow at its front), blood (0..1, how much of it is covered), glow.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HAND_SCALE } from '../anim/body.js';

export const BLADE = { y0: 0.072, len: 0.9, w: 0.074, t: 0.024 };
// where the grip sits in the fist and the diagonal it lies on across the fingers, fitted by tools/swordgrip.mjs (the
// closed fingers just touching the grip all round, none through it, the palm against it) for a fist of GRIP_FIST
const GRIP_X = -0.02, GRIP_Z = -0.018, GRIP_TILT = 0.2;
export const GRIP_FIST = 0.75;

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a seeded generator: the same sword every time
function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the leaf along its length s (0 at the base, 1 at the tip): width (lanceolate, a slight waist where it leaves the
// hilt), thickness (fleshy at the base, thin at the point) and the sweep of its curve (towards its back, -z)
const leafW = (s, W) => W * (1 - Math.pow(ss(0.28, 1, s), 1.1)) * (0.82 + 0.18 * ss(0, 0.07, s));
const leafT = (s, T) => T * (0.22 + 0.78 * Math.pow(1 - s, 0.75)) * (1 - 0.8 * ss(0.9, 1, s));

// One leaf as two surfaces meeting at sharp edges: the upper face a shallow channel, the lower a keel. uv: x across
// (0 at -z, 1 at +z), y = s along it.
function leafGeometry({ L, W, T, sweep = 0, nl = 56, nw = 12, y0 = 0 }) {
  const pos = [], uv = [], idx = [];
  const ring = (s) => {
    const w = leafW(s, W), t = leafT(s, T), zo = -sweep * s * s, y = y0 + s * L;
    const top = [], bot = [];
    for (let j = 0; j <= nw; j++) {
      const u = -1 + 2 * j / nw, k = Math.max(0, 1 - u * u);
      const h = t / 2 * Math.sqrt(k), K = 0.3 * t * k;
      top.push([h * 0.75 - K, y, u * w / 2 + zo, (u + 1) / 2, s]);
      bot.push([-h - 0.4 * K, y, u * w / 2 + zo, (u + 1) / 2, s]);
    }
    return [top, bot];
  };
  const rings = [];
  for (let i = 0; i <= nl; i++) { const s = Math.pow(i / nl, 0.9); rings.push(ring(s)); }
  for (const side of [0, 1]) {
    const base = pos.length / 3;
    for (const r of rings) for (const v of r[side]) { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); }
    const n = nw + 1;
    for (let i = 0; i < nl; i++) for (let j = 0; j < nw; j++) {
      const a = base + i * n + j, b = a + n, c = a + 1, d = b + 1;
      // (the upper face looks along +x, the keel along -x)
      if (side === 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// the soft teeth of the leaf's margins: small cones leaning towards the tip, pale with a reddish point (colour)
function teethGeometry({ L, W, sweep, y0 }) {
  const parts = [], R = rng(7);
  const up = new THREE.Vector3(0, 1, 0);
  for (const sg of [-1, 1]) {
    for (let s = 0.07 + R() * 0.01; s < 0.9; s += 0.026 + R() * 0.006) {
      const w = leafW(s, W), k = w / W;
      if (k < 0.12) continue;
      const hgt = 0.0035 + 0.0065 * Math.pow(k, 0.6), r = 0.0012 + 0.0016 * Math.sqrt(k);
      const g = new THREE.ConeGeometry(r, hgt, 5, 1, true);
      g.translate(0, hgt / 2, 0);
      const d = new THREE.Vector3(0, Math.sin(0.62), sg * Math.cos(0.62)).normalize();
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d));
      g.translate(0, y0 + s * L, sg * (w / 2 - 0.0006) - sweep * s * s);
      const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        // (how far out along the tooth: pale green-white at its root, a dry reddish brown at its point)
        const out = Math.min(1, Math.max(0, (Math.abs(p.getZ(i) - (-sweep * s * s)) - (w / 2 - 0.0006)) / hgt * 1.2));
        const c0 = [0.62, 0.7, 0.42], c1 = [0.5, 0.2, 0.12];
        for (let q = 0; q < 3; q++) col[i * 3 + q] = c0[q] + (c1[q] - c0[q]) * Math.pow(out, 1.4);
        uv[i * 2] = sg > 0 ? 1 : 0; uv[i * 2 + 1] = s;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.deleteAttribute('normal'); g.computeVertexNormals();
      parts.push(g.index ? g.toNonIndexed() : g);
    }
  }
  return mergeGeometries(parts);
}

// the leaf's skin: grey-green with a bluish waxy bloom, darker margins and channel, fine lengthwise veins, pale
// elongated flecks in loose bands across it (a young aloe's), a dry brown point; and its relief for the normal map
function leafTextures() {
  const Wd = 256, Ht = 1024, R = rng(42);
  const c = document.createElement('canvas'); c.width = Wd; c.height = Ht;
  const g = c.getContext('2d');
  const h = document.createElement('canvas'); h.width = Wd; h.height = Ht;
  const hg = h.getContext('2d');
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, Wd, Ht);
  // base colour across the width (y on the canvas runs along the blade: row 0 is the tip, as the texture is flipped)
  const across = g.createLinearGradient(0, 0, Wd, 0);
  across.addColorStop(0, '#4f6b3a'); across.addColorStop(0.08, '#64824a'); across.addColorStop(0.3, '#7a9a5e');
  across.addColorStop(0.5, '#86a56a'); across.addColorStop(0.7, '#7a9a5e'); across.addColorStop(0.92, '#64824a'); across.addColorStop(1, '#4f6b3a');
  g.fillStyle = across; g.fillRect(0, 0, Wd, Ht);
  // the waxy bloom: a bluish haze, stronger towards the base
  const bloom = g.createLinearGradient(0, 0, 0, Ht);
  bloom.addColorStop(0, 'rgba(150,175,160,0.05)'); bloom.addColorStop(1, 'rgba(150,180,170,0.28)');
  g.fillStyle = bloom; g.fillRect(0, 0, Wd, Ht);
  // lengthwise veins
  for (let i = 0; i < 90; i++) {
    const x = R() * Wd, a = 0.04 + R() * 0.06, light = R() < 0.5;
    g.strokeStyle = light ? `rgba(200,225,180,${a})` : `rgba(30,50,25,${a})`;
    g.lineWidth = 0.6 + R() * 1.2;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (R() - 0.5) * 6, Ht * 0.3, x + (R() - 0.5) * 6, Ht * 0.7, x + (R() - 0.5) * 4, Ht); g.stroke();
    hg.strokeStyle = `rgba(${light ? 150 : 100},${light ? 150 : 100},${light ? 150 : 100},0.5)`; hg.lineWidth = g.lineWidth;
    hg.beginPath(); hg.moveTo(x, 0); hg.lineTo(x, Ht); hg.stroke();
  }
  // flecks: elongated across the blade, in loose bands, many near the base and fewer towards the tip
  for (let band = 0; band < 46; band++) {
    const yb = Ht * (0.06 + 0.94 * Math.pow(R(), 0.7)), dens = (yb / Ht);
    const n = Math.round(4 + 12 * dens);
    for (let k = 0; k < n; k++) {
      const x = 14 + R() * (Wd - 28), y = yb + (R() - 0.5) * 22, rw = 3 + R() * 9, rh = 1.2 + R() * 2.2, rot = (R() - 0.5) * 0.5;
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = `rgba(222,236,205,${0.35 + R() * 0.4})`;
      g.beginPath(); g.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      hg.save(); hg.translate(x, y); hg.rotate(rot);
      const hgr = hg.createRadialGradient(0, 0, 0, 0, 0, rw);
      hgr.addColorStop(0, 'rgba(200,200,200,0.9)'); hgr.addColorStop(1, 'rgba(128,128,128,0)');
      hg.fillStyle = hgr; hg.scale(1, rh / rw); hg.beginPath(); hg.arc(0, 0, rw, 0, Math.PI * 2); hg.fill();
      hg.restore();
    }
  }
  // the margins: a thin pinkish-brown line
  for (const x of [1.5, Wd - 1.5]) { g.strokeStyle = 'rgba(150,95,70,0.75)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Ht); g.stroke(); }
  // the point dries brown
  const tip = g.createLinearGradient(0, 0, 0, Ht * 0.07);
  tip.addColorStop(0, 'rgba(120,80,45,0.95)'); tip.addColorStop(1, 'rgba(120,80,45,0)');
  g.fillStyle = tip; g.fillRect(0, 0, Wd, Ht * 0.07);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  // normal map from the relief (central differences)
  const hd = hg.getImageData(0, 0, Wd, Ht).data, nd = new Uint8ClampedArray(Wd * Ht * 4);
  const H = (x, y) => hd[(((y + Ht) % Ht) * Wd + ((x + Wd) % Wd)) * 4] / 255;
  for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
    const l = Math.hypot(dx, dy, 1), i = (y * Wd + x) * 4;
    nd[i] = (-dx / l * 0.5 + 0.5) * 255; nd[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd[i + 3] = 255;
  }
  const nc = document.createElement('canvas'); nc.width = Wd; nc.height = Ht;
  nc.getContext('2d').putImageData(new ImageData(nd, Wd, Ht), 0, 0);
  const normalMap = new THREE.CanvasTexture(nc);
  normalMap.colorSpace = THREE.NoColorSpace; normalMap.anisotropy = 8;
  return { map, normalMap };
}

// gauze wrapped round and round the grip, each turn overlapping the last
function gauzeTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), R = rng(3);
  g.fillStyle = '#e9e5da'; g.fillRect(0, 0, N, N);
  // the weave
  for (let i = 0; i < N; i += 3) { g.fillStyle = `rgba(150,140,120,${0.06 + R() * 0.05})`; g.fillRect(i, 0, 1, N); g.fillRect(0, i, N, 1); }
  // the turns: diagonal bands with a soft shadow under each edge
  for (let k = -6; k < 12; k++) {
    const y0 = k * 34;
    const gr = g.createLinearGradient(0, y0, 0, y0 + 34);
    gr.addColorStop(0, 'rgba(90,80,65,0.32)'); gr.addColorStop(0.12, 'rgba(90,80,65,0)'); gr.addColorStop(0.85, 'rgba(255,255,250,0.08)'); gr.addColorStop(1, 'rgba(255,255,250,0)');
    g.save(); g.transform(1, 0.28, 0, 1, 0, 0); g.fillStyle = gr; g.fillRect(-20, y0, N + 40, 34); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2.2); t.anisotropy = 4;
  return t;
}

const NOISE_GLSL = `
float pdbH21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float pdbVN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( pdbH21( i ), pdbH21( i + vec2( 1, 0 ) ), f.x ), mix( pdbH21( i + vec2( 0, 1 ) ), pdbH21( i + vec2( 1, 1 ) ), f.x ), f.y ); }`;

// the blade's own shading: it grows out of the hilt (fragments past `grow` are not there yet, a green glow at the
// front), and blood smeared over it from the edge that cut, wet and glossy
function bladeShader(mat, U, teeth = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrow = U.grow; sh.uniforms.uBlood = U.blood; sh.uniforms.uGlow = U.glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLeaf;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvLeaf = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vLeaf; uniform float uGrow, uBlood, uGlow;${NOISE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if ( vLeaf.y > uGrow ) discard;
        float pdbB = 0.0;
        if ( uBlood > 0.001 ) {
          // smears drawn across the blade from the cutting edge (+z, uv.x = 1), thickest over the middle of the blade
          // that went through; streaks along it where it was wiped, drops at their ends
          float n1 = pdbVN( vec2( vLeaf.x * 5.0, vLeaf.y * 38.0 ) ), n2 = pdbVN( vec2( vLeaf.x * 21.0, vLeaf.y * 140.0 ) );
          float region = smoothstep( 0.05, 0.25, vLeaf.y ) * ( 1.0 - smoothstep( 0.72, 0.97, vLeaf.y ) );
          float edge = mix( 0.55, 1.0, smoothstep( 0.2, 1.0, vLeaf.x ) );
          float m = region * edge * ( 0.62 * n1 + 0.38 * n2 );
          pdbB = smoothstep( 0.62 - 0.5 * uBlood, 0.66 - 0.5 * uBlood, m + 0.18 * uBlood );
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.16, 0.004, 0.006 ), pdbB );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.1, pdbB );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // the front of the blade as it grows out, and a living glow while it is summoned
        float pdbG = ( uGrow - vLeaf.y ) / 0.035, pdbF = uGrow < 0.999 ? exp( -pdbG * pdbG ) : 0.0;
        totalEmissiveRadiance += vec3( 0.35, 1.0, 0.45 ) * ( pdbF * 4.0 + uGlow * 0.06 ) * ( 1.0 - pdbB );`);
    if (!sh.fragmentShader.includes('pdbF')) console.warn('aloe sword: shader not patched');
  };
  mat.customProgramCacheKey = () => 'aloeSword' + (teeth ? 't' : 'b');
}

export function makeAloeSword() {
  const U = { grow: { value: 1 }, blood: { value: 0 }, glow: { value: 0 } };
  const group = new THREE.Group();
  group.name = 'aloeSword';
  const { map, normalMap } = leafTextures();
  const bladeMat = new THREE.MeshPhysicalMaterial({
    map, normalMap, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.4, metalness: 0,
    clearcoat: 0.6, clearcoatRoughness: 0.28, sheen: 0.35, sheenColor: new THREE.Color(0.55, 0.75, 0.5), sheenRoughness: 0.5,
    specularIntensity: 0.7, side: THREE.DoubleSide,
  });
  bladeShader(bladeMat, U);
  const sweep = 0.045;
  const blade = new THREE.Mesh(leafGeometry({ L: BLADE.len, W: BLADE.w, T: BLADE.t, sweep, y0: BLADE.y0 }), bladeMat);
  const teethMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3, color: 0xffffff });
  bladeShader(teethMat, U, true);
  const teeth = new THREE.Mesh(teethGeometry({ L: BLADE.len, W: BLADE.w, sweep, y0: BLADE.y0 }), teethMat);
  // the guard: two leaflets of the plant's crown curling out along the edges and two short ones over the flats
  const leafletMat = new THREE.MeshPhysicalMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 0.3, sheenColor: new THREE.Color(0.55, 0.75, 0.5), side: THREE.DoubleSide });
  const guard = new THREE.Group();
  for (const [ax, sg, len, w] of [['z', 1, 0.095, 0.03], ['z', -1, 0.095, 0.03], ['x', 1, 0.055, 0.022], ['x', -1, 0.055, 0.022]]) {
    const lg = leafGeometry({ L: len, W: w, T: w * 0.32, sweep: -0.012, nl: 16, nw: 6 });
    const m = new THREE.Mesh(lg, leafletMat);
    // (each leaflet leans out from the blade's root and curls back up towards the tip)
    if (ax === 'z') { m.rotation.x = sg * 1.05; m.position.set(0, 0.052, sg * 0.006); }
    else { m.rotation.order = 'ZXY'; m.rotation.z = -sg * 1.0; m.rotation.y = Math.PI / 2; m.position.set(sg * 0.006, 0.055, 0); }
    guard.add(m);
  }
  // a collar where the leaves meet the grip
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.0145, 0.02, 20), new THREE.MeshPhysicalMaterial({ color: 0x5f7d46, roughness: 0.5, clearcoat: 0.4 }));
  collar.position.y = 0.06;
  // the grip
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0145, 0.118, 24, 1, true), new THREE.MeshStandardMaterial({ map: gauzeTexture(), roughness: 0.95, metalness: 0 }));
  grip.position.y = -0.005;
  // the pommel: a little chrome cap and the green cross of a pharmacy, glowing
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.014, 0.012, 24), new THREE.MeshPhysicalMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.22, clearcoat: 0.5 }));
  cap.position.y = -0.07;
  const crossMat = new THREE.MeshStandardMaterial({ color: 0x0c3a18, emissive: 0x2bff6a, emissiveIntensity: 2.6, roughness: 0.35 });
  const cross = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.044, 0.014), crossMat), b = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.044), crossMat);
  cross.add(a, b);
  cross.position.y = -0.098;
  group.add(blade, teeth, guard, collar, grip, cap, cross);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // where the blade starts and ends, in the group's frame (trails, blood, the camera)
  const base = new THREE.Vector3(0, BLADE.y0 + 0.03, 0), tip = new THREE.Vector3(0, BLADE.y0 + BLADE.len, -sweep);
  return { group, U, base, tip, blade, teeth, crossMat, mats: [bladeMat, teethMat, leafletMat] };
}

// The sword in a fighter's right fist: the grip through the closed hand (across it, index to little finger), the
// blade out of the thumb's side with its edge the way the knuckles point. Measured on the rest pose (the bones are
// world-aligned there), like the win-pose phone of js/fx/accessories.js. Hidden until it is drawn.
export function attachAloeSword(ch, sw, side = 'R') {
  const R = (n) => ch.rest[n].head;
  const W = R(`wrist.${side}`), K = R(`finger3-1.${side}`), f2 = R(`finger2-1.${side}`), f5 = R(`finger5-1.${side}`);
  const dir = K.clone().sub(W).normalize(), across = f2.clone().sub(f5).normalize();
  const palm = new THREE.Vector3().crossVectors(dir, across).normalize();
  if (side === 'R') palm.negate();
  const Y = across.clone(), Z = dir.clone().addScaledVector(Y, -dir.dot(Y)).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  const hand = W.distanceTo(K);
  // the grip lies across the fingers on a slight diagonal (from the heel of the hand to the root of the index finger),
  // so the blade leans the way the knuckles point instead of standing square to the forearm
  const c = Math.cos(GRIP_TILT), s = Math.sin(GRIP_TILT);
  const Y2 = Y.clone().multiplyScalar(c).addScaledVector(Z, s), Z2 = Z.clone().multiplyScalar(c).addScaledVector(Y, -s);
  const g = sw.group;
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y2, Z2));
  // in the fist's hollow (offsets in metres of the scaled hand, the bone's units are the rest pose's)
  g.position.copy(dir).multiplyScalar(hand * 0.74).addScaledVector(palm, hand * 0.42)
    .addScaledVector(X, GRIP_X / HAND_SCALE).addScaledVector(Z2, GRIP_Z / HAND_SCALE);
  // the wrist bone is scaled up (bigger hands, js/anim/body.js HAND_SCALE, set by the rig): the place in the fist
  // scales with the hand, the sword keeps its own size
  g.scale.setScalar(1 / HAND_SCALE);
  g.visible = false;
  ch.bones[`wrist.${side}`].add(g);
  return g;
}
