// Keyboard / gamepad / touch controllers. Each poll() returns a frame of input in SCREEN terms.
export const B1 = 1, B2 = 2, B3 = 4, B4 = 8, START = 16;

const keys = new Set();
const pressedOnce = new Set();
addEventListener('keydown', e => {
  if (!keys.has(e.code)) pressedOnce.add(e.code);
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

export const KEYMAPS = {
  p1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], b1: ['KeyU', 'KeyY'], b2: ['KeyI'], b3: ['KeyJ', 'KeyH'], b4: ['KeyK'], start: ['Enter', 'Escape'] },
  p2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], b1: ['Numpad4', 'Digit7'], b2: ['Numpad5', 'Digit8'], b3: ['Numpad1', 'Digit9'], b4: ['Numpad2', 'Digit0'], start: ['NumpadEnter', 'Backspace'] },
};

export class KeyboardController {
  constructor(map) { this.map = map; this.prev = 0; }
  _any(list) { return list.some(k => keys.has(k)); }
  poll() {
    const m = this.map;
    let dx = (this._any(m.right) ? 1 : 0) - (this._any(m.left) ? 1 : 0);
    let dy = (this._any(m.up) ? 1 : 0) - (this._any(m.down) ? 1 : 0);
    let held = 0;
    if (this._any(m.b1)) held |= B1;
    if (this._any(m.b2)) held |= B2;
    if (this._any(m.b3)) held |= B3;
    if (this._any(m.b4)) held |= B4;
    if (this._any(m.start)) held |= START;
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
    const b = (i) => g.buttons[i] && g.buttons[i].pressed;
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    let dx = (b(15) || ax > 0.45 ? 1 : 0) - (b(14) || ax < -0.45 ? 1 : 0);
    let dy = (b(12) || ay < -0.45 ? 1 : 0) - (b(13) || ay > 0.45 ? 1 : 0);
    let held = 0;
    // PlayStation layout like Tekken: square=1, triangle=2, cross=3, circle=4
    if (b(2)) held |= B1;
    if (b(3)) held |= B2;
    if (b(0)) held |= B3;
    if (b(1)) held |= B4;
    if (b(4)) held |= B1 | B2; // L1 = 1+2
    if (b(5)) held |= B3 | B4; // R1 = 3+4
    if (b(6)) held |= B1 | B3; // L2 = throw
    if (b(7)) held |= B2 | B4; // R2 = throw 2
    if (b(9)) held |= START;
    const pressed = held & ~this.prev;
    this.prev = held;
    return { dx, dy, held, pressed };
  }
}

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
