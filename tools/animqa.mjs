// Animation QA: run AI fights headless and measure foot sliding, floating/penetrating feet, straight (locked)
// knees, crossed feet, hands inside the torso and pose pops (acceleration spikes), per state / clip.
// usage: node --import ./register.mjs animqa.mjs [frames] [pairs...]   pairs as a-b
import fs from 'fs';
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Match } = await import(GAME + '/js/fight/match.js');
const { AIController } = await import(GAME + '/js/fight/ai.js');
const { POSE } = await import(GAME + '/js/anim/rig.js');
const N = +(process.argv[2] || 6000);
const pairs = (process.argv.slice(3).length ? process.argv.slice(3) : ['alejandro-rafa', 'camilo-zapponi', 'arnau-alejandro', 'rafa-camilo', 'zapponi-arnau', 'dani-camilo']).map(s => s.split('-'));
function load(id) {
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`));
  const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  return { id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
}
const mat = () => new THREE.MeshBasicMaterial();
const S = { frames: 0, foot: {}, pops: {}, hands: {}, knees: {}, cross: {}, floatF: {}, sink: {}, trans: {}, intr: {}, intrMax: {} };
const inc = (o, k, v = 1) => (o[k] = (o[k] || 0) + v);
const J = ['wrist.L', 'wrist.R', 'foot.L', 'foot.R', 'head', 'spine03'];
for (const [p1, p2] of pairs) {
  const chars = [buildCharacter(load(p1), mat), buildCharacter(load(p2), mat)];
  const cam = { right: () => new THREE.Vector3(1, 0, 0), forwardFlat: () => new THREE.Vector3(0, 0, -1), setMode() {}, shake() {}, punch() {} };
  const game = {
    fx: { hitSpark() {}, blockSpark() {}, dust() {}, koFlash() {}, sweat() {}, trail() {} },
    hud: { roundStart() {}, announce() {}, popup() {}, combo() {}, update() {}, hideAll() {}, hideBars() {}, introNames() {}, winner() {} },
    camCtl: cam, audio: null, stage: { arenaRadius: 6.2 }, onKO() {}, onMatchEnd() {}, ragdolls: { clear() {}, freeze() {} },
  };
  const m = new Match(game, chars, [p1, p2], { rounds: 99 });
  const ais = [new AIController(5), new AIController(5)];
  m.fighters.forEach((f, i) => { ais[i].attach(f, m); f.ctrl = ais[i]; });
  m.startRound();
  const hist = m.fighters.map(() => ({ p: [], foot: { L: null, R: null }, clip: [] }));
  for (let i = 0; i < N; i++) {
    m.step(); m.events.length = 0;
    if (m.phase !== 'fight') { hist.forEach(h => { h.p.length = 0; h.foot.L = h.foot.R = null; }); continue; }
    m.fighters.forEach((f, k) => {
      if (f.ragdoll || f.ko) return;
      const H = hist[k], st = f.state, cl = f.clipName, key = st === 'move' ? 'move:' + f.moveName : st;
      S.frames++;
      const ls = f.rig.legScale || 1, as = f.rig.armScale || 1;
      // --- feet
      for (const s of ['L', 'R']) {
        const fy = f.pose[POSE['foot' + s][0] + 1];
        const planted = fy <= 0.071 + 0.006;
        const a = f.boneWorld('foot.' + s);
        const prev = H.foot[s];
        if (planted && prev && prev.planted) {
          const d = Math.hypot(a.x - prev.x, a.z - prev.z);
          const o = S.foot[key] || (S.foot[key] = { n: 0, sum: 0, big: 0 });
          o.n++; o.sum += d; if (d > 0.004) o.big++;
        }
        // floating = the ball of the foot off the floor (a raised heel is fine)
        const ball = f.boneWorld('toe3-1.' + s);
        if (planted && ball.y > 0.035 * ls + 0.025) inc(S.floatF, key);
        if (a.y < 0.071 * ls - 0.02) inc(S.sink, key);
        H.foot[s] = { x: a.x, z: a.z, planted };
        // knee straightness
        const hp = f.rig.world['upperleg01.' + s]?.p, kp = f.rig.world['lowerleg01.' + s]?.p, ap = f.rig.world['foot.' + s]?.p;
        if (hp && kp && ap) {
          const u = kp.clone().sub(hp).normalize(), v = ap.clone().sub(kp).normalize();
          const ang = Math.acos(Math.min(1, Math.max(-1, u.dot(v)))) * 180 / Math.PI; // 0 = straight
          if (ang < 6 && ['idle', 'walkF', 'walkB', 'block', 'crouch'].includes(st)) inc(S.knees, key);
        }
      }
      const aL = f.boneWorld('foot.L'), aR = f.boneWorld('foot.R');
      if (Math.hypot(aL.x - aR.x, aL.z - aR.z) < 0.13 * ls) inc(S.cross, key);
      // --- hands inside the torso (capsule hips..neck)
      const A = f.rig.world['spine05']?.p || f.rig.world['spine04']?.p, B = f.rig.world['neck01']?.p;
      if (A && B) for (const s of ['L', 'R']) {
        const w = f.rig.world['wrist.' + s].p;
        const ab = B.clone().sub(A), t = Math.max(0, Math.min(1, w.clone().sub(A).dot(ab) / ab.lengthSq()));
        const d = w.distanceTo(A.clone().addScaledVector(ab, t));
        if (d < 0.1 * as) inc(S.hands, key + ':' + s);
      }
      // --- upper body inside the opponent: head / chest vs the opponent's torso capsule (>2 cm)
      const o = f.opp;
      if (o && !o.ragdoll && !['throwing', 'thrown', 'rageArt', 'rageHit'].includes(st) && !['throwing', 'thrown'].includes(o.state)) {
        const oa = o.boneWorld('spine05'), ob = o.boneWorld('neck01'), rT = o.bodyR + 0.03;
        for (const [bn, r] of [['head', 0.11], ['spine02', 0.13]]) {
          const P = f.boneWorld(bn), ab = ob.clone().sub(oa), t = Math.max(0, Math.min(1, P.clone().sub(oa).dot(ab) / ab.lengthSq()));
          const pen = r + rT - P.distanceTo(oa.clone().addScaledVector(ab, t));
          if (pen > 0.02) { inc(S.intr, key + ':' + bn); S.intrMax[key + ':' + bn] = Math.max(S.intrMax[key + ':' + bn] || 0, pen); }
        }
      }
      // --- pops: acceleration of key joints in character space
      const P = J.map(n => f.rig.world[n].p.clone());
      H.p.push(P); if (H.p.length > 3) H.p.shift();
      H.clip.push(cl + '|' + st); if (H.clip.length > 3) H.clip.shift();
      if (H.p.length === 3) {
        let amax = 0, jn = '';
        for (let j = 0; j < J.length; j++) {
          const acc = H.p[2][j].clone().sub(H.p[1][j].clone().multiplyScalar(2)).add(H.p[0][j]).length();
          if (acc > amax) { amax = acc; jn = J[j]; }
        }
        if (amax > 0.03) {
          const tr = H.clip[0] !== H.clip[2] ? `${H.clip[0]} -> ${H.clip[2]}` : `in ${H.clip[2]} f${Math.round(st === 'move' ? f.mf : f.cf)}`;
          const kk = `${tr} [${jn}]`;
          const o = S.pops[kk] || (S.pops[kk] = { n: 0, max: 0 });
          o.n++; o.max = Math.max(o.max, amax);
        }
      }
    });
  }
}
const top = (o, n = 25, f = (v) => v) => Object.entries(o).sort((a, b) => f(b[1]) - f(a[1])).slice(0, n);
console.log('frames (fighter-frames):', S.frames);
console.log('\n== planted-foot sliding by state (mean mm/frame, % frames > 4 mm) ==');
for (const [k, o] of top(S.foot, 30, v => v.n)) console.log(k.padEnd(28), 'n', String(o.n).padStart(6), 'mean', (o.sum / o.n * 1000).toFixed(2).padStart(6), 'mm', 'big', (100 * o.big / o.n).toFixed(1).padStart(5) + '%');
console.log('\n== planted foot floating >2.5cm ==', JSON.stringify(top(S.floatF, 12)));
console.log('== foot sinking >2cm ==', JSON.stringify(top(S.sink, 12)));
console.log('== straight knees in stance states ==', JSON.stringify(top(S.knees, 12)));
console.log('== feet crossing/colliding ==', JSON.stringify(top(S.cross, 12)));
console.log('== wrist inside torso ==', JSON.stringify(top(S.hands, 16)));
console.log('== head/chest inside the opponent (>2cm): frames, max cm ==', JSON.stringify(top(S.intr, 16).map(([k, n]) => [k, n, +(S.intrMax[k] * 100).toFixed(1)])));
console.log('\n== pose pops (joint accel > 3 cm/frame^2), by transition / clip ==');
for (const [k, o] of top(S.pops, 40, v => v.n)) console.log(String(o.n).padStart(5), (o.max * 100).toFixed(1).padStart(6), 'cm/f2 ', k);
