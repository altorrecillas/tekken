// Frame-by-frame trace of one move scenario (the same set-up as animaudit): state, clip frame and the per-frame
// position / rotation acceleration of a few bones, to find what makes a pop.
// usage: node --import ./register.mjs animtrace.mjs attacker move dist victim [hit|block] [bones,comma] [from] [to]
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { POSE } = await import(GAME + '/js/anim/rig.js');
const [id, mv, dist = '1.05', opp = 'camilo', variant = 'hit', bonesArg = 'wrist.R,lowerarm01.R,head', from = '0', to = '200', who = 'a'] = process.argv.slice(2);
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const b = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`); return { id, base: '', meta, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const mat = () => new THREE.MeshBasicMaterial();
class Dummy { constructor() { this.q = []; } poll() { return this.q.shift() || { dx: 0, dy: 0, held: 0, pressed: 0 }; } }
const game = {
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {}, trail() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, hideBars() {}, introNames() {}, winner() {} },
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  audio: null, stage: { arenaRadius: 9 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
};
const m = new Match(game, [buildCharacter(load(id), mat), buildCharacter(load(opp), mat)], [id, opp], { rounds: 99, time: 99999 });
m.hpScale = 60;
m.fighters.forEach(f => { f.ctrl = new Dummy(); });
m.startRound(); m.phase = 'fight';
const [a, b] = m.fighters;
a.pos.set(-dist / 2, 0, 0); b.pos.set(dist / 2, 0, 0); a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
for (const f of m.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.feet?.reset(); }
if (variant === 'hit') b.updateGuard = function () { this.guard = 'none'; };
const F = who === 'b' ? b : a;
const bones = bonesArg.split(',');
const hist = [];
for (let i = 0; i < +to + 3; i++) {
  if (i === 16) { if (mv === 'rageArt') { a.rage = true; m.onRageStart(a); } a.startMove(mv); }
  const hs = m.hitstop;
  m.step(); m.events.length = 0;
  const W = F.rig.world;
  hist.push({ i, st: F.state, clip: F.clipName, fr: F.state === 'move' ? F.mf : Math.round(F.cf), hs,
    P: bones.map(n => W[n]?.p.clone()), Q: bones.map(n => W[n]?.q.clone()), inert: F.inertH, ubc: F.ubc || 0,
    hand: [F.pose[POSE.handR[0]], F.pose[POSE.handR[0] + 1], F.pose[POSE.handR[0] + 2]].map(v => v.toFixed(2)).join(','), hg: F.pose[POSE.hgR[0]].toFixed(2),
    feet: ['L', 'R'].map(s => (F.feet.feet[s].step ? 'S' : F.feet.feet[s].on ? 'o' : '-')).join('') });
}
for (let k = 2; k < hist.length - 1; k++) {
  const h = hist[k];
  if (h.i < +from || h.i > +to) continue;
  const cols = bones.map((n, j) => {
    const p0 = hist[k - 1].P[j], p1 = h.P[j], p2 = hist[k + 1].P[j];
    if (!p0 || !p1 || !p2) return '';
    const acc = p2.clone().sub(p1.clone().multiplyScalar(2)).add(p0).length() * 100;
    const w0 = hist[k - 1].Q[j].clone().invert().multiply(h.Q[j]), w1 = h.Q[j].clone().invert().multiply(hist[k + 1].Q[j]);
    const al = 2 * Math.acos(Math.min(1, Math.abs(w0.clone().invert().multiply(w1).w))) * 180 / Math.PI;
    return `${n.padEnd(12)} a${acc.toFixed(1).padStart(5)} r${al.toFixed(0).padStart(3)}`;
  });
  console.log(`${String(h.i).padStart(3)} ${h.st.padEnd(6)} ${String(h.clip).padEnd(10)} f${String(h.fr).padStart(3)} hs${h.hs} in${h.inert.toFixed(1)} ubc${h.ubc.toFixed(2)} feet${h.feet} hR[${h.hand}] hg${h.hg} | ${cols.join(' | ')}`);
}
