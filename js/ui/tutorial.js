// TUTORIAL: the game taught by doing it, one lesson after another, in a training fight in the gym (js/main.js starts
// it from the title: TUTORIAL). Each lesson says what to do (with the player's own keys, pad buttons or the touch
// controls underneath), sets what the partner does (stands still, jabs, low kicks, tries a throw: a small script the
// training partner plays, js/ui/training.js script) and checks the fight's own events until it is done; then ¡BIEN!
// and the next. T (or the panel's button on a phone) skips a lesson. Nothing here is part of the simulation: it reads
// the fight's events and only touches what training already touches (the partner's input, health, positions).
import { B1, B2, B3, KEYMAPS, PADMAP, keyLabel, buttonLabel, padStyle } from '../fight/input.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NONE = { dx: 0, dy: 0, held: 0, pressed: 0 };
const READY = ['idle', 'walkF', 'walkB', 'crouch', 'guard'];
// a command in words, for someone who has never read a move list (b + 1 -> atrás + 1)
const DIRW = { f: 'adelante', b: 'atrás', d: 'abajo', u: 'arriba', df: 'abajo-adelante', db: 'abajo-atrás', uf: 'arriba-adelante', ub: 'arriba-atrás' };
const words = (cmd) => cmd.split(',').map((part) => part.split('+').map((t) => DIRW[t] || t).join(' + ')).join(', ');

// ------------------------------------------------------------------ the partner's scripts
const press = (mask, dy = 0) => ({ dx: 0, dy, held: mask, pressed: mask });
// an attack every `every` frames at most (seq: a few frames of input), thrown as soon as the player is in reach (near,
// metres between the two); out of reach it walks in, and dashes in from afar (a player walking backwards, holding the
// guard, is caught up with: a walk alone never would)
function attacker(every, near, seq) {
  let t = 0, q = [];
  return (m, b, a) => {
    if (q.length) return q.shift();
    if (!READY.includes(b.state)) return NONE;
    t++;
    const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z), fwd = m.screenForward(b);
    if (d > near) {
      if (d > near + 0.45) { const f = { dx: fwd, dy: 0, held: 0, pressed: 0 }; q = [f, NONE, NONE, f, f]; return f; }
      return { dx: fwd, dy: 0, held: 0, pressed: 0 };
    }
    if (t < every) return NONE;
    t = 0; q = seq(m).slice(); return q.shift() || NONE;
  };
}

// the player's buttons as their device shows them: the keyboard's keys, the pad's buttons (one is connected), or
// nothing on a phone (the buttons on screen carry the numbers)
function deviceKeys(touch) {
  if (touch) return '';
  const pad = [...(navigator.getGamepads?.() || [])].some(Boolean);
  const lab = (v, f) => v.filter((x) => x !== null && x !== undefined).map(f).join('/') || '—';
  if (pad) {
    const st = padStyle(), b = (k) => lab(PADMAP[k] || [], (i) => buttonLabel(i, st));
    return `MANDO: 1 = ${b('b1')} · 2 = ${b('b2')} · 3 = ${b('b3')} · 4 = ${b('b4')} · BLOQUEO = ${b('block')}`;
  }
  const m = KEYMAPS.p1, k = (a) => lab(m[a] || [], keyLabel);
  return `TECLADO: mover ${k('up')} ${k('left')} ${k('down')} ${k('right')} · 1 = ${k('b1')} · 2 = ${k('b2')} · 3 = ${k('b3')} · 4 = ${k('b4')} · BLOQUEO = ${k('block')}`;
}

export class Tutorial {
  constructor(game) {
    this.g = game;
    this.el = { panel: $('#tutPanel') };
    this.m = null;
  }
  get on() { return !!this.m; }

  // the lessons, for this fighter (its own chain and specials)
  lessons() {
    const a = this.a, st = a.style, M = a.moves, touch = this.touch;
    const nm = (k) => esc(M[k]?.name || k);
    const fin = st.stringFinish && M[st.stringFinish] ? st.stringFinish : null;
    const specials = (st.commands || []).filter(([, k]) => M[k]?.hit).slice(0, 5);
    const sp = touch && this.g.touch?.opt?.specials !== false;
    const fwd = touch ? 'el joystick hacia el rival' : 'adelante (hacia el rival)';
    const four = [['jab', 'jab2'], ['straight', 'onetwo'], ['frontKick', st.stringFinish], ['roundhouse', st.onetwoFinish]];
    return [
      { name: 'MOVERSE', text: `Mueve ${touch ? 'el joystick de la izquierda' : 'la dirección'}: acércate al rival y luego aléjate de él.`,
        init: (T) => { T.d0 = T.dist(); T.near = false; },
        check: (T) => { const d = T.dist(); if (d < T.d0 - 0.5) T.near = true; return T.near && d > T.d0 + 0.2; } },
      { name: 'DASH', text: `Pulsa ${fwd} dos veces seguidas, rápido: un dash, la forma más rápida de entrar.`, check: (T) => T.a.state === 'dashF' },
      { name: 'ESQUIVA LATERAL', text: `Toca ${touch ? 'el joystick hacia arriba o hacia abajo' : 'arriba o abajo'} una sola vez: esquivas hacia un lado. Así se evitan los golpes rectos.`,
        check: (T) => T.a.state === 'side' },
      { name: 'LOS CUATRO BOTONES', text: '1 y 2 son tus puños (izquierdo y derecho); 3 y 4, tus patadas. Golpea al rival con los cuatro.',
        goal: 4, count: (T) => four.filter((ks) => ks.some((k) => k && T.hit[k])).length },
      { name: 'LA CADENA 1, 2', text: 'Pulsa 1 y, en cuanto toque, 2: los dos golpes entran seguidos y el rival no puede cubrirse entre uno y otro.',
        check: (T) => T.hitEv.some((e) => (e.mv === 'onetwo' || e.mv === 'straight') && e.combo >= 2) },
      ...(fin ? [{ name: 'TU CADENA PROPIA', text: `1, 2 y el 3 en cuanto toque el directo: la cadena de ${esc(a.ch.meta.display)}, que acaba en <b>${nm(fin)}</b>.`,
        check: (T) => T.hitEv.some((e) => e.mv === fin && e.combo >= 3) }] : []),
      { name: 'BLOQUEAR', text: `Ahora ataca el rival. Mantén ${touch ? 'el joystick hacia atrás (o el escudo BLOQUEO)' : 'atrás (o BLOQUEO)'} para cubrirte: para tres golpes.`,
        goal: 3, count: (T) => T.blocks,
        script: attacker(70, 1.05, (m) => [press(((m.frame / 70) | 0) % 2 ? B2 : B1), NONE]) },
      { name: 'BLOQUEO BAJO', text: `Las patadas bajas se paran agachado: mantén ${touch ? 'el joystick' : 'la dirección'} abajo-atrás. Para dos.`,
        goal: 2, count: (T) => T.lowBlocks,
        script: attacker(85, 1.05, () => [press(0, -1), press(0, -1), press(B3, -1), { dx: 0, dy: -1, held: B3, pressed: 0 }, NONE]) },
      { name: 'LA PARADA', text: `Pulsa BLOQUEO${touch ? ' (el escudo)' : ''} justo antes de que te llegue el golpe: lo paras en seco (¡PARADA!) y el rival queda vendido.`,
        goal: 1, count: (T) => T.parries,
        script: attacker(95, 1.05, () => [press(B2), NONE]) },
      { name: 'LANZAR Y REMATAR', text: 'Abajo-adelante + 2: el gancho lo lanza por los aires. Remata con 1, 2 antes de que caiga.',
        check: (T) => T.hitEv.some((e) => e.air && e.combo >= 3) },
      ...(specials.length ? [{ name: 'TUS ESPECIALES', text: sp ? `Conecta dos golpes especiales distintos con los botones ★ (el joystick elige cuál): ${specials.map(([, k]) => nm(k)).join(' · ')}.`
        : `Conecta dos golpes especiales distintos: ${specials.map(([c, k]) => `<b>${esc(words(c))}</b> ${nm(k)}`).join(' · ')}.`,
        goal: 2, count: (T) => new Set(specials.filter(([, k]) => T.hit[k]).map(([, k]) => k)).size }] : []),
      { name: 'AGARRAR', text: `De cerca, pulsa 1 + 3 a la vez${touch ? ' (toca en el hueco entre el 1 y el 3)' : ''}: agarras al rival y no hay bloqueo que valga.`,
        check: (T) => T.stat('throws') > T.base.throws },
      { name: 'ZAFARSE', text: 'Ahora el rival intenta agarrarte. En cuanto te agarre, pulsa 1 enseguida para zafarte (un agarre con 2 + 4 se rompe con 2).',
        check: (T) => T.stat('escapes') > T.base.escapes,
        script: attacker(100, 0.95, () => [press(B1 | B3), NONE]) },
      { name: 'LAS PAREDES', text: 'Las máquinas del gimnasio son pared: lanza al rival contra ellas con un golpe fuerte (una patada, adelante + 2…) y queda estampado. ¡Sigue golpeando!',
        init: (T) => T.placeNearWall(), check: (T) => T.walls > 0 },
      { name: 'RAGE ART', text: `Con poca vida entras en FURIA (el aura roja). Pulsa 1 + 2 + 3 + 4 a la vez${touch ? ' (el botón RAGE ART que aparece)' : ''}: tu golpe más espectacular.`,
        rage: true, check: (T) => T.rageArts > 0 },
    ];
  }

  // a tutorial fight has started (a training fight: js/main.js)
  start(match, training) {
    this.m = match; this.tr = training; this.done = false;
    [this.a, this.b] = match.fighters;
    this.touch = document.body.classList.contains('touchui');
    this.saved = { ...training.s }; // (the player's own ENTRENAMIENTO settings, given back at the end)
    training.s.history = false; training.paintHist?.(true);
    this.list = this.lessons();
    this.keysLine = deviceKeys(this.touch);
    this.set(0);
  }
  stop() {
    if (this.tr) { this.tr.script = null; if (this.saved) Object.assign(this.tr.s, this.saved); }
    this.saved = null;
    this.m = null;
    clearTimeout(this.nextT);
    this.el.panel?.classList.remove('on');
  }
  dist() { return Math.hypot(this.a.pos.x - this.b.pos.x, this.a.pos.z - this.b.pos.z); }
  stat(k) { return this.m.stats[0][k] || 0; }
  // (the walls lesson: both moved next to the machines on the gym's right, the partner with its back to them)
  placeNearWall() {
    const { a, b, m } = this;
    a.pos.set(4.1, 0, 0); b.pos.set(5.35, 0, 0);
    a.yaw = Math.PI / 2; b.yaw = -Math.PI / 2;
    for (const f of [a, b]) {
      const hp = f.hp;
      f.reset(); f.hp = hp;
      f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.snapPose = true; f.play('idle', 1); f.animate(); f.prevPose.set(f.pose);
    }
    m.camera.setMode('fight', true);
  }
  set(i) {
    this.i = i;
    const L = this.list[i];
    this.hit = {}; this.hitEv = []; this.blocks = 0; this.lowBlocks = 0; this.parries = 0; this.walls = 0; this.rageArts = 0;
    this.base = { throws: this.stat('throws'), escapes: this.stat('escapes') };
    this.ok = false; this._n = -1;
    // the partner: still and without guard (the training settings), unless the lesson gives it a script
    Object.assign(this.tr.s, { action: 'stand', guard: 'none', counter: false, tech: false });
    this.tr.script = L.script || null;
    this.b.hp = this.b.maxHp;
    if (!L.rage) this.a.hp = Math.max(this.a.hp, this.a.maxHp * 0.6);
    L.init?.(this);
    this.paint();
  }
  skip() { if (this.m && !this.done) { this.g.audio.play('ui'); this.next(); } }
  next() {
    clearTimeout(this.nextT);
    if (this.i + 1 >= this.list.length) { this.finish(); return; }
    this.set(this.i + 1);
  }
  finish() {
    const g = this.g;
    this.tr.script = null;
    g.hud.announce('¡TUTORIAL COMPLETADO!', 'perfect');
    g.audio.play('uiok');
    g.progress?.unlock('tutorial');
    this.el.panel?.classList.remove('on');
    this.done = true;
    const m = this.m;
    setTimeout(() => {
      if (g.match !== m || g.state !== 'fight') return;
      g.showOverlay('<h3>¡TUTORIAL COMPLETADO!</h3><p style="font-size:18px">Ya sabes moverte, golpear, cubrirte, parar, lanzar, agarrar y estampar al rival contra la pared.</p>'
        + '<p style="font-size:15px;opacity:.8">Sigue practicando en ENTRENAMIENTO (con las pruebas de combo de cada luchador) o lánzate al MODO ARCADE.</p>',
      () => g.backToTitle(), null, { ok: 'MENÚ PRINCIPAL' });
    }, 2000);
  }

  // every frame of the fight (js/main.js, in place of the training's): this frame's events, then the lesson's check
  tick(dt, keys) {
    if (!this.m || this.done) return;
    if (keys?.has('KeyT')) { this.skip(); return; }
    const { a, b, m } = this;
    const L = this.list[this.i];
    for (const ev of m.events) {
      if (ev.t === 'hit' && ev.att === a) {
        this.hit[a.moveName] = true;
        this.hitEv.push({ mv: a.moveName, combo: b.comboHits, air: b.state === 'air' || b.airborne || b.pos.y > 0.15 });
      } else if (ev.t === 'block' && ev.f === a) { this.blocks++; if (b.move?.hit?.lvl === 'low') this.lowBlocks++; }
      else if (ev.t === 'parry' && ev.f === a) this.parries++;
      else if (ev.t === 'wall' && ev.f === b) this.walls++;
      else if (ev.t === 'rageArt' && ev.att === a) this.rageArts++;
    }
    // nobody falls in a lesson: the partner's health back before a blow could finish it, the player's kept up (in
    // the RAGE ART lesson held low, and the Rage Art given back if it missed)
    if (b.hp < b.maxHp * 0.55 && READY.includes(b.state)) b.hp = b.maxHp;
    if (L.rage && !this.ok) {
      if (a.hp > a.maxHp * 0.22) a.hp = Math.round(a.maxHp * 0.22);
      if (a.rageUsed && a.state !== 'rageArt' && READY.includes(a.state)) a.rageUsed = false;
    } else if (a.hp < a.maxHp * 0.35 && READY.includes(a.state)) a.hp = a.maxHp * 0.6;
    if (this.ok) return;
    const n = L.goal ? Math.min(L.goal, L.count(this)) : 0;
    if (n !== this._n) { this._n = n; this.paint(); }
    if (L.goal ? n >= L.goal : L.check(this)) {
      this.ok = true;
      this.tr.script = null;
      this.g.hud.announce('¡BIEN!', 'perfect');
      this.g.audio.play('uiok');
      this.paint();
      const at = this.i;
      clearTimeout(this.nextT);
      this.nextT = setTimeout(() => { if (this.m === m && this.i === at) this.next(); }, 1600);
    }
  }

  paint() {
    const el = this.el.panel;
    if (!el || !this.m) return;
    const L = this.list[this.i];
    el.classList.add('on');
    const n = L.goal ? Math.min(L.goal, L.count(this)) : 0;
    el.innerHTML = `<div class="hd">LECCIÓN ${this.i + 1}/${this.list.length}${this.ok ? ' <em>✓</em>' : ''}<b>${esc(L.name)}</b></div>
      <p>${L.text}</p>${L.goal ? `<div class="cnt">${n} / ${L.goal}</div>` : ''}
      <div class="dots">${this.list.map((x, k) => `<i class="${k < this.i || (k === this.i && this.ok) ? 'ok' : ''} ${k === this.i ? 'cur' : ''}"></i>`).join('')}</div>
      ${this.keysLine ? `<div class="dev">${esc(this.keysLine)}</div>` : ''}
      <div class="keys">${this.touch ? '<button class="skip">SALTAR ▸</button>' : 'T: saltar la lección'}</div>`;
    const sk = el.querySelector('.skip');
    if (sk) sk.onclick = (e) => { e.stopPropagation(); this.skip(); };
  }
}
