// For every hand strike of every fighter: which way the fist (or the open hand) faces at the moment of contact, the
// strike thrown at an opponent out of reach so the arm is seen fully out, as the clip has it.
//   roll: the palm's turn about the forearm, 0 = palm down (fist horizontal, knuckles level), +-90 = fist on edge
//   ('medial' is the roll with the palm towards the midline: thumb up), 180 = palm up. For a forearm near vertical (an
//   uppercut) roll 0 points the palm forward: read palmFwd there (negative = the palm towards the puncher).
//   wrist: the hand's bend off the forearm (degrees); palmFwd / fingUp: the palm's and the knuckles' forward and up
//   components (a palm strike wants both near 1: palm forward, fingers up).
// usage (from tools/): node --import ./register.mjs palmaudit.mjs [fighters|all] [moves]   (DIST=<m>: the distance)
// Twist values for a target roll: roll changes about 57 degrees per radian of twist (+ pronates: the palm turns down).
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const ids = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : ['alejandro', 'arnau', 'camilo', 'dani', 'noemi', 'rafa', 'zapponi'];
const onlyMoves = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const b = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`); return { id, base: '', meta, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const mat = () => new THREE.MeshBasicMaterial();
class Dummy { poll() { return { dx: 0, dy: 0, held: 0, pressed: 0 }; } }
const game = {
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {}, trail() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, hideBars() {}, introNames() {}, winner() {} },
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  audio: null, stage: { arenaRadius: 9 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
};
const deg = (r) => Math.round(r * 180 / Math.PI);
function measure(f, s) {
  const W = f.rig.world, pl = f.rig.palm[s];
  const F = W[`wrist.${s}`].p.clone().sub(W[`lowerarm01.${s}`].p).normalize();
  const P = pl.palm.clone().applyQuaternion(W[`wrist.${s}`].q);
  const H = pl.handDir.clone().applyQuaternion(W[`wrist.${s}`].q);
  const proj = (v) => v.clone().addScaledVector(F, -v.dot(F)).normalize();
  const p = proj(P), d = proj(new THREE.Vector3(0, -1, 0)), m = proj(new THREE.Vector3(s === 'L' ? -1 : 1, 0, 0));
  const ang = (a, b) => Math.atan2(new THREE.Vector3().crossVectors(a, b).dot(F), a.dot(b));
  const roll = deg(ang(d, p)), medial = deg(ang(d, m));
  // the wrist: how far the hand is bent off the forearm line
  const bendW = deg(Math.acos(Math.max(-1, Math.min(1, H.dot(F)))));
  const fwdPalm = +P.z.toFixed(2), fingersUp = +H.y.toFixed(2);
  return { roll, medial, bendW, fwdPalm, fingersUp, fwd: +F.z.toFixed(2), up: +F.y.toFixed(2) };
}
const rows = [];
for (const id of ids) {
  const opp = id === 'camilo' ? 'rafa' : 'camilo';
  const probe = new Match(game, [buildCharacter(load(id), mat), buildCharacter(load(opp), mat)], [id, opp], { rounds: 99, time: 99999 });
  const names = Object.keys(probe.fighters[0].moves).filter(k => { const mv = probe.fighters[0].moves[k]; const hs = mv.hits || (mv.hit ? [mv.hit] : []); return hs.some(h => h && String(h.limb).startsWith('hand')); });
  for (const mvName of names) {
    if (onlyMoves && !onlyMoves.has(mvName)) continue;
    const m = new Match(game, [buildCharacter(load(id), mat), buildCharacter(load(opp), mat)], [id, opp], { rounds: 99, time: 99999 });
    m.hpScale = 60; m.fighters.forEach(f => { f.ctrl = new Dummy(); });
    m.startRound(); m.phase = 'fight';
    const [a, b] = m.fighters;
    const D = +(process.env.DIST || 3); a.pos.set(-D / 2, 0, 0); b.pos.set(D / 2, 0, 0); a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
    for (const f of m.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.feet?.reset(); }
    b.updateGuard = function () { this.guard = 'none'; };
    const mv = a.moves[mvName], hits = (mv.hits || [mv.hit]).filter(h => h && String(h.limb).startsWith('hand'));
    const want = new Map(hits.map((h, i) => [Math.round((h.f[0] + h.f[1]) / 2), h]));
    const got = [];
    for (let i = 0; i < 200; i++) {
      if (i === 16) a.startMove(mvName);
      m.step(); m.events.length = 0;
      if (i < 16) continue;
      if (a.state === 'move' && a.move === mv && want.has(a.mf)) { const h = want.get(a.mf); got.push({ f: a.mf, limb: h.limb, ...measure(a, h.limb.slice(4)) }); want.delete(a.mf); }
      if (!want.size || (i > 30 && a.state !== 'move')) break;
    }
    for (const g of got) rows.push({ id, mv: mvName, name: mv.name, ...g });
  }
}
const wrapD = (x) => ((x + 540) % 360) - 180;
const cls = (r) => {
  if (Math.abs(r.up) > 0.7) return r.fwdPalm < -0.3 ? 'palm towards him' : r.fwdPalm > 0.3 ? 'palm forward' : 'palm sideways';
  const a = Math.abs(r.roll), m = Math.abs(wrapD(r.roll - r.medial));
  return a <= 30 ? 'palm down' : a >= 150 ? 'PALM UP' : m <= 30 ? 'on edge (palm in)' : m >= 150 ? 'on edge (palm out)' : 'canted';
};
for (const r of rows) console.log(`${r.id.padEnd(9)} ${r.mv.padEnd(14)} ${String(r.name).padEnd(22)} ${r.limb} f${String(r.f).padEnd(3)} roll ${String(r.roll).padStart(4)} (medial ${String(r.medial).padStart(4)}) wrist ${String(r.bendW).padStart(3)} palmFwd ${String(r.fwdPalm).padStart(5)} fingUp ${String(r.fingersUp).padStart(5)}  fwd ${r.fwd} up ${r.up}  ${cls(r)}`);
