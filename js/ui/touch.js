// On-screen controls for phones and tablets (landscape), after the layouts of mobile fighters (Street Fighter IV
// Champion Edition) and the Xbox touch-control guidelines:
//  - movement: a floating 8-way stick on the left half of the screen. It spawns under the thumb, follows it only
//    on a big overshoot (so flicks for dashes and sidesteps return to neutral where they started), uses a radial
//    dead zone and 45 degree sectors with hysteresis so diagonals (crouch block, df+2) hold steady. A fixed stick
//    is available in the options.
//  - attacks: the four limb buttons in the Tekken arcade layout (1 2 / 3 4) tilted to the right thumb's arc.
//    The gaps between neighbours are chord zones (1+2, 3+4, 1+3, 2+4) and a thumb can slide across buttons.
//  - ★ PUÑO and ★ PATADA, a third column (as Street Fighter 6's modern controls: one special button plus a direction):
//    each throws one of the fighter's specials picked by the stick (at rest, forward, back or down: his style's
//    touchSP), typing its command for him over a few frames (a macro: the fight reads it as his own input, recorded
//    and sent online like any other). The button shows the name of the blow the stick picks right now. Optional
//    (OPCIONES: 4 or 6 buttons).
//  - RAGE ART button (1+2+3+4) that only shows while rage is available; pause button under the timer.
//  - BLOQUEO (a shield, left of the cluster, under the thumb's inner reach): held, the guard; pressed just before a
//    blow lands, a parry (js/fight/match.js applyParry).
//  - hit areas larger than the art, feedback on every press, haptic tick where the platform supports it.
import { B1, B2, B3, B4, BLOCK } from '../fight/input.js';
import { haptic, setHaptics, viewSize } from '../engine/device.js';

// (dx, dy) of the eight 45 degree sectors, counter-clockwise from "right"; dy = +1 is up
const SECT = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BTN = [B1, B2, B3, B4];
const PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3]]; // chords: 1+2, 3+4, 1+3, 2+4
// the ★ buttons' own bits in a pointer's mask (never sent to the fight: they start a macro)
const SP_P = 1 << 10, SP_K = 1 << 11, SPB = [SP_P, SP_K];
const DIRB = { 1: B1, 2: B2, 3: B3, 4: B4 };
// short names for the ★ buttons' live label (the move list keeps the full ones)
const SHORT = {
  'Tattoo rush': 'COMBO TATUADO', 'Superman punch': 'SUPERMAN', 'Body blow': 'AL CUERPO', 'Uppercut': 'GANCHO', 'Spinning back kick': 'GIRATORIA',
  'Flying knee': 'RODILLAZO', 'Switch kick': 'CAMBIO', 'Sweep': 'BARRIDO', 'Headbutt': 'CABEZAZO', 'Carga de hombro': 'HOMBRO', 'Hammer fist': 'MARTILLO',
  'Patada hacha': 'HACHA', 'Slide tackle': 'PLANCHA', 'High kick': 'PATADA ALTA', 'Back fist': 'REVÉS', 'Llegada a meta': 'META', 'Flying kick': 'VOLADORA',
  'Sprint kick': 'CARRERA', 'Patada de vallista': 'VALLISTA', 'Belly bump': 'PANZAZO', 'Overhand smash': 'MAZAZO', 'Palmada de orejas': 'OREJAS',
  'Pisotón': 'PISOTÓN', 'Jump kick': 'SALTO', 'Lariat': 'LARIAT', 'Double axe handle': 'HACHAZO', 'Chop': 'CHOP', 'Big boot': 'BIG BOOT',
  'Palma hidráulica': 'PISTÓN', 'Patada hidráulica': 'LATERAL', 'Slap': 'GUANTAZO', 'Overhand': 'OVERHAND', 'Liver hook': 'HÍGADO', 'Gazelle punch': 'GACELA',
  'Front kick': 'FRONTAL', 'Botón del pánico': 'PÁNICO', 'Verificación': 'VERIFICACIÓN', 'Aviso de intrusión': 'INTRUSIÓN', 'Zona perimetral': 'PERÍMETRO', 'Detector de presencia': 'DETECTOR',
};
export const shortName = (n) => SHORT[n] || String(n).toUpperCase();
// the frames that type a command ("f+2", "df+2", "1+2", "f,f+4", "uf+4") for the fighter: [fwd, up, buttons, frames]
// (fwd: +1 towards the opponent). A first frame with no button lets go of anything still held from the last one;
// the stick's direction leads the press (a crouch command crouches first), as a player's thumb does
export function macroFor(cmd) {
  const out = [];
  let c = cmd;
  if (c.startsWith('f,f')) { out.push([1, 0, 0, 2], [0, 0, 0, 2]); c = 'f' + c.slice(3); }
  let fwd = 0, up = 0, btn = 0;
  for (const t of c.split('+')) {
    if (t === 'f') fwd = 1; else if (t === 'b') fwd = -1; else if (t === 'd') up = -1; else if (t === 'u') up = 1;
    else if (t === 'df') { fwd = 1; up = -1; } else if (t === 'db') { fwd = -1; up = -1; } else if (t === 'uf') { fwd = 1; up = 1; } else if (t === 'ub') { fwd = -1; up = 1; }
    else if (DIRB[t]) btn |= DIRB[t];
  }
  out.push([fwd, up, 0, up < 0 ? 2 : 1]);
  out.push([fwd, up, btn, 4]);
  return out;
}
const TAU = Math.PI * 2;

export const TOUCH_DEFAULTS = { size: 1, opacity: 0.85, stick: 'float', haptics: true, show: 'auto', specials: true };

export function loadTouchPrefs() {
  try { return { ...TOUCH_DEFAULTS, ...JSON.parse(localStorage.getItem('pdb_touch') || '{}') }; } catch (e) { return { ...TOUCH_DEFAULTS }; }
}
export function saveTouchPrefs(p) { try { localStorage.setItem('pdb_touch', JSON.stringify(p)); } catch (e) { /* private mode */ } }

export class TouchController {
  constructor(root) {
    this.root = root;
    this.opt = loadTouchPrefs();
    setHaptics(this.opt.haptics);
    this.dx = 0; this.dy = 0; this.held = 0; this.prev = 0;
    this.rageT = 0; this.rageReady = false; this.tapT = 0;
    this.enabled = false;
    this.ptr = new Map(); // pointerId -> { kind, mask }
    this.stick = { id: null, ox: 0, oy: 0, sector: -1 };
    // ★ buttons: what they throw (set by the game: sp(group, cls) -> { cmd, name, fwd } of the player's fighter) and
    // the macro being typed: [{ dx, dy, held, n }]
    this.sp = null; this.macro = null; this.spCls = [null, null]; this.spHeld = 0;
    this.build();
    addEventListener('resize', () => this.layout());
    addEventListener('orientationchange', () => setTimeout(() => this.layout(), 350));
  }

  // ------------------------------------------------------------------ DOM
  build() {
    const r = this.root;
    r.innerHTML = `
      <div class="tzone"></div>
      <div class="tstick"><div class="ring">${SECT.map((_, i) => `<i class="d d${i}"></i>`).join('')}</div><div class="knob"></div></div>
      <div class="tbtns">
        ${['1', '2', '3', '4'].map((n, i) => `<div class="tb b${n} ${i < 2 ? 'pu' : 'ki'}"><b>${n}</b><small>${i < 2 ? 'PUÑO' : 'PATADA'}</small></div>`).join('')}
        <div class="tb sp pu"><b>★</b><small>PUÑO</small><em></em></div>
        <div class="tb sp ki"><b>★</b><small>PATADA</small><em></em></div>
        ${PAIRS.map(([a, b]) => `<i class="tch c${a + 1}${b + 1}"></i>`).join('')}
      </div>
      <div class="trage"><b>RAGE</b><small>ART</small></div>
      <div class="tblk"><i></i><small>BLOQUEO</small></div>
      <button class="tpause" id="touchPause" aria-label="Pausa"><i></i><i></i></button>`;
    this.el = {
      zone: r.querySelector('.tzone'), stick: r.querySelector('.tstick'), knob: r.querySelector('.knob'),
      dirs: [...r.querySelectorAll('.ring .d')], btns: r.querySelector('.tbtns'), tb: [...r.querySelectorAll('.tb:not(.sp)')],
      sp: [...r.querySelectorAll('.tb.sp')], spLab: [...r.querySelectorAll('.tb.sp em')],
      chords: [...r.querySelectorAll('.tch')], rage: r.querySelector('.trage'), pause: r.querySelector('.tpause'), blk: r.querySelector('.tblk'),
    };
    const onDown = (kind) => (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      this.ptr.set(e.pointerId, { kind, mask: 0 });
      if (kind === 'stick') this.stickDown(e);
      else if (kind === 'btns') this.btnsMove(e);
      else if (kind === 'rage') { this.rageT = 5; haptic(30); this.el.rage.classList.add('down'); }
      else if (kind === 'block') { haptic(12); this.el.blk.classList.add('down'); }
    };
    const onMove = (e) => {
      const p = this.ptr.get(e.pointerId); if (!p) return;
      e.preventDefault();
      if (p.kind === 'stick') this.stickMove(e);
      else if (p.kind === 'btns') this.btnsMove(e);
    };
    const onUp = (e) => {
      const p = this.ptr.get(e.pointerId); if (!p) return;
      this.ptr.delete(e.pointerId);
      if (p.kind === 'stick') this.stickUp();
      else if (p.kind === 'rage') this.el.rage.classList.remove('down');
      else if (p.kind === 'block' && ![...this.ptr.values()].some((q) => q.kind === 'block')) this.el.blk.classList.remove('down');
      this.recomputeButtons();
    };
    for (const [el, kind] of [[this.el.zone, 'stick'], [this.el.btns, 'btns'], [this.el.rage, 'rage'], [this.el.blk, 'block']]) {
      el.addEventListener('pointerdown', onDown(kind));
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('lostpointercapture', onUp);
      // iOS: cancelling the touch keeps Safari from reading two thumbs as a pinch zoom or quick presses as a double
      // tap zoom (which also cancelled the pointers mid-move); pointer events keep flowing
      el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
      el.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    }
    // no long-press menus, text selection or double-tap zoom anywhere on the controls
    r.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  applyPrefs() {
    this.root.style.setProperty('--tk-alpha', this.opt.opacity);
    this.root.classList.toggle('sp6', this.opt.specials !== false);
    this.root.classList.toggle('fixed', this.opt.stick === 'fixed');
    setHaptics(this.opt.haptics);
    this.layout();
  }

  // sizes follow the short side of the screen (thumb reach is physical, the screen is not)
  layout() {
    const { w: W, h: H } = viewSize();
    this.W = W; this.H = H;
    const s = this.safe();
    const six = this.opt.specials !== false;
    // (six buttons: a little smaller, so that the three columns stay within the thumb's sweep)
    const rb = Math.max(26, Math.min(44, Math.min(W, H) * (six ? 0.08 : 0.086))) * this.opt.size; // button radius
    const R = rb * 1.85; // stick radius
    this.rb = rb; this.R = R;
    const st = this.root.style;
    st.setProperty('--rb', `${rb}px`); st.setProperty('--R', `${R}px`);
    // cluster: bottom right, inside the safe area
    const m = Math.min(W, H) * 0.045;
    // spacing; the rows rise to the right (the thumb's arc), a little less across three columns
    const sp = rb * (six ? 2.1 : 2.16), tilt = six ? -0.2 : -0.28;
    // 1 2 / 3 4, and with the ★ buttons a third column on the right: ★ PUÑO over ★ PATADA (the right edge is
    // where the thumb rests: the specials are under it without stretching, the limbs a short reach inwards)
    const base = six ? [[-1, -0.5], [0, -0.5], [-1, 0.5], [0, 0.5], [1, -0.5], [1, 0.5]] : [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
    this.bpos = base.map(([x, y]) => {
      const X = x * sp, Y = y * sp;
      return [X * Math.cos(tilt) - Y * Math.sin(tilt), X * Math.sin(tilt) + Y * Math.cos(tilt)];
    });
    // the cluster in the bottom right corner, every button inside the safe area: placed by its real (tilted)
    // extent (the three columns tilted put the lower left button below the screen's edge when placed by its centre)
    if (six) {
      const ex = Math.max(...this.bpos.map((q) => q[0])) + rb, ey = Math.max(...this.bpos.map((q) => q[1])) + rb;
      this.cx = W - s.r - m - ex; this.cy = H - s.b - m * 0.7 - ey;
    } else { this.cx = W - s.r - m - rb * 2.3; this.cy = H - s.b - m - rb * 2.2; }
    // the cluster's capture area is a generous box around the buttons
    const pad = rb * 1.05, xs = this.bpos.map(p => p[0]), ys = this.bpos.map(p => p[1]);
    const bx0 = Math.min(...xs) - rb - pad, bx1 = Math.max(...xs) + rb + pad, by0 = Math.min(...ys) - rb - pad, by1 = Math.max(...ys) + rb + pad;
    Object.assign(this.el.btns.style, { left: `${this.cx + bx0}px`, top: `${this.cy + by0}px`, width: `${bx1 - bx0}px`, height: `${by1 - by0}px` });
    this.box = { x0: this.cx + bx0, y0: this.cy + by0 };
    this.el.tb.forEach((b, i) => { b.style.left = `${this.bpos[i][0] - bx0 - rb}px`; b.style.top = `${this.bpos[i][1] - by0 - rb}px`; });
    this.el.sp.forEach((b, k) => { const q = this.bpos[4 + k]; b.hidden = !q; if (q) { b.style.left = `${q[0] - bx0 - rb}px`; b.style.top = `${q[1] - by0 - rb}px`; } });
    this.el.chords.forEach((c, k) => {
      const [a, b] = PAIRS[k]; const x = (this.bpos[a][0] + this.bpos[b][0]) / 2, y = (this.bpos[a][1] + this.bpos[b][1]) / 2;
      c.style.left = `${x - bx0}px`; c.style.top = `${y - by0}px`;
    });
    // rage art: up and left of the cluster, where the thumb reaches by stretching
    const rr = rb * 0.82;
    Object.assign(this.el.rage.style, { left: `${this.cx + this.bpos[0][0] - rb * 1.6 - rr}px`, top: `${this.cy + this.bpos[0][1] - rb * 1.9 - rr}px`, width: `${rr * 2}px`, height: `${rr * 2}px` });
    // block: a shield left of the cluster, low, where the right thumb reaches inwards
    const br = rb * 0.92;
    Object.assign(this.el.blk.style, { left: `${this.cx + this.bpos[2][0] - rb * 2.55 - br}px`, top: `${this.cy + this.bpos[2][1] + rb * 0.25 - br}px`, width: `${br * 2}px`, height: `${br * 2.1}px` });
    // stick: rest position bottom left; the capture zone is the left half below the health bars
    this.rest = { x: s.l + m + R * 1.25, y: H - s.b - m - R * 1.2 };
    Object.assign(this.el.zone.style, { left: '0px', top: `${Math.round(H * 0.2)}px`, width: `${Math.round(W * 0.48)}px`, height: `${H - Math.round(H * 0.2)}px` });
    if (this.stick.id === null) this.placeStick(this.rest.x, this.rest.y);
    this.el.pause.style.top = `${s.t + Math.min(W, H) * 0.155}px`;
  }
  safe() {
    // env() is only readable through layout: probe it
    if (!this._probe) { this._probe = document.createElement('div'); this._probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(this._probe); }
    const cs = getComputedStyle(this._probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  placeStick(x, y) {
    this.stick.ox = x; this.stick.oy = y;
    this.el.stick.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ------------------------------------------------------------------ stick
  stickDown(e) {
    const S = this.stick;
    S.id = e.pointerId; S.sector = -1;
    if (this.opt.stick === 'float') {
      // spawn under the thumb, kept fully on screen
      const R = this.R, x = Math.max(R + 6, Math.min(this.W * 0.48 - R, e.clientX)), y = Math.max(this.H * 0.2 + R * 0.6, Math.min(this.H - R - 4, e.clientY));
      this.placeStick(x, y);
    }
    this.el.stick.classList.add('active');
    this.stickMove(e);
  }
  stickMove(e) {
    const S = this.stick, R = this.R;
    let vx = e.clientX - S.ox, vy = e.clientY - S.oy;
    let d = Math.hypot(vx, vy);
    // follow only on a big overshoot, so a flick returns to neutral where it started
    if (this.opt.stick === 'float' && d > R * 1.45) {
      const k = 1 - (R * 1.45) / d;
      this.placeStick(S.ox + vx * k, S.oy + vy * k);
      vx = e.clientX - S.ox; vy = e.clientY - S.oy; d = Math.hypot(vx, vy);
    }
    const kd = Math.min(1, d / R);
    this.el.knob.style.transform = `translate(${d > 0 ? vx / d * kd * R : 0}px, ${d > 0 ? vy / d * kd * R : 0}px)`;
    // radial dead zone with hysteresis (engages at 28% of the radius, releases under 20%)
    const dead = R * (S.sector >= 0 ? 0.2 : 0.28);
    if (d < dead) { this.setDir(-1); return; }
    const ang = Math.atan2(-vy, vx);
    let sec = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    if (S.sector >= 0 && sec !== S.sector) {
      // keep the current sector until the thumb is clearly (7 degrees) past its boundary
      const da = Math.abs(((ang - S.sector * Math.PI / 4) % TAU + TAU * 1.5) % TAU - Math.PI);
      if (da < Math.PI / 8 + 0.12) sec = S.sector;
    }
    this.setDir(sec);
  }
  stickUp() {
    this.stick.id = null;
    this.setDir(-1);
    this.el.knob.style.transform = '';
    this.el.stick.classList.remove('active');
    if (this.opt.stick === 'float') this.placeStick(this.rest.x, this.rest.y);
  }
  setDir(sec) {
    const S = this.stick;
    if (sec === S.sector) return;
    if (S.sector >= 0) this.el.dirs[S.sector].classList.remove('on');
    S.sector = sec;
    if (sec >= 0) { this.el.dirs[sec].classList.add('on'); [this.dx, this.dy] = SECT[sec]; }
    else { this.dx = 0; this.dy = 0; }
    this.refreshSP();
  }

  // ------------------------------------------------------------------ ★ buttons
  // the stick as the fighter reads it: at rest, forward, back, down (any of the three downs) or up
  spClass() {
    const f = this.sp?.('P', 'n')?.fwd ?? 1;
    const fwd = this.dx * f;
    return this.dy < 0 ? 'd' : this.dy > 0 ? 'u' : fwd > 0 ? 'f' : fwd < 0 ? 'b' : 'n';
  }
  // the names on the ★ buttons follow the stick (and the side the fighter is on); written only when they change
  refreshSP() {
    if (!this.sp || this.opt.specials === false) return;
    const cls = this.spClass();
    ['P', 'K'].forEach((g, k) => {
      const info = this.sp(g, cls), name = info ? shortName(info.name) : '';
      if (name === this.spCls[k]) return;
      this.spCls[k] = name;
      const el = this.el.spLab[k];
      el.textContent = name;
      el.classList.toggle('long', name.length > 8);
      // (a short flash as the blow it throws changes)
      this.el.sp[k].classList.remove('swap'); void this.el.sp[k].offsetWidth; this.el.sp[k].classList.add('swap');
    });
  }
  special(k) {
    const info = this.sp?.(k ? 'K' : 'P', this.spClass());
    if (!info) return;
    haptic(18);
    this.macro = macroFor(info.cmd).map(([fwd, up, btn, n]) => ({ dx: fwd * info.fwd, dy: up, held: btn, n }));
  }

  // ------------------------------------------------------------------ buttons
  btnsMove(e) {
    const p = this.ptr.get(e.pointerId); if (!p) return;
    const x = e.clientX - this.cx, y = e.clientY - this.cy, rb = this.rb;
    let mask = 0;
    // chord zones: the gap between two neighbours presses both
    for (const [a, b] of PAIRS) {
      const mx = (this.bpos[a][0] + this.bpos[b][0]) / 2, my = (this.bpos[a][1] + this.bpos[b][1]) / 2;
      if (Math.hypot(x - mx, y - my) < rb * 0.45) { mask = BTN[a] | BTN[b]; break; }
    }
    if (!mask) {
      let best = -1, bd = 1e9;
      this.bpos.forEach(([bx, by], i) => { const d = Math.hypot(x - bx, y - by); if (d < bd) { bd = d; best = i; } });
      if (bd < rb * 1.45) mask = best < 4 ? BTN[best] : SPB[best - 4];
    }
    p.mask = mask;
    this.recomputeButtons();
  }
  recomputeButtons() {
    let all = 0;
    for (const p of this.ptr.values()) if (p.kind === 'btns') all |= p.mask;
    const held = all & (B1 | B2 | B3 | B4), sp = all & (SP_P | SP_K);
    const fresh = held & ~this.held, spFresh = sp & ~this.spHeld;
    if (fresh) haptic(10);
    this.held = held; this.spHeld = sp;
    // a ★ pressed: its special, for the stick as it is now
    if (spFresh) this.special(spFresh & SP_P ? 0 : 1);
    this.el.tb.forEach((b, i) => b.classList.toggle('down', !!(held & BTN[i])));
    this.el.sp.forEach((b, k) => b.classList.toggle('down', !!(sp & SPB[k])));
    this.el.chords.forEach((c, k) => { const [a, b] = PAIRS[k]; c.classList.toggle('on', (held & BTN[a]) && (held & BTN[b]) ? true : false); });
  }

  // ------------------------------------------------------------------ state
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.applyPrefs();
  }
  disable() {
    this.enabled = false;
    this.ptr.clear(); this.stickUp(); this.recomputeButtons(); this.rageT = 0; this.macro = null; this.el.blk.classList.remove('down');
    this.setVisible(false);
  }
  // shown only while fighting; dimmed during cinematics (a tap still skips the intro)
  setVisible(on, cine = false) {
    this.root.classList.toggle('on', on && this.enabled);
    this.root.classList.toggle('cine', !!cine);
    if (!on) { this.ptr.clear(); this.stickUp(); this.recomputeButtons(); this.macro = null; }
    else { this.spCls = [null, null]; this.refreshSP(); }
  }
  // a tap on the screen outside the controls (cinematics): one button press for the match to consume
  tap() { this.tapT = 2; }
  setRage(ready) {
    if (ready === this.rageReady) return;
    this.rageReady = ready;
    this.el.rage.classList.toggle('ready', ready);
  }
  poll() {
    let held = this.held, dx = this.dx, dy = this.dy;
    if (this.rageT > 0) { held |= B1 | B2 | B3 | B4; this.rageT--; }
    if (this.tapT > 0) { held |= B1; this.tapT--; }
    for (const p of this.ptr.values()) if (p.kind === 'block') held |= BLOCK;
    // a ★ special being typed: its direction instead of the stick's, its buttons on top of the thumb's
    const M = this.macro;
    if (M) {
      const q = M[0];
      dx = q.dx; dy = q.dy; held = (held & ~(B1 | B2 | B3 | B4)) | q.held;
      if (--q.n <= 0) M.shift();
      if (!M.length) this.macro = null;
    }
    const pressed = held & ~this.prev;
    this.prev = held;
    return { dx, dy, held, pressed };
  }
}
