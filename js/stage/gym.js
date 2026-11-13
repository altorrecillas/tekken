// "El gimnasio del barrio", where Camilo trains (Dominadas Powa) and Alejandro comes in to use the treadmills. Made
// here by code (canvas textures, no photos):
//  - a black rubber floor flecked with colour, a strip of artificial turf with white lines at the front;
//  - the back wall: a run of mirrors in black frames, a slogan above them (EL GYM ES FÁCIL), a whiteboard of the
//    month's records; dumbbell racks either side of the mirrors;
//  - on the left a power rack with its pull-up bar and a barbell on the hooks, a cable column, kettlebells along the
//    wall and the mural DOMINADAS POWA; on the right a row of treadmills with their lit screens;
//  - a dark open ceiling with ducts and rows of LED panels; a red neon sign; a heavy bag in the far corner.
// The sides and the mirrors are solid: a fighter knocked into them is slammed against them (lastWall, Match.wallImpact):
// the mirror takes a crack and drops glass, the machines clang. Lit for the fighters by the cool white of the panels
// from above, with a warm kicker off the neon.
import * as THREE from 'three';
import { FIGHTER_KEY } from '../materials.js';
import { createFightSun, aimFightSun } from '../engine/sunshadow.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

let seed = 0x6E7A;
function rand() { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rnd = (a, b) => a + rand() * (b - a);
function bake(geos) { return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))); }
function canvasTex(w, h, draw, { repeat = null, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// the room, in metres of the stage (the fight starts at the origin, the camera looks towards -z)
const MIRROR_Z = -6.0;                  // the mirrors' face
const SIDE_X = 6.35;                    // the face of the machines along both sides
const BACK_Z = -6.25, FRONT_Z = 10, ROOM_X = 11, CEIL = 4.4;

// the mirrors' planar reflection (high quality): the room and the fighters, a touch darker and cooler than they are,
// in linear light like the rest of the frame (the composer tone-maps it)
const MirrorShader = {
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vUv0;
    void main() { vUv = textureMatrix * vec4( position, 1.0 ); vUv0 = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec4 vUv; varying vec2 vUv0;
    void main() {
      vec3 refl = min( texture2DProj( tDiffuse, vUv ).rgb, vec3( 4.0 ) );
      // a faint haze towards the bottom (the gym's breath and fingerprints on the glass)
      float haze = 0.035 * ( 1.0 - smoothstep( 0.0, 0.45, vUv0.y ) );
      gl_FragColor = vec4( refl * vec3( 0.84, 0.88, 0.9 ) + haze, 1.0 );
    }`,
};

// ------------------------------------------------------------------ textures
function rubberTex(size) {
  return canvasTex(size, size, (g, W, H) => {
    g.fillStyle = '#17181a'; g.fillRect(0, 0, W, H);
    // the flecks of coloured rubber in the black
    const cols = ['#3a6fd8', '#d84a3a', '#e6c84a', '#e9e9e9', '#4ab06a'];
    for (let i = 0; i < W * H / 90; i++) { g.fillStyle = cols[Math.floor(rand() * cols.length)]; g.globalAlpha = rnd(0.25, 0.7); g.fillRect(rand() * W, rand() * H, rnd(1, 2.4), rnd(1, 2.4)); }
    g.globalAlpha = 1;
    // grain, and the seams of the 1 m tiles (the texture is one tile)
    for (let i = 0; i < W * H / 40; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.03)'; g.fillRect(rand() * W, rand() * H, 1.5, 1.5); }
    g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = Math.max(2, W / 256); g.strokeRect(0, 0, W, H);
  }, { repeat: [1, 1] });
}
function turfTex() {
  return canvasTex(512, 256, (g, W, H) => {
    g.fillStyle = '#2f6d32'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(20,60,20,0.5)' : 'rgba(110,170,90,0.35)'; g.fillRect(rand() * W, rand() * H, 1, rnd(2, 4)); }
    g.fillStyle = 'rgba(240,240,235,0.85)';
    for (let x = 0; x < W; x += W / 8) g.fillRect(x, 0, 4, H);
    g.fillRect(0, 6, W, 5); g.fillRect(0, H - 11, W, 5);
  }, { repeat: [1, 1] });
}
function wallTex() {
  return canvasTex(512, 512, (g, W, H) => {
    // light grey painted block above, a dark grey dado below, the gym's red band between them
    g.fillStyle = '#b9bcc0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a3c41'; g.fillRect(0, H * 0.62, W, H * 0.38);
    g.fillStyle = '#c0281f'; g.fillRect(0, H * 0.57, W, H * 0.05);
    for (let i = 0; i < 26000; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)'; g.fillRect(rand() * W, rand() * H, 2, 2); }
    // the painted block wall's courses
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
    for (let y = 0; y < H; y += H / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (y / (H / 8)) % 2 ? W / 8 : 0; x < W; x += W / 4) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + H / 8); g.stroke(); } }
  }, { repeat: [3, 1] });
}
function textTex(lines, { w = 1024, h = 256, bg = null, fg = '#ffffff', font = 'Bebas', size = 150, stroke = null, align = 'center', pad = 30 } = {}) {
  return canvasTex(w, h, (g, W, H) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
    g.textAlign = align; g.textBaseline = 'middle';
    const lh = H / lines.length;
    lines.forEach((t, i) => {
      const [txt, sz0 = size, col = fg] = Array.isArray(t) ? t : [t];
      // (shrunk to fit the sign: the fallback font, before the page's own has loaded, is much wider)
      let sz = sz0;
      g.font = `${sz}px ${font}, Impact, 'Arial Black', sans-serif`;
      while (sz > 20 && g.measureText(txt).width > W - pad * 2) { sz -= 4; g.font = `${sz}px ${font}, Impact, 'Arial Black', sans-serif`; }
      const x = align === 'left' ? pad : W / 2, y = lh * (i + 0.5);
      if (stroke) { g.lineWidth = sz * 0.08; g.strokeStyle = stroke; g.strokeText(txt, x, y); }
      g.fillStyle = col; g.fillText(txt, x, y);
    });
  });
}
function boardTex() {
  // the whiteboard of the month's records (the two friends who train here)
  return canvasTex(768, 512, (g, W, H) => {
    g.fillStyle = '#eef0ee'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#9aa0a6'; g.lineWidth = 16; g.strokeRect(0, 0, W, H);
    g.fillStyle = '#c0281f'; g.font = "64px Bebas, 'Arial Black', sans-serif"; g.textAlign = 'center'; g.fillText('RÉCORDS DEL MES', W / 2, 92);
    g.fillStyle = '#1d3f9a'; g.font = "46px 'Comic Sans MS', 'Marker Felt', cursive"; g.textAlign = 'left';
    g.fillText('Dominadas: CAMILO', 50, 200); g.fillText('5 km: ALEJANDRO', 50, 290);
    g.fillStyle = '#222'; g.fillText('¡Supéralos!', 50, 400);
    g.strokeStyle = '#1d3f9a'; g.lineWidth = 5; g.beginPath(); g.moveTo(50, 222); g.lineTo(440, 222); g.stroke();
  });
}
function screenTex(i) {
  return canvasTex(256, 160, (g, W, H) => {
    g.fillStyle = '#04121c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#39d7ff'; g.font = "34px Bebas, 'Arial Black', sans-serif"; g.textAlign = 'center';
    g.fillText(`${(9 + i * 1.5).toFixed(1)} KM/H`, W / 2, 48);
    g.fillStyle = '#7dff9a'; g.fillText(`${12 + i * 7}:${String(10 + i * 13).padStart(2, '0')}`, W / 2, 96);
    g.fillStyle = 'rgba(57,215,255,0.5)'; for (let k = 0; k < 12; k++) g.fillRect(24 + k * 18, 140 - (8 + ((k * 37 + i * 11) % 30)), 12, 8 + ((k * 37 + i * 11) % 30));
  }, { aniso: 4 });
}

export class GymStage {
  constructor(renderer, scene, quality = 'high') {
    this.renderer = renderer; this.scene = scene; seed = 0x6E7A;
    this.quality = quality;
    this.low = quality === 'low';
    this.texSize = { low: 512, medium: 1024, high: 1024, ultra: 1024 }[quality] || 1024;
    this.shadowSize = { low: 1024, medium: 1024, high: 2048, ultra: 2048 }[quality] || 2048;
    this.group = new THREE.Group(); this.group.name = 'stage-gym';
    scene.add(this.group);
    // (the machines either side are the arena's walls; the circle only ends it towards the camera)
    this.arenaRadius = 7.5;
    this.t = 0;
    this.animated = [];
    this.koView = new THREE.Vector3(0, 0, -1); // KO shots look at the mirrors
    this.sunDir = new THREE.Vector3(0.22, 0.92, 0.32).normalize();
    // (a mirror slammed into cracks lighter than a wall: js/fx/impacts.js reads this)
    this.wallCrackColor = 0xe8eef4;
    this.buildLights();
    scene.fog = new THREE.FogExp2(new THREE.Color(0.55, 0.57, 0.6), 0.008);
  }
  async ready() {
    const steps = [() => this.buildRoom(), () => this.buildMirrorWall(), () => this.buildRacks(), () => this.buildPowerRack(), () => this.buildTreadmills(),
      () => this.buildCeiling(), () => this.buildSigns(), () => this.buildBag()];
    for (const f of steps) { f(); await new Promise((r) => setTimeout(r, 0)); }
  }
  // walkable: between the machines (solid: lastWall), up to the mirrors (solid too), open towards the camera
  clampWalk(p, r = 0) {
    if (p.z < MIRROR_Z + 0.08 + r) { p.z = MIRROR_Z + 0.08 + r; this.lastWall = 'mirror'; }
    if (p.x < -SIDE_X + r) { p.x = -SIDE_X + r; this.lastWall = 'machine'; } else if (p.x > SIDE_X - r) { p.x = SIDE_X - r; this.lastWall = 'machine'; }
    if (p.z > FRONT_Z - 1.5 - r) p.z = FRONT_Z - 1.5 - r;
    return p;
  }
  clampCam(p) { p.x = THREE.MathUtils.clamp(p.x, -SIDE_X + 0.5, SIDE_X - 0.5); p.z = THREE.MathUtils.clamp(p.z, MIRROR_Z + 0.8, FRONT_Z - 0.6); p.y = THREE.MathUtils.clamp(p.y, 0.3, CEIL - 0.35); return p; }

  buildLights() {
    // the key: the LED panels overhead, cool white, a little in front
    const sun = createFightSun(new THREE.Color(0.94, 0.97, 1.0), 1.9, this.shadowSize);
    this.sun = sun; this.group.add(sun); if (sun.target) this.group.add(sun.target);
    aimFightSun(sun, this.sunDir, new THREE.Vector3(), 2.6);
    this.keyColor = new THREE.Color(0.95, 0.97, 1.0); this.keyIntensity = 1.1;
    this.group.add(new THREE.HemisphereLight(new THREE.Color(0.75, 0.78, 0.84), new THREE.Color(0.2, 0.19, 0.18), 1.6));
    // the neon's warm red behind on the left, and a soft white bounce off the mirrors (two lights: phones)
    this.neonL = new THREE.PointLight(new THREE.Color(1.0, 0.18, 0.12), 9, 9, 1.6); this.neonL.position.set(-6.0, 2.9, -5.3);
    this.bounceL = new THREE.PointLight(new THREE.Color(0.85, 0.9, 1.0), 10, 12, 1.6); this.bounceL.position.set(1.5, 2.2, -4.8);
    this.group.add(this.neonL, this.bounceL);
    this.animated.push(() => { this.neonL.intensity = 8.5 + Math.sin(this.t * 31) * 0.25 + (Math.sin(this.t * 0.7) > 0.985 ? -5 : 0); });
  }
  followShadow(center, spread = 3) { aimFightSun(this.sun, this.sunDir, center, Math.max(2.4, spread * 0.5 + 1.6)); }
  followCamera(camera, center) {
    FIGHTER_KEY.dir.value.set(0.15, 0.85, 0.5).normalize();
    FIGHTER_KEY.color.value.copy(this.keyColor).multiplyScalar(this.keyIntensity * (this.keyBoost || 1));
    // (the kicker: the neon's red, warm)
    FIGHTER_KEY.rim.value.setRGB(1.0, 0.42, 0.3).multiplyScalar(1.15);
  }

  // ------------------------------------------------------------------ the room
  buildRoom() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X * 2, FRONT_Z - BACK_Z), new THREE.MeshStandardMaterial({ map: rubberTex(this.texSize), roughness: 0.92, metalness: 0 }));
    floor.material.map.repeat.set(ROOM_X * 2, FRONT_Z - BACK_Z);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (FRONT_Z + BACK_Z) / 2); floor.receiveShadow = true; this.group.add(floor);
    // the turf lane at the front (the sled track)
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.2), new THREE.MeshStandardMaterial({ map: turfTex(), roughness: 1 }));
    turf.material.map.repeat.set(2, 1);
    turf.rotation.x = -Math.PI / 2; turf.position.set(0, 0.004, 6.6); turf.receiveShadow = true; this.group.add(turf);
    const wall = new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X * 2, CEIL), wall); back.position.set(0, CEIL / 2, BACK_Z); back.receiveShadow = true; this.group.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(FRONT_Z - BACK_Z, CEIL), wall); side.rotation.y = -s * Math.PI / 2;
      side.position.set(s * ROOM_X, CEIL / 2, (FRONT_Z + BACK_Z) / 2); side.receiveShadow = true; this.group.add(side);
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X * 2, CEIL), wall); front.rotation.y = Math.PI; front.position.set(0, CEIL / 2, FRONT_Z); this.group.add(front);
    // big windows onto a sunny street across the front (behind the camera: the mirrors show them, bright)
    const street = canvasTex(1024, 256, (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#bcdcff'); sky.addColorStop(0.6, '#eef6ff'); sky.addColorStop(1, '#d8d2c6');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      for (let x = 0; x < W;) { const w = rnd(60, 140), h = rnd(90, 190); g.fillStyle = `hsl(${rnd(20, 45)}, ${rnd(15, 35)}%, ${rnd(62, 82)}%)`; g.fillRect(x, H - h, w - 4, h);
        g.fillStyle = 'rgba(60,80,110,0.35)'; for (let y = H - h + 14; y < H - 20; y += 26) for (let wx = x + 10; wx < x + w - 18; wx += 22) g.fillRect(wx, y, 10, 14); x += w; }
      g.fillStyle = '#6b6f73'; g.fillRect(0, H - 22, W, 22);
    });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X * 2 - 2, 2.4), new THREE.MeshBasicMaterial({ map: street, color: new THREE.Color(1.6, 1.6, 1.6) }));
    win.rotation.y = Math.PI; win.position.set(0, 1.75, FRONT_Z - 0.02); this.group.add(win);
    const mull = [];
    for (let x = -ROOM_X + 1; x <= ROOM_X - 1 + 0.01; x += 2.5) mull.push(new THREE.BoxGeometry(0.08, 2.5, 0.08).translate(x, 1.75, FRONT_Z - 0.05));
    mull.push(new THREE.BoxGeometry(ROOM_X * 2 - 2, 0.08, 0.08).translate(0, 0.55, FRONT_Z - 0.05), new THREE.BoxGeometry(ROOM_X * 2 - 2, 0.08, 0.08).translate(0, 2.95, FRONT_Z - 0.05));
    this.group.add(new THREE.Mesh(bake(mull), new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.5, metalness: 0.5 })));
    // the skirting, a black band along the foot of the walls
    const sk = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 });
    const g = [new THREE.BoxGeometry(ROOM_X * 2, 0.12, 0.03).translate(0, 0.06, BACK_Z + 0.02)];
    for (const s of [-1, 1]) g.push(new THREE.BoxGeometry(0.03, 0.12, FRONT_Z - BACK_Z).translate(s * (ROOM_X - 0.02), 0.06, (FRONT_Z + BACK_Z) / 2));
    this.group.add(new THREE.Mesh(bake(g), sk));
  }

  // the mirrors: panels in black frames across the back, from the skirting to above head height
  buildMirrorWall() {
    const glass = new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: 1.0, roughness: 0.04, envMapIntensity: 1.25 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.45, metalness: 0.4 });
    const W = 1.5, n = 9, y0 = 0.25, h = 2.25, fr = [];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * W;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, h), glass); m.position.set(x, y0 + h / 2, MIRROR_Z - 0.01); this.group.add(m);
      fr.push(new THREE.BoxGeometry(0.05, h + 0.06, 0.05).translate(x - W / 2, y0 + h / 2, MIRROR_Z));
    }
    fr.push(new THREE.BoxGeometry(0.05, h + 0.06, 0.05).translate(n * W / 2, y0 + h / 2, MIRROR_Z));
    fr.push(new THREE.BoxGeometry(n * W + 0.05, 0.05, 0.05).translate(0, y0, MIRROR_Z), new THREE.BoxGeometry(n * W + 0.05, 0.05, 0.05).translate(0, y0 + h, MIRROR_Z));
    // the backing wall the mirrors are hung on
    fr.push(new THREE.BoxGeometry(n * W + 0.3, h + 0.4, 0.2).translate(0, y0 + h / 2, MIRROR_Z - 0.13));
    const fm = new THREE.Mesh(bake(fr), frame); fm.castShadow = false; fm.receiveShadow = true; this.group.add(fm);
    this.mirrorW = n * W;
    // high quality: a real mirror over the panels (the fighters see themselves fight); below that the panels' glass
    // reflects the baked room only
    if (this.quality === 'high' || this.quality === 'ultra') {
      const refl = new Reflector(new THREE.PlaneGeometry(n * W, h), {
        textureWidth: this.quality === 'ultra' ? 1280 : 1024, textureHeight: this.quality === 'ultra' ? 720 : 576, clipBias: 0.003, multisample: 0,
        shader: MirrorShader,
      });
      refl.position.set(0, y0 + h / 2, MIRROR_Z - 0.004);
      refl.castShadow = false; refl.receiveShadow = false; refl.userData.noAO = true;
      this.group.add(refl); this.mirror = refl;
    }
  }

  // dumbbell racks either side of the mirrors: two sloped tiers of hex dumbbells, light to heavy, coloured by weight
  buildRacks() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.4, metalness: 0.8 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.18, metalness: 1.0 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.75 });
    const frames = [], heads = [], handles = [];
    const hex = new THREE.CylinderGeometry(1, 1, 1, 6); hex.rotateZ(Math.PI / 2);
    const handleG = new THREE.CylinderGeometry(0.016, 0.016, 1, 8); handleG.rotateZ(Math.PI / 2);
    const cols = [0xd23a2c, 0x2c62d2, 0xe0b52c, 0x2ca050, 0x8a8f96];
    const instH = [], instB = [];
    for (const s of [-1, 1]) {
      const x0 = s * (this.mirrorW / 2 + 1.35), z = MIRROR_Z + 0.32;
      for (const [y, tilt] of [[0.42, 0.25], [0.78, 0.25]]) {
        frames.push(new THREE.BoxGeometry(2.3, 0.04, 0.42).rotateX(tilt).translate(x0, y, z));
      }
      for (const dx of [-1.1, 1.1]) frames.push(new THREE.BoxGeometry(0.06, 0.95, 0.42).translate(x0 + dx, 0.475, z));
      for (let k = 0; k < 7; k++) for (const [y, tier] of [[0.5, 0], [0.86, 1]]) {
        const r = 0.055 + (k + tier * 7) * 0.0045, x = x0 - 0.95 + k * 0.32;
        instH.push({ x: x - 0.11, y: y + r * 0.6, z: z - 0.02 + tier * 0.02, r, col: cols[(k + tier) % cols.length] }, { x: x + 0.11, y: y + r * 0.6, z: z - 0.02 + tier * 0.02, r, col: cols[(k + tier) % cols.length] });
        instB.push({ x, y: y + r * 0.6, z: z - 0.02 + tier * 0.02 });
      }
    }
    const fm = new THREE.Mesh(bake(frames), steel); fm.castShadow = true; fm.receiveShadow = true; this.group.add(fm);
    const hm = new THREE.InstancedMesh(hex, rubber, instH.length), bm = new THREE.InstancedMesh(handleG, chrome, instB.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    instH.forEach((q, i) => { o.position.set(q.x, q.y, q.z); o.scale.set(0.07, q.r, q.r); o.updateMatrix(); hm.setMatrixAt(i, o.matrix); hm.setColorAt(i, c.setHex(q.col).multiplyScalar(0.55)); });
    instB.forEach((q, i) => { o.position.set(q.x, q.y, q.z); o.scale.set(0.17, 1, 1); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); });
    hm.castShadow = true; this.group.add(hm, bm);
  }

  // the left side: a power rack (four uprights, the pull-up bar across the top, a loaded barbell on the hooks), a cable
  // column, a bench, kettlebells along the wall
  buildPowerRack() {
    const black = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.45, metalness: 0.6 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9cdd3, roughness: 0.2, metalness: 1.0 });
    const plate = new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.6 });
    const xs = -SIDE_X - 0.65, g = [];
    // (uprights on the line of the arena's edge: what a fighter knocked this way is stopped by)
    for (const [dx, dz] of [[-0.6, -1.4], [0.6, -1.4], [-0.6, 0.2], [0.6, 0.2]]) g.push(new THREE.BoxGeometry(0.08, 2.5, 0.08).translate(xs + dx, 1.25, dz));
    for (const dz of [-1.4, 0.2]) g.push(new THREE.BoxGeometry(1.28, 0.08, 0.08).translate(xs, 2.46, dz), new THREE.BoxGeometry(1.28, 0.08, 0.08).translate(xs, 0.04, dz));
    for (const dx of [-0.6, 0.6]) g.push(new THREE.BoxGeometry(0.08, 0.08, 1.68).translate(xs + dx, 2.46, -0.6), new THREE.BoxGeometry(0.08, 0.08, 1.68).translate(xs + dx, 0.04, -0.6));
    // the J-hooks and the safety arms on the front uprights
    for (const dz of [-1.4, 0.2]) g.push(new THREE.BoxGeometry(0.16, 0.05, 0.1).translate(xs + 0.68, 1.38, dz), new THREE.BoxGeometry(0.5, 0.06, 0.08).translate(xs + 0.88, 0.8, dz));
    this.group.add(Object.assign(new THREE.Mesh(bake(g), black), { castShadow: true, receiveShadow: true }));
    // the pull-up bar (knurled chrome) across the front, and the barbell on the hooks with plates
    const bar = new THREE.CylinderGeometry(0.016, 0.016, 2.3, 10); bar.rotateX(Math.PI / 2);
    const pull = new THREE.CylinderGeometry(0.018, 0.018, 1.75, 10); pull.rotateX(Math.PI / 2);
    this.group.add(new THREE.Mesh(bake([bar.clone().translate(xs + 0.66, 1.43, -0.6), pull.translate(xs + 0.6, 2.58, -0.6)]), chrome));
    const pl = [];
    for (const z of [-1.62, 0.42]) for (const [r, w] of [[0.225, 0.05], [0.18, 0.04]]) { const d = new THREE.CylinderGeometry(r, r, w, 28); d.rotateX(Math.PI / 2); pl.push(d.translate(xs + 0.66, 1.43, z + Math.sign(z) * (r === 0.18 ? 0.05 : 0))); }
    this.group.add(Object.assign(new THREE.Mesh(bake(pl), plate), { castShadow: true }));
    // the cable column further back, and the bench in front of the rack
    const cc = [new THREE.BoxGeometry(0.5, 2.3, 0.5).translate(xs + 0.1, 1.15, -4.1), new THREE.BoxGeometry(0.06, 0.6, 0.3).translate(xs + 0.36, 1.2, -4.1)];
    const bench = [new THREE.BoxGeometry(0.32, 0.08, 1.2).translate(xs + 0.25, 0.45, 2.4), new THREE.BoxGeometry(0.08, 0.42, 0.08).translate(xs + 0.25, 0.21, 1.95), new THREE.BoxGeometry(0.08, 0.42, 0.08).translate(xs + 0.25, 0.21, 2.85)];
    this.group.add(Object.assign(new THREE.Mesh(bake([...cc, ...bench.slice(1)]), black), { castShadow: true }));
    this.group.add(Object.assign(new THREE.Mesh(bench[0], red), { castShadow: true }));
    // kettlebells along the wall, small to big
    const kb = [];
    for (let i = 0; i < 8; i++) {
      const r = 0.08 + i * 0.012, z = -3.3 + i * 0.42;
      kb.push(new THREE.SphereGeometry(r, 16, 12).translate(-ROOM_X + 0.35, r, z));
      const hdl = new THREE.TorusGeometry(r * 0.62, 0.014, 6, 16, Math.PI); hdl.translate(-ROOM_X + 0.35, r * 1.75, z); kb.push(hdl);
    }
    this.group.add(Object.assign(new THREE.Mesh(bake(kb), new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.55, metalness: 0.5 })), { castShadow: true }));
  }

  // the right side: a row of treadmills facing the wall, their screens lit
  buildTreadmills() {
    // (graphite plastic and brushed rails: a darker metal read as black cut-outs against the white wall)
    const body = new THREE.MeshStandardMaterial({ color: 0x5e6268, roughness: 0.42, metalness: 0.3 });
    const belt = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.95 });
    const gb = [], gbelt = [];
    this.screens = [];
    for (let i = 0; i < 4; i++) {
      const z = -4.4 + i * 2.0, x = SIDE_X + 0.5;
      gb.push(new THREE.BoxGeometry(0.95, 0.2, 1.9).translate(x, 0.1, z));
      for (const dz of [-0.4, 0.4]) gb.push(new THREE.BoxGeometry(0.06, 1.3, 0.06).rotateZ(-0.12).translate(x + 0.35, 0.75, z + dz));
      gb.push(new THREE.BoxGeometry(0.2, 0.35, 0.9).translate(x + 0.46, 1.35, z));
      for (const dz of [-0.45, 0.45]) gb.push(new THREE.BoxGeometry(0.7, 0.05, 0.05).translate(x + 0.05, 1.05, z + dz));
      gbelt.push(new THREE.BoxGeometry(0.6, 0.02, 1.6).translate(x - 0.05, 0.21, z));
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshBasicMaterial({ map: screenTex(i), toneMapped: false }));
      sc.position.set(x + 0.355, 1.38, z); sc.rotation.y = -Math.PI / 2 + 0.0; sc.rotation.x = 0; sc.rotateX(-0.35);
      this.group.add(sc); this.screens.push(sc);
    }
    this.group.add(Object.assign(new THREE.Mesh(bake(gb), body), { castShadow: true, receiveShadow: true }));
    this.group.add(new THREE.Mesh(bake(gbelt), belt));
  }

  // the ceiling: dark, open, with ducts, and rows of LED panels (they glow; the light itself is the key)
  buildCeiling() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.9 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X * 2, FRONT_Z - BACK_Z), dark); top.rotation.x = Math.PI / 2; top.position.set(0, CEIL, (FRONT_Z + BACK_Z) / 2); this.group.add(top);
    const duct = new THREE.CylinderGeometry(0.28, 0.28, FRONT_Z - BACK_Z, 16); duct.rotateX(Math.PI / 2);
    this.group.add(new THREE.Mesh(bake([duct.clone().translate(-3.2, CEIL - 0.45, (FRONT_Z + BACK_Z) / 2), duct.translate(4.0, CEIL - 0.45, (FRONT_Z + BACK_Z) / 2)]), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.9 })));
    const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.3, 3.5), toneMapped: true });
    const g = [];
    for (let z = -5; z < 9; z += 2.4) for (const x of [-6, -2, 2, 6]) g.push(new THREE.BoxGeometry(1.4, 0.04, 0.5).translate(x, CEIL - 0.06, z));
    this.group.add(new THREE.Mesh(bake(g), led));
  }

  // the slogan over the mirrors, the mural on the left, the whiteboard, the red neon
  buildSigns() {
    const slogan = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.9), new THREE.MeshStandardMaterial({ map: textTex(['EL GYM ES FÁCIL'], { size: 190, fg: '#c0281f', stroke: '#1a1a1c' }), transparent: true, roughness: 0.8 }));
    slogan.position.set(0, 3.15, BACK_Z + 0.02); this.group.add(slogan);
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.3), new THREE.MeshStandardMaterial({ map: textTex([['DOMINADAS', 150, '#ffd04a'], ['POWA', 110, '#ffffff']], { w: 1024, h: 320, stroke: '#000' }), transparent: true, roughness: 0.85 }));
    mural.rotation.y = Math.PI / 2; mural.position.set(-ROOM_X + 0.02, 3.0, -0.5); this.group.add(mural);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ map: boardTex(), roughness: 0.35 }));
    board.position.set(this.mirrorW / 2 + 1.35, 1.75, BACK_Z + 0.03); this.group.add(board);
    // the red neon: BARRIO GYM, glowing (bloom), on the back wall to the left
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.75), new THREE.MeshBasicMaterial({ map: textTex([['BARRIO GYM', 170, '#ff5040']], { w: 1024, h: 256 }), transparent: true, color: new THREE.Color(2.2, 1.2, 1.1), toneMapped: false, depthWrite: false }));
    neon.position.set(-(this.mirrorW / 2 + 1.6), 2.75, BACK_Z + 0.04); this.group.add(neon);
    this.animated.push(() => { neon.material.opacity = Math.sin(this.t * 0.7) > 0.985 ? 0.35 : 1; });
  }

  // a heavy bag on a chain in the far right corner; it swings when a body lands near it
  buildBag() {
    const piv = new THREE.Group(); piv.position.set(5.3, CEIL - 0.1, -4.6); this.group.add(piv);
    // (the chain down to the bag's top at 1.7 m: its foot half a metre off the floor, as heavy bags hang)
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 1, roughness: 0.3 }));
    chain.position.y = -1.3; piv.add(chain);
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 1.2, 20), new THREE.MeshStandardMaterial({ color: 0x8e1d18, roughness: 0.55 }));
    bag.position.y = -3.2; bag.castShadow = true; piv.add(bag);
    this.bag = { piv, a: 0, v: 0 };
    this.animated.push((dt) => {
      const B = this.bag; B.v += (-9.8 / 3.2 * Math.sin(B.a) - B.v * 0.5) * dt; B.a += B.v * dt;
      piv.rotation.z = B.a;
    });
  }

  // the room answers the fight: the mirrors take the cracks (js/fx/impacts.js) with a shower of glass; the machines
  // ring; a fall shakes the bag
  react(ev) {
    if (ev.t === 'wall' && ev.n && ev.kind === 'mirror') {
      const at = ev.pos.clone().setZ(MIRROR_Z + 0.02);
      this.fx?.shards?.(at, 26); this.fx?.shards?.(at.clone().setY(at.y - 0.4), 14);
      this.audio?.play?.('glass', at);
    } else if (ev.t === 'wall' && ev.n && ev.kind === 'machine') {
      this.fx?.sparks?.(ev.pos.clone(), 8, false);
    } else if ((ev.t === 'land' && ev.f) || (ev.t === 'crack')) {
      if (this.bag) this.bag.v += 0.35 * (ev.t === 'crack' ? 2 : 1);
    }
  }

  bakeEnvironment() {
    // (the mirrors reflect the room: the cube is taken from in front of them, at head height)
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.1, 200, cubeRT);
    cc.position.set(0, 1.5, 0); this.scene.add(cc);
    const fog = this.scene.fog; this.scene.fog = null;
    // (the planar mirror stays out of the cube: the panels' own glass stands in for it there)
    if (this.mirror) this.mirror.visible = false;
    cc.update(this.renderer, this.scene);
    if (this.mirror) this.mirror.visible = true;
    this.scene.fog = fog; this.scene.remove(cc);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromCubemap(cubeRT.texture).texture;
    this.scene.environmentIntensity = 0.8;
    pm.dispose(); cubeRT.dispose();
  }
  update(dt, camera) {
    this.t += dt; this.cameraPos = camera.position;
    for (const f of this.animated) f(dt);
  }
  dispose() { this.scene.remove(this.group); }
}
