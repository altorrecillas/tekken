import fs from 'fs';
globalThis.window = globalThis; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const THREE = await import('three');
const { buildCharacter } = await import(new URL('../js/charloader.js', import.meta.url).href);
const { Rig, newPose, POSE } = await import(new URL('../js/anim/rig.js', import.meta.url).href);
const out = [];
for (const id of ['alejandro', 'arnau', 'camilo', 'rafa', 'zapponi', 'dani', 'noemi']) {
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  const ch = buildCharacter({ id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }, () => new THREE.MeshBasicMaterial());
  const rig = new Rig(ch), p = newPose();
  const set = (k, v) => { const o = POSE[k][0]; if (Array.isArray(v)) v.forEach((x, j) => (p[o + j] = x)); else p[o] = v; };
  for (const s of ['L', 'R']) { set('hand' + s, [0.05, -1.0, 0.0]); set('aim' + s, 1); set('fist' + s, 0); set('pole' + s, [0.1, -0.3, -1]); set('foot' + s, [0.11, 0.071, 0]); set('knee' + s, [0.05, 0, 1]); }
  rig.apply(p); ch.group.updateMatrixWorld(true);
  const w = (n) => { const v = new THREE.Vector3(); ch.bones[n].getWorldPosition(v); return v; };
  ch.meshes.head.geometry.computeBoundingBox(); const H = ch.meshes.head.geometry.boundingBox.max.y;
  const f2 = w('finger3-2.L'), f3 = w('finger3-3.L'), tip = f3.clone().add(f3.clone().sub(f2).multiplyScalar(0.9));
  // crotch: lowest point of the body mesh between the legs
  const pos = ch.meshes.body.geometry.attributes.position; let crotch = 9;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (Math.abs(x) < 0.012 && y > 0.5 && y < 1.1 && Math.abs(z) < 0.12) crotch = Math.min(crotch, y); }
  const r = (v) => (v / H).toFixed(3);
  console.log(id.padEnd(10), 'H', H.toFixed(3), 'shoulder', r(w('upperarm01.L').y), 'elbow', r(w('lowerarm01.L').y), 'wrist', r(w('wrist.L').y), 'tip', r(tip.y), 'crotch', r(crotch),
    '| need +cm to tip 0.38H:', ((tip.y - 0.38 * H) * 100).toFixed(1));
}
