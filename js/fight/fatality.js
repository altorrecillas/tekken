// PUÑETALITY: the finishing move a winner can do on the win screen (the button that comes up there, or up + a button),
// the game's own take on a fighting game's finisher. The simulation side lives in js/fight/match.js (startFatal /
// stepFatal: the two fighters placed, the winner's move played, the loser dazed then afraid, then still) and the
// winner's style (styles.js `fatal`: its frames and the clip). This is what is drawn and heard on top of it, frame by
// frame of the move: the props, the loser cut in two (js/fx/splitbody.js), the blood (js/fx/blood.js), the camera's
// shots, the sounds, the title. Each fighter's move is a table below; only those who have one can do it.
//
// It follows the simulation frame by frame (step: the bodies and the blood move with the fight's frames, so a capture
// of a frame is always the same and online both phones see the same; a frame done again after a correction online is
// not done twice) and is drawn between frames (alpha).
import * as THREE from 'three';
import { SplitBody } from '../fx/splitbody.js';
import { Blood, LensBlood } from '../fx/blood.js';
import { makeAloeSword, attachAloeSword } from '../fx/aloesword.js';

const $ = (s) => document.querySelector(s);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ blood on the winner's clothes and hands
// A spatter that lands on her front at the cut and more with the fountain: drops on a grid of cells in the rest pose's
// space (they move with the body as it is skinned), denser on the front and at the waist and chest, only some cells
// filled, more as `amount` rises
const SPAT_GLSL = `
float fsH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float fatalSpatter( vec3 P, vec3 N, float amount ) {
  if ( amount <= 0.0 ) return 0.0;
  // (on her front, round where the blood came at her from: the waist and belly, thinning out towards the chest, the
  // right side and the right forearm that held the sword)
  vec2 cq = ( P.xy - vec2( -0.04, 1.0 ) ) / vec2( 0.3, 0.26 );
  float region = smoothstep( 0.15, 0.6, N.z ) * exp( -dot( cq, cq ) * 1.6 );
  vec2 fq = ( P.xy - vec2( -0.42, 1.0 ) ) / vec2( 0.09, 0.12 );
  region = max( region, 0.6 * exp( -dot( fq, fq ) ) * smoothstep( -0.2, 0.4, N.z ) );
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
    sh.uniforms.uSpat = U;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSpP; varying vec3 vSpN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSpP = position; vSpN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSpP; varying vec3 vSpN; uniform float uSpat;' + SPAT_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tfloat fSpat = fatalSpatter( vSpP, normalize( vSpN ), uSpat );\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.12, 0.004, 0.006 ), fSpat * 0.95 );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.2, fSpat );');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|spat';
  return m;
}

// ------------------------------------------------------------------ the moves
// Noemí: the aloe vera sword. Frames of her move (styles.js fatal has the clip and the frames the simulation needs)
const NOEMI = {
  prop: 'aloeSword',
  show: 40, grow: [41, 53], shing: 53, glint: [64, 80], heart: [104, 138, 166, 182], whoosh: 196,
  line: [204, 228], releaseUp: 232, slide: 0.12, releaseDown: 300, pulses: [244, 267, 290, 313, 337], flick: 347,
  // the shots: [from frame, shot]; each a function of the scene (see shotCtx) returning the camera's place, where it
  // looks, its lens, and what is in focus
  shots: [
    // her, three quarters from her right (the loser just out of the frame on the left), a slow push in
    [0, (c, t) => ({ tp: c.at(c.wp, 1.15 - 0.1 * t, 2.0 - 0.2 * t, 1.38), tl: c.wHead.clone().addScaledVector(c.right, 0.15).setY(c.wHead.y - 0.3), fov: 32, focus: c.wHead })],
    // the draw and the salute: from her right, wider, so the hand, the blade's flat and her face are all in it
    [40, (c, t) => ({ tp: c.at(c.wp, 1.15 - 0.15 * t, 1.55 - 0.15 * t, 1.38), tl: c.wHead.clone().lerp(c.swMid, 0.5).setY(Math.max(1.1, c.wHead.y * 0.5 + c.swMid.y * 0.5)), fov: 33, focus: c.swMid })],
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
const MOVES = { noemi: NOEMI };
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
    this.t = -1; this.fired = new Set();
    this.split = new SplitBody(g.scene, L);
    this.split.clampWalk = (p, r) => g.stage?.clampWalk?.(p, r);
    this.split.begin();
    this.blood = new Blood(g.scene);
    // the sword in her fist (hidden until it is drawn)
    if (this.D?.prop === 'aloeSword') {
      this.sw = makeAloeSword();
      attachAloeSword(W.ch, this.sw);
      this.sw.U.grow.value = 0;
    }
    // her clothes and hands take the blood that flies at her
    this.spat = { value: 0 };
    this.spatMeshes = [];
    for (const mesh of Object.values(W.ch.meshes)) {
      const mt = mesh.material;
      if (!mesh.isSkinnedMesh || mt.transparent || mt.alphaTest > 0 || /hair|eye|cornea|lash|teeth|beard/i.test(mesh.name)) continue;
      this.spatMeshes.push([mesh, mt]);
      mesh.material = spatterMaterial(mt, this.spat);
    }
    // the trail of the sweep and the glint on the blade
    this.trail = makeTrail(); g.scene.add(this.trail.mesh);
    this.glint = makeGlint(); g.scene.add(this.glint);
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
    this.split?.restore();
    if (this.L) this.L.drawnBy = null;
    this.blood?.dispose();
    if (this.sw) { this.sw.group.parent?.remove(this.sw.group); for (const mt of this.sw.mats) mt.dispose(); }
    for (const [mesh, mt] of this.spatMeshes || []) { mesh.material.dispose(); mesh.material = mt; }
    if (this.trail) { g.scene.remove(this.trail.mesh); this.trail.mesh.geometry.dispose(); this.trail.mesh.material.dispose(); }
    if (this.glint) { g.scene.remove(this.glint); this.glint.material.map?.dispose(); this.glint.material.dispose(); }
    g.audio.fatal?.('droneOff', null, { fast: true });
    this.lens.clear();
    this.hud(false);
    this.m = null; this.split = null; this.blood = null; this.sw = null; this.spatMeshes = null; this.trail = null; this.glint = null;
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
  once(key) { if (this.fired.has(key)) return false; this.fired.add(key); return true; }
  frame(t) {
    const g = this.g, D = this.D, F = this.F, W = this.W, L = this.L, sp = this.split, B = this.blood;
    if (!D) return;
    const au = g.audio;
    if (t === 1) { g.effects.fade = 1; au.fatal?.('cutin', null); }
    // the sword
    if (this.sw) {
      this.sw.group.visible = t >= D.show;
      this.sw.U.grow.value = ss(D.grow[0], D.grow[1], t);
      this.sw.U.glow.value = t >= D.grow[0] && t < D.grow[1] + 20 ? 1 - ss(D.grow[1], D.grow[1] + 20, t) : 0;
      if (t === D.grow[0]) au.fatal?.('summon', W.pos);
      if (t === D.shing) au.fatal?.('shing', W.pos);
      if (t === D.glint[0]) au.fatal?.('glint', W.pos);
      // green motes off the leaf as it grows
      if (t >= D.grow[0] && t <= D.grow[1] + 4) this.motes(3);
    }
    for (const h of D.heart) if (t === h) au.fatal?.('heart', null, { gain: 0.7 + 0.1 * D.heart.indexOf(h) });
    if (t === F.sayAt) { au.line?.(W, 'fatal'); this.subtitle(F.say); }
    if (t === F.sayAt + 112) $('#fatalSub')?.classList.remove('on');
    if (t === D.whoosh) { au.fatal?.('whoosh', W.pos); au.fatal?.('droneOff', null, { fast: true }); }
    // the cut
    if (t === F.cut) this.cut();
    if (t > F.cut && sp.cut) {
      const k = ss(D.line[0], D.line[1], t);
      sp.setBleed(k, Math.min(1, 0.45 * k + 0.55 * ss(D.releaseUp, D.releaseUp + 160, t)));
      // blood seeping from the line before the halves part, running off them after
      if (t < D.releaseUp + 6 && sp.rim0.length) for (let i = 0; i < 1 + (k > 0.5 ? 2 : 0); i++) B.dribble(sp.rim0[(t * 37 + i * 101) % sp.rim0.length], 1);
    }
    if (t === D.releaseUp) sp.slide(this.slideDir, D.slide, 1.7, 0.7);
    if (t === D.releaseDown) { sp.release('down', new THREE.Vector3(1.1, 0.35, 0.25)); }
    sp.step();
    if (sp.cut) this.bleed(t);
    // the blade flicked clean
    if (t === D.flick && this.sw) {
      au.fatal?.('flick', W.pos);
      this.sw.U.blood.value = 0.15;
      const b = this.sw.group.localToWorld(this.sw.base.clone()), tp = this.sw.group.localToWorld(this.sw.tip.clone());
      const dir = tp.clone().sub(b).normalize().multiplyScalar(0.6).add(_v.set(0, -0.6, 0)).normalize();
      for (let i = 0; i < 8; i++) B.spray(b.clone().lerp(tp, 0.25 + i * 0.09), dir, 9, { speed: [2.5, 4.5], spread: 0.15, size: [0.002, 0.006] });
    }
    if (t === F.title) this.title();
    B.step();
    this.lens.age(1 / 60);
  }

  cut() {
    const g = this.g, W = this.W, L = this.L, sp = this.split, B = this.blood;
    // the plane: level at the loser's waist, sloping down the way the sword went (she cuts from her right to her left)
    const right = this.right(new THREE.Vector3());
    this.slideDir = right.clone().negate();
    const s4 = L.ch.bones.spine04.getWorldPosition(new THREE.Vector3()), s3 = L.ch.bones.spine03.getWorldPosition(new THREE.Vector3());
    const p = s4.lerp(s3, 0.55);
    const n = UP.clone().addScaledVector(this.slideDir, Math.tan(0.2)).normalize();
    sp.doCut(n, p);
    L.drawnBy = sp;
    g.audio.fatal?.('slice', p);
    g.effects.hitFlash = Math.max(g.effects.hitFlash, 0.55); g.effects.radial = Math.max(g.effects.radial, 0.5);
    g.camCtl.shake(0.55);
    // the first burst: a fine spray along the sweep, a red mist, a few bits
    const front = this.W.pos.clone().sub(L.pos).setY(0).normalize();
    B.spray(p, this.slideDir.clone().addScaledVector(front, 0.3).setY(0.15).normalize(), 90, { speed: [1.5, 5], spread: 0.4, size: [0.0015, 0.005] });
    B.spray(p, front.clone().setY(0.2).normalize(), 30, { speed: [1, 3], spread: 0.6, size: [0.002, 0.006] });
    B.puff(p, 10, { size: [0.06, 0.16], speed: 0.5, life: 1.4 });
    B.gore(p, this.slideDir, 7);
    if (this.sw) this.sw.U.blood.value = 0.55;
    this.spat.value = 0.55;
  }
  // the fountain from the legs (in pulses with the heart), what pours from the falling trunk, the splash and the pools
  bleed(t) {
    const D = this.D, sp = this.split, B = this.blood, au = this.g.audio;
    const st = sp.stumps(), lo = st.lower, up = st.upper;
    if (!lo.n) return;
    // the pulses: a strong jet from the legs' cut at each beat, weaker each time; a steady well in between
    for (let i = 0; i < D.pulses.length; i++) {
      const p0 = D.pulses[i], k = t - p0;
      if (k === 0) { au.fatal?.('spurt', lo.c, { power: 1 - i * 0.16 }); B.puff(lo.c, 4, { size: [0.05, 0.12], speed: 0.8 }); if (i === 0) { this.lens.splash(5, 1); this.spat.value = 1; } }
      if (k >= 0 && k < 16) {
        const pw = (1 - i * 0.17) * (1 - k / 18);
        const dir = lo.n.clone().addScaledVector(this.slideDir, 0.18).normalize();
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
      if (!this.torsoDown && t % 2 === 0) B.dribble(up.c, 2, [0.004, 0.01]);
      const P = sp.P;
      const low = Math.min(P.chest.p.y, P.belly.p.y, P.cutU.p.y, P.head.p.y);
      const vy = (P.cutU.p.y - P.cutU.prev.y) * 60;
      if (!this.torsoDown && low < 0.16 && vy < -0.6) {
        this.torsoDown = true;
        au.fatal?.('splat', up.c);
        this.g.camCtl.shake(0.35);
        B.spray(_v.copy(up.c).setY(0.05), UP, 60, { speed: [1, 2.6], spread: 1.0, size: [0.002, 0.006] });
        B.puff(_v.copy(up.c).setY(0.08), 5, { size: [0.08, 0.2], speed: 0.6 });
        B.splat(up.c, 0.85, 3, 0, 160);
      }
      if (this.torsoDown && t % 3 === 0) B.dribble(up.c, 1, [0.005, 0.01]);
    }
    if (sp.relL >= 0) {
      const py = sp.P.pelvis.p.y;
      if (!this.legsDown && py < 0.24) { this.legsDown = true; au.fatal?.('fall', lo.c); this.g.camCtl.shake(0.25); B.splat(lo.c, 1.0, 3, 0, 220); }
    }
  }
  // green motes off the growing leaf
  motes(n) {
    const sw = this.sw, g = sw.U.grow.value;
    for (let i = 0; i < n; i++) {
      const p = sw.group.localToWorld(sw.base.clone().lerp(sw.tip, g * Math.random()));
      this.trail.motes.push({ p, v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3), age: 0, life: 0.6 + Math.random() * 0.5 });
    }
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
  // the winner's right (her character space's -x, in the world)
  right(out) { const y = this.W.yaw; return out.set(-Math.cos(y), 0, Math.sin(y)); }

  // ------------------------------------------------------------------ drawing
  draw(alpha, dt) {
    const g = this.g, m = this.m, t = m.pt + alpha, D = this.D, F = this.F;
    // black for a moment as it starts, then the scene fades in
    g.effects.fade = t < 12 ? 1 : Math.max(0, 1 - (t - 12) / 12);
    this.split.setLight(_v.set(0.3, 1, 0.4).normalize());
    this.split.sync(alpha, this.L.rig);
    this.blood.render(alpha, g.camera);
    this.lens.update(0);
    if (!D) return;
    // the blood on the blade dries a little darker... and the glint runs up it
    if (this.sw) {
      this.sw.group.updateWorldMatrix(true, false);
      const b = this.sw.group.localToWorld(this.sw.base.clone()), tp = this.sw.group.localToWorld(this.sw.tip.clone());
      this.swB = b; this.swT = tp;
      const gk = (t - D.glint[0]) / (D.glint[1] - D.glint[0]);
      if (gk > 0 && gk < 1) {
        this.glint.visible = true;
        this.glint.position.lerpVectors(b, tp, 0.1 + 0.88 * ss(0, 1, gk));
        const s = Math.sin(gk * Math.PI) * 0.22;
        this.glint.scale.set(s, s, 1); this.glint.material.rotation = gk * 2.5;
      } else this.glint.visible = false;
      // the sweep's trail (only through the cut)
      this.trail.update(t >= D.whoosh - 1 && t <= F.cut + 7 ? [b, tp] : null, dt, t);
    }
    this.trail.updateMotes(dt);
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
    const W = this.W, L = this.L, y = W.yaw;
    const wp = W.ch.group.position.clone().setY(0), lp = this.split?.cut ? this.split.center0.clone().setY(0) : L.ch.group.position.clone().setY(0);
    const wf = new THREE.Vector3(Math.sin(y), 0, Math.cos(y)), right = this.right(new THREE.Vector3());
    const head = (f, out) => { const b = f.ch.bones.head; return b ? b.getWorldPosition(out) : out.copy(f.pos).setY(1.6); };
    const wHead = head(W, new THREE.Vector3());
    const lHead = this.split?.relU >= 0 ? this.split.P.head.p.clone() : head(L, new THREE.Vector3());
    const swMid = this.swB ? this.swB.clone().lerp(this.swT, 0.5) : wHead.clone();
    return {
      wp, lp, wf, right, wHead, lHead, swMid, mid: wp.clone().add(lp).multiplyScalar(0.5),
      // a point `fwd` metres along her facing and `side` to her right from p, at height h
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
