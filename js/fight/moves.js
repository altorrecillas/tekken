// Move library: frame data + keyframed animation per move. 60 logic frames per second.
// Hand targets with aim=1 are in character space (forward = +z = towards the opponent).
import { Clip } from '../anim/clip.js';
import { STANCE, BASE } from '../anim/poses.js';

const S = STANCE;

// ------------------------------------------------------------------ helpers
function merge(a, b) { return { ...a, ...b }; }
// The presentation's close-up outlasts every intro clip (it runs until the fighter has said the line), and the return
// to the stance at the clip's end raised the fists in front of the face while the line was still being said. The
// closing return (a null key) becomes the stance with the guard held low, at the chest: every channel the intro
// touched set back to the stance's, the fists lowered; the round start blends into the full guard
const TALK_GUARD = { hgL: 1, hgR: 1, hgPosL: [0.1, -0.33, 0.3], hgPosR: [0.14, -0.34, 0.18], fistL: 0.8, fistR: 0.8 };
function presentEnd(keys, st) {
  const touched = new Set();
  for (const [, p] of keys) if (p) for (const k in p) touched.add(k);
  const full = { ...BASE, ...st };
  return keys.map(([f, p, e]) => {
    if (p !== null) return [f, p, e];
    const q = {};
    for (const k of touched) q[k] = full[k];
    return [f, { ...q, ...TALK_GUARD }, e];
  });
}

// Reaction/motion clips shared by everybody (built per style so stance deltas apply)
export function buildClips(style) {
  const st = merge(S, style.stance || {});
  const C = (keys, opt = {}) => new Clip(keys, { base: st, ...opt });
  const clips = {};

  // ---------------------------------------------------------------- idle / movement
  const bob = style.bob ?? 0.018;
  clips.idle = C([
    [0, {}],
    [18, { rootPos: [0, (st.rootPos?.[1] ?? -0.075) - bob, st.rootPos?.[2] ?? -0.02], spine: [(st.spine?.[0] ?? 0.12) + 0.03, st.spine?.[1] ?? 0.12, 0] }, 'sine'],
    [36, null, 'sine'],
  ], { loop: true });
  // shuffle steps: the planted foot moves backwards at exactly the body speed (no foot sliding)
  // forward: 0.9 m/s -> 0.18 m per 12 frames ; back: 0.75 m/s -> 0.15 m per 12 frames
  const fL = st.footL || [0.05, 0.071, 0.24], fR = st.footR || [0.2, 0.071, -0.2];
  const WF = 0.18, WB = 0.15;
  clips.walkF = C([
    [0, { footL: [fL[0], 0.071, fL[2] - WF * 0.5], footR: [fR[0], 0.071, fR[2] + WF * 0.5] }],
    [6, { footL: [fL[0], 0.12, fL[2]], footR: [fR[0], 0.071, fR[2]], rootPos: [0, (st.rootPos?.[1] ?? -0.075) - 0.012, (st.rootPos?.[2] ?? -0.02) + 0.01] }, 'sine'],
    [12, { footL: [fL[0], 0.071, fL[2] + WF * 0.5], footR: [fR[0], 0.071, fR[2] - WF * 0.5], rootPos: [0, st.rootPos?.[1] ?? -0.075, st.rootPos?.[2] ?? -0.02] }, 'sine'],
    [18, { footL: [fL[0], 0.071, fL[2]], footR: [fR[0], 0.11, fR[2]], rootPos: [0, (st.rootPos?.[1] ?? -0.075) - 0.012, (st.rootPos?.[2] ?? -0.02) + 0.01] }, 'sine'],
    [24, { footL: [fL[0], 0.071, fL[2] - WF * 0.5], footR: [fR[0], 0.071, fR[2] + WF * 0.5], rootPos: [0, st.rootPos?.[1] ?? -0.075, st.rootPos?.[2] ?? -0.02] }, 'sine'],
  ], { loop: true });
  clips.walkB = C([
    [0, { footL: [fL[0], 0.071, fL[2] - WB * 0.5], footR: [fR[0], 0.071, fR[2] + WB * 0.5] }],
    [6, { footR: [fR[0], 0.11, fR[2]], footL: [fL[0], 0.071, fL[2]], rootPos: [0, (st.rootPos?.[1] ?? -0.075) - 0.01, (st.rootPos?.[2] ?? -0.02) - 0.01] }, 'sine'],
    [12, { footR: [fR[0], 0.071, fR[2] - WB * 0.5], footL: [fL[0], 0.071, fL[2] + WB * 0.5], rootPos: [0, st.rootPos?.[1] ?? -0.075, st.rootPos?.[2] ?? -0.02] }, 'sine'],
    [18, { footL: [fL[0], 0.11, fL[2]], footR: [fR[0], 0.071, fR[2]], rootPos: [0, (st.rootPos?.[1] ?? -0.075) - 0.01, (st.rootPos?.[2] ?? -0.02) - 0.01] }, 'sine'],
    [24, { footL: [fL[0], 0.071, fL[2] - WB * 0.5], footR: [fR[0], 0.071, fR[2] + WB * 0.5], rootPos: [0, st.rootPos?.[1] ?? -0.075, st.rootPos?.[2] ?? -0.02] }, 'sine'],
  ], { loop: true });
  // dashes: the body drives low and fast; the feet are left to the planter, which steps them as the hips run away
  // from them (authored lifts fought the actual displacement and made the feet skate)
  clips.dashF = C([
    [0, {}],
    [4, { rootPos: [0, -0.12, 0.05], rootRot: [0.2, -0.45, 0], spine: [0.2, 0.1, 0] }, 'out'],
    [10, { rootPos: [0, -0.1, 0.1], rootRot: [0.16, -0.45, 0] }, 'inout'],
    [16, null, 'inout'],
  ]);
  clips.dashB = C([
    [0, {}],
    [4, { rootPos: [0, -0.1, -0.1], rootRot: [-0.05, -0.5, 0], spine: [0.08, 0.12, 0] }, 'out'],
    [12, { rootPos: [0, -0.12, -0.12] }, 'inout'],
    [22, null, 'inout'],
  ]);
  clips.side = C([
    [0, {}],
    [6, { rootPos: [0.0, -0.13, 0], rootRot: [0.1, -0.2, 0.08], footL: [0.12, 0.12, 0.2], footR: [0.2, 0.071, -0.2] }, 'out'],
    [14, { rootPos: [0, -0.1, 0], footL: [0.05, 0.071, 0.24], footR: [0.28, 0.1, -0.12] }, 'inout'],
    [22, null, 'inout'],
  ]);
  clips.crouch = C([
    [0, {}],
    [6, { rootPos: [0, -0.28, -0.1], rootRot: [0.3, -0.6, 0], spine: [0.24, 0.1, 0], neck: [0.05, 0.2, 0],
      footL: [0.1, 0.071, 0.2], footR: [0.24, 0.071, -0.32], toeR: 0.9, footRotR: [0.55, 0.6, 0],
      kneeL: [0.12, 0, 1], kneeR: [0.2, -0.4, 1], hgPosL: [0.06, -0.06, 0.3], hgPosR: [0.1, -0.05, 0.12] }, 'out'],
  ]);
  clips.crouchIdle = C([
    [0, { rootPos: [0, -0.28, -0.1], rootRot: [0.3, -0.6, 0], spine: [0.24, 0.1, 0], neck: [0.05, 0.2, 0],
      footL: [0.1, 0.071, 0.2], footR: [0.24, 0.071, -0.32], toeR: 0.9, footRotR: [0.55, 0.6, 0],
      kneeL: [0.12, 0, 1], kneeR: [0.2, -0.4, 1], hgPosL: [0.06, -0.06, 0.3], hgPosR: [0.1, -0.05, 0.12] }],
    [20, { rootPos: [0, -0.29, -0.1] }, 'sine'],
    [40, { rootPos: [0, -0.28, -0.1] }, 'sine'],
  ], { loop: true });
  clips.jump = C([
    [0, {}],
    [5, { rootPos: [0, -0.2, 0], rootRot: [0.25, -0.45, 0] }, 'out'],
    [12, { rootPos: [0, 0.05, 0], footL: [0.1, 0.35, 0.15], footR: [0.2, 0.3, -0.05], kneeL: [0.2, 0.3, 1], toeL: -0.3 }, 'out'],
    [30, { rootPos: [0, 0.05, 0], footL: [0.1, 0.3, 0.2], footR: [0.2, 0.28, -0.1] }, 'inout'],
    [38, { rootPos: [0, -0.18, 0], rootRot: [0.25, -0.45, 0], footL: [0.05, 0.071, 0.24], footR: [0.2, 0.071, -0.2], kneeL: [0.15, 0, 1], toeL: 0 }, 'in'],
    [46, null, 'out'],
  ]);

  // ---------------------------------------------------------------- guard / reactions
  clips.blockHigh = C([
    [0, {}],
    [3, { handL: [-0.1, 0.3, 0.45], handR: [-0.28, 0.32, 0.36], spine: [0.2, 0.05, 0], neck: [0.2, 0.1, 0], rootPos: [0, -0.09, -0.06], clavL: [0.15, 0.2], clavR: [0.15, 0.2] }, 'snap'],
    [10, null, 'inout'],
  ]);
  clips.blockLow = C([
    [0, { rootPos: [0, -0.28, -0.1], rootRot: [0.3, -0.6, 0], spine: [0.24, 0.1, 0], footL: [0.1, 0.071, 0.2], footR: [0.24, 0.071, -0.32], toeR: 0.9, footRotR: [0.55, 0.6, 0], kneeL: [0.12, 0, 1], kneeR: [0.2, -0.4, 1] }],
    [3, { rootPos: [0, -0.3, -0.16], handL: [0.0, -0.1, 0.5], handR: [-0.2, 0.0, 0.45], spine: [0.36, 0.1, 0] }, 'snap'],
    [10, { rootPos: [0, -0.28, -0.1], spine: [0.24, 0.1, 0] }, 'inout'],
  ]);
  clips.hitHigh = C([
    [0, {}],
    [3, { rootPos: [0, -0.06, -0.1], rootRot: [-0.2, -0.3, 0.1], spine: [-0.35, -0.25, 0.15], neck: [-0.55, -0.4, 0.3],
      handL: [0.1, -0.1, 0.35], handR: [0.2, -0.25, 0.2], fistL: 0.5, fistR: 0.5, jaw: 0.25, look: 0 }, 'snap'],
    [14, { rootPos: [0, -0.1, -0.12], spine: [-0.1, -0.1, 0.05], neck: [-0.2, -0.1, 0.1], jaw: 0.1, look: 0.5 }, 'inout'],
    [26, null, 'inout'],
  ]);
  // body blow: the torso folds over the impact, hips pushed back and knees giving, both forearms close over the
  // stomach (elbows in, fists at the centre line without crossing it), then a short slump and a gradual rise into
  // the guard
  clips.hitMid = C([
    [0, {}],
    [3, { rootPos: [0, -0.15, -0.12], rootRot: [0.3, -0.3, 0], spine: [0.55, 0.05, 0], neck: [0.35, 0, 0],
      handL: [0.03, -0.36, 0.44], handR: [0.01, -0.33, 0.4], poleL: [0.2, -1, -0.3], poleR: [0.2, -1, -0.3], fistL: 0.6, fistR: 0.6,
      twistL: -0.8, twistR: -0.9, jaw: 0.4, look: 0, aimL: 0, aimR: 0 }, 'snap'],
    [8, { rootPos: [0, -0.17, -0.11], spine: [0.62, 0.02, 0], neck: [0.4, 0.05, 0], jaw: 0.3 }, 'inout'],
    [18, { rootPos: [0, -0.13, -0.08], rootRot: [0.2, -0.35, 0], spine: [0.35, 0.08, 0], neck: [0.22, 0.1, 0],
      handL: [0.03, -0.1, 0.52], handR: [0.0, -0.04, 0.46], fistL: 0.9, fistR: 0.9, jaw: 0.12, look: 0.5 }, 'inout'],
    [30, null, 'inout'],
  ]);
  clips.hitLow = C([
    [0, {}],
    [3, { rootPos: [0, -0.18, -0.05], rootRot: [0.15, -0.3, -0.2], spine: [0.3, 0, -0.2], footL: [0.1, 0.12, 0.12], kneeL: [0.6, 0, 1], jaw: 0.2, look: 0.3 }, 'snap'],
    [16, { rootPos: [0, -0.12, -0.04], footL: [0.05, 0.071, 0.22] }, 'inout'],
    [26, null, 'inout'],
  ]);
  // airborne (launched/juggled): body arched, limbs trailing
  clips.air = C([
    // the whole body tips back as one piece (no limbo backbend), then curls up as it falls
    // arms flail in the screen plane (side camera): one trails down and back under the arched body, the other
    // reaches up and forward towards the attacker. With the torso arched back the head sits right above-behind the
    // shoulders, so "up and back" (or sideways) hands overlap the head from the side
    // (the legs trail out along the body's line as it is blasted back: feet raised in front with the knees bent
    // read as sitting on a chair in mid-air). The trailing hand is flung out sideways first and only then swings
    // down and back: sent straight from the guard to behind the back, it went through the chest on the way
    [0, { rootRot: [-0.75, -0.3, 0.1], spine: [-0.15, 0, 0.1], neck: [-0.2, 0, 0], handL: [0.7, -0.25, 0.05], handR: [0.3, 0.5, 0.75],
      footL: [0.12, 0.33, 0.5], footR: [0.22, 0.24, 0.38], kneeL: [0.2, 0.4, 1], kneeR: [0.2, 0.3, 1], fistL: 0.3, fistR: 0.3, jaw: 0.3, look: 0, aimL: 1, aimR: 1 }],
    [20, { rootRot: [-1.05, -0.25, 0.15], spine: [0.12, 0.1, 0], neck: [0.15, 0, 0], handL: [0.3, -0.6, -0.7], handR: [0.3, 0.35, 0.8],
      footL: [0.2, 0.52, 0.64], footR: [0.2, 0.45, 0.55] }, 'inout'],
    // the body keeps tipping over as it falls, limbs going limp (a long juggle must not freeze on one pose)
    [34, { rootRot: [-1.4, -0.2, 0.2], spine: [0.2, 0.05, -0.05], neck: [0.1, 0.1, 0], handL: [0.35, -0.3, -0.75], handR: [0.4, 0.1, 0.6],
      fistL: 0.1, fistR: 0.1, footL: [0.18, 0.5, 0.55], footR: [0.25, 0.42, 0.45], kneeL: [0.3, 0.4, 1], jaw: 0.35 }, 'inout'],
    [50, { rootRot: [-1.7, -0.15, 0.1], spine: [0.15, 0, 0], neck: [0.05, 0, 0], handL: [0.4, 0.0, -0.8], handR: [0.45, 0.0, 0.5],
      footL: [0.2, 0.45, 0.6], footR: [0.22, 0.4, 0.5] }, 'inout'],
  ], { loop: false });
  // swept off the feet (low knockdown): the legs go out forwards from under him and the body tips back as one
  // piece, arms flung up then reaching back for the floor; a low, short flight that ends in the landing pose.
  // (the root drops faster than the short hop of the airborne state rises: the hips never go up)
  clips.swept = C([
    [0, { rootRot: [-0.2, 0, 0], spine: [0.05, 0, 0], neck: [0.1, 0, 0], footL: [0.1, 0.12, 0.42], footR: [0.2, 0.08, -0.02], kneeL: [0.15, 0.3, 1], kneeR: [0.2, 0, 1],
      handL: [0.4, 0.15, 0.35], handR: [0.45, 0.3, 0.15], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, look: 0, jaw: 0.3 }],
    // (the legs go out nearly straight, the body tipping back as one piece: legs raised with the knees bent in front
    // of a torso still upright read as sitting down in mid-air; the arms fly out sideways for balance)
    [6, { rootPos: [0, -0.12, -0.06], rootRot: [-0.75, 0.08, 0.08], spine: [0.06, 0, 0], neck: [0.25, 0, 0], footL: [0.12, 0.2, 0.62], footR: [0.2, 0.12, 0.36],
      kneeL: [0.2, 0.5, 1], kneeR: [0.2, 0.4, 1], handL: [0.62, 0.12, 0.1], handR: [0.62, 0.2, -0.05] }, 'inout'],
    [13, { rootPos: [0, -0.43, -0.15], rootRot: [-1.1, -0.08, 0.1], spine: [0.14, 0, 0], neck: [0.3, 0, 0], footL: [0.2, 0.45, 0.7], footR: [0.24, 0.38, 0.6],
      handL: [0.45, 0.1, -0.5], handR: [0.5, 0.1, 0.3], jaw: 0.35 }, 'inout'],
    // = the landing clip's first key
    [18, { rootPos: [0, -0.4, -0.2], rootRot: [-1.2, -0.2, 0.1], spine: [-0.2, 0, 0], neck: [0.1, 0, 0], footL: [0.2, 0.4, 0.5], footR: [0.25, 0.35, 0.45],
      handL: [0.4, 0.0, -0.8], handR: [0.45, 0.0, 0.5], fistL: 0.1, fistR: 0.1, footRotL: [-1.0, 0.2, 0], footRotR: [-1.2, 0.4, 0] }, 'inout'],
  ], { loop: false });
  // lying on the back
  // (the elbow hints are the stance's, spelled out so that the throws, which turn the victim's elbows out over the
  // thrower's arms, bring them back down as he lands: left out, they stayed out to the end of the throw and the lie
  // clip snapped them back, rolling both arms over in one frame)
  const LIE = { rootPos: [0, -0.82, -0.2], rootRot: [-1.52, -0.1, 0], spine: [0.05, 0, 0], neck: [0.25, 0, 0],
    handL: [0.6, -0.55, -0.1], handR: [0.55, -0.6, -0.15], aimL: 0, aimR: 0, fistL: 0.2, fistR: 0.2, poleL: [0.3, -1, -0.15], poleR: [0.25, -1, -0.25],
    footL: [0.2, 0.12, 0.62], footR: [0.28, 0.1, 0.72], kneeL: [0.3, 1, 0.3], kneeR: [0.3, 1, 0.3], footRotL: [-1.1, 0.2, 0], footRotR: [-1.3, 0.4, 0], look: 0, jaw: 0.1 };
  clips.lie = C([[0, LIE], [30, { ...LIE, spine: [0.08, 0, 0] }, 'sine'], [60, LIE, 'sine']], { loop: true });
  clips.land = C([
    // (the feet already point up as the body comes down: no twist of the ankles on impact)
    [0, { rootPos: [0, -0.4, -0.2], rootRot: [-1.2, -0.2, 0.1], spine: [-0.2, 0, 0], footL: [0.2, 0.4, 0.5], footR: [0.25, 0.35, 0.45], look: 0, aimL: 1, aimR: 1,
      handL: [0.4, 0.0, -0.8], handR: [0.45, 0.0, 0.5], fistL: 0.1, fistR: 0.1, footRotL: [-1.0, 0.2, 0], footRotR: [-1.2, 0.4, 0] }],
    // the head stays above the floor on impact (a strong neck bend buried it)
    [5, { ...LIE, rootPos: [0, -0.8, -0.2], spine: [0.1, 0, 0.1], neck: [0.05, 0, 0] }, 'in'],
    [9, { ...LIE, rootPos: [0, -0.775, -0.2], spine: [0.08, 0, 0.05] }, 'inout'],
    [15, LIE, 'inout'],
  ]);
  // getting up from the back: knees tuck, the torso curls up on the hands posted behind, the feet plant flat
  // under the hips, the weight rocks forward into a squat (heels coming up as the shins lean over the toes), the
  // hands leave the floor and rise into the guard as the legs straighten
  clips.getup = C([
    [0, LIE],
    [6, { ...LIE, rootPos: [0, -0.8, -0.2], rootRot: [-1.4, -0.12, 0], spine: [0.28, 0, 0], neck: [0.35, 0, 0],
      footL: [0.18, 0.2, 0.36], footR: [0.25, 0.18, 0.32], kneeL: [0.3, 1, 0.4], kneeR: [0.35, 1, 0.4], footRotL: [-0.5, 0.1, 0], footRotR: [-0.6, 0.3, 0],
      handL: [0.6, -0.62, -0.28], handR: [0.55, -0.66, -0.32] }, 'inout'],
    [12, { rootPos: [0, -0.66, -0.2], rootRot: [-0.9, -0.2, 0], spine: [0.55, 0, 0], neck: [0.3, 0, 0],
      footL: [0.14, 0.071, 0.3], footR: [0.26, 0.071, 0.12], kneeL: [0.3, 0.6, 1], kneeR: [0.35, 0.6, 1], footRotL: [0, -0.2, 0], footRotR: [0, 0.5, 0], toeL: 0, toeR: 0,
      handL: [0.55, -0.76, -0.34], handR: [0.5, -0.8, -0.3], aimL: 0, aimR: 0, fistL: 0.25, fistR: 0.25, look: 0.3 }, 'inout'],
    [20, { rootPos: [0, -0.46, -0.12], rootRot: [0.35, -0.3, 0], spine: [0.35, 0, 0], neck: [0.2, 0.1, 0],
      footL: [0.12, 0.071, 0.26], footR: [0.25, 0.071, -0.1], kneeL: [0.3, 0.3, 1], kneeR: [0.4, 0.2, 1], footRotL: [0.2, -0.3, 0], footRotR: [0.35, 0.6, 0],
      handL: [0.2, -0.4, 0.45], handR: [0.25, -0.45, 0.35], fistL: 0.6, fistR: 0.6, look: 0.6 }, 'inout'],
    [27, { rootPos: [0, -0.2, -0.05], rootRot: [0.15, -0.4, 0], spine: [0.2, 0.06, 0], neck: [0.16, 0.16, 0],
      footL: [0.07, 0.071, 0.25], footR: [0.21, 0.071, -0.18], kneeL: [0.2, 0.1, 1], kneeR: [0.45, 0.05, 1], footRotL: [0, -0.35, 0], footRotR: [0.1, 0.65, 0],
      handL: [0.05, 0.05, 0.55], handR: [-0.02, 0.12, 0.45], fistL: 1, fistR: 1, look: 1 }, 'inout'],
    [34, null, 'inout'],
  ]);
  clips.ko = clips.lie;
  // throws (grabbed / grabbing) are built by moves that use them
  clips.thrownFront = C([
    [0, { rootPos: [0, -0.06, 0], spine: [0.3, 0, 0], handL: [0.2, -0.2, 0.4], handR: [0.2, -0.2, 0.4], look: 0, jaw: 0.3 }],
    [20, { rootPos: [0, 0.1, 0.1], rootRot: [-0.4, 0, 0], spine: [-0.4, 0, 0], footL: [0.15, 0.3, 0.2], footR: [0.2, 0.25, 0.1] }, 'inout'],
    [34, { ...LIE, rootPos: [0, -0.2, -0.3], rootRot: [-1.6, 0, 0] }, 'in'],
    [44, LIE, 'out'],
  ]);

  // victim sides of the throws (js/fight/throws.js scripts the position; hands grip the thrower's arms / shoulders)
  // (grabbed: the feet slide back under the hips that are being pulled in, the lead foot out of the way of the
  // thrower's, which stands on the same line)
  const GRAB0 = { rootPos: [0, -0.06, 0], spine: [0.15, 0, 0], handL: [0.18, -0.02, 0.45], handR: [0.12, -0.02, 0.45], aimL: 0, aimR: 0,
    fistL: 0.3, fistR: 0.3, look: 0, jaw: 0.25, footL: [0.17, 0.071, 0.06], footR: [0.22, 0.071, -0.28], footRotL: [0, -0.2, 0] };
  clips.thrownKnee = C([
    [0, GRAB0],
    [8, { rootPos: [0, -0.13, -0.08], rootRot: [0.2, 0, 0], spine: [0.25, 0, 0], neck: [0.2, 0, 0] }, 'inout'],
    [17, { rootPos: [0, -0.16, -0.12], rootRot: [0.28, 0, 0], spine: [0.45, 0, 0], neck: [0.25, 0, 0], jaw: 0.45 }, 'snap'],
    [24, { rootPos: [0, -0.15, -0.1], rootRot: [0.24, 0, 0], spine: [0.34, 0, 0], jaw: 0.25 }, 'inout'],
    [31, { rootPos: [0, -0.12, -0.14], rootRot: [0.32, 0, 0], spine: [0.5, 0, 0], neck: [0.3, 0, 0], jaw: 0.5 }, 'snap'],
    [38, { rootPos: [0, -0.18, -0.1], rootRot: [0.28, 0, 0], spine: [0.4, 0, 0], jaw: 0.3 }, 'inout'],
    [44, { ...LIE, rootPos: [0, -0.5, -0.25], rootRot: [-0.9, -0.05, 0], spine: [0.1, 0, 0], handL: [0.5, -0.2, -0.1], handR: [0.45, -0.15, -0.05] }, 'in'],
    [48, LIE, 'in'],
    [60, LIE, 'inout'],
  ]);
  clips.thrownHug = C([
    [0, GRAB0],
    // (elbows out: his arms go over the thrower's, onto his shoulders)
    [10, { rootPos: [0, -0.03, 0.02], rootRot: [0.05, 0, 0], spine: [-0.05, 0, 0], neck: [-0.05, 0, 0], poleL: [1, 0.25, 0], poleR: [1, 0.25, 0] }, 'inout'],
    // lifted against the thrower's chest: body pressed onto him, upper back arching in the squeeze, legs hanging
    [20, { rootPos: [0, 0, 0.02], rootRot: [0.2, 0, 0], spine: [-0.05, 0, 0], neck: [-0.2, 0, 0], jaw: 0.45,
      footL: [0.17, 0.02, -0.22], footR: [0.21, 0.0, -0.27], kneeL: [0.1, 0, 1], kneeR: [0.1, 0, 1], footRotL: [0.6, 0, 0], footRotR: [0.6, 0.2, 0] }, 'inout'],
    [26, { spine: [-0.22, 0.1, 0], neck: [-0.35, 0.1, 0], jaw: 0.55 }, 'snap'],
    [30, { spine: [-0.12, -0.05, 0], neck: [-0.2, -0.05, 0], jaw: 0.4 }, 'inout'],
    [33, { spine: [-0.25, -0.1, 0], neck: [-0.4, -0.1, 0], jaw: 0.6 }, 'snap'],
    [38, { spine: [-0.15, 0, 0], neck: [-0.25, 0, 0] }, 'inout'],
    [44, { ...LIE, rootPos: [0, -0.45, -0.1], rootRot: [-1.1, -0.1, 0], handL: [0.5, -0.2, -0.1], handR: [0.45, -0.15, -0.05] }, 'in'],
    [48, LIE, 'in'],
    [60, LIE, 'inout'],
  ]);
  // over the thrower's shoulder: a forward flip of three quarters of a turn lands flat on the back (pitch 4.76 is
  // the lying orientation, -1.52, one turn on; the match snaps the channel when the lie clip takes over)
  const LIEF = { ...LIE, rootRot: [LIE.rootRot[0] + Math.PI * 2, LIE.rootRot[1], LIE.rootRot[2]],
    footRotL: [LIE.footRotL[0] + Math.PI * 2, LIE.footRotL[1], LIE.footRotL[2]], footRotR: [LIE.footRotR[0] + Math.PI * 2, LIE.footRotR[1], LIE.footRotR[2]] };
  clips.thrownSuplex = C([
    [0, GRAB0],
    [10, { rootPos: [0, -0.02, 0.02], rootRot: [-0.05, 0, 0], spine: [-0.05, 0, 0], poleL: [1, 0.25, 0], poleR: [1, 0.25, 0] }, 'inout'],
    [17, { rootRot: [0.15, 0, 0], jaw: 0.45, footL: [0.12, -0.1, 0.02], footR: [0.16, -0.12, -0.04], footRotL: [0.6, 0, 0], footRotR: [0.6, 0.2, 0] }, 'inout'],
    // over the top and down, flat on the back as the slam lands (t 37). The feet are set in character space, so
    // through the flip they are placed along the body's axis (legs straight on from the hips, knees and toes
    // turning with the body): left where they were, the legs pointed at the floor while the body was upside down
    // and he landed folded like a bridge
    [21, { rootPos: [0, 0.04, 0], rootRot: [0.9, 0, 0.05], footL: [0.13, 0.48, -0.58], footR: [0.19, 0.46, -0.55], kneeL: [0.2, -0.78, 0.62], kneeR: [0.2, -0.78, 0.62],
      footRotL: [1.3, 0, 0], footRotR: [1.3, 0.2, 0] }, 'inout'],
    [25, { rootPos: [0, 0.08, 0], rootRot: [1.7, 0, 0.1], spine: [0.15, 0, 0], neck: [0.1, 0, 0], footL: [0.13, 1.08, -0.73], footR: [0.19, 1.06, -0.7],
      kneeL: [0.2, -1, -0.1], kneeR: [0.2, -1, -0.1], footRotL: [2.1, 0, 0], footRotR: [2.1, 0.2, 0], handL: [0.6, 0.2, 0.1], handR: [0.55, 0.25, 0.05], aimL: 1, aimR: 1, fistL: 0.2, fistR: 0.2,
      poleL: [0.3, -1, -0.15], poleR: [0.25, -1, -0.25] }, 'inout'],
    [28, { rootPos: [0, 0.05, 0], rootRot: [2.5, 0, 0.1], footL: [0.13, 1.54, -0.44], footR: [0.19, 1.52, -0.42], kneeL: [0.2, -0.6, -0.8], kneeR: [0.2, -0.6, -0.8],
      footRotL: [2.9, 0, 0], footRotR: [2.9, 0.2, 0] }, 'inout'],
    [31, { rootPos: [0, 0, 0], rootRot: [3.25, 0, 0.1], spine: [0.05, 0, 0], footL: [0.13, 1.64, 0.08], footR: [0.19, 1.62, 0.1], kneeL: [0.2, 0.1, -1], kneeR: [0.2, 0.1, -1],
      footRotL: [3.65, 0, 0], footRotR: [3.65, 0.2, 0] }, 'inout'],
    [34, { rootPos: [0, -0.35, -0.1], rootRot: [3.95, -0.05, 0.05], footL: [0.13, 1.06, 0.44], footR: [0.19, 1.04, 0.46], kneeL: [0.2, 0.72, -0.69], kneeR: [0.2, 0.72, -0.69],
      footRotL: [4.35, 0.1, 0], footRotR: [4.35, 0.3, 0] }, 'in'],
    [36, { ...LIEF, rootPos: [0, -0.7, -0.2], rootRot: [4.62, -0.1, 0], footL: [0.13, 0.27, 0.54], footR: [0.19, 0.25, 0.58] }, 'in'],
    [40, LIEF, 'out'],
    [58, LIEF, 'inout'],
  ]);

  // ---------------------------------------------------------------- intro / win / taunt
  clips.intro = C(presentEnd(style.intro || [
    [0, { rootPos: [0, 0, 0], rootRot: [0, 0, 0], spine: [0, 0, 0], handL: [0.35, -0.75, 0.25], handR: [0.35, -0.75, 0.25], fistL: 0.2, fistR: 0.2, aimL: 0, aimR: 0,
      footL: [0.12, 0.071, 0.02], footR: [0.12, 0.071, 0.0], footRotL: [0, 0, 0], footRotR: [0, 0, 0], neck: [0, 0, 0] }],
    [40, { neck: [0.2, 0.3, 0] }, 'inout'],
    [70, { handL: [-0.1, 0.15, 0.55], handR: [-0.2, 0.18, 0.4], fistL: 1, fistR: 1, neck: [-0.1, 0, 0] }, 'back'],
    [90, null, 'inout'],
  ], st));
  clips.win = C(style.win || [
    [0, {}],
    [20, { rootPos: [0, 0, 0], rootRot: [-0.05, 0, 0], spine: [-0.15, 0, 0], neck: [-0.3, 0, 0], handL: [0.1, 0.95, 0.1], handR: [0.1, 0.95, 0.1], aimL: 1, aimR: 1, fistL: 1, fistR: 1,
      footL: [0.18, 0.071, 0.05], footR: [0.18, 0.071, -0.05], footRotL: [0, 0.2, 0], footRotR: [0, 0.2, 0], jaw: 0.35 }, 'back'],
    [60, { neck: [-0.2, 0, 0], jaw: 0.1 }, 'inout'],
    [90, { handL: [0.12, 0.9, 0.15], handR: [0.08, 0.95, 0.1] }, 'sine'],
  ]);
  return clips;
}

// ------------------------------------------------------------------ attack definitions
// hit: { f: [first, last] active frames, limb, r, dmg, lvl: 'high'|'mid'|'low'|'smid', react, blk, hit (frame adv),
//        push, launch: vy, kd: knockdown, ch: counter-hit extras }
// cancel: { from, to, next: {'1': 'name'} } string follow-ups
// advance: [[frame, metres]] physical forward motion curve
// the generic moves' return to the guard (the boxer's chest-space hand targets) becomes each fighter's own guard: the
// face-relative hand goal of his stance (hg), the one the idle holds. With the literal targets a fighter with a lower
// guard (Noemí) brought her fists up to her face after every punch and dropped them again once idle
const GUARD_HAND = { L: [0.02, 0.2, 0.62], R: [-0.08, 0.3, 0.44] };
const isGuard = (v, g) => Array.isArray(v) && v.length === 3 && v.every((x, i) => Math.abs(x - g[i]) < 1e-6);
function toOwnGuard(key) {
  const [f, p, e] = key;
  if (!p) return key;
  let q = p;
  for (const s of ['L', 'R']) if (isGuard(p['hand' + s], GUARD_HAND[s]) && !(('hg' + s) in p)) q = { ...q, ['hg' + s]: 1 };
  return q === p ? key : [f, q, e];
}

export function buildMoves(style) {
  const st = merge(S, style.stance || {});
  const C = (keys) => new Clip(keys.map(toOwnGuard), { base: st });
  const M = {};
  // straight punches land with the fist closed (a fighter whose guard has open hands too) and in line with the
  // forearm. The fist turns over on the way out (twist: + pronates, the palm turning down; - supinates): in the guard
  // it stands on edge, palm towards the other fist and a little towards the face (the stance's own twist, TG), and a
  // straight punch lands with the knuckles level, the palm down and canted about 15 degrees in, the way a boxer's fist
  // does. (The first values turned it the wrong way: every jab, straight and lunge landed palm up.) With the palm down
  // the stance's slight wrist flexion is what keeps the fist straight on the forearm (WRP; 0.32 had compensated the
  // upturned fist and now bent it 12 degrees up). The values are measured at each hit frame with tools/palmaudit.mjs
  const WR = st.wristL || [0.12, 0], WRP = [0.1, 0], WRM = WR;
  const TG = { L: st.twistL ?? -0.4, R: st.twistR ?? -0.55 };

  // --- 1: jab
  M.jab = {
    name: 'Jab', total: 26, clip: C([
      [0, {}],
      // (the fist closes as the punch leaves: a fighter whose guard has open hands lands it with the knuckles)
      [3, { handL: [-0.04, 0.12, 0.5], rootPos: [0, -0.085, -0.03], fistL: 1, wristL: WRM, twistL: 0.15 }, 'out'],
      [9, { handL: [0.02, 0.1, 0.99], aimL: 1, twistL: 0.76, clavL: [0.05, 0.45], rootRot: [0.1, -0.62, 0], rootPos: [0, -0.09, 0.07], spine: [0.12, -0.02, 0], fistL: 1, wristL: WRP }, 'snap'],
      [11, {}, 'lin'],
      // recoil: the fist comes straight back along its path to the guard, the shoulder leads the return
      [15, { handL: [0.0, 0.16, 0.7], twistL: 0.1, clavL: [0.0, 0.22], rootRot: [0.08, -0.52, 0], rootPos: [0, -0.08, 0.02], spine: [0.11, 0.06, 0] }, 'ret'],
      [20, { handL: [0.02, 0.2, 0.62], aimL: 0, twistL: TG.L, wristL: WR, clavL: [-0.05, 0.1], rootRot: [0.06, -0.45, 0], rootPos: [0, -0.075, -0.02], spine: [0.1, 0.12, 0] }, 'inout'],
      [26, {}, 'inout'],
    ]),
    hit: { f: [9, 11], limb: 'handL', r: 0.09, dmg: 6, lvl: 'high', react: 'hitHigh', blk: 1, hitAdv: 8, push: 0.12 },
    advance: [[0, 0], [9, 0.08], [26, 0.05]],
    cancel: { from: 10, to: 22, next: { '2': 'onetwo', '1': 'jab2' } },
    sfx: 'light',
  };
  M.jab2 = { ...M.jab, name: 'Double jab', cancel: { from: 10, to: 20, next: { '2': 'onetwo' } }, hit: { ...M.jab.hit, dmg: 5 } };
  // --- 1,2 / 2: straight
  const straightKeys = [
    [0, {}],
    [4, { rootRot: [0.08, -0.6, 0], handR: [-0.2, 0.16, 0.36], fistR: 1, wristR: WRM, twistR: 0.2 }, 'out'],
    [11, { handR: [-0.06, 0.1, 1.0], aimR: 1, twistR: 0.84, fistR: 1, wristR: WRP, clavR: [0.05, 0.5], rootRot: [0.14, 0.12, 0], spine: [0.1, 0.45, 0], rootPos: [0, -0.1, 0.08],
      footR: [0.18, 0.1, -0.2], footRotR: [0.45, 0.2, 0], toeR: 0.6, handL: [-0.25, 0.2, 0.35], neck: [0, -0.3, 0] }, 'snap'],
    [13, {}, 'lin'],
    // recoil: fist back on its line, hips turn back, the rear heel comes down
    [18, { handR: [-0.14, 0.2, 0.62], twistR: 0.15, clavR: [0.0, 0.25], rootRot: [0.1, -0.2, 0], spine: [0.1, 0.25, 0], rootPos: [0, -0.09, 0.03],
      footRotR: [0.2, 0.4, 0], toeR: 0.3 }, 'ret'],
    [25, { handR: [-0.08, 0.3, 0.44], aimR: 0, twistR: TG.R, wristR: WR, clavR: [-0.05, 0.12], rootRot: [0.06, -0.45, 0], spine: [0.1, 0.12, 0], rootPos: [0, -0.075, -0.02],
      footR: [0.2, 0.071, -0.2], footRotR: [0, 0.65, 0], toeR: 0, handL: [0.02, 0.2, 0.62], neck: [0.16, 0.2, 0] }, 'inout'],
    [30, {}, 'inout'],
  ];
  M.straight = {
    name: 'Straight', total: 30, clip: C(straightKeys),
    hit: { f: [11, 13], limb: 'handR', r: 0.1, dmg: 11, lvl: 'high', react: 'hitHigh', blk: -2, hitAdv: 6, push: 0.2 },
    advance: [[0, 0], [11, 0.12], [30, 0.1]], sfx: 'mid',
    cancel: { from: 12, to: 24, next: { '4': style.onetwoFinish || null } },
  };
  M.onetwo = { ...M.straight, name: '1,2', total: 28, hit: { ...M.straight.hit, f: [9, 11], dmg: 10 },
    clip: C(straightKeys.map(([f, p, e]) => [Math.max(0, Math.round(f * 0.85)), p, e])) };
  // --- 3: front kick (mid). The lead knee comes up with the foot tucked under it, then the leg drives out almost
  // straight at stomach height, the hips pushed through and the trunk leaning back a little over the support leg, the
  // ball of the foot first; the shin folds back in under the raised knee before the foot comes down. (The foot used to
  // stop a third of a metre short of a straight leg, at hip height: the shin hung down from a raised knee, a knee lift
  // more than a kick.) The reach is the same as before: the body no longer steps in behind the kick. The guard stays
  // at the face (the hands used to drop to the chest and open out, elbows wide) and the eyes on the target as the trunk
  // leans back; the rear fist a little further out than the guard, or the chin met it
  M.frontKick = {
    name: 'Front kick', total: 34, clip: C([
      [0, {}],
      [5, { footL: [0.05, 0.34, 0.26], kneeL: [0.1, 0.5, 1], footRotL: [-0.25, -0.3, 0], rootPos: [0, -0.06, -0.05], rootRot: [-0.08, -0.4, 0], spine: [0.12, 0.1, 0] }, 'inout'],
      [13, { footL: [0.04, 0.8, 0.9], kneeL: [0.1, 0.8, 0.6], footRotL: [-1.25, -0.2, 0], toeL: -0.6, rootRot: [-0.3, -0.35, 0], spine: [0.1, 0.1, 0], rootPos: [0, -0.05, -0.02],
        handR: [-0.06, 0.24, 0.52], neck: [0.3, 0.15, 0] }, 'drive'],
      [16, {}, 'lin'],
      [24, { footL: [0.05, 0.42, 0.36], kneeL: [0.1, 0.5, 1], footRotL: [-0.15, -0.35, 0], toeL: 0, rootRot: [-0.04, -0.45, 0], rootPos: [0, -0.06, -0.03], neck: [0.24, 0.2, 0], handR: GUARD_HAND.R }, 'inout'],
      [34, null, 'inout'],
    ]),
    hit: { f: [13, 15], limb: 'footL', r: 0.11, dmg: 13, lvl: 'mid', react: 'hitMid', blk: -6, hitAdv: 4, push: 0.3 },
    advance: [[0, 0], [13, 0.03], [34, 0.03]], sfx: 'kick',
  };
  // --- 4: high roundhouse (rear leg). The hips turn TOWARDS the target (positive yaw) so the kicking leg opens
  // sideways from the pelvis (abduction), the support foot pivots out on its ball with the knee over the toes,
  // the knee chambers across before the shin whips round at head height, the torso leans away as counterweight
  // and the same-side arm swings down along the body and back past the hip (it used to go to the hip and stay bent
  // behind like a wing); the lead fist stays on the chin and the eyes on the target (the head went back with the trunk
  // and looked at the sky).
  M.roundhouse = {
    name: 'High kick', total: 40, clip: C([
      [0, {}],
      // weight onto the lead leg, rear heel peels off the floor, hips start to open
      [4, { rootPos: [0, -0.085, 0.03], rootRot: [0.05, -0.2, -0.02], spine: [0.1, 0.02, 0], neck: [0.12, 0.05, 0],
        footRotR: [0.55, 0.65, 0], footRotL: [0.05, 0.15, 0], handR: [0.2, -0.2, 0.26] }, 'inout'],
      // chamber: knee up and across, foot tucked, hips half turned and already tilting, chest still towards the
      // opponent
      [9, { rootPos: [0, -0.06, 0.02], rootRot: [-0.1, 0.55, -0.3], spine: [0.06, -0.35, 0], neck: [0.22, -0.45, 0.08],
        footR: [0.3, 0.5, 0.2], kneeR: [0.25, 0.15, 1], footRotR: [-0.2, 0.3, 0.6], toeR: -0.3,
        footL: [0.05, 0.071, 0.25], footRotL: [0.18, 0.85, 0],
        handR: [0.14, -0.88, 0.1], poleR: [0.2, 0, -1], twistR: -0.2 }, 'inout'],
      // extension: hips fully over (right hip up), leg straight at head height, torso leaning away. The hips tilt
      // over a good way and the spine straightens against them: tilted 25 degrees, the leg was raised 20 degrees
      // further out from the pelvis than a hip opens
      [15, { rootPos: [0, -0.04, -0.02], rootRot: [-0.34, 1.3, -0.7], spine: [0.1, -0.6, 0.12], neck: [0.55, -0.8, 0.22],
        footR: [0.0, 1.2, 0.88], kneeR: [0.35, 1, 0.15], footRotR: [-0.25, 0.1, 1.2], toeR: -0.4,
        footRotL: [0.25, 1.2, 0],
        handR: [0.16, -0.8, -0.4] }, 'drive'],
      [18, {}, 'lin'],
      // recovery: the knee re-chambers on the way back, hips unwind
      [24, { rootPos: [0, -0.06, 0.0], rootRot: [-0.12, 0.6, -0.15], spine: [0.08, -0.3, -0.05], neck: [0.3, -0.4, 0.06],
        footR: [0.3, 0.44, 0.14], kneeR: [0.25, 0.15, 1], footRotR: [-0.1, 0.4, 0.4], toeR: -0.1,
        footRotL: [0.1, 0.8, 0], handR: [0.22, -0.5, 0.06], poleR: [0.25, -1, -0.25] }, 'inout'],
      // the foot lands behind on its ball, the guard comes back
      [31, { rootPos: [0, -0.085, -0.02], rootRot: [0.04, -0.25, -0.02], spine: [0.1, 0.05, 0], neck: [0.16, 0.15, 0],
        footR: [0.2, 0.071, -0.19], kneeR: [0.5, 0, 1], footRotR: [0.3, 0.65, 0], toeR: 0,
        footRotL: [0, -0.2, 0], handR: [-0.08, 0.3, 0.44], aimR: 0, twistR: TG.R }, 'inout'],
      [40, null, 'inout'],
    ]),
    hit: { f: [15, 17], limb: 'footR', r: 0.12, dmg: 18, lvl: 'high', react: 'hitHigh', blk: -9, hitAdv: 3, push: 0.35, ch: { kd: true } },
    advance: [[0, 0], [15, 0.06], [40, 0.04]], sfx: 'heavy',
  };
  // --- d+3: low kick (the knee kept a little bent at full reach: locked straight, it read stiff)
  M.lowKick = { name: 'Low kick', total: 32 };
  M.lowKick.clip = C([
    [0, {}],
    [5, { rootPos: [0, -0.14, -0.05], rootRot: [0.1, -0.6, 0], footL: [0.1, 0.15, 0.2] }, 'inout'],
    [13, { rootPos: [0, -0.18, -0.06], rootRot: [-0.1, -0.7, -0.1], spine: [0.2, 0.2, 0.1], footL: [0.02, 0.16, 0.72], kneeL: [0.3, 0.4, 1], footRotL: [-0.3, -0.6, 0.4], neck: [0.2, 0.3, 0] }, 'drive'],
    [16, {}, 'lin'],
    [21, { rootPos: [0, -0.14, -0.04], rootRot: [0.02, -0.6, -0.04], spine: [0.15, 0.15, 0.05], footL: [0.06, 0.16, 0.36], kneeL: [0.25, 0.3, 1], footRotL: [-0.1, -0.5, 0.2] }, 'inout'],
    [32, { rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.1, 0.12, 0], footL: [0.05, 0.071, 0.24], kneeL: [0.15, 0, 1], footRotL: [0, -0.35, 0], neck: [0.16, 0.2, 0] }, 'inout'],
  ]);
  Object.assign(M.lowKick, { hit: { f: [13, 14], limb: 'footL', r: 0.11, dmg: 9, lvl: 'low', react: 'hitLow', blk: -12, hitAdv: -2, push: 0.15 },
    advance: [[0, 0], [13, 0.1], [32, 0.1]], sfx: 'kick' });
  // --- d+4: sweep (from crouch). A low spin on the ball of the lead foot: the lead hand posts on the floor beside
  // it, the hips turn towards the target (positive yaw) so the extended rear leg sweeps round from behind at ankle
  // height, abducted from the pelvis (never across it); the rear arm opens for balance and the chest faces the
  // opponent over the posted arm. The leg comes back tucked under the body before standing up.
  M.sweep = {
    name: 'Sweep', total: 46, clip: C([
      [0, { rootPos: [0, -0.28, -0.1], rootRot: [0.3, -0.6, 0], spine: [0.24, 0.1, 0] }],
      // sink onto the lead leg, the rear leg sliding out behind. The lead hand stays up in a guard drawn in close, at
      // the chin (the face stays in view): from this crouch it cannot reach the floor (posted beside the knee it hung
      // in the air like a claw at the ankle, the forearm through the thigh), and the stance's guard, held out in front
      // of a face that leans this far forward, poked the opponent's thigh at close range. The rear hand rises out of
      // its own thigh's way
      [7, { rootPos: [0, -0.44, -0.06], rootRot: [0.38, -0.35, 0.04], spine: [0.38, 0.05, 0], neck: [-0.04, 0.2, 0],
        footL: [0.2, 0.071, 0.2], footRotL: [0.45, 0.05, 0], kneeL: [0.45, 0.1, 1],
        footR: [0.45, 0.1, -0.32], kneeR: [0.6, 0.3, 0.2], footRotR: [0.1, 0.9, 0.3],
        hgPosL: [0.1, -0.2, 0.24], handR: [0.08, 0.08, 0.5], aimR: 0 }, 'inout'],
      // the hips turn round the planted lead foot (they swing out to the right as they turn: turned about their own
      // centre, the lead foot ended up across the body and the hip folded past its limit) and the straight rear leg
      // swings out to the side, skimming the floor just above where a planted foot is held flat
      [13, { rootPos: [-0.055, -0.44, -0.04], rootRot: [0.3, 0.4, -0.06], spine: [0.5, -0.35, 0], neck: [-0.06, -0.35, 0],
        footL: [0.2, 0.071, 0.2], footRotL: [0.5, 0.6, 0],
        footR: [0.78, 0.135, 0.3], kneeR: [0.2, 1, 0.3], footRotR: [0, 1.0, 1.2],
        handR: [0.1, 0.0, 0.5] }, 'inout'],
      // impact: the leg sweeps through the front at ankle height, the rear arm swung back against it (the hips
      // dip a little lower for it: the leg reaches as far as it used to)
      [18, { rootPos: [-0.13, -0.47, -0.005], rootRot: [0.3, 0.9, -0.08], spine: [0.5, -0.55, 0], neck: [-0.04, -0.7, 0],
        footL: [0.2, 0.071, 0.2], footRotL: [0.5, 0.9, 0],
        footR: [0.1, 0.135, 0.98], kneeR: [0.1, 1, 0.2], footRotR: [0, 0.5, 1.3],
        handR: [0.12, -0.04, 0.48] }, 'drive'],
      [21, {}, 'lin'],
      // the hips start back up and round; the sweeping foot rolls back flat while it is still off the floor and the
      // rear hand comes round outside the hip
      [25, { rootPos: [-0.12, -0.42, -0.03], rootRot: [0.28, 0.8, -0.06], spine: [0.45, -0.5, 0],
        footR: [0.22, 0.14, 0.72], footRotR: [0.1, 0.6, 0.55], handR: [0.1, 0.0, 0.48] }, 'inout'],
      // the leg folds back in under the hips, the foot still just off the floor so that it lands slowly where the
      // stance wants it (set down here in full flight, it was pinned to the floor mid-swing); the lead foot turns
      // back in under its knee
      [30, { rootPos: [-0.12, -0.38, -0.05], rootRot: [0.3, 0.55, -0.04], spine: [0.2, -0.4, 0], neck: [0.14, -0.4, 0],
        footL: [0.14, 0.071, 0.22], kneeL: [0.3, 0.05, 1], footRotL: [0.3, 0.6, 0],
        footR: [0.3, 0.09, 0.15], kneeR: [0.4, 0.4, 1], footRotR: [0.2, 0.7, 0],
        handR: [0.04, 0.08, 0.46] }, 'inout'],
      [38, { rootPos: [0, -0.3, -0.06], rootRot: [0.3, -0.2, 0], spine: [0.2, 0.05, 0], neck: [0.14, 0.1, 0],
        footL: [0.08, 0.071, 0.24], footRotL: [0.1, -0.2, 0], kneeL: [0.2, 0, 1],
        footR: [0.22, 0.071, -0.18], kneeR: [0.5, 0, 1], footRotR: [0.25, 0.65, 0],
        hgPosL: st.hgPosL, handR: [-0.08, 0.3, 0.44], aimR: 0 }, 'inout'],
      [46, { rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.1, 0.12, 0], neck: [0.16, 0.2, 0],
        footL: [0.05, 0.071, 0.24], kneeL: [0.15, 0, 1], footRotL: [0, -0.35, 0], footR: [0.2, 0.071, -0.2], footRotR: [0, 0.65, 0] }, 'inout'],
    ]),
    hit: { f: [18, 20], limb: 'footR', r: 0.13, dmg: 14, lvl: 'low', react: 'hitLow', blk: -18, kd: true, push: 0.2 },
    advance: [[0, 0], [18, 0.16], [46, 0.16]], sfx: 'kick', crouchStart: true,
  };
  // --- df+1: mid punch to the body
  M.bodyJab = {
    name: 'Body blow', total: 32, clip: C([
      [0, {}],
      [4, { rootPos: [0, -0.14, -0.02], handL: [0.05, -0.05, 0.45], fistL: 1, wristL: WRM }, 'out'],
      [12, { rootPos: [0, -0.2, 0.08], rootRot: [0.28, -0.6, 0], spine: [0.3, -0.05, 0], handL: [0.02, -0.25, 1.0], aimL: 1, twistL: 0.17, wristL: WRP, clavL: [0, 0.4], footL: [0.05, 0.071, 0.34], kneeL: [0.2, 0, 1] }, 'snap'],
      [15, {}, 'lin'],
      [20, { rootPos: [0, -0.16, 0.04], rootRot: [0.2, -0.52, 0], spine: [0.22, 0.05, 0], handL: [0.03, 0.02, 0.62], twistL: -0.1, clavL: [0, 0.2] }, 'ret'],
      [32, { rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.1, 0.12, 0], handL: [0.02, 0.2, 0.62], aimL: 0, twistL: TG.L, wristL: WR, clavL: [-0.05, 0.1], footL: [0.05, 0.071, 0.24] }, 'inout'],
    ]),
    hit: { f: [12, 14], limb: 'handL', r: 0.1, dmg: 11, lvl: 'mid', react: 'hitMid', blk: -1, hitAdv: 5, push: 0.2 },
    advance: [[0, 0], [12, 0.15], [32, 0.13]], sfx: 'mid',
  };
  // --- df+2: uppercut launcher
  M.uppercut = {
    name: 'Uppercut', total: 44, clip: C([
      [0, {}],
      [6, { rootPos: [0, -0.2, 0.0], rootRot: [0.3, -0.7, 0], spine: [0.35, -0.2, 0], handR: [0.1, -0.5, 0.3], aimR: 1, twistR: -0.45, fistR: 1, kneeL: [0.3, 0, 1] }, 'out'],
      // bent-elbow uppercut driven by the legs and hips: the fist travels up AND forward, meeting the chin about
      // two feet in front of the attacker (the old arc rose in front of his own face and never reached anyone),
      // then follows through upwards (the palm turned up towards him, the forearm supinated, as an uppercut is
      // thrown)
      [15, { rootPos: [0, -0.06, 0.12], rootRot: [0.12, 0.25, 0], spine: [0.05, 0.45, 0], handR: [-0.12, 0.08, 0.72], poleR: [0.1, -1, 0.2], aimR: 1, twistR: -0.92, clavR: [0.25, 0.45],
        footR: [0.18, 0.12, -0.15], toeR: 0.7, footRotR: [0.4, 0.3, 0], kneeL: [0.22, 0, 1], neck: [-0.1, -0.2, 0] }, 'snap'],
      [19, { handR: [-0.14, 0.4, 0.56], poleR: [0.1, -1, 0.3], rootRot: [-0.04, 0.25, 0], spine: [-0.06, 0.45, 0] }, 'out'],
      [26, { handR: [-0.12, 0.3, 0.46], poleR: [0.2, -1, -0.2], twistR: -0.7, clavR: [0.1, 0.2], rootPos: [0, -0.07, 0.05], rootRot: [0.05, -0.2, 0], spine: [0.08, 0.3, 0],
        footR: [0.2, 0.071, -0.2], toeR: 0.1, footRotR: [0.1, 0.5, 0], neck: [0.05, 0, 0], kneeL: [0.18, 0, 1] }, 'ret'],
      [44, { rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.1, 0.12, 0], handR: [-0.08, 0.3, 0.44], aimR: 0, twistR: TG.R, clavR: [-0.05, 0.12], footR: [0.2, 0.071, -0.2], toeR: 0, footRotR: [0, 0.65, 0], neck: [0.16, 0.2, 0], kneeL: [0.15, 0, 1] }, 'inout'],
    ]),
    hit: { f: [14, 17], limb: 'handR', r: 0.11, dmg: 16, lvl: 'mid', react: 'air', blk: -13, launch: 6.2, push: 0.1 },
    advance: [[0, 0], [15, 0.14], [44, 0.14]], sfx: 'heavy',
  };
  // --- ws2 / d+1: crouch jab
  M.crouchJab = {
    name: 'Crouch jab', total: 24, crouchStart: true, stayCrouch: true, clip: C([
      [0, { rootPos: [0, -0.28, -0.1], rootRot: [0.3, -0.6, 0], spine: [0.24, 0.1, 0], footL: [0.1, 0.071, 0.2], footR: [0.24, 0.071, -0.32], toeR: 0.9, footRotR: [0.55, 0.6, 0], kneeL: [0.12, 0, 1], kneeR: [0.2, -0.4, 1], handL: [-0.05, 0.22, 0.55], handR: [-0.2, 0.25, 0.38] }],
      [9, { handL: [0.0, -0.05, 0.98], aimL: 1, twistL: 0.56, fistL: 1, wristL: WRP, clavL: [0, 0.4], rootRot: [0.34, -0.6, 0] }, 'snap'],
      [12, {}, 'lin'],
      [16, { handL: [-0.03, 0.1, 0.68], twistL: 0.0, clavL: [0, 0.2] }, 'ret'],
      [24, { handL: [-0.05, 0.22, 0.55], aimL: 0, twistL: TG.L, wristL: WR, clavL: [-0.05, 0.1], rootRot: [0.32, -0.45, 0] }, 'inout'],
    ]),
    hit: { f: [9, 11], limb: 'handL', r: 0.09, dmg: 5, lvl: 'smid', react: 'hitLow', blk: 0, hitAdv: 6, push: 0.1 },
    advance: [[0, 0], [9, 0.04], [24, 0.04]], sfx: 'light',
  };
  // --- f,f+2: lunging punch
  M.lunge = {
    name: 'Lunge punch', total: 42, clip: C([
      [0, {}],
      [6, { rootPos: [0, -0.16, 0.04], rootRot: [0.2, -0.7, 0], handR: [-0.1, 0.1, 0.25], fistR: 1, wristR: WRM, twistR: 0.15 }, 'inout'],
      [16, { rootPos: [0, -0.16, 0.14], rootRot: [0.25, 0.25, 0], spine: [0.15, 0.4, 0], handR: [-0.05, 0.05, 1.0], aimR: 1, twistR: 0.74, wristR: WRP, clavR: [0, 0.55],
        footL: [0.05, 0.071, 0.44], kneeL: [0.2, 0, 1], footR: [0.18, 0.1, -0.28], toeR: 0.8, footRotR: [0.6, 0.2, 0], handL: [-0.04, 0.14, 0.42] }, 'snap'],
      [20, {}, 'lin'],
      [27, { handR: [-0.1, 0.2, 0.6], twistR: 0.1, clavR: [0, 0.25], rootPos: [0, -0.13, 0.08], rootRot: [0.18, -0.15, 0], spine: [0.12, 0.25, 0],
        footR: [0.18, 0.071, -0.2], toeR: 0.4, footRotR: [0.35, 0.3, 0], handL: [-0.02, 0.2, 0.45] }, 'ret'],
      [42, { rootPos: [0, -0.075, -0.02], rootRot: [0.06, -0.45, 0], spine: [0.1, 0.12, 0], handR: [-0.08, 0.3, 0.44], aimR: 0, twistR: TG.R, wristR: WR, clavR: [-0.05, 0.12], footL: [0.05, 0.071, 0.24], footR: [0.2, 0.071, -0.2], toeR: 0, footRotR: [0, 0.65, 0], handL: [0.02, 0.2, 0.62] }, 'inout'],
    ]),
    hit: { f: [16, 18], limb: 'handR', r: 0.11, dmg: 20, lvl: 'mid', react: 'hitMid', blk: -12, kd: true, push: 0.5 },
    advance: [[0, 0], [8, 0.2], [16, 0.55], [42, 0.55]], sfx: 'heavy',
  };
  // --- uf+4: jumping kick. Arms swing down then up to drive the jump, the lead knee rises first, the rear leg
  // chambers and drives out almost straight at chest height while the lead leg tucks under, the hips tilted back so
  // that the hip is not folded past its limit; the landing is absorbed by both knees. (The kicking leg used to stop well
  // short of straight, the shin hanging from a raised knee, and the lead leg hung straight down.) The arms swing up with
  // the take-off and come back into the guard for the kick (they stayed up and wide, as if celebrating)
  M.jumpKick = {
    name: 'Jump kick', total: 50, airborne: [6, 30], clip: C([
      [0, {}],
      [5, { rootPos: [0, -0.18, 0], rootRot: [0.22, -0.4, 0], spine: [0.18, 0.05, 0], handL: [0.3, -0.35, 0.2], handR: [0.32, -0.4, 0.05], aimL: 1, aimR: 1 }, 'inout'],
      [11, { rootPos: [0, 0.25, 0.1], rootRot: [-0.05, -0.35, 0], spine: [0.05, 0.05, 0], footL: [0.08, 0.55, 0.25], kneeL: [0.1, 0.4, 1], footRotL: [0.4, -0.2, 0],
        footR: [0.2, 0.3, -0.12], kneeR: [0.3, 0, 1], footRotR: [0.5, 0.4, 0], handL: [0.08, 0.2, 0.55], handR: [0.14, 0.1, 0.45] }, 'out'],
      [16, { rootPos: [0, 0.38, 0.18], rootRot: [-0.12, -0.3, 0], footL: [0.1, 0.7, 0.06], kneeL: [0.2, 0.5, 1], footR: [0.14, 0.72, 0.35], kneeR: [0.1, 0.5, 1],
        footRotR: [-0.4, 0, 0], toeR: -0.3, handL: GUARD_HAND.L, handR: [-0.06, 0.24, 0.52], aimL: 0, aimR: 0, neck: [0.3, 0.2, 0] }, 'inout'],
      [19, { rootPos: [0, 0.4, 0.25], rootRot: [-0.32, -0.3, 0], spine: [0.14, 0.05, 0], footR: [0.04, 1.08, 1.04], kneeR: [0.1, 1, 0.4], footRotR: [-1.1, 0, 0], toeR: -0.5,
        footL: [0.12, 0.74, -0.04], kneeL: [0.2, 0.3, 1] }, 'drive'],
      [22, {}, 'lin'],
      // on the way down the knee re-chambers, then the feet level out for the landing (the leg came back from head
      // height in three frames; it now draws back in two stages, so that it does not snap back from the hold). The
      // hips come down on an arc from the top of the jump, the body tipping forwards for the landing on the way (it
      // used to hang up there until two frames before touch-down, then drop half a metre and pitch forwards in those
      // two: the whole body jerked)
      [25, { rootPos: [0, 0.28, 0.22], rootRot: [-0.12, -0.35, 0], footR: [0.12, 0.72, 0.5], kneeR: [0.2, 0.8, 1], footRotR: [-0.2, 0.3, 0], toeR: -0.1 }, 'inout'],
      [28, { rootPos: [0, 0.1, 0.16], rootRot: [0.03, -0.42, 0], footRotR: [0.1, 0.6, 0], toeR: 0, footRotL: [0.1, -0.3, 0], footR: [0.2, 0.2, -0.09], kneeR: [0.45, 0.2, 1], footL: [0.06, 0.22, 0.25] }, 'inout'],
      // touch-down (at the stance's height: with the hips any higher the spread feet only reached the floor on
      // tiptoe), still moving down, so that the knees take the landing up before rising into the guard
      [30, { rootPos: [0, -0.06, 0.1], rootRot: [0.15, -0.45, 0], spine: [0.12, 0.1, 0], footL: [0.05, 0.071, 0.3], footR: [0.2, 0.071, -0.15], kneeL: [0.3, 0, 1], kneeR: [0.5, 0, 1],
        footRotL: [0, -0.35, 0], footRotR: [0, 0.65, 0], toeR: 0, handR: GUARD_HAND.R, neck: [0.2, 0.2, 0] }, 'inout'],
      [35, { rootPos: [0, -0.19, 0.1], rootRot: [0.28, -0.45, 0], spine: [0.18, 0.1, 0] }, 'inout'],
      [42, { rootPos: [0, -0.1, 0.05], rootRot: [0.12, -0.45, 0], spine: [0.12, 0.12, 0], handL: [0.02, 0.2, 0.62], handR: [-0.08, 0.3, 0.44], aimL: 0, aimR: 0 }, 'inout'],
      [50, null, 'inout'],
    ]),
    hit: { f: [17, 22], limb: 'footR', r: 0.13, dmg: 20, lvl: 'mid', react: 'hitMid', blk: -10, kd: true, push: 0.4 },
    advance: [[0, 0], [6, 0], [24, 0.25], [50, 0.25]], sfx: 'heavy',
  };
  // --- throw (1+3)
  M.throw = {
    name: 'Throw', total: 36, throw: true, clip: C([
      [0, {}],
      [6, { handL: [0.1, 0.1, 0.85], handR: [-0.1, 0.1, 0.85], aimL: 1, aimR: 1, fistL: 0.2, fistR: 0.2, rootPos: [0, -0.1, 0.05], rootRot: [0.15, -0.2, 0] }, 'out'],
      [12, { handL: [0.12, 0.15, 1.0], handR: [-0.08, 0.15, 1.0], rootPos: [0, -0.1, 0.12] }, 'snap'],
      [36, null, 'inout'],
    ]),
    hit: { f: [11, 13], limb: 'handL', r: 0.16, dmg: 0, lvl: 'throw', blk: -8 },
    advance: [[0, 0], [12, 0.1], [36, 0.1]], sfx: 'grab',
    throwType: 'knee', throwDmg: 35,
  };
  // attacker's side of the throw (cinematic, both fighters locked)
  M.throwExec = {
    name: 'Throw!', total: 60, clip: C([
      [0, { handL: [0.12, 0.15, 0.8], handR: [-0.08, 0.15, 0.8], aimL: 1, aimR: 1, rootPos: [0, -0.1, 0.1], rootRot: [0.15, -0.2, 0] }],
      [16, { rootPos: [0, -0.25, 0.0], rootRot: [0.2, 0, 0], handL: [0.15, 0.4, 0.6], handR: [-0.05, 0.4, 0.6] }, 'inout'],
      [30, { rootPos: [0, -0.1, -0.05], rootRot: [-0.4, 0, 0], spine: [-0.4, 0, 0], handL: [0.1, 0.9, 0.1], handR: [0.1, 0.9, 0.1] }, 'out'],
      [42, { rootPos: [0, -0.3, 0.05], rootRot: [0.4, 0, 0], spine: [0.4, 0, 0], handL: [0.2, -0.3, 0.8], handR: [0.2, -0.3, 0.8] }, 'in'],
      [60, null, 'inout'],
    ]),
  };

  // thrower sides of the throws (hands follow grips on the victim, see js/fight/throws.js)
  const HOLD0 = { handL: [0.12, 0.15, 0.8], handR: [-0.08, 0.15, 0.8], aimL: 1, aimR: 1, fistL: 0.3, fistR: 0.3, rootPos: [0, -0.1, 0.08], rootRot: [0.15, -0.25, 0] };
  M.throwKnee = { name: 'Throw!', total: 60, noScale: true, clip: C([
    [0, HOLD0],
    [8, { rootPos: [0, -0.1, 0.02], rootRot: [0.12, -0.3, 0], spine: [0.14, 0.08, 0], neck: [0.2, 0.1, 0] }, 'inout'],
    [14, { rootPos: [0, -0.07, 0.02], rootRot: [0.08, -0.25, 0], footR: [0.2, 0.071, -0.2], footRotR: [0.4, 0.65, 0] }, 'inout'],
    [17, { rootPos: [0, -0.02, 0.04], rootRot: [0.0, -0.2, 0], spine: [0.16, 0.08, 0], footR: [0.14, 0.42, 0.3], kneeR: [0.1, 0.3, 1], footRotR: [0.6, 0.3, 0], toeR: 0.3 }, 'drive'],
    [22, { rootPos: [0, -0.08, 0.02], rootRot: [0.1, -0.28, 0], spine: [0.22, 0.08, 0], footR: [0.2, 0.071, -0.18], kneeR: [0.5, 0, 1], footRotR: [0.3, 0.65, 0], toeR: 0 }, 'inout'],
    [27, { rootPos: [0, -0.1, 0.02], footRotR: [0.45, 0.65, 0] }, 'inout'],
    [31, { rootPos: [0, 0.0, 0.05], rootRot: [-0.05, -0.15, 0], spine: [0.16, 0.1, 0], footR: [0.12, 0.52, 0.34], kneeR: [0.1, 0.4, 1], footRotR: [0.7, 0.3, 0], toeR: 0.3 }, 'drive'],
    [37, { rootPos: [0, -0.1, 0.03], rootRot: [0.12, -0.3, 0], spine: [0.2, 0.08, 0], footR: [0.2, 0.071, -0.16], kneeR: [0.5, 0, 1], footRotR: [0.2, 0.65, 0], toeR: 0 }, 'inout'],
    [43, { rootPos: [0, -0.14, 0.1], rootRot: [0.35, -0.35, 0], spine: [0.3, 0.1, 0], footL: [0.05, 0.071, 0.38], handL: [0.1, -0.15, 0.9], handR: [-0.05, -0.18, 0.85], fistL: 0.2, fistR: 0.2 }, 'snap'],
    [52, { rootPos: [0, -0.09, 0.02], rootRot: [0.12, -0.4, 0], spine: [0.12, 0.1, 0], handL: [0.02, 0.2, 0.62], handR: [-0.08, 0.3, 0.44], aimL: 0, aimR: 0, fistL: 1, fistR: 1 }, 'inout'],
    [60, null, 'inout'],
  ]) };
  const WRAP0 = { handL: [0.3, 0.0, 0.8], handR: [0.3, 0.0, 0.8], aimL: 1, aimR: 1, fistL: 0.2, fistR: 0.2, rootPos: [0, -0.1, 0.08], rootRot: [0.1, 0, 0], poleL: [0.9, -0.3, 0], poleR: [0.9, -0.3, 0] };
  M.throwHug = { name: 'Bear hug!', total: 60, noScale: true, clip: C([
    [0, WRAP0],
    // ducks in, the head to the side of the victim's chest
    [10, { rootPos: [0, -0.16, 0.04], rootRot: [0.14, 0, 0], spine: [0.12, 0, 0], neck: [0.12, 0.5, 0.1], look: 0, footL: [0.1, 0.071, 0.2], footR: [0.22, 0.071, -0.15] }, 'inout'],
    // lift: hips under him, a slight lean back, the head turned to the side against his chest
    [20, { rootPos: [0, -0.04, -0.02], rootRot: [-0.16, 0, 0], spine: [-0.1, 0, 0], neck: [0.1, 0.55, 0.1], look: 0, footRotL: [0.2, 0, 0], footRotR: [0.2, 0.5, 0] }, 'inout'],
    [26, { spine: [-0.16, 0.16, 0] }, 'snap'],
    [30, { spine: [-0.1, -0.08, 0] }, 'inout'],
    [33, { spine: [-0.18, -0.16, 0] }, 'snap'],
    [38, { rootPos: [0, -0.05, 0], rootRot: [-0.12, 0.1, 0], spine: [-0.1, 0.18, 0] }, 'inout'],
    [46, { rootPos: [0, -0.22, 0.08], rootRot: [0.4, -0.35, 0], spine: [0.35, -0.2, 0], neck: [0.2, 0, 0], look: 1, footL: [0.1, 0.071, 0.34], footRotL: [0, -0.2, 0], footRotR: [0.3, 0.65, 0],
      handL: [0.25, -0.35, 0.75], handR: [0.2, -0.4, 0.7] }, 'snap'],
    [53, { rootPos: [0, -0.12, 0.03], rootRot: [0.15, -0.4, 0], spine: [0.15, 0.1, 0], handL: [0.02, 0.2, 0.62], handR: [-0.08, 0.3, 0.44], aimL: 0, aimR: 0, fistL: 1, fistR: 1, poleL: [0.3, -1, -0.15], poleR: [0.25, -1, -0.25] }, 'inout'],
    [60, null, 'inout'],
  ]) };
  // belly-to-belly suplex: sink, lift, arch back and toss the victim over the head, staying on the feet
  M.throwSuplex = { name: 'Suplex!', total: 58, noScale: true, clip: C([
    [0, WRAP0],
    [5, { neck: [0.05, 0.4, 0.1], look: 0 }, 'inout'],
    // ducks in belly to belly, the head turned aside against the victim's chest, then lifts him
    [10, { rootPos: [0, -0.2, 0.04], rootRot: [0.14, 0, 0], spine: [0.12, 0, 0], neck: [0.12, 0.5, 0.1], look: 0, footL: [0.1, 0.071, 0.2], footR: [0.22, 0.071, -0.15] }, 'inout'],
    [18, { rootPos: [0, -0.06, -0.02], rootRot: [-0.3, 0, 0], spine: [-0.3, 0, 0], neck: [-0.1, 0.45, 0.1], footRotL: [0.2, 0, 0], footRotR: [0.2, 0.5, 0] }, 'inout'],
    // (the head goes aside, away from the victim passing over the right shoulder)
    [26, { rootPos: [0, -0.1, -0.08], rootRot: [-0.5, 0, 0], spine: [-0.45, 0, 0], neck: [-0.35, 0.45, 0.25], footL: [0.12, 0.071, 0.26], footR: [0.22, 0.071, -0.12],
      handL: [0.3, 0.95, -0.25], handR: [0.3, 0.95, -0.25], fistL: 0.3, fistR: 0.3, footRotL: [0, 0, 0], footRotR: [0, 0.5, 0] }, 'snap'],
    [34, { rootPos: [0, -0.1, -0.04], rootRot: [-0.2, 0, 0], spine: [-0.15, 0, 0], neck: [-0.1, 0, 0], handL: [0.35, 0.3, 0.2], handR: [0.35, 0.3, 0.2] }, 'inout'],
    [44, { rootPos: [0, -0.08, -0.02], rootRot: [0.06, -0.35, 0], spine: [0.1, 0.1, 0], neck: [0.1, 0.1, 0], look: 1, handL: [0.02, 0.2, 0.62], handR: [-0.08, 0.3, 0.44], aimL: 0, aimR: 0, fistL: 1, fistR: 1,
      poleL: [0.3, -1, -0.15], poleR: [0.25, -1, -0.25] }, 'inout'],
    [58, null, 'inout'],
  ]) };

  // --- Rage Art (1+2+3+4 while in rage): a charging palm strike that starts a cinematic combo if it connects
  M.rageArt = {
    name: 'Rage Art', total: 64, rage: true, invuln: [1, 20], clip: C([
      [0, {}],
      [12, { rootPos: [0, -0.18, -0.08], rootRot: [0.15, -0.9, 0], spine: [0.1, -0.5, 0], handR: [0.2, 0.0, -0.1], aimR: 1, fistR: 1, twistR: 0.1, neck: [0.1, 0.5, 0] }, 'out'],
      [22, { rootPos: [0, -0.14, 0.16], rootRot: [0.2, 0.3, 0], spine: [0.15, 0.5, 0], handR: [-0.05, 0.1, 1.0], aimR: 1, twistR: 0.75, fistR: 1, wristR: WRP, clavR: [0.05, 0.55],
        footL: [0.05, 0.071, 0.42], footR: [0.18, 0.12, -0.25], toeR: 0.7, footRotR: [0.5, 0.3, 0] }, 'snap'],
      [27, {}, 'lin'],
      [64, null, 'inout'],
    ]),
    hit: { f: [21, 25], limb: 'handR', r: 0.16, dmg: 0, lvl: 'mid', blk: -22, push: 0.6, rage: true },
    advance: [[0, 0], [12, 0.05], [22, 0.6], [64, 0.6]], sfx: 'heavy',
  };
  // --- unique moves come from the style
  if (style.moves) Object.assign(M, style.moves(C, st));
  // --- speed stat: faster fighters execute everything proportionally quicker
  const sp = style.stats?.speed || 1;
  if (Math.abs(sp - 1) > 1e-3) for (const k in M) if (!M[k].noScale) timeScaleMove(M[k], 1 / sp);
  return M;
}

function timeScaleMove(m, k) {
  const r = (f) => Math.max(1, Math.round(f * k));
  if (m.total) m.total = r(m.total);
  if (m.hit) m.hit = { ...m.hit, f: [r(m.hit.f[0]), Math.max(r(m.hit.f[0]), r(m.hit.f[1]))] };
  if (m.advance) m.advance = m.advance.map(([f, d]) => [r(f), d]);
  if (m.cancel) m.cancel = { ...m.cancel, from: r(m.cancel.from), to: r(m.cancel.to) };
  if (m.airborne) m.airborne = m.airborne.map(r);
  if (m.lowProfile) m.lowProfile = m.lowProfile.map(r);
  if (m.clip) { for (const key of m.clip.keys) key.f = key.f * k; m.clip.length = m.clip.keys[m.clip.keys.length - 1].f; m.clip._tangents?.(); }
}

// Command table: input notation -> move name. Order matters (more specific first).
export function commandList(style) {
  const base = [
    ['1+2+3+4', 'rageArt'],
    ['1+3', 'throw'], ['2+4', style.throw2 || 'throw'],
    ['f,f+2', 'lunge'],
    ['uf+4', 'jumpKick'], ['u+4', 'jumpKick'],
    ['df+1', 'bodyJab'], ['df+2', 'uppercut'],
    ['d+1', 'crouchJab'], ['d+3', 'lowKick'], ['d+4', 'sweep'], ['db+4', 'sweep'],
    ['1', 'jab'], ['2', 'straight'], ['3', 'frontKick'], ['4', 'roundhouse'],
  ];
  return [...(style.commands || []), ...base];
}
