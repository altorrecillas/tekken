// A fight showing on the fighters (drawn only: nothing of it is in the simulation).
//  - where the blows land, a mark that stays for the match: on the skin a bruise (red, then purple, swollen-looking,
//    a graze with a little blood at its middle for the hardest), on clothes a scuff, on Orión's metal scratches and a
//    scorch (the blow's point found on the nearest bone, carried back to the rest pose: it moves with the body);
//  - sweat: the skin gets glossier as the fight goes on and he tires;
//  - dirt: each fall leaves dust on the clothes and the skin, more on the back and the legs;
//  - wet: the stage's rain (Distrito Neón) soaks them little by little: darker clothes, glossy skin and metal.
// All through uniforms of the fighter's own materials (no shader is built again during a fight). Orión, low on
// health, also throws sparks now and then from his joints.
import * as THREE from 'three';

const N = 8;           // marks kept per fighter (few: each is a uniform of every one of his shaders)
const BONES = ['head', 'neck01', 'spine01', 'spine02', 'spine03', 'spine04', 'spine05', 'clavicle.L', 'clavicle.R', 'upperarm01.L', 'upperarm01.R',
  'upperarm02.L', 'upperarm02.R', 'lowerarm01.L', 'lowerarm01.R', 'wrist.L', 'wrist.R', 'upperleg01.L', 'upperleg01.R', 'upperleg02.L', 'upperleg02.R',
  'lowerleg01.L', 'lowerleg01.R', 'lowerleg02.L', 'lowerleg02.R', 'foot.L', 'foot.R'];
const SPARK_BONES = ['upperarm02.L', 'upperarm02.R', 'lowerarm01.L', 'lowerarm01.R', 'neck01', 'upperleg02.L', 'lowerleg01.R', 'spine03'];

const GLSL = `
uniform vec4 uWM[ ${N} ];
uniform vec4 uWS;    // sweat, dirt, wet, time
varying vec3 vWP; varying vec3 vWN;
float wH( vec3 p ) { p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) ); p += dot( p, p.yxz + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }
float wN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( wH( i ), wH( i + vec3( 1, 0, 0 ) ), f.x ), mix( wH( i + vec3( 0, 1, 0 ) ), wH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( wH( i + vec3( 0, 0, 1 ) ), wH( i + vec3( 1, 0, 1 ) ), f.x ), mix( wH( i + vec3( 0, 1, 1 ) ), wH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
// the marks round this point: x the strongest (soft edge), y a core (the hardest blows' middles)
vec2 wMarks( vec3 P ) {
  vec2 m = vec2( 0.0 );
  float n = wN( P * 40.0 ) - 0.5;
  for ( int i = 0; i < ${N}; i++ ) {
    vec4 b = uWM[ i ];
    if ( b.w <= 0.0 ) continue;
    float d = length( P - b.xyz ) + n * 0.022;
    float r = 0.045 + 0.035 * min( 1.0, b.w );
    m.x = max( m.x, min( 1.0, b.w ) * ( 1.0 - smoothstep( r * 0.45, r, d ) ) );
    m.y = max( m.y, smoothstep( 0.75, 1.3, b.w ) * ( 1.0 - smoothstep( r * 0.12, r * 0.3, d ) ) );
  }
  return m;
}
// dust: patchy, more low down and on the back
float wDirt( vec3 P, vec3 N ) {
  float where = 0.35 + 0.65 * max( smoothstep( 0.9, 0.2, P.y ), smoothstep( 0.1, -0.6, N.z ) );
  return uWS.y * where * smoothstep( 0.35, 0.75, wN( P * 9.0 ) * 0.7 + wN( P * 31.0 ) * 0.3 );
}`;

// kind: 'skin' | 'cloth' | 'metal' (the fighter's materials of those kinds get it; the others stay as they are)
function patch(mat, kind, U) {
  if (!mat || mat.isShaderMaterial || mat.isMeshBasicMaterial || mat.userData.wear) return mat;
  mat.userData.wear = kind;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.uWM = U.marks; sh.uniforms.uWS = U.state;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvWP = position; vWN = normal;');
    const color = kind === 'skin' ? `
        vec2 wm = wMarks( vWP );
        // a bruise: red where fresh and strong, purple round it, the skin a little darker; a graze at the hardest
        vec3 wBr = mix( vec3( 0.52, 0.2, 0.22 ), vec3( 0.36, 0.2, 0.32 ), smoothstep( 0.2, 0.9, wN( vWP * 23.0 ) ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * wBr * 1.6, wm.x * 0.75 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.03, 0.03 ), wm.y * 0.85 * smoothstep( 0.4, 0.6, wN( vWP * 90.0 ) ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.36, 0.31, 0.26 ), wDirt( vWP, vWN ) * 0.45 );
        diffuseColor.rgb *= 1.0 - 0.1 * uWS.z;`
      : kind === 'cloth' ? `
        vec2 wm = wMarks( vWP );
        diffuseColor.rgb *= 1.0 - wm.x * 0.18;
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.42, 0.37, 0.31 ), wDirt( vWP, vWN ) * 0.6 );
        // soaked: a fabric goes darker and more saturated
        diffuseColor.rgb = mix( diffuseColor.rgb, pow( diffuseColor.rgb, vec3( 1.35 ) ) * 0.85, uWS.z * 0.75 );`
      : `
        vec2 wm = wMarks( vWP );
        // scratches: thin bright lines in every direction round the blow, a dark scorch at its middle
        float wSc = 0.0;
        for ( int k = 0; k < 3; k++ ) {
          vec3 dir = normalize( vec3( wH( vec3( float( k ), 1.0, 7.0 ) ) - 0.5, wH( vec3( float( k ), 3.0, 2.0 ) ) - 0.5, wH( vec3( float( k ), 5.0, 9.0 ) ) - 0.5 ) );
          float l = abs( fract( dot( vWP, dir ) * 140.0 + wN( vWP * 30.0 + float( k ) ) * 3.0 ) - 0.5 );
          wSc = max( wSc, ( 1.0 - smoothstep( 0.0, 0.05, l ) ) * step( 0.55, wN( vWP * 55.0 + float( k ) * 7.0 ) ) );
        }
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), wSc * wm.x * 0.7 );
        diffuseColor.rgb *= 1.0 - wm.y * 0.55;
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.3, 0.27, 0.24 ), wDirt( vWP, vWN ) * 0.35 );`;
    const rough = kind === 'skin'
      ? '\n\troughnessFactor *= 1.0 - 0.38 * uWS.x - 0.45 * uWS.z;\n\troughnessFactor = mix( roughnessFactor, 0.3, wm.y );'
      : kind === 'cloth' ? '\n\troughnessFactor = mix( roughnessFactor, 1.0, wDirt( vWP, vWN ) * 0.6 );\n\troughnessFactor *= 1.0 - 0.25 * uWS.z;'
        : '\n\troughnessFactor = mix( roughnessFactor, 0.12, wSc * wm.x );\n\troughnessFactor = mix( roughnessFactor, 0.85, wm.y * 0.7 );\n\troughnessFactor *= 1.0 - 0.3 * uWS.z;';
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>' + color)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + rough);
  };
  const pk = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|wear' + kind;
  return mat;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Vector3();

export class Wear {
  constructor() {
    this.U = { marks: { value: Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, 0)) }, state: { value: new THREE.Vector4(0, 0, 0, 0) } };
    this.k = 0; this.sweat = 0; this.dirt = 0; this.wet = 0; this.sparkT = 1;
  }
  // the fighter's material for a part, given the part's kind (makeFighterModel calls it for every part)
  material(m, type) {
    const kind = type === 'skin' ? 'skin' : type === 'cloth' || type === 'synth' ? 'cloth' : type === 'metal' ? 'metal' : null;
    return kind ? patch(m, kind, this.U) : m;
  }
  // a blow landed at world point p (power ~0.3 a jab .. 1.5 a launcher): a mark at the rest pose's point under it
  hit(ch, p, power) {
    if (!ch || !p) return;
    let best = null, bd = Infinity;
    for (const n of BONES) { const b = ch.bones[n]; if (!b) continue; b.getWorldPosition(_q); const d = _q.distanceToSquared(p); if (d < bd) { bd = d; best = b; } }
    if (!best) return;
    // (the point in the bone's frame now, then in the bone's frame at rest: the bind matrix of that bone)
    const sk = ch.skeleton, i = sk.bones.indexOf(best);
    if (i < 0) return;
    _p.copy(p).applyMatrix4(_m.copy(best.matrixWorld).invert()).applyMatrix4(_m.copy(sk.boneInverses[i]).invert());
    const M = this.U.marks.value;
    // a blow on an old mark makes it worse, otherwise a new one (the oldest goes)
    for (const v of M) if (v.w > 0 && _q.set(v.x, v.y, v.z).distanceTo(_p) < 0.06) { v.w = Math.min(1.6, v.w + power * 0.5); return; }
    M[this.k].set(_p.x, _p.y, _p.z, Math.min(1.6, 0.35 + power * 0.6));
    this.k = (this.k + 1) % N;
  }
  fall() { this.dirt = Math.min(1, this.dirt + 0.22); }
  // every drawn frame: f the fighter, wet the stage's rain (0..1), fx the effects (for Orión's sparks)
  update(f, dt, wet, fx) {
    const tired = f.maxHp ? 1 - Math.max(0, f.hp) / f.maxHp : 0;
    const busy = f.state === 'idle' || f.state === 'intro' ? 0.2 : 1;
    this.sweat = Math.min(1, this.sweat + dt * (0.004 + 0.012 * tired) * busy);
    this.wet += ((wet || 0) - this.wet) * Math.min(1, dt * 0.05);
    this.U.state.value.set(Math.max(this.sweat, tired * 0.6), this.dirt, this.wet, 0);
    // Orión hurt: sparks from a joint now and then, more often the lower his health
    if (f.ch?.meta?.robot && fx && tired > 0.55 && !f.ko) {
      this.sparkT -= dt * (0.5 + (tired - 0.55) * 4);
      if (this.sparkT <= 0) {
        this.sparkT = 0.6 + Math.random() * 1.4;
        const b = f.ch.bones[SPARK_BONES[Math.floor(Math.random() * SPARK_BONES.length)]];
        if (b) fx.sparks?.(b.getWorldPosition(new THREE.Vector3()), 5 + Math.floor(Math.random() * 6), false);
      }
    }
  }
}
