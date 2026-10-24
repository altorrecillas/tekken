// every strike of every fighter from standing, at increasing distance: max range at which it connects (hit or block)
// STEP=0.02 measures every 2 cm instead of 10 (to check that a clip change keeps a move's reach)
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { B1, B2, B3, B4 } = await import(GAME + '/js/fight/input.js');
const { STYLES } = await import(GAME + '/js/fight/styles.js');
const { commandList, buildMoves } = await import(GAME + '/js/fight/moves.js');
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`); return { id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; };
const BT = { 1: B1, 2: B2, 3: B3, 4: B4 };
class Script { constructor(seq) { this.seq = seq.map(s => ({ ...s })); this.prevHeld = 0; } attach(f, m) { this.f = f; this.m = m; }
  poll() { const cur = this.seq[0] || { n: 1 }; if (this.seq.length) { cur.n--; if (cur.n <= 0) this.seq.shift(); } const held = cur.press || 0, pressed = held & ~this.prevHeld; this.prevHeld = held; return { dx: (cur.fwd || 0) * this.m.screenForward(this.f), dy: cur.up || 0, held, pressed }; } }
const game = { fx: new Proxy({}, { get: () => () => {} }), hud: new Proxy({}, { get: () => () => {} }),
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} }, audio: null, stage: { arenaRadius: 6.2 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} } };
function seqFor(cmd) {
  // "f,f+2", "df+1", "1+2", "d+4", "b+4", "f+3", "uf+4", "3+4"
  const parts = cmd.split(','), last = parts[parts.length - 1].split('+');
  const DIR = { f: [1, 0], b: [-1, 0], d: [0, -1], u: [0, 1], df: [1, -1], db: [-1, -1], uf: [1, 1], ub: [-1, 1] };
  let mask = 0, dir = [0, 0];
  for (const t of last) { if (BT[t]) mask |= BT[t]; else if (DIR[t]) dir = DIR[t]; }
  const s = [{ n: 4 }];
  if (parts.length > 1) { s.push({ n: 2, fwd: 1 }, { n: 2 }); }
  if (dir[1] === -1 && dir[0] === 0) s.push({ n: 3, up: -1 }); // crouch first for d+ moves
  s.push({ n: 3, fwd: dir[0], up: dir[1], press: mask }, { n: 90 });
  return s;
}
const opp = process.argv[2] || 'rafa';
const ids = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(STYLES);
for (const id of ids) {
  const chars = [buildCharacter(load(id), () => new THREE.MeshBasicMaterial()), buildCharacter(load(opp === id ? 'camilo' : opp), () => new THREE.MeshBasicMaterial())];
  const moves = buildMoves(STYLES[id]);
  const cmds = [...new Set([...commandList(STYLES[id]).map(c => c[0]), ...(STYLES[id].aiMoves || [])])];
  const row = [];
  for (const cmd of cmds) {
    let maxD = 0, used = '', crouchDef = false;
    const STEP = +(process.env.STEP || 0.1);
    for (let d = +(process.env.D0 || 0.8); d <= 2.31; d += STEP) {
      const m = new Match(game, chars, [id, opp === id ? 'camilo' : opp], { rounds: 99, time: 99 });
      m.fighters.forEach((f, i) => { const s = new Script(i ? [{ n: 200 }] : seqFor(cmd)); s.attach(f, m); f.ctrl = s; });
      m.startRound(); m.phase = 'fight'; m.pt = 0;
      m.fighters[0].pos.x = -d / 2; m.fighters[1].pos.x = d / 2; m.fighters.forEach(f => f.prevPos.copy(f.pos));
      let hit = false, mv = '';
      for (let i = 0; i < 90; i++) { m.step(); for (const e of m.events) if ((e.t === 'hit' && e.att === m.fighters[0]) || (e.t === 'block' && e.f === m.fighters[1]) || e.t === 'throw') hit = true; m.events.length = 0; if (m.fighters[0].state === 'move' && !mv) mv = m.fighters[0].moveName; if (m.fighters[0].state === 'throwing') hit = true; }
      used = used || mv;
      if (hit) maxD = d;
    }
    row.push(`${cmd}=${used || '?'}:${maxD ? maxD.toFixed(STEP < 0.1 ? 2 : 1) : 'MISS'}`);
  }
  console.log(id.padEnd(10), row.join('  '));
}
