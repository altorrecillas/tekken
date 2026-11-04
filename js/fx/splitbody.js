// A fighter cut in two at the waist (the PUÑETALITY, js/fight/fatality.js): drawn, and then simulated, as two halves.
//
// Drawing. Every part of the body that crosses the waist (the skin, the trousers, the shirt, the coat) is drawn twice
// from the one skeleton: the original mesh keeps what lies below the cut plane, a copy keeps what lies above it. The
// copies hang from a group of their own whose transform (C) moves the upper half away from where the skeleton has it.
// The arms, the neck and the head always belong to the upper half whatever their height (a hand hanging by the thigh is
// not cut off with the legs): a per-vertex weight of those bones (aUp) decides it. Parts wholly above (the head, the
// hair) are only drawn by a copy, parts wholly below (the shoes) only by the original. Looking into either half, the
// inside of its far wall (a back face) is drawn as the cut itself: the ray through it meets the cut plane, and the
// cross-section is painted there (skin, fat, muscle, the bowels in front, the spine at the back, welling blood), at the
// plane's depth. The thin line of the cut and the blood running from it are painted on the outside of both halves.
//
// Simulation (once cut). The halves are two Verlet bodies like the knock-out ragdoll (js/fight/ragdoll.js): particles on
// the joints, rigid clusters for the trunks, sticks for the limbs, a hinge for the knees. Each stays pinned (as it was
// cut) until released; the upper half then rests on the lower one's cut, slides off down its slope and falls. The
// skeleton is rebuilt from the particles (the legs and the lower trunk directly; the arms in the upper half's own frame,
// which the copies' group carries to where it really is).
import * as THREE from 'three';

const G = 9.81, DT = 1 / 60;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

function basis(x, y, out) {
  const X = _a.copy(x).normalize();
  const Y = _b.copy(y).addScaledVector(X, -_b.copy(y).dot(X)).normalize();
  const Z = _c.crossVectors(X, Y);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}

// bones whose every vertex goes with the upper half, wherever it is: the shoulders down to the fingertips, the neck up
const UP_ROOTS = ['clavicle.L', 'clavicle.R', 'neck01'];

// joints of each half: [bone, offset (rest space, turned with the bone), radius, mass]
const UPJ = {
  belly: ['spine03', [0, 0.01, 0.02], 0.12, 2], chest: ['spine01', [0, 0.02, 0.02], 0.13, 3],
  neck: ['neck01', [0, 0, 0], 0.06, 1], head: ['head', [0, 0.1, 0.02], 0.1, 1.5],
  shL: ['upperarm01.L', [0, 0, 0], 0.06, 1], shR: ['upperarm01.R', [0, 0, 0], 0.06, 1],
  elL: ['lowerarm01.L', [0, 0, 0], 0.05, 0.7], elR: ['lowerarm01.R', [0, 0, 0], 0.05, 0.7],
  wrL: ['wrist.L', [0, 0, 0], 0.045, 0.5], wrR: ['wrist.R', [0, 0, 0], 0.045, 0.5],
};
const LOJ = {
  pelvis: ['root', [0, 0, 0], 0.12, 3], hipL: ['upperleg01.L', [0, 0, 0], 0.08, 1.5], hipR: ['upperleg01.R', [0, 0, 0], 0.08, 1.5],
  knL: ['lowerleg01.L', [0, 0, 0], 0.06, 1], knR: ['lowerleg01.R', [0, 0, 0], 0.06, 1],
  anL: ['foot.L', [0, 0, 0], 0.05, 0.7], anR: ['foot.R', [0, 0, 0], 0.05, 0.7],
  toL: ['foot.L', [0, -0.05, 0.14], 0.035, 0.3], toR: ['foot.R', [0, -0.05, 0.14], 0.035, 0.3],
};
// the cut's own points on each half: its centre and four on its rim (front, back, left, right), what the upper half
// rests and slides on
const RIM = [['F', 0, 0.8], ['B', 0, -0.8], ['L', 0.8, 0], ['R', -0.8, 0]];

const NOISE = `
float spH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float spN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( spH( i ), spH( i + vec2( 1, 0 ) ), f.x ), mix( spH( i + vec2( 0, 1 ) ), spH( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float spF( vec2 p ) { return 0.5 * spN( p ) + 0.3 * spN( p * 2.13 + 7.1 ) + 0.2 * spN( p * 4.37 + 3.3 ); }`;

// uniforms shared by the half's materials. plane: xyz the cut's normal (towards the head), w its offset; side +1 for
// the copies (above the cut), -1 for the originals; line: the thin red line (0..1); bleed: how far the blood has run
function halfUniforms(side) {
  return {
    uSplitPlane: { value: new THREE.Vector4(0, 1, 0, 100) }, uSplitSide: { value: side },
    uSplitLine: { value: 0 }, uSplitBleed: { value: 0 },
    uCapC: { value: new THREE.Vector3() }, uCapU: { value: new THREE.Vector3(1, 0, 0) }, uCapV: { value: new THREE.Vector3(0, 0, 1) },
    uCapR: { value: new THREE.Vector2(0.15, 0.11) }, uCapLight: { value: new THREE.Vector3(0.3, 1, 0.4).normalize() },
  };
}

const VERT_DECL = 'attribute float aUp; varying float vUp; varying vec3 vSplitW;\n';
const FRAG_DECL = `varying float vUp; varying vec3 vSplitW;
uniform vec4 uSplitPlane; uniform float uSplitSide, uSplitLine, uSplitBleed;
uniform vec3 uCapC, uCapU, uCapV, uCapLight; uniform vec2 uCapR;${NOISE}
float splitDist() { return dot( uSplitPlane.xyz, vSplitW ) - uSplitPlane.w; }
void splitClip() {
  float sd = splitDist();
  bool up = vUp > 0.5;
  if ( uSplitSide > 0.0 ) { if ( sd < 0.0 && ! up ) discard; } else { if ( sd >= 0.0 || up ) discard; }
}
// the blood on the outside: the thin line of the cut, a soaked band along it and, on the lower half, runs down from it
float splitStain() {
  if ( vUp > 0.5 ) return 0.0;
  float sd = splitDist(), d = abs( sd );
  float line = ( 1.0 - smoothstep( 0.002, 0.0055, d ) ) * uSplitLine;
  vec3 r = vSplitW - uCapC;
  float th = atan( dot( r, uCapV ), dot( r, uCapU ) );
  float band = ( 1.0 - smoothstep( 0.002 + 0.016 * uSplitBleed, 0.006 + 0.022 * uSplitBleed, d ) ) * smoothstep( 0.0, 0.15, uSplitBleed );
  float runs = 0.0;
  if ( uSplitSide < 0.0 ) {
    // runs of different lengths, some long, most short, a little wavy
    float k = th * 9.0 + spN( vec2( -sd * 30.0, th * 3.0 ) ) * 0.6;
    float cell = floor( k ), f = fract( k );
    float len = uSplitBleed * ( 0.02 + 0.28 * pow( spH( vec2( cell, 3.1 ) ), 3.0 ) );
    float w = 0.12 + 0.25 * spH( vec2( cell, 7.7 ) );
    float across = 1.0 - smoothstep( w * 0.6, w, abs( f - 0.5 ) * 2.0 * ( 0.7 + 0.6 * ( -sd ) / max( len, 1e-3 ) ) );
    runs = across * ( 1.0 - smoothstep( len * 0.85, len, -sd ) ) * step( 0.0, -sd );
  }
  return clamp( max( line * 1.2, max( band, runs ) ), 0.0, 1.0 );
}`;
const BLOOD_RGB = 'vec3( 0.13, 0.004, 0.006 )';

// one of the fighter's materials, split: the copy draws the side `side` of the cut
function splitMaterial(mat, U) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  // (a clone leaves the defines behind: the beard's shells need theirs, USE_UV)
  if (mat.defines) m.defines = { ...mat.defines };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', 'vUp = aUp; vSplitW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tsplitClip();\n\tfloat spStain = splitStain();')
      .replace('#include <color_fragment>', `#include <color_fragment>\n\tdiffuseColor.rgb = mix( diffuseColor.rgb, ${BLOOD_RGB}, spStain * 0.96 );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.14, spStain );');
    if (!sh.fragmentShader.includes('splitClip();') || !sh.vertexShader.includes('vSplitW = ')) console.warn('split body: shader not patched', mat.type);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|split';
  return m;
}

// the depth (shadow map, depth of field) of a half: the same cut. packing: the depth of field's
function splitDepth(U, packing, src) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: packing });
  if (src?.userData?.clothSway) d.userData.clothSway = src.userData.clothSway;
  d.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', 'vUp = aUp; vSplitW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tsplitClip();');
  };
  d.customProgramCacheKey = () => 'splitDepth' + packing;
  return d;
}

// the cut seen into a half: kind 0 the body (skin, fat, muscle, bowels, spine), 1 a garment's thickness (its colour)
const CAP_FRAG = `
uniform float uCapKind, uCapBias; uniform vec3 uCapTint;
vec3 capColour( vec2 p, out float wet ) {
  vec2 e = p / uCapR; float r = length( e ); float th = atan( e.y, e.x );
  // (a garment's cut edge: a thin band of cloth, soaked dark with blood)
  if ( uCapKind > 0.5 ) { wet = 0.5; return mix( uCapTint * 0.3, vec3( 0.09, 0.006, 0.008 ), 0.7 ) * ( 0.75 + 0.25 * spF( p * 300.0 ) ); }
  // muscle: dark red, its fibres running round the body
  float fib = spF( vec2( th * 26.0, r * 9.0 ) ) * 0.7 + spF( p * 140.0 ) * 0.3;
  vec3 c = mix( vec3( 0.16, 0.008, 0.01 ), vec3( 0.36, 0.03, 0.03 ), fib );
  // the belly's wall and the fat under the skin, then the skin itself
  c = mix( c, vec3( 0.42, 0.3, 0.12 ) * ( 0.75 + 0.3 * spN( p * 260.0 ) ), smoothstep( 0.8, 0.85, r ) * ( 1.0 - smoothstep( 0.95, 0.985, r ) ) );
  c = mix( c, vec3( 0.55, 0.32, 0.25 ), smoothstep( 0.975, 1.0, r ) );
  // the bowels: pale pink coils in front
  vec2 g = ( e - vec2( 0.0, 0.2 ) ) * vec2( 1.0, 1.3 );
  float gut = 1.0 - smoothstep( 0.52, 0.6, length( g ) );
  float coil = abs( sin( spN( p * 55.0 ) * 9.0 + spN( p * 23.0 + 3.0 ) * 5.0 ) );
  vec3 gc = mix( vec3( 0.42, 0.13, 0.1 ), vec3( 0.62, 0.3, 0.25 ), smoothstep( 0.15, 0.6, coil ) ) * ( 0.6 + 0.4 * smoothstep( 0.0, 0.25, coil ) );
  c = mix( c, gc, gut );
  // the spine at the back: the vertebra's body, white bone, its canal and the two wings of bone beside it
  vec2 sp = p - vec2( 0.0, -uCapR.y * 0.6 );
  float vb = 1.0 - smoothstep( 0.0165, 0.0185, length( sp * vec2( 1.0, 1.2 ) ) );
  float wings = ( 1.0 - smoothstep( 0.005, 0.007, abs( sp.y + 0.02 ) ) ) * ( 1.0 - smoothstep( 0.03, 0.034, abs( sp.x ) ) );
  vec3 bone = vec3( 0.62, 0.56, 0.44 ) * ( 0.85 + 0.2 * spN( p * 400.0 ) );
  c = mix( c, bone, max( vb, wings ) );
  float canal = 1.0 - smoothstep( 0.006, 0.0075, length( sp - vec2( 0.0, -0.025 ) ) );
  c = mix( c, vec3( 0.06, 0.008, 0.01 ), canal );
  // blood welling up over it, the lower half's cut filling (the upper one's drips off)
  float well = smoothstep( 0.0, 1.0, uSplitBleed * ( uSplitSide < 0.0 ? 1.4 : 0.8 ) - spF( p * 30.0 ) * 0.9 + ( uSplitSide < 0.0 ? 0.2 * ( 1.0 - r ) : 0.0 ) );
  c = mix( c, vec3( 0.11, 0.003, 0.005 ), well * 0.92 );
  wet = 0.45 + 0.5 * well;
  return c;
}`;

function capMaterial(U, kind, tint, bias) {
  const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0xffffff });
  const extra = { uCapKind: { value: kind }, uCapTint: { value: tint.clone() }, uCapBias: { value: bias } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, extra);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', 'vUp = aUp; vSplitW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL + CAP_FRAG)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        splitClip();
        if ( vUp > 0.5 ) discard;
        // the ray from the eye through this inner wall meets the cut plane at Q: the cross-section is painted with what
        // is there (the wall itself is only seen through the cut: elsewhere the body's own outside is nearer)
        vec3 rd = normalize( vSplitW - cameraPosition );
        float den = dot( uSplitPlane.xyz, rd );
        float tq = abs( den ) > 1e-4 ? ( uSplitPlane.w - dot( uSplitPlane.xyz, cameraPosition ) ) / den : -1.0;
        float tb = length( vSplitW - cameraPosition );
        vec3 Q = ( tq > 0.0 && tq < tb ) ? cameraPosition + rd * tq : vSplitW;
        vec3 dq = Q - uCapC;
        float wet;
        vec3 capC = capColour( vec2( dot( dq, uCapU ), dot( dq, uCapV ) ), wet );
        // lit as a flat, wet, slightly lumpy surface facing out of this half
        vec3 N = normalize( uSplitPlane.xyz * -uSplitSide + ( uCapU * ( spN( Q.xz * 90.0 ) - 0.5 ) + uCapV * ( spN( Q.zx * 90.0 + 5.0 ) - 0.5 ) ) * 0.35 );
        vec3 V = -rd;
        float dif = 0.3 + 0.7 * max( dot( N, uCapLight ), 0.0 );
        float spec = pow( max( dot( reflect( -uCapLight, N ), V ), 0.0 ), 60.0 ) * wet * 1.6 + pow( 1.0 - max( dot( N, V ), 0.0 ), 4.0 ) * 0.08 * wet;
        vec3 capOut = capC * dif + vec3( 1.0, 0.9, 0.85 ) * spec;`)
      .replace('#include <opaque_fragment>', 'outgoingLight = capOut;\n#include <opaque_fragment>');
    if (!sh.fragmentShader.includes('capOut;')) console.warn('split body: cap shader not patched');
  };
  m.customProgramCacheKey = () => 'splitCap';
  return m;
}
// (the depth of field's depth of a cut: its inner wall's, which is only seen through the cut)
function capDepth(U, packing) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: packing, side: THREE.BackSide });
  d.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', 'vUp = aUp; vSplitW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tsplitClip();\n\tif ( vUp > 0.5 ) discard;');
  };
  d.customProgramCacheKey = () => 'splitCapDepth' + packing;
  return d;
}

export class SplitBody {
  // f: the fighter to cut (his character model ch); scene: where the upper half's group goes
  constructor(scene, f) {
    this.scene = scene; this.f = f; this.ch = f.ch;
    this.UL = halfUniforms(-1); this.UU = halfUniforms(1);
    // (the cross-section's ellipse and axes are the same uniform objects on both halves until they part)
    this.container = new THREE.Group(); this.container.name = 'upperHalf';
    this.container.matrixAutoUpdate = false;
    this.cut = false; this.relU = -1; this.relL = -1; this.stepN = 0;
    this._build();
  }

  // ------------------------------------------------------------------ meshes
  _build() {
    const ch = this.ch, bones = ch.skeleton.bones;
    // the bones that always go up, and the bones of the upper half (its accessories)
    const forced = new Set(), upper = new Set();
    const mark = (b, set) => { set.add(b); for (const c of b.children) if (c.isBone) mark(c, set); };
    for (const n of UP_ROOTS) if (ch.bones[n]) mark(ch.bones[n], forced);
    if (ch.bones.spine03) mark(ch.bones.spine03, upper);
    this.upperBones = upper;
    const forcedIdx = new Uint8Array(bones.length);
    bones.forEach((b, i) => { forcedIdx[i] = forced.has(b) ? 1 : 0; });
    // the waist's height in the rest pose: parts wholly above or below it (well clear) are not split
    const waistY = (ch.rest.spine04.head.y + ch.rest.spine03.head.y) / 2;
    this.items = []; this.caps = []; this.hidden = []; this.mats = [];
    const done = new WeakMap();
    for (const mesh of Object.values(ch.meshes)) {
      if (!mesh.isSkinnedMesh) continue;
      const g = mesh.geometry;
      // aUp: the weight of the always-up bones at each vertex (shared by the parts that share their vertices)
      let aUp = g.attributes.aUp;
      if (!aUp) {
        const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = SI.count;
        const key = SW;
        if (done.has(key)) aUp = done.get(key);
        else {
          const arr = new Float32Array(n);
          for (let i = 0; i < n; i++) { let w = 0; for (let k = 0; k < 4; k++) if (forcedIdx[SI.getComponent(i, k)]) w += SW.getComponent(i, k); arr[i] = w; }
          aUp = new THREE.BufferAttribute(arr, 1); done.set(key, aUp);
        }
        g.setAttribute('aUp', aUp);
      }
      // where the part is (rest pose): wholly up (every vertex forced up or well above the waist), wholly down, or both
      // (only the vertices this part draws: the head and the body share one vertex buffer)
      const P = g.attributes.position, A = aUp.array, I = g.index;
      let anyUp = false, anyDown = false;
      for (let t = 0, n = I ? I.count : P.count; t < n; t += 3) {
        const i = I ? I.getX(t) : t, y = P.getY(i), up = A[i] > 0.5;
        if (up || y > waistY + 0.22) anyUp = true; else if (y < waistY - 0.3) anyDown = true; else { anyUp = true; anyDown = true; }
        if (anyUp && anyDown) break;
      }
      const kind = anyUp && anyDown ? 'split' : anyUp ? 'up' : 'down';
      const item = { mesh, kind, mat: mesh.material, depth: mesh.customDepthMaterial, noAO: mesh.userData.noGTAO };
      if (kind === 'down') { this.items.push(item); continue; }
      // the copy above the cut
      const upMat = kind === 'split' ? splitMaterial(mesh.material, this.UU) : mesh.material;
      const copy = new THREE.SkinnedMesh(g, upMat);
      copy.name = mesh.name + '_up';
      copy.bindMode = THREE.DetachedBindMode;
      copy.bind(ch.skeleton, new THREE.Matrix4());
      copy.bindMatrixInverse.identity();
      copy.renderOrder = mesh.renderOrder; copy.castShadow = mesh.castShadow; copy.receiveShadow = mesh.receiveShadow; copy.frustumCulled = false;
      copy.userData = { ...mesh.userData, noGTAO: true };
      if (kind === 'split') {
        copy.customDepthMaterial = splitDepth(this.UU, THREE.BasicDepthPacking, mesh.material);
        upMat.userData.splitDepth = splitDepth(this.UU, THREE.RGBADepthPacking, mesh.material);
        this.mats.push(upMat, copy.customDepthMaterial, upMat.userData.splitDepth);
      } else copy.customDepthMaterial = mesh.customDepthMaterial;
      this.container.add(copy);
      item.copy = copy;
      if (kind === 'up') { this.items.push(item); continue; }
      // the original, below the cut
      const loMat = splitMaterial(mesh.material, this.UL);
      loMat.userData.splitDepth = splitDepth(this.UL, THREE.RGBADepthPacking, mesh.material);
      item.loMat = loMat; item.loDepth = splitDepth(this.UL, THREE.BasicDepthPacking, mesh.material);
      this.mats.push(loMat, loMat.userData.splitDepth, item.loDepth);
      this.items.push(item);
      // the cut seen into each half (the soft hair passes and the fur shells have none)
      if (mesh.material.transparent || mesh.material.alphaTest > 0) continue;
      const skin = /body|skin/i.test(mesh.name) || mesh.material.userData?.skin;
      const tint = mesh.material.color ? mesh.material.color.clone() : new THREE.Color(0.5, 0.5, 0.5);
      // (the garments a little behind the body's own cut, the outer ones further: the body's wins where both are)
      const bias = skin ? 0 : /jacket|coat/i.test(mesh.name) ? 0.004 : 0.002;
      for (const [U, parent, below] of [[this.UL, null, true], [this.UU, this.container, false]]) {
        const cm = capMaterial(U, skin ? 0 : 1, tint, bias);
        cm.userData.splitDepth = capDepth(U, THREE.RGBADepthPacking);
        const cap = new THREE.SkinnedMesh(g, cm);
        cap.name = mesh.name + (below ? '_capLo' : '_capUp');
        if (!below) { cap.bindMode = THREE.DetachedBindMode; cap.bind(ch.skeleton, new THREE.Matrix4()); cap.bindMatrixInverse.identity(); }
        else cap.bind(ch.skeleton, new THREE.Matrix4());
        cap.castShadow = false; cap.receiveShadow = false; cap.frustumCulled = false; cap.renderOrder = mesh.renderOrder;
        cap.userData.noGTAO = true;
        this.caps.push({ cap, parent: parent || ch.group });
        this.mats.push(cm, cm.userData.splitDepth);
      }
    }
    // which part is the body's skin (its cross-section measures the waist)
    this.bodyMesh = ch.meshes.body || Object.values(ch.meshes).find((m) => /body/i.test(m.name));
  }

  // from now on the fighter is drawn as two halves (still whole: the cut is far away). Done a while before the cut,
  // so that the new shaders are built before it (behind the fade to black, not at the stroke of the sword)
  begin() {
    if (this.on) return;
    this.on = true;
    for (const it of this.items) {
      const m = it.mesh;
      if (it.kind === 'up') { m.visible = false; this.hidden.push(m); }
      else if (it.kind === 'split') { m.material = it.loMat; m.customDepthMaterial = it.loDepth; m.userData.noGTAO = true; }
    }
    for (const c of this.caps) c.parent.add(c.cap);
    this.scene.add(this.container);
    this.container.matrix.identity(); this.container.matrixWorld.identity();
    // the accessories of the upper half (headset, watch, glasses, chain...) are carried by its group too: each one on a
    // holder that follows its bone's world transform
    this.carried = [];
    for (const b of this.upperBones) {
      for (const o of [...b.children]) {
        if (o.isBone) continue;
        const holder = new THREE.Group(); holder.matrixAutoUpdate = false;
        b.remove(o); holder.add(o); this.container.add(holder);
        this.carried.push({ o, b, holder });
      }
    }
    this.syncCarried();
  }

  // the accessories' holders onto their bones (after the skeleton's world matrices are current)
  syncCarried() {
    for (const c of this.carried || []) c.holder.matrix.copy(c.b.matrixWorld);
    this.container.matrixWorldNeedsUpdate = true;
    this.container.updateMatrixWorld(true);
  }

  // put the fighter back together (a play shown again, a rematch with the same models)
  restore() {
    if (!this.on) return;
    this.on = false;
    for (const it of this.items) {
      const m = it.mesh;
      m.visible = true; m.material = it.mat; m.customDepthMaterial = it.depth;
      if (it.noAO) m.userData.noGTAO = it.noAO; else delete m.userData.noGTAO;
    }
    for (const c of this.caps) c.parent.remove(c.cap);
    for (const c of this.carried || []) { c.holder.remove(c.o); c.b.add(c.o); }
    this.carried = [];
    this.scene.remove(this.container);
    for (const m of this.mats) m.dispose?.();
    this.ch.group.visible = true;
  }

  // ------------------------------------------------------------------ the cut
  // n: the cut's normal (world, towards the head), p: a point of it; slide: the way the upper half goes off
  // (horizontal, the sword's way). Called with the body as last drawn.
  doCut(n, p) {
    const ch = this.ch, g = ch.group;
    g.updateMatrixWorld(true);
    this.n0 = n.clone().normalize();
    // the cross-section (the body's skin at the cut, skinned on the CPU): its centre, its axes and its half-widths
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(ch.bones.root.getWorldQuaternion(new THREE.Quaternion()));
    const V0 = fw.addScaledVector(this.n0, -fw.dot(this.n0)).normalize(), U0 = new THREE.Vector3().crossVectors(this.n0, V0).normalize();
    const pts = [];
    const mesh = this.bodyMesh;
    if (mesh) {
      mesh.updateMatrixWorld(true);
      const P = mesh.geometry.attributes.position, A = mesh.geometry.attributes.aUp.array, v = new THREE.Vector3();
      for (let i = 0; i < P.count; i++) {
        if (A[i] > 0.5) continue;
        mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld);
        const s = v.clone().sub(p).dot(this.n0);
        if (Math.abs(s) < 0.012) pts.push(v.addScaledVector(this.n0, -s).clone());
      }
    }
    let cx = 0, cy = 0, rx = 0.15, ry = 0.11;
    if (pts.length > 20) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of pts) { const d = q.clone().sub(p); const x = d.dot(U0), y = d.dot(V0); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; rx = (x1 - x0) / 2; ry = (y1 - y0) / 2;
    }
    this.center0 = p.clone().addScaledVector(U0, cx).addScaledVector(V0, cy);
    this.U0 = U0; this.V0 = V0; this.R = new THREE.Vector2(rx, ry);
    // the rim of the cut (world points, for the blood that runs from it)
    this.rim0 = pts.length > 20 ? pts : [];
    for (const U of [this.UL, this.UU]) { U.uCapR.value.copy(this.R); }
    // the particles of both halves, from the body as drawn now
    const wq = new THREE.Quaternion(), wp = new THREE.Vector3();
    const mk = (J) => {
      const out = {};
      for (const k in J) {
        const [bn, off, r, mass] = J[k];
        const b = ch.bones[bn];
        b.getWorldPosition(wp); b.getWorldQuaternion(wq);
        const pos = new THREE.Vector3(...off).applyQuaternion(wq).add(wp);
        out[k] = { p: pos.clone(), o: pos.clone(), prev: pos.clone(), r, m: mass };
      }
      return out;
    };
    const Up = mk(UPJ), Lo = mk(LOJ);
    const c0 = this.center0;
    Up.cutU = { p: c0.clone(), o: c0.clone(), prev: c0.clone(), r: 0.04, m: 1 };
    Lo.cutL = { p: c0.clone(), o: c0.clone(), prev: c0.clone(), r: 0.04, m: 1 };
    for (const [nm, u, vv] of RIM) {
      const q = c0.clone().addScaledVector(U0, u * rx).addScaledVector(V0, vv * ry);
      Up['u' + nm] = { p: q.clone(), o: q.clone(), prev: q.clone(), r: 0.03, m: 0.5 };
      Lo['l' + nm] = { p: q.clone(), o: q.clone(), prev: q.clone(), r: 0.03, m: 0.5 };
    }
    this.P = { ...Up, ...Lo };
    this.upKeys = Object.keys(Up); this.loKeys = Object.keys(Lo);
    // sticks: each trunk a rigid cluster, the limbs' bones, joint limits (minimum distances, from the rest pose)
    const S = [], add = (a, b) => S.push([a, b, this.P[a].p.distanceTo(this.P[b].p)]);
    const clusterU = ['belly', 'chest', 'neck', 'head', 'shL', 'shR', 'cutU', 'uF', 'uB', 'uL', 'uR'];
    const clusterL = ['pelvis', 'hipL', 'hipR', 'cutL', 'lF', 'lB', 'lL', 'lR'];
    for (const C of [clusterU, clusterL]) for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) add(C[i], C[j]);
    for (const [a, b] of [['shL', 'elL'], ['elL', 'wrL'], ['shR', 'elR'], ['elR', 'wrR'], ['hipL', 'knL'], ['knL', 'anL'], ['anL', 'toL'], ['knL', 'toL'],
      ['hipR', 'knR'], ['knR', 'anR'], ['anR', 'toR'], ['knR', 'toR']]) add(a, b);
    this.sticks = S;
    const restD = (a, b, J1, J2) => {
      const R = (J, k) => { const [bn, off] = J[k]; return ch.rest[bn].head.clone().add(new THREE.Vector3(...off)); };
      return R(J1, a).distanceTo(R(J2, b));
    };
    this.mins = [['shL', 'wrL', UPJ, UPJ, 0.45], ['shR', 'wrR', UPJ, UPJ, 0.45], ['wrL', 'chest', UPJ, UPJ, 0.2], ['wrR', 'chest', UPJ, UPJ, 0.2],
      ['elL', 'belly', UPJ, UPJ, 0.14], ['elR', 'belly', UPJ, UPJ, 0.14], ['hipL', 'anL', LOJ, LOJ, 0.5], ['hipR', 'anR', LOJ, LOJ, 0.5]]
      .map(([a, b, J1, J2, k]) => [a, b, restD(a, b, J1, J2) * k]);
    this.mins.push(['anL', 'anR', 0.12], ['knL', 'knR', 0.12], ['wrL', 'wrR', 0.08]);
    // the frames each half is measured against, and the bones' world transforms they move from
    this.frU0 = basis(_a.subVectors(this.P.shL.p, this.P.shR.p).clone(), _b.subVectors(this.P.chest.p, this.P.cutU.p).clone(), new THREE.Quaternion());
    this.frL0 = basis(_a.subVectors(this.P.hipL.p, this.P.hipR.p).clone(), _b.subVectors(this.P.cutL.p, this.P.pelvis.p).clone(), new THREE.Quaternion());
    this.frU0i = this.frU0.clone().invert(); this.frL0i = this.frL0.clone().invert();
    const B = ch.bones;
    this.q0 = {}; this.p0 = {};
    for (const n of ['root', 'spine01']) { this.q0[n] = B[n].getWorldQuaternion(new THREE.Quaternion()); this.p0[n] = B[n].getWorldPosition(new THREE.Vector3()); }
    this.chestOff0 = this.P.chest.p.clone().sub(this.p0.spine01);
    // the limbs' local rotations as cut (what the solved ones blend from as each half lets go)
    this.frozen = {};
    for (const s of ['L', 'R']) for (const n of [`upperarm01.${s}`, `upperarm02.${s}`, `lowerarm01.${s}`, `upperleg01.${s}`, `upperleg02.${s}`, `lowerleg01.${s}`, `foot.${s}`]) this.frozen[n] = B[n].quaternion.clone();
    // the skeleton in world space from now on: the group at the origin, the root carrying the body's world transform
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.updateMatrix();
    B.root.position.copy(this.p0.root); B.root.quaternion.copy(this.q0.root);
    g.updateMatrixWorld(true);
    this.cut = true; this.stepN = 0;
    this._planes(0);
  }

  // let a half go: 'up' (it rests on the other's cut and slides off: v its push, m/s) or 'down' (the legs give way:
  // kick, the knees' push forwards)
  release(which, v = null) {
    if (!this.cut) return;
    if (which === 'up' && this.relU < 0) {
      this.relU = this.stepN;
      if (v) for (const k of this.upKeys) this.P[k].o.copy(this.P[k].p).addScaledVector(v, -DT);
    }
    if (which === 'down' && this.relL < 0) {
      this.relL = this.stepN;
      if (v) {
        // the knees buckle forwards, the hips sink back
        const fwd = this.legFwd(new THREE.Vector3());
        for (const k of ['knL', 'knR']) this.P[k].o.copy(this.P[k].p).addScaledVector(fwd, -v.x * DT);
        for (const k of ['pelvis', 'hipL', 'hipR', 'cutL', 'lF', 'lB', 'lL', 'lR']) this.P[k].o.copy(this.P[k].p).addScaledVector(fwd, v.y * DT).add(_a.set(0, v.z * DT, 0));
      }
    }
  }
  // the top half slides off down the slope of the cut (dir: horizontal, the way it goes; v0 m/s, a m/s²), carried
  // whole along it until its middle has passed the edge of the legs' cut; then it is loose and tips off (push: an
  // extra shove of its chest and head the same way, so it goes over sideways)
  slide(dir, v0 = 0.12, a = 1.6, push = 0.6) {
    if (!this.cut || this.relU >= 0) return;
    const n = this.n0, sd = dir.clone().addScaledVector(n, -dir.dot(n)).normalize();
    this.slideS = { s: sd, v: v0, a, d: 0, end: Math.max(0.06, (Math.abs(sd.dot(this.U0)) * this.R.x + Math.abs(sd.dot(this.V0)) * this.R.y) * 0.8), push };
    this.relU = this.stepN;
  }
  // the lower half's forward (where the knees bend)
  legFwd(out) {
    const P = this.P, X = _a.subVectors(P.hipL.p, P.hipR.p), Y = _b.subVectors(P.cutL.p, P.pelvis.p);
    return out.crossVectors(X, Y).normalize();
  }

  // one simulation frame
  step() {
    if (!this.cut) return;
    this.stepN++;
    const P = this.P, S = this.slideS, freeU = this.relU >= 0 && !S, freeL = this.relL >= 0;
    const free = (k) => (this.upKeys.includes(k) ? freeU : freeL);
    if (S) {
      // the slide: the whole top half carried along the cut's slope
      S.v += S.a * DT; S.d += S.v * DT;
      for (const k of this.upKeys) { const q = P[k]; q.prev.copy(q.p); q.p.addScaledVector(S.s, S.v * DT); q.o.copy(q.p).addScaledVector(S.s, -S.v * DT); }
      if (S.d >= S.end) {
        // past the edge: loose, still moving, its top shoved on so that it goes over sideways
        this.slideS = null;
        for (const k of ['chest', 'neck', 'head', 'shL', 'shR']) P[k].o.addScaledVector(S.s, -S.push * DT);
      }
    }
    for (const k in P) {
      const q = P[k];
      if (S && this.upKeys.includes(k)) continue;
      q.prev.copy(q.p);
      if (!free(k)) { q.o.copy(q.p); continue; }
      const vx = (q.p.x - q.o.x) * 0.996, vy = (q.p.y - q.o.y) * 0.996, vz = (q.p.z - q.o.z) * 0.996;
      q.o.copy(q.p);
      q.p.x += vx; q.p.y += vy - G * DT * DT; q.p.z += vz;
    }
    const nL = this._nL || (this._nL = new THREE.Vector3());
    for (let it = 0; it < 12; it++) {
      for (const [a, b, L] of this.sticks) this.solve(a, b, L, false, free);
      for (const [a, b, L] of this.mins) this.solve(a, b, L, true, free);
      if (freeL) this.kneeHinge();
      // the upper half on the lower one's cut: its cut's points cannot sink into the stump while above it
      if (freeU) {
        this.frameL(_q); nL.copy(this.n0).applyQuaternion(_q);
        const Lc = P.cutL.p, R = Math.max(this.R.x, this.R.y) + 0.02;
        for (const k of ['cutU', 'uF', 'uB', 'uL', 'uR']) {
          const q = P[k].p, d = _a.subVectors(q, Lc), s = d.dot(nL);
          if (s >= 0 || s < -0.1) continue;
          const lat = _b.copy(d).addScaledVector(nL, -s).length();
          if (lat > R) continue;
          q.addScaledVector(nL, -s);
        }
      }
      for (const k in P) {
        if (!free(k)) continue;
        const q = P[k];
        if (q.p.y < q.r) {
          q.p.y = q.r;
          q.o.x += (q.p.x - q.o.x) * 0.14; q.o.z += (q.p.z - q.o.z) * 0.14;
          if (q.o.y < q.p.y) q.o.y = q.p.y;
        }
        if (this.clampWalk) this.clampWalk(q.p, q.r);
      }
    }
  }
  solve(a, b, L, minOnly, free) {
    const A = this.P[a], B = this.P[b], fa = free(a), fb = free(b);
    if (!fa && !fb) return;
    const d = _c.subVectors(B.p, A.p), l = d.length() || 1e-6;
    if (minOnly && l >= L) return;
    const diff = (l - L) / l;
    const wa = fa ? (fb ? B.m / (A.m + B.m) : 1) : 0, wb = fb ? (fa ? A.m / (A.m + B.m) : 1) : 0;
    A.p.addScaledVector(d, diff * wa); B.p.addScaledVector(d, -diff * wb);
  }
  // knees only bend forwards: a knee behind the line from hip to ankle is pushed back in front of it
  kneeHinge() {
    const P = this.P, F = this.legFwd(_c.set(0, 0, 0));
    for (const s of ['L', 'R']) {
      const h = P['hip' + s].p, k = P['kn' + s].p, a = P['an' + s].p;
      const m = _a.addVectors(h, a).multiplyScalar(0.5), d = _b.subVectors(k, m).dot(F);
      if (d < 0.015) k.addScaledVector(F, 0.015 - d);
    }
  }
  frameU(out, P = this.P, k = 'p') { return basis(_a.subVectors(P.shL[k], P.shR[k]).clone(), _b.subVectors(P.chest[k], P.cutU[k]).clone(), out).multiply(this.frU0i); }
  frameL(out, P = this.P, k = 'p') { return basis(_a.subVectors(P.hipL[k], P.hipR[k]).clone(), _b.subVectors(P.cutL[k], P.pelvis[k]).clone(), out).multiply(this.frL0i); }

  // ------------------------------------------------------------------ drawing
  // per drawn frame (alpha: between the last two simulation frames): the skeleton, the upper half's group, the planes
  sync(alpha = 1, rig) {
    if (!this.on) return;
    if (!this.cut) { this.ch.group.updateMatrixWorld(true); this.syncCarried(); return; }
    const P = this.P, B = this.ch.bones;
    // positions between the last two simulation frames
    const Q = this._Q || (this._Q = {});
    for (const k in P) (Q[k] || (Q[k] = { p: new THREE.Vector3() })).p.lerpVectors(P[k].prev, P[k].p, alpha);
    const qL = this.frameL(new THREE.Quaternion(), Q), qU = this.frameU(new THREE.Quaternion(), Q);
    // the lower half: the root where its particles are (the rest of its skeleton as cut, the legs solved once loose)
    if (this.relL >= 0) {
      B.root.quaternion.copy(qL).multiply(this.q0.root);
      B.root.position.copy(Q.pelvis.p);
      this.ch.group.updateMatrixWorld(true);
      const w = Math.min(1, (this.stepN - this.relL + alpha) / 8);
      for (const s of ['L', 'R']) this.limb(rig, `upperleg01.${s}`, `upperleg02.${s}`, `lowerleg01.${s}`, Q['hip' + s].p, Q['kn' + s].p, Q['an' + s].p, rig.leg[s], true, w, null);
      for (const s of ['L', 'R']) this.foot(`foot.${s}`, Q['an' + s].p, Q['to' + s].p, Q['kn' + s].p, w);
    }
    this.ch.group.updateMatrixWorld(true);
    // the upper half's group: from where the skeleton has the chest to where its particles have it
    const qs = B.spine01.getWorldQuaternion(new THREE.Quaternion()), ps = B.spine01.getWorldPosition(new THREE.Vector3());
    const qd = qU.clone().multiply(this.q0.spine01), pd = Q.chest.p.clone().sub(this.chestOff0.clone().applyQuaternion(qU));
    const C = this.container.matrix;
    const Ts = new THREE.Matrix4().compose(ps, qs, _c.set(1, 1, 1)), Td = new THREE.Matrix4().compose(pd, qd, new THREE.Vector3(1, 1, 1));
    C.multiplyMatrices(Td, Ts.invert());
    this.container.matrixWorldNeedsUpdate = true;
    this.container.updateMatrixWorld(true);
    // the arms, once loose, from the particles taken into the skeleton's frame (C⁻¹)
    if (this.relU >= 0) {
      const Ci = new THREE.Matrix4().copy(C).invert();
      const w = Math.min(1, (this.stepN - this.relU + alpha) / 8);
      for (const s of ['L', 'R']) {
        const S = Q['sh' + s].p.clone().applyMatrix4(Ci), E = Q['el' + s].p.clone().applyMatrix4(Ci), W = Q['wr' + s].p.clone().applyMatrix4(Ci);
        this.limb(rig, `upperarm01.${s}`, `upperarm02.${s}`, `lowerarm01.${s}`, S, E, W, rig.arm[s], false, w, `lowerarm02.${s}`);
      }
      this.ch.group.updateMatrixWorld(true);
    }
    this.syncCarried();
    this._planes(alpha, qL, qU, Q);
  }

  // the cut planes and the cross-sections' frames of both halves
  _planes(alpha, qL = null, qU = null, Q = null) {
    const nL = this.n0.clone(), nU = this.n0.clone(), cL = this.center0.clone(), cU = this.center0.clone();
    const uL = this.U0.clone(), vL = this.V0.clone(), uU = this.U0.clone(), vU = this.V0.clone();
    if (qL && this.relL >= 0) { nL.applyQuaternion(qL); uL.applyQuaternion(qL); vL.applyQuaternion(qL); cL.copy(Q.cutL.p); }
    if (qU && this.relU >= 0) { nU.applyQuaternion(qU); uU.applyQuaternion(qU); vU.applyQuaternion(qU); cU.copy(Q.cutU.p); }
    this.UL.uSplitPlane.value.set(nL.x, nL.y, nL.z, nL.dot(cL));
    this.UU.uSplitPlane.value.set(nU.x, nU.y, nU.z, nU.dot(cU));
    this.UL.uCapC.value.copy(cL); this.UL.uCapU.value.copy(uL); this.UL.uCapV.value.copy(vL);
    this.UU.uCapC.value.copy(cU); this.UU.uCapU.value.copy(uU); this.UU.uCapV.value.copy(vU);
    this.cL = cL; this.cU = cU; this.nL = nL; this.nU = nU;
  }
  // the cut's line and the blood running from it (both halves)
  setBleed(line, bleed) { for (const U of [this.UL, this.UU]) { U.uSplitLine.value = line; U.uSplitBleed.value = bleed; } }
  setLight(dir) { this.UL.uCapLight.value.copy(dir); this.UU.uCapLight.value.copy(dir); }

  // a limb's two bones aimed at its particles (as the ragdoll does), blended in from how they were cut over w
  limb(rig, up, up2, lo, S, E, W, C, isLeg, w, twistBone) {
    const B = this.ch.bones;
    const x = new THREE.Vector3().subVectors(E, S).normalize(), l = new THREE.Vector3().subVectors(W, E).normalize();
    const perp = (v, ax) => v.clone().addScaledVector(ax, -v.dot(ax));
    let fold = perp(l, x);
    if (fold.lengthSq() < 1e-6) fold = perp(isLeg ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 0, 1), x);
    const pw = (n) => B[n].parent.getWorldQuaternion(new THREE.Quaternion());
    const qUp = basis(x, fold, new THREE.Quaternion()).multiply(C.rUp);
    const locUp = pw(up).invert().multiply(qUp);
    B[up].quaternion.copy(this.frozen[up]).slerp(locUp, w);
    B[up2].quaternion.copy(this.frozen[up2]).slerp(_q.identity(), w);
    B[up].updateMatrixWorld(true);
    const r = perp(x.clone().negate(), l);
    const qLo = basis(l, r.lengthSq() > 1e-6 ? r : fold.clone().negate(), new THREE.Quaternion()).multiply(C.rLo);
    const locLo = pw(lo).invert().multiply(qLo);
    B[lo].quaternion.copy(this.frozen[lo]).slerp(locLo, w);
    B[lo].updateMatrixWorld(true);
  }
  foot(n, A, T, K, w) {
    const B = this.ch.bones, R = this.ch.rest, s = n.slice(-1);
    const ft = new THREE.Vector3().subVectors(T, A), shin = new THREE.Vector3().subVectors(A, K).negate();
    const off = new THREE.Vector3(0, -0.05, 0.14);
    const ft0 = off.clone(), shin0 = R[`lowerleg01.${s}`].head.clone().sub(R[`foot.${s}`].head);
    const qW = basis(ft, shin, new THREE.Quaternion()).multiply(basis(ft0, shin0, new THREE.Quaternion()).invert());
    const loc = B[n].parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qW);
    B[n].quaternion.copy(this.frozen[n]).slerp(loc, w);
  }

  // where the halves' cuts are now (world): centre and the normal facing out of each
  stumps() {
    return { lower: { c: this.cL, n: this.nL }, upper: { c: this.cU, n: this.nU ? this.nU.clone().negate() : null } };
  }
}
