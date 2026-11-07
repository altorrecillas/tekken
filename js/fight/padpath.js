// The path of Aleix's controller in his PUÑETALITY (styles.js aleix.fatal, js/fight/fatality.js ALEIX): where it is,
// how it is tilted and how big, frame by frame, and where his hands hold it. Shared by the simulation (the hands'
// grips, fatal.grip, sampled from it when styles.js loads) and what is drawn (the controller itself), so they always
// agree. No three.js here: plain numbers, the same on every phone.
//
// The move's frame: x his left, y up, z the way he faces, from where he stood as it started (fatalW0); he steps
// forward padStep(t) metres as he slams it down. The controller's own axes (js/fx/gamepad.js): +x its left, +y out of
// its face, +z its top edge; pitch turns it about its x axis (negative: the top edge up, the face towards him).
export const PADP = {
  dist: 1.55, // between the two as it starts: the controller comes down on him there
  S: 18, // giant: 2.75 m across
  out: 52, appear: 50, held: 62, grow: [124, 150], lift: [108, 134], release: 196, land: 204, step: [188, 200, 0.35],
  // its two holds, its own metres: on the grips (playing) and under the body (overhead)
  grip: [0.052, -0.012, -0.04], under: [0.0125, -0.0185, -0.006],
  bottom: 0.0225, // its lowest point under the grips: lying face up it rests on them
};
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// his step forward (fatal.move is built from it: the same numbers)
export function padStep(t) { const [a, b, d] = PADP.step; return d * ss(a, b, t); }
export const PAD_MOVE = [[0, 0], [PADP.step[0], 0], [PADP.step[1], PADP.step[2]]];

// its size at frame t
export function padScale(t) {
  const [a, b] = PADP.grow;
  // a first swell to twice its size, then up to giant, the last of it overshooting a little and settling
  const k = ss(a, b, t), pre = ss(a - 16, a + 2, t);
  return 1 + pre * 1 + (PADP.S - 2) * k + (PADP.S * 0.04) * Math.sin(Math.min(1, Math.max(0, (t - b + 8) / 14)) * Math.PI);
}

// the hands' middle (the move's frame) and the controller's tilt while he holds it
const HOLD = [
  // [frame, hands' middle [x, y, z], pitch]
  [62, [0, 1.05, 0.33], -0.6],
  [108, [0, 1.06, 0.32], -0.55],
  [122, [0, 1.62, 0.26], -0.3],
  [134, [0, 1.95, 0.12], 0.0],
  [150, [0, 1.97, 0.1], 0.0],
  // heavy overhead: the arms give a little and push back up
  [166, [0, 1.93, 0.11], 0.02],
  [180, [0, 1.96, 0.1], -0.02],
  // back a touch to throw it, then over and down into the slam (he steps in under it)
  [190, [0, 1.94, 0.02], -0.1],
  [196, [0, 1.78, 0.62], 0.12],
];
function holdAt(t) {
  if (t <= HOLD[0][0]) return { m: HOLD[0][1], p: HOLD[0][2] };
  for (let i = 1; i < HOLD.length; i++) {
    if (t > HOLD[i][0]) continue;
    const A = HOLD[i - 1], B = HOLD[i], k = ss(A[0], B[0], t);
    return { m: lerp3(A[1], B[1], k), p: lerp(A[2], B[2], k) };
  }
  const L = HOLD[HOLD.length - 1];
  return { m: L[1], p: L[2] };
}

// a point in the controller's own metres, turned by its pitch and scaled, from its centre (the move's frame)
function local(p, pitch, s) {
  const c = Math.cos(pitch), sn = Math.sin(pitch);
  return [p[0] * s, (p[1] * c - p[2] * sn) * s, (p[1] * sn + p[2] * c) * s];
}
// how far from the grips to the underside the hold has gone (as it grows)
const holdK = (s) => Math.min(1, Math.max(0, (s - 1) / 6));
function holdPt(side, s) {
  const k = holdK(s), g = PADP.grip, u = PADP.under, sg = side === 'L' ? 1 : -1;
  return [sg * lerp(g[0], u[0], k), lerp(g[1], u[1], k), lerp(g[2], u[2], k)];
}

// the controller at frame t: centre [x, y, z] in the move's frame, pitch, scale; held (in his hands) or not
export function padState(t) {
  const s = padScale(t);
  if (t <= PADP.release) {
    const h = holdAt(t), mid = [0, 0, 0];
    const L = local(holdPt('L', s), h.p, 1), R = local(holdPt('R', s), h.p, 1);
    for (let i = 0; i < 3; i++) mid[i] = (L[i] + R[i]) / 2 * s;
    return { c: [h.m[0] - mid[0], h.m[1] - mid[1], h.m[2] - mid[2]], pitch: h.p, s, held: true };
  }
  // thrown: down onto him, faster and faster, the nose dipping a little; on him at `land`, a bounce, then still
  const A = padState(PADP.release), land = [0, PADP.bottom * PADP.S, PADP.dist];
  if (t <= PADP.land) {
    const k = (t - PADP.release) / (PADP.land - PADP.release), e = k * k;
    return { c: [lerp(A.c[0], land[0], k), lerp(A.c[1], land[1], e), lerp(A.c[2], land[2], 1 - (1 - k) * (1 - k))], pitch: lerp(A.pitch, 0, k) + 0.08 * Math.sin(k * Math.PI), s, held: false };
  }
  const u = t - PADP.land;
  const bounce = u < 14 ? 0.05 * Math.sin(u / 14 * Math.PI) * (1 - u / 14) : 0;
  const tip = u < 22 ? 0.03 * Math.sin(u / 22 * Math.PI * 2) * (1 - u / 22) : 0;
  return { c: [land[0], land[1] + bounce, land[2]], pitch: tip, s, held: false };
}

// where his hands (the wrists) go while he holds it, the move's frame: the hold point and the hand behind it (on the
// grips the wrists sit back and below; under it, straight below the palms)
export function padHands(t) {
  const P = padState(t), k = holdK(P.s), out = {};
  for (const side of ['L', 'R']) {
    const h = local(holdPt(side, P.s), P.pitch, P.s);
    out[side] = [P.c[0] + h[0], P.c[1] + h[1] - lerp(0.03, 0.055, k), P.c[2] + h[2] - lerp(0.045, 0.0, k)];
  }
  return out;
}

// the grips for the simulation (styles.js fatal.grip): his own axes (the move's frame less his step), every 2 frames
// from when both hands are on it to the throw, eased on and off
export function padGrips() {
  const G = { L: [], R: [] };
  const a = PADP.held - 4, b = PADP.release + 2;
  for (let t = a; t <= b; t += 2) {
    const H = padHands(Math.min(t, PADP.release)), w = t <= PADP.held ? (t - a) / 4 : t >= PADP.release ? 1 - (t - PADP.release) / 2 : 1;
    const st = padStep(t);
    for (const s of ['L', 'R']) G[s].push([t, H[s][0], H[s][1], H[s][2] - st, Math.max(0, Math.min(1, w))]);
  }
  return G;
}
