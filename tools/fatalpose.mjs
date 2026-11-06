// Any winner's PUÑETALITY measured frame by frame, no browser: per frame the hands, the elbows, the feet and the
// knees in his own axes (x his left, y up, z the way he faces), his place and heading.
// usage (from tools/): node --import ./register.mjs fatalpose.mjs [winner] [loser] [from] [to] [step]
//   WANT="frame:R|L:x,y,z;...": the hand target (aim 1) that puts that hand at (x, y, z) in his axes at that frame
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
const [wid = 'alejandro', lid = 'rafa', from = '0', to = '300', stepArg = '6'] = process.argv.slice(2);
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
m.startFatal();
const F = W.style.fatal;
const v = (x) => x.toArray().map((a) => a.toFixed(2)).join(',');
const toW = (p) => W.worldToChar(p.clone(), new THREE.Vector3());
const parse = (e) => e.split(';').filter(Boolean).map((x) => x.split(':'));
const WANT = parse(process.env.WANT || '').map(([f, s, d]) => ({ f: +f, s, d: new THREE.Vector3(...d.split(',').map(Number)) }));
// (frame:direction[:face]: the strings' face to look along `face` too, either side)
const SOLVE_UNUSED = parse(process.env.SOLVE || '').map(([f, d, fc]) => ({ f: +f, d: new THREE.Vector3(...d.split(',').map(Number)).normalize(), face: fc ? new THREE.Vector3(...fc.split(',').map(Number)).normalize() : null }));
const CONTACT = +(process.env.CONTACT || -1);
function want(S) {
  const sh = W.rig.world[`upperarm01.${S.s}`].p, A = W.rig.arm[S.s];
  const t = S.d.clone().sub(sh).multiplyScalar(1 / A.len);
  if (S.s === 'R') t.x = -t.x;
  console.log(`  WANT ${S.f} ${S.s}: at ${v(S.d)} -> hand${S.s}: [${t.toArray().map((a) => a.toFixed(2)).join(', ')}], aim${S.s}: 1   (shoulder ${v(sh)}, arm ${A.len.toFixed(3)})`);
}
console.log(`${wid} vs ${lid}`);
console.log('frame  pos(x,z) yaw     handR             handL             elbowR            footR             footL             kneeL');
for (let t = 1; t <= +to; t++) {
  m.step();
  const ws = WANT.filter((S) => S.f === t);
  if (t < +from || (t % +stepArg && !ws.length)) continue;
  for (const f of m.fighters) { f.syncRender(1); f.ch.group.updateMatrixWorld(true); }
  for (const S of ws) want(S);
  if (process.env.CH) { const { POSE } = await import(GAME + '/js/anim/rig.js'); console.log(String(t).padStart(5), W.clipName, process.env.CH.split(',').map((n) => n + ' ' + Array.from(W.pose.subarray(POSE[n][0], POSE[n][0] + POSE[n][1])).map((a) => a.toFixed(2)).join(',')).join('  ')); continue; }
  const B = (n) => toW(W.ch.bones[n].getWorldPosition(new THREE.Vector3()));
  if (process.env.LOSER) {
    const fw = new THREE.Vector3(Math.sin(W.yaw), 0, Math.cos(W.yaw)), side = new THREE.Vector3(-fw.z, 0, fw.x), L0 = m.fatalL0 || L.pos;
    const P = (n) => { const p = L.ch.bones[n].getWorldPosition(new THREE.Vector3()).sub(L0); return [p.dot(fw), p.dot(side), p.y].map((a) => a.toFixed(2)).join(','); };
    if (process.env.BONES) { console.log(String(t).padStart(5), process.env.BONES.split(',').map((n) => n + ' ' + P(n)).join('  ')); continue; }
    console.log(String(t).padStart(5), ' L pos', L.pos.y.toFixed(2), ' root', P('root'), ' spine04', P('spine04'), ' spine02', P('spine02'), ' head', P('head'), ' shR', P('upperarm01.R'), ' thighL', P('upperleg02.L'), ' handL', P('wrist.L'), ' footL', P('foot.L'));
    continue;
  }
  console.log(String(t).padStart(5), ' ', (W.pos.x.toFixed(2) + ',' + W.pos.z.toFixed(2)).padEnd(11), W.yaw.toFixed(2).padEnd(6), v(B('wrist.R')).padEnd(17), v(B('wrist.L')).padEnd(17), v(B('lowerarm01.R')).padEnd(17), v(B('foot.R')).padEnd(17), v(B('foot.L')).padEnd(17), v(B('lowerleg01.L')));
}
