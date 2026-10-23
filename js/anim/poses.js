// Key poses (authored for the LEFT side; the right side mirrors x automatically).
// hand*: chest-space target relative to the rest shoulder, in units of arm length (x>0 = outwards)
// foot*: character-space ankle target in metres for a 0.86 m leg (scaled per fighter), x>0 = outwards
// pole*/knee*: direction hints for elbow / knee
import { newPose, applyPartial } from './rig.js';

export const BASE = {
  rootPos: [0, 0, 0], rootRot: [0, 0, 0], spine: [0, 0, 0], neck: [0, 0, 0],
  handL: [0.35, -0.75, 0.25], poleL: [0.2, -1, -0.5], twistL: 0, wristL: [0, 0], fistL: 0.3, clavL: [0, 0],
  handR: [0.35, -0.75, 0.25], poleR: [0.2, -1, -0.5], twistR: 0, wristR: [0, 0], fistR: 0.3, clavR: [0, 0],
  footL: [0.19, 0.071, 0.01], kneeL: [0.1, 0, 1], footRotL: [0, 0, 0], toeL: 0,
  footR: [0.19, 0.071, 0.01], kneeR: [0.1, 0, 1], footRotR: [0, 0, 0], toeR: 0,
  jaw: 0, look: 1, aimL: 0, aimR: 0,
  hgL: 0, hgPosL: [0, 0, 0.3], hgR: 0, hgPosR: [0, 0, 0.15],
};

// Fighting stance: left foot forward, torso bladed, hands up; the fists on edge, palms facing each other and a little
// towards the face (twist -1.05 had turned the palms to the face, like holding a cup)
export const STANCE = {
  rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.12, 0.12, 0], neck: [0.16, 0.2, 0],
  handL: [0.02, 0.2, 0.62], poleL: [0.3, -1, -0.15], twistL: -0.4, wristL: [0.12, 0], fistL: 1, clavL: [0.02, 0.1],
  handR: [-0.08, 0.3, 0.44], poleR: [0.25, -1, -0.25], twistR: -0.55, wristR: [0.12, 0], fistR: 1, clavR: [0.04, 0.12],
  hgL: 1, hgPosL: [0.07, -0.11, 0.3], hgR: 1, hgPosR: [0.1, -0.1, 0.1],
  footL: [0.05, 0.071, 0.24], kneeL: [0.15, 0, 1], footRotL: [0, -0.35, 0],
  footR: [0.2, 0.071, -0.2], kneeR: [0.5, 0, 1], footRotR: [0, 0.65, 0],
};

export function makePose(...partials) {
  const p = newPose();
  applyPartial(p, BASE);
  for (const x of partials) applyPartial(p, x);
  return p;
}

export const LIB = {
  base: {},
  stance: STANCE,
  jab: { ...STANCE, handL: [-0.12, 0.2, 0.98], twistL: 0.76, spine: [0.1, 0.0, 0], rootRot: [0.08, -0.6, 0], clavL: [0, 0.35] },
  straight: { ...STANCE, handR: [-0.6, 0.18, 0.98], twistR: 0.84, rootRot: [0.1, 0.1, 0], spine: [0.1, 0.45, 0], clavR: [0, 0.4],
    footR: [0.18, 0.071, -0.25], footRotR: [0.3, 0.5, 0], toeR: 0.5 },
  highkick: { ...STANCE, rootPos: [0, -0.02, -0.05], rootRot: [-0.25, -0.9, -0.15], spine: [0.15, 0.3, 0.2],
    footR: [0.05, 1.25, 0.55], kneeR: [0.3, 1, 0.3], footRotR: [-1.2, 0, 0], handL: [-0.1, 0.1, 0.5], handR: [0.45, -0.2, -0.1] },
  crouch: { ...STANCE, rootPos: [0, -0.28, -0.08], rootRot: [0.3, -0.6, 0], spine: [0.24, 0.1, 0],
    footL: [0.12, 0.071, 0.22], footR: [0.24, 0.071, -0.32], toeR: 0.9, footRotR: [0.4, 0.6, 0], kneeL: [0.12, 0, 1], kneeR: [0.2, -0.4, 1] },
};
