// The walls (Match.wallImpact): every fighter's moves thrown at a victim standing near the street's crowd barrier,
// which ones slam him into it (a wall splat) or bounce him off it (in the air), and a wall combo after a splat: the
// victim pinned while 1, 2, 1, 2 land, freed after four, never splatted twice in one combo.
// usage: node --import ./register.mjs walltest.mjs [fighters,comma] [gap metres from the barrier]
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const ids = (process.argv[2] || 'alejandro,rafa,camilo,dani,zapponi,noemi,orion,aleix').split(',');
const gap = +(process.argv[3] || 0.35);
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const b = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`); return { id, base: '', meta, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const mat = () => new THREE.MeshBasicMaterial();
class Dummy { constructor() { this.q = []; } poll() { return this.q.shift() || { dx: 0, dy: 0, held: 0, pressed: 0 }; } }
const noop = new Proxy({}, { get: () => () => {} });
const LIM = 6.15;
const stage = { arenaRadius: 8, clampWalk(p, r = 0) { const lim = LIM - r; if (p.x > lim) { p.x = lim; this.lastWall = 'barrier'; } else if (p.x < -lim) { p.x = -lim; this.lastWall = 'barrier'; } return p; } };
const game = {
  fx: noop, hud: noop, audio: null, stage,
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
};
const chars = {};
const ch = (id) => chars[id] || (chars[id] = load(id));
let fails = 0;
const opp = 'rafa';
for (const id of ids) {
  const probe = new Match(game, [buildCharacter(ch(id), mat), buildCharacter(ch(opp), mat)], [id, opp], { rounds: 99, time: 99999 });
  const moves = Object.keys(probe.fighters[0].moves).filter((k) => probe.fighters[0].moves[k].hit && probe.fighters[0].moves[k].hit.lvl !== 'throw');
  const rows = [];
  for (const mv of moves) {
    const m = new Match(game, [buildCharacter(ch(id), mat), buildCharacter(ch(opp), mat)], [id, opp], { rounds: 99, time: 99999 });
    m.hpScale = 60;
    m.fighters.forEach((f) => { f.ctrl = new Dummy(); });
    m.startRound(); m.phase = 'fight';
    const [a, b] = m.fighters;
    const bx = LIM - 0.3 - gap;
    a.pos.set(bx - 1.05, 0, 0); b.pos.set(bx, 0, 0); a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
    for (const f of m.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.feet?.reset(); }
    b.updateGuard = function () { this.guard = 'none'; };
    const seen = new Set(); let walls = 0, bounce = 0, maxWh = 0;
    for (let i = 0; i < 150; i++) {
      if (i === 4) { if (mv === 'rageArt') { a.rage = true; m.onRageStart(a); } a.startMove(mv); }
      m.step();
      for (const e of m.events) if (e.t === 'wall') { if (e.splat) walls++; else bounce++; }
      m.events.length = 0;
      seen.add(b.state);
      maxWh = Math.max(maxWh, b.wallHits);
    }
    if (walls || bounce) rows.push(`${mv}${walls ? ' SPLAT' : ''}${bounce ? ' BOUNCE' : ''}`);
  }
  console.log(`${id.padEnd(9)} near the barrier (${gap} m): ${rows.join(', ') || '-'}`);
  // the wall combo: a heavy straight-on push into the barrier, then 1 2 1 2 1 2 while he is pinned
  {
    const m = new Match(game, [buildCharacter(ch(id), mat), buildCharacter(ch(opp), mat)], [id, opp], { rounds: 99, time: 99999 });
    m.hpScale = 60;
    m.fighters.forEach((f) => { f.ctrl = new Dummy(); });
    m.startRound(); m.phase = 'fight';
    const [a, b] = m.fighters;
    const bx = LIM - 0.3 - 0.05;
    a.pos.set(bx - 1.0, 0, 0); b.pos.set(bx, 0, 0); a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
    for (const f of m.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.feet?.reset(); }
    b.updateGuard = function () { this.guard = 'none'; };
    // (a hit stun knocked into the wall: as if the opponent had been hit hard, the knockback speed of a big push)
    b.setState('hit'); b.stun = 30; b.play('hitHigh', 2); b.slide = 6;
    const seq = ['1', '2', '1', '2', '1', '2']; let k = 0, splats = 0, log = [];
        for (let i = 0; i < 260; i++) {
      // (keep him within reach: step in while he is pinned, leant back on the barrier, then the next blow)
      const near = a.pos.distanceTo(b.pos) <= 0.9;
      if (b.state === 'wall' && a.state === 'idle' && !near) a.pos.x += 0.03;
      if (k < seq.length && a.state === 'idle' && b.state === 'wall' && near && i > 3) { const name = seq[k] === '1' ? 'jab' : 'straight'; if (a.moves[name]) a.startMove(name); k++; }
      m.step();
      for (const e of m.events) { if (e.t === 'wall' && e.splat) splats++; if (e.t === 'hit') log.push(`${b.state}${b.state === 'wall' ? b.wallHits : ''}`); }
      m.events.length = 0;
      if (process.env.TRACE === id) console.log(i, a.state, a.moveName, a.mf, b.state, b.stun, b.wallHits, 'd', a.pos.distanceTo(b.pos).toFixed(2), 'bx', b.pos.x.toFixed(2));
    }
    const ok = splats === 1 && log.filter((s) => s.startsWith('wall')).length >= 3;
    if (!ok) fails++;
    console.log(`${' '.repeat(9)} wall combo: ${splats} splat, hits ${log.join(' ')}  ${ok ? 'ok' : 'FAIL'}`);
  }
}
console.log(fails ? `WALLTEST FAIL (${fails})` : 'WALLTEST OK');
