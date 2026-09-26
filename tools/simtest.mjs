// Headless fight simulation: node --import ./register.mjs simtest.mjs p1 p2 frames ai1 ai2
import fs from 'fs';
const GAME = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { AIController } = await import(GAME + '/js/fight/ai.js');
const [p1 = 'alejandro', p2 = 'rafa', framesArg = '7200', a1 = '4', a2 = '4', seedArg] = process.argv.slice(2);
function load(id) {
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`));
  const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  const bin = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return { id, base: '', meta, bin };
}
const mat = () => new THREE.MeshBasicMaterial();
const chars = [buildCharacter(load(p1), mat), buildCharacter(load(p2), mat)];
const stats = { hits: [0, 0], blocks: [0, 0], ch: [0, 0], dmg: [0, 0], moves: {}, states: {}, kos: 0, rounds: 0, throws: 0, maxStuck: 0 };
const cam = { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} };
const game = {
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, introNames() {}, winner() {} },
  camCtl: cam, audio: null, stage: { arenaRadius: 6.2 },
  onKO() { stats.kos++; }, onMatchEnd(m) { stats.matchWinner = m.winner; stats.ended = true; },
  ragdolls: { clear() {}, freeze() {} },
};
const m = new Match(game, chars, [p1, p2], {});
const ais = [new AIController(+a1), new AIController(+a2)];
m.fighters.forEach((f, i) => { ais[i].attach(f, m); f.ctrl = ais[i]; });
m.startRound();
const N = +framesArg;
let lastState = ['', ''], sameFor = [0, 0];
const t0 = Date.now();
for (let i = 0; i < N && !stats.ended; i++) {
  m.step();
  for (const e of m.events) {
    if (e.t === 'hit') { stats.hits[e.att.index]++; stats.dmg[e.att.index] += e.dmg; if (e.ch) stats.ch[e.att.index]++; stats.moves[e.att.moveName] = (stats.moves[e.att.moveName] || 0) + 1; }
    if (e.t === 'block') stats.blocks[1 - e.f.index]++;
    if (e.t === 'rageArt') stats.rageArts = (stats.rageArts || 0) + 1;
    if (e.t === 'rage') stats.rages = (stats.rages || 0) + 1;
  }
  m.events.length = 0;
  m.fighters.forEach((f, k) => {
    if (f.state === 'move' && f.moveName === 'rageArt' && f.mf === 1) { stats.raStarts = (stats.raStarts || 0) + 1; stats.raDist = (stats.raDist || []).concat([+f.dist().toFixed(2)]); }
    if (f.rage && !f.rageUsed) stats.rageReady = (stats.rageReady || 0) + 1;
    stats.states[f.state] = (stats.states[f.state] || 0) + 1;
    if (f.state === lastState[k] && !['idle', 'walkF', 'walkB', 'crouch', 'down', 'ko', 'win', 'lose'].includes(f.state)) { sameFor[k]++; stats.maxStuck = Math.max(stats.maxStuck, sameFor[k]); if (sameFor[k] === 400) console.log('STUCK', f.id, f.state, f.moveName, 'frame', i); }
    else sameFor[k] = 0;
    lastState[k] = f.state;
    if (!isFinite(f.pos.x) || !isFinite(f.hp)) { console.log('NaN!', f.id, f.state); process.exit(1); }
  });
  if (m.phase === 'ready' && m.pt === 1) stats.rounds++;
}
console.log(JSON.stringify({ ...stats, wins: m.wins, phase: m.phase, frames: m.frame, ms: Date.now() - t0 }, null, 0));
