// "El Festival": the open-air stage of the neighbourhood's summer festival, at golden hour (the user's photo).
// The arched stage shell, the banner towers, the DJ booth sign, the wooden front of the platform, the reed fence, the
// trees behind it and the concrete of the square are the photo, cleaned by tools/festival_prep.py (the people painted
// out, the rum brand on the banners replaced by the game's name). Around them the square is built in 3D: platform,
// railings, booth, towers, light towers, the mixing tent, a bar and a food truck, festoon lights and the crowd.
import * as THREE from 'three';
import { FIGHTER_KEY } from '../materials.js';
import { createFightSun, aimFightSun } from '../engine/sunshadow.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEX = 'assets/stage/';
const loader = new THREE.TextureLoader();
const pending = [];
function tex(name, { repeat = [1, 1], srgb = true, wrap = false } = {}) {
  let done;
  pending.push(new Promise(r => { done = r; setTimeout(r, 20000); }));
  const t = loader.load(TEX + name, () => done(), undefined, () => done());
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// seeded so the set dressing is identical on every load
let seed = 0x0f35a1;
function rand() { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rnd = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];
function bake(geos) { return mergeGeometries(geos.map(g => (g.index ? g.toNonIndexed() : g))); }

// ------------------------------------------------------------------ layout (metres; the fight starts at the origin
// looking at the stage, which faces +z)
const SZ = -12.5;                         // front edge of the stage platform
const PH = 1.2, PD = 7.0, PW = 16.8;      // platform height, depth, width (the photo's wooden front: 16.8 m)
const SHZ = SZ - 2.3;                     // the shell picture (arch, roof lights, LED wall, letters on top)
const SHW = 14.6, SHH = SHW * 1254 / 1907;
const TX = 8.35;                          // banner towers at the platform's front corners
const FENCE_H = 2.3;
const SIDE = 26, BACK = 21;               // the reed fence around the square: x = +-SIDE, z = BACK behind the camera
// photo coordinates (1600 px preview of the shell crop) -> shell texture uv
const shU = (x) => (x - 395) / 745, shV = (y) => 1 - y / 490;

const GoldenSky = {
  uniforms: { sunDir: { value: new THREE.Vector3() }, time: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `
    uniform vec3 sunDir; uniform float time; varying vec3 vDir;
    float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
    float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
    void main(){
      vec3 d = normalize(vDir); float h = d.y; float sd = max(dot(d, sunDir), 0.0);
      // clear September evening: pale blue overhead, a warm cream band low down, gold around the low sun
      vec3 zen = vec3(0.24, 0.43, 0.78), mid = vec3(0.6, 0.73, 0.88), hor = vec3(0.98, 0.86, 0.7);
      float t = clamp(h, 0.0, 1.0);
      vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, t));
      col = mix(col, zen, smoothstep(0.15, 0.75, t));
      col += vec3(1.0, 0.66, 0.34) * pow(sd, 6.0) * 0.45 * (1.0 - t);
      col += vec3(1.0, 0.8, 0.55) * pow(sd, 60.0) * 0.6;
      col += vec3(1.6, 1.3, 0.95) * smoothstep(0.9995, 0.9998, sd) * 3.0;
      if (h > 0.0) {
        // a few high cirrus streaks, lit gold on the sun side
        vec2 uv = d.xz / (h + 0.1);
        float c = fbm(vec3(uv * vec2(0.35, 1.6) + vec2(time * 0.003, 0.0), 1.0));
        c = smoothstep(0.55, 0.78, c) * smoothstep(0.03, 0.2, h) * (1.0 - smoothstep(0.5, 0.9, h));
        col = mix(col, mix(vec3(1.0, 0.94, 0.88), vec3(1.25, 0.9, 0.6), pow(sd, 3.0)), c * 0.5);
      } else col = mix(hor * 0.85, vec3(0.42, 0.4, 0.37), smoothstep(0.0, -0.12, h));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// ------------------------------------------------------------------ procedural textures
function steelTex() {
  return canvasTex(64, 256, (g, W, H) => {
    g.fillStyle = '#b9bcbf'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.08})`; g.fillRect(rand() * W, rand() * H, 2, rnd(2, 12)); }
  }, [1, 1]);
}
// stage floor / booth fabric: black, a faint weave
function blackTex() {
  return canvasTex(128, 128, (g, W, H) => {
    g.fillStyle = '#141416'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(255,255,255,${0.012 + rand() * 0.01})`; g.fillRect(0, y, W, 1); }
  }, [4, 4]);
}
// large soft stains over the whole square: the photo concrete repeats every 4 m, these break the repetition
function stainTex() {
  const t = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = rand() * W, y = rand() * H, r = rnd(20, 110), v = Math.round(rnd(95, 165));
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},${rnd(0.15, 0.4)})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // expansion joints of the slab (a dark line every 6 m of the 30 m the texture spans)
    g.fillStyle = 'rgba(40,40,40,0.55)';
    for (let k = 0; k < 5; k++) { g.fillRect(k * W / 5, 0, 2, H); g.fillRect(0, k * H / 5, W, 2); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  return t;
}
function signTex(text, bg, fg, sub = '', w = 512, h = 128) {
  return canvasTex(w, h, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(H * (sub ? 0.5 : 0.62))}px "Arial Black", Arial, sans-serif`;
    g.fillText(text, W / 2, H * (sub ? 0.4 : 0.52));
    if (sub) { g.font = `700 ${Math.round(H * 0.2)}px Arial, sans-serif`; g.fillText(sub, W / 2, H * 0.8); }
  });
}
// umbrella pine needles: dark green clumps with light tips, for the canopy cards
function pineTex() {
  return canvasTex(256, 256, (g) => {
    for (let i = 0; i < 700; i++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * 118, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.8;
      const sh = 0.45 + rand() * 0.55;
      g.strokeStyle = `rgb(${Math.round(38 * sh + 14)},${Math.round(70 * sh + 24)},${Math.round(36 * sh + 14)})`;
      g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); const b = rand() * 6.28; g.lineTo(x + Math.cos(b) * 10, y + Math.sin(b) * 10); g.stroke();
    }
  });
}

// ------------------------------------------------------------------ stage
export class FestivalStage {
  constructor(renderer, scene, quality = 'high') {
    this.renderer = renderer; this.scene = scene; seed = 0x0f35a1;
    this.quality = quality;
    this.shadowSize = { low: 1024, medium: 1024, high: 2048, ultra: 2048 }[quality] || 2048;
    this.group = new THREE.Group(); this.group.name = 'stage-festival';
    scene.add(this.group);
    this.arenaRadius = 6.5;
    this.t = 0; this.beat = 0;
    this.animated = [];
    this.koView = new THREE.Vector3(0, 0, -1); // KO shots look at the stage
    // low sun behind the camera on the left (as in the photo: the stage front and the wooden platform are lit gold,
    // long shadows fall back to the right)
    this.sunDir = new THREE.Vector3(-0.62, 0.27, 0.74).normalize();
    this.posts = [];
    this.steel = new THREE.MeshStandardMaterial({ map: steelTex(), color: 0xe6e8ea, metalness: 0.75, roughness: 0.38 });
    this.black = new THREE.MeshStandardMaterial({ map: blackTex(), roughness: 0.92 });
    this.buildSky(); this.buildLights(); this.buildGround(); this.buildPlatform(); this.buildShell(); this.buildBooth();
    this.buildRailings(); this.buildTowers(); this.buildLampPost(); this.buildFences(); this.buildPhotoTrees(); this.buildPines();
    this.buildLightTowers(); this.buildFOH(); this.buildBar(); this.buildFoodTruck(); this.buildFestoons(); this.buildBeams();
    this.buildCrowd();
    scene.fog = new THREE.FogExp2(new THREE.Color(0.86, 0.8, 0.72), 0.0065);
  }
  ready() { return Promise.all(pending); }

  // walkable space: the square in front of the stage (not up the steps), inside the fence, around the light towers
  // and the mixing tent
  clampWalk(p, r = 0) {
    p.x = THREE.MathUtils.clamp(p.x, -SIDE + 1.2 + r, SIDE - 1.2 - r);
    p.z = THREE.MathUtils.clamp(p.z, SZ + 1.6 + r, BACK - 1.2 - r);
    for (const [tx, tz, R0] of this.posts) {
      const dx = p.x - tx, dz = p.z - tz, d = Math.hypot(dx, dz), R = R0 + r;
      if (d < R) { if (d < 1e-4) p.x = tx + R; else { p.x = tx + dx / d * R; p.z = tz + dz / d * R; } }
    }
    return p;
  }
  // cinematic cameras stay on the square
  clampCam(p) { p.x = THREE.MathUtils.clamp(p.x, -SIDE + 1.5, SIDE - 1.5); p.z = THREE.MathUtils.clamp(p.z, SZ + 1.2, BACK - 1.5); return p; }

  buildSky() {
    const m = new THREE.ShaderMaterial({ ...GoldenSky, uniforms: THREE.UniformsUtils.clone(GoldenSky.uniforms), side: THREE.BackSide, depthWrite: false, fog: false });
    m.uniforms.sunDir.value.copy(this.sunDir);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), m);
    sky.renderOrder = -10; sky.frustumCulled = false; this.group.add(sky);
    this.animated.push((dt) => { m.uniforms.time.value += dt; sky.position.copy(this.cameraPos || new THREE.Vector3()); });
  }

  buildLights() {
    const sun = createFightSun(new THREE.Color(1.0, 0.8, 0.58), 3.4, this.shadowSize);
    this.sun = sun; this.group.add(sun); if (sun.target) this.group.add(sun.target);
    aimFightSun(sun, this.sunDir, new THREE.Vector3(), 2.6);
    this.keyColor = new THREE.Color(1.0, 0.9, 0.78); this.keyIntensity = 1.15;
    // blue evening sky in the shadows, warm bounce off the sunlit concrete
    this.group.add(new THREE.HemisphereLight(new THREE.Color(0.55, 0.66, 0.86), new THREE.Color(0.5, 0.44, 0.38), 0.85));
    const bounce = new THREE.DirectionalLight(new THREE.Color(1.0, 0.72, 0.5), 0.25);
    bounce.position.set(0.5, -3, 1); this.group.add(bounce);
  }
  followShadow(center, spread = 3) {
    aimFightSun(this.sun, this.sunDir, center, Math.max(2.4, spread * 0.5 + 1.6));
  }
  followCamera(camera, center) {
    FIGHTER_KEY.dir.value.set(-0.44, 0.63, 0.64).normalize();
    FIGHTER_KEY.color.value.copy(this.keyColor).multiplyScalar(this.keyIntensity * (this.keyBoost || 1));
    FIGHTER_KEY.rim.value.setRGB(1.0, 0.72, 0.45).multiplyScalar(0.75);
  }

  // the concrete of the square (the photo's own slab), with big soft stains so its 4 m tile does not repeat visibly
  buildGround() {
    const L = 140;
    const rep = [L / 4, L / 4];
    const mat = new THREE.MeshStandardMaterial({
      map: tex('fest_concrete_a.jpg', { repeat: rep, wrap: true }), normalMap: tex('fest_concrete_n.jpg', { repeat: rep, wrap: true, srgb: false }),
      roughnessMap: tex('fest_concrete_r.jpg', { repeat: rep, wrap: true, srgb: false }), roughness: 1, metalness: 0, color: new THREE.Color(1.14, 1.09, 1.0),
    });
    mat.normalScale = new THREE.Vector2(0.6, 0.6);
    const stain = stainTex();
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uStain = { value: stain };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uStain; varying vec2 vWXZ;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 0.55 + 0.9 * texture2D(uStain, vWXZ / 30.0).r;');
    };
    const g = new THREE.Mesh(new THREE.PlaneGeometry(L, L), mat);
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; this.group.add(g);
  }

  // ------------------------------------------------------------------ the stage
  buildPlatform() {
    const wood = tex('fest_wood.jpg');
    const front = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 });
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.3, 0.2), roughness: 0.9 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, PD), [side, side, this.black, this.black, front, side]);
    box.position.set(0, PH / 2, SZ - PD / 2); box.castShadow = true; box.receiveShadow = true; this.group.add(box);
    // the steps up on the left of the booth (painted on the photo front there too)
    const stepMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.36, 0.24), roughness: 0.88 });
    for (let k = 0; k < 3; k++) {
      const h = PH * (k + 1) / 3, d = 0.9 * (3 - k) / 3;
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.0, h, d), stepMat);
      s.position.set(-1.23, h / 2, SZ + d / 2); s.castShadow = true; s.receiveShadow = true; this.group.add(s);
    }
  }

  buildShell() {
    const map = tex('fest_shell.jpg'), alpha = tex('fest_shell_a.png', { srgb: false });
    // the photo carries its own evening light: unlit, a little darker than the sunlit 3D pieces in front
    const m = new THREE.MeshBasicMaterial({ map, alphaMap: alpha, alphaTest: 0.5, color: new THREE.Color(0.93, 0.92, 0.92) });
    const shell = new THREE.Mesh(new THREE.PlaneGeometry(SHW, SHH), m);
    shell.position.set(0, PH - 0.1 + SHH / 2, SHZ); this.group.add(shell);
    this.shellY0 = PH - 0.1;
    // black curtains behind the opening's sides and a back wall, so oblique cameras never see through the picture
    const back = new THREE.Mesh(new THREE.PlaneGeometry(PW, 9), this.black);
    back.position.set(0, PH + 4.5, SZ - PD + 0.05); this.group.add(back);
    // the roof's light bars and the LED wall pulse with the music: additive glow over the photo
    const glow = canvasTex(1024, 672, (g, W, H) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const P = (x, y) => [shU(x) * W, (1 - shV(y)) * H];
      g.lineCap = 'round';
      for (const [[x0, y0], [x1, y1]] of [[[628, 135], [662, 296]], [[768, 138], [768, 298]], [[905, 138], [872, 296]]]) {
        for (const [w, a] of [[18, 0.12], [8, 0.3], [3, 0.9]]) {
          g.strokeStyle = `rgba(235,240,255,${a})`; g.lineWidth = w; g.beginPath(); g.moveTo(...P(x0, y0)); g.lineTo(...P(x1, y1)); g.stroke();
        }
      }
      const [lx, ly] = P(703, 318), [rx, ry] = P(835, 390);
      g.fillStyle = 'rgba(60,120,255,0.35)'; g.fillRect(lx, ly, rx - lx, ry - ly);
    });
    const gm = new THREE.MeshBasicMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(SHW, SHH), gm);
    gl.position.copy(shell.position).add(new THREE.Vector3(0, 0, 0.02)); gl.renderOrder = 2; this.group.add(gl);
    // a pulse on every beat of the music playing (js/audio/audio.js musicBeat; 124 bpm when none), a brighter one on the bar
    this.animated.push(() => { const b = ((this.beat % 4) + 4) % 4, k = Math.exp(-(b % 1) * 5) * (b < 1 ? 1 : 0.55); gm.opacity = 0.25 + k * 0.6; });
  }

  // the DJ booth: black, the festival's letters on its front, the decks on top
  buildBooth() {
    const W = 3.7, Hh = 1.05, D = 0.8, z = SZ - 0.9 - D / 2;
    const sign = new THREE.MeshStandardMaterial({ map: tex('fest_sign.jpg'), roughness: 0.8 });
    const booth = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), [this.black, this.black, this.black, this.black, sign, this.black]);
    booth.position.set(0.1, PH + Hh / 2, z); booth.castShadow = true; booth.receiveShadow = true; this.group.add(booth);
    const gear = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.5, metalness: 0.3 });
    const scr = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x6fb8ff, emissiveIntensity: 1.6 });
    const top = PH + Hh;
    const parts = [], screens = [];
    for (const x of [-0.75, 0.95]) { parts.push(new THREE.BoxGeometry(0.34, 0.1, 0.42).translate(x + 0.1, top + 0.05, z)); screens.push(new THREE.BoxGeometry(0.16, 0.012, 0.1).translate(x + 0.1, top + 0.105, z - 0.1)); }
    parts.push(new THREE.BoxGeometry(0.36, 0.09, 0.42).translate(0.2, top + 0.045, z));
    parts.push(new THREE.BoxGeometry(0.34, 0.015, 0.24).translate(-1.35, top + 0.01, z - 0.05));
    const lid = new THREE.BoxGeometry(0.34, 0.24, 0.01); lid.rotateX(-0.25); lid.translate(-1.35, top + 0.13, z - 0.18); parts.push(lid);
    screens.push(new THREE.BoxGeometry(0.3, 0.2, 0.002).rotateX(-0.25).translate(-1.35, top + 0.13, z - 0.172));
    // monitor wedges at both ends of the booth
    for (const x of [-1.9, 2.1]) parts.push(new THREE.BoxGeometry(0.5, 0.4, 0.45).translate(x, PH + 0.2, z + 0.2));
    const gm = new THREE.Mesh(bake(parts), gear); gm.castShadow = true; this.group.add(gm);
    this.group.add(new THREE.Mesh(bake(screens), scr));
  }

  // galvanised scaffold railings along the front edge of the platform, left and right of the booth
  buildRailings() {
    const geos = [], r = 0.024, z = SZ - 0.12;
    const run = (x0, x1, zz = z, alongZ = false) => {
      const len = Math.abs(x1 - x0), n = Math.max(1, Math.round(len / 1.6));
      for (const h of [0.15, 0.55, 1.0]) {
        const g = new THREE.CylinderGeometry(r, r, len, 8); g.rotateZ(Math.PI / 2); if (alongZ) g.rotateY(Math.PI / 2);
        g.translate(alongZ ? x0 : (x0 + x1) / 2, PH + h, alongZ ? (zz + x1) / 2 : zz); geos.push(g);
      }
      for (let i = 0; i <= n; i++) {
        const t = i / n, g = new THREE.CylinderGeometry(r, r, 1.08, 8);
        g.translate(alongZ ? x0 : x0 + (x1 - x0) * t, PH + 0.54, alongZ ? zz + (x1 - zz) * t : zz); geos.push(g);
        // couplers
        geos.push(new THREE.BoxGeometry(0.07, 0.06, 0.07).translate(alongZ ? x0 : x0 + (x1 - x0) * t, PH + 1.0, alongZ ? zz + (x1 - zz) * t : zz));
      }
    };
    run(-8.2, -1.95); run(2.15, 8.2);
    run(-8.25, SZ - 3.0, SZ - 0.12, true); run(8.25, SZ - 3.0, SZ - 0.12, true);
    const m = new THREE.Mesh(bake(geos), this.steel); m.castShadow = true; this.group.add(m);
  }

  // the two towers at the platform's corners: a truss column with a printed mesh banner on the front, a second one
  // angled back to the shell, a hanging speaker and a light on top
  buildTowers() {
    for (const s of [-1, 1]) {
      const key = s < 0 ? 'l' : 'r';
      const x = s * TX, z = SZ + 0.15;
      const geos = [];
      const q = 0.18, H = 8.35;
      for (const [dx, dz] of [[-q, -q], [q, -q], [q, q], [-q, q]]) geos.push(new THREE.CylinderGeometry(0.025, 0.025, H, 6).translate(x + dx, H / 2, z + dz));
      for (let y = 0.3; y < H; y += 0.5) {
        for (const [ax, az, len, rot] of [[0, -q, 2 * q, 0], [0, q, 2 * q, 0], [-q, 0, 2 * q, 1], [q, 0, 2 * q, 1]]) {
          const g = new THREE.CylinderGeometry(0.012, 0.012, Math.hypot(len, 0.5), 5);
          g.rotateZ(Math.atan2(len, 0.5) * (rot ? 0 : 1)); if (rot) g.rotateX(Math.atan2(len, 0.5));
          g.translate(x + ax, y + 0.25, z + az); geos.push(g);
        }
      }
      const truss = new THREE.Mesh(bake(geos), this.steel); truss.castShadow = true; this.group.add(truss);
      const bmat = new THREE.MeshStandardMaterial({ map: tex(`fest_banner_${key}.jpg`), roughness: 0.82, side: THREE.DoubleSide });
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 5.9), bmat);
      ban.position.set(x, 2.2 + 2.95, z + q + 0.03); ban.castShadow = true; this.group.add(ban);
      // below the photo's crop the print continues to the ground (its last rows stretched)
      const low = new THREE.PlaneGeometry(1.1, 1.3), uv = low.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 0.06);
      const lb = new THREE.Mesh(low, bmat); lb.position.set(x, 0.9 + 0.65, z + q + 0.03); this.group.add(lb);
      // side banner: from the tower back to the edge of the shell, its top edge sloping down
      const sm = new THREE.MeshStandardMaterial({ map: tex(`fest_bside_${key}.jpg`), roughness: 0.85, side: THREE.DoubleSide });
      const ax = x - s * q, az = z, bx = s * (SHW / 2 - 0.1), bz = SHZ + 0.05;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([ax, 1.0, az, bx, 1.0, bz, bx, 7.6, bz, ax, 8.1, az], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, -0.2, 1, -0.2, 1, 0.95, 0, 1], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
      const sb = new THREE.Mesh(g, sm); sb.castShadow = true; this.group.add(sb);
      // line-array speaker hung on the inner side, and a moving head on top
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.15, 0.5), new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.7 }));
      spk.position.set(x - s * 0.5, 4.6, z + 0.05); spk.rotation.y = -s * 0.25; spk.castShadow = true; this.group.add(spk);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.36, 12), new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5, metalness: 0.4 }));
      head.position.set(x, H + 0.2, z); this.group.add(head);
      this.posts.push([x, z, 0.45]);
    }
  }

  // the tall lamp post that peeks out between the shell and the left tower in the photo
  buildLampPost() {
    const m = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.5, roughness: 0.5 });
    const x = -10.6, z = SZ - 3.2;
    const geos = [new THREE.CylinderGeometry(0.08, 0.14, 11, 10).translate(x, 5.5, z), new THREE.BoxGeometry(1.0, 0.08, 0.08).translate(x, 10.8, z)];
    for (const dx of [-0.42, 0.42]) geos.push(new THREE.BoxGeometry(0.34, 0.12, 0.5).translate(x + dx, 10.7, z + 0.1));
    const p = new THREE.Mesh(bake(geos), m); p.castShadow = true; this.group.add(p);
  }

  // ------------------------------------------------------------------ around the square
  // reed fencing (canizo) on steel posts all round, as at the sides of the photo; the stage side leaves the stage open
  buildFences() {
    const reed = tex('fest_reed.jpg', { wrap: true });
    const mat = new THREE.MeshStandardMaterial({ map: reed, roughness: 0.95, side: THREE.DoubleSide });
    const geos = [], posts = [];
    const seg = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = new THREE.PlaneGeometry(len, FENCE_H), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2.4);
      g.rotateY(-Math.atan2(z1 - z0, x1 - x0)); g.translate((x0 + x1) / 2, FENCE_H / 2, (z0 + z1) / 2); geos.push(g);
      const n = Math.ceil(len / 2.4);
      for (let i = 0; i <= n; i++) posts.push(new THREE.CylinderGeometry(0.03, 0.03, FENCE_H + 0.1, 6).translate(x0 + (x1 - x0) * i / n, (FENCE_H + 0.1) / 2, z0 + (z1 - z0) * i / n));
    };
    seg(-SIDE, SZ + 0.3, -TX - 0.6, SZ + 0.3); seg(TX + 0.6, SZ + 0.3, SIDE, SZ + 0.3);
    seg(-SIDE, SZ + 0.3, -SIDE, BACK); seg(SIDE, SZ + 0.3, SIDE, BACK);
    seg(-SIDE, BACK, -3, BACK); seg(3, BACK, SIDE, BACK);
    const f = new THREE.Mesh(bake(geos), mat); f.castShadow = true; f.receiveShadow = true; this.group.add(f);
    const p = new THREE.Mesh(bake(posts), this.steel); this.group.add(p);
    // the entrance behind the camera: two flag poles and a banner over the gap
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.1), new THREE.MeshStandardMaterial({ map: signTex('FIESTAS DEL BARRIO', '#1d2b4f', '#ffd25a', 'ENTRADA', 1024, 192), side: THREE.DoubleSide, roughness: 0.8 }));
    ban.position.set(0, 3.6, BACK); ban.rotation.y = Math.PI; this.group.add(ban);
    const poles = new THREE.Mesh(bake([new THREE.CylinderGeometry(0.06, 0.06, 4.3, 8).translate(-3.2, 2.15, BACK), new THREE.CylinderGeometry(0.06, 0.06, 4.3, 8).translate(3.2, 2.15, BACK)]), this.steel);
    this.group.add(poles);
  }

  // the umbrella pines (left) and the tall tree (right) of the photo, behind the fence
  buildPhotoTrees() {
    for (const [name, x, z, w, h, ry] of [['fest_trees_l', -17.5, -24, 17.5, 11.8, 0.3], ['fest_trees_r', 18.5, -25, 12.8, 15.5, -0.32]]) {
      const m = new THREE.MeshBasicMaterial({ map: tex(`${name}.jpg`), alphaMap: tex(`${name}_a.png`, { srgb: false }), alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color(0.9, 0.9, 0.88) });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      p.position.set(x, 0.6 + h / 2, z); p.rotation.y = ry; this.group.add(p);
    }
  }

  // umbrella pines round the other sides: a leaning trunk forking into a wide, flat-topped crown
  buildPines() {
    const bark = canvasTex(128, 256, (g, W, H) => {
      g.fillStyle = '#6a4e3a'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 160; i++) { g.fillStyle = pick(['#8a6a50', '#4a3426', '#9b7b5c', '#5c4232']); g.fillRect(rand() * W, rand() * H, rnd(6, 20), rnd(4, 10)); }
    }, [1, 3]);
    const trunkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 });
    const leaf = new THREE.MeshStandardMaterial({ map: pineTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 });
    const cards = [];
    for (let i = 0; i < 90; i++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * 4.2, pg = new THREE.PlaneGeometry(2.4, 1.6);
      pg.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-Math.PI / 2 + rnd(-0.5, 0.5), rand() * 6.28, rnd(-0.4, 0.4))));
      // flat top, rounded edges
      pg.translate(Math.cos(a) * r, 8.4 - (r / 4.2) ** 2 * 1.4 + rnd(-0.3, 0.4), Math.sin(a) * r);
      cards.push(pg);
    }
    const crown = mergeGeometries(cards);
    const wood = bake([
      new THREE.CylinderGeometry(0.16, 0.28, 7.0, 9).translate(0, 3.5, 0).rotateZ(0.12),
      new THREE.CylinderGeometry(0.08, 0.13, 3.0, 7).translate(0, 1.5, 0).rotateZ(0.7).translate(0.4, 6.4, 0),
      new THREE.CylinderGeometry(0.07, 0.12, 2.8, 7).translate(0, 1.4, 0).rotateZ(-0.6).rotateY(2.1).translate(0.4, 6.6, 0),
    ]);
    const spots = [];
    for (let z = -6; z < BACK + 8; z += rnd(8, 11)) { spots.push([-SIDE - rnd(3.5, 7), z]); spots.push([SIDE + rnd(3.5, 7), z + rnd(-3, 3)]); }
    for (let x = -SIDE; x <= SIDE; x += rnd(9, 12)) spots.push([x, BACK + rnd(4, 8)]);
    const tr = new THREE.InstancedMesh(wood, trunkMat, spots.length), cn = new THREE.InstancedMesh(crown, leaf, spots.length);
    const o = new THREE.Object3D();
    spots.forEach(([x, z], i) => { o.position.set(x, 0, z); o.rotation.set(0, rand() * 6.28, 0); o.scale.setScalar(rnd(0.85, 1.2)); o.updateMatrix(); tr.setMatrixAt(i, o.matrix); cn.setMatrixAt(i, o.matrix); });
    for (const m of [tr, cn]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }

  // two lighting truss towers at the sides of the square (one carries the green exit sign, as in the photo)
  buildLightTowers() {
    const can = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.45, metalness: 0.5 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe2b0, emissiveIntensity: 0.6 });
    for (const s of [-1, 1]) {
      const x = s * 13.2, z = -5.5, H = 7.6, q = 0.15;
      const geos = [];
      for (const [dx, dz] of [[-q, -q], [q, -q], [q, q], [-q, q]]) geos.push(new THREE.CylinderGeometry(0.022, 0.022, H, 6).translate(x + dx, H / 2, z + dz));
      for (let y = 0.25; y < H; y += 0.42) {
        geos.push(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4).rotateZ(0.7).translate(x, y, z - q));
        geos.push(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4).rotateZ(-0.7).translate(x, y, z + q));
        geos.push(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4).rotateX(0.7).translate(x - q, y, z));
        geos.push(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4).rotateX(-0.7).translate(x + q, y, z));
      }
      geos.push(new THREE.BoxGeometry(1.8, 0.08, 0.08).translate(x, H, z));
      geos.push(new THREE.BoxGeometry(0.9, 0.06, 0.9).translate(x, 0.03, z));
      const t = new THREE.Mesh(bake(geos), this.steel); t.castShadow = true; this.group.add(t);
      const cans = [], lenses = [];
      for (const dx of [-0.7, -0.25, 0.25, 0.7]) {
        const c = new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10); c.rotateX(Math.PI / 2 - 0.5); c.rotateY(-s * 0.6);
        c.translate(x + dx, H - 0.2, z); cans.push(c);
        const l = new THREE.CircleGeometry(0.085, 10); l.rotateX(-0.5); l.rotateY(Math.PI - s * 0.6 + Math.PI); l.translate(x + dx, H - 0.2, z); lenses.push(l);
      }
      this.group.add(new THREE.Mesh(bake(cans), can));
      if (s > 0) {
        const ex = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.06), new THREE.MeshStandardMaterial({ map: signTex('SALIDA', '#13a34a', '#ffffff'), emissive: 0x3cff7a, emissiveIntensity: 0.25 }));
        ex.position.set(x - 0.25, 3.0, z + 0.2); this.group.add(ex);
      }
      this.posts.push([x, z, 0.5]);
    }
  }

  // the mixing desk under a black tent in the middle of the square, behind the fighters at the start
  buildFOH() {
    const x = 0, z = 14.5, W = 4.2;
    const tentMat = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.8, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.72, 1.2, 4, 1, true), tentMat);
    roof.rotation.y = Math.PI / 4; roof.position.set(x, 3.0, z); roof.castShadow = true; this.group.add(roof);
    const valance = new THREE.Mesh(new THREE.BoxGeometry(W, 0.35, W), [tentMat, tentMat, tentMat, tentMat, tentMat, tentMat]);
    valance.position.set(x, 2.25, z); this.group.add(valance);
    const legs = [];
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) legs.push(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 8).translate(x + dx * W / 2, 1.2, z + dz * W / 2));
    this.group.add(new THREE.Mesh(bake(legs), this.steel));
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.6 }));
    desk.position.set(x, 0.45, z - 0.4); desk.castShadow = true; this.group.add(desk);
    const panel = canvasTex(512, 160, (g, Wc, Hc) => {
      g.fillStyle = '#16171a'; g.fillRect(0, 0, Wc, Hc);
      for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { g.fillStyle = pick(['#3d8bff', '#ff4d4d', '#58ff7a', '#ffd34d', '#555']); g.fillRect(8 + i * 15.6, 14 + j * 34, 6, 6); }
      g.fillStyle = '#2b5cff'; g.fillRect(180, 120, 150, 30);
    });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.8), new THREE.MeshStandardMaterial({ map: panel, emissive: 0xffffff, emissiveMap: panel, emissiveIntensity: 0.5 }));
    top.rotation.x = -Math.PI / 2 + 0.12; top.position.set(x, 0.92, z - 0.4); this.group.add(top);
    this.posts.push([x, z, 2.9]);
  }

  // a wooden bar with a counter and fairy lights on the left, a food truck on the right, behind the fighters
  buildBar() {
    const x = -17.5, z = 13.5;
    const plank = canvasTex(256, 256, (g, W, H) => {
      for (let y = 0; y < H; y += 16) { g.fillStyle = pick(['#8a5f3c', '#7a5233', '#94683f', '#6e4a2e']); g.fillRect(0, y, W, 16); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 15, W, 1); }
    }, [2, 1]);
    const wood = new THREE.MeshStandardMaterial({ map: plank, roughness: 0.85 });
    const hut = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.7, 2.6), wood);
    hut.position.set(x, 1.35, z + 0.6); hut.castShadow = true; hut.receiveShadow = true; this.group.add(hut);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.15, 3.4), new THREE.MeshStandardMaterial({ color: 0x5d3f27, roughness: 0.9 }));
    roof.position.set(x, 2.8, z + 0.4); roof.rotation.x = 0.08; roof.castShadow = true; this.group.add(roof);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0x3c2a1b, roughness: 0.6 }));
    counter.position.set(x, 1.12, z - 0.75); this.group.add(counter);
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 1 }));
    opening.position.set(x, 1.65, z - 0.71); opening.rotation.y = Math.PI; this.group.add(opening);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshStandardMaterial({ map: signTex('BARRA', '#2a1a10', '#ffcf6b'), emissive: 0xffb84d, emissiveMap: signTex('BARRA', '#000', '#ffcf6b'), emissiveIntensity: 0.6 }));
    sign.position.set(x, 2.45, z - 0.72); sign.rotation.y = Math.PI; this.group.add(sign);
    this.festoonLine([new THREE.Vector3(x - 2.8, 2.7, z - 0.95), new THREE.Vector3(x + 2.8, 2.7, z - 0.95)], 0.25, 14);
    this.posts.push([x, z + 0.6, 3.0]);
  }

  buildFoodTruck() {
    const x = 17.5, z = 13.8;
    const body = canvasTex(1024, 256, (g, W, H) => {
      g.fillStyle = '#f1efe9'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#d9472b'; g.fillRect(0, H * 0.72, W, H * 0.14);
      g.fillStyle = '#20232a'; g.font = '900 64px "Arial Black", Arial'; g.textAlign = 'center'; g.fillText('BOCATAS · TAPAS', W / 2, H * 0.3);
    });
    const white = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 });
    const side = new THREE.MeshStandardMaterial({ map: body, roughness: 0.5 });
    const truck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.5, 2.3), [white, white, white, white, white, side]);
    truck.position.set(x, 1.6, z); truck.rotation.y = Math.PI; truck.castShadow = true; truck.receiveShadow = true; this.group.add(truck);
    const hatch = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.9), new THREE.MeshStandardMaterial({ color: 0x1c1712, emissive: 0xffc27a, emissiveIntensity: 0.18 }));
    hatch.position.set(x + 0.4, 1.95, z - 1.16); hatch.rotation.y = Math.PI; this.group.add(hatch);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 1.0), new THREE.MeshStandardMaterial({ color: 0xd9472b, roughness: 0.7 }));
    awning.position.set(x + 0.4, 2.62, z - 1.6); awning.rotation.x = 0.25; awning.castShadow = true; this.group.add(awning);
    const wheels = [];
    for (const dx of [-1.8, 1.8]) for (const dz of [-1.05, 1.05]) wheels.push(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 14).rotateX(Math.PI / 2).translate(x + dx, 0.38, z + dz));
    this.group.add(new THREE.Mesh(bake(wheels), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })));
    this.posts.push([x, z, 3.2]);
  }

  // ------------------------------------------------------------------ lights
  festoonLine(ends, sag, n) {
    const [a, b] = ends, pts = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0))); }
    const curve = new THREE.CatmullRomCurve3(pts);
    (this.festoonWires ||= []).push(new THREE.TubeGeometry(curve, 40, 0.007, 4));
    for (let i = 1; i < n; i++) (this.bulbs ||= []).push(curve.getPointAt(i / n).add(new THREE.Vector3(0, -0.07, 0)));
  }
  buildFestoons() {
    // strings of warm bulbs across the square, from poles on the side fences
    const poles = [];
    for (const z of [-4, 4.5, 13]) {
      this.festoonLine([new THREE.Vector3(-SIDE + 0.2, 6.0, z), new THREE.Vector3(SIDE - 0.2, 6.0, z + 1.2)], 1.1, 60);
      for (const s of [-1, 1]) poles.push(new THREE.CylinderGeometry(0.05, 0.07, 6.2, 8).translate(s * (SIDE - 0.2), 3.1, z + (s > 0 ? 1.2 : 0)));
    }
    // zigzag between the light towers and the stage towers
    for (const s of [-1, 1]) this.festoonLine([new THREE.Vector3(s * 13.2, 7.4, -5.5), new THREE.Vector3(s * TX, 7.8, SZ + 0.2)], 0.6, 24);
    this.group.add(new THREE.Mesh(bake(poles), this.steel));
    this.group.add(new THREE.Mesh(bake(this.festoonWires), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })));
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffb866, emissiveIntensity: 2.6, roughness: 0.3 });
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), bulbMat, this.bulbs.length);
    const o = new THREE.Object3D();
    this.bulbs.forEach((p, i) => { o.position.copy(p); o.scale.set(1, 1.25, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    this.group.add(im);
    this.animated.push(() => { bulbMat.emissiveIntensity = 2.5 + Math.sin(this.t * 3.1) * 0.08 + Math.sin(this.t * 7.7) * 0.05; });
  }

  // moving-head beams from the stage roof, soft in the evening light, sweeping to the music
  buildBeams() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.55, 0.65, 1.0) }, uK: { value: 0.12 } },
      vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uK; varying float vT; varying vec3 vN; varying vec3 vV;
        void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(uColor * uK * edge * pow(vT, 1.6), 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.CylinderGeometry(0.08, 1.6, 16, 18, 1, true); geo.translate(0, -8, 0); // tip at the origin, opening downwards
    const beams = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(geo, mat);
      b.position.set(-4.5 + i * 1.8, PH + 6.6, SHZ + 0.4); b.renderOrder = 3; b.frustumCulled = false;
      this.group.add(b); beams.push(b);
    }
    this.animated.push(() => {
      beams.forEach((b, i) => {
        const ph = this.t * 0.45 + i * 1.1;
        b.rotation.set(-0.55 - Math.sin(ph * 0.7) * 0.25, 0, Math.sin(ph) * 0.55 * (i % 2 ? 1 : -1));
      });
    });
  }

  // festival-goers along the fences, at the bar, the food truck and the mixing tent; they dance to the beat
  buildCrowd() {
    const atlas = tex('crowd_atlas.png', { srgb: true });
    const COLS = 16, ROWS = 4;
    const geo = new THREE.PlaneGeometry(0.9, 1.8); geo.translate(0, 0.9, 0);
    const spots = [];
    const add = (x, z, face) => spots.push({ x, z, face, s: rnd(0.93, 1.07) });
    for (let i = 0; i < 26; i++) add(rnd(-SIDE + 1, -12), rnd(-10, -3), rnd(0.3, 0.8));
    for (let i = 0; i < 26; i++) add(rnd(12, SIDE - 1), rnd(-10, -3), rnd(-0.8, -0.3));
    for (let i = 0; i < 12; i++) add(-17.5 + rnd(-2.5, 2.5), 11.6 - rnd(0, 1.6), Math.PI + rnd(-0.4, 0.4));
    for (let i = 0; i < 10; i++) add(17.9 + rnd(-1.8, 1.8), 11.6 - rnd(0, 1.6), Math.PI + rnd(-0.4, 0.4));
    for (let i = 0; i < 18; i++) { const a = rnd(-2.6, 2.6); add(Math.sin(a) * 3.4, 14.5 - Math.cos(a) * 3.4 + 0.5, a + Math.PI); }
    for (let i = 0; i < 30; i++) add(rnd(-SIDE + 1.5, SIDE - 1.5), rnd(BACK - 3.5, BACK - 1.4), Math.PI + rnd(-0.5, 0.5));
    const n = spots.length;
    const cell = new Float32Array(n * 2), ph = new Float32Array(n * 3);
    const mesh = new THREE.InstancedMesh(geo, null, n);
    const o = new THREE.Object3D();
    spots.forEach((p, i) => {
      o.position.set(p.x, 0, p.z); o.rotation.set(0, p.face, 0); o.scale.set(p.s * (rand() < 0.5 ? -1 : 1), p.s * rnd(0.97, 1.04), p.s);
      o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, new THREE.Color(rnd(0.9, 1.05), rnd(0.88, 1.02), rnd(0.86, 1.0)));
      const c = Math.floor(rand() * COLS * ROWS);
      cell[i * 2] = c % COLS; cell[i * 2 + 1] = ROWS - 1 - Math.floor(c / COLS);
      ph[i * 3] = rand() * 6.28; ph[i * 3 + 1] = rnd(0.02, 0.07); ph[i * 3 + 2] = rnd(0.8, 0.95);
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
    geo.setAttribute('aBob', new THREE.InstancedBufferAttribute(ph, 3));
    const uni = { uBeat: { value: 0 }, uExcite: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      // bounce on the music's beat (uBeat, in beats), everyone a little out of step
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell; attribute vec3 aBob; uniform float uBeat, uExcite; varying float vShade;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = ( uv + aCell ) / vec2( 16.0, 4.0 ); vShade = aBob.z;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += max( 0.0, sin( uBeat * 6.2832 + aBob.x * 0.6 ) ) * aBob.y * ( 1.0 + uExcite * 2.5 );');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShade;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, 0.85 ) * vShade;');
    };
    mesh.material = mat;
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    this.group.add(mesh);
    this.excite = 0;
    this.animated.push((dt) => {
      this.excite = Math.max(0, this.excite - dt * 0.4);
      uni.uBeat.value = this.beat; uni.uExcite.value = this.excite;
    });
  }
  cheer() { this.excite = 1; }

  bakeEnvironment() {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.1, 600, cubeRT);
    cc.position.set(0, 1.4, 0); this.scene.add(cc);
    const fog = this.scene.fog; this.scene.fog = null;
    cc.update(this.renderer, this.scene);
    this.scene.fog = fog; this.scene.remove(cc);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromCubemap(cubeRT.texture).texture;
    this.scene.environmentIntensity = 0.7;
    cubeRT.dispose();
  }

  update(dt, camera) {
    this.t += dt; this.cameraPos = camera.position;
    // the music's beat (main.js sets beatClock to the audio's), or 124 bpm of the stage's own clock
    const mb = this.beatClock?.();
    this.beat = mb ?? this.t * 124 / 60;
    for (const f of this.animated) f(dt);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { o.geometry?.dispose?.(); });
  }
}
