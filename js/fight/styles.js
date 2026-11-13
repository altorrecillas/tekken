// Per-fighter fighting styles: stance variations, stats, unique moves, intros and victory poses.
import { PADP, PAD_MOVE, padGrips } from './padpath.js';
const GUARD_L = [0.02, 0.2, 0.62], GUARD_R = [-0.08, 0.3, 0.44];

const RESET = { rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.1, 0.12, 0], neck: [0.16, 0.2, 0],
  handL: GUARD_L, handR: GUARD_R, aimL: 0, aimR: 0, twistL: -0.4, twistR: -0.55, clavL: [-0.05, 0.1], clavR: [-0.05, 0.12],
  footL: [0.05, 0.071, 0.24], footR: [0.2, 0.071, -0.2], kneeL: [0.15, 0, 1], kneeR: [0.5, 0, 1], footRotL: [0, -0.35, 0], footRotR: [0, 0.65, 0], toeL: 0, toeR: 0 };

// a pedalling loop for a rider on Zapponi's bike (js/fx/bicycle.js BIKE, the same measures): one turn of the cranks in
// `len` frames, the ankles over the pedals (the right one forwards at frame 0 and going down, the left half a turn on),
// keys every 2 frames; base: the rest of the pose, sway(k): more of it at each point of the turn (k 0..1)
const PEDAL = { bb: [0.27, 0], crank: 0.172, ankle: [0.075, -0.085], stance: 0.115 };
function ankleAt(c) { return [PEDAL.stance, +(PEDAL.bb[0] - PEDAL.crank * Math.sin(c) + PEDAL.ankle[0]).toFixed(4), +(PEDAL.bb[1] + PEDAL.crank * Math.cos(c) + PEDAL.ankle[1]).toFixed(4)]; }
function pedalPose(c) {
  // (the toes a little down as the foot pushes round the bottom)
  const pitch = (a) => +(0.12 + 0.12 * Math.sin(a)).toFixed(3);
  return { footR: ankleAt(c), footL: ankleAt(c + Math.PI), footRotR: [pitch(c), 0.05, 0], footRotL: [pitch(c + Math.PI), 0.05, 0], toeL: 0, toeR: 0 };
}
function pedalLoop(base, len = 24, sway = null) {
  const keys = [];
  for (let f = 0; f <= len; f += 2) keys.push([f, { ...base, ...pedalPose(f / len * Math.PI * 2), ...(sway ? sway(f / len) : {}) }, f ? 'lin' : undefined]);
  return keys;
}
// Zapponi on the bike: seated, the back flat, looking up the road (the hands are held on the horns: fatal.grip)
const RIDE = { rootPos: [0, 0.067, -0.137], rootRot: [0.55, 0, 0], spine: [0.42, 0, 0], neck: [-0.85, 0, 0], clavL: [0, 0.1], clavR: [0, 0.1],
  handL: [0.3, -0.4, 0.55], handR: [0.3, -0.4, 0.55], aimL: 1, aimR: 1, fistL: 0.85, fistR: 0.85, twistL: 0.2, twistR: 0.2, wristL: [0, 0], wristR: [0, 0],
  poleL: [0.7, -0.5, -0.4], poleR: [0.7, -0.5, -0.4], kneeL: [0.12, 0.1, 1], kneeR: [0.12, 0.1, 1], hgL: 0, hgR: 0, ptL: 0, ptR: 0, thL: 0, thR: 0, jaw: 0.05 };
// out of the saddle, sprinting: the hips up and over the cranks, the bike thrown side to side under him
const SPRINT = { ...RIDE, rootPos: [0, 0.17, 0.02], rootRot: [0.78, 0, 0], spine: [0.25, 0, 0], neck: [-0.95, 0, 0], jaw: 0.35, poleL: [0.8, -0.4, -0.3], poleR: [0.8, -0.4, -0.3] };

export const STYLES = {
  alejandro: {
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0.1, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.2, -0.88, 0.1], handR: [0.2, -0.88, 0.1], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, footL: [0.14, 0.071, 0.04], footR: [0.14, 0.071, -0.02], footRotL: [0, 0.15, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      [22, { neck: [0.35, 0, 0], handL: [0.15, 0.92, -0.12], handR: [0.12, 0.93, -0.16], poleL: [0.6, 0.6, -0.2], poleR: [0.6, 0.6, -0.2], fistL: 0.8, fistR: 0.8, spine: [0.05, 0, 0] }, 'inout'],
      [48, { handL: [0.32, 0.86, -0.1], handR: [0.3, 0.86, -0.12] }, 'inout'],
      // fist into palm at chest height: the intro close-up keeps the face clear
      [62, { neck: [0.05, 0, 0], handL: [0.05, -0.2, 0.55], handR: [-0.12, -0.17, 0.53], fistL: 0.15, fistR: 1, poleL: [0.3, -1, -0.2], poleR: [0.3, -1, -0.2] }, 'inout'],
      [70, { handR: [-0.08, -0.19, 0.59] }, 'snap'],
      [95, null, 'inout'],
    ],
    title: 'El Runner', desc: 'Encuentra cualquier momento para salir a correr, no perdona ni una.',
    say: '¿Eso era todo? Ni me he despeinado.', sayAt: 78, sayLen: 147, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Calienta bien, que esto va a ser rápido.', introLen: 133, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 182, walk: 1.24, weight: 1.0, power: 1.06, speed: 1.08 },
    hairSway: 0.8, // how far the hair swings with the head: the topknot and its tail (js/anim/hairsway.js)
    aiMoves: ['1', '1', '2', 'd+3', 'df+1', 'df+2', '3', '4', 'b+4', '1+2', 'd+4', '1+3', 'f+2', 'f,f+4', '3+4', 'b+3', 'f+1'], longRange: ['f,f+4', '3+4'], juggle: ['1', '2', '4'],
    // a natural kickboxer's guard: standing up straight (the default one, js/anim/poses.js STANCE, leant him forward
    // from the hips, the head pushed out and the chin tucked), the knees just soft, the fists at the chin and close
    // to him (the default held the rear one 10 cm under the head: from the side where that hand is nearer the camera
    // it hid his face)
    // (upright, but not set back: straight up he stood 9 cm further back than everyone else's reach was tuned for, and
    // the combos of the trials stopped reaching him)
    stance: { rootPos: [0, -0.07, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.12, 0.11, 0], neck: [0.1, 0.18, 0],
      hgPosL: [0.07, -0.13, 0.3], hgPosR: [0.1, -0.18, 0.12] }, // (the rear fist 23 cm out: closer, it was in his chest)
    bob: 0.022,
    onetwoFinish: 'roundhouse',
    commands: [['b+4', 'spinKick'], ['1+2', 'tattooCombo'], ['f+2', 'superman'], ['f,f+4', 'sprintKick'], ['3+4', 'flyKick'], ['b+3', 'hurdle'], ['f+1', 'finishLean']],
    stringFinish: 'finishLean', // (the end of his own 1, 2, 3: js/fight/moves.js straight's cancel)
    // the phone's ★ buttons (js/ui/touch.js): the special that ★ PUÑO / ★ PATADA throws with the stick at rest (n),
    // forward (f), back (b) or down (d), as the command it stands for
    touchSP: { P: { n: '1+2', f: 'f+2', b: 'f+1', d: 'df+2' }, K: { n: '3+4', f: 'f,f+4', b: 'b+3', d: 'd+4' } },
    moves: (C) => ({
      // spinning back kick: the body spins clockwise on the ball of the lead foot (the support knee turning with it),
      // the rear knee chambers in front of the pelvis, then the leg drives straight back at the target, heel
      // first, while the torso leans away as counterweight; the leg re-chambers and the body unwinds to the guard
      spinKick: {
        name: 'Spinning back kick', total: 48, clip: C([
          [0, {}],
          [6, { rootRot: [0.1, -1.5, 0], spine: [0.1, 0.35, 0], neck: [0, 0.9, 0], footRotL: [0.25, -1.3, 0], footRotR: [0.45, 0.65, 0],
            handL: [0.35, -0.05, 0.3], handR: [0.3, -0.1, 0.2], aimL: 1, aimR: 1 }, 'inout'],
          // the rear foot leaves the floor under its own hip, the knee rising on its own side of the pelvis (left to
          // find its way from the stance to the chamber, it swung across in front of the support knee: thighs
          // through each other for six frames)
          [9, { footR: [-0.1, 0.3, -0.18], kneeR: [0.45, 0.2, -0.8] }, 'inout'],
          [12, { rootPos: [0, -0.05, 0], rootRot: [0.3, -2.7, 0], spine: [0.2, 0.5, 0], neck: [0, 1.0, 0], footL: [0.02, 0.071, 0.18], footRotL: [0.3, -2.3, 0],
            footR: [-0.03, 0.62, -0.18], kneeR: [-0.1, 0.3, -0.95], footRotR: [0.4, 0, 0], handL: [0.4, -0.05, 0.25], handR: [0.4, 0.0, 0.1] }, 'inout'],
          // the leg drives straight back from its own hip, the heel first. The hips stop a little short of square
          // to the back (a side-on back kick: the leg comes out sideways from the hip as well as behind it, so the
          // trunk only has to tip 40 degrees away instead of 60, when he looked like falling over backwards) and
          // they roll over the support leg; the head stays up and on the target over the shoulder
          [20, { rootPos: [0, -0.05, 0.02], rootRot: [0.8, -3.08, 0.06], spine: [0.16, 0.45, 0.1], neck: [-0.12, 1.0, -0.15], kneeL: [-0.25, 0.2, -0.9], footRotL: [0.3, -2.3, 0],
            footR: [-0.03, 0.8, 0.9], kneeR: [-0.1, -1, 0.2], footRotR: [1.2, 0, 0], handL: [0.42, -0.12, 0.3], handR: [0.46, 0.05, 0.1] }, 'drive'],
          [24, {}, 'lin'],
          // re-chamber two frames sooner, so that the unwinding to the guard is spread over more frames (squeezed
          // into seven, the knee whipped round)
          [34, { rootPos: [0, -0.06, 0], rootRot: [0.35, -2.6, 0], spine: [0.15, 0.4, 0], neck: [0, 0.8, 0], kneeL: [0.15, 0, 1], footRotL: [0.25, -2.3, 0],
            footR: [-0.03, 0.55, -0.12], kneeR: [0.43, 0.3, -0.9], footRotR: [0.4, 0, 0] }, 'inout'],
          [42, { rootPos: [0, -0.09, -0.02], rootRot: [0.12, -1.2, 0], spine: [0.1, 0.2, 0], neck: [0.1, 0.5, 0], footRotL: [0.1, -1.0, 0],
            footR: [0.25, 0.071, -0.15], kneeR: [0.5, 0, 1], footRotR: [0.3, 0.65, 0], handL: [0.02, 0.2, 0.62], handR: [-0.08, 0.3, 0.44], aimL: 0, aimR: 0 }, 'inout'],
          [48, null, 'inout'],
        ]),
        hit: { f: [20, 23], limb: 'footR', r: 0.14, dmg: 24, lvl: 'mid', react: 'hitMid', blk: -14, kd: true, push: 0.6 },
        advance: [[0, 0], [20, 0.18], [48, 0.18]], sfx: 'heavy',
      },
      tattooCombo: {
        name: 'Tattoo rush', total: 50, clip: C([
          [0, {}],
          [8, { handL: [0.05, 0.05, 0.99], aimL: 1, twistL: 0.75, twistR: 0.0, rootRot: [0.12, -0.6, 0], clavL: [0, 0.4], rootPos: [0, -0.1, 0.06] }, 'snap'],
          [14, { handL: GUARD_L, aimL: 0, handR: [-0.05, 0.05, 0.99], aimR: 1, twistR: 0.84, rootRot: [0.14, 0.2, 0], spine: [0.1, 0.4, 0], clavR: [0, 0.45] }, 'snap'],
          [22, { handR: [0.25, 0.15, 0.85], aimR: 1, twistR: -0.3, rootRot: [0.1, -0.7, 0], spine: [0.15, -0.3, 0], handL: [0.1, 0.1, 0.95], aimL: 1 }, 'snap'],
          [26, {}, 'lin'],
          [50, null, 'inout'],
        ]),
        hit: { f: [21, 24], limb: 'handL', r: 0.12, dmg: 22, lvl: 'high', react: 'hitHigh', blk: -10, kd: true, push: 0.5 },
        advance: [[0, 0], [8, 0.12], [22, 0.3], [50, 0.3]], sfx: 'heavy',
      },
      // SUPERMAN: a feint of the rear knee up in front, then that leg scissors back, almost straight, the knee to the
      // floor and the toes pointed, as he springs off the lead foot and flies in behind the rear straight, the body
      // laid forward along the line of the punch; he lands on the lead foot as it connects, the rear leg still out
      // behind for the balance, then it comes down behind him and the guard comes back. (The first version kicked the
      // leg back with the knee turned backwards: the heel came up to the seat, a bird's leg)
      superman: {
        name: 'Superman punch', total: 38, clip: C([
          [0, {}],
          // the weight onto the lead leg, the rear knee starting up in front
          [4, { rootPos: [0, -0.12, 0.0], rootRot: [0.1, -0.5, 0], spine: [0.1, 0.12, 0], footR: [0.16, 0.16, -0.06], kneeR: [0.15, 0.3, 1], footRotR: [0.3, 0.55, 0] }, 'inout'],
          // the feint: the knee up in front, as for a knee strike
          [8, { rootPos: [0, -0.08, 0.02], rootRot: [0.06, -0.45, 0], spine: [0.08, 0.15, 0], footR: [0.14, 0.34, 0.1], kneeR: [0.1, 0.6, 1], footRotR: [0.1, 0.4, 0] }, 'inout'],
          // the spring: the leg swings down and back under the hip (the knee turning down as it goes), the lead foot
          // pushes off and leaves the floor, the body tips forward, the rear fist cocked by the jaw
          [12, { rootPos: [0, -0.03, 0.08], rootRot: [0.3, -0.25, 0], spine: [0.12, 0.25, 0], neck: [0.0, 0.0, 0],
            footR: [0.12, 0.28, -0.5], kneeR: [0.1, -1, 0.25], footRotR: [1.0, 0.3, 0],
            footL: [0.05, 0.12, 0.26], kneeL: [0.1, 0.4, 1], footRotL: [0.4, -0.35, 0],
            handR: [-0.12, 0.26, 0.38], fistR: 1, twistR: 0.25, handL: [-0.2, 0.22, 0.4] }, 'inout'],
          // the punch: laid out along it, the rear leg straight out behind, landing on the lead foot
          [15, { rootPos: [0, -0.04, 0.1], rootRot: [0.4, 0.1, 0], spine: [0.12, 0.45, 0], neck: [-0.12, -0.3, 0],
            handR: [-0.06, 0.12, 1.0], aimR: 1, twistR: 0.84, fistR: 1, clavR: [0.05, 0.5], handL: [-0.25, 0.2, 0.35],
            footR: [0.12, 0.3, -0.62], kneeR: [0.1, -1, 0.1], footRotR: [1.1, 0.3, 0],
            footL: [0.05, 0.071, 0.27], kneeL: [0.25, 0, 1], footRotL: [0, -0.35, 0] }, 'drive'],
          [17, {}, 'lin'],
          // the fist back on its line; the rear foot coming down behind him, the knee turning forward again
          [24, { rootPos: [0, -0.1, 0.07], rootRot: [0.15, -0.2, 0], spine: [0.1, 0.25, 0], neck: [0.12, 0.1, 0], handR: [-0.14, 0.2, 0.62], twistR: 0.15, clavR: [0.0, 0.25],
            footR: [0.2, 0.13, -0.36], kneeR: [0.3, -0.5, 0.8], footRotR: [0.45, 0.6, 0] }, 'ret'],
          [31, { rootPos: [0, -0.085, 0.02], rootRot: [0.07, -0.42, 0], spine: [0.1, 0.12, 0], neck: [0.16, 0.2, 0], handR: GUARD_R, aimR: 0, handL: GUARD_L,
            footR: [0.2, 0.071, -0.22], kneeR: [0.4, 0, 1], footRotR: [0.1, 0.65, 0] }, 'inout'],
          [38, null, 'inout'],
        ]),
        hit: { f: [15, 17], limb: 'handR', r: 0.11, dmg: 16, lvl: 'high', react: 'hitHigh', blk: -8, hitAdv: 4, push: 0.4, ch: { kd: true } },
        advance: [[0, 0], [8, 0.0], [15, 0.4], [38, 0.38]], sfx: 'heavy',
      },
      // (the leg drives out almost straight into the stomach: it used to stop short, the shin hanging from a raised knee;
      // the run-up carries the body a little less far, so the reach is the same; the lead hand guards, the kicking side's
      // arm swings down and back instead of both held out wide)
      sprintKick: {
        name: 'Sprint kick', total: 50, clip: C([
          [0, {}],
          // (the left arm swings back wide of the body: from the guard straight to behind the hip it went through
          // the belly)
          [6, { rootPos: [0, -0.1, 0.05], rootRot: [0.25, -0.3, 0], footR: [0.18, 0.2, -0.05], handL: [0.3, -0.38, -0.18], handR: [0.1, 0.1, 0.5], aimL: 1, aimR: 1 }, 'inout'],
          // out of the run the knee drives up high in front, the foot tucked under it and the trunk coming upright
          // (the leg used to rise straight out of the stride over twelve frames: a knee lift, not a kick)...
          [12, { rootPos: [0, -0.06, 0.09], rootRot: [-0.24, -0.36, 0], spine: [0.2, 0.1, 0], footR: [0.17, 0.46, 0.36], kneeR: [0.2, 0.9, 0.7], footRotR: [-0.45, 0, 0], toeR: -0.2,
            handL: [0.2, -0.05, 0.3], handR: [0.16, -0.45, -0.1], neck: [0.3, 0.12, 0] }, 'inout'],
          // ... and the leg drives out from it, the sole first, the hips thrown in behind it
          [18, { rootPos: [0, -0.02, 0.12], rootRot: [-0.43, -0.4, 0], spine: [0.14, 0.1, 0], footR: [0.02, 0.84, 0.98], kneeR: [0.1, 1, 0.5], footRotR: [-1.3, 0, 0], toeR: -0.5, handL: GUARD_L, handR: [0.18, -0.8, -0.38], aimL: 0, aimR: 0, poleR: [0.2, 0, -1], neck: [0.45, 0.15, 0] }, 'drive'],
          [22, {}, 'lin'],
          // the knee folds back before the foot comes down in front (it hung out straight for a quarter of a second)
          [30, { rootPos: [0, -0.06, 0.09], rootRot: [-0.05, -0.38, 0], footR: [0.12, 0.5, 0.42], kneeR: [0.1, 0.8, 0.8], footRotR: [-0.4, 0, 0], toeR: 0 }, 'inout'],
          [36, { rootPos: [0, -0.1, 0.05], footR: [0.2, 0.071, 0.2], rootRot: [0.1, -0.4, 0], handR: [0.12, -0.3, 0.3], poleR: [0.25, -1, -0.25], neck: [0.2, 0.2, 0] }, 'inout'],
          [50, null, 'inout'],
        ]),
        hit: { f: [18, 21], limb: 'footR', r: 0.14, dmg: 22, lvl: 'mid', react: 'hitMid', blk: -12, kd: true, push: 0.8 },
        advance: [[0, 0], [6, 0.2], [18, 0.52], [50, 0.57]], sfx: 'heavy',
      },
      // (the arms swing up with the take-off, then the lead hand guards and the kicking side's arm drops back: they were
      // held up and wide in the air and flung up again on landing)
      flyKick: {
        name: 'Flying kick', total: 54, airborne: [8, 34], clip: C([
          [0, {}],
          [8, { rootPos: [0, -0.22, 0], rootRot: [0.3, -0.4, 0], spine: [0.15, 0, 0], handL: [0.3, -0.35, 0.15], handR: [0.3, -0.4, 0.05], aimL: 1, aimR: 1 }, 'inout'],
          [13, { rootPos: [0, 0.3, 0.12], rootRot: [-0.1, -0.6, -0.1], footL: [0.1, 0.7, 0.2], kneeL: [0.2, 0.8, 0.6], footR: [0.12, 0.6, 0.3], kneeR: [0.2, 0.4, 1],
            handL: [0.1, 0.22, 0.55], handR: [0.14, 0.15, 0.5] }, 'inout'],
          // (the hips square up to the kick: turned 50 degrees away from it, the leg went out across the body and the
          // hip folded some 20 degrees past its limit)
          [18, { rootPos: [0, 0.45, 0.2], rootRot: [-0.35, -0.6, -0.2], footL: [0.12, 0.72, 0.05], kneeL: [0.2, 0.8, 0.5], footR: [0.0, 1.25, 1.0], kneeR: [0.2, 1, 0.3],
            footRotR: [-1.2, 0.5, 0], handL: GUARD_L, handR: [0.18, -0.8, -0.38], aimL: 0, aimR: 0, poleR: [0.2, 0, -1], neck: [0.45, 0.2, 0] }, 'drive'],
          // past the apex: the body starts to come down and the kick eases off (a held pose hung in the air)
          [26, { rootPos: [0, 0.37, 0.22], rootRot: [-0.3, -0.55, -0.18], footR: [0.02, 1.14, 0.9], handR: [0.18, -0.72, -0.28] }, 'sine'],
          // falling: the kicking leg comes down under the body and both legs reach for the floor
          [32, { rootPos: [0, 0.1, 0.18], rootRot: [0.05, -0.6, -0.08], footL: [0.06, 0.24, 0.26], kneeL: [0.25, 0.2, 1], footR: [0.18, 0.26, -0.05], kneeR: [0.4, 0.2, 1],
            footRotR: [0.1, 0.5, 0], handR: [0.15, -0.38, 0.14], poleR: [0.25, -1, -0.25] }, 'inout'],
          // touch-down at the stance's height and still moving down, then the knees take the landing up (the body used
          // to fall the whole way in one accelerating segment and stop dead on the floor, the feet on tiptoe)
          [35, { rootPos: [0, -0.07, 0.16], rootRot: [0.15, -0.5, 0], footL: [0.05, 0.071, 0.3], footR: [0.2, 0.071, -0.15], kneeL: [0.3, 0, 1], kneeR: [0.5, 0, 1],
            footRotL: [0, -0.35, 0], footRotR: [0, 0.65, 0], handR: [0.12, -0.15, 0.35], neck: [0.16, 0.2, 0] }, 'inout'],
          [40, { rootPos: [0, -0.2, 0.15], rootRot: [0.25, -0.45, 0] }, 'inout'],
          [54, null, 'inout'],
        ]),
        hit: { f: [18, 25], limb: 'footR', r: 0.15, dmg: 24, lvl: 'high', react: 'hitHigh', blk: -14, kd: true, push: 0.7 },
        advance: [[0, 0], [8, 0], [26, 0.8], [54, 0.85]], sfx: 'heavy',
      },
      // PATADA DE VALLISTA: the hurdler's lead leg: the knee driven up and the leg out straight at his stomach,
      // the heel first, the body leaning in over it and the arms swapped as in the stride (the right one reaching
      // forward, the left swung back); a long reach
      hurdle: {
        name: 'Patada de vallista', total: 38, clip: C([
          [0, {}],
          [5, { rootPos: [0, -0.1, 0.0], rootRot: [0.14, -0.42, 0], spine: [0.12, 0.08, 0], footL: [0.06, 0.3, 0.3], kneeL: [0.1, 0.6, 1], footRotL: [-0.3, -0.3, 0],
            handR: [0.0, 0.08, 0.5], aimR: 0, handL: [0.2, -0.28, 0.1], aimL: 0, fistL: 0.6, fistR: 0.6 }, 'inout'],
          [11, { rootPos: [0, -0.03, 0.12], rootRot: [0.06, -0.36, 0], spine: [0.15, 0.05, 0], neck: [0.04, 0.1, 0],
            footL: [0.04, 0.62, 1.04], kneeL: [0.1, 0.8, 0.6], footRotL: [-1.15, -0.2, 0], toeL: -0.4, footR: [0.2, 0.071, -0.24], footRotR: [0.42, 0.65, 0],
            handR: [0.05, 0.12, 0.95], aimR: 1, handL: [0.24, -0.5, -0.4], poleL: [0.3, -0.3, -1], fistL: 0.4, fistR: 0.4 }, 'drive'],
          [14, {}, 'lin'],
          [19, { handR: [0.1, 0.0, 0.6], aimR: 0, handL: [0.25, -0.35, 0.05], aimL: 0, footL: [0.05, 0.4, 0.6], kneeL: [0.1, 0.6, 1] }, 'inout'],
          [25, { rootPos: [0, -0.07, 0.08], rootRot: [0.1, -0.45, 0], spine: [0.12, 0.1, 0], neck: [0.12, 0.18, 0],
            footL: [0.05, 0.3, 0.44], kneeL: [0.1, 0.5, 1], footRotL: [0, -0.35, 0], toeL: 0, footRotR: [0.1, 0.65, 0],
            handR: GUARD_R, handL: GUARD_L, fistL: 1, fistR: 1 }, 'inout'],
          [31, { footL: [0.05, 0.071, 0.34], kneeL: [0.2, 0, 1], rootPos: [0, -0.085, 0.04] }, 'inout'],
          [38, null, 'inout'],
        ]),
        hit: { f: [11, 14], limb: 'footL', r: 0.13, dmg: 15, lvl: 'mid', react: 'hitMid', blk: -8, hitAdv: 2, push: 0.9 },
        advance: [[0, 0], [11, 0.32], [38, 0.3]], sfx: 'kick',
      },
      // LLEGADA A META: the dip at the finish line: a step in and the chest thrown forward at the tape, the arms
      // flung back and the head up, straight into him. The end of his 1, 2, 3
      finishLean: {
        name: 'Llegada a meta', total: 38, clip: C([
          [0, {}],
          [6, { rootPos: [0, -0.12, 0.02], rootRot: [0.2, -0.22, 0], spine: [0.14, 0.05, 0], neck: [0.05, 0.1, 0],
            handL: [0.15, -0.1, 0.42], handR: [0.18, -0.36, -0.08], aimL: 0, aimR: 0, fistL: 0.5, fistR: 0.5,
            footR: [0.15, 0.13, -0.02], kneeR: [0.2, 0.3, 1], footRotR: [0.2, 0.4, 0] }, 'inout'],
          [12, { rootPos: [0, -0.08, 0.15], rootRot: [0.56, -0.06, 0], spine: [0.32, 0.0, 0], neck: [-0.42, 0.0, 0],
            handL: [0.42, -0.45, -0.48], handR: [0.42, -0.45, -0.48], poleL: [0.4, -0.2, -1], poleR: [0.4, -0.2, -1], fistL: 0.4, fistR: 0.4,
            footR: [0.13, 0.071, 0.1], kneeR: [0.35, 0, 1], footRotR: [0.1, 0.1, 0], footL: [0.06, 0.071, 0.26], footRotL: [0.35, -0.2, 0] }, 'drive'],
          [15, {}, 'lin'],
          [21, { rootPos: [0, -0.11, 0.1], rootRot: [0.3, -0.18, 0], spine: [0.2, 0.05, 0], neck: [-0.1, 0.05, 0],
            handL: [0.32, -0.62, 0.08], handR: [0.32, -0.62, 0.02], poleL: [0.4, -0.6, -0.6], poleR: [0.4, -0.6, -0.6] }, 'inout'],
          [28, { rootPos: [0, -0.1, 0.08], rootRot: [0.16, -0.32, 0], spine: [0.12, 0.1, 0], neck: [0.12, 0.15, 0],
            handL: GUARD_L, handR: GUARD_R, fistL: 1, fistR: 1, poleL: [0.3, -1, -0.15], poleR: [0.25, -1, -0.25], footR: [0.18, 0.071, -0.04], footRotL: [0, -0.3, 0] }, 'inout'],
          [38, null, 'inout'],
        ]),
        hit: { f: [10, 14], limb: 'chest', r: 0.36, dmg: 13, lvl: 'mid', react: 'hitMid', blk: -6, hitAdv: 4, push: 1.1 },
        advance: [[0, 0], [12, 0.44], [38, 0.44]], sfx: 'heavy',
      },
    }),
    // PUÑETALITY (js/fight/fatality.js): a runner. He stretches a quad, starts his watch, and sets off round the loser,
    // faster and faster, until he is a blur, a ring of himself, a tornado of dust that lifts the loser's clothes, then his
    // skin, and turns red as it takes all of him away: nothing is left but his shoes, smoking. He skids to a stop, checks
    // his watch ("récord personal") and smooths his hair: not a hair out of place. Frames: orbit (the run round him:
    // from, R and v keys, turn, face), cadence (the stride's pace: m/s at the clip's own pace, its top), winner (his
    // clips: [frame, clip, blend]), evap (the loser gone), the rest as the others'
    fatal: {
      len: 700, contact: 104, evap: [292, 334], title: 470, dist: 1.6,
      orbit: { from: 104, turn: 12, face: 382, R: [[104, 1.6], [150, 1.18], [338, 1.18], [382, 1.95]], v: [[104, 0], [120, 4.5], [170, 8.5], [240, 16], [330, 16], [362, 4], [382, 0]] },
      cadence: [4.2, 2.6],
      slow: [[284, 292, 330, 348, 0.35]],
      say: 'Récord personal.', sayAt: 408, sayLen: 60,
      winner: [[104, 'fatal_run', 6], [376, 'fatal_stop', 6]],
      victim: [[60, 'fatalFear', 10], [126, 'fatalCover', 10], [196, 'fatalVortex', 14]],
      clip: [
        // loose, a step out from the loser
        [0, { rootPos: [0, -0.02, 0], rootRot: [0, -0.1, 0], spine: [0, 0.05, 0], neck: [0.06, 0.08, 0],
          handL: [0.22, -0.86, 0.06], aimL: 1, handR: [0.22, -0.86, 0.06], aimR: 1, fistL: 0.35, fistR: 0.35, twistL: 0, twistR: 0,
          footL: [0.14, 0.071, 0.1], footR: [0.15, 0.071, -0.1], footRotL: [0, 0.1, 0], footRotR: [0, 0.25, 0], kneeL: [0.1, 0, 1], kneeR: [0.12, 0, 1] }],
        // a quad stretch: the right heel pulled up to his backside, the left arm out for balance
        [14, { footR: [0.13, 0.52, -0.2], kneeR: [0.05, -1, 0.15], footRotR: [1.75, 0, 0], footL: [0.1, 0.071, 0.04], footRotL: [0, 0, 0],
          handR: [0.15, -0.95, -0.35], poleR: [0.6, -0.3, -0.7], fistR: 0.7, handL: [0.6, -0.3, 0.2], fistL: 0.2, rootRot: [0.06, -0.1, 0.03], neck: [0.1, 0.1, 0] }, 'inout'],
        [30, { footR: [0.13, 0.56, -0.21] }, 'sine'],
        // the leg down and shaken out, a bounce on his toes
        [40, { footR: [0.15, 0.071, -0.1], kneeR: [0.12, 0, 1], footRotR: [0, 0.25, 0], footL: [0.14, 0.071, 0.1], footRotL: [0, 0.1, 0],
          handR: [0.24, -0.84, 0.04], poleR: [0.2, -1, -0.5], fistR: 0.3, handL: [0.24, -0.84, 0.06], fistL: 0.3, rootRot: [0, -0.1, 0] }, 'inout'],
        [45, { rootPos: [0, 0.01, 0] }, 'sine'], [50, { rootPos: [0, -0.04, 0] }, 'sine'], [55, { rootPos: [0, 0.01, 0] }, 'sine'], [60, { rootPos: [0, -0.03, 0] }, 'sine'],
        // his watch: the left wrist up before his chest, the right index finger presses it (the beep at 78)
        [70, { rootPos: [0, -0.02, 0], handL: [0.0, -0.3, 0.42], twistL: 1.2, wristL: [0.2, 0], fistL: 0.6, handR: [0.05, -0.3, 0.38], twistR: 0.4, fistR: 1, ptR: 1, neck: [0.42, 0.0, 0] }, 'inout'],
        [78, { handR: [0.02, -0.29, 0.4] }, 'out'],
        [84, { handR: [0.06, -0.31, 0.37], neck: [0.2, 0.05, 0] }, 'inout'],
        // set: the weight forward, the knees bent, the arms ready, his eyes on the loser
        [100, { rootPos: [0, -0.12, 0.04], rootRot: [0.3, -0.25, 0], spine: [0.1, 0.1, 0], neck: [-0.05, 0.15, 0],
          footL: [0.1, 0.071, 0.2], footR: [0.12, 0.09, -0.25], footRotL: [0, -0.1, 0], footRotR: [0.3, 0.1, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1],
          handL: [0.12, -0.3, 0.38], handR: [0.22, -0.6, -0.25], twistL: -0.3, twistR: -0.3, wristL: [0, 0], fistL: 0.55, fistR: 0.55, ptR: 0, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6] }, 'inout'],
        [104, { rootPos: [0, -0.13, 0.05] }, 'sine'],
      ],
      clips: {
        // the sprint: one stride of each leg (24 frames at its own pace; Match.fatalOrbit speeds it up with him), the
        // body leaning forward and into the circle, the arms pumping, his face turned to the loser on his left
        run: [[
          [0, { rootPos: [0, -0.07, 0.04], rootRot: [0.24, -0.12, -0.2], spine: [0.06, 0.2, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.075, 0.32], footRotL: [0.05, 0.0, 0.0], footR: [0.095, 0.295, -0.34], footRotR: [1.05, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.22, -0.62, -0.3], handR: [0.12, -0.22, 0.42], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }],
          [2, { rootPos: [0, -0.083, 0.04], rootRot: [0.24, -0.08, -0.2], spine: [0.06, 0.133, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.073, 0.204], footRotL: [0.03, 0.0, 0.0], footR: [0.1, 0.46, -0.3], footRotR: [1.3, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.213, -0.573, -0.167], handR: [0.147, -0.307, 0.313], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [3, { rootPos: [0, -0.09, 0.04], rootRot: [0.24, -0.06, -0.2], spine: [0.06, 0.1, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.073, 0.146], footRotL: [0.02, 0.0, 0.0], footR: [0.1, 0.452, -0.184], footRotR: [1.16, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.21, -0.55, -0.1], handR: [0.16, -0.35, 0.26], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [5, { rootPos: [0, -0.074, 0.04], rootRot: [0.24, -0.02, -0.2], spine: [0.06, 0.033, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.071, 0.03], footRotL: [0.0, 0.0, 0.0], footR: [0.1, 0.436, 0.048], footRotR: [0.88, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.203, -0.503, 0.033], handR: [0.187, -0.437, 0.153], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [6, { rootPos: [0, -0.066, 0.04], rootRot: [0.24, 0.0, -0.2], spine: [0.06, 0.0, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.083, -0.052], footRotL: [0.16, 0.0, 0.0], footR: [0.1, 0.428, 0.164], footRotR: [0.74, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.2, -0.48, 0.1], handR: [0.2, -0.48, 0.1], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [7, { rootPos: [0, -0.058, 0.04], rootRot: [0.24, 0.02, -0.2], spine: [0.06, -0.033, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.095, -0.134], footRotL: [0.32, 0.0, 0.0], footR: [0.1, 0.42, 0.28], footRotR: [0.6, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.187, -0.437, 0.153], handR: [0.203, -0.503, 0.033], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [8, { rootPos: [0, -0.05, 0.04], rootRot: [0.24, 0.04, -0.2], spine: [0.06, -0.067, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.106, -0.216], footRotL: [0.48, 0.0, 0.0], footR: [0.097, 0.347, 0.327], footRotR: [0.417, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.173, -0.393, 0.207], handR: [0.207, -0.527, -0.033], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [10, { rootPos: [0, -0.035, 0.04], rootRot: [0.24, 0.08, -0.2], spine: [0.06, -0.133, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.13, -0.38], footRotL: [0.8, 0.0, 0.0], footR: [0.09, 0.2, 0.42], footRotR: [0.05, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.147, -0.307, 0.313], handR: [0.213, -0.573, -0.167], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [12, { rootPos: [0, -0.07, 0.04], rootRot: [0.24, 0.12, -0.2], spine: [0.06, -0.2, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.095, 0.295, -0.34], footRotL: [1.05, 0.0, 0.0], footR: [0.09, 0.075, 0.32], footRotR: [0.05, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.12, -0.22, 0.42], handR: [0.22, -0.62, -0.3], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [14, { rootPos: [0, -0.083, 0.04], rootRot: [0.24, 0.08, -0.2], spine: [0.06, -0.133, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.1, 0.46, -0.3], footRotL: [1.3, 0.0, 0.0], footR: [0.09, 0.073, 0.204], footRotR: [0.03, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.147, -0.307, 0.313], handR: [0.213, -0.573, -0.167], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [15, { rootPos: [0, -0.09, 0.04], rootRot: [0.24, 0.06, -0.2], spine: [0.06, -0.1, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.1, 0.452, -0.184], footRotL: [1.16, 0.0, 0.0], footR: [0.09, 0.073, 0.146], footRotR: [0.02, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.16, -0.35, 0.26], handR: [0.21, -0.55, -0.1], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [17, { rootPos: [0, -0.074, 0.04], rootRot: [0.24, 0.02, -0.2], spine: [0.06, -0.033, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.1, 0.436, 0.048], footRotL: [0.88, 0.0, 0.0], footR: [0.09, 0.071, 0.03], footRotR: [0.0, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.187, -0.437, 0.153], handR: [0.203, -0.503, 0.033], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [18, { rootPos: [0, -0.066, 0.04], rootRot: [0.24, 0.0, -0.2], spine: [0.06, 0.0, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.1, 0.428, 0.164], footRotL: [0.74, 0.0, 0.0], footR: [0.09, 0.083, -0.052], footRotR: [0.16, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.2, -0.48, 0.1], handR: [0.2, -0.48, 0.1], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [19, { rootPos: [0, -0.058, 0.04], rootRot: [0.24, -0.02, -0.2], spine: [0.06, 0.033, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.1, 0.42, 0.28], footRotL: [0.6, 0.0, 0.0], footR: [0.09, 0.095, -0.134], footRotR: [0.32, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.203, -0.503, 0.033], handR: [0.187, -0.437, 0.153], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [20, { rootPos: [0, -0.05, 0.04], rootRot: [0.24, -0.04, -0.2], spine: [0.06, 0.067, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.097, 0.347, 0.327], footRotL: [0.417, 0.0, 0.0], footR: [0.09, 0.106, -0.216], footRotR: [0.48, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.207, -0.527, -0.033], handR: [0.173, -0.393, 0.207], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [22, { rootPos: [0, -0.035, 0.04], rootRot: [0.24, -0.08, -0.2], spine: [0.06, 0.133, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.2, 0.42], footRotL: [0.05, 0.0, 0.0], footR: [0.09, 0.13, -0.38], footRotR: [0.8, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.213, -0.573, -0.167], handR: [0.147, -0.307, 0.313], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
          [24, { rootPos: [0, -0.07, 0.04], rootRot: [0.24, -0.12, -0.2], spine: [0.06, 0.2, 0.04], neck: [-0.08, 0.55, 0.12], footL: [0.09, 0.075, 0.32], footRotL: [0.05, 0.0, 0.0], footR: [0.095, 0.295, -0.34], footRotR: [1.05, 0.0, 0.0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], handL: [0.22, -0.62, -0.3], handR: [0.12, -0.22, 0.42], aimL: 1, aimR: 1, fistL: 0.55, fistR: 0.55, twistL: -0.3, twistR: -0.3, poleL: [0.3, -1, -0.6], poleR: [0.3, -1, -0.6], toeL: 0, toeR: 0, jaw: 0.05 }, 'sine'],
        ], { loop: true }],
        // the skid to a stop, the watch ("récord personal"), the hair smoothed back to his topknot: not a hair out of place
        stop: [[
          [0, { rootPos: [0, -0.12, -0.1], rootRot: [-0.15, 0, 0.1], spine: [-0.1, 0, 0], neck: [0.1, 0, 0],
            footL: [0.12, 0.071, 0.4], footR: [0.14, 0.071, 0.1], footRotL: [-0.3, 0, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.12, 0, 1],
            handL: [0.55, -0.35, 0.25], aimL: 1, handR: [0.55, -0.35, 0.25], aimR: 1, fistL: 0.3, fistR: 0.3, twistL: 0, twistR: 0, poleL: [0.6, -0.6, -0.3], poleR: [0.6, -0.6, -0.3], jaw: 0.1 }],
          [14, { rootPos: [0, -0.04, 0], rootRot: [0.02, -0.1, 0], spine: [0, 0.05, 0], neck: [0.06, 0.08, 0], footL: [0.14, 0.071, 0.12], footR: [0.15, 0.071, -0.1], footRotL: [0, 0.1, 0], footRotR: [0, 0.25, 0],
            handL: [0.24, -0.84, 0.06], handR: [0.24, -0.84, 0.06], poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5], jaw: 0 }, 'inout'],
          // the watch: the left wrist up before his face, he reads it
          [30, { handL: [0.0, -0.18, 0.42], twistL: 1.2, wristL: [0.2, 0], fistL: 0.6, neck: [0.42, 0.0, 0] }, 'inout'],
          [50, { handL: [0.0, -0.17, 0.43], neck: [0.4, 0.02, 0] }, 'sine'],
          // "récord personal", a look up
          [62, { handL: [0.24, -0.84, 0.06], twistL: 0, wristL: [0, 0], fistL: 0.3, neck: [0.04, 0.05, 0] }, 'inout'],
          // the hand along the side of his head to the topknot (as his win pose's)
          [76, { hgR: 1, hgPosR: [0.24, 0.08, 0.14], poleR: [0.8, -0.5, 0.2], fistR: 0.1, twistR: -0.6, neck: [-0.05, 0, 0.04] }, 'inout'],
          [86, { hgPosR: [0.2, 0.12, 0.09] }, 'inout'],
          [102, { hgPosR: [0.19, 0.11, -0.09], neck: [-0.12, 0.08, 0.06] }, 'inout'],
          [118, { handR: [0.24, -0.84, 0.06], aimR: 1, hgR: 0, poleR: [0.2, -1, -0.5], fistR: 0.3, twistR: 0, neck: [0.02, 0.06, 0] }, 'inout'],
          [320, { neck: [0.04, 0.1, 0] }, 'sine'],
        ]],
      },
    },
    // "¿eso era todo? ni me he despeinado": the hand smooths his hair back to the topknot, a shrug with both palms
    // up, and a finger at the loser
    win: [
      [0, {}],
      [22, { rootPos: [0, 0, 0], rootRot: [0, 0.14, 0], spine: [-0.04, 0, 0], neck: [0, 0, 0],
        handL: [0.3, -0.68, 0.14], aimL: 1, fistL: 0.3, handR: [0.3, -0.62, 0.2], aimR: 1, fistR: 0.3, footL: [0.16, 0.071, 0.05], footR: [0.16, 0.071, -0.05], footRotL: [0, 0.2, 0], footRotR: [0, 0.22, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }, 'out'],
      // (the hand goes up beside the head, not through the face)
      [36, { hgR: 1, hgPosR: [0.24, 0.08, 0.14], poleR: [0.8, -0.5, 0.2], fistR: 0.1, twistR: -0.6, neck: [-0.05, 0, 0.04] }, 'inout'],
      // (along the side of the head, on the hair: closer in, the hand went through the side of the skull)
      [46, { hgPosR: [0.2, 0.12, 0.09] }, 'inout'],
      [64, { hgPosR: [0.19, 0.11, -0.09], neck: [-0.12, 0.08, 0.06] }, 'inout'],
      [76, { handR: [0.3, -0.36, 0.38], aimR: 1, poleR: [0.2, -1, -0.5], fistR: 0.1, twistR: -1.4, handL: [0.3, -0.36, 0.38], aimL: 1, fistL: 0.1, twistL: -1.4,
        clavL: [0.16, 0], clavR: [0.16, 0], neck: [0.04, 0, 0.1] }, 'inout'],
      [96, { clavL: [0.04, 0], clavR: [0.04, 0], neck: [0.04, 0.06, 0.06] }, 'sine'],
      [128, { handL: [0.38, -0.52, -0.08], aimL: 1, poleL: [0.6, 0.2, -0.8], fistL: 0.6, twistL: 0, clavL: [0, 0],
        handR: [0.22, 0.06, 0.72], fistR: 1, ptR: 1, twistR: 0.2, clavR: [0.06, 0], neck: [-0.04, 0, 0] }, 'back'],
      [150, { handR: [0.22, 0.08, 0.74] }, 'sine'],
      [200, { handR: [0.24, 0.06, 0.72], neck: [-0.06, 0.04, 0] }, 'sine'],
    ],
  },
  // Aleix (since 2026-11-07, in the place of Arnau): the same gamer style and moves, his own lines
  aleix: {
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0.1, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.2, -0.88, 0.1], handR: [0.2, -0.88, 0.1], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, footL: [0.14, 0.071, 0.04], footR: [0.14, 0.071, -0.02], footRotL: [0, 0.15, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      [24, { handR: [-0.45, 0.62, 0.42], fistR: 0.85, poleR: [0.4, -1, 0], neck: [0.25, 0, 0] }, 'inout'],
      [34, { handR: [-0.47, 0.66, 0.4], neck: [0.1, 0, 0] }, 'inout'],
      [52, { handR: [0.3, -0.7, 0.25], handL: [-0.25, 0.05, 0.5], fistL: 0.2 }, 'inout'],
      [66, { handR: [-0.2, 0.05, 0.52], fistR: 1, handL: [-0.15, 0.05, 0.52], neck: [0.2, 0.3, 0] }, 'inout'],
      [95, null, 'inout'],
    ],
    title: 'El Gamer', desc: 'Ningún juego se le resiste. Cabezazos y barridos.',
    say: 'Te lo dije, no me puedes ganar.', sayAt: 78, sayLen: 102, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'No hay juego que se me resista.', introLen: 98, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 188, walk: 1.2, weight: 1.12, power: 1.12, speed: 1.04 },
    hairSway: 0.6, // how far the hair swings with the head: a side fringe (js/anim/hairsway.js)
    clothSway: 0.35, // how far the hem swings with the hips: a polo's hem (js/anim/clothsway.js)
    aiMoves: ['1', '2', '1+2', 'df+4', 'b+2', 'd+3', 'df+2', '3', '4', 'd+4', '1+3', 'f+1', 'b+3'], juggle: ['1', '1', '2', 'b+2'],
    stance: { hgPosL: [0.09, -0.19, 0.28], hgPosR: [0.12, -0.23, 0.2], spine: [0.18, 0.1, 0], rootRot: [0.05, -0.35, 0], neck: [0.12, 0.15, 0] },
    bob: 0.015,
    commands: [['1+2', 'headbutt'], ['df+4', 'slide'], ['b+2', 'hammer'], ['f+1', 'shoulder'], ['b+3', 'axeKick']],
    stringFinish: 'axeKick', // (the end of his own 1, 2, 3: js/fight/moves.js straight's cancel)
    // the phone's ★ buttons (js/ui/touch.js): the special that ★ PUÑO / ★ PATADA throws with the stick at rest (n),
    // forward (f), back (b) or down (d), as the command it stands for
    touchSP: { P: { n: '1+2', f: 'f+1', b: 'b+2', d: 'df+2' }, K: { n: 'b+3', f: 'df+4', b: '4', d: 'd+4' } },
    moves: (C) => ({
      headbutt: {
        name: 'Headbutt', total: 40, clip: C([
          [0, {}],
          [6, { rootPos: [0, -0.1, -0.06], rootRot: [-0.2, -0.2, 0], spine: [-0.3, 0, 0], neck: [-0.4, 0, 0], handL: [0.2, 0.2, 0.6], handR: [0.1, 0.2, 0.6], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3 }, 'out'],
          // forehead to the face: the body drives up and forward (not folded at the waist, which buried the head in the
          // opponent's chest), the neck snaps the forehead down onto the target, the hands pull the collar in
          [14, { rootPos: [0, -0.03, 0.18], rootRot: [0.2, -0.1, 0], spine: [0.24, 0, 0], neck: [0.5, 0, 0], handL: [0.25, 0.28, 0.85], handR: [0.15, 0.28, 0.85], fistL: 0.6, fistR: 0.6,
            footR: [0.2, 0.1, -0.22], toeR: 0.6, footRotR: [0.3, 0.5, 0] }, 'snap'],
          [18, {}, 'lin'],
          [26, { rootPos: [0, -0.08, 0.06], rootRot: [0.02, -0.25, 0], spine: [0.05, 0.05, 0], neck: [0.05, 0.1, 0], handL: [0.1, 0.2, 0.62], handR: [0.0, 0.25, 0.5], fistL: 1, fistR: 1 }, 'ret'],
          [40, null, 'inout'],
        ]),
        hit: { f: [14, 16], limb: 'head', r: 0.14, dmg: 16, lvl: 'high', react: 'hitHigh', blk: -8, hitAdv: 10, push: 0.35, ch: { kd: true } },
        advance: [[0, 0], [14, 0.46], [40, 0.46]], sfx: 'heavy', // lunges in: a headbutt is thrown from clinch range
      },
      // a slide tackle: the hips go down almost to the floor and the lead leg slides straight along it, foot flexed, the
      // rear leg folded under (the hips used to stay 36 cm up with both knees bent: sitting on an invisible chair); the
      // rear hand posts on the floor behind the hip, the lead one guards the face, the eyes on the opponent (the arms
      // were held out like wings and the head looked up)
      slide: {
        name: 'Slide tackle', total: 56, clip: C([
          [0, {}],
          [6, { rootPos: [0, -0.2, 0.05], rootRot: [0.3, -0.4, 0] }, 'inout'],
          [18, { rootPos: [0, -0.74, 0.1], rootRot: [-0.95, -0.3, 0], spine: [0.35, 0, 0], footL: [0.1, 0.1, 0.98], kneeL: [0.1, 1, 0.3], footRotL: [-1.4, 0, 0], footR: [0.22, 0.075, 0.28], kneeR: [0.5, 1, 0.3],
            handL: GUARD_L, handR: [0.45, -0.8, -0.3], aimL: 0, aimR: 1, poleR: [0.4, 0, -1], neck: [0.75, 0.2, 0] }, 'drive'],
          [26, {}, 'lin'],
          [42, { rootPos: [0, -0.4, 0], rootRot: [0.1, -0.4, 0], footL: [0.1, 0.071, 0.25], footR: [0.22, 0.071, -0.15], handR: GUARD_R, aimR: 0, neck: [0.2, 0.15, 0] }, 'inout'],
          [56, null, 'inout'],
        ]),
        hit: { f: [17, 25], limb: 'footL', r: 0.15, dmg: 15, lvl: 'low', react: 'hitLow', blk: -20, kd: true, push: 0.3 },
        advance: [[0, 0], [6, 0.05], [22, 0.75], [56, 0.8]], sfx: 'kick', lowProfile: [10, 30],
      },
      hammer: {
        name: 'Hammer fist', total: 44, clip: C([
          [0, {}],
          [8, { rootPos: [0, -0.02, -0.04], rootRot: [-0.2, -0.3, 0], spine: [-0.25, 0.3, 0], handR: [0.1, 0.9, 0.1], aimR: 1, twistR: 0.4, clavR: [0.3, 0.1] }, 'inout'],
          // the power comes from dropping the hips; the torso folds only moderately so the head stays behind the fist
          [18, { rootPos: [0, -0.24, 0.1], rootRot: [0.24, -0.2, 0], spine: [0.26, 0.3, 0], handR: [0.0, 0.02, 0.86], aimR: 1, twistR: -0.14, neck: [-0.1, 0, 0], kneeL: [0.25, 0, 1] }, 'drive'],
          [22, {}, 'lin'],
          [30, { rootPos: [0, -0.16, 0.04], rootRot: [0.14, -0.35, 0], spine: [0.16, 0.2, 0], handR: [-0.08, 0.15, 0.55], aimR: 0.6, neck: [0.05, 0.1, 0] }, 'ret'],
          [44, null, 'inout'],
        ]),
        hit: { f: [17, 20], limb: 'handR', r: 0.13, dmg: 18, lvl: 'mid', react: 'hitMid', blk: -9, hitAdv: 7, push: 0.3 },
        advance: [[0, 0], [18, 0.24], [44, 0.24]], sfx: 'heavy', // longer step: the upright finish reaches less
      },
      // CARGA DE HOMBRO: the lead shoulder turned to him and the arms tucked in, he drives in off the rear foot and
      // rams it into the chest (a big push: near a wall it pins him to it)
      shoulder: {
        name: 'Carga de hombro', total: 36, clip: C([
          [0, {}],
          [6, { rootPos: [0, -0.15, -0.06], rootRot: [0.2, -0.9, 0], spine: [0.18, 0.25, 0], neck: [0.1, 0.55, 0],
            hgL: 1, hgPosL: [0.1, -0.24, 0.2], hgR: 1, hgPosR: [0.08, -0.2, 0.14], footRotR: [0.2, 0.65, 0] }, 'inout'],
          [12, { rootPos: [0, -0.12, 0.16], rootRot: [0.3, -1.1, 0], spine: [0.24, 0.3, 0.05], neck: [0.04, 0.75, 0],
            hgPosL: [0.14, -0.28, 0.16], footL: [0.05, 0.071, 0.4], kneeL: [0.3, 0, 1], footR: [0.2, 0.071, -0.12], footRotR: [0.45, 0.65, 0] }, 'drive'],
          [15, {}, 'lin'],
          [24, { rootPos: [0, -0.1, 0.06], rootRot: [0.12, -0.62, 0], spine: [0.12, 0.16, 0], neck: [0.12, 0.3, 0], hgPosL: [0.08, -0.16, 0.26], hgPosR: [0.1, -0.18, 0.14],
            footL: [0.05, 0.071, 0.3], footRotR: [0.1, 0.65, 0] }, 'inout'],
          [36, null, 'inout'],
        ]),
        hit: { f: [11, 14], limb: 'shoulderL', r: 0.16, dmg: 15, lvl: 'mid', react: 'hitMid', blk: -6, hitAdv: 4, push: 1.05 },
        advance: [[0, 0], [6, -0.03], [12, 0.56], [36, 0.56]], sfx: 'heavy',
      },
      // PATADA HACHA: the lead leg swung straight up past his head, then chopped down heel first onto the head or the
      // collarbone; it lands in front. The end of his 1, 2, 3
      axeKick: {
        name: 'Patada hacha', total: 40, clip: C([
          [0, {}],
          [5, { rootPos: [0, -0.08, -0.06], rootRot: [-0.12, -0.38, 0], spine: [0.12, 0.1, 0], footL: [0.14, 0.32, 0.28], kneeL: [0.2, 0.5, 1], footRotL: [-0.3, -0.3, 0],
            hgPosL: [0.2, -0.1, 0.24] }, 'inout'],
          // the leg swung up outside and over, straight, the hips tipped well back under it and the chest kept up
          [11, { rootPos: [0, -0.04, -0.08], rootRot: [-0.74, -0.3, 0], spine: [0.32, 0.1, 0], neck: [0.52, 0.12, 0],
            footL: [0.34, 1.36, 0.46], kneeL: [0.4, 0.6, 0.5], footRotL: [-0.8, -0.25, 0], toeL: -0.2, hgPosL: [0.28, -0.04, 0.2] }, 'inout'],
          // (down round the arc of the straight leg, not across its chord: midway the knee folded to 110 degrees)
          [13, { rootRot: [-0.56, -0.33, 0], footL: [0.2, 1.32, 0.74], kneeL: [0.25, 0.7, 0.55], footRotL: [-0.8, -0.25, 0] }, 'inout'],
          // and chopped down: the heel onto the head or the collarbone, the hips rolling forward behind it
          [16, { rootPos: [0, -0.08, 0.04], rootRot: [-0.3, -0.38, 0], spine: [0.18, 0.1, 0], neck: [0.3, 0.15, 0],
            footL: [0.06, 1.0, 0.9], kneeL: [0.1, 0.8, 0.6], footRotL: [-0.6, -0.25, 0], toeL: -0.1, hgPosL: [0.2, -0.1, 0.24] }, 'drive'],
          [20, { footL: [0.05, 0.5, 0.78], kneeL: [0.1, 0.5, 1], rootRot: [-0.05, -0.4, 0], footRotL: [-0.2, -0.3, 0] }, 'lin'],
          [27, { rootPos: [0, -0.11, 0.06], rootRot: [0.12, -0.45, 0], spine: [0.12, 0.12, 0], neck: [0.16, 0.2, 0],
            footL: [0.05, 0.071, 0.38], kneeL: [0.25, 0, 1], footRotL: [0, -0.35, 0], toeL: 0, hgPosL: [0.12, -0.12, 0.28] }, 'inout'],
          [40, null, 'inout'],
        ]),
        hit: { f: [13, 16], limb: 'footL', r: 0.13, dmg: 18, lvl: 'mid', blk: -12, hitAdv: 4, push: 0.25, ch: { kd: true } },
        advance: [[0, 0], [11, 0.02], [16, 0.12], [40, 0.12]], sfx: 'kick',
      },
    }),
    // "¡en mi consola esto era más difícil!": thumbs mashing an invisible gamepad, eyes down on it; he looks up to say
    // it, then raises his fist like a final boss beaten
    // PUÑETALITY (js/fight/fatality.js ALEIX, the controller js/fx/gamepad.js, its path js/fight/padpath.js): he cracks
    // his knuckles, takes a controller out from behind his back and plays a little, then lifts it over his head as it
    // grows to giant size, says his line and slams it down on the loser, flattening him; he makes it rumble with an
    // invisible one (the blood squeezed out at its edges with each pulse), and it breaks up into pixels: what is left
    // is a stain. His hands are on it (fatal.grip, from its path) from when he holds it in both until he throws it
    fatal: {
      len: 600, cut: PADP.land, title: 420, dist: PADP.dist, slow: [[192, 199, 212, 236, 0.25]],
      say: 'Fin de la partida.', sayAt: 154, sayLen: 62,
      victim: [[92, 'fatalWatch', 12], [124, 'fatalLookUp', 10]], still: PADP.land + 2,
      move: PAD_MOVE,
      grip: padGrips(),
      clip: [
        [0, { rootPos: [0, -0.02, 0], rootRot: [0, -0.12, 0], spine: [-0.02, 0.04, 0], neck: [0.08, 0.1, 0], handL: [0.22, -0.86, 0.06], handR: [0.22, -0.86, 0.06], aimL: 1, aimR: 1, fistL: 0.4, fistR: 0.4, twistL: 0, twistR: 0, thL: 0, thR: 0, poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5],
          footL: [0.14, 0.071, 0.1], footR: [0.15, 0.071, -0.1], footRotL: [0, 0.1, 0], footRotR: [0, 0.25, 0], kneeL: [0.1, 0, 1], kneeR: [0.12, 0, 1] }],
        // the fingers laced in front of his chest, pushed out: the knuckles crack (twice)
        [14, { handL: [-0.24, -0.25, 0.62], handR: [-0.24, -0.25, 0.62], twistL: 0.3, twistR: 0.3, fistL: 0.5, fistR: 0.5, poleL: [0.3, -1, -0.2], poleR: [0.3, -1, -0.2], neck: [0.14, 0, 0] }, 'inout'],
        [22, { handL: [-0.22, -0.12, 0.9], handR: [-0.22, -0.12, 0.9], twistL: -1.2, twistR: -1.2, fistL: 0.3, fistR: 0.3, spine: [0.02, 0, 0] }, 'out'],
        [27, { handL: [-0.22, -0.15, 0.8], handR: [-0.22, -0.15, 0.8] }, 'sine'],
        [32, { handL: [-0.22, -0.11, 0.92], handR: [-0.22, -0.11, 0.92] }, 'out'],
        // the right hand behind his back, to the controller in his back pocket
        [42, { handR: [0.16, -0.62, -0.26], poleR: [0.5, -0.6, -0.6], fistR: 0.55, twistR: 0, handL: [0.24, -0.82, 0.08], twistL: 0, fistL: 0.4, rootRot: [0, -0.28, 0], neck: [0.1, 0.18, 0] }, 'inout'],
        [50, { fistR: 0.75 }, 'inout'],
        // out it comes, both hands on it: he plays (his hands on its grips: fatal.grip)
        [60, { handL: [0.11, -0.42, 0.44], handR: [0.11, -0.42, 0.44], aimL: 1, aimR: 1, fistL: 0.6, fistR: 0.6, twistL: -0.5, twistR: -0.5, thL: 0.6, thR: 0.6, poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5], rootRot: [0.03, 0, 0], spine: [0.08, 0, 0], neck: [0.32, 0, 0] }, 'inout'],
        [64, { thL: 1, thR: 0.3 }, 'sine'], [70, { thL: 0.3, thR: 1 }, 'sine'], [76, { thL: 1, thR: 0.3 }, 'sine'], [82, { thL: 0.3, thR: 1 }, 'sine'], [88, { thL: 1, thR: 0.3 }, 'sine'],
        // a look up at the loser, still playing
        [96, { neck: [0.06, 0.04, 0], thL: 0.6, thR: 0.6 }, 'inout'],
        [100, { thL: 1, thR: 0.3 }, 'sine'], [104, { thL: 0.3, thR: 1 }, 'sine'],
        // up it goes as it grows: overhead, palms up under it, the knees giving a little under the weight
        [122, { neck: [-0.15, 0, 0], spine: [-0.04, 0, 0], handL: [0.0, 0.3, 0.45], handR: [0.0, 0.3, 0.45], fistL: 0.25, fistR: 0.25, thL: 0, thR: 0, twistL: 0.4, twistR: 0.4, poleL: [1, -0.2, -0.3], poleR: [1, -0.2, -0.3] }, 'inout'],
        [136, { handL: [-0.06, 0.98, 0.12], handR: [-0.06, 0.98, 0.12], twistL: 1.3, twistR: 1.3, fistL: 0.15, fistR: 0.15, poleL: [1, 0.2, -0.3], poleR: [1, 0.2, -0.3],
          neck: [-0.38, 0, 0], spine: [-0.12, 0, 0], rootPos: [0, -0.05, 0], kneeL: [0.12, 0, 1], kneeR: [0.13, 0, 1], footL: [0.18, 0.071, 0.08], footR: [0.18, 0.071, -0.08] }, 'inout'],
        // holding it up, heavy; he looks down at the loser and says his line
        [152, { neck: [0.12, 0, 0], spine: [-0.1, 0, 0], rootPos: [0, -0.08, 0] }, 'inout'],
        [166, { rootPos: [0, -0.1, 0], neck: [0.14, 0.03, 0] }, 'sine'],
        [180, { rootPos: [0, -0.07, 0], neck: [0.12, -0.02, 0] }, 'sine'],
        // back to throw, then over and down with all his weight, a step in
        [190, { spine: [-0.22, 0, 0], rootRot: [-0.08, 0, 0], rootPos: [0, -0.06, -0.04], neck: [0.02, 0, 0] }, 'inout'],
        [196, { spine: [0.35, 0, 0], rootRot: [0.25, 0, 0], rootPos: [0, -0.16, 0.05], neck: [0.25, 0, 0], handL: [-0.1, 0.1, 0.95], handR: [-0.1, 0.1, 0.95],
          footL: [0.16, 0.071, 0.3], footR: [0.17, 0.071, -0.2], kneeL: [0.16, 0, 1], kneeR: [0.12, 0, 1] }, 'in'],
        [206, { spine: [0.5, 0, 0], rootRot: [0.34, 0, 0], rootPos: [0, -0.24, 0.08], neck: [0.3, 0, 0], handL: [-0.08, -0.32, 0.86], handR: [-0.08, -0.32, 0.86], fistL: 0.2, fistR: 0.2, twistL: 0.2, twistR: 0.2, poleL: [0.6, -1, -0.2], poleR: [0.6, -1, -0.2] }, 'out'],
        // up again, looking down at it
        [226, { spine: [0.1, 0, 0], rootRot: [0.05, 0, 0], rootPos: [0, -0.04, 0], neck: [0.36, 0, 0], handL: [0.22, -0.86, 0.06], handR: [0.22, -0.86, 0.06], aimL: 1, aimR: 1, fistL: 0.4, fistR: 0.4, twistL: 0, twistR: 0, thL: 0, thR: 0, poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5],
          footL: [0.15, 0.071, 0.14], footR: [0.16, 0.071, -0.12] }, 'inout'],
        // he plays an invisible one: it rumbles (three pulses, on 262, 282 and 302)
        [246, { handL: [0.11, -0.42, 0.44], handR: [0.11, -0.42, 0.44], aimL: 1, aimR: 1, fistL: 0.6, fistR: 0.6, twistL: -0.5, twistR: -0.5, thL: 0.6, thR: 0.6, poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5], neck: [0.24, 0, 0], spine: [0.06, 0, 0] }, 'inout'],
        [252, { thL: 1, thR: 0.3 }, 'sine'], [257, { thL: 0.3, thR: 1 }, 'sine'], [262, { thL: 1, thR: 0.3 }, 'sine'], [267, { thL: 0.3, thR: 1 }, 'sine'], [272, { thL: 1, thR: 0.3 }, 'sine'], [277, { thL: 0.3, thR: 1 }, 'sine'], [282, { thL: 1, thR: 0.3 }, 'sine'], [287, { thL: 0.3, thR: 1 }, 'sine'], [292, { thL: 1, thR: 0.3 }, 'sine'], [297, { thL: 0.3, thR: 1 }, 'sine'], [302, { thL: 1, thR: 0.3 }, 'sine'], [307, { thL: 0.3, thR: 1 }, 'sine'], [312, { thL: 1, thR: 0.3 }, 'sine'], [317, { thL: 0.3, thR: 1 }, 'sine'],
        // he lets it go and watches it break up
        [330, { handL: [0.22, -0.86, 0.06], handR: [0.22, -0.86, 0.06], aimL: 1, aimR: 1, fistL: 0.4, fistR: 0.4, twistL: 0, twistR: 0, thL: 0, thR: 0, poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5], neck: [0.18, 0.05, 0], spine: [0, 0, 0] }, 'inout'],
        // GG: a fist up, as when he wins
        [398, { handR: [0.3, 0.8, 0.3], fistR: 1, thR: 0, twistR: 1.5, handL: [0.25, -0.65, 0.15], fistL: 0.4, neck: [-0.15, 0, 0] }, 'back'],
        [418, { handR: [0.4, 0.75, 0.25] }, 'sine'],
        [438, { handR: [0.25, 0.85, 0.3] }, 'sine'],
        [458, { handR: [0.4, 0.75, 0.25] }, 'sine'],
        [600, { handR: [0.3, 0.8, 0.28] }, 'sine'],
      ],
    },
    win: [
      [0, {}],
      [22, { rootPos: [0, 0, 0], rootRot: [0.03, 0, 0], spine: [0.08, 0, 0], neck: [0.3, 0, 0],
        handL: [0.11, -0.42, 0.44], handR: [0.11, -0.42, 0.44], aimL: 1, aimR: 1, fistL: 0.6, fistR: 0.6, twistL: -0.5, twistR: -0.5, thL: 0.6, thR: 0.6,
        footL: [0.16, 0.071, 0.05], footR: [0.16, 0.071, -0.05], footRotL: [0, 0.2, 0], footRotR: [0, 0.22, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }, 'out'],
      [28, { thL: 1, thR: 0.3 }, 'sine'], [34, { thL: 0.3, thR: 1 }, 'sine'], [40, { thL: 1, thR: 0.3 }, 'sine'], [46, { thL: 0.3, thR: 1 }, 'sine'],
      [52, { thL: 1, thR: 0.4, rootRot: [0.03, 0.06, 0] }, 'sine'], [58, { thL: 0.3, thR: 1, rootRot: [0.03, -0.06, 0] }, 'sine'],
      [64, { thL: 1, thR: 0.3 }, 'sine'], [70, { thL: 0.4, thR: 1, rootRot: [0.03, 0, 0] }, 'sine'],
      [86, { neck: [0, 0.05, 0], spine: [0, 0, 0], handL: [0.15, -0.56, 0.34], handR: [0.15, -0.56, 0.34], thL: 0.5, thR: 0.5 }, 'inout'],
      [126, { neck: [0.04, -0.08, 0.05] }, 'sine'],
      [166, { handR: [0.3, 0.8, 0.3], fistR: 1, thR: 0, twistR: 1.5, handL: [0.25, -0.65, 0.15], fistL: 0.4, thL: 0, twistL: 0, neck: [-0.15, 0, 0] }, 'back'],
      [186, { handR: [0.4, 0.75, 0.25] }, 'sine'],
      [206, { handR: [0.25, 0.85, 0.3] }, 'sine'],
      [226, { handR: [0.4, 0.75, 0.25] }, 'sine'],
    ],
  },
  camilo: {
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0.1, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.2, -0.88, 0.1], handR: [0.2, -0.88, 0.1], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, footL: [0.14, 0.071, 0.04], footR: [0.14, 0.071, -0.02], footRotL: [0, 0.15, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      [20, { footR: [0.14, 0.62, -0.28], kneeR: [0, -1, 0.2], footRotR: [1.6, 0, 0], handR: [0.2, -0.9, -0.3], fistR: 0.85, handL: [0.55, 0.2, 0.2], spine: [0.05, 0, 0], neck: [0.1, 0, 0] }, 'inout'],
      [50, { footR: [0.14, 0.64, -0.3] }, 'sine'],
      [64, { footR: [0.14, 0.071, -0.02], footRotR: [0, 0.2, 0], handR: [0.35, -0.8, 0.2], handL: [0.35, -0.8, 0.2], rootPos: [0, 0.03, 0] }, 'inout'],
      [74, { rootPos: [0, -0.02, 0] }, 'sine'],
      [84, { rootPos: [0, 0.03, 0] }, 'sine'],
      [100, null, 'inout'],
    ],
    title: 'Dominadas Powa', desc: 'Alcance enorme y fondo inagotable. Patadas a la carrera.',
    say: 'No molestes, estoy trabajando.', sayAt: 78, sayLen: 127, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Tengo trabajo, acabemos rápido.', introLen: 144, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 174, walk: 1.4, weight: 0.95, power: 1.02, speed: 1.07 },
    hairSway: 0.45, // how far the hair swings with the head: short, combed back (js/anim/hairsway.js)
    aiMoves: ['1', '2', 'b+1', '3', '4', 'd+3', 'df+2', 'd+4', 'df+1', 'f+3', '1+2', 'f+2', 'b+2', 'b+3'], juggle: ['1', 'b+1', '4'],
    stance: { rootPos: [0, -0.06, -0.02], hgPosL: [0.06, -0.13, 0.33], hgPosR: [0.12, -0.16, 0.2] },
    bob: 0.03,
    commands: [['b+1', 'backfist'], ['f+3', 'knee'], ['1+2', 'dominada'], ['f+2', 'pressBanca'], ['b+2', 'curl'], ['b+3', 'kettlebell']],
    stringFinish: 'kettlebell', // (the end of his own 1, 2, 3: js/fight/moves.js straight's cancel)
    // the phone's ★ buttons (js/ui/touch.js): the special that ★ PUÑO / ★ PATADA throws with the stick at rest (n),
    // forward (f), back (b) or down (d), as the command it stands for
    touchSP: { P: { n: '1+2', f: 'f+2', b: 'b+2', d: 'df+2' }, K: { n: 'f+3', f: 'uf+4', b: 'b+3', d: 'd+4' } },
    moves: (C) => ({
      backfist: {
        name: 'Back fist', total: 30, clip: C([
          [0, {}],
          // the lead fist coils across the chest, then whips out along a flat arc and lands with the back of the
          // knuckles on the centre line (the old arc swung wide and passed beside the opponent's head): the fist on
          // edge, palm in, and the wrist a little flexed so the back of the hand leads (it had landed palm down)
          [4, { rootRot: [0.05, -0.9, 0], handL: [-0.22, 0.16, 0.32], twistL: -0.2 }, 'inout'],
          [11, { rootRot: [0.05, -0.35, 0], handL: [0.04, 0.24, 0.96], aimL: 1, twistL: -0.47, wristL: [-0.3, 0], clavL: [0, 0.35] }, 'whip'],
          [14, {}, 'lin'],
          [20, { handL: [0.02, 0.22, 0.7], twistL: -0.3, wristL: [0.05, 0], clavL: [0, 0.15], rootRot: [0.05, -0.45, 0] }, 'ret'],
          [30, null, 'inout'],
        ]),
        hit: { f: [11, 13], limb: 'handL', r: 0.11, dmg: 12, lvl: 'high', react: 'hitHighSide', swing: 1, blk: 2, hitAdv: 8, push: 0.2 },
        advance: [[0, 0], [11, 0.08], [30, 0.08]], sfx: 'light',
      },
      // (the hands go to the opponent's neck as in a clinch, pulling him onto the knee: they used to reach above the head)
      knee: {
        name: 'Flying knee', total: 44, clip: C([
          [0, {}],
          [5, { rootPos: [0, -0.16, 0], rootRot: [0.2, -0.3, 0], footR: [0.2, 0.12, -0.2] }, 'inout'],
          [15, { rootPos: [0, 0.12, 0.12], rootRot: [-0.1, -0.1, 0], spine: [-0.1, 0.1, 0], footR: [0.12, 0.62, 0.42], kneeR: [0.1, 1, 0.6], footRotR: [0.6, 0, 0],
            footL: [0.08, 0.2, -0.02], handL: [0.06, 0.04, 0.7], handR: [0.12, 0.06, 0.68], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, neck: [0.4, 0.1, 0] }, 'drive'],
          [19, {}, 'lin'],
          [30, { rootPos: [0, -0.12, 0.1], footR: [0.2, 0.071, 0.0], footL: [0.05, 0.071, 0.3], handL: GUARD_L, handR: GUARD_R, aimL: 0, aimR: 0, fistL: 1, fistR: 1, neck: [0.2, 0.2, 0] }, 'in'],
          [44, null, 'inout'],
        ]),
        hit: { f: [14, 18], limb: 'kneeR', r: 0.13, dmg: 17, lvl: 'mid', react: 'air', blk: -12, launch: 5.8, push: 0.1 },
        advance: [[0, 0], [15, 0.3], [44, 0.35]], sfx: 'heavy',
      },
      // DOMINADA: as at the bar: a dip, the fists dropped low in front of the hips with the palms up, then the whole
      // body drives up through the legs and both fists come up together in front of him to the chin, the chest
      // lifting and the eyes on the bar: a double uppercut that throws him up
      dominada: {
        name: 'Dominada', total: 40, clip: C([
          [0, {}],
          [6, { rootPos: [0, -0.2, -0.03], rootRot: [0.24, -0.3, 0], spine: [0.24, 0.05, 0], neck: [0.26, 0.1, 0],
            handL: [0.12, -0.6, 0.32], handR: [0.1, -0.62, 0.3], aimL: 0, aimR: 0, fistL: 1, fistR: 1, twistL: -0.8, twistR: -0.8,
            poleL: [0.3, -1, -0.3], poleR: [0.3, -1, -0.3], kneeL: [0.3, 0, 1], kneeR: [0.3, 0, 1] }, 'inout'],
          [13, { rootPos: [0, -0.04, 0.1], rootRot: [0.02, -0.15, 0], spine: [-0.04, 0.05, 0], neck: [-0.12, 0.05, 0],
            handL: [-0.08, 0.12, 0.74], handR: [-0.1, 0.1, 0.74], aimL: 1, aimR: 1, twistL: -0.92, twistR: -0.92,
            poleL: [0.1, -1, 0.2], poleR: [0.1, -1, 0.2], clavL: [0.2, 0.35], clavR: [0.2, 0.35],
            footR: [0.18, 0.11, -0.12], toeR: 0.6, footRotR: [0.4, 0.4, 0] }, 'drive'],
          [16, { handL: [-0.1, 0.32, 0.6], handR: [-0.12, 0.3, 0.6], poleL: [0.1, -1, 0.3], poleR: [0.1, -1, 0.3], rootRot: [-0.04, -0.15, 0], spine: [-0.08, 0.05, 0] }, 'out'],
          [26, { rootPos: [0, -0.08, 0.05], rootRot: [0.05, -0.35, 0], spine: [0.08, 0.1, 0], neck: [0.08, 0.1, 0],
            handL: GUARD_L, handR: GUARD_R, aimL: 0, aimR: 0, twistL: -0.4, twistR: -0.55, clavL: [0, 0.1], clavR: [0, 0.1],
            poleL: [0.3, -1, -0.15], poleR: [0.25, -1, -0.25], footR: [0.2, 0.071, -0.2], toeR: 0, footRotR: [0, 0.65, 0] }, 'inout'],
          [40, null, 'inout'],
        ]),
        hit: { f: [13, 16], limb: 'handR', r: 0.13, dmg: 16, lvl: 'mid', react: 'air', blk: -14, launch: 6.0, push: 0.1 },
        advance: [[0, 0], [6, 0.02], [13, 0.32], [40, 0.3]], sfx: 'heavy',
      },
      // PRESS DE BANCA: the fists drawn back to the chest with the elbows out wide, as with the bar on the chest,
      // then both driven straight out together at his chest, the body square behind them: a huge push (into a wall,
      // it pins him)
      pressBanca: {
        name: 'Press de banca', total: 36, clip: C([
          [0, {}],
          [7, { rootPos: [0, -0.13, -0.05], rootRot: [0.08, -0.2, 0], spine: [0.08, 0.05, 0], neck: [0.14, 0.1, 0],
            handL: [0.16, -0.22, 0.2], handR: [0.12, -0.22, 0.18], aimL: 0, aimR: 0, fistL: 1, fistR: 1, twistL: 0.9, twistR: 0.9,
            poleL: [1, -0.3, -0.3], poleR: [1, -0.3, -0.3] }, 'inout'],
          [12, { rootPos: [0, -0.12, 0.12], rootRot: [0.16, -0.12, 0], spine: [0.14, 0.02, 0], neck: [0.04, 0.05, 0],
            handL: [-0.08, -0.12, 0.98], handR: [-0.08, -0.12, 0.98], aimL: 1, aimR: 1, clavL: [0.05, 0.45], clavR: [0.05, 0.45],
            poleL: [0.8, -0.6, 0], poleR: [0.8, -0.6, 0] }, 'drive'],
          [15, {}, 'lin'],
          [23, { rootPos: [0, -0.11, 0.06], rootRot: [0.1, -0.2, 0], spine: [0.1, 0.05, 0], handL: [0.1, -0.15, 0.55], handR: [0.06, -0.15, 0.52], aimL: 0, aimR: 0,
            clavL: [0, 0.2], clavR: [0, 0.2], poleL: [0.6, -0.8, -0.2], poleR: [0.6, -0.8, -0.2] }, 'ret'],
          [36, null, 'inout'],
        ]),
        hit: { f: [12, 15], limb: 'handR', r: 0.15, dmg: 15, lvl: 'mid', react: 'hitMid', blk: -7, hitAdv: 2, push: 1.15 },
        advance: [[0, 0], [7, -0.03], [12, 0.18], [36, 0.16]], sfx: 'heavy',
      },
      // CURL DE BÍCEPS: the rear elbow pinned to his side and the fist dropped by the hip, palm up, then the forearm
      // curled up hard into the chin, the hips turning in behind it: a short, quick uppercut from close in
      curl: {
        name: 'Curl de bíceps', total: 30, clip: C([
          [0, {}],
          [5, { rootPos: [0, -0.12, 0.0], rootRot: [0.1, -0.62, 0], spine: [0.12, -0.08, 0], handR: [0.16, -0.6, 0.2], aimR: 0, fistR: 1, twistR: -1.1,
            poleR: [0.2, -1, -0.6] }, 'inout'],
          [10, { rootPos: [0, -0.1, 0.08], rootRot: [0.1, 0.1, 0], spine: [0.08, 0.35, 0], neck: [0.05, -0.15, 0],
            handR: [-0.06, 0.16, 0.8], aimR: 1, twistR: -1.2, wristR: [0.3, 0], poleR: [0.1, -1, 0.1], clavR: [0.15, 0.35],
            footR: [0.18, 0.1, -0.15], toeR: 0.5, footRotR: [0.3, 0.4, 0] }, 'drive'],
          [12, {}, 'lin'],
          [19, { rootPos: [0, -0.09, 0.04], rootRot: [0.08, -0.3, 0], spine: [0.1, 0.2, 0], handR: [-0.12, 0.25, 0.55], aimR: 0, twistR: -0.6, wristR: [0.12, 0], clavR: [0, 0.2],
            footR: [0.2, 0.071, -0.2], toeR: 0, footRotR: [0, 0.65, 0] }, 'ret'],
          [30, null, 'inout'],
        ]),
        hit: { f: [10, 12], limb: 'handR', r: 0.11, dmg: 13, lvl: 'mid', react: 'hitHigh', blk: -4, hitAdv: 6, push: 0.25 },
        advance: [[0, 0], [10, 0.2], [30, 0.18]], sfx: 'heavy',
      },
      // SWING DE KETTLEBELL: the hands clasped as round the kettlebell's handle, a hinge at the hips that takes them
      // back between his legs, then the hips snapped forward and the clasped hands swung up into his stomach and
      // chest on straight arms: a knockdown. The end of his 1, 2, 3
      kettlebell: {
        name: 'Swing de kettlebell', total: 40, clip: C([
          [0, {}],
          [7, { rootPos: [0, -0.15, -0.12], rootRot: [0.55, -0.22, 0], spine: [0.12, 0.0, 0], neck: [-0.25, 0.0, 0],
            handL: [-0.12, -0.82, 0.12], handR: [-0.12, -0.84, 0.1], aimL: 1, aimR: 1, fistL: 1, fistR: 1, twistL: 0, twistR: 0,
            poleL: [0.6, -0.4, -0.6], poleR: [0.6, -0.4, -0.6], footL: [0.14, 0.071, 0.16], footR: [0.18, 0.071, -0.1], kneeL: [0.25, 0, 1], kneeR: [0.25, 0, 1] }, 'inout'],
          [13, { rootPos: [0, -0.07, 0.1], rootRot: [-0.08, -0.18, 0], spine: [0.02, 0.0, 0], neck: [0.05, 0.0, 0],
            handL: [-0.14, 0.0, 1.0], handR: [-0.14, -0.02, 1.0], aimL: 1, aimR: 1, poleL: [0.6, -0.8, 0], poleR: [0.6, -0.8, 0], clavL: [0.1, 0.35], clavR: [0.1, 0.35] }, 'drive'],
          [16, {}, 'lin'],
          [26, { rootPos: [0, -0.1, 0.06], rootRot: [0.08, -0.35, 0], spine: [0.1, 0.1, 0], neck: [0.12, 0.15, 0],
            handL: GUARD_L, handR: GUARD_R, aimL: 0, aimR: 0, clavL: [0, 0.1], clavR: [0, 0.1], poleL: [0.3, -1, -0.15], poleR: [0.25, -1, -0.25],
            footL: [0.05, 0.071, 0.26], footR: [0.2, 0.071, -0.2] }, 'inout'],
          [40, null, 'inout'],
        ]),
        hit: { f: [13, 16], limb: 'handR', r: 0.16, dmg: 17, lvl: 'mid', react: 'hitMid', blk: -12, kd: true, push: 0.6 },
        advance: [[0, 0], [7, -0.04], [13, 0.18], [40, 0.16]], sfx: 'heavy',
      },
    }),
    // PUÑETALITY (js/fight/fatality.js): he cracks his neck, takes a pair of 20 kg dumbbells from behind his back, does
    // a couple of curls ("hoy toca día de brazo"), drops the loser to his knees with a hook of the right one, raises both
    // over his head and brings them down on the loser's head, crushing it; then he lets them fall, dusts his hands and
    // gets his phone out: back to work. Frames: cut (the dumbbells come down on the head), hook (the hook lands),
    // victim (the loser's clips: [frame, clip, blend]); the rest as Noemí's
    fatal: {
      len: 624, cut: 204, hook: 145, title: 404, dist: 0.72, slow: [196, 201, 216, 240, 0.24],
      say: 'Hoy toca día de brazo.', sayAt: 60, sayLen: 84,
      victim: [[60, 'fatalFear', 10], [145, 'fatalKnockKneel', 2], [182, 'fatalKneelUp', 12], [204, 'fatalCrushed', 1]],
      clip: [
        // standing tall, the hands loose at his sides
        [0, { rootPos: [0, -0.02, 0], rootRot: [0, -0.15, 0], spine: [-0.02, 0.05, 0], neck: [0.08, 0.12, 0],
          handL: [0.22, -0.86, 0.06], aimL: 1, fistL: 0.4, twistL: 0, handR: [0.22, -0.86, 0.06], aimR: 1, fistR: 0.4, twistR: 0,
          footL: [0.14, 0.071, 0.1], footR: [0.15, 0.071, -0.1], footRotL: [0, 0.1, 0], footRotR: [0, 0.25, 0], kneeL: [0.1, 0, 1], kneeR: [0.12, 0, 1] }],
        // he cracks his neck, to one side and the other
        [14, { neck: [0.06, 0.15, -0.38] }, 'inout'],
        [20, { neck: [0.06, 0.12, -0.42] }, 'out'],
        [28, { neck: [0.06, 0.1, 0.38] }, 'inout'],
        [33, { neck: [0.06, 0.1, 0.42] }, 'out'],
        // both hands behind his back, the chest out
        [44, { neck: [0.1, 0.12, 0], spine: [-0.08, 0.05, 0], handL: [0.16, -0.62, -0.26], handR: [0.16, -0.62, -0.26], poleL: [0.5, -0.6, -0.6], poleR: [0.5, -0.6, -0.6], fistL: 0.55, fistR: 0.55 }, 'inout'],
        [48, { fistL: 0.75, fistR: 0.75 }, 'inout'],
        // out they come, hanging at his sides, palms in
        [58, { spine: [-0.02, 0.05, 0], handL: [0.26, -0.8, 0.04], handR: [0.26, -0.8, 0.04], poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5], twistL: 0, twistR: 0 }, 'inout'],
        // two curls: the elbows kept at his sides, the dumbbells up to the shoulders, palms up
        [66, { handL: [0.17, -0.3, 0.26], handR: [0.17, -0.3, 0.26], twistL: -1.25, twistR: -1.25, poleL: [0.1, -1, -0.4], poleR: [0.1, -1, -0.4], spine: [-0.06, 0.05, 0], neck: [0.06, 0.12, 0] }, 'inout'],
        [78, { handL: [0.24, -0.78, 0.1], handR: [0.24, -0.78, 0.1], twistL: -0.6, twistR: -0.6 }, 'inout'],
        [90, { handL: [0.17, -0.3, 0.26], handR: [0.17, -0.3, 0.26], twistL: -1.25, twistR: -1.25 }, 'inout'],
        [102, { handL: [0.24, -0.78, 0.1], handR: [0.24, -0.78, 0.1], twistL: -0.6, twistR: -0.6 }, 'inout'],
        [114, { handL: [0.17, -0.3, 0.26], handR: [0.17, -0.3, 0.26], twistL: -1.25, twistR: -1.25 }, 'inout'],
        [128, { handL: [0.26, -0.78, 0.06], handR: [0.26, -0.78, 0.06], twistL: 0, twistR: 0, poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5] }, 'inout'],
        // the hook: weight back, the trunk coiled right, the right dumbbell drawn back at his shoulder...
        [138, { rootPos: [0, -0.07, 0.0], rootRot: [0.05, -0.6, 0], spine: [0.06, -0.25, 0], neck: [0.1, 0.6, 0],
          handR: [0.55, 0.15, 0.0], poleR: [0.8, 0.2, -0.6], twistR: 0.7, handL: [0.18, -0.3, 0.3], twistL: 0, poleL: [0.3, -1, -0.2],
          footL: [0.1, 0.071, 0.24], footR: [0.18, 0.071, -0.16] }, 'inout'],
        // ... and round into his face
        [145, { rootPos: [0, -0.09, 0.3], rootRot: [0.08, 0.35, 0], spine: [0.08, 0.3, 0], neck: [0.1, -0.2, 0], handR: [0.0, 0.3, 0.95], twistR: 0.9, footL: [0.1, 0.071, 0.42], footR: [0.18, 0.071, 0.0] }, 'snap'],
        [154, { rootPos: [0, -0.08, 0.28], rootRot: [0.07, 0.5, 0], spine: [0.06, 0.35, 0], handR: [-0.35, 0.15, 0.6] }, 'out'],
        // he looks down at him on his knees, the dumbbells at his sides
        [174, { rootPos: [0, -0.03, 0.04], rootRot: [0.04, -0.1, 0], spine: [0.04, 0.05, 0], neck: [0.35, 0.05, 0], handR: [0.26, -0.76, 0.08], poleR: [0.2, -1, -0.5], twistR: 0, handL: [0.26, -0.78, 0.06],
          footL: [0.14, 0.071, 0.12], footR: [0.16, 0.071, -0.1] }, 'inout'],
        // both up over his head, together, the body arching back
        [192, { rootPos: [0, -0.02, -0.02], rootRot: [-0.1, -0.05, 0], spine: [-0.18, 0.02, 0], neck: [0.25, 0.02, 0],
          handL: [0.07, 0.98, 0.12], handR: [0.07, 0.98, 0.12], poleL: [1, 0.2, -0.3], poleR: [1, 0.2, -0.3], twistL: 0, twistR: 0, fistL: 0.8, fistR: 0.8 }, 'inout'],
        [200, { handL: [0.07, 1.0, 0.08], handR: [0.07, 1.0, 0.08], spine: [-0.2, 0.02, 0] }, 'out'],
        // down onto his head with all his weight (on it at frame `cut`), pressing on through it
        [204, { rootPos: [0, -0.1, 0.05], rootRot: [0.22, -0.05, 0], spine: [0.22, 0.02, 0], neck: [0.22, 0.02, 0],
          handL: [0.07, 0.25, 0.45], handR: [0.07, 0.25, 0.45], poleL: [0.9, -0.3, -0.2], poleR: [0.9, -0.3, -0.2], wristL: [0, -0.5], wristR: [0, 0.5] }, 'snap'],
        [208, { rootPos: [0, -0.15, 0.06], rootRot: [0.3, -0.05, 0], spine: [0.3, 0.02, 0], neck: [0.2, 0.02, 0], handL: [0.07, 0.14, 0.42], handR: [0.07, 0.14, 0.42] }, 'lin'],
        [212, { rootPos: [0, -0.16, 0.06], handL: [0.07, 0.11, 0.41], handR: [0.07, 0.11, 0.41] }, 'out'],
        // pressed down, then off
        [232, { handL: [0.07, 0.1, 0.41], handR: [0.07, 0.1, 0.41] }, 'sine'],
        [244, { rootPos: [0, -0.06, 0.02], rootRot: [0.1, -0.05, 0], spine: [0.08, 0.02, 0], neck: [0.3, 0.02, 0], handL: [0.12, -0.2, 0.42], handR: [0.12, -0.2, 0.42], wristL: [0, 0], wristR: [0, 0] }, 'inout'],
        // a step back as the body falls, the dumbbells hanging, dripping
        [264, { rootPos: [0, -0.03, -0.22], rootRot: [0.04, -0.1, 0], spine: [0.02, 0.05, 0], neck: [0.3, 0.08, 0], handL: [0.26, -0.78, 0.04], handR: [0.26, -0.78, 0.04], poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5],
          footL: [0.14, 0.071, -0.12], footR: [0.16, 0.071, -0.32] }, 'inout'],
        // he lets them fall
        [278, { fistL: 0.75, fistR: 0.75 }, 'inout'],
        [282, { fistL: 0.05, fistR: 0.05, handL: [0.27, -0.76, 0.06], handR: [0.27, -0.76, 0.06] }, 'out'],
        // dusts his hands
        [294, { handL: [0.05, -0.28, 0.34], handR: [0.05, -0.28, 0.34], poleL: [0.4, -1, 0], poleR: [0.4, -1, 0], twistL: 0.9, twistR: 0.9, fistL: 0, fistR: 0, neck: [0.2, 0.08, 0] }, 'inout'],
        [299, { handL: [0.12, -0.3, 0.34], handR: [0.0, -0.26, 0.34] }, 'sine'],
        [304, { handL: [0.0, -0.26, 0.34], handR: [0.12, -0.3, 0.34] }, 'sine'],
        [309, { handL: [0.12, -0.3, 0.34], handR: [0.0, -0.26, 0.34] }, 'sine'],
        // and his phone: back to work (the win pose's phone, js/fx/accessories.js)
        [326, { handL: [0.3, -0.7, 0.1], twistL: 0, poleL: [0.2, -1, -0.5], fistL: 0.25,
          handR: [0.16, -0.3, 0.46], fistR: 0, twistR: -1.4, wristR: [-0.2, 0], thR: 0, poleR: [0.2, -1, -0.5], neck: [0.4, -0.05, 0] }, 'inout'],
        [336, { wristR: [-0.13, 0] }, 'sine'], [342, { wristR: [-0.27, 0] }, 'sine'], [348, { wristR: [-0.13, 0] }, 'sine'], [354, { wristR: [-0.27, 0] }, 'sine'],
        [360, { wristR: [-0.13, 0], neck: [0.4, 0.06, 0] }, 'sine'], [366, { wristR: [-0.27, 0] }, 'sine'], [372, { wristR: [-0.13, 0] }, 'sine'],
        [378, { wristR: [-0.27, 0] }, 'sine'], [386, { wristR: [-0.13, 0], neck: [0.4, -0.05, 0] }, 'sine'], [394, { wristR: [-0.27, 0] }, 'sine'],
        [624, { wristR: [-0.2, 0], neck: [0.42, 0.0, 0] }, 'sine'],
      ],
    },
    // "no molestes, estoy trabajando": the phone out of his pocket, the back of the other hand waves the loser away
    // without even looking up, and he goes on tapping at it, the phone flat on his palm (js/fx/accessories.js)
    win: [
      [0, {}],
      [12, { handR: [0.36, -0.68, 0.02], aimR: 1, fistR: 0.4, twistR: 0, handL: [0.3, -0.7, 0.1], aimL: 1, fistL: 0.25 }, 'out'],
      [28, { rootPos: [0, 0, 0], rootRot: [0, 0.18, 0], spine: [0.04, 0, 0], neck: [0.38, -0.05, 0],
        handR: [0.16, -0.3, 0.46], aimR: 1, fistR: 0, twistR: -1.4, wristR: [-0.2, 0], thR: 0, footL: [0.16, 0.071, 0.05], footR: [0.16, 0.071, -0.05], footRotL: [0, 0.2, 0], footRotR: [0, 0.22, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }, 'inout'],
      [40, { handL: [0.4, -0.12, 0.48], aimL: 1, fistL: 0, twistL: 0.4, wristL: [0.2, 0] }, 'inout'],
      [47, { wristL: [-0.7, 0] }, 'inout'],
      [54, { wristL: [0.3, 0] }, 'inout'],
      [61, { wristL: [-0.7, 0] }, 'inout'],
      [68, { wristL: [0.2, 0] }, 'inout'],
      [82, { handL: [0.3, -0.7, 0.1], fistL: 0.25, twistL: 0, wristL: [0, 0] }, 'inout'],
      [88, { wristR: [-0.13, 0], neck: [0.4, 0.06, 0] }, 'sine'], [94, { wristR: [-0.27, 0] }, 'sine'], [100, { wristR: [-0.13, 0] }, 'sine'],
      [106, { wristR: [-0.27, 0] }, 'sine'], [112, { wristR: [-0.13, 0], neck: [0.4, -0.05, 0] }, 'sine'], [118, { wristR: [-0.27, 0] }, 'sine'],
      [124, { wristR: [-0.13, 0] }, 'sine'], [130, { wristR: [-0.27, 0] }, 'sine'], [136, { wristR: [-0.13, 0], neck: [0.4, 0.06, 0] }, 'sine'],
      [142, { wristR: [-0.27, 0] }, 'sine'], [148, { wristR: [-0.13, 0] }, 'sine'], [154, { wristR: [-0.27, 0] }, 'sine'],
      [160, { wristR: [-0.13, 0], neck: [0.4, -0.05, 0] }, 'sine'], [166, { wristR: [-0.27, 0] }, 'sine'], [172, { wristR: [-0.13, 0] }, 'sine'],
      [178, { wristR: [-0.27, 0] }, 'sine'], [184, { wristR: [-0.13, 0], neck: [0.4, 0.06, 0] }, 'sine'], [190, { wristR: [-0.27, 0] }, 'sine'],
      [199, { wristR: [-0.13, 0] }, 'sine'], [208, { wristR: [-0.27, 0] }, 'sine'], [217, { wristR: [-0.13, 0], neck: [0.4, -0.05, 0] }, 'sine'],
      [226, { wristR: [-0.27, 0] }, 'sine'], [235, { wristR: [-0.13, 0] }, 'sine'], [244, { wristR: [-0.27, 0] }, 'sine'],
      [253, { wristR: [-0.13, 0], neck: [0.4, 0.06, 0] }, 'sine'],
    ],
  },
  rafa: {
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0.1, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.2, -0.88, 0.1], handR: [0.2, -0.88, 0.1], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, footL: [0.14, 0.071, 0.04], footR: [0.14, 0.071, -0.02], footRotL: [0, 0.15, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      [16, { handL: [0.45, -0.35, 0.1], handR: [0.45, -0.35, 0.1], fistL: 0.2, fistR: 0.2, poleL: [1, -0.3, -0.4], poleR: [1, -0.3, -0.4] }, 'inout'],
      [30, { neck: [0.1, 0, 0.45] }, 'inout'],
      [46, { neck: [0.1, 0, -0.45] }, 'inout'],
      // the right fist smacks into the open left hand (the hands used to start out one inside the other)
      [58, { neck: [0.05, 0.1, 0], handL: [-0.02, 0.0, 0.5], handR: [0.03, 0.02, 0.5], fistL: 0.1, fistR: 1 }, 'inout'],
      [72, { handR: [-0.045, 0.0, 0.52], spine: [0.1, 0, 0] }, 'snap'],
      [98, null, 'inout'],
    ],
    title: 'El Veterano', desc: 'Peso pesado con sarcasmo. Golpes lentos pero devastadores.',
    say: '¿Ya? Iba a empezar a calentar.', sayAt: 78, sayLen: 138, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Tranquilo, que iré despacito.', introLen: 112, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 188, walk: 1.05, weight: 1.3, power: 1.08, speed: 0.99 },
    hairSway: 0.4, // how far the hair swings with the head: short curls (js/anim/hairsway.js)
    aiMoves: ['1', '2', '1+2', 'f+2', 'df+1', 'd+3', 'df+2', '3', '2+4', 'd+4', 'b+1', 'b+4'], juggle: ['1', '2', '1+2'],
    stance: { rootPos: [0, -0.06, -0.03], rootRot: [0.04, -0.4, 0], hgPosL: [0.1, -0.21, 0.3], hgPosR: [0.13, -0.19, 0.14], footL: [0.1, 0.071, 0.24], footR: [0.24, 0.071, -0.2] },
    bob: 0.012,
    throw2: 'bearHug',
    commands: [['1+2', 'bellyBump'], ['f+2', 'smash'], ['b+1', 'earClap'], ['b+4', 'stomp']],
    stringFinish: 'stomp', // (the end of his own 1, 2, 3: js/fight/moves.js straight's cancel)
    // the phone's ★ buttons (js/ui/touch.js): the special that ★ PUÑO / ★ PATADA throws with the stick at rest (n),
    // forward (f), back (b) or down (d), as the command it stands for
    touchSP: { P: { n: '1+2', f: 'f+2', b: 'b+1', d: 'df+2' }, K: { n: 'b+4', f: 'uf+4', b: '4', d: 'd+4' } },
    moves: (C) => ({
      bellyBump: {
        name: 'Belly bump', total: 44, clip: C([
          [0, {}],
          // a sumo's belly bump: the arms swing back, the hips sink and the belly is thrown forward with the legs; the
          // chest stays over the hips, leaning back no more than to get the belly out in front (it lay back 43 degrees
          // with the hands up, as if falling over), the eyes on the target
          [8, { rootPos: [0, -0.1, -0.08], rootRot: [-0.12, -0.1, 0], spine: [-0.12, 0, 0], neck: [0.15, 0, 0],
            handL: [0.3, -0.7, -0.35], handR: [0.3, -0.7, -0.35], aimL: 1, aimR: 1, fistL: 0.6, fistR: 0.6, poleL: [0.4, -0.3, -1], poleR: [0.4, -0.3, -1] }, 'inout'],
          [16, { rootPos: [0, -0.075, 0.215], rootRot: [-0.22, 0, 0], spine: [-0.2, 0, 0], neck: [0.32, 0, 0],
            handL: [0.36, -0.62, -0.42], handR: [0.36, -0.62, -0.42], footL: [0.06, 0.071, 0.34], kneeL: [0.2, 0, 1] }, 'drive'],
          [20, {}, 'lin'],
          [44, null, 'inout'],
        ]),
        hit: { f: [15, 19], limb: 'belly', r: 0.25, dmg: 14, lvl: 'mid', react: 'hitMid', blk: -4, hitAdv: 12, push: 0.9 },
        advance: [[0, 0], [16, 0.46], [44, 0.46]], sfx: 'body',
      },
      smash: {
        name: 'Overhand smash', total: 50, clip: C([
          [0, {}],
          [10, { rootPos: [0, 0.0, -0.06], rootRot: [-0.15, -0.8, 0], spine: [-0.2, -0.4, 0], handR: [0.4, 0.75, -0.2], aimR: 1, twistR: 0.8, clavR: [0.3, -0.1] }, 'inout'],
          [18, { rootPos: [0, -0.23, 0.12], rootRot: [0.22, 0.2, 0], spine: [0.26, 0.45, 0], handR: [-0.05, 0.0, 0.98], aimR: 1, twistR: 1.0, clavR: [0.1, 0.5], footL: [0.1, 0.071, 0.36], neck: [-0.08, -0.1, 0], kneeL: [0.25, 0, 1] }, 'drive'],
          [22, {}, 'lin'],
          [31, { rootPos: [0, -0.15, 0.06], rootRot: [0.12, -0.2, 0], spine: [0.16, 0.25, 0], handR: [-0.1, 0.2, 0.6], aimR: 0.6, twistR: 0.2, clavR: [0.0, 0.2] }, 'ret'],
          [50, null, 'inout'],
        ]),
        hit: { f: [19, 22], limb: 'handR', r: 0.13, dmg: 20, lvl: 'mid', react: 'hitMid', blk: -14, kd: true, push: 0.6 },
        advance: [[0, 0], [18, 0.3], [50, 0.3]], sfx: 'heavy',
      },
      bearHug: {
        name: 'Bear hug', total: 36, throw: true, clip: C([
          [0, {}],
          [12, { handL: [0.3, 0.0, 0.9], handR: [0.3, 0.0, 0.9], aimL: 1, aimR: 1, fistL: 0.2, fistR: 0.2, rootPos: [0, -0.1, 0.1], rootRot: [0.1, 0, 0] }, 'snap'],
          [36, {}, 'inout'],
        ]),
        hit: { f: [11, 13], limb: 'handL', r: 0.18, dmg: 0, lvl: 'throw', blk: -8 },
        advance: [[0, 0], [12, 0.12], [36, 0.12]], sfx: 'grab', throwDmg: 38, throwType: 'hug',
      },
      // PALMADA DE OREJAS: both arms flung out wide, open hands, then clapped in on the ears from both sides: he is
      // left ringing (a long stun)
      earClap: {
        name: 'Palmada de orejas', total: 38, clip: C([
          [0, {}],
          [7, { rootPos: [0, -0.1, -0.05], rootRot: [0.0, -0.22, 0], spine: [-0.04, 0.02, 0], neck: [0.1, 0.05, 0],
            handL: [0.82, 0.24, 0.12], handR: [0.82, 0.24, 0.12], aimL: 0, aimR: 0, fistL: 0, fistR: 0, twistL: 0, twistR: 0, poleL: [0.6, 0.2, -1], poleR: [0.6, 0.2, -1] }, 'inout'],
          [13, { rootPos: [0, -0.12, 0.08], rootRot: [0.12, -0.12, 0], spine: [0.12, 0.0, 0], neck: [0.08, 0.05, 0],
            handL: [-0.05, 0.3, 0.86], handR: [-0.05, 0.3, 0.86], aimL: 1, aimR: 1, poleL: [0.6, -0.5, -0.5], poleR: [0.6, -0.5, -0.5] }, 'drive'],
          [16, {}, 'lin'],
          [26, { rootPos: [0, -0.09, 0.03], rootRot: [0.06, -0.38, 0], spine: [0.1, 0.1, 0], neck: [0.14, 0.18, 0],
            handL: GUARD_L, handR: GUARD_R, aimL: 0, aimR: 0, fistL: 1, fistR: 1, twistL: -0.4, twistR: -0.55, poleL: [0.3, -1, -0.15], poleR: [0.25, -1, -0.25] }, 'inout'],
          [38, null, 'inout'],
        ]),
        hit: { f: [13, 15], limb: 'handL', r: 0.14, dmg: 16, lvl: 'high', react: 'hitHighHeavy', blk: -10, hitAdv: 12, push: 0.12 },
        advance: [[0, 0], [13, 0.14], [38, 0.12]], sfx: 'slap',
      },
      // PISOTÓN: the rear knee up, then the heel stamped down on his foot and shin (a low), his weight on it; the foot
      // stays forward and the other comes up behind. The end of his 1, 2, 3
      stomp: {
        name: 'Pisotón', total: 34, clip: C([
          [0, {}],
          [6, { rootPos: [0, -0.06, -0.02], rootRot: [0.0, -0.22, 0], spine: [0.05, 0.02, 0], neck: [0.18, 0.05, 0],
            footR: [0.12, 0.45, 0.1], kneeR: [0.1, 0.6, 1], footRotR: [-0.1, 0.4, 0] }, 'inout'],
          [12, { rootPos: [0, -0.16, 0.1], rootRot: [0.16, 0.0, 0], spine: [0.16, -0.08, 0], neck: [0.3, -0.05, 0],
            footR: [0.08, 0.12, 0.6], kneeR: [0.15, 0.3, 1], footRotR: [0.25, 0.3, 0] }, 'drive'],
          [14, {}, 'lin'],
          [22, { rootPos: [0, -0.13, 0.1], rootRot: [0.1, -0.1, 0], spine: [0.12, 0.0, 0], neck: [0.18, 0.05, 0], footR: [0.1, 0.071, 0.46], kneeR: [0.3, 0, 1], footRotR: [0, 0.2, 0] }, 'inout'],
          [34, null, 'inout'],
        ]),
        hit: { f: [11, 13], limb: 'footR', r: 0.12, dmg: 13, lvl: 'low', react: 'hitLow', blk: -12, hitAdv: 2, push: 0.2 },
        advance: [[0, 0], [12, 0.14], [34, 0.12]], sfx: 'kick',
      },
    }),
    // PUÑETALITY (js/fight/fatality.js): a heavyweight's. He rolls his shoulders, slaps his belly twice and stamps: the
    // ground cracks from his foot to the loser and gives way behind him, a pit of rusty spikes. He charges, a belly bump
    // throws the loser back through the air and down onto the spikes; he walks to the edge, looks down: "te dije que
    // iría despacito". Frames: contact (the belly lands), stomp, land (the loser on the spikes); move (his steps, m along
    // the way he faces), fling (the loser's flight); the rest as the others'
    fatal: {
      len: 660, contact: 188, stomp: 92, land: 222, title: 440, dist: 2.4,
      move: [[0, 0], [150, 0], [186, 1.85, 'lin'], [198, 1.95], [300, 1.95], [330, 2.55, 'lin']],
      fling: { from: 188, to: 222, dist: 1.6, h: 1.05, yEnd: -0.98, floor: -1.68 },
      slow: [[180, 186, 194, 204, 0.25], [216, 221, 232, 246, 0.3]],
      say: 'Te dije que iría despacito.', sayAt: 344, sayLen: 110,
      winner: [[150, 'fatal_charge', 8], [182, 'fatal_bump', 4]],
      victim: [[40, 'fatalFear', 10], [104, 'fatalLookBack', 10], [136, 'fatalFear', 14], [188, 'fatalFlung', 1], [222, 'fatalImpaled', 1]],
      clip: [
        // standing, loose, the loser a good way off
        [0, { rootPos: [0, -0.03, 0], rootRot: [0, -0.15, 0], spine: [-0.02, 0.05, 0], neck: [0.08, 0.12, 0],
          handL: [0.25, -0.84, 0.06], aimL: 1, handR: [0.25, -0.84, 0.06], aimR: 1, fistL: 0.4, fistR: 0.4, twistL: 0, twistR: 0,
          footL: [0.15, 0.071, 0.1], footR: [0.16, 0.071, -0.1], footRotL: [0, 0.15, 0], footRotR: [0, 0.3, 0], kneeL: [0.1, 0, 1], kneeR: [0.12, 0, 1] }],
        // the shoulders rolled, one and the other, a turn of the neck
        [14, { clavL: [0.22, 0.1], neck: [0.08, 0.12, 0.25] }, 'inout'],
        [24, { clavL: [0, -0.05], clavR: [0.22, 0.1], neck: [0.08, 0.12, -0.25] }, 'inout'],
        [34, { clavR: [0, -0.05], neck: [0.08, 0.12, 0] }, 'inout'],
        // two slaps on his belly, his chin up
        [42, { handL: [0.0, -0.6, 0.45], aimL: 1, handR: [0.0, -0.6, 0.45], aimR: 1, fistL: 0.05, fistR: 0.05, twistL: 0.9, twistR: 0.9, neck: [-0.05, 0.1, 0], spine: [-0.08, 0.05, 0] }, 'inout'],
        [46, { handL: [-0.02, -0.62, 0.38], handR: [-0.02, -0.62, 0.38] }, 'out'],
        [52, { handL: [0.0, -0.6, 0.45], aimL: 1, handR: [0.0, -0.6, 0.45], aimR: 1 }, 'inout'],
        [56, { handL: [-0.02, -0.62, 0.38], handR: [-0.02, -0.62, 0.38] }, 'out'],
        [64, { handL: [0.25, -0.84, 0.06], handR: [0.25, -0.84, 0.06], fistL: 0.5, fistR: 0.5, twistL: 0, twistR: 0, neck: [0.1, 0.12, 0], spine: [-0.02, 0.05, 0] }, 'inout'],
        // the stamp: the right knee up high, the arms out, and down with all his weight (the ground cracks at frame stomp)
        [80, { rootPos: [0, 0.0, 0], rootRot: [-0.04, -0.15, 0.06], footR: [0.16, 0.42, 0.02], kneeR: [0.1, 0.4, 1], footRotR: [0.2, 0.3, 0], handL: [0.55, -0.4, 0.2], handR: [0.55, -0.45, 0.2], fistL: 0.6, fistR: 0.6, neck: [0.15, 0.1, 0] }, 'inout'],
        [92, { rootPos: [0, -0.12, 0.02], rootRot: [0.08, -0.15, -0.02], footR: [0.17, 0.071, -0.02], footRotR: [0, 0.3, 0], handL: [0.45, -0.6, 0.15], handR: [0.45, -0.62, 0.15], neck: [0.2, 0.1, 0] }, 'snap'],
        [104, { rootPos: [0, -0.05, 0], rootRot: [0.02, -0.15, 0] }, 'inout'],
        // he watches it open; a grin
        [126, { neck: [0.12, 0.08, 0], jaw: 0.1, handL: [0.28, -0.8, 0.08], handR: [0.28, -0.8, 0.08] }, 'inout'],
        // set to charge: head down, weight forward
        [148, { rootPos: [0, -0.12, 0.04], rootRot: [0.28, -0.05, 0], spine: [0.12, 0, 0], neck: [-0.2, 0, 0], handL: [0.32, -0.5, 0.3], handR: [0.32, -0.5, 0.3], fistL: 0.6, fistR: 0.6,
          footL: [0.12, 0.071, 0.18], footR: [0.14, 0.071, -0.22], jaw: 0 }, 'inout'],
      ],
      clips: {
        // the charge: a heavy jog, two steps of 0.6 m in 24 frames
        charge: [[
          [0, { rootPos: [0, -0.1, 0.06], rootRot: [0.32, 0, 0.06], spine: [0.12, 0, -0.036], neck: [-0.25, 0, 0], footL: [0.11, 0.075, 0.3], footRotL: [0.05, 0.0, 0.0], footR: [0.115, 0.215, -0.25], footRotR: [0.8, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.38, -0.62, -0.2], handR: [0.3, -0.45, 0.35], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }],
          [2, { rootPos: [0, -0.12, 0.06], rootRot: [0.32, 0, 0.04], spine: [0.12, 0, -0.024], neck: [-0.25, 0, 0], footL: [0.11, 0.073, 0.2], footRotL: [0.03, 0.0, 0.0], footR: [0.12, 0.32, -0.22], footRotR: [1.0, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.373, -0.597, -0.107], handR: [0.32, -0.483, 0.26], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [3, { rootPos: [0, -0.13, 0.06], rootRot: [0.32, 0, 0.03], spine: [0.12, 0, -0.018], neck: [-0.25, 0, 0], footL: [0.11, 0.073, 0.15], footRotL: [0.02, 0.0, 0.0], footR: [0.12, 0.316, -0.132], footRotR: [0.88, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.37, -0.585, -0.06], handR: [0.33, -0.5, 0.215], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [5, { rootPos: [0, -0.11, 0.06], rootRot: [0.32, 0, 0.01], spine: [0.12, 0, -0.006], neck: [-0.25, 0, 0], footL: [0.11, 0.071, 0.05], footRotL: [0.0, 0.0, 0.0], footR: [0.12, 0.308, 0.044], footRotR: [0.64, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.363, -0.562, 0.033], handR: [0.35, -0.533, 0.125], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [6, { rootPos: [0, -0.1, 0.06], rootRot: [0.32, 0, 0.0], spine: [0.12, 0, -0.0], neck: [-0.25, 0, 0], footL: [0.11, 0.079, -0.016], footRotL: [0.12, 0.0, 0.0], footR: [0.12, 0.304, 0.132], footRotR: [0.52, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.36, -0.55, 0.08], handR: [0.36, -0.55, 0.08], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [7, { rootPos: [0, -0.09, 0.06], rootRot: [0.32, 0, -0.01], spine: [0.12, 0, 0.006], neck: [-0.25, 0, 0], footL: [0.11, 0.087, -0.082], footRotL: [0.24, 0.0, 0.0], footR: [0.12, 0.3, 0.22], footRotR: [0.4, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.35, -0.533, 0.125], handR: [0.363, -0.562, 0.033], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [8, { rootPos: [0, -0.08, 0.06], rootRot: [0.32, 0, -0.02], spine: [0.12, 0, 0.012], neck: [-0.25, 0, 0], footL: [0.11, 0.094, -0.148], footRotL: [0.36, 0.0, 0.0], footR: [0.117, 0.253, 0.26], footRotR: [0.283, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.34, -0.517, 0.17], handR: [0.367, -0.573, -0.013], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [10, { rootPos: [0, -0.07, 0.06], rootRot: [0.32, 0, -0.04], spine: [0.12, 0, 0.024], neck: [-0.25, 0, 0], footL: [0.11, 0.11, -0.28], footRotL: [0.6, 0.0, 0.0], footR: [0.11, 0.16, 0.34], footRotR: [0.05, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.32, -0.483, 0.26], handR: [0.373, -0.597, -0.107], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [12, { rootPos: [0, -0.1, 0.06], rootRot: [0.32, 0, -0.06], spine: [0.12, 0, 0.036], neck: [-0.25, 0, 0], footL: [0.115, 0.215, -0.25], footRotL: [0.8, 0.0, 0.0], footR: [0.11, 0.075, 0.3], footRotR: [0.05, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.3, -0.45, 0.35], handR: [0.38, -0.62, -0.2], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [14, { rootPos: [0, -0.12, 0.06], rootRot: [0.32, 0, -0.04], spine: [0.12, 0, 0.024], neck: [-0.25, 0, 0], footL: [0.12, 0.32, -0.22], footRotL: [1.0, 0.0, 0.0], footR: [0.11, 0.073, 0.2], footRotR: [0.03, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.32, -0.483, 0.26], handR: [0.373, -0.597, -0.107], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [15, { rootPos: [0, -0.13, 0.06], rootRot: [0.32, 0, -0.03], spine: [0.12, 0, 0.018], neck: [-0.25, 0, 0], footL: [0.12, 0.316, -0.132], footRotL: [0.88, 0.0, 0.0], footR: [0.11, 0.073, 0.15], footRotR: [0.02, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.33, -0.5, 0.215], handR: [0.37, -0.585, -0.06], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [17, { rootPos: [0, -0.11, 0.06], rootRot: [0.32, 0, -0.01], spine: [0.12, 0, 0.006], neck: [-0.25, 0, 0], footL: [0.12, 0.308, 0.044], footRotL: [0.64, 0.0, 0.0], footR: [0.11, 0.071, 0.05], footRotR: [0.0, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.35, -0.533, 0.125], handR: [0.363, -0.562, 0.033], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [18, { rootPos: [0, -0.1, 0.06], rootRot: [0.32, 0, 0.0], spine: [0.12, 0, -0.0], neck: [-0.25, 0, 0], footL: [0.12, 0.304, 0.132], footRotL: [0.52, 0.0, 0.0], footR: [0.11, 0.079, -0.016], footRotR: [0.12, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.36, -0.55, 0.08], handR: [0.36, -0.55, 0.08], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [19, { rootPos: [0, -0.09, 0.06], rootRot: [0.32, 0, 0.01], spine: [0.12, 0, -0.006], neck: [-0.25, 0, 0], footL: [0.12, 0.3, 0.22], footRotL: [0.4, 0.0, 0.0], footR: [0.11, 0.087, -0.082], footRotR: [0.24, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.363, -0.562, 0.033], handR: [0.35, -0.533, 0.125], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [20, { rootPos: [0, -0.08, 0.06], rootRot: [0.32, 0, 0.02], spine: [0.12, 0, -0.012], neck: [-0.25, 0, 0], footL: [0.117, 0.253, 0.26], footRotL: [0.283, 0.0, 0.0], footR: [0.11, 0.094, -0.148], footRotR: [0.36, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.367, -0.573, -0.013], handR: [0.34, -0.517, 0.17], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [22, { rootPos: [0, -0.07, 0.06], rootRot: [0.32, 0, 0.04], spine: [0.12, 0, -0.024], neck: [-0.25, 0, 0], footL: [0.11, 0.16, 0.34], footRotL: [0.05, 0.0, 0.0], footR: [0.11, 0.11, -0.28], footRotR: [0.6, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.373, -0.597, -0.107], handR: [0.32, -0.483, 0.26], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
          [24, { rootPos: [0, -0.1, 0.06], rootRot: [0.32, 0, 0.06], spine: [0.12, 0, -0.036], neck: [-0.25, 0, 0], footL: [0.11, 0.075, 0.3], footRotL: [0.05, 0.0, 0.0], footR: [0.115, 0.215, -0.25], footRotR: [0.8, 0.0, 0.0], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1], handL: [0.38, -0.62, -0.2], handR: [0.3, -0.45, 0.35], aimL: 1, aimR: 1, fistL: 0.5, fistR: 0.5, twistL: -0.2, twistR: -0.2, poleL: [0.7, -0.6, -0.4], poleR: [0.7, -0.6, -0.4], toeL: 0, toeR: 0, jaw: 0.25 }, 'sine'],
        ], { loop: true }],
        // the bump: belly out, arms flung back, the pelvis driven through him; the recoil; a breath; then two steps to the
        // pit's edge, a look down, his line, a pat on the belly
        bump: [[
          [0, { rootPos: [0, -0.08, 0.02], rootRot: [0.15, 0, 0], spine: [0.05, 0, 0], neck: [-0.1, 0, 0], handL: [0.4, -0.45, 0.1], aimL: 1, handR: [0.4, -0.45, 0.1], aimR: 1, fistL: 0.5, fistR: 0.5,
            footL: [0.12, 0.071, 0.2], footR: [0.14, 0.09, -0.25], footRotL: [0, 0, 0], footRotR: [0.3, 0.2, 0], kneeL: [0.12, 0, 1], kneeR: [0.12, 0, 1], twistL: 0, twistR: 0, jaw: 0.2 }],
          // (frame 182 of the move) leaning back, belly out
          [4, { rootPos: [0, -0.06, -0.02], rootRot: [-0.22, 0, 0], spine: [-0.3, 0, 0], neck: [0.35, 0, 0], handL: [0.55, -0.2, -0.35], handR: [0.55, -0.2, -0.35], poleL: [0.6, 0.3, -0.7], poleR: [0.6, 0.3, -0.7], fistL: 0.3, fistR: 0.3,
            footL: [0.12, 0.071, 0.28], footR: [0.14, 0.071, -0.2], footRotR: [0, 0.25, 0] }, 'inout'],
          // the bump (188): the belly driven forward, the arms back
          [6, { rootPos: [0, -0.1, 0.16], rootRot: [-0.38, 0, 0], spine: [-0.42, 0, 0], neck: [0.45, 0, 0], handL: [0.6, -0.1, -0.45], handR: [0.6, -0.1, -0.45], jaw: 0.4 }, 'snap'],
          [12, { rootPos: [0, -0.1, 0.12], rootRot: [-0.3, 0, 0], spine: [-0.32, 0, 0] }, 'out'],
          // upright again, arms down: he watches the loser fly
          [34, { rootPos: [0, -0.04, 0.02], rootRot: [0.02, 0, 0], spine: [0, 0, 0], neck: [0.06, 0, 0], handL: [0.28, -0.8, 0.08], handR: [0.28, -0.8, 0.08], poleL: [0.2, -1, -0.5], poleR: [0.2, -1, -0.5], fistL: 0.4, fistR: 0.4,
            footL: [0.14, 0.071, 0.12], footR: [0.15, 0.071, -0.1], footRotR: [0, 0.3, 0], jaw: 0.05 }, 'inout'],
          [70, { neck: [0.12, 0.04, 0] }, 'sine'],
          // (118 = frame 300 of the move) two steps to the edge, 0.6 m in 30 frames
          [118, { footL: [0.14, 0.071, 0.1], footR: [0.15, 0.071, -0.1] }, 'inout'],
          [126, { footR: [0.15, 0.14, -0.01], footL: [0.14, 0.071, -0.06], rootPos: [0, -0.02, 0.02] }, 'lin'],
          [133, { footR: [0.15, 0.071, 0.1], footL: [0.14, 0.071, -0.2], rootPos: [0, -0.05, 0.02] }, 'lin'],
          [141, { footL: [0.14, 0.14, -0.06], footR: [0.15, 0.071, -0.06], rootPos: [0, -0.02, 0.02] }, 'lin'],
          [148, { footL: [0.14, 0.071, 0.1], footR: [0.15, 0.071, -0.2], rootPos: [0, -0.04, 0] }, 'lin'],
          // he looks down into the pit, hands on his hips
          [164, { rootRot: [0.12, 0, 0], spine: [0.18, 0, 0], neck: [0.55, 0, 0], handL: [0.3, -0.55, -0.02], handR: [0.3, -0.55, -0.02], poleL: [1, -0.2, -0.3], poleR: [1, -0.2, -0.3], fistL: 0.4, fistR: 0.4, twistL: 0, twistR: 0 }, 'inout'],
          [230, { neck: [0.6, 0.05, 0.05] }, 'sine'],
          // a pat on the belly
          [246, { handL: [0.0, -0.6, 0.45], aimL: 1, handR: [0.0, -0.6, 0.45], aimR: 1, fistL: 0.05, fistR: 0.05, twistL: 0.9, twistR: 0.9, neck: [0.2, 0.05, 0], spine: [0.02, 0, 0], rootRot: [0.02, 0, 0] }, 'inout'],
          [250, { handL: [-0.02, -0.62, 0.38], handR: [-0.02, -0.62, 0.38] }, 'out'],
          [478, { neck: [0.15, 0.08, 0] }, 'sine'],
        ]],
      },
    },
    // "¿ya? iba a empezar a calentar": a shrug with both palms up, a shake of the head, and the shoulders rolled like
    // a warm-up nobody needed
    win: [
      [0, {}],
      [22, { rootPos: [0, 0, 0], rootRot: [0, 0.15, 0], spine: [-0.03, 0, 0], neck: [0.05, -0.1, 0],
        handL: [0.3, -0.65, 0.12], handR: [0.3, -0.65, 0.12], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3,
        footL: [0.18, 0.071, 0.05], footR: [0.18, 0.071, -0.05], footRotL: [0, 0.25, 0], footRotR: [0, 0.25, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }, 'inout'],
      [72, { handL: [0.4, -0.38, 0.35], handR: [0.4, -0.38, 0.35], fistL: 0.05, fistR: 0.05, twistL: -1.4, twistR: -1.4, clavL: [0.2, 0], clavR: [0.2, 0], neck: [0.05, 0, 0.12] }, 'inout'],
      [92, { clavL: [0.08, 0], clavR: [0.08, 0] }, 'sine'],
      [106, { neck: [0.05, -0.12, 0.05] }, 'sine'],
      [118, { neck: [0.05, 0.12, 0.05] }, 'sine'],
      [132, { neck: [0.05, -0.1, 0.05], handL: [0.3, -0.62, 0.15], handR: [0.3, -0.62, 0.15], fistL: 0.2, fistR: 0.2, twistL: 0, twistR: 0, clavL: [0, 0], clavR: [0, 0] }, 'sine'],
      [156, { clavL: [0.15, 0.1], clavR: [0, 0], neck: [-0.05, 0, 0] }, 'sine'],
      [172, { clavL: [0, 0], clavR: [0.15, 0.1] }, 'sine'],
      [190, { clavR: [0, 0] }, 'sine'],
    ],
  },
  zapponi: {
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0.1, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.2, -0.88, 0.1], handR: [0.2, -0.88, 0.1], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, footL: [0.14, 0.071, 0.04], footR: [0.14, 0.071, -0.02], footRotL: [0, 0.15, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      [14, { handL: [-0.12, 0.05, 0.55], handR: [-0.12, 0.05, 0.55], fistL: 1, fistR: 1 }, 'inout'],
      [20, { handL: [-0.08, 0.05, 0.5], handR: [-0.08, 0.05, 0.5] }, 'snap'],
      [40, { handL: [0.75, 0.25, 0.05], handR: [0.75, 0.25, 0.05], twistL: 1.3, twistR: 1.3, spine: [-0.15, 0, 0], neck: [-0.25, 0, 0], jaw: 0.45, clavL: [0.25, 0], clavR: [0.25, 0] }, 'back'],
      [62, { handL: [-0.15, -0.15, 0.3], handR: [-0.15, -0.15, 0.3], fistL: 0.1, fistR: 0.1, jaw: 0.1, neck: [0.1, 0, 0] }, 'inout'],
      [68, { handL: [-0.18, -0.17, 0.26], handR: [-0.18, -0.17, 0.26] }, 'snap'],
      [98, null, 'inout'],
    ],
    // PUÑETALITY (js/fight/fatality.js): his bike. A whistle and his bike rolls in on its own, past the loser, and stops
    // by him; a helmet from behind his back, the strap done up, two knocks on it and a finger at the loser. He hops on,
    // rides off, turns in a skid, rings the bell and sprints straight at him: through him at forty an hour, and the
    // loser falls apart in two, a half to each side (js/fx/halves.js). A skid to a stop, a look back: his line.
    // Frames: cut (the front wheel at him), title; ride (Match.fatalRide: the path from where he stood, his heading),
    // grip (his hands on the saddle, then on the horns); still: the loser no longer moves from the cut
    fatal: {
      len: 740, cut: 320, still: 320, title: 532, dist: 2.2,
      say: '¡Eso sí que ha sido espectacular, vale!', sayAt: 388, sayLen: 136,
      slow: [[308, 317, 333, 352, 0.12]],
      ride: {
        keys: [[178, 0, 0, 0], [194, 0, 0.5, 0],
          [200, -0.12, 0.5], [206, -0.42, 0.5], [212, -0.85, 0.49], [218, -1.36, 0.48], [224, -1.9, 0.47], [230, -2.42, 0.46],
          [236, -2.85, 0.4], [242, -3.12, 0.27], [248, -3.25, 0.1], [252, -3.28, 0, 0],
          [266, -3.28, 0, 0], [272, -3.225, 0], [278, -3.061, 0], [284, -2.787, 0], [290, -2.403, 0], [296, -1.910, 0], [302, -1.307, 0], [308, -0.594, 0], [314, 0.228, 0], [320, 1.16, 0],
          [326, 2.14, 0], [332, 3.09, 0.01], [338, 3.948, 0.04], [344, 4.626, 0.08], [350, 5.124, 0.12], [356, 5.442, 0.14], [362, 5.58, 0.15], [366, 5.6, 0.15, 0]],
        yaw: [[178, 0], [194, -Math.PI], [232, -Math.PI], [250, -2 * Math.PI], [334, -2 * Math.PI], [362, -1.5 * Math.PI]],
        cadence: [12, 0.25, 0.95], clips: ['fatal_ride', 'fatal_sprint'],
      },
      grip: {
        R: [[86, -0.42, 1.06, 0.26, 0], [94, -0.48, 1.0, 0.2, 1], [104, -0.48, 1.0, 0.2, 1], [110, -0.4, 1.05, 0.15, 0],
          [192, -0.21, 0.915, 0.565, 0], [197, -0.21, 0.915, 0.565, 1], [398, -0.21, 0.915, 0.565, 1], [404, -0.21, 0.915, 0.565, 0], [452, -0.21, 0.915, 0.565, 0], [460, -0.21, 0.915, 0.565, 1], [740, -0.21, 0.915, 0.565, 1]],
        L: [[192, 0.21, 0.915, 0.565, 0], [197, 0.21, 0.915, 0.565, 1], [740, 0.21, 0.915, 0.565, 1]],
      },
      winner: [[178, 'fatal_hop', 3], [194, 'fatal_ride', 4], [224, 'fatal_brake', 6], [232, 'fatal_skid', 5], [250, 'fatal_set', 8], [264, 'fatal_sprint', 6],
        [322, 'fatal_coast', 4], [332, 'fatal_skidstop', 6], [362, 'fatal_stop', 8], [380, 'fatal_look', 14]],
      victim: [[40, 'fatalFear', 10], [48, 'fatalFlinch', 6], [84, 'fatalFear', 14], [198, 'fatalWatch', 16], [250, 'fatalFear', 10], [294, 'fatalBrace', 10]],
      clip: [
        [0, { rootPos: [0, -0.02, 0], rootRot: [0, 0, 0], spine: [0, 0, 0], neck: [0.06, 0, 0], handL: [0.24, -0.86, 0.08], handR: [0.24, -0.86, 0.08], aimL: 1, aimR: 1, fistL: 0.45, fistR: 0.45,
          twistL: 0, twistR: 0, wristL: [0, 0], wristR: [0, 0], poleL: [0.3, -1, -0.3], poleR: [0.3, -1, -0.3], clavL: [0, 0], clavR: [0, 0],
          footL: [0.15, 0.071, 0.06], footR: [0.15, 0.071, -0.06], footRotL: [0, 0.15, 0], footRotR: [0, 0.25, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], toeL: 0, toeR: 0,
          jaw: 0, hgL: 0, hgR: 0, hgPosL: [0.14, 0, 0.1], hgPosR: [0.14, 0, 0.1], ptL: 0, ptR: 0, thL: 0, thR: 0 }],
        // his neck rolled, the shoulders up
        [12, { neck: [0.06, 0.1, 0.3], clavL: [0.18, 0], clavR: [0.18, 0] }, 'inout'],
        [20, { neck: [0.2, 0, 0] }, 'inout'],
        [28, { neck: [0.06, -0.1, -0.3], clavL: [0, 0], clavR: [0, 0] }, 'inout'],
        // a whistle through two fingers of his right hand
        [34, { neck: [0, 0, 0], hgR: 1, hgPosR: [0.03, -0.1, 0.17], ptR: 1, fistR: 0.75, twistR: -0.6, wristR: [-0.3, 0], poleR: [0.4, -1, 0.2] }, 'inout'],
        [38, { hgPosR: [0.025, -0.085, 0.155], neck: [-0.08, 0, 0] }, 'out'],
        [50, { neck: [-0.06, 0, 0] }, 'inout'],
        [58, { hgR: 0, ptR: 0, fistR: 0.45, twistR: 0, wristR: [0, 0], poleR: [0.3, -1, -0.3], neck: [0.08, 0.12, 0] }, 'inout'],
        // the bike rolls up on his right: he turns to it and stops it by the saddle (fatal.grip 94-104)
        [84, { rootRot: [0, -0.25, 0], spine: [0.05, -0.15, 0], neck: [0.15, -0.35, 0], handR: [0.4, -0.5, 0.2] }, 'inout'],
        [96, { spine: [0.08, -0.25, 0.12] }, 'inout'],
        [104, {}, 'lin'],
        // the helmet from behind his back...
        [112, { rootRot: [0, 0, 0], spine: [-0.06, 0, 0], neck: [0.08, 0, 0], handL: [0.18, -0.62, -0.38], handR: [0.18, -0.62, -0.38], aimL: 0, aimR: 0, poleL: [0.5, -0.4, 0.6], poleR: [0.5, -0.4, 0.6],
          fistL: 0.3, fistR: 0.3, twistL: 0.6, twistR: 0.6 }, 'inout'],
        [117, {}, 'lin'],
        // ... up over his head...
        [126, { hgL: 1, hgR: 1, hgPosL: [0.14, 0.27, 0.04], hgPosR: [0.14, 0.27, 0.04], twistL: 1.3, twistR: 1.3, wristL: [0.3, 0], wristR: [0.3, 0], fistL: 0.25, fistR: 0.25,
          poleL: [0.8, 0.2, -0.2], poleR: [0.8, 0.2, -0.2], neck: [0, 0, 0] }, 'inout'],
        // ... and down onto it
        [134, { hgPosL: [0.135, 0.07, 0.03], hgPosR: [0.135, 0.07, 0.03], neck: [0.12, 0, 0] }, 'inout'],
        // the straps pulled tight either side of his jaw (the buckle's click at 146; hands kept beside the face, not
        // in front of it, as the rig keeps them)
        [142, { hgPosL: [0.105, -0.05, -0.045], hgPosR: [0.105, -0.05, -0.045], twistL: 0.9, twistR: 0.9, wristL: [0, 0], wristR: [0, 0], fistL: 0.55, fistR: 0.55,
          poleL: [1, -0.5, 0], poleR: [1, -0.5, 0], neck: [-0.1, 0, 0] }, 'inout'],
        [146, { hgPosL: [0.1, -0.085, -0.045], hgPosR: [0.1, -0.085, -0.045], fistL: 0.7, fistR: 0.7, neck: [-0.06, 0, 0] }, 'snap'],
        // two knocks on it
        [152, { hgL: 0, handL: [0.24, -0.86, 0.08], aimL: 1, fistL: 0.45, twistL: 0, wristL: [0, 0], poleL: [0.3, -1, -0.3], hgPosR: [0.06, 0.15, 0.12], fistR: 1, twistR: -0.4, neck: [0.05, 0, 0] }, 'inout'],
        [155, { hgPosR: [0.05, 0.125, 0.105] }, 'snap'],
        [158, { hgPosR: [0.06, 0.15, 0.12] }, 'out'],
        [161, { hgPosR: [0.05, 0.125, 0.105] }, 'snap'],
        // and a finger at the loser: you
        [168, { hgR: 0, handR: [0.12, 0.06, 0.95], aimR: 1, ptR: 1, fistR: 0.9, twistR: -0.2, wristR: [0, 0], poleR: [0.3, -1, -0.2], neck: [0.12, 0, 0], spine: [0.05, 0, 0] }, 'inout'],
        [178, {}, 'lin'],
      ],
      clips: {
        // a hop onto the bike, turning round in the air (Match.fatalRide carries him onto it, fatal.ride yaw turns him)
        hop: [[
          [0, { rootPos: [0, -0.15, 0.02], rootRot: [0.15, 0, 0], spine: [0.2, 0, 0], neck: [-0.1, 0, 0], handL: [0.3, -0.35, 0.5], handR: [0.3, -0.35, 0.5], aimL: 1, aimR: 1, ptR: 0, fistR: 0.6,
            footL: [0.15, 0.071, 0.06], footR: [0.15, 0.071, -0.06], kneeL: [0.15, 0, 1], kneeR: [0.15, 0, 1] }],
          [6, { rootPos: [0, 0.22, -0.06], rootRot: [0.3, 0, 0], footL: [0.15, 0.42, 0.05], footR: [0.3, 0.6, -0.12], kneeR: [0.6, 0.3, 1] }, 'out'],
          [11, { rootPos: [0, 0.16, -0.12], rootRot: [0.45, 0, 0], spine: [0.35, 0, 0], footL: [0.14, 0.4, 0.12], footR: [0.13, 0.45, 0.06], kneeR: [0.15, 0.1, 1] }, 'inout'],
          [16, { ...RIDE, ...pedalPose(0) }, 'in'],
        ]],
        ride: [pedalLoop(RIDE, 24), { loop: true }],
        // easing off before the turn: the pedals level, his weight back
        brake: [[[0, { ...RIDE, ...pedalPose(0), rootPos: [0, 0.1, -0.18], rootRot: [0.55, 0, 0], spine: [0.4, 0, 0], neck: [-0.8, 0, 0] }]]],
        // round in a skid, his right foot out on the ground on the inside of the turn
        skid: [[
          [0, { ...RIDE, ...pedalPose(0), rootPos: [-0.04, 0.08, -0.16], rootRot: [0.55, -0.15, 0.1], spine: [0.42, -0.12, 0], neck: [-0.8, -0.3, 0] }],
          [5, { footR: [0.42, 0.2, 0.3], footRotR: [-0.2, 0.3, 0], kneeR: [0.8, 0.3, 1] }, 'out'],
          [15, { footR: [0.4, 0.2, 0.25] }, 'inout'],
        ]],
        // stopped, facing him, the left foot down; standing up on the pedals as the bell rings; off
        set: [[
          [0, { ...SPRINT, ...pedalPose(-0.6), rootPos: [0, 0.08, -0.04], rootRot: [0.62, 0, 0], spine: [0.36, 0, 0], neck: [-0.85, 0, 0], jaw: 0, footL: [0.32, 0.11, 0.0], footRotL: [0, 0.2, 0] }],
          [10, {}, 'lin'],
          [14, { ...SPRINT, ...pedalPose(-0.6), jaw: 0.4 }, 'inout'],
        ]],
        sprint: [pedalLoop(SPRINT, 20, (k) => ({ rootPos: [+(0.035 * Math.sin(k * Math.PI * 2)).toFixed(3), 0.17, 0.02], rootRot: [0.78, 0, +(0.08 * Math.sin(k * Math.PI * 2)).toFixed(3)], spine: [0.25, 0, +(-0.06 * Math.sin(k * Math.PI * 2)).toFixed(3)] })), { loop: true }],
        // through: freewheeling out of the saddle
        coast: [[[0, { ...SPRINT, ...pedalPose(0), rootPos: [0, 0.15, -0.03], rootRot: [0.74, 0, 0], spine: [0.28, 0, 0], jaw: 0.5 }]]],
        // the skid to a stop: his weight back, the rear wheel locked and coming round, the left foot out as it ends
        skidstop: [[
          [0, { ...RIDE, ...pedalPose(0), rootPos: [0.03, 0.07, -0.18], rootRot: [0.52, 0.18, -0.08], spine: [0.42, 0.12, 0], neck: [-0.75, 0.3, 0], jaw: 0.2 }],
          [18, { footL: [0.4, 0.175, 0.3], footRotL: [-0.2, 0.3, 0], kneeL: [0.8, 0.3, 1] }, 'inout'],
          [30, { footL: [0.38, 0.12, 0.12], footRotL: [0, 0.3, 0] }, 'inout'],
        ]],
        // stopped: the left foot down, sitting up
        stop: [[[0, { ...RIDE, ...pedalPose(0.4), rootPos: [0, -0.02, -0.02], rootRot: [0.42, 0, 0], spine: [0.38, 0, 0], neck: [-0.5, 0, 0], footL: [0.36, 0.11, 0.1], footRotL: [0, 0.25, 0], kneeL: [0.3, 0, 1], jaw: 0 }]]],
        // a look back over his shoulder at what he has left behind; his line; a thumb up at it; back on the bars
        look: [[
          [0, { ...RIDE, ...pedalPose(0.4), rootPos: [0, -0.02, -0.02], rootRot: [0.38, 0.22, 0], spine: [0.3, 0.3, 0], neck: [-0.2, 0.8, 0], footL: [0.36, 0.11, 0.1], footRotL: [0, 0.25, 0], kneeL: [0.3, 0, 1], jaw: 0 }],
          [24, { handR: [-0.02, 0.06, 0.6], aimR: 1, fistR: 1, thR: 1, twistR: -0.5, poleR: [0.5, -1, -0.2] }, 'inout'],
          [30, { handR: [-0.03, 0.1, 0.62] }, 'out'],
          [64, { handR: [-0.02, 0.06, 0.6] }, 'sine'],
          [80, { thR: 0, fistR: 0.85, neck: [-0.45, 0.2, 0], spine: [0.36, 0.1, 0], rootRot: [0.42, 0.05, 0] }, 'inout'],
          [310, { neck: [-0.4, 0.25, 0] }, 'sine'],
        ]],
      },
    },
    title: 'El Toro', desc: 'Luchador de fuerza bruta. Lariats y suplex.',
    say: '¡Espectacular, vale!', sayAt: 78, sayLen: 107, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: '¡Esto va a ser espectacular, vale!', introLen: 132, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 196, walk: 1.15, weight: 1.35, power: 1.14, speed: 1.04 },
    hairSway: 0.7, // how far the hair swings with the head: curls of a medium length (js/anim/hairsway.js)
    aiMoves: ['1', '2', '1+2', 'f+2', 'df+1', 'd+3', 'df+2', '3', '2+4', 'd+4', 'b+2', 'f+3'], juggle: ['1', '2', 'f+2'],
    stance: { rootPos: [0, -0.1, -0.02], rootRot: [0.12, -0.3, 0], spine: [0.18, 0.1, 0], hgPosL: [0.15, -0.26, 0.4], hgPosR: [0.13, -0.26, 0.3], fistL: 0.92, fistR: 0.92,
      footL: [0.12, 0.071, 0.22], footR: [0.26, 0.071, -0.2] },
    bob: 0.012,
    throw2: 'suplex',
    commands: [['1+2', 'lariat'], ['f+1+2', 'axe'], ['f+2', 'axe'], ['b+2', 'chop'], ['f+3', 'bigBoot']],
    stringFinish: 'bigBoot', // (the end of his own 1, 2, 3: js/fight/moves.js straight's cancel)
    // the phone's ★ buttons (js/ui/touch.js): the special that ★ PUÑO / ★ PATADA throws with the stick at rest (n),
    // forward (f), back (b) or down (d), as the command it stands for
    touchSP: { P: { n: '1+2', f: 'f+2', b: 'b+2', d: 'df+2' }, K: { n: 'f+3', f: 'uf+4', b: '4', d: 'd+4' } },
    moves: (C) => ({
      lariat: {
        name: 'Lariat', total: 52, clip: C([
          [0, {}],
          [10, { rootPos: [0, -0.1, -0.02], rootRot: [0.1, -1.0, 0], spine: [0.1, -0.4, 0], handR: [0.9, 0.2, -0.2], aimR: 1, twistR: 0.3, fistR: 0.8 }, 'inout'],
          [20, { rootPos: [0, -0.1, 0.2], rootRot: [0.15, 0.6, 0], spine: [0.1, 0.5, 0], handR: [0.25, 0.25, 0.95], aimR: 1, clavR: [0.1, 0.4], footL: [0.1, 0.071, 0.45] }, 'drive'],
          [24, {}, 'lin'],
          [52, null, 'inout'],
        ]),
        hit: { f: [19, 23], limb: 'forearmR', r: 0.16, dmg: 26, lvl: 'high', react: 'hitHigh', swing: 1, blk: -15, kd: true, push: 0.8 },
        armor: [7, 16], // power crush
        advance: [[0, 0], [10, 0.1], [20, 0.5], [52, 0.5]], sfx: 'heavy',
      },
      axe: {
        name: 'Double axe handle', total: 52, clip: C([
          [0, {}],
          [12, { rootPos: [0, 0.02, -0.05], rootRot: [-0.3, -0.2, 0], spine: [-0.3, 0.1, 0], handL: [0.05, 0.95, 0.15], handR: [0.05, 0.95, 0.15], aimL: 1, aimR: 1, fistL: 1, fistR: 1 }, 'inout'],
          [21, { rootPos: [0, -0.27, 0.12], rootRot: [0.3, -0.2, 0], spine: [0.34, 0.1, 0], handL: [-0.05, 0.0, 0.86], handR: [-0.05, 0.0, 0.86], twistL: -0.19, twistR: -0.19, footL: [0.12, 0.071, 0.36], neck: [-0.12, 0, 0], kneeL: [0.3, 0, 1], kneeR: [0.3, 0, 1] }, 'drive'],
          [25, {}, 'lin'],
          [34, { rootPos: [0, -0.17, 0.05], rootRot: [0.16, -0.3, 0], spine: [0.2, 0.1, 0], handL: [0.0, 0.1, 0.55], handR: [-0.05, 0.12, 0.5], aimL: 0.5, aimR: 0.5, neck: [0.05, 0.05, 0] }, 'inout'], // (heavy: it comes back up slowly, not snapped off the hold)
          [52, null, 'inout'],
        ]),
        hit: { f: [21, 24], limb: 'handR', r: 0.15, dmg: 21, lvl: 'mid', react: 'hitMid', blk: -15, kd: true, push: 0.4 },
        armor: [8, 18], // power crush
        advance: [[0, 0], [21, 0.3], [52, 0.3]], sfx: 'heavy',
      },
      suplex: {
        name: 'Suplex', total: 36, throw: true, clip: C([
          [0, {}],
          [12, { handL: [0.3, 0.05, 0.9], handR: [0.3, 0.05, 0.9], aimL: 1, aimR: 1, fistL: 0.2, fistR: 0.2, rootPos: [0, -0.12, 0.1], rootRot: [0.15, 0, 0] }, 'snap'],
          [36, {}, 'inout'],
        ]),
        hit: { f: [11, 13], limb: 'handL', r: 0.18, dmg: 0, lvl: 'throw', blk: -8 },
        advance: [[0, 0], [12, 0.12], [36, 0.12]], sfx: 'grab', throwDmg: 42, throwType: 'suplex',
      },
      // CHOP: the wrestler's knife-edge chop: the open right hand wound up high and back, the body turned away, then
      // swung flat across into the chest
      chop: {
        name: 'Chop', total: 36, clip: C([
          [0, {}],
          [4, { rootPos: [0, -0.09, -0.02], rootRot: [0.03, -0.7, 0], spine: [0.05, -0.05, 0], handR: [0.46, 0.18, 0.08], aimR: 0, fistR: 0.4, twistR: -0.1, poleR: [0.3, -1, -0.4] }, 'inout'],
          [8, { rootPos: [0, -0.1, -0.04], rootRot: [0.0, -0.95, 0], spine: [0.0, -0.22, 0], neck: [0.12, 0.6, 0],
            handR: [0.62, 0.52, -0.3], fistR: 0, twistR: 0.3, poleR: [0.3, -1, -0.6], handL: [0.05, 0.1, 0.55], aimL: 0 }, 'inout'],
          [13, { rootPos: [0, -0.11, 0.08], rootRot: [0.12, 0.1, 0], spine: [0.1, 0.42, 0.05], neck: [0.1, -0.25, 0],
            handR: [-0.08, 0.0, 0.92], aimR: 1, twistR: 0.9, fistR: 0, clavR: [0.05, 0.4], handL: [-0.2, 0.12, 0.35] }, 'drive'],
          [16, { handR: [-0.32, -0.04, 0.78], spine: [0.1, 0.5, 0.05] }, 'lin'],
          [26, { rootPos: [0, -0.09, 0.03], rootRot: [0.06, -0.4, 0], spine: [0.1, 0.12, 0], neck: [0.16, 0.2, 0],
            handR: GUARD_R, aimR: 0, fistR: 1, twistR: -0.55, clavR: [-0.05, 0.12], handL: GUARD_L }, 'inout'],
          [36, null, 'inout'],
        ]),
        hit: { f: [13, 15], limb: 'handR', r: 0.13, dmg: 14, lvl: 'mid', react: 'hitMid', swing: 1, blk: -6, hitAdv: 4, push: 0.5 },
        advance: [[0, 0], [13, 0.12], [36, 0.1]], sfx: 'slap',
      },
      // BIG BOOT: the lead leg up straight and the sole of the boot into his upper chest and chin, leaning back behind
      // it (any higher and the hip goes past its limit): a knockdown. The end of his 1, 2, 3
      bigBoot: {
        name: 'Big boot', total: 38, clip: C([
          [0, {}],
          [6, { footL: [0.06, 0.42, 0.3], kneeL: [0.1, 0.7, 1], footRotL: [-0.4, -0.3, 0], rootPos: [0, -0.06, -0.06], rootRot: [-0.1, -0.4, 0], spine: [0.08, 0.1, 0] }, 'inout'],
          [12, { footL: [0.03, 1.06, 0.92], kneeL: [0.1, 0.9, 0.4], footRotL: [-1.45, -0.2, 0], toeL: -0.2, rootRot: [-0.5, -0.38, 0], spine: [0.18, 0.1, 0],
            rootPos: [0, -0.04, 0.0], neck: [0.46, 0.15, 0], handL: [0.28, -0.12, 0.35], aimL: 0 }, 'drive'],
          [15, {}, 'lin'],
          [25, { footL: [0.05, 0.4, 0.42], kneeL: [0.1, 0.5, 1], footRotL: [0, -0.35, 0], toeL: 0, rootRot: [0.0, -0.45, 0], rootPos: [0, -0.07, 0.02], spine: [0.1, 0.12, 0], neck: [0.16, 0.2, 0], handL: GUARD_L }, 'inout'],
          [38, null, 'inout'],
        ]),
        hit: { f: [12, 15], limb: 'footL', r: 0.14, dmg: 18, lvl: 'high', blk: -12, kd: true, push: 0.8 },
        advance: [[0, 0], [12, 0.18], [38, 0.16]], sfx: 'kick',
      },
    }),
    // "¡espectacular, vale!": a wide stance, chest out, both thumbs up at the loser and pumped on each word, a big nod
    // on "vale"
    win: [
      [0, {}],
      [22, { rootPos: [0, -0.03, 0], rootRot: [0.02, 0, 0], spine: [-0.06, 0, 0], neck: [-0.05, 0, 0],
        handL: [0.35, -0.35, 0.4], handR: [0.35, -0.35, 0.4], aimL: 1, aimR: 1, fistL: 1, fistR: 1, twistL: 0, twistR: 0,
        footL: [0.22, 0.071, 0.05], footR: [0.22, 0.071, -0.05], footRotL: [0, 0.3, 0], footRotR: [0, 0.3, 0], kneeL: [0.2, 0, 1], kneeR: [0.2, 0, 1] }, 'out'],
      [40, { handL: [0.3, -0.12, 0.62], handR: [0.3, -0.12, 0.62], thL: 1, thR: 1, clavL: [0.1, 0], clavR: [0.1, 0] }, 'back'],
      [60, { neck: [0.12, 0, 0] }, 'sine'],
      [74, { neck: [-0.08, 0, 0] }, 'sine'],
      [88, { handL: [0.3, -0.05, 0.64], handR: [0.3, -0.05, 0.64] }, 'sine'],
      [100, { handL: [0.3, -0.14, 0.62], handR: [0.3, -0.14, 0.62] }, 'sine'],
      [114, { handL: [0.3, -0.04, 0.64], handR: [0.3, -0.04, 0.64], neck: [0.2, 0, 0] }, 'sine'],
      [130, { handL: [0.3, -0.12, 0.62], handR: [0.3, -0.12, 0.62], neck: [-0.06, 0, 0] }, 'sine'],
      [196, { neck: [-0.08, 0.06, 0] }, 'sine'],
    ],
  },
  // Orión: not one of the friends but an android (an original design), silver plates over a dark synthetic body, red
  // eyes, "RyC" on his chest (tools/pipeline/robotgen.py). A powerhouse like Zapponi, the same moves, but a machine's
  // way about him: stiff, still, exact; his voice robotic (js/audio/audio.js FIGHTER_VOICE, tools/quotes_tts.py)
  orion: {
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0, 0], spine: [0, 0, 0], neck: [0.05, 0, 0], handL: [0.22, -0.88, 0.06], handR: [0.22, -0.88, 0.06], aimL: 1, aimR: 1, fistL: 0.6, fistR: 0.6,
        footL: [0.15, 0.071, 0.02], footR: [0.15, 0.071, -0.02], footRotL: [0, 0.1, 0], footRotR: [0, 0.1, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      // a scan: the head turned to one side, held, to the other, held, back (stepped, like a machine's)
      [10, { neck: [0.05, 0.55, 0] }, 'inout'],
      [22, { neck: [0.05, 0.55, 0] }, 'lin'],
      [32, { neck: [0.05, -0.55, 0] }, 'inout'],
      [44, { neck: [0.05, -0.55, 0] }, 'lin'],
      [52, { neck: [0.12, 0, 0] }, 'inout'],
      // the fists up, both at once, exact
      [66, { handL: [-0.1, 0.05, 0.52], handR: [-0.1, 0.05, 0.52], fistL: 1, fistR: 1, neck: [0.1, 0, 0] }, 'inout'],
      [70, { handL: [-0.09, 0.06, 0.5], handR: [-0.09, 0.06, 0.5] }, 'snap'],
      [98, null, 'inout'],
    ],
    title: 'Los TAMPER son lo mío', desc: 'Androide de combate. Golpes hidráulicos y llaves mecánicas.',
    say: 'Clave incorrecta.', sayAt: 30, sayLen: 64, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Necesito la clave.', introLen: 70, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 204, walk: 1.06, weight: 1.45, power: 1.16, speed: 0.98 },
    hairSway: 0, // (no hair: a chrome head)
    aiMoves: ['1', '2', '1+2', 'f+2', 'df+1', 'd+3', 'df+2', '3', '2+4', 'd+4', 'b+2', 'f+3'], juggle: ['1', '2', 'f+2'],
    stance: { rootPos: [0, -0.1, -0.02], rootRot: [0.12, -0.3, 0], spine: [0.18, 0.1, 0], hgPosL: [0.15, -0.26, 0.4], hgPosR: [0.13, -0.26, 0.3], fistL: 0.92, fistR: 0.92,
      footL: [0.12, 0.071, 0.22], footR: [0.26, 0.071, -0.2] },
    bob: 0.004, // (a machine: barely moves at rest)
    throw2: 'suplex',
    commands: [['1+2', 'lariat'], ['f+1+2', 'axe'], ['f+2', 'axe'], ['b+2', 'piston'], ['f+3', 'sideKick']],
    stringFinish: 'sideKick', // (the end of his own 1, 2, 3: js/fight/moves.js straight's cancel)
    // the phone's ★ buttons (js/ui/touch.js): the special that ★ PUÑO / ★ PATADA throws with the stick at rest (n),
    // forward (f), back (b) or down (d), as the command it stands for
    touchSP: { P: { n: '1+2', f: 'f+2', b: 'b+2', d: 'df+2' }, K: { n: 'f+3', f: 'uf+4', b: '4', d: 'd+4' } },
    moves: (C) => ({
      lariat: {
        name: 'Lariat', total: 52, clip: C([
          [0, {}],
          [10, { rootPos: [0, -0.1, -0.02], rootRot: [0.1, -1.0, 0], spine: [0.1, -0.4, 0], handR: [0.9, 0.2, -0.2], aimR: 1, twistR: 0.3, fistR: 0.8 }, 'inout'],
          [20, { rootPos: [0, -0.1, 0.2], rootRot: [0.15, 0.6, 0], spine: [0.1, 0.5, 0], handR: [0.25, 0.25, 0.95], aimR: 1, clavR: [0.1, 0.4], footL: [0.1, 0.071, 0.45] }, 'drive'],
          [24, {}, 'lin'],
          [52, null, 'inout'],
        ]),
        hit: { f: [19, 23], limb: 'forearmR', r: 0.16, dmg: 26, lvl: 'high', react: 'hitHigh', swing: 1, blk: -15, kd: true, push: 0.8 },
        armor: [7, 16], // power crush
        advance: [[0, 0], [10, 0.1], [20, 0.5], [52, 0.5]], sfx: 'heavy',
      },
      axe: {
        name: 'Double axe handle', total: 52, clip: C([
          [0, {}],
          [12, { rootPos: [0, 0.02, -0.05], rootRot: [-0.3, -0.2, 0], spine: [-0.3, 0.1, 0], handL: [0.05, 0.95, 0.15], handR: [0.05, 0.95, 0.15], aimL: 1, aimR: 1, fistL: 1, fistR: 1 }, 'inout'],
          [21, { rootPos: [0, -0.27, 0.12], rootRot: [0.3, -0.2, 0], spine: [0.34, 0.1, 0], handL: [-0.05, 0.0, 0.86], handR: [-0.05, 0.0, 0.86], twistL: -0.19, twistR: -0.19, footL: [0.12, 0.071, 0.36], neck: [-0.12, 0, 0], kneeL: [0.3, 0, 1], kneeR: [0.3, 0, 1] }, 'drive'],
          [25, {}, 'lin'],
          [34, { rootPos: [0, -0.17, 0.05], rootRot: [0.16, -0.3, 0], spine: [0.2, 0.1, 0], handL: [0.0, 0.1, 0.55], handR: [-0.05, 0.12, 0.5], aimL: 0.5, aimR: 0.5, neck: [0.05, 0.05, 0] }, 'inout'], // (heavy: it comes back up slowly, not snapped off the hold)
          [52, null, 'inout'],
        ]),
        hit: { f: [21, 24], limb: 'handR', r: 0.15, dmg: 21, lvl: 'mid', react: 'hitMid', blk: -15, kd: true, push: 0.4 },
        armor: [8, 18], // power crush
        advance: [[0, 0], [21, 0.3], [52, 0.3]], sfx: 'heavy',
      },
      suplex: {
        name: 'Suplex', total: 36, throw: true, clip: C([
          [0, {}],
          [12, { handL: [0.3, 0.05, 0.9], handR: [0.3, 0.05, 0.9], aimL: 1, aimR: 1, fistL: 0.2, fistR: 0.2, rootPos: [0, -0.12, 0.1], rootRot: [0.15, 0, 0] }, 'snap'],
          [36, {}, 'inout'],
        ]),
        hit: { f: [11, 13], limb: 'handL', r: 0.18, dmg: 0, lvl: 'throw', blk: -8 },
        advance: [[0, 0], [12, 0.12], [36, 0.12]], sfx: 'grab', throwDmg: 42, throwType: 'suplex',
      },
      // PALMA HIDRÁULICA: both hands drawn back to the chest like pistons loading, then driven out together into his
      // chest, held a beat at full stroke and drawn back on a straight line: a huge push (near a wall, it pins him)
      piston: {
        name: 'Palma hidráulica', total: 34, clip: C([
          [0, {}],
          [8, { rootPos: [0, -0.12, -0.06], rootRot: [0.05, -0.26, 0], spine: [0.08, 0.06, 0], neck: [0.12, 0.12, 0],
            hgL: 1, hgPosL: [0.1, -0.32, 0.14], hgR: 1, hgPosR: [0.1, -0.32, 0.1], fistL: 0, fistR: 0, twistL: 0.75, twistR: 0.75, wristL: [0.8, 0], wristR: [0.8, 0] }, 'inout'],
          [12, { rootPos: [0, -0.1, 0.12], rootRot: [0.12, -0.16, 0], spine: [0.15, 0.02, 0], neck: [0.05, 0.05, 0],
            hgPosL: [0.07, -0.34, 0.64], hgPosR: [0.07, -0.34, 0.62], clavL: [0.05, 0.42], clavR: [0.05, 0.42] }, 'drive'],
          [16, {}, 'lin'],
          [24, { rootPos: [0, -0.1, 0.02], rootRot: [0.06, -0.36, 0], spine: [0.1, 0.1, 0], hgPosL: [0.08, -0.2, 0.3], hgPosR: [0.1, -0.2, 0.16], clavL: [0, 0.1], clavR: [0, 0.1], wristL: [0.12, 0], wristR: [0.12, 0] }, 'lin'],
          [34, null, 'inout'],
        ]),
        hit: { f: [12, 15], limb: 'handL', r: 0.16, dmg: 15, lvl: 'mid', blk: -7, hitAdv: 2, push: 1.2 },
        advance: [[0, 0], [8, -0.03], [12, 0.18], [34, 0.16]], sfx: 'heavy',
      },
      // PATADA HIDRÁULICA: a side kick: the hips turned side-on, the lead knee chambered across, then the heel driven
      // out at his chest on a straight line, the body leant away behind it, held, and drawn back the same way. The
      // end of his 1, 2, 3
      sideKick: {
        name: 'Patada hidráulica', total: 40, clip: C([
          [0, {}],
          [7, { rootPos: [0, -0.08, -0.04], rootRot: [0.0, -1.15, 0.08], spine: [0.04, 0.3, 0], neck: [0.12, 0.85, 0],
            footL: [0.0, 0.5, 0.16], kneeL: [-0.3, 0.6, 0.7], footRotL: [0, -1.3, -0.3], footRotR: [0.2, -0.8, 0] }, 'inout'],
          [13, { rootPos: [0, -0.06, -0.02], rootRot: [-0.08, -1.42, 0.42], spine: [0.06, 0.34, -0.22], neck: [0.12, 1.0, -0.2],
            footL: [-0.02, 0.92, 0.94], kneeL: [0, 1, 0.3], footRotL: [-0.2, -1.45, -1.1], footRotR: [0.25, -1.0, 0],
            handR: [0.28, -0.6, -0.3], poleR: [0.2, 0, -1] }, 'drive'],
          [17, {}, 'lin'],
          [25, { rootPos: [0, -0.08, -0.04], rootRot: [0.0, -1.1, 0.08], spine: [0.04, 0.28, 0], neck: [0.12, 0.8, 0],
            footL: [0.0, 0.48, 0.2], kneeL: [-0.3, 0.6, 0.7], footRotL: [0, -1.3, -0.3], footRotR: [0.15, -0.7, 0], handR: GUARD_R, poleR: [0.25, -1, -0.25] }, 'lin'],
          [40, null, 'inout'],
        ]),
        hit: { f: [13, 16], limb: 'footL', r: 0.14, dmg: 16, lvl: 'mid', react: 'hitMid', blk: -9, hitAdv: 2, push: 1.0 },
        advance: [[0, 0], [13, 0.12], [40, 0.1]], sfx: 'kick',
      },
    }),
    // PUÑETALITY (js/fight/fatality.js): he scans the loser with a red fan of light from his eyes, says "acceso
    // denegado, borrando usuario", plants his feet and charges his eyes; the beams strike the loser's chest and he
    // sweeps them up to the face and down the body: the loser jolts, the skin and clothes glow red-hot where they are,
    // the burn spreads from there, black, cracked with embers, and he catches fire. The beams go off; the loser burns,
    // flailing, falls to his knees, charred, and crumbles to a pile of glowing ash from the head down. Orión wags his
    // finger at the ashes: no, no. Frames: cut (the beams strike), beamOff, kneel, ash [from, to]; victim the loser's
    // clips; the rest as the others'
    fatal: {
      len: 640, cut: 172, beamOff: 300, ash: [436, 536], title: 476, dist: 2.4, slow: [170, 174, 188, 210, 0.3],
      say: 'Acceso denegado. Borrando usuario.', sayAt: 46, sayLen: 132,
      victim: [[44, 'fatalFear', 10], [172, 'fatalBeamHit', 2], [300, 'fatalBurning', 10], [392, 'fatalBurnKneel', 6]],
      clip: [
        // standing tall, square to him, the fists loose at his sides
        [0, { rootPos: [0, -0.02, 0], rootRot: [0, 0, 0], spine: [0, 0, 0], neck: [0.06, 0, 0],
          handL: [0.22, -0.88, 0.06], aimL: 1, fistL: 0.6, twistL: 0, handR: [0.22, -0.88, 0.06], aimR: 1, fistR: 0.6, twistR: 0,
          footL: [0.15, 0.071, 0.02], footR: [0.15, 0.071, -0.02], footRotL: [0, 0.1, 0], footRotR: [0, 0.1, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
        // the scan: the head stepped down him and back up, like a machine's (the red fan of light sweeps him)
        [11, { neck: [0.2, 0, 0] }, 'inout'],
        [20, { neck: [0.2, 0, 0] }, 'lin'],
        [28, { neck: [0.34, 0, 0] }, 'inout'],
        [36, { neck: [0.34, 0, 0] }, 'lin'],
        [44, { neck: [0.07, 0, 0] }, 'inout'],
        // "acceso denegado": the right forefinger out at him, the head a little on one side
        [58, { handR: [0.14, -0.05, 0.6], fistR: 1, ptR: 1, twistR: -1.2, wristR: [0.15, 0], poleR: [0.4, -1, -0.3], neck: [0.08, 0, 0.12] }, 'inout'],
        [100, { handR: [0.14, -0.03, 0.62], neck: [0.08, 0, 0.1] }, 'sine'],
        [118, { handR: [0.22, -0.88, 0.06], fistR: 0.6, ptR: 0, twistR: 0, wristR: [0, 0], poleR: [0.3, -1, -0.3], neck: [0.06, 0, 0] }, 'inout'],
        // the charge: feet planted wide, knees bent, the fists clenched and held out from his sides, the chin down
        [138, { rootPos: [0, -0.1, -0.02], rootRot: [0.04, 0, 0], spine: [0.04, 0, 0], neck: [0.22, 0, 0],
          handL: [0.36, -0.66, 0.1], handR: [0.36, -0.66, 0.1], fistL: 1, fistR: 1, poleL: [0.6, -0.8, -0.3], poleR: [0.6, -0.8, -0.3],
          footL: [0.24, 0.071, 0.12], footR: [0.24, 0.071, -0.16], footRotL: [0, 0.3, 0], footRotR: [0, 0.3, 0], kneeL: [0.25, 0, 1], kneeR: [0.25, 0, 1] }, 'inout'],
        // (the head drawn back as it builds...)
        [162, { rootPos: [0, -0.11, -0.05], spine: [-0.06, 0, 0], neck: [-0.05, 0, 0], handL: [0.4, -0.62, 0.06], handR: [0.4, -0.62, 0.06] }, 'in'],
        // ... and thrust forward as they fire, on his chest; held, the body braced against it
        [172, { rootPos: [0, -0.12, 0.03], spine: [0.1, 0, 0], neck: [0.17, 0, 0] }, 'snap'],
        [176, { rootPos: [0, -0.115, -0.01] }, 'out'],
        [200, { neck: [0.16, 0.03, 0] }, 'sine'],
        // up to the face...
        [226, { neck: [0.05, -0.04, 0] }, 'inout'],
        // ... down the body to the belly...
        [256, { neck: [0.27, 0.05, 0] }, 'inout'],
        // ... and back up to the chest, side to side
        [278, { neck: [0.15, -0.06, 0] }, 'inout'],
        [292, { neck: [0.16, 0.04, 0] }, 'sine'],
        // off: he straightens, the fists open a little; he watches him burn, the head tilted, curious
        [312, { rootPos: [0, -0.04, 0], rootRot: [0, 0, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.24, -0.86, 0.06], handR: [0.24, -0.86, 0.06], fistL: 0.6, fistR: 0.6,
          footL: [0.2, 0.071, 0.08], footR: [0.2, 0.071, -0.1], footRotL: [0, 0.2, 0], footRotR: [0, 0.2, 0], kneeL: [0.12, 0, 1], kneeR: [0.12, 0, 1] }, 'inout'],
        [346, { neck: [0.14, 0.05, 0.28] }, 'inout'],
        [380, { neck: [0.14, 0.05, 0.28] }, 'lin'],
        // he looks down at him on his knees
        [404, { neck: [0.3, 0, 0] }, 'inout'],
        [452, { neck: [0.38, 0, 0] }, 'sine'],
        // the ashes: the right forefinger out at them and wagged, no, no
        [486, { handR: [0.12, -0.1, 0.58], fistR: 1, ptR: 1, twistR: -1.2, wristR: [0.2, 0], poleR: [0.4, -1, -0.3], neck: [0.3, 0, 0.1] }, 'inout'],
        [494, { wristR: [0.2, 0.45] }, 'inout'],
        [502, { wristR: [0.2, -0.45] }, 'inout'],
        [510, { wristR: [0.2, 0.45] }, 'inout'],
        [518, { wristR: [0.2, -0.45] }, 'inout'],
        [526, { wristR: [0.2, 0], neck: [0.2, 0, 0] }, 'inout'],
        [552, { handR: [0.24, -0.86, 0.06], fistR: 0.6, ptR: 0, twistR: 0, wristR: [0, 0], poleR: [0.3, -1, -0.3], neck: [0.08, 0, 0] }, 'inout'],
        // a slow scan, done
        [572, { neck: [0.06, 0.5, 0] }, 'inout'],
        [592, { neck: [0.06, 0.5, 0] }, 'lin'],
        [612, { neck: [0.06, -0.3, 0] }, 'inout'],
        [640, { neck: [0.06, -0.3, 0] }, 'lin'],
      ],
    },
    // "clave incorrecta": square to the loser, the right forefinger out at him and wagged side to side, no, no, the
    // head a little on one side; the arm down, and a slow scan of the head, a machine done with the job
    win: [
      [0, {}],
      [18, { rootPos: [0, -0.02, 0], rootRot: [0, 0, 0], spine: [0, 0, 0], neck: [0.05, 0, 0],
        handL: [0.22, -0.88, 0.06], aimL: 1, fistL: 0.7, handR: [0.12, 0.02, 0.6], aimR: 1, fistR: 1, ptR: 1, twistR: -1.2, wristR: [0.2, 0], poleR: [0.4, -1, -0.3],
        footL: [0.16, 0.071, 0.02], footR: [0.16, 0.071, -0.02], footRotL: [0, 0.1, 0], footRotR: [0, 0.1, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }, 'inout'],
      [26, { wristR: [0.2, 0.45], neck: [0.05, 0, 0.12] }, 'inout'],
      [34, { wristR: [0.2, -0.45] }, 'inout'],
      [42, { wristR: [0.2, 0.45] }, 'inout'],
      [50, { wristR: [0.2, -0.45] }, 'inout'],
      [58, { wristR: [0.2, 0.45] }, 'inout'],
      [66, { wristR: [0.2, 0], neck: [0.05, 0, 0] }, 'inout'],
      [100, { handR: [0.22, -0.88, 0.06], fistR: 0.7, ptR: 0, twistR: 0, wristR: [0, 0], poleR: [0.3, -1, -0.3] }, 'inout'],
      [120, { neck: [0.05, 0.5, 0] }, 'inout'],
      [140, { neck: [0.05, 0.5, 0] }, 'lin'],
      [160, { neck: [0.05, -0.5, 0] }, 'inout'],
      [180, { neck: [0.05, -0.5, 0] }, 'lin'],
      [196, { neck: [0.1, 0, 0] }, 'inout'],
    ],
  },
  dani: {
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0.1, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.2, -0.88, 0.1], handR: [0.2, -0.88, 0.1], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, footL: [0.14, 0.071, 0.04], footR: [0.14, 0.071, -0.02], footRotL: [0, 0.15, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      // a friendly wave with the open right hand (elbow out and low, forearm upright) ...
      [18, { handR: [0.5, 0.42, 0.22], poleR: [1, -0.6, 0.1], twistR: 1.2, fistR: 0.05, neck: [0.05, -0.1, 0.08], jaw: 0.15, spine: [-0.03, 0, 0] }, 'inout'],
      [26, { handR: [0.36, 0.46, 0.24] }, 'sine'],
      [34, { handR: [0.52, 0.42, 0.22] }, 'sine'],
      [42, { handR: [0.36, 0.46, 0.24] }, 'sine'],
      // ... then the guard comes up and he shadow-boxes a quick double jab
      [56, { handR: [-0.08, 0.3, 0.44], poleR: [0.25, -1, -0.25], twistR: -1.25, fistR: 1, aimR: 0, handL: [0.02, 0.2, 0.62], aimL: 0, fistL: 1, jaw: 0, neck: [0.16, 0.2, 0],
        rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.12, 0.12, 0], footL: [0.05, 0.071, 0.24], footR: [0.2, 0.071, -0.2], footRotL: [0, -0.35, 0], footRotR: [0, 0.65, 0],
        kneeL: [0.15, 0, 1], kneeR: [0.5, 0, 1] }, 'inout'],
      [61, { handL: [0.02, 0.12, 0.92], aimL: 1, twistL: -1.6, rootRot: [0.1, -0.6, 0] }, 'snap'],
      [66, { handL: [0.02, 0.2, 0.62], aimL: 0, twistL: -1.05, rootRot: [0.06, -0.45, 0] }, 'ret'],
      [70, { handL: [0.02, 0.12, 0.92], aimL: 1, twistL: -1.6, rootRot: [0.1, -0.6, 0] }, 'snap'],
      [76, { handL: [0.02, 0.2, 0.62], aimL: 0, twistL: -1.05, rootRot: [0.06, -0.45, 0] }, 'ret'],
      [96, null, 'inout'],
    ],
    // PUÑETALITY (js/fight/fatality.js): tennis, his sport. He takes a racket from behind his back and a ball from his
    // pocket, steps up to the line side on, bounces the ball twice, tosses it up, arches into the trophy position,
    // drops the racket behind his back and serves flat at the loser: the ball sinks into his chest, he swells and bursts.
    // A twirl of the racket, "juego, set y partido". Frames: contact (the racket meets the ball), hit (the ball meets
    // the loser), burst (he bursts), still (from then on the fight no longer moves him); slow: windows of slow motion
    fatal: {
      len: 650, contact: 212, hit: 222, burst: 238, still: 238, title: 430, dist: 4.0,
      slow: [[204, 210, 244, 262, 0.2]],
      say: 'Juego, set y partido.', sayAt: 330, sayLen: 100,
      victim: [[60, 'fatalFear', 10], [222, 'fatalBallHit', 1]],
      clip: [
        // standing, the loser far off in front of him
        [0, { rootPos: [0, -0.02, 0], rootRot: [0, -0.1, 0], spine: [0, 0.05, 0], neck: [0.06, 0.08, 0], handR: [0.22, -0.86, 0.06], aimR: 1, handL: [0.22, -0.86, 0.06], aimL: 1, fistL: 0.35, fistR: 0.35, twistL: 0, twistR: 0,
          footL: [0.14, 0.071, 0.1], footR: [0.15, 0.071, -0.1], footRotL: [0, 0.1, 0], footRotR: [0, 0.25, 0], kneeL: [0.1, 0, 1], kneeR: [0.12, 0, 1] }],
        // the racket from behind his back (its grip found at 24)...
        [14, { handR: [0.00, -0.84, -0.45], aimR: 1, poleR: [0.6, -0.4, -0.7], fistR: 0.5 }, 'inout'],
        [24, { handR: [-0.09, -0.74, -0.53], aimR: 1, fistR: 0.8 }, 'inout'],
        // ... out in front; the left hand to his pocket for the ball
        [38, { handR: [0.10, -0.56, 0.60], aimR: 1, poleR: [0.4, -1, -0.2], handL: [0.06, -0.83, 0.15], aimL: 1, fistL: 0.5 }, 'inout'],
        [46, { handL: [-0.03, -1.00, 0.04], aimL: 1, fistL: 0.6 }, 'inout'],
        [56, { handL: [-0.23, -0.74, 0.56], aimL: 1, fistL: 0.55 }, 'inout'],
        // side on at the line: the left foot forward, the right behind along the line, his eyes on the loser
        [74, { rootPos: [0, -0.06, -0.04], rootRot: [0.04, -1.2, 0], spine: [0.1, 0.18, 0], neck: [0.14, 0.92, 0],
          handR: [0.16, -0.74, 0.44], aimR: 1, twistR: -1.6, wristR: [0.25, 0.025], handL: [-0.16, -0.69, 0.42], aimL: 1, footL: [0.04, 0.071, 0.26], footR: [0.12, 0.071, -0.26], footRotL: [0, -0.7, 0], footRotR: [0, 1.2, 0], kneeL: [0.12, 0, 1], kneeR: [0.2, 0, 1] }, 'inout'],
        // two bounces: the ball pushed down at 80 and 118, caught at the top at 116 and 154
        [78, { handL: [-0.14, -0.61, 0.42], aimL: 1 }, 'inout'], [81, { handL: [-0.14, -0.83, 0.42], aimL: 1 }, 'out'], [98, { handL: [-0.16, -0.69, 0.42], aimL: 1 }, 'inout'], [116, { handL: [-0.16, -0.69, 0.42], aimL: 1 }, 'inout'],
        [119, { handL: [-0.14, -0.83, 0.42], aimL: 1 }, 'out'], [136, { handL: [-0.16, -0.69, 0.42], aimL: 1 }, 'inout'], [154, { handL: [-0.16, -0.69, 0.42], aimL: 1 }, 'inout'],
        // ball and racket together in front, a breath, a look
        [164, { handR: [0.13, -0.64, 0.38], aimR: 1, twistR: 0.46, wristR: [-0.1, -0.175], handL: [-0.42, -0.53, 0.27], aimL: 1, neck: [0.12, 0.95, 0] }, 'inout'],
        // the toss: the left arm rises straight and lets the ball go at 172; the racket arm swings down and up behind;
        // the knees bend, the back arches: the trophy position
        [172, { handL: [-0.15, 0.94, 0.67], aimL: 1, handR: [0.24, -0.87, -0.04], aimR: 1, rootPos: [0, -0.1, -0.05], rootRot: [-0.04, -1.25, 0.06], spine: [-0.05, 0.12, 0.05], neck: [-0.15, 0.95, 0] }, 'inout'],
        [192, { handL: [-0.13, 0.90, 0.52], aimL: 1, handR: [0.15, 0.72, 0.01], aimR: 1, poleR: [0.7, 0.1, -0.7], twistR: -1.6, wristR: [0.8, -0.2], rootPos: [0, -0.17, -0.06], rootRot: [-0.14, -1.28, 0.12], spine: [-0.22, 0.05, 0.1], neck: [-0.42, 1.0, 0], kneeL: [0.2, 0, 1], kneeR: [0.25, 0, 1] }, 'inout'],
        // the racket drops behind his back as the legs drive up (the elbow rising, the racket's head falling past
        // level behind him to hang down his back)
        [198, { handR: [0.1, 0.5, -0.09], aimR: 1, poleR: [0.6, 0.6, -0.5], twistR: -1.6, wristR: [0.82, 0.35] }, 'inout'],
        [204, { handR: [0.1, 0.4, -0.12], aimR: 1, poleR: [0.65, 0.5, -0.55], twistR: -1.6, wristR: [0.85, 0.55], rootPos: [0, -0.1, 0.0], rootRot: [-0.06, -0.95, 0.06], spine: [-0.25, -0.1, 0], neck: [-0.5, 0.7, 0] }, 'inout'],
        // up and through: the contact at full stretch over his head, in front
        [212, { handR: [0.12, 0.93, 0.3], aimR: 1, poleR: [0.6, 0.3, 0.2], twistR: -0.54, wristR: [0.25, 0.575], handL: [-0.13, -0.26, -0.11], aimL: 1, rootPos: [0, 0.04, 0.12], rootRot: [0.1, -0.35, -0.1], spine: [0.05, -0.15, -0.12], neck: [-0.55, 0.3, 0], footR: [0.1, 0.13, -0.18], footRotR: [0.5, 1.0, 0], toeR: 0.6 }, 'snap'],
        // the follow-through across his body, landing on the left foot, the right leg kicking up behind
        [226, { handR: [-0.57, -0.50, -0.03], aimR: 1, poleR: [0.3, -1, 0.3], twistR: 1.38, wristR: [-0.8, -0.375], handL: [-0.29, -0.18, 0.33], aimL: 1, rootPos: [0, -0.1, 0.32], rootRot: [0.3, 0.35, 0], spine: [0.25, 0.2, 0], neck: [0.2, -0.2, 0],
          footL: [0.06, 0.071, 0.46], footRotL: [0, -0.2, 0], footR: [0.12, 0.38, -0.2], footRotR: [0.8, 0.3, 0], kneeR: [0.2, 1, 0.3], toeR: 0 }, 'out'],
        // he straightens and watches
        [252, { handR: [0.22, -0.78, 0.26], aimR: 1, poleR: [0.2, -1, -0.5], twistR: -1.36, wristR: [0.3, 0.275], handL: [0.21, -0.83, 0.15], aimL: 1, rootPos: [0, -0.04, 0.3], rootRot: [0.04, -0.1, 0], spine: [0.02, 0.05, 0], neck: [0.06, 0.08, 0],
          footL: [0.14, 0.071, 0.42], footR: [0.15, 0.071, 0.2], footRotL: [0, 0.1, 0], footRotR: [0, 0.25, 0], kneeR: [0.12, 0, 1] }, 'inout'],
        // a twirl of the racket in his hand
        [292, { handR: [-0.15, -0.42, 0.68], aimR: 1, poleR: [0.3, -1, -0.2], twistR: -0.98, wristR: [-0.8, -0.4] }, 'inout'],
        [298, { twistR: 0.4 }, 'inout'], [304, { twistR: -1.4 }, 'inout'], [310, { twistR: 0.4 }, 'inout'], [316, { twistR: -0.98 }, 'inout'],
        // onto his shoulder: "juego, set y partido"
        [328, { handR: [0.07, -0.03, 0.49], aimR: 1, poleR: [0.3, -1, -0.3], twistR: -0.54, wristR: [0.8, -0.4] }, 'inout'],
        [650, { neck: [0.04, 0.1, 0] }, 'sine'],
      ],
    },
    title: 'El Zorro Plateado', desc: 'Veterano fibroso de la vieja escuela. Esquivas, gancho al hígado y guantazos.',
    say: 'Más sabe el zorro por viejo que por zorro.', sayAt: 78, sayLen: 171, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Ponte los guantes, chaval.', introLen: 88, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 176, walk: 1.3, weight: 0.92, power: 1.0, speed: 1.1 },
    hairSway: 0, // how far the hair swings with the head: bald (js/anim/hairsway.js)
    aiMoves: ['1', '1', '2', 'b+1', '1+2', 'd+2', 'df+1', 'df+2', 'd+3', '3', '4', 'd+4', '1+3', 'f+2', 'b+2'], juggle: ['1', '1+2', 'b+1'],
    // old-school boxer: more upright and bladed, chin tucked, both fists high by the face
    // (the rear fist at the chin, not on the cheekbone: up there, as the head turned with a blow it covered his eyes)
    stance: { rootPos: [0, -0.07, -0.02], rootRot: [0.07, -0.5, 0], spine: [0.14, 0.12, 0], neck: [0.2, 0.22, 0], hgPosL: [0.07, -0.07, 0.26], hgPosR: [0.1, -0.15, 0.13] },
    bob: 0.026,
    commands: [['b+1', 'liverShot'], ['d+2', 'gazelle'], ['1+2', 'slap'], ['f+2', 'overhand'], ['b+2', 'bolo']],
    stringFinish: 'bolo', // (the end of his own 1, 2, 3: js/fight/moves.js straight's cancel)
    // the phone's ★ buttons (js/ui/touch.js): the special that ★ PUÑO / ★ PATADA throws with the stick at rest (n),
    // forward (f), back (b) or down (d), as the command it stands for
    touchSP: { P: { n: '1+2', f: 'f+2', b: 'b+1', d: 'd+2' }, K: { n: '4', f: 'uf+4', b: '3', d: 'd+4' } },
    moves: (C) => ({
      // lead hook to the liver: the knees dip and the weight shifts onto the lead leg while the elbow opens out to the
      // side, then the hips and shoulders snap round and the bent arm hooks the fist in under the opponent's ribs;
      // the rear fist stays on the chin
      liverShot: {
        name: 'Liver hook', total: 36, clip: C([
          [0, {}],
          [5, { rootPos: [0, -0.17, 0.0], rootRot: [0.22, -0.78, 0], spine: [0.26, -0.05, 0], neck: [0.2, 0.3, 0],
            handL: [0.2, -0.12, 0.42], aimL: 1, poleL: [1, -0.3, -0.4], twistL: -0.5, kneeL: [0.3, 0, 1], kneeR: [0.45, 0, 1] }, 'inout'],
          // (the torso dips to his left: the head slips outside the opponent's lead hand)
          [12, { rootPos: [0, -0.2, 0.03], rootRot: [0.24, -0.05, -0.04], spine: [0.26, 0.3, -0.26], neck: [0.1, -0.2, 0.08],
            handL: [-0.12, -0.32, 0.86], poleL: [1, -0.1, -0.2], twistL: -0.4, clavL: [0.05, 0.3], footRotL: [0, -0.1, 0], footRotR: [0.3, 0.85, 0], hgPosR: [0.11, -0.19, 0.16] }, 'drive'],
          [15, {}, 'lin'],
          [23, { rootPos: [0, -0.13, 0.03], rootRot: [0.15, -0.4, 0], spine: [0.18, 0.1, 0], neck: [0.16, 0.15, 0],
            handL: [0.04, 0.05, 0.6], poleL: [0.3, -1, -0.15], twistL: -0.9, clavL: [0, 0.12] }, 'inout'],
          [36, null, 'inout'],
        ]),
        hit: { f: [11, 14], limb: 'handL', r: 0.11, dmg: 15, lvl: 'mid', react: 'hitLiver', swing: -1, blk: -5, hitAdv: 14, push: 0.12, ch: { kd: true } },
        advance: [[0, 0], [12, 0.14], [36, 0.12]], sfx: 'mid',
      },
      // gazelle punch: from the crouch he springs forward off the rear foot, low under high attacks, and drives a
      // bent-arm uppercut up through the chin with the legs, then follows through upwards
      gazelle: {
        name: 'Gazelle punch', total: 46, crouchStart: true, clip: C([
          [0, { rootPos: [0, -0.28, -0.1], rootRot: [0.3, -0.6, 0], spine: [0.24, 0.1, 0], footL: [0.1, 0.071, 0.2], footR: [0.24, 0.071, -0.32], toeR: 0.9, footRotR: [0.55, 0.6, 0],
            kneeL: [0.12, 0, 1], kneeR: [0.2, -0.4, 1], handL: [-0.05, 0.22, 0.55], handR: [-0.2, 0.25, 0.38] }],
          [5, { rootPos: [0, -0.38, -0.06], rootRot: [0.34, -0.55, 0], spine: [0.22, 0.05, 0], kneeL: [0.25, 0, 1], handL: [0.0, 0.15, 0.5], aimL: 1, handR: [0.08, -0.32, 0.32], aimR: 1, twistR: -0.3 }, 'inout'],
          // (a weave to his left on the way in: the head passes outside the opponent's lead hand)
          [10, { rootPos: [0, -0.34, 0.02], rootRot: [0.28, -0.35, -0.04], spine: [0.18, 0.15, -0.26], neck: [0.2, 0.25, 0.08], footL: [0.06, 0.071, 0.46], footRotL: [0, -0.3, 0], handR: [0.02, -0.3, 0.42] }, 'out'],
          [15, { rootPos: [0, -0.07, 0.1], rootRot: [0.1, 0.25, 0], spine: [0.05, 0.45, -0.06], handR: [-0.12, 0.1, 0.72], poleR: [0.1, -1, 0.2], twistR: -1.1, clavR: [0.25, 0.45],
            footR: [0.18, 0.12, -0.12], toeR: 0.7, footRotR: [0.4, 0.3, 0], kneeL: [0.22, 0, 1], kneeR: [0.4, 0, 1], neck: [-0.1, -0.2, 0], handL: [0.0, 0.2, 0.45] }, 'snap'],
          // (the follow-through stays short and comes back down: a launched body swings its legs through here)
          [18, { handR: [-0.14, 0.32, 0.5], poleR: [0.1, -1, 0.3], rootRot: [-0.02, 0.22, 0], spine: [-0.04, 0.42, 0] }, 'out'],
          [28, { handR: [-0.12, 0.3, 0.46], poleR: [0.2, -1, -0.2], twistR: -0.7, clavR: [0.1, 0.2], rootPos: [0, -0.08, 0.05], rootRot: [0.05, -0.2, 0], spine: [0.08, 0.3, 0],
            footR: [0.2, 0.071, -0.2], toeR: 0.1, footRotR: [0.1, 0.5, 0], neck: [0.05, 0, 0], kneeL: [0.18, 0, 1], footL: [0.05, 0.071, 0.3] }, 'ret'],
          [46, null, 'inout'],
        ]),
        hit: { f: [14, 17], limb: 'handR', r: 0.11, dmg: 17, lvl: 'mid', react: 'air', blk: -14, launch: 6.0, push: 0.1 },
        advance: [[0, 0], [5, 0.0], [9, 0.1], [13, 0.28], [46, 0.3]], sfx: 'heavy', lowProfile: [1, 11],
      },
      // open-hand slap ("guantazo"): the right arm swings out wide at head height and whips across palm first (the
      // palm facing the way it sweeps, thumb up: it had landed palm down), the hips turn into it and the rear heel
      // lifts; the hand stays open
      slap: {
        name: 'Slap', total: 34, clip: C([
          [0, {}],
          [6, { rootPos: [0, -0.08, -0.02], rootRot: [0.06, -0.75, 0], spine: [0.1, -0.2, 0], neck: [0.16, 0.45, 0],
            handR: [0.5, 0.18, 0.18], aimR: 1, poleR: [0.6, -0.7, -0.6], twistR: -0.6, fistR: 0.05, clavR: [0.1, -0.1] }, 'inout'],
          [12, { rootPos: [0, -0.1, 0.07], rootRot: [0.12, 0.2, 0], spine: [0.1, 0.45, 0], neck: [0.05, -0.35, 0],
            handR: [-0.22, 0.14, 0.86], poleR: [0.8, -0.2, -0.4], twistR: -1.3, clavR: [0.05, 0.35],
            footR: [0.18, 0.1, -0.2], footRotR: [0.45, 0.2, 0], toeR: 0.6, handL: [-0.2, 0.2, 0.4] }, 'whip'],
          [15, {}, 'lin'],
          [24, { rootPos: [0, -0.09, 0.03], rootRot: [0.1, -0.15, 0], spine: [0.1, 0.3, 0], neck: [0.1, 0, 0],
            handR: [-0.1, 0.24, 0.52], poleR: [0.25, -1, -0.25], twistR: -0.8, fistR: 0.7, clavR: [0.0, 0.2], footRotR: [0.2, 0.4, 0], toeR: 0.3 }, 'ret'],
          [34, null, 'inout'],
        ]),
        hit: { f: [11, 13], limb: 'handR', r: 0.12, dmg: 13, lvl: 'high', react: 'hitHighSide', swing: 1, spin: 1, blk: -3, hitAdv: 10, push: 0.3, ch: { kd: true } },
        advance: [[0, 0], [12, 0.14], [34, 0.12]], sfx: 'slap',
      },
      // OVERHAND: a dip to his left, the right fist cocked by the ear, then looped over the top of the guard and down
      // onto the head, the thumb turned down, the body rolling through behind it
      overhand: {
        name: 'Overhand', total: 34, clip: C([
          [0, {}],
          [5, { rootPos: [0, -0.13, -0.03], rootRot: [0.12, -0.6, 0.12], spine: [0.12, -0.08, 0.1], neck: [0.1, 0.3, -0.08],
            handR: [0.12, 0.34, 0.28], aimR: 0, fistR: 1, twistR: 0.3 }, 'inout'],
          [9, { rootPos: [0, -0.12, 0.04], rootRot: [0.16, -0.25, 0.04], spine: [0.14, 0.15, 0], handR: [0.22, 0.42, 0.72], aimR: 1, twistR: 0.8 }, 'inout'],
          [12, { rootPos: [0, -0.15, 0.1], rootRot: [0.26, 0.16, -0.12], spine: [0.2, 0.4, -0.14], neck: [0.0, -0.28, 0],
            handR: [0.04, 0.16, 1.0], aimR: 1, twistR: 1.2, clavR: [0.1, 0.5], handL: [-0.2, 0.15, 0.35] }, 'drive'],
          [15, {}, 'lin'],
          [22, { rootPos: [0, -0.1, 0.04], rootRot: [0.1, -0.2, 0], spine: [0.1, 0.25, 0], neck: [0.12, 0.1, 0], handR: [-0.14, 0.2, 0.62], twistR: 0.15, clavR: [0.0, 0.25] }, 'ret'],
          [34, null, 'inout'],
        ]),
        hit: { f: [12, 14], limb: 'handR', r: 0.11, dmg: 17, lvl: 'high', react: 'hitHigh', swing: 1, blk: -9, hitAdv: 4, push: 0.35, ch: { kd: true } },
        advance: [[0, 0], [12, 0.16], [34, 0.14]], sfx: 'heavy',
      },
      // BOLO PUNCH: the old-school showman's wind-up: the right arm circled down and back like a bowler's, then
      // brought up from below into the body in a long shovel hook. The end of his 1, 2, 3
      bolo: {
        name: 'Bolo punch', total: 38, clip: C([
          [0, {}],
          [4, { rootPos: [0, -0.1, -0.03], rootRot: [0.05, -0.62, 0], spine: [0.1, -0.05, 0], handR: [0.3, 0.02, 0.22], aimR: 0, fistR: 1, twistR: -0.4 }, 'inout'],
          [8, { rootPos: [0, -0.12, -0.04], rootRot: [0.05, -0.78, 0], spine: [0.1, -0.2, 0], neck: [0.1, 0.48, 0],
            handR: [0.55, -0.18, -0.3], twistR: -0.2, poleR: [0.25, -1, -0.25] }, 'inout'],
          [12, { handR: [0.36, -0.55, 0.12], rootRot: [0.1, -0.5, 0], rootPos: [0, -0.16, 0.0] }, 'inout'],
          [16, { rootPos: [0, -0.18, 0.1], rootRot: [0.2, 0.1, 0], spine: [0.2, 0.4, 0], neck: [0.15, -0.2, 0],
            handR: [-0.05, -0.18, 0.9], aimR: 1, twistR: -0.6, clavR: [0.05, 0.4], handL: [-0.2, 0.15, 0.35] }, 'drive'],
          [19, {}, 'lin'],
          [24, { rootPos: [0, -0.13, 0.07], rootRot: [0.12, -0.15, 0], spine: [0.14, 0.25, 0], handR: [-0.1, 0.05, 0.64], aimR: 0, twistR: -0.2, clavR: [0.0, 0.25] }, 'ret'],
          [30, { rootPos: [0, -0.1, 0.04], rootRot: [0.08, -0.35, 0], spine: [0.1, 0.15, 0], neck: [0.14, 0.15, 0], handR: GUARD_R, twistR: -0.55, clavR: [-0.05, 0.12], handL: GUARD_L }, 'inout'],
          [38, null, 'inout'],
        ]),
        hit: { f: [16, 18], limb: 'handR', r: 0.11, dmg: 15, lvl: 'mid', blk: -10, hitAdv: 4, push: 0.4 },
        advance: [[0, 0], [16, 0.16], [38, 0.14]], sfx: 'heavy',
      },
    }),
    // "más sabe el zorro por viejo que por zorro": a finger tapping his temple, then both arms up in a V as if
    // crossing a finish line
    win: [
      [0, {}],
      [22, { rootPos: [0, 0, 0], rootRot: [0, 0.12, 0], spine: [-0.06, 0, 0], neck: [0, 0, 0],
        handL: [0.3, -0.62, 0.12], aimL: 1, fistL: 0.35, handR: [0.3, -0.45, 0.3], aimR: 1, fistR: 0.6,
        footL: [0.15, 0.071, 0.05], footR: [0.15, 0.071, -0.05], footRotL: [0, 0.2, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }, 'inout'],
      // (out to the side first: the finger comes to the temple from beside the head)
      [48, { hgR: 1, hgPosR: [0.24, -0.02, 0.12], poleR: [0.6, -1, 0.1], fistR: 1, ptR: 1, neck: [0, -0.08, 0.06] }, 'inout'],
      [62, { hgPosR: [0.13, -0.03, 0.08] }, 'inout'],
      [80, { hgPosR: [0.14, -0.02, 0.09] }, 'sine'],
      [92, { hgPosR: [0.13, -0.03, 0.08] }, 'sine'],
      [104, { hgPosR: [0.14, -0.02, 0.09] }, 'sine'],
      [116, { hgPosR: [0.13, -0.03, 0.08] }, 'sine'],
      [152, { hgPosR: [0.14, -0.03, 0.09], neck: [-0.04, -0.04, 0.04] }, 'sine'],
      [180, { handL: [0.45, 0.85, 0.12], handR: [0.45, 0.85, 0.12], aimL: 1, aimR: 1, fistL: 0.9, fistR: 0.9, ptR: 0, poleL: [1, 0, -0.3], poleR: [1, 0, -0.3],
        spine: [-0.12, 0, 0], neck: [-0.25, -0.1, 0] }, 'back'],
      [208, { handL: [0.42, 0.9, 0.15], handR: [0.48, 0.82, 0.1] }, 'sine'],
      [234, { handL: [0.45, 0.85, 0.12], handR: [0.45, 0.85, 0.12] }, 'sine'],
    ],
  },
  noemi: {
    // takes the call on her headset ("¿dígame?"), nods, rubs her palms (the defibrillator charging) and takes guard
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0.1, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.2, -0.88, 0.1], handR: [0.2, -0.88, 0.1], aimL: 1, aimR: 1, fistL: 0.2, fistR: 0.2, footL: [0.14, 0.071, 0.04], footR: [0.14, 0.071, -0.02], footRotL: [0, 0.15, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      // the right hand out to the side and up to the earpiece (out first: straight up passes through the face)
      [12, { handR: [0.42, -0.3, 0.2], aimR: 1, fistR: 0.3 }, 'out'],
      [20, { hgR: 1, hgPosR: [0.36, 0.04, 0.02], fistR: 0.32, handL: [0.22, -0.84, 0.12] }, 'inout'],
      // (the palm on the back of the earpiece, which rests on her hair a few centimetres out from the ear)
      [28, { hgR: 1, hgPosR: [0.185, 0.03, -0.06], fistR: 0.35, neck: [0.14, 0.18, -0.14], handL: [0.24, -0.82, 0.14] }, 'inout'],
      [40, { neck: [0.24, 0.12, -0.12] }, 'sine'],
      [50, { neck: [0.12, 0.16, -0.1] }, 'sine'],
      [57, { hgPosR: [0.32, -0.16, 0.22], neck: [0.14, 0.08, -0.04] }, 'inout'],
      // palms together in front of the chest, a quick rub
      [66, { hgL: 1, hgPosL: [0.088, -0.31, 0.27], hgR: 1, hgPosR: [0.088, -0.31, 0.27], fistL: 0, fistR: 0, neck: [0.16, 0, 0] }, 'inout'],
      [72, { hgPosL: [0.088, -0.31, 0.3], hgPosR: [0.088, -0.31, 0.24] }, 'sine'],
      [78, { hgPosL: [0.088, -0.31, 0.24], hgPosR: [0.088, -0.31, 0.3] }, 'sine'],
      [84, { hgPosL: [0.088, -0.31, 0.29], hgPosR: [0.088, -0.31, 0.25] }, 'sine'],
      [96, null, 'inout'],
    ],
    title: 'La Cortadora de Áloe', desc: 'Desde la central de alarmas lo ve todo: escucha, verifica y da el aviso. Palmas certeras, empujones y una descarga que salta como una alarma.',
    say: 'Te falta tomar áloe vera.', sayAt: 78, sayLen: 108, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Voy cargadita de áloe vera, cuidado conmigo.', introLen: 150, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 184, walk: 1.18, weight: 0.96, power: 1.04, speed: 1.04 },
    hairSway: 0.9, // how far the hair swings with the head: a bob (js/anim/hairsway.js)
    clothSway: 1, // how far the hem swings with the hips: the long, light doctor's coat (js/anim/clothsway.js)
    aiMoves: ['1', '2', 'b+1', '1+2', 'f+4', 'df+1', 'df+2', 'd+3', '3', '4', 'd+4', '1+3', 'f+1', 'b+3'], juggle: ['1', '2', 'b+1'],
    // a calm, upright guard, hands loosely closed at chest height, wider than a boxer's: her face stays in view (the
    // first guard held the open hands at her chin and the rear one by her temple, covering her face from the camera)
    stance: { rootPos: [0, -0.065, -0.02], rootRot: [0.05, -0.42, 0], spine: [0.1, 0.1, 0], neck: [0.14, 0.18, 0], fistL: 0.7, fistR: 0.7,
      hgPosL: [0.1, -0.34, 0.3], hgPosR: [0.15, -0.35, 0.17] },
    bob: 0.02,
    rageFinisher: 'defib',
    commands: [['b+1', 'triage'], ['f+4', 'pushKick'], ['1+2', 'defib'], ['f+1', 'palm'], ['b+3', 'kneeKick']],
    stringFinish: 'kneeKick', // (the end of her own 1, 2, 3: js/fight/moves.js straight's cancel)
    // the phone's ★ buttons (js/ui/touch.js): the special that ★ PUÑO / ★ PATADA throws with the stick at rest (n),
    // forward (f), back (b) or down (d), as the command it stands for
    touchSP: { P: { n: '1+2', f: 'f+1', b: 'b+1', d: 'df+2' }, K: { n: 'f+4', f: 'f+4', b: 'b+3', d: 'd+4' } },
    moves: (C) => ({
      // AVISO DE INTRUSIÓN: the lead palm drives straight into the sternum with the hips behind it and shoves the opponent away.
      // A palm strike: the hand turned palm down and bent back at the wrist, fingers up, so the heel of the palm leads
      // (with the wrist straight she struck with her fingertips)
      triage: {
        name: 'Aviso de intrusión', total: 32, clip: C([
          [0, {}],
          [4, { rootPos: [0, -0.09, -0.03], rootRot: [0.08, -0.55, 0], handL: [0.04, -0.06, 0.52], aimL: 1, twistL: 0.5, wristL: [0.6, 0], fistL: 0.1 }, 'inout'],
          [10, { rootPos: [0, -0.1, 0.08], rootRot: [0.12, -0.72, 0], spine: [0.14, -0.05, 0], neck: [0.14, 0.3, 0], handL: [0.0, -0.14, 0.98], aimL: 1, twistL: 1.09, wristL: [1.2, 0], fistL: 0.02,
            clavL: [0.05, 0.45], footL: [0.06, 0.071, 0.34] }, 'drive'],
          [13, {}, 'lin'],
          [20, { rootPos: [0, -0.085, 0.02], rootRot: [0.08, -0.5, 0], spine: [0.11, 0.08, 0], handL: [0.02, 0.06, 0.66], twistL: 0.2, wristL: [0.4, 0], fistL: 0.2, clavL: [0.0, 0.18] }, 'ret'],
          [32, null, 'inout'],
        ]),
        hit: { f: [9, 12], limb: 'handL', r: 0.12, dmg: 12, lvl: 'mid', react: 'hitMid', blk: -1, hitAdv: 10, push: 0.6 },
        advance: [[0, 0], [10, 0.16], [32, 0.14]], sfx: 'slap',
      },
      // ZONA PERIMETRAL: a push kick with the lead leg, the sole driven into the stomach to make room, the leg almost straight
      pushKick: {
        name: 'Zona perimetral', total: 38, clip: C([
          [0, {}],
          [6, { footL: [0.06, 0.34, 0.24], kneeL: [0.1, 0.5, 1], rootPos: [0, -0.06, -0.06], rootRot: [-0.08, -0.4, 0], spine: [0.06, 0.1, 0], handL: [0.08, 0.08, 0.55], handR: [0.0, 0.14, 0.38] }, 'inout'],
          // the knee up to the chest, the sole turned to him (a beat of a push kick's chamber), then out with the hips
          [9, { footL: [0.05, 0.55, 0.36], kneeL: [0.1, 0.75, 0.7], footRotL: [-0.7, -0.25, 0], rootPos: [0, -0.055, -0.05], rootRot: [-0.16, -0.4, 0], spine: [0.1, 0.1, 0], neck: [0.24, 0.15, 0] }, 'inout'],
          [14, { footL: [0.04, 0.78, 0.97], kneeL: [0.1, 0.8, 0.6], footRotL: [-1.35, -0.2, 0], toeL: -0.2, rootRot: [-0.3, -0.38, 0], spine: [0.18, 0.1, 0], rootPos: [0, -0.04, 0.05], neck: [0.34, 0.18, 0],
            handL: [0.12, -0.06, 0.45], handR: [0.18, -0.06, 0.25] }, 'drive'],
          [17, {}, 'lin'],
          [26, { footL: [0.05, 0.34, 0.34], footRotL: [0, -0.35, 0], toeL: 0, rootRot: [0.0, -0.45, 0], rootPos: [0, -0.06, 0.03] }, 'inout'],
          [38, null, 'inout'],
        ]),
        hit: { f: [13, 16], limb: 'footL', r: 0.13, dmg: 14, lvl: 'mid', react: 'hitMid', blk: -7, hitAdv: 2, push: 0.85 },
        advance: [[0, 0], [14, 0.2], [38, 0.2]], sfx: 'kick',
      },
      // BOTÓN DEL PÁNICO: palms rubbed together in front of the chest to charge them, the hands drawn back as the weight
      // sinks, then both palms driven into the opponent's chest with a crackle of electricity that throws him up
      defib: {
        name: 'Botón del pánico', total: 56, clip: C([
          [0, {}],
          [8, { rootPos: [0, -0.1, -0.04], rootRot: [0.1, -0.32, 0], spine: [0.12, 0.08, 0], neck: [0.14, 0.12, 0],
            hgL: 1, hgPosL: [0.08, -0.3, 0.28], hgR: 1, hgPosR: [0.08, -0.3, 0.28], fistL: 0, fistR: 0 }, 'inout'],
          [12, { hgPosL: [0.08, -0.3, 0.31], hgPosR: [0.08, -0.3, 0.25] }, 'sine'],
          [16, { hgPosL: [0.08, -0.3, 0.25], hgPosR: [0.08, -0.3, 0.31] }, 'sine'],
          [20, { hgPosL: [0.08, -0.3, 0.3], hgPosR: [0.08, -0.3, 0.26] }, 'sine'],
          // charged: palms apart and drawn back to the chest, weight on the rear leg
          [25, { rootPos: [0, -0.15, -0.08], rootRot: [0.14, -0.36, 0], spine: [0.1, 0.04, 0], hgPosL: [0.12, -0.3, 0.2], hgPosR: [0.12, -0.3, 0.16], twistL: 0.75, twistR: 0.75, wristL: [0.8, 0], wristR: [0.8, 0] }, 'inout'],
          // both palms into the chest, the body lunging in behind them: heels of the palms first (turned down and
          // bent back at the wrists, fingers up)
          [31, { rootPos: [0, -0.11, 0.14], rootRot: [0.16, -0.14, 0], spine: [0.2, 0.04, 0], neck: [0.05, 0.05, 0],
            hgPosL: [0.06, -0.3, 0.6], hgPosR: [0.06, -0.3, 0.58], clavL: [0.05, 0.4], clavR: [0.05, 0.42],
            twistL: 1.28, twistR: 1.28, wristL: [1.1, 0], wristR: [1.1, 0],
            footL: [0.06, 0.071, 0.42], footR: [0.22, 0.071, -0.12], footRotR: [0.4, 0.4, 0], toeR: 0.5 }, 'snap'],
          [35, {}, 'lin'],
          [45, { rootPos: [0, -0.09, 0.06], rootRot: [0.08, -0.36, 0], hgPosL: [0.09, -0.2, 0.38], hgPosR: [0.11, -0.18, 0.2], fistL: 0.25, fistR: 0.25, twistL: 0, twistR: 0, wristL: [0.3, 0], wristR: [0.3, 0], clavL: [0, 0.15], clavR: [0, 0.15], toeR: 0 }, 'ret'],
          [56, null, 'inout'],
        ]),
        hit: { f: [30, 34], limb: 'handL', r: 0.15, dmg: 21, lvl: 'mid', react: 'air', blk: -16, launch: 5.6, push: 0.15, fx: 'electric' },
        advance: [[0, 0], [25, -0.04], [31, 0.24], [56, 0.24]], sfx: 'heavy',
      },
      // VERIFICACIÓN: a step in and the lead arm driven out straight, the heel of the open palm up under the chin
      // (the wrist bent back, the fingers up)
      palm: {
        name: 'Verificación', total: 28, clip: C([
          [0, {}],
          [4, { rootPos: [0, -0.1, -0.02], handL: [0.0, 0.1, 0.5], aimL: 0, fistL: 0, wristL: [0.8, 0], twistL: 0.75 }, 'inout'],
          [9, { handL: [0.02, 0.2, 1.0], aimL: 1, wristL: [0.9, 0], twistL: 0.75, fistL: 0, clavL: [0.05, 0.45], rootRot: [0.12, -0.62, 0], rootPos: [0, -0.09, 0.1], spine: [0.12, -0.02, 0] }, 'drive'],
          [11, {}, 'lin'],
          [17, { handL: [0.0, 0.16, 0.7], twistL: 0.3, clavL: [0.0, 0.22], rootRot: [0.08, -0.52, 0], rootPos: [0, -0.08, 0.04], spine: [0.11, 0.06, 0] }, 'ret'],
          [28, null, 'inout'],
        ]),
        hit: { f: [9, 11], limb: 'handL', r: 0.11, dmg: 12, lvl: 'high', react: 'hitHigh', blk: -2, hitAdv: 6, push: 0.35, ch: { kd: true } },
        advance: [[0, 0], [9, 0.26], [28, 0.22]], sfx: 'slap',
      },
      // DETECTOR DE PRESENCIA: a stop kick: the hips turned side-on and the heel driven down and out into his knee (a
      // low), then straight back. The end of her 1, 2, 3
      kneeKick: {
        name: 'Detector de presencia', total: 30, clip: C([
          [0, {}],
          [5, { rootPos: [0, -0.1, -0.04], rootRot: [0.0, -1.0, 0.05], spine: [0.06, 0.25, 0], neck: [0.2, 0.7, 0],
            footL: [0.0, 0.3, 0.16], kneeL: [-0.2, 0.5, 0.8], footRotL: [0, -1.1, -0.2], footRotR: [0.15, -0.6, 0] }, 'inout'],
          [10, { rootPos: [0, -0.1, 0.0], rootRot: [-0.05, -1.2, 0.28], spine: [0.1, 0.26, -0.15], neck: [0.26, 0.72, -0.1],
            footL: [0.0, 0.3, 0.84], kneeL: [0, 1, 0.3], footRotL: [0, -1.3, -0.8], footRotR: [0.2, -0.62, 0] }, 'drive'],
          [13, {}, 'lin'],
          [20, { rootPos: [0, -0.1, -0.03], rootRot: [0.0, -0.9, 0.05], spine: [0.06, 0.22, 0], neck: [0.2, 0.6, 0],
            footL: [0.0, 0.28, 0.2], kneeL: [-0.2, 0.5, 0.8], footRotL: [0, -1.0, -0.2], footRotR: [0.1, -0.4, 0] }, 'inout'],
          [30, null, 'inout'],
        ]),
        hit: { f: [10, 12], limb: 'footL', r: 0.12, dmg: 12, lvl: 'low', react: 'hitLow', blk: -10, hitAdv: 2, push: 0.3, ch: { kd: true } },
        advance: [[0, 0], [10, 0.1], [30, 0.08]], sfx: 'kick',
      },
    }),
    // PUÑETALITY (js/fight/fatality.js): she draws a sword of aloe vera from behind her back, tells the loser it will
    // sting a little and cuts him in two at the waist with one sweep; she flicks the blood off the blade and lowers it.
    // Frames of the move: len (all of it), cut (the sword goes through), fear (the loser sees it coming), title (its
    // name comes up), dist (between them, m), slow (the slow motion round the cut: [ramp from, full from, full until,
    // back by, speed]), still (from then on the loser is not moved by the fight: he is drawn as two halves); say / sayAt:
    // her line (tools/quotes_tts.py --fatal)
    fatal: {
      len: 640, cut: 204, fear: 56, still: 204, title: 412, dist: 1.2, slow: [192, 200, 214, 250, 0.22],
      say: 'Esto va a escocer un poquito.', sayAt: 84,
      clip: [
        // standing tall, cold, the hands loose at her sides
        [0, { rootPos: [0, -0.03, 0], rootRot: [0.0, -0.2, 0], spine: [-0.02, 0.06, 0], neck: [0.06, 0.14, 0],
          handL: [0.2, -0.86, 0.1], aimL: 1, fistL: 0.3, twistL: 0, handR: [0.2, -0.86, 0.06], aimR: 1, fistR: 0.35, twistR: 0,
          footL: [0.12, 0.071, 0.12], footR: [0.14, 0.071, -0.1], footRotL: [0, 0.1, 0], footRotR: [0, 0.3, 0], kneeL: [0.1, 0, 1], kneeR: [0.15, 0, 1] }],
        [18, {}, 'inout'],
        // the right hand behind her back, the trunk turning to it; her eyes stay on the loser
        [34, { rootRot: [0.02, -0.45, 0], spine: [0.02, -0.12, 0], neck: [0.06, 0.42, 0], handR: [0.14, -0.6, -0.24], poleR: [0.6, -0.4, -0.7], twistR: -0.4, fistR: 0.5, handL: [0.24, -0.7, 0.2] }, 'inout'],
        [40, { fistR: 0.75 }, 'inout'],
        // drawn out from behind her to her right side (the leaf grows out of the hilt as it comes), then raised upright
        // before her face, a salute (the light runs up the blade)
        [50, { handR: [0.62, -0.42, 0.02], poleR: [0.5, -1, 0], twistR: 0.4, rootRot: [0.0, -0.32, 0], spine: [-0.02, -0.02, 0], neck: [0.06, 0.3, 0] }, 'inout'],
        [60, { handR: [0.4, -0.08, 0.5], poleR: [0.5, -1, 0.2], twistR: -0.5, wristR: [0, 0.5], spine: [-0.04, 0.02, 0], neck: [0.02, 0.22, 0] }, 'inout'],
        [70, { handR: [0.4, -0.06, 0.51], neck: [0.0, 0.2, 0.04] }, 'sine'],
        // brought down into her guard: the sword low by her right hip, palm down, its point at the loser's chest
        [82, { rootPos: [0, -0.07, -0.02], rootRot: [0.04, -0.32, 0], spine: [0.06, 0.06, 0], neck: [0.1, 0.24, 0],
          handR: [0.6, -0.35, 0.0], poleR: [0.5, -1, 0], twistR: 1.05, wristR: [0, 0], handL: [0.24, -0.62, 0.18], fistL: 0.25,
          footL: [0.08, 0.071, 0.2], footR: [0.18, 0.071, -0.16], footRotL: [0, -0.2, 0], footRotR: [0, 0.5, 0] }, 'inout'],
        [110, { handR: [0.6, -0.33, 0.02], neck: [0.12, 0.2, -0.06] }, 'sine'],
        [140, { handR: [0.6, -0.35, 0.0], neck: [0.1, 0.24, 0.04] }, 'sine'],
        [178, { handR: [0.6, -0.34, 0.01], neck: [0.1, 0.22, 0] }, 'sine'],
        // the wind-up: the weight sinks and goes back, the trunk coils right, the sword drawn back behind her right hip,
        // level, pointing away behind her (palm down already, as it will cut)
        [196, { rootPos: [0, -0.15, -0.06], rootRot: [0.08, -0.95, 0], spine: [0.1, -0.3, 0], neck: [0.12, 0.85, 0],
          handR: [0.1, -0.3, -0.4], poleR: [0.5, -1, 0], twistR: 1.35, wristR: [0, 0.35], handL: [0.12, -0.28, 0.42], fistL: 0.5,
          footL: [0.1, 0.071, 0.26], footR: [0.2, 0.071, -0.2] }, 'inout'],
        // the cut: she unwinds into it with a step, the arm sweeping level across at the loser's waist, palm down, the
        // blade leading out of the fist (through the waist at frame `cut`: tools/fatalprobe.mjs)
        [200, { rootPos: [0, -0.16, 0.08], rootRot: [0.12, -0.3, 0], spine: [0.14, 0.05, 0], neck: [0.12, 0.3, 0], handR: [0.62, -0.36, 0.35], twistR: 1.28, wristR: [0, 0.6] }, 'snap'],
        [203, { rootPos: [0, -0.17, 0.16], rootRot: [0.14, 0.25, 0], spine: [0.15, 0.25, 0], neck: [0.1, -0.15, 0], handR: [0.4, -0.35, 0.7], twistR: 1.05, wristR: [-0.1, 0.45], handL: [0.3, -0.48, -0.05] }, 'lin'],
        [206, { handR: [0.0, -0.35, 0.72], twistR: 1.1, wristR: [-0.1, 0.45] }, 'lin'],
        [210, { rootPos: [0, -0.17, 0.18], rootRot: [0.12, 0.55, 0], spine: [0.12, 0.35, 0], neck: [0.1, -0.4, 0], handR: [-0.3, -0.32, 0.55], twistR: 1.1, wristR: [-0.1, 0.4], footR: [0.2, 0.071, -0.12] }, 'out'],
        // held: the blade out to her left, still
        [236, { rootRot: [0.11, 0.52, 0], handR: [-0.42, -0.3, 0.4], twistR: 1.4, wristR: [-0.3, 0.4] }, 'sine'],
        // she straightens and turns to watch the halves go, the blade lowered in front of her
        [300, { rootPos: [0, -0.08, 0.1], rootRot: [0.04, 0.2, 0], spine: [0.04, 0.1, 0], neck: [0.16, -0.2, 0], handR: [0.6, -0.75, 0.6], poleR: [0.6, -0.8, 0.4], twistR: -0.05, wristR: [0, 0.4], handL: [0.24, -0.7, 0.12] }, 'inout'],
        // the blood flicked off the blade: up over her right shoulder, then snapped down and out to her right
        [340, { handR: [0.34, -0.02, 0.24], poleR: [0.8, -0.5, 0], twistR: -1.28, wristR: [0, -0.05], neck: [0.12, 0.1, 0] }, 'inout'],
        [347, { handR: [0.6, -0.75, 0.1], poleR: [0.8, -0.6, -0.3], twistR: -1.5, wristR: [0.3, 0.55] }, 'snap'],
        [360, {}, 'lin'],
        // the sword down at her side, the point to the floor; a look back at what is left
        [384, { rootPos: [0, -0.04, 0.06], rootRot: [0.0, -0.1, 0], spine: [-0.02, 0.0, 0], neck: [0.12, 0.2, -0.05], handR: [0.6, -0.7, 0.0], poleR: [0.9, -0.2, 0.3], twistR: -1.5, wristR: [0.1, 0.55], handL: [0.2, -0.82, 0.1] }, 'inout'],
        [640, { neck: [0.06, 0.1, -0.04] }, 'sine'],
      ],
    },
    // "te falta tomar áloe vera": a hand on her hip and the index finger wagging at the loser, then the case is closed:
    // the hand to her earpiece, a satisfied nod
    win: [
      [0, {}],
      [12, { handR: [0.4, -0.3, 0.3], aimR: 1, fistR: 0.6, handL: [0.35, -0.4, 0.25], aimL: 1, fistL: 0.4 }, 'out'],
      [26, { rootPos: [0, 0, 0], rootRot: [0, 0.2, -0.03], spine: [-0.05, 0.04, 0], neck: [0.04, 0.08, -0.06],
        handL: [0.38, -0.52, -0.08], aimL: 1, poleL: [0.6, 0.2, -0.8], fistL: 0.6,
        handR: [0.26, 0.02, 0.52], aimR: 1, fistR: 1, ptR: 1, twistR: 0.2, footL: [0.16, 0.071, 0.05], footR: [0.16, 0.071, -0.05], footRotL: [0, 0.2, 0], footRotR: [0, 0.22, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }, 'back'],
      [40, { handR: [0.2, 0.04, 0.52], wristR: [0, 0.35] }, 'sine'],
      [50, { handR: [0.32, 0.04, 0.52], wristR: [0, -0.35] }, 'sine'],
      [60, { handR: [0.2, 0.04, 0.52], wristR: [0, 0.35] }, 'sine'],
      [70, { handR: [0.32, 0.04, 0.52], wristR: [0, -0.35] }, 'sine'],
      [80, { handR: [0.2, 0.04, 0.52], wristR: [0, 0.35], neck: [0.06, 0.04, -0.1] }, 'sine'],
      [90, { handR: [0.32, 0.04, 0.52], wristR: [0, -0.35] }, 'sine'],
      [100, { handR: [0.22, 0.04, 0.52], wristR: [0, 0.3] }, 'sine'],
      [110, { handR: [0.3, 0.04, 0.52], wristR: [0, -0.3] }, 'sine'],
      [124, { handR: [0.26, 0.03, 0.52], wristR: [0, 0] }, 'sine'],
      // (out to the side first: the hand reaches the earpiece from beside the head)
      [140, { hgR: 1, hgPosR: [0.3, -0.04, 0.1], poleR: [0.3, -1, 0.4], fistR: 0.32, ptR: 0, twistR: 0 }, 'inout'],
      [154, { hgPosR: [0.185, 0.0, -0.05], fistR: 0.35, neck: [0.0, 0.15, -0.12] }, 'inout'],
      [172, { neck: [0.16, 0.12, -0.1] }, 'sine'],
      [186, { neck: [0.0, 0.15, -0.12] }, 'sine'],
      [232, { neck: [-0.04, 0.2, -0.1], spine: [-0.08, 0.05, 0] }, 'sine'],
    ],
  },
};
