// OPCIONES -> CONTROLES: each player's keys and the pad's buttons, changed by choosing a slot and pressing the new key
// or button. A key or button that already did something else swaps with the slot's old one (one key never does two
// things); every change is kept on the device at once (js/fight/input.js). Mouse, touch, keyboard and pad all work here.
import { KEYMAPS, PADMAP, ACTIONS, RESERVED_KEYS, RESERVED_BUTTONS, bindKey, bindButton, clearKey, clearButton, restoreControls,
  captureKey, keyLabel, buttonLabel, padStyle, freeKeys } from '../fight/input.js';

const $ = (s) => document.querySelector(s);
export const ACTION_NAMES = { left: 'Izquierda', right: 'Derecha', up: 'Arriba · saltar', down: 'Abajo · agacharse', b1: '1 · Puño izquierdo', b2: '2 · Puño derecho',
  b3: '3 · Patada izquierda', b4: '4 · Patada derecha', b12: '1+2', b34: '3+4', b13: '1+3 · Agarre', b24: '2+4 · Agarre', start: 'Pausa' };
// (a row left without any key is marked: the fighter can't do that)
const ESSENTIAL = new Set(['left', 'right', 'up', 'down', 'b1', 'b2', 'b3', 'b4']);
// the screen's two columns of actions
const LAYOUT = {
  keys: [['left', 'right', 'up', 'down', 'start'], ['b1', 'b2', 'b3', 'b4', 'b12', 'b34', 'b13', 'b24']],
  pad: [['b1', 'b2', 'b3', 'b4', 'start'], ['b12', 'b34', 'b13', 'b24']],
};
const TABS = [['p1', 'TECLADO · J1'], ['p2', 'TECLADO · J2'], ['pad', 'MANDO']];
const STYLE_NAMES = { ps: 'PlayStation', xbox: 'Xbox', nintendo: 'Nintendo' };
const PAD_WAIT = 10;   // seconds a slot waits for a pad button before giving up

const heldButtons = () => {
  const out = [];
  for (const g of navigator.getGamepads?.() || []) if (g) g.buttons.forEach((b, i) => { if (b.pressed && !out.includes(i)) out.push(i); });
  return out;
};
const whereKey = (code) => {
  for (const p of ['p1', 'p2']) for (const a of ACTIONS) { const i = KEYMAPS[p][a].indexOf(code); if (i >= 0) return [p, a, i]; }
  return null;
};
const whereButton = (btn) => {
  for (const a in PADMAP) { const i = PADMAP[a].indexOf(btn); if (i >= 0) return ['pad', a, i]; }
  return null;
};

export class ControlsUI {
  constructor(game) {
    this.game = game; this.open = false; this.tab = 'p1';
    // (a pad plugged in or out while the screen is up: its buttons' names and the note change at once)
    const redraw = () => { if (this.open && !this.wait) this.render(); };
    addEventListener('gamepadconnected', redraw);
    addEventListener('gamepaddisconnected', redraw);
  }

  // opens over the screen that called it (state 'overlay', or 'overlay-pause' over a paused fight); onClose goes back
  show(onClose, state = 'overlay') {
    const g = this.game;
    this.open = true; this.onClose = onClose; this.wait = null; this.flash = null; this.msg = null;
    this.cur = { zone: 'grid', g: 1, r: 0, s: 0, b: 1 };
    g.state = state;
    g.overlayCb = { ok: () => this.close(), back: () => this.close() };
    const panel = $('#overlay .panel');
    panel.innerHTML = `<div class="ctl"><h3>CONTROLES</h3><div class="ctl-tabs">${TABS.map(([id, l]) => `<button data-tab="${id}">${l}</button>`).join('')}</div>
      <div class="ctl-grid"></div><p class="note ctl-msg"></p>
      <div class="actions"><button data-a="restore"></button><button data-a="ok" class="primary">VOLVER</button></div></div>`;
    $('#overlay').onclick = null;
    $('#overlay').classList.add('on');
    panel.querySelectorAll('.ctl-tabs button').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); g.audio.play('ui'); this.cur.zone = 'tabs'; this.setTab(b.dataset.tab); }; });
    panel.querySelector('[data-a="restore"]').onclick = (e) => { e.stopPropagation(); this.restore(); };
    panel.querySelector('[data-a="ok"]').onclick = (e) => { e.stopPropagation(); g.audio.play('ui'); this.close(); };
    const grid = panel.querySelector('.ctl-grid');
    const at = (e) => { const b = e.target.closest('.slot'); return b && { zone: 'grid', g: +b.dataset.g, r: +b.dataset.r, s: +b.dataset.s, b: this.cur.b }; };
    grid.onclick = (e) => {
      const c = at(e); if (!c) return;
      e.stopPropagation();
      const same = this.wait && this.cur.zone === 'grid' && c.g === this.cur.g && c.r === this.cur.r && c.s === this.cur.s;
      this.cur = c;
      // (a second tap on the waiting slot gives up: a phone without a keyboard can't press Esc)
      if (same) this.cancelWait(); else this.startWait();
    };
    // (the mouse picks the slot under it when it really moves: the browser also sends a move to a still mouse when the
    // grid is drawn again under it, which would pull the keyboard's or the pad's choice back every time)
    grid.onpointermove = (e) => {
      if (e.pointerType !== 'mouse' || this.wait || (e.clientX === this.mx && e.clientY === this.my)) return;
      this.mx = e.clientX; this.my = e.clientY;
      const c = at(e);
      if (c && !(this.cur.zone === 'grid' && c.g === this.cur.g && c.r === this.cur.r && c.s === this.cur.s)) { this.cur = c; this.msg = null; this.mark(); }
    };
    this.render();
    panel.scrollTop = 0;
  }
  close() {
    if (!this.open) return;
    this.open = false; this.wait = null;
    captureKey(null);
    $('#overlay').classList.remove('on');
    this.onClose?.();
  }

  get pad() { return this.tab === 'pad'; }
  rows() { return LAYOUT[this.pad ? 'pad' : 'keys']; }
  action() { return this.rows()[this.cur.g][this.cur.r]; }
  map() { return this.pad ? PADMAP : KEYMAPS[this.tab]; }

  render() {
    const panel = $('#overlay .panel');
    this.style = padStyle();
    const map = this.map(), label = this.pad ? (i) => buttonLabel(i, this.style) : keyLabel;
    panel.querySelector('.ctl-grid').innerHTML = this.rows().map((rows, gi) => `<table><thead><tr><th></th><th>PRINCIPAL</th><th>ALTERNATIVA</th></tr></thead><tbody>${rows.map((a, r) => {
      const warn = ESSENTIAL.has(a) && map[a].every((x) => x === null);
      return `<tr><td class="${warn ? 'warn' : ''}">${ACTION_NAMES[a]}</td>${[0, 1].map((s) => {
        const v = map[a][s], w = this.wait && this.wait.a === a && this.wait.s === s, f = this.flash && this.flash.a === a && this.flash.s === s;
        const cls = `slot${v === null ? ' empty' : ''}${w ? ' wait' : ''}${f ? ' flash' : ''}`;
        return `<td><button class="${cls}" data-g="${gi}" data-r="${r}" data-s="${s}">${w ? (this.pad ? 'PULSA UN BOTÓN' : 'PULSA UNA TECLA') : label(v)}</button></td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table>`).join('');
    panel.querySelectorAll('.ctl-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    panel.querySelector('[data-a="restore"]').textContent = this.pad ? 'RESTAURAR MANDO' : 'RESTAURAR TECLADO';
    panel.querySelector('.ctl-msg').textContent = this.message();
    this.flash = null;
    this.mark();
  }
  // the element the keyboard / pad is on
  mark() {
    const panel = $('#overlay .panel'), c = this.cur;
    panel.querySelectorAll('.ctl .sel').forEach((e) => e.classList.remove('sel'));
    const el = c.zone === 'tabs' ? panel.querySelector(`.ctl-tabs [data-tab="${this.tab}"]`)
      : c.zone === 'btns' ? panel.querySelectorAll('.ctl .actions button')[c.b]
        : panel.querySelector(`.slot[data-g="${c.g}"][data-r="${c.r}"][data-s="${c.s}"]`);
    if (el) { el.classList.add('sel'); el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
  }
  message() {
    if (this.msg) return this.msg;
    const a = this.wait && `«${ACTION_NAMES[this.wait.a]}»`;
    if (this.wait?.kind === 'key') return `Pulsa la tecla para ${a} · Supr deja la casilla vacía · Esc cancela`;
    if (this.wait?.kind === 'pad') return `Pulsa el botón del mando para ${a} · la cruceta o Esc cancela`;
    if (this.pad) {
      return [...(navigator.getGamepads?.() || [])].some(Boolean)
        ? `Mando ${STYLE_NAMES[this.style]}: elige una casilla y pulsa el botón nuevo; si ya hacía otra cosa, se intercambian. La cruceta y el stick izquierdo mueven al luchador. El botón ${buttonLabel(3, this.style)} deja una casilla vacía.`
        : 'No se ve ningún mando: conéctalo y pulsa cualquiera de sus botones para que el navegador lo detecte.';
    }
    return 'Elige una casilla y pulsa la tecla nueva; si ya hacía otra cosa, se intercambian. Supr borra una casilla. Esc siempre pausa y vuelve atrás.';
  }

  // ------------------------------------------------------------------ changing a slot
  startWait() {
    const pad = this.pad;
    this.wait = { kind: pad ? 'pad' : 'key', a: this.action(), s: this.cur.s, t0: performance.now(), base: new Set(heldButtons()) };
    this.msg = null;
    captureKey((code) => this.onKey(code));
    this.game.audio.play('uiok');
    this.render();
  }
  cancelWait() {
    this.wait = null; this.msg = null;
    captureKey(null);
    this.game.audio.play('ui');
    this.render();
  }
  onKey(code) {
    const w = this.wait;
    if (!w || !this.open) return;
    if (code === 'Escape') { this.cancelWait(); return; }
    if (code === 'Delete') { this.clear(w.a, w.s); return; }
    // (waiting for a pad button only Esc and Supr mean something on the keyboard)
    if (w.kind === 'pad') { captureKey((c) => this.onKey(c)); return; }
    if (RESERVED_KEYS.has(code)) {
      this.msg = `«${keyLabel(code)}» está reservada: elige otra tecla (Esc cancela)`;
      captureKey((c) => this.onKey(c));
      this.render();
      return;
    }
    this.assign(code);
  }
  // what a frame of pad input does while a slot waits (keys come through onKey)
  waitInput(pads) {
    const w = this.wait;
    if (w.kind === 'key') { if (pads[0].back || pads[1].back) this.cancelWait(); return; }
    const held = heldButtons();
    // (the button that opened the slot counts once it has been let go and pressed again)
    for (const i of [...w.base]) if (!held.includes(i)) w.base.delete(i);
    const fresh = held.filter((i) => !w.base.has(i));
    if (fresh.some((i) => i >= 12 && i <= 15)) { this.cancelWait(); return; }
    const btn = fresh.find((i) => !RESERVED_BUTTONS.has(i));
    if (btn !== undefined) this.assign(btn);
    else if (performance.now() - w.t0 > PAD_WAIT * 1000) this.cancelWait();
  }
  assign(v) {
    const { a, s } = this.wait, pad = this.pad, p = this.tab;
    const old = this.map()[a][s], from = pad ? whereButton(v) : whereKey(v);
    const label = pad ? (i) => buttonLabel(i, this.style) : keyLabel;
    if (pad) bindButton(a, s, v); else bindKey(p, a, s, v);
    this.wait = null;
    captureKey(null);
    this.flash = { a, s };
    if (from && !(from[0] === p && from[1] === a && from[2] === s)) {
      const who = from[0] !== p ? `${from[0] === 'p1' ? 'J1' : 'J2'} · ` : '';
      const was = old !== null ? `se queda con «${label(old)}»` : 'se queda sin ella';
      this.msg = `«${label(v)}» es ahora ${ACTION_NAMES[a]}; ${who}${ACTION_NAMES[from[1]]} ${was}.`;
    } else this.msg = `«${label(v)}» es ahora ${ACTION_NAMES[a]}.`;
    this.game.audio.play('uiok');
    this.render();
  }
  clear(a, s) {
    if (this.pad) clearButton(a, s); else clearKey(this.tab, a, s);
    this.wait = null;
    captureKey(null);
    this.msg = `${ACTION_NAMES[a]}: casilla vacía.`;
    this.game.audio.play('ui');
    this.render();
  }
  restore() {
    restoreControls(this.pad ? 'pad' : 'keys');
    this.wait = null;
    captureKey(null);
    this.msg = this.pad ? 'Los botones del mando vuelven a ser los de siempre.' : 'Las teclas de los dos jugadores vuelven a ser las de siempre.';
    this.game.audio.play('uiok');
    this.render();
  }
  setTab(t) {
    if (typeof t === 'number') { const i = TABS.findIndex(([id]) => id === this.tab); t = TABS[(i + t + TABS.length) % TABS.length][0]; }
    if (this.wait) { this.wait = null; captureKey(null); }
    this.tab = t; this.msg = null;
    const rows = this.rows(), c = this.cur;
    c.g = Math.min(c.g, rows.length - 1); c.r = Math.min(c.r, rows[c.g].length - 1);
    this.render();
  }

  // ------------------------------------------------------------------ keyboard / pad on the screen
  // (the two columns stand one above the other on a narrow screen: up and down then go from one to the other)
  stacked() { const t = $('#overlay .ctl-grid')?.children; return !!t && t.length > 1 && t[1].offsetTop > t[0].offsetTop + 10; }
  move(dx, dy) {
    const c = this.cur, rows = this.rows(), last = (g) => rows[g].length - 1;
    if (c.zone === 'tabs') {
      if (dx) { this.setTab(dx); this.game.audio.play('ui'); return; }
      if (dy > 0) { c.zone = 'grid'; c.r = 0; }
    } else if (c.zone === 'btns') {
      if (dx) c.b = (c.b + dx + 2) % 2;
      if (dy < 0) { c.zone = 'grid'; if (this.stacked()) c.g = rows.length - 1; c.r = last(c.g); }
    } else {
      const st = this.stacked();
      if (dx > 0) { if (c.s === 0) c.s = 1; else if (!st && c.g < rows.length - 1) { c.g++; c.s = 0; c.r = Math.min(c.r, last(c.g)); } }
      if (dx < 0) { if (c.s === 1) c.s = 0; else if (!st && c.g > 0) { c.g--; c.s = 1; c.r = Math.min(c.r, last(c.g)); } }
      if (dy < 0) { if (c.r > 0) c.r--; else if (st && c.g > 0) { c.g--; c.r = last(c.g); } else c.zone = 'tabs'; }
      if (dy > 0) { if (c.r < last(c.g)) c.r++; else if (st && c.g < rows.length - 1) { c.g++; c.r = 0; } else c.zone = 'btns'; }
    }
    this.msg = null;
    this.game.audio.play('ui');
    this.render();
  }
  activate() {
    const c = this.cur;
    if (c.zone === 'tabs') { c.zone = 'grid'; c.r = 0; this.game.audio.play('ui'); this.render(); }
    else if (c.zone === 'btns') { if (c.b === 0) this.restore(); else { this.game.audio.play('ui'); this.close(); } }
    else this.startWait();
  }
  // every frame while the screen is open: pressed = the keys pressed this frame, M = what they mean on the menus
  // (js/fight/input.js menuKeys), pads = both pads' menu buttons pressed this frame
  input(pressed, M, pads) {
    if (this.wait) { this.waitInput(pads); return; }
    const P = (k) => pads[0][k] || pads[1][k], k = M.any, F = freeKeys(pressed);
    if (k.back || P('back')) { this.game.audio.play('ui'); this.close(); return; }
    if (P('lb') || F.has('KeyQ')) { this.setTab(-1); this.game.audio.play('ui'); }
    else if (P('rb') || F.has('KeyE')) { this.setTab(1); this.game.audio.play('ui'); }
    const dx = (k.right || P('right') ? 1 : 0) - (k.left || P('left') ? 1 : 0), dy = (k.down || P('down') ? 1 : 0) - (k.up || P('up') ? 1 : 0);
    if (dx || dy) this.move(dx, dy);
    if (k.ok || P('ok')) this.activate();
    else if ((pressed.has('Delete') || P('y')) && this.cur.zone === 'grid') this.clear(this.action(), this.cur.s);
  }
}

// EXTRAS -> CONTROLES: the keys and buttons as they are now
const list = (v, f) => v.filter((x) => x !== null).map(f).join(' / ') || '—';
export function controlsHelp() {
  const keys = (p) => {
    const m = KEYMAPS[p];
    const combos = ['b12', 'b34', 'b13', 'b24'].filter((a) => m[a].some((x) => x !== null)).map((a) => ` · ${a.slice(1, 2)}+${a.slice(2)} = ${list(m[a], keyLabel)}`).join('');
    return `Mover ${['up', 'left', 'down', 'right'].map((a) => list(m[a], keyLabel)).join(' ')} · ${['b1', 'b2', 'b3', 'b4'].map((a, i) => `${i + 1} = ${list(m[a], keyLabel)}`).join(' · ')}${combos}`;
  };
  const st = padStyle(), b = (a) => list(PADMAP[a], (i) => buttonLabel(i, st));
  return {
    p1: keys('p1'), p2: keys('p2'),
    pad: `${['b1', 'b2', 'b3', 'b4'].map((a, i) => `${i + 1} = ${b(a)}`).join(' · ')} · 1+2 = ${b('b12')} · 3+4 = ${b('b34')} · agarres = ${b('b13')} / ${b('b24')}`,
    pause: `ESC · ${list(KEYMAPS.p1.start, keyLabel)} (J1) · ${list(KEYMAPS.p2.start, keyLabel)} (J2) · ${b('start')} (mando)`,
  };
}
