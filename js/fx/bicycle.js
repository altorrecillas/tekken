// Zapponi's bicycle and helmet (his PUÑETALITY, js/fight/fatality.js), made by code. "El Toro": a black road bike with
// red details, its name on the down tube and bull-horn handlebars; a black helmet with red stripes, vents, straps
// and two little horns.
//
// The bike is built in his own axes (x his left, y up, z the way he faces) with the bottom bracket over the origin:
// once he is on it, it hangs from his character's group and moves with him. Its wheels turn about their axles, the
// cranks about the bottom bracket (the pedals kept level), and its paint takes blood (U.blood, more at the front).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// the bike's measures (his axes, m): bottom bracket, axles, wheel radius, crank length, saddle, the hands' places
export const BIKE = {
  bb: new THREE.Vector3(0, 0.27, 0), rear: new THREE.Vector3(0, 0.336, -0.405), front: new THREE.Vector3(0, 0.336, 0.59),
  R: 0.336, crank: 0.172, saddle: new THREE.Vector3(0, 0.955, -0.215),
  // the wrists on the horns (left, right: x his left), and where the ankle sits over a pedal's spindle
  gripL: new THREE.Vector3(0.21, 0.915, 0.565), gripR: new THREE.Vector3(-0.21, 0.915, 0.565), ankle: new THREE.Vector3(0, 0.075, -0.085),
  stance: 0.115,
};

const _up = new THREE.Vector3(0, 1, 0);
// a tube from a to b (radius r0 at a, r1 at b), n sides
function tube(a, b, r0, r1 = r0, n = 14) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, n, 1, false);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g.toNonIndexed();
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the paint: blood spattered on it from the front (U.blood 0..1), wet and dark
function bloodied(mat, U, front = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBlood = U.blood;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBkP;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBkP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBkP; uniform float uBlood;
float bkH( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float bkN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( bkH( i ), bkH( i + vec3( 1, 0, 0 ) ), f.x ), mix( bkH( i + vec3( 0, 1, 0 ) ), bkH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( bkH( i + vec3( 0, 0, 1 ) ), bkH( i + vec3( 1, 0, 1 ) ), f.x ), mix( bkH( i + vec3( 0, 1, 1 ) ), bkH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bkK = uBlood * ( ${front.toFixed(2)} > 0.5 ? smoothstep( -0.5, 0.7, vBkP.z ) : 1.0 );
        float bkS = smoothstep( 0.72, 0.78, bkN( vBkP * 55.0 ) * 0.6 + bkN( vBkP * 160.0 ) * 0.4 + bkK * 0.3 ) * step( 0.001, uBlood );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.13, 0.004, 0.006 ), bkS * 0.95 );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.12, bkS );');
  };
  mat.customProgramCacheKey = () => 'bikeBlood' + front;
  return mat;
}

function nameTexture(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 64);
  g.font = 'italic 900 50px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#f4f1ea'; g.strokeText(text, 256, 34);
  g.fillStyle = '#d0141c'; g.fillText(text, 256, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function makeBicycle() {
  const U = { blood: { value: 0 } };
  const group = new THREE.Group(); group.name = 'bicycle';
  const mats = [];
  const M = (o, front = 1) => { const m = bloodied(new THREE.MeshPhysicalMaterial(o), U, front); mats.push(m); return m; };
  const paint = M({ color: 0x0b0b0d, roughness: 0.32, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const red = M({ color: 0xb30f16, roughness: 0.35, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const alu = M({ color: 0x9a9da3, roughness: 0.3, metalness: 0.9 });
  const darkAlu = M({ color: 0x2a2b2e, roughness: 0.4, metalness: 0.8 });
  const rubber = M({ color: 0x141414, roughness: 0.92, metalness: 0 });
  const carbon = M({ color: 0x18181a, roughness: 0.28, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
  const B = BIKE, bb = B.bb, ra = B.rear, fa = B.front;

  // ---- the frame: tubes merged in one mesh (black), the fork, the stays
  const st = V(0, 0.79, -0.152), ht1 = V(0, 0.8, 0.455), ht0 = V(0, 0.645, 0.5);
  const fr = [
    tube(bb, ht0, 0.024, 0.021), tube(bb, st, 0.016, 0.014), tube(st, ht1, 0.015, 0.016), tube(ht0, ht1, 0.021, 0.019),
  ];
  for (const s of [1, -1]) {
    fr.push(tube(V(s * 0.03, bb.y, bb.z - 0.01), V(s * 0.062, ra.y, ra.z), 0.011, 0.007));
    fr.push(tube(V(s * 0.016, st.y - 0.02, st.z - 0.01), V(s * 0.062, ra.y + 0.01, ra.z), 0.009, 0.0065));
    // fork blades, a little raked forwards near the axle
    const crown = V(s * 0.03, ht0.y - 0.02, ht0.z + 0.004), mid = V(s * 0.045, (crown.y + fa.y) / 2, (crown.z + fa.z) / 2 - 0.004);
    fr.push(tube(crown, mid, 0.014, 0.011), tube(mid, V(s * 0.05, fa.y, fa.z), 0.011, 0.007));
  }
  fr.push(tube(V(-0.035, ht0.y - 0.02, ht0.z), V(0.035, ht0.y - 0.02, ht0.z), 0.016, 0.016, 10)); // the crown
  const frameG = mergeGeometries(fr);
  const frame = new THREE.Mesh(frameG, paint); frame.castShadow = true; frame.receiveShadow = true; group.add(frame);
  // the bottom bracket shell across
  const bbs = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.075, 16).rotateZ(Math.PI / 2).translate(bb.x, bb.y, bb.z), paint); bbs.castShadow = true; group.add(bbs);
  // red bands on the head tube and a red stripe under the top tube
  const band = new THREE.Mesh(mergeGeometries([tube(ht0.clone().lerp(ht1, 0.35), ht0.clone().lerp(ht1, 0.6), 0.0215, 0.0205), tube(st.clone().lerp(ht1, 0.1), st.clone().lerp(ht1, 0.2), 0.0158, 0.0162)]), red);
  group.add(band);
  // "EL TORO" on both sides of the down tube
  const nameMat = new THREE.MeshBasicMaterial({ map: nameTexture('EL TORO'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
  mats.push(nameMat);
  const dt = new THREE.Vector3().subVectors(ht0, bb), dl = dt.length(), dmid = bb.clone().lerp(ht0, 0.52);
  for (const s of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(dl * 0.62, dl * 0.62 / 8), nameMat);
    pl.position.copy(dmid).add(V(s * 0.0235, 0, 0));
    const ang = Math.atan2(dt.y, dt.z);
    pl.rotation.set(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    pl.rotateZ(s > 0 ? -ang : ang);
    pl.renderOrder = 2;
    group.add(pl);
  }
  // seatpost and saddle (a padded teardrop, black with a red stripe)
  const sp = new THREE.Mesh(tube(st.clone().add(V(0, -0.03, 0.009)), B.saddle.clone().add(V(0, -0.03, 0.012)), 0.0135, 0.0135), darkAlu); sp.castShadow = true; group.add(sp);
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.135); sh.bezierCurveTo(0.018, 0.12, 0.022, 0.03, 0.035, -0.02); sh.bezierCurveTo(0.075, -0.08, 0.075, -0.13, 0.04, -0.145);
  sh.bezierCurveTo(0.015, -0.152, -0.015, -0.152, -0.04, -0.145); sh.bezierCurveTo(-0.075, -0.13, -0.075, -0.08, -0.035, -0.02); sh.bezierCurveTo(-0.022, 0.03, -0.018, 0.12, 0, 0.135);
  const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 4, curveSegments: 16 });
  sg.rotateX(-Math.PI / 2); sg.translate(0, -0.015, 0);
  const saddle = new THREE.Mesh(sg, M({ color: 0x101011, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0.2, 0.2, 0.22) }, 0));
  saddle.position.copy(B.saddle).add(V(0, -0.012, 0.015)); saddle.castShadow = true; group.add(saddle);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.2), red); stripe.position.copy(B.saddle).add(V(0, 0.0175, 0.0)); group.add(stripe);
  // steerer, spacers, stem, the bull horns (red tape) and their levers, the bell
  const steer = V(0, ht1.y + 0.045, ht1.z - 0.012);
  group.add(new THREE.Mesh(tube(ht1, steer, 0.0155, 0.0155), darkAlu));
  const clamp = V(0, 0.86, 0.565);
  const stem = new THREE.Mesh(tube(steer.clone().add(V(0, -0.01, 0)), clamp, 0.016, 0.014), darkAlu); stem.castShadow = true; group.add(stem);
  const tape = M({ color: 0xa50e15, roughness: 0.7, sheen: 0.4, sheenColor: new THREE.Color(0.6, 0.1, 0.1) });
  const bars = [];
  for (const s of [1, -1]) {
    const c = new THREE.CatmullRomCurve3([V(0, clamp.y, clamp.z), V(s * 0.1, clamp.y, clamp.z - 0.004), V(s * 0.185, clamp.y + 0.002, clamp.z - 0.01), V(s * 0.215, clamp.y + 0.01, clamp.z + 0.03),
      V(s * 0.215, clamp.y + 0.03, clamp.z + 0.09), V(s * 0.205, clamp.y + 0.075, clamp.z + 0.145)]);
    bars.push(new THREE.TubeGeometry(c, 30, 0.0125, 10, false));
    // the brake lever at the horn's tip, and its end cap
    const tip = V(s * 0.205, clamp.y + 0.075, clamp.z + 0.145);
    group.add(new THREE.Mesh(tube(tip.clone().add(V(0, -0.005, -0.03)), tip.clone().add(V(0, -0.075, 0.005)), 0.006, 0.004), alu));
  }
  const barM = new THREE.Mesh(mergeGeometries(bars), tape); barM.castShadow = true; group.add(barM);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), alu);
  bell.position.set(-0.075, clamp.y + 0.012, clamp.z); group.add(bell);
  // the bottle on the down tube
  const bottle = new THREE.Group();
  const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.19, 18), M({ color: 0xf2f0ea, roughness: 0.45 }, 0)); bottle.add(bc);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.03, 14).translate(0, 0.11, 0), red); bottle.add(cap);
  const bstripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0365, 0.0365, 0.03, 18), red); bottle.add(bstripe);
  // (on the down tube's upper side, along it)
  const dn = V(0, dt.z, -dt.y).normalize();
  bottle.position.copy(bb.clone().lerp(ht0, 0.42)).addScaledVector(dn, 0.064);
  bottle.rotation.x = Math.atan2(dt.z, dt.y);
  group.add(bottle);

  // ---- the wheels: deep carbon rims, black tyres, steel spokes, hubs; the rear one with its cogs
  const wheel = (rearW) => {
    const w = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.RingGeometry(B.R - 0.072, B.R - 0.018, 64, 1).rotateY(Math.PI / 2), carbon); w.add(rim);
    const rimO = new THREE.Mesh(new THREE.TorusGeometry(B.R - 0.02, 0.0105, 8, 64).rotateY(Math.PI / 2), carbon); w.add(rimO);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(B.R - 0.0115, 0.0122, 10, 72).rotateY(Math.PI / 2), rubber); tyre.castShadow = true; w.add(tyre);
    const sp = [];
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2, s = i % 2 ? 1 : -1;
      const p0 = V(s * 0.028, Math.sin(a + s * 0.12) * 0.03, Math.cos(a + s * 0.12) * 0.03), p1 = V(s * 0.004, Math.sin(a) * (B.R - 0.07), Math.cos(a) * (B.R - 0.07));
      sp.push(tube(p0, p1, 0.0011, 0.0011, 4));
    }
    w.add(new THREE.Mesh(mergeGeometries(sp), alu));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.1, 14).rotateZ(Math.PI / 2), darkAlu); w.add(hub);
    for (const s of [1, -1]) { const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 18).rotateZ(Math.PI / 2).translate(s * 0.028, 0, 0), alu); w.add(fl); }
    if (rearW) for (let i = 0; i < 6; i++) { const cg = new THREE.Mesh(new THREE.CylinderGeometry(0.025 + i * 0.0045, 0.025 + i * 0.0045, 0.0022, 24).rotateZ(Math.PI / 2).translate(-0.022 - i * 0.004, 0, 0), alu); w.add(cg); }
    return w;
  };
  const rearW = wheel(true), frontW = wheel(false);
  rearW.position.copy(ra); frontW.position.copy(fa);
  group.add(rearW, frontW);

  // ---- the drivetrain (on his right, -x): chainring with its spider, cranks, pedals, the chain, the derailleur
  const crank = new THREE.Group(); crank.position.copy(bb); group.add(crank);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.004, 6, 64).rotateY(Math.PI / 2).translate(-0.05, 0, 0), alu); crank.add(ring);
  const teeth = [];
  for (let i = 0; i < 52; i++) { const a = i / 52 * Math.PI * 2; const b = new THREE.BoxGeometry(0.003, 0.007, 0.006); b.rotateX(-a); b.translate(-0.05, Math.sin(a) * 0.104, Math.cos(a) * 0.104); teeth.push(b.toNonIndexed()); }
  crank.add(new THREE.Mesh(mergeGeometries(teeth), alu));
  const spider = [];
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; spider.push(tube(V(-0.048, 0, 0), V(-0.05, Math.sin(a) * 0.095, Math.cos(a) * 0.095), 0.007, 0.005, 6)); }
  crank.add(new THREE.Mesh(mergeGeometries(spider), darkAlu));
  // (the crank arms: the right one along +z at angle 0, the left one opposite; each pedal on its own pivot)
  const pedals = {};
  for (const [s, side] of [[-1, 'R'], [1, 'L']]) {
    const dir = side === 'R' ? 1 : -1;
    const arm = new THREE.Mesh(tube(V(s * 0.058, 0, 0), V(s * 0.082, 0, dir * B.crank), 0.009, 0.007, 8), darkAlu); arm.castShadow = true; crank.add(arm);
    const piv = new THREE.Group(); piv.position.set(s * 0.085, 0, dir * B.crank); crank.add(piv);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.09), M({ color: 0x151517, roughness: 0.5 }, 0)); body.position.x = s * 0.042; body.castShadow = true; piv.add(body);
    const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.03), red); cleat.position.set(s * 0.042, 0.01, 0); piv.add(cleat);
    pedals[side] = piv;
  }
  const chainPts = [];
  const cogR = 0.04, chR = 0.1;
  for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 - i / 16 * Math.PI; chainPts.push(V(-0.05, bb.y + Math.sin(a) * chR, bb.z + Math.cos(a) * chR)); }
  chainPts.push(V(-0.045, ra.y - 0.09, ra.z + 0.03), V(-0.045, ra.y - 0.06, ra.z - 0.01));
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 - i / 12 * Math.PI; chainPts.push(V(-0.042, ra.y + Math.sin(a) * cogR, ra.z + Math.cos(a) * cogR)); }
  const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts, true), 140, 0.0035, 5, true), darkAlu); group.add(chain);
  const der = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.03), darkAlu); der.position.set(-0.055, ra.y - 0.05, ra.z + 0.01); der.rotation.x = 0.4; group.add(der);
  // brake calipers over the tyres
  for (const [p, z] of [[V(0, fa.y + B.R + 0.03, fa.z - 0.01), 0], [V(0, ra.y + B.R + 0.025, ra.z + 0.02), 0]]) { const cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.025), darkAlu); cal.position.copy(p); group.add(cal); }

  group.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  return { group, front: frontW, rear: rearW, crank, pedals, bell, mats, U, geos: collectGeos(group), textures: [nameMat.map] };
}

function collectGeos(g) { const out = new Set(); g.traverse((o) => { if (o.geometry) out.add(o.geometry); }); return [...out]; }

// the wheels and cranks: wheel turned by `wheel` (rad, rolling forwards), cranks at c (rad: 0 = the right pedal
// forwards, increasing as he pedals forwards: the right pedal at bb + (0, -crank sin c, crank cos c)), pedals level
export function poseBicycle(bk, wheel, c) {
  bk.front.rotation.x = wheel; bk.rear.rotation.x = wheel;
  bk.crank.rotation.x = c;
  for (const s of ['L', 'R']) bk.pedals[s].rotation.x = -c;
}
// where the ankle goes for a crank angle (his axes): side 'R' or 'L' (the left pedal half a turn on)
export function ankleAt(c, side, out = new THREE.Vector3()) {
  const a = side === 'R' ? c : c + Math.PI;
  return out.set(side === 'R' ? -BIKE.stance : BIKE.stance, BIKE.bb.y - BIKE.crank * Math.sin(a), BIKE.bb.z + BIKE.crank * Math.cos(a)).add(BIKE.ankle);
}

// ------------------------------------------------------------------ the helmet
// head: the head bone's rest head (the helmet hangs from that bone), cr: the cranium's box above the eyes
// ({min, max}: rest space), chin: the chin's lowest point (rest space)
function helmetTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  // (a view from above: x across, z front to back, the front at the bottom)
  g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, N, N);
  // red stripes either side of the middle, and a thin white pinline
  for (const s of [-1, 1]) {
    g.fillStyle = '#b8111a'; g.fillRect(N / 2 + s * 70 - 18, 0, 36, N);
    g.fillStyle = '#e9e6de'; g.fillRect(N / 2 + s * 70 + s * 22 - 2, 0, 4, N);
  }
  // the vents: long slots front to back in rows, dark inside with a lit lower lip
  const slot = (x, y, w, h) => {
    g.fillStyle = '#020203'; g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(120,120,128,0.55)'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y + 1, w, h, 0, 0.2, Math.PI - 0.2); g.stroke();
  };
  for (const [x, y0, y1, w] of [[0, 120, 400, 12], [-38, 140, 380, 11], [38, 140, 380, 11], [-110, 170, 350, 10], [110, 170, 350, 10], [-150, 210, 320, 8], [150, 210, 320, 8]]) {
    const n = 2; const L = (y1 - y0) / n;
    for (let k = 0; k < n; k++) slot(N / 2 + x, y0 + L * (k + 0.5), w, L * 0.42);
  }
  // the front edge's black lip
  g.fillStyle = '#050506'; g.fillRect(0, N - 26, N, 26);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function makeHelmet(head, cr, chin) {
  const U = { blood: { value: 0 } };
  const group = new THREE.Group(); group.name = 'helmet';
  const mats = [];
  // the shell: an ellipsoid round the cranium, a bit of foam all round, tilted (its front edge over the brow, its back
  // down over the occiput), its back drawn out a little
  const cx = (cr.min.x + cr.max.x) / 2, cz = (cr.min.z + cr.max.z) / 2 - 0.004;
  const rx = (cr.max.x - cr.min.x) / 2 + 0.026, rz = (cr.max.z - cr.min.z) / 2 + 0.038, ry = 0.118, cy = cr.max.y + 0.022 - ry;
  const geo = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const P = geo.attributes.position, UV = geo.attributes.uv;
  const tilt = -0.3, ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i) * rx, y = P.getY(i) * ry, z = P.getZ(i) * rz;
    if (z < 0) { z *= 1.1; y -= 0.012 * (-z / rz); }
    UV.setXY(i, 0.5 + x / (rx * 2.2), 0.5 + z / (rz * 2.3));
    const y2 = y * ct - z * st, z2 = y * st + z * ct;
    P.setXYZ(i, x + cx - head.x, y2 + cy - head.y, z2 + cz - head.z);
  }
  geo.computeVertexNormals();
  const shellMat = bloodied(new THREE.MeshPhysicalMaterial({ map: helmetTexture(), roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.FrontSide }), U, 0);
  mats.push(shellMat);
  const shell = new THREE.Mesh(geo, shellMat); shell.castShadow = true; group.add(shell);
  // the foam inside (seen at the edge)
  const inner = new THREE.Mesh(geo.clone(), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95, side: THREE.BackSide }));
  inner.scale.setScalar(0.985); mats.push(inner.material); group.add(inner);
  // two little horns on top, El Toro's, forwards and out
  const hornMat = new THREE.MeshPhysicalMaterial({ color: 0xe8dcc0, roughness: 0.4, clearcoat: 0.6 }); mats.push(hornMat);
  for (const s of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const k = i / 8; pts.push(new THREE.Vector2(0.011 * (1 - k) + 0.0012, k * 0.055)); }
    const hg = new THREE.LatheGeometry(pts, 10);
    const pp = hg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const y = pp.getY(i), k = y / 0.055; pp.setX(i, pp.getX(i) + s * 0.012 * k * k); pp.setZ(i, pp.getZ(i) + 0.022 * k * k); }
    hg.computeVertexNormals();
    // (darker tips)
    const col = new Float32Array(pp.count * 3); for (let i = 0; i < pp.count; i++) { const k = pp.getY(i) / 0.055, d = 1 - 0.65 * Math.max(0, k - 0.6) / 0.4; col.set([d, d * 0.95, d * 0.9], i * 3); }
    hg.setAttribute('color', new THREE.BufferAttribute(col, 3)); hornMat.vertexColors = true;
    const horn = new THREE.Mesh(hg, hornMat);
    horn.position.set(cx + s * rx * 0.62 - head.x, cy + ry * 0.62 - head.y, cz + rz * 0.18 - head.z);
    horn.rotation.set(-0.25, 0, -s * 0.55);
    horn.castShadow = true; group.add(horn);
  }
  // the straps: in front of and behind each ear down to a join under it, and on to the buckle under the chin
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.75 }); mats.push(strapMat);
  const buckle = new THREE.Vector3(0, chin.y - 0.016, chin.z - 0.03);
  const L = (v) => v.clone().sub(head);
  const sg = [];
  for (const s of [1, -1]) {
    const j = new THREE.Vector3(s * (rx - 0.035) + cx, chin.y + 0.05, cz - 0.005);
    const fT = new THREE.Vector3(s * (rx - 0.012) + cx, cy - 0.005 + 0.02, cz + rz * 0.42);
    const bT = new THREE.Vector3(s * (rx - 0.014) + cx, cy - 0.03, cz - rz * 0.42);
    sg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([L(fT), L(fT.clone().lerp(j, 0.5).add(new THREE.Vector3(s * 0.008, 0, 0.004))), L(j)]), 12, 0.0032, 5));
    sg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([L(bT), L(bT.clone().lerp(j, 0.5).add(new THREE.Vector3(s * 0.01, 0, 0))), L(j)]), 12, 0.0032, 5));
    sg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([L(j), L(j.clone().lerp(buckle, 0.55).add(new THREE.Vector3(s * 0.012, -0.006, 0.01))), L(buckle.clone().add(new THREE.Vector3(s * 0.012, 0, 0)))]), 14, 0.0032, 5));
  }
  const straps = new THREE.Mesh(mergeGeometries(sg), strapMat); group.add(straps);
  const bk = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.018), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.3 }));
  mats.push(bk.material); bk.position.copy(L(buckle)); group.add(bk);
  group.userData.straps = [straps, bk];
  return { group, mats, U, geos: collectGeos(group), textures: [shellMat.map], center: new THREE.Vector3(cx, cy, cz).sub(head), r: new THREE.Vector3(rx, ry, rz) };
}
