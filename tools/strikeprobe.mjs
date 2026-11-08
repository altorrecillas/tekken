// Every strike of every fighter measured, no browser: one row per move. What makes a blow read as real and strong:
//  - out / back: the striking limb's peak speed (m/s) on the way to the hit and on the way back (out > back);
//  - ext: the limb's angle at the first hit frame (elbow for fists and forearms, knee for feet and knees; 180 straight);
//  - turn: how far the shoulders (or the hips, for kicks) turn between the chamber and the hit (degrees: power comes
//    from the body turning behind the blow);
//  - wind: frames from the move's start to the hit; anti: whether the limb first moves away from the target (a
//    wind-up) by more than 3 cm;
//  - frz: frames at the hit window where the limb doesn't move at all (a dead hold).
// usage (from tools/): node --import ./register.mjs strikeprobe.mjs [fighters] [moves]
import fs from 'fs';
const GAME = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.document = { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { buildCharacter } = await import(GAME + '/js/charloader.js');
const { Rig, newPose } = await import(GAME + '/js/anim/rig.js');
const { buildMoves } = await import(GAME + '/js/fight/moves.js');
const { STYLES } = await import(GAME + '/js/fight/styles.js');
const ids = (process.argv[2] || 'alejandro,aleix,camilo,rafa,zapponi,dani,noemi,orion').split(',');
const only = process.argv[3] ? process.argv[3].split(',') : null;
const LIMB = { handL: ['upperarm01.L', 'lowerarm01.L', 'wrist.L'], handR: ['upperarm01.R', 'lowerarm01.R', 'wrist.R'], forearmL: ['upperarm01.L', 'lowerarm01.L', 'wrist.L'], forearmR: ['upperarm01.R', 'lowerarm01.R', 'wrist.R'],
  footL: ['upperleg01.L', 'lowerleg01.L', 'foot.L'], footR: ['upperleg01.R', 'lowerleg01.R', 'foot.R'], kneeL: ['upperleg01.L', 'lowerleg01.L', 'lowerleg01.L'], kneeR: ['upperleg01.R', 'lowerleg01.R', 'lowerleg01.R'] };
const ang = (a, b, c) => { const u = a.clone().sub(b).normalize(), v = c.clone().sub(b).normalize(); return Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180 / Math.PI; };
const yawOf = (a, b) => Math.atan2(b.x - a.x, b.z - a.z) * 180 / Math.PI;
const rows = [];
for (const id of ids) {
  const meta = JSON.parse(fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.json`)); const buf = fs.readFileSync(`${GAME}/assets/chars/${id}/mesh.bin`);
  const ch = buildCharacter({ id, base: '', meta, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }, () => new THREE.MeshBasicMaterial());
  const rig = new Rig(ch); const p = newPose();
  const moves = buildMoves(STYLES[id]);
  for (const [name, m] of Object.entries(moves)) {
    if (!m.hit || !m.clip || m.hit.lvl === 'throw' || /^throw|rageArt|Exec|Knee|Hug|Suplex/.test(name) || (only && !only.includes(name))) continue;
    const L = LIMB[m.hit.limb]; if (!L) continue;
    const kick = /^(foot|knee)/.test(m.hit.limb);
    const f0 = m.hit.f[0], f1 = m.hit.f[1];
    const pos = [], extA = [], sh = [];
    for (let f = 0; f <= Math.min(m.total, f1 + 30); f++) {
      m.clip.sample(f, p); rig.apply(p);
      const W = (n) => rig.world[n].p.clone();
      pos.push(W(L[2])); extA.push(ang(W(L[0]), W(L[1]), W(L[2])));
      sh.push(kick ? yawOf(W('upperleg01.R'), W('upperleg01.L')) : yawOf(W('upperarm01.R'), W('upperarm01.L')));
    }
    const sp = pos.map((v, i) => (i ? v.distanceTo(pos[i - 1]) * 60 : 0));
    const out = Math.max(...sp.slice(1, f0 + 1)), back = Math.max(0, ...sp.slice(f1 + 2));
    // the chamber: where the limb is furthest back before the hit (min z)
    let fc = 0; for (let f = 1; f < f0; f++) if (pos[f].z < pos[fc].z) fc = f;
    const anti = pos[0].z - pos[fc].z > 0.03;
    let turn = sh[f0] - sh[fc]; while (turn > 180) turn -= 360; while (turn < -180) turn += 360;
    let frz = 0; for (let f = f0 + 1; f <= f1; f++) if (sp[f] < 0.05) frz++;
    rows.push({ id, name, limb: m.hit.limb, lvl: m.hit.lvl, dmg: m.hit.dmg, wind: f0, total: m.total, out, back, ext: extA[f0], turn, anti, frz });
  }
}
console.log('fighter    move            limb      lvl   dmg wind/tot  out  back  ext  turn anti frz  flags');
for (const r of rows) {
  const fl = [];
  if (r.back > r.out * 0.95) fl.push('BACK>=OUT');
  if (r.out < (r.limb.startsWith('foot') ? 8 : 6)) fl.push('SLOW');
  if (/^hand/.test(r.limb) && r.ext < 100 && !/upper|hook|liver|gazelle|smash|axe|hammer|lariat|slap|backfist|triage|defib/i.test(r.name)) fl.push('BENT');
  if (!r.anti && r.dmg >= 14) fl.push('NO-WINDUP');
  if (Math.abs(r.turn) < 8 && r.dmg >= 14) fl.push('NO-BODY');
  console.log(`${r.id.padEnd(10)} ${r.name.padEnd(15)} ${r.limb.padEnd(9)} ${r.lvl.padEnd(5)} ${String(r.dmg).padStart(3)} ${String(r.wind).padStart(3)}/${String(r.total).padEnd(3)} ${r.out.toFixed(1).padStart(5)} ${r.back.toFixed(1).padStart(5)} ${r.ext.toFixed(0).padStart(4)} ${r.turn.toFixed(0).padStart(5)} ${r.anti ? ' yes' : '  no'} ${String(r.frz).padStart(3)}  ${fl.join(' ')}`);
}
