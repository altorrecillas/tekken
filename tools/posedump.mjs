// Dumps both fighters' body volumes (world space) frame by frame for a move scenario, for tools/posesheet.py.
// usage: node --import ./register.mjs posedump.mjs attacker move dist victim [hit|block] [frames: all|a,b,c] > out.json
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { BodyState } = await import(GAME + '/js/anim/body.js');
const [id, mv, dist = '1.2', opp = 'camilo', variant = 'hit', framesArg = 'all', lead = '16'] = process.argv.slice(2);
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
const L = +lead;
const want = framesArg === 'all' ? null : new Set(framesArg.split(',').map(Number));
const states = [new BodyState(a.rig.vols), new BodyState(b.rig.vols)];
const out = { attacker: id, victim: opp, move: mv, frames: [] };
let started = false;
for (let i = 0; i < 400; i++) {
  if (i === L) {
    if (mv === 'rageArt') { a.rage = true; m.onRageStart(a); }
    if (a.moves[mv]) a.startMove(mv);
    else if (a.clips[mv]) { a.setState(mv === 'win' || mv === 'intro' ? mv : 'intro'); a.play(mv, 2); }
    started = true;
  }
  m.step(); m.events.length = 0;
  if (!started) continue;
  const k = i - L; // frames since the move started (0 = first move frame)
  if (want && !want.has(k)) { if (a.state !== 'move' && k > 60 && a.sf > 10 && b.sf > 10) break; continue; }
  const fr = { k, hs: m.hitstop, f: [] };
  [a, b].forEach((f, j) => {
    states[j].update(f.rig.world, { pos: f.pos, yaw: f.yaw });
    const segs = {};
    for (const [n, s] of Object.entries(states[j].seg)) {
      if (!s.ok) continue;
      const v = s.vol;
      segs[n] = { A: s.A.toArray().map(x => +x.toFixed(4)), B: s.B.toArray().map(x => +x.toFixed(4)), r: +(v.ell ? Math.min(v.rx, v.rz) : v.r).toFixed(4), rx: v.ell ? +v.rx.toFixed(4) : null, rz: v.ell ? +v.rz.toFixed(4) : null,
        X: v.ell ? s.X.toArray().map(x => +x.toFixed(3)) : null, Z: v.ell ? s.Z.toArray().map(x => +x.toFixed(3)) : null };
    }
    fr.f.push({ id: f.id, st: f.state, clip: f.clipName, mf: f.state === 'move' ? f.mf : Math.round(f.cf), segs });
  });
  out.frames.push(fr);
  if (!want && k > 10 && a.state === 'idle' && a.sf > 8 && (b.state === 'idle' || b.state === 'crouch') && b.sf > 8) break;
}
process.stdout.write(JSON.stringify(out));
