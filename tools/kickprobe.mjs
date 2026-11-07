// Kicks measured frame by frame, no browser: what makes one read as natural or not.
// usage (from tools/): node --import ./register.mjs kickprobe.mjs <fighter> <move> [from] [to] [step]
// per frame: the kicking knee's angle (180 = straight), the support knee's, how far the trunk leans (back: -, forward:
// +, towards the target's axis), the kicking foot's height and its speed (m/s), the hip's height; at the end, the
// peak foot speed and the knee and lean at the first hit frame
import fs from 'fs';
const GAME = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Rig, newPose } = await import(GAME + '/js/anim/rig.js');
const { buildMoves, buildClips } = await import(GAME + '/js/fight/moves.js');
const { STYLES } = await import(GAME + '/js/fight/styles.js');
const [id = 'alejandro', mv = 'roundhouse', from, to, stepArg = '1'] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
const ch = buildCharacter({ id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }, () => new THREE.MeshBasicMaterial());
const rig = new Rig(ch); const p = newPose();
const moves = buildMoves(STYLES[id]);
const m = moves[mv];
if (!m) { console.log('no move', mv, Object.keys(moves).join(' ')); process.exit(1); }
const k = (m.hit?.limb || 'footR').slice(-1), s = k === 'L' ? 'R' : 'L';
const W = (n) => rig.world[n].p.clone();
const ang = (a, b, c) => { const u = a.clone().sub(b).normalize(), v = c.clone().sub(b).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180 / Math.PI; };
let prevFoot = null, peak = 0, peakF = 0, atHit = null;
const f0 = from != null ? +from : 0, f1 = to != null ? +to : m.total, st = +stepArg;
console.log(`${id} ${mv}  kicking leg ${k}, hit ${m.hit ? m.hit.f.join('-') : '-'}  total ${m.total}`);
for (let f = Math.max(0, f0 - 1); f <= f1; f++) {
  m.clip.sample(f, p); rig.apply(p);
  const hipK = W('upperleg01.' + k), kneeK = W('lowerleg01.' + k), footK = W('foot.' + k);
  const hipS = W('upperleg01.' + s), kneeS = W('lowerleg01.' + s), footS = W('foot.' + s);
  const pel = W('spine05'), nk = W('neck01'), hd = W('head');
  const t = nk.clone().sub(pel), lean = Math.atan2(t.z, t.y) * 180 / Math.PI, side = Math.atan2(t.x, t.y) * 180 / Math.PI;
  const sp = prevFoot ? footK.distanceTo(prevFoot) * 60 : 0;
  prevFoot = footK;
  if (f < f0) continue;
  if (sp > peak) { peak = sp; peakF = f; }
  const hit = m.hit && f >= m.hit.f[0] && f <= m.hit.f[1];
  const row = { kneeK: ang(hipK, kneeK, footK), kneeS: ang(hipS, kneeS, footS), lean, side, fy: footK.y, fz: footK.z, sp, hipY: pel.y, headY: hd.y, headZ: hd.z };
  if (hit && !atHit) atHit = { f, ...row };
  if ((f - f0) % st === 0 || hit) console.log(`f${String(f).padStart(2)}${hit ? ' HIT' : '    '} kick knee ${row.kneeK.toFixed(0).padStart(3)}°  support knee ${row.kneeS.toFixed(0).padStart(3)}°  trunk ${row.lean.toFixed(0).padStart(4)}° fwd ${row.side.toFixed(0).padStart(4)}° side | foot y ${row.fy.toFixed(2)} z ${row.fz.toFixed(2)} ${row.sp.toFixed(1).padStart(5)} m/s | hips ${row.hipY.toFixed(2)} head ${row.headY.toFixed(2)},${row.headZ.toFixed(2)}`);
}
console.log(`peak foot speed ${peak.toFixed(1)} m/s at f${peakF}` + (atHit ? ` · at the hit (f${atHit.f}): kick knee ${atHit.kneeK.toFixed(0)}°, trunk ${atHit.lean.toFixed(0)}° fwd / ${atHit.side.toFixed(0)}° side, support knee ${atHit.kneeS.toFixed(0)}°, foot ${atHit.fy.toFixed(2)} m up` : ''));
