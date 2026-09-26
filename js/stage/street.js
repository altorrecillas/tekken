// "La Meta 10K": city avenue at the finish line of a popular 10K race, sunny morning.
import * as THREE from 'three';
import { FIGHTER_KEY } from '../materials.js';
import { createFightSun, aimFightSun } from '../engine/sunshadow.js';
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
let seed = 0x10c0ffee;
function rand() { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rnd = (a, b) => a + rand() * (b - a);
const PLAZA = { x0: 7.14, x1: 58, z0: -30, z1: 12 };
const pick = (a) => a[Math.floor(rand() * a.length)];

const DaySky = {
  uniforms: { sunDir: { value: new THREE.Vector3() }, time: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
  fragmentShader: `
    uniform vec3 sunDir; uniform float time; varying vec3 vDir;
    float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
    float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.02; a *= 0.5; } return v; }
    void main(){
      vec3 d = normalize(vDir); float h = d.y; float sd = max(dot(d, sunDir), 0.0);
      vec3 zen = vec3(0.12, 0.3, 0.72), hor = vec3(0.72, 0.84, 0.95);
      vec3 col = mix(zen, hor, pow(1.0 - max(h, 0.0), 3.5));
      col += vec3(1.0, 0.9, 0.7) * pow(sd, 12.0) * 0.35 + vec3(1.0, 0.95, 0.85) * pow(sd, 400.0) * 3.0;
      if (h > 0.0) {
        vec2 uv = d.xz / (h + 0.15);
        float c = fbm(vec3(uv * 0.7 + vec2(time * 0.006, 0.0), time * 0.003));
        c = smoothstep(0.55, 0.8, c) * smoothstep(0.02, 0.2, h);
        vec3 cc = mix(vec3(0.78, 0.82, 0.88), vec3(1.05), pow(sd, 2.0) * 0.5 + 0.5);
        col = mix(col, cc, c * 0.9);
      } else col = mix(hor * 0.9, vec3(0.35, 0.35, 0.36), smoothstep(0.0, -0.15, h));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// ------------------------------------------------------------------ procedural textures
function facadeTex(base, trim, floors, shops) {
  // roughness companion: glass (window panes, shop fronts) is glossy and picks up the sky, render is matte
  const rc = document.createElement('canvas'); rc.width = 512; rc.height = 1024;
  const rg = rc.getContext('2d'); rg.fillStyle = '#e8e8e8'; rg.fillRect(0, 0, 512, 1024);
  const t = canvasTex(512, 1024, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.035})`; g.fillRect(rand() * W, rand() * H, 3, 3); }
    const fh = H / floors;
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      g.fillStyle = trim; g.fillRect(0, y + fh - 8, W, 8); // floor slab line
      if (f === floors - 1 && shops) continue;
      for (let k = 0; k < 3; k++) {
        const x = 40 + k * 160;
        g.fillStyle = '#28303a'; g.fillRect(x, y + 22, 100, fh - 60);
        rg.fillStyle = '#383838'; rg.fillRect(x + 4, y + 26, 92, fh - 68);
        if (rand() < 0.35) { g.fillStyle = 'rgba(255,230,180,0.18)'; g.fillRect(x + 4, y + 26, 92, fh - 68); }
        g.fillStyle = 'rgba(160,200,230,0.25)'; g.fillRect(x + 6, y + 26, 38, fh - 68);
        // persiana (roller blind) half down
        const pd = rand() * (fh - 60);
        g.fillStyle = pick(['#b9a88f', '#8e8f89', '#6a7a64', '#9b6b4b']); g.fillRect(x, y + 22, 100, pd);
        rg.fillStyle = '#c8c8c8'; rg.fillRect(x, y + 22, 100, pd); // blinds are not glass
        g.strokeStyle = 'rgba(0,0,0,0.2)'; for (let l = 0; l < pd; l += 5) { g.beginPath(); g.moveTo(x, y + 22 + l); g.lineTo(x + 100, y + 22 + l); g.stroke(); }
        // balcony railing
        g.fillStyle = trim; g.fillRect(x - 12, y + fh - 44, 124, 6);
        g.strokeStyle = '#1d1f22'; g.lineWidth = 2;
        for (let b = 0; b <= 12; b++) { g.beginPath(); g.moveTo(x - 10 + b * 10, y + fh - 44); g.lineTo(x - 10 + b * 10, y + fh - 14); g.stroke(); }
        if (rand() < 0.25) { g.fillStyle = pick(['#c0392b', '#2e86c1', '#27ae60', '#f1c40f']); g.fillRect(x + 10, y + fh - 40, 20, 24); } // towel/flower pot
      }
    }
    if (shops) {
      const y = (floors - 1) * fh;
      g.fillStyle = '#20252b'; g.fillRect(20, y + 30, W - 40, fh - 40);
      g.fillStyle = 'rgba(200,220,235,0.3)'; g.fillRect(30, y + 60, W - 60, fh - 80);
      rg.fillStyle = '#2c2c2c'; rg.fillRect(30, y + 60, W - 60, fh - 80);
      // fascia only: the shop signs are separate instanced boards so neighbouring bays never repeat a name
      g.fillStyle = '#2a2c2e'; g.fillRect(20, y + 4, W - 40, 46);
    }
  });
  const r = new THREE.CanvasTexture(rc); r.colorSpace = THREE.NoColorSpace; r.anisotropy = 8;
  t.userData.rough = r;
  return t;
}
// facade material: shares the colour texture's repeat with its roughness companion
function facadeMat(t, extra = {}) {
  const r = t.userData.rough;
  if (r) { r.wrapS = t.wrapS; r.wrapT = t.wrapT; r.repeat.copy(t.repeat); }
  return new THREE.MeshStandardMaterial({ map: t, roughnessMap: r || null, roughness: 1, envMapIntensity: 1.1, ...extra });
}

function bannerTex(text, bg, fg, sub = '') {
  return canvasTex(1024, 256, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 0; i < W; i += 40) g.fillRect(i, 0, 20, H);
    g.fillStyle = fg; g.font = 'bold 150px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + (sub ? -18 : 6));
    if (sub) { g.font = 'bold 44px Arial'; g.fillText(sub, W / 2, H - 34); }
  });
}

function personTex() {
  return canvasTex(128, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const skin = pick(['#e0b89a', '#c99a7a', '#a8785a', '#f0c8a8', '#8a5a3a']);
    const shirt = pick(['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#ecf0f1', '#34495e', '#e67e22', '#9b59b6', '#1abc9c', '#c0392b']);
    const hair = pick(['#2c1e16', '#4a3226', '#111', '#8a6a4a', '#c8b89a', '#666']);
    // body
    g.fillStyle = shirt; g.beginPath(); g.ellipse(64, 170, 42, 70, 0, 0, Math.PI * 2); g.fill();
    // arms raised sometimes
    g.strokeStyle = skin; g.lineWidth = 12; g.lineCap = 'round';
    if (rand() < 0.4) { g.beginPath(); g.moveTo(30, 130); g.lineTo(14, 60); g.moveTo(98, 130); g.lineTo(114, 62); g.stroke(); }
    // head
    g.fillStyle = skin; g.beginPath(); g.arc(64, 72, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = hair; g.beginPath(); g.arc(64, 64, 27, Math.PI * 0.95, Math.PI * 2.05); g.fill();
    if (rand() < 0.3) { g.fillStyle = pick(['#c0392b', '#2c3e50', '#f39c12']); g.fillRect(36, 44, 56, 12); } // cap
  });
}

// ------------------------------------------------------------------ stage
export class StreetStage {
  constructor(renderer, scene, quality = 'high') {
    this.renderer = renderer; this.scene = scene; seed = 0x10c0ffee;
    this.shadowSize = { low: 1024, medium: 1024, high: 2048, ultra: 2048 }[quality] || 2048;
    this.group = new THREE.Group(); this.group.name = 'stage-street';
    scene.add(this.group);
    this.arenaRadius = 6.0;
    this.t = 0;
    this.animated = [];
    this.koView = new THREE.Vector3(0, 0, -1); // KO shots look towards the finish arch
    // morning sun pouring into the finish plaza on the +x side of the avenue
    this.sunDir = new THREE.Vector3(0.698, 0.669, 0.253).normalize();
    this.dustColor = new THREE.Color(0.55, 0.55, 0.56);
    this.buildSky(); this.buildLights(); this.buildRoad(); this.buildSidewalks(); this.buildBuildings();
    this.buildPlaza(); this.buildBarriers(); this.buildCrowd(); this.buildArch(); this.buildTrees(); this.flushTrees();
    scene.fog = new THREE.FogExp2(new THREE.Color(0.8, 0.83, 0.86), 0.0035);
  }
  ready() { return Promise.all(pending); }
  // walkable space: the avenue between the crowd barriers (fighters and ragdoll joints of radius r)
  clampWalk(p, r = 0) { const lim = 6.15 - r; if (p.x > lim) p.x = lim; else if (p.x < -lim) p.x = -lim; return p; }
  // cinematic cameras stay over the road, clear of the barriers and the crowd
  clampCam(p) { p.x = THREE.MathUtils.clamp(p.x, -5.5, 5.5); p.z = THREE.MathUtils.clamp(p.z, -45, 20); return p; }

  buildSky() {
    const m = new THREE.ShaderMaterial({ ...DaySky, uniforms: THREE.UniformsUtils.clone(DaySky.uniforms), side: THREE.BackSide, depthWrite: false, fog: false });
    m.uniforms.sunDir.value.copy(this.sunDir);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), m);
    sky.renderOrder = -10; sky.frustumCulled = false; this.group.add(sky);
    this.animated.push((dt) => { m.uniforms.time.value += dt; sky.position.copy(this.cameraPos || new THREE.Vector3()); });
  }

  buildLights() {
    const sun = createFightSun(new THREE.Color(1.0, 0.93, 0.82), 3.4, this.shadowSize);
    this.sun = sun; this.group.add(sun); if (sun.target) this.group.add(sun.target);
    aimFightSun(sun, this.sunDir, new THREE.Vector3(), 2.6);
    this.keyColor = new THREE.Color(1.0, 0.95, 0.9); this.keyIntensity = 1.0;
    this.group.add(new THREE.HemisphereLight(new THREE.Color(0.55, 0.68, 0.9), new THREE.Color(0.32, 0.31, 0.3), 0.6));
  }
  followShadow(center, spread = 3) {
    aimFightSun(this.sun, this.sunDir, center, Math.max(2.4, spread * 0.5 + 1.6));
  }
  followCamera(camera, center) {
    // character key light (fighters only): camera-relative, 35 deg to the left of the lens and ~40 deg up
    FIGHTER_KEY.dir.value.set(-0.44, 0.63, 0.64).normalize();
    FIGHTER_KEY.color.value.copy(this.keyColor).multiplyScalar(this.keyIntensity * (this.keyBoost || 1));
    FIGHTER_KEY.rim.value.setRGB(0.8, 0.88, 1.0).multiplyScalar(0.55);
  }


  buildRoad() {
    const L0 = -170, L1 = 70;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(14, L1 - L0), pbr('road', [3.5, (L1 - L0) / 4]));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, (L0 + L1) / 2); road.receiveShadow = true;
    this.group.add(road);
    const paint = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
    const addStrip = (x, z0, z1, w, mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, z1 - z0), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.003, (z0 + z1) / 2); m.receiveShadow = true; this.group.add(m);
    };
    for (let z = L0; z < L1; z += 9) addStrip(0, z, z + 3.5, 0.15, paint);
    addStrip(-6.6, L0, L1, 0.12, paint); addStrip(6.6, L0, L1, 0.12, paint);
    addStrip(-2.2, L0, L1, 0.1, blue); // race line
    // checkered finish line under the arch
    const chk = canvasTex(1024, 64, (g, W, H) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f0'; g.fillRect(i * 32, j * 32, 32, 32); } });
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.9), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 }));
    fin.rotation.x = -Math.PI / 2; fin.position.set(0, 0.004, -22); fin.receiveShadow = true; this.group.add(fin);
    const txt = canvasTex(1024, 256, (g, W, H) => { g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, W, H); g.fillStyle = '#f2f2ee'; g.font = 'bold 190px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('META', W / 2, H / 2); });
    const meta = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: txt, transparent: true, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -3 }));
    meta.rotation.x = -Math.PI / 2; meta.rotation.z = Math.PI; meta.position.set(0, 0.005, -25); this.group.add(meta);
  }

  buildSidewalks() {
    const pav = pbr('pavers', [2, 60]);
    const curbMat = pbr('stone', [40, 1]);
    for (const sx of [-1, 1]) {
      // the +x sidewalk opens into the finish plaza between z = -30 and z = 12
      for (const [z0, z1] of sx > 0 ? [[-170, -30], [12, 70]] : [[-170, 70]]) {
        const sw = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, z1 - z0), pav);
        sw.position.set(sx * 9.3, 0.08, (z0 + z1) / 2); sw.receiveShadow = true; this.group.add(sw);
      }
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 240), curbMat);
      curb.position.set(sx * 7.0, 0.09, -50); curb.receiveShadow = true; curb.castShadow = true; this.group.add(curb);
    }
    // street lamps: three instanced parts for both sides
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3136, metalness: 0.7, roughness: 0.45 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.4, metalness: 0.5 });
    const spots = [];
    for (const sx of [-1, 1]) for (let z = -150; z < 60; z += 18) spots.push([sx, z]);
    const inst = (geo, mat, place, shadow) => {
      const m = new THREE.InstancedMesh(geo, mat, spots.length);
      const o = new THREE.Object3D();
      spots.forEach(([sx, z], i) => { place(o, sx, z); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.castShadow = shadow; m.receiveShadow = true; this.group.add(m);
    };
    inst(new THREE.CylinderGeometry(0.07, 0.1, 7.5, 10), poleMat, (o, sx, z) => o.position.set(sx * 7.6, 3.75, z), true);
    inst(new THREE.BoxGeometry(1.4, 0.08, 0.08), poleMat, (o, sx, z) => o.position.set(sx * 7.0, 7.4, z), false);
    inst(new THREE.BoxGeometry(0.6, 0.18, 0.3), headMat, (o, sx, z) => o.position.set(sx * 6.4, 7.35, z), false);
  }

  buildBuildings() {
    const signSpots = [], balconySpots = [];
    const palettes = [['#e8dcc8', '#bca98a'], ['#d9c3a5', '#a88e6a'], ['#f0ece4', '#c9c0b0'], ['#c9b8a0', '#8d7b62'], ['#e4d0c0', '#b08a74'], ['#d8d8d0', '#9a9a90']];
    for (const sx of [-1, 1]) {
      let z = 60;
      while (z > -170) {
        let w = rnd(8, 16);
        if (sx > 0 && z > PLAZA.z1 && z - w < PLAZA.z1) { w = z - PLAZA.z1; if (w < 5) { z = PLAZA.z0; continue; } }
        else if (sx > 0 && z <= PLAZA.z1 && z > PLAZA.z0) { z = PLAZA.z0; continue; }
        const floors = Math.floor(rnd(5, 9));
        const h = floors * 3.1;
        const [base, trim] = pick(palettes);
        const t = facadeTex(base, trim, floors, true);
        t.wrapS = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w / 5)), 1);
        const mat = facadeMat(t);
        const b = new THREE.Mesh(new THREE.BoxGeometry(6, h, w), [mat.clone(), mat, mat, mat, mat, mat]);
        b.material[sx > 0 ? 1 : 0] = mat; // inner face gets the facade
        b.position.set(sx * (11.6 + 3), h / 2, z - w / 2);
        b.castShadow = true; b.receiveShadow = true;
        this.group.add(b);
        // cornice
        const cor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, w), new THREE.MeshStandardMaterial({ color: new THREE.Color(trim), roughness: 0.85 }));
        cor.position.set(sx * 11.55, h - 0.2, z - w / 2); cor.castShadow = true; this.group.add(cor);
        const bays = Math.max(1, Math.round(w / 5));
        for (let k = 0; k < bays; k++) signSpots.push([sx, z - (k + 0.5) * (w / bays), (w / bays) * 0.86]);
        // real balconies over the painted ones (same layout as facadeTex: 3 windows per 5 m bay, one per storey)
        const fh = 1024 / floors;
        for (let f = 0; f < floors - 1; f++) {
          const yb = h * (1 - (f * fh + fh - 14) / 1024);
          for (let k = 0; k < bays; k++) for (const uf of [0.1758, 0.4883, 0.8008]) balconySpots.push([sx, yb, z - (k + uf) * (w / bays)]);
        }
        z -= w + rnd(0, 0.4);
      }
    }
    this.buildBalconies(balconySpots);
    // shop signs: a pool of boards, instanced per artwork, never the same name twice in a row
    const SHOPS = [['FARMACIA', '#1e8449'], ['CAFÉ BAR', '#7b241c'], ['PANADERÍA', '#6e2c00'], ['FRUTERÍA', '#1d6b3a'], ['ESTANCO', '#6b1d1d'],
      ['LIBRERÍA', '#1a5276'], ['FERRETERÍA', '#212f3d'], ['PELUQUERÍA', '#5b2c6f'], ['ÓPTICA', '#154360'], ['CARNICERÍA', '#7b1f1f'], ['BAZAR', '#7d6608'], ['CERVECERÍA', '#784212']];
    const signTex = SHOPS.map(([name, col]) => canvasTex(512, 64, (g, W, H) => {
      g.fillStyle = col; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, W, 6);
      g.fillStyle = '#fff'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, W / 2, H / 2 + 2);
    }));
    const bySign = SHOPS.map(() => []);
    let last = -1;
    for (const sp of signSpots) { let k; do { k = Math.floor(rand() * SHOPS.length); } while (k === last); last = k; bySign[k].push(sp); }
    const sg = new THREE.PlaneGeometry(1, 0.46);
    const o = new THREE.Object3D();
    bySign.forEach((list, k) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ map: signTex[k], roughness: 0.55 }), list.length);
      list.forEach(([sx, zc, wd], i) => { o.position.set(sx * 11.57, 2.78, zc); o.rotation.set(0, -sx * Math.PI / 2, 0); o.scale.set(wd, 1, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.receiveShadow = true; this.group.add(m);
    });
    // far end of the avenue: a plaza building closing the view
    const endTex = facadeTex('#e9e1d2', '#bfae92', 7, true); endTex.wrapS = THREE.RepeatWrapping; endTex.repeat.set(8, 1);
    const endMat = facadeMat(endTex);
    const end = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 4), endMat);
    end.position.set(0, 12, -178); this.group.add(end);
    // town hall tower with a tiled dome closing the vista
    const towerTex = facadeTex('#efe6d6', '#b9a483', 4, false); towerTex.wrapS = THREE.RepeatWrapping; towerTex.repeat.set(1.5, 1);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 13, 7), facadeMat(towerTex));
    tower.position.set(0, 24 + 6.5, -178); this.group.add(tower);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.6, 7.8), new THREE.MeshStandardMaterial({ color: 0xcdbb9a, roughness: 0.85 }));
    cornice.position.set(0, 37.3, -178); this.group.add(cornice);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.5, 2.4, 32), new THREE.MeshStandardMaterial({ color: 0xe7dcc8, roughness: 0.9 }));
    drum.position.set(0, 38.8, -178); this.group.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f6f8a, roughness: 0.35, metalness: 0.2 }));
    dome.scale.y = 1.25; dome.position.set(0, 40, -178); this.group.add(dome);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.2, 12), new THREE.MeshStandardMaterial({ color: 0xc9a44a, metalness: 0.8, roughness: 0.3 }));
    spire.position.set(0, 45.8, -178); this.group.add(spire);
    const clockTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#f4efe2'; g.beginPath(); g.arc(128, 128, 120, 0, 6.28); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 8; g.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; g.fillStyle = '#222'; g.fillRect(128 + Math.sin(a) * 96 - 4, 128 - Math.cos(a) * 96 - 10, 8, 20); }
      g.lineWidth = 10; g.beginPath(); g.moveTo(128, 128); g.lineTo(178, 98); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(118, 43); g.stroke();
    });
    const clock = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), new THREE.MeshStandardMaterial({ map: clockTex, roughness: 0.6 }));
    clock.position.set(0, 33, -178 + 3.52); this.group.add(clock);
    // skyline behind the plaza building: blocks of varied height, depth and tint rising over its roofline, so the
    // vista reads as a city receding into the haze instead of one flat wall
    const skyMats = [['#e0c9a6', '#b0916a'], ['#d6a987', '#9f7555'], ['#ece3d3', '#bdae96']].map(([a, b]) => {
      const t = facadeTex(a, b, 12, false); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); return facadeMat(t);
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9a5a3c, roughness: 0.85 });
    for (let i = 0; i < 12; i++) {
      const x = -52 + i * 9.4 + rnd(-2, 2);
      if (Math.abs(x) < 7) continue; // the tower keeps its silhouette against the sky
      const w = rnd(8, 12), h = rnd(27, 46), d = rnd(9, 15), z = -188 - rnd(0, 26);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skyMats[i % 3]);
      b.position.set(x, h / 2, z); this.group.add(b);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.7, d + 0.5), roofMat);
      cap.position.set(x, h + 0.35, z); this.group.add(cap);
      if (rand() < 0.5) { // rooftop water tanks / stair houses break the straight roof lines
        const box = new THREE.Mesh(new THREE.BoxGeometry(rnd(2, 4), rnd(1.5, 3), rnd(2, 4)), skyMats[(i + 1) % 3]);
        box.position.set(x + rnd(-w / 4, w / 4), h + 1.5, z + rnd(-d / 4, d / 4)); this.group.add(box);
      }
    }
  }

  // instanced balconies: concrete slab + metal top rail (vertex coloured) and alpha-tested bar panels
  buildBalconies(spots) {
    if (!spots.length) return;
    const W = 1.3, D = 0.55, Hh = 0.95;
    const slab = new THREE.BoxGeometry(D, 0.1, W).translate(D / 2, -0.05, 0);
    const rail = new THREE.BoxGeometry(0.045, 0.045, W).translate(D - 0.02, Hh, 0);
    const railS = [new THREE.BoxGeometry(D, 0.04, 0.04).translate(D / 2, Hh, W / 2), new THREE.BoxGeometry(D, 0.04, 0.04).translate(D / 2, Hh, -W / 2)];
    const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const solid = mergeGeometries([paint(slab, [0.86, 0.84, 0.8]), paint(rail, [0.12, 0.13, 0.14]), ...railS.map(g => paint(g, [0.12, 0.13, 0.14]))].map(g => g.index ? g.toNonIndexed() : g));
    const front = new THREE.PlaneGeometry(W, Hh).rotateY(Math.PI / 2).translate(D - 0.02, Hh / 2, 0);
    const sideA = new THREE.PlaneGeometry(D, Hh).translate(D / 2, Hh / 2, W / 2);
    const sideB = new THREE.PlaneGeometry(D, Hh).translate(D / 2, Hh / 2, -W / 2);
    const bars = mergeGeometries([front, sideA, sideB]);
    const barTex = canvasTex(256, 128, (g, Wc, Hc) => {
      g.clearRect(0, 0, Wc, Hc); g.fillStyle = '#1e2124';
      for (let x = 4; x < Wc; x += 12) g.fillRect(x, 0, 3, Hc);
      g.fillRect(0, Hc - 10, Wc, 10); g.fillRect(0, 0, Wc, 5);
    });
    barTex.wrapS = THREE.RepeatWrapping;
    const o = new THREE.Object3D();
    const mS = new THREE.InstancedMesh(solid, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), spots.length);
    const mB = new THREE.InstancedMesh(bars, new THREE.MeshStandardMaterial({ map: barTex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }), spots.length);
    spots.forEach(([sx, y, z], i) => {
      o.position.set(sx * 11.6, y, z); o.rotation.set(0, sx > 0 ? Math.PI : 0, 0); o.updateMatrix();
      mS.setMatrixAt(i, o.matrix); mB.setMatrixAt(i, o.matrix);
    });
    for (const m of [mS, mB]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }

  buildBarriers() {
    // one merged crowd-barrier unit, instanced along both sides; banners instanced per artwork
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.85, roughness: 0.35 });
    const parts = [];
    const railG = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8); railG.rotateZ(Math.PI / 2);
    for (const y of [0.15, 1.05]) parts.push(railG.clone().translate(0, y, 0));
    for (let i = 0; i <= 12; i++) parts.push(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 6).translate(-1.05 + i * 0.175, 0.6, 0));
    for (const x of [-1.0, 1.0]) parts.push(new THREE.BoxGeometry(0.06, 0.04, 0.7).translate(x, 0.02, 0));
    const unitG = mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
    unitG.rotateY(Math.PI / 2);
    const banners = [bannerTex('10K BARRIO', '#1f4fa3', '#ffffff', 'CARRERA POPULAR'), bannerTex('¡ÁNIMO!', '#d72d2d', '#ffffff'), bannerTex('CORRE', '#f2c200', '#1b1b1b', 'KM 10'),
      bannerTex('META', '#111111', '#ffe34d'), bannerTex('AGUA', '#1596d2', '#ffffff', 'AVITUALLAMIENTO')];
    const units = [], bann = banners.map(() => []);
    for (const sx of [-1, 1]) for (let z = -60; z < 30; z += 2.3) {
      units.push([sx, z]);
      if (rand() < 0.7) bann[Math.floor(rand() * banners.length)].push([sx, z]);
    }
    const o = new THREE.Object3D();
    const bm = new THREE.InstancedMesh(unitG, metal, units.length);
    units.forEach(([sx, z], i) => { o.position.set(sx * 6.35, 0, z); o.rotation.set(0, 0, 0); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); });
    bm.castShadow = true; bm.receiveShadow = true; this.group.add(bm);
    const bg = new THREE.PlaneGeometry(2.1, 0.55);
    banners.forEach((tex, k) => {
      if (!bann[k].length) return;
      const m = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }), bann[k].length);
      bann[k].forEach(([sx, z], i) => { o.position.set(sx * 6.34, 0.62, z); o.rotation.set(0, -sx * Math.PI / 2, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.receiveShadow = true; this.group.add(m);
    });
  }

  buildCrowd() {
    const atlas = tex('crowd_atlas.png', { srgb: true });
    atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping; atlas.repeat.set(1, 1);
    const COLS = 16, ROWS = 4;
    const geo = new THREE.PlaneGeometry(0.9, 1.8); geo.translate(0, 0.9, 0);
    const spots = [];
    for (const sx of [-1, 1]) for (let z = -55; z < 25; z += 0.5) for (let row = 0; row < 3; row++) {
      if (rand() < 0.2) continue;
      spots.push({ x: sx * (6.95 + row * 0.6 + rnd(-0.12, 0.12)), z: z + rnd(-0.2, 0.2), sx, s: rnd(0.93, 1.07) });
    }
    const n = spots.length;
    const cell = new Float32Array(n * 2), ph = new Float32Array(n * 3);
    const mesh = new THREE.InstancedMesh(geo, null, n);
    const o = new THREE.Object3D();
    spots.forEach((p, i) => {
      // mirrored half of the time: twice the variety from the same atlas
      o.position.set(p.x, 0.16, p.z); o.rotation.set(0, -p.sx * Math.PI / 2 + rnd(-0.25, 0.25), 0); o.scale.set(p.s * (rand() < 0.5 ? -1 : 1), p.s * rnd(0.97, 1.04), p.s);
      o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, new THREE.Color(rnd(0.88, 1.04), rnd(0.88, 1.02), rnd(0.86, 1.02)));
      const c = Math.floor(rand() * COLS * ROWS);
      cell[i * 2] = c % COLS; cell[i * 2 + 1] = ROWS - 1 - Math.floor(c / COLS);
      // bob phase, amplitude, and light: the -x side faces the sun, the +x side is backlit
      ph[i * 3] = rand() * 6.28; ph[i * 3 + 1] = rnd(0.015, 0.06); ph[i * 3 + 2] = p.sx < 0 ? rnd(0.78, 0.86) : rnd(0.88, 0.96);
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
    geo.setAttribute('aBob', new THREE.InstancedBufferAttribute(ph, 3));
    const uni = { uTime: { value: 0 }, uExcite: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell; attribute vec3 aBob; uniform float uTime, uExcite; varying float vShade;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = ( uv + aCell ) / vec2( 16.0, 4.0 ); vShade = aBob.z;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += max( 0.0, sin( uTime * 6.0 * ( 0.7 + aBob.y * 5.0 ) + aBob.x ) ) * aBob.y * ( 1.0 + uExcite * 3.0 );');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShade;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, 0.85 ) * vShade;');
    };
    mesh.material = mat;
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    this.group.add(mesh);
    this.excite = 0;
    this.animated.push((dt) => {
      this.excite = Math.max(0, this.excite - dt * 0.4);
      uni.uTime.value = this.t; uni.uExcite.value = this.excite;
    });
  }
  cheer() { this.excite = 1; }

  buildArch() {
    // inflatable finish arch at z = -14
    const red = new THREE.MeshStandardMaterial({ color: 0xd8262e, roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-7.4, 0, 0), new THREE.Vector3(-7.3, 4.2, 0), new THREE.Vector3(-5.6, 6.6, 0), new THREE.Vector3(0, 7.3, 0),
      new THREE.Vector3(5.6, 6.6, 0), new THREE.Vector3(7.3, 4.2, 0), new THREE.Vector3(7.4, 0, 0)]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 90, 0.75, 24), red);
    tube.castShadow = true; g.add(tube);
    // white stripes
    for (let i = 1; i < 12; i++) {
      const p = curve.getPointAt(i / 12), t = curve.getTangentAt(i / 12);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.05, 8, 32), white);
      ring.position.copy(p); ring.lookAt(p.clone().add(t)); g.add(ring);
    }
    const ban = bannerTex('META', '#101820', '#ffe34d', '10K DEL BARRIO · 2026');
    for (const zs of [1, -1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 2.1), new THREE.MeshStandardMaterial({ map: ban, roughness: 0.75 }));
      b.position.set(0, 5.45, zs * 0.78); if (zs < 0) b.rotation.y = Math.PI; g.add(b);
    }
    // LED race clock on top
    this.clockCanvas = document.createElement('canvas'); this.clockCanvas.width = 512; this.clockCanvas.height = 128;
    this.clockTex = new THREE.CanvasTexture(this.clockCanvas); this.clockTex.colorSpace = THREE.SRGBColorSpace;
    const clock = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 0.3), [white, white, white, white,
      new THREE.MeshStandardMaterial({ map: this.clockTex, emissive: 0xffffff, emissiveMap: this.clockTex, emissiveIntensity: 1.6 }), white]);
    clock.position.set(0, 8.35, 0); g.add(clock);
    this.raceTime = 38 * 60 + 12;
    g.position.set(0, 0, -22);
    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    this.group.add(g);
    this.animated.push((dt) => {
      this.raceTime += dt;
      const t = Math.floor(this.raceTime), s = String(t % 60).padStart(2, '0'), mn = String(Math.floor(t / 60) % 60).padStart(2, '0'), h = Math.floor(t / 3600);
      const c = this.clockCanvas.getContext('2d');
      if (this._last !== t) {
        this._last = t;
        c.fillStyle = '#050505'; c.fillRect(0, 0, 512, 128);
        c.fillStyle = '#ff3b1f'; c.font = 'bold 96px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = '#ff6a3a'; c.shadowBlur = 18;
        c.fillText(`${h}:${mn}:${s}`, 256, 68);
        this.clockTex.needsUpdate = true;
      }
    });
    // balloons at the arch feet
    const bcol = [0xd8262e, 0xffffff, 0x1f4fa3, 0xffd400];
    const bl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12 }), 28);
    const ob = new THREE.Object3D(); let bi = 0;
    for (const sx of [-1, 1]) for (let i = 0; i < 14; i++) {
      ob.position.set(sx * rnd(7.9, 8.8), rnd(1.5, 3.5), -22 + rnd(-0.7, 0.7)); ob.scale.set(1, 1.15, 1); ob.updateMatrix();
      bl.setMatrixAt(bi, ob.matrix); bl.setColorAt(bi, new THREE.Color(pick(bcol))); bi++;
    }
    bl.castShadow = true; this.group.add(bl);
  }

  treeKit() {
    if (this._treeKit) return this._treeKit;
    const trunk = new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 0.9 });
    const leafT = canvasTex(256, 256, (g) => {
      for (let i = 0; i < 360; i++) { const a = rand() * 6.28, r = rand() * 115; const sh = 0.5 + rand() * 0.5;
        g.fillStyle = `rgb(${Math.round(60 * sh + 20)},${Math.round(110 * sh + 30)},${Math.round(40 * sh + 15)})`;
        g.beginPath(); g.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 11, 6, rand() * 6.28, 0, 6.28); g.fill(); }
    });
    const leaf = new THREE.MeshStandardMaterial({ map: leafT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
    const planes = [];
    for (let i = 0; i < 44; i++) {
      const pg = new THREE.PlaneGeometry(1.5, 1.5);
      const a = rand() * 6.28, r = rand() * 1.9;
      pg.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3)));
      pg.translate(Math.cos(a) * r, 4.3 + rand() * 2.4, Math.sin(a) * r);
      planes.push(pg);
    }
    const canopy = mergeGeometries(planes);
    const trunkG = new THREE.CylinderGeometry(0.14, 0.2, 4.2, 8); trunkG.translate(0, 2.1, 0);
    return (this._treeKit = { trunk, leaf, canopy, trunkG, spots: [] });
  }
  makeTree(x, z, scale = 1) {
    this.treeKit().spots.push([x, z, scale, rand() * 6.28]);
  }
  flushTrees() {
    const K = this.treeKit(), n = K.spots.length;
    const tr = new THREE.InstancedMesh(K.trunkG, K.trunk, n), cn = new THREE.InstancedMesh(K.canopy, K.leaf, n);
    const o = new THREE.Object3D();
    K.spots.forEach(([x, z, s, ry], i) => { o.position.set(x, 0.16, z); o.rotation.set(0, ry, 0); o.scale.setScalar(s); o.updateMatrix(); tr.setMatrixAt(i, o.matrix); cn.setMatrixAt(i, o.matrix); });
    for (const m of [tr, cn]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }
  buildTrees() {
    for (const sx of [-1, 1]) for (let z = -140; z < 50; z += 11) {
      if (Math.abs(z + 22) < 4) continue;
      this.makeTree(sx * 8.4, z);
    }
  }

  // finish plaza opening off the avenue: lets the morning sun reach the fight and the arch
  buildPlaza() {
    const P = PLAZA;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(P.x1 - P.x0, 0.16, P.z1 - P.z0), pbr('pavers', [(P.x1 - P.x0) / 4, (P.z1 - P.z0) / 4]));
    ground.position.set((P.x0 + P.x1) / 2, 0.08, (P.z0 + P.z1) / 2); ground.receiveShadow = true; this.group.add(ground);
    const palettes = [['#e8dcc8', '#bca98a'], ['#d9c3a5', '#a88e6a'], ['#f0ece4', '#c9c0b0'], ['#c9b8a0', '#8d7b62'], ['#e4d0c0', '#b08a74']];
    const block = (cx, cz, wx, wz, floors) => {
      const h = floors * 3.1, [base, trim] = pick(palettes);
      const t = facadeTex(base, trim, floors, true); t.wrapS = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(Math.max(wx, wz) / 5)), 1);
      const b = new THREE.Mesh(new THREE.BoxGeometry(wx, h, wz), facadeMat(t));
      b.position.set(cx, h / 2, cz); b.castShadow = true; b.receiveShadow = true; this.group.add(b);
    };
    for (const zc of [P.z1 + 3, P.z0 - 3]) {
      let x = 17.6;
      while (x < P.x1 + 6 - 1) { const w = Math.min(rnd(9, 15), P.x1 + 6 - x); block(x + w / 2, zc, w, 6, Math.floor(rnd(5, 8))); x += w; }
    }
    for (let z = P.z0; z < P.z1 - 1;) { const w = Math.min(rnd(10, 16), P.z1 - z); block(P.x1 + 3, z + w / 2, 6, w, Math.floor(rnd(6, 9))); z += w; }
    // fountain, benches and plane trees
    const stone = pbr('stone', [3, 1]);
    const fx = 34, fz = (P.z0 + P.z1) / 2;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.6, 48, 1, true), stone); basin.position.set(fx, 0.46, fz);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.14, 8, 64), stone); rim.rotation.x = Math.PI / 2; rim.position.set(fx, 0.76, fz);
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ color: 0x2c5866, roughness: 0.06, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2; water.position.set(fx, 0.62, fz);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 2.2, 20), stone); column.position.set(fx, 1.3, fz);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.3, 0.35, 32), stone); bowl.position.set(fx, 2.45, fz);
    for (const m of [basin, rim, column, bowl]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    water.receiveShadow = true; this.group.add(water);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.75 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.5, metalness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5, bx = fx + Math.cos(a) * 6.2, bz = fz + Math.sin(a) * 6.2;
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), wood); seat.position.y = 0.45; bench.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.05), wood); back.position.set(0, 0.72, -0.22); back.rotation.x = -0.12; bench.add(back);
      for (const lx of [-0.75, 0.75]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), iron); leg.position.set(lx, 0.22, 0); bench.add(leg); }
      bench.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      bench.position.set(bx, 0.16, bz); bench.lookAt(fx, 0.16, fz); this.group.add(bench);
    }
    for (const [x, z] of [[16, -24], [16, 6], [25, -24], [25, 6], [44, -24], [44, 6], [52, -24], [52, 6], [22, -9], [48, -9]]) this.makeTree(x, z, rnd(1.05, 1.3));
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
    this.scene.environmentIntensity = 0.8;
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
