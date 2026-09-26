import fs from 'fs';
const GAME = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { B1, B2 } = await import(GAME + '/js/fight/input.js');
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`); return { id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; };
const [att = 'camilo', def = 'rafa', d0 = '0.9', btn = '2', fwdS = '1', upS = '-1'] = process.argv.slice(2);
const chars = [buildCharacter(load(att), () => new THREE.MeshBasicMaterial()), buildCharacter(load(def), () => new THREE.MeshBasicMaterial())];
class Script { constructor(seq) { this.seq = seq.map(s => ({ ...s })); this.prevHeld = 0; } attach(f, m) { this.f = f; this.m = m; }
  poll() { const cur = this.seq[0] || { n: 1 }; if (this.seq.length) { cur.n--; if (cur.n <= 0) this.seq.shift(); } const held = cur.press || 0, pressed = held & ~this.prevHeld; this.prevHeld = held; return { dx: (cur.fwd || 0) * this.m.screenForward(this.f), dy: cur.up || 0, held, pressed }; } }
const game = { fx: new Proxy({}, { get: () => () => {} }), hud: new Proxy({}, { get: () => () => {} }),
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} }, audio: null, stage: { arenaRadius: 6.2 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} } };
const m = new Match(game, chars, [att, def], { rounds: 99, time: 99 });
const mask = btn === '1' ? B1 : btn === '12' ? (B1 | B2) : btn === '4' ? 8 : B2;
m.fighters.forEach((f, i) => { const s = new Script(i ? [{ n: 200 }] : [{ n: 4 }, { n: 3, fwd: +fwdS, up: +upS, press: mask }, { n: 80 }]); s.attach(f, m); f.ctrl = s; });
m.startRound(); m.phase = 'fight'; m.pt = 0;
const d = +d0; m.fighters[0].pos.x = -d / 2; m.fighters[1].pos.x = d / 2; m.fighters.forEach(f => f.prevPos.copy(f.pos));
const [A, D] = m.fighters;
for (let i = 0; i < 40; i++) {
  m.step();
  const ev = m.events.map(e => e.t).join(','); m.events.length = 0;
  if (A.state === 'move' && A.move.hit) {
    const h = A.move.hit; const p = A.limbWorld(h.limb); const vols = D.hurtVolumes();
    let best = 9, bz = '';
    for (const v of vols) { const a = v[0], b = v[1], ab = b.clone().sub(a); const t = ab.lengthSq() > 1e-9 ? Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())) : 0; const dd = a.clone().addScaledVector(ab, t).distanceTo(p) - v[2] - h.r; if (dd < best) { best = dd; bz = v[3]; } }
    console.log(`f${i} ${A.moveName} mf${A.mf} act${A.mf >= h.f[0] && A.mf <= h.f[1] ? 'Y' : '-'} fist ${p.toArray().map(x => x.toFixed(2))} gap ${best.toFixed(3)} (${bz}) A.x ${A.pos.x.toFixed(2)} D.x ${D.pos.x.toFixed(2)} D.state ${D.state} guard ${D.guard} ev ${ev}`);
  } else if (ev) console.log(`f${i} ev ${ev} A ${A.state}`);
}
