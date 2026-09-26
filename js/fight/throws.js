// Throw choreography: both fighters are locked together and each throw type scripts the victim's position relative
// to the thrower (distance along the facing axis, height, turn), where each fighter's hands grip the other's body
// (bone + offset in that fighter's character space, weight) and the impact events. The clips are in moves.js:
// the thrower plays moves[exec], the victim clips[victim].
const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;

export const THROWS = {
  // clinch, two knees to the stomach, shove to the floor
  knee: {
    exec: 'throwKnee', victim: 'thrownKnee', end: 54, breakBy: 14,
    // (the victim ends lying with the feet towards the thrower: far enough for them to stay clear of his lead foot)
    path: (t) => ({ d: t < 38 ? 0.75 : lerp(0.75, 1.25, smooth(ramp(t, 38, 47))), y: 0, yaw: 0 }),
    // thrower's hands on top of the victim's shoulders, released for the shove
    att: (t) => { const w = smooth(ramp(t, 0, 6)) * (1 - smooth(ramp(t, 37, 41))); return { L: ['shoulder01.R', [-0.03, 0.11, 0.02], w], R: ['shoulder01.L', [0.03, 0.11, 0.02], w] }; },
    // victim's hands on the thrower's elbows
    def: (t) => { const w = 0.7 * smooth(ramp(t, 2, 9)) * (1 - smooth(ramp(t, 36, 40))); return { L: ['lowerarm01.R', [0, -0.02, 0], w], R: ['lowerarm01.L', [0, -0.02, 0], w] }; },
    events: [{ t: 17, kind: 'knee', dmg: 0.15, at: 'spine03' }, { t: 31, kind: 'knee', dmg: 0.15, at: 'spine03' }, { t: 47, kind: 'slam', dmg: 0.7 }],
  },
  // arms round the waist, lift, squeeze, slam down in front. Belly to belly (the arms only reach round a body
  // pressed against the chest: a step away and the hands ended inside the victim's back), the victim a little to
  // the thrower's right so his head goes past the victim's shoulder
  hug: {
    exec: 'throwHug', victim: 'thrownHug', end: 56, breakBy: 14,
    path: (t) => {
      const up = smooth(ramp(t, 8, 20)) * (1 - smooth(ramp(t, 38, 46)));
      // in to 0.45 while he ducks under the victim's chest, the rest of the way as the victim comes up
      const pull = smooth(ramp(t, 0, 10));
      const d = t < 10 ? lerp(0.62, 0.45, pull) : lerp(0.45, 0.34, smooth(ramp(t, 10, 20)));
      return { d: t < 38 ? d : lerp(0.34, 1.2, smooth(ramp(t, 38, 47))), side: 0.02 * pull * (1 - smooth(ramp(t, 38, 47))),
        y: 0.26 * up, yaw: t < 38 ? 0 : -0.5 * smooth(ramp(t, 38, 47)) };
    },
    // hands locked round the victim's waist, on the lower back
    att: (t) => { const w = smooth(ramp(t, 0, 8)) * (1 - smooth(ramp(t, 42, 46))); return { L: ['spine04', [-0.1, 0, -0.07], w], R: ['spine04', [0.09, 0.02, -0.09], w] }; },
    // victim pushing down on top of the thrower's shoulders (his arms over the thrower's)
    def: (t) => { const w = 0.85 * smooth(ramp(t, 0, 8)) * (1 - smooth(ramp(t, 36, 42))); return { L: ['shoulder01.R', [0, 0.09, 0.03], w], R: ['shoulder01.L', [0, 0.09, 0.03], w] }; },
    events: [{ t: 26, kind: 'squeeze', dmg: 0.1 }, { t: 33, kind: 'squeeze', dmg: 0.1 }, { t: 47, kind: 'slam', dmg: 0.8 }],
  },
  // belly-to-belly: lift, arch back and toss the victim over the head; the thrower stays on his feet and the
  // victim turns three quarters of a flip in the air to land flat on his back behind him
  suplex: {
    exec: 'throwSuplex', victim: 'thrownSuplex', end: 56, breakBy: 14,
    path: (t) => {
      const k = smooth(ramp(t, 17, 37));
      return {
        // (belly to belly for the lift: the arms only wrap round a body pressed against the chest; the last step in
        // comes as the victim is lifted, so the heads pass instead of meeting)
        d: t < 10 ? lerp(0.62, 0.46, smooth(ramp(t, 0, 10))) : t < 17 ? lerp(0.46, 0.36, smooth(ramp(t, 10, 17))) : lerp(0.36, -1.3, k),
        side: lerp(0, 0.18, k),
        // (the arc comes down to the floor exactly at the slam)
        y: t < 17 ? 0.22 * smooth(ramp(t, 8, 17)) : 0.22 * (1 - k) + 0.75 * Math.sin(Math.PI * k),
        yaw: 0.2 * k,
      };
    },
    // (let go as he goes over: the victim's legs swing through where the arms were)
    att: (t) => { const w = smooth(ramp(t, 0, 8)) * (1 - smooth(ramp(t, 20, 25))); return { L: ['spine04', [-0.1, 0, -0.07], w], R: ['spine04', [0.09, 0.02, -0.09], w] }; },
    def: (t) => { const w = 0.8 * smooth(ramp(t, 0, 8)) * (1 - smooth(ramp(t, 18, 22))); return { L: ['shoulder01.R', [0, 0.09, 0.03], w], R: ['shoulder01.L', [0, 0.09, 0.03], w] }; },
    events: [{ t: 37, kind: 'slam', dmg: 1 }],
  },
};
