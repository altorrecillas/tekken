// PUÑETALITY: the finishing move a winner can do on the win screen (the button that comes up there, or up + a button),
// the game's own take on a fighting game's finisher. The simulation side lives in js/fight/match.js (startFatal /
// stepFatal: the two fighters placed, the winner's move played, the loser's clips on their frames) and the winner's
// style (styles.js `fatal`: its frames and the clips). This is what is drawn and heard on top of it, frame by frame of
// the move: the props, what happens to the loser's body, the blood (js/fx/blood.js), the camera's shots, the sounds,
// the title. Each fighter's move is an entry of MOVES below (its props, its frames, its shots and what it does on
// them); only those who have one can do it.
//
// It follows the simulation frame by frame (step: the bodies and the blood move with the fight's frames, so a capture
// of a frame is always the same and online both phones see the same; a frame done again after a correction online is
// not done twice) and is drawn between frames (alpha).
import * as THREE from 'three';
import { SplitBody } from '../fx/splitbody.js';
import { HeadCrush } from '../fx/headcrush.js';
import { Blood, LensBlood } from '../fx/blood.js';
import { makeAloeSword, attachAloeSword, attachInFist } from '../fx/aloesword.js';
import { makeDumbbells, DB_GRIP, LooseDumbbell } from '../fx/dumbbells.js';
import { makeRacket, makeBall, RACKET_GRIP, BALL_R } from '../fx/tennis.js';
import { GibBody } from '../fx/gibs.js';
import { Tornado, Afterimages } from '../fx/tornado.js';
import { Evaporate } from '../fx/evaporate.js';
import { SpikePit, BodySoak } from '../fx/spikepit.js';
import { makeBicycle, makeHelmet, poseBicycle, BIKE } from '../fx/bicycle.js';
import { Halves } from '../fx/halves.js';
import { Burn } from '../fx/burn.js';
import { EyeBeams, Sprites, AshPile } from '../fx/eyebeam.js';
import { HAND_SCALE } from '../anim/body.js';
import { POSE } from '../anim/rig.js';

const $ = (s) => document.querySelector(s);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const UP = new THREE.Vector3(0, 1, 0);
// a window's weight: 0 before a, up to 1 by b, 1 until c, back to 0 by d
const win4 = (w, t) => (t <= w[0] || t >= w[3] ? 0 : t < w[1] ? ss(w[0], w[1], t) : t > w[2] ? 1 - ss(w[2], w[3], t) : 1);

// ------------------------------------------------------------------ blood on the winner's clothes and hands
// A spatter that lands on the front of the body: drops of three sizes on grids of cells in the rest pose's space
// (they move with the body as it is skinned), inside up to three elliptical patches (x, y, half-widths: the rest
// pose's metres), only some cells filled, more as `amount` rises
const SPAT_GLSL = `
float fsH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
uniform vec4 uSpatM, uSpatA, uSpatB;
float spatPatch( vec2 P, vec4 c ) { vec2 q = ( P - c.xy ) / max( c.zw, vec2( 1e-3 ) ); return exp( -dot( q, q ) * 1.6 ); }
float fatalSpatter( vec3 P, vec3 N, float amount ) {
  if ( amount <= 0.0 ) return 0.0;
  float region = smoothstep( 0.15, 0.6, N.z ) * spatPatch( P.xy, uSpatM );
  region = max( region, 0.6 * smoothstep( -0.2, 0.4, N.z ) * max( spatPatch( P.xy, uSpatA ), spatPatch( P.xy, uSpatB ) ) );
  if ( region <= 0.0 ) return 0.0;
  float s = 0.0;
  // drops of three sizes (fine mist, small, a few bigger), each in a cell of its own size, round or drawn out
  for ( int k = 0; k < 3; k++ ) {
    float sc = k == 0 ? 260.0 : k == 1 ? 120.0 : 55.0;
    float dens = k == 0 ? 0.22 : k == 1 ? 0.12 : 0.05;
    vec2 q = P.xy * sc + vec2( float( k ) * 17.3, float( k ) * 5.1 ), c = floor( q );
    for ( int i = -1; i <= 1; i++ ) for ( int j = -1; j <= 1; j++ ) {
      vec2 cc = c + vec2( float( i ), float( j ) );
      if ( fsH( cc ) > region * amount * dens ) continue;
      vec2 o = vec2( fsH( cc + 3.1 ), fsH( cc + 7.7 ) );
      float r = 0.12 + 0.22 * fsH( cc + 1.3 );
      vec2 d = q - ( cc + o );
      float a = fsH( cc + 9.9 ) * 6.2832, st = fsH( cc + 5.5 );
      d = mat2( cos( a ), sin( a ), -sin( a ), cos( a ) ) * d;
      d.x *= st > 0.6 ? 0.35 : 1.0;
      s = max( s, 1.0 - smoothstep( r * 0.7, r, length( d ) ) );
    }
  }
  return s;
}`;
function spatterMaterial(mat, U) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  // (a clone leaves the defines behind: the beard's shells need theirs, USE_UV)
  if (mat.defines) m.defines = { ...mat.defines };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    sh.uniforms.uSpat = U.amount; sh.uniforms.uSpatM = U.m; sh.uniforms.uSpatA = U.a; sh.uniforms.uSpatB = U.b;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSpP; varying vec3 vSpN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSpP = position; vSpN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSpP; varying vec3 vSpN; uniform float uSpat;' + SPAT_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tfloat fSpat = fatalSpatter( vSpP, normalize( vSpN ), uSpat );\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.12, 0.004, 0.006 ), fSpat * 0.95 );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.2, fSpat );');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|spat';
  return m;
}

// ------------------------------------------------------------------ Noemí: the aloe vera sword
// She draws it from behind her back (the leaf grows out of the hilt), salutes, says her line, and cuts the loser in two
// at the waist (js/fx/splitbody.js): the top half slides off the cut and falls, the legs stand spurting in pulses with
// the heart, then fold; she flicks the blood off the blade. Frames of her move (styles.js fatal has the clip and the
// frames the simulation needs)
const NOEMI = {
  show: 40, grow: [41, 53], shing: 53, glint: [64, 80], heart: [104, 138, 166, 182], whoosh: 196,
  line: [204, 228], releaseUp: 232, slide: 0.12, releaseDown: 300, pulses: [244, 267, 290, 313, 337], flick: 347,
  // where the blood lands on her: the belly and waist, and the right forearm that held the sword (rest pose, m)
  spat: { m: [-0.04, 1.0, 0.3, 0.26], a: [-0.42, 1.0, 0.09, 0.12], b: [0, -9, 0.01, 0.01] },
  setup(d) {
    const g = d.g;
    d.split = new SplitBody(g.scene, d.L);
    d.split.clampWalk = (p, r) => g.stage?.clampWalk?.(p, r);
    d.split.begin();
    d.sw = makeAloeSword();
    attachAloeSword(d.W.ch, d.sw);
    d.sw.U.grow.value = 0;
    d.trail = makeTrail(); g.scene.add(d.trail.mesh);
    d.glint = makeGlint(); g.scene.add(d.glint);
  },
  dispose(d) {
    const g = d.g;
    d.split?.restore();
    if (d.sw) { d.sw.group.parent?.remove(d.sw.group); for (const mt of d.sw.mats) mt.dispose(); }
    if (d.trail) { g.scene.remove(d.trail.mesh); d.trail.mesh.geometry.dispose(); d.trail.mesh.material.dispose(); }
    if (d.glint) { g.scene.remove(d.glint); d.glint.material.map?.dispose(); d.glint.material.dispose(); }
  },
  frame(d, t) {
    const D = this, F = d.F, W = d.W, sp = d.split, B = d.blood, au = d.g.audio;
    // the sword
    d.sw.group.visible = t >= D.show;
    d.sw.U.grow.value = ss(D.grow[0], D.grow[1], t);
    d.sw.U.glow.value = t >= D.grow[0] && t < D.grow[1] + 20 ? 1 - ss(D.grow[1], D.grow[1] + 20, t) : 0;
    if (t === D.grow[0]) au.fatal?.('summon', W.pos);
    if (t === D.shing) au.fatal?.('shing', W.pos);
    if (t === D.glint[0]) au.fatal?.('glint', W.pos);
    // green motes off the leaf as it grows
    if (t >= D.grow[0] && t <= D.grow[1] + 4) D.motes(d, 3);
    for (const h of D.heart) if (t === h) au.fatal?.('heart', null, { gain: 0.7 + 0.1 * D.heart.indexOf(h) });
    if (t === D.whoosh) { au.fatal?.('whoosh', W.pos); au.fatal?.('droneOff', null, { fast: true }); }
    // the cut
    if (t === F.cut) D.cut(d);
    if (t > F.cut && sp.cut) {
      const k = ss(D.line[0], D.line[1], t);
      sp.setBleed(k, Math.min(1, 0.45 * k + 0.55 * ss(D.releaseUp, D.releaseUp + 160, t)));
      // blood seeping from the line before the halves part, running off them after
      if (t < D.releaseUp + 6 && sp.rim0.length) for (let i = 0; i < 1 + (k > 0.5 ? 2 : 0); i++) B.dribble(sp.rim0[(t * 37 + i * 101) % sp.rim0.length], 1);
    }
    if (t === D.releaseUp) sp.slide(d.slideDir, D.slide, 1.7, 0.7);
    if (t === D.releaseDown) sp.release('down', new THREE.Vector3(1.1, 0.35, 0.25));
    sp.step();
    if (sp.cut) D.bleed(d, t);
    // the blade flicked clean
    if (t === D.flick) {
      au.fatal?.('flick', W.pos);
      d.sw.U.blood.value = 0.15;
      const b = d.sw.group.localToWorld(d.sw.base.clone()), tp = d.sw.group.localToWorld(d.sw.tip.clone());
      const dir = tp.clone().sub(b).normalize().multiplyScalar(0.6).add(_v.set(0, -0.6, 0)).normalize();
      for (let i = 0; i < 8; i++) B.spray(b.clone().lerp(tp, 0.25 + i * 0.09), dir, 9, { speed: [2.5, 4.5], spread: 0.15, size: [0.002, 0.006] });
    }
  },
  cut(d) {
    const g = d.g, L = d.L, sp = d.split, B = d.blood;
    // the plane: level at the loser's waist, sloping down the way the sword went (she cuts from her right to her left)
    d.slideDir = d.right(new THREE.Vector3()).negate();
    const s4 = L.ch.bones.spine04.getWorldPosition(new THREE.Vector3()), s3 = L.ch.bones.spine03.getWorldPosition(new THREE.Vector3());
    const p = s4.lerp(s3, 0.55);
    const n = UP.clone().addScaledVector(d.slideDir, Math.tan(0.2)).normalize();
    sp.doCut(n, p);
    L.drawnBy = sp;
    g.audio.fatal?.('slice', p);
    g.effects.hitFlash = Math.max(g.effects.hitFlash, 0.55); g.effects.radial = Math.max(g.effects.radial, 0.5);
    g.camCtl.shake(0.55);
    // the first burst: a fine spray along the sweep, a red mist, a few bits
    const front = d.W.pos.clone().sub(L.pos).setY(0).normalize();
    B.spray(p, d.slideDir.clone().addScaledVector(front, 0.3).setY(0.15).normalize(), 110, { speed: [1.5, 5.5], spread: 0.4, size: [0.002, 0.0065], bright: 0.7 });
    B.spray(p, front.clone().setY(0.2).normalize(), 36, { speed: [1, 3], spread: 0.6, size: [0.002, 0.007], bright: 0.5 });
    B.puff(p, 10, { size: [0.06, 0.16], speed: 0.5, life: 1.4 });
    B.gore(p, d.slideDir, 7);
    d.sw.U.blood.value = 0.55;
    d.spat.amount.value = 0.55;
  },
  // the fountain from the legs (in pulses with the heart), what pours from the falling trunk, the splash and the pools
  bleed(d, t) {
    const D = this, sp = d.split, B = d.blood, au = d.g.audio;
    const st = sp.stumps(), lo = st.lower, up = st.upper;
    if (!lo.n) return;
    // the pulses: a strong jet from the legs' cut at each beat, weaker each time; a steady well in between
    for (let i = 0; i < D.pulses.length; i++) {
      const p0 = D.pulses[i], k = t - p0;
      if (k === 0) { au.fatal?.('spurt', lo.c, { power: 1 - i * 0.16 }); B.puff(lo.c, 4, { size: [0.05, 0.12], speed: 0.8 }); if (i === 0) { d.lens.splash(5, 1); d.spat.amount.value = 1; } }
      if (k >= 0 && k < 16) {
        const pw = (1 - i * 0.17) * (1 - k / 18);
        const dir = lo.n.clone().addScaledVector(d.slideDir, 0.18).normalize();
        // a tight jet and a looser spray round it
        B.spray(lo.c, dir, Math.round(26 * pw + 6), { speed: [2.6 * pw + 0.8, 4.2 * pw + 1], spread: 0.08, size: [0.002, 0.006], bright: 1 });
        B.spray(lo.c, dir, Math.round(10 * pw + 2), { speed: [1.2 * pw + 0.5, 3.2 * pw + 0.8], spread: 0.3, size: [0.0015, 0.005], bright: 1 });
      }
    }
    if (t >= D.pulses[0] && t < D.releaseDown + 60 && t % 2 === 0 && sp.rim0.length) {
      // over the rim of the legs' cut
      const q = sp.rim0[(t * 53) % sp.rim0.length].clone().sub(sp.center0).applyQuaternion(sp.frameL(new THREE.Quaternion())).add(lo.c);
      B.dribble(q, 1, [0.004, 0.008]);
    }
    // the trunk pours as it goes; where it lands, a splash and a pool
    if (sp.relU >= 0 && up.n) {
      if (!d.torsoDown && t % 2 === 0) B.dribble(up.c, 2, [0.004, 0.01]);
      const P = sp.P;
      const low = Math.min(P.chest.p.y, P.belly.p.y, P.cutU.p.y, P.head.p.y);
      const vy = (P.cutU.p.y - P.cutU.prev.y) * 60;
      if (!d.torsoDown && low < 0.16 && vy < -0.6) {
        d.torsoDown = true;
        au.fatal?.('splat', up.c);
        d.g.camCtl.shake(0.35);
        B.spray(_v.copy(up.c).setY(0.05), UP, 60, { speed: [1, 2.6], spread: 1.0, size: [0.002, 0.006] });
        B.puff(_v.copy(up.c).setY(0.08), 5, { size: [0.08, 0.2], speed: 0.6 });
        B.splat(up.c, 0.85, 3, 0, 160);
      }
      if (d.torsoDown && t % 3 === 0) B.dribble(up.c, 1, [0.005, 0.01]);
    }
    if (sp.relL >= 0) {
      const py = sp.P.pelvis.p.y;
      if (!d.legsDown && py < 0.24) { d.legsDown = true; au.fatal?.('fall', lo.c); d.g.camCtl.shake(0.25); B.splat(lo.c, 1.0, 3, 0, 220); }
    }
  },
  // green motes off the growing leaf
  motes(d, n) {
    const sw = d.sw, g = sw.U.grow.value;
    for (let i = 0; i < n; i++) {
      const p = sw.group.localToWorld(sw.base.clone().lerp(sw.tip, g * Math.random()));
      d.trail.motes.push({ p, v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3), age: 0, life: 0.6 + Math.random() * 0.5 });
    }
  },
  draw(d, t, alpha, dt) {
    const D = this, F = d.F;
    d.split.setLight(_v.set(0.3, 1, 0.4).normalize());
    d.split.sync(alpha, d.L.rig);
    // the glint runs up the blade; the sweep's trail
    d.sw.group.updateWorldMatrix(true, false);
    const b = d.sw.group.localToWorld(d.sw.base.clone()), tp = d.sw.group.localToWorld(d.sw.tip.clone());
    d.swB = b; d.swT = tp;
    const gk = (t - D.glint[0]) / (D.glint[1] - D.glint[0]);
    if (gk > 0 && gk < 1) {
      d.glint.visible = true;
      d.glint.position.lerpVectors(b, tp, 0.1 + 0.88 * ss(0, 1, gk));
      const s = Math.sin(gk * Math.PI) * 0.22;
      d.glint.scale.set(s, s, 1); d.glint.material.rotation = gk * 2.5;
    } else d.glint.visible = false;
    d.trail.update(t >= D.whoosh - 1 && t <= F.cut + 7 ? [b, tp] : null, dt, t);
    d.trail.updateMotes(dt);
  },
  // what the loser's shots are framed on, once he is in two
  lp: (d) => (d.split?.cut ? d.split.center0.clone().setY(0) : null),
  lHead: (d) => (d.split?.relU >= 0 ? d.split.P.head.p.clone() : null),
  mid: (d) => (d.swB ? d.swB.clone().lerp(d.swT, 0.5) : null),
  // the shots: [from frame, shot]; each a function of the scene (see shotCtx) returning the camera's place, where it
  // looks, its lens, and what is in focus
  shots: [
    // her, three quarters from her right (the loser just out of the frame on the left), a slow push in
    [0, (c, t) => ({ tp: c.at(c.wp, 1.15 - 0.1 * t, 2.0 - 0.2 * t, 1.38), tl: c.wHead.clone().addScaledVector(c.right, 0.15).setY(c.wHead.y - 0.3), fov: 32, focus: c.wHead })],
    // the draw and the salute: from her right, wider, so the hand, the blade's flat and her face are all in it
    // (well round to her right: from in front the blade, held up before her face, hid it)
    [40, (c, t) => ({ tp: c.at(c.wp, 0.78 - 0.1 * t, 1.62 - 0.12 * t, 1.4), tl: c.wHead.clone().lerp(c.prop, 0.5).setY(Math.max(1.1, c.wHead.y * 0.5 + c.prop.y * 0.5)), fov: 33, focus: c.prop })],
    // her line: her face and, low in front, the blade pointed at the loser
    [82, (c, t) => ({ tp: c.at(c.wp, 1.22 - 0.1 * t, 0.62, c.wHead.y - 0.08), tl: c.wHead.clone().addScaledVector(c.right, 0.1).setY(c.wHead.y - 0.2), fov: 30, focus: c.wHead })],
    [140, (c, t) => ({ tp: c.at(c.wp, -0.7 + 0.06 * t, 0.5, 1.6), tl: c.lp.clone().setY(1.28 - 0.05 * t), fov: 29, focus: c.lHead })],
    // the swing: high, from her right, looking down on the sweep (from waist height a level sweep looks like a thrust)
    [186, (c, t) => ({ tp: c.mid.clone().addScaledVector(c.right, 2.6 - 0.15 * t).addScaledVector(c.wf, -0.35).setY(2.25 - 0.1 * t), tl: c.mid.clone().setY(0.88), fov: 34, focus: c.mid.clone().setY(1.0) })],
    // the cut: from her right, onto the loser's waist, still (her arm has gone on to her left)
    [204, (c, t) => ({ tp: c.at(c.wp, 0.45 + 0.05 * t, 1.45 - 0.12 * t, 1.1), tl: c.lp.clone().setY(1.0), fov: 28, focus: c.lp.clone().setY(1.0) })],
    // the top half goes, then the legs: in front of him, a little high; as the top half slides away she is there
    // behind him with the sword
    [232, (c, t) => ({ tp: c.at(c.lp, 2.4 + 0.2 * t, -0.5, 1.4 + 0.15 * t), tl: c.lp.clone().addScaledVector(c.right, -0.3).setY(0.95 - 0.2 * t), fov: 36, focus: c.lp.clone().setY(0.9) })],
    // she flicks the blood off the blade: a medium shot of her, what is left of him on the floor beside her
    [342, (c, t) => ({ tp: c.at(c.wp, 1.95 - 0.1 * t, 1.15, 1.35), tl: c.wHead.clone().setY(c.wHead.y - 0.32), fov: 35, focus: c.wHead })],
    [384, (c, t) => ({ tp: c.mid.clone().addScaledVector(c.right, 2.4 + 1.0 * t).addScaledVector(c.wf, 0.4).setY(1.35 + 1.3 * t), tl: c.mid.clone().addScaledVector(c.right, -0.2).setY(0.55 - 0.15 * t), fov: 36, lam: 2.5 })],
  ],
};

// ------------------------------------------------------------------ Camilo: the dumbbells
// He takes a pair of dumbbells from behind his back, curls them ("hoy toca día de brazo"), drops the loser to his knees
// with a hook of the right one, raises both over his head and brings them down on the loser's head, crushing it flat
// (js/fx/headcrush.js: as flat as the dumbbells press it); lets them fall, dusts his hands and gets his phone out
const CAMILO = {
  show: 47, clank: 48, curls: [66, 90, 114], whooshHook: 140, kneel: 163, heart: [172, 186, 196], whoosh: 201,
  lift: 236, drip: [236, 282], drop: 281, claps: [299, 304, 309], phone: 318, taps: [336, 348, 360, 372, 386],
  pulses: [214, 230, 250, 274],
  // the hands follow the loser's height (drawn only): the hook to where his face is, the dumbbells down onto his head
  // wherever it is; ref: the reference loser's (Rafa's) head height at the frame it is measured, in the fight's
  // skeleton: [measured at, ramp in from, full from, full until, ramp out by]
  adjust: [{ at: 128, w: [128, 136, 150, 164], ref: 1.49, top: false }, { at: 184, w: [184, 192, 238, 252], ref: 1.37, top: true }],
  // where the blood lands on him: his chest and face (he stands over the head he crushes), both forearms
  spat: { m: [0, 1.38, 0.34, 0.36], a: [0.42, 1.08, 0.11, 0.14], b: [-0.42, 1.08, 0.11, 0.14] },
  setup(d) {
    d.db = makeDumbbells();
    for (const s of ['L', 'R']) attachInFist(d.W.ch, d.db[s], s, DB_GRIP);
    d.crush = new HeadCrush(d.L);
    d.adj = [0, 0];
    d.loose = [];
  },
  dispose(d) {
    for (const s of ['L', 'R']) d.db?.[s].parent?.remove(d.db[s]);
    for (const l of d.loose || []) l.dispose();
    if (d.db) { for (const m of d.db.mats) m.dispose(); for (const g of d.db.geos) g.dispose(); }
    d.crush?.restore();
    if (d.W.ch.winProp) d.W.ch.winProp.visible = false;
  },
  // the loser's head (the fight's own skeleton): its centre and its top
  headOf(L, top) {
    const w = L.rig.world.head;
    if (!w) return 1.5;
    const p = L.boneWorld('head', new THREE.Vector3());
    return top ? p.y + 0.17 * new THREE.Vector3(0, 1, 0).applyQuaternion(w.q).y : p.y;
  },
  frame(d, t) {
    const D = this, F = d.F, W = d.W, L = d.L, B = d.blood, au = d.g.audio;
    for (let i = 0; i < D.adjust.length; i++) if (t === D.adjust[i].at) d.adj[i] = D.headOf(L, D.adjust[i].top) - D.adjust[i].ref;
    if (t === D.show) for (const s of ['L', 'R']) d.db[s].visible = true;
    if (t === D.clank) au.fatal?.('clank', W.pos);
    for (const c of D.curls) if (t === c) au.voice?.(W, 'attack');
    for (const h of D.heart) if (t === h) au.fatal?.('heart', null, { gain: 0.7 + 0.12 * D.heart.indexOf(h) });
    if (t === D.whooshHook) au.fatal?.('whoosh', W.pos);
    // the hook: blood and a tooth from his mouth
    if (t === F.hook) {
      const face = L.boneWorld('head', new THREE.Vector3()).add(_v.set(0, 0.04, 0));
      const away = d.right(new THREE.Vector3()).negate().addScaledVector(d.wf(new THREE.Vector3()), 0.4).setY(0.25).normalize();
      au.fatal?.('hookhit', face);
      au.voice?.(L, 'hurtBig');
      B.spray(face, away, 45, { speed: [1.2, 3.5], spread: 0.35, size: [0.0015, 0.005] });
      B.puff(face, 3, { size: [0.04, 0.1], speed: 0.4, life: 0.9 });
      B.gore(face, away, 2, 'bone');
      d.g.camCtl.shake(0.4); d.g.effects.hitFlash = Math.max(d.g.effects.hitFlash, 0.3);
      d.db.U.blood.value = 0.12;
    }
    if (t === D.kneel) { au.fatal?.('fall', L.pos); d.g.camCtl.shake(0.2); }
    if (t === D.whoosh) { au.fatal?.('whoosh', W.pos); au.fatal?.('droneOff', null, { fast: true }); }
    if (t === F.cut) D.crushNow(d);
    if (t > F.cut) {
      d.crush.set(1, ss(F.cut, F.cut + 150, t));
      const hc = d.headC;
      // spurts from the crushed head with the last beats of the heart, oozing in between
      for (let i = 0; i < D.pulses.length; i++) {
        const k = t - D.pulses[i];
        if (k === 0) au.fatal?.('spurt', hc, { power: 0.8 - i * 0.15 });
        if (k >= 0 && k < 10) {
          const pw = (1 - i * 0.2) * (1 - k / 12);
          for (let j = 0; j < 3; j++) { const a = (t * 1.7 + j * 2.1) % (Math.PI * 2); B.spray(hc, _v.set(Math.cos(a), 0.55, Math.sin(a)).normalize(), Math.round(6 * pw + 1), { speed: [1.0 * pw + 0.4, 2.4 * pw + 0.6], spread: 0.25, size: [0.0015, 0.005], bright: 1 }); }
        }
      }
      if (t % 2 === 0 && t < F.cut + 120) B.dribble(hc, 1, [0.003, 0.007]);
      // the head comes down onto the floor: the pool spreads from it
      if (!d.headDown && hc.y < 0.2) { d.headDown = true; B.splat(hc, 0.9, 3, 0, 260); B.spray(hc, UP, 25, { speed: [0.6, 1.6], spread: 1.0, size: [0.002, 0.005] }); au.fatal?.('splat', hc); }
    }
    // the dumbbells drip once lifted off his head
    if (t >= D.drip[0] && t < D.drip[1] && t % 3 === 0) for (const s of ['L', 'R']) if (d.db[s].parent && d.db[s].visible) B.dribble(d.db[s].localToWorld(_v.copy(d.db.low)), 1, [0.003, 0.007]);
    // he lets them fall
    if (t === D.drop) for (const s of ['L', 'R']) {
      const l = new LooseDumbbell(d.db[s], d.g.scene);
      l.v.set((s === 'L' ? 1 : -1) * 0.25, -0.2, 0).applyAxisAngle(UP, W.yaw); l.w.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(4);
      d.loose.push(l);
    }
    for (const l of d.loose) l.step((x, v) => { au.fatal?.('dbland', x.p, { power: Math.min(1.2, v / 3) }); d.g.camCtl.shake(0.12); if (!x.splat) { x.splat = true; B.splat(x.p, 0.22, 0, Math.random() * 6); } });
    for (const c of D.claps) if (t === c) au.fatal?.('clap', W.pos);
    for (const c of D.taps) if (t === c) au.fatal?.('tap', W.pos);
  },
  crushNow(d) {
    const g = d.g, L = d.L, B = d.blood;
    const hc = L.ch.bones.head.getWorldPosition(new THREE.Vector3()).add(_v.set(0, 0.08, 0));
    d.headC = hc.clone();
    g.audio.fatal?.('crunch', hc);
    g.effects.hitFlash = Math.max(g.effects.hitFlash, 0.6); g.effects.radial = Math.max(g.effects.radial, 0.6);
    g.camCtl.shake(0.8);
    // squeezed out all round under the weight, and up, a red mist, bits of bone and brain
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      B.spray(hc, _v.set(Math.cos(a), 0.18 + 0.2 * (i % 3), Math.sin(a)).normalize(), 22, { speed: [1.5, 4.8], spread: 0.3, size: [0.0015, 0.006], bright: 0.6 });
    }
    B.spray(hc, _v.set(0, 1, 0), 40, { speed: [1, 3.5], spread: 0.7, size: [0.002, 0.006], bright: 1 });
    B.spray(hc, _v.set(0, -1, 0), 30, { speed: [0.5, 2], spread: 0.6, size: [0.002, 0.006] });
    B.puff(hc, 14, { size: [0.06, 0.18], speed: 0.9, life: 1.5 });
    B.gore(hc, _v.set(0, 0.6, 0), 9);
    B.gore(hc, _v.set(0, 0.5, 0), 6, 'brain');
    B.gore(hc, _v.set(0, 0.5, 0), 5, 'bone');
    d.lens.splash(7, 1.1);
    d.spat.amount.value = 0.9;
    d.db.U.blood.value = 0.95;
  },
  // drawn: the hands to the loser's height, the head flattened under the dumbbells, the phone
  draw(d, t) {
    const D = this, F = d.F, W = d.W, L = d.L;
    let dy = 0;
    for (let i = 0; i < D.adjust.length; i++) dy += d.adj[i] * win4(D.adjust[i].w, t);
    if (Math.abs(dy) > 1e-4) {
      const P = W.renderPose;
      for (const s of ['L', 'R']) P[POSE['hand' + s][0] + 1] += dy / W.rig.arm[s].len;
      W.rig.apply(P);
      W.ch.group.updateMatrixWorld(true);
    }
    // flattened as far as the dumbbells' heads press it: the lowest point of their near ends over his head
    if (t >= F.cut - 1 && d.db.L.parent && !d.loose.length) {
      const hb = L.ch.bones.head;
      L.ch.group.updateMatrixWorld(true);
      const base = hb.getWorldPosition(new THREE.Vector3()), up = UP.clone().applyQuaternion(hb.getWorldQuaternion(new THREE.Quaternion()));
      let low = Infinity;
      for (const s of ['L', 'R']) {
        const g = d.db[s];
        g.updateWorldMatrix(true, false);
        for (const end of [d.db.H0, d.db.H1, -d.db.H0, -d.db.H1]) for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2, p = g.localToWorld(_v.set(Math.cos(a) * 0.065, end, Math.sin(a) * 0.065));
          if (Math.hypot(p.x - base.x, p.z - base.z) < 0.13) low = Math.min(low, p.y);
        }
      }
      const H = 0.17 * Math.max(0.2, up.y) * (d.crush.base.y || 1);
      if (low < Infinity) d.crush.squash((low - base.y) / H);
      if (d.headC) d.headC.copy(base).addScaledVector(up, 0.03);
    } else if (d.headC && t > F.cut) d.headC.copy(L.ch.bones.head.getWorldPosition(_v));
    for (const l of d.loose) l.draw(1);
    if (W.ch.winProp) W.ch.winProp.visible = t >= D.phone;
  },
  lHead: (d) => null,
  mid: (d) => null,
  shots: [
    // him, three quarters from his right, a slow push in
    [0, (c, t) => ({ tp: c.at(c.wp, 1.2 - 0.1 * t, 1.9 - 0.2 * t, 1.45), tl: c.wHead.clone().addScaledVector(c.right, 0.15).setY(c.wHead.y - 0.32), fov: 32, focus: c.wHead })],
    // the dumbbells out: from his right, waist up
    [40, (c, t) => ({ tp: c.at(c.wp, 0.95 - 0.1 * t, 1.75, 1.35), tl: c.wp.clone().addScaledVector(c.right, 0.1).setY(1.2 + 0.05 * t), fov: 33, focus: c.wHead })],
    // the curls and his line: his face, a dumbbell at his shoulder
    [62, (c, t) => ({ tp: c.at(c.wp, 1.0, 1.35 - 0.1 * t, c.wHead.y - 0.12), tl: c.wHead.clone().addScaledVector(c.right, 0.05).setY(c.wHead.y - 0.24), fov: 31, focus: c.wHead })],
    // the hook: wide, from his right
    [132, (c, t) => ({ tp: c.mid.clone().addScaledVector(c.right, 2.7).setY(1.45), tl: c.mid.clone().setY(1.38), fov: 34, focus: c.mid.clone().setY(1.4) })],
    // on it: the loser's face whipping round towards the lens, his fall to his knees
    [146, (c, t) => ({ tp: c.at(c.lp, -0.55, -0.95, 1.48 - 0.25 * t), tl: c.lHead.clone().setY(c.lHead.y - 0.05), fov: 31, focus: c.lHead })],
    // the executioner: low behind the kneeling loser, Camilo raising the dumbbells over him
    [170, (c, t) => ({ tp: c.at(c.lp, 1.05, 0.5, 0.62), tl: c.wp.clone().setY(1.6 + 0.2 * t), fov: 38, focus: c.wHead })],
    // down: from behind him, three quarters, at the head's height (slow motion; from the side the iron hides it)
    [201, (c, t) => ({ tp: c.at(c.lp, 0.8, 1.0, 1.32), tl: c.lHead.clone().setY(Math.max(0.6, c.lHead.y + 0.05)), fov: 31, focus: c.lHead })],
    // pressed: closer
    // pressed: closer, three quarters from behind on his other side, at the height of what is left of the head
    [220, (c, t) => ({ tp: c.at(c.lp, 0.62, -0.78 + 0.05 * t, 1.22), tl: c.lHead.clone().setY(c.lHead.y + 0.04), fov: 28, focus: c.lHead })],
    // off, and the body folds: wide, from his left and in front
    [238, (c, t) => ({ tp: c.mid.clone().addScaledVector(c.right, -2.3).addScaledVector(c.wf, 0.25).setY(1.35), tl: c.mid.clone().setY(0.8 - 0.1 * t), fov: 35, focus: c.lp.clone().setY(0.5) })],
    // he lets them fall and dusts his hands: a medium shot, the body on the floor before him
    [274, (c, t) => ({ tp: c.at(c.wp, 1.75, 1.15, 1.42), tl: c.wHead.clone().setY(c.wHead.y - 0.42), fov: 35, focus: c.wHead })],
    // the phone: back to work
    [316, (c, t) => ({ tp: c.at(c.wp, 0.85, 0.65, c.wHead.y + 0.04), tl: c.wHead.clone().addScaledVector(c.wf, 0.12).setY(c.wHead.y - 0.14), fov: 30, focus: c.wHead })],
    [404, (c, t) => ({ tp: c.mid.clone().addScaledVector(c.right, 2.2 + 0.9 * t).addScaledVector(c.wf, 0.3).setY(1.3 + 1.2 * t), tl: c.mid.clone().setY(0.45), fov: 36, lam: 2.5 })],
  ],
};

// ------------------------------------------------------------------ Dani: the serve
// A racket from behind his back, a ball from his pocket; side on at the line, two bounces, the toss, the trophy
// position, and a flat serve into the loser's chest: the ball sinks in, he swells and bursts (js/fx/gibs.js), the lower
// legs left standing. A twirl of the racket: "juego, set y partido".
const G = 9.81;
const DANI = {
  racket: 24, ball: 46, bounces: [[80, 116], [118, 154]], toss: 172, grunt: 206,
  // the middle of the strings at the contact (his axes: x his left, y up, z towards the loser), measured by
  // tools/serveprobe.mjs CONTACT=212: where the toss is aimed
  contactAt: [-0.265, 2.49, 0.456],
  twirl: [296, 302, 308, 314], fall: 0.75,
  spat: { m: [-0.1, 1.25, 0.3, 0.3], a: [-0.42, 1.08, 0.1, 0.12], b: [0, -9, 0.01, 0.01] },
  setup(d) {
    const W = d.W, ch = W.ch;
    d.rk = makeRacket(); attachInFist(ch, d.rk.group, 'R', RACKET_GRIP);
    // the ball in his left palm (rest-pose measures, as the win pose's phone), then loose in the scene
    d.ball = makeBall(); d.ballHolder = new THREE.Group();
    const R = (n) => ch.rest[n].head;
    const Wr = R('wrist.L'), K = R('finger3-1.L'), f2 = R('finger2-1.L'), f5 = R('finger5-1.L');
    const dir = K.clone().sub(Wr).normalize(), across = f2.clone().sub(f5).normalize(), palm = new THREE.Vector3().crossVectors(dir, across).normalize();
    const hand = Wr.distanceTo(K);
    d.ballHolder.position.copy(dir).multiplyScalar(hand * 0.95).addScaledVector(palm, 0.04);
    d.ballHolder.scale.setScalar(1 / HAND_SCALE);
    ch.bones['wrist.L'].add(d.ballHolder);
    d.ball.mesh.visible = false; d.ballHolder.add(d.ball.mesh);
    d.bs = { mode: 'hand', p: new THREE.Vector3(), prev: new THREE.Vector3(), v: new THREE.Vector3(), sq: 0 };
    d.gib = new GibBody(d.g.scene, d.L);
    d.gib.begin();
    d.comet = makeComet(); d.g.scene.add(d.comet.mesh);
    d.rings = [];
  },
  dispose(d) {
    d.rk?.group.parent?.remove(d.rk.group); for (const m of d.rk?.mats || []) m.dispose();
    d.ball?.mesh.parent?.remove(d.ball.mesh); d.ballHolder?.parent?.remove(d.ballHolder); d.ball?.mat.dispose();
    d.gib?.restore();
    if (d.comet) { d.g.scene.remove(d.comet.mesh); d.comet.mesh.geometry.dispose(); d.comet.mesh.material.dispose(); }
    for (const r of d.rings || []) { d.g.scene.remove(r.m); r.m.material.dispose(); }
  },
  // the ball out of the hand into the scene, where it is drawn now
  loose(d) {
    const b = d.bs, m = d.ball.mesh;
    m.updateWorldMatrix(true, false);
    m.getWorldPosition(b.p); b.prev.copy(b.p);
    d.ballHolder.remove(m); d.g.scene.add(m); m.scale.setScalar(1); m.position.copy(b.p);
  },
  // back into the palm
  catchBall(d) { const m = d.ball.mesh; d.g.scene.remove(m); d.ballHolder.add(m); m.position.set(0, 0, 0); m.scale.setScalar(1); d.bs.mode = 'hand'; },
  ring(d, p, n, size, life, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(p); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); m.renderOrder = 15; m.userData.noGTAO = true; m.userData.noAO = true;
    d.g.scene.add(m); d.rings.push({ m, age: 0, life, size, color: new THREE.Color(color) });
  },
  chest(L, out) { return L.ch.bones.spine02.getWorldPosition(out).add(new THREE.Vector3(0, 0.02, 0)); },
  frame(d, t) {
    const D = this, F = d.F, W = d.W, L = d.L, B = d.blood, au = d.g.audio, b = d.bs;
    if (t === D.racket) d.rk.group.visible = true;
    if (t === D.ball) d.ball.mesh.visible = true;
    // the bounces: pushed down to the floor, back up into the palm at the top of the bounce
    for (const [r, c] of D.bounces) {
      if (t === r) {
        D.loose(d);
        const h = b.p.y - BALL_R, e = D.fall;
        b.v.set(0, -Math.sqrt(2 * G * h * (1 / (e * e) - 1)), 0); b.mode = 'bounce'; b.r = r;
      }
      if (t === c && b.mode === 'bounce') { D.catchBall(d); au.fatal?.('catch', W.pos); }
    }
    // the toss: up out of his hand to meet the strings at the contact
    if (t === D.toss) {
      D.loose(d);
      const T = (F.contact - D.toss) / 60, pc = W.charToWorld(new THREE.Vector3(...D.contactAt), new THREE.Vector3());
      b.v.copy(pc).sub(b.p).addScaledVector(new THREE.Vector3(0, -G, 0), -0.5 * T * T).multiplyScalar(1 / T);
      b.mode = 'toss'; au.fatal?.('toss', W.pos);
    }
    if (t === D.grunt) au.voice?.(W, 'attack');
    // the contact: the ball onto the strings as they are, and away flat at his chest
    if (t === F.contact) {
      d.rk.group.updateWorldMatrix(true, false);
      const pc = d.rk.group.localToWorld(d.rk.center.clone());
      b.prev.copy(b.p); b.p.copy(pc);
      const tgt = D.chest(L, new THREE.Vector3()).addScaledVector(new THREE.Vector3().subVectors(W.pos, L.pos).setY(0).normalize(), 0.13);
      b.from = pc.clone(); b.to = tgt; b.t0 = t; b.mode = 'serve'; b.sq = 1;
      b.dir = tgt.clone().sub(pc).normalize();
      au.fatal?.('serve', pc);
      d.g.camCtl.shake(0.3); d.g.effects.hitFlash = Math.max(d.g.effects.hitFlash, 0.25);
      D.ring(d, pc, b.dir, 0.32, 8, 0x8a8170);
      B.puff(pc, 3, { size: [0.04, 0.09], speed: 0.4, life: 0.5 });
    }
    // the ball's flight
    const prevP = b.p.clone();
    if (b.mode === 'bounce') {
      b.v.y -= G / 60; b.p.addScaledVector(b.v, 1 / 60);
      if (b.p.y < BALL_R) { b.p.y = BALL_R; b.v.y = -b.v.y * D.fall; au.fatal?.('bounce', b.p); }
    } else if (b.mode === 'toss') {
      b.v.y -= G / 60; b.p.addScaledVector(b.v, 1 / 60);
    } else if (b.mode === 'serve') {
      const k = Math.min(1, (t - b.t0) / (F.hit - b.t0));
      b.p.lerpVectors(b.from, b.to, k);
      if (k >= 1) b.mode = 'in';
      if (t === b.t0 + 2) au.fatal?.('flyby', b.p);
    } else if (b.mode === 'in') {
      // sunk into his chest, going in deeper as he swells
      b.p.copy(b.to).addScaledVector(b.dir, 0.05 * ss(F.hit, F.burst, t));
    } else if (b.mode === 'out') {
      b.v.y -= G / 60; b.p.addScaledVector(b.v, 1 / 60);
      if (b.p.y < BALL_R) { b.p.y = BALL_R; b.v.y = Math.abs(b.v.y) * 0.6; b.v.x *= 0.8; b.v.z *= 0.8; if (Math.abs(b.v.y) > 0.8) { au.fatal?.('bounce', b.p); B.splat(b.p, 0.09, 0, 0); } }
      if (t % 2 === 0) B.dribble(b.p, 1, [0.002, 0.004]);
    }
    if (b.mode !== 'hand') b.prev.copy(prevP);
    b.sq = Math.max(0, b.sq - 0.34);
    // the hit: the chest caved in round the ball, a shock through him; he swells
    if (t === F.hit) {
      au.fatal?.('thump', b.to); au.voice?.(L, 'hurtBig');
      d.g.camCtl.shake(0.4); d.g.effects.hitFlash = Math.max(d.g.effects.hitFlash, 0.4); d.g.effects.radial = Math.max(d.g.effects.radial, 0.5);
      B.spray(b.to, b.dir.clone().negate().setY(0.3).normalize(), 25, { speed: [0.8, 2.2], spread: 0.6, size: [0.0015, 0.004] });
      au.fatal?.('inflate', b.to);
    }
    // the burst
    if (t === F.burst) D.burst(d);
    if (t > F.burst) {
      d.gib.step((P, sp) => {
        const e = d.gib.end(P, new THREE.Vector3()).setY(0.01);
        au.fatal?.('gibland', e, { power: Math.min(1.2, sp / 4) });
        B.splat(e, 0.28 + 0.1 * Math.min(2, sp / 3), sp > 3 ? 1 : 0, Math.random() * 6);
        B.spray(e, UP, 10, { speed: [0.5, 1.6], spread: 0.9, size: [0.0015, 0.004] });
      });
      // the pieces bleed as they go, and lie bleeding
      if (t % 3 === 0) for (const P of d.gib.pieces) if (!P.R.stand || P.fall) B.dribble(d.gib.end(P, new THREE.Vector3()), 1, [0.002, 0.005]);
      // a rain of blood over the place
      if (t < F.burst + 50 && t % 2 === 0) {
        const c = d.gib.c0;
        for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 1.6; B.spray(new THREE.Vector3(c.x + Math.cos(a) * r, 2.6 + Math.random() * 0.6, c.z + Math.sin(a) * r), new THREE.Vector3(0, -1, 0), 1, { speed: [0.5, 1.5], spread: 0.1, size: [0.002, 0.006] }); }
      }
      if (t === F.burst + 70) B.splat(d.gib.c0, 1.4, 3, 0, 320);
    }
    for (const c of D.twirl) if (t === c) au.fatal?.('twirl', W.pos);
    // the rings fade
    for (const r of d.rings) r.age++;
  },
  burst(d) {
    const g = d.g, L = d.L, B = d.blood, au = g.audio, b = d.bs;
    const c = D_chest(L);
    d.gib.explode(c);
    L.drawnBy = d.gib;
    au.fatal?.('explode', c);
    g.effects.hitFlash = Math.max(g.effects.hitFlash, 0.9); g.effects.radial = Math.max(g.effects.radial, 0.85);
    g.camCtl.shake(1.0);
    // everything that was his trunk: drops every way, a red cloud, meat and bone
    B.spray(c, UP, 420, { speed: [2, 9], spread: 1.55, size: [0.002, 0.009], bright: 0.4 });
    B.spray(c, new THREE.Vector3(0, -0.2, 0).normalize(), 220, { speed: [1, 6], spread: 1.5, size: [0.003, 0.01] });
    B.spray(c, b.dir.clone().setY(0.1).normalize(), 320, { speed: [3, 10], spread: 0.65, size: [0.002, 0.008], bright: 0.6 });
    // the red cloud he becomes, thick at first, spreading and thinning
    // (from points all through where his trunk was, each its own size and pace: from one point they made a red ball)
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39996, r = 0.08 + 0.18 * ((i * 7) % 5) / 4;
      B.puff(c.clone().add(new THREE.Vector3(Math.cos(a) * r, ((i * 5) % 7) / 7 * 0.4 - 0.15, Math.sin(a) * r)), 3, { size: [0.14 + 0.06 * (i % 3), 0.45 + 0.15 * (i % 4)], speed: 1.2 + 0.25 * (i % 4), life: 2.0 + 0.3 * (i % 3), alpha: 0.42 });
    }
    B.gore(c, UP, 34);
    B.gore(c, b.dir.clone().setY(0.4), 16, 'bone');
    d.lens.splash(9, 1.25);
    d.spat.amount.value = 0.35;
    // the ball goes on through him, red
    b.mode = 'out'; b.v.copy(b.dir).multiplyScalar(14).setY(2.5); d.ball.U.blood.value = 1;
  },
  draw(d, t, alpha) {
    const D = this, F = d.F, b = d.bs, m = d.ball.mesh;
    if (b.mode !== 'hand') {
      m.position.lerpVectors(b.prev, b.p, alpha);
      // squashed on the strings, stretched in flight
      if (b.sq > 0 && b.dir) { m.quaternion.setFromUnitVectors(UP, b.dir); m.scale.set(1 + 0.35 * b.sq, 1 - 0.4 * b.sq, 1 + 0.35 * b.sq); }
      else { m.scale.setScalar(1); }
    }
    // the comet behind the served ball
    d.comet.update(b.mode === 'serve' || (b.mode === 'in' && t < F.hit + 3) ? m.position : null, b.mode === 'out' ? 0 : 1);
    if (t > F.hit && t < F.burst + 1 && !d.gib.burst) {
      const k = ss(F.hit, F.burst, t);
      d.gib.swell(k * k, 0.07 * Math.sin(t * 2.3) * k);
    }
    d.gib.sync(alpha);
    for (const r of d.rings) {
      const k = Math.min(1, r.age / r.life);
      r.m.scale.setScalar(r.size * (0.15 + k)); r.m.material.color.copy(r.color).multiplyScalar(2 * (1 - k) * (1 - k));
      r.m.visible = k < 1;
    }
  },
  ctx(d) {
    const W = d.W, L = d.L;
    return {
      ball: d.ball.mesh.getWorldPosition(new THREE.Vector3()),
      lChest: d.gib?.c0 ? d.gib.c0.clone() : D_chest(L),
      bounceAt: W.charToWorld(new THREE.Vector3(-0.1, 0.05, 0.35), new THREE.Vector3()),
      contact: W.charToWorld(new THREE.Vector3(...DANI.contactAt), new THREE.Vector3()),
      dirWL: L.pos.clone().sub(W.pos).setY(0).normalize(),
    };
  },
  lp: (d) => null,
  lHead: (d) => null,
  mid: (d) => null,
  shots: [
    // him, three quarters from his right, the loser far off behind
    [0, (c, t) => ({ tp: c.at(c.wp, 1.3 - 0.1 * t, 1.6 - 0.2 * t, 1.45), tl: c.wHead.clone().addScaledVector(c.right, 0.15).setY(c.wHead.y - 0.32), fov: 32, focus: c.wHead })],
    // the racket out; the ball from his pocket
    [22, (c, t) => ({ tp: c.at(c.wp, 1.15, 1.3, 1.3), tl: c.wp.clone().addScaledVector(c.right, 0.05).setY(1.25), fov: 33, focus: c.wHead })],
    // at the line: the ball bouncing by his left foot, seen low, his body above
    [70, (c, t) => ({ tp: c.bounceAt.clone().addScaledVector(c.right, 1.55).addScaledVector(c.wf, 0.35).setY(0.55), tl: c.bounceAt.clone().addScaledVector(c.right, 0.2).setY(0.62 + 0.08 * t), fov: 38, focus: c.bounceAt.clone().setY(0.5) })],
    // the look: his face over his left shoulder, the eyes on the loser
    [148, (c, t) => ({ tp: c.at(c.wp, 0.85, 0.12, c.wHead.y + 0.02), tl: c.wHead.clone().setY(c.wHead.y + 0.02), fov: 28, focus: c.wHead })],
    // the toss and the trophy: from in front of his chest, low, looking up at the ball against the sky
    [166, (c, t) => ({ tp: c.at(c.wp, 0.4, 2.1, 0.75), tl: c.wp.clone().addScaledVector(c.wf, 0.3).setY(1.7 + 0.5 * t), fov: 40, focus: c.ball })],
    // the contact (slow motion): close, from below and in front of him
    [204, (c, t) => ({ tp: c.contact.clone().addScaledVector(c.right, 1.2).addScaledVector(c.wf, 0.55).setY(1.75), tl: c.contact.clone().setY(c.contact.y - 0.15), fov: 34, focus: c.contact })],
    // the flight: riding beside and behind the ball (clear of his head), the loser in front
    [217, (c, t) => ({ tp: c.ball.clone().addScaledVector(c.dirWL, -1.5).addScaledVector(c.right, 0.6).setY(c.ball.y + 0.28), tl: c.ball.clone().lerp(c.lChest, 0.55).setY(c.ball.y * 0.45 + c.lChest.y * 0.55), fov: 38, lam: 30, focus: c.ball })],
    // the hit: his chest and face, the ball sunk in, swelling
    [222, (c, t) => ({ tp: c.lChest.clone().addScaledVector(c.dirWL, -2.1 - 0.3 * t).addScaledVector(c.right, 0.9).setY(c.lChest.y + 0.18), tl: c.lChest.clone().setY(c.lChest.y + 0.16), fov: 34, focus: c.lChest })],
    // the burst: wide from the side
    [238, (c, t) => ({ tp: c.lChest.clone().addScaledVector(c.right, 3.2 + 0.4 * t).addScaledVector(c.dirWL, -0.6).setY(1.25), tl: c.lChest.clone().setY(1.0 - 0.25 * t), fov: 38, focus: c.lChest })],
    // what is left: the shoes standing in the blood, low; then they fall
    [272, (c, t) => ({ tp: c.lp.clone().addScaledVector(c.right, 1.2).addScaledVector(c.dirWL, -1.1).setY(0.42), tl: c.lp.clone().setY(0.3), fov: 34, focus: c.lp.clone().setY(0.3) })],
    // the racket's twirl, onto his shoulder: "juego, set y partido"
    [292, (c, t) => ({ tp: c.at(c.wp, 1.5, 0.8, 1.42), tl: c.wHead.clone().setY(c.wHead.y - 0.25), fov: 32, focus: c.wHead })],
    [430, (c, t) => ({ tp: c.mid.clone().addScaledVector(c.right, 3.0 + 1.0 * t).setY(1.6 + 1.4 * t), tl: c.mid.clone().addScaledVector(c.dirWL, 0.6).setY(0.4), fov: 38, lam: 2.5 })],
  ],
};
function D_chest(L) { return L.ch.bones.spine02.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.02, 0)); }

// ------------------------------------------------------------------ Alejandro: the whirlwind
// A runner: a quad stretch, his watch started, and off round the loser faster and faster (Match.fatalOrbit) until he is
// a ring of afterimages and a tornado of dust that flays the loser and takes him away (js/fx/evaporate.js), blood and
// all, leaving only his shoes, smoking. A skid to a stop, his watch: "récord personal"; his hair smoothed: not a hair
// out of place.
const lerpK = (K, x) => { if (x <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (x <= K[i][0]) return K[i - 1][1] + (K[i][1] - K[i - 1][1]) * (x - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return K[K.length - 1][1]; };
const ALEJANDRO = {
  beep: 78, go: 104, wind: [140, 372], cut: [212, 292], screams: [206, 252, 288], beep2: 404, skid: [358, 380],
  // the whirlwind's strength (0..1) and how red it is, [frame, value] keys
  I: [[140, 0], [180, 0.35], [240, 1], [334, 1], [384, 0]],
  red: [[226, 0], [296, 0.55], [334, 1]],
  spat: { m: [0, 1.0, 0.01, 0.01], a: [0, -9, 0.01, 0.01], b: [0, -9, 0.01, 0.01] },
  setup(d) {
    const g = d.g, F = d.F;
    d.cen = d.L.pos.clone();
    d.dirA = d.W.pos.clone().sub(d.L.pos).setY(0).normalize();
    d.torn = new Tornado(g.scene, d.cen, lerpK(F.orbit.R, 200));
    d.ghosts = new Afterimages(g.scene, d.W.ch, 5);
    d.evap = new Evaporate(d.L);
    d.vspin = 0; d.cfPrev = 0; d.steps = 0;
  },
  dispose(d) {
    d.torn?.dispose(); d.ghosts?.dispose(); d.evap?.restore();
    if (d.L) { d.L.ch.group.rotation.x = 0; d.L.ch.group.rotation.z = 0; }
    d.g.audio.fatal?.('windOff', null, { fast: true });
  },
  speed(F, t) { return F.orbit && t >= F.orbit.from ? lerpK(F.orbit.v, t) : 0; },
  frame(d, t) {
    const D = this, F = d.F, W = d.W, L = d.L, B = d.blood, au = d.g.audio, c = d.cen;
    const v = D.speed(F, t), R = lerpK(F.orbit.R, t), w = v / Math.max(0.3, R);
    if (t === D.beep || t === D.beep2) au.fatal?.('beep', W.pos, { long: t === D.beep2 });
    if (t === D.go) au.fatal?.('go', W.pos);
    // his footfalls, as long as they can be told apart
    if (W.clipName === 'fatal_run') {
      const ph = Math.floor(W.cf / 12);
      if (ph !== d.cfPrev && v < 11) au.fatal?.('runstep', W.pos, { v });
      d.cfPrev = ph;
      // dust kicked up behind him
      if (v > 3 && t % 2 === 0) d.torn.ps.length < d.torn.N && d.torn.ps.push({ r: R + (Math.random() - 0.5) * 0.2, th: Math.atan2(W.pos.x - c.x, W.pos.z - c.z) - 0.05, y: 0.04, kind: 0, s: 0.12 + Math.random() * 0.15, a: 0.1 + Math.min(0.12, v * 0.008), life: 0.8 + Math.random(), age: 0, up: 0.3, wm: 0.5 });
    }
    // the wind
    if (t === D.wind[0]) au.fatal?.('windOn', c);
    if (t > D.wind[0] && t <= D.wind[1] && t % 4 === 0) au.fatal?.('windLevel', c, { I: lerpK(D.I, t), red: lerpK(D.red, t), v });
    if (t === D.wind[1]) au.fatal?.('windOff', c);
    const I = lerpK(D.I, t), red = lerpK(D.red, t);
    d.torn.step(I, w * 0.9 * Math.min(1, I * 3 + 0.2), red, Math.min(1, Math.max(0, (t - D.go) / 160)));
    // the loser: flayed, then taken away
    const cut = ss(D.cut[0], D.cut[1], t), gone = ss(F.evap[0], F.evap[1], t);
    d.evap.set(cut, gone);
    for (const s of D.screams) if (t === s) au.voice?.(L, s === D.screams[2] ? 'ko' : 'hurtBig');
    if (cut > 0 && t % 9 === 0 && gone < 0.9) au.fatal?.('shred', c, { power: 0.4 + cut * 0.6 });
    // blood flung off him round the whirl (the cuts, then everything as he goes)
    const flow = gone > 0 ? (1 - gone) * 14 + 4 : cut * 5;
    if (flow > 0.5) {
      const bones = ['spine02', 'spine04', 'head', 'upperarm01.L', 'upperarm01.R', 'lowerarm01.L', 'lowerarm01.R', 'upperleg01.L', 'upperleg01.R', 'lowerleg01.L', 'lowerleg01.R'];
      for (let i = 0; i < Math.round(flow); i++) {
        const p = L.ch.bones[bones[(t * 7 + i * 3) % bones.length]]?.getWorldPosition(new THREE.Vector3());
        if (!p) continue;
        const th = Math.atan2(p.x - c.x, p.z - c.z), tan = new THREE.Vector3(Math.cos(th), 0.15, -Math.sin(th)).add(new THREE.Vector3(Math.sin(th), 0, Math.cos(th)).multiplyScalar(0.6)).normalize();
        B.spray(p, tan, 2, { speed: [2, 5 + 4 * I], spread: 0.25, size: [0.0015, 0.005], bright: 0.5 });
      }
    }
    if (t === F.evap[0] + 8) { au.fatal?.('evap', c); d.g.camCtl.shake(0.5); d.lens.splash(5, 1); d.g.effects.hitFlash = Math.max(d.g.effects.hitFlash, 0.35); }
    if (t === F.evap[1]) {
      au.fatal?.('pop', c); d.g.camCtl.shake(0.6);
      for (let i = 0; i < 5; i++) B.puff(new THREE.Vector3(c.x, 0.6 + i * 0.25, c.z), 6, { size: [0.2, 0.6], speed: 1.4, life: 2.2, alpha: 0.6 });
      B.spray(new THREE.Vector3(c.x, 1.0, c.z), UP, 160, { speed: [1.5, 6], spread: 1.5, size: [0.002, 0.007] });
      B.splat(c, 1.2, 3, 0, 300);
    }
    // the blood comes down in a spiral round where he stood
    if (t > F.evap[1] && t < F.evap[1] + 40 && t % 2 === 0) {
      const k = (t - F.evap[1]) / 40, th = k * Math.PI * 5 + 0.4, r = 0.35 + 1.6 * k;
      B.splat(new THREE.Vector3(c.x + Math.sin(th) * r, 0, c.z + Math.cos(th) * r), 0.16 + 0.12 * Math.random(), 1, -th);
    }
    // his shoes, all that is left: smoking
    if (t > F.evap[1] && t % 3 === 0 && t < F.len - 40) {
      for (const s of ['L', 'R']) {
        const p = L.ch.bones['foot.' + s]?.getWorldPosition(new THREE.Vector3());
        if (p && d.torn.ps.length < d.torn.N) d.torn.ps.push({ r: Math.hypot(p.x - c.x, p.z - c.z), th: Math.atan2(p.x - c.x, p.z - c.z), y: 0.1, kind: 2, s: 0.06 + Math.random() * 0.08, a: 0.12, life: 1.6 + Math.random(), age: 0, up: 0.35, wm: 0 });
      }
      if (t % 30 === 0) au.fatal?.('sizzle', c);
    }
    // the skid
    if (t === D.skid[0]) au.fatal?.('skid', W.pos);
    if (t > D.skid[0] && t < D.skid[1] && t % 2 === 0) d.torn.ps.length < d.torn.N && d.torn.ps.push({ r: R, th: Math.atan2(W.pos.x - c.x, W.pos.z - c.z), y: 0.05, kind: 0, s: 0.18 + Math.random() * 0.2, a: 0.14, life: 1.2 + Math.random(), age: 0, up: 0.25, wm: 0 });
  },
  draw(d, t, alpha) {
    const D = this, F = d.F, L = d.L;
    const v = D.speed(F, t), R = lerpK(F.orbit.R, t), w = v / Math.max(0.3, R);
    // afterimages: a few steps behind him round the circle
    d.ghosts.draw(d.cen, w / 60 * 2.3, ss(6.5, 11, v) * 0.55 * (1 - 0.6 * ss(F.evap[0] - 10, F.evap[0], t)));
    // the loser turned round by the wind, faster as it blows, swaying (drawn only)
    const I = lerpK(D.I, t);
    if (t > 190) {
      d.vspin += I * 0.11 * (1 - ss(F.evap[1], F.evap[1] + 30, t));
      const g = L.ch.group;
      g.rotation.y += d.vspin; g.rotation.z = Math.sin(t * 0.37) * 0.06 * I; g.rotation.x = Math.cos(t * 0.29) * 0.05 * I;
      g.updateMatrixWorld(true);
    }
    d.torn.draw(d.g.renderer.getDrawingBufferSize(_w2).y);
  },
  ctx(d) {
    const W = d.W, L = d.L;
    const wr = W.ch.bones['wrist.L']?.getWorldPosition(new THREE.Vector3()) || W.pos.clone().setY(1.2);
    return { cen: d.cen.clone(), dirA: d.dirA.clone(), wristL: wr };
  },
  lp: (d) => d.cen.clone().setY(0),
  lHead: (d) => null,
  mid: (d) => null,
  shots: [
    // him, three quarters from his right: the stretch
    [0, (c, t) => ({ tp: c.at(c.wp, 1.5, 1.35 - 0.2 * t, 1.3), tl: c.wp.clone().addScaledVector(c.right, 0.1).setY(1.05), fov: 33, focus: c.wHead })],
    // his watch: the finger presses start
    [62, (c, t) => ({ tp: c.wristL.clone().addScaledVector(c.wf, 0.62).addScaledVector(c.right, -0.25).setY(c.wristL.y + 0.32), tl: c.wristL.clone().addScaledVector(c.right, 0.04).setY(c.wristL.y + 0.02), fov: 32, focus: c.wristL })],
    // set: low in front of him, his eyes on the loser
    [86, (c, t) => ({ tp: c.at(c.wp, 1.35, -0.45, 1.05), tl: c.wHead.clone().setY(c.wHead.y - 0.12), fov: 34, focus: c.wHead })],
    // off: high and wide, the circles closing in and speeding up
    [104, (c, t) => ({ tp: c.cen.clone().addScaledVector(c.dirA, -3.6 - 0.4 * t).add(new THREE.Vector3(0, 2.7, 0)).addScaledVector(new THREE.Vector3(-c.dirA.z, 0, c.dirA.x), 1.2), tl: c.cen.clone().setY(0.75), fov: 40, focus: c.cen.clone().setY(1.0) })],
    // inside the ring with the loser: a blur goes round behind him
    [160, (c, t) => ({ tp: c.cen.clone().addScaledVector(c.dirA, 0.98).setY(1.35), tl: c.lHead.clone().setY(c.lHead.y - 0.2), fov: 44, focus: c.lHead })],
    // the cuts: closer, turning with the wind
    [212, (c, t) => { const a = new THREE.Vector3().copy(c.dirA).applyAxisAngle(UP, 0.9 * t); return { tp: c.cen.clone().addScaledVector(a, 0.75).setY(1.38), tl: c.lHead.clone().setY(c.lHead.y - 0.22), fov: 38, focus: c.lHead }; }],
    // taken away: from just outside the ring at chest height, slowly round, the loser in the middle of the whirl
    [284, (c, t) => { const a = new THREE.Vector3().copy(c.dirA).applyAxisAngle(UP, 1.6 + 0.35 * t); return { tp: c.cen.clone().addScaledVector(a, 2.25).setY(1.05), tl: c.cen.clone().setY(1.0), fov: 42, focus: c.cen.clone().setY(1.0) }; }],
    // the whirlwind blows itself out: high and wide
    [336, (c, t) => ({ tp: c.cen.clone().addScaledVector(c.dirA, -4.2).add(new THREE.Vector3(0, 3.0 - 0.6 * t, 0)).addScaledVector(new THREE.Vector3(-c.dirA.z, 0, c.dirA.x), -1.4), tl: c.cen.clone().setY(0.6), fov: 38, focus: c.cen.clone().setY(0.5) })],
    // he skids to a stop: low, in front of him
    [362, (c, t) => ({ tp: c.at(c.wp, 2.4 - 0.6 * t, 0.6, 0.7), tl: c.wp.clone().setY(0.95), fov: 36, focus: c.wHead })],
    // the watch, "récord personal", the hair
    [392, (c, t) => ({ tp: c.at(c.wp, 1.45 - 0.1 * t, 0.75, 1.5), tl: c.wHead.clone().setY(c.wHead.y - 0.22), fov: 31, focus: c.wHead })],
    // what is left: his shoes in the blood, smoking
    [470, (c, t) => ({ tp: c.cen.clone().addScaledVector(c.dirA, 1.9 + 1.2 * t).add(new THREE.Vector3(0, 1.4 + 1.6 * t, 0)).addScaledVector(new THREE.Vector3(-c.dirA.z, 0, c.dirA.x), 0.8), tl: c.cen.clone().setY(0.15), fov: 36, lam: 2.5 })],
  ],
};
const _w2 = new THREE.Vector2();

// ------------------------------------------------------------------ Rafa: the belly bump
// A heavyweight's: his shoulders rolled, two slaps on the belly and a stamp that cracks the ground from his foot to the
// loser; behind him it gives way, a pit lined with rusty spikes (js/fx/spikepit.js: a real hole in the stage's floor).
// He charges; a belly bump throws the loser back through the air (Match.fatalFling) and down onto the spikes, which
// come out through his chest and belly, his shoulder, a thigh, a calf; the blood soaks him from the wounds and runs down
// the spikes, drips into the pit; he coughs blood, twitches. Rafa walks to the edge, looks down: "te dije que iría
// despacito", a pat on the belly.
const RAFA = {
  pats: [46, 56, 432], stomp: 92, crack: [92, 101], open: [99, 122], look: 106, gasp: 112, whoosh: 183,
  scream: 191, coughs: [264, 294], steps: [315, 330],
  // the pit: its middle this far beyond where the loser stood (along the way Rafa faces), half-sizes, depth
  pitAt: 1.7, pitA: 1.0, pitB: 1.1, pitD: 1.7,
  // the spikes that go through him (the pit's frame: along, across, the tip's height), on his body as it lies on them
  // (LOSER=1 BONES=... node tools/fatalpose.mjs rafa camilo 232 332): chest, belly, right shoulder, left thigh, right calf
  heroes: [[0.38, 0.04, -0.44], [0.22, -0.07, -0.49], [0.55, -0.2, -0.53], [-0.07, 0.13, -0.6], [-0.42, -0.22, -0.84]],
  // how far each wound's blood spreads on him (m), and the spike's blood (from its tip, m)
  wound: [0.14, 0.13, 0.11, 0.09, 0.07],
  spat: { m: [0, 1.0, 0.01, 0.01], a: [0, -9, 0.01, 0.01], b: [0, -9, 0.01, 0.01] },
  setup(d) {
    const D = this, g = d.g, m = d.m, W = d.W;
    d.ax = d.wf(new THREE.Vector3());
    d.L0 = (m.fatalL0 || d.L.pos).clone().setY(0);
    d.pc = d.L0.clone().addScaledVector(d.ax, D.pitAt);
    d.pit = new SpikePit(g.scene, g.stage, d.pc, d.ax, { a: D.pitA, b: D.pitB, D: D.pitD, heroes: D.heroes, clear: (u, v) => u > -0.8 && u < 1.0 && v > -0.64 && v < 0.62 });
    d.sd = d.pit.side.clone();
    // the crack: from where his right foot comes down to inside the pit's outline, between the loser's feet
    const foot = W.boneWorld('foot.R', new THREE.Vector3()).setY(0).addScaledVector(d.ax, 0.16);
    d.stompP = foot.clone();
    d.pit.crack(foot, d.pit.toWorld(-D.pitA * 0.55, 0.04, 0), 7);
    // (the slab's own colour, dark like a road or a pavement, with the stone's grain)
    d.rubbleMat = new THREE.MeshStandardMaterial({ color: 0x55524f, roughness: 0.95, map: d.pit.textures[0] });
    d.soak = new BodySoak(d.L);
    d.cfPrev = -1; d.thuds = 0;
  },
  dispose(d) {
    if (d.blood) d.blood.floorAt = null;
    d.pit?.restore(); d.soak?.restore(); d.rubbleMat?.dispose();
  },
  // dust (the stage's colour): n puffs round p
  dust(d, p, n, { spread = 0.3, up = 0.35, out = 0.6, s0 = 0.16, s1 = 0.7, a = 0.2, life = 0.9 } = {}) {
    const fx = d.g.fx;
    if (!fx?.smoke) return;
    const c = (fx.dustColor || new THREE.Color(0.75, 0.68, 0.58)).clone().multiplyScalar(fx.dustLight ?? 0.8);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, r = Math.random() * spread;
      fx.smoke.add({ p: new THREE.Vector3(p.x + Math.cos(th) * r, p.y + Math.random() * 0.08, p.z + Math.sin(th) * r), vel: new THREE.Vector3(Math.cos(th) * out * (0.4 + Math.random()), up * (0.4 + Math.random()), Math.sin(th) * out * (0.4 + Math.random())),
        age: 0, life: life * (0.7 + 0.6 * Math.random()), s0, s1, a0: a, c, drag: 2.4, fadeIn: true, fadePow: 1.5 });
    }
  },
  mouth(L, out) {
    const b = L.ch.bones.oris01 || L.ch.bones.jaw;
    return b ? b.getWorldPosition(out).add(_v.set(0, 0.012, 0)) : L.boneWorld('head', out);
  },
  frame(d, t) {
    const D = this, F = d.F, W = d.W, L = d.L, B = d.blood, au = d.g.audio, P = d.pit, cam = d.g.camCtl;
    for (const p of D.pats) if (t === p) au.fatal?.('pat', W.pos, { last: p === D.pats[2] });
    // the stamp: the ground cracks from his foot
    if (t === D.stomp) {
      au.fatal?.('stomp', d.stompP); cam.shake(0.75);
      d.g.effects.hitFlash = Math.max(d.g.effects.hitFlash, 0.15);
      D.dust(d, d.stompP, 12, { spread: 0.15, up: 0.25, out: 1.2, s1: 0.6, a: 0.24 });
    }
    if (t === D.crack[0] + 2) au.fatal?.('crackrun', d.pc);
    // and gives way behind the loser: the slab breaks up and falls into the pit, dust comes up out of it
    if (t === D.open[0]) { au.fatal?.('collapse', d.pc); cam.shake(0.55); }
    const ko = ss(D.open[0], D.open[1], t);
    if (t >= D.open[0] && t < D.open[1]) {
      P.crumble(Math.min(1, ko + 0.05), t < D.open[0] + 8 ? 4 : 2, d.rubbleMat);
      if (t % 3 === 0) cam.shake(0.18);
      if (t % 2 === 0) { const th = Math.random() * Math.PI * 2; D.dust(d, P.toWorld(Math.cos(th) * D.pitA * ko, Math.sin(th) * D.pitB * ko, 0.02), 2, { spread: 0.12, up: 0.5, out: 0.25, s1: 0.55, a: 0.16 }); }
    }
    if (t > D.open[0] + 6 && t < D.open[1] + 60 && t % 3 === 0) D.dust(d, P.toWorld((Math.random() - 0.5) * D.pitA * 1.4, (Math.random() - 0.5) * D.pitB * 1.4, -0.9), 2, { spread: 0.3, up: 0.9, out: 0.15, s0: 0.25, s1: 1.0, a: 0.12, life: 1.6 });
    P.step((c) => { if (d.thuds++ < 16) au.fatal?.('rubble', c.p, { s: c.r }); });
    // (the blood that falls over the pit goes down into it)
    if (t === D.open[1]) B.floorAt = (x, z) => (P.over(_w.set(x, 0, z), 0.02) ? -D.pitD : 0);
    if (t === D.look) au.voice?.(L, 'hurt');
    if (t === D.gasp) au.fatal?.('gasp', L.pos);
    // the charge: heavy steps
    if (W.clipName === 'fatal_charge') {
      const ph = Math.floor(W.cf / 12);
      if (ph !== d.cfPrev) {
        au.fatal?.('heavystep', W.pos); cam.shake(0.1);
        D.dust(d, W.pos, 3, { spread: 0.15, up: 0.2, out: 0.5, s1: 0.45, a: 0.12 });
      }
      d.cfPrev = ph;
    }
    if (t === D.whoosh) au.fatal?.('whoosh', W.pos);
    // the bump
    if (t === F.contact) {
      const belly = W.boneWorld('spine04', new THREE.Vector3()).addScaledVector(d.ax, 0.3);
      d.bumpP = belly.clone();
      au.fatal?.('bump', belly); cam.shake(0.95);
      d.g.effects.hitFlash = Math.max(d.g.effects.hitFlash, 0.45); d.g.effects.radial = Math.max(d.g.effects.radial || 0, 0.55);
      d.g.fx?.sweat?.(belly.clone().addScaledVector(d.ax, -0.1), 18);
      const mo = D.mouth(L, new THREE.Vector3());
      B.spray(mo, d.ax.clone().setY(0.45).normalize(), 26, { speed: [1.2, 3.2], spread: 0.4, size: [0.0015, 0.0045] });
      B.puff(mo, 2, { size: [0.03, 0.08], speed: 0.4, life: 0.8 });
      D.dust(d, W.pos, 10, { spread: 0.25, up: 0.2, out: 1.4, s1: 0.7, a: 0.2 });
    }
    if (t === D.scream) au.voice?.(L, 'ko');
    if (t === D.scream + 9) au.fatal?.('flyby', L.pos);
    // blood off his mouth as he flies
    if (t > F.contact && t < F.land && t % 2 === 0) B.spray(D.mouth(L, new THREE.Vector3()), d.ax.clone().negate().setY(0.3).normalize(), 2, { speed: [0.3, 1], spread: 0.5, size: [0.0015, 0.004] });
    // onto the spikes
    if (t === F.land) {
      au.fatal?.('impale', L.pos); au.voice?.(L, 'hurtBig'); cam.shake(1.1);
      d.g.effects.hitFlash = Math.max(d.g.effects.hitFlash, 0.4);
      for (const h of P.heroes) {
        const top = P.toWorld(h.u, h.v, h.tipY - 0.2), low = P.toWorld(h.u, h.v, -1.12);
        B.spray(top, _v.set((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4).normalize(), 60, { speed: [1.2, 4.4], spread: 0.55, size: [0.0018, 0.0075] });
        B.puff(top, 3, { size: [0.04, 0.13], speed: 0.6, life: 1.3 });
        B.gore(top, UP, 2, 'flesh');
        B.spray(low, _v.set(0, -1, 0), 26, { speed: [0.4, 1.8], spread: 0.6, size: [0.002, 0.006] });
      }
      B.gore(P.toWorld(0.3, 0, -0.75), UP, 3, 'bone');
      D.dust(d, P.toWorld(0.1, 0, -D.pitD + 0.05), 8, { spread: 0.6, up: 0.5, out: 0.5, s0: 0.2, s1: 0.8, a: 0.14, life: 1.4 });
      B.splat(P.toWorld(0.15, -0.02, 0), 0.55, 3, 0.3, 240);
    }
    if (t > F.land) {
      const k = t - F.land;
      if (k === 4) au.fatal?.('spurt', L.pos, { power: 1 });
      if (k === 26 || k === 60) au.fatal?.('spurt', L.pos, { power: 0.6 });
      if (k === 40) B.splat(P.toWorld(-0.15, 0.1, 0), 0.32, 3, 1.1, 260);
      if (k === 90) B.splat(P.toWorld(0.5, -0.2, 0), 0.28, 3, 2.2, 260);
      // drips: off the spikes under him, his fingers, his mouth after the coughs
      const n = k < 60 ? 3 : k < 200 ? 1 : (t % 2 === 0 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const h = P.heroes[(t * 3 + i) % P.heroes.length];
        B.dribble(P.toWorld(h.u + (Math.random() - 0.5) * 0.08, h.v + (Math.random() - 0.5) * 0.08, -1.08 + Math.random() * 0.05), 1);
      }
      if (t % 7 === 0) for (const s of ['L', 'R']) { const p = L.boneWorld('wrist.' + s, new THREE.Vector3()); p.y -= 0.12; B.dribble(p, 1); }
      if (t > D.coughs[0] && t % 5 === 0) B.dribble(D.mouth(L, new THREE.Vector3()), 1, [0.0015, 0.004]);
      if (k > 60 && t % 41 === 0) au.fatal?.('drip', d.pc);
    }
    for (const c of D.coughs) if (t === c) {
      const mo = D.mouth(L, new THREE.Vector3());
      au.fatal?.('cough', mo, { last: c === D.coughs[1] });
      B.spray(mo, _v.set(0, 1, 0).addScaledVector(d.ax, -0.3).normalize(), c === D.coughs[0] ? 26 : 14, { speed: [0.5, 1.7], spread: 0.45, size: [0.0015, 0.005] });
      B.puff(mo, 2, { size: [0.02, 0.06], speed: 0.25, life: 0.8, alpha: 0.3 });
    }
    // Rafa to the edge
    for (const s of D.steps) if (t === s) au.fatal?.('runstep', W.pos, { v: 1.5 });
  },
  draw(d, t, alpha) {
    const D = this, F = d.F, P = d.pit;
    // (the pit's and the crack's shaders are built behind the black at the start)
    if (t < 10) { P.setOpen(0.02); P.setCrack(0.01); }
    else {
      const x = Math.min(1, Math.max(0, (t - D.open[0]) / (D.open[1] - D.open[0])));
      P.setOpen(1 - Math.pow(1 - x, 2.2));
      P.setCrack(t < D.crack[0] ? 0 : 1 - Math.pow(1 - Math.min(1, (t - D.crack[0]) / (D.crack[1] - D.crack[0])), 1.8));
    }
    P.draw(alpha);
    // the wounds and the blood down the spikes
    const kl = ss(F.land, F.land + 110, t), on = t >= F.land;
    P.heroes.forEach((h, i) => {
      const p = P.toWorld(h.u, h.v, 0, _v);
      d.soak.set(i, p.x, p.z, on ? 0.035 + D.wound[i] * (0.35 + 0.65 * kl) : 0);
      h.U.uBlood.value = on ? 0.3 + 0.85 * ss(F.land, F.land + 230, t) : 0;
    });
    d.soak.back(on ? 0.85 * ss(F.land + 10, F.land + 200, t) : 0);
    // the blood he coughs up, round his mouth and down his chin
    if (t >= D.coughs[0]) { const mo = D.mouth(d.L, _v); d.soak.set(5, mo.x, mo.z, 0.018 + 0.03 * ss(D.coughs[0], D.coughs[1] + 40, t), mo.y + 0.004); }
    else d.soak.set(5, 0, 0, 0);
  },
  ctx(d) {
    const L = d.L, P = d.pit, h = P.heroes[0];
    return { pc: d.pc.clone(), ax: d.ax.clone(), sd: d.sd.clone(), L0: d.L0.clone(), body: L.boneWorld('spine04', new THREE.Vector3()), chestTip: P.toWorld(h.u, h.v, h.tipY) };
  },
  lHead: (d) => null,
  mid: (d) => null,
  shots: [
    // him, three quarters from his front: loosening up, the slaps on the belly
    [0, (c, t) => ({ tp: c.at(c.wp, 2.0 - 0.25 * t, -1.0, 1.5), tl: c.wp.clone().setY(1.28), fov: 38, focus: c.wHead })],
    // the stamp: low from his right, the loser beyond (the crack runs from his foot to him)
    [66, (c, t) => ({ tp: c.at(c.wp, -1.25, 1.2, 1.85), tl: c.at(c.wp, 1.15, 0, 0.35), fov: 50, focus: c.wHead })],
    // it gives way: high from the side, the loser at its edge
    [97, (c, t) => ({ tp: c.pc.clone().addScaledVector(c.ax, -0.6).addScaledVector(c.sd, 2.9).setY(2.7 + 0.2 * t), tl: c.pc.clone().addScaledVector(c.ax, -0.45).setY(-0.1), fov: 46, focus: c.lHead })],
    // he looks back: from beyond the pit, over the spikes, his face
    [114, (c, t) => ({ tp: c.pc.clone().addScaledVector(c.ax, 1.9 - 0.15 * t).addScaledVector(c.sd, -0.65).setY(2.8 - 0.1 * t), tl: c.L0.clone().addScaledVector(c.ax, 0.8).setY(0.5), fov: 54, focus: c.lHead })],
    // Rafa: a grin, set to charge
    [134, (c, t) => ({ tp: c.at(c.wp, 1.15, -0.35, 1.52), tl: c.wHead.clone().setY(c.wHead.y - 0.08), fov: 30, focus: c.wHead })],
    // the charge: from the side, both in frame
    [152, (c, t) => { const mid = c.wp.clone().lerp(c.L0, 0.5); return { tp: mid.clone().addScaledVector(c.sd, 3.3).addScaledVector(c.ax, -0.3).setY(1.15), tl: mid.setY(0.95), fov: 40, focus: c.lHead }; }],
    // the bump in slow motion: close, at belly height
    [181, (c, t) => { const p = c.L0.clone().addScaledVector(c.ax, -0.25); return { tp: p.clone().addScaledVector(c.sd, 2.4).addScaledVector(c.ax, 0.45).setY(1.2), tl: p.setY(1.05), fov: 40, focus: p }; }],
    // the flight: wide from the side, up and over and down into the pit
    [197, (c, t) => ({ tp: c.pc.clone().addScaledVector(c.ax, -0.9).addScaledVector(c.sd, 3.4).setY(1.9), tl: c.body.clone().lerp(c.pc.clone().setY(-0.5), 0.35), fov: 46, focus: c.body })],
    // on the spikes: from above, a slow push in
    [224, (c, t) => ({ tp: c.body.clone().addScaledVector(c.sd, 1.6 - 0.3 * t).addScaledVector(c.ax, -0.35).setY(1.05 - 0.15 * t), tl: c.body.clone().setY(c.body.y + 0.05), fov: 40, focus: c.body })],
    // close: the spike out of his chest, the coughs
    [256, (c, t) => ({ tp: c.chestTip.clone().addScaledVector(c.sd, 0.75).addScaledVector(c.ax, -0.2).setY(c.chestTip.y + 0.45), tl: c.chestTip.clone().lerp(c.lHead, 0.4), fov: 36, focus: c.chestTip })],
    // from down in the pit: Rafa comes to the edge and looks down, his line
    [304, (c, t) => { const tp = c.pc.clone().addScaledVector(c.ax, 0.97).addScaledVector(c.sd, -0.08).setY(-0.6); return { tp, tl: tp.clone().addScaledVector(c.ax, -1).setY(tp.y + 0.46), fov: 46, focus: c.wHead }; }],
    // the name of it: craning up over the pit
    [434, (c, t) => ({ tp: c.pc.clone().addScaledVector(c.sd, 1.9 + 0.5 * t).addScaledVector(c.ax, 1.3).setY(2.8 + 1.0 * t), tl: c.pc.clone().addScaledVector(c.ax, -0.45).setY(-0.5), fov: 40, lam: 2 })],
  ],
};

// ------------------------------------------------------------------ Zapponi: the bike
// A whistle: his bike rolls in on its own past the loser and stops by him. A helmet from behind his back, the strap
// done up, two knocks on it, a finger at the loser. He hops on and rides off, comes round in a skid, rings his bell
// and sprints straight at him (Match.fatalRide): through him at forty an hour, and the loser comes apart down his
// middle (js/fx/halves.js), a half falling to each side. A skid to a stop, a look back over his shoulder: his line.
const ZAPPONI = {
  whistle: 37, rollIn: [34, 104], knocks: [155, 161], click: 146, hop: [178, 194], land: 193, bells: [254, 259],
  skids: [[232, 252], [334, 366]], ride: [194, 366],
  // the bike rolling in on its own (along from where he stood, the side it is on, and how far off it starts)
  bikeSide: 0.5, bikeFrom: 5.0,
  // blood on his front: his chest and belly, his face (rest pose, m)
  spat: { m: [0, 1.25, 0.32, 0.34], a: [0, 1.62, 0.1, 0.11], b: [0, 0.6, 0.2, 0.3] },
  setup(d) {
    const D = this, g = d.g, m = d.m, W = d.W, L = d.L;
    d.L0 = (m.fatalL0 || L.pos).clone().setY(0); d.W0 = (m.fatalW0 || W.pos).clone().setY(0);
    d.ax = d.L0.clone().sub(d.W0).normalize(); d.sd = new THREE.Vector3(-d.ax.z, 0, d.ax.x);
    // the bike (in the scene until he is on it, then his)
    d.bk = makeBicycle(); g.scene.add(d.bk.group);
    d.bk.group.visible = false;
    // the helmet, made to his head (its cranium above the eyes, the chin), carried by the head bone once on
    const ch = W.ch, R = ch.rest, head = R.head.head.clone();
    const hm = ch.meshes.head || ch.meshes.body, P = hm.geometry.attributes.position, eyeY = (R['eye.L'] || R.head).head.y;
    const cr = { min: new THREE.Vector3(9, 9, 9), max: new THREE.Vector3(-9, -9, -9) }, v = new THREE.Vector3();
    let chin = null;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      if (v.y > eyeY - 0.005 && v.y < eyeY + 0.3) { cr.min.min(v); cr.max.max(v); }
      if (Math.abs(v.x) < 0.015 && v.z > head.z && v.y > eyeY - 0.2 && v.y < eyeY - 0.05 && (!chin || v.y < chin.y)) chin = v.clone();
    }
    d.hel = makeHelmet(head, cr, chin || head.clone().add(new THREE.Vector3(0, -0.085, 0.07)));
    d.hel.group.matrixAutoUpdate = false; d.hel.group.visible = false; g.scene.add(d.hel.group);
    // the loser, as two halves from now on (whole until the cut)
    d.hv = new Halves(g.scene, L); d.hv.begin();
    d.wheel = 0; d.rearLock = 0; d.prevWp = W.pos.clone(); d.crank = 0; d.cutDone = false; d.hitN = 0; d.rideSnd = false;
  },
  dispose(d) {
    const g = d.g;
    if (d.bk) { d.bk.group.parent?.remove(d.bk.group); for (const mt of d.bk.mats) mt.dispose(); for (const gg of d.bk.geos) gg.dispose(); for (const t of d.bk.textures) t.dispose(); }
    if (d.hel) { g.scene.remove(d.hel.group); for (const mt of d.hel.mats) mt.dispose(); for (const gg of d.hel.geos) gg.dispose(); for (const t of d.hel.textures) t.dispose(); }
    d.hv?.restore();
    if (d.W) { d.W.ch.group.rotation.z = 0; }
    g.audio.fatal?.('rideOff', null, { fast: true });
  },
  // where the bike is while it rolls in on its own (world, its heading), t: the frame
  bikeAlone(d, t, out) {
    const D = this, [t0, t1] = D.rollIn;
    const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))), along = D.bikeFrom * (1 - u) * (1 - u);
    out.copy(d.W0).addScaledVector(d.ax, along).addScaledVector(d.sd, D.bikeSide);
    return along;
  },
  frame(d, t) {
    const D = this, F = d.F, W = d.W, L = d.L, B = d.blood, au = d.g.audio, cam = d.g.camCtl, hv = d.hv;
    if (t === D.whistle) au.fatal?.('whistle', W.pos);
    if (t === D.rollIn[0]) au.fatal?.('bikeroll', d.L0, { dur: 1.2 });
    if (t === D.click) au.fatal?.('click', W.pos);
    for (const k of D.knocks) if (t === k) au.fatal?.('knock', W.pos);
    if (t === D.land) { au.fatal?.('saddle', W.pos); cam.shake(0.08); }
    for (const b of D.bells) if (t === b) au.fatal?.('bell', W.pos);
    // the ride: its sound with the speed, the wheels' turn with the way gone
    const sp = W.pos.distanceTo(d.prevWp) * 60; d.prevWp.copy(W.pos);
    if (t > D.ride[0] && t < D.ride[1]) {
      d.wheel += sp / 60 / BIKE.R;
      if (!d.rideSnd) { au.fatal?.('rideOn', W.pos); d.rideSnd = true; }
      if (t % 3 === 0) au.fatal?.('rideLevel', W.pos, { v: sp, pedal: W.clipName === 'fatal_ride' || W.clipName === 'fatal_sprint' ? 1 : 0 });
    }
    if (t === D.ride[1]) au.fatal?.('rideOff', W.pos);
    for (const [a, b] of D.skids) {
      if (t === a) au.fatal?.('skid', W.pos, { long: true });
      if (t > a && t < b - 4 && t % 2 === 0) D.dust(d, W.pos.clone().addScaledVector(D.wfv(W), -0.4), 2, sp);
    }
    if (t === 262) au.voice?.(W, 'attack');
    // the cut: as the front wheel reaches him
    if (t === F.cut) D.cut(d);
    hv.step();
    if (d.cutDone) D.bleed(d, t);
    // the rider's front, the bike, the helmet: spattered as he goes through
    if (t === F.cut + 2) { d.spat.amount.value = 1; d.bk.U.blood.value = 0.85; d.hel.U.blood.value = 0.45; }
  },
  wfv(W) { return new THREE.Vector3(Math.sin(W.yaw), 0, Math.cos(W.yaw)); },
  dust(d, p, n, v) {
    const fx = d.g.fx;
    if (!fx?.smoke) return;
    const c = (fx.dustColor || new THREE.Color(0.75, 0.68, 0.58)).clone().multiplyScalar(fx.dustLight ?? 0.8);
    for (let i = 0; i < n; i++) fx.smoke.add({ p: new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.2, 0.05, p.z + (Math.random() - 0.5) * 0.2), vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8),
      age: 0, life: 0.7 + Math.random() * 0.6, s0: 0.15, s1: 0.6 + Math.min(0.4, v * 0.05), a0: 0.2, c, drag: 2.2, fadeIn: true, fadePow: 1.5 });
  },
  cut(d) {
    const g = d.g, W = d.W, L = d.L, hv = d.hv, B = d.blood, au = g.audio;
    hv.doCut();
    L.drawnBy = hv;
    d.cutDone = true; d.cutT = d.t;
    // pushed apart by the bike going through (the halves part ahead of the handlebars)
    hv.push(7.5, 1.1);
    au.fatal?.('split', L.pos); au.fatal?.('zoom', L.pos);
    au.voice?.(L, 'ko');
    g.effects.hitFlash = Math.max(g.effects.hitFlash, 0.5); g.effects.radial = Math.max(g.effects.radial || 0, 0.7);
    g.camCtl.shake(0.7);
    // the points of the cut, up his middle (as he stood): the blood bursts from them, the way the bike went and out to
    // both sides
    const B_ = L.ch.bones, wp = (n) => B_[n].getWorldPosition(new THREE.Vector3());
    const O = hv.O, fw = hv.fw, n0 = hv.n0;
    const sp = ['root', 'spine04', 'spine02', 'neck01', 'head'].map((n) => wp(n).sub(n0.clone().multiplyScalar(n0.dot(wp(n)) - n0.dot(O))));
    sp.push(sp[sp.length - 1].clone().add(new THREE.Vector3(0, 0.12, 0)));
    d.cutPts = [];
    for (const p of sp) for (const ff of [-0.06, 0.04, 0.12]) d.cutPts.push(p.clone().addScaledVector(fw, ff));
    const away = d.ax.clone();
    for (const p of d.cutPts) {
      for (const s of [1, -1]) B.spray(p, away.clone().multiplyScalar(0.7).addScaledVector(n0, s * 0.7).setY(0.25).normalize(), 20, { speed: [2, 6.5], spread: 0.35, size: [0.0018, 0.0085] });
      B.spray(p, away.clone().setY(0.2).normalize(), 12, { speed: [4, 9], spread: 0.15, size: [0.0015, 0.005] });
    }
    // a cloud of it hanging where he was, blown on the way the bike went
    for (let i = 0; i < 6; i++) B.puff(sp[i % sp.length].clone().addScaledVector(away, 0.12), 3, { size: [0.07, 0.22], speed: 1.6, life: 1.0, alpha: 0.32 });
    B.gore(sp[1], away, 6, 'flesh'); B.gore(sp[2], away, 5, 'flesh'); B.gore(sp[5], away, 4, 'brain'); B.gore(sp[4], away, 3, 'bone');
  },
  // the blood once he is in two: from each half's cut as they part and fall (pulses), the splash where each lands, the
  // pools spreading, what drips off
  bleed(d, t) {
    const D = this, hv = d.hv, B = d.blood, au = d.g.audio, k = t - d.cutT;
    for (const h of hv.H) {
      const nOut = h.L.clone().negate().applyAxisAngle(h.ax, h.th);
      if (k < 40 && t % 1 === 0) {
        const pw = 1 - k / 40;
        for (let i = 0; i < 3; i++) {
          const p = hv.carry(d.cutPts[(t * 7 + i * 5) % d.cutPts.length], h.side);
          B.spray(p, nOut.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize(), Math.round(6 * pw + 2), { speed: [1 + 2 * pw, 2.5 + 3 * pw], spread: 0.4, size: [0.002, 0.006], bright: 1 });
        }
      }
      if (h.hit) {
        h.hit = false; d.hitN++;
        au.fatal?.('halfthud', hv.carry(hv.O, h.side), { power: 1 });
        d.g.camCtl.shake(0.35);
        const c = hv.carry(hv.O.clone().setY(1.0), h.side).setY(0.05);
        B.spray(c, new THREE.Vector3(0, 1, 0), 70, { speed: [1, 3], spread: 1.0, size: [0.002, 0.007] });
        B.puff(c, 3, { size: [0.06, 0.16], speed: 0.6, life: 0.8, alpha: 0.25 });
        B.splat(c, 1.1, 3, 0, 220);
        B.splat(hv.carry(hv.O.clone().setY(1.5), h.side).setY(0), 0.7, 3, 0.4, 260);
        D.dust(d, c, 6, 2);
      }
      if (h.down && t % 3 === 0 && k < 300) B.dribble(hv.carry(d.cutPts[(t * 11) % d.cutPts.length], h.side), 1, [0.003, 0.007]);
      if (h.down && k > 30 && k < 260 && t % 16 === 0) au.fatal?.('spurt', hv.carry(hv.O, h.side), { power: 0.35 });
    }
  },
  draw(d, t, alpha) {
    const D = this, F = d.F, W = d.W, L = d.L, bk = d.bk, hv = d.hv, g = d.g;
    // the bike: rolling in on its own, leaning on him, then his
    const onHim = t >= D.hop[1];
    if (onHim && bk.group.parent !== W.ch.group) { bk.group.parent?.remove(bk.group); W.ch.group.add(bk.group); bk.group.position.set(0, 0, 0); bk.group.rotation.set(0, 0, 0); bk.group.scale.set(1, 1, 1).divide(W.ch.group.scale); }
    bk.group.visible = t >= D.rollIn[0];
    if (!onHim) {
      const p = new THREE.Vector3(), along = D.bikeAlone(d, t, p);
      const yaw = Math.atan2(-d.ax.x, -d.ax.z);
      bk.group.position.copy(p);
      // (a wobble as it rolls, then leant over against his hip until he gets on)
      const u = Math.min(1, Math.max(0, (t - D.rollIn[0]) / (D.rollIn[1] - D.rollIn[0])));
      const wob = Math.sin(t * 0.45) * 0.05 * (1 - u), lean = 0.2 * ss(D.rollIn[1] - 2, D.rollIn[1] + 8, t) * (1 - ss(D.hop[0] + 4, D.hop[1] - 2, t));
      bk.group.rotation.set(0, yaw + wob * 0.4, lean + wob, 'YXZ');
      d.wheelAlone = D.bikeFrom - along;
      poseBicycle(bk, d.wheelAlone / BIKE.R, 0.6);
    } else {
      // the cranks follow his feet (the one on its pedal), the wheels the way gone (the back one locked in a skid)
      const side = W.clipName === 'fatal_skid' ? 'L' : 'R';
      const fb = W.ch.bones['foot.' + side];
      if (fb) {
        const a = W.ch.group.worldToLocal(fb.getWorldPosition(new THREE.Vector3()));
        const cy = BIKE.bb.y + BIKE.ankle.y - a.y, cz = a.z - BIKE.bb.z - BIKE.ankle.z;
        let c = Math.atan2(cy, cz);
        if (side === 'L') c -= Math.PI;
        if (!['fatal_stop', 'fatal_look'].includes(W.clipName) || side === 'R') d.crank = c;
      }
      const skid = D.skids.some(([a, b]) => t > a + 2 && t < b);
      if (!skid) d.rearLock = d.wheel;
      poseBicycle(bk, d.wheel, d.crank);
      bk.rear.rotation.x = skid ? d.rearLock : d.wheel;
      // leaning the whole of him and the bike: into the turns, rocked under him in the sprint, onto the foot put down
      const yawRate = ((W.yaw - W.prevYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, v = W.pos.distanceTo(W.prevPos) * 60;
      let lean = Math.max(-0.35, Math.min(0.35, -Math.atan(v * yawRate * 60 / G) * 0.8));
      if (W.clipName === 'fatal_sprint') lean += Math.sin((W.cf / 20) * Math.PI * 2) * 0.09;
      // (the skids: the bike slides round rather than leaning, over onto the foot put out)
      const [s1, s2] = D.skids;
      if (t > s1[0] && t < s1[1]) lean = 0.28 * ss(s1[0], s1[0] + 6, t) * (1 - ss(s1[1] - 6, s1[1], t));
      if (t > s2[0] && t < s2[1] + 4) lean = -0.25 * ss(s2[0] + 8, s2[0] + 18, t) + 0.15 * ss(s2[1] - 4, s2[1] + 4, t);
      // (positive: over to his right; the foot put down is his left)
      if (W.clipName === 'fatal_set' && t < 262) lean = -0.11;
      if (['fatal_stop', 'fatal_look'].includes(W.clipName)) lean = -0.1;
      d.lean = (d.lean ?? 0) + (lean - (d.lean ?? 0)) * 0.25;
      W.ch.group.rotation.z = d.lean;
      W.ch.group.updateMatrixWorld(true);
    }
    // the helmet: hidden behind his back, out in his hands, over his head and down onto it
    const hb = W.ch.bones.head, hel = d.hel.group;
    hel.visible = t >= 112;
    if (hel.visible) {
      W.ch.group.updateMatrixWorld(true);
      const Mh = hb.matrixWorld.clone();
      if (t < 132) {
        const wl = W.ch.bones['wrist.L'].getWorldPosition(new THREE.Vector3()), wr = W.ch.bones['wrist.R'].getWorldPosition(new THREE.Vector3());
        const mid = wl.lerp(wr, 0.5).add(new THREE.Vector3(0, 0.06, 0));
        const q = new THREE.Quaternion().setFromAxisAngle(UP, W.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5 * (1 - ss(118, 128, t))));
        const Mc = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(-d.hel.center.x, -d.hel.center.y, -d.hel.center.z));
        const k = ss(124, 132, t);
        const pa = new THREE.Vector3(), qa = new THREE.Quaternion(), sa = new THREE.Vector3(), pb = new THREE.Vector3(), qb = new THREE.Quaternion();
        Mc.decompose(pa, qa, sa); Mh.decompose(pb, qb, sa);
        hel.matrix.compose(pa.lerp(pb, k), qa.slerp(qb, k), new THREE.Vector3(1, 1, 1));
      } else hel.matrix.copy(Mh);
      hel.matrixWorldNeedsUpdate = true;
      for (const o of hel.userData.straps || []) o.visible = t >= 140;
    }
    // the halves
    if (d.cutDone) {
      const k = t - d.cutT;
      hv.setLine(1, 0.8 + Math.max(0, k) * 0.7, Math.min(1, 0.3 * ss(0, 4, k) + 0.7 * ss(4, 160, k)));
    }
    hv.sync(alpha, g.camera, _v.set(0.3, 1, 0.4).normalize());
  },
  ctx(d) {
    const W = d.W;
    return { L0: d.L0.clone(), W0: d.W0.clone(), ax: d.ax.clone(), sd: d.sd.clone(), wc: W.ch.group.position.clone().setY(0) };
  },
  lp: (d) => d.L0.clone(),
  lHead: (d) => null,
  mid: (d) => null,
  shots: [
    // him, three quarters from the front: his neck, the whistle
    [0, (c, t) => ({ tp: c.at(c.wp, 2.0 - 0.2 * t, -0.8, 1.5), tl: c.wp.clone().setY(1.3), fov: 36, focus: c.wHead })],
    // from behind the loser: his bike rolls past him, on its own, to Zapponi
    [40, (c, t) => ({ tp: c.L0.clone().addScaledVector(c.ax, 1.6).addScaledVector(c.sd, -0.9).setY(1.05), tl: c.W0.clone().addScaledVector(c.sd, 0.25).setY(0.85), fov: 42, focus: c.lHead })],
    // the bike comes up to him and he stops it by the saddle
    [80, (c, t) => ({ tp: c.W0.clone().addScaledVector(c.sd, 2.7).addScaledVector(c.ax, 0.5).setY(1.1), tl: c.W0.clone().addScaledVector(c.sd, 0.3).setY(0.85), fov: 42, focus: c.wHead })],
    // the helmet: from behind his back, on, the strap, two knocks
    [108, (c, t) => ({ tp: c.W0.clone().addScaledVector(c.ax, 1.35 - 0.15 * t).addScaledVector(c.sd, -0.45).setY(1.68), tl: c.wHead.clone().setY(c.wHead.y - 0.08), fov: 32, focus: c.wHead })],
    // over his shoulder, his finger at the loser
    [164, (c, t) => ({ tp: c.W0.clone().addScaledVector(c.ax, -0.95).addScaledVector(c.sd, -0.5).setY(1.75), tl: c.L0.clone().setY(1.25), fov: 40, focus: c.lHead })],
    // the hop on, wide from his left
    [176, (c, t) => ({ tp: c.W0.clone().addScaledVector(c.sd, -2.9).addScaledVector(c.ax, 0.2).setY(1.2), tl: c.W0.clone().addScaledVector(c.sd, 0.3).setY(0.95), fov: 45, focus: c.wHead })],
    // off he goes: from behind the loser, low
    [196, (c, t) => ({ tp: c.L0.clone().addScaledVector(c.ax, 1.7).addScaledVector(c.sd, -1.0).setY(1.65), tl: c.wc.clone().lerp(c.L0, 0.25).setY(0.9), fov: 40, focus: c.wHead })],
    // round in a skid: low, by the ground, the dust
    [230, (c, t) => ({ tp: c.W0.clone().addScaledVector(c.ax, -2.2).addScaledVector(c.sd, -2.7).setY(0.55), tl: c.wc.clone().setY(0.85), fov: 52, focus: c.wHead })],
    // facing him now: the bell, up on the pedals
    [252, (c, t) => ({ tp: c.wc.clone().addScaledVector(c.ax, 1.9).addScaledVector(c.sd, 0.55).setY(1.0), tl: c.wHead.clone().setY(c.wHead.y - 0.25), fov: 34, focus: c.wHead })],
    // the sprint: alongside him, a little ahead
    [266, (c, t) => ({ tp: c.wc.clone().addScaledVector(c.sd, -2.4).addScaledVector(c.ax, 0.9).setY(1.0), tl: c.wc.clone().addScaledVector(c.ax, 0.7).setY(0.9), fov: 44, focus: c.wHead })],
    // from behind the loser as it comes at him: through him, the halves falling to either side, past the lens
    [304, (c, t) => ({ tp: c.L0.clone().addScaledVector(c.ax, 2.6).addScaledVector(c.sd, 0.8).setY(0.9), tl: c.L0.clone().addScaledVector(c.ax, -1.0).setY(1.12), fov: 46, focus: c.L0.clone().setY(1.1) })],
    // the two halves on the ground, cut faces up
    [333, (c, t) => ({ tp: c.L0.clone().addScaledVector(c.ax, -1.45 - 0.15 * t).addScaledVector(c.sd, 0.3).setY(1.55 + 0.15 * t), tl: c.L0.clone().addScaledVector(c.ax, 0.15).setY(0.05), fov: 52, focus: c.L0.clone().setY(0.1) })],
    // stopped: low, in front of him
    [366, (c, t) => ({ tp: c.at(c.wp, 1.9, -0.6, 0.9), tl: c.wHead.clone().setY(c.wHead.y - 0.3), fov: 38, focus: c.wHead })],
    // the look back, his line
    [384, (c, t) => ({ tp: c.at(c.wp, 0.75, -1.15, 1.55), tl: c.wHead.clone().setY(c.wHead.y - 0.06), fov: 30, focus: c.wHead })],
    // the name of it: craning up over the halves, him beyond
    [526, (c, t) => ({ tp: c.L0.clone().addScaledVector(c.sd, 1.5).addScaledVector(c.ax, -1.0).setY(3.0 + 1.0 * t), tl: c.L0.clone().addScaledVector(c.ax, 0.6).setY(0.2), fov: 42, lam: 2 })],
  ],
};

// ------------------------------------------------------------------ Orión: the eye beams
// He scans the loser with a red fan of light from his eyes, says his line, charges his eyes (sparks of light drawn into
// them, the glow swelling) and fires: two beams into the chest, swept up to the face and down to the belly and back.
// Where they are, the skin and clothes glow red-hot; the burn spreads from where they struck (js/fx/burn.js), black and
// cracked with embers, a line of fire at its edge, and he catches fire (js/fx/eyebeam.js: flames, smoke, embers,
// sparks where the beams strike). The beams go off; he burns, flailing, falls to his knees, charred, and crumbles from
// the head down into a pile of glowing ash; Orión wags his finger at it.
const ORION = {
  scan: [8, 44], charge: [118, 172], on: [172, 300],
  // the burn's spread (0..1.1), the embers' heat, keys [frame, value]
  CHAR: [[172, 0], [184, 0.1], [230, 0.42], [300, 0.86], [350, 1.1]],
  HEAT: [[172, 0], [196, 0.7], [236, 1], [404, 1], [440, 0.8], [540, 0.4], [640, 0.2]],
  // where the beams are on him: [frame, bone, metres up from it] (the aim glides between them)
  AIM: [[172, 'spine02', 0.0], [200, 'spine02', 0.02], [226, 'head', 0.07], [256, 'spine04', 0.0], [278, 'spine02', 0.0], [300, 'spine02', 0.0]],
  // the bones the fire is seen on (and the flames' size there)
  FIRE: [['spine02', 1.3], ['spine03', 1.3], ['spine04', 1.2], ['spine01', 1.1], ['neck01', 0.9], ['head', 1.0], ['upperarm01.L', 0.9], ['upperarm01.R', 0.9], ['lowerarm01.L', 0.7], ['lowerarm01.R', 0.7],
    ['wrist.L', 0.5], ['wrist.R', 0.5], ['upperleg01.L', 0.9], ['upperleg01.R', 0.9], ['lowerleg01.L', 0.7], ['lowerleg01.R', 0.7], ['spine05', 1.1]],
  screams: [[176, 'hurtBig'], [214, 'hurtBig'], [262, 'hurtBig'], [306, 'ko'], [352, 'hurtBig']],
  spat: { m: [0, -9, 0.01, 0.01], a: [0, -9, 0.01, 0.01], b: [0, -9, 0.01, 0.01] },
  setup(d) {
    const g = d.g, L = d.L, W = d.W;
    d.burn = new Burn(L);
    d.beams = new EyeBeams(g.scene);
    d.fl = new Sprites(g.scene, 'fire', 520); d.sm = new Sprites(g.scene, 'smoke', 220); d.em = new Sprites(g.scene, 'ember', 420);
    d.pile = new AshPile(g.scene, L.pos.clone());
    // the fire's light on everything round him (made now: a light added later would make every shader be built again)
    d.fireL = new THREE.PointLight(new THREE.Color(1.0, 0.45, 0.12), 0, 7, 1.7); g.scene.add(d.fireL);
    // his eyes: brighter as they charge (their material, put back afterwards)
    d.eyeMats = [];
    for (const mesh of Object.values(W.ch.meshes)) if (/eye/i.test(mesh.name) && mesh.material?.emissive) d.eyeMats.push([mesh.material, mesh.material.emissiveIntensity]);
    // (where each fire bone is in his rest pose, how far from where the beams first strike)
    const hit = d.burn.U.uBnHit.value;
    d.fireB = ORION.FIRE.filter(([b]) => L.ch.bones[b] && L.ch.rest[b]).map(([b, k]) => ({ b, k, d: L.ch.rest[b].head.clone().sub(hit).multiply(new THREE.Vector3(1, 0.75, 1.3)).length(), y: L.ch.rest[b].head.y }));
    d.hairGone = false; d.coverage = 0;
    d.warmed = false;
  },
  dispose(d) {
    d.burn?.restore(); d.beams?.dispose(); d.fl?.dispose(); d.sm?.dispose(); d.em?.dispose(); d.pile?.dispose();
    if (d.fireL) { d.g.scene.remove(d.fireL); d.fireL.dispose?.(); }
    for (const [m, v] of d.eyeMats || []) m.emissiveIntensity = v;
    const au = d.g.audio; au.fatal?.('beamOff', null, { fast: true }); au.fatal?.('fireOff', null, { fast: true });
  },
  // the point the beams strike now: on the front of his body (towards Orión) at the aim's bone; and its rest-pose point
  aimAt(d, t, out, restOut) {
    const A = ORION.AIM, L = d.L;
    let i = 0; while (i < A.length - 1 && t > A[i + 1][0]) i++;
    const a = A[i], b = A[Math.min(i + 1, A.length - 1)], k = b[0] > a[0] ? ss(a[0], b[0], t) : 0;
    const pa = L.ch.bones[a[1]].getWorldPosition(_v).add(_w.set(0, a[2], 0)), pb = L.ch.bones[b[1]].getWorldPosition(new THREE.Vector3()).add(_w.set(0, b[2], 0));
    out.copy(pa).lerp(pb, k);
    // (out of the body to its front: towards his eyes)
    const toW = d.W.pos.clone().sub(L.pos).setY(0).normalize();
    out.addScaledVector(toW, 0.13);
    if (restOut) restOut.copy(L.ch.rest[a[1]].head).add(_w.set(0, a[2], 0.1)).lerp(_v.copy(L.ch.rest[b[1]].head).add(_w.set(0, b[2], 0.1)), k);
    return out;
  },
  eyes(d) {
    const W = d.W, wf = d.wf(new THREE.Vector3());
    return ['eye.L', 'eye.R'].map((n, i) => (W.ch.bones[n] ? W.ch.bones[n].getWorldPosition(new THREE.Vector3()) : W.pos.clone().setY(1.75).addScaledVector(d.right(new THREE.Vector3()), i ? 0.03 : -0.03)).addScaledVector(wf, 0.035));
  },
  frame(d, t) {
    const D = ORION, F = d.F, W = d.W, L = d.L, au = d.g.audio;
    const dt = 1 / 60;
    if (t === 2 && !d.warmed) { d.warmed = true; d.fl.warm(); d.sm.warm(); d.em.warm(); }
    if (t === D.scan[0]) au.fatal?.('scan', W.pos);
    if (t === D.charge[0]) au.fatal?.('charge', W.pos);
    // the charge: sparks of red light drawn in to his eyes from all round his head
    if (t > D.charge[0] && t < D.charge[1]) {
      const eyes = D.eyes(d), c = eyes[0].clone().add(eyes[1]).multiplyScalar(0.5), k = (t - D.charge[0]) / (D.charge[1] - D.charge[0]);
      for (let i = 0; i < 1 + Math.round(k * 3); i++) {
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), r = 0.35 + Math.random() * 0.3;
        d.em.emit(c.clone().addScaledVector(dir, r), dir.multiplyScalar(-r / 0.35), 0.025 + 0.02 * k, 0.33, { drag: 0, bright: 1.2 });
      }
    }
    if (t === D.on[0] - 2) au.fatal?.('beamOn', W.pos);
    if (t === D.on[0]) { d.g.camCtl.shake(0.5); d.g.effects.hitFlash = Math.max(d.g.effects.hitFlash, 0.4); }
    for (const [f, v] of D.screams) if (t === f) au.voice?.(L, v);
    const on = t >= D.on[0] && t < D.on[1];
    // sparks and smoke where the beams strike
    if (on) {
      const p = D.aimAt(d, t, new THREE.Vector3());
      const toW = W.pos.clone().sub(L.pos).setY(0).normalize();
      for (let i = 0; i < 4; i++) {
        const v = toW.clone().multiplyScalar(1.5 + Math.random() * 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3));
        d.em.emit(p, v, 0.018 + Math.random() * 0.014, 0.4 + Math.random() * 0.5, { grav: 9, drag: 0.4, floor: 0.01, bright: 1.4 });
      }
      if (t % 2 === 0) d.sm.emit(p.clone().addScaledVector(toW, 0.05), new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.5, (Math.random() - 0.5) * 0.2), 0.12, 1.6, { grow: 3, up: 0.3, drag: 0.6 });
      if (t % 10 === 0) au.fatal?.('sizzle', L.pos);
    }
    if (t === D.on[1]) au.fatal?.('beamOff', W.pos);
    // the fire: on each part of him the burn has reached, until it crumbles away
    const char = lerpK(D.CHAR, t), ash = ss(F.ash[0], F.ash[1], t), cut = (1.12 - ash * 1.3) * d.burn.top;
    if (t === 200) { au.fatal?.('ignite', L.pos); au.fatal?.('fireOn', L.pos); }
    let burning = 0;
    if (t >= 192) {
      for (const B of d.fireB) {
        const lit = char * 1.6 - B.d * 1.25 - 0.08;
        if (lit <= 0 || (ash > 0 && B.y > cut + 0.05)) continue;
        burning++;
        const p = L.ch.bones[B.b].getWorldPosition(new THREE.Vector3()), k = Math.min(1, lit * 3) * B.k;
        if (Math.random() < (B.b === 'head' ? 0.3 : 0.5)) d.fl.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.18)), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), (0.2 + Math.random() * 0.18) * k, 0.5 + Math.random() * 0.35, { up: 1.2, drag: 1.2, grow: 0.75, swirl: 1.5, bright: 0.85 });
        if (Math.random() < 0.1) d.sm.emit(p.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.7, (Math.random() - 0.5) * 0.3), 0.22 * k, 2.4, { grow: 3.5, up: 0.4, drag: 0.5, swirl: 0.6 });
        if (Math.random() < 0.22) d.em.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.8, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8), 0.014 + Math.random() * 0.01, 1.2 + Math.random(), { up: 0.4, drag: 0.6, swirl: 3 });
      }
      // the hair goes up all at once when the fire reaches the head
      const hd = d.fireB.find((B) => B.b === 'head');
      if (!d.hairGone && hd && char * 1.6 - hd.d * 1.25 > 0.1) {
        d.hairGone = true;
        const p = L.ch.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
        for (let i = 0; i < 26; i++) d.fl.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.1, (Math.random() - 0.5) * 0.2)), new THREE.Vector3((Math.random() - 0.5) * 0.8, 1 + Math.random(), (Math.random() - 0.5) * 0.8), 0.2 + Math.random() * 0.2, 0.5 + Math.random() * 0.3, { up: 1.5, drag: 1.2 });
        au.fatal?.('ignite', p, { small: true });
      }
    }
    d.coverage = Math.min(1, burning / 10);
    if (t > 200 && t % 6 === 0) au.fatal?.('fireLevel', L.pos, { I: Math.max(d.coverage, ash > 0 ? 0.5 * (1 - ash) + 0.2 : 0) });
    if (t === 392 + 16) au.fatal?.('halfthud', L.pos, { power: 0.5 });
    // the crumbling: ash flakes and embers loosed along its edge
    if (t === F.ash[0]) au.fatal?.('crumble', L.pos);
    if (t === F.ash[0] + 52) au.fatal?.('crumble', L.pos, { small: true });
    if (ash > 0 && ash < 1) {
      const y = cut * 0.98, c = L.pos;
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.05 + Math.random() * 0.2;
        const p = new THREE.Vector3(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
        d.sm.emit(p, new THREE.Vector3(Math.cos(a) * 0.3, -0.2 + Math.random() * 0.4, Math.sin(a) * 0.3), 0.05 + Math.random() * 0.05, 1.6, { grav: 0.6, drag: 1.5, swirl: 1.2, floor: 0.02, grow: 1.4 });
        if (Math.random() < 0.6) d.em.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.9, (Math.random() - 0.5) * 0.6), 0.016, 1.4, { up: 0.3, swirl: 2.5 });
      }
    }
    // the pile smoking, a few flames dying on it
    if (t > F.ash[0] + 30) {
      const c = L.pos, k = 1 - ss(F.ash[1], F.len, t);
      if (Math.random() < 0.35) d.sm.emit(new THREE.Vector3(c.x + (Math.random() - 0.5) * 0.5, 0.15, c.z + (Math.random() - 0.5) * 0.5), new THREE.Vector3(0, 0.45, 0), 0.25, 3, { grow: 3, up: 0.25, drag: 0.4, swirl: 0.4, bright: 0.8 });
      if (Math.random() < 0.35 * k) d.fl.emit(new THREE.Vector3(c.x + (Math.random() - 0.5) * 0.5, 0.06, c.z + (Math.random() - 0.5) * 0.5), new THREE.Vector3(0, 0.35, 0), 0.06 + 0.07 * Math.random(), 0.45, { up: 0.8, drag: 1.2, bright: 0.6 });
      if (Math.random() < 0.3) d.em.emit(new THREE.Vector3(c.x + (Math.random() - 0.5) * 0.6, 0.1, c.z + (Math.random() - 0.5) * 0.6), new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3), 0.012, 1.6, { up: 0.3, swirl: 2 });
    }
    if (t === F.ash[1] + 40) au.fatal?.('fireOff', L.pos);
    d.fl.step(dt); d.sm.step(dt); d.em.step(dt);
  },
  draw(d, t, alpha) {
    const D = ORION, F = d.F, L = d.L, cam = d.g.camera, time = t / 60;
    const eyes = D.eyes(d);
    const target = new THREE.Vector3(), rest = new THREE.Vector3();
    const on = t >= D.on[0] && t < D.on[1] + 2;
    if (on) D.aimAt(d, t, target, rest); else target.copy(eyes[0]);
    const I = on ? ss(D.on[0] - 1, D.on[0] + 3, t) * (1 - ss(D.on[1] - 2, D.on[1] + 2, t)) * (0.9 + 0.1 * Math.sin(t * 2.7)) : 0;
    const charge = ss(D.charge[0], D.charge[1], t);
    // (the eyes: swelling as they charge, full while firing, cooling after)
    const glow = Math.max(charge * (0.6 + 0.15 * Math.sin(t * 1.9)), I > 0 ? 1 : 0, t > D.on[1] ? 1 - ss(D.on[1], D.on[1] + 30, t) : 0);
    // the scan: a red fan from his eyes to a line across the loser, down him and back up
    let fan = null;
    if (t > D.scan[0] && t < D.scan[1]) {
      const k = (t - D.scan[0]) / (D.scan[1] - D.scan[0]), h = 0.08 + 1.7 * (k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2);
      const toW = d.W.pos.clone().sub(L.pos).setY(0).normalize();
      fan = { I: ss(0, 0.08, k) * (1 - ss(0.92, 1, k)), at: L.pos.clone().addScaledVector(toW, 0.25).setY(h), width: 0.9, side: new THREE.Vector3(-toW.z, 0, toW.x) };
    }
    d.beams.draw({ eyes, target, I, glow: glow * 0.9, impact: I, fan, cam, time });
    if (t < 12 && !d.beamsWarm) { d.beamsWarm = true; d.beams.warm(cam); }
    for (const [m, v] of d.eyeMats) m.emissiveIntensity = v * (1 + 4 * glow);
    // the burn
    const ash = ss(F.ash[0], F.ash[1], t);
    d.burn.set({ char: lerpK(D.CHAR, t), heat: lerpK(D.HEAT, t), ash, hot: I, hotP: on ? rest : null, time, hairGone: d.hairGone });
    d.pile.set(ss(F.ash[0] + 10, F.ash[1] + 10, t), lerpK(D.HEAT, t) * (1 - 0.6 * ss(F.ash[1], F.len, t)));
    if (t < 12) d.pile.mesh.visible = true; // (its shader built behind the black)
    // the fire's light
    const fire = Math.max(d.coverage, ash > 0 ? (1 - ash) * 0.8 : 0) * (t > 196 ? 1 : 0);
    const chest = L.ch.bones.spine02?.getWorldPosition(new THREE.Vector3()) || L.pos.clone().setY(1.2);
    d.fireL.position.copy(chest).setY(Math.min(chest.y, 0.4 + (1 - ash) * 0.9)).add(new THREE.Vector3(0, 0.2, 0));
    d.fireL.intensity = 14 * fire * (0.8 + 0.2 * Math.sin(t * 1.7) * Math.sin(t * 0.73)) + 4 * I + 3 * ss(F.ash[0], F.ash[1], t) * (1 - ss(F.ash[1], F.len, t));
    d.fl.draw(time); d.sm.draw(time); d.em.draw(time);
  },
  ctx(d) {
    const e = ORION.eyes(d);
    const lChest = d.L.ch.bones.spine02?.getWorldPosition(new THREE.Vector3()) || d.L.pos.clone().setY(1.25);
    return { eyes: e[0].clone().add(e[1]).multiplyScalar(0.5), lChest };
  },
  shots: [
    // him, three quarters from in front: the scan
    [0, (c, t) => ({ tp: c.at(c.wp, 1.5, 0.95, 1.62 - 0.1 * t), tl: c.wHead.clone().setY(c.wHead.y - 0.12), fov: 33, focus: c.wHead })],
    // over his shoulder: the red fan on the loser
    [22, (c, t) => ({ tp: c.at(c.wp, -0.7, -0.55, 1.85), tl: c.lp.clone().setY(1.0), fov: 38, focus: c.lHead })],
    // "acceso denegado": low, from beside the loser, up at him
    [48, (c, t) => ({ tp: c.at(c.wp, 1.7, -0.55, 1.15), tl: c.wHead.clone().setY(c.wHead.y - 0.15), fov: 32, focus: c.wHead })],
    // the charge: in on his face, the eyes swelling
    [118, (c, t) => ({ tp: c.at(c.wp, 0.85 - 0.25 * t, 0.22, c.eyes.y - 0.04), tl: c.eyes.clone(), fov: 30 - 4 * t, focus: c.eyes })],
    // fire: wide, from the side, the beams across the frame
    [170, (c, t) => ({ tp: c.mid.clone().addScaledVector(c.right, -3.4 - 0.3 * t).setY(1.4), tl: c.mid.clone().setY(1.35), fov: 40, focus: c.mid.clone().setY(1.3) })],
    // the loser, burning where they are on him
    [206, (c, t) => ({ tp: c.at(c.lp, -1.35, 0.95 - 0.3 * t, 1.5), tl: c.lHead.clone().setY(c.lHead.y - 0.3), fov: 36, focus: c.lChest })],
    // from behind Orión, low, the beams going into him
    [248, (c, t) => ({ tp: c.at(c.wp, -1.1, 0.5, 1.15 + 0.1 * t), tl: c.lp.clone().setY(1.2), fov: 38, focus: c.lChest })],
    // he burns, flailing: round him slowly
    [300, (c, t) => { const a = c.wf.clone().applyAxisAngle(UP, 2.2 + 0.7 * t); return { tp: c.lp.clone().addScaledVector(a, 2.6).setY(1.3), tl: c.lp.clone().setY(1.05), fov: 40, focus: c.lChest }; }],
    // on his knees, charred: low and close
    [392, (c, t) => ({ tp: c.at(c.lp, -1.5, -1.0, 0.85), tl: c.lHead.clone().setY(c.lHead.y - 0.2), fov: 36, focus: c.lHead })],
    // crumbling to ash: a little wider
    [436, (c, t) => ({ tp: c.at(c.lp, -2.2, 1.3, 1.15 - 0.2 * t), tl: c.lp.clone().setY(0.7 - 0.35 * t), fov: 38, focus: c.lp.clone().setY(0.6) })],
    // the ashes in front, Orión beyond them wagging his finger
    [478, (c, t) => ({ tp: c.at(c.lp, 2.1, 1.05, 0.6), tl: c.wp.clone().addScaledVector(c.right, 0.25).setY(0.95), fov: 36, focus: c.wHead })],
    // done: his slow scan
    [560, (c, t) => ({ tp: c.at(c.wp, 1.35, -0.7, 1.6), tl: c.wHead.clone().setY(c.wHead.y - 0.1), fov: 32, focus: c.wHead })],
  ],
};

const MOVES = { noemi: NOEMI, camilo: CAMILO, dani: DANI, alejandro: ALEJANDRO, rafa: RAFA, zapponi: ZAPPONI, orion: ORION };
export function fatalOf(id) { return MOVES[id] || null; }

export class FatalityDirector {
  constructor(game) {
    this.g = game; this.m = null;
    this.lens = new LensBlood($('#lensBlood'));
  }

  // ------------------------------------------------------------------ start / end
  start(m) {
    const g = this.g, W = m.fighters[m.fatalBy | 0], L = W.opp;
    this.m = m; this.W = W; this.L = L; this.F = W.style.fatal; this.D = fatalOf(W.id);
    this.t = -1; this.fired = new Set(); this.shotK = -1;
    this.torsoDown = false; this.legsDown = false; this.headDown = false; this.headC = null;
    this.blood = new Blood(g.scene);
    // the winner's clothes and hands take the blood that flies at them
    const sp = this.D?.spat || NOEMI.spat;
    this.spat = { amount: { value: 0 }, m: { value: new THREE.Vector4(...sp.m) }, a: { value: new THREE.Vector4(...sp.a) }, b: { value: new THREE.Vector4(...sp.b) } };
    this.spatMeshes = [];
    for (const mesh of Object.values(W.ch.meshes)) {
      const mt = mesh.material;
      if (!mesh.isSkinnedMesh || mt.transparent || mt.alphaTest > 0 || /hair|eye|cornea|lash|teeth|beard/i.test(mesh.name)) continue;
      this.spatMeshes.push([mesh, mt]);
      mesh.material = spatterMaterial(mt, this.spat);
    }
    this.D?.setup(this);
    // the sound: the music steps away, a low hum and a heartbeat build up
    g.audio.hush?.();
    g.audio.musicFade?.(0.12, 0.4);
    g.audio.fatal?.('drone');
    this.hud(true);
    L.drawnBy = null;
  }
  dispose() {
    if (!this.m) return;
    const g = this.g;
    this.D?.dispose(this);
    if (this.L) this.L.drawnBy = null;
    this.blood?.dispose();
    for (const [mesh, mt] of this.spatMeshes || []) { mesh.material.dispose(); mesh.material = mt; }
    g.audio.fatal?.('droneOff', null, { fast: true });
    this.lens.clear();
    this.hud(false);
    for (const k of ['split', 'blood', 'sw', 'spatMeshes', 'trail', 'glint', 'db', 'crush', 'loose', 'swB', 'swT']) this[k] = null;
    this.m = null;
  }
  hud(on) {
    // (nothing of the fight's own screen over the move: the pause hint gone too)
    if (on) $('.movelist-hint')?.classList.add('fade');
    $('#fatalTitle')?.classList.remove('on');
    $('#fatalSub')?.classList.remove('on');
    if (!on) { this.g.camCtl.fatalShot = null; }
  }

  // ------------------------------------------------------------------ every drawn frame
  // m: the game's match; alpha: between its last two frames; dt: real seconds since the last drawn frame
  update(m, alpha, dt) {
    if (this.m && this.m !== m) this.dispose();
    if (!this.m) { if (!m || m.phase !== 'fatal') { this.lens.update(dt); return; } this.start(m); }
    // a correction online that went back to before the move: start again when it comes round
    if (m.phase !== 'fatal') { this.dispose(); return; }
    const target = m.pt;
    while (this.t < target) { this.t++; this.frame(this.t); }
    this.draw(target === m.pt ? alpha : 1, dt);
  }

  // ------------------------------------------------------------------ the timeline (one frame of the fight)
  frame(t) {
    const g = this.g, D = this.D, F = this.F, W = this.W, au = g.audio;
    if (!D) return;
    if (t === 1) { g.effects.fade = 1; au.fatal?.('cutin', null); }
    if (t === F.sayAt) { au.line?.(W, 'fatal'); this.subtitle(F.say); }
    if (t === F.sayAt + (F.sayLen || 112)) $('#fatalSub')?.classList.remove('on');
    D.frame(this, t);
    if (t === F.title) this.title();
    this.blood.step();
    this.lens.age(1 / 60);
  }

  subtitle(text) {
    const el = $('#fatalSub');
    if (!el || this.g.hud.subtitles === false) return;
    el.textContent = `“${text}”`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  title() {
    const el = $('#fatalTitle');
    this.g.audio.fatal?.('title', null);
    this.g.audio.musicFade?.(1, 4);
    this.g.camCtl.shake(0.45);
    if (!el) return;
    // the drips under the letters, each its own length and pace
    const drips = el.querySelector('.drips');
    if (drips) {
      drips.innerHTML = '';
      for (let i = 0; i < 16; i++) {
        const d = document.createElement('i');
        d.style.left = `${3 + i * 6 + (i * 37 % 5)}%`; d.style.setProperty('--h', `${15 + (i * 53 % 75)}%`); d.style.setProperty('--d', `${(i * 29 % 9) * 0.12}s`);
        d.style.width = `${1.1 + (i * 17 % 5) * 0.35}%`;
        drips.appendChild(d);
      }
    }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  // the winner's right (his character space's -x, in the world) and facing
  right(out) { const y = this.W.yaw; return out.set(-Math.cos(y), 0, Math.sin(y)); }
  wf(out) { const y = this.W.yaw; return out.set(Math.sin(y), 0, Math.cos(y)); }

  // ------------------------------------------------------------------ drawing
  draw(alpha, dt) {
    const g = this.g, m = this.m, t = m.pt + alpha, D = this.D, F = this.F;
    // black for a moment as it starts, then the scene fades in
    g.effects.fade = t < 12 ? 1 : Math.max(0, 1 - (t - 12) / 12);
    D?.draw(this, t, alpha, dt);
    this.blood.render(alpha, g.camera, m.timeRate ? m.timeRate() : 1);
    this.lens.update(0);
    if (!D) return;
    // the camera
    const ctx = this.shotCtx();
    let k = 0;
    for (let i = 0; i < D.shots.length; i++) if (t >= D.shots[i][0]) k = i;
    const [s0, fn] = D.shots[k], s1 = k + 1 < D.shots.length ? D.shots[k + 1][0] : F.len;
    const S = fn(ctx, Math.min(1, (t - s0) / Math.max(1, s1 - s0)));
    S.cut = this.shotK !== k; this.shotK = k;
    g.camCtl.fatalShot = S;
  }
  // what the shots are framed on
  shotCtx() {
    const W = this.W, L = this.L, D = this.D;
    const wp = W.ch.group.position.clone().setY(0);
    const lp = D?.lp?.(this) || L.ch.group.position.clone().setY(0);
    const wf = this.wf(new THREE.Vector3()), right = this.right(new THREE.Vector3());
    const head = (f, out) => { const b = f.ch.bones.head; return b ? b.getWorldPosition(out) : out.copy(f.pos).setY(1.6); };
    const wHead = head(W, new THREE.Vector3());
    const lHead = D?.lHead?.(this) || head(L, new THREE.Vector3());
    const prop = D?.mid?.(this) || wHead.clone();
    return {
      ...(D?.ctx?.(this) || {}),
      wp, lp, wf, right, wHead, lHead, prop, mid: wp.clone().add(lp).multiplyScalar(0.5),
      // a point `fwd` metres along the winner's facing and `side` to his right from p, at height h
      at: (p, fwd, side, h) => p.clone().addScaledVector(wf, fwd).addScaledVector(right, side).setY(h),
    };
  }
}

// the served ball's comet: a streak of hot yellow-white light along its last positions
function makeComet() {
  const N = 18, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), al = new Float32Array(N);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.Points(g, new THREE.ShaderMaterial({
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (3.0 + 8.0 * alpha) * projectionMatrix[1][1] / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(vec3(1.1, 1.05, 0.55) * vA * exp(-d * d * 4.0), 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  mesh.frustumCulled = false; mesh.renderOrder = 14; mesh.userData.noGTAO = true; mesh.userData.noAO = true;
  const hist = [];
  return {
    mesh,
    update(p, on) {
      if (p && on) { hist.unshift(p.clone()); if (hist.length > N) hist.pop(); } else if (hist.length) hist.pop();
      for (let i = 0; i < N; i++) {
        const h = hist[i];
        if (!h) { al[i] = 0; continue; }
        pos.set(h.toArray(), i * 3); al[i] = Math.pow(1 - i / N, 1.5) * 0.9;
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
      mesh.visible = hist.length > 1;
    },
  };
}

// the sweep's trail: a ribbon between the blade's base and tip over the last few frames, bright and green-white,
// fading towards its end; and the green motes of the summoning
function makeTrail() {
  const N = 14;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 2 * 3), al = new Float32Array(N * 2);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'attribute float alpha; varying float vA; varying float vS; void main(){ vA = alpha; vS = float(gl_VertexID % 2); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; varying float vS; void main(){ float e = smoothstep(0.0, 0.35, vS) * (0.4 + 0.6 * vS); gl_FragColor = vec4(vec3(0.75, 1.6, 0.9) * vA * e * 1.6, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 14; mesh.userData.noGTAO = true; mesh.userData.noAO = true;
  const hist = [];
  // the motes: points
  const MP = 80, mg = new THREE.BufferGeometry(), mpos = new Float32Array(MP * 3), mal = new Float32Array(MP);
  mg.setAttribute('position', new THREE.BufferAttribute(mpos, 3).setUsage(THREE.DynamicDrawUsage));
  mg.setAttribute('alpha', new THREE.BufferAttribute(mal, 1).setUsage(THREE.DynamicDrawUsage));
  const mm = new THREE.Points(mg, new THREE.ShaderMaterial({
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 7.0 * projectionMatrix[1][1] / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(vec3(0.5, 1.8, 0.7) * vA * exp(-d * d * 4.0), 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  mm.frustumCulled = false; mm.renderOrder = 14; mm.userData.noGTAO = true; mm.userData.noAO = true;
  mesh.add(mm);
  const motes = [];
  return {
    mesh, motes,
    update(seg, dt) {
      if (seg) { hist.unshift([seg[0].clone(), seg[1].clone()]); if (hist.length > N) hist.pop(); }
      else if (hist.length) hist.pop();
      const n = hist.length;
      for (let i = 0; i < N; i++) {
        const h = hist[Math.min(i, n - 1)];
        if (!h) { al[i * 2] = al[i * 2 + 1] = 0; continue; }
        // (the inner edge a third of the way out the blade: the trail is the tip's sweep)
        const inner = h[0].clone().lerp(h[1], 0.35);
        pos.set(inner.toArray(), i * 6); pos.set(h[1].toArray(), i * 6 + 3);
        const a = i < n ? Math.pow(1 - i / N, 1.6) : 0;
        al[i * 2] = a; al[i * 2 + 1] = a;
      }
      g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
      mesh.visible = n > 1;
    },
    updateMotes(dt) {
      let k = 0;
      for (let i = 0; i < motes.length; i++) {
        const q = motes[i];
        q.age += dt;
        if (q.age >= q.life) continue;
        q.p.addScaledVector(q.v, dt);
        motes[k++] = q;
      }
      motes.length = Math.min(k, MP);
      for (let i = 0; i < motes.length; i++) { mpos.set(motes[i].p.toArray(), i * 3); mal[i] = Math.sin(Math.min(1, motes[i].age / motes[i].life) * Math.PI); }
      mg.setDrawRange(0, motes.length);
      mg.attributes.position.needsUpdate = true; mg.attributes.alpha.needsUpdate = true;
    },
  };
}
// the glint: a four-pointed star of light
function makeGlint() {
  const n = 128, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1, r = Math.hypot(dx, dy);
    let v = Math.exp(-r * r * 40) * 1.2 + Math.exp(-Math.abs(dx) * 40) * Math.exp(-Math.abs(dy) * 2.2) + Math.exp(-Math.abs(dy) * 40) * Math.exp(-Math.abs(dx) * 2.2);
    v = Math.min(1, v);
    const i = (y * n + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(v * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(2.5, 3, 2.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.visible = false; s.renderOrder = 15; s.userData.noGTAO = true; s.userData.noAO = true;
  return s;
}
