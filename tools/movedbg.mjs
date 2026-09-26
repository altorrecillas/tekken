// joint positions (character space, +z towards the opponent) through a move: torso lean, head height, hands and feet
import fs from 'fs';
const GAME = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Rig, newPose } = await import(GAME + '/js/anim/rig.js');
const { buildMoves, buildClips } = await import(GAME + '/js/fight/moves.js');
const { STYLES } = await import(GAME + '/js/fight/styles.js');
const [id = 'alejandro', mv = 'spinKick', framesArg] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
const ch = buildCharacter({ id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }, () => new THREE.MeshBasicMaterial());
const rig = new Rig(ch); const p = newPose();
const moves = buildMoves(STYLES[id]), clips = buildClips(STYLES[id]);
const m = moves[mv] || { clip: clips[mv], total: clips[mv].length };
const frames = framesArg ? framesArg.split(',').map(Number) : Array.from({ length: 13 }, (_, i) => Math.round(i * m.total / 12));
const W = (n) => rig.world[n].p;
for (const f of frames) {
  m.clip.sample(f, p); rig.lookTarget = new THREE.Vector3(0, 1.55, 3); rig.apply(p);
  const hip = W('spine05'), neck = W('neck01'), head = W('head');
  const t = neck.clone().sub(hip); const lean = Math.atan2(Math.hypot(t.x, t.z), t.y) * 180 / Math.PI;
  const dir = Math.atan2(t.x, t.z) * 180 / Math.PI; // lean direction: 0 = towards the opponent
  const fx = (v) => v.toArray().map(x => x.toFixed(2)).join(',');
  const hit = m.hit && f >= m.hit.f[0] && f <= m.hit.f[1] ? ' HIT' : '';
  console.log(`f${String(f).padStart(2)}${hit.padEnd(4)} lean ${lean.toFixed(0).padStart(3)}° dir ${dir.toFixed(0).padStart(4)}° headY ${head.y.toFixed(2)} hipY ${hip.y.toFixed(2)} | wristL ${fx(W('wrist.L'))} wristR ${fx(W('wrist.R'))} | footL ${fx(W('foot.L'))} footR ${fx(W('foot.R'))}`);
}
