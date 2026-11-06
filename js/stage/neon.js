// "Distrito Neón": the neighbourhood in 2099, a cyberpunk night. A street between towers in the rain: wet asphalt that
// mirrors the signs, puddles, a zebra crossing; tower blocks with lit windows and fire escapes, a skyline far off;
// neon signs in Spanish (no real brands) that buzz and flicker, a holographic billboard of RyC INDUSTRIAS (Orión's
// makers), street lamps, a vending machine, cables overhead, steam from the drains, flying cars crossing the sky, rain
// falling through it all. Everything made here by code (canvas textures, no photos). Lit for the fighters by a cool
// key from the street lamps and magenta and cyan kickers off the signs.
import * as THREE from 'three';
import { FIGHTER_KEY } from '../materials.js';
import { createFightSun, aimFightSun } from '../engine/sunshadow.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let seed = 0x2099, seedOf = 0;
function rand() { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rnd = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];
function bake(geos) { return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))); }
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// the street: along x, the fight on it; the far pavement and the towers behind (-z, what the fight camera sees), the
// near pavement and towers behind the camera (+z)
const ROAD = 7.2;              // half the roadway's width (the kerbs at z = +-ROAD)
const WALK = 4.2;              // the pavements' width
const FRONT = -(ROAD + WALK);  // the far towers' front
const BACKF = ROAD + WALK;     // the near towers' front (behind the camera)
const LEN = 90;                // how far the street runs either way
const NEON = { pink: [1.0, 0.16, 0.62], cyan: [0.1, 0.85, 1.0], yellow: [1.0, 0.82, 0.2], green: [0.25, 1.0, 0.45], red: [1.0, 0.18, 0.15], violet: [0.62, 0.3, 1.0], orange: [1.0, 0.5, 0.12] };

const NightSky = {
  uniforms: { time: { value: 0 } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_Position.z = gl_Position.w; }',
  fragmentShader: `varying vec3 vDir; uniform float time;
    float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      float y = vDir.y;
      // smog lit from below by the city: magenta low down, deep violet blue above
      vec3 c = mix( vec3( 0.32, 0.07, 0.2 ), vec3( 0.03, 0.025, 0.07 ), smoothstep( -0.02, 0.45, y ) );
      c += vec3( 0.12, 0.05, 0.16 ) * exp( -abs( y - 0.06 ) * 9.0 );
      // slow clouds of smog
      vec2 q = vDir.xz / ( y + 0.25 ) * 1.6 + vec2( time * 0.01, 0.0 );
      float n = h( floor( q * 3.0 ) ) * 0.5 + h( floor( q * 7.0 ) ) * 0.3;
      c *= 0.85 + 0.25 * n * smoothstep( 0.0, 0.3, y );
      gl_FragColor = vec4( c, 1.0 );
    }`,
};

// wet asphalt: dark, its aggregate, faded lines; roughness low where the puddles are (the signs mirrored in them)
function asphaltTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#17181c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { const l = 18 + rand() * 40; g.fillStyle = `rgba(${l},${l},${l + 6},${0.3 + rand() * 0.5})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + rand() * 0.2})`; g.beginPath(); g.ellipse(rand() * w, rand() * h, 20 + rand() * 90, 10 + rand() * 50, rand() * 3, 0, 6.3); g.fill(); }
  }, { repeat: [24, 24] });
}
function puddleTex() {
  // (1 = dry and rough, dark = a puddle: used as the roughness map, so where it is dark the ground is a mirror)
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = rand() * w, y = rand() * h, r = 18 + rand() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,10,10,1)'); gr.addColorStop(0.7, 'rgba(10,10,10,0.9)'); gr.addColorStop(1, 'rgba(10,10,10,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * (1 + rand()), r, rand() * 3, 0, 6.3); g.fill();
    }
    for (let i = 0; i < 3000; i++) { const l = 90 + rand() * 120; g.fillStyle = `rgba(${l},${l},${l},0.25)`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  }, { repeat: [6, 6], srgb: false });
}
// a tower's facade: storeys of windows, some lit (warm, cool, a few neon-coloured), most dark, the frames between
function facadeTex(cols, rows, tone) {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = tone; g.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      // (a slab band at each floor)
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, r * rh + rh * 0.9, w, rh * 0.1);
      // a few floors all dark, a few with most windows lit
      const floorLit = rand() < 0.2 ? 0.05 : rand() < 0.15 ? 0.7 : 0.3;
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.2, y = r * rh + rh * 0.22, ww = cw * 0.6, hh = rh * 0.52;
        const lit = rand() < floorLit, k = rand();
        g.fillStyle = '#121318'; g.fillRect(x - 2, y - 2, ww + 4, hh + 4); // (the frame)
        if (!lit) { g.fillStyle = rand() < 0.5 ? '#06070a' : '#0b0d13'; g.fillRect(x, y, ww, hh); continue; }
        const col = k < 0.55 ? pick(['#ffcf8a', '#ffbf70', '#ffe0b0']) : k < 0.88 ? pick(['#a8dcff', '#cfe9ff', '#8fc0ff']) : pick(['#ff5fb8', '#50e8ff', '#b47cff', '#ff7050']);
        const gr = g.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(20,20,26,1)');
        g.globalAlpha = 0.6 + rand() * 0.4; g.fillStyle = gr; g.fillRect(x, y, ww, hh); g.globalAlpha = 1;
        // (blinds part down, a mullion, a plant or a figure against the light)
        if (rand() < 0.4) { g.fillStyle = 'rgba(16,18,24,0.85)'; g.fillRect(x, y, ww, hh * rnd(0.2, 0.6)); }
        g.fillStyle = '#121318'; g.fillRect(x + ww / 2 - 1, y, 2, hh);
        if (rand() < 0.12) { g.fillStyle = 'rgba(0,0,0,0.75)'; const fx = x + rnd(0.2, 0.7) * ww; g.beginPath(); g.arc(fx, y + hh * 0.45, hh * 0.1, 0, 6.3); g.fill(); g.fillRect(fx - hh * 0.12, y + hh * 0.55, hh * 0.24, hh * 0.45); }
      }
    }
    // grime streaks down the concrete
    for (let i = 0; i < 70; i++) { const x = rand() * w; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${0.1 + rand() * 0.2})`); g.fillStyle = gr; g.fillRect(x, rand() * h * 0.5, 2 + rand() * 6, h); }
  });
}
// a shop's inside seen through its glass: the back wall in the shop's light, shelves of goods, the counter, a lamp, maybe
// someone at the counter; streaks of the street's reflection on the glass
function shopTex(col, kind) {
  return canvasTex(256, 160, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, col); gr.addColorStop(0.55, 'rgba(40,30,40,1)'); gr.addColorStop(1, '#0c0b0e');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 3; r++) {
      const y = 22 + r * 30;
      g.fillStyle = 'rgba(10,10,14,0.7)'; g.fillRect(8, y + 18, w - 16, 3);
      for (let x = 12; x < w - 14; x += 6 + rand() * 8) { g.fillStyle = pick(['#ff4f7a', '#ffd23c', '#4fd0ff', '#7dff8a', '#ffffff', '#ff8a3c', '#b07cff']); g.globalAlpha = 0.55 + rand() * 0.45; g.fillRect(x, y + 18 - (6 + rand() * 10), 4 + rand() * 3, 6 + rand() * 10); }
      g.globalAlpha = 1;
    }
    if (kind === 'bar' || rand() < 0.4) { g.fillStyle = 'rgba(0,0,0,0.8)'; const fx = rnd(60, 190); g.beginPath(); g.arc(fx, 98, 9, 0, 6.3); g.fill(); g.fillRect(fx - 11, 106, 22, 24); }
    g.fillStyle = '#141216'; g.fillRect(0, 124, w, 36); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 124, w, 2);
    const lg = g.createRadialGradient(w / 2, 6, 0, w / 2, 6, 90); lg.addColorStop(0, 'rgba(255,255,255,0.55)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(0, 0, w, 90);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 10; for (let i = 0; i < 3; i++) { const x = rand() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 50, h); g.stroke(); }
    g.fillStyle = '#0d0d10'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillRect(w / 2 - 2, 0, 4, h);
  });
}
// a rolled-down shutter: metal ribs, grime, tags sprayed on it
function shutterTex() {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#4a4d55'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 1.5); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y + 2, w, 1); }
    g.lineWidth = 7; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { g.strokeStyle = pick(['#ff3c8a', '#3cd8ff', '#ffe03c', '#8aff3c', '#ffffff']); g.globalAlpha = 0.75; g.beginPath(); let x = rnd(10, w - 60), y = rnd(40, h - 30); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(6, 16); y += rnd(-18, 18); g.lineTo(x, y); } g.stroke(); }
    g.globalAlpha = 1;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
// a neon sign: the words as glowing tubes (a white-hot core, the colour round it, a halo), on black
function neonTex(text, col, { w = 512, h = 160, font = '900', sub = '', frame = true } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const css = `rgb(${col.map((v) => Math.round(v * 255)).join(',')})`;
    const size = Math.min(h * (sub ? 0.5 : 0.62), w * 1.5 / Math.max(3, text.length));
    g.font = `${font} ${size}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const y = sub ? h * 0.42 : h * 0.52;
    for (const [blur, lw, style, a] of [[28, 10, css, 0.6], [12, 7, css, 0.9], [0, 4, css, 1], [0, 1.6, '#fff', 0.9]]) {
      g.shadowColor = css; g.shadowBlur = blur; g.globalAlpha = a; g.lineWidth = lw; g.strokeStyle = style; g.strokeText(text, w / 2, y);
    }
    if (sub) { g.font = `600 ${h * 0.2}px Arial, sans-serif`; g.shadowBlur = 10; g.lineWidth = 2; g.strokeStyle = css; g.strokeText(sub, w / 2, h * 0.8); g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(sub, w / 2, h * 0.8); }
    if (frame) { g.globalAlpha = 0.9; g.shadowBlur = 16; g.lineWidth = 4; g.strokeStyle = css; g.strokeRect(10, 10, w - 20, h - 20); }
    g.globalAlpha = 1; g.shadowBlur = 0;
  });
}

export class NeonStage {
  constructor(renderer, scene, quality = 'high') {
    this.renderer = renderer; this.scene = scene; seed = 0x2099; seedOf++;
    this.quality = quality;
    this.shadowSize = { low: 1024, medium: 1024, high: 2048, ultra: 2048 }[quality] || 2048;
    this.group = new THREE.Group(); this.group.name = 'stage-neon';
    scene.add(this.group);
    this.arenaRadius = 6.0;
    this.t = 0;
    this.animated = [];
    this.koView = new THREE.Vector3(0, 0, -1);
    // the key: the street lamps and the glow of the street, cool, high on the left
    this.sunDir = new THREE.Vector3(-0.35, 0.82, 0.45).normalize();
    this.signs = [];
    this.rainOn = quality !== 'low';
    this.buildSky(); this.buildLights(); this.buildGround(); this.buildTowers(); this.buildSkyline(); this.buildShops(); this.buildSigns(); this.buildHologram();
    this.buildLamps(); this.buildStreetProps(); this.buildCables(); this.buildSteam(); this.buildTraffic();
    if (this.rainOn) this.buildRain();
    scene.fog = new THREE.FogExp2(new THREE.Color(0.1, 0.06, 0.16), 0.022);
  }
  ready() { return Promise.resolve(); }

  // walkable: the roadway and the pavements, between the kerb-side lamps
  clampWalk(p, r = 0) {
    p.x = THREE.MathUtils.clamp(p.x, -40 + r, 40 - r);
    p.z = THREE.MathUtils.clamp(p.z, FRONT + 1.2 + r, BACKF - 1.2 - r);
    return p;
  }
  clampCam(p) { p.x = THREE.MathUtils.clamp(p.x, -42, 42); p.z = THREE.MathUtils.clamp(p.z, FRONT + 1.2, BACKF - 1.2); p.y = Math.max(0.3, p.y); return p; }

  buildSky() {
    const m = new THREE.ShaderMaterial({ ...NightSky, uniforms: THREE.UniformsUtils.clone(NightSky.uniforms), side: THREE.BackSide, depthWrite: false, fog: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), m);
    sky.renderOrder = -10; sky.frustumCulled = false; this.group.add(sky);
    this.animated.push((dt) => { m.uniforms.time.value += dt; sky.position.copy(this.cameraPos || new THREE.Vector3()); });
  }

  buildLights() {
    const sun = createFightSun(new THREE.Color(0.62, 0.72, 1.0), 1.4, this.shadowSize);
    this.sun = sun; this.group.add(sun); if (sun.target) this.group.add(sun.target);
    aimFightSun(sun, this.sunDir, new THREE.Vector3(), 2.6);
    this.keyColor = new THREE.Color(0.75, 0.82, 1.0); this.keyIntensity = 1.0;
    // the night: blue above, the street's magenta bounce below
    this.group.add(new THREE.HemisphereLight(new THREE.Color(0.22, 0.24, 0.45), new THREE.Color(0.3, 0.1, 0.25), 0.9));
    // the signs' light on the fight: magenta from the left, cyan from the right, low and close
    this.pinkL = new THREE.PointLight(new THREE.Color(...NEON.pink), 22, 16, 1.6); this.pinkL.position.set(-6.5, 3.2, -4.5);
    this.cyanL = new THREE.PointLight(new THREE.Color(...NEON.cyan), 20, 16, 1.6); this.cyanL.position.set(6.5, 3.0, -4.0);
    this.warmL = new THREE.PointLight(new THREE.Color(1.0, 0.7, 0.4), 8, 12, 1.8); this.warmL.position.set(0, 3.5, 6.5);
    this.group.add(this.pinkL, this.cyanL, this.warmL);
  }
  followShadow(center, spread = 3) { aimFightSun(this.sun, this.sunDir, center, Math.max(2.4, spread * 0.5 + 1.6)); }
  followCamera(camera, center) {
    FIGHTER_KEY.dir.value.set(-0.3, 0.75, 0.6).normalize();
    FIGHTER_KEY.color.value.copy(this.keyColor).multiplyScalar(this.keyIntensity * (this.keyBoost || 1));
    // (the kicker: the signs behind, magenta and cyan in turn as they flicker)
    const k = 0.5 + 0.5 * Math.sin(this.t * 0.7);
    FIGHTER_KEY.rim.value.setRGB(...NEON.pink).lerp(new THREE.Color(...NEON.cyan), k).multiplyScalar(1.1);
  }

  buildGround() {
    // wet asphalt: a mirror where the puddles are (roughness map), a clearcoat of water over it all
    const mat = new THREE.MeshPhysicalMaterial({ map: asphaltTex(), roughnessMap: puddleTex(), roughness: 0.55, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.08, color: new THREE.Color(0.9, 0.9, 0.95), envMapIntensity: 1.6 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(LEN * 2, ROAD * 2), mat);
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; this.group.add(g);
    // the lines: a broken centre line, a zebra crossing
    const paint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.32, 0.31, 0.27), roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
    const lines = [];
    for (let x = -LEN; x < LEN; x += 6) { const p = new THREE.PlaneGeometry(3, 0.16); p.rotateX(-Math.PI / 2); p.translate(x, 0.004, 0); lines.push(p); }
    for (let z = -ROAD + 0.6; z < ROAD - 0.4; z += 1.0) { const p = new THREE.PlaneGeometry(2.2, 0.55); p.rotateX(-Math.PI / 2); p.translate(-12, 0.004, z); lines.push(p); }
    const lm = new THREE.Mesh(bake(lines), paint); lm.receiveShadow = true; this.group.add(lm);
    // the pavements and their kerbs
    const slab = new THREE.MeshPhysicalMaterial({ map: canvasTex(256, 256, (gg, w, h) => { gg.fillStyle = '#2a2b31'; gg.fillRect(0, 0, w, h); gg.strokeStyle = '#141519'; gg.lineWidth = 4; for (let i = 0; i <= 4; i++) { gg.beginPath(); gg.moveTo(i * w / 4, 0); gg.lineTo(i * w / 4, h); gg.stroke(); gg.beginPath(); gg.moveTo(0, i * h / 4); gg.lineTo(w, i * h / 4); gg.stroke(); } for (let i = 0; i < 4000; i++) { const l = 30 + rand() * 30; gg.fillStyle = `rgba(${l},${l},${l + 4},0.4)`; gg.fillRect(rand() * w, rand() * h, 2, 2); } }, { repeat: [LEN, WALK / 2] }),
      roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(LEN * 2, 0.15, WALK), slab);
      p.position.set(0, 0.075, s * (ROAD + WALK / 2)); p.receiveShadow = true; this.group.add(p);
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(LEN * 2, 0.16, 0.18), new THREE.MeshStandardMaterial({ color: 0x505257, roughness: 0.6 }));
      kerb.position.set(0, 0.08, s * (ROAD + 0.09)); kerb.receiveShadow = true; this.group.add(kerb);
    }
    // a drain grate, a manhole (the steam comes out of them)
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.8, roughness: 0.5 });
    this.vents = [[-4.5, -ROAD + 1.2], [7.5, 2.5], [-15, 4.8], [16, -5.5]];
    for (const [x, z] of this.vents) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24), metal); m.position.set(x, 0.01, z); m.receiveShadow = true; this.group.add(m);
    }
  }

  // ------------------------------------------------------------------ the towers
  tower(x, z, w, d, h, side) {
    // (a few facades shared by all the towers, tiled over each in metres: 8 windows of 1.5 m by 8 storeys of 3 m a
    // tile; the windows' own colours are their light, so the picture is its own emissive map. One texture per tower
    // was over 100 MB of video memory, too much for a phone)
    if (!this.facadeMats) {
      this.facadeMats = ['#23242b', '#1e2027', '#2a2630', '#202a2e'].map((tone) => {
        const t = facadeTex(8, 8, tone); t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.9, roughness: 0.75, metalness: 0.1 });
      });
      this.roofMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 });
    }
    const m = pick(this.facadeMats), roof = this.roofMat;
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, du = rand(), dv = Math.floor(rand() * 8) / 8;
    // (faces: +x, -x, +y, -y, +z, -z, four vertices each; the tile 12 m wide and 24 m high, started at a random spot)
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k, span = f < 2 ? d : w;
      uv.setXY(i, du + uv.getX(i) * span / 12, dv + uv.getY(i) * h / 24);
    }
    const b = new THREE.Mesh(geo, [m, m, roof, roof, m, m]);
    b.position.set(x, h / 2, z); b.receiveShadow = true; this.group.add(b);
    // a fire escape zigzag on the street side of some, AC units, a rooftop antenna with a red light
    const face = z + side * d / 2;
    if (rand() < 0.6) {
      const fe = [];
      for (let y = 3.4; y < Math.min(h - 1, 24); y += 3.4) {
        const pl = new THREE.BoxGeometry(w * 0.4, 0.06, 0.9); pl.translate(x + w * 0.1, y, face + side * 0.45); fe.push(pl);
        const rail = new THREE.BoxGeometry(w * 0.4, 0.9, 0.03); rail.translate(x + w * 0.1, y + 0.45, face + side * 0.9); fe.push(rail);
        const st = new THREE.BoxGeometry(0.6, 0.05, 3.6); st.rotateX(side * 0.75); st.translate(x + w * 0.1 + (y % 6.8 < 3.4 ? -1 : 1) * w * 0.12, y + 1.7, face + side * 0.45); fe.push(st);
      }
      const fm = new THREE.Mesh(bake(fe), new THREE.MeshStandardMaterial({ color: 0x18191c, metalness: 0.7, roughness: 0.55 })); fm.castShadow = true; this.group.add(fm);
    }
    const ac = [];
    for (let i = 0; i < 4; i++) { const a = new THREE.BoxGeometry(0.8, 0.55, 0.5); a.translate(x + rnd(-w / 2.5, w / 2.5), rnd(4, Math.min(h - 2, 20)), face + side * 0.25); ac.push(a); }
    this.group.add(new THREE.Mesh(bake(ac), new THREE.MeshStandardMaterial({ color: 0x6a6d72, roughness: 0.6, metalness: 0.4 })));
    if (rand() < 0.5) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 6, 6), roof); ant.position.set(x, h + 3, z); this.group.add(ant);
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); red.position.set(x, h + 6, z); this.group.add(red);
      const ph = rand() * 6;
      this.animated.push(() => { red.visible = Math.sin(this.t * 2 + ph) > 0.2; });
    }
    return { face, w, h, x };
  }
  buildTowers() {
    this.facades = [];
    for (const side of [-1, 1]) {
      let x = -LEN + rnd(0, 6);
      while (x < LEN) {
        const w = rnd(7, 15), d = rnd(10, 18), h = side < 0 ? rnd(14, 55) : rnd(12, 30);
        const z = side * (ROAD + WALK + d / 2);
        this.facades.push({ ...this.tower(x + w / 2, z, w, d, h, -side), side });
        x += w + rnd(0.6, 3);
      }
    }
  }
  buildSkyline() {
    // far towers, flat silhouettes with lit windows, layer on layer into the smog
    for (const [z, hs, a] of [[-140, [40, 120], 0.85], [-220, [60, 170], 0.6]]) {
      const tex = canvasTex(2048, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        let x = 0;
        while (x < w) {
          const bw = 40 + rand() * 120, bh = h * (0.3 + rand() * 0.7);
          g.fillStyle = '#07070d'; g.fillRect(x, h - bh, bw, bh);
          for (let yy = h - bh + 8; yy < h; yy += 9) for (let xx = x + 4; xx < x + bw - 4; xx += 7) if (rand() < 0.22) { g.fillStyle = pick(['#ffcf80', '#8fd8ff', '#ff5fbf', '#ffe9c0']); g.globalAlpha = 0.6; g.fillRect(xx, yy, 3, 4); g.globalAlpha = 1; }
          if (rand() < 0.3) { g.fillStyle = '#ff2a2a'; g.fillRect(x + bw / 2, h - bh - 6, 3, 3); }
          x += bw + rand() * 10;
        }
      });
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: a });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(900, (hs[1] - hs[0]) * 2), m);
      p.position.set(0, hs[1] - hs[0], z); p.renderOrder = -5; this.group.add(p);
    }
  }

  // ------------------------------------------------------------------ the neon
  sign(text, col, x, y, z, w, h, { side = 1, vertical = false, sub = '', flick = 0, rot = 0 } = {}) {
    this.signTex ||= new Map();
    // (the texture as wide as the sign is, so the letters are not stretched)
    const tw = vertical ? 160 : THREE.MathUtils.clamp(Math.round(160 * w / h / 32) * 32, 256, 1024);
    const tkey = `${text}|${col}|${vertical}|${sub}|${tw}`, cached = this.signTex.get(tkey);
    const tex = cached || neonTex(text, col, { w: tw, h: vertical ? 512 : 160, sub });
    this.signTex.set(tkey, tex);
    if (vertical && !cached) {
      // (the words stacked downwards, a letter at a time)
      const c = tex.image, g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
      const css = `rgb(${col.map((v) => Math.round(v * 255)).join(',')})`, n = text.length, step = c.height / (n + 0.6);
      g.font = `900 ${step * 0.8}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < n; i++) for (const [blur, lw, st, a] of [[24, 8, css, 0.6], [8, 5, css, 0.95], [0, 1.5, '#fff', 0.9]]) { g.shadowColor = css; g.shadowBlur = blur; g.globalAlpha = a; g.lineWidth = lw; g.strokeStyle = st; g.strokeText(text[i], c.width / 2, step * (i + 0.8)); }
      g.globalAlpha = 0.9; g.shadowBlur = 14; g.lineWidth = 4; g.strokeStyle = css; g.strokeRect(8, 8, c.width - 16, c.height - 16); g.globalAlpha = 1; g.shadowBlur = 0;
      tex.needsUpdate = true;
    }
    const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: true, fog: false });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.5, metalness: 0.5 }));
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    plane.position.z = side * 0.065;
    if (side < 0) plane.rotation.y = Math.PI;
    const grp = new THREE.Group(); grp.add(box, plane); grp.position.set(x, y, z); grp.rotation.y = rot;
    this.group.add(grp);
    // its reflection in the wet street: a long soft streak of its colour down the asphalt towards the viewer
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, Math.min(10, y * 1.8)), new THREE.MeshBasicMaterial({ map: streakTex(), color: new THREE.Color(...col).multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    refl.rotation.x = -Math.PI / 2; refl.position.set(x, 0.012, THREE.MathUtils.clamp(z + side * Math.min(10, y * 1.8) / 2, -ROAD - WALK, ROAD + WALK)); refl.renderOrder = 2;
    this.group.add(refl);
    const s = { m, refl, base: 1.6, flick, ph: rand() * 100, col };
    this.signs.push(s);
    return grp;
  }
  buildSigns() {
    const F = FRONT + 0.15, B = BACKF - 0.15;
    const S = (t, c, x, y, w, h, o) => this.sign(t, NEON[c], x, y, F, w, h, { side: 1, ...o });
    S('HOTEL', 'red', -17, 9.5, 1.4, 5.2, { vertical: true });
    S('SUSHI', 'orange', 7.5, 7.6, 1.2, 3.8, { vertical: true, flick: 0.03 });
    S('CIBER', 'violet', -4.5, 6.4, 1.1, 3.2, { vertical: true, flick: 0.06 });
    S('ARCADE', 'violet', 31, 7.4, 1.3, 4.6, { vertical: true });
    S('KARAOKE', 'cyan', 2.5, 9.6, 4.2, 1.3);
    const Bk = (t, c, x, y, w, h, o) => this.sign(t, NEON[c], x, y, B, w, h, { side: -1, ...o });
    Bk('MOTEL', 'cyan', 14, 5.6, 1.2, 4.0, { vertical: true });
    Bk('CASINO', 'red', -15, 6.4, 3.4, 1.1);
  }
  // the ground floor: a row of shops on each pavement, their insides lit behind the glass, a neon sign over each, an
  // awning with a strip of light under it; some closed, their shutters down (with tags on them), one half down;
  // the light of each open one spilling on the wet pavement
  buildShops() {
    const KINDS = [['RAMEN 24H', 'pink', '#ff9a4a', 'bar'], ['FARMACIA', 'green', '#e8fff4', 'shop'], ['KARAOKE', 'violet', '#d05cff', 'bar'], ['BAR NEÓN', 'yellow', '#ffb050', 'bar'],
      ['CIBERCAFÉ', 'cyan', '#5cc8ff', 'shop'], ['TATUAJES', 'pink', '#ff5070', 'shop'], ['LAVANDERÍA', 'cyan', '#bff4ff', 'shop'], ['SUSHI', 'orange', '#ffd0a0', 'bar'],
      ['CLÍNICA', 'green', '#e0fff0', 'shop'], ['RECAMBIOS', 'red', '#ffd8a0', 'shop'], ['NOODLES', 'yellow', '#ffcf80', 'bar'], ['BAZAR', 'orange', '#ffe8b0', 'shop'], ['ÓPTICA', 'cyan', '#e0f6ff', 'shop'], ['BAR', 'pink', '#ff9ac0', 'bar']];
    const dark = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.5, metalness: 0.6 });
    const shutter = new THREE.MeshStandardMaterial({ map: shutterTex(), roughness: 0.55, metalness: 0.5 });
    const spill = canvasTex(128, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.2, 'rgba(0,0,0,0)'); gx.addColorStop(0.8, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h); });
    const frames = [], shopMat = {};
    let n = 0;
    for (const side of [1, -1]) {           // (1: the far pavement, facing the fight camera; -1: the near one)
      const face = side > 0 ? FRONT : BACKF;
      let x = -40 + rnd(0, 2);
      while (x < 40) {
        const w = rnd(3.8, 5.6), cx = x + w / 2, K = KINDS[(n++) % KINDS.length];
        const closed = Math.abs(cx) > 6 && rand() < 0.22, half = !closed && rand() < 0.12;
        const zf = face + side * 0.06;
        const grp = new THREE.Group(); grp.position.set(cx, 0.15, zf); if (side < 0) grp.rotation.y = Math.PI;
        // the glass and what is behind it (or the shutter)
        const H = 2.9;
        const inside = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, H), closed ? shutter : (shopMat[K[0]] ||= new THREE.MeshBasicMaterial({ map: shopTex(K[2], K[3]), color: new THREE.Color(0.78, 0.78, 0.78) })));
        inside.position.set(0, H / 2, 0); grp.add(inside);
        if (half) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, H * 0.42), shutter); sh.position.set(0, H * 0.79, 0.01); grp.add(sh); }
        // pillars either side, a lintel, an awning with a strip of the shop's colour under its edge
        for (const sx of [-1, 1]) { const p = new THREE.BoxGeometry(0.22, H + 0.4, 0.3); p.translate(cx + sx * (w / 2 - 0.08), 0.15 + (H + 0.4) / 2, zf); frames.push(p); }
        const lin = new THREE.BoxGeometry(w, 0.5, 0.3); lin.translate(cx, 0.15 + H + 0.25, zf); frames.push(lin);
        if (!closed) {
          const aw = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.08, 0.9), dark); aw.position.set(0, H + 0.05, 0.45); aw.rotation.x = side > 0 ? 0.12 : 0.12; grp.add(aw);
          const strip = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.035, 0.035), new THREE.MeshBasicMaterial({ color: new THREE.Color(...NEON[K[1]]).multiplyScalar(1.6), fog: false }));
          strip.position.set(0, H - 0.02, 0.88); grp.add(strip);
          // the light on the pavement in front
          const pool = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, 3.2), new THREE.MeshBasicMaterial({ map: spill, color: new THREE.Color(K[2]).multiplyScalar(half ? 0.25 : 0.42), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.006, 1.6); pool.renderOrder = 2; grp.add(pool);
        }
        this.group.add(grp);
        // its neon over the door (a sign the shop's own: sign() puts it in world space)
        if (!closed || rand() < 0.5) this.sign(K[0], NEON[K[1]], cx, 0.15 + H + 0.95, zf + side * 0.1, Math.min(w - 0.4, 0.42 * K[0].length + 0.8), 0.95, { side, flick: closed ? 0.12 : rand() < 0.25 ? 0.03 : 0 });
        x += w + rnd(0.3, 0.8);
      }
    }
    const fm = new THREE.Mesh(bake(frames), dark); fm.receiveShadow = true; this.group.add(fm);
  }
  buildHologram() {
    // RyC INDUSTRIAS: a translucent billboard high on the tower behind the fight, scanlines running down it, a
    // flicker now and then, its colours parting a little
    const tex = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
      const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, 'rgba(40,220,255,0.25)'); grd.addColorStop(1, 'rgba(255,60,180,0.25)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(120,240,255,0.9)'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
      g.font = '900 210px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff3cb4'; g.shadowBlur = 30; g.fillStyle = '#ffd0ef'; g.fillText('RyC', w / 2, h * 0.42);
      g.font = '700 60px Arial, sans-serif'; g.shadowColor = '#3ce8ff'; g.shadowBlur = 18; g.fillStyle = '#c8f6ff'; g.fillText('INDUSTRIAS', w / 2, h * 0.72);
      g.font = '500 34px Arial, sans-serif'; g.shadowBlur = 8; g.fillText('EL FUTURO TIENE CLAVE', w / 2, h * 0.87);
    });
    const U = { uTex: { value: tex }, uTime: { value: 0 }, uFlick: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: `uniform sampler2D uTex; uniform float uTime, uFlick; varying vec2 vUv;
        void main() {
          float sh = 0.004 + 0.006 * step( 0.97, fract( uTime * 0.37 ) );
          float r = texture2D( uTex, vUv + vec2( sh, 0.0 ) ).r, g = texture2D( uTex, vUv ).g, b = texture2D( uTex, vUv - vec2( sh, 0.0 ) ).b;
          float a = texture2D( uTex, vUv ).a;
          float scan = 0.75 + 0.25 * sin( vUv.y * 420.0 - uTime * 6.0 );
          float band = 1.0 + 0.6 * smoothstep( 0.02, 0.0, abs( fract( vUv.y - uTime * 0.18 ) - 0.5 ) - 0.47 );
          gl_FragColor = vec4( vec3( r, g, b ) * 1.6 * scan * band * uFlick, a * scan * uFlick );
        }`,
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), m);
    p.position.set(-1.5, 17, FRONT + 0.6); this.group.add(p);
    this.animated.push((dt) => { U.uTime.value += dt; U.uFlick.value = Math.sin(this.t * 13.0) > 0.97 ? 0.35 : 1; });
  }

  // ------------------------------------------------------------------ the street
  buildLamps() {
    const pole = new THREE.MeshStandardMaterial({ color: 0x1a1b1f, metalness: 0.7, roughness: 0.45 });
    const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.95, 1.3), fog: false });
    const geos = [], heads = [];
    this.lampSpots = [];
    for (const side of [-1, 1]) for (let x = -LEN + 6; x < LEN; x += 18) {
      const z = side * (ROAD + 0.5);
      const pg = new THREE.CylinderGeometry(0.07, 0.11, 6.5, 8); pg.translate(x, 3.25, z); geos.push(pg);
      const arm = new THREE.BoxGeometry(0.08, 0.08, 1.6); arm.translate(x, 6.4, z - side * 0.8); geos.push(arm);
      const hd = new THREE.BoxGeometry(0.7, 0.1, 0.3); hd.translate(x, 6.32, z - side * 1.5); heads.push(hd);
      this.lampSpots.push([x, z - side * 1.5]);
    }
    const pm = new THREE.Mesh(bake(geos), pole); pm.castShadow = true; this.group.add(pm);
    this.group.add(new THREE.Mesh(bake(heads), head));
    // the pools of light they leave on the wet street
    const pool = new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(180,220,255,0.55)'); gr.addColorStop(1, 'rgba(180,220,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const [x, z] of this.lampSpots) { const p = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), pool); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.015, z); p.renderOrder = 2; this.group.add(p); }
  }
  buildStreetProps() {
    // a vending machine glowing on the far pavement, bags of rubbish, a bollard or two
    const vm = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x1b2a6a, roughness: 0.4, metalness: 0.3 }));
    body.position.y = 0.95; body.castShadow = true; vm.add(body);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(128, 192, (g, w, h) => {
      g.fillStyle = '#d8f4ff'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = pick(['#ff3c70', '#3cc8ff', '#ffd23c', '#5cff8a', '#ff8a3c']); g.fillRect(10 + c * 28, 14 + r * 40, 18, 30); }
      g.fillStyle = '#111'; g.font = '700 16px Arial'; g.fillText('BEBIDAS', 26, h - 8);
    }), color: new THREE.Color(1.4, 1.4, 1.4) }));
    front.position.set(0, 1.15, 0.41); vm.add(front);
    vm.position.set(-7.4, 0.15, FRONT + 3.2); vm.rotation.y = 0.5; this.group.add(vm);
    const vmL = new THREE.PointLight(new THREE.Color(0.7, 0.9, 1.0), 3, 5, 2); vmL.position.set(-7.1, 1.2, FRONT + 4.0); this.group.add(vmL);
    const bag = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.25, metalness: 0.1 });
    const bags = [];
    for (let i = 0; i < 7; i++) { const s = new THREE.SphereGeometry(rnd(0.25, 0.4), 10, 8); s.scale(1, rnd(0.7, 1.0), 1); s.translate(rnd(9, 11.5), 0.4, FRONT + rnd(3.0, 3.8)); bags.push(s); }
    const bm = new THREE.Mesh(bake(bags), bag); bm.castShadow = true; this.group.add(bm);
  }
  buildCables() {
    // cables sagging across the street between the towers, a few lanterns strung on them
    const mat = new THREE.LineBasicMaterial({ color: 0x07070a });
    for (let i = 0; i < 9; i++) {
      const x0 = rnd(-30, 30), x1 = x0 + rnd(-6, 6), y0 = rnd(7, 13), y1 = y0 + rnd(-2, 2), sag = rnd(0.8, 2.2);
      const pts = [];
      for (let k = 0; k <= 24; k++) { const t = k / 24; pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag, FRONT + (BACKF - FRONT) * t)); }
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
  }
  buildSteam() {
    // steam rising from the drains, lit by the neon (soft sprites, drifting)
    const tex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const N = 90, pos = new Float32Array(N * 3), size = new Float32Array(N);
    const ps = [];
    for (let i = 0; i < N; i++) { const v = this.vents[i % this.vents.length]; ps.push({ v, age: rand() * 4, life: 3 + rand() * 2 }); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uViewH: { value: 800 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute float aSize; uniform float uViewH; varying float vA; void main() { vec4 mv = modelViewMatrix * vec4( position, 1.0 ); gl_PointSize = aSize * projectionMatrix[1][1] * uViewH * 0.5 / -mv.z; vA = clamp( aSize, 0.0, 1.0 ); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D uTex; varying float vA; void main() { vec4 t = texture2D( uTex, gl_PointCoord ); gl_FragColor = vec4( vec3( 0.55, 0.45, 0.7 ) * t.rgb, t.a * 0.1 ); }',
    });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; this.group.add(pts);
    this.animated.push((dt) => {
      m.uniforms.uViewH.value = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
      ps.forEach((p, i) => {
        p.age += dt; if (p.age > p.life) { p.age = 0; p.life = 3 + Math.random() * 2; }
        const k = p.age / p.life;
        pos[i * 3] = p.v[0] + Math.sin(p.age * 1.3 + i) * 0.25 * k + k * 0.6; pos[i * 3 + 1] = 0.1 + k * 3.2; pos[i * 3 + 2] = p.v[1] + Math.cos(p.age + i) * 0.2 * k;
        size[i] = (0.4 + k * 1.8) * Math.sin(Math.PI * Math.min(1, k * 1.2));
      });
      geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
    });
  }
  buildTraffic() {
    // flying cars: pairs of lights crossing the sky in lanes over the street, far and near
    const N = 14, cars = [];
    const geo = new THREE.SphereGeometry(0.25, 8, 6);
    const mw = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.9, 1.7), fog: false }), mr = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.2, 0.2), fog: false });
    for (let i = 0; i < N; i++) {
      const dir = rand() < 0.5 ? 1 : -1, lane = pick([[24, -40], [32, -70], [40, -110], [20, -25]]);
      const g = new THREE.Group();
      const a = new THREE.Mesh(geo, dir > 0 ? mw : mr), b = new THREE.Mesh(geo, dir > 0 ? mw : mr);
      a.position.z = -0.6; b.position.z = 0.6; g.add(a, b);
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 1.5), new THREE.MeshStandardMaterial({ color: 0x0c0d12, metalness: 0.6, roughness: 0.4 })); body.position.x = -dir * 1.4; g.add(body);
      const under = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(...pick([NEON.cyan, NEON.pink, NEON.violet])), transparent: true, opacity: 0.8, fog: false })); under.rotation.x = Math.PI / 2; under.position.set(-dir * 1.4, -0.32, 0); g.add(under);
      g.position.set(rnd(-150, 150), lane[0] + rnd(-3, 3), lane[1] + rnd(-6, 6));
      this.group.add(g);
      cars.push({ g, dir, v: rnd(12, 30) });
    }
    this.animated.push((dt) => { for (const c of cars) { c.g.position.x += c.dir * c.v * dt; if (Math.abs(c.g.position.x) > 160) c.g.position.x = -c.dir * 160; } });
  }
  buildRain() {
    // rain: thin streaks falling a little slanted in a 28 m box that follows the camera. Moved by the GPU (each drop's
    // height and drift from the time, wrapped round the camera), nothing to update per frame on the CPU
    const N = this.quality === 'medium' ? 1800 : 3600;
    const pos = new Float32Array(N * 6), end = new Float32Array(N * 2), spd = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = rnd(-14, 14), y = rnd(0, 16), z = rnd(-14, 14), v = rnd(0.8, 1.2);
      pos.set([x, y, z, x, y, z], i * 6); end.set([0, 1], i * 2); spd.set([v, v], i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1)); geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    const U = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } };
    const m = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false,
      vertexShader: `attribute float aEnd, aSpeed; uniform float uTime; uniform vec3 uCam; varying float vA;
        void main() {
          const vec3 wind = vec3( 1.2, -14.0, 0.4 );
          float y = mod( position.y + wind.y * aSpeed * uTime, 16.0 );
          vec2 rel = mod( position.xz + wind.xz * uTime - uCam.xz + 14.0, 28.0 ) - 14.0;
          float len = 0.45 * aSpeed;
          vec3 p = vec3( uCam.x + rel.x, y, uCam.z + rel.y ) + aEnd * vec3( -wind.x / 14.0 * len, len, -wind.z / 14.0 * len );
          vA = 1.0 - smoothstep( 9.0, 14.0, length( rel ) );
          gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
        }`,
      fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4( 0.55, 0.6, 0.8, 0.32 * vA ); }',
    });
    const lines = new THREE.LineSegments(geo, m); lines.frustumCulled = false; this.group.add(lines);
    this.animated.push((dt) => { U.uTime.value += dt; if (this.cameraPos) U.uCam.value.copy(this.cameraPos); });
    // splashes: small rings that pop and fade on the street round the fight
    const ring = canvasTex(64, 64, (g, w, h) => { g.strokeStyle = 'rgba(200,220,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 4, 0, 6.3); g.stroke(); });
    const S = 60, splashes = [];
    const sm = new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false, opacity: 0.5 });
    const sg = new THREE.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(sg, sm, S); inst.frustumCulled = false; inst.renderOrder = 3; this.group.add(inst);
    for (let i = 0; i < S; i++) splashes.push({ x: rnd(-6, 6), z: rnd(-5, 5), age: rand() * 0.4 });
    const o = new THREE.Object3D();
    this.animated.push((dt) => {
      splashes.forEach((s, i) => {
        s.age += dt; if (s.age > 0.4) { s.age = 0; s.x = rnd(-7, 7); s.z = rnd(-6, 6); }
        const k = s.age / 0.4, sc = 0.04 + k * 0.18;
        o.position.set(s.x, 0.02, s.z); o.scale.set(sc, 1, sc); o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      sm.opacity = 0.45;
    });
  }

  bakeEnvironment() {
    // (the reflections in the wet street and on the metal: the signs, the windows, the smog; the rain not in it)
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.1, 600, cubeRT);
    cc.position.set(0, 1.4, 0); this.scene.add(cc);
    const fog = this.scene.fog; this.scene.fog = null;
    cc.update(this.renderer, this.scene);
    this.scene.fog = fog; this.scene.remove(cc);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromCubemap(cubeRT.texture).texture;
    this.scene.environmentIntensity = 0.9;
    pm.dispose(); cubeRT.dispose();
  }

  update(dt, camera) {
    this.t += dt; this.cameraPos = camera.position;
    for (const f of this.animated) f(dt);
    // the signs' buzz and flicker (a few fail for a moment now and then)
    for (const s of this.signs) {
      let k = 1;
      if (s.flick > 0) { const n = Math.sin(this.t * 37 + s.ph) * Math.sin(this.t * 13 + s.ph * 2); if (n > 1 - s.flick * 8) k = 0.15; }
      k *= 0.96 + 0.04 * Math.sin(this.t * 60 + s.ph);
      s.m.color.setScalar(s.base * k); s.refl.material.opacity = k;
    }
    this.pinkL.intensity = 22 * (0.9 + 0.1 * Math.sin(this.t * 3.1)); this.cyanL.intensity = 20 * (0.9 + 0.1 * Math.sin(this.t * 2.3 + 1));
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); });
  }
}

function streakTex() {
  // (one per stage built: the game disposes a stage's textures when it leaves it)
  if (streakTex.t && streakTex.seed === seedOf) return streakTex.t;
  streakTex.seed = seedOf;
  return (streakTex.t = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
    // (broken up by ripples)
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${rand() * 0.6})`; g.fillRect(0, rand() * h, w, 2 + rand() * 4); }
  }));
}
