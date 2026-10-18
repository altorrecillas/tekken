// Necklines in motion: plays every move of each fighter (and the stance, walk, crouch, intro and win poses) and,
// frame by frame, measures whether the skin near a top's neckline comes out through the cloth: each body vertex
// under the neckband (within 4 cm of its edge) is paired at rest with the nearest garment vertex; posed, the gap
// along that garment vertex's normal must stay positive. A snug neckline (garments.make_shell neck_snug) sits a few
// millimetres off the neck, so this is the check that it does not let the skin through when the head turns or the
// shoulders rise.
// usage: node --import ./register.mjs necklinecheck.mjs [--fighters a,b] [--tol mm]
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const FIGHTERS = (opt('fighters') || 'alejandro,arnau,camilo,rafa,zapponi,dani,noemi').split(',');
const TOL = +(opt('tol') || 0.5) / 1000;   // metres the skin may come through before it counts
const TOPS = ['shirt', 'jacket', 'top', 'collar'];

function load(id) {
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`));
  const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  return { id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}
class Dummy { constructor() { this.q = []; } poll() { return this.q.shift() || { dx: 0, dy: 0, held: 0, pressed: 0 }; } }
const stubGame = () => ({
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {}, trail() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, hideBars() {}, introNames() {}, winner() {} },
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  audio: null, stage: { arenaRadius: 9 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
});
const meshes = (ch) => { const out = {}; ch.group.traverse((o) => { if (o.isSkinnedMesh && !out[o.name]) out[o.name] = o; }); return out; };
const V = (m, i, t) => t.fromBufferAttribute(m.geometry.attributes.position, i);

// the pairs to watch: visible body vertices on the base of the neck (weighted to the neck bones) that the neckband
// covers at rest, each with its nearest garment vertex; the gap is measured along the skin's own normal
function pairsFor(ch) {
  const M = meshes(ch), body = M.body;
  const tops = TOPS.filter((n) => M[n]);
  if (!body || !tops.length) return null;
  const top = M[tops[0]];
  const tp = top.geometry.attributes.position;
  const g = body.geometry, bp = g.attributes.position, bn = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const neckBones = new Set(body.skeleton.bones.map((b, i) => (/^neck0[12]/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const used = new Uint8Array(bp.count); for (const k of g.index.array) used[k] = 1;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  const pairs = [];
  for (let i = 0; i < bp.count; i++) {
    if (!used[i]) continue;
    let wn = 0; for (let k = 0; k < 4; k++) if (neckBones.has(si.getComponent(i, k))) wn += sw.getComponent(i, k);
    if (wn < 0.25) continue;
    a.fromBufferAttribute(bp, i); n.fromBufferAttribute(bn, i);
    let best = -1, bd = 1e9;
    for (let j = 0; j < tp.count; j++) { b.fromBufferAttribute(tp, j); const d = a.distanceToSquared(b); if (d < bd) { bd = d; best = j; } }
    if (best < 0 || bd > 0.025 * 0.025) continue;
    b.fromBufferAttribute(tp, best);
    const gap0 = b.clone().sub(a).dot(n);
    if (gap0 <= 0.0005) continue;   // not under the cloth at rest (above the neckline)
    pairs.push({ bi: i, ti: best, gap0, n: n.clone() });
  }
  return { body, top, pairs, name: tops[0] };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
function measure(P) {
  let worst = 0;
  const bpos = P.body.geometry.attributes.position;
  for (const p of P.pairs) {
    P.body.getVertexPosition(p.bi, _a);
    P.top.getVertexPosition(p.ti, _b);
    // the skin's normal, posed: a point 1 cm out along its rest normal, skinned with the same weights
    _c.fromBufferAttribute(bpos, p.bi).addScaledVector(p.n, 0.01);
    P.body.applyBoneTransform(p.bi, _c);
    _n.copy(_c).sub(_a).normalize();
    worst = Math.min(worst, _n.dot(_c.copy(_b).sub(_a)));
  }
  return worst;
}

let ok = true;
for (const id of FIGHTERS) {
  const opp = id === 'camilo' ? 'rafa' : 'camilo';
  const chars = [buildCharacter(load(id), () => new THREE.MeshBasicMaterial()), buildCharacter(load(opp), () => new THREE.MeshBasicMaterial())];
  const m = new Match(stubGame(), chars, [id, opp], { rounds: 99, time: 99999 });
  m.hpScale = 60;
  m.fighters.forEach((f) => { f.ctrl = new Dummy(); });
  const [a] = m.fighters;
  const P = pairsFor(a.ch);
  if (!P) { console.log(`${id}: no top with a neckline`); continue; }
  let worst = 0, where = '', frames = 0;
  const perMove = {};
  const check = (label) => {
    a.syncRender(1); a.ch.group.updateMatrixWorld(true);
    const w = measure(P); frames++;
    const mv = label.split(' ')[0];
    if (w < (perMove[mv] ?? 0)) perMove[mv] = w;
    if (w < worst) { worst = w; where = label; }
  };
  const run = (label, start, n) => {
    m.startRound(); m.phase = 'fight'; m.pt = 0; m.hitstop = 0;
    a.pos.set(-0.6, 0, 0); m.fighters[1].pos.set(0.6, 0, 0); a.hp = a.maxHp * 60;
    for (const f of m.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.feet?.reset?.(); }
    start?.();
    for (let i = 0; i < n; i++) { m.step(); m.events.length = 0; if (m.phase !== 'fight') break; check(`${label} f${i}`); }
  };
  for (const mv of Object.keys(a.moves).filter((k) => k !== 'throwExec')) run(mv, () => { if (mv === 'rageArt') { a.rage = true; a.rageUsed = false; m.onRageStart(a); } a.startMove(mv); }, 90);
  for (const st of ['intro', 'win']) run(st, () => { a.setState(st); a.play(st, 1); }, 110);
  // walking both ways and crouching (through the controller, as a player would)
  const hold = (dx, dy, n) => Array.from({ length: n }, () => ({ dx, dy, held: 0, pressed: 0 }));
  run('walk', () => { a.ctrl.q = [...hold(1, 0, 50), ...hold(-1, 0, 50)]; }, 100);
  run('crouch', () => { a.ctrl.q = hold(0, -1, 60); }, 60);
  const mm = (-worst * 1000).toFixed(1);
  const bad = -worst > TOL;
  if (bad) ok = false;
  const top = Object.entries(perMove).sort((x, y) => x[1] - y[1]).slice(0, 6).map(([k, v]) => `${k} ${(-v * 1000).toFixed(1)}`).join(', ');
  if (top) console.log(`     worst moves (mm): ${top}`);
  console.log(`${bad ? 'FAIL' : 'ok  '} ${id} (${P.name}, ${P.pairs.length} skin points under the neckband, ${frames} frames): ${worst < 0 ? `skin comes through by ${mm} mm at ${where}` : 'the skin never comes through'}`);
}
console.log(ok ? 'NECKLINES OK' : 'NECKLINES: skin through the cloth');
process.exit(ok ? 0 : 1);
