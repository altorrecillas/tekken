// A fighter flayed and blown away by the wind (Alejandro's PUÑETALITY, js/fight/fatality.js): drawn only.
// cut (0..1): cuts open up all over him, more and longer, and the blood soaks his clothes from them; gone (0..1): he is
// taken away bit by bit, the hands and feet and the edges of his clothes first, the chest last, each hole's rim raw and
// wet, and inside him (seen through the holes) red meat. His shoes stay. Patched copies of his materials, made as the
// move starts (their shaders are built behind its moment of black).
import * as THREE from 'three';

const NOISE = `
float evH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float evN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  float a = evH( i.xy + i.z * 17.1 ), b = evH( i.xy + vec2( 1, 0 ) + i.z * 17.1 ), c = evH( i.xy + vec2( 0, 1 ) + i.z * 17.1 ), d = evH( i.xy + vec2( 1, 1 ) + i.z * 17.1 );
  float e = evH( i.xy + ( i.z + 1.0 ) * 17.1 ), g = evH( i.xy + vec2( 1, 0 ) + ( i.z + 1.0 ) * 17.1 ), h = evH( i.xy + vec2( 0, 1 ) + ( i.z + 1.0 ) * 17.1 ), k = evH( i.xy + vec2( 1, 1 ) + ( i.z + 1.0 ) * 17.1 );
  return mix( mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ), mix( mix( e, g, f.x ), mix( h, k, f.x ), f.y ), f.z ); }`;

function evapMaterial(mat, U, chest) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  if (mat.defines) m.defines = { ...mat.defines };
  m.side = THREE.DoubleSide;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEvP;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvEvP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vEvP; uniform float uEvCut, uEvGone;${NOISE}
const vec3 EV_CHEST = vec3( ${chest.x.toFixed(3)}, ${chest.y.toFixed(3)}, ${chest.z.toFixed(3)} );`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // gone: the extremities first (far from the chest), with a ragged noise
        float evD = clamp( length( ( vEvP - EV_CHEST ) * vec3( 1.0, 0.75, 1.0 ) ) / 0.95, 0.0, 1.0 );
        float evNz = evN( vEvP * 26.0 ) * 0.6 + evN( vEvP * 70.0 ) * 0.4;
        float evH2 = ( 1.0 - evD ) * 0.55 + evNz * 0.45;
        float evT = uEvGone * 1.08 - 0.04;
        if ( evH2 < evT ) discard;
        float evRim = 1.0 - smoothstep( 0.0, 0.05, evH2 - evT );
        // cuts: short slashes every which way, more and longer as the wind works
        float evCutM = 0.0;
        if ( uEvCut > 0.0 ) {
          vec2 q = vec2( atan( vEvP.x, vEvP.z ) * 0.42, vEvP.y ) * 34.0;
          vec2 c = floor( q );
          for ( int i = -1; i <= 1; i++ ) for ( int j = -1; j <= 1; j++ ) {
            vec2 cc = c + vec2( float( i ), float( j ) );
            if ( evH( cc ) > uEvCut * 0.85 ) continue;
            vec2 d = q - cc - vec2( evH( cc + 3.1 ), evH( cc + 7.3 ) );
            float a = evH( cc + 9.7 ) * 3.1416;
            d = mat2( cos( a ), sin( a ), -sin( a ), cos( a ) ) * d;
            float len = 0.35 + 0.9 * evH( cc + 1.9 ) * uEvCut;
            evCutM = max( evCutM, ( 1.0 - smoothstep( 0.03, 0.07, abs( d.y ) ) ) * ( 1.0 - smoothstep( len * 0.8, len, abs( d.x ) ) ) );
          }
        }
        float evSoak = smoothstep( 0.3, 1.0, uEvCut ) * smoothstep( 0.45, 0.75, evN( vEvP * 9.0 ) + 0.3 * uEvCut + 0.9 * uEvGone );
        float evB = max( max( evRim, evCutM ), evSoak );`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.13, 0.005, 0.007 ), vec3( 0.32, 0.03, 0.03 ), evRim ), evB * 0.985 );
        // seen through the holes: the meat inside
        if ( ! gl_FrontFacing ) diffuseColor.rgb = mix( vec3( 0.1, 0.004, 0.006 ), vec3( 0.28, 0.025, 0.025 ), evNz );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.28, max( evB, gl_FrontFacing ? 0.0 : 1.0 ) );')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n\t#ifdef USE_SHEEN\n\t\tmaterial.sheenColor *= 1.0 - evB;\n\t#endif');
    if (!sh.fragmentShader.includes('evH2 < evT')) console.warn('evaporate: shader not patched', mat.type);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|evap';
  return m;
}

export class Evaporate {
  constructor(f) {
    this.f = f; const ch = this.ch = f.ch;
    this.U = { uEvCut: { value: 0 }, uEvGone: { value: 0 } };
    const chest = ch.rest.spine02?.head || new THREE.Vector3(0, 1.2, 0);
    this.items = []; this.hidden = [];
    for (const mesh of Object.values(ch.meshes)) {
      if (!mesh.isSkinnedMesh) continue;
      if (/shoe/i.test(mesh.name)) continue; // (they stay)
      // (fur shells, the soft hair pass, eyelashes: they go with the first holes)
      if (mesh.material.transparent || /beard|lash/i.test(mesh.name)) { this.hidden.push(mesh); continue; }
      this.items.push({ mesh, mat: mesh.material, ev: evapMaterial(mesh.material, this.U, chest) });
    }
    for (const it of this.items) it.mesh.material = it.ev;
    // accessories hang from bones: they go when the bone's part of him goes (how far each is from his chest)
    this.acc = [];
    for (const b of ch.skeleton.bones) for (const o of b.children) if (!o.isBone) this.acc.push({ o, b, vis: o.visible, d: Math.min(1, ch.rest[b.name] ? ch.rest[b.name].head.distanceTo(chest) / 0.95 : 0.5) });
    // a scatter of points on his body (rest space, bone and offset), where blood is flung from as he goes
    this.pts = [];
  }
  set(cut, gone) {
    this.U.uEvCut.value = cut; this.U.uEvGone.value = gone;
    if (gone > 0.05) for (const m of this.hidden) m.visible = false;
    for (const a of this.acc) a.o.visible = a.vis && gone * 1.08 - 0.04 < (1 - a.d) * 0.55 + 0.2;
  }
  restore() {
    for (const it of this.items) { it.mesh.material = it.mat; it.ev.dispose(); }
    for (const m of this.hidden) m.visible = true;
    for (const a of this.acc) a.o.visible = a.vis;
    this.items = [];
  }
}
