// Body proportion audit: bone segment lengths and mesh extents in the rest pose vs adult-male anthropometric norms
// (ratios to stature, Drillis & Contini / NASA anthropometry).
import fs from 'fs';
const GAME = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const ids = ['alejandro', 'arnau', 'camilo', 'rafa', 'zapponi', 'dani', 'noemi'];
const REF = { head: [0.130, 0.12, 0.14], shoulderW: [0.259, 0.24, 0.28], upperArm: [0.186, 0.17, 0.20], forearm: [0.146, 0.135, 0.16],
  hand: [0.108, 0.10, 0.117], thigh: [0.245, 0.23, 0.26], shank: [0.246, 0.23, 0.26], foot: [0.152, 0.14, 0.165], shoe: [0.165, 0.15, 0.18], span: [1.0, 0.97, 1.06],
  wristY: [0.485, 0.46, 0.51], elbowY: [0.63, 0.61, 0.65] };
const rows = [];
for (const id of ids) {
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`));
  const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  const ch = buildCharacter({ id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }, () => new THREE.MeshBasicMaterial());
  const B = {}; for (const b of meta.bones) B[b.name] = { h: new THREE.Vector3(...b.head), t: new THREE.Vector3(...b.tail) };
  const pos = (name) => { const m = ch.meshes[name]; return m ? m.geometry.attributes.position : null; };
  const verts = (name, f) => { const p = pos(name); const out = []; if (!p) return out; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); if (!f || f(v)) out.push(v); } return out; };
  const head = verts('head'), body = verts('body');
  const top = Math.max(...head.map(v => v.y));
  const H = top; // feet on the floor at y = 0
  const chin = B.jaw ? B.jaw.t.y : null;
  const sh = B['upperarm01.L'].h.y;
  const band = body.filter(v => Math.abs(v.y - (sh - 0.02)) < 0.03);
  const shoulderW = Math.max(...band.map(v => v.x)) - Math.min(...band.map(v => v.x));
  const L = (a, b) => B[a].h.distanceTo(B[b].h);
  const tip = B['finger3-3.L'].t;
  const upperArm = L('upperarm01.L', 'lowerarm01.L'), forearm = L('lowerarm01.L', 'wrist.L'), hand = B['wrist.L'].h.distanceTo(tip);
  const thigh = L('upperleg01.L', 'lowerleg01.L'), shank = L('lowerleg01.L', 'foot.L');
  const ankle = B['foot.L'].h;
  const footV = body.filter(v => v.y < 0.13 && Math.abs(v.x - ankle.x) < 0.1);
  const foot = Math.max(...footV.map(v => v.z)) - Math.min(...footV.map(v => v.z));
  const shoeV = verts('shoes', v => v.x * Math.sign(ankle.x) > 0);
  const shoe = shoeV.length ? Math.max(...shoeV.map(v => v.z)) - Math.min(...shoeV.map(v => v.z)) : NaN;
  // arm span with the arms straightened sideways: 2 * (shoulder half width + arm + hand)
  const span = 2 * (Math.abs(B['upperarm01.L'].h.x) + upperArm + forearm + hand);
  const r = { id, H, head: chin != null ? top - chin : NaN, shoulderW, upperArm, forearm, hand, thigh, shank, foot, shoe, span,
    wristY: B['wrist.L'].h.y, elbowY: B['lowerarm01.L'].h.y };
  rows.push(r);
}
const keys = ['head', 'shoulderW', 'upperArm', 'forearm', 'hand', 'thigh', 'shank', 'foot', 'shoe', 'span'];
console.log('stature (m): ' + rows.map(r => `${r.id} ${r.H.toFixed(3)}`).join('  '));
console.log('\nratio to stature (norm) | ' + rows.map(r => r.id.padStart(9)).join(' '));
for (const k of keys) {
  const [n, lo, hi] = REF[k];
  console.log(`${k.padEnd(10)} ${n.toFixed(3)} [${lo}-${hi}] | ` + rows.map(r => { const v = r[k] / r.H; const flag = v < lo ? '▼' : v > hi ? '▲' : ' '; return (v.toFixed(3) + flag).padStart(9); }).join(' '));
}
console.log('\nabsolute (cm)        | ' + rows.map(r => r.id.padStart(9)).join(' '));
for (const k of keys) console.log(`${k.padEnd(20)} | ` + rows.map(r => (r[k] * 100).toFixed(1).padStart(9)).join(' '));
console.log(`${'head count (H/head)'.padEnd(20)} | ` + rows.map(r => (r.H / r.head).toFixed(2).padStart(9)).join(' '));
console.log('\narms hanging straight down (height / stature; norms: elbow 0.630, wrist 0.485, fingertip 0.377; shoulder joint 0.80-0.82)');
for (const id of ids) {
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`));
  const B = {}; for (const b of meta.bones) B[b.name] = { h: new THREE.Vector3(...b.head), t: new THREE.Vector3(...b.tail) };
  const r = rows.find(x => x.id === id), H = r.H;
  const shY = B['upperarm01.L'].h.y, s1 = B['shoulder01.L'].h, cl = B['clavicle.L'].h;
  const el = shY - r.upperArm, wr = el - r.forearm, tip = wr - r.hand;
  const hip = B['upperleg01.L'].h.y, knee = B['lowerleg01.L'].h.y, crotch = B['upperleg01.L'].h.y - 0.08;
  console.log(id.padEnd(10), 'shoulder', (shY / H).toFixed(3), 'elbow', (el / H).toFixed(3), 'wrist', (wr / H).toFixed(3), 'fingertip', (tip / H).toFixed(3),
    '| hip joint', (hip / H).toFixed(3), 'knee', (knee / H).toFixed(3), '| biacromial(joints) cm', (2 * Math.abs(B['upperarm01.L'].h.x) * 100).toFixed(1),
    '| shoulder01->upperarm01 cm', (s1.distanceTo(B['upperarm01.L'].h) * 100).toFixed(1));
}
