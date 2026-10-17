// ENTRENAMIENTO: the sparring partner's settings (what it does, whether it blocks, punishes or rolls back up), a
// recording of its actions played back in a loop, the player's input history on screen and the combo trials of each
// fighter (progress kept by js/ui/progress.js).
import { B1, B2, B3, B4 } from '../fight/input.js';
import { AIController } from '../fight/ai.js';
import { commandList } from '../fight/moves.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NONE = { dx: 0, dy: 0, held: 0, pressed: 0 };
const REC_MAX = 600; // frames a recording may last (10 s)
const ARROW = { 1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '·', 6: '→', 7: '↖', 8: '↑', 9: '↗' };
const BTNS = [[B1, '1'], [B2, '2'], [B3, '3'], [B4, '4']];

// a command's notation as the move list writes it, for the trial panel
export const notation = (cmd) => cmd.replace(/\+/g, ' + ').replace(/,/g, ', ');

// the combo trials of each fighter, easiest first: commands in the move list's notation. Every one of them can be
// done: tools/trainingtest.mjs plays them with a scripted player before a release (it fails if one cannot be done)
const TRIALS = {
  alejandro: [
    ['UNO-DOS', 'Pulsa 2 justo después del 1: la cadena entra entera.', ['1', '2']],
    ['PATADA DE REMATE', 'El directo se encadena con la patada alta si pulsas 4 en cuanto sale el 2.', ['2', '4']],
    ['LANZAMIENTO', 'El gancho (abajo-adelante + 2) lo levanta: espera a que caiga un poco y remata con 1, 2.', ['df+2', '1', '2']],
    ['RODILLA VOLADORA', 'La rodilla (adelante + 3) también lanza: 1, 2 en el aire y la patada alta para cerrar.', ['f+3', '1', '2', '4']],
    ['GIRATORIA', 'Su patada giratoria (atrás + 4): conéctala.', ['b+4']],
  ],
  arnau: [
    ['UNO-DOS', 'Pulsa 2 justo después del 1: la cadena entra entera.', ['1', '2']],
    ['TRIPLE', 'Dos jabs y el directo, cada uno en cuanto toca el anterior.', ['1', '1', '2']],
    ['LANZAMIENTO', 'El gancho (abajo-adelante + 2) lo levanta: espera a que caiga un poco y remata con 1, 2.', ['df+2', '1', '2']],
    ['COMBO AÉREO', 'Tras el 1, 2 en el aire, barre (abajo + 4) antes de que se levante.', ['df+2', '1', '2', 'd+4']],
    ['CABEZAZO', 'Su golpe estrella (1 + 2): conéctalo.', ['1+2']],
  ],
  camilo: [
    ['UNO-DOS', 'Pulsa 2 justo después del 1: la cadena entra entera.', ['1', '2']],
    ['TRIPLE', 'Dos jabs y el directo, cada uno en cuanto toca el anterior.', ['1', '1', '2']],
    ['LANZAMIENTO', 'El gancho (abajo-adelante + 2) lo levanta: espera a que caiga un poco y remata con 1, 2.', ['df+2', '1', '2']],
    ['COMBO AÉREO', 'Tras el 1, 2 en el aire, barre (abajo + 4) antes de que se levante.', ['df+2', '1', '2', 'd+4']],
    ['A LA CARRERA', 'Su patada a la carrera (adelante, adelante + 4): conéctala.', ['f,f+4']],
  ],
  rafa: [
    ['UNO-DOS', 'Pulsa 2 justo después del 1: la cadena entra entera.', ['1', '2']],
    ['TRIPLE', 'Dos jabs y el directo, cada uno en cuanto toca el anterior.', ['1', '1', '2']],
    ['LANZAMIENTO', 'El gancho (abajo-adelante + 2) lo levanta: espera a que caiga un poco y remata con 1, 2.', ['df+2', '1', '2']],
    ['COMBO AÉREO', 'Tras el 1, 2 en el aire, barre (abajo + 4) antes de que se levante.', ['df+2', '1', '2', 'd+4']],
    ['GOLPE DE VETERANO', 'Su golpe estrella (1 + 2): conéctalo.', ['1+2']],
  ],
  zapponi: [
    ['UNO-DOS', 'Pulsa 2 justo después del 1: la cadena entra entera.', ['1', '2']],
    ['TRIPLE', 'Dos jabs y el directo, cada uno en cuanto toca el anterior.', ['1', '1', '2']],
    ['LANZAMIENTO', 'El gancho (abajo-adelante + 2) lo levanta: espera a que caiga un poco y remata con 1, 2.', ['df+2', '1', '2']],
    ['COMBO AÉREO', 'Tras el 1, 2 en el aire, barre (abajo + 4) antes de que se levante.', ['df+2', '1', '2', 'd+4']],
    ['LARIAT', 'Su lariat (1 + 2): conéctalo.', ['1+2']],
  ],
  dani: [
    ['UNO-DOS', 'Pulsa 2 justo después del 1: la cadena entra entera.', ['1', '2']],
    ['GANCHO AL HÍGADO', 'Su gancho bajo (abajo + 2) lo levanta: remata con 1, 2 cuando caiga.', ['d+2', '1', '2']],
    ['COMBO AÉREO', 'Gancho (abajo-adelante + 2), 1, 2 en el aire y barrido (abajo + 4) para cerrar.', ['df+2', '1', '2', 'd+4']],
    ['VIEJA ESCUELA', 'Gancho bajo, 1, 2 y la patada alta (4) antes de que toque el suelo.', ['d+2', '1', '2', '4']],
    ['GUANTAZO', 'Su guantazo (atrás + 1): conéctalo.', ['b+1']],
  ],
  noemi: [
    ['UNO-DOS', 'Pulsa 2 justo después del 1: la cadena entra entera.', ['1', '2']],
    ['TRIAJE', 'Tras el directo (2), la palma al esternón (atrás + 1) entra antes de que se recupere.', ['2', 'b+1']],
    ['LANZAMIENTO', 'El gancho (abajo-adelante + 2) lo levanta: espera a que caiga un poco y remata con 1, 2.', ['df+2', '1', '2']],
    ['REANIMACIÓN', 'El desfibrilador (1 + 2) lo lanza por los aires: el directo (2) antes de que caiga y el barrido (abajo + 4) al tocar el suelo.', ['1+2', '2', 'd+4']],
    ['ALTA MÉDICA', 'El gancho (abajo-adelante + 2) lo levanta, el desfibrilador (1 + 2) lo carga en el aire y el directo (2) remata.', ['df+2', '1+2', '2']],
  ],
};

// the trials of a fighter as steps: [command, names of the moves that count for it]. A juggle's '1' can come out as
// the double jab and its '2' as the 1,2 (the jab's string cancels), a '4' after the 2 as the string's finisher
export function trialsFor(style, id) {
  const cmds = commandList(style);
  const moveOf = (c) => (cmds.find(([k]) => k === c) || [])[1];
  const counts = (c) => (c === '1' ? ['jab', 'jab2'] : c === '2' ? ['straight', 'onetwo'] : c === '4' ? ['roundhouse', style.onetwoFinish].filter(Boolean) : [moveOf(c)].filter(Boolean));
  const list = TRIALS[id] || [
    ['UNO-DOS', 'Pulsa 2 justo después del 1: la cadena entra entera.', ['1', '2']],
    ['LANZAMIENTO', 'El gancho (abajo-adelante + 2) lo levanta: espera a que caiga un poco y remata con 1, 2.', ['df+2', '1', '2']],
    ['COMBO AÉREO', 'Tras el 1, 2 en el aire, barre (abajo + 4) antes de que se levante.', ['df+2', '1', '2', 'd+4']],
  ];
  return list.map(([name, tip, steps]) => ({ name, tip, steps: steps.map((c) => [c, counts(c)]) })).filter((t) => t.steps.every((st) => st[1].length));
}

export class Training {
  constructor(game) {
    this.g = game;
    this.s = { action: 'stand', level: 3, guard: 'none', counter: false, tech: false, history: true };
    try { Object.assign(this.s, JSON.parse(localStorage.getItem('pdb_training') || '{}')); } catch (e) { /* defaults */ }
    this.rec = null; this.recording = 0; this.recLen = 0; this.playT = 0;
    this.hist = []; this.trial = null;
    this.el = { hist: $('#inputHist'), trial: $('#trialPanel'), msg: $('#trainMsg') };
  }
  saveSettings() { try { localStorage.setItem('pdb_training', JSON.stringify(this.s)); } catch (e) { /* private mode */ } }

  // a training fight starts: the partner gets its controls
  start(match) {
    this.m = match;
    const [a, b] = match.fighters;
    this.a = a; this.b = b;
    this.ai = new AIController(this.s.level); this.ai.attach(b, match);
    this.p1 = a.ctrl;
    this.dummy = { poll: () => this.dummyInput() };
    b.ctrl = this.dummy;
    this.recording = 0; this.hist.length = 0; this.trial = null; this.trialIdx = 0;
    this.blockPlan = null;
    this.el.trial?.classList.remove('on');
    this.paintHist(true);
  }
  stop() {
    if (this.b) this.b.noGuard = false;
    this.m = null;
    for (const k of ['hist', 'trial', 'msg']) this.el[k]?.classList.remove('on');
  }

  // ------------------------------------------------------------------ the partner's controls
  dummyInput() {
    const m = this.m, b = this.b, a = this.a, s = this.s;
    if (!m) return NONE;
    const fwd = m.screenForward(b); // (screen right = towards the player?)
    // recording: the player drives the partner
    if (this.recording === 2) {
      const r = this.p1.poll();
      const k = this.recLen++;
      this.rec[k * 4] = r.dx * fwd; this.rec[k * 4 + 1] = r.dy; this.rec[k * 4 + 2] = r.held; this.rec[k * 4 + 3] = r.pressed;
      if (this.recLen >= REC_MAX) this.stopRecording();
      return r;
    }
    if (this.recording === 1) return NONE; // (the countdown)
    // rolling back up: a button as the body lands
    if (s.tech && b.state === 'land' && b.sf <= 6) return { dx: 0, dy: 0, held: B1, pressed: B1 };
    // punishing: once out of a block, its quickest blow
    if (s.counter && this.punish > 0) { this.punish--; if (this.punish === 0 && ['idle', 'crouch'].includes(b.state)) return { dx: 0, dy: 0, held: B1, pressed: B1 }; }
    if (b.state === 'block') this.punish = 3;
    // blocking: the player's strike read as it starts (low ones crouched); random: one strike in two. A partner that
    // is not blocking takes every blow (b.noGuard: standing still would block highs and mids by itself)
    const mv = a.state === 'move' ? a.move : null;
    let guard = null;
    if (mv && mv.hit && s.guard !== 'none') {
      if (this.blockPlan?.move !== mv || this.blockPlan.mf > a.mf) this.blockPlan = { move: mv, mf: a.mf, yes: s.guard === 'all' || ((m.frame * 2654435761) >>> 0) % 2 === 0 };
      this.blockPlan.mf = a.mf;
      if (this.blockPlan.yes) guard = { dx: -fwd, dy: mv.hit.lvl === 'low' ? -1 : 0, held: 0, pressed: 0 };
    }
    b.noGuard = s.action !== 'cpu' && s.action !== 'play' && (s.guard === 'none' || (mv && mv.hit && !guard));
    let r;
    if (s.action === 'cpu') { this.ai.setLevel(s.level); r = this.ai.poll(); }
    else if (s.action === 'play' && this.rec && this.recLen) {
      const k = this.playT % this.recLen; this.playT++;
      r = { dx: this.rec[k * 4] * fwd, dy: this.rec[k * 4 + 1], held: this.rec[k * 4 + 2], pressed: this.rec[k * 4 + 3] };
    } else if (s.action === 'crouch') r = { dx: 0, dy: -1, held: 0, pressed: 0 };
    else if (s.action === 'jump') r = { dx: 0, dy: m.frame % 70 < 3 ? 1 : 0, held: 0, pressed: 0 };
    else r = NONE;
    return guard && s.action !== 'cpu' ? guard : r;
  }

  // ------------------------------------------------------------------ recording (R: start / stop, P: play)
  startRecording() {
    if (!this.m) return;
    this.rec = new Float32Array(REC_MAX * 4); this.recLen = 0; this.recording = 1;
    this.a.ctrl = { poll: () => NONE }; // the player's fighter stands still meanwhile
    this.countT = 3;
    this.say('GRABANDO EN 3…');
  }
  stopRecording() {
    if (!this.recording) return;
    const had = this.recording === 2 && this.recLen > 10;
    this.recording = 0;
    this.a.ctrl = this.p1;
    if (had) { this.s.action = 'play'; this.playT = 0; this.say(`GRABACIÓN LISTA (${(this.recLen / 60).toFixed(1)} s) · EL RIVAL LA REPITE`); }
    else { this.rec = null; this.recLen = 0; this.say('GRABACIÓN CANCELADA'); }
  }
  togglePlay() {
    if (!this.rec || !this.recLen) { this.say('PRIMERO GRABA AL RIVAL (R)'); return; }
    this.s.action = this.s.action === 'play' ? 'stand' : 'play'; this.playT = 0;
    this.say(this.s.action === 'play' ? 'REPRODUCIENDO LA GRABACIÓN' : 'GRABACIÓN PARADA');
  }
  say(t) {
    const el = this.el.msg;
    if (!el) return;
    el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this._sayT); this._sayT = setTimeout(() => el.classList.remove('on'), 2200);
  }

  // ------------------------------------------------------------------ every frame of a training fight
  tick(dt, keys) {
    if (!this.m) return;
    if (keys.has('KeyR')) { if (this.recording) this.stopRecording(); else this.startRecording(); }
    if (keys.has('KeyP')) this.togglePlay();
    if (keys.has('KeyT') && this.trial) this.nextTrial(1);
    if (this.recording === 1) {
      this.countT -= dt;
      const n = Math.ceil(this.countT);
      if (n !== this._cn) { this._cn = n; if (n > 0) this.say(`GRABANDO EN ${n}…`); }
      if (this.countT <= 0) { this.recording = 2; this.recLen = 0; this.say('● GRABANDO · TÚ MANEJAS AL RIVAL · R PARA TERMINAR'); }
    }
    this.paintHist();
    this.trialEvents();
  }

  // the player's inputs, newest first: direction (towards the rival = →), buttons, frames held
  paintHist(force = false) {
    const el = this.el.hist;
    if (!el) return;
    el.classList.toggle('on', !!(this.s.history && this.m));
    if (!this.s.history || !this.a) return;
    const f = this.a.inp;
    if (!f) return;
    const btn = BTNS.filter(([b]) => f.held & b).map(([, l]) => l).join('+');
    const key = `${f.d}|${btn}`;
    const top = this.hist[0];
    if (top && top.key === key && !(f.pressed & 15)) top.n++;
    else { this.hist.unshift({ key, d: f.d, btn, n: 1 }); if (this.hist.length > 14) this.hist.pop(); }
    if (!force && (this._hf = (this._hf || 0) + 1) % 3) return;
    el.innerHTML = this.hist.map((h) => `<div><b>${ARROW[h.d] || '·'}</b><i>${h.btn || ''}</i><small>${Math.min(h.n, 99)}</small></div>`).join('');
  }

  // ------------------------------------------------------------------ combo trials
  trials() { return trialsFor(this.a.style, this.a.id); }
  toggleTrials(on = !this.trial) {
    if (!this.m) return;
    if (!on) { this.trial = null; this.el.trial?.classList.remove('on'); return; }
    const done = this.g.progress?.d.trials[this.a.id] || [];
    const list = this.trials();
    this.trialIdx = Math.max(0, list.findIndex((t, i) => !done[i]));
    this.setTrial(this.trialIdx);
  }
  setTrial(i) {
    const list = this.trials();
    this.trialIdx = (i + list.length) % list.length;
    this.trial = { ...list[this.trialIdx], at: 0, ok: false };
    this.s.action = 'stand'; this.s.guard = 'none';
    this.paintTrial();
  }
  nextTrial(d = 1) { this.setTrial(this.trialIdx + d); }
  // the player's blows of a combo, step by step (a step out of turn starts the trial over)
  trialEvents() {
    const T = this.trial, m = this.m;
    if (!T || T.ok) return;
    for (const ev of m.events) {
      if (ev.t !== 'hit' || ev.att !== this.a) continue;
      const name = this.a.moveName, step = T.steps[T.at];
      const first = T.steps[0];
      if (step && step[1].includes(name)) T.at++;
      else T.at = first[1].includes(name) && ev.def.comboHits <= 1 ? 1 : 0;
      if (T.at >= T.steps.length) { this.trialDone(); return; }
      this.paintTrial();
    }
    // the combo dropped: from the top
    if (T.at > 0 && this.b.comboHits === 0 && this.b.state !== 'move' && !['hit', 'air', 'land', 'block'].includes(this.b.state)) { T.at = 0; this.paintTrial(); }
  }
  trialDone() {
    const T = this.trial;
    T.ok = true; T.at = T.steps.length;
    const prog = this.g.progress;
    const done = (prog?.d.trials[this.a.id] || []).slice();
    const list = this.trials();
    while (done.length < list.length) done.push(false);
    done[this.trialIdx] = true;
    prog?.noteTrials(this.a.id, done);
    this.g.audio.play('uiok');
    this.g.hud.announce('¡CONSEGUIDO!', 'perfect');
    this.paintTrial();
    setTimeout(() => { if (this.trial === T) this.nextTrial(1); }, 2200);
  }
  paintTrial() {
    const el = this.el.trial, T = this.trial;
    if (!el) return;
    el.classList.toggle('on', !!T);
    if (!T) return;
    const list = this.trials(), done = this.g.progress?.d.trials[this.a.id] || [];
    const steps = T.steps.map(([c], i) => `<li class="${i < T.at ? 'hit' : i === T.at && !T.ok ? 'next' : ''}">${esc(notation(c))}</li>`).join('<li class="sep">›</li>');
    el.innerHTML = `<div class="hd">PRUEBA ${this.trialIdx + 1}/${list.length} ${done[this.trialIdx] ? '<em>✓</em>' : ''}<b>${esc(T.name)}</b></div><ol>${steps}</ol><small>${esc(T.tip)}</small>
      <div class="dots">${list.map((t, i) => `<i class="${done[i] ? 'ok' : ''} ${i === this.trialIdx ? 'cur' : ''}"></i>`).join('')}</div><div class="keys">T: siguiente prueba</div>`;
  }

  // ------------------------------------------------------------------ settings (the pause menu's AJUSTES DE ENTRENAMIENTO)
  settingsHTML() {
    const s = this.s;
    const seg = (key, opts) => `<div class="tseg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    return `<h3>AJUSTES DE ENTRENAMIENTO</h3><div class="tset">
      <div class="row"><span>Rival</span>${seg('action', [['stand', 'DE PIE'], ['crouch', 'AGACHADO'], ['jump', 'SALTA'], ['cpu', 'CPU'], ['play', 'GRABACIÓN']])}</div>
      <div class="row"><span>Nivel de la CPU</span>${seg('level', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']])}</div>
      <div class="row"><span>Bloqueo</span>${seg('guard', [['none', 'NO'], ['all', 'TODO'], ['random', 'ALEATORIO']])}</div>
      <div class="row"><span>Castiga tras bloquear</span>${seg('counter', [[false, 'NO'], [true, 'SÍ']])}</div>
      <div class="row"><span>Se recupera rodando</span>${seg('tech', [[false, 'NO'], [true, 'SÍ']])}</div>
      <div class="row"><span>Historial de entradas</span>${seg('history', [[true, 'SÍ'], [false, 'NO']])}</div>
      </div><div class="tbtns"><button class="mini" data-t="rec">● GRABAR AL RIVAL (R)</button><button class="mini" data-t="trials">${this.trial ? 'SALIR DE LAS PRUEBAS' : 'PRUEBAS DE COMBO'}</button></div>
      <p class="note">GRABAR: tras una cuenta atrás manejas tú al rival durante hasta 10 segundos (R para terminar); después repite lo grabado en bucle (P para pararlo o reanudarlo).</p>`;
  }
  bindSettings(root, onAct) {
    root.querySelectorAll('.tseg button').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const key = b.parentElement.dataset.k, raw = b.dataset.v;
      this.s[key] = raw === 'true' ? true : raw === 'false' ? false : /^\d+$/.test(raw) ? +raw : raw;
      if (key === 'action' && raw === 'play' && !this.recLen) { this.s.action = 'stand'; this.say('PRIMERO GRABA AL RIVAL (R)'); }
      this.saveSettings();
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b || (key === 'action' && x.dataset.v === this.s.action && x === b)));
      if (key === 'action') b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === this.s.action));
      this.g.audio.play('ui');
    }));
    root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); this.g.audio.play('uiok'); onAct(b.dataset.t); }));
  }
}
