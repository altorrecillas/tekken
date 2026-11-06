// Dani's tennis kit (his PUÑETALITY, js/fight/fatality.js): a racket and a ball, built from code.
//
// The racket: a modern graphite frame (a 100 square inch oval head, the beam a rounded box deeper than it is wide, an
// open throat of two arms, an octagonal handle under a white overgrip, a bumper strip over the tip), its strings a bed
// of mains and crosses with a fox's "Z" stencilled on them (El Zorro Plateado). Frame of the group: the origin at the
// middle of the grip (where the fist closes), +Y along the racket to the tip, the strings in the YZ plane, their face
// looking along X (the palm's side, js/fx/aloesword.js attachInFist). center: the middle of the strings.
//
// The ball: optic yellow felt, fuzzy (sheen), the white seam curling round it.
import * as THREE from 'three';

export const RACKET = { butt: -0.07, handleTop: 0.11, headC: 0.455, a: 0.165, b: 0.125, beamW: 0.0125, beamD: 0.024 };
export const BALL_R = 0.0335;
// where the grip sits in the fist: across the palm on a strong diagonal (from the heel of the hand to between the
// thumb and the index), so the racket carries on from the forearm at a tennis player's angle (tools/swordgrip.mjs)
export const RACKET_GRIP = { x: -0.026, z: -0.002, tilt: 0.95 };
export const RACKET_FIST = 0.8;

function rng(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// a beam swept along a closed or open curve in the YZ plane: a rounded box (w across in the plane, d along X)
function sweep(points, closed, w, d, M = 14) {
  const pos = [], nor = [], uv = [], idx = [];
  const n = points.length, rc = Math.min(w, d) * 0.45;
  // the rounded box's outline, its normals
  const prof = [];
  const hw = w / 2, hd = d / 2;
  const corners = [[hw - rc, hd - rc, 0], [-(hw - rc), hd - rc, Math.PI / 2], [-(hw - rc), -(hd - rc), Math.PI], [hw - rc, -(hd - rc), Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= M / 4; k++) { const a = a0 + (k / (M / 4)) * Math.PI / 2; prof.push([cx + Math.cos(a) * rc, cy + Math.sin(a) * rc, Math.cos(a), Math.sin(a)]); }
  const P = prof.length;
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)], o = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const t = new THREE.Vector3().subVectors(q, o).normalize();
    // across, in the plane (the curve's own normal) and the face normal X
    const nx = new THREE.Vector3(1, 0, 0), across = new THREE.Vector3().crossVectors(t, nx).normalize();
    for (let k = 0; k < P; k++) {
      const [a, b, na, nb] = prof[k];
      pos.push(p.x + nx.x * b + across.x * a, p.y + nx.y * b + across.y * a, p.z + nx.z * b + across.z * a);
      const nn = across.clone().multiplyScalar(na).addScaledVector(nx, nb).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push(i / (n - 1), k / (P - 1));
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) for (let k = 0; k < P - 1; k++) {
    const a = i * P + k, b = ((i + 1) % n) * P + k;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// the paint of the frame along its length: graphite black, an electric blue band and silver pinstripes
function frameTexture() {
  const W = 1024, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#16181c'; g.fillRect(0, 0, W, H);
  // (the weave of the graphite under the clear coat)
  const R = rng(4);
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(255,255,255,${0.015 + R() * 0.025})`; g.fillRect(R() * W, R() * H, 2 + R() * 6, 1); }
  // blue sweeps up the sides of the head (u: round the oval from its tip)
  const band = (u0, u1) => { const gr = g.createLinearGradient(u0 * W, 0, u1 * W, 0); gr.addColorStop(0, 'rgba(25,90,230,0)'); gr.addColorStop(0.15, '#1d5fe6'); gr.addColorStop(0.85, '#1d5fe6'); gr.addColorStop(1, 'rgba(25,90,230,0)'); g.fillStyle = gr; g.fillRect(u0 * W, H * 0.18, (u1 - u0) * W, H * 0.64); };
  band(0.16, 0.36); band(0.64, 0.84);
  g.fillStyle = '#c9ced6'; for (const u of [0.15, 0.37, 0.63, 0.85]) g.fillRect(u * W, H * 0.12, 3, H * 0.76);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// the overgrip: white, wound round and round, each turn overlapping the last
function gripTexture() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#eceef0'; g.fillRect(0, 0, N, N);
  for (let k = -4; k < 10; k++) {
    g.save(); g.transform(1, 0.35, 0, 1, 0, 0);
    const y0 = k * 22, gr = g.createLinearGradient(0, y0, 0, y0 + 22);
    gr.addColorStop(0, 'rgba(60,64,70,0.45)'); gr.addColorStop(0.1, 'rgba(60,64,70,0)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(150,155,160,0.3)');
    g.fillStyle = gr; g.fillRect(-20, y0, N + 40, 22); g.restore();
  }
  const R = rng(8);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.05})`; g.fillRect(R() * N, R() * N, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
  return t;
}
// the string bed: 16 mains along the racket, 19 crosses, a "Z" stencilled on them; colour (white strings, the stencil
// silver-grey), alpha (where there is string)
function stringTextures() {
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  const a = document.createElement('canvas'); a.width = a.height = N;
  // (a faint film between the strings: from a little way off a string bed reads as a fine grey mesh, not as nothing,
  // once the lines are averaged away)
  const ga = a.getContext('2d'); ga.fillStyle = '#2e2e2e'; ga.fillRect(0, 0, N, N);
  g.fillStyle = '#bdb9ad'; g.fillRect(0, 0, N, N);
  // uv: u across the head (z), v along it (y); the head's oval fills the square
  const mains = 16, crosses = 19, sw = 8;
  ga.fillStyle = '#fff'; g.fillStyle = '#f2efe2';
  for (let i = 0; i < mains; i++) { const x = (i + 0.5) / mains * N; ga.fillRect(x - sw / 2, 0, sw, N); g.fillRect(x - sw / 2, 0, sw, N); }
  for (let j = 0; j < crosses; j++) { const y = (j + 0.5) / crosses * N; ga.fillRect(0, y - sw / 2, N, sw); g.fillRect(0, y - sw / 2, N, sw); }
  // (where they cross, a little shade: they weave over and under)
  g.fillStyle = 'rgba(80,80,70,0.35)';
  for (let i = 0; i < mains; i++) for (let j = 0; j < crosses; j++) if ((i + j) % 2) g.fillRect((i + 0.5) / mains * N - sw / 2, (j + 0.5) / crosses * N - sw / 2, sw, sw);
  // the stencil: a bold Z in the middle, only where there is string
  g.save(); g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#3c4148'; g.font = `bold ${N * 0.56}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.translate(N / 2, N / 2); g.scale(1, -1); g.fillText('Z', 0, N * 0.02);
  g.restore();
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const alpha = new THREE.CanvasTexture(a); alpha.anisotropy = 8;
  return { map, alpha };
}
// the ball's felt: optic yellow, a fine fuzz noise, the seam's white groove
function ballTexture() {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#d6ec2c'; g.fillRect(0, 0, W, H);
  const R = rng(21);
  for (let i = 0; i < 9000; i++) { const v = R(); g.fillStyle = v < 0.5 ? `rgba(120,140,10,${0.05 + R() * 0.08})` : `rgba(250,255,190,${0.05 + R() * 0.1})`; g.fillRect(R() * W, R() * H, 1 + R() * 2, 1); }
  // the seam: x = (1-k) cos t + k cos 3t, y = (1-k) sin t - k sin 3t, z = 2 sqrt(k(1-k)) sin 2t (on the unit sphere)
  const k = 0.25, s = 2 * Math.sqrt(k * (1 - k));
  for (let i = 0; i < 4000; i++) {
    const t = i / 4000 * Math.PI * 2;
    const x = (1 - k) * Math.cos(t) + k * Math.cos(3 * t), y = (1 - k) * Math.sin(t) - k * Math.sin(3 * t), z = s * Math.sin(2 * t);
    const lon = Math.atan2(x, z), lat = Math.asin(Math.max(-1, Math.min(1, y)));
    const u = (lon / (Math.PI * 2) + 0.5) * W, v = (0.5 - lat / Math.PI) * H;
    const rx = 3.4 / Math.max(0.2, Math.cos(lat)), ry = 3.4;
    g.fillStyle = '#f4f6ee';
    for (const du of [0, -W, W]) { g.beginPath(); g.ellipse(u + du, v, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function makeRacket() {
  const R = RACKET, group = new THREE.Group(); group.name = 'racket';
  const U = { blood: { value: 0 } };
  // the head: the oval beam
  const head = [];
  for (let i = 0; i < 120; i++) { const th = i / 120 * Math.PI * 2; head.push(new THREE.Vector3(0, R.headC + R.a * Math.cos(th), R.b * Math.sin(th))); }
  const frameMat = new THREE.MeshPhysicalMaterial({ map: frameTexture(), roughness: 0.38, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 });
  const headM = new THREE.Mesh(sweep(head, true, R.beamW, R.beamD), frameMat);
  // the throat: two arms from the bottom of the head into the shaft
  const arm = (sg) => {
    const th0 = Math.PI - 0.5;
    const p0 = new THREE.Vector3(0, R.headC + R.a * Math.cos(th0), sg * R.b * Math.sin(th0));
    const curve = new THREE.CatmullRomCurve3([p0, new THREE.Vector3(0, p0.y - 0.06, sg * 0.05), new THREE.Vector3(0, 0.17, sg * 0.016), new THREE.Vector3(0, 0.135, 0)]);
    return sweep(curve.getPoints(30), false, 0.016, 0.021);
  };
  const throatL = new THREE.Mesh(arm(1), frameMat), throatR = new THREE.Mesh(arm(-1), frameMat);
  // the bridge across the bottom of the strings
  const bridge = new THREE.Mesh(sweep([new THREE.Vector3(0, R.headC - R.a + 0.012, -0.055), new THREE.Vector3(0, R.headC - R.a + 0.006, 0), new THREE.Vector3(0, R.headC - R.a + 0.012, 0.055)], false, 0.01, 0.02), frameMat);
  // the shaft's taper and the octagonal handle under its overgrip, the butt cap
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.0135, 0.04, 8), new THREE.MeshPhysicalMaterial({ color: 0x15171b, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 }));
  shaft.position.y = R.handleTop + 0.018; shaft.rotation.y = Math.PI / 8;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0142, 0.0148, R.handleTop - R.butt, 8, 1), new THREE.MeshStandardMaterial({ map: gripTexture(), roughness: 0.82 }));
  handle.position.y = (R.handleTop + R.butt) / 2; handle.rotation.y = Math.PI / 8;
  const capMat = new THREE.MeshPhysicalMaterial({ color: 0x1d5fe6, roughness: 0.3, clearcoat: 1 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0162, 0.012, 8), capMat);
  cap.position.y = R.butt - 0.004; cap.rotation.y = Math.PI / 8;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0152, 0.015, 0.012, 8), capMat);
  collar.position.y = R.handleTop; collar.rotation.y = Math.PI / 8;
  // the bumper strip over the tip
  const bump = [];
  for (let i = 0; i <= 30; i++) { const th = -0.75 + i / 30 * 1.5; bump.push(new THREE.Vector3(0, R.headC + (R.a + 0.0065) * Math.cos(th), (R.b + 0.0065) * Math.sin(th))); }
  const bumper = new THREE.Mesh(sweep(bump, false, 0.004, 0.02), new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.75 }));
  // the strings
  const { map, alpha } = stringTextures();
  const sh = new THREE.Shape(); sh.absellipse(0, 0, R.b - 0.007, R.a - 0.007, 0, Math.PI * 2, false, 0);
  const sg = new THREE.ShapeGeometry(sh, 48);
  const p = sg.attributes.position, uv = sg.attributes.uv;
  for (let i = 0; i < p.count; i++) { const zz = p.getX(i), yy = p.getY(i); uv.setXY(i, zz / (2 * (R.b - 0.007)) + 0.5, yy / (2 * (R.a - 0.007)) + 0.5); p.setXYZ(i, 0, R.headC + yy, zz); }
  sg.computeVertexNormals();
  const stringMat = new THREE.MeshStandardMaterial({ map, alphaMap: alpha, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.45 });
  const strings = new THREE.Mesh(sg, stringMat);
  strings.renderOrder = 4; strings.userData.noGTAO = true;
  group.add(headM, throatL, throatR, bridge, shaft, handle, cap, collar, bumper, strings);
  group.traverse((o) => { if (o.isMesh && o !== strings) { o.castShadow = true; o.receiveShadow = true; } });
  const mats = [frameMat, shaft.material, handle.material, capMat, bumper.material, stringMat];
  return { group, U, mats, center: new THREE.Vector3(0, R.headC, 0), tip: new THREE.Vector3(0, R.headC + R.a, 0), face: new THREE.Vector3(1, 0, 0) };
}

// the ball (radius BALL_R), a felt that drinks blood (blood: 0..1)
export function makeBall() {
  const U = { blood: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.92, sheen: 1, sheenColor: new THREE.Color(0.85, 0.95, 0.5), sheenRoughness: 0.55 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uBallBlood = U.blood;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBallP;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBallP = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBallP; uniform float uBallBlood;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bb = uBallBlood * smoothstep( 0.2, 0.9, 0.5 + 0.5 * sin( vBallP.x * 210.0 ) * sin( vBallP.y * 170.0 + 1.3 ) * sin( vBallP.z * 190.0 ) + 0.35 * uBallBlood );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.12, 0.005, 0.006 ), bb );`)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n\t#ifdef USE_SHEEN\n\t\tmaterial.sheenColor *= 1.0 - bb;\n\t#endif');
  };
  mat.customProgramCacheKey = () => 'tennisBall';
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 16), mat);
  mesh.castShadow = true; mesh.name = 'tennisBall';
  return { mesh, U, mat };
}
