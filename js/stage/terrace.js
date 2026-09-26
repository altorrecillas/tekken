// "La Terraza": Mediterranean pool terrace at sunset (inspired by the fighters' photos).
import * as THREE from 'three';
import { FIGHTER_KEY } from '../materials.js';
import { createFightSun, aimFightSun } from '../engine/sunshadow.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEX = 'assets/stage/';
const loader = new THREE.TextureLoader();
const pending = [];
function tex(name, { repeat = [1, 1], srgb = true } = {}) {
  let done;
  pending.push(new Promise(r => { done = r; setTimeout(r, 20000); }));
  const t = loader.load(TEX + name, () => done(), undefined, () => done());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
function pbr(name, repeat, extra = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex(`${name}_a.jpg`, { repeat }),
    normalMap: tex(`${name}_n.jpg`, { repeat, srgb: false }),
    roughnessMap: tex(`${name}_orm.jpg`, { repeat, srgb: false }),
    aoMap: tex(`${name}_orm.jpg`, { repeat, srgb: false }),
    roughness: 1, metalness: 0, ...extra,
  });
  return m;
}

// ------------------------------------------------------------------ sky
const SkyShader = {
  uniforms: {
    sunDir: { value: new THREE.Vector3() }, time: { value: 0 },
    zenith: { value: new THREE.Color(0.06, 0.1, 0.26) }, horizon: { value: new THREE.Color(1.0, 0.5, 0.22) },
    ground: { value: new THREE.Color(0.35, 0.22, 0.16) }, sunColor: { value: new THREE.Color(1.0, 0.72, 0.42) },
  },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `
    uniform vec3 sunDir, zenith, horizon, ground, sunColor; uniform float time; varying vec3 vDir;
    float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
    float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;
      float sd = max(dot(d, sunDir), 0.0);
      // base gradient: warm near the horizon, much warmer towards the sun
      float hz = pow(1.0 - max(h, 0.0), 5.0);
      vec3 col = mix(zenith, horizon, hz);
      col = mix(col, vec3(0.62, 0.42, 0.55), pow(1.0 - max(h,0.0), 2.2) * (1.0 - sd) * 0.25); // belt of venus
      col += sunColor * pow(sd, 8.0) * 0.35 * (1.0 - max(h,0.0));
      col += sunColor * pow(sd, 90.0) * 0.6;
      col += vec3(1.6, 1.2, 0.85) * smoothstep(0.9994, 0.99975, sd) * 3.5; // sun disc
      // clouds: streaks of sunset stratocumulus low over the sea (where a fight camera actually sees the sky),
      // shaded by a second sample taken towards the sun: lit gold rims, lilac undersides
      if (h > 0.0) {
        vec2 uv = d.xz / (h + 0.08);
        uv *= vec2(0.55, 1.25);
        vec3 q = vec3(uv * 0.8 + vec2(time * 0.004, 0.0), time * 0.002);
        float n0 = fbm(q);
        float n1 = fbm(q + vec3(normalize(sunDir.xz + 1e-4) * 0.12, 0.0));
        float c = smoothstep(0.4, 0.62, n0) * smoothstep(0.0, 0.07, h) * (1.0 - smoothstep(0.4, 0.8, h));
        float lightness = clamp(0.5 + (n0 - n1) * 5.0, 0.0, 1.0);
        vec3 shade = vec3(0.46, 0.3, 0.42);
        vec3 lit = mix(vec3(1.05, 0.6, 0.48), vec3(1.6, 0.86, 0.5), pow(sd, 4.0));
        vec3 cc = mix(shade, lit, lightness * (0.55 + 0.45 * pow(sd, 2.0)));
        col = mix(col, cc, c * 0.9);
      } else {
        col = mix(horizon * 0.8, ground, smoothstep(0.0, -0.2, h));
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// ------------------------------------------------------------------ water
const PoolReflectShader = {
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tNormal: { value: null }, uTime: { value: 0 } },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWPos; varying vec2 vUv0;
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 ); vUv0 = uv;
      vec4 wp = modelMatrix * vec4( position, 1.0 ); vWPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse, tNormal; uniform float uTime; varying vec4 vUv; varying vec3 vWPos; varying vec2 vUv0;
    void main() {
      vec2 u1 = vUv0 * vec2( 3.0, 1.5 ) + vec2( uTime * 0.021, uTime * 0.013 );
      vec2 u2 = vUv0 * vec2( 5.1, 2.55 ) + vec2( -uTime * 0.017, uTime * 0.024 );
      vec2 n = ( texture2D( tNormal, u1 ).xy + texture2D( tNormal, u2 ).xy - 1.0 );
      vec4 uv = vUv; uv.xy += n * 0.007 * uv.w;
      // 4-tap blur: rippled water never mirrors crisp detail
      vec2 px = vec2( 0.0025 * uv.w, 0.0 );
      vec3 refl = ( texture2DProj( tDiffuse, uv + vec4( px, 0.0, 0.0 ) ).rgb + texture2DProj( tDiffuse, uv - vec4( px, 0.0, 0.0 ) ).rgb
        + texture2DProj( tDiffuse, uv + vec4( px.yx, 0.0, 0.0 ) ).rgb + texture2DProj( tDiffuse, uv - vec4( px.yx, 0.0, 0.0 ) ).rgb ) * 0.25;
      vec3 V = normalize( cameraPosition - vWPos );
      float fres = 0.02 + 0.98 * pow( 1.0 - clamp( V.y, 0.0, 1.0 ), 5.0 );
      refl = min( refl, vec3( 3.0 ) ); // the low sun must not bloom into a disc
      gl_FragColor = vec4( refl * vec3( 0.45, 0.75, 0.8 ), clamp( fres * 0.8, 0.0, 0.38 ) );
    }`,
};

function waterMaterial(normalTex) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.02, 0.35, 0.42), roughness: 0.09, metalness: 0, transmission: 0,
    transparent: true, opacity: 0.82, normalMap: normalTex, normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.3, specularIntensity: 1,
  });
  m.userData.time = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.time;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <normal_fragment_maps>', `
        vec2 wuv1 = vNormalMapUv * 1.0 + vec2(uTime * 0.021, uTime * 0.013);
        vec2 wuv2 = vNormalMapUv * 1.7 + vec2(-uTime * 0.017, uTime * 0.024);
        vec3 mapN = normalize((texture2D(normalMap, wuv1).xyz * 2.0 - 1.0) + (texture2D(normalMap, wuv2).xyz * 2.0 - 1.0));
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );`)
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        diffuseColor.a = mix(0.72, 0.97, fres);
        #include <opaque_fragment>`);
  };
  return m;
}

function waterNormals() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); const img = g.createImageData(n, n);
  const H = new Float32Array(n * n);
  const waves = Array.from({ length: 14 }, () => ({ kx: Math.round((Math.random() - 0.5) * 12), ky: Math.round((Math.random() - 0.5) * 12), a: Math.random(), p: Math.random() * 6.28 }));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let h = 0; for (const w of waves) h += w.a * Math.sin((w.kx * x + w.ky * y) / n * Math.PI * 2 + w.p) / (1 + Math.hypot(w.kx, w.ky) * 0.3);
    H[y * n + x] = h;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = H[y * n + (x + 1) % n] - H[y * n + (x + n - 1) % n];
    const dy = H[((y + 1) % n) * n + x] - H[((y + n - 1) % n) * n + x];
    const v = [-dx * 1.5, dy * 1.5, 1]; const l = Math.hypot(...v);
    const i = (y * n + x) * 4;
    img.data[i] = (v[0] / l * 0.5 + 0.5) * 255; img.data[i + 1] = (v[1] / l * 0.5 + 0.5) * 255; img.data[i + 2] = (v[2] / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1.5);
  return t;
}

// caustics on the pool floor (procedural voronoi-ish pattern)
function addCaustics(mat) {
  mat.userData.time = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = mat.userData.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTime; varying vec3 vWPos;
      vec2 h2(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
      float caust(vec2 p){ vec2 i = floor(p), f = fract(p); float m = 8.0;
        for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++){ vec2 g = vec2(x,y); vec2 o = h2(i+g); o = 0.5+0.5*sin(uTime*0.9+6.2831*o); m = min(m, length(g+o-f)); }
        return m; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float c1 = caust(vWPos.xz * 2.2); float c2 = caust(vWPos.xz * 2.9 + 3.1);
        float cs = pow(1.0 - min(c1, c2), 6.0);
        totalEmissiveRadiance += vec3(0.55, 0.85, 0.9) * cs * 0.9;`);
  };
}

// ------------------------------------------------------------------ canvas textures for props
function facadeWindowsTex(base, shutter) {
  // albedo + an emissive layer with a few warm lit windows (it is dusk: the town lights up)
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const e = document.createElement('canvas'); e.width = 512; e.height = 512;
  const g = c.getContext('2d'), ge = e.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 6); }
  for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 2; fx++) {
    const x = 70 + fx * 250, y = 70 + fy * 250;
    g.fillStyle = '#1b2026'; g.fillRect(x, y, 120, 160);
    if (Math.random() < 0.45) {
      const warm = ['#ffb25e', '#ffc98a', '#ff9f4a', '#ffe0b0'][Math.floor(Math.random() * 4)];
      g.fillStyle = 'rgba(255,190,120,0.35)'; g.fillRect(x + 6, y + 6, 108, 148);
      const gr = ge.createLinearGradient(x, y, x, y + 160); gr.addColorStop(0, warm); gr.addColorStop(1, '#6a3a1a');
      ge.fillStyle = gr; ge.fillRect(x + 6, y + 6, 108, 148);
      // curtain / window cross
      ge.fillStyle = '#000'; ge.fillRect(x + 57, y + 6, 6, 148); ge.fillRect(x + 6, y + 70, 108, 5);
      if (Math.random() < 0.5) { ge.fillStyle = 'rgba(0,0,0,0.55)'; ge.fillRect(x + 6, y + 6, 40, 148); }
    }
    g.fillStyle = shutter;
    g.fillRect(x - 46, y - 4, 44, 168); g.fillRect(x + 122, y - 4, 44, 168);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (let k = 0; k < 20; k++) { g.beginPath(); g.moveTo(x - 46, y + k * 8.4); g.lineTo(x - 2, y + k * 8.4); g.moveTo(x + 122, y + k * 8.4); g.lineTo(x + 166, y + k * 8.4); g.stroke(); }
    g.fillStyle = '#e9e6de'; g.fillRect(x - 8, y + 160, 136, 10);
    if (fy === 0) { g.strokeStyle = '#222'; g.lineWidth = 3; for (let k = 0; k <= 12; k++) { g.beginPath(); g.moveTo(x - 10 + k * 11.6, y + 110); g.lineTo(x - 10 + k * 11.6, y + 168); g.stroke(); } g.beginPath(); g.moveTo(x - 12, y + 110); g.lineTo(x + 132, y + 110); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const te = new THREE.CanvasTexture(e); te.colorSpace = THREE.SRGBColorSpace; te.anisotropy = 8;
  return { map: t, emissive: te };
}

function frondTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 512);
  g.strokeStyle = '#4b5b22'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 512); g.lineTo(64, 0); g.stroke();
  for (let i = 0; i < 70; i++) {
    const y = 500 - i * 7; const len = 58 * Math.sin((i / 70) * Math.PI) + 8;
    for (const s of [-1, 1]) {
      const gr = g.createLinearGradient(64, y, 64 + s * len, y - 22);
      gr.addColorStop(0, '#3f5a1c'); gr.addColorStop(1, '#6f8a2e');
      g.strokeStyle = gr; g.lineWidth = 4.5;
      g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + s * len * 0.5, y - 6, 64 + s * len, y - 24); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function leafClusterTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 320; i++) {
    const a = Math.random() * 6.28, r = Math.random() * 110;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    const sh = 0.5 + Math.random() * 0.5;
    g.fillStyle = `rgb(${Math.round(40 * sh + 20)},${Math.round(90 * sh + 30)},${Math.round(30 * sh + 15)})`;
    g.beginPath(); g.ellipse(x, y, 9, 4, Math.random() * 6.28, 0, 6.28); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------------------ stage
export class TerraceStage {
  constructor(renderer, scene, quality = 'high') {
    this.renderer = renderer; this.scene = scene; this.quality = quality;
    this.shadowSize = { low: 1024, medium: 1024, high: 2048, ultra: 2048 }[quality] || 2048;
    this.group = new THREE.Group(); this.group.name = 'stage';
    scene.add(this.group);
    this.arenaRadius = 6.2;
    this.t = 0;
    this.koView = new THREE.Vector3(0, 0, -1); // KO shots look towards the showpiece (pool and sunset / finish arch)
    this.animated = [];
    // low sunset sun in the backdrop (camera looks towards -z at round start)
    this.sunDir = new THREE.Vector3(-0.42, 0.2, -1).normalize();
    this.buildSky(); this.buildLights(); this.buildGround(); this.buildPool(); this.buildWalls();
    this.buildTown(); this.buildVegetation(); this.buildProps(); this.buildFestoons(); this.dressWalls();
    // warm but not monochrome: a dustier, less saturated haze keeps the sunset from turning everything orange
    scene.fog = new THREE.FogExp2(new THREE.Color(0.74, 0.58, 0.5), 0.004);
  }
  ready() { return Promise.all(pending); }
  // walkable space: the pool (plus its coping) and the walls block fighters and ragdoll joints of radius r
  clampWalk(p, r = 0) {
    const P = this.pool, m = 0.3 + r;
    const x0 = P.x0 - m, x1 = P.x1 + m, z0 = P.z0 - m, z1 = P.z1 + m;
    if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
      // push out through the nearest edge
      const d = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], k = d.indexOf(Math.min(...d));
      if (k === 0) p.x = x0; else if (k === 1) p.x = x1; else if (k === 2) p.z = z0; else p.z = z1;
    }
    p.x = THREE.MathUtils.clamp(p.x, -12.2 + r, 12.2 - r);
    p.z = THREE.MathUtils.clamp(p.z, P.z0 - 1.4 + r, 11.2 - r);
    return p;
  }
  // cinematic cameras stay inside the walls and in front of the balustrade and the house
  clampCam(p) {
    p.x = THREE.MathUtils.clamp(p.x, -11.8, 11.8);
    p.z = THREE.MathUtils.clamp(p.z, this.pool.z0 - 1.0, 10.8);
    return p;
  }

  buildSky() {
    const m = new THREE.ShaderMaterial({ ...SkyShader, uniforms: THREE.UniformsUtils.clone(SkyShader.uniforms), side: THREE.BackSide, depthWrite: false, fog: false });
    m.uniforms.sunDir.value.copy(this.sunDir);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), m);
    sky.renderOrder = -10; sky.frustumCulled = false;
    this.sky = sky; this.group.add(sky);
    this.animated.push((dt) => { m.uniforms.time.value += dt; sky.position.copy(this.cameraPos || new THREE.Vector3()); });
  }

  buildLights() {
    // SUN: warm, low, behind the fighters -> rim light + long shadows towards the camera
    // two-cascade sun: fine tile on the fighters, wide tile keeps the palms, balustrade and loungers shadowed
    const sun = createFightSun(new THREE.Color(1.0, 0.7, 0.42), 5.6, this.shadowSize);
    this.sun = sun;
    this.group.add(sun); if (sun.target) this.group.add(sun.target);
    aimFightSun(sun, this.sunDir, new THREE.Vector3(), 2.6);
    // character key light (fighters only, see FIGHTER_KEY): warm-white from the camera side
    this.keyColor = new THREE.Color(1.0, 0.88, 0.76); this.keyIntensity = 1.35;
    // cool sky fill in the shadows (contrast of temperature against the orange sun)
    const hemi = new THREE.HemisphereLight(new THREE.Color(0.44, 0.56, 0.79), new THREE.Color(0.48, 0.29, 0.21), 0.52);
    this.group.add(hemi);
    // subtle warm bounce from the terracotta floor
    const bounce = new THREE.DirectionalLight(new THREE.Color(1.0, 0.55, 0.35), 0.28);
    bounce.position.set(0, -3, 2);
    this.group.add(bounce);
  }

  followShadow(center, spread = 3) {
    // the fine cascade follows the fighters (high texel density, crisp contact shadows)
    aimFightSun(this.sun, this.sunDir, center, Math.max(2.4, spread * 0.5 + 1.6));
  }

  followCamera(camera, center) {
    // character key light (fighters only): camera-relative, 35 deg to the left of the lens and ~40 deg up
    FIGHTER_KEY.dir.value.set(-0.44, 0.63, 0.64).normalize();
    FIGHTER_KEY.color.value.copy(this.keyColor).multiplyScalar(this.keyIntensity * (this.keyBoost || 1));
    FIGHTER_KEY.rim.value.setRGB(1.0, 0.62, 0.36).multiplyScalar(0.9);
  }


  buildGround() {
    const floorMat = pbr('terracotta', [20, 20], { envMapIntensity: 0.6, color: new THREE.Color(0.86, 0.84, 0.84), roughness: 1.15 }); // no glassy glare at grazing sun
    floorMat.normalScale = new THREE.Vector2(0.45, 0.45);
    this.floorMat = floorMat;
    // floor with a hole for the pool: build as 4 rectangles around the pool rect
    const P = this.pool = { x0: -4.5, x1: 4.5, z0: -9.2, z1: -5.2 };
    const W = 40;
    const rects = [
      [-W / 2, W / 2, P.z1, W / 2], [-W / 2, W / 2, -W / 2, P.z0], [-W / 2, P.x0, P.z0, P.z1], [P.x1, W / 2, P.z0, P.z1],
    ];
    const geos = rects.map(([x0, x1, z0, z1]) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      // world-space UVs so tiles line up
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + 0.5, -pos.getZ(i) / W + 0.5);
      return g;
    });
    const floor = new THREE.Mesh(mergeGeometries(geos), floorMat);
    floor.receiveShadow = true;
    this.group.add(floor);
    // arena marking: faint worn circle where people usually stand (subtle)
  }

  buildPool() {
    const P = this.pool;
    const depth = 1.4, wl = -0.12;
    const tileMat = pbr('pooltile', [6, 2], { envMapIntensity: 0.8 });
    const floorTile = pbr('pooltile', [8, 4], {});
    addCaustics(floorTile);
    this.animated.push((dt) => { floorTile.userData.time.value += dt; });
    const w = P.x1 - P.x0, d = P.z1 - P.z0;
    const cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
    const walls = [
      [w, depth, [cx, -depth / 2, P.z1], 0], [w, depth, [cx, -depth / 2, P.z0], Math.PI],
      [d, depth, [P.x0, -depth / 2, cz], -Math.PI / 2], [d, depth, [P.x1, -depth / 2, cz], Math.PI / 2],
    ];
    for (const [ww, hh, p, ry] of walls) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), tileMat);
      m.position.set(...p); m.rotation.y = ry + Math.PI; m.receiveShadow = true;
      this.group.add(m);
      // greek key band just under the coping
      const gk = new THREE.Mesh(new THREE.PlaneGeometry(ww, 0.16), pbr('greekkey', [Math.round(ww / 1.1), 1]));
      gk.position.set(p[0], -0.1, p[2]); gk.rotation.y = ry + Math.PI;
      gk.position.addScaledVector(new THREE.Vector3(Math.sin(ry + Math.PI), 0, Math.cos(ry + Math.PI)), 0.002);
      this.group.add(gk);
    }
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorTile);
    bottom.rotation.x = -Math.PI / 2; bottom.position.set(cx, -depth, cz);
    bottom.receiveShadow = true;
    this.group.add(bottom);
    // coping stones
    const stone = pbr('stone', [4, 1]);
    const cw = 0.32, ch = 0.06;
    const cop = [
      [w + cw * 2, cw, cx, P.z1 + cw / 2], [w + cw * 2, cw, cx, P.z0 - cw / 2],
      [cw, d, P.x0 - cw / 2, cz], [cw, d, P.x1 + cw / 2, cz],
    ];
    for (const [sx, sz, x, z] of cop) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, ch, sz), stone);
      m.position.set(x, ch / 2, z); m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    // water
    const wn = waterNormals();
    const wm = waterMaterial(wn);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), wm);
    water.rotation.x = -Math.PI / 2; water.position.set(cx, wl, cz);
    water.renderOrder = 2;
    this.group.add(water);
    this.animated.push((dt) => { wm.userData.time.value += dt; });
    // planar reflection layer (high quality): the fighters, palms and sky mirrored in the pool, rippled by the
    // same animated normals, weighted by Fresnel
    if (this.quality === 'high' || this.quality === 'ultra') {
      const refl = new Reflector(new THREE.PlaneGeometry(w, d), {
        textureWidth: this.quality === 'ultra' ? 1280 : 1024, textureHeight: this.quality === 'ultra' ? 720 : 576, clipBias: 0.002, multisample: 0,
        shader: PoolReflectShader,
      });
      refl.material.transparent = true; refl.material.depthWrite = false;
      refl.material.uniforms.tNormal.value = wn;
      refl.rotation.x = -Math.PI / 2; refl.position.set(cx, wl + 0.003, cz);
      refl.renderOrder = 3; refl.castShadow = false; refl.receiveShadow = false; refl.userData.noAO = true;
      this.group.add(refl);
      this.animated.push(() => { refl.material.uniforms.uTime.value = wm.userData.time.value; });
    }
    // pool ladder (chrome)
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 });
    for (const dx of [-0.25, 0.25]) {
      const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.9, 0.12), new THREE.Vector3(0, 0.0, 0.12), new THREE.Vector3(0, 0.55, 0.0), new THREE.Vector3(0, 0.45, -0.3), new THREE.Vector3(0, 0.0, -0.35)]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 40, 0.022, 10), chrome);
      tube.position.set(P.x1 - 1.2 + dx, 0, P.z1 - 0.05);
      tube.rotation.y = Math.PI;
      tube.castShadow = true;
      this.group.add(tube);
    }
  }

  buildWalls() {
    const stucco = pbr('stucco', [4, 1]);
    stucco.normalScale = new THREE.Vector2(0.25, 0.25);
    const coping = pbr('roof', [8, 1]);
    const stone = pbr('stone', [1, 1]);
    // balustrade behind the pool
    const zb = this.pool.z0 - 1.6;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = 0.055 + 0.04 * Math.sin(t * Math.PI) ** 2 * (t < 0.5 ? 1.2 : 0.8) + (t < 0.08 ? 0.03 : 0) + (t > 0.92 ? 0.03 : 0) - 0.02 * Math.sin(t * Math.PI * 3) ** 8;
      pts.push(new THREE.Vector2(r, t * 0.62));
    }
    const balGeo = new THREE.LatheGeometry(pts, 14);
    const count = 90;
    const bal = new THREE.InstancedMesh(balGeo, stone, count);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < count; i++) { mtx.makeTranslation(-13 + i * 0.29, 0.14, zb); bal.setMatrixAt(i, mtx); }
    bal.castShadow = true; bal.receiveShadow = true;
    this.group.add(bal);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(26.5, 0.12, 0.3), stone);
    rail.position.set(0, 0.82, zb); rail.castShadow = true; rail.receiveShadow = true; this.group.add(rail);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(26.5, 0.14, 0.34), stone);
    plinth.position.set(0, 0.07, zb); plinth.receiveShadow = true; this.group.add(plinth);
    for (let i = 0; i <= 6; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.34), stone);
      post.position.set(-13 + i * 4.33, 0.47, zb); post.castShadow = true; post.receiveShadow = true; this.group.add(post);
      const pot = this.makePot(); pot.position.set(-13 + i * 4.33, 0.95, zb); this.group.add(pot);
    }
    // side walls (whitewashed, terracotta coping)
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.3, 22), stucco);
      wall.position.set(sx * 12.5, 1.15, 0); wall.castShadow = true; wall.receiveShadow = true;
      this.group.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 22.2), coping);
      cap.position.set(sx * 12.5, 2.35, 0); cap.castShadow = true; this.group.add(cap);
    }
    // front wall (behind the camera) with the house facade
    const hf = facadeWindowsTex('#efe9df', '#3e6b52');
    const house = new THREE.Mesh(new THREE.BoxGeometry(25, 6, 0.4), new THREE.MeshStandardMaterial({ map: hf.map, roughness: 0.9 }));
    house.material.map.wrapS = THREE.RepeatWrapping; house.material.map.repeat.set(5, 1);
    house.position.set(0, 3, 11.5); house.receiveShadow = true; house.castShadow = true;
    this.group.add(house);
  }

  makePot() {
    const g = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0xa4532e, roughness: 0.85 });
    const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0.17, 0.25), new THREE.Vector2(0.19, 0.27), new THREE.Vector2(0.19, 0.3), new THREE.Vector2(0.001, 0.3)];
    const pot = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), potMat);
    pot.castShadow = true; g.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ map: this.leafTex || (this.leafTex = leafClusterTex()), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), leafMat);
      p.position.set((Math.random() - 0.5) * 0.15, 0.45 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15);
      p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.castShadow = true; g.add(p);
    }
    return g;
  }

  buildTown() {
    const roofMat = pbr('roof', [3, 2]);
    const rng = (a, b) => a + Math.random() * (b - a);
    const bases = [['#e7c9a0', '#6b4c35'], ['#f2efe8', '#2f5d4a'], ['#e8b8a8', '#5b3c2a'], ['#f4f1ea', '#6d2f22'], ['#dcc39a', '#34566e']];
    const facades = [];
    for (const [b, s] of bases) for (let k = 0; k < 2; k++) facades.push(facadeWindowsTex(b, s));
    const addHouse = (x, z, w, h, d, ry) => {
      // per-house material: the facade tiles once per ~4 m of wall and per storey
      const f = facades[Math.floor(Math.random() * facades.length)];
      const map = f.map.clone(), em = f.emissive.clone();
      for (const t of [map, em]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 3.5))); t.needsUpdate = true; }
      const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: new THREE.Color(1.0, 0.72, 0.45), emissiveIntensity: 1.6, roughness: 0.92, color: new THREE.Color(0.78, 0.76, 0.76) });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      body.position.set(x, h / 2, z); body.rotation.y = ry; body.castShadow = true; body.receiveShadow = true;
      this.group.add(body);
      // gable roof
      const rh = 1.1;
      const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.3, 0), new THREE.Vector2(w / 2 + 0.3, 0), new THREE.Vector2(0, rh)]);
      const rg = new THREE.ExtrudeGeometry(shape, { depth: d + 0.6, bevelEnabled: false });
      rg.translate(0, 0, -(d + 0.6) / 2);
      const roof = new THREE.Mesh(rg, roofMat);
      roof.position.set(x, h, z); roof.rotation.y = ry; roof.castShadow = true;
      this.group.add(roof);
    };
    // the terrace sits on a hill: rooftops of the town below, then the sea
    const drop = -9;
    const addLow = (x, z, w, h, d, ry) => { addHouse(x, z, w, h, d, ry); const last = this.group.children.slice(-2); last.forEach(o => (o.position.y += drop)); };
    for (let i = 0; i < 14; i++) addLow(-40 + i * 6 + rng(-1, 1), -30 - rng(0, 8), rng(4, 6), rng(6, 10), rng(5, 8), rng(-0.2, 0.2));
    for (let i = 0; i < 12; i++) addLow(-55 + i * 10 + rng(-2, 2), -48 - rng(0, 10), rng(5, 8), rng(7, 12), rng(6, 9), rng(-0.3, 0.3));
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) addHouse(sx * rng(16, 20), -12 + i * 7, rng(4, 6), rng(5, 8), rng(5, 6), Math.PI / 2);
    // sea to the horizon with a sunset glint
    const seaMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.05, 0.12, 0.2), roughness: 0.12, metalness: 0, normalMap: waterNormals(), normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.4 });
    seaMat.normalMap.repeat.set(160, 160);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, drop - 6, -1500 - 70);
    this.group.add(sea);
    this.animated.push((dt) => { seaMat.normalMap.offset.x += dt * 0.004; seaMat.normalMap.offset.y += dt * 0.002; });
    // hill slope below the balustrade (so the town sits below us)
    const slopeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.36, 0.3, 0.24), roughness: 1 });
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), slopeMat);
    slope.rotation.x = -Math.PI / 2 + 0.28; slope.position.set(0, drop - 3, -40);
    this.group.add(slope);
    // distant hills
    const hillMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.33, 0.36), roughness: 1, fog: true });
    for (let i = 0; i < 7; i++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(rng(18, 30), 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
      hill.scale.y = rng(0.18, 0.3);
      const a = rng(-1.9, 1.9) + Math.PI;
      hill.position.set(Math.sin(a) * 160, -12, Math.cos(a) * 160);
      if (Math.cos(a) < -0.8) hill.visible = false; // keep the sea horizon open behind the pool
      this.group.add(hill);
    }
  }

  buildVegetation() {
    // palm bark: stacked leaf-scar rings along the trunk (tube UV u runs along the curve)
    const barkC = document.createElement('canvas'); barkC.width = 512; barkC.height = 64;
    const bg = barkC.getContext('2d');
    bg.fillStyle = '#7a6650'; bg.fillRect(0, 0, 512, 64);
    for (let x = 0; x < 512; x += 16) {
      const gr = bg.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, '#4f3f30'); gr.addColorStop(0.25, '#8c7760'); gr.addColorStop(0.7, '#6f5c47'); gr.addColorStop(1, '#43352a');
      bg.fillStyle = gr; bg.fillRect(x, 0, 16, 64);
    }
    for (let i = 0; i < 900; i++) { bg.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; bg.fillRect(Math.random() * 512, Math.random() * 64, 1 + Math.random() * 4, 1 + Math.random() * 3); }
    const barkT = new THREE.CanvasTexture(barkC); barkT.colorSpace = THREE.SRGBColorSpace; barkT.wrapS = barkT.wrapT = THREE.RepeatWrapping; barkT.repeat.set(3, 2);
    const trunkMat = new THREE.MeshStandardMaterial({ map: barkT, bumpMap: barkT, bumpScale: 1.5, roughness: 0.95 });
    const frondMat = new THREE.MeshStandardMaterial({ map: frondTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75 });
    const makePalm = (x, z, h) => {
      const g = new THREE.Group();
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, h * 0.4, 0.1), new THREE.Vector3(0.5, h * 0.8, -0.1), new THREE.Vector3(0.45, h, 0)]);
      const tg = new THREE.TubeGeometry(curve, 24, 0.18, 10);
      { // taper: wide flared base, slimmer crown; slight irregularity along the trunk
        const P = tg.attributes.position, ring = 11;
        for (let i = 0; i < P.count; i++) {
          const seg = Math.floor(i / ring), t = seg / 24, c = curve.getPointAt(t);
          const k = (1.35 - 0.55 * t + (t < 0.06 ? (0.06 - t) * 5 : 0)) * (1 + Math.sin(seg * 2.7 + x) * 0.03);
          P.setXYZ(i, c.x + (P.getX(i) - c.x) * k, c.y + (P.getY(i) - c.y) * k, c.z + (P.getZ(i) - c.z) * k);
        }
        tg.computeVertexNormals();
      }
      const trunk = new THREE.Mesh(tg, trunkMat);
      trunk.castShadow = true; g.add(trunk);
      const top = curve.getPoint(1);
      for (let i = 0; i < 14; i++) {
        const fg = new THREE.PlaneGeometry(1.1, 3.4, 1, 8);
        fg.translate(0, 1.7, 0);
        const pos = fg.attributes.position;
        for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); pos.setZ(k, -Math.pow(y / 3.4, 2) * 1.4); }
        fg.computeVertexNormals();
        const f = new THREE.Mesh(fg, frondMat);
        f.position.copy(top);
        f.rotation.set(-0.9 - Math.random() * 0.5, (i / 14) * Math.PI * 2, 0, 'YXZ');
        f.castShadow = true; g.add(f);
      }
      g.position.set(x, 0, z);
      this.group.add(g);
      return g;
    };
    // crowns low enough to sit in the fight camera's frame; two young palms in the planters by the pool
    this.palms = [makePalm(-7.5, -11.5, 5.4), makePalm(6.8, -12.5, 6.6), makePalm(10.5, 6.5, 8), makePalm(-5.2, -10.6, 3.6), makePalm(9.4, -9.8, 4.2)];
    // leafy tree (like the one in the BBQ photo)
    const leafMat = new THREE.MeshStandardMaterial({ map: this.leafTex || (this.leafTex = leafClusterTex()), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
    const tree = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 8), trunkMat); tr.position.y = 1.6; tr.castShadow = true; tree.add(tr);
    for (let i = 0; i < 70; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), leafMat);
      const a = Math.random() * 6.28, r = Math.random() * 1.8;
      p.position.set(Math.cos(a) * r, 3.2 + Math.random() * 2.2, Math.sin(a) * r);
      p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.castShadow = true; tree.add(p);
    }
    tree.position.set(-10.5, 0, 7);
    this.group.add(tree);
    this.animated.push((dt) => {
      const t = this.t;
      for (const p of this.palms) { p.rotation.z = Math.sin(t * 0.7 + p.position.x) * 0.012; }
      tree.rotation.z = Math.sin(t * 0.9) * 0.01;
    });
  }

  // side walls: warm sconces, big planters and bougainvillea spilling over the coping
  dressWalls() {
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffb45e, emissiveIntensity: 2.6, roughness: 0.4 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.5, metalness: 0.6 });
    const lampG = new THREE.BoxGeometry(0.14, 0.22, 0.14), capG = new THREE.BoxGeometry(0.2, 0.04, 0.2), armG = new THREE.BoxGeometry(0.2, 0.03, 0.03);
    const spots = [];
    for (const sx of [-1, 1]) for (let z = -8; z <= 8; z += 4) spots.push([sx, z]);
    const lamps = new THREE.InstancedMesh(lampG, lampMat, spots.length), caps = new THREE.InstancedMesh(capG, ironMat, spots.length), arms = new THREE.InstancedMesh(armG, ironMat, spots.length);
    const o = new THREE.Object3D();
    spots.forEach(([sx, z], i) => {
      o.position.set(sx * 12.1, 1.85, z); o.updateMatrix(); lamps.setMatrixAt(i, o.matrix);
      o.position.set(sx * 12.1, 1.98, z); o.updateMatrix(); caps.setMatrixAt(i, o.matrix);
      o.position.set(sx * 12.24, 1.9, z); o.updateMatrix(); arms.setMatrixAt(i, o.matrix);
    });
    this.group.add(lamps, caps, arms);
    // planters at the wall base
    for (const sx of [-1, 1]) for (let z = -6; z <= 6; z += 6) {
      const p = this.makePot(); p.scale.setScalar(1.7); p.position.set(sx * 11.8, 0, z + (sx > 0 ? 1.5 : 0)); this.group.add(p);
    }
    // bougainvillea: magenta bracts and leaves draped along the coping
    const flowerT = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * 6.28, r = Math.random() * 115, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.8;
        g.fillStyle = Math.random() < 0.55 ? `hsl(${315 + Math.random() * 20},${70 + Math.random() * 20}%,${40 + Math.random() * 18}%)` : `hsl(${95 + Math.random() * 30},45%,${22 + Math.random() * 12}%)`;
        g.beginPath(); g.ellipse(x, y, 7 + Math.random() * 6, 5 + Math.random() * 4, Math.random() * 6.28, 0, 6.28); g.fill();
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const fMat = new THREE.MeshStandardMaterial({ map: flowerT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
    const mats = [];
    for (let i = 0; i < 70; i++) {
      const sx = i % 2 ? 1 : -1, z = -10 + Math.random() * 20;
      if (Math.abs(z) < 2.5 && Math.random() < 0.7) continue;
      o.position.set(sx * (12.2 + (Math.random() - 0.5) * 0.3), 2.2 + Math.random() * 0.35 - (Math.random() < 0.4 ? 0.5 : 0), z);
      o.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * 3, (Math.random() - 0.5) * 0.8); o.scale.setScalar(0.8 + Math.random() * 0.6);
      o.updateMatrix(); mats.push(o.matrix.clone());
    }
    const fl = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 0.9), fMat, mats.length);
    mats.forEach((m, i) => fl.setMatrixAt(i, m));
    fl.castShadow = true; fl.receiveShadow = true; this.group.add(fl);
  }

  // verbena string lights across the terrace: warm bulbs that bloom against the dusk sky
  buildFestoons() {
    const cable = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffb866, emissiveIntensity: 3.2, roughness: 0.3 });
    const bulbs = [];
    for (const [z, sag] of [[-3.2, 0.55], [2.6, 0.5], [8.2, 0.45]]) {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, x = -12.3 + 24.6 * t;
        pts.push(new THREE.Vector3(x, 3.15 - sag * 4 * t * (1 - t), z + Math.sin(t * Math.PI) * 0.3));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.006, 5), cable);
      this.group.add(wire);
      for (let i = 1; i < 48; i++) bulbs.push(curve.getPointAt(i / 48).add(new THREE.Vector3(0, -0.07, 0)));
    }
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), bulbMat, bulbs.length);
    const o = new THREE.Object3D();
    bulbs.forEach((p, i) => { o.position.copy(p); o.scale.set(1, 1.25, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    this.group.add(im);
    // a gentle flicker on the whole string
    this.animated.push(() => { bulbMat.emissiveIntensity = 3.0 + Math.sin(this.t * 3.1) * 0.08 + Math.sin(this.t * 7.7) * 0.05; });
  }

  buildProps() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55 });
    const green = new THREE.MeshStandardMaterial({ color: 0x3f7a4b, roughness: 0.45 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1f4c8a, roughness: 0.85 });
    // sun loungers along the pool
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.9), white); base.position.y = 0.32; g.add(base);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.7), white); back.position.set(0, 0.55, -0.9); back.rotation.x = -0.9; g.add(back);
      const cush = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 1.8), cloth); cush.position.y = 0.38; g.add(cush);
      for (const [x, z] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3), white); l.position.set(x, 0.15, z); g.add(l);
      }
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(-8 + i * 1.1, 0, -6.2); g.rotation.y = 0.05;
      this.group.add(g);
    }
    // parasol
    const pg = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.5), white); pole.position.y = 1.25; pg.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.45, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xe9e2d0, roughness: 0.9, side: THREE.DoubleSide }));
    canopy.position.y = 2.45; pg.add(canopy);
    pg.traverse(o => { if (o.isMesh) o.castShadow = true; });
    pg.position.set(-9.2, 0, -5.6); this.group.add(pg);
    // green plastic garden table + chairs (as in the BBQ photo)
    const tg = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 24), green); top.position.y = 0.72; tg.add(top);
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), green); const a = i * Math.PI / 2 + 0.78; l.position.set(Math.cos(a) * 0.32, 0.36, Math.sin(a) * 0.32); tg.add(l); }
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.9, roughness: 0.3 }));
    can.position.set(0.1, 0.8, 0.05); tg.add(can);
    tg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    tg.position.set(9.5, 0, -3.8); this.group.add(tg);
    // BBQ grill with glowing coals
    const bbq = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.5, metalness: 0.6 });
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark); bowl.position.y = 0.8; bowl.rotation.x = Math.PI; bbq.add(bowl);
    bowl.rotation.x = 0;
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff4a10, emissiveIntensity: 2.2, roughness: 1 }));
    coals.rotation.x = -Math.PI / 2; coals.position.y = 0.72; bbq.add(coals);
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8), dark); const a = i * 2.1; l.position.set(Math.cos(a) * 0.22, 0.38, Math.sin(a) * 0.22); l.rotation.z = Math.cos(a) * 0.2; bbq.add(l); }
    bbq.traverse(o => { if (o.isMesh) o.castShadow = true; });
    bbq.position.set(10.5, 0, -1.2); this.group.add(bbq);
    const glow = new THREE.PointLight(0xff6a2a, 3, 3, 2); glow.position.set(10.5, 1.0, -1.2); this.group.add(glow);
    this.animated.push(() => { glow.intensity = 2.6 + Math.sin(this.t * 13) * 0.3 + Math.sin(this.t * 7.3) * 0.3; });
  }

  // capture the static stage into an environment map for reflections
  bakeEnvironment() {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.1, 500, cubeRT);
    cc.position.set(0, 1.4, 0);
    this.scene.add(cc);
    const fog = this.scene.fog; this.scene.fog = null;
    cc.update(this.renderer, this.scene);
    this.scene.fog = fog;
    this.scene.remove(cc);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = pm.fromCubemap(cubeRT.texture).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.75;
    cubeRT.dispose();
    return env;
  }

  update(dt, camera) {
    this.t += dt;
    this.cameraPos = camera.position;
    for (const f of this.animated) f(dt);
  }
}
