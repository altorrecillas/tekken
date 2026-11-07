// A machine bleeds oil: when the loser of a PUÑETALITY is a robot (Orión), everything of it that would be red with
// blood (the drops, the mist, the pools, the cut's insides, the stains on the winner and his props, the drops on the
// lens) is drawn as thick black oil with an amber gleam where the light comes through it thin. One remap of the
// final colour of those materials (reds become oil; nothing else changes), so every finisher's own effects work as
// they are. The director adds the sparks and the electric crackle of the cut (js/fight/fatality.js).
import * as THREE from 'three';

export const OIL_GLSL = `
vec3 pdbOil( vec3 c ) {
  float m = max( c.g, c.b );
  float red = smoothstep( 0.01, 0.06, c.r - m * 1.7 );
  float l = c.r * 0.55 + m * 0.45;
  vec3 oil = vec3( 0.05, 0.036, 0.022 ) * ( 0.35 + 2.2 * l ) + vec3( 0.95, 0.66, 0.32 ) * smoothstep( 0.3, 1.4, l ) * 0.55;
  return mix( c, oil, red );
}`;

// the remap added to a material (any kind: three's own, patched or a ShaderMaterial); returns it
export function oilPatch(mat) {
  if (!mat || mat.userData?.oil) return mat;
  mat.userData = { ...mat.userData, oil: true };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    let fs = sh.fragmentShader;
    const at = fs.indexOf('void main');
    if (at < 0) return;
    fs = fs.slice(0, at) + OIL_GLSL + '\n' + fs.slice(at);
    if (fs.includes('#include <opaque_fragment>')) fs = fs.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n\tgl_FragColor.rgb = pdbOil( gl_FragColor.rgb );');
    else { const e = fs.lastIndexOf('}'); fs = fs.slice(0, e) + '\tgl_FragColor.rgb = pdbOil( gl_FragColor.rgb );\n' + fs.slice(e); }
    sh.fragmentShader = fs;
  };
  const pk = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|oil';
  mat.needsUpdate = true;
  return mat;
}

// every material under these objects, but not those of skip (the winner, his bike...) nor a robot's glowing eyes
export function oilObjects(roots, skip) {
  const done = new Set();
  const visit = (o) => {
    if (skip.has(o) || o.userData?.noOil) return;
    for (const m of [o.material].flat()) {
      if (!m || done.has(m)) continue;
      done.add(m);
      if (m.emissive && m.emissiveIntensity > 1 && m.color && m.color.r < 0.15 && !m.userData?.oil) continue; // (his red eyes stay red)
      oilPatch(m);
    }
    for (const c of o.children) visit(c);
  };
  for (const r of roots) visit(r);
}

// the lens's drops in oil (js/fx/blood.js LensBlood draws with these)
export const LENS_OIL = { body: ['rgba(40,28,14,0.35)', 'rgba(24,16,8,0.55)', 'rgba(10,7,3,0.85)', 'rgba(6,4,2,0.55)'], glint: 'rgba(255,190,110,0.22)', spray: (a) => `rgba(14,10,5,${a})`, trail: ['rgba(14,10,5,0)', 'rgba(14,10,5,0.55)'] };
