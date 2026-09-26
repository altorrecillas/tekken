// "El Porche": a neighbourhood street in front of a covered car-park entrance, graffiti on the shutters, overcast
// day. The ground floor of the main facade is the street photo the user sent (cleaned: no map interface, people,
// street number, tree or lamp post painted in; those two are real 3D objects here).
import * as THREE from 'three';
import { FIGHTER_KEY } from '../materials.js';
import { createFightSun, aimFightSun } from '../engine/sunshadow.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEX = 'assets/stage/';
const loader = new THREE.TextureLoader();
const pending = [];
function tex(name, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  let done;
  pending.push(new Promise(r => { done = r; setTimeout(r, 20000); }));
  const t = loader.load(TEX + name, () => done(), undefined, () => done());
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
function pbr(name, repeat, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex(`${name}_a.jpg`, { repeat }), normalMap: tex(`${name}_n.jpg`, { repeat, srgb: false }),
    roughnessMap: tex(`${name}_orm.jpg`, { repeat, srgb: false }), aoMap: tex(`${name}_orm.jpg`, { repeat, srgb: false }),
    roughness: 1, metalness: 0, ...extra,
  });
}
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// seeded so the set dressing is identical on every load
let seed = 0x5eed0fa1;
function rand() { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rnd = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];

// ------------------------------------------------------------------ the photo facade
// porche_gf.jpg: 2118 x 322 px of ground floor at 98 px per metre (measured on the person standing at the arcade)
const PX_M = 98, GF_PX = 2118, GF_W = GF_PX / PX_M, GF_H = 322 / PX_M;
const FZ = -6.2;                         // facade line; the fight happens on the pavement and the road in front
const X0 = -GF_W / 2;                    // world x of the photo's left edge
const px = (p) => X0 + p / PX_M;
// the arcade: two openings between stone columns, a lintel over them, a car park 6 m deep behind
const ARC = { l: 555, c0: 910, c1: 985, r: 1390, top: 345 / 1 };
const ARC_H = (640 - 345) / PX_M;       // opening height (3.0 m)
const ARC_D = 6.0;
// reusable ground-floor pieces of the photo for the neighbours: [x0, x1] in photo pixels
const PIECES = { pier: [85, 195], garage: [195, 465], pier2: [465, 555], shutter: [1960, 2118], door: [1470, 1760], hearts: [1790, 1960], erek: [0, 85] };

const OvercastSky = {
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
      // overcast: a bright grey dome, a veiled sun, heavy moving cloud bands
      vec3 zen = vec3(0.52, 0.57, 0.64), hor = vec3(0.8, 0.82, 0.84);
      vec3 col = mix(zen, hor, pow(1.0 - max(h, 0.0), 2.2));
      col += vec3(1.0, 0.97, 0.9) * pow(sd, 6.0) * 0.22;
      if (h > 0.0) {
        vec2 uv = d.xz / (h + 0.12);
        float c = fbm(vec3(uv * 0.55 + vec2(time * 0.01, 0.0), time * 0.004));
        float dark = smoothstep(0.35, 0.8, c);
        col = mix(col, vec3(0.62, 0.64, 0.68), dark * 0.55 * smoothstep(0.0, 0.25, h));
        col = mix(col, vec3(0.9, 0.9, 0.92), smoothstep(0.55, 0.75, fbm(vec3(uv * 1.3 + 7.0, time * 0.006))) * 0.35);
      } else col = mix(hor * 0.92, vec3(0.4, 0.4, 0.41), smoothstep(0.0, -0.15, h));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// ------------------------------------------------------------------ procedural textures
// upper floors of the main building: white piers and wide aluminium windows (two bays x two storeys, repeated)
function loftTex() {
  const rc = document.createElement('canvas'); rc.width = 1024; rc.height = 1088;
  const rg = rc.getContext('2d'); rg.fillStyle = '#e4e4e4'; rg.fillRect(0, 0, 1024, 1088);
  const t = canvasTex(1024, 1088, (g, W, H) => {
    g.fillStyle = '#e6e3dc'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(60,55,50,${rand() * 0.05})`; g.fillRect(rand() * W, rand() * H, 2, 2); }
    // rain streaks under the sills
    for (let i = 0; i < 60; i++) { const x = rand() * W; g.fillStyle = `rgba(70,65,60,${rnd(0.03, 0.08)})`; g.fillRect(x, rand() * H, rnd(2, 6), rnd(30, 140)); }
    const bw = 512, fh = 544;
    for (let fy = 0; fy < 2; fy++) for (let bx = 0; bx < 2; bx++) {
      const x = bx * bw + 40, y = fy * fh + 58, w = 432, h = 412;
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x - 6, y - 6, w + 12, h + 16); // reveal shadow
      // glass: overcast sky reflection, darker low, a few panes with the blinds down
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#9aa6ae'); gr.addColorStop(0.55, '#6f7a82'); gr.addColorStop(1, '#4a5258');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      rg.fillStyle = '#262626'; rg.fillRect(x, y, w, h);
      const tr = y + h * 0.62;
      for (let k = 0; k < 4; k++) {
        if (rand() < 0.3) { g.fillStyle = pick(['rgba(225,222,210,0.85)', 'rgba(205,210,215,0.8)']); const yy = rand() < 0.5 ? y : tr; g.fillRect(x + k * w / 4, yy, w / 4, (yy === y ? tr - y : y + h - tr) * rnd(0.4, 1)); }
      }
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(x + 40, y); g.lineTo(x + 120, y); g.lineTo(x + 20, y + h); g.lineTo(x - 60 < x ? x : x - 60, y + h); g.fill();
      // aluminium frame, transom and mullions
      g.fillStyle = '#3b3f43';
      g.fillRect(x - 8, y - 8, w + 16, 10); g.fillRect(x - 8, y + h - 2, w + 16, 12); g.fillRect(x - 8, y - 8, 10, h + 16); g.fillRect(x + w - 2, y - 8, 10, h + 16);
      g.fillRect(x, tr - 4, w, 9);
      for (let k = 1; k < 4; k++) g.fillRect(x + k * w / 4 - 3, y, 7, h);
      // sill
      g.fillStyle = '#d2cec5'; g.fillRect(x - 14, y + h + 10, w + 28, 10);
    }
    // floor slab band
    for (let fy = 0; fy < 2; fy++) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, fy * fh + fh - 26, W, 3); }
  });
  const r = new THREE.CanvasTexture(rc); r.colorSpace = THREE.NoColorSpace; t.userData.rough = r;
  return t;
}
// neighbourhood facades: stucco, tall windows with wooden roller blinds, small iron balconies
const flatsCache = new Map();
function flatsTex(base, trim, floors = 2) {
  const key = base + trim;
  if (flatsCache.has(key)) { const c = flatsCache.get(key), t = c.clone(); t.userData = { rough: c.userData.rough.clone() }; t.needsUpdate = true; t.userData.rough.needsUpdate = true; return t; }
  const rc = document.createElement('canvas'); rc.width = 512; rc.height = 1024;
  const rg = rc.getContext('2d'); rg.fillStyle = '#e8e8e8'; rg.fillRect(0, 0, 512, 1024);
  const t = canvasTex(512, 1024, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.04})`; g.fillRect(rand() * W, rand() * H, 3, 3); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,35,30,${rnd(0.03, 0.07)})`; g.fillRect(rand() * W, rand() * H, rnd(3, 8), rnd(40, 180)); }
    const fh = H / floors;
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      g.fillStyle = trim; g.fillRect(0, y + fh - 7, W, 7);
      for (let k = 0; k < 2; k++) {
        const x = 70 + k * 256, w = 116, wh = fh * 0.62, wy = y + fh * 0.18;
        g.fillStyle = '#2a3036'; g.fillRect(x, wy, w, wh);
        rg.fillStyle = '#3a3a3a'; rg.fillRect(x + 4, wy + 4, w - 8, wh - 8);
        g.fillStyle = 'rgba(170,190,205,0.22)'; g.fillRect(x + 6, wy + 4, 44, wh - 8);
        const pd = rand() * wh * 0.9;
        g.fillStyle = pick(['#8a6a4a', '#9b7b55', '#6f5a45', '#b9a88f', '#7d8c78']); g.fillRect(x, wy, w, pd);
        rg.fillStyle = '#cfcfcf'; rg.fillRect(x, wy, w, pd);
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1; for (let l = 0; l < pd; l += 4) { g.beginPath(); g.moveTo(x, wy + l); g.lineTo(x + w, wy + l); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - 6, wy - 6, w + 12, 6);
        // balcony
        g.fillStyle = trim; g.fillRect(x - 16, wy + wh, w + 32, 7);
        g.strokeStyle = '#1b1d20'; g.lineWidth = 2;
        for (let b = 0; b <= 14; b++) { g.beginPath(); g.moveTo(x - 14 + b * 10, wy + wh - 40); g.lineTo(x - 14 + b * 10, wy + wh); g.stroke(); }
        g.fillRect(x - 16, wy + wh - 42, w + 32, 3);
        if (rand() < 0.25) { g.fillStyle = pick(['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#e67e22']); g.fillRect(x + rnd(0, 80), wy + wh - 38, 22, 30); }
      }
    }
  });
  const r = new THREE.CanvasTexture(rc); r.colorSpace = THREE.NoColorSpace; t.userData.rough = r;
  flatsCache.set(key, t);
  return flatsTex(base, trim);
}
function facadeMat(t, extra = {}) {
  const r = t.userData.rough;
  if (r) { r.wrapS = t.wrapS; r.wrapT = t.wrapT; r.repeat.copy(t.repeat); }
  return new THREE.MeshStandardMaterial({ map: t, roughnessMap: r || null, roughness: 1, envMapIntensity: 1.0, ...extra });
}
function concreteTex(tone, lines = false) {
  return canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = tone; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.05})`; g.fillRect(rand() * W, rand() * H, rnd(1, 4), rnd(1, 4)); }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(20,18,15,${rnd(0.03, 0.08)})`; g.beginPath(); g.ellipse(rand() * W, rand() * H, rnd(20, 90), rnd(10, 50), rand() * 3, 0, 6.28); g.fill(); }
    if (lines) { g.fillStyle = 'rgba(214,170,40,0.85)'; for (const x of [120, 390]) g.fillRect(x, 0, 10, H); }
  }, [1, 1]);
}

// ------------------------------------------------------------------ stage
export class PorcheStage {
  constructor(renderer, scene, quality = 'high') {
    this.renderer = renderer; this.scene = scene; seed = 0x5eed0fa1;
    this.shadowSize = { low: 1024, medium: 1024, high: 2048, ultra: 2048 }[quality] || 2048;
    this.group = new THREE.Group(); this.group.name = 'stage-porche';
    scene.add(this.group);
    this.arenaRadius = 6.0;
    this.t = 0;
    this.animated = [];
    this.koView = new THREE.Vector3(0, 0, -1); // KO shots look at the photo facade
    // overcast: a veiled sun high over the street, soft shadows
    this.sunDir = new THREE.Vector3(0.38, 0.84, 0.39).normalize();
    this.trunks = []; this.gfPieces = []; this.trims = [];
    this.gfTex = tex('porche_gf.jpg', { wrap: false });
    this.buildSky(); this.buildLights(); this.buildGround(); this.buildMainBuilding(); this.buildArcade();
    this.buildNeighbours(); this.buildOpposite(); this.flushStreet(); this.buildStreetFurniture(); this.buildTrees();
    scene.fog = new THREE.FogExp2(new THREE.Color(0.74, 0.76, 0.79), 0.009);
  }
  ready() { return Promise.all(pending); }
  // walkable space: in front of the facade (not into the car park) and around the tree trunks
  clampWalk(p, r = 0) {
    if (p.z < FZ + 1.0 + r) p.z = FZ + 1.0 + r;
    for (const [tx, tz] of this.trunks) {
      const dx = p.x - tx, dz = p.z - tz, d = Math.hypot(dx, dz), R = 0.32 + r;
      if (d < R) { if (d < 1e-4) p.x = tx + R; else { p.x = tx + dx / d * R; p.z = tz + dz / d * R; } }
    }
    return p;
  }
  // cinematic cameras stay on the street, in front of both building lines
  clampCam(p) { p.x = THREE.MathUtils.clamp(p.x, -28, 28); p.z = THREE.MathUtils.clamp(p.z, FZ + 0.8, 11.2); return p; }

  buildSky() {
    const m = new THREE.ShaderMaterial({ ...OvercastSky, uniforms: THREE.UniformsUtils.clone(OvercastSky.uniforms), side: THREE.BackSide, depthWrite: false, fog: false });
    m.uniforms.sunDir.value.copy(this.sunDir);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), m);
    sky.renderOrder = -10; sky.frustumCulled = false; this.group.add(sky);
    this.animated.push((dt) => { m.uniforms.time.value += dt; sky.position.copy(this.cameraPos || new THREE.Vector3()); });
  }

  buildLights() {
    const sun = createFightSun(new THREE.Color(1.0, 0.96, 0.9), 2.3, this.shadowSize);
    this.sun = sun; this.group.add(sun); if (sun.target) this.group.add(sun.target);
    aimFightSun(sun, this.sunDir, new THREE.Vector3(), 2.6);
    this.keyColor = new THREE.Color(1.0, 0.97, 0.94); this.keyIntensity = 1.05;
    // grey sky light from everywhere: the overcast fill does most of the work
    this.group.add(new THREE.HemisphereLight(new THREE.Color(0.7, 0.74, 0.8), new THREE.Color(0.36, 0.35, 0.34), 1.05));
  }
  followShadow(center, spread = 3) {
    aimFightSun(this.sun, this.sunDir, center, Math.max(2.4, spread * 0.5 + 1.6));
  }
  followCamera(camera, center) {
    FIGHTER_KEY.dir.value.set(-0.44, 0.63, 0.64).normalize();
    FIGHTER_KEY.color.value.copy(this.keyColor).multiplyScalar(this.keyIntensity * (this.keyBoost || 1));
    FIGHTER_KEY.rim.value.setRGB(0.82, 0.86, 0.95).multiplyScalar(0.5);
  }

  // pavement in front of the facade, flush with the road (a shared-surface street), the far pavement raised
  buildGround() {
    const L = 170;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(L, 10), pbr('road', [L / 4, 2.5]));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, 2.8); road.receiveShadow = true; this.group.add(road);
    const pav = pbr('pavers', [L / 2.2, 4 / 2.2], { color: new THREE.Color(0.6, 0.61, 0.62) });
    const near = new THREE.Mesh(new THREE.PlaneGeometry(L, -2.2 - FZ), pav);
    near.rotation.x = -Math.PI / 2; near.position.set(0, 0.002, (FZ - 2.2) / 2); near.receiveShadow = true; this.group.add(near);
    const granite = pbr('stone', [L / 1.2, 1], { color: new THREE.Color(0.55, 0.55, 0.57) });
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.32), granite);
    edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.004, -2.2); edge.receiveShadow = true; this.group.add(edge);
    // far pavement with a real kerb (out of the fighting area)
    const far = new THREE.Mesh(new THREE.BoxGeometry(L, 0.15, 4.4), pbr('pavers', [L / 2.2, 2], { color: new THREE.Color(0.6, 0.61, 0.62) }));
    far.position.set(0, 0.075, 10.0); far.receiveShadow = true; this.group.add(far);
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(L, 0.16, 0.28), granite);
    kerb.position.set(0, 0.08, 7.86); kerb.receiveShadow = true; kerb.castShadow = true; this.group.add(kerb);
    // lane paint
    const paint = new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    const strips = [];
    for (let x = -L / 2; x < L / 2; x += 6) strips.push(new THREE.PlaneGeometry(3, 0.12).rotateX(-Math.PI / 2).translate(x + 1.5, 0.003, 3.4));
    strips.push(new THREE.PlaneGeometry(L, 0.1).rotateX(-Math.PI / 2).translate(0, 0.003, 5.6));
    const pm = new THREE.Mesh(mergeGeometries(strips), paint); pm.receiveShadow = true; this.group.add(pm);
  }

  // one textured quad of the photo facade: world x0..x1, photo columns p0..p1 (mirrored if p1 < p0)
  gfQuad(x0, x1, p0, p1, z, opts = {}) {
    const { y0 = 0, y1 = GF_H, v0 = 0, v1 = 1, face = 1, mat = null } = opts;
    const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), y1 - y0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, (p0 + (p1 - p0) * u) / GF_PX, v0 + (v1 - v0) * v);
    }
    const m = new THREE.Mesh(g, mat || this.gfMat());
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    if (face < 0) m.rotation.y = Math.PI;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }
  gfMat() {
    return (this._gfMat ||= new THREE.MeshStandardMaterial({ map: this.gfTex, roughness: 0.9, envMapIntensity: 0.6 }));
  }

  buildMainBuilding() {
    // ---- ground floor from the photo, with the two arcade openings left open
    const vTop = (ARC.top - 318) / 322; // lintel bottom in texture v (from the top)
    this.gfQuad(px(0), px(ARC.l), 0, ARC.l, FZ);
    this.gfQuad(px(ARC.c0), px(ARC.c1), ARC.c0, ARC.c1, FZ);
    this.gfQuad(px(ARC.r), px(GF_PX), ARC.r, GF_PX, FZ);
    // lintel over the openings
    this.gfQuad(px(ARC.l), px(ARC.r), ARC.l, ARC.r, FZ, { y0: ARC_H, y1: GF_H, v0: 1 - vTop, v1: 1 });
    // the main building continues to the left: the photo's left bays, mirrored
    const extL = ARC.l / PX_M;
    this.gfQuad(px(0) - extL, px(0), ARC.l, 0, FZ);
    // the neighbour on the right continues its travertine and shutter
    const extR = (GF_PX - 1790) / PX_M;
    this.gfQuad(px(GF_PX), px(GF_PX) + extR, 1790, GF_PX, FZ);
    // stone returns of the columns into the arcade (seen when the camera swings round)
    const stone = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.6, 0.56, 0.5), roughness: 0.92 });
    for (const [x, sgn] of [[px(ARC.l), 1], [px(ARC.c0), -1], [px(ARC.c1), 1], [px(ARC.r), -1]]) {
      const ret = new THREE.Mesh(new THREE.PlaneGeometry(0.55, ARC_H), stone);
      ret.rotation.y = sgn * Math.PI / 2; ret.position.set(x, ARC_H / 2, FZ - 0.275); ret.receiveShadow = true; this.group.add(ret);
    }
    // centre column: a real pillar (its photo face is the quad above)
    const col = new THREE.Mesh(new THREE.BoxGeometry((ARC.c1 - ARC.c0) / PX_M, ARC_H, 0.55), stone);
    col.position.set(px((ARC.c0 + ARC.c1) / 2), ARC_H / 2, FZ - 0.28); col.castShadow = true; this.group.add(col);

    // ---- canopy: the orange concrete slab over the ground floor of the main building
    const aX0 = px(0) - extL, aX1 = px(1440);
    const canopyTex = canvasTex(1024, 64, (g, W, H) => {
      g.fillStyle = '#a4694e'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.08})`; g.fillRect(rand() * W, rand() * H, 2, 2); }
      g.fillStyle = 'rgba(255,230,210,0.25)'; g.fillRect(0, 0, W, 5);
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < W; x += 128) g.fillRect(x, 0, 3, H);
      g.fillStyle = 'rgba(40,20,10,0.25)'; g.fillRect(0, H - 8, W, 8);
    }, [Math.round((aX1 - aX0) / 4), 1]);
    const canopyMat = new THREE.MeshStandardMaterial({ map: canopyTex, roughness: 0.88 });
    const under = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.27, 0.2), roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(aX1 - aX0, 0.55, 1.25), [canopyMat, canopyMat, canopyMat, under, canopyMat, canopyMat]);
    slab.position.set((aX0 + aX1) / 2, GF_H + 0.275, FZ + 0.62); slab.castShadow = true; slab.receiveShadow = true; this.group.add(slab);
    // column caps (brackets) under the slab, as in the photo
    for (const p of [ARC.l - 60, ARC.c0 + 35, ARC.r + 10, 140]) {
      // (flush with the slab's underside, a column capital running out to the slab edge)
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 1.22), under);
      b.position.set(px(p), GF_H - 0.1, FZ + 0.61); b.castShadow = true; b.receiveShadow = true; this.group.add(b);
    }
    // ---- upper floors: loft windows on the main building, stucco flats on the neighbour
    const loft = loftTex(); loft.wrapS = loft.wrapT = THREE.RepeatWrapping;
    const aw = aX1 - aX0, ah = 4 * 3.4;
    loft.repeat.set(aw / 6.4, 2);
    const loftMat = facadeMat(loft);
    const white = new THREE.MeshStandardMaterial({ color: 0xe2dfd8, roughness: 0.9 });
    const upA = new THREE.Mesh(new THREE.BoxGeometry(aw, ah, 12), [white, white, white, white, loftMat, white]);
    upA.position.set((aX0 + aX1) / 2, GF_H + 0.55 + ah / 2, FZ - 6); upA.castShadow = true; upA.receiveShadow = true; this.group.add(upA);
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(aw + 0.3, 0.9, 0.3), white);
    parapet.position.set((aX0 + aX1) / 2, GF_H + 0.55 + ah + 0.45, FZ + 0.1); parapet.castShadow = true; this.group.add(parapet);
    // neighbour on the right (travertine ground floor from the photo)
    const bX0 = aX1, bX1 = px(GF_PX) + extR, bh = 5 * 3.0;
    const flats = flatsTex('#d9c7ab', '#b59f7e', 5); flats.wrapS = flats.wrapT = THREE.RepeatWrapping; flats.repeat.set((bX1 - bX0) / 3.3, 1);
    const fm = facadeMat(flats), beige = new THREE.MeshStandardMaterial({ color: 0xd4c2a6, roughness: 0.9 });
    const upB = new THREE.Mesh(new THREE.BoxGeometry(bX1 - bX0, bh, 12), [beige, beige, beige, beige, fm, beige]);
    upB.position.set((bX0 + bX1) / 2, GF_H + bh / 2, FZ - 6); upB.castShadow = true; upB.receiveShadow = true; this.group.add(upB);
    const band = new THREE.Mesh(new THREE.BoxGeometry(bX1 - bX0, 0.3, 0.22), new THREE.MeshStandardMaterial({ color: 0xcdbfa6, roughness: 0.85 }));
    band.position.set((bX0 + bX1) / 2, GF_H + 0.15, FZ + 0.11); this.group.add(band);
    const cor = new THREE.Mesh(new THREE.BoxGeometry(bX1 - bX0 + 0.2, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0xbca98a, roughness: 0.85 }));
    cor.position.set((bX0 + bX1) / 2, GF_H + bh, FZ + 0.2); cor.castShadow = true; this.group.add(cor);
    this.mainSpan = [aX0, bX1];
  }

  // the covered car park behind the openings: the photo's far end, its graffiti side wall, a lit concrete ceiling
  buildArcade() {
    const x0 = px(ARC.l), x1 = px(ARC.r), w = x1 - x0, zb = FZ - ARC_D;
    const dim = new THREE.Color(0.72, 0.72, 0.72);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, ARC_H), new THREE.MeshStandardMaterial({ map: tex('porche_back.jpg', { wrap: false }), color: dim, roughness: 0.9, envMapIntensity: 0.12 }));
    back.position.set((x0 + x1) / 2, ARC_H / 2, zb); this.group.add(back);
    const sideT = tex('porche_side.jpg', { wrap: false });
    const left = new THREE.Mesh(new THREE.PlaneGeometry(ARC_D, ARC_H), new THREE.MeshStandardMaterial({ map: sideT, color: dim, roughness: 0.9, envMapIntensity: 0.12 }));
    left.rotation.y = Math.PI / 2; left.position.set(x0, ARC_H / 2, FZ - ARC_D / 2); this.group.add(left);
    const concrete = concreteTex('#6b6862');
    const right = new THREE.Mesh(new THREE.PlaneGeometry(ARC_D, ARC_H), new THREE.MeshStandardMaterial({ map: concrete, color: new THREE.Color(0.42, 0.42, 0.42), roughness: 0.95, envMapIntensity: 0.1 }));
    right.rotation.y = -Math.PI / 2; right.position.set(x1, ARC_H / 2, FZ - ARC_D / 2); this.group.add(right);
    const ceilT = concreteTex('#8a8780');
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, ARC_D), new THREE.MeshStandardMaterial({ map: ceilT, color: new THREE.Color(0.34, 0.34, 0.34), roughness: 0.95, envMapIntensity: 0.08 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set((x0 + x1) / 2, ARC_H, FZ - ARC_D / 2); this.group.add(ceil);
    const floorT = concreteTex('#8e8b84', true); floorT.repeat.set(w / 5, ARC_D / 5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, ARC_D), new THREE.MeshStandardMaterial({ map: floorT, color: new THREE.Color(0.5, 0.5, 0.5), roughness: 0.85, envMapIntensity: 0.12 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, 0.003, FZ - ARC_D / 2); floor.receiveShadow = true; this.group.add(floor);
    // fluorescent tubes (one flickers now and then)
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 2.2 });
    const flickMat = tubeMat.clone();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.12), i === 4 ? flickMat : tubeMat);
      m.position.set(x0 + w * (0.2 + 0.3 * (i % 3)), ARC_H - 0.04, FZ - 1.4 - Math.floor(i / 3) * 2.6); this.group.add(m);
    }
    this.animated.push(() => { const k = Math.sin(this.t * 1.7) > 0.93 ? (Math.sin(this.t * 90) > 0 ? 0.2 : 2.2) : 2.2; flickMat.emissiveIntensity = k; });
    // two more concrete pillars inside
    const pil = new THREE.MeshStandardMaterial({ map: concreteTex('#7d7a73'), color: new THREE.Color(0.45, 0.45, 0.45), roughness: 0.95, envMapIntensity: 0.1 });
    for (const [x, z] of [[x0 + w * 0.3, FZ - 3.4], [x0 + w * 0.72, FZ - 3.4]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, ARC_H, 0.5), pil); p.position.set(x, ARC_H / 2, z); this.group.add(p);
    }
  }

  // a building: stucco flats above a ground floor assembled from photo pieces; face = +1 looks to +z. Only the
  // street face exists (the sides are hidden by the neighbours): one textured plane, the ground-floor pieces and the
  // trims go into shared merged meshes (flushStreet)
  building(x0, x1, zFront, face, floors, palette) {
    const w = x1 - x0, h = floors * 3.0;
    const [base, trim] = palette;
    const t = flatsTex(base, trim); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 5.0, floors / 2);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), facadeMat(t));
    front.position.set((x0 + x1) / 2, GF_H + h / 2, zFront); if (face < 0) front.rotation.y = Math.PI;
    front.receiveShadow = true; this.group.add(front);
    const tc = new THREE.Color(trim);
    this.trims.push([new THREE.BoxGeometry(w + 0.2, 0.4, 0.5).translate((x0 + x1) / 2, GF_H + h, zFront + face * 0.2), tc]);
    this.trims.push([new THREE.BoxGeometry(w, 0.28, 0.3).translate((x0 + x1) / 2, GF_H + 0.1, zFront + face * 0.15), tc]);
    // ground floor: piers, garage doors and graffiti shutters cut from the photo, in a varied order
    const seq = ['pier', 'garage', 'pier2', 'shutter', 'pier', 'door', 'hearts', 'garage', 'pier2', 'erek', 'shutter'];
    let x = x0, k = Math.floor(rand() * seq.length);
    while (x < x1 - 0.05) {
      const [p0, p1] = PIECES[seq[k % seq.length]]; k++;
      const pw = Math.min((p1 - p0) / PX_M, x1 - x), pe = p0 + pw * PX_M, mir = rand() < 0.5;
      // (seen from the street, u runs left to right on both sides)
      const g = this.gfGeom(pw, mir ? pe : p0, mir ? p0 : pe);
      if (face < 0) g.rotateY(Math.PI);
      g.translate(x + pw / 2, GF_H / 2, zFront);
      this.gfPieces.push(g);
      x += pw;
    }
  }
  gfGeom(w, p0, p1) {
    const g = new THREE.PlaneGeometry(w, GF_H), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (p0 + (p1 - p0) * uv.getX(i)) / GF_PX);
    return g;
  }
  flushStreet() {
    const gf = new THREE.Mesh(mergeGeometries(this.gfPieces), this.gfMat()); gf.receiveShadow = true; this.group.add(gf);
    const geos = this.trims.map(([g, c]) => {
      g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
    });
    const tm = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    tm.castShadow = true; tm.receiveShadow = true; this.group.add(tm);
  }

  buildNeighbours() {
    const palettes = [['#d8cdb9', '#b2a184'], ['#e3d6c3', '#bca78a'], ['#cfc3b3', '#9e8f78'], ['#dccfbe', '#a99273'], ['#e8e1d4', '#c2b59d']];
    const [a0, b1] = this.mainSpan;
    let x = a0;
    while (x > -85) { const w = rnd(9, 15); this.building(x - w, x, FZ, 1, Math.floor(rnd(5, 8)), pick(palettes)); x -= w + rnd(0, 0.2); }
    x = b1;
    while (x < 85) { const w = rnd(9, 15); this.building(x, x + w, FZ, 1, Math.floor(rnd(5, 8)), pick(palettes)); x += w + rnd(0, 0.2); }
  }
  buildOpposite() {
    const palettes = [['#d9c3a5', '#a88e6a'], ['#e8dcc8', '#bca98a'], ['#c9b8a0', '#8d7b62'], ['#e4d0c0', '#b08a74'], ['#d8d8d0', '#9a9a90']];
    let x = -85;
    while (x < 85) { const w = rnd(10, 16); this.building(x, x + w, 12.2, -1, Math.floor(rnd(5, 8)), pick(palettes)); x += w + rnd(0, 0.2); }
  }

  buildStreetFurniture() {
    // lamp posts: the grey poles of the photo, on both pavements
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x7c8084, metalness: 0.55, roughness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x5d6166, metalness: 0.5, roughness: 0.45 });
    const lampSpots = [];
    for (let x = -70; x <= 70; x += 20) lampSpots.push([x, -2.7, 1], [x, 8.6, -1]);
    const inst = (geo, mat, list, place, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
      list.forEach((s, i) => { place(o, ...s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.castShadow = shadow; m.receiveShadow = true; this.group.add(m); return m;
    };
    inst(new THREE.CylinderGeometry(0.07, 0.11, 8, 10), poleMat, lampSpots, (o, x, z) => o.position.set(x, 4, z));
    inst(new THREE.BoxGeometry(0.1, 0.1, 1.5), poleMat, lampSpots, (o, x, z, s) => o.position.set(x, 7.9, z + s * 0.7), false);
    inst(new THREE.BoxGeometry(0.34, 0.14, 0.62), headMat, lampSpots, (o, x, z, s) => o.position.set(x, 7.82, z + s * 1.35), false);
    // bollards along the pavement edge, outside the fighting area
    const bol = [];
    for (let x = -60; x <= 60; x += 1.8) if (Math.abs(x) > 7.5) bol.push([x]);
    inst(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.4, roughness: 0.55 }), bol, (o, x) => o.position.set(x, 0.45, -2.35));
    // rubbish containers by the far kerb
    const cont = (x, col) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.35, 1.25), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
      body.position.y = 0.72; g.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.1, 1.3), new THREE.MeshStandardMaterial({ color: new THREE.Color(col).multiplyScalar(0.8), roughness: 0.55 }));
      lid.position.y = 1.44; lid.rotation.x = -0.06; g.add(lid);
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.position.set(x, 0, 7.05); this.group.add(g);
    };
    cont(-11.5, 0x6b6f72); cont(-9.5, 0x2f6b3a); cont(-7.5, 0xc9a227); cont(16, 0x6b6f72); cont(18, 0x3b5fa0);
  }

  // plane trees along both pavements: slender trunks, the canopy high (the photo's tree stands at x 5.2)
  buildTrees() {
    const bark = canvasTex(128, 256, (g, W, H) => {
      g.fillStyle = '#8c8272'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) { g.fillStyle = pick(['#b9ad96', '#6e6558', '#a39680', '#d2c7b0']); g.beginPath(); g.ellipse(rand() * W, rand() * H, rnd(6, 22), rnd(8, 30), 0, 0, 6.28); g.fill(); }
    }, [1, 2]);
    const trunkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.9 });
    const leafT = canvasTex(256, 256, (g) => {
      for (let i = 0; i < 420; i++) { const a = rand() * 6.28, r = rand() * 118; const sh = 0.45 + rand() * 0.55;
        g.fillStyle = `rgb(${Math.round(70 * sh + 25)},${Math.round(104 * sh + 36)},${Math.round(44 * sh + 18)})`;
        g.beginPath(); g.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 12, 7, rand() * 6.28, 0, 6.28); g.fill(); }
    });
    const leaf = new THREE.MeshStandardMaterial({ map: leafT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
    const planes = [];
    for (let i = 0; i < 60; i++) {
      const pg = new THREE.PlaneGeometry(1.7, 1.7), a = rand() * 6.28, r = rand() * 2.2;
      pg.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3)));
      pg.translate(Math.cos(a) * r, 5.2 + rand() * 3.0, Math.sin(a) * r * 0.8); planes.push(pg);
    }
    const canopy = mergeGeometries(planes);
    const trunkG = new THREE.CylinderGeometry(0.11, 0.16, 6.2, 10); trunkG.translate(0, 3.1, 0);
    // a fork: two leaning limbs into the canopy
    const limb1 = new THREE.CylinderGeometry(0.06, 0.09, 2.6, 8).translate(0, 1.3, 0).rotateZ(0.45).translate(0, 4.4, 0);
    const limb2 = new THREE.CylinderGeometry(0.05, 0.08, 2.4, 8).translate(0, 1.2, 0).rotateZ(-0.5).rotateY(1.2).translate(0, 4.8, 0);
    const wood = mergeGeometries([trunkG, limb1, limb2].map(g => g.index ? g.toNonIndexed() : g));
    const spots = [];
    for (let x = 5.2 - 9 * 9; x < 85; x += 9) spots.push([x + rnd(-0.4, 0.4), -4.7]);
    for (let x = -80; x < 85; x += 9.5) spots.push([x + rnd(-0.4, 0.4), 9.7]);
    const tr = new THREE.InstancedMesh(wood, trunkMat, spots.length), cn = new THREE.InstancedMesh(canopy, leaf, spots.length);
    const o = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      o.position.set(x, 0, z); o.rotation.set(0, rand() * 6.28, 0); o.scale.setScalar(rnd(0.9, 1.12)); o.updateMatrix();
      tr.setMatrixAt(i, o.matrix); cn.setMatrixAt(i, o.matrix);
      if (Math.abs(x) < 9 && z < 0) this.trunks.push([x, z]);
    });
    // tree grates
    const grate = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.02, 1.2), new THREE.MeshStandardMaterial({ color: 0x2c2d2e, metalness: 0.6, roughness: 0.6 }), spots.length);
    spots.forEach(([x, z], i) => { o.position.set(x, 0.01 + (z > 0 ? 0.15 : 0), z); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix(); grate.setMatrixAt(i, o.matrix); });
    grate.receiveShadow = true; this.group.add(grate);
    for (const m of [tr, cn]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }

  bakeEnvironment() {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.1, 600, cubeRT);
    cc.position.set(0, 1.4, 0); this.scene.add(cc);
    const fog = this.scene.fog; this.scene.fog = null;
    cc.update(this.renderer, this.scene);
    this.scene.fog = fog; this.scene.remove(cc);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromCubemap(cubeRT.texture).texture;
    this.scene.environmentIntensity = 0.75;
    cubeRT.dispose();
  }

  update(dt, camera) {
    this.t += dt; this.cameraPos = camera.position;
    for (const f of this.animated) f(dt);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { o.geometry?.dispose?.(); });
  }
}
