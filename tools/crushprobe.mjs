// Camilo's PUÑETALITY measured frame by frame (no browser): the dumbbells in his fists, and per frame where their
// heads are against the loser's head (the hook, the crush), in Camilo's own axes (x his left, y up, z towards the
// loser). Tuning the move by numbers first, renders after.
// usage (from tools/): node --import ./register.mjs crushprobe.mjs [loser] [from] [to] [step]
//   SOLVE="frame:R|L:x,y,z;...": the forearm roll and wrist that point that dumbbell's handle (+Y, the index side)
//   along (x, y, z) as the arm is, printed to be copied into the clip
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const ctx2d = () => ({ createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, ellipse() {}, fill() {}, scale() {}, arc() {}, transform() {}, closePath() {}, fillText() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: ctx2d }) };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { attachInFist } = await import(GAME + '/js/fx/aloesword.js');
const { makeDumbbells, DB_GRIP } = await import(GAME + '/js/fx/dumbbells.js');
const { POSE } = await import(GAME + '/js/anim/rig.js');
const [lid = 'rafa', from = '0', to = '400', stepArg = '6'] = process.argv.slice(2);
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const b = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`); return { id, base: '', meta, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const mat = () => new THREE.MeshBasicMaterial();
const game = {
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {}, trail() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, hideBars() {}, introNames() {}, winner() {} },
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  audio: null, stage: { arenaRadius: 9 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
};
const m = new Match(game, [buildCharacter(load('camilo'), mat), buildCharacter(load(lid), mat)], ['camilo', lid], { rounds: 1 });
m.startRound();
m.winner = 0; m.wins = [1, 0]; m.phase = 'matchEnd'; m.pt = 0;
const [W, L] = m.fighters;
const d = makeDumbbells();
for (const s of ['L', 'R']) { attachInFist(W.ch, d[s], s, DB_GRIP); d[s].visible = true; }
m.startFatal();
const F = W.style.fatal;
const v = (x) => x.toArray().map((a) => a.toFixed(2)).join(',');
const toW = (p) => W.worldToChar(p.clone(), new THREE.Vector3());
const SOLVE = (process.env.SOLVE || '').split(';').filter(Boolean).map((e) => { const [f, s, dd] = e.split(':'); return { f: +f, s, want: new THREE.Vector3(...dd.split(',').map(Number)).normalize() }; });
function solve(S) {
  const rig = W.rig, A = rig.arm[S.s], pl = rig.palm[S.s], sgn = S.s === 'L' ? 1 : -1;
  const Q1 = W.ch.bones[`lowerarm01.${S.s}`].getWorldQuaternion(new THREE.Quaternion());
  const yl = new THREE.Vector3(0, 1, 0).applyQuaternion(d[S.s].quaternion);
  const inv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -W.yaw);
  const qa = new THREE.Quaternion(), qd = new THREE.Quaternion(), qf = new THREE.Quaternion(), q = new THREE.Quaternion(), dd = new THREE.Vector3();
  let best = null;
  for (let tw = -1.6; tw <= 1.5; tw += 0.02) {
    qa.setFromAxisAngle(A.l0, tw * sgn);
    for (let fl = -0.6; fl <= 0.6001; fl += 0.05) {
      qf.setFromAxisAngle(pl.across, fl * sgn);
      for (let dv = -0.35; dv <= 0.6001; dv += 0.025) {
        qd.setFromAxisAngle(pl.palm, dv);
        q.copy(Q1).multiply(qa).multiply(qd).multiply(qf);
        dd.copy(yl).applyQuaternion(q).applyQuaternion(inv);
        // (a dumbbell is the same either way round)
        const err = Math.acos(Math.min(1, Math.abs(dd.dot(S.want))));
        const cost = err + 0.06 * (Math.abs(fl) + Math.abs(dv));
        if (!best || cost < best.cost) best = { cost, err, tw, fl, dv, d: dd.clone() };
      }
    }
  }
  console.log(`  SOLVE ${S.f} ${S.s}: want ${v(S.want)} -> twist${S.s}: ${best.tw.toFixed(2)}, wrist${S.s}: [${best.fl.toFixed(2)}, ${best.dv.toFixed(3)}]  (off by ${(best.err * 57.3).toFixed(0)} deg)`);
}
console.log(`camilo vs ${lid}: hook at ${F.hook}, crush at ${F.cut}, distance ${F.dist}`);
console.log('frame  handR          dbR axis       dbR low        dbL low       | head (centre, top)          | low-top R  L   | hook: dbR to face');
for (let t = 1; t <= +to; t++) {
  m.step();
  const sol = SOLVE.filter((S) => S.f === t);
  if (t < +from || (t % +stepArg && Math.abs(t - F.cut) > 4 && Math.abs(t - F.hook) > 3 && !sol.length)) continue;
  for (const f of m.fighters) { f.syncRender(1); f.ch.group.updateMatrixWorld(true); }
  for (const S of sol) solve(S);
  const hand = W.ch.bones['wrist.R'].getWorldPosition(new THREE.Vector3());
  const lowR = d.R.localToWorld(d.low.clone()), highR = d.R.localToWorld(d.high.clone()), lowL = d.L.localToWorld(d.low.clone()), highL = d.L.localToWorld(d.high.clone());
  // (whichever end is lower)
  const lR = lowR.y < highR.y ? lowR : highR, lL = lowL.y < highL.y ? lowL : highL;
  const axR = toW(highR).sub(toW(lowR)).normalize();
  const hb = L.ch.bones.head, hc = hb.getWorldPosition(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(hb.getWorldQuaternion(new THREE.Quaternion()));
  const top = hc.clone().addScaledVector(up, 0.17);
  const face = hc.clone().addScaledVector(up, 0.06);
  const near = (a, b, p) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return a.clone().addScaledVector(ab, t).distanceTo(p); };
  console.log(String(t).padStart(5), ' ', v(toW(hand)).padEnd(15), v(axR).padEnd(15), v(toW(lR)).padEnd(15), v(toW(lL)).padEnd(14), '|', v(toW(hc)).padEnd(15), v(toW(top)).padEnd(14), '|',
    (lR.y - top.y).toFixed(2).padStart(5), (lL.y - top.y).toFixed(2).padStart(5), '  |', near(lowR, highR, face).toFixed(2));
}
