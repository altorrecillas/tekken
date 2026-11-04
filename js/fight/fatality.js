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
    B.spray(p, d.slideDir.clone().addScaledVector(front, 0.3).setY(0.15).normalize(), 90, { speed: [1.5, 5], spread: 0.4, size: [0.0015, 0.005] });
    B.spray(p, front.clone().setY(0.2).normalize(), 30, { speed: [1, 3], spread: 0.6, size: [0.002, 0.006] });
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
    [40, (c, t) => ({ tp: c.at(c.wp, 1.15 - 0.15 * t, 1.55 - 0.15 * t, 1.38), tl: c.wHead.clone().lerp(c.prop, 0.5).setY(Math.max(1.1, c.wHead.y * 0.5 + c.prop.y * 0.5)), fov: 33, focus: c.prop })],
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
    [342, (c, t) => ({ tp: c.at(c.wp, 1.8 - 0.1 * t, 1.1, 1.25), tl: c.wHead.clone().setY(c.wHead.y - 0.4), fov: 32, focus: c.wHead })],
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

const MOVES = { noemi: NOEMI, camilo: CAMILO };
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
      wp, lp, wf, right, wHead, lHead, prop, mid: wp.clone().add(lp).multiplyScalar(0.5),
      // a point `fwd` metres along the winner's facing and `side` to his right from p, at height h
      at: (p, fwd, side, h) => p.clone().addScaledVector(wf, fwd).addScaledVector(right, side).setY(h),
    };
  }
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
