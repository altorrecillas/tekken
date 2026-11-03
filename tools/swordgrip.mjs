import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => ({ createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, ellipse() {}, fill() {}, scale() {}, arc() {}, transform() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Rig } = await import(GAME + '/js/anim/rig.js');
const { makePose } = await import(GAME + '/js/anim/poses.js');
const { makeAloeSword, attachAloeSword } = await import(GAME + '/js/fx/aloesword.js');
const id = process.argv[2] || 'noemi';
const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const b = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
const ch = buildCharacter({ id, base: '', meta, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }, () => new THREE.MeshBasicMaterial());
const sw = makeAloeSword(); attachAloeSword(ch, sw);
const rig = new Rig(ch);

// fit: for each fist closure, the grip's axis (its tilt across the fingers and its offset) that the closed fingers
// wrap best round: every finger's phalanges just touching the grip, none through it, the palm clear of it
const RG = +(process.env.RG || 0.0135), RF = 0.0085, RP = 0.013;
const v3 = () => new THREE.Vector3();
const wb = ch.bones['wrist.R'];
function segDist(P, D, a, b) { // distance between the infinite line P + tD and the segment ab
  const u = D, w = v3().subVectors(b, a), r = v3().subVectors(a, P);
  const A = 1, B = u.dot(w), C = w.dot(w), Dd = u.dot(r), E = w.dot(r), den = A * C - B * B;
  let t = den > 1e-12 ? (B * Dd - A * E) / den : 0; t = Math.max(0, Math.min(1, t));
  const q = v3().copy(a).addScaledVector(w, t), pr = v3().subVectors(q, P);
  return pr.addScaledVector(D, -pr.dot(D)).length();
}
const best = [];
for (const fist of (process.env.FIST ? process.env.FIST.split(',').map(Number) : [0.7, 0.75, 0.8, 0.85, 0.9, 0.95])) {
  rig.apply(makePose({ handR: [0.3, 0, 0.42], aimR: 1, fistR: fist, twistR: 0, hgR: 0 }));
  ch.group.updateMatrixWorld(true);
  // everything in the sword's untilted frame at the reference place (attach with tilt 0 and no offsets)
  const inv = new THREE.Matrix4().copy(wb.matrixWorld).invert();
  const P = (n) => ch.bones[n].getWorldPosition(v3()).applyMatrix4(inv);   // wrist-local (scaled hand: units x1/1.2)
  const SC = 1.2; const L = (n) => P(n).multiplyScalar(SC);                 // metres in the hand's scale
  const fingers = [2, 3, 4, 5].map((k) => { const j1 = L(`finger${k}-1.R`), j2 = L(`finger${k}-2.R`), j3 = L(`finger${k}-3.R`); return [j1, j2, j3, j3.clone().addScaledVector(v3().subVectors(j3, j2), 0.85)]; });
  const wr = v3(), meta = [2, 3, 4, 5].map((k) => [wr, L(`finger${k}-1.R`)]);
  // the base frame of attachAloeSword (rest-pose axes are the bone's local axes)
  const R = (n) => ch.rest[n].head;
  const dir = R('finger3-1.R').clone().sub(R('wrist.R')).normalize(), across = R('finger2-1.R').clone().sub(R('finger5-1.R')).normalize();
  const palm = v3().crossVectors(dir, across).normalize().negate();
  const Y = across.clone(), Z = dir.clone().addScaledVector(Y, -dir.dot(Y)).normalize(), X = v3().crossVectors(Y, Z);
  const hand = R('wrist.R').distanceTo(R('finger3-1.R'));
  const base = dir.clone().multiplyScalar(hand * 0.74).addScaledVector(palm, hand * 0.42).multiplyScalar(SC);
  let bestF = null;
  for (let th = +(process.env.TILT ?? 0); th <= +(process.env.TILT ?? 0.8) + 1e-6; th += 0.05) {
    const c = Math.cos(th), s = Math.sin(th), D = Y.clone().multiplyScalar(c).addScaledVector(Z, s).normalize();
    const Z2 = Z.clone().multiplyScalar(c).addScaledVector(Y, -s);
    for (let ox = -0.05; ox <= 0.0301; ox += 0.002) for (let oz = -0.04; oz <= 0.0401; oz += 0.002) {
      const O = base.clone().addScaledVector(X, ox).addScaledVector(Z2, oz);
      let cost = 0;
      for (const F of fingers) {
        let dmin = 1;
        for (let i = 0; i < 3; i++) { const d = segDist(O, D, F[i], F[i + 1]); dmin = Math.min(dmin, d); if (d < RG + RF - 0.002) cost += ((RG + RF - 0.002 - d) * 100) ** 2 * 6; }
        cost += ((dmin - (RG + RF)) * 100) ** 2;
      }
      // the grip rests against the palm (the fingers close round it from the far side, not round a bar outside the fist)
      for (const [a, b] of meta) { const d = segDist(O, D, a, b); if (d < RG + RP) cost += ((RG + RP - d) * 100) ** 2 * 6; else cost += ((d - (RG + RP)) * 100) ** 2 * 0.5; }
      if (!bestF || cost < bestF.cost) bestF = { cost, th, ox, oz };
    }
  }
  console.log('fist', fist, 'best', JSON.stringify({ cost: +bestF.cost.toFixed(2), tilt: +bestF.th.toFixed(2), x: +bestF.ox.toFixed(3), z: +bestF.oz.toFixed(3) }));
}
