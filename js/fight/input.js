// Keyboard / gamepad / touch controllers. Each poll() returns a frame of input in SCREEN terms.
// The keys and pad buttons are the player's own (OPCIONES -> CONTROLES, js/ui/controls.js), kept on the device.
export const B1 = 1, B2 = 2, B3 = 4, B4 = 8, START = 16;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

// every action has two slots (main, alternative), null where empty
export const ACTIONS = ['left', 'right', 'up', 'down', 'b1', 'b2', 'b3', 'b4', 'b12', 'b34', 'b13', 'b24', 'start'];
export const PAD_ACTIONS = ['b1', 'b2', 'b3', 'b4', 'b12', 'b34', 'b13', 'b24', 'start'];
// the buttons a combination action presses at once (one key for 1+2 and so on)
const COMBO = { b1: B1, b2: B2, b3: B3, b4: B4, b12: B1 | B2, b34: B3 | B4, b13: B1 | B3, b24: B2 | B4, start: START };
export const DEFAULT_KEYMAPS = {
  p1: { left: ['KeyA', null], right: ['KeyD', null], up: ['KeyW', null], down: ['KeyS', null], b1: ['KeyU', 'KeyY'], b2: ['KeyI', null], b3: ['KeyJ', 'KeyH'], b4: ['KeyK', null],
    b12: [null, null], b34: [null, null], b13: [null, null], b24: [null, null], start: ['Enter', null] },
  p2: { left: ['ArrowLeft', null], right: ['ArrowRight', null], up: ['ArrowUp', null], down: ['ArrowDown', null], b1: ['Numpad4', 'Digit7'], b2: ['Numpad5', 'Digit8'], b3: ['Numpad1', 'Digit9'], b4: ['Numpad2', 'Digit0'],
    b12: [null, null], b34: [null, null], b13: [null, null], b24: [null, null], start: ['NumpadEnter', 'Backspace'] },
};
// PlayStation layout like Tekken (positions of the standard mapping): square=1, triangle=2, cross=3, circle=4,
// L1 = 1+2, R1 = 3+4, L2 / R2 throws. The d-pad (12-15) and the left stick always move.
export const DEFAULT_PADMAP = { b1: [2, null], b2: [3, null], b3: [0, null], b4: [1, null], b12: [4, null], b34: [5, null], b13: [6, null], b24: [7, null], start: [9, null] };
// keys a player can't take: Escape always pauses and goes back (and cancels on the controls screen), Delete clears a
// slot there, and the rest belong to the browser or the system or change what other keys send (NumLock)
export const RESERVED_KEYS = new Set(['Escape', 'Delete', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', 'ContextMenu', 'CapsLock', 'NumLock', 'ScrollLock', 'Pause', 'PrintScreen', 'Fn',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);
// pad buttons a player can't take: the d-pad moves, the home button belongs to the system
export const RESERVED_BUTTONS = new Set([12, 13, 14, 15, 16]);
const STORE = 'pdb_controls';

const copy = (o) => JSON.parse(JSON.stringify(o));
export const KEYMAPS = copy(DEFAULT_KEYMAPS);
export const PADMAP = copy(DEFAULT_PADMAP);

let bound = new Set();   // every key that does something in a fight (its browser default is blocked)
let menuTable = null;    // key -> what it means on a menu, for each player (see menuKeys)
function changed() { bound = new Set(['p1', 'p2'].flatMap((p) => ACTIONS.flatMap((a) => KEYMAPS[p][a])).filter(Boolean)); menuTable = null; }

// a saved set of controls, checked: two slots of the right kind per action, nothing reserved; a key or button in two
// places keeps only its first. The saved slots come first, then the defaults of whatever the save lacks (an action
// added since, a save edited by hand) lose any key the save gives to something else
function load() {
  let d = null;
  try { d = JSON.parse(lsGet(STORE) || 'null'); } catch (e) { /* ignore */ }
  if (!d || d.v !== 1) return;
  const fill = (entries, valid) => {
    const seen = new Set(), rest = [];
    for (const [obj, a, v] of entries) {
      if (Array.isArray(v) && v.length === 2 && v.every((x) => x === null || valid(x))) obj[a] = v.map((x) => (x === null || seen.has(x) ? null : (seen.add(x), x)));
      else rest.push([obj, a]);
    }
    for (const [obj, a] of rest) obj[a] = obj[a].map((x) => (seen.has(x) ? null : x));
  };
  fill(['p1', 'p2'].flatMap((p) => ACTIONS.map((a) => [KEYMAPS[p], a, d[p]?.[a]])), (x) => typeof x === 'string' && x.length < 40 && !RESERVED_KEYS.has(x));
  fill(PAD_ACTIONS.map((a) => [PADMAP, a, d.pad?.[a]]), (x) => Number.isInteger(x) && x >= 0 && x < 32 && !RESERVED_BUTTONS.has(x));
}
export function saveControls() { lsSet(STORE, JSON.stringify({ v: 1, p1: KEYMAPS.p1, p2: KEYMAPS.p2, pad: PADMAP })); }

// a key into one slot (player 'p1' | 'p2', action, slot 0 | 1). The key leaves wherever it was (either player's
// keys: one key never does two things), and that place takes this slot's old key instead (a swap)
export function bindKey(p, a, s, code) {
  const old = KEYMAPS[p][a][s];
  for (const q of ['p1', 'p2']) for (const b of ACTIONS) {
    const list = KEYMAPS[q][b];
    for (let i = 0; i < 2; i++) if (list[i] === code && !(q === p && b === a && i === s)) list[i] = old;
  }
  KEYMAPS[p][a][s] = code;
  changed(); saveControls();
}
export function bindButton(a, s, btn) {
  const old = PADMAP[a][s];
  for (const b of PAD_ACTIONS) for (let i = 0; i < 2; i++) if (PADMAP[b][i] === btn && !(b === a && i === s)) PADMAP[b][i] = old;
  PADMAP[a][s] = btn;
  saveControls();
}
export function clearKey(p, a, s) { KEYMAPS[p][a][s] = null; changed(); saveControls(); }
export function clearButton(a, s) { PADMAP[a][s] = null; saveControls(); }
// the defaults back ('keys': both players' keys, which can have been swapped between them; 'pad': the pad's buttons)
export function restoreControls(what) {
  if (what === 'keys') for (const p of ['p1', 'p2']) for (const a of ACTIONS) KEYMAPS[p][a] = DEFAULT_KEYMAPS[p][a].slice();
  else for (const a of PAD_ACTIONS) PADMAP[a] = DEFAULT_PADMAP[a].slice();
  changed(); saveControls();
}
export function isBound(code) { return bound.has(code); }

load();
changed();

const keys = new Set();
const pressedOnce = new Set();
let capture = null;        // the controls screen waiting for a key
const typed = {};          // key -> the character it typed (the controls screen names keys after the keyboard's layout)
addEventListener('keydown', e => {
  if (e.key && e.key.length === 1 && e.key !== ' ' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) typed[e.code] = e.key.toUpperCase();
  // (a held key repeating is not a new key for the controls screen: the key that opened the slot isn't taken)
  if (capture && !e.repeat) { const cb = capture; capture = null; keys.add(e.code); e.preventDefault(); cb(e.code); return; }
  if (!keys.has(e.code)) pressedOnce.add(e.code);
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || bound.has(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
// the next key pressed goes to cb (and nowhere else); null stops waiting
export function captureKey(cb) { capture = cb; }

export class KeyboardController {
  constructor(map) { this.map = map; this.prev = 0; }
  _any(list) { return list.some(k => k && keys.has(k)); }
  poll() {
    const m = this.map;
    let dx = (this._any(m.right) ? 1 : 0) - (this._any(m.left) ? 1 : 0);
    let dy = (this._any(m.up) ? 1 : 0) - (this._any(m.down) ? 1 : 0);
    let held = 0;
    for (const a in COMBO) if (m[a] && this._any(m[a])) held |= COMBO[a];
    const pressed = held & ~this.prev;
    this.prev = held;
    return { dx, dy, held, pressed };
  }
}

export class GamepadController {
  constructor(index) { this.index = index; this.prev = 0; }
  connected() { const g = navigator.getGamepads?.()[this.index]; return !!(g && g.connected); }
  poll() {
    const g = navigator.getGamepads?.()[this.index];
    if (!g) return { dx: 0, dy: 0, held: 0, pressed: 0 };
    const b = (i) => i !== null && g.buttons[i] && g.buttons[i].pressed;
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    let dx = (b(15) || ax > 0.45 ? 1 : 0) - (b(14) || ax < -0.45 ? 1 : 0);
    let dy = (b(12) || ay < -0.45 ? 1 : 0) - (b(13) || ay > 0.45 ? 1 : 0);
    let held = 0;
    for (const a in COMBO) if (b(PADMAP[a][0]) || b(PADMAP[a][1])) held |= COMBO[a];
    const pressed = held & ~this.prev;
    this.prev = held;
    return { dx, dy, held, pressed };
  }
}
// whether a pad's button is one of an action's (the menus' START)
export function padHas(g, a) { return PADMAP[a].some((i) => i !== null && g.buttons[i]?.pressed); }

// Merges several sources (keyboard + pad + touch) into one
export class MergedController {
  constructor(...srcs) { this.srcs = srcs; }
  poll() {
    let dx = 0, dy = 0, held = 0, pressed = 0;
    for (const s of this.srcs) {
      const f = s.poll();
      if (f.dx) dx = f.dx;
      if (f.dy) dy = f.dy;
      held |= f.held; pressed |= f.pressed;
    }
    return { dx, dy, held, pressed };
  }
}

// (touch controls live in js/ui/touch.js)

export function menuKeysPressed() {
  const out = new Set(pressedOnce);
  pressedOnce.clear();
  return out;
}
export function isKeyDown(code) { return keys.has(code); }

// What the keys pressed this frame mean on the menus, for each player and for either: his own directions, his 1 to
// accept, his 4 to go back, his pause key; and the usual keys (Enter and Space accept, Escape and Backspace go back)
// as long as no binding gives them a fight action of their own. Escape is never a binding: it always goes back.
const FIXED = [['Enter', 0, 'ok'], ['Space', 0, 'ok'], ['NumpadEnter', 1, 'ok'], ['Escape', 0, 'back'], ['Backspace', 1, 'back']];
const MEANING = { left: 'left', right: 'right', up: 'up', down: 'down', b1: 'ok', b4: 'back', start: 'start' };
function buildMenuTable() {
  const t = new Map(), fight = new Set();
  const add = (code, p, m) => { if (!t.has(code)) t.set(code, []); t.get(code).push([p, m]); };
  ['p1', 'p2'].forEach((p, i) => {
    for (const a of ACTIONS) for (const code of KEYMAPS[p][a]) {
      if (!code) continue;
      if (MEANING[a]) add(code, i, MEANING[a]);
      if (a !== 'start') fight.add(code);
    }
  });
  for (const [code, p, m] of FIXED) if (!fight.has(code)) add(code, p, m);
  return t;
}
export function menuKeys(pressed) {
  const blank = () => ({ left: false, right: false, up: false, down: false, ok: false, back: false, start: false });
  const p = [blank(), blank()], any = blank();
  menuTable ||= buildMenuTable();
  for (const code of pressed) for (const [i, m] of menuTable.get(code) || []) { p[i][m] = true; any[m] = true; }
  return { p, any };
}
// the keys pressed this frame that no player uses (shortcuts like ENTRENAMIENTO's R / P / T only work while free)
export function freeKeys(pressed) { return new Set([...pressed].filter((c) => !bound.has(c))); }

// ------------------------------------------------------------------ names of keys and buttons
// (letters as the player's keyboard prints them: what the key typed, or the browser's layout map)
let layout = null;
globalThis.navigator?.keyboard?.getLayoutMap?.().then((m) => { layout = m; }).catch(() => {});
const KEY_NAMES = { Space: 'ESPACIO', Enter: 'INTRO', NumpadEnter: 'INTRO NUM', Backspace: 'RETROCESO', Tab: 'TAB', ShiftLeft: 'MAYÚS IZQ', ShiftRight: 'MAYÚS DER',
  ControlLeft: 'CTRL IZQ', ControlRight: 'CTRL DER', AltLeft: 'ALT', AltRight: 'ALT GR', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Insert: 'INSERT',
  Home: 'INICIO', End: 'FIN', PageUp: 'RE PÁG', PageDown: 'AV PÁG', NumpadAdd: '+ NUM', NumpadSubtract: '− NUM', NumpadMultiply: '× NUM', NumpadDivide: '÷ NUM', NumpadDecimal: ', NUM' };
const US = { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<' };
export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Numpad\d$/.test(code)) return code.slice(6) + ' NUM';
  const l = typed[code] || layout?.get(code);
  if (l) return l.toUpperCase();
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return US[code] || code.replace(/(Left|Right)$/, '').toUpperCase();
}
// the pad's buttons by the names printed on it (standard mapping positions: 0 bottom, 1 right, 2 left, 3 top...)
const PAD_NAMES = {
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', '↑', '↓', '←', '→', 'PS', 'PANEL'],
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'LS', 'RS', '↑', '↓', '←', '→', 'XBOX', 'SHARE'],
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', '↑', '↓', '←', '→', 'HOME', 'CAPTURA'],
};
export function padStyle() {
  const id = [...(navigator.getGamepads?.() || [])].find(Boolean)?.id || '';
  if (/xbox|xinput|045e|microsoft/i.test(id)) return 'xbox';
  if (/057e|nintendo|pro controller|joy-con/i.test(id)) return 'nintendo';
  return 'ps';
}
export function buttonLabel(i, style = padStyle()) { return i === null || i === undefined ? '—' : PAD_NAMES[style][i] || `B${i}`; }
