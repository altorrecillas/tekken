// Keyframed pose clips. Keys: [frame, partialPose, ease?]. Poses are complete (stance + partial overrides).
// Segments with a soft ease ('inout', 'sine') follow a C1 monotone cubic through the keys: the body flows through
// intermediate poses instead of stopping at each one, and only stops where a channel turns round (no overshoot).
// Strike eases ('snap', 'whip', 'drive', 'ret', 'back', 'in', 'out', 'lin', 'hold') keep their own timing curve.
import { newPose, applyPartial, lerpPose, POSE_SIZE } from './rig.js';
import { BASE, STANCE } from './poses.js';

export const EASE = {
  lin: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  inout: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  // strikes: explosive but not instantaneous start (a 1-2 frame ramp: an infinite-acceleration start pops on
  // screen), soft arrival
  snap: t => { const r = Math.min(1, t / 0.2); return (1 - Math.pow(1 - t, 3.2)) * r * r * (3 - 2 * r); },
  whip: t => { if (t >= 1) return 1; const r = Math.min(1, t / 0.16); return (1 - Math.pow(1 - t, 4.5)) * r * r * (3 - 2 * r); },
  // recoil after a strike: quick pull back to the guard, settling softly
  ret: t => { const r = Math.min(1, t / 0.2); return (1 - Math.pow(1 - t, 2.4)) * r * r * (3 - 2 * r); },
  // kicks out of a chamber: the limb flows through the chamber pose at half the segment's mean speed (the smooth
  // segment before it ends with that speed) and drives on to a soft arrival. A snap from a dead stop moved a
  // kicking foot 40% of the way in its first frame
  drive: t => { const t2 = t * t, t3 = t2 * t; return 0.5 * (t3 - 2 * t2 + t) + (-2 * t3 + 3 * t2); },
  back: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }, // overshoot
  hold: t => (t < 1 ? 0 : 1),
  sine: t => 0.5 - 0.5 * Math.cos(Math.PI * t),
};
const SMOOTH = new Set([EASE.inout, EASE.sine]);
// slope of an ease at its ends (per unit t)
const slope = (e, at) => (at === 0 ? (e(1e-3) - e(0)) / 1e-3 : (e(1) - e(1 - 1e-3)) / 1e-3);

export class Clip {
  // keys: [[frame, partial, ease?], ...] ; base: partial merged under every key (defaults to stance)
  constructor(keys, { base = STANCE, loop = false, cumulative = true } = {}) {
    this.loop = loop;
    this.keys = [];
    let acc = {};
    for (const [f, partial0, ease] of keys) {
      let partial = partial0;
      if (partial) {
        // a key that places a hand explicitly releases the face-relative guard for that hand
        partial = { ...partial };
        for (const s of ['L', 'R']) if ((('hand' + s) in partial || ('aim' + s) in partial) && !(('hg' + s) in partial)) partial['hg' + s] = 0;
      }
      if (partial === null) acc = {};  // null = back to the base stance
      else if (cumulative) acc = { ...acc, ...partial };
      const p = newPose();
      applyPartial(p, BASE);
      applyPartial(p, base);
      applyPartial(p, cumulative ? acc : (partial || {}));
      this.keys.push({ f, p, ease: EASE[ease || 'inout'] || EASE.inout, m: null });
    }
    this.length = this.keys[this.keys.length - 1].f;
    this._tangents();
  }

  // per-key, per-channel slopes (value per frame) for the smooth segments
  _tangents() {
    const K = this.keys, n = K.length;
    if (n < 2) return;
    for (let k = 0; k < n; k++) {
      const m = new Float32Array(POSE_SIZE);
      // neighbours (a loop's first and last key are the same point in the cycle)
      let prev = k > 0 ? k - 1 : (this.loop ? n - 2 : -1);
      let next = k < n - 1 ? k + 1 : (this.loop ? 1 : -1);
      if (this.loop && k === n - 1) { prev = n - 2; next = 1; }
      // segments on each side: (prev -> k) eased by K[k].ease, (k -> next) eased by K[next].ease
      const inSeg = prev >= 0 ? (k > 0 ? k : n - 1) : -1;     // index of the key that ends the incoming segment
      const outSeg = next >= 0 ? (k < n - 1 ? k + 1 : 1) : -1;
      const inSmooth = inSeg >= 0 && SMOOTH.has(K[inSeg].ease), outSmooth = outSeg >= 0 && SMOOTH.has(K[outSeg].ease);
      if (!inSmooth && !outSmooth) { K[k].m = m; continue; }
      const hIn = prev >= 0 ? Math.max(1e-6, (K[k].f - K[prev].f + (prev > k ? this.length : 0))) : 0;
      const hOut = next >= 0 ? Math.max(1e-6, (K[next].f - K[k].f + (next < k ? this.length : 0))) : 0;
      const pk = K[k].p, pp = prev >= 0 ? K[prev].p : null, pn = next >= 0 ? K[next].p : null;
      const eIn = inSeg >= 0 ? K[inSeg].ease : null, eOut = outSeg >= 0 ? K[outSeg].ease : null;
      const sIn = eIn && !inSmooth ? slope(eIn, 1) : 0, sOut = eOut && !outSmooth ? slope(eOut, 0) : 0;
      for (let i = 0; i < POSE_SIZE; i++) {
        const d0 = pp ? (pk[i] - pp[i]) / hIn : 0, d1 = pn ? (pn[i] - pk[i]) / hOut : 0;
        let v;
        if (inSmooth && outSmooth) {
          // Fritsch-Butland weighted harmonic mean: zero at a turning point, monotone otherwise
          v = d0 * d1 <= 0 ? 0 : 3 * (hIn + hOut) / ((2 * hOut + hIn) / d0 + (hOut + 2 * hIn) / d1);
        } else if (inSmooth) {
          // continue into the strike segment with its own starting speed (zero for eased strikes)
          v = d1 * sOut;
          if (v * d0 <= 0) v = 0; else if (Math.abs(v) > 3 * Math.abs(d0)) v = 3 * d0;
        } else {
          v = d0 * sIn;
          if (v * d1 <= 0) v = 0; else if (Math.abs(v) > 3 * Math.abs(d1)) v = 3 * d1;
        }
        // clip ends (not looping) start and stop at rest
        if (!this.loop && (k === 0 || k === n - 1)) v = 0;
        m[i] = v;
      }
      K[k].m = m;
    }
  }

  sample(frame, out) {
    const k = this.keys;
    if (this.loop && this.length > 0) frame = ((frame % this.length) + this.length) % this.length;
    if (frame <= k[0].f) return out.set(k[0].p), out;
    for (let i = 1; i < k.length; i++) {
      if (frame <= k[i].f) {
        const a = k[i - 1], b = k[i];
        const h = Math.max(1e-6, b.f - a.f);
        const t = (frame - a.f) / h;
        if (SMOOTH.has(b.ease) && a.m && b.m) {
          // cubic Hermite through the keys
          const t2 = t * t, t3 = t2 * t;
          const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
          const A = a.p, B = b.p, MA = a.m, MB = b.m;
          for (let j = 0; j < POSE_SIZE; j++) out[j] = h00 * A[j] + h10 * h * MA[j] + h01 * B[j] + h11 * h * MB[j];
          return out;
        }
        return lerpPose(out, a.p, b.p, b.ease(t));
      }
    }
    out.set(k[k.length - 1].p);
    return out;
  }
}

// cross-fade helper
export function blendInto(out, from, to, t) {
  return lerpPose(out, from, to, EASE.sine(Math.min(1, Math.max(0, t))));
}

export { POSE_SIZE };
