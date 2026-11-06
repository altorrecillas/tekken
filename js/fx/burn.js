// A fighter burnt by Orión's eye beams (his PUÑETALITY, js/fight/fatality.js): drawn only.
// hot (0..1) and hotP (a point of the rest pose): where the beams are on him, the skin and clothes glowing red-hot round
// it; char (0..1): the burn spreading from where they first struck, the body going black, cracked with glowing embers,
// its front edge a line of fire; heat (0..1) how hot the embers still are; ash (0..1): the charred body crumbling to
// ash from the head down, the edge glowing. The shadow goes as he does (a depth material that crumbles with him).
// Patched copies of his materials, made as the move starts (their shaders are built behind its moment of black).
import * as THREE from 'three';

const NOISE = `
float bnH( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float bnN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  float a = bnH( i.xy + i.z * 17.1 ), b = bnH( i.xy + vec2( 1, 0 ) + i.z * 17.1 ), c = bnH( i.xy + vec2( 0, 1 ) + i.z * 17.1 ), d = bnH( i.xy + vec2( 1, 1 ) + i.z * 17.1 );
  float e = bnH( i.xy + ( i.z + 1.0 ) * 17.1 ), g = bnH( i.xy + vec2( 1, 0 ) + ( i.z + 1.0 ) * 17.1 ), h = bnH( i.xy + vec2( 0, 1 ) + ( i.z + 1.0 ) * 17.1 ), k = bnH( i.xy + vec2( 1, 1 ) + ( i.z + 1.0 ) * 17.1 );
  return mix( mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y ), mix( mix( e, g, f.x ), mix( h, k, f.x ), f.y ), f.z ); }
uniform float uBnChar, uBnHeat, uBnAsh, uBnHot, uBnTime, uBnTop;
uniform vec3 uBnHit, uBnHotP;
// the crumbling: from the top of him down, ragged
float bnAshV( vec3 P ) { return P.y / uBnTop + ( bnN( P * 9.0 ) - 0.5 ) * 0.22 + ( bnN( P * 31.0 ) - 0.5 ) * 0.08; }
float bnAshT() { return 1.12 - uBnAsh * 1.3; }`;

function burnMaterial(mat, U) {
  const m = mat.clone();
  m.userData = { ...mat.userData };
  if (mat.defines) m.defines = { ...mat.defines };
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBnP; varying vec3 vBnN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBnP = position; vBnN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBnP; varying vec3 vBnN;${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float bnV = bnAshV( vBnP ), bnT = bnAshT();
        if ( uBnAsh > 0.0 && bnV > bnT ) discard;
        float bnRim = uBnAsh > 0.0 ? 1.0 - smoothstep( 0.0, 0.035, bnT - bnV ) : 0.0;
        float bnNz = bnN( vBnP * 14.0 ) * 0.6 + bnN( vBnP * 41.0 ) * 0.4;
        // the burn from where the beams struck: a front with a ragged edge
        float bnD = length( ( vBnP - uBnHit ) * vec3( 1.0, 0.75, 1.3 ) );
        float bnF = uBnChar * 1.6 - ( bnD * 1.25 + bnNz * 0.4 );
        float bnC = smoothstep( 0.0, 0.14, bnF );
        float bnFront = uBnChar > 0.0 ? ( 1.0 - smoothstep( 0.0, 0.07, abs( bnF - 0.03 ) ) ) : 0.0;
        // embers: glowing cracks over the charred parts (ridges of noise), flickering
        float bnR = abs( bnN( vBnP * 17.0 + vec3( 0.0, uBnTime * 0.05, 0.0 ) ) - 0.5 ), bnR2 = abs( bnN( vBnP * 43.0 ) - 0.5 );
        float bnCrack = ( 1.0 - smoothstep( 0.015, 0.05, bnR ) ) + 0.6 * ( 1.0 - smoothstep( 0.01, 0.035, bnR2 ) );
        float bnFl = 0.75 + 0.25 * sin( uBnTime * 9.0 + bnNz * 20.0 );
        // red-hot where the beams are right now (on the side of him they face)
        float bnHot = uBnHot * exp( -pow( length( vBnP - uBnHotP ) / 0.13, 2.0 ) ) * smoothstep( -0.3, 0.4, dot( normalize( vBnN ), normalize( vec3( vBnP.x - uBnHotP.x, 0.0, 1.0 ) ) ) );`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // charred: black, a grey bloom of ash in places, the clothes' colour gone
        vec3 bnChar = mix( vec3( 0.018, 0.015, 0.013 ), vec3( 0.09, 0.085, 0.08 ), smoothstep( 0.55, 0.9, bnNz ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.55, 0.32, 0.22 ), smoothstep( -0.25, 0.0, bnF ) * ( 1.0 - bnC ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, bnChar, bnC );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.95, bnC );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor = mix( metalnessFactor, 0.0, bnC );')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n\t#ifdef USE_SHEEN\n\t\tmaterial.sheenColor *= 1.0 - bnC;\n\t#endif')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = mix( totalEmissiveRadiance, vec3( 0.0 ), bnC );
        vec3 bnEmb = vec3( 1.0, 0.32, 0.05 );
        totalEmissiveRadiance += bnEmb * bnCrack * bnC * uBnHeat * bnFl * 1.5;
        totalEmissiveRadiance += vec3( 1.0, 0.45, 0.1 ) * bnFront * uBnHeat * 3.5;
        totalEmissiveRadiance += mix( vec3( 1.0, 0.15, 0.02 ), vec3( 1.0, 0.75, 0.45 ), bnHot * bnHot ) * bnHot * 2.2;
        totalEmissiveRadiance += mix( vec3( 1.0, 0.35, 0.05 ), vec3( 1.0, 0.9, 0.7 ), bnRim ) * bnRim * 6.0;`);
    if (!sh.fragmentShader.includes('bnV > bnT')) console.warn('burn: shader not patched', mat.type);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|burn';
  return m;
}
// the shadow: the same crumbling (the depth pass of his meshes)
function burnDepth(U) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBnP;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvBnP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBnP;${NOISE}`).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif ( uBnAsh > 0.0 && bnAshV( vBnP ) > bnAshT() ) discard;');
  };
  m.customProgramCacheKey = () => 'burnDepth';
  return m;
}

export class Burn {
  constructor(f) {
    this.f = f; const ch = this.ch = f.ch;
    const chest = ch.rest.spine02?.head || new THREE.Vector3(0, 1.25, 0);
    const top = (ch.rest.head?.head?.y || 1.6) + 0.28;
    this.U = { uBnChar: { value: 0 }, uBnHeat: { value: 0 }, uBnAsh: { value: 0 }, uBnHot: { value: 0 }, uBnTime: { value: 0 }, uBnTop: { value: top },
      uBnHit: { value: chest.clone().add(new THREE.Vector3(0, 0, 0.1)) }, uBnHotP: { value: chest.clone() } };
    this.items = []; this.hidden = [];
    const depth = burnDepth(this.U);
    for (const mesh of Object.values(ch.meshes)) {
      if (!mesh.isSkinnedMesh) continue;
      // (hair cards, fur shells, eyelashes: they go up in flames at once when the fire reaches the head)
      if (mesh.material.transparent || /beard|lash|hair|brow/i.test(mesh.name)) { this.hidden.push(mesh); continue; }
      this.items.push({ mesh, mat: mesh.material, bm: burnMaterial(mesh.material, this.U), cd: mesh.customDepthMaterial });
    }
    for (const it of this.items) { it.mesh.material = it.bm; it.mesh.customDepthMaterial = depth; }
    this.depth = depth;
    // accessories on bones (glasses, a watch...): they go with the ash at their height
    this.acc = [];
    for (const b of ch.skeleton.bones) for (const o of b.children) if (!o.isBone) this.acc.push({ o, vis: o.visible, y: ch.rest[b.name]?.head.y ?? 1 });
    this.chest = chest; this.top = top;
  }
  // where the beams are on him: a point of his rest pose (the nearest of his bones', pushed out to his front)
  set({ char = 0, heat = 0, ash = 0, hot = 0, hotP = null, time = 0, hairGone = false }) {
    const U = this.U;
    U.uBnChar.value = char; U.uBnHeat.value = heat; U.uBnAsh.value = ash; U.uBnHot.value = hot; U.uBnTime.value = time;
    if (hotP) U.uBnHotP.value.copy(hotP);
    for (const m of this.hidden) m.visible = !hairGone;
    // (a watch, a medal, glasses: burnt away once the burn has covered him)
    const cut = (1.12 - ash * 1.3) * this.top;
    for (const a of this.acc) a.o.visible = a.vis && char < 0.8 && (ash <= 0 || a.y < cut);
  }
  restore() {
    for (const it of this.items) { it.mesh.material = it.mat; it.mesh.customDepthMaterial = it.cd; it.bm.dispose(); }
    this.depth?.dispose();
    for (const m of this.hidden) m.visible = true;
    for (const a of this.acc) a.o.visible = a.vis;
    this.items = [];
  }
}
