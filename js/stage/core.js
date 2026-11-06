// "Dentro del PC": Orión's home, the inside of the computer where the AI lives: a gaming PC's case seen at the size of a
// toy soldier (about sixty times bigger than life). The fight is on top of the graphics card, on its backplate, the
// card's three fans glowing under it and the case's floor (the power supply's cover) far below past its edge. Behind
// the fighters the motherboard stands up like a wall: its tracks with pulses of data running along them, the M.2
// heatsink, the chipset's, the processor's liquid-cooling pump (on its round screen Orión's red eyes, the AI that lives
// here) with its two thick tubes going up to the radiator, the four memory modules with their RGB bars, the power
// stage's finned heatsinks and capacitors, the rear I/O cover, the 24-pin connector and its sleeved cable going into a
// grommet of the tray. The case round it: three big RGB fans at the front, one at the back, a radiator with its fans
// in the roof, the glass side panel behind the camera and a dark room beyond it. Dust floating in the light. All made
// here by code (canvas textures and shaders, no photos), its texture sizes set by the quality.
import * as THREE from 'three';
import { FIGHTER_KEY } from '../materials.js';
import { createFightSun, aimFightSun } from '../engine/sunshadow.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let seed = 0x0C0DE;
function rand() { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rnd = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];
function bake(geos) { return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))); }
function canvasTex(w, h, draw, { repeat = null, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const CYAN = new THREE.Color(0.15, 0.88, 1.0), PINK = new THREE.Color(1.0, 0.2, 0.7);
const HSV_GLSL = 'vec3 hsv( float h ) { vec3 k = abs( fract( h + vec3( 0.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ) - 1.0; return clamp( k, 0.0, 1.0 ); }';

// the case, in metres of the stage (y = 0 is the top of the graphics card, where the fight is)
const WALL = -7.0;                          // the motherboard's face (the card plugs into it); the tray is just behind
const GLASS = 9.8;                          // the glass side panel
const REAR = -13.5, FRONT = 13.2;           // the case's back (I/O, exhaust fan) and front (intake fans)
const ROOF = 18, FLOOR = -10;               // the roof (radiator) and the power supply's cover
const CARD = { x0: -11.5, x1: 7.5, z0: WALL, z1: 3.8, h: 3.4 };   // the graphics card: its backplate is the floor
const BOARD = { x0: -11.5, x1: 4.6, y0: -9, y1: 12.5 };           // the motherboard
// the walkable part of the card
const WX0 = -10.0, WX1 = 6.3, WZ0 = -4.6, WZ1 = 3.1;

// ------------------------------------------------------------------ the board's textures
// map: the solder mask, the tracks under it, gold pads and vias, white silkscreen, small surface-mount parts.
// data (not colour): R the tracks, G how far along its track a pixel is (wrapping every 256 px), B each track's own
// phase: the pulses running along the tracks are drawn from it by a shader (flowMaterial)
function boardTextures(size) {
  const S = size / 2048;
  const mc = document.createElement('canvas'), dc = document.createElement('canvas');
  mc.width = mc.height = dc.width = dc.height = size;
  const m = mc.getContext('2d'), d = dc.getContext('2d');
  m.fillStyle = '#0e2c25'; m.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000 * S * S; i++) { m.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '40,90,70'},${rand() * 0.25})`; m.fillRect(rand() * size, rand() * size, 2 * S + rand() * 3 * S, 2 * S + rand() * 3 * S); }
  d.fillStyle = '#000'; d.fillRect(0, 0, size, size);
  const G = 16 * S, margin = 40 * S;
  const inside = (x, y) => x > margin && y > margin && x < size - margin && y < size - margin;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const track = (pts, w, ph) => {
    // the colour map: the track a lighter green under the mask, a faint edge
    m.lineCap = 'round'; m.lineJoin = 'round';
    m.strokeStyle = '#174536'; m.lineWidth = w + 3 * S; m.beginPath(); pts.forEach(([x, y], i) => (i ? m.lineTo(x, y) : m.moveTo(x, y))); m.stroke();
    m.strokeStyle = '#2a6a55'; m.lineWidth = w; m.stroke();
    // the data map: small steps along it, each with its distance
    d.lineCap = 'round'; d.lineWidth = w;
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / (5 * S)));
      for (let k = 0; k < n; k++) {
        const a = k / n, b = (k + 1) / n;
        d.strokeStyle = `rgb(255,${Math.floor((dist + L * a) / S) % 256},${ph})`;
        d.beginPath(); d.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a); d.lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b); d.stroke();
      }
      dist += L;
    }
    // ends: a via (a gold ring round a hole) or a pad
    for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
      if (rand() < 0.6) { m.fillStyle = '#c9a24a'; m.beginPath(); m.arc(x, y, w * 1.3 + 3 * S, 0, 6.3); m.fill(); m.fillStyle = '#0a0d0c'; m.beginPath(); m.arc(x, y, w * 0.55, 0, 6.3); m.fill(); }
      else { m.fillStyle = '#d8b25a'; m.fillRect(x - w * 1.6, y - w * 1.1, w * 3.2, w * 2.2); }
      d.fillStyle = `rgb(255,0,${ph})`; d.beginPath(); d.arc(x, y, w * 1.3, 0, 6.3); d.fill();
    }
  };
  // tracks: runs along the grid, turning through 45° chamfers
  for (let i = 0; i < 150; i++) {
    let x = Math.round(rnd(margin, size - margin) / G) * G, y = Math.round(rnd(margin, size - margin) / G) * G;
    let dir = Math.floor(rand() * 4);
    const pts = [[x, y]], w = (rand() < 0.2 ? rnd(9, 14) : rnd(4, 8)) * S, ph = Math.floor(rand() * 256);
    const segs = 2 + Math.floor(rand() * 5);
    for (let k = 0; k < segs; k++) {
      const L = Math.round(rnd(4, 26)) * G, [dx, dy] = DIRS[dir];
      const nx = x + dx * L, ny = y + dy * L;
      if (!inside(nx, ny)) break;
      x = nx; y = ny; pts.push([x, y]);
      const turn = rand() < 0.5 ? 1 : 3, nd = (dir + turn) % 4, [ex, ey] = DIRS[nd], c = 2 * G;
      const cx = x + dx * c + ex * c, cy = y + dy * c + ey * c;
      if (!inside(cx, cy)) break;
      x = cx; y = cy; pts.push([x, y]); dir = nd;
    }
    if (pts.length > 1) track(pts, w, ph);
  }
  // buses: bundles of parallel tracks, fanning out at 45° at both ends to rows of pads
  for (let i = 0; i < 16; i++) {
    const n = 4 + Math.floor(rand() * 6), sp = 18 * S, w = 5 * S, horiz = rand() < 0.5, L = rnd(300, 700) * S;
    const x0 = rnd(margin + 80 * S, size - margin - L - 80 * S), y0 = rnd(margin + 80 * S, size - margin - n * sp - 80 * S), ph = Math.floor(rand() * 256);
    for (let k = 0; k < n; k++) {
      const o = k * sp, f = (n - k) * 8 * S;
      let pts = [[x0 - f - 30 * S, y0 + o - f], [x0, y0 + o], [x0 + L, y0 + o], [x0 + L + f + 30 * S, y0 + o + f]];
      if (!horiz) pts = pts.map(([px, py]) => [py - y0 + x0, px - x0 + y0]);
      if (pts.every(([px, py]) => inside(px, py))) track(pts, w, (ph + k * 9) % 256);
    }
  }
  // surface-mount parts: resistors and capacitors (dark, silver ends), chips with their legs; their outlines and
  // names in white
  m.font = `600 ${Math.round(18 * S)}px monospace`; m.textBaseline = 'middle';
  const LAB = ['R', 'C', 'U', 'Q', 'L', 'D', 'J', 'TP'];
  for (let i = 0; i < 260; i++) {
    const x = rnd(margin, size - margin), y = rnd(margin, size - margin), v = rand() < 0.5;
    const a = 22 * S, b = 11 * S, w = v ? b : a, h = v ? a : b;
    m.fillStyle = '#c0c4c8'; m.fillRect(x - w / 2, y - h / 2, w, h);
    m.fillStyle = rand() < 0.5 ? '#151515' : '#6b4a2a'; m.fillRect(x - w / 2 + (v ? 0 : 5 * S), y - h / 2 + (v ? 5 * S : 0), w - (v ? 0 : 10 * S), h - (v ? 10 * S : 0));
    if (rand() < 0.35) { m.fillStyle = 'rgba(235,235,225,0.75)'; m.fillText(`${pick(LAB)}${1 + Math.floor(rand() * 99)}`, x + w / 2 + 6 * S, y); }
  }
  for (let i = 0; i < 26; i++) {
    const s = rnd(60, 130) * S, x = rnd(margin + s, size - margin - s), y = rnd(margin + s, size - margin - s);
    m.fillStyle = '#d0d4d8';
    for (let k = 0; k < s / (12 * S); k++) for (const [ox, oy, ww, hh] of [[-s / 2 + 4 * S + k * 12 * S, -s / 2 - 10 * S, 5 * S, 12 * S], [-s / 2 + 4 * S + k * 12 * S, s / 2 - 2 * S, 5 * S, 12 * S], [-s / 2 - 10 * S, -s / 2 + 4 * S + k * 12 * S, 12 * S, 5 * S], [s / 2 - 2 * S, -s / 2 + 4 * S + k * 12 * S, 12 * S, 5 * S]]) m.fillRect(x + ox, y + oy, ww, hh);
    m.fillStyle = '#121214'; m.fillRect(x - s / 2, y - s / 2, s, s);
    m.fillStyle = 'rgba(255,255,255,0.18)'; m.beginPath(); m.arc(x - s / 2 + 10 * S, y - s / 2 + 10 * S, 4 * S, 0, 6.3); m.fill();
    m.fillStyle = 'rgba(200,200,200,0.5)'; m.font = `600 ${Math.round(12 * S)}px monospace`; m.textAlign = 'center'; m.fillText(pick(['RyC', 'ORN-7', 'Q2099', 'NX-01', 'CL4V3']), x, y); m.textAlign = 'left';
    m.strokeStyle = 'rgba(235,235,225,0.6)'; m.lineWidth = 2 * S; m.strokeRect(x - s / 2 - 18 * S, y - s / 2 - 18 * S, s + 36 * S, s + 36 * S);
    m.font = `600 ${Math.round(18 * S)}px monospace`; m.fillStyle = 'rgba(235,235,225,0.75)'; m.fillText(`U${1 + Math.floor(rand() * 40)}`, x - s / 2 - 18 * S, y - s / 2 - 30 * S);
  }
  // the maker's marks
  m.fillStyle = 'rgba(235,235,225,0.8)'; m.font = `700 ${Math.round(46 * S)}px monospace`;
  m.fillText('RyC INDUSTRIAS', margin + 30 * S, size - margin - 60 * S);
  m.font = `600 ${Math.round(26 * S)}px monospace`; m.fillText('PLACA ORIÓN-2099  REV 2.0', margin + 30 * S, size - margin - 22 * S);
  const map = new THREE.CanvasTexture(mc), data = new THREE.CanvasTexture(dc);
  map.colorSpace = THREE.SRGBColorSpace; data.colorSpace = THREE.NoColorSpace;
  for (const t of [map, data]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, data };
}


// ------------------------------------------------------------------ smaller textures
function capSleeve(col) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(w * 0.82, 0, w * 0.1, h);
    g.fillStyle = col; for (let y = 8; y < h; y += 22) g.fillRect(w * 0.85, y, w * 0.04, 8);
    g.save(); g.translate(w * 0.45, h * 0.5); g.rotate(-Math.PI / 2); g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '700 15px monospace'; g.textAlign = 'center'; g.fillText('2200µF 16V', 0, -20); g.fillText('105°C  RyC', 0, 4); g.restore();
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.15, 'rgba(255,255,255,0)'); gr.addColorStop(0.9, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

function capTop() {
  return canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, '#d6d9dd'); gr.addColorStop(1, '#8d9196');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5a5e63'; g.lineWidth = 6;
    for (let a = 0; a < 3; a++) { g.save(); g.translate(w / 2, h / 2); g.rotate(a * Math.PI / 3 + Math.PI / 6); g.beginPath(); g.moveTo(-w * 0.32, 0); g.lineTo(w * 0.32, 0); g.stroke(); g.restore(); }
    g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, 6.3); g.stroke();
  });
}

function ramBoardTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#123828'; g.fillRect(0, 0, w, h);
    for (let x = 4; x < w - 4; x += 9) { g.fillStyle = '#d4a845'; g.fillRect(x, h - 26, 6, 24); }
    g.fillStyle = '#0d0d0f'; g.fillRect(w * 0.49, h - 30, 14, 30);
    for (let i = 0; i < 8; i++) { g.fillStyle = '#121214'; g.fillRect(30 + i * 122, 70, 96, 110); g.fillStyle = 'rgba(200,200,200,0.4)'; g.font = '600 13px monospace'; g.fillText('RyC 64G', 50 + i * 122, 128); }
    g.strokeStyle = '#1f5544'; g.lineWidth = 2; for (let i = 0; i < 60; i++) { const x = rand() * w; g.beginPath(); g.moveTo(x, h - 28); g.lineTo(x + rnd(-30, 30), 190); g.stroke(); }
  });
}

function spreaderTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b2e35'); gr.addColorStop(1, '#16181d'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 3; for (let x = -h; x < w; x += 26) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
    g.fillStyle = 'rgba(220,225,235,0.85)'; g.font = '900 64px "Arial Narrow", Arial, sans-serif'; g.fillText('RyC', 60, 150);
    g.font = '600 26px monospace'; g.fillStyle = 'rgba(170,180,195,0.8)'; g.fillText('MEMORIA NEURONAL  DDR9  64 GB', 220, 140);
    g.fillStyle = '#3ce8ff'; g.fillRect(220, 160, 300, 4);
  });
}

function braidTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#0c0c10'; g.fillRect(0, 0, w, h);
    g.lineWidth = 6;
    for (let i = -h; i < w + h; i += 16) { g.strokeStyle = i % 32 ? '#1a1c24' : '#1b4a5c'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); }
  }, { repeat: [1, 30] });
}

// the graphics card's backplate (the floor): dark brushed metal, the maker's logo, rows of vent slots near its far end,
// screws, a thin pattern of lines
function backplateTex() {
  return canvasTex(2048, 820, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a2d33'); gr.addColorStop(1, '#202328'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { g.strokeStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.05})`; g.lineWidth = 1 + rand() * 1.5; const y = rand() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + rnd(-2, 2)); g.stroke(); }
    // vents: rows of rounded slots over the far end (where the fans' air goes through)
    g.fillStyle = '#0b0c0f';
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) { const x = w * 0.78 + c * 46, y = 90 + r * 72; g.beginPath(); g.roundRect(x, y, 30, 52, 14); g.fill(); }
    // the logo and the model
    g.fillStyle = 'rgba(14,15,18,0.6)'; g.font = '900 170px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('RyC', w * 0.12, h * 0.42);
    g.fillStyle = 'rgba(190,196,206,0.28)'; g.font = '700 40px monospace'; g.fillText('GRÁFICOS 9090  ·  24 GB', w * 0.12, h * 0.62);
    g.strokeStyle = 'rgba(190,196,206,0.25)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(w * 0.08, h * 0.15); g.lineTo(w * 0.25, h * 0.15); g.lineTo(w * 0.28, h * 0.25); g.lineTo(w * 0.7, h * 0.25); g.stroke();
    g.beginPath(); g.moveTo(w * 0.08, h * 0.85); g.lineTo(w * 0.45, h * 0.85); g.lineTo(w * 0.48, h * 0.78); g.lineTo(w * 0.72, h * 0.78); g.stroke();
    // screws
    for (const [x, y] of [[60, 60], [60, h - 60], [w * 0.5, 60], [w * 0.5, h - 60], [w - 60, 60], [w - 60, h - 60], [w * 0.62, h * 0.5]]) {
      const sg = g.createRadialGradient(x - 6, y - 6, 2, x, y, 22); sg.addColorStop(0, '#9aa0a8'); sg.addColorStop(1, '#3a3e45'); g.fillStyle = sg; g.beginPath(); g.arc(x, y, 22, 0, 6.3); g.fill();
      g.strokeStyle = '#1a1c20'; g.lineWidth = 5; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y + 12); g.stroke();
    }
  });
}
// the pump's round screen: the maker's mark and the coolant's temperature (the eyes and the ring are drawn by a shader)
function pumpTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#020306'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#d8f6ff'; g.font = '900 64px "Arial Narrow", Arial, sans-serif'; g.fillText('RyC', w / 2, h * 0.25);
    g.fillStyle = '#7fe8ff'; g.font = '700 56px monospace'; g.fillText('41°C', w / 2, h * 0.76);
    g.fillStyle = 'rgba(127,232,255,0.6)'; g.font = '600 26px monospace'; g.fillText('ORIÓN  EN LÍNEA', w / 2, h * 0.86);
  });
}
// a heatsink's top: fins seen edge on, the maker's mark
function finTex(label) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3b3f46'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 22) { const gr = g.createLinearGradient(x, 0, x + 22, 0); gr.addColorStop(0, '#8d949d'); gr.addColorStop(0.4, '#5a6068'); gr.addColorStop(1, '#23262b'); g.fillStyle = gr; g.fillRect(x, 0, 14, h); }
    if (label) { g.fillStyle = 'rgba(15,16,18,0.9)'; g.fillRect(w * 0.12, h * 0.4, w * 0.76, h * 0.2); g.fillStyle = '#d8dde6'; g.font = '900 70px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, w / 2, h / 2); }
  });
}
// beyond the glass: a dark room, a monitor's glow, a desk lamp, out of focus
function roomTex() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#05060a'; g.fillRect(0, 0, w, h);
    const m = g.createRadialGradient(w * 0.35, h * 0.45, 10, w * 0.35, h * 0.45, 320); m.addColorStop(0, 'rgba(90,140,255,0.35)'); m.addColorStop(1, 'rgba(90,140,255,0)'); g.fillStyle = m; g.fillRect(0, 0, w, h);
    const l = g.createRadialGradient(w * 0.8, h * 0.3, 5, w * 0.8, h * 0.3, 200); l.addColorStop(0, 'rgba(255,190,120,0.45)'); l.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = l; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = rand() * w, y = rand() * h, r = 6 + rand() * 26; g.fillStyle = `rgba(${pick(['255,200,140', '120,170,255', '255,90,200', '120,255,220'])},${0.05 + rand() * 0.12})`; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
  });
}

export class CoreStage {
  constructor(renderer, scene, quality = 'high') {
    this.renderer = renderer; this.scene = scene; seed = 0x0C0DE;
    this.quality = quality;
    this.low = quality === 'low';
    this.texSize = { low: 1024, medium: 1024, high: 2048, ultra: 2048 }[quality] || 2048;
    this.shadowSize = { low: 1024, medium: 1024, high: 2048, ultra: 2048 }[quality] || 2048;
    this.group = new THREE.Group(); this.group.name = 'stage-core';
    scene.add(this.group);
    this.arenaRadius = 6.0;
    this.t = 0;
    this.animated = [];
    this.koView = new THREE.Vector3(0, 0, -1);
    this.sunDir = new THREE.Vector3(-0.15, 0.85, 0.5).normalize();
    // (one clock for every RGB light of the case, so they all run through the colours together, and beat together)
    this.rgbU = { uTime: { value: 0 }, uPulse: { value: 0 } };
    // (the lights now, the case and its parts in ready(), a part at a time with a breath between them)
    this.buildLights();
    scene.fog = new THREE.FogExp2(new THREE.Color(0.015, 0.025, 0.04), 0.012);
  }
  async ready() {
    const steps = [() => this.buildCase(), () => this.buildCard(), () => this.buildBoard(), () => this.buildPump(), () => this.buildMemory(), () => this.buildPowerStage(),
      () => this.buildConnectors(), () => this.buildFans(), () => this.buildRoom(), () => this.buildDust()];
    for (const f of steps) { f(); await new Promise((r) => setTimeout(r, 0)); }
  }
  clampWalk(p, r = 0) {
    p.x = THREE.MathUtils.clamp(p.x, WX0 + r, WX1 - r);
    p.z = THREE.MathUtils.clamp(p.z, WZ0 + r, WZ1 - r);
    return p;
  }
  clampCam(p) { p.x = THREE.MathUtils.clamp(p.x, REAR + 1.2, FRONT - 1.5); p.z = THREE.MathUtils.clamp(p.z, WALL + 1.0, GLASS - 0.6); p.y = THREE.MathUtils.clamp(p.y, 0.3, ROOF - 2); return p; }

  // the materials whose colour runs through the rainbow: 'angle' round their own centre (fan rings), 'line' along
  // x (strips), with an offset
  rgbMat(mode = 'line', { k = 0.05, off = 0, gain = 1.5 } = {}) {
    return new THREE.ShaderMaterial({
      uniforms: this.rgbU, fog: false,
      vertexShader: 'varying vec3 vP, vW; void main() { vP = position; vW = ( modelMatrix * vec4( position, 1.0 ) ).xyz; gl_Position = projectionMatrix * viewMatrix * vec4( vW, 1.0 ); }',
      fragmentShader: `varying vec3 vP, vW; uniform float uTime, uPulse; ${HSV_GLSL}
        void main() {
          float h = ${mode === 'angle' ? 'atan( vP.y, vP.x ) * 0.159' : `( vW.x + vW.y * 0.6 ) * ${k.toFixed(3)}`} + ${off.toFixed(3)} - uTime * 0.12;
          gl_FragColor = vec4( hsv( fract( h ) ) * ( ${gain.toFixed(2)} + 0.6 * uPulse ), 1.0 );
        }`,
    });
  }
  // the music's beat (main.js sets beatClock), or 120 bpm of the stage's own: 1 on the beat, fading before the next
  pulse() { const b = this.beatClock?.(); const ph = b == null ? (this.t * 2) % 1 : ((b % 1) + 1) % 1; return Math.exp(-ph * 5); }
  hueAt(off) { return ((off - this.t * 0.12) % 1 + 1) % 1; }

  buildLights() {
    // the key: the case's white LED strip along the top of the glass, cool, from above and in front
    const sun = createFightSun(new THREE.Color(0.82, 0.9, 1.0), 1.35, this.shadowSize);
    this.sun = sun; this.group.add(sun); if (sun.target) this.group.add(sun.target);
    aimFightSun(sun, this.sunDir, new THREE.Vector3(), 2.6);
    this.keyColor = new THREE.Color(0.85, 0.92, 1.0); this.keyIntensity = 1.05;
    this.group.add(new THREE.HemisphereLight(new THREE.Color(0.18, 0.24, 0.34), new THREE.Color(0.07, 0.08, 0.11), 1.1));
    // the RGB round the fight: the front fans' (right), the memory's (behind, high), the pump's cyan, a soft fill from the glass
    this.frontL = new THREE.PointLight(PINK.clone(), 24, 22, 1.5); this.frontL.position.set(10.5, 5.0, 0.5);
    this.ramL = new THREE.PointLight(PINK.clone(), 22, 14, 1.5); this.ramL.position.set(2.0, 4.0, -3.4);
    this.pumpL = new THREE.PointLight(CYAN.clone(), 18, 12, 1.5); this.pumpL.position.set(-3.4, 3.4, -3.6);
    this.rearL = new THREE.PointLight(CYAN.clone(), 26, 22, 1.5); this.rearL.position.set(-11.5, 6.5, -2);
    this.group.add(this.frontL, this.ramL, this.pumpL, this.rearL);
    this.animated.push(() => {
      const p = this.pulse();
      this.frontL.color.setHSL(this.hueAt(0.0), 1, 0.55); this.frontL.intensity = 20 + 10 * p;
      this.ramL.color.setHSL(this.hueAt(0.35), 1, 0.55);
      this.rearL.color.setHSL(this.hueAt(0.6), 1, 0.55);
      this.pumpL.intensity = 16 + 10 * p;
    });
  }
  followShadow(center, spread = 3) { aimFightSun(this.sun, this.sunDir, center, Math.max(2.4, spread * 0.5 + 1.6)); }
  followCamera(camera, center) {
    FIGHTER_KEY.dir.value.set(-0.2, 0.8, 0.6).normalize();
    FIGHTER_KEY.color.value.copy(this.keyColor).multiplyScalar(this.keyIntensity * (this.keyBoost || 1));
    // (the kicker: the RGB behind, running through the colours with the case's lights)
    FIGHTER_KEY.rim.value.setHSL(this.hueAt(0.2), 0.9, 0.55).multiplyScalar(1.6 + 0.5 * this.pulse());
  }

  // ------------------------------------------------------------------ the case
  buildCase() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x1a1c21, roughness: 0.5, metalness: 0.7 });
    // the tray behind the motherboard (and round it), black steel with rubber grommets for the cables
    const tray = new THREE.Mesh(new THREE.PlaneGeometry(FRONT - REAR, ROOF - FLOOR), steel);
    tray.position.set((FRONT + REAR) / 2, (ROOF + FLOOR) / 2, WALL - 0.35); tray.receiveShadow = true; this.group.add(tray);
    const rub = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });
    this.grommets = [[7.2, 6.5], [7.2, -1.5], [7.2, 12.5]];
    for (const [x, y] of this.grommets) {
      const g = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.25, 10, 32), rub); g.scale.set(1, 1.9, 0.6); g.position.set(x, y, WALL - 0.3); this.group.add(g);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.scale.set(1, 1.9, 1); hole.position.set(x, y, WALL - 0.32); this.group.add(hole);
    }
    // the back, the front, the roof and the floor (the power supply's cover: perforated, an RGB strip along its edge)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GLASS - WALL + 1, ROOF - FLOOR), steel); back.rotation.y = Math.PI / 2; back.position.set(REAR, (ROOF + FLOOR) / 2, (GLASS + WALL) / 2); this.group.add(back);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(GLASS - WALL + 1, ROOF - FLOOR), steel); front.rotation.y = -Math.PI / 2; front.position.set(FRONT, (ROOF + FLOOR) / 2, (GLASS + WALL) / 2); this.group.add(front);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(FRONT - REAR, GLASS - WALL + 1), steel); roof.rotation.x = Math.PI / 2; roof.position.set((FRONT + REAR) / 2, ROOF, (GLASS + WALL) / 2); this.group.add(roof);
    const perf = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h); g.fillStyle = '#050507'; for (let y = 8; y < h; y += 16) for (let x = (y / 16) % 2 ? 16 : 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 4.5, 0, 6.3); g.fill(); } }, { repeat: [14, 7] });
    const shroud = new THREE.Mesh(new THREE.PlaneGeometry(FRONT - REAR, GLASS - WALL + 1), new THREE.MeshStandardMaterial({ map: perf, roughness: 0.5, metalness: 0.6 }));
    shroud.rotation.x = -Math.PI / 2; shroud.position.set((FRONT + REAR) / 2, FLOOR, (GLASS + WALL) / 2); this.group.add(shroud);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(FRONT - REAR, 0.35, 0.2), this.rgbMat('line', { k: 0.03 })); lip.position.set((FRONT + REAR) / 2, FLOOR + 0.2, GLASS - 0.4); this.group.add(lip);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8f4ff'; g.font = '900 96px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#3ce8ff'; g.shadowBlur = 18; g.fillText('RyC', w / 2, h / 2); }), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    logo.rotation.x = -Math.PI / 2; logo.position.set(2, FLOOR + 0.02, GLASS - 3); this.group.add(logo);
    // the glass side panel behind the camera: a faint sheen of what it reflects, a line of dust along its bottom
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(FRONT - REAR, ROOF - FLOOR), new THREE.MeshStandardMaterial({ color: 0x0a0c10, metalness: 1, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.set((FRONT + REAR) / 2, (ROOF + FLOOR) / 2, GLASS); glass.renderOrder = 4; this.group.add(glass);
    // the white LED strip of the case along the top of the glass (the key light's source)
    const led = new THREE.Mesh(new THREE.BoxGeometry(FRONT - REAR - 2, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.75, 1.9), fog: false }));
    led.position.set((FRONT + REAR) / 2, ROOF - 0.3, GLASS - 0.6); this.group.add(led);
  }

  // ------------------------------------------------------------------ the graphics card (the floor)
  buildCard() {
    const C = CARD, L = C.x1 - C.x0, D = C.z1 - C.z0;
    const plate = new THREE.MeshPhysicalMaterial({ map: backplateTex(), roughness: 0.42, metalness: 0.65, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.9 });
    const shroudM = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.4, metalness: 0.6 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, D), [shroudM, shroudM, plate, shroudM, shroudM, shroudM]);
    top.position.set((C.x0 + C.x1) / 2, -0.15, (C.z0 + C.z1) / 2); top.receiveShadow = true; this.group.add(top);
    // the card's body under it: the shroud, the heatsink's fins showing at its edge, the three fans underneath
    const body = new THREE.Mesh(new THREE.BoxGeometry(L - 0.4, C.h - 0.3, D - 0.3), shroudM);
    body.position.set((C.x0 + C.x1) / 2, -0.3 - (C.h - 0.3) / 2, (C.z0 + C.z1) / 2); this.group.add(body);
    const fins = new THREE.Mesh(new THREE.PlaneGeometry(L - 2, C.h * 0.55), new THREE.MeshStandardMaterial({ map: finTex(null), roughness: 0.4, metalness: 0.9 }));
    fins.position.set((C.x0 + C.x1) / 2 + 0.5, -C.h * 0.45, C.z1 - 0.13); this.group.add(fins);
    // its edge facing the glass: an RGB strip and the lit name
    const strip = new THREE.Mesh(new THREE.BoxGeometry(L - 1.2, 0.12, 0.08), this.rgbMat('line', { k: 0.04 }));
    strip.position.set((C.x0 + C.x1) / 2, -0.42, C.z1 + 0.01); this.group.add(strip);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), new THREE.MeshBasicMaterial({ map: canvasTex(512, 110, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 84px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RyC 9090', w / 2, h / 2); }), color: new THREE.Color(1.4, 1.4, 1.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    name.position.set(C.x0 + 4, -C.h + 0.9, C.z1 + 0.02); this.group.add(name);
    const fans = [];
    for (const x of [C.x0 + 3.6, C.x0 + 9.5, C.x0 + 15.4]) {
      const f = this.makeFan(2.6, { blades: 11, frame: false });
      f.g.position.set(x, -C.h - 0.05, (C.z0 + C.z1) / 2); f.g.rotation.x = Math.PI / 2; this.group.add(f.g); fans.push(f);
    }
    // the bracket at its back end, standing up a little over the plate; the slot's latch at the board
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.15, C.h + 1.4, D + 0.6), new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.35, metalness: 1 }));
    br.position.set(C.x0 - 0.1, -C.h / 2 + 0.55, (C.z0 + C.z1) / 2); br.castShadow = true; this.group.add(br);
    this.animated.push((dt) => { for (const f of fans) f.rot.rotation.z += dt * 3.1; });
  }

  // a fan: its frame (a ring, or the square frame with corner mounts), curved blades, the hub with the mark, an RGB ring
  makeFan(R, { blades = 9, frame = true, ring = true, glow = 0.35 } = {}) {
    const g = new THREE.Group();
    const frameM = new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.5, roughness: 0.5 });
    if (frame) {
      const s = R * 2.24, t = R * 0.12;
      for (const [x, y, w, h] of [[0, s / 2 - t / 2, s, t], [0, -s / 2 + t / 2, s, t], [s / 2 - t / 2, 0, t, s], [-s / 2 + t / 2, 0, t, s]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, R * 0.5), frameM); b.position.set(x, y, -R * 0.12); g.add(b); }
      for (const [x, y] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.16, R * 0.16, R * 0.5, 16), frameM); c.rotation.x = Math.PI / 2; c.position.set(x * (s / 2 - R * 0.16), y * (s / 2 - R * 0.16), -R * 0.12); g.add(c); }
    }
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, R * 0.42, 48, 1, true), frameM); shroud.rotation.x = Math.PI / 2; shroud.position.z = -R * 0.12; g.add(shroud);
    if (ring) { const lr = new THREE.Mesh(new THREE.TorusGeometry(R * 1.0, R * 0.045, 8, 96), this.rgbMat('angle', { off: rand() })); lr.position.z = R * 0.1; g.add(lr); }
    // (the light the ring throws onto the blades and the hub)
    if (glow > 0) { const gl = new THREE.Mesh(new THREE.CircleGeometry(R * 0.98, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.6, 1.0).multiplyScalar(glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 })); gl.position.z = -R * 0.3; g.add(gl); }
    const rot = new THREE.Group(); g.add(rot);
    const bladeM = new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
    for (let k = 0; k < blades; k++) {
      const sh = new THREE.Shape(); sh.moveTo(R * 0.28, -R * 0.08); sh.quadraticCurveTo(R * 0.6, -R * 0.32, R * 0.96, -R * 0.14); sh.quadraticCurveTo(R * 0.7, R * 0.16, R * 0.28, R * 0.1); sh.lineTo(R * 0.28, -R * 0.08);
      const b = new THREE.Mesh(new THREE.ShapeGeometry(sh, 10), bladeM); b.rotation.z = k / blades * Math.PI * 2; b.rotation.x = 0.22; rot.add(b);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.3, R * 0.3, R * 0.2, 32), new THREE.MeshStandardMaterial({ map: this.hubTex || (this.hubTex = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#16181d'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8dde6'; c.font = '900 84px "Arial Narrow", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RyC', w / 2, h / 2); })), metalness: 0.5, roughness: 0.4 }));
    hub.rotation.x = Math.PI / 2; hub.position.z = R * 0.04; g.add(hub);
    return { g, rot };
  }

  // ------------------------------------------------------------------ the motherboard (the wall behind the fight)
  buildBoard() {
    const B = BOARD, W = B.x1 - B.x0, H = B.y1 - B.y0;
    const { map, data } = boardTextures(this.texSize);
    const rx = W / 10, ry = H / 10;
    map.repeat.set(rx, ry); data.repeat.set(rx, ry);
    const mat = new THREE.MeshPhysicalMaterial({ map, roughness: 0.45, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 1.0 });
    const pcb = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    pcb.position.set((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, WALL); pcb.receiveShadow = true; this.group.add(pcb);
    // the edge of the board (its thickness, seen from the side)
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.12), new THREE.MeshStandardMaterial({ color: 0x0b1a16, roughness: 0.6 }));
    edge.position.set(pcb.position.x, pcb.position.y, WALL - 0.07); this.group.add(edge);
    // pulses of data along its tracks
    const U = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uData: { value: data }, uTime: this.rgbU.uTime, uRep: { value: new THREE.Vector2(rx, ry) } };
    const flow = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      vertexShader: `uniform vec2 uRep; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() { vUv = uv * uRep; vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D uData; uniform float uTime; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D( uData, vUv );
          float ph = t.b;
          float p = fract( t.g * 2.0 - uTime * ( 0.35 + ph * 0.5 ) + ph * 7.0 );
          float pulse = smoothstep( 0.0, 0.02, p ) * ( 1.0 - smoothstep( 0.02, 0.22, p ) );
          vec3 c = mix( vec3( 0.12, 0.85, 1.0 ), vec3( 1.0, 0.25, 0.75 ), step( 0.82, ph ) );
          gl_FragColor = vec4( c * t.r * ( 0.04 + 1.3 * pulse ), 1.0 );
          #include <fog_fragment>
        }`,
    });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, H), flow); fl.position.copy(pcb.position).setZ(WALL + 0.01); fl.renderOrder = 1; this.group.add(fl);
    // the PCIe slot the card is in (its latch peeping out over the plate), another slot below, mounting screws
    const black = new THREE.MeshStandardMaterial({ color: 0x0c0c0f, roughness: 0.5, metalness: 0.2 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb0b6be, roughness: 0.3, metalness: 1 });
    const latch = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), black); latch.position.set(CARD.x1 - 6.5, 0.3, WALL + 0.35); latch.castShadow = true; this.group.add(latch);
    for (const [x, y] of [[B.x0 + 0.6, B.y1 - 0.6], [B.x1 - 0.6, B.y1 - 0.6], [-4, B.y1 - 0.6], [B.x0 + 0.6, 1.0], [B.x1 - 0.6, 1.0], [-4, 1.2]]) {
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 20), steel); sc.rotation.x = Math.PI / 2; sc.position.set(x, y, WALL + 0.06); this.group.add(sc);
    }
    // the M.2 heatsink right above the card: a brushed plate with an RGB line and the mark
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.3, 0.45), new THREE.MeshStandardMaterial({ map: canvasTex(512, 104, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5c626b'); gr.addColorStop(1, '#2c3036'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.05})`; g.fillRect(0, rand() * h, w, 1); } g.fillStyle = 'rgba(20,22,26,0.9)'; g.font = '900 54px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('RyC', 24, h / 2); g.font = '700 26px monospace'; g.fillText('M.2  ·  NÚCLEO DE MEMORIA', 140, h / 2); }), roughness: 0.35, metalness: 0.9 }));
    m2.position.set(-5.4, 0.85, WALL + 0.23); m2.castShadow = true; m2.receiveShadow = true; this.group.add(m2);
    const m2l = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.06, 0.06), this.rgbMat('line', { k: 0.08 })); m2l.position.set(-5.4, 0.22, WALL + 0.47); this.group.add(m2l);
    // the chipset's heatsink at the board's lower right, the mark lit in it
    const cs = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 0.7), new THREE.MeshStandardMaterial({ map: finTex(null), roughness: 0.4, metalness: 0.9 }));
    cs.position.set(3.6, 1.1, WALL + 0.35); cs.castShadow = true; this.group.add(cs);
    const csl = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), new THREE.MeshBasicMaterial({ map: canvasTex(256, 80, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.shadowColor = '#3ce8ff'; g.shadowBlur = 14; g.fillStyle = '#c8f6ff'; g.font = '900 60px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RyC', w / 2, h / 2); }), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: new THREE.Color(1.5, 1.5, 1.5) }));
    csl.position.set(3.6, 1.1, WALL + 0.71); this.group.add(csl);
    // status LEDs dotted over the board, glowing (most green, some blue, a red one blinking)
    const ledG = { g: [], b: [], r: [] };
    for (let i = 0; i < 26; i++) {
      const k = i === 0 ? 'r' : rand() < 0.7 ? 'g' : 'b', q = new THREE.PlaneGeometry(0.16, 0.08);
      q.translate(rnd(B.x0 + 1, B.x1 - 1), rnd(0.4, 11.5), WALL + 0.02); ledG[k].push(q);
    }
    const leds = {};
    for (const [k, col] of [['g', [0.3, 2.2, 0.6]], ['b', [0.4, 0.9, 2.4]], ['r', [2.6, 0.2, 0.15]]]) {
      if (!ledG[k].length) continue;
      leds[k] = new THREE.Mesh(bake(ledG[k]), new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), fog: false })); this.group.add(leds[k]);
    }
    this.animated.push(() => { if (leds.r) leds.r.visible = (this.t * 1.3) % 1 < 0.5; });
    // the coin cell of the clock
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 40), new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, '#e2e6ea'); gr.addColorStop(1, '#9aa0a8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(40,40,40,0.7)'; g.font = '700 22px monospace'; g.textAlign = 'center'; g.fillText('CR2032', w / 2, h / 2 + 4); g.fillText('+', w / 2, h / 2 - 24); }), metalness: 1, roughness: 0.25 }));
    cell.rotation.x = Math.PI / 2; cell.position.set(-0.7, 0.95, WALL + 0.1); this.group.add(cell);
  }

  // ------------------------------------------------------------------ the processor's liquid-cooling pump
  // A round block over the processor: a ring of RGB, its round screen with the mark, the coolant's temperature and,
  // in the middle, Orión's two red eyes (the AI that lives in this computer), blinking now and then; a ring of light
  // turning round them; the two thick tubes from its side up to the radiator in the roof
  buildPump() {
    const X = -3.4, Y = 3.5, R = 1.9, D = 2.0;
    const metal = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.3, metalness: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.06, D, 48), metal); body.rotation.x = Math.PI / 2; body.position.set(X, Y, WALL + D / 2); body.castShadow = true; this.group.add(body);
    // (the cold plate's bracket: a square plate on the board with four screws)
    const brk = new THREE.Mesh(new THREE.BoxGeometry(4.0, 4.0, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.9 })); brk.position.set(X, Y, WALL + 0.1); this.group.add(brk);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.09, 8, 96), this.rgbMat('angle', { off: 0.3 })); ring.position.set(X, Y, WALL + D + 0.02); this.group.add(ring);
    const U = { uMap: { value: pumpTex() }, uTime: this.rgbU.uTime, uPulse: this.rgbU.uPulse };
    const screen = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 64), new THREE.ShaderMaterial({
      uniforms: U, fog: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: `uniform sampler2D uMap; uniform float uTime, uPulse; varying vec2 vUv;
        float eye( vec2 p, vec2 c ) { vec2 d = ( p - c ) / vec2( 0.11, 0.035 ); return exp( -dot( d, d ) * 1.2 ); }
        void main() {
          vec3 c = texture2D( uMap, vUv ).rgb;
          vec2 p = vUv - 0.5;
          float r = length( p ), a = atan( p.y, p.x );
          // a ring of ticks turning
          float ticks = step( 0.5, fract( a * 9.549 + uTime * 0.8 ) ) * smoothstep( 0.012, 0.0, abs( r - 0.43 ) - 0.012 );
          c += vec3( 0.2, 0.85, 1.0 ) * ticks * 0.9;
          // the eyes, blinking now and then (shut for a moment every few seconds)
          float e = eye( p, vec2( -0.13, 0.0 ) ) + eye( p, vec2( 0.13, 0.0 ) );
          e *= 1.0 - step( 0.975, fract( uTime * 0.23 ) );
          c += vec3( 1.0, 0.12, 0.05 ) * e * ( 2.2 + 1.5 * uPulse ) + vec3( 1.0, 0.7, 0.6 ) * pow( e, 6.0 ) * 1.5;
          gl_FragColor = vec4( c * 1.25, 1.0 );
        }`,
    }));
    screen.position.set(X, Y, WALL + D + 0.03); this.group.add(screen);
    const glassCap = new THREE.Mesh(new THREE.CircleGeometry(R * 0.9, 64), new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 1, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false }));
    glassCap.position.set(X, Y, WALL + D + 0.05); this.group.add(glassCap);
    // the tubes: sleeved, from the pump's right side, curving up to the radiator in the roof
    const sleeve = new THREE.MeshStandardMaterial({ map: braidTex(), roughness: 0.6, metalness: 0.2 });
    for (const [dy, z2] of [[0.7, 0.4], [-0.7, 1.6]]) {
      const pts = [[X + R * 0.9, Y + dy, WALL + 1.0], [X + R + 1.2, Y + dy, WALL + 1.2], [X + R + 2.2, Y + dy + 2.5, WALL + 1.6 + z2 * 0.3], [X + R + 2.6, ROOF - 5, WALL + 1.8 + z2], [X + R + 4.5, ROOF - 1.0, WALL + 2 + z2]].map((p) => new THREE.Vector3(...p));
      const tb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.42, 14), sleeve); tb.castShadow = true; this.group.add(tb);
      const fit = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 20), new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 1, roughness: 0.25 })); fit.rotation.z = Math.PI / 2; fit.position.set(X + R * 0.95, Y + dy, WALL + 1.0); this.group.add(fit);
    }
  }

  // ------------------------------------------------------------------ the memory
  // four modules in their slots to the right of the pump, standing out from the board, their RGB bars facing the glass
  buildMemory() {
    const boardM = new THREE.MeshStandardMaterial({ map: ramBoardTex(), roughness: 0.5, metalness: 0.2 });
    const sprM = new THREE.MeshStandardMaterial({ map: spreaderTex(), roughness: 0.38, metalness: 0.85 });
    const slotM = new THREE.MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.55 });
    const latchM = new THREE.MeshStandardMaterial({ color: 0x2a2c32, roughness: 0.5 });
    const Y0 = 2.05, Hm = 8.0, out = 2.4;
    for (let i = 0; i < 4; i++) {
      const x = 0.4 + i * 0.6;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.4, Hm + 1.0, 0.45), slotM); slot.position.set(x, Y0 + Hm / 2, WALL + 0.22); this.group.add(slot);
      for (const sy of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.8), latchM); l.position.set(x, Y0 + Hm / 2 + sy * (Hm / 2 + 0.4), WALL + 0.45); this.group.add(l); }
      // (the module: its board out from the slot, the heat spreaders either side, the light bar along its outer edge)
      const g = new THREE.Group(); g.position.set(x, Y0 + Hm / 2, WALL + 0.45 + out / 2);
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.08, Hm, out), boardM); g.add(pcb);
      for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.11, Hm - 0.2, out * 0.86), sprM); s.position.set(sx * 0.1, 0, -out * 0.05); s.castShadow = true; g.add(s); }
      // (the light bar: its colour running up it)
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, Hm - 0.3, 0.36));
      bar.position.z = out / 2 + 0.1; g.add(bar);
      bar.material = new THREE.ShaderMaterial({ uniforms: this.rgbU, fog: false,
        vertexShader: 'varying vec3 vW; void main() { vW = ( modelMatrix * vec4( position, 1.0 ) ).xyz; gl_Position = projectionMatrix * viewMatrix * vec4( vW, 1.0 ); }',
        fragmentShader: `varying vec3 vW; uniform float uTime, uPulse; ${HSV_GLSL} void main() { gl_FragColor = vec4( hsv( fract( vW.y * 0.06 + ${(i * 0.03).toFixed(2)} - uTime * 0.2 ) ) * ( 1.5 + 0.8 * uPulse ), 1.0 ); }` });
      this.group.add(g);
    }
  }

  // ------------------------------------------------------------------ the power stage, the I/O cover
  buildPowerStage() {
    const finM = new THREE.MeshStandardMaterial({ map: finTex('RyC'), roughness: 0.35, metalness: 0.9 });
    const sideM = new THREE.MeshStandardMaterial({ color: 0x40454d, roughness: 0.35, metalness: 0.9 });
    // finned blocks round the processor: one to its left, one over it
    const left = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8.4, 1.6), [sideM, sideM, sideM, sideM, finM, sideM]); left.position.set(-8.6, 6.4, WALL + 0.8); left.castShadow = true; this.group.add(left);
    const top = new THREE.Mesh(new THREE.BoxGeometry(7.8, 2.2, 1.6), [sideM, sideM, sideM, sideM, finM, sideM]); top.position.set(-4.0, 10.4, WALL + 0.8); top.castShadow = true; this.group.add(top);
    // the rear I/O cover over the board's back edge, a strip of RGB down it
    const io = new THREE.Mesh(new THREE.BoxGeometry(2.0, 9.5, 2.4), new THREE.MeshStandardMaterial({ map: canvasTex(128, 512, (g, w, h) => { g.fillStyle = '#17191e'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 3; for (let y = -w; y < h; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.stroke(); } g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.fillStyle = 'rgba(220,226,236,0.8)'; g.font = '900 54px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RyC  ORIÓN', 0, 0); g.restore(); }), roughness: 0.4, metalness: 0.7 }));
    io.position.set(-10.6, 7.4, WALL + 1.2); io.castShadow = true; this.group.add(io);
    const iol = new THREE.Mesh(new THREE.BoxGeometry(0.08, 9.0, 0.08), this.rgbMat('line', { k: 0.05, off: 0.5 })); iol.position.set(-9.58, 7.4, WALL + 2.42); this.group.add(iol);
    // solid capacitors in rows along the power stage (aluminium cans, a coloured band)
    const can = new THREE.MeshStandardMaterial({ map: capSleeve('#3a1c66'), roughness: 0.3, metalness: 0.6 });
    const capT = new THREE.MeshStandardMaterial({ map: capTop(), roughness: 0.3, metalness: 1 });
    const geos = [], tops = [];
    for (let i = 0; i < 7; i++) { const c = new THREE.CylinderGeometry(0.32, 0.32, 0.75, 20, 1, true); c.rotateX(Math.PI / 2); c.translate(-6.9, 2.6 + i * 0.95, WALL + 0.38); geos.push(c); const t = new THREE.CircleGeometry(0.32, 20); t.translate(-6.9, 2.6 + i * 0.95, WALL + 0.76); tops.push(t); }
    for (let i = 0; i < 6; i++) { const c = new THREE.CylinderGeometry(0.32, 0.32, 0.75, 20, 1, true); c.rotateX(Math.PI / 2); c.translate(-7.6 + i * 0.95, 8.7, WALL + 0.38); geos.push(c); const t = new THREE.CircleGeometry(0.32, 20); t.translate(-7.6 + i * 0.95, 8.7, WALL + 0.76); tops.push(t); }
    const cm = new THREE.Mesh(bake(geos), can); cm.castShadow = true; this.group.add(cm);
    this.group.add(new THREE.Mesh(bake(tops), capT));
    // chokes: grey square blocks beside them
    const chokeG = [];
    for (let i = 0; i < 6; i++) { const b = new THREE.BoxGeometry(0.7, 0.7, 0.6); b.translate(-7.7, 2.8 + i * 1.1, WALL + 0.3); chokeG.push(b); }
    const ch = new THREE.Mesh(bake(chokeG), new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.6, metalness: 0.4 })); ch.castShadow = true; this.group.add(ch);
  }

  // ------------------------------------------------------------------ the connectors and their cables
  buildConnectors() {
    const sleeve = new THREE.MeshStandardMaterial({ map: braidTex(), roughness: 0.6, metalness: 0.2 });
    const plug = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.5 });
    // the 24-pin at the board's right edge: a fat bundle of sleeved wires curving into the grommet of the tray
    const x24 = BOARD.x1 - 0.5;
    const p24 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.2, 1.2), plug); p24.position.set(x24, 6.5, WALL + 0.6); this.group.add(p24);
    for (let k = 0; k < 6; k++) {
      const y = 4.8 + k * 0.68;
      const pts = [[x24 + 0.2, y, WALL + 1.2], [x24 + 0.9, y, WALL + 2.0], [this.grommets[0][0] - 0.8, 6.5 + (y - 6.5) * 0.4, WALL + 1.6], [this.grommets[0][0], 6.5 + (y - 6.5) * 0.3, WALL - 0.6]].map((p) => new THREE.Vector3(...p));
      const c = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.2, 8), sleeve); c.castShadow = true; this.group.add(c);
    }
    // the 8-pin of the processor at the top left, its cable going up and back through the roof's corner
    const p8 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.0), plug); p8.position.set(-9.2, 11.7, WALL + 0.5); this.group.add(p8);
    for (let k = 0; k < 3; k++) {
      const pts = [[-9.8 + k * 0.6, 12.1, WALL + 0.6], [-9.8 + k * 0.6, 13.5, WALL + 1.2], [-10.5 + k * 0.4, ROOF - 1.5, WALL + 0.6], [-11 + k * 0.4, ROOF, WALL - 0.5]].map((p) => new THREE.Vector3(...p));
      const c = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.22, 8), sleeve); this.group.add(c);
    }
    // the card's own power cable: from its far end, a bend, down through the lower grommet
    const pg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.9), plug); pg.position.set(CARD.x1 - 1.6, 0.25, CARD.z1 - 1.0); this.group.add(pg);
    for (let k = 0; k < 3; k++) {
      const pts = [[CARD.x1 - 2.1 + k * 0.5, 0.5, CARD.z1 - 1.0], [CARD.x1 - 1.6 + k * 0.4, 2.2, CARD.z1 - 1.6], [this.grommets[1][0] - 0.5, 1.0, WALL + 0.6], [this.grommets[1][0], -1.5 + k * 0.4, WALL - 0.6]].map((p) => new THREE.Vector3(...p));
      const c = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.21, 8), sleeve); c.castShadow = true; this.group.add(c);
    }
  }

  // ------------------------------------------------------------------ the fans
  buildFans() {
    const spin = [];
    // three big intake fans down the front, facing in
    for (const y of [-5.2, 3.4, 12.0]) {
      const f = this.makeFan(3.9, { blades: 9 }); f.g.position.set(FRONT - 0.6, y, 2.6); f.g.rotation.y = -Math.PI / 2; this.group.add(f.g); spin.push([f, 1.9]);
    }
    // the exhaust at the back, high
    const ex = this.makeFan(3.4, { blades: 9 }); ex.g.position.set(REAR + 0.6, 9.5, -0.2); ex.g.rotation.y = Math.PI / 2; this.group.add(ex.g); spin.push([ex, -1.7]);
    // the radiator in the roof: its fins, two fans under it, facing down
    const rad = new THREE.Mesh(new THREE.BoxGeometry(17, 1.6, 7.2), [new THREE.MeshStandardMaterial({ color: 0x15171b }), new THREE.MeshStandardMaterial({ color: 0x15171b }), new THREE.MeshStandardMaterial({ color: 0x15171b }), new THREE.MeshStandardMaterial({ map: finTex(null), roughness: 0.4, metalness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x15171b }), new THREE.MeshStandardMaterial({ color: 0x15171b })]);
    rad.position.set(-0.5, ROOF - 0.9, 2.2); this.group.add(rad);
    for (const x of [-4.6, 3.6]) { const f = this.makeFan(3.6, { blades: 9 }); f.g.position.set(x, ROOF - 2.3, 2.2); f.g.rotation.x = Math.PI / 2; this.group.add(f.g); spin.push([f, 1.5]); }
    this.animated.push((dt) => { for (const [f, s] of spin) f.rot.rotation.z += dt * s; });
  }

  // beyond the glass: the room, dark, out of focus
  buildRoom() {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(260, 130), new THREE.MeshBasicMaterial({ map: roomTex(), fog: false }));
    p.position.set(0, 10, 90); p.rotation.y = Math.PI; this.group.add(p);
  }

  // dust floating in the case's light: small soft motes drifting slowly, moved by the GPU
  buildDust() {
    const N = this.low ? 120 : 260;
    const pos = new Float32Array(N * 3), sd = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([rnd(REAR, FRONT), rnd(-2, ROOF - 1), rnd(WALL + 0.3, GLASS - 0.5)], i * 3); sd[i] = rand(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const U = { uTime: this.rgbU.uTime, uViewH: { value: 800 } };
    const m = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime, uViewH; varying float vA;
        void main() {
          vec3 p = position + vec3( sin( uTime * 0.11 + aSeed * 40.0 ), sin( uTime * 0.07 + aSeed * 23.0 ) * 0.6 + uTime * 0.03, cos( uTime * 0.09 + aSeed * 31.0 ) ) * 0.8;
          p.y = mod( p.y + 2.0, ${(ROOF + 1).toFixed(1)} ) - 2.0;
          vec4 mv = modelViewMatrix * vec4( p, 1.0 );
          gl_PointSize = ( 0.02 + aSeed * 0.03 ) * projectionMatrix[ 1 ][ 1 ] * uViewH * 0.5 / -mv.z;
          vA = ( 0.1 + 0.2 * aSeed ) * smoothstep( 3.0, 8.0, -mv.z );
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'varying float vA; void main() { float d = length( gl_PointCoord - 0.5 ); gl_FragColor = vec4( vec3( 0.85, 0.9, 1.0 ), ( 1.0 - smoothstep( 0.1, 0.5, d ) ) * vA ); }',
    });
    const pts = new THREE.Points(geo, m); pts.frustumCulled = false; this.group.add(pts);
    const v2 = new THREE.Vector2();
    this.animated.push(() => { U.uViewH.value = this.renderer.getDrawingBufferSize(v2).y; });
  }

  bakeEnvironment() {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.1, 400, cubeRT);
    cc.position.set(0, 1.4, 0); this.scene.add(cc);
    const fog = this.scene.fog; this.scene.fog = null;
    cc.update(this.renderer, this.scene);
    this.scene.fog = fog; this.scene.remove(cc);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromCubemap(cubeRT.texture).texture;
    this.scene.environmentIntensity = 0.85;
    pm.dispose(); cubeRT.dispose();
  }
  update(dt, camera) {
    this.t += dt; this.cameraPos = camera.position;
    this.rgbU.uTime.value += dt; this.rgbU.uPulse.value = this.pulse();
    for (const f of this.animated) f(dt);
  }
  dispose() { this.scene.remove(this.group); }
}
