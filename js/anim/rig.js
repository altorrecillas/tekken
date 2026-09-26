// Procedural IK rig for MakeHuman skeletons (rest local rotations are identity / world aligned).
// A pose is a flat Float32Array described by POSE_LAYOUT; the rig turns it into bone quaternions.
import * as THREE from 'three';
import { fitBody, BodyState, pushOut, capsuleDepth, HAND_SCALE } from './body.js';

// ---------------------------------------------------------------- pose layout
const FIELDS = [
  ['rootPos', 3], ['rootRot', 3], ['spine', 3], ['neck', 3],
  ['handL', 3], ['poleL', 3], ['twistL', 1], ['wristL', 2], ['fistL', 1], ['clavL', 2],
  ['handR', 3], ['poleR', 3], ['twistR', 1], ['wristR', 2], ['fistR', 1], ['clavR', 2],
  ['footL', 3], ['kneeL', 3], ['footRotL', 3], ['toeL', 1],
  ['footR', 3], ['kneeR', 3], ['footRotR', 3], ['toeR', 1],
  ['jaw', 1], ['look', 1], ['aimL', 1], ['aimR', 1],
  ['hgL', 1], ['hgPosL', 3], ['hgR', 1], ['hgPosR', 3],
];
export const POSE = {};
let off = 0;
for (const [n, s] of FIELDS) { POSE[n] = [off, s]; off += s; }
export const POSE_SIZE = off;

export function newPose() { return new Float32Array(POSE_SIZE); }

export function setField(p, name, v) {
  const [o, s] = POSE[name];
  if (s === 1) p[o] = Array.isArray(v) ? v[0] : v;
  else for (let i = 0; i < s; i++) p[o + i] = v[i];
}
export function getField(p, name) {
  const [o, s] = POSE[name];
  return s === 1 ? p[o] : Array.from(p.subarray(o, o + s));
}
// partial object -> overwrite fields of a pose
export function applyPartial(p, obj) {
  for (const k in obj) if (POSE[k]) setField(p, k, obj[k]);
  return p;
}
export function lerpPose(out, a, b, t) {
  for (let i = 0; i < POSE_SIZE; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

// ---------------------------------------------------------------- math helpers
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _e = new THREE.Euler();
const _X_AXIS = new THREE.Vector3(1, 0, 0);
const _hv = new THREE.Vector3(), _hv2 = new THREE.Vector3(), _hv3 = new THREE.Vector3();

function basisQuat(x, y, out) {
  // orthonormal basis with x axis = x, y axis ~ y
  const X = _v3.copy(x).normalize();
  const Y = _v4.copy(y).addScaledVector(X, -y.dot(X)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  _m1.makeBasis(X, Y, Z);
  return out.setFromRotationMatrix(_m1);
}
function perp(v, axis, out) {
  return out.copy(v).addScaledVector(axis, -v.dot(axis));
}
function eulerQuat(p, y, r, out) {
  _e.set(p, y, r, 'YXZ');
  return out.setFromEuler(_e);
}

const _ch1 = new THREE.Vector3(), _ch2 = new THREE.Vector3(), _ch3 = new THREE.Vector3(), _ch4 = new THREE.Vector3(), _ch5 = new THREE.Vector3(), _ch6 = new THREE.Vector3();
const _cs1 = new THREE.Vector3(), _cs2 = new THREE.Vector3(), _at1 = new THREE.Vector3(), _sp1 = new THREE.Vector3(), _sp2 = new THREE.Vector3();
const _sp3 = new THREE.Vector3(), _sp4 = new THREE.Vector3(), _sp5 = new THREE.Vector3();
const _ah1 = new THREE.Vector3(), _ah2 = new THREE.Vector3(), _ah3 = new THREE.Vector3();
const _lg1 = new THREE.Vector3(), _lg2 = new THREE.Vector3(), _lg3 = new THREE.Vector3(), _pd1 = new THREE.Vector3(), _pd2 = new THREE.Vector3();
const HAND_OWN = ['hips', 'belly', 'chest', 'upper', 'neck', 'head', 'thigh.L', 'thigh.R'];
const ARM_TORSO = ['hips', 'belly', 'chest'];
const ELBOW_OUT = ['hips', 'belly', 'chest', 'thigh.L', 'thigh.R'];
// the opponent's volumes an arm must go round (clinches, throws, close-range guards) and that a gripping hand rests on
const OPP_TORSO = ['hips', 'belly', 'chest', 'upper', 'neck', 'head'];
const OPP_GRIP = ['hips', 'belly', 'chest', 'upper', 'neck', 'head', 'uarm.L', 'uarm.R', 'farm.L', 'farm.R'];

const SPINE = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'];
const SPINE_W = [0.14, 0.2, 0.24, 0.22, 0.2];
const NECK = ['neck01', 'neck02', 'neck03', 'head'];
const NECK_W = [0.22, 0.2, 0.18, 0.4];

export class Rig {
  static FINGER_SIGN = 1;
  static THUMB_OPP = 1.6;
  static THUMB_SIGN = -1;  // flex direction of the two distal thumb joints (+1 hyperextends them: thumb sticks out of a fist)
  static THUMB_BASE = 0.5; // curl of the thumb base on top of its opposition roll
  static LID_UP = 0.38;
  constructor(ch) {
    this.ch = ch;
    this.b = ch.bones;
    const R = (n) => ch.rest[n].head.clone();
    this.rest = {};
    for (const n in ch.rest) this.rest[n] = ch.rest[n].head;
    this.parent = {};
    for (const bn in this.b) this.parent[bn] = this.b[bn].parent && this.b[bn].parent.isBone ? this.b[bn].parent.name : null;
    this.world = {}; // bone name -> {q: Quaternion (world rot), p: Vector3 (world head pos)} in character space
    this.arm = {};
    this.leg = {};
    for (const s of ['L', 'R']) {
      const S0 = R(`upperarm01.${s}`), E0 = R(`lowerarm01.${s}`), W0 = R(`wrist.${s}`);
      const a = S0.distanceTo(E0), bl = E0.distanceTo(W0);
      const x0 = E0.clone().sub(S0).normalize();
      const l0 = W0.clone().sub(E0).normalize();
      const y0 = perp(l0, x0, new THREE.Vector3()).normalize(); // forearm fold direction in rest
      const r0 = perp(x0.clone().negate(), l0, new THREE.Vector3()).normalize();
      const rUp = basisQuat(x0, y0, new THREE.Quaternion()).invert();
      const rLo = basisQuat(l0, r0, new THREE.Quaternion()).invert();
      this.arm[s] = { S0, E0, W0, a, b: bl, x0, y0, l0, r0, rUp, rLo, len: a + bl };
      const H0 = R(`upperleg01.${s}`), K0 = R(`lowerleg01.${s}`), A0 = R(`foot.${s}`);
      const la = H0.distanceTo(K0), lb = K0.distanceTo(A0);
      const lx0 = K0.clone().sub(H0).normalize();
      const ll0 = A0.clone().sub(K0).normalize();
      const ly0 = perp(new THREE.Vector3(0, 0, -1), lx0, new THREE.Vector3()).normalize(); // shin folds backwards
      const lr0 = perp(new THREE.Vector3(0, 0, -1), ll0, new THREE.Vector3()).normalize();
      const B0 = this.b[`toe3-1.${s}`] ? R(`toe3-1.${s}`) : A0.clone().add(new THREE.Vector3(0, -0.05, 0.13));
      this.footLen = this.footLen || {};
      this.footLen[s] = Math.hypot(B0.x - A0.x, B0.z - A0.z);
      this.footH = this.footH || {};
      this.footH[s] = Math.max(0.02, A0.y - B0.y); // ankle above the ball of the foot
      this.leg[s] = { H0, K0, A0, a: la, b: lb, x0: lx0, y0: ly0, l0: ll0, r0: lr0,
        rUp: basisQuat(lx0, ly0, new THREE.Quaternion()).invert(),
        rLo: basisQuat(ll0, lr0, new THREE.Quaternion()).invert(), len: la + lb };
      // fingers: curl axis per finger bone
    }
    this.legScale = (this.leg.L.len + this.leg.R.len) / 2 / 0.86;
    this.armScale = (this.arm.L.len + this.arm.R.len) / 2 / 0.56;
    this.fingers = { L: [], R: [] };
    for (const s of ['L', 'R']) {
      const wr = R(`wrist.${s}`);
      const f2 = R(`finger2-1.${s}`), f5 = R(`finger5-1.${s}`);
      const handDir = f2.clone().add(f5).multiplyScalar(0.5).sub(wr).normalize();
      const across = f2.clone().sub(f5).normalize();
      let palm = new THREE.Vector3().crossVectors(handDir, across).normalize();
      if (s === 'R') palm.negate();
      this.palm = this.palm || {}; this.palm[s] = { handDir, across, palm };
      for (let f = 1; f <= 5; f++) for (let j = 1; j <= 3; j++) {
        const n = `finger${f}-${j}.${s}`;
        if (!this.b[n]) continue;
        const h = R(n);
        const nx = this.b[`finger${f}-${j + 1}.${s}`] ? R(`finger${f}-${j + 1}.${s}`) : null;
        const dir = nx ? nx.clone().sub(h).normalize() : handDir.clone();
        // curl towards the palm: rotation axis = dir x palm
        // rotation axes are pseudovectors: the mirrored hand needs no extra flip
        const axis = new THREE.Vector3().crossVectors(palm, dir).normalize().multiplyScalar(-Rig.FINGER_SIGN);
        // thumb base: opposition roll about the hand axis swings it across the front of the curled fingers
        const opp = f === 1 && j === 1 ? handDir.clone().multiplyScalar(s === 'L' ? 1 : -1) : null;
        // knuckle adduction: the base mesh's fingers are fanned out; a relaxed hand keeps them closer and a fist
        // packs them together (fanned + curled reads as a claw)
        let addAxis = null, addAng = 0;
        if (f >= 2 && j === 1 && nx) {
          const d = dir.clone().addScaledVector(palm, -dir.dot(palm)).normalize();
          const hd = handDir.clone().addScaledVector(palm, -handDir.dot(palm)).normalize();
          addAng = Math.acos(THREE.MathUtils.clamp(d.dot(hd), -1, 1));
          addAxis = new THREE.Vector3().crossVectors(d, hd);
          if (addAxis.lengthSq() < 1e-8 || addAng < 0.02) addAxis = null; else addAxis.normalize();
        }
        this.fingers[s].push({ n, axis, thumb: f === 1, j, opp, addAxis, addAng });
      }
    }
    this.chestRest = R('spine01');
    this.tmpPose = newPose();
    this.lookTarget = null; // character-space point for the head to look at
    // body volumes fitted to the mesh: fists, elbows and kicking feet are kept out of the own body and, through
    // `obstacles` (the opponent's volumes in this character's space, set every frame by the fighter), out of the
    // opponent's: a strike stops on the surface and the elbow or knee bends instead of the limb going through
    this.vols = ch.meshes && ch.meta ? fitBody(ch, this.parent) : null;
    this.body = this.vols ? new BodyState(this.vols) : null;
    this.obstacles = null;
    this.floorY = 0; // floor height in character space (the fighter sets it while airborne)
    this.handReach = {};
    this.knuckle = {}; // wrist -> middle knuckle, rest space (the finger bones are not tracked in this.world)
    // larger hands: the wrist bone is scaled, which scales the whole hand and fingers about the wrist joint (watches and
    // bracelets hang from the forearm and keep their size); the knuckle offset and reach follow
    for (const s of ['L', 'R']) {
      this.b[`wrist.${s}`]?.scale.setScalar(HAND_SCALE);
      this.knuckle[s] = R(`finger3-1.${s}`).sub(R(`wrist.${s}`)).multiplyScalar(HAND_SCALE);
      this.handReach[s] = this.knuckle[s].length() * 1.25;
    }
    this.bendDir = { L: new THREE.Vector3(), R: new THREE.Vector3(), kL: new THREE.Vector3(), kR: new THREE.Vector3() };
    this.pushS = { L: new THREE.Vector3(), R: new THREE.Vector3(), fL: new THREE.Vector3(), fR: new THREE.Vector3() };
    this.grip = { L: { p: new THREE.Vector3(), w: 0 }, R: { p: new THREE.Vector3(), w: 0 } };
    this.look = { yaw: 0, pitch: 0, init: false };
  }

  // world transform helpers ---------------------------------------------------
  _setLocal(name, qWorld) {
    // local = inverse(parentWorld) * world ; parentWorld tracked in this.world
    const par = this.parent[name];
    const pw = par && this.world[par] ? this.world[par].q : null;
    const bone = this.b[name];
    if (pw) bone.quaternion.copy(_q1.copy(pw).invert().multiply(qWorld));
    else bone.quaternion.copy(qWorld);
    this._fk(name);
  }
  _setLocalRaw(name, qLocal) {
    this.b[name].quaternion.copy(qLocal);
    this._fk(name);
  }
  _fk(name) {
    const par = this.parent[name];
    const bone = this.b[name];
    let w = this.world[name];
    if (!w) w = this.world[name] = { q: new THREE.Quaternion(), p: new THREE.Vector3() };
    if (par && this.world[par]) {
      const pw = this.world[par];
      w.q.copy(pw.q).multiply(bone.quaternion);
      w.p.copy(bone.position).applyQuaternion(pw.q).add(pw.p);
    } else {
      w.q.copy(bone.quaternion);
      w.p.copy(bone.position);
    }
  }
  _fkChainIdentity(name) { // bone with identity local rotation
    this.b[name].quaternion.identity();
    this._fk(name);
  }

  // main entry ------------------------------------------------------------------
  // logic = the fixed-step simulation pose (render interpolations reuse its smoothed look and bend states)
  apply(p, logic = false) {
    if (logic) this.logicDriven = true;
    const stepState = logic || !this.logicDriven;
    this._stepState = stepState;
    const b = this.b;
    // root
    const rp = POSE.rootPos[0];
    const rootRest = this.rest.root;
    b.root.position.set(rootRest.x + p[rp] * this.legScale, rootRest.y + p[rp + 1] * this.legScale, rootRest.z + p[rp + 2] * this.legScale);
    const rr = POSE.rootRot[0];
    eulerQuat(p[rr], p[rr + 1], p[rr + 2], b.root.quaternion);
    this._fk('root');
    // spine
    const sp = POSE.spine[0];
    for (let i = 0; i < SPINE.length; i++) {
      const w = SPINE_W[i];
      eulerQuat(p[sp] * w, p[sp + 1] * w, p[sp + 2] * w, _q2);
      this._setLocalRaw(SPINE[i], _q2);
    }
    // neck + head (look target adds yaw/pitch)
    const nk = POSE.neck[0];
    let lookYaw = 0, lookPitch = 0;
    const lookAmt = p[POSE.look[0]];
    if (this.lookTarget && lookAmt > 0) {
      // compute direction in chest frame
      const chest = this.world.spine01;
      const headPos = _v1.copy(this.rest.head).sub(this.rest.spine01).applyQuaternion(chest.q).add(chest.p);
      const d = _v2.copy(this.lookTarget).sub(headPos).applyQuaternion(_q3.copy(chest.q).invert());
      const toYaw = Math.atan2(d.x, d.z);
      // a target behind the shoulder (spins, turned backs) is let go instead of being chased round the back of the
      // neck (the yaw wraps from +180 to -180 degrees and the head whips across)
      const k = lookAmt * THREE.MathUtils.smoothstep(Math.abs(toYaw), 2.3, 1.6);
      lookYaw = toYaw * k;
      lookPitch = -Math.atan2(d.y, Math.hypot(d.x, d.z)) * k;
      lookYaw = Math.max(-1.1, Math.min(1.1, lookYaw));
      lookPitch = Math.max(-0.6, Math.min(0.6, lookPitch));
    }
    // the eyes lead but the head follows the look target smoothly
    const L = this.look;
    if (!L.init || this.snapLook) { L.yaw = lookYaw; L.pitch = lookPitch; L.init = true; this.snapLook = false; }
    else if (stepState) { L.yaw += (lookYaw - L.yaw) * 0.3; L.pitch += (lookPitch - L.pitch) * 0.3; }
    // anatomical range of the neck (authored turn + look): about 75 degrees of turn, 45 of nod
    const yawT = THREE.MathUtils.clamp(p[nk + 1] + L.yaw, -1.3, 1.3), pitchT = THREE.MathUtils.clamp(p[nk] + L.pitch, -0.8, 0.85);
    for (let i = 0; i < NECK.length; i++) {
      const w = NECK_W[i];
      eulerQuat(pitchT * w, yawT * w, p[nk + 2] * w, _q2);
      this._setLocalRaw(NECK[i], _q2);
    }
    if (b.jaw) { eulerQuat(p[POSE.jaw[0]], 0, 0, _q2); this._setLocalRaw('jaw', _q2); }
    // eyelids: natural blinking (visual only) plus an explicit closure (hurt / KO)
    if (b['orbicularis03.L']) {
      const now = performance.now() / 1000;
      if (this._blinkAt === undefined) this._blinkAt = now + 0.5 + Math.random() * 3;
      let blink = 0;
      if (now >= this._blinkAt) {
        const t = (now - this._blinkAt) / 0.16;
        if (t >= 1) this._blinkAt = now + 1.8 + Math.random() * 4.2 + (Math.random() < 0.15 ? -1.5 : 0);
        else blink = Math.sin(t * Math.PI);
      }
      this.setLids(Math.max(blink, this.lidClose || 0));
    }
    // legs first: the hands are kept out of the thighs of this very frame
    for (const s of ['L', 'R']) this._leg(s, p);
    this.body?.update(this.world);
    // arms
    for (const s of ['L', 'R']) this._arm(s, p);
  }

  // 0 = open, 1 = shut: upper lids sweep down over the eyeball (bone pivots sit at the eye centres)
  setLids(c) {
    const b = this.b;
    if (!b['orbicularis03.L']) return;
    for (const s of ['L', 'R']) {
      b[`orbicularis03.${s}`].quaternion.setFromAxisAngle(_X_AXIS, c * Rig.LID_UP);
      b[`orbicularis04.${s}`].quaternion.setFromAxisAngle(_X_AXIS, -c * Rig.LID_UP * 0.28);
    }
  }

  _arm(s, p) {
    const A = this.arm[s];
    const cl = POSE['clav' + s][0];
    const sgn = s === 'L' ? 1 : -1;
    // clavicle: raise (around z) and forward (around y)
    eulerQuat(0, -p[cl + 1] * sgn, p[cl] * sgn, _q2);
    this._setLocalRaw(`clavicle.${s}`, _q2);
    this._fkChainIdentity(`shoulder01.${s}`);
    this.b[`upperarm01.${s}`].quaternion.identity();
    this._fk(`upperarm01.${s}`);
    const S = this.world[`upperarm01.${s}`].p.clone();
    // hand target: chest space, normalized by arm length, relative to rest shoulder
    const chest = this.world.spine01;
    const h = POSE['hand' + s][0];
    const tgtLocal = _v1.set(p[h] * sgn, p[h + 1], p[h + 2]).multiplyScalar(A.len).add(A.S0).sub(this.chestRest);
    const T = tgtLocal.applyQuaternion(chest.q).add(chest.p);
    const aim = p[POSE['aim' + s][0]];
    if (aim > 0) {
      // character-space aiming: target = current shoulder + v * armLength (x mirrored)
      const Tc = _v4.set(p[h] * sgn, p[h + 1], p[h + 2]).multiplyScalar(A.len).add(S);
      T.lerp(Tc, aim);
    }
    const hg = p[POSE['hg' + s][0]];
    if (hg > 0 && this.world.head) {
      // guard: fist placed relative to the face (character axes, x mirrored), scaled by body size
      const hp = POSE['hgPos' + s][0];
      const Th = _v4.set(p[hp] * sgn, p[hp + 1], p[hp + 2]).multiplyScalar(this.armScale).add(this.world.head.p);
      T.lerp(Th, hg);
    }
    // grips (throws): the hand goes to a point on the other fighter's body
    const gr = this.grip[s];
    if (gr.w > 0) T.lerp(gr.p, gr.w);
    this._gripping = gr.w > 0.5;
    // keep the fist out of the face: the wrist target never enters a sphere around the face centre
    if (this.world.head) {
      const hq = this.world.head.q;
      const c = _hv.set(0, 0.09 * this.armScale, 0.04 * this.armScale).applyQuaternion(hq).add(this.world.head.p);
      const R = 0.19 * this.armScale, d = T.distanceTo(c);
      const fw = _hv2.set(0, 0, 1).applyQuaternion(hq);
      const rel = _hv3.subVectors(T, c);
      // only hands in front of (or level with) the face can hit it; a hand flung up and back behind the head
      // (launched, arms flailing) is left alone
      if (d < R && rel.dot(fw) > -0.35 * R) {
        // exit through the front of the face, keeping the sideways offset: a radial push parks the hands on the
        // crown whenever the torso is tilted back (thrown, launched)
        rel.addScaledVector(fw, -rel.dot(fw));
        T.copy(c).add(rel).addScaledVector(fw, Math.sqrt(Math.max(0, R * R - rel.lengthSq())));
      }
    }
    // ... and out of the body (torso, head, thighs: volumes fitted to this character, bellies included), clear of
    // the other fist, and stopped on the opponent's surface instead of going through
    if (this.body) {
      // the corrections (own body, opponent, gloves) are eased in time: a contact that appears or vanishes from one
      // frame to the next (the opponent's hands flashing past) must not snap the fist; they grow fast and release slowly
      const T0 = _pd1.copy(T);
      this._clearHand(s, S, T, chest.q);
      const raw = _pd2.subVectors(T, T0), ps = this.pushS[s];
      // (the striking fist takes the full stop at once: it must land on the surface, not sink in and come out)
      if (this._stepState) ps.lerp(raw, raw.lengthSq() >= ps.lengthSq() ? (this.striking === 'hand' + s ? 1 : 0.65) : 0.22);
      T.copy(T0).add(ps);
      // the floor is a hard limit (not eased): wrist and the whole hand, out to the knuckles, stay above it
      const rw = this.vols['farm.' + s].r;
      if (T.y < this.floorY + rw) T.y = this.floorY + rw;
      const lo = this._handLow(s, S, T);
      if (lo < this.floorY) T.y += this.floorY - lo;
    } else {
      const tA = (this.world.spine05 || this.world.spine04)?.p, tB = this.world.neck01?.p;
      if (tA && tB) {
        const ab = _hv2.subVectors(tB, tA), l2 = ab.lengthSq();
        const t = Math.max(0, Math.min(1, _hv3.subVectors(T, tA).dot(ab) / l2));
        const c = _hv3.copy(tA).addScaledVector(ab, t);
        const Rt = 0.15 * this.armScale, d = T.distanceTo(c);
        if (d < Rt) {
          const out = _v4.subVectors(T, c);
          if (out.lengthSq() < 1e-8) out.set(0, 0, 1).applyQuaternion(chest.q);
          T.copy(c).addScaledVector(out.normalize(), Rt);
        }
      }
    }
    const po = POSE['pole' + s][0];
    const pole = _v2.set(p[po] * sgn, p[po + 1], p[po + 2]).applyQuaternion(chest.q);
    const bend = this.bendDir[s];
    this._stablePole(pole, S, T, bend, _sp4.set(0.3 * sgn, -1, -0.5).applyQuaternion(chest.q).normalize(), _sp5.set(sgn, 0, 0).applyQuaternion(chest.q));
    // the forearm folds onto the biceps no further than ~35 degrees
    {
      const minD = Math.sqrt(A.a * A.a + A.b * A.b - 2 * A.a * A.b * Math.cos(0.62));
      const v = _pd2.subVectors(T, S), l = v.length();
      if (l < minD) { if (l > 1e-5) T.copy(S).addScaledVector(v, minD / l); else T.copy(S).addScaledVector(pole, minD / Math.max(1e-5, pole.length())); }
    }
    let ik = this._twoBone(S, T, A.a, A.b, pole);
    // elbow and forearm out of the belly and hips: swing the bend plane outwards
    if (this.body) {
      const d0 = this._armInTorso(s, S, ik.E, T);
      if (d0 > 0.012) {
        const Eo = _ah1.copy(ik.E), rr = this.vols['uarm.' + s].r;
        for (const n of ELBOW_OUT) pushOut(Eo, rr, this.body.seg[n], _ah2.set(sgn, 0, 0));
        const np = Eo.sub(_ah3.addVectors(S, T).multiplyScalar(0.5));
        if (np.lengthSq() > 1e-8) {
          const ik2 = this._twoBone(S, T, A.a, A.b, np);
          if (this._armInTorso(s, S, ik2.E, T) < d0) ik = ik2;
        }
      }
    }
    // ... and round the opponent's body: arms wrapped round him in a clinch or a throw go round his sides instead of
    // through his chest (same swing of the bend plane, against his volumes)
    if (this.obstacles && (this.obstacleList || this._gripping)) {
      const d0 = this._armInOpp(s, S, ik.E, T);
      if (d0 > 0.01) {
        const O = this.obstacles.seg, Eo = _ah1.copy(ik.E), rr = this.vols['uarm.' + s].r;
        const out = _ah2.set(sgn, 0, 0).applyQuaternion(chest.q);
        for (let it = 0; it < 2; it++) for (const n of OPP_TORSO) if (O[n].ok) pushOut(Eo, rr, O[n], out);
        const np = Eo.sub(_ah3.addVectors(S, T).multiplyScalar(0.5));
        if (np.lengthSq() > 1e-8) {
          const ik2 = this._twoBone(S, T, A.a, A.b, np);
          if (this._armInOpp(s, S, ik2.E, T) < d0) ik = ik2;
        }
      }
    }
    bend.subVectors(ik.E, _ah3.addVectors(S, T).multiplyScalar(0.5)).normalize();
    const { up, lo } = ik;
    // upper arm world rotation
    const x = up, n = ik.n;
    const fold = n ? new THREE.Vector3().crossVectors(x, n) : perp(lo, x, new THREE.Vector3());
    if (fold.lengthSq() < 1e-6) perp(pole.clone().negate(), x, fold);
    const qUp = basisQuat(x, fold, new THREE.Quaternion()).multiply(A.rUp);
    this._setLocal(`upperarm01.${s}`, qUp);
    this._fkChainIdentity(`upperarm02.${s}`);
    const r = n ? new THREE.Vector3().crossVectors(lo, n) : perp(x.clone().negate(), lo, new THREE.Vector3());
    const qLo = basisQuat(lo, r, new THREE.Quaternion()).multiply(A.rLo);
    this._setLocal(`lowerarm01.${s}`, qLo);
    // forearm twist split between lowerarm02 and wrist
    const tw = p[POSE['twist' + s][0]] * sgn;
    const axisLocal = A.l0; // in rest (identity) frame the forearm axis
    _q2.setFromAxisAngle(axisLocal, tw * 0.5);
    this._setLocalRaw(`lowerarm02.${s}`, _q2);
    const wr = POSE['wrist' + s][0];
    const pl = this.palm[s];
    _q3.setFromAxisAngle(pl.across, p[wr] * sgn); // flex
    _q2.setFromAxisAngle(pl.palm, p[wr + 1]).multiply(_q3);
    _q3.setFromAxisAngle(axisLocal, tw * 0.5);
    this._setLocalRaw(`wrist.${s}`, _q3.multiply(_q2));
    // fingers
    const fist = p[POSE['fist' + s][0]];
    for (const f of this.fingers[s]) {
      const bone = this.b[f.n];
      if (f.opp) {
        _q2.setFromAxisAngle(f.opp, fist * Rig.THUMB_OPP);
        _q3.setFromAxisAngle(f.axis, fist * Rig.THUMB_BASE);
        bone.quaternion.copy(_q2).multiply(_q3);
        continue;
      }
      const ang = f.thumb ? fist * (f.j === 2 ? 0.55 : 0.8) * Rig.THUMB_SIGN : fist * (f.j === 1 ? 1.35 : f.j === 2 ? 1.5 : 1.0) + 0.08;
      bone.quaternion.setFromAxisAngle(f.axis, ang);
      if (f.addAxis) bone.quaternion.premultiply(_q3.setFromAxisAngle(f.addAxis, f.addAng * (0.45 + 0.4 * fist)));
    }
  }

  _leg(s, p) {
    const L = this.leg[s];
    this.b[`upperleg01.${s}`].quaternion.identity();
    this._fk(`pelvis.${s}`);
    this._fk(`upperleg01.${s}`);
    const H = this.world[`upperleg01.${s}`].p.clone();
    const f = POSE['foot' + s][0];
    const sgn = s === 'L' ? 1 : -1;
    const T = _v1.set(p[f] * sgn, p[f + 1], p[f + 2]).multiplyScalar(this.legScale);
    const fr = POSE['footRot' + s][0];
    // how much this foot counts as planted: 1 on the floor, fading to 0 as it lifts 5 cm (every planted-foot rule
    // below blends by it, so a foot peeling off the floor in a step never switches rules from one frame to the next)
    const fy = p[f + 1];
    // ... and only for a body standing over its feet: lying on the back (landing, knocked down, getting up) the feet
    // rest on their heels with the toes up, and the planted-sole rules (toes held flat, pivot on the ball, knee over
    // the toes) would twist them round as the body settles
    const rp = p[POSE.rootRot[0]], rr = p[POSE.rootRot[0] + 2];
    const up0 = Math.max(0, Math.min(1, (Math.cos(rp) * Math.cos(rr) - 0.3) / 0.45)), upright = up0 * up0 * (3 - 2 * up0);
    const gw0 = Math.max(0, Math.min(1, (0.13 - fy) / 0.055)), gw = gw0 * gw0 * (3 - 2 * gw0) * upright;
    let heel = 0, pitchT = 0, pitchFloor = 0;
    this._pivotFoot = null;
    const fl = (this.footLen?.[s] || 0.13) * this.legScale, fh = (this.footH?.[s] || 0.042) * this.legScale;
    const pa = Math.max(0, p[fr]);
    const riseOf = (phi) => fl * Math.sin(phi) - fh * (1 - Math.cos(phi));
    // a raised heel stays up while the foot leaves the floor and fades out as the clip's own lift overtakes it
    // (faded with the planted weight, the ankle dropped a couple of centimetres on the frame the foot took off and
    // then shot up: a pop at the start of every kick from a peeled heel)
    const lift = Math.max(0, (fy - 0.071) * this.legScale);
    const keepOf = (rise) => { const u = Math.min(1, lift / Math.max(0.02, 2 * rise)); return 1 - u * u * (3 - 2 * u); };
    if (gw > 0 || (pa > 0 && keepOf(riseOf(pa)) > 1e-3)) {
      // A raised heel (authored, or needed because the target is out of reach as the body rises or lunges away)
      // pivots on the ball of the foot: the ankle goes up and towards the toes, so the sole never sinks into the
      // floor and the toes stay flat on it
      const yaw = p[fr + 1] * sgn, fx = Math.sin(yaw), fz = Math.cos(yaw);
      const base = _lg1.copy(T);
      const pivot = (phi) => {
        T.copy(base);
        const k = fl * (1 - Math.cos(phi)) + fh * Math.sin(phi), rise = riseOf(phi), w = Math.max(gw, keepOf(rise));
        T.y += rise * w;
        T.x += fx * k * w; T.z += fz * k * w;
      };
      if (pa > 0) pivot(pa);
      // a planted foot cannot point its toes far up (an authored lift left over from a lying pose)
      pitchFloor = (Math.max(p[fr], -0.15) - p[fr]) * gw;
      const reach = (L.a + L.b) * 0.985;
      let need = T.distanceTo(H) - reach, phi = pa;
      for (let it = 0; it < 4 && need > 0 && gw > 0; it++) {
        phi = Math.min(pa + 0.95, phi + Math.asin(Math.min(0.85, need / fl)));
        pivot(phi);
        need = T.distanceTo(H) - reach;
      }
      heel = (phi - pa) * gw;
      pitchT = phi;
      this._pivotFoot = pivot;
    }
    if (gw < 1) {
      // a foot just off the floor with its toes pointing down must not push the ball of the foot through it
      const ph = p[fr];
      if (ph > 0) {
        const fl = (this.footLen?.[s] || 0.13) * this.legScale, fh = (this.footH?.[s] || 0.042) * this.legScale;
        const ballY = T.y - fh * Math.cos(ph) - fl * Math.sin(ph) + 0.027 * this.legScale;
        if (ballY < 0.012) T.y += 0.012 - ballY;
      }
    }
    const kn = POSE['knee' + s][0];
    const pole = _v2.set(p[kn] * sgn, p[kn + 1], p[kn + 2]);
    if (gw > 0) {
      // a planted leg bends over its toes: the knee follows the foot as it pivots (a knee left pointing forward
      // while the foot turns out 90 degrees reads as a broken knee)
      const yaw = p[fr + 1] * sgn, k = 0.85 * gw;
      _lg2.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(Math.hypot(pole.x, pole.z) || 1);
      pole.x += (_lg2.x - pole.x) * k; pole.z += (_lg2.z - pole.z) * k;
    }
    const bend = this.bendDir['k' + s];
    this._stablePole(pole, H, T, bend, _sp4.set(0.1 * sgn, 0.6, 1).normalize(), _sp5.set(0, 0, 1));
    // a kicking foot stops on the opponent's surface (the knee bends) instead of going through
    {
      const T0 = _pd1.copy(T);
      if (gw < 1 && this.obstacles) {
        const dir = _lg2.subVectors(T, H).normalize();
        const F = _lg3.copy(T).addScaledVector(dir, 0.07 * this.legScale);
        if (this._clearStrike(H, F, this.vols ? this.vols['foot.' + s].r * 0.8 : 0.04, (this.striking === 'foot' + s ? 0.55 : 0.4) * (L.a + L.b), 'foot' + s)) T.copy(F).addScaledVector(dir, -0.07 * this.legScale);
      }
      const raw = _pd2.subVectors(T, T0), ps = this.pushS['f' + s];
      if (this._stepState) ps.lerp(raw, raw.lengthSq() >= ps.lengthSq() ? (this.striking === 'foot' + s ? 1 : 0.65) : 0.22);
      T.copy(T0).add(ps);
    }
    // the calf folds onto the thigh no further than ~30 degrees
    {
      const minD = Math.sqrt(L.a * L.a + L.b * L.b - 2 * L.a * L.b * Math.cos(0.52));
      const v = _pd2.subVectors(T, H), l = v.length();
      if (l < minD && l > 1e-5) T.copy(H).addScaledVector(v, minD / l);
    }
    let ikL = this._twoBone(H, T, L.a, L.b, pole);
    if (this._pivotFoot) {
      // ankle range: a shin folded down over a flat foot (kneeling, deep lunges) lifts the heel instead
      const ang = this._ankleAngle(ikL.E, T, p[fr + 1] * sgn, pitchT);
      if (ang < 0.98) {
        const extra = Math.min(1.1, 0.98 - ang);
        this._pivotFoot(pitchT + extra);
        heel += extra * gw; pitchT += extra;
        ikL = this._twoBone(H, T, L.a, L.b, pole);
      }
    }
    this._pivotFoot = null;
    // ankle range off the floor too (kicks, knees, jumps): the authored foot pitch is in character space, and with
    // the shin swung up, back or across it could fold the foot onto the shin (under ~65 degrees) or bend it back
    // past straight. The pitch is nudged into the range, in whichever direction opens the angle
    let pitchAir = 0;
    if (gw < 1) {
      const yaw = p[fr + 1] * sgn, ph0 = p[fr] + heel + pitchFloor;
      let ph = ph0;
      for (let it = 0; it < 3; it++) {
        const ang = this._ankleAngle(ikL.E, T, yaw, ph);
        const tgt = ang < 1.2 ? 1.2 : ang > 2.95 ? 2.95 : null;
        if (tgt === null) break;
        const dA = (this._ankleAngle(ikL.E, T, yaw, ph + 0.05) - ang) / 0.05;
        if (Math.abs(dA) < 0.2) break; // the foot turned across the shin: pitch barely changes the angle
        ph += Math.max(-0.8, Math.min(0.8, (tgt - ang) / dA));
      }
      pitchAir = (ph - ph0) * (1 - gw);
    }
    bend.subVectors(ikL.E, _ah3.addVectors(H, T).multiplyScalar(0.5)).normalize();
    const { up, lo } = ikL;
    const nL = ikL.n;
    const fold = nL ? new THREE.Vector3().crossVectors(up, nL) : perp(lo, up, new THREE.Vector3());
    if (fold.lengthSq() < 1e-6) perp(pole.clone().negate(), up, fold);
    const qUp = basisQuat(up, fold, new THREE.Quaternion()).multiply(L.rUp);
    this._setLocal(`upperleg01.${s}`, qUp);
    this._fkChainIdentity(`upperleg02.${s}`);
    const r = nL ? new THREE.Vector3().crossVectors(lo, nL) : perp(up.clone().negate(), lo, new THREE.Vector3());
    const qLo = basisQuat(lo, r, new THREE.Quaternion()).multiply(L.rLo);
    this._setLocal(`lowerleg01.${s}`, qLo);
    this._fkChainIdentity(`lowerleg02.${s}`);
    eulerQuat(p[fr] + heel + pitchFloor + pitchAir, p[fr + 1] * sgn, p[fr + 2] * sgn, _q2);
    this._setLocal(`foot.${s}`, _q2);
    // toes stay flat on the floor while the heel is up (blended with the authored toes as the foot lifts)
    const toeA = p[POSE['toe' + s][0]] + heel * 0.8;
    const toeG = pitchT > 0 ? Math.max(0, (p[fr] + heel) * 0.95) : toeA;
    const toe = toeA + (toeG - toeA) * gw;
    for (const t of ['toe1-1', 'toe2-1', 'toe3-1', 'toe4-1', 'toe5-1']) {
      const n = `${t}.${s}`;
      if (this.b[n]) this.b[n].quaternion.setFromAxisAngle(_v3.set(1, 0, 0), toe);
    }
  }

  // Keep the fist out of the own body (nearest surface) and stop it on the opponent's (along the strike line).
  _clearHand(s, S, T, chestQ) {
    const B = this.body.seg, V = this.vols;
    const rh = V['hand.' + s].r * 0.8, rw = V['farm.' + s].r;
    const dir = _ch1.subVectors(T, S);
    const dl = dir.length();
    if (dl < 1e-4) return;
    dir.multiplyScalar(1 / dl);
    // the fist lies along the hand, not along the shoulder -> wrist line (the two part as soon as the elbow bends: a
    // hand gripping an arm was taken to be clear of it while it sat 10 cm inside): last frame's hand direction, a
    // few degrees off at most
    const wq = this.world['wrist.' + s]?.q;
    if (wq) { _ch5.copy(this.knuckle[s]).applyQuaternion(wq); const kl = _ch5.length(); if (kl > 1e-5) dir.copy(_ch5).multiplyScalar(1 / kl); }
    const ext = this.handReach[s] * 0.5;
    const F = _ch2.copy(T).addScaledVector(dir, ext); // centre of the fist
    const hint = _ch3.set(0, 0, 1).applyQuaternion(chestQ);
    for (let it = 0; it < 2; it++) {
      let moved = false;
      for (const n of HAND_OWN) {
        const t = B[n];
        if (!t.ok) continue;
        _ch4.copy(F);
        if (pushOut(_ch4, rh, t, hint) > 0) { _ch4.sub(F); F.add(_ch4); T.add(_ch4); moved = true; }
        // the knuckle end of the fist too (the whole hand, not only its middle: a guard fist under the chin
        // pressed its knuckles into the collarbone)
        _ch6.copy(T).addScaledVector(dir, this.handReach[s] * 0.92);
        _ch4.copy(_ch6);
        if (pushOut(_ch4, rh * 0.8, t, hint) > 0) { _ch4.sub(_ch6); F.add(_ch4); T.add(_ch4); moved = true; }
        if (pushOut(T, rw, t, hint) > 0) { F.copy(T).addScaledVector(dir, ext); moved = true; }
      }
      if (!moved) break;
    }
    // hands rest on the floor instead of sinking into it (posted hands, getting up, sweeps): the knuckles and the
    // fingers under them too, not only the middle of the fist
    const lo = Math.min(F.y - rh, T.y + dir.y * this.handReach[s] - V['hand.' + s].r);
    if (lo < this.floorY) { const dy = this.floorY - lo; F.y += dy; T.y += dy; }
    if (T.y < this.floorY + rw) T.y = this.floorY + rw;
    // the right fist is solved after the left one: keep them apart
    if (s === 'R' && this.world['wrist.L']) {
      const wl = this.world['wrist.L'];
      const oc = _ch4.copy(this.knuckle.L).multiplyScalar(0.6).applyQuaternion(wl.q).add(wl.p);
      const d = F.distanceTo(oc), min = rh + V['hand.L'].r * 0.8;
      if (d < min && d > 1e-5) { const k = (min - d) / d; _ch5.subVectors(F, oc).multiplyScalar(k); F.add(_ch5); T.add(_ch5); }
    }
    // a gripping hand (throws) rests on the opponent's body instead of sinking into it
    if (this._gripping && this.obstacles) {
      const O = this.obstacles.seg;
      for (let it = 0; it < 2; it++) {
        for (const n of OPP_GRIP) {
          if (!O[n].ok) continue;
          _ch4.copy(F);
          if (pushOut(_ch4, rh, O[n], hint) > 0) { _ch4.sub(F); F.add(_ch4); T.add(_ch4); }
        }
      }
    }
    const strikingHand = this.striking === 'hand' + s;
    if (this.obstacles && !this._gripping && this._clearStrike(S, F, rh, (strikingHand ? 0.45 : 0.35) * this.arm[s].len, 'hand' + s)) T.copy(F).addScaledVector(dir, -ext);
    // gloves touching at close range: slide off the opponent's fists and forearms instead of passing through
    if (this.obstacleLimbs && !this._gripping) {
      for (const t of this.obstacleLimbs) {
        if (!t.ok) continue;
        _ch4.copy(F);
        const d = pushOut(_ch4, rh, t, hint);
        if (d > 0) { _ch4.sub(F); const l = _ch4.length(), cap = 0.07; if (l > cap) _ch4.multiplyScalar(cap / l); F.add(_ch4); T.add(_ch4); }
      }
    }
  }

  // A limb end F reaching from `from` into the opponent stops where the path first touches its body. Returns true
  // (and moves F) when it had to stop. maxBack caps how far it is pulled back.
  _clearStrike(from, F, r, maxBack, limb = null) {
    const segs = limb && this.striking === limb && this.obstacleStrike ? this.obstacleStrike : this.obstacleList;
    if (!segs) return false;
    let inside = false;
    for (const t of segs) if (t.ok && capsuleDepth(F, F, r, t) > 0) { inside = true; break; }
    if (!inside) return false;
    const n = 20;
    _cs1.copy(from);
    for (let i = 1; i <= n; i++) {
      _cs2.lerpVectors(from, F, i / n);
      let hit = false;
      for (const t of segs) if (t.ok && capsuleDepth(_cs2, _cs2, r, t) > 0) { hit = true; break; }
      if (hit) {
        if (i === 1) return false; // already touching at the root (clinch): leave it to the pose
        const back = _cs1.distanceTo(F);
        if (back > maxBack) _cs1.lerpVectors(F, _cs1, maxBack / back);
        F.copy(_cs1);
        return true;
      }
      _cs1.copy(_cs2);
    }
    return false;
  }

  // angle between the shin (ankle -> knee) and the foot (ankle -> toes) for a foot with yaw and pitch
  _ankleAngle(K, A, yaw, pitch) {
    const c = Math.cos(pitch);
    _sp1.set(Math.sin(yaw) * c, -Math.sin(pitch), Math.cos(yaw) * c);
    _sp2.subVectors(K, A).normalize();
    return Math.acos(Math.max(-1, Math.min(1, _sp1.dot(_sp2))));
  }

  // lowest point of the hand (capsule from the wrist out past the knuckles, along last frame's hand direction) for
  // a wrist at T
  _handLow(s, S, T) {
    const wq = this.world['wrist.' + s]?.q;
    const d = _ch5;
    if (wq) d.copy(this.knuckle[s]).applyQuaternion(wq).normalize(); else d.subVectors(T, S).normalize();
    return Math.min(T.y, T.y + d.y * this.handReach[s]) - this.vols['hand.' + s].r;
  }

  // how deep the arm (upper arm, forearm) sits inside the opponent's torso and head
  _armInOpp(s, S, E, T) {
    const O = this.obstacles.seg, ru = this.vols['uarm.' + s].r, rf = this.vols['farm.' + s].r;
    let d = -1;
    for (const n of OPP_TORSO) {
      if (!O[n].ok) continue;
      d = Math.max(d, capsuleDepth(S, E, ru, O[n]), capsuleDepth(E, T, rf, O[n]));
    }
    return d;
  }

  // how deep the upper arm (lower half) and the forearm sit inside the torso
  _armInTorso(s, S, E, T) {
    const B = this.body.seg, ru = this.vols['uarm.' + s].r, rf = this.vols['farm.' + s].r;
    _at1.lerpVectors(S, E, 0.5);
    let d = -1;
    for (const n of ['belly', 'hips']) d = Math.max(d, capsuleDepth(_at1, E, ru, B[n]));
    for (const n of ARM_TORSO) d = Math.max(d, capsuleDepth(E, T, rf, B[n]));
    for (const n of ['thigh.L', 'thigh.R']) d = Math.max(d, capsuleDepth(E, T, rf, B[n]));
    return d;
  }

  // With the pole almost along the limb the bend plane is undefined and the elbow / knee can flip from one frame
  // to the next; lean on last frame's bend direction instead.
  // fallback: where the joint should point when the pole says nothing (knees up-forward, elbows down-out)
  _stablePole(pole, S, T, bend, fallback = null, lateral = null) {
    const pl = pole.length();
    const dir = _sp1.subVectors(T, S).normalize();
    const perpL = pl < 1e-6 ? 0 : _sp2.copy(pole).addScaledVector(dir, -pole.dot(dir)).length() / pl;
    if (perpL >= 0.4) return;
    // reference direction: last frame's bend (continuity) and the fallback, both taken across the limb; when even
    // that lines up with the limb (an arm hanging straight down, a leg straight up), the lateral direction
    const ref = _sp3.set(0, 0, 0);
    if (bend.lengthSq() > 0.5) ref.addScaledVector(bend, fallback ? 0.6 : 1);
    if (fallback) ref.addScaledVector(fallback, bend.lengthSq() > 0.5 ? 0.4 : 1);
    ref.addScaledVector(dir, -ref.dot(dir));
    if (ref.lengthSq() < 0.09 && lateral) { ref.copy(lateral).addScaledVector(dir, -lateral.dot(dir)); }
    if (ref.lengthSq() < 1e-6) return;
    ref.normalize();
    if (pl < 1e-6) { pole.copy(ref); return; }
    pole.addScaledVector(ref, (0.4 - perpL) * 2.5 * pl);
  }

  _twoBone(S, T, a, b, pole) {
    const d0 = _v3.copy(T).sub(S);
    let d = d0.length();
    const dir = d0.normalize().clone();
    // soft IK: the last 4% of the reach is approached asymptotically, so a limb straightening (or starting to bend
    // again) never snaps the elbow / knee across in one frame; the end falls short of full extension by ~1.5%
    const Lr = a + b, soft = 0.04 * Lr, dSoft = Lr - soft;
    if (d > dSoft) d = dSoft + soft * (1 - Math.exp(-(d - dSoft) / soft));
    d = Math.min(Math.max(d, Math.abs(a - b) + 1e-4), a + b - 1e-4);
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pp = perp(pole, dir, new THREE.Vector3());
    if (pp.lengthSq() < 1e-8) pp.set(0, 0, 1);
    pp.normalize();
    const E = S.clone().addScaledVector(dir, a * cosA).addScaledVector(pp, a * sinA);
    const Tc = S.clone().addScaledVector(dir, d);
    const up = E.clone().sub(S).normalize();
    const lo = Tc.clone().sub(E).normalize();
    // normal of the bend plane: defined by the pole even when the limb is straight (the fold directions below
    // come from it, so a straight arm or leg keeps a steady roll instead of spinning on rounding noise)
    const n = new THREE.Vector3().crossVectors(dir, pp);
    return { up, lo, E, n: n.lengthSq() > 1e-10 ? n.normalize() : null };
  }

  // character-space world position of a bone head (after apply)
  bonePos(name, out = new THREE.Vector3()) {
    if (this.world[name]) return out.copy(this.world[name].p);
    return out.copy(this.rest[name]);
  }
}
