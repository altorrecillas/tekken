// Physically based materials for fighters: skin with subsurface wrap lighting, eyes, hair, cloth.
import * as THREE from 'three';
import { addClothSway } from './anim/clothsway.js';

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
    // the hands are drier than the face: rougher, with less of the oil layer (the closed fist's thumb base no longer
    // catches the light as a grey sheen). js/anim/corskin.js marks the hands' points in skinCor.w
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSkinHand;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n\tvSkinHand = 0.0;\n\t#ifdef USE_SKINNING\n\t\tvSkinHand = 1.0 - skinCor.w;\n\t#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkinHand;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, min( 1.0, roughnessFactor + 0.16 ), vSkinHand );')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n\t#ifdef USE_CLEARCOAT\n\t\tmaterial.clearcoat *= 1.0 - 0.75 * vSkinHand;\n\t#endif');
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
  // fill: a soft frontal light from the other side of the lens, diffuse only, that opens up the eye sockets and the
  // shadow side of a face (set per frame by the game: stronger in the close-ups)
  fillDir: { value: new THREE.Vector3(0.3, 0.15, 0.94).normalize() }, fill: { value: new THREE.Color(0, 0, 0) },
};
// Per-fighter key: its own direction uniforms (a profile face on either side of the screen is lit from the
// side it faces), sharing the stage-driven colours of FIGHTER_KEY.
export function makeFighterKey() {
  return { dir: { value: FIGHTER_KEY.dir.value.clone() }, color: FIGHTER_KEY.color,
    rimDir: { value: FIGHTER_KEY.rimDir.value.clone() }, rim: FIGHTER_KEY.rim,
    fillDir: { value: FIGHTER_KEY.fillDir.value.clone() }, fill: FIGHTER_KEY.fill };
}

// costume colour change of a garment (linear colour): 1 = hue turned by uCosA.x (turns), saturation and value scaled
// by uCosA.y / uCosA.z; 2 = dyed uCosB.rgb keeping the fabric's own shading (its luminance against uCosB.a, the
// luminance of the garment's original colour)
const COSTUME_GLSL = `uniform float uCosMode; uniform vec3 uCosA; uniform vec4 uCosB;
vec3 pdbCostume( vec3 c ) {
  if ( uCosMode > 1.5 ) {
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    return uCosB.rgb * clamp( l / max( uCosB.a, 1e-4 ), 0.35, 2.2 );
  }
  vec4 K = vec4( 0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0 );
  vec4 p = mix( vec4( c.bg, K.wz ), vec4( c.gb, K.xy ), step( c.b, c.g ) );
  vec4 q = mix( vec4( p.xyw, c.r ), vec4( c.r, p.yzx ), step( p.x, c.r ) );
  float d = q.x - min( q.w, q.y );
  vec3 h = vec3( abs( q.z + ( q.w - q.y ) / ( 6.0 * d + 1e-10 ) ), d / ( q.x + 1e-10 ), q.x );
  h.x = fract( h.x + uCosA.x ); h.y = clamp( h.y * uCosA.y, 0.0, 1.0 ); h.z *= uCosA.z;
  vec4 L = vec4( 1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0 );
  vec3 r = abs( fract( h.xxx + L.xyz ) * 6.0 - L.www );
  return h.z * mix( L.xxx, clamp( r - L.xxx, 0.0, 1.0 ), h.y );
}`;
// a costume onto a built fighter: spec = { parts: { garmentName: { hue: degrees, sat, val } | { dye: [r, g, b] (sRGB),
// base: luminance of the original colour (linear) } } } (null: the original colours). Garments are the meshes of the
// fighter by name ('shirt', 'jacket', 'collar', 'shorts', 'pants', 'top', 'socks'...); '*' is any other garment.
export function applyCostume(ch, spec) {
  const parts = spec?.parts || {};
  for (const [name, mesh] of Object.entries(ch.meshes)) {
    const cos = mesh.material?.userData?.costume;
    if (!cos) continue;
    const key = Object.keys(parts).find((k) => k !== '*' && (name === k || name.startsWith(k + '_')));
    const p = key ? parts[key] : parts['*'];
    if (!p) { cos.mode.value = 0; continue; }
    if (p.dye) {
      const c = new THREE.Color().setRGB(...p.dye, THREE.SRGBColorSpace);
      cos.mode.value = 2; cos.b.value.set(c.r, c.g, c.b, p.base ?? 0.2);
    } else {
      cos.mode.value = 1; cos.a.value.set(((p.hue || 0) / 360) % 1, p.sat ?? 1, p.val ?? 1);
    }
  }
  ch.costume = spec || null;
}

// The hair cards' swing (js/anim/hairsway.js) in a vertex shader: every vertex moves by the strand tips' lag (the
// uniform sway, {value: Vector3}, in the head's rest frame) times the square of its place along the card (uv.y, 0 at
// the root and 1 at the tip), so the roots stay on the scalp. For the hair's own material and for every depth pass
// drawn from it (its shadow, the depth of field's depth), so they all move together.
export function addHairSway(sh, sway) {
  sh.uniforms.uHairSway = sway;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uHairSway;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += uHairSway * ( uv.y * uv.y );');
}

// a shadow-map depth material for swinging hair (three copies the map and the alpha test onto it per draw)
export function hairSwayDepth(sway) {
  const d = new THREE.MeshDepthMaterial();
  d.onBeforeCompile = (sh) => addHairSway(sh, sway);
  d.customProgramCacheKey = () => 'hairswayDepth';
  return d;
}

export function addFighterKey(mat, key = FIGHTER_KEY) {
  if (!mat || mat.isMeshBasicMaterial || mat.isShaderMaterial || mat.userData.fighterKey) return mat;
  mat.userData.fighterKey = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.fkDir = key.dir; sh.uniforms.fkColor = key.color;
    sh.uniforms.fkRimDir = key.rimDir; sh.uniforms.fkRim = key.rim;
    sh.uniforms.fkFillDir = key.fillDir || FIGHTER_KEY.fillDir; sh.uniforms.fkFill = key.fill || FIGHTER_KEY.fill;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 fkDir; uniform vec3 fkColor; uniform vec3 fkRimDir; uniform vec3 fkRim; uniform vec3 fkFillDir; uniform vec3 fkFill;')
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        #if defined( RE_Direct )
        {
          IncidentLight fk; fk.direction = fkDir; fk.color = fkColor; fk.visible = true;
          RE_Direct( fk, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
          float rimF = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 ) * saturate( dot( geometryNormal, fkRimDir ) + 0.25 );
          reflectedLight.directDiffuse += fkRim * rimF * ( material.diffuseContribution * 0.6 + 0.06 ); // floor: black cloth still gets an edge
          // fill: wrapped (half-Lambert, squared) so it is soft and has no edge, and no highlight of its own
          float fillF = saturate( dot( geometryNormal, fkFillDir ) * 0.5 + 0.5 );
          reflectedLight.directDiffuse += fkFill * ( ${(mat.userData.fill ?? 1).toFixed(2)} * fillF * fillF ) * material.diffuseContribution;
        }
        #endif`);
  };
  const pk = mat.customProgramCacheKey && mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = () => (pk ? pk() : '') + '|fkey' + (mat.userData.fill ?? 1);
  return mat;
}

// how much of the fill light each kind of surface takes: it is there to open up faces; a white garment given the
// whole of it glowed in the close-ups
const FILL_SHARE = { skin: 1, eye: 1, haircards: 0.7, hair: 0.7, beard: 0.7, cloth: 0.3 };
export function makeFighterMaterial(def, base, loadTex, partName, key) {
  const m = makeFighterMaterialBase(def, base, loadTex, partName);
  if (m && m.userData) m.userData.fill = FILL_SHARE[def.type] ?? 0.5;
  return addFighterKey(m, key);
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
      // the cards swing with the head (addHairSway). (The soft pass shares this uniform: js/charloader.js gives it the
      // same onBeforeCompile, and the hair's shadow and the depth of field's depth move with it too)
      const sway = m.userData.sway = { value: new THREE.Vector3() };
      m.onBeforeCompile = (sh) => addHairSway(sh, sway);
      m.customProgramCacheKey = () => 'hairsway';
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
      // the costume (js/fight/costumes.js): the garment's colours turned round the colour wheel or dyed another
      // colour, through uniforms, so changing a costume never recompiles anything
      const cos = m.userData.costume = { mode: { value: 0 }, a: { value: new THREE.Vector3(0, 1, 1) }, b: { value: new THREE.Vector4(1, 1, 1, 0.5) } };
      m.userData.cloth = true;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uCosMode = cos.mode; sh.uniforms.uCosA = cos.a; sh.uniforms.uCosB = cos.b;
        // a hem that swings (js/anim/clothsway.js, set up on the garments that hang below the waist)
        if (m.userData.clothSway) addClothSway(sh, m.userData.clothSway);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + COSTUME_GLSL)
          .replace('#include <color_fragment>', `#include <color_fragment>\n\tif ( uCosMode > 0.5 ) diffuseColor.rgb = pdbCostume( diffuseColor.rgb );\n\tif ( ! gl_FrontFacing ) diffuseColor.rgb *= ${inside};`);
      };
      m.customProgramCacheKey = () => 'clothCos' + inside + (m.userData.clothSway ? 'Sway' : '');
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
        // the share of grey strands per texel (the density map's green channel: a whiter chin), or one for the beard
        greyMapOn: { value: def.greyMap ? 1 : 0 },
      };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uni);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float shellOff;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize( objectNormal ) * shellOff;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform sampler2D densMap, strandMap; uniform float shellT, shellThr, farCov, greyFrac, greyMapOn; uniform vec2 strandScale; uniform vec3 beardDark, beardGrey;`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec4 dt = texture2D( densMap, vUv );
            float dens = dt.r, gFrac = mix( greyFrac, dt.g, greyMapOn );
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
            float grey = mix( step( fract( st.g * 17.31 ), gFrac ), gFrac, farK );
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
