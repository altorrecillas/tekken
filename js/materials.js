// Physically based materials for fighters: skin with subsurface wrap lighting, eyes, hair, cloth.
import * as THREE from 'three';

const SSS_WRAP = new THREE.Vector3(0.55, 0.26, 0.14);

// Patch the physical lighting model: per-channel wrapped diffuse (light bleeding through skin)
// plus a soft back-scatter term on thin parts (ears, nose) driven by the view direction.
const DIFFUSE_LINE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
let detailTex = null;
function addSkinSSS(mat, strength = 1, detail = null) {
  const wrap = SSS_WRAP.clone().multiplyScalar(strength);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.sssWrap = { value: wrap };
    if (detail) {
      shader.uniforms.detailMap = { value: detail.tex };
      shader.uniforms.detailScale = { value: detail.scale };
      shader.uniforms.detailStrength = { value: detail.strength };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap; uniform float detailScale; uniform float detailStrength;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          #if defined( USE_NORMALMAP_TANGENTSPACE )
            vec3 dN = texture2D( detailMap, vNormalMapUv * detailScale ).xyz * 2.0 - 1.0;
            normal = normalize( normal + tbn * vec3( dN.xy * detailStrength, 0.0 ) );
          #endif`);
    }
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
    if (!chunk.includes(DIFFUSE_LINE)) console.warn('skin SSS patch: pattern not found');
    const patched = chunk.replace(DIFFUSE_LINE, `{
        float nl = dot( geometryNormal, directLight.direction );
        vec3 w = clamp( ( vec3( nl ) + sssWrap ) / ( 1.0 + sssWrap ), 0.0, 1.0 );
        vec3 sssIrr = w * w * directLight.color;
        // translucency: light passing through thin geometry towards the viewer
        float bt = pow( saturate( dot( geometryViewDir, -normalize( directLight.direction + geometryNormal * 0.35 ) ) ), 6.0 );
        // only thin / grazing geometry transmits (ears, nose, fingers, silhouettes), not the whole camera-facing body
        bt *= pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 1.5 ) * 1.8;
        sssIrr += directLight.color * vec3( 0.55, 0.12, 0.05 ) * bt * 0.35;
        reflectedLight.directDiffuse += sssIrr * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
      }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 sssWrap;')
      .replace('#include <lights_physical_pars_fragment>', patched);
  };
  mat.customProgramCacheKey = () => 'skinSSS' + strength + (detail ? 'd' : '');
}

// Strand cross-section tile for fur-shell facial hair: R = strand profile (1 at the axis), G = per-strand random.
let strandTile = null, strandProfile = null;
function getStrandTile() {
  if (strandTile) return strandTile;
  const N = 256, prof = new Float32Array(N * N), rnd = new Float32Array(N * N);
  let seed = 0x5eed;
  const r01 = () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let k = 0; k < 720; k++) {
    const cx = r01() * N, cy = r01() * N, rad = 1.5 + r01() * 1.5, g = r01();
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = (Math.floor(cx) + dx + N) % N, y = (Math.floor(cy) + dy + N) % N;
      const ox = ((x + 0.5 - cx) % N + N * 1.5) % N - N / 2, oy = ((y + 0.5 - cy) % N + N * 1.5) % N - N / 2;
      const p = 1 - Math.hypot(ox, oy) / rad;
      const i = y * N + x;
      if (p > prof[i]) { prof[i] = p; rnd[i] = g; }
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { data[i * 4] = Math.round(prof[i] * 255); data[i * 4 + 1] = Math.round(rnd[i] * 255); data[i * 4 + 3] = 255; }
  strandTile = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  strandTile.wrapS = strandTile.wrapT = THREE.RepeatWrapping;
  strandTile.magFilter = THREE.LinearFilter; strandTile.minFilter = THREE.LinearFilter; strandTile.generateMipmaps = false;
  strandTile.needsUpdate = true;
  strandProfile = prof;
  return strandTile;
}
// fraction of the tile covered by strands at a given taper threshold (used when strands are sub-pixel)
function strandCoverage(thr) {
  let c = 0;
  for (let i = 0; i < strandProfile.length; i++) if (strandProfile[i] > thr) c++;
  return c / strandProfile.length;
}

// Character key light: a camera-relative light that only fighters receive (like light channels in a
// commercial engine), so stages can keep contrasty sun/shadow lighting while faces stay readable.
// dir is in view space (towards the light), updated by the stage every frame.
export const FIGHTER_KEY = {
  dir: { value: new THREE.Vector3(-0.4, 0.6, 0.7).normalize() }, color: { value: new THREE.Color(0, 0, 0) },
  // camera-relative rim (kicker) that separates the silhouette from the set
  rimDir: { value: new THREE.Vector3(0.55, 0.35, -0.75).normalize() }, rim: { value: new THREE.Color(0, 0, 0) },
};
// Per-fighter key: its own direction uniforms (a profile face on either side of the screen is lit from the
// side it faces), sharing the stage-driven colours of FIGHTER_KEY.
export function makeFighterKey() {
  return { dir: { value: FIGHTER_KEY.dir.value.clone() }, color: FIGHTER_KEY.color,
    rimDir: { value: FIGHTER_KEY.rimDir.value.clone() }, rim: FIGHTER_KEY.rim };
}

export function addFighterKey(mat, key = FIGHTER_KEY) {
  if (!mat || mat.isMeshBasicMaterial || mat.isShaderMaterial || mat.userData.fighterKey) return mat;
  mat.userData.fighterKey = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.fkDir = key.dir; sh.uniforms.fkColor = key.color;
    sh.uniforms.fkRimDir = key.rimDir; sh.uniforms.fkRim = key.rim;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 fkDir; uniform vec3 fkColor; uniform vec3 fkRimDir; uniform vec3 fkRim;')
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        #if defined( RE_Direct )
        {
          IncidentLight fk; fk.direction = fkDir; fk.color = fkColor; fk.visible = true;
          RE_Direct( fk, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
          float rimF = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 ) * saturate( dot( geometryNormal, fkRimDir ) + 0.25 );
          reflectedLight.directDiffuse += fkRim * rimF * ( material.diffuseContribution * 0.6 + 0.06 ); // floor: black cloth still gets an edge
        }
        #endif`);
  };
  const pk = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|fkey';
  return mat;
}

export function makeFighterMaterial(def, base, loadTex, partName, key) {
  return addFighterKey(makeFighterMaterialBase(def, base, loadTex, partName), key);
}

function makeFighterMaterialBase(def, base, loadTex, partName) {
  const url = (p) => (p.startsWith('../') ? base + p : base + p);
  switch (def.type) {
    case 'skin': {
      const m = new THREE.MeshPhysicalMaterial({
        map: loadTex(url(def.map)),
        roughness: 0.52,
        specularIntensity: 0.55,
        specularColor: new THREE.Color(1, 0.95, 0.92),
        sheen: 0.25,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0.9, 0.55, 0.45),
        // second, tighter specular lobe (skin oil layer)
        clearcoat: 0.12, clearcoatRoughness: 0.38,
      });
      if (def.normalMap) {
        m.normalMap = loadTex(url(def.normalMap), false);
        const ns = def.head ? 0.3 : 0.26; // body: pores stay subtle at close range (no leathery forearms)
        m.normalScale = new THREE.Vector2(ns, ns);
      }
      if (def.roughMap) {
        m.roughnessMap = loadTex(url(def.roughMap), false);
        m.roughness = 1.0;
      }
      if (!detailTex) { detailTex = loadTex('assets/shared/skin_detail_n.png', false); detailTex.wrapS = detailTex.wrapT = THREE.RepeatWrapping; }
      addSkinSSS(m, 1, def.normalMap ? { tex: detailTex, scale: def.head ? 26.0 : 18.0, strength: def.head ? 0.2 : 0.16 } : null);
      return m;
    }
    case 'eye':
      return new THREE.MeshPhysicalMaterial({
        // the iris must stay dark brown: no clearcoat haze, the cornea shell provides the wet reflection
        // diffuse only: the cornea shell supplies the wet highlight, a second specular layer greys the iris
        map: loadTex(url(def.map)), color: 0xdcd6cf, roughness: 0.55, vertexColors: true, envMapIntensity: 0, specularIntensity: 0,
      });
    case 'cornea':
      return new THREE.MeshPhysicalMaterial({
        color: 0x000000, roughness: 0.04, metalness: 0, specularIntensity: 1, envMapIntensity: 0.06,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
    case 'lash': {
      const m = new THREE.MeshStandardMaterial({
        map: loadTex(url(def.map)), color: 0x222222, roughness: 0.8, transparent: true, alphaTest: 0.15,
        side: THREE.DoubleSide, depthWrite: false,
      });
      return m;
    }
    case 'teeth':
      return new THREE.MeshPhysicalMaterial({
        map: loadTex(url(def.map)), roughness: 0.3, clearcoat: 0.6, alphaTest: 0.5,
      });
    case 'hair': {
      const tint = new THREE.Color(...(def.tint || [0.2, 0.15, 0.1]));
      const m = new THREE.MeshPhysicalMaterial({
        map: loadTex(url(def.map)),
        color: 0xffffff,
        roughness: 0.5, alphaTest: 0.5, side: THREE.DoubleSide,
        sheen: 0.25, sheenRoughness: 0.4, sheenColor: tint.clone().multiplyScalar(1.6).addScalar(0.04),
        specularIntensity: 0.35, specularColor: tint.clone().lerp(new THREE.Color(1, 1, 1), 0.5),
      });
      if (def.normalMap) { m.normalMap = loadTex(url(def.normalMap), false); m.normalScale = new THREE.Vector2(0.6, 0.6); }
      return m;
    }
    case 'haircards': {
      const tint = new THREE.Color(...(def.tint || [0.05, 0.035, 0.025]));
      const m = new THREE.MeshPhysicalMaterial({
        map: loadTex(url(def.map)), color: tint.clone().multiplyScalar(1.15),
        roughness: 0.5, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide,
        vertexColors: true, anisotropy: 0.5, anisotropyRotation: 0,
        specularIntensity: 0.22, specularColor: tint.clone().lerp(new THREE.Color(1, 0.92, 0.85), 0.5),
        sheen: 0.08, sheenRoughness: 0.45, sheenColor: tint.clone().multiplyScalar(0.9).addScalar(0.01),
      });
      return m;
    }
    case 'cloth': {
      const m = new THREE.MeshPhysicalMaterial({
        map: def.map ? loadTex(url(def.map)) : null,
        color: def.color ? new THREE.Color(...def.color) : 0xffffff,
        roughness: def.roughMap ? 1.0 : (def.roughness ?? 0.8),
        sheen: (def.sheen ?? 0.5) * 0.6, sheenRoughness: 0.75,
        sheenColor: new THREE.Color(...(def.sheenColor || [0.5, 0.5, 0.5])).multiplyScalar(0.5),
        specularIntensity: 0.35,
        // two-sided: where a neckline or sleeve stands off the body the inside of the fabric must show,
        // not a see-through slit onto the background
        side: def.double === false ? THREE.FrontSide : THREE.DoubleSide,
        shadowSide: THREE.BackSide, // shadow map as before (no extra acne on the lit outside)
        metalness: 0,
        // garments win depth ties against the skin at their edges
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      });
      // the inside of a garment sits in the body's shadow: darken back faces. Open sheets (collar leaves, flaps)
      // show their underside to the light, so they only darken a little
      const inside = def.double ? '0.8' : '0.3';
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n\tif ( ! gl_FrontFacing ) diffuseColor.rgb *= ${inside};`);
      };
      m.customProgramCacheKey = () => 'clothInside' + inside;
      if (def.normalMap) {
        m.normalMap = loadTex(url(def.normalMap), false);
        const ns = 0.55 * (def.normalScale ?? 1);
        m.normalScale = new THREE.Vector2(ns, ns);
      }
      if (def.roughMap) m.roughnessMap = loadTex(url(def.roughMap), false);
      return m;
    }
    case 'beard': {
      // one fur shell: the geometry is pushed out along the normal and only strand cross-sections survive
      const n = def.shells || 6, t = ((def.layer ?? 0) + 1) / n;
      const thr = 0.12 + 0.6 * Math.pow(t, 1.25);
      const tile = getStrandTile();
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, transparent: true, depthWrite: false });
      m.defines = { USE_UV: '' };
      const uni = {
        densMap: { value: loadTex(url(def.map), false) }, strandMap: { value: tile },
        shellOff: { value: (def.length || 0.0025) * t }, shellT: { value: t }, shellThr: { value: thr }, farCov: { value: strandCoverage(thr) },
        strandScale: { value: new THREE.Vector2(...(def.scale || [40, 80])) },
        beardDark: { value: new THREE.Color().setRGB(...def.color, THREE.SRGBColorSpace) },
        beardGrey: { value: new THREE.Color().setRGB(...(def.greyColor || [0.45, 0.44, 0.43]), THREE.SRGBColorSpace) }, greyFrac: { value: def.grey || 0 },
      };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uni);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float shellOff;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize( objectNormal ) * shellOff;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform sampler2D densMap, strandMap; uniform float shellT, shellThr, farCov, greyFrac; uniform vec2 strandScale; uniform vec3 beardDark, beardGrey;`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float dens = texture2D( densMap, vUv ).r;
            vec2 suv = vUv * strandScale + vec2( 0.0, 0.01 * shellT );
            vec4 st = textureLod( strandMap, suv, 0.0 );
            // strands smaller than a pixel: switch to their expected coverage instead of aliasing
            vec2 fw = fwidth( suv ) * 256.0;
            float farK = smoothstep( 1.2, 4.0, max( fw.x, fw.y ) );
            float w = max( fwidth( st.r ), 0.03 );
            float aNear = step( st.g, dens ) * smoothstep( shellThr - w, shellThr + w, st.r );
            // far: soft coverage broken up by clumps a few millimetres across
            float clump = textureLod( strandMap, suv * 0.09 + 0.37, 0.0 ).r;
            float a = mix( aNear, farCov * dens * ( 0.2 + 0.55 * smoothstep( 0.0, 0.6, clump ) ), farK );
            if ( a < 0.01 ) discard;
            float grey = mix( step( fract( st.g * 17.31 ), greyFrac ), greyFrac, farK );
            vec3 c = mix( beardDark, beardGrey, grey ) * mix( 0.5, 1.0, shellT );
            diffuseColor = vec4( c, min( a, 1.0 ) );
          }`);
      };
      m.customProgramCacheKey = () => 'beardShell';
      return m;
    }
    default:
      return new THREE.MeshStandardMaterial({ color: 0xff00ff });
  }
}
