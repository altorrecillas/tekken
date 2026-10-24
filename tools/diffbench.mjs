// Difficulty bench: a simulated human player against the CPU at each level (js/fight/ai.js), many matches without
// graphics (about a second each), every fighter on both sides in turn. Prints, per level, the share of matches and of
// rounds the human won, hits and blocks of each side and the damage per hit.
//   node --import ./register.mjs diffbench.mjs [novice|average] [levels, e.g. 1,2,3,4,5] [matches per level]
// DETAIL=1 adds where the CPU's damage comes from and how it spends its time; AI=<path of another ai.js> measures
// that one instead (an older version, to compare).
// The human: reacts to a move a human reaction time after it starts, guards some of the moves seen in time, presses
// basic moves at close range, walks in from afar, rarely punishes or juggles. The novice is a button-masher on a
// phone; the average player guards, punishes and breaks throws more often.
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { AIController } = await import(process.env.AI || GAME + '/js/fight/ai.js');
const { B1, B2, B3 } = await import(GAME + '/js/fight/input.js');
const [proxy = 'novice', levelsArg = '1,2,3,4,5', nArg = '21'] = process.argv.slice(2);
const IDS = ['alejandro', 'arnau', 'camilo', 'rafa', 'zapponi', 'dani', 'noemi'];
// react: frames before a move is seen; block: chance to guard a move seen in time; aggr: chance to attack in a
// close-range decision; punish, juggle, brk (throw break), tech, rage: chances; think: frames between decisions
const PROFILES = {
  novice: { react: 20, block: 0.25, aggr: 0.55, punish: 0.05, juggle: 0.2, brk: 0.08, tech: 0.05, think: [8, 20], rage: 0.05 },
  average: { react: 17, block: 0.5, aggr: 0.5, punish: 0.3, juggle: 0.5, brk: 0.3, tech: 0.25, think: [6, 14], rage: 0.08 },
};
const S0 = PROFILES[proxy];
if (!S0) { console.log('players:', Object.keys(PROFILES).join(', ')); process.exit(1); }
const R = Math.random, ri = (a, b) => a + Math.floor(R() * (b - a + 1));

class Human extends AIController {
  constructor(S) { super(1); this.S = S; this.seenMove = null; this.seenMf = 0; }
  decide() {
    const f = this.f, o = f.opp, m = this.match, S = this.S, d = f.dist();
    if (m.phase !== 'fight') { this.wait(10); return; }
    if (f.state === 'thrown') { if (R() < S.brk) this.plan.push({ fwd: 0, up: 0, press: B1 | B2, n: 2 }); this.wait(20); return; }
    if (f.state === 'down') { this.wait(ri(6, 30)); this.plan.push({ fwd: 0, up: 0, press: B3, n: 2 }); return; }
    if (f.state === 'land' && f.sf <= 8 && f.hp > 0) { if (R() < S.tech) this.plan.push({ fwd: 0, up: 0, press: B1, n: 2 }); this.wait(12); return; }
    if (['air', 'land', 'getup', 'tech', 'throwing', 'hit'].includes(f.state)) { this.wait(4); return; }
    if (f.state === 'block') {
      const am = o.move;
      if (am && am.hit && am.hit.blk <= -10 && R() < S.punish) { this.wait(Math.max(1, f.stun - 1 + ri(0, 4))); this.push('1'); this.wait(10); this.push('2'); return; }
      if (R() < 0.5) this.hold(-1, 0, 6); else this.wait(6);
      return;
    }
    if (o.state === 'air' && o.pos.y > 0.2 && d < 2.2 && R() < S.juggle) { this.wait(ri(6, 14)); for (const c of ['1', '1', '2']) { this.push(c); this.wait(ri(8, 14)); } return; }
    // a move seen starting (a reaction time after it began) with time left to guard it; once per move
    if (o.state === 'move' && o.move?.hit && d < 1.9 && o.mf >= S.react && o.mf < o.move.hit.f[0]) {
      const fresh = this.seenMove !== o.move || o.mf < this.seenMf;
      this.seenMove = o.move; this.seenMf = o.mf;
      if (fresh && R() < S.block) { this.hold(-1, o.move.hit.lvl === 'low' && R() < 0.5 ? -1 : 0, o.move.hit.f[0] - o.mf + 12); return; }
    }
    if (f.rage && !f.rageUsed && d < 1.4 && R() < S.rage) { this.push('1+2+3+4'); this.wait(20); return; }
    if (d > 1.7) { if (R() < 0.3) this.push('f,f'); else this.hold(1, 0, ri(8, 20)); return; }
    const x = R();
    if (x < S.aggr) {
      const cmd = this.pick(['1', '1', '2', '3', '4', 'df+1', 'd+3', 'df+2', 'd+4', '1+2', 'f+2', 'b+1']);
      this.push(cmd);
      if (cmd === '1' && R() < 0.5) { this.wait(ri(8, 14)); this.push('2'); }
      this.wait(ri(...S.think));
    } else if (x < S.aggr + 0.15) this.hold(-1, 0, ri(10, 24));
    else if (x < S.aggr + 0.2) this.hold(1, 0, ri(6, 12));
    else this.hold(0, R() < 0.15 ? -1 : 0, ri(...S.think));
  }
}

const load = (id) => {
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`));
  const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  return { id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const chars = {}, mat = () => new THREE.MeshBasicMaterial();
const game = (st) => ({
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, introNames() {}, winner() {} },
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  audio: null, stage: { arenaRadius: 6.2 },
  onKO() {}, onMatchEnd(m) { st.winner = m.winner; st.ended = true; },
  ragdolls: { clear() {}, freeze() {} },
});
const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '-');
for (const L of levelsArg.split(',').map(Number)) {
  let mw = 0, n = 0, rw = 0, rl = 0, close = 0, frames = 0;
  const hits = [0, 0], dmg = [0, 0], blocks = [0, 0], src = {}, states = {};
  for (let k = 0; k < +nArg; k++) {
    // every fighter as the human in turn, against a rival that changes from one round of the roster to the next
    const a = IDS[k % IDS.length];
    let b = IDS[(k * 3 + 1 + Math.floor(k / IDS.length)) % IDS.length];
    if (b === a) b = IDS[(IDS.indexOf(a) + 1) % IDS.length];
    for (const id of [a, b]) if (!chars[id]) chars[id] = buildCharacter(load(id), mat);
    const st = {};
    const m = new Match(game(st), [chars[a], chars[b]], [a, b], {});
    const ctl = [new Human(S0), new AIController(L)];
    m.fighters.forEach((f, i) => { ctl[i].attach(f, m); f.ctrl = ctl[i]; });
    m.startRound();
    for (let i = 0; i < 60 * 60 * 6 && !st.ended; i++) {
      m.step();
      for (const e of m.events) {
        if (e.t === 'hit') {
          hits[e.att.index]++; dmg[e.att.index] += e.dmg;
          if (e.att.index === 1) { const why = e.att.state === 'rageArt' ? 'rage art' : e.def.comboHits > 1 ? 'combo' : e.ch ? 'counter' : e.att.moveName; src[why] = (src[why] || 0) + e.dmg; }
        }
        if (e.t === 'block') blocks[e.f.index]++;
      }
      m.events.length = 0;
      if (m.phase === 'fight') { const c = m.fighters[1]; frames++; states[c.state] = (states[c.state] || 0) + 1; if (c.dist() < 1.45) close++; }
    }
    n++; if (st.winner === 0) mw++;
    rw += m.wins[0]; rl += m.wins[1];
  }
  console.log(`${proxy} vs CPU ${L}: matches won ${pct(mw, n)} (${mw}/${n}), rounds ${pct(rw, rw + rl)} (${rw}-${rl}) · hits ${hits[0]}/${hits[1]} · blocks ${blocks[0]}/${blocks[1]} · damage per hit ${(dmg[0] / hits[0]).toFixed(1)}/${(dmg[1] / hits[1]).toFixed(1)}  (human/CPU)`);
  if (process.env.DETAIL) {
    const top = (o, t) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => `${k} ${t ? pct(v, t) : v}`).join(', ');
    console.log(`   CPU damage from: ${top(src)}`);
    console.log(`   CPU time: ${top(states, frames)} · at close range ${pct(close, frames)}`);
  }
}
