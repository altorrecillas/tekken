// Hair that swings with the head. The hair cards hang off the head bone rigidly, so a head whipped round by a hit
// or a spin carried the hair along like a helmet. Here a damped spring, driven by the acceleration of a point in
// the middle of the hair (so head turns count as well as head movement) and by gravity once the head tilts, lets
// the strand tips lag behind; the hair material's vertex shader moves every card vertex by that lag times the
// square of its place along the card (js/materials.js 'haircards': 0 at the root, 1 at the tip), so the roots stay
// on the scalp. Drawn only: the simulation and the netplay snapshot never see it.
import * as THREE from 'three';

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _g = new THREE.Vector3();
const GRAVITY = new THREE.Vector3(0, -9.8, 0);

export class HairSway {
  // spring frequency (Hz), damping ratio, share of the head's acceleration that reaches the tips, largest swing (m)
  static TUNE = { f: 4, zeta: 0.4, gain: 0.25, max: 0.035 };
  // amount: how far the tips swing, for the length and weight of this fighter's hair (0 = none)
  constructor(ch, amount = 0.6) {
    this.u = ch.meshes?.hair?.material?.userData?.sway || null;
    this.head = ch.bones?.head;
    this.amount = amount;
    if (!this.u || !this.head || !ch.rest?.head || amount <= 0) { this.u = null; return; }
    // the point that drives the spring: the middle of the hair, in the head bone's frame (at rest every bone frame
    // is the character's, so a rest-space offset from the bone is its local position)
    const g = ch.meshes.hair.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    this.anchor = g.boundingBox.getCenter(new THREE.Vector3()).sub(ch.rest.head.head);
    // a stiff, lightly damped spring: hair this short swings back within a few tenths of a second
    const T = HairSway.TUNE, w = 2 * Math.PI * T.f;
    this.k = w * w; this.c = 2 * T.zeta * w; this.gain = T.gain;
    this.max = T.max;
    this.off = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.p1 = null; this.v1 = null; this.t = null;
  }

  // now: the fight's own clock, in seconds (its frame plus the drawing's interpolation: slow motion slows the hair
  // too, and a strip of frames drawn far apart in real time still swings as it would at 60 fps); frozen: the fight
  // is held on a hit (hitstop) and the hair holds still with everything else
  update(now, frozen = false) {
    if (!this.u) return;
    // (a long gap - a cut, a new round - starts over)
    const dt = this.t !== null ? now - this.t : 0;
    this.t = now;
    if (dt === 0 && this.p1) return;
    this.head.updateWorldMatrix(true, false);
    const P = _p.copy(this.anchor).applyMatrix4(this.head.matrixWorld);
    if (!this.p1 || dt < 0 || dt > 0.25 || frozen) {
      // (after a freeze, a cut or the first frame the anchor's velocity starts again from here)
      if (!this.p1) { this.p1 = P.clone(); this.v1 = new THREE.Vector3(); }
      else { this.p1.copy(P); this.v1.set(0, 0, 0); }
      return;
    }
    const V = _v.copy(P).sub(this.p1).divideScalar(dt);
    // a jump of the whole fighter (round start, a throw's teleport, a camera cut) is not a swing
    if (V.lengthSq() > 25 * 25) { this.p1.copy(P); this.v1.set(0, 0, 0); return; }
    const A = _a.copy(V).sub(this.v1).divideScalar(dt);
    this.p1.copy(P); this.v1.copy(V);
    // gravity once the head is tilted: the hair was styled hanging under the rest pose's gravity
    this.head.getWorldQuaternion(_q);
    _g.copy(GRAVITY).applyQuaternion(_q).sub(GRAVITY).multiplyScalar(-0.25);
    // integrate in steps short enough for the spring (render frames can be long)
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      _f.copy(A).multiplyScalar(-this.gain).add(_g).addScaledVector(this.off, -this.k).addScaledVector(this.vel, -this.c);
      this.vel.addScaledVector(_f, h);
      this.off.addScaledVector(this.vel, h);
    }
    // (a hard hit can fling the spring far: it is held within three times the swing shown, and what is shown
    // flattens out softly towards the most a tip moves, instead of stopping dead against it)
    let l = this.off.length();
    if (l > 3 * this.max) { this.off.multiplyScalar(3 * this.max / l); this.vel.multiplyScalar(0.5); l = 3 * this.max; }
    const shown = l > 1e-6 ? this.max * Math.tanh(l / this.max) / l : 1;
    // to the head's rest frame, where the shader moves the vertices before skinning
    this.u.value.copy(this.off).multiplyScalar(shown * this.amount).applyQuaternion(_q.invert());
  }
}
