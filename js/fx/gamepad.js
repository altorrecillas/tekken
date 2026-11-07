// Aleix's PUÑETALITY prop: a game controller (the shape of the one he plays with: the wide body, the two grips, the
// sticks offset, the four coloured face buttons; no maker's logo, the guide button is a plain lit ring), built here
// from shapes at its real size (15 cm across) and drawn up to giant size by the move (js/fight/fatality.js, ALEIX).
// Its own axes: +x its left (the left stick's side), +y out of its face, +z towards its top edge (the bumpers); the
// origin in the middle of the body. What it does in the move: buttons pressed (lit, sunk), sticks pushed, the guide
// ring glowing, rumbling (the director shakes it) and breaking up into pixels at the end (dissolve: a voxel grid in
// the world, cells dropping out with a lit edge, little cubes flying off).
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const PAD = { W: 0.153, D: 0.105, T: 0.012, BEV: 0.0085 };
// the top of the face at (x, z), its own metres (the body's top cap, the bevel and the dome)
export function padTop(x, z) { return PAD.T / 2 + PAD.BEV + dome(x, z); }
function dome(x, z) { const u = x / 0.078, v = (z - 0.004) / 0.062; return 0.0035 * Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v); }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the layout of the face (x, z): sticks, d-pad, the four buttons round their centre, the small buttons
export const LAYOUT = {
  LS: [0.041, 0.013], RS: [-0.021, -0.013], DPAD: [0.021, -0.013], ABXY: [-0.041, 0.013], GUIDE: [0, 0.029],
  VIEW: [0.012, 0.011], MENU: [-0.012, 0.011], SHARE: [0, 0.004], btn: 0.0098,
};
const FACE = { A: [0, -1], B: [-1, 0], X: [1, 0], Y: [0, 1] };
export const BUTTON_COLOR = { A: [0.28, 0.78, 0.18], B: [0.9, 0.16, 0.14], X: [0.16, 0.42, 0.95], Y: [0.98, 0.76, 0.1] };

// the outline seen from above (shape x = its x, shape y = its z): the top edge, the shoulders, the grips
function outline() {
  const s = new THREE.Shape();
  const R = [
    // [control x, control y, end x, end y] quadratic segments, right side (shape x < 0 = its right) from the top centre
    [-0.022, 0.0505, -0.046, 0.0495],
    [-0.069, 0.0515, -0.0745, 0.027],
    [-0.0795, 0.004, -0.0715, -0.022],
    [-0.0665, -0.054, -0.0515, -0.0585],
    [-0.0365, -0.062, -0.0305, -0.045],
    [-0.0215, -0.024, 0, -0.0215],
  ];
  s.moveTo(0, 0.0485);
  for (const [cx, cy, x, y] of R) s.quadraticCurveTo(cx, cy, x, y);
  // the left side: the same, mirrored, back up to the top
  const L = [];
  let px = 0, py = -0.0215;
  for (let i = R.length - 1; i >= 0; i--) {
    const [cx, cy] = R[i], prev = i > 0 ? R[i - 1] : [0, 0, 0, 0.0485];
    L.push([-cx, cy, -prev[2], prev[3]]);
  }
  for (const [cx, cy, x, y] of L) { s.quadraticCurveTo(cx, cy, x, y); px = x; py = y; }
  return s;
}

function bodyGeometry() {
  let g = new THREE.ExtrudeGeometry(outline(), { depth: PAD.T, bevelEnabled: true, bevelThickness: PAD.BEV, bevelSize: 0.0082, bevelSegments: 8, curveSegments: 56 });
  // shape (x, y) -> its (x, z); the extrusion -> its y, centred
  g.rotateX(Math.PI / 2);
  g.translate(0, PAD.T / 2, 0);
  // (the caps are one fan of long triangles: cut fine, so the dome and the grips bend smoothly)
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g.clearGroups();
  g = mergeVertices(new TessellateModifier(0.0035, 10).modify(g), 1e-7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0) p.setY(i, y + dome(x, z) * smooth(0, PAD.T / 2, y));
    else {
      // the grips: fuller underneath towards their ends; the middle of the back a little rounded
      const gr = smooth(0.016, 0.046, Math.abs(x)) * smooth(0.004, -0.04, z);
      // (lying face up it rests on its grips, 8 mm lower than the middle of its back: js/fight/padpath.js PADP)
      const back = 0.004 * Math.max(0, 1 - (x / 0.07) ** 2) * Math.max(0, 1 - ((z - 0.01) / 0.05) ** 2);
      p.setY(i, y - (0.008 * gr + back) * smooth(0, -PAD.T / 2 - PAD.BEV, y));
    }
  }
  // (the plastic's grain: a projection from above)
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / 0.16 + 0.5; uv[i * 2 + 1] = p.getZ(i) / 0.11 + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// a turned part: the profile [r, y] pairs round the y axis
const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), seg);

// the letter printed on a face button: white with a soft dark edge, on a canvas
function letterTex(ch) {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  g.clearRect(0, 0, n, n);
  g.font = `bold ${n * 0.62}px Rajdhani, Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = n * 0.06; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeText(ch, n / 2, n / 2 + n * 0.03);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillText(ch, n / 2, n / 2 + n * 0.03);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// the plastic's fine grain (a roughness speckle), so a giant one is not a smooth toy
function grainTex() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  let s = 7;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * n; i++) { const v = 150 + (R() - 0.5) * 70; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
}

// ------------------------------------------------------------------ the pixel dissolve (all its materials)
const DIS_VS = ['#include <common>', '#include <common>\nvarying vec3 vDisW;'];
const DIS_VS2 = ['#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvDisW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'];
const DIS_FS = `
varying vec3 vDisW; uniform float uDis, uVox, uDisH0, uDisH1;
float disHash( vec3 c ) { c = fract( c * vec3( 0.1031, 0.1030, 0.0973 ) ); c += dot( c, c.yxz + 33.33 ); return fract( ( c.x + c.y ) * c.z ); }`;
function dissolvePatch(mat, U) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    sh.uniforms.uDis = U.dis; sh.uniforms.uVox = U.vox; sh.uniforms.uDisH0 = U.h0; sh.uniforms.uDisH1 = U.h1;
    sh.vertexShader = sh.vertexShader.replace(...DIS_VS).replace(...DIS_VS2);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + DIS_FS)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
	float fDisE = 0.0;
	if ( uDis > 0.0 ) {
		// a cell of the voxel grid goes when the sweep (top down, each cell a little early or late) passes it
		vec3 cell = floor( vDisW / uVox );
		float hgt = clamp( ( vDisW.y - uDisH0 ) / max( 1e-3, uDisH1 - uDisH0 ), 0.0, 1.0 );
		float thr = uDis * 1.6 - 0.3 + ( disHash( cell ) - 0.5 ) * 0.55 - ( 1.0 - hgt ) * 0.25;
		float k = 1.0 - hgt;
		if ( k < thr ) discard;
		fDisE = 1.0 - smoothstep( 0.0, 0.07, k - thr );
	}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vec3( 0.35, 1.1, 1.6 ) * fDisE * 2.2;');
  };
  const pk = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|padDis';
}

export function makeGamepad() {
  const root = new THREE.Group(), pad = new THREE.Group();
  root.add(pad);
  const geos = [], mats = [], texs = [];
  const U = { dis: { value: 0 }, vox: { value: 0.08 }, h0: { value: 0 }, h1: { value: 1 } };
  const G = (g) => (geos.push(g), g);
  const M = (m) => (mats.push(m), dissolvePatch(m, U), m);
  const mesh = (g, m, parent = pad) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

  const grain = grainTex(); texs.push(grain);
  const shell = M(new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(0.026, 0.027, 0.03, THREE.SRGBColorSpace), roughness: 0.66, roughnessMap: grain, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.5 }));
  const rubber = M(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.05, 0.052, 0.056, THREE.SRGBColorSpace), roughness: 0.92, metalness: 0 }));
  const dark = M(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.018, 0.019, 0.021, THREE.SRGBColorSpace), roughness: 0.35, metalness: 0.1 }));
  const gloss = M(new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(0.02, 0.021, 0.024, THREE.SRGBColorSpace), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const dpadMat = M(new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.09, 0.095, 0.1, THREE.SRGBColorSpace), roughness: 0.3, metalness: 0.75 }));
  const ringMat = M(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0.85, 0.92, 1.0), emissiveIntensity: 0.6, roughness: 0.3 }));

  // the body
  const body = mesh(G(bodyGeometry()), shell);

  // the sticks: a ring set in the face, the stem and the cap (dished, a rubber rim)
  const stickGeo = { base: G(lathe([[0.0132, -0.001], [0.0128, 0.0012], [0.0112, 0.0018], [0.0104, 0.0006]])), stem: G(new THREE.CylinderGeometry(0.0042, 0.0052, 0.009, 20)),
    cap: G(lathe([[0.0001, 0.0098], [0.0055, 0.0094], [0.0079, 0.0101], [0.0089, 0.0106], [0.009, 0.0094], [0.0082, 0.0072], [0.0052, 0.0066], [0.0045, 0.0055]])) };
  const sticks = {};
  for (const k of ['LS', 'RS']) {
    const [x, z] = LAYOUT[k], y = padTop(x, z);
    mesh(stickGeo.base, dark).position.set(x, y, z);
    const piv = new THREE.Group(); piv.position.set(x, y - 0.0015, z); pad.add(piv);
    mesh(stickGeo.stem, dark, piv).position.y = 0.0045;
    mesh(stickGeo.cap, rubber, piv);
    sticks[k] = piv;
  }
  // the d-pad: a dished metal disc with a cross on it
  {
    const [x, z] = LAYOUT.DPAD, y = padTop(x, z);
    mesh(G(lathe([[0.0001, 0.0026], [0.0095, 0.0018], [0.0118, 0.0024], [0.0121, 0.0008], [0.0118, -0.001]])), dpadMat).position.set(x, y, z);
    const arm = G(new THREE.BoxGeometry(0.0205, 0.0022, 0.0064));
    const a1 = mesh(arm, dpadMat); a1.position.set(x, y + 0.0029, z);
    const a2 = mesh(arm, dpadMat); a2.position.set(x, y + 0.0029, z); a2.rotation.y = Math.PI / 2;
  }
  // the four buttons: domed, glossy, the colour through them, the letter on top; they light and sink when pressed
  const btnGeo = G(lathe([[0.0001, 0.0042], [0.0028, 0.0040], [0.0046, 0.0033], [0.0054, 0.0021], [0.0056, -0.0005]]));
  const letGeo = G(new THREE.CircleGeometry(0.0037, 32));
  const buttons = {};
  for (const k of ['A', 'B', 'X', 'Y']) {
    const [cx, cz] = LAYOUT.ABXY, [dx, dz] = FACE[k];
    const x = cx + dx * LAYOUT.btn, z = cz + dz * LAYOUT.btn, y = padTop(x, z);
    const col = new THREE.Color().setRGB(...BUTTON_COLOR[k], THREE.SRGBColorSpace);
    const mat = M(new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, emissive: col, emissiveIntensity: 0.22 }));
    const g = new THREE.Group(); g.position.set(x, y, z); pad.add(g);
    mesh(G(new THREE.CylinderGeometry(0.0064, 0.0064, 0.0016, 28)), dark, g).position.y = 0.0002;
    mesh(btnGeo, mat, g);
    const lt = letterTex(k); texs.push(lt);
    const lm = M(new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const l = new THREE.Mesh(letGeo, lm); l.rotation.set(-Math.PI / 2, 0, Math.PI); l.position.y = 0.00425; g.add(l);
    buttons[k] = { g, mat, base: 0.22, y0: y };
  }
  // the guide button: glossy black with a lit ring (no logo); view, menu and share
  {
    const [x, z] = LAYOUT.GUIDE, y = padTop(x, z);
    mesh(G(lathe([[0.0001, 0.0022], [0.0062, 0.0019], [0.0074, 0.0008], [0.0076, -0.0005]])), gloss).position.set(x, y, z);
    const ring = mesh(G(new THREE.TorusGeometry(0.0079, 0.00075, 10, 48)), ringMat); ring.position.set(x, y + 0.0003, z); ring.rotation.x = Math.PI / 2;
    const dot = mesh(G(new THREE.CircleGeometry(0.0028, 24)), ringMat); dot.position.set(x, y + 0.0023, z); dot.rotation.x = -Math.PI / 2;
    for (const k of ['VIEW', 'MENU', 'SHARE']) {
      const [bx, bz] = LAYOUT[k], by = padTop(bx, bz);
      const b = mesh(G(new THREE.CapsuleGeometry(0.0022, k === 'SHARE' ? 0.0026 : 0.0006, 4, 12)), gloss);
      b.position.set(bx, by + 0.0004, bz); b.rotation.z = Math.PI / 2; b.scale.y = k === 'SHARE' ? 1 : 0.9;
    }
  }
  // the bumpers along the top edge and the triggers behind them
  {
    const bump = new THREE.Shape();
    bump.moveTo(0.012, 0.0); bump.quadraticCurveTo(0.04, 0.006, 0.062, -0.004); bump.quadraticCurveTo(0.071, -0.012, 0.073, -0.022);
    bump.lineTo(0.066, -0.022); bump.quadraticCurveTo(0.063, -0.01, 0.055, -0.006); bump.quadraticCurveTo(0.035, 0.0, 0.012, -0.006); bump.closePath();
    const bg = G(new THREE.ExtrudeGeometry(bump, { depth: 0.0085, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 3, curveSegments: 16 }));
    bg.rotateX(Math.PI / 2); // shape y -> z
    const tg = G(new THREE.BoxGeometry(0.026, 0.016, 0.012, 2, 2, 2));
    for (const sgn of [1, -1]) {
      const b = mesh(bg, gloss); b.scale.x = -sgn; b.position.set(0, 0.0072, 0.0525); // (its left: shape mirrored)
      const t = mesh(tg, dark); t.position.set(sgn * 0.046, -0.006, 0.05); t.rotation.x = -0.45;
    }
    // the port between them
    const port = mesh(G(new THREE.BoxGeometry(0.009, 0.003, 0.004)), dark); port.position.set(0, 0.0, 0.0565);
  }

  // the power-up sparks round it as it grows (the buttons' colours) and the pixels it breaks up into
  const SP = 140, sg = new THREE.BufferGeometry(), spos = new Float32Array(SP * 3), scol = new Float32Array(SP * 3), sal = new Float32Array(SP);
  sg.setAttribute('position', new THREE.BufferAttribute(spos, 3).setUsage(THREE.DynamicDrawUsage));
  sg.setAttribute('color', new THREE.BufferAttribute(scol, 3).setUsage(THREE.DynamicDrawUsage));
  sg.setAttribute('alpha', new THREE.BufferAttribute(sal, 1).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
    vertexShader: 'attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (2.0 + 9.0 * alpha) * projectionMatrix[1][1] / -mv.z * 0.06; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; varying vec3 vC; void main(){ vec2 q = abs(gl_PointCoord - 0.5) * 2.0; float d = max(q.x, q.y); if (d > 1.0) discard; float c = exp(-dot(q, q) * 3.0); gl_FragColor = vec4(vC * vA * (0.6 + 1.6 * c), 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sparks.frustumCulled = false; sparks.renderOrder = 14; sparks.userData.noGTAO = true; sparks.userData.noAO = true;
  const sparkList = [];
  // the pixels: little cubes, the plastic's black and the buttons' colours, lit
  const NV = 260, vg = G(new THREE.BoxGeometry(1, 1, 1));
  const vm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.0, vertexColors: false });
  mats.push(vm);
  vm.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance = diffuseColor.rgb * vGlow * 3.0;');
  };
  const voxels = new THREE.InstancedMesh(vg, vm, NV);
  voxels.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NV * 3), 3);
  const vglow = new THREE.InstancedBufferAttribute(new Float32Array(NV), 1); vg.setAttribute('aGlow', vglow);
  voxels.count = 0; voxels.frustumCulled = false; voxels.castShadow = true; voxels.userData.noGTAO = true;
  const voxList = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

  const api = {
    root, pad, body, buttons, sticks, mats, geos, sparks, voxels, U,
    // its own scale (1: real size)
    setScale(s) { pad.scale.setScalar(s); U.vox.value = Math.max(0.004, 0.0055 * s); },
    press(k, amount) { const b = buttons[k]; if (!b) return; b.g.position.y = b.y0 - 0.0018 * amount; b.mat.emissiveIntensity = b.base + 2.6 * amount; },
    stick(k, x, y) { const s = sticks[k]; if (s) s.rotation.set(-y * 0.32, 0, -x * 0.32); },
    glow(k) { ringMat.emissiveIntensity = 0.6 + 3.2 * k; },
    // the dissolve: 0 whole, 1 gone; h0/h1 the world heights it sweeps between
    dissolve(k, h0, h1) { U.dis.value = k; U.h0.value = h0; U.h1.value = h1; },
    // sparks: emitted at world points p with a velocity v, the colour of a button (or white)
    spark(p, v, col, life = 0.8) { if (sparkList.length < SP) sparkList.push({ p: p.clone(), v: v.clone(), c: col, age: 0, life }); },
    pixel(p, v, size, col, glow = 1, life = 1.2) { if (voxList.length < NV) voxList.push({ p: p.clone(), v: v.clone(), w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(9), q: new THREE.Quaternion(), s: size, c: col, glow, age: 0, life }); },
    update(dt) {
      let k = 0;
      for (const q of sparkList) { q.age += dt; if (q.age >= q.life) continue; q.v.y += 0.6 * dt; q.v.multiplyScalar(1 - 1.6 * dt); q.p.addScaledVector(q.v, dt); sparkList[k++] = q; }
      sparkList.length = k;
      for (let i = 0; i < SP; i++) {
        const q = sparkList[i];
        if (!q) { sal[i] = 0; continue; }
        spos.set(q.p.toArray(), i * 3); scol.set(q.c, i * 3); sal[i] = Math.sin(Math.min(1, q.age / q.life) * Math.PI) * 1.2;
      }
      sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; sg.attributes.alpha.needsUpdate = true;
      sg.setDrawRange(0, sparkList.length);
      k = 0;
      for (const q of voxList) {
        q.age += dt; if (q.age >= q.life) continue;
        q.v.y -= 2.2 * dt; q.v.multiplyScalar(1 - 0.9 * dt); q.p.addScaledVector(q.v, dt);
        q.q.multiply(_q.setFromAxisAngle(_s.copy(q.w).normalize(), q.w.length() * dt));
        voxList[k++] = q;
      }
      voxList.length = k;
      for (let i = 0; i < voxList.length; i++) {
        const q = voxList[i], f = q.age / q.life, sz = q.s * (f < 0.7 ? 1 : 1 - (f - 0.7) / 0.3);
        _m.compose(q.p, q.q, _s.setScalar(Math.max(1e-4, sz)));
        voxels.setMatrixAt(i, _m); voxels.setColorAt(i, _c.setRGB(q.c[0], q.c[1], q.c[2]));
        vglow.setX(i, q.glow * (1 - f));
      }
      voxels.count = voxList.length;
      voxels.instanceMatrix.needsUpdate = true; if (voxels.instanceColor) voxels.instanceColor.needsUpdate = true; vglow.needsUpdate = true;
    },
    dispose() {
      root.parent?.remove(root); sparks.parent?.remove(sparks); voxels.parent?.remove(voxels);
      for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); for (const t of texs) t.dispose();
      sg.dispose(); sparks.material.dispose();
    },
  };
  return api;
}

// ------------------------------------------------------------------ the loser, flattened under it
// His whole body pressed down to the floor (the character's group scaled: down to `thin` of his height, spread out
// round his feet) and bloodied: patches of blood over everything once crushed (a world-space noise, deepening), the
// hair hidden (flattened cards would fan out into spikes). restore() gives him back as he was.
const CRUSH_GLSL = `
uniform float uCrush;
varying vec3 vCrW;
float crH( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float crN( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( crH( i ), crH( i + vec3( 1, 0, 0 ) ), f.x ), mix( crH( i + vec3( 0, 1, 0 ) ), crH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( crH( i + vec3( 0, 0, 1 ) ), crH( i + vec3( 1, 0, 1 ) ), f.x ), mix( crH( i + vec3( 0, 1, 1 ) ), crH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`;
export class Pancake {
  constructor(ch, oil = false) {
    this.ch = ch; this.oil = oil;
    this.U = { crush: { value: 0 } };
    this.saved = [];
    this.hidden = [];
    for (const mesh of Object.values(ch.meshes)) {
      if (!mesh.isMesh || !mesh.material || /eye|cornea|lash/i.test(mesh.name)) continue;
      const mt = mesh.material, m = mt.clone();
      m.userData = { ...mt.userData };
      if (mt.defines) m.defines = { ...mt.defines };
      const prev = mt.onBeforeCompile, pk = mt.customProgramCacheKey && mt.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mt.customProgramCacheKey.bind(mt) : null;
      const U = this.U, col = oil ? 'vec3( 0.02, 0.015, 0.009 )' : 'vec3( 0.16, 0.006, 0.008 )';
      m.onBeforeCompile = (sh, r) => {
        if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mt, sh, r);
        sh.uniforms.uCrush = U.crush;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCrW;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n\tvCrW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>' + CRUSH_GLSL)
          .replace('#include <color_fragment>', `#include <color_fragment>
	{
		float n = crN( vCrW * 9.0 ) * 0.65 + crN( vCrW * 31.0 ) * 0.35;
		float b = smoothstep( 0.62, 0.35, n - uCrush * 0.55 ) * step( 0.001, uCrush );
		diffuseColor.rgb = mix( diffuseColor.rgb, ${col} * ( 0.7 + 0.6 * n ), b * 0.96 );
		fCrB = b;
	}`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.16, fCrB );')
          .replace('void main() {', 'void main() {\n\tfloat fCrB = 0.0;');
      };
      m.customProgramCacheKey = () => (pk ? pk() : '') + (oil ? '|crushOil' : '|crush');
      this.saved.push([mesh, mt]);
      mesh.material = m;
      if (/hair|beard|brow/i.test(mesh.name)) this.hidden.push(mesh);
    }
  }
  // k: how far down (1 standing, `thin` flat), its spread; bloody: 0..1
  set(sy, bloody) {
    const g = this.ch.group;
    const spread = 1 + Math.max(0, 1 - sy) * 0.75;
    g.scale.set(spread, Math.max(0.02, sy), spread);
    this.U.crush.value = bloody;
    const hide = sy < 0.55;
    for (const m of this.hidden) m.visible = !hide;
  }
  restore() {
    this.ch.group.scale.set(1, 1, 1);
    for (const [mesh, mt] of this.saved) { mesh.material.dispose(); mesh.material = mt; }
    for (const m of this.hidden) m.visible = true;
    this.saved = []; this.hidden = [];
  }
}
