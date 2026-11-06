// A fighter split down his middle, head to crotch (Zapponi's PUÑETALITY, js/fight/fatality.js): drawn as two halves,
// left and right, each falling away to its own side.
//
// Each half is a copy of every part of the body on the one skeleton (frozen as it was cut), hung from a group of its
// own whose transform (C) carries it off; its materials leave out what lies on the other side of the cut plane (the
// plane through his middle as he stood, taken in the skeleton's own world: C⁻¹ undoes the group's move). Accessories go
// with the half they are on, or both (glasses, cut too). Looking into a half, the inside of its far wall (a back face)
// is drawn as the cut itself: the ray from the eye meets the plane there and the section is painted with what is at
// that point of him seen from the side: skin and fat round the edge, the skull and the brain, the face's cavities, the
// tongue and the teeth, the spine with its discs and the cord behind them, the windpipe, the heart and the lungs, the
// liver and the bowels, the pelvis, welling blood. Both halves pivot on the outer edge of their foot, pushed apart as
// the bike goes through, fall onto their outer side (the cut face up) with a bounce, and slide a little.
import * as THREE from 'three';

const G = 9.81, DT = 1 / 60;
const _R = new THREE.Matrix4(), _T = new THREE.Matrix4();
const NOISE = `
float hvH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float hvN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hvH( i ), hvH( i + vec2( 1, 0 ) ), f.x ), mix( hvH( i + vec2( 0, 1 ) ), hvH( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float hvF( vec2 p ) { return 0.5 * hvN( p ) + 0.3 * hvN( p * 2.13 + 7.1 ) + 0.2 * hvN( p * 4.37 + 3.3 ); }`;

// per half: its side (+1 his left, -1 his right), C⁻¹, the eye and the light in the skeleton's world; shared by both:
// the plane, the section's frame and landmarks, the cut's line and blood
function sharedUniforms() {
  return {
    uHP: { value: new THREE.Vector4(1, 0, 0, -1000) }, uHO: { value: new THREE.Vector3() }, uHF: { value: new THREE.Vector3(0, 0, 1) },
    uHSpine: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) }, uHLm: { value: new THREE.Vector4(0.95, 1.2, 1.5, 1.6) }, uHLm2: { value: new THREE.Vector4(1.62, 0.15, 1.8, 1.55) },
    uHLine: { value: 0 }, uHZip: { value: -1 }, uHBleed: { value: 0 }, uHSkin: { value: new THREE.Color(0.62, 0.43, 0.36) },
  };
}
function halfUniforms(S, side) {
  return { ...S, uHSide: { value: side }, uHCi: { value: new THREE.Matrix4() }, uHCam: { value: new THREE.Vector3() }, uHLight: { value: new THREE.Vector3(0.3, 1, 0.4).normalize() } };
}

const VERT = 'uniform mat4 uHCi; varying vec3 vHW;\n';
const VERT_MAIN = 'vHW = ( uHCi * modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n';
const FRAG = `uniform mat4 uHCi; varying vec3 vHW; uniform vec4 uHP; uniform float uHSide, uHLine, uHZip, uHBleed;${NOISE}
float hvDist() { return dot( uHP.xyz, vHW ) - uHP.w; }
// the blood on the outside along the cut: its thin line (as far up as the cut has gone: zip) and a soaked band
float hvStain() {
  float d = abs( hvDist() );
  float n = hvN( vHW.yz * 80.0 + vHW.x * 30.0 );
  float line = ( 1.0 - smoothstep( 0.0035 + 0.004 * n * uHLine, 0.0075 + 0.006 * n * uHLine, d ) ) * uHLine * step( vHW.y, uHZip );
  float band = ( 1.0 - smoothstep( 0.003 + 0.02 * uHBleed * ( 0.6 + 0.8 * n ), 0.008 + 0.03 * uHBleed * ( 0.6 + 0.8 * n ), d ) ) * smoothstep( 0.0, 0.1, uHBleed );
  return clamp( max( line * 1.2, band ), 0.0, 1.0 );
}`;
const BLOOD = 'vec3( 0.13, 0.004, 0.006 )';

function patchClip(sh, U, stain) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT).replace('#include <project_vertex>', VERT_MAIN + '#include <project_vertex>');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif ( hvDist() * uHSide < 0.0 ) discard;' + (stain ? '\n\tfloat hvS = hvStain();' : ''));
  if (stain) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, ${BLOOD}, hvS * 0.96 );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.14, hvS );');
  }
}
// a material of the body (or an accessory), for one half
function clipMaterial(mat, U, stain = true) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  if (mat.defines) m.defines = { ...mat.defines };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    patchClip(sh, U, stain && !!sh.fragmentShader.includes('#include <color_fragment>'));
    if (!sh.fragmentShader.includes('hvDist() * uHSide')) console.warn('halves: shader not patched', mat.type);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|halves' + (stain ? 's' : '');
  return m;
}
function clipDepth(U, packing, src) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: packing });
  if (src?.userData?.clothSway) d.userData.clothSway = src.userData.clothSway;
  d.onBeforeCompile = (sh) => patchClip(sh, U, false);
  d.customProgramCacheKey = () => 'halvesDepth' + packing;
  return d;
}

// the section, painted at the point Q of the plane: f forwards from his spine's line, y up; rim: how near the body's
// outside (the far wall's distance from the plane, small at the edge of the cut)
const CAP = `
uniform vec3 uHO, uHF, uHCam, uHLight, uHSkin; uniform vec2 uHSpine[ 8 ]; uniform vec4 uHLm, uHLm2; uniform float uHKind, uHBias; uniform vec3 uHTint;
float hvSpineF( float y ) {
  float f = uHSpine[ 0 ].y;
  for ( int i = 1; i < 8; i++ ) if ( y > uHSpine[ i - 1 ].x ) f = mix( uHSpine[ i - 1 ].y, uHSpine[ i ].y, clamp( ( y - uHSpine[ i - 1 ].x ) / max( 1e-4, uHSpine[ i ].x - uHSpine[ i - 1 ].x ), 0.0, 1.0 ) );
  return f;
}
vec3 hvBone( vec2 p ) { return vec3( 0.7, 0.63, 0.5 ) * ( 0.8 + 0.25 * hvN( p * 420.0 ) ) - vec3( 0.1, 0.12, 0.12 ) * step( 0.82, hvN( p * 900.0 ) ); }
vec3 hvSection( float f, float y, float rim, out float wet ) {
  vec2 p = vec2( f, y );
  float d = f - hvSpineF( y );
  float yR = uHLm.x, yD = uHLm.y, yN = uHLm.z, yH = uHLm.w, yM = uHLm2.x, fM = uHLm2.y, yT = uHLm2.z, yC = uHLm2.w;
  float fib = hvF( vec2( f * 40.0, y * 9.0 ) ) * 0.7 + hvF( p * 150.0 ) * 0.3;
  // muscle, where nothing else is
  vec3 c = mix( vec3( 0.19, 0.012, 0.014 ), vec3( 0.42, 0.04, 0.042 ), fib );
  wet = 0.5;
  bool head = y > yH - 0.012, neck = y > yN && ! head, chest = y > yD + 0.02 && y <= yN, belly = y > yR + 0.02 && y <= yD + 0.02, pelvis = y <= yR + 0.02;
  if ( chest && d > 0.03 ) {
    // the lungs, spongy and mottled
    float sp = hvN( p * 260.0 ) * 0.6 + hvN( p * 90.0 ) * 0.4;
    c = mix( vec3( 0.6, 0.26, 0.25 ), vec3( 0.28, 0.05, 0.06 ), smoothstep( 0.35, 0.8, sp ) ); wet = 0.35;
    // the heart, low in the front
    vec2 hq = ( vec2( d, y ) - vec2( 0.085, mix( yD, yN, 0.3 ) ) ) / vec2( 0.055, 0.065 );
    float hr = length( hq );
    if ( hr < 1.0 ) {
      c = mix( vec3( 0.33, 0.03, 0.035 ), vec3( 0.52, 0.07, 0.065 ), fib );
      float ch = max( 1.0 - smoothstep( 0.4, 0.5, length( hq - vec2( -0.2, 0.15 ) ) ), 1.0 - smoothstep( 0.3, 0.4, length( hq - vec2( 0.3, -0.25 ) ) ) );
      c = mix( c, vec3( 0.06, 0.0, 0.003 ), ch );
      c = mix( c, vec3( 0.75, 0.62, 0.3 ), ( 1.0 - smoothstep( 0.0, 0.08, abs( hq.x * 0.6 + hq.y - 0.1 ) ) ) * 0.6 );
      wet = 0.85;
    }
  }
  // the aorta up the front of the spine (chest and belly)
  if ( ( chest || belly ) && d > 0.02 && d < 0.052 && y < mix( yD, yN, 0.75 ) ) {
    float t = abs( d - 0.036 );
    c = t < 0.016 ? ( t < 0.011 ? vec3( 0.07, 0.0, 0.002 ) : vec3( 0.5, 0.12, 0.11 ) ) : c; wet = 0.8;
  }
  if ( belly && d > 0.055 ) {
    if ( y > yD - 0.11 ) { c = mix( vec3( 0.23, 0.035, 0.03 ), vec3( 0.34, 0.06, 0.05 ), hvN( p * 70.0 ) ); wet = 0.85; }
    else {
      float coil = abs( sin( hvN( p * 55.0 ) * 9.0 + hvN( p * 23.0 + 3.0 ) * 5.0 ) );
      c = mix( vec3( 0.45, 0.14, 0.11 ), vec3( 0.7, 0.36, 0.3 ), smoothstep( 0.15, 0.6, coil ) ) * ( 0.6 + 0.4 * smoothstep( 0.0, 0.25, coil ) ); wet = 0.75;
    }
  }
  // the diaphragm between them
  if ( d > 0.02 && abs( y - yD - 0.02 - 0.03 * smoothstep( 0.02, 0.12, d ) ) < 0.0045 ) c = vec3( 0.42, 0.06, 0.06 );
  if ( pelvis ) {
    // the bladder low in front, the pubic bone under it, the sacrum at the back
    vec2 bq = ( vec2( d, y ) - vec2( 0.1, yR - 0.035 ) ) / vec2( 0.04, 0.035 );
    if ( length( bq ) < 1.0 ) { c = mix( vec3( 0.72, 0.6, 0.42 ), vec3( 0.55, 0.38, 0.28 ), hvN( p * 80.0 ) ); wet = 0.7; }
    vec2 pq = ( vec2( d, y ) - vec2( 0.13, yR - 0.095 ) ) / vec2( 0.018, 0.03 );
    if ( length( pq ) < 1.0 ) c = hvBone( p );
    else if ( d > 0.05 && length( bq ) > 1.0 ) { float coil = abs( sin( hvN( p * 55.0 ) * 9.0 + hvN( p * 23.0 ) * 5.0 ) ); c = mix( vec3( 0.42, 0.13, 0.1 ), vec3( 0.66, 0.33, 0.27 ), smoothstep( 0.15, 0.6, coil ) ); wet = 0.7; }
    if ( d < 0.02 && d > -0.05 && y > yR - 0.14 ) c = mix( c, hvBone( p ), ( 1.0 - smoothstep( 0.012, 0.016, abs( d + 0.012 ) ) ) );
  }
  if ( neck ) {
    // the windpipe in front, pale and ringed, the gullet behind it
    float t = abs( d - 0.06 );
    if ( t < 0.018 ) { c = t < 0.012 ? vec3( 0.12, 0.02, 0.025 ) : mix( vec3( 0.78, 0.6, 0.55 ), vec3( 0.62, 0.42, 0.38 ), step( 0.5, fract( y * 90.0 ) ) ); wet = 0.6; }
    else if ( d > 0.022 && d < 0.04 ) { c = vec3( 0.55, 0.2, 0.18 ); wet = 0.7; }
  }
  if ( head ) {
    // the brain in its skull (the cerebrum, a pale band in it, the cerebellum behind and below), the face's cavities
    vec2 bc = vec2( 0.012, yH + 0.088 ), br = vec2( 0.088, max( 0.05, yT - 0.012 - bc.y ) );
    vec2 q = ( vec2( d, y ) - bc ) / br; float r = length( q );
    vec2 cq = ( vec2( d, y ) - vec2( -0.045, yH + 0.018 ) ) / vec2( 0.036, 0.024 ); float cr = length( cq );
    if ( r < 1.0 ) {
      float fold = abs( sin( hvN( p * 70.0 ) * 11.0 + q.x * 6.0 ) );
      c = mix( vec3( 0.66, 0.46, 0.43 ), vec3( 0.44, 0.24, 0.24 ), 1.0 - smoothstep( 0.0, 0.35, fold ) );
      c = mix( c, vec3( 0.85, 0.78, 0.7 ), ( 1.0 - smoothstep( 0.0, 0.06, abs( length( ( q - vec2( 0.0, -0.25 ) ) * vec2( 1.0, 1.8 ) ) - 0.45 ) ) ) * step( q.y, 0.0 ) * 0.8 );
      wet = 0.7;
    } else if ( r < 1.0 + 0.09 / max( br.x, 0.05 ) ) { c = hvBone( p ); wet = 0.35; }
    if ( cr < 1.0 ) { float fold = abs( sin( q.y * 60.0 + hvN( p * 120.0 ) * 4.0 ) ); c = mix( vec3( 0.6, 0.4, 0.38 ), vec3( 0.38, 0.18, 0.18 ), 1.0 - smoothstep( 0.0, 0.4, fold ) ); wet = 0.7; }
    // the brain stem down into the cord
    if ( y < bc.y && abs( d + 0.01 ) < 0.013 && r > 0.8 && cr > 1.0 && y > yH - 0.02 ) c = vec3( 0.8, 0.7, 0.62 );
    // below and in front of the brain: the nose's cavities, the palate, the tongue, the teeth, the jaw
    if ( d > 0.035 && y < bc.y - br.y * 0.35 ) {
      if ( y > yM + 0.014 ) { c = mix( vec3( 0.05, 0.005, 0.008 ), vec3( 0.42, 0.12, 0.12 ), smoothstep( 0.45, 0.7, hvN( p * 160.0 ) ) ); }
      if ( abs( y - yM - 0.014 ) < 0.004 ) c = hvBone( p );
      vec2 tq = ( vec2( f, y ) - vec2( fM - 0.055, yM - 0.006 ) ) / vec2( 0.045, 0.017 );
      if ( length( tq ) < 1.0 ) { c = mix( vec3( 0.62, 0.22, 0.22 ), vec3( 0.75, 0.32, 0.3 ), hvN( p * 200.0 ) ); wet = 0.8; }
      if ( f > fM - 0.022 && f < fM - 0.006 && abs( y - yM ) < 0.013 && abs( y - yM ) > 0.0015 ) { c = vec3( 0.9, 0.87, 0.78 ); wet = 0.6; }
      if ( f > fM - 0.035 && y < yM - 0.014 && y > yC + 0.004 && rim > 0.006 ) c = hvBone( p );
    }
  }
  // the spine: the vertebrae's bodies with their discs, the cord behind them, the spines of bone behind that
  if ( y > yR - 0.1 && y < yH + 0.012 ) {
    float w = y > yN ? 0.012 : 0.018, per = y > yN ? 0.022 : 0.032;
    float v = fract( ( y - yR ) / per );
    if ( abs( d ) < w ) { c = v < 0.18 ? vec3( 0.6, 0.6, 0.64 ) : hvBone( p ); wet = 0.4; }
    else if ( d < -w && d > -w - 0.016 ) { float cd = abs( d + w + 0.008 ); c = cd < 0.0055 ? vec3( 0.86, 0.76, 0.68 ) : vec3( 0.22, 0.02, 0.025 ); wet = 0.6; }
    else if ( d < -w - 0.016 && d > -w - 0.06 && y < yN + 0.02 ) { float k = ( -d - w - 0.016 ) / 0.044; if ( abs( v - 0.45 ) * 2.0 < 0.8 * ( 1.0 - k ) ) c = hvBone( p ); }
  }
  // the fat under the skin and the skin, round the edge
  float fatW = head ? 0.006 : 0.016;
  c = mix( c, vec3( 0.74, 0.6, 0.26 ) * ( 0.75 + 0.3 * hvN( p * 260.0 ) ), 1.0 - smoothstep( fatW * 0.6, fatW, rim ) );
  c = mix( c, uHSkin, 1.0 - smoothstep( 0.0015, 0.0045, rim ) );
  // blood welling over it
  float well = smoothstep( 0.0, 1.0, uHBleed * 1.25 - hvF( p * 30.0 ) * 0.9 );
  c = mix( c, vec3( 0.11, 0.003, 0.005 ), well * 0.85 );
  wet = max( wet, 0.45 + 0.5 * well );
  return c;
}`;

function capMaterial(U, kind, tint, bias) {
  // (drawn a little nearer than the same faces' own inside: a double-sided garment's lining would hide the cut)
  const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const extra = { uHKind: { value: kind }, uHTint: { value: tint.clone() }, uHBias: { value: bias } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, extra);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT).replace('#include <project_vertex>', VERT_MAIN + '#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG + CAP)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float hd = hvDist();
        if ( hd * uHSide < 0.0 ) discard;
        // the ray from the eye (in the skeleton's world) through this inner wall meets the plane at Q
        vec3 rd = normalize( vHW - uHCam );
        float den = dot( uHP.xyz, rd );
        float tq = abs( den ) > 1e-4 ? ( uHP.w - dot( uHP.xyz, uHCam ) ) / den : -1.0;
        float tb = length( vHW - uHCam );
        // (a back face not seen through the cut, a sleeve's inside seen down it: not the cut's)
        if ( ! ( tq > 0.0 && tq < tb ) ) discard;
        vec3 Q = uHCam + rd * tq;
        vec3 Yv = vec3( 0.0, 1.0, 0.0 );
        float wet;
        vec3 capC;
        // (a garment's cut: a band of its cloth, soaked, round the edge, and him inside it)
        float cloth = uHKind > 0.5 ? 0.007 : 0.0;
        capC = hvSection( dot( Q - uHO, uHF ), Q.y, max( 0.0, abs( hd ) - cloth ), wet );
        if ( abs( hd ) < cloth ) { wet = 0.5; capC = mix( uHTint * 0.3, vec3( 0.09, 0.006, 0.008 ), 0.65 ) * ( 0.75 + 0.25 * hvF( Q.yz * 300.0 ) ); }
        // lit as a flat, wet, slightly lumpy surface facing out of this half
        vec3 N = normalize( uHP.xyz * -uHSide + ( uHF * ( hvN( Q.zy * 90.0 ) - 0.5 ) + Yv * ( hvN( Q.yz * 90.0 + 5.0 ) - 0.5 ) ) * 0.35 );
        vec3 V = -rd;
        float dif = 0.32 + 0.68 * max( dot( N, uHLight ), 0.0 );
        float spec = pow( max( dot( reflect( -uHLight, N ), V ), 0.0 ), 60.0 ) * wet * 1.6 + pow( 1.0 - max( dot( N, V ), 0.0 ), 4.0 ) * 0.08 * wet;
        vec3 capOut = capC * dif + vec3( 1.0, 0.9, 0.85 ) * spec;`)
      .replace('#include <opaque_fragment>', 'outgoingLight = capOut;\n#include <opaque_fragment>');
    if (!sh.fragmentShader.includes('capOut;')) console.warn('halves: cap shader not patched');
  };
  m.customProgramCacheKey = () => 'halvesCap';
  return m;
}
function capDepth(U, packing) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: packing, side: THREE.BackSide });
  d.onBeforeCompile = (sh) => patchClip(sh, U, false);
  d.customProgramCacheKey = () => 'halvesCapDepth' + packing;
  return d;
}

export class Halves {
  // f: the fighter (his model ch); scene: where the halves' groups go
  constructor(scene, f) {
    this.scene = scene; this.f = f; this.ch = f.ch;
    this.S = sharedUniforms();
    this.H = [+1, -1].map((side) => {
      const c = new THREE.Group(); c.name = side > 0 ? 'halfL' : 'halfR'; c.matrixAutoUpdate = false;
      return { side, U: halfUniforms(this.S, side), c, th: 0, w: 0, sh: 0, vs: 0, rest: 1.4, down: false, bounces: 0, P: new THREE.Vector3(), ax: new THREE.Vector3(), L: new THREE.Vector3() };
    });
    this.cut = false; this.on = false;
    this.mats = []; this.copies = []; this.caps = []; this.items = []; this.carried = [];
    this._build();
  }

  _build() {
    const ch = this.ch;
    for (const mesh of Object.values(ch.meshes)) {
      if (!mesh.isSkinnedMesh) continue;
      const g = mesh.geometry, mt = mesh.material;
      this.items.push({ mesh, vis: mesh.visible });
      const solid = !mt.transparent && !(mt.alphaTest > 0);
      for (const h of this.H) {
        const m = clipMaterial(mt, h.U, solid);
        const copy = new THREE.SkinnedMesh(g, m);
        copy.name = mesh.name + (h.side > 0 ? '_hL' : '_hR');
        copy.bindMode = THREE.DetachedBindMode; copy.bind(ch.skeleton, new THREE.Matrix4()); copy.bindMatrixInverse.identity();
        copy.renderOrder = mesh.renderOrder; copy.castShadow = mesh.castShadow; copy.receiveShadow = mesh.receiveShadow; copy.frustumCulled = false;
        copy.userData = { ...mesh.userData, noGTAO: true };
        copy.customDepthMaterial = clipDepth(h.U, THREE.BasicDepthPacking, mt);
        m.userData.splitDepth = clipDepth(h.U, THREE.RGBADepthPacking, mt);
        this.mats.push(m, copy.customDepthMaterial, m.userData.splitDepth);
        h.c.add(copy); this.copies.push(copy);
        if (!solid) continue;
        // the cut seen into the half: the body's section, or a garment's cut edge (a little behind the body's)
        const skin = /body|skin|head/i.test(mesh.name) || mt.userData?.skin;
        const tint = mt.color ? mt.color.clone() : new THREE.Color(0.5, 0.5, 0.5);
        const cm = capMaterial(h.U, skin ? 0 : 1, tint, skin ? 0 : /vest|jacket|coat/i.test(mesh.name) ? 0.004 : 0.002);
        cm.userData.splitDepth = capDepth(h.U, THREE.RGBADepthPacking);
        const cap = new THREE.SkinnedMesh(g, cm);
        cap.name = mesh.name + (h.side > 0 ? '_capL' : '_capR');
        cap.bindMode = THREE.DetachedBindMode; cap.bind(ch.skeleton, new THREE.Matrix4()); cap.bindMatrixInverse.identity();
        cap.castShadow = false; cap.receiveShadow = false; cap.frustumCulled = false; cap.renderOrder = mesh.renderOrder; cap.userData.noGTAO = true;
        h.c.add(cap); this.caps.push(cap);
        this.mats.push(cm, cm.userData.splitDepth);
      }
    }
  }

  // from now on he is drawn as the two halves (whole: the left half draws all of him). Done as the move starts, so
  // that the shaders are built behind its moment of black
  begin() {
    if (this.on) return;
    this.on = true;
    for (const it of this.items) it.mesh.visible = false;
    for (const h of this.H) { h.c.matrix.identity(); this.scene.add(h.c); }
    this.S.uHP.value.set(1, 0, 0, -1000);
    // the accessories (glasses, a headset, a watch...): on holders that follow their bones, in the half they are on
    // (decided at the cut; until then the left half carries them all)
    const ch = this.ch;
    this.carried = [];
    for (const b of ch.skeleton.bones) for (const o of [...b.children]) {
      if (o.isBone) continue;
      const holder = new THREE.Group(); holder.matrixAutoUpdate = false;
      b.remove(o); holder.add(o); this.H[0].c.add(holder);
      const mats = [];
      o.traverse((x) => { if (x.isMesh) { const om = x.material; x.material = clipMaterial(om, this.H[0].U, false); mats.push([x, om]); this.mats.push(x.material); } });
      this.carried.push({ o, b, holder, mats, twin: null });
    }
    this.sync();
  }

  restore() {
    if (!this.on) return;
    this.on = false;
    for (const it of this.items) it.mesh.visible = it.vis;
    for (const c of this.carried) {
      c.holder.remove(c.o); c.b.add(c.o);
      for (const [x, om] of c.mats) x.material = om;
      if (c.twin) { c.twin.holder.parent?.remove(c.twin.holder); c.twin.o.traverse((x) => { if (x.isMesh) x.material.dispose(); }); }
    }
    this.carried = [];
    for (const h of this.H) this.scene.remove(h.c);
    for (const m of this.mats) m.dispose?.();
    this.mats = [];
  }

  // ------------------------------------------------------------------ the cut
  // through his middle as he stands now: the plane through his root, normal to his left. Called with the body as last
  // drawn (the skeleton frozen from now on)
  doCut() {
    const ch = this.ch, B = ch.bones, f = this.f;
    ch.group.updateMatrixWorld(true);
    const y = f.yaw, fw = new THREE.Vector3(Math.sin(y), 0, Math.cos(y)), left = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
    const wp = (n) => B[n].getWorldPosition(new THREE.Vector3());
    const O = wp('root');
    this.n0 = left.clone(); this.fw = fw.clone(); this.O = O.clone();
    this.S.uHP.value.set(left.x, left.y, left.z, left.dot(O));
    this.S.uHO.value.copy(O); this.S.uHF.value.copy(fw);
    // the section's landmarks: the spine's line up through him (height, forward), and the heights that part him
    const F = (p) => p.clone().sub(O).dot(fw);
    const top = wp('head').add(new THREE.Vector3(0, 0.16, 0));
    const sp = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'head'].map((n) => (B[n] ? wp(n) : null)).filter(Boolean);
    while (sp.length < 8) sp.push(top.clone());
    sp.sort((a, b) => a.y - b.y);
    sp.forEach((p, i) => this.S.uHSpine.value[i].set(p.y, F(p)));
    const mouth = B.oris01 ? wp('oris01') : wp('head').add(new THREE.Vector3(0, -0.03, 0.11).applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion())));
    const chin = B.special04 ? wp('special04') : mouth.clone().add(new THREE.Vector3(0, -0.05, 0));
    this.S.uHLm.value.set(O.y, wp('spine02').y, wp('neck01').y, wp('head').y);
    this.S.uHLm2.value.set(mouth.y, F(mouth), f.ch.rest?.head ? wp('head').y + (this.headTop(ch) - ch.rest.head.head.y) : top.y, chin.y - 0.02);
    // which half each accessory goes with (both, and cut, if it lies across the plane)
    for (const c of this.carried) {
      c.holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(c.o);
      let a = Infinity, b = -Infinity;
      for (let k = 0; k < 8; k++) { const d = left.dot(new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z)) - left.dot(O); a = Math.min(a, d); b = Math.max(b, d); }
      if (a >= -0.002) continue;
      if (b <= 0.002) { this._move(c, this.H[1]); continue; }
      // across: a twin in the right half
      const o2 = c.o.clone(true), holder = new THREE.Group(); holder.matrixAutoUpdate = false; holder.add(o2); this.H[1].c.add(holder);
      o2.traverse((x) => { if (x.isMesh) { x.material = clipMaterial(c.mats.find(([m]) => m.name === x.name)?.[1] || x.material, this.H[1].U, false); this.mats.push(x.material); } });
      c.twin = { o: o2, holder };
    }
    // each half pivots on the outer edge of its foot, falling to its own side
    for (const h of this.H) {
      const s = h.side > 0 ? 'L' : 'R';
      h.L.copy(left).multiplyScalar(h.side);
      const foot = wp('foot.' + s);
      h.P.set(foot.x, 0, foot.z).addScaledVector(h.L, 0.05);
      // (the axis: up × out, so a turn about it takes his top outwards)
      h.ax.crossVectors(new THREE.Vector3(0, 1, 0), h.L).normalize();
      // the points of the half that it comes to rest on, and how far it turns before one of them meets the floor
      const pts = [];
      for (const n of [`upperarm01.${s}`, `lowerarm01.${s}`, `wrist.${s}`, `finger3-3.${s}`, `upperleg01.${s}`, `lowerleg01.${s}`, `foot.${s}`, 'head', 'spine02', 'spine04', 'neck01']) {
        if (!B[n]) continue;
        const p = wp(n), r = n === 'head' ? 0.09 : n.startsWith('spine') ? 0.14 : n.startsWith('upperleg') ? 0.08 : 0.045;
        pts.push([p, n === 'head' || n.startsWith('spine') || n.startsWith('neck') ? r * 0.85 : r]);
      }
      const q = new THREE.Quaternion(), v = new THREE.Vector3();
      let rest = Math.PI / 2;
      for (let th = 0.2; th <= Math.PI / 2 + 0.2; th += 0.01) {
        q.setFromAxisAngle(h.ax, th);
        let low = Infinity;
        for (const [p, r] of pts) { v.copy(p).sub(h.P).applyQuaternion(q); low = Math.min(low, v.y - r * 0.6); }
        if (low <= 0) { rest = th; break; }
      }
      h.rest = rest; h.pts = pts;
      h.th = 0; h.w = 0; h.sh = 0; h.vs = 0; h.down = false; h.bounces = 0;
    }
    this.cut = true;
  }
  headTop(ch) {
    // (the top of his head in the rest pose: the highest vertex of the head's part)
    if (this._top != null) return this._top;
    let top = ch.rest.head.head.y + 0.15;
    const m = ch.meshes.head || ch.meshes.body;
    if (m) { const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) top = Math.max(top, P.getY(i)); }
    return (this._top = top);
  }
  _move(c, h) {
    c.holder.parent?.remove(c.holder); h.c.add(c.holder);
    for (const [x, om] of c.mats) { x.material.dispose(); x.material = clipMaterial(om, h.U, false); this.mats.push(x.material); }
  }

  // the halves pushed apart (rad/s about their feet, m/s outwards)
  push(w, v = 0) { for (const h of this.H) { h.w = Math.max(h.w, w); h.vs = Math.max(h.vs, v); } }

  // one simulation frame: each half topples about its foot (faster the further over), meets the floor, bounces, settles
  step() {
    if (!this.cut) return;
    for (const h of this.H) {
      h.th0 = h.th; h.sh0 = h.sh;
      if (h.done) continue;
      if (h.w > 0 || h.th > 0) h.w += 9.0 * Math.sin(Math.max(0.02, h.th)) * DT;
      h.th += h.w * DT;
      h.sh += h.vs * DT; h.vs *= h.down ? 0.8 : 0.985;
      if (h.th >= h.rest) {
        h.th = h.rest;
        if (!h.down) { h.down = true; h.hit = true; }
        if (h.w > 0.6) { h.w = -h.w * 0.22; h.bounces++; } else { h.w = 0; if (Math.abs(h.vs) < 0.02) h.done = true; }
      }
    }
    for (const h of this.H) this.place(h, h.th, h.sh, h.M || (h.M = new THREE.Matrix4()));
  }
  // a half's transform for its turn th and its slide sh: about the outer edge of its foot, then outwards
  place(h, th, sh, out) {
    const R = _R.makeRotationAxis(h.ax, th);
    out.makeTranslation(h.P.x + h.L.x * sh, h.P.y, h.P.z + h.L.z * sh).multiply(R).multiply(_T.makeTranslation(-h.P.x, -h.P.y, -h.P.z));
    return out;
  }

  // per drawn frame: the halves' groups (alpha: between the last two simulation frames), the eye and the light
  sync(alpha = 1, camera = null, light = null) {
    if (!this.on) return;
    for (const h of this.H) {
      const th = h.th0 != null ? h.th0 + (h.th - h.th0) * alpha : h.th, sh = h.sh0 != null ? h.sh0 + (h.sh - h.sh0) * alpha : h.sh;
      const C = h.c.matrix;
      if (!this.cut || th === 0 && sh === 0) C.identity();
      else this.place(h, th, sh, C);
      h.c.matrixWorldNeedsUpdate = true; h.c.updateMatrixWorld(true);
      h.U.uHCi.value.copy(C).invert();
      if (camera) h.U.uHCam.value.copy(camera.position).applyMatrix4(h.U.uHCi.value);
      if (light) h.U.uHLight.value.copy(light).transformDirection(h.U.uHCi.value);
    }
    for (const c of this.carried) {
      c.holder.matrix.copy(c.b.matrixWorld); c.holder.matrixWorldNeedsUpdate = true;
      if (c.twin) { c.twin.holder.matrix.copy(c.b.matrixWorld); c.twin.holder.matrixWorldNeedsUpdate = true; }
    }
    for (const h of this.H) h.c.updateMatrixWorld(true);
  }
  // a point of the body as cut (world, then) to where its half has it now
  carry(p, side, out = new THREE.Vector3()) { const h = this.H[side > 0 ? 0 : 1]; return out.copy(p).applyMatrix4(h.M || h.c.matrix); }
  // (a point of his left or right side, 'L' / 'R', carried with its half: his feet's shadows)
  carryPoint(p, s) { if (this.cut) p.applyMatrix4(this.H[s === 'L' ? 0 : 1].c.matrix); return p; }
  setLine(line, zip, bleed) { this.S.uHLine.value = line; this.S.uHZip.value = zip; this.S.uHBleed.value = bleed; }
}
