// Dani's PUÑETALITY (the serve) measured frame by frame, no browser: the racket in his right fist, and per frame the
// hands, the middle of the strings and the racket's direction, in his own axes (x his left, y up, z towards the loser).
// usage (from tools/): node --import ./register.mjs serveprobe.mjs [loser] [from] [to] [step]
//   WANT="frame:R|L:x,y,z;...": the hand target (aim 1, arm lengths from the shoulder, x outwards) that puts that hand
//     at (x, y, z) in his axes at that frame (the shoulder as the trunk has it then)
//   SOLVE="frame:x,y,z;...": the right forearm's roll and wrist that point the racket (+Y, butt to tip) along (x, y, z)
//   CONTACT=frame: print the middle of the strings at that frame (his axes), to copy into fatality.js
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const ctx2d = () => ({ createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, ellipse() {}, fill() {}, scale() {}, arc() {}, transform() {}, closePath() {}, fillText() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: ctx2d }) };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { attachInFist } = await import(GAME + '/js/fx/aloesword.js');
const { makeRacket, RACKET_GRIP } = await import(GAME + '/js/fx/tennis.js');
const [lid = 'rafa', from = '0', to = '300', stepArg = '6'] = process.argv.slice(2);
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const b = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`); return { id, base: '', meta, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const mat = () => new THREE.MeshBasicMaterial();
const game = {
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {}, trail() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, hideBars() {}, introNames() {}, winner() {} },
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  audio: null, stage: { arenaRadius: 9 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
};
const m = new Match(game, [buildCharacter(load('dani'), mat), buildCharacter(load(lid), mat)], ['dani', lid], { rounds: 1 });
m.startRound();
m.winner = 0; m.wins = [1, 0]; m.phase = 'matchEnd'; m.pt = 0;
const [W, L] = m.fighters;
const rk = makeRacket(); attachInFist(W.ch, rk.group, 'R', RACKET_GRIP); rk.group.visible = true;
m.startFatal();
const F = W.style.fatal;
const v = (x) => x.toArray().map((a) => a.toFixed(2)).join(',');
const toW = (p) => W.worldToChar(p.clone(), new THREE.Vector3());
const parse = (e) => e.split(';').filter(Boolean).map((x) => x.split(':'));
const WANT = parse(process.env.WANT || '').map(([f, s, d]) => ({ f: +f, s, d: new THREE.Vector3(...d.split(',').map(Number)) }));
// (frame:direction[:face]: the strings' face to look along `face` too, either side)
const SOLVE = parse(process.env.SOLVE || '').map(([f, d, fc]) => ({ f: +f, d: new THREE.Vector3(...d.split(',').map(Number)).normalize(), face: fc ? new THREE.Vector3(...fc.split(',').map(Number)).normalize() : null }));
const CONTACT = +(process.env.CONTACT || -1);
function want(S) {
  const sh = W.rig.world[`upperarm01.${S.s}`].p, A = W.rig.arm[S.s];
  const t = S.d.clone().sub(sh).multiplyScalar(1 / A.len);
  if (S.s === 'R') t.x = -t.x;
  console.log(`  WANT ${S.f} ${S.s}: at ${v(S.d)} -> hand${S.s}: [${t.toArray().map((a) => a.toFixed(2)).join(', ')}], aim${S.s}: 1   (shoulder ${v(sh)}, arm ${A.len.toFixed(3)})`);
}
function solve(S) {
  const A = W.rig.arm.R, pl = W.rig.palm.R, sgn = -1;
  const Q1 = W.ch.bones['lowerarm01.R'].getWorldQuaternion(new THREE.Quaternion());
  const yl = new THREE.Vector3(0, 1, 0).applyQuaternion(rk.group.quaternion), xl = new THREE.Vector3(1, 0, 0).applyQuaternion(rk.group.quaternion), ff = new THREE.Vector3();
  const inv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -W.yaw);
  const qa = new THREE.Quaternion(), qd = new THREE.Quaternion(), qf = new THREE.Quaternion(), q = new THREE.Quaternion(), dd = new THREE.Vector3();
  let best = null;
  const [t0, t1] = (process.env.TWR || '-1.6,1.6').split(',').map(Number);
  for (let tw = t0; tw <= t1 + 1e-6; tw += 0.02) {
    qa.setFromAxisAngle(A.l0, tw * sgn);
    for (let fl = -1.0; fl <= 1.0001; fl += 0.05) {
      qf.setFromAxisAngle(pl.across, fl * sgn);
      for (let dv = -0.6; dv <= 0.6001; dv += 0.025) {
        qd.setFromAxisAngle(pl.palm, dv);
        q.copy(Q1).multiply(qa).multiply(qd).multiply(qf);
        dd.copy(yl).applyQuaternion(q).applyQuaternion(inv);
        const err = Math.acos(Math.max(-1, Math.min(1, dd.dot(S.d))));
        let fe = 0;
        if (S.face) { ff.copy(xl).applyQuaternion(q).applyQuaternion(inv); fe = Math.acos(Math.min(1, Math.abs(ff.dot(S.face)))); }
        const cost = err + 0.7 * fe + 0.05 * (Math.abs(fl) + Math.abs(dv));
        if (!best || cost < best.cost) best = { cost, err, fe, tw, fl, dv };
      }
    }
  }
  console.log(`  SOLVE ${S.f}: racket along ${v(S.d)} -> twistR: ${best.tw.toFixed(2)}, wristR: [${best.fl.toFixed(2)}, ${best.dv.toFixed(3)}]  (off by ${(best.err * 57.3).toFixed(0)} deg, face off by ${((best.fe || 0) * 57.3).toFixed(0)})`);
}
console.log(`dani vs ${lid}: distance ${F.dist}`);
console.log('frame  handR             handL             strings           racket dir        elbowR            forearm');
for (let t = 1; t <= +to; t++) {
  m.step();
  const ws = WANT.filter((S) => S.f === t), so = SOLVE.filter((S) => S.f === t);
  if (t < +from || (t % +stepArg && !ws.length && !so.length && t !== CONTACT)) continue;
  for (const f of m.fighters) { f.syncRender(1); f.ch.group.updateMatrixWorld(true); }
  for (const S of ws) want(S);
  for (const S of so) solve(S);
  const hR = W.ch.bones['wrist.R'].getWorldPosition(new THREE.Vector3()), hL = W.ch.bones['wrist.L'].getWorldPosition(new THREE.Vector3());
  const c = rk.group.localToWorld(rk.center.clone()), tip = rk.group.localToWorld(rk.tip.clone()), butt = rk.group.localToWorld(new THREE.Vector3(0, -0.07, 0));
  const dir = toW(tip).sub(toW(butt)).normalize();
  if (t === CONTACT) console.log(`  CONTACT ${t}: strings at [${toW(c).toArray().map((a) => a.toFixed(3)).join(', ')}] (his axes), face ${v(new THREE.Vector3(1, 0, 0).applyQuaternion(rk.group.getWorldQuaternion(new THREE.Quaternion())).applyAxisAngle(new THREE.Vector3(0, 1, 0), -W.yaw))}`);
  const eR = W.ch.bones['lowerarm01.R'].getWorldPosition(new THREE.Vector3());
  console.log(String(t).padStart(5), ' ', v(toW(hR)).padEnd(17), v(toW(hL)).padEnd(17), v(toW(c)).padEnd(17), v(dir).padEnd(17), v(toW(eR)).padEnd(17), v(toW(hR).sub(toW(eR)).normalize()));
}
