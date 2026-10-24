// Per-fighter fighting styles: stance variations, stats, unique moves, intros and victory poses.
const GUARD_L = [0.02, 0.2, 0.62], GUARD_R = [-0.08, 0.3, 0.44];

const RESET = { rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.1, 0.12, 0], neck: [0.16, 0.2, 0],
  handL: GUARD_L, handR: GUARD_R, aimL: 0, aimR: 0, twistL: -0.4, twistR: -0.55, clavL: [-0.05, 0.1], clavR: [-0.05, 0.12],
  footL: [0.05, 0.071, 0.24], footR: [0.2, 0.071, -0.2], kneeL: [0.15, 0, 1], kneeR: [0.5, 0, 1], footRotL: [0, -0.35, 0], footRotR: [0, 0.65, 0], toeL: 0, toeR: 0 };

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
    title: 'El Tatuado', desc: 'Kickboxer rápido y preciso. Patadas altas y rodillazos.',
    say: '¿Eso era todo? Ni me he despeinado.', sayAt: 78, sayLen: 147, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Calienta bien, que esto va a ser rápido.', introLen: 133, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 182, walk: 1.24, weight: 1.0, power: 1.06, speed: 1.08 },
    hairSway: 0.8, // how far the hair swings with the head: the topknot and its tail (js/anim/hairsway.js)
    aiMoves: ['1', '1', '2', 'd+3', 'df+1', 'df+2', '3', '4', 'b+4', 'f+3', '1+2', 'd+4', '1+3'], juggle: ['1', '2', '4'],
    bob: 0.022,
    onetwoFinish: 'roundhouse',
    commands: [['b+4', 'spinKick'], ['f+3', 'knee'], ['1+2', 'tattooCombo']],
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
          // the leg drives straight back from its own hip (aimed at the centre line it crossed over the support
          // thigh), the trunk tipping further forward as counterweight (a hip opens only so far behind) while the
          // head stays up on the target; the support knee bends away over its toes instead of towards the kick
          [20, { rootPos: [0, -0.04, 0.02], rootRot: [0.9, -3.1, 0.05], spine: [0.2, 0.45, 0.1], neck: [-0.3, 1.1, 0], kneeL: [-0.3, 0.2, -0.9], footRotL: [0.35, -2.6, 0],
            footR: [-0.03, 0.8, 0.9], kneeR: [-0.1, -1, 0.2], footRotR: [1.2, 0, 0], handL: [0.42, -0.12, 0.3], handR: [0.46, 0.0, 0.1] }, 'drive'],
          [24, {}, 'lin'],
          // re-chamber two frames sooner, so that the unwinding to the guard is spread over more frames (squeezed
          // into seven, the knee whipped round)
          [32, { rootPos: [0, -0.06, 0], rootRot: [0.35, -2.6, 0], spine: [0.15, 0.4, 0], neck: [0, 0.8, 0], kneeL: [0.15, 0, 1], footRotL: [0.25, -2.3, 0],
            footR: [-0.03, 0.55, -0.12], kneeR: [0.43, 0.3, -0.9], footRotR: [0.4, 0, 0] }, 'inout'],
          [41, { rootPos: [0, -0.09, -0.02], rootRot: [0.12, -1.2, 0], spine: [0.1, 0.2, 0], neck: [0.1, 0.5, 0], footRotL: [0.1, -1.0, 0],
            footR: [0.25, 0.071, -0.15], kneeR: [0.5, 0, 1], footRotR: [0.3, 0.65, 0], handL: [0.02, 0.2, 0.62], handR: [-0.08, 0.3, 0.44], aimL: 0, aimR: 0 }, 'inout'],
          [48, null, 'inout'],
        ]),
        hit: { f: [20, 23], limb: 'footR', r: 0.14, dmg: 24, lvl: 'mid', react: 'hitMid', blk: -14, kd: true, push: 0.6 },
        advance: [[0, 0], [20, 0.18], [48, 0.18]], sfx: 'heavy',
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
    }),
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
  arnau: {
    intro: [
      [0, { rootPos: [0, 0, 0], rootRot: [0, 0.1, 0], spine: [0, 0, 0], neck: [0.1, 0, 0], handL: [0.2, -0.88, 0.1], handR: [0.2, -0.88, 0.1], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, footL: [0.14, 0.071, 0.04], footR: [0.14, 0.071, -0.02], footRotL: [0, 0.15, 0], footRotR: [0, 0.2, 0], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1] }],
      [24, { handR: [-0.45, 0.62, 0.42], fistR: 0.85, poleR: [0.4, -1, 0], neck: [0.25, 0, 0] }, 'inout'],
      [34, { handR: [-0.47, 0.66, 0.4], neck: [0.1, 0, 0] }, 'inout'],
      [52, { handR: [0.3, -0.7, 0.25], handL: [-0.25, 0.05, 0.5], fistL: 0.2 }, 'inout'],
      [66, { handR: [-0.2, 0.05, 0.52], fistR: 1, handL: [-0.15, 0.05, 0.52], neck: [0.2, 0.3, 0] }, 'inout'],
      [95, null, 'inout'],
    ],
    title: 'El Gamer', desc: 'Joven e impredecible. Cabezazos y barridos.',
    say: '¡En mi consola esto era más difícil!', sayAt: 78, sayLen: 166, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Partida nueva. Esta la gano yo.', introLen: 117, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 188, walk: 1.2, weight: 1.12, power: 1.12, speed: 1.04 },
    hairSway: 0.75, // how far the hair swings with the head: a long fringe (js/anim/hairsway.js)
    clothSway: 0.45, // how far the hem swings with the hips: a track jacket, its elastic waist holds it (js/anim/clothsway.js)
    aiMoves: ['1', '2', '1+2', 'df+4', 'b+2', 'd+3', 'df+2', '3', '4', 'd+4', '1+3'], juggle: ['1', '1', '2', 'b+2'],
    stance: { hgPosL: [0.09, -0.19, 0.28], hgPosR: [0.12, -0.23, 0.2], spine: [0.18, 0.1, 0], rootRot: [0.05, -0.35, 0], neck: [0.12, 0.15, 0] },
    bob: 0.015,
    commands: [['1+2', 'headbutt'], ['df+4', 'slide'], ['b+2', 'hammer']],
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
          [6, { rootPos: [0, -0.2, 0.05], rootRot: [0.3, -0.4, 0] }, 'out'],
          [18, { rootPos: [0, -0.74, 0.1], rootRot: [-0.95, -0.3, 0], spine: [0.35, 0, 0], footL: [0.1, 0.1, 0.98], kneeL: [0.1, 1, 0.3], footRotL: [-1.4, 0, 0], footR: [0.22, 0.075, 0.28], kneeR: [0.5, 1, 0.3],
            handL: GUARD_L, handR: [0.45, -0.8, -0.3], aimL: 0, aimR: 1, poleR: [0.4, 0, -1], neck: [0.75, 0.2, 0] }, 'snap'],
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
          [8, { rootPos: [0, -0.02, -0.04], rootRot: [-0.2, -0.3, 0], spine: [-0.25, 0.3, 0], handR: [0.1, 0.9, 0.1], aimR: 1, twistR: 0.4, clavR: [0.3, 0.1] }, 'out'],
          // the power comes from dropping the hips; the torso folds only moderately so the head stays behind the fist
          [18, { rootPos: [0, -0.24, 0.1], rootRot: [0.24, -0.2, 0], spine: [0.26, 0.3, 0], handR: [0.0, 0.02, 0.86], aimR: 1, twistR: -0.14, neck: [-0.1, 0, 0], kneeL: [0.25, 0, 1] }, 'snap'],
          [22, {}, 'lin'],
          [30, { rootPos: [0, -0.16, 0.04], rootRot: [0.14, -0.35, 0], spine: [0.16, 0.2, 0], handR: [-0.08, 0.15, 0.55], aimR: 0.6, neck: [0.05, 0.1, 0] }, 'ret'],
          [44, null, 'inout'],
        ]),
        hit: { f: [17, 20], limb: 'handR', r: 0.13, dmg: 18, lvl: 'mid', react: 'hitMid', blk: -9, hitAdv: 7, push: 0.3 },
        advance: [[0, 0], [18, 0.24], [44, 0.24]], sfx: 'heavy', // longer step: the upright finish reaches less
      },
    }),
    // "¡en mi consola esto era más difícil!": thumbs mashing an invisible gamepad, eyes down on it; he looks up to say
    // it, then raises his fist like a final boss beaten
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
    title: 'El Maratoniano', desc: 'Alcance enorme y fondo inagotable. Patadas a la carrera.',
    say: 'No molestes, estoy trabajando.', sayAt: 78, sayLen: 127, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Tengo una reunión. Acabemos rápido.', introLen: 141, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 174, walk: 1.4, weight: 0.95, power: 1.02, speed: 1.07 },
    hairSway: 0.45, // how far the hair swings with the head: short, combed back (js/anim/hairsway.js)
    aiMoves: ['1', '2', 'b+1', '3', '4', 'd+3', 'df+2', '3+4', 'd+4', 'df+1'], longRange: ['f,f+4', '3+4'], juggle: ['1', 'b+1', '4'],
    stance: { rootPos: [0, -0.06, -0.02], hgPosL: [0.06, -0.13, 0.33], hgPosR: [0.12, -0.16, 0.2] },
    bob: 0.03,
    commands: [['f,f+4', 'sprintKick'], ['3+4', 'flyKick'], ['b+1', 'backfist']],
    moves: (C) => ({
      // (the leg drives out almost straight into the stomach: it used to stop short, the shin hanging from a raised knee;
      // the run-up carries the body a little less far, so the reach is the same; the lead hand guards, the kicking side's
      // arm swings down and back instead of both held out wide)
      sprintKick: {
        name: 'Sprint kick', total: 50, clip: C([
          [0, {}],
          // (the left arm swings back wide of the body: from the guard straight to behind the hip it went through
          // the belly)
          [6, { rootPos: [0, -0.1, 0.05], rootRot: [0.25, -0.3, 0], footR: [0.18, 0.2, -0.05], handL: [0.3, -0.38, -0.18], handR: [0.1, 0.1, 0.5], aimL: 1, aimR: 1 }, 'inout'],
          [18, { rootPos: [0, -0.02, 0.12], rootRot: [-0.35, -0.4, 0], spine: [0.2, 0.1, 0], footR: [0.02, 0.88, 0.98], kneeR: [0.1, 1, 0.5], footRotR: [-1.3, 0, 0], toeR: -0.5, handL: GUARD_L, handR: [0.18, -0.8, -0.38], aimL: 0, aimR: 0, poleR: [0.2, 0, -1], neck: [0.45, 0.15, 0] }, 'drive'],
          [22, {}, 'lin'],
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
      backfist: {
        name: 'Back fist', total: 30, clip: C([
          [0, {}],
          // the lead fist coils across the chest, then whips out along a flat arc and lands with the back of the
          // knuckles on the centre line (the old arc swung wide and passed beside the opponent's head): the fist on
          // edge, palm in, and the wrist a little flexed so the back of the hand leads (it had landed palm down)
          [4, { rootRot: [0.05, -0.9, 0], handL: [-0.22, 0.16, 0.32], twistL: -0.2 }, 'out'],
          [11, { rootRot: [0.05, -0.35, 0], handL: [0.04, 0.24, 0.96], aimL: 1, twistL: -0.47, wristL: [-0.3, 0], clavL: [0, 0.35] }, 'whip'],
          [14, {}, 'lin'],
          [20, { handL: [0.02, 0.22, 0.7], twistL: -0.3, wristL: [0.05, 0], clavL: [0, 0.15], rootRot: [0.05, -0.45, 0] }, 'ret'],
          [30, null, 'inout'],
        ]),
        hit: { f: [11, 13], limb: 'handL', r: 0.11, dmg: 12, lvl: 'high', react: 'hitHighSide', swing: 1, blk: 2, hitAdv: 8, push: 0.2 },
        advance: [[0, 0], [11, 0.08], [30, 0.08]], sfx: 'light',
      },
    }),
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
    aiMoves: ['1', '2', '1+2', 'f+2', 'df+1', 'd+3', 'df+2', '3', '2+4', 'd+4'], juggle: ['1', '2', '1+2'],
    stance: { rootPos: [0, -0.06, -0.03], rootRot: [0.04, -0.4, 0], hgPosL: [0.1, -0.21, 0.3], hgPosR: [0.13, -0.19, 0.14], footL: [0.1, 0.071, 0.24], footR: [0.24, 0.071, -0.2] },
    bob: 0.012,
    throw2: 'bearHug',
    commands: [['1+2', 'bellyBump'], ['f+2', 'smash']],
    moves: (C) => ({
      bellyBump: {
        name: 'Belly bump', total: 44, clip: C([
          [0, {}],
          [8, { rootPos: [0, -0.06, -0.08], rootRot: [-0.25, -0.1, 0], spine: [-0.3, 0, 0], handL: [0.55, 0.1, -0.1], handR: [0.55, 0.1, -0.1], aimL: 1, aimR: 1, fistL: 0.2, fistR: 0.2 }, 'out'],
          [16, { rootPos: [0, -0.1, 0.24], rootRot: [-0.35, 0, 0], spine: [-0.4, 0, 0], neck: [0.3, 0, 0] }, 'snap'],
          [20, {}, 'lin'],
          [44, null, 'inout'],
        ]),
        hit: { f: [15, 19], limb: 'belly', r: 0.25, dmg: 14, lvl: 'mid', react: 'hitMid', blk: -4, hitAdv: 12, push: 0.9 },
        advance: [[0, 0], [16, 0.46], [44, 0.46]], sfx: 'body',
      },
      smash: {
        name: 'Overhand smash', total: 50, clip: C([
          [0, {}],
          [10, { rootPos: [0, 0.0, -0.06], rootRot: [-0.15, -0.8, 0], spine: [-0.2, -0.4, 0], handR: [0.4, 0.75, -0.2], aimR: 1, twistR: 0.8, clavR: [0.3, -0.1] }, 'out'],
          [18, { rootPos: [0, -0.23, 0.12], rootRot: [0.22, 0.2, 0], spine: [0.26, 0.45, 0], handR: [-0.05, 0.0, 0.98], aimR: 1, twistR: 1.0, clavR: [0.1, 0.5], footL: [0.1, 0.071, 0.36], neck: [-0.08, -0.1, 0], kneeL: [0.25, 0, 1] }, 'snap'],
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
    }),
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
    title: 'El Toro', desc: 'Luchador de fuerza bruta. Lariats y suplex.',
    say: '¡Espectacular, vale!', sayAt: 78, sayLen: 107, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: '¡Esto va a ser espectacular, vale!', introLen: 132, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 196, walk: 1.15, weight: 1.35, power: 1.14, speed: 1.04 },
    hairSway: 0.7, // how far the hair swings with the head: curls of a medium length (js/anim/hairsway.js)
    aiMoves: ['1', '2', '1+2', 'f+2', 'df+1', 'd+3', 'df+2', '3', '2+4', 'd+4'], juggle: ['1', '2', 'f+2'],
    stance: { rootPos: [0, -0.1, -0.02], rootRot: [0.12, -0.3, 0], spine: [0.18, 0.1, 0], hgPosL: [0.15, -0.26, 0.4], hgPosR: [0.13, -0.26, 0.3], fistL: 0.92, fistR: 0.92,
      footL: [0.12, 0.071, 0.22], footR: [0.26, 0.071, -0.2] },
    bob: 0.012,
    throw2: 'suplex',
    commands: [['1+2', 'lariat'], ['f+1+2', 'axe'], ['f+2', 'axe']],
    moves: (C) => ({
      lariat: {
        name: 'Lariat', total: 52, clip: C([
          [0, {}],
          [10, { rootPos: [0, -0.1, -0.02], rootRot: [0.1, -1.0, 0], spine: [0.1, -0.4, 0], handR: [0.9, 0.2, -0.2], aimR: 1, twistR: 0.3, fistR: 0.8 }, 'out'],
          [20, { rootPos: [0, -0.1, 0.2], rootRot: [0.15, 0.6, 0], spine: [0.1, 0.5, 0], handR: [0.25, 0.25, 0.95], aimR: 1, clavR: [0.1, 0.4], footL: [0.1, 0.071, 0.45] }, 'snap'],
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
          [12, { rootPos: [0, 0.02, -0.05], rootRot: [-0.3, -0.2, 0], spine: [-0.3, 0.1, 0], handL: [0.05, 0.95, 0.15], handR: [0.05, 0.95, 0.15], aimL: 1, aimR: 1, fistL: 1, fistR: 1 }, 'out'],
          [21, { rootPos: [0, -0.27, 0.12], rootRot: [0.3, -0.2, 0], spine: [0.34, 0.1, 0], handL: [-0.05, 0.0, 0.86], handR: [-0.05, 0.0, 0.86], twistL: -0.19, twistR: -0.19, footL: [0.12, 0.071, 0.36], neck: [-0.12, 0, 0], kneeL: [0.3, 0, 1], kneeR: [0.3, 0, 1] }, 'snap'],
          [25, {}, 'lin'],
          [34, { rootPos: [0, -0.17, 0.05], rootRot: [0.16, -0.3, 0], spine: [0.2, 0.1, 0], handL: [0.0, 0.1, 0.55], handR: [-0.05, 0.12, 0.5], aimL: 0.5, aimR: 0.5, neck: [0.05, 0.05, 0] }, 'ret'],
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
    title: 'El Zorro Plateado', desc: 'Veterano fibroso de la vieja escuela. Esquivas, gancho al hígado y guantazos.',
    say: 'Más sabe el zorro por viejo que por zorro.', sayAt: 78, sayLen: 171, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Ponte los guantes, chaval.', introLen: 88, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 176, walk: 1.3, weight: 0.92, power: 1.0, speed: 1.1 },
    hairSway: 0, // how far the hair swings with the head: bald (js/anim/hairsway.js)
    aiMoves: ['1', '1', '2', 'b+1', '1+2', 'd+2', 'df+1', 'df+2', 'd+3', '3', '4', 'd+4', '1+3'], juggle: ['1', '1+2', 'b+1'],
    // old-school boxer: more upright and bladed, chin tucked, both fists high by the face
    stance: { rootPos: [0, -0.07, -0.02], rootRot: [0.07, -0.5, 0], spine: [0.14, 0.12, 0], neck: [0.2, 0.22, 0], hgPosL: [0.07, -0.07, 0.26], hgPosR: [0.1, -0.09, 0.1] },
    bob: 0.026,
    commands: [['b+1', 'liverShot'], ['d+2', 'gazelle'], ['1+2', 'slap']],
    moves: (C) => ({
      // lead hook to the liver: the knees dip and the weight shifts onto the lead leg while the elbow opens out to the
      // side, then the hips and shoulders snap round and the bent arm hooks the fist in under the opponent's ribs;
      // the rear fist stays on the chin
      liverShot: {
        name: 'Liver hook', total: 36, clip: C([
          [0, {}],
          [5, { rootPos: [0, -0.17, 0.0], rootRot: [0.22, -0.78, 0], spine: [0.26, -0.05, 0], neck: [0.2, 0.3, 0],
            handL: [0.2, -0.12, 0.42], aimL: 1, poleL: [1, -0.3, -0.4], twistL: -0.5, kneeL: [0.3, 0, 1], kneeR: [0.45, 0, 1] }, 'out'],
          // (the torso dips to his left: the head slips outside the opponent's lead hand)
          [12, { rootPos: [0, -0.2, 0.03], rootRot: [0.24, -0.05, -0.04], spine: [0.26, 0.3, -0.26], neck: [0.1, -0.2, 0.08],
            handL: [-0.12, -0.32, 0.86], poleL: [1, -0.1, -0.2], twistL: -0.4, clavL: [0.05, 0.3], footRotL: [0, -0.1, 0], footRotR: [0.3, 0.85, 0] }, 'snap'],
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
            handR: [0.5, 0.18, 0.18], aimR: 1, poleR: [0.6, -0.7, -0.6], twistR: -0.6, fistR: 0.05, clavR: [0.1, -0.1] }, 'out'],
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
    title: 'La Coordinadora', desc: 'Al mando de la sala de emergencias. Palmas certeras, empujones y un desfibrilador en las manos.',
    say: 'Te falta tomar áloe vera.', sayAt: 78, sayLen: 108, // (the line spoken on winning: tools/quotes_tts.py)
    introSay: 'Voy cargadita de áloe vera, cuidado conmigo.', introLen: 150, // (the line said in the fight's presentation, frames until the voice ends: tools/quotes_tts.py --intro)
    stats: { health: 184, walk: 1.18, weight: 0.96, power: 1.04, speed: 1.04 },
    hairSway: 0.9, // how far the hair swings with the head: a bob (js/anim/hairsway.js)
    clothSway: 1, // how far the hem swings with the hips: the long, light doctor's coat (js/anim/clothsway.js)
    aiMoves: ['1', '2', 'b+1', '1+2', 'f+4', 'df+1', 'df+2', 'd+3', '3', '4', 'd+4', '1+3'], juggle: ['1', '2', 'b+1'],
    // a calm, upright guard, hands loosely closed at chest height, wider than a boxer's: her face stays in view (the
    // first guard held the open hands at her chin and the rear one by her temple, covering her face from the camera)
    stance: { rootPos: [0, -0.065, -0.02], rootRot: [0.05, -0.42, 0], spine: [0.1, 0.1, 0], neck: [0.14, 0.18, 0], fistL: 0.7, fistR: 0.7,
      hgPosL: [0.1, -0.34, 0.3], hgPosR: [0.15, -0.35, 0.17] },
    bob: 0.02,
    rageFinisher: 'defib',
    commands: [['b+1', 'triage'], ['f+4', 'pushKick'], ['1+2', 'defib']],
    moves: (C) => ({
      // TRIAJE: the lead palm drives straight into the sternum with the hips behind it and shoves the opponent away.
      // A palm strike: the hand turned palm down and bent back at the wrist, fingers up, so the heel of the palm leads
      // (with the wrist straight she struck with her fingertips)
      triage: {
        name: 'Triaje', total: 32, clip: C([
          [0, {}],
          [4, { rootPos: [0, -0.09, -0.03], rootRot: [0.08, -0.55, 0], handL: [0.04, -0.06, 0.52], aimL: 1, twistL: 0.5, wristL: [0.6, 0], fistL: 0.1 }, 'out'],
          [10, { rootPos: [0, -0.1, 0.08], rootRot: [0.12, -0.72, 0], spine: [0.14, -0.05, 0], neck: [0.14, 0.3, 0], handL: [0.0, -0.14, 0.98], aimL: 1, twistL: 1.09, wristL: [1.2, 0], fistL: 0.02,
            clavL: [0.05, 0.45], footL: [0.06, 0.071, 0.34] }, 'snap'],
          [13, {}, 'lin'],
          [20, { rootPos: [0, -0.085, 0.02], rootRot: [0.08, -0.5, 0], spine: [0.11, 0.08, 0], handL: [0.02, 0.06, 0.66], twistL: 0.2, wristL: [0.4, 0], fistL: 0.2, clavL: [0.0, 0.18] }, 'ret'],
          [32, null, 'inout'],
        ]),
        hit: { f: [9, 12], limb: 'handL', r: 0.12, dmg: 12, lvl: 'mid', react: 'hitMid', blk: -1, hitAdv: 10, push: 0.6 },
        advance: [[0, 0], [10, 0.16], [32, 0.14]], sfx: 'slap',
      },
      // EMPUJÓN: a push kick with the lead leg, the sole driven into the stomach to make room, the leg almost straight
      pushKick: {
        name: 'Empujón', total: 38, clip: C([
          [0, {}],
          [6, { footL: [0.06, 0.34, 0.24], kneeL: [0.1, 0.5, 1], rootPos: [0, -0.06, -0.06], rootRot: [-0.08, -0.4, 0], spine: [0.06, 0.1, 0], handL: [0.08, 0.08, 0.55], handR: [0.0, 0.14, 0.38] }, 'inout'],
          [14, { footL: [0.04, 0.78, 0.97], kneeL: [0.1, 0.8, 0.6], footRotL: [-1.35, -0.2, 0], toeL: -0.2, rootRot: [-0.3, -0.38, 0], spine: [0.18, 0.1, 0], rootPos: [0, -0.04, 0.05], neck: [0.34, 0.18, 0],
            handL: [0.12, -0.06, 0.45], handR: [0.18, -0.06, 0.25] }, 'drive'],
          [17, {}, 'lin'],
          [26, { footL: [0.05, 0.34, 0.34], footRotL: [0, -0.35, 0], toeL: 0, rootRot: [0.0, -0.45, 0], rootPos: [0, -0.06, 0.03] }, 'inout'],
          [38, null, 'inout'],
        ]),
        hit: { f: [13, 16], limb: 'footL', r: 0.13, dmg: 14, lvl: 'mid', react: 'hitMid', blk: -7, hitAdv: 2, push: 0.85 },
        advance: [[0, 0], [14, 0.2], [38, 0.2]], sfx: 'kick',
      },
      // DESFIBRILADOR: palms rubbed together in front of the chest to charge them, the hands drawn back as the weight
      // sinks, then both palms driven into the opponent's chest with a crackle of electricity that throws him up
      defib: {
        name: 'Desfibrilador', total: 56, clip: C([
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
    }),
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
