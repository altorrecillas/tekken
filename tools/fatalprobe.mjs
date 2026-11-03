// The PUÑETALITY measured frame by frame (no browser): the winner's move played from the win screen, the sword in her
// fist, and per frame: the hand and the sword's base and tip (in the winner's own axes: x her left, y up, z towards the
// loser), the blade's direction, and, near the cut, how the blade crosses the loser (its height where it passes his
// spine, how far from it). Tuning the move by numbers first, renders after.
// usage (from tools/): node --import ./register.mjs fatalprobe.mjs [winner] [loser] [from] [to] [step]
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const ctx2d = () => ({ createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, ellipse() {}, fill() {}, scale() {}, arc() {}, transform() {}, closePath() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} });
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: ctx2d }) };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { makeAloeSword, attachAloeSword } = await import(GAME + '/js/fx/aloesword.js');
const { POSE } = await import(GAME + '/js/anim/rig.js');
const { SplitBody } = await import(GAME + '/js/fx/splitbody.js');
const [wid = 'noemi', lid = 'camilo', from = '0', to = '420', stepArg = '6'] = process.argv.slice(2);
const load = (id) => { const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const b = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`); return { id, base: '', meta, bin: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const mat = () => new THREE.MeshBasicMaterial();
const game = {
  fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {}, trail() {} },
  hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, hideBars() {}, introNames() {}, winner() {} },
  camCtl: { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} },
  audio: null, stage: { arenaRadius: 9 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
};
const m = new Match(game, [buildCharacter(load(wid), mat), buildCharacter(load(lid), mat)], [wid, lid], { rounds: 1 });
m.startRound();
m.winner = 0; m.wins = [1, 0]; m.phase = 'matchEnd'; m.pt = 0;
const [W, L] = m.fighters;
const sw = makeAloeSword(); attachAloeSword(W.ch, sw); sw.group.visible = true;
m.startFatal();
const F = W.style.fatal;
const v = (x) => x.toArray().map((a) => a.toFixed(2)).join(',');
const toChar = (f, p) => f.worldToChar(p.clone(), new THREE.Vector3());
const segSeg = (p0, p1, q0, q1) => { // closest points between two segments
  const d1 = p1.clone().sub(p0), d2 = q1.clone().sub(q0), r = p0.clone().sub(q0);
  const a = d1.dot(d1), e = d2.dot(d2), f2 = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f2 - c * e) / den)) : 0, t = (b * s + f2) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  const P = p0.clone().addScaledVector(d1, s), Q = q0.clone().addScaledVector(d2, t);
  return { d: P.distanceTo(Q), s, t, P, Q };
};
const STEP = +stepArg;
// SPLIT=1: the loser cut in two as the game does it (js/fx/splitbody.js, the frames of js/fight/fatality.js's NOEMI)
// and the halves followed: where the trunk's chest and head and the hips are, every few frames
const SPLITF = process.env.SPLIT ? { up: 232, down: 300 } : null;
let split = null;
// SOLVE="frame:x,y,z;...": at those frames, the forearm roll and the wrist (twistR, wristR [flex, deviation]) that point
// the blade most nearly along (x, y, z) in the winner's axes, as the arm is; printed to be copied into the clip
const SOLVE = new Map((process.env.SOLVE || '').split(';').filter(Boolean).map((e) => { const [f, d] = e.split(':'); return [+f, new THREE.Vector3(...d.split(',').map(Number)).normalize()]; }));
// SEARCH="frame:x,y,z": the right arm's target and elbow (and roll and wrist) that put the blade along (x, y, z) and
// through the loser's waist, the fist at his waist's height; the best few printed
const SEARCH = new Map((process.env.SEARCH || '').split(';').filter(Boolean).map((e) => { const [f, d] = e.split(':'); return [+f, new THREE.Vector3(...d.split(',').map(Number)).normalize()]; }));
const HS = 1.2;
function search(t, want) {
  const rig = W.rig, A = rig.arm.R, pl = rig.palm.R, sgn = -1;
  const inv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -W.yaw);
  const yl = new THREE.Vector3(0, 1, 0).applyQuaternion(sw.group.quaternion);
  const baseL = sw.group.position.clone().multiplyScalar(HS).add(sw.base.clone().applyQuaternion(sw.group.quaternion));
  const L = W.opp;
  const waist = L.ch.bones.spine04.getWorldPosition(new THREE.Vector3()).add(L.ch.bones.spine03.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const pose = W.pose.slice ? new Float32Array(W.pose) : W.pose.clone();
  const h = POSE.handR[0], pole = POSE.poleR[0];
  const POLES = [[0.8, -0.6, -0.3], [0.5, -1, 0], [0.2, -1, -0.5], [0.9, -0.2, 0.3], [0.6, -0.8, 0.4]];
  const qa = new THREE.Quaternion(), qd = new THREE.Quaternion(), qf = new THREE.Quaternion(), q = new THREE.Quaternion(), d = new THREE.Vector3(), b = new THREE.Vector3();
  const res = [];
  const [Y0, Y1] = (process.env.YR || '-0.75,-0.15').split(',').map(Number), [Z0, Z1] = (process.env.ZR || '0,0.8').split(',').map(Number);
  for (let x = -0.4; x <= 0.61; x += 0.1) for (let y = Y0; y <= Y1 + 1e-6; y += 0.1) for (let z = Z0; z <= Z1 + 1e-6; z += 0.1) for (const P of POLES) {
    pose[h] = x; pose[h + 1] = y; pose[h + 2] = z; pose[pole] = P[0]; pose[pole + 1] = P[1]; pose[pole + 2] = P[2];
    W.rig.apply(pose); W.ch.group.updateMatrixWorld(true);
    const Q1 = W.ch.bones['lowerarm01.R'].getWorldQuaternion(new THREE.Quaternion());
    const Pw = W.ch.bones['wrist.R'].getWorldPosition(new THREE.Vector3());
    if (!process.env.NOWAIST && (Pw.y < 0.82 || Pw.y > 1.12)) continue;
    let best = null;
    const [sw0, sw1] = (process.env.TW || '-1.6,1.4').split(',').map(Number);
    for (let tw = sw0; tw <= sw1 + 1e-6; tw += 0.05) {
      qa.setFromAxisAngle(A.l0, tw * sgn);
      for (let fl = -0.5; fl <= 0.51; fl += 0.1) {
        qf.setFromAxisAngle(pl.across, fl * sgn);
        for (let dv = -0.35; dv <= 0.601; dv += 0.05) {
          qd.setFromAxisAngle(pl.palm, dv);
          q.copy(Q1).multiply(qa).multiply(qd).multiply(qf);
          d.copy(yl).applyQuaternion(q);
          const dc = d.clone().applyQuaternion(inv);
          // (LEVEL=1: only how level the blade lies matters much, its heading only a little)
          const err = process.env.LEVEL ? Math.abs(Math.asin(Math.max(-1, Math.min(1, dc.y)))) + 0.25 * Math.acos(Math.max(-1, Math.min(1, dc.dot(want)))) : Math.acos(Math.max(-1, Math.min(1, dc.dot(want))));
          if (best && err > best.cost) continue;
          b.copy(baseL).applyQuaternion(q).add(Pw);
          // the blade's line against the waist: how far, and where along the blade (0 base, 1 tip)
          const w = waist.clone().sub(b), along = w.dot(d) / 0.87, off = w.addScaledVector(d, -w.dot(d)).length();
          // (NOWAIST=1: a pose with the blade pointed, not cutting: the fist at the height HY instead)
          const cost = process.env.NOWAIST ? err + 0.05 * (Math.abs(fl) + Math.abs(dv)) + 0.02 * Math.abs(tw) + 0.8 * Math.abs(Pw.y - +(process.env.HY || 1.1))
            : err + 2.5 * off + (along < 0.3 ? (0.3 - along) * 2 : along > 0.75 ? (along - 0.75) * 2 : 0) + 0.05 * (Math.abs(fl) + Math.abs(dv));
          if (!best || cost < best.cost) best = { cost, err, tw, fl, dv, off, along, hy: Pw.y, dx: dc.x, dy: dc.y, dz: dc.z };
        }
      }
    }
    if (best) res.push({ ...best, x, y, z, P });
  }
  res.sort((a, c) => a.cost - c.cost);
  for (const r of res.slice(0, +(process.env.TOP || 6))) console.log(`  SEARCH ${t}: handR [${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)}] poleR [${r.P}] twistR ${r.tw.toFixed(2)} wristR [${r.fl.toFixed(2)}, ${r.dv.toFixed(2)}]  cost ${r.cost.toFixed(2)} (dir off ${(r.err * 57.3).toFixed(0)} deg, heading ${(Math.atan2(r.dx, r.dz) * 57.3).toFixed(0)} pitch ${(Math.asin(r.dy) * 57.3).toFixed(0)}, waist off ${(r.off * 100).toFixed(0)} cm at ${r.along.toFixed(2)} of the blade, fist at ${r.hy.toFixed(2)} m)`);
}
function solve(t, want) {
  const rig = W.rig, A = rig.arm.R, pl = rig.palm.R, sgn = -1;
  const Q1 = W.ch.bones['lowerarm01.R'].getWorldQuaternion(new THREE.Quaternion());
  const yl = new THREE.Vector3(0, 1, 0).applyQuaternion(sw.group.quaternion);
  const dl = new THREE.Vector3(0, 0, 1).applyQuaternion(sw.group.quaternion);
  const inv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -W.yaw);
  const qa = new THREE.Quaternion(), qd = new THREE.Quaternion(), qf = new THREE.Quaternion(), q = new THREE.Quaternion(), d = new THREE.Vector3();
  const cur = { tw: W.pose[POSE.twistR[0]], fl: W.pose[POSE.wristR[0]], dv: W.pose[POSE.wristR[0] + 1] };
  let best = null;
  const [tw0, tw1] = (process.env.TW || '-1.6,1.5').split(',').map(Number);
  for (let tw = tw0; tw <= tw1 + 1e-6; tw += 0.02) {
    qa.setFromAxisAngle(A.l0, tw * sgn);
    for (let fl = -0.6; fl <= 0.6001; fl += 0.05) {
      qf.setFromAxisAngle(pl.across, fl * sgn);
      for (let dv = -0.35; dv <= 0.6001; dv += 0.025) {
        qd.setFromAxisAngle(pl.palm, dv);
        q.copy(Q1).multiply(qa).multiply(qd).multiply(qf);
        d.copy(yl).applyQuaternion(q).applyQuaternion(inv);
        const err = Math.acos(Math.max(-1, Math.min(1, d.dot(want))));
        const cost = err + 0.06 * (Math.abs(fl) + Math.abs(dv)) + 0.015 * Math.abs(tw - cur.tw);
        if (!best || cost < best.cost) best = { cost, err, tw, fl, dv, d: d.clone() };
      }
    }
  }
  console.log(`  SOLVE ${t}: want ${v(want)} -> twistR: ${best.tw.toFixed(2)}, wristR: [${best.fl.toFixed(2)}, ${best.dv.toFixed(3)}]  (off by ${(best.err * 57.3).toFixed(0)} deg, gives ${v(best.d)}; now twist ${cur.tw.toFixed(2)} wrist [${cur.fl.toFixed(2)}, ${cur.dv.toFixed(2)}])`);
}
console.log(`${wid} vs ${lid}: cut at ${F.cut}, distance ${F.dist}`);
console.log('frame  handR(char)        base(char)          tip(char)           bladeDir(char)     | loser: waistY  blade-spine d  crossY  along');
for (let t = 1; t <= +to; t++) {
  m.step();
  if (SPLITF) {
    if (t === F.cut) {
      for (const f of m.fighters) { f.syncRender(1); f.ch.group.updateMatrixWorld(true); }
      split = new SplitBody(new THREE.Scene(), L); split.begin();
      const y = W.yaw, right = new THREE.Vector3(-Math.cos(y), 0, Math.sin(y)), slide = right.clone().negate();
      const p = L.ch.bones.spine04.getWorldPosition(new THREE.Vector3()).lerp(L.ch.bones.spine03.getWorldPosition(new THREE.Vector3()), 0.55);
      split.doCut(new THREE.Vector3(0, 1, 0).addScaledVector(slide, Math.tan(0.2)).normalize(), p);
      split.slideDirV = slide;
      console.log('cut at', v(p), 'section', split.R.x.toFixed(3), split.R.y.toFixed(3), 'slide to', v(slide));
    }
    if (split) {
      if (t === SPLITF.up) split.slide(split.slideDirV, 0.12, 1.7, 0.7);
      if (t === SPLITF.down) split.release('down', new THREE.Vector3(1.1, 0.35, 0.25));
      split.step();
      if (t % 4 === 0) { const P = split.P; console.log(String(t).padStart(5), 'chest', v(P.chest.p), 'head', v(P.head.p), 'cutU', v(P.cutU.p), '| hips', v(P.pelvis.p), 'knees', v(P.knL.p), v(P.knR.p)); }
    }
    continue;
  }
  if (t < +from || (t % STEP && Math.abs(t - F.cut) > 4 && !SOLVE.has(t) && !SEARCH.has(t))) continue;
  for (const f of m.fighters) { f.syncRender(1); f.ch.group.updateMatrixWorld(true); }
  const b = sw.group.localToWorld(sw.base.clone()), tp = sw.group.localToWorld(sw.tip.clone());
  const hand = W.ch.bones['wrist.R'].getWorldPosition(new THREE.Vector3());
  const bc = toChar(W, b), tc = toChar(W, tp), dir = tc.clone().sub(bc).normalize();
  // the loser's spine from the hips to the chest (render skeleton)
  const s5 = L.ch.bones.spine05.getWorldPosition(new THREE.Vector3()), s1 = L.ch.bones.spine01.getWorldPosition(new THREE.Vector3());
  const s4 = L.ch.bones.spine04.getWorldPosition(new THREE.Vector3()), s3 = L.ch.bones.spine03.getWorldPosition(new THREE.Vector3());
  const waist = s4.clone().add(s3).multiplyScalar(0.5);
  const x = segSeg(b, tp, s5, s1);
  if (SOLVE.has(t)) solve(t, SOLVE.get(t));
  if (SEARCH.has(t)) search(t, SEARCH.get(t));
  console.log(String(t).padStart(5), ' ', v(toChar(W, hand)).padEnd(18), v(bc).padEnd(19), v(tc).padEnd(19), v(dir).padEnd(18), '|', waist.y.toFixed(2).padStart(6), x.d.toFixed(3).padStart(10), x.Q.y.toFixed(2).padStart(8), x.s.toFixed(2).padStart(6));
}
