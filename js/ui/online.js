// Online versus: two phones on the same WiFi (or on one phone's hotspot), each player on his own. One creates the
// fight and the other joins it: it shows up by itself in the list of games on this WiFi, or with its 4-digit code,
// or with no internet at all through two QR codes (js/net/, from PlantillaWeb's multiplayer template). Both pick
// their fighter on the same select screen, each seeing the other's cursor; the host picks the stage and the rules
// (rounds, time, input delay). The fight runs on both phones with rollback netcode (js/net/rollback.js): a
// player's own moves answer at once, the rival's arrive a few milliseconds later and a late one is corrected by
// replaying the last frames. Around it: player names, a connection meter, a shared pause with a countdown back, a
// link cut for a moment (the fight waits) or for good (back with the same code), the score of the evening and
// the rematch.
import { NetPlay } from '../net/netplay.js';
import { lanKey, LanFinder } from '../net/lan.js';
import { qrCanvas, QRScanner } from '../net/qr.js';
import { VERSION, VERSION_SHOWN } from '../net/config.js';
import { RollbackSession, FxGate, MAX_PREDICT, unpackIn, NEUTRAL } from '../net/rollback.js';
import { RAGDOLL_WANTED } from '../net/simstate.js';
import { KeyboardController, GamepadController, MergedController, KEYMAPS } from '../fight/input.js';
import { FPS } from '../fight/fighter.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// names come from another phone: plain text, short
const cleanName = (s, def = 'Rival') => String(s ?? '').replace(/[<>&"'`\\\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || def;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
const params = new URLSearchParams(location.search);
const debug = params.has('netdebug');
const ROUNDS = [[1, 'A 1'], [2, 'A 2'], [3, 'A 3']];
const TIMES = [[30, '30 s'], [60, '60 s'], [99, '99 s']];
const DELAYS = [['auto', 'AUTO'], [1, '1'], [2, '2'], [3, '3'], [4, '4']];
const NEUTRAL_INPUT = { poll: () => ({ dx: 0, dy: 0, held: 0, pressed: 0 }) };
// a part of a screen redrawn only when its content changed (the room refreshes every second for the ping: a
// button rebuilt under a finger loses the tap)
function setHTML(el, html) { if (el && el._html !== html) { el._html = html; el.innerHTML = html; } }

// why a connection did not happen, for people
function netError(e) {
  const m = (e && e.message) || '';
  if (m.startsWith('version:')) return `El otro móvil tiene la versión ${esc(m.slice(8).split('-')[0])} y este la ${esc(VERSION_SHOWN)}. Recargad la página en los dos (con internet) para tener la misma.`;
  if (m === 'notfound') return 'No encuentro esa partida. Revisa el código y que el otro móvil siga en CREAR PARTIDA.';
  if (m === 'busy' || m === 'full') return 'Esa partida ya tiene dos jugadores.';
  if (m === 'nolink') return 'No se han podido conectar. ¿Estáis los dos en la misma WiFi?';
  if (m === 'notours') return 'Ese QR no es de una partida de Puños de Barrio.';
  if (m === 'insecure') return 'La cámara solo funciona con https: abrid el juego desde su web publicada.';
  if (m === 'denied') return 'Sin permiso para la cámara: actívalo en los ajustes del navegador y vuelve a probar.';
  if (m === 'nocamera') return 'Este aparato no tiene cámara. Conectad con código o que este móvil sea el que se une.';
  return 'Sin conexión con el servidor de códigos (¿sin internet?). Usad los QR: no necesitan internet.';
}
// input delay for a round trip: the rival's input should arrive before its frame is played, with a little margin
export function autoDelay(rtt) { return Math.max(1, Math.min(4, Math.ceil((rtt / 2 + 12) / (1000 / FPS)))); }

export class Online {
  constructor(game) {
    this.g = game;
    this.root = $('#online');
    this.wrap = $('#online .ol-wrap');
    this.net = null;
    this.phase = 'off';      // off | lobby | room | join | wait | select | loading | fight | results
    this.name = cleanName(lsGet('pdb_name'), 'Jugador');
    this.peerName = 'Rival';
    let cfg = {};
    try { cfg = JSON.parse(lsGet('pdb_netcfg') || '{}') || {}; } catch (e) { /* default */ }
    this.cfg = { rounds: [1, 2, 3].includes(cfg.rounds) ? cfg.rounds : 2, time: [30, 60, 99].includes(cfg.time) ? cfg.time : 60, delay: [1, 2, 3, 4].includes(cfg.delay) ? cfg.delay : 'auto' };
    this.score = [0, 0];      // fights won tonight in this room (host's, guest's)
    this.session = null; this.match = null; this.gate = null; this.spec = null;
    this.paused = false; this.pausedBy = 0; this.countdown = 0;
    this.choice = null; this.peerChoice = null;
    // the controls of this phone online: either keyboard layout, the first gamepad and the touch controls
    this.ctrl = new MergedController(new KeyboardController(KEYMAPS.p1), new KeyboardController(KEYMAPS.p2), new GamepadController(0), game.touch);
    this.toastEl = $('#olToast');
    this.msgEl = $('#netMsg');
    this.meterEl = $('#netHud');
    this.meterT = 0;
    this.backT = 0;
    window.__online = this; // (tests)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.phase === 'fight' && this.session && !this.paused) this.requestPause(); }
      else if (this.net) this.wake(true);
    });
    // the back gesture on a phone: one step back in the menus, twice to leave a game (once only warns)
    addEventListener('popstate', () => {
      if (this.phase === 'off') return;
      if (!this.net) {
        if (this.phase === 'join') { history.pushState({ pdbOnline: 1 }, ''); this.toLobby(); } else { this.close(); this.g.toTitle(); this.g.showTitleMenu('vs'); }
        return;
      }
      history.pushState({ pdbOnline: 1 }, '');
      if (performance.now() - this.backT < 2500) { this.leave(); return; }
      this.backT = performance.now();
      this.toast('Pulsa ATRÁS otra vez para salir de la partida');
    });
    this.meterEl?.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.meterEl.classList.toggle('more'); });
  }

  get local() { return this.net && this.net.local != null ? this.net.local : 0; }
  get isHost() { return !!this.net && this.net.role === 'host'; }
  get inFight() { return this.phase === 'fight' && !!this.session; }
  names() { return this.local === 0 ? [this.name, this.peerName] : [this.peerName, this.name]; }

  // ------------------------------------------------------------------ screens
  show(html) {
    this.wrap.innerHTML = html;
    this.root.classList.add('on');
    return this.wrap.firstElementChild;
  }
  hide() { this.root.classList.remove('on'); this.wrap.innerHTML = ''; }
  toast(html, ms = 2400) {
    const t = this.toastEl;
    if (!t) return;
    t.innerHTML = html;
    t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), ms);
  }
  // a click handler on a screen: data-a actions (sound included)
  bind(el, actions) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b || b.disabled || !el.contains(b)) return;
      this.g.audio.init(); this.g.audio.play(b.dataset.a === 'back' ? 'ui' : 'uiok');
      const fn = actions[b.dataset.a];
      if (fn) fn(b);
    });
  }
  // from the title
  open() {
    this.g.audio.init();
    if (!history.state || !history.state.pdbOnline) history.pushState({ pdbOnline: 1 }, '');
    this.toLobby();
  }

  // the online menu: this phone's name, the games on this WiFi (found by themselves), create or join with a code,
  // or with QR codes when there is no internet
  toLobby() {
    this.phase = 'lobby';
    this.g.state = 'online';
    this.g.showScreen('online');
    this.g.hud.show(false);
    let finder = null, list = null;
    const el = this.show(`<div class="ol-card ol-lobby">
      <div class="ol-head"><h2>VERSUS ONLINE</h2><p>Dos móviles en la misma WiFi (o en el punto de acceso de uno de ellos). Uno crea la partida y el otro se une.</p></div>
      <div class="ol-cols">
        <div class="ol-col">
          <label class="ol-name"><span>TU NOMBRE</span><input data-k="name" maxlength="14" autocomplete="off" spellcheck="false" value="${esc(this.name)}"></label>
          <div class="ol-sub">PARTIDAS EN ESTA WIFI</div>
          <div class="ol-found" data-k="list"></div>
        </div>
        <div class="ol-col ol-acts">
          <button class="ol-btn primary" data-a="host">CREAR PARTIDA</button>
          <button class="ol-btn" data-a="join">UNIRSE CON CÓDIGO</button>
          <div class="ol-sub">SIN INTERNET, CON QR</div>
          <div class="ol-row"><button class="ol-btn sm" data-a="qrhost">CREAR CON QR</button><button class="ol-btn sm" data-a="qrjoin">UNIRSE CON QR</button></div>
          <button class="ol-btn ghost" data-a="back">◀ VOLVER</button>
        </div>
      </div>
      <div class="ol-ver">v${esc(VERSION_SHOWN)}</div></div>`);
    const input = $('[data-k=name]', el);
    const saveName = () => { this.name = cleanName(input.value, 'Jugador'); lsSet('pdb_name', this.name); };
    input.addEventListener('change', saveName);
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
    const paint = () => {
      const box = $('[data-k=list]', el);
      if (!box) return;
      if (list === null) box.innerHTML = '<div class="ol-muted"><i class="ol-spin"></i>Buscando partidas en esta WiFi…</div>';
      else if (list === 'off') box.innerHTML = '<div class="ol-muted">Sin internet no se pueden buscar: usad los QR.</div>';
      else if (!list.length) box.innerHTML = '<div class="ol-muted">Ninguna todavía. Cuando alguien pulse CREAR PARTIDA, aparecerá aquí.</div>';
      else {
        box.innerHTML = list.map((g) => (g.v !== VERSION
          ? `<button class="ol-game" disabled><b>${esc(g.code)}</b><span>OTRA VERSIÓN (v${esc(g.v.split('-')[0])})</span></button>`
          : g.n >= g.max ? `<button class="ol-game" disabled><b>${esc(g.code)}</b><span>COMPLETA</span></button>`
            : `<button class="ol-game go" data-a="found" data-code="${esc(g.code)}"><b>${esc(g.code)}</b><span>UNIRSE · ${g.n}/${g.max}</span></button>`)).join('');
      }
    };
    paint();
    const stop = () => { if (finder) finder.stop(); finder = null; };
    this.bind(el, {
      host: () => { saveName(); stop(); this.host('code'); },
      qrhost: () => { saveName(); stop(); this.host('qr'); },
      join: () => { saveName(); stop(); this.joinCode(''); },
      qrjoin: () => { saveName(); stop(); this.joinQR(); },
      found: (b) => { saveName(); stop(); this.joinCode(b.dataset.code); },
      back: () => { stop(); this.close(); this.g.toTitle(); this.g.showTitleMenu('vs'); },
    });
    lanKey().then((key) => {
      if (!el.isConnected) return;
      if (!key) { list = 'off'; paint(); return; }
      finder = new LanFinder((l) => { list = l; if (el.isConnected) paint(); }, () => el.isConnected);
      finder.start(key).catch(() => { if (el.isConnected) { list = 'off'; paint(); } });
    });
  }

  // Escape on the online screens: one step back where that is harmless
  escape() {
    if (this.phase === 'lobby') { this.close(); this.g.toTitle(); this.g.showTitleMenu('vs'); } else if (this.phase === 'join') { this.close(); this.toLobby(); }
  }

  // a new connection, wired to this module (whatever arrives for an older one is ignored)
  newNet(role) {
    if (this.net) this.net.close();
    const net = (this.net = new NetPlay(role));
    net.debug = debug;
    net.prefs = { name: this.name };
    const live = (fn) => (...a) => { if (this.net === net) fn(...a); };
    net.onjoin = live((p) => this.onJoin(p));
    net.onstall = live((p, on) => this.onStall(on));
    net.onlost = live(() => this.onLost());
    net.onrejoin = live(() => this.onRejoin());
    net.onfast = live((buf) => { if (this.session) this.session.receive(buf); });
    const on = (t, fn) => net.on(t, live(fn));
    on('bye', () => this.onBye());
    on('prof', (m) => { this.peerName = cleanName(m.name); this.refreshRoom(); this.g.onlineNames?.(); });
    on('cfg', (m) => { if (!this.isHost) { this.cfg = this.checkCfg(m); this.refreshWait(); } });
    on('lobby', (m) => {
      if (this.isHost) return;
      if (m.to === 'select') this.toSelect();
      else { this.phase = 'wait'; this.g.backToTitle(() => { if (this.net === net) this.waitScreen(); }); }
    });
    on('sel', (m) => this.g.onlineSel?.(m));
    on('stage', (m) => this.g.onlineStage?.(m.key));
    on('go', (m) => { if (!this.isHost) this.load(m); });
    on('ready', (m) => { if (this.isHost && this.spec && m.mid === this.spec.mid) { this.peerReady = true; this.maybeStart(); } });
    on('start', (m) => { if (!this.isHost && this.spec && m.mid === this.spec.mid) this.begin(); });
    on('pause', (m) => this.setPause(!!m.on, 1 - this.local));
    on('resume', () => this.startCountdown(false));
    on('nh', (m) => { if (this.session) this.session.receiveRel(m); });
    on('nsync', (m) => { if (this.session) this.session.receiveRel(m); });
    on('end', (m) => this.onPeerChoice(String(m.c), m.mid));
    on('forfeit', () => this.onForfeit(false));
    return net;
  }

  // ------------------------------------------------------------------ host: the room
  host(mode) {
    const net = this.newNet('host');
    net.mode = mode;
    this.score = [0, 0];
    this.phase = 'room';
    this.peerName = 'Rival';
    this.wake(true);
    this.roomScreen();
    if (mode === 'qr') { this.roomQR(net); return; }
    net.hostCode().then(() => {
      if (this.net !== net) return;
      this.refreshRoom();
      net.announce(); // (the phones of this WiFi see it in their list)
    }).catch((e) => { if (this.net === net) { this.roomMsg = netError(e); this.refreshRoom(); } });
  }
  roomScreen() {
    const net = this.net, qr = net.mode === 'qr';
    this.phase = 'room';
    this.g.state = 'online';
    this.g.showScreen('online');
    this.roomMsg = this.roomMsg || '';
    const el = this.show(`<div class="ol-card ol-room${qr ? ' qr' : ''}">
      <div class="ol-head"><h2>${qr ? 'CREAR CON QR' : 'CREAR PARTIDA'}</h2></div>
      <div class="ol-cols">
        <div class="ol-col ol-codecol">
          ${qr ? `<div class="ol-qrwrap">
            <div class="ol-qrstep"><b>1</b>El otro móvil escanea este QR<br><small>(VERSUS ONLINE · UNIRSE CON QR)</small><div class="ol-qr" data-k="qr"><i class="ol-spin"></i></div></div>
            <div class="ol-qrstep"><b>2</b>Enfoca aquí el QR que le salga<div class="ol-cam"><video playsinline muted></video><i class="ol-scan"></i></div></div>
          </div>` : `<div class="ol-codelbl">CÓDIGO DE LA PARTIDA</div><div class="ol-code" data-k="code"><i class="ol-spin"></i></div>`}
          <p class="ol-help" data-k="msg"></p>
        </div>
        <div class="ol-col">
          <div class="ol-slots" data-k="slots"></div>
          <div class="ol-sub">REGLAS</div>
          <div class="ol-rules" data-k="rules"></div>
          <div class="ol-row"><button class="ol-btn primary" data-a="go" disabled>¡A LUCHAR!</button><button class="ol-btn ghost" data-a="back">CANCELAR</button></div>
        </div>
      </div></div>`);
    this.bind(el, {
      go: () => this.toSelect(true),
      back: () => this.leave(),
      rule: (b) => {
        const k = b.dataset.k, v = b.dataset.v;
        this.cfg[k] = k === 'delay' && v === 'auto' ? 'auto' : +v;
        lsSet('pdb_netcfg', JSON.stringify(this.cfg));
        this.refreshRoom();
        if (this.net) this.net.send({ t: 'cfg', ...this.cfg });
      },
    });
    this.refreshRoom();
    if (qr && this._qrText) this.paintQR(this._qrText);
  }
  // the room's live parts: the code, who is in, the rules
  refreshRoom() {
    const el = $('.ol-room', this.wrap), net = this.net;
    if (!el || !net) return;
    const qr = net.mode === 'qr';
    const guest = net.guests[0];
    if (!qr) setHTML($('[data-k=code]', el), net.code ? esc(net.code) : this.roomMsg ? '—' : '<i class="ol-spin"></i>');
    const msg = $('[data-k=msg]', el);
    if (this.roomMsg) setHTML(msg, esc(this.roomMsg));
    else if (guest) setHTML(msg, `¡<b>${esc(this.peerName)}</b> está dentro! Elige las reglas y pulsa <b>¡A LUCHAR!</b>${this.h2hLine() ? `<br><small>${this.h2hLine()}</small>` : ''}`);
    else if (qr) setHTML(msg, this.camMsg ? esc(this.camMsg) : 'Sin internet: los dos móviles en la misma WiFi o en el punto de acceso de uno de ellos.');
    else setHTML(msg, net.code ? 'En el otro móvil: <b>VERSUS ONLINE</b>. En esta WiFi le sale la partida sola; si no, que pulse <b>UNIRSE CON CÓDIGO</b> y escriba este.' : 'Preparando la partida…');
    const rtt = guest ? Math.round(net.rttLow || 0) : 0;
    setHTML($('[data-k=slots]', el), `
      <div class="ol-slot p1 in"><i>1P</i><b>${esc(this.name)}</b><span>TÚ · ANFITRIÓN</span></div>
      <div class="ol-vs">VS</div>
      <div class="ol-slot p2 ${guest ? 'in' : ''}"><i>2P</i><b>${guest ? esc(this.peerName) : 'ESPERANDO<span class="ol-dots"></span>'}</b><span>${guest ? `<em class="ol-ping ${rtt > 120 ? 'bad' : rtt > 60 ? 'meh' : 'good'}">${rtt} ms</em>` : qr ? 'que escanee el QR' : 'que se una con el código'}</span></div>`);
    const seg = (k, opts) => `<div class="ol-seg"><span>${{ rounds: 'RONDAS PARA GANAR', time: 'TIEMPO', delay: 'RETARDO (FOTOGRAMAS)' }[k]}</span><div>${opts.map(([v, l]) => `<button data-a="rule" data-k="${k}" data-v="${v}" class="${String(this.cfg[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    setHTML($('[data-k=rules]', el), seg('rounds', ROUNDS) + seg('time', TIMES) + seg('delay', DELAYS) +
      `<p class="ol-note">${this.cfg.delay === 'auto' ? `Retardo automático: ${guest ? `${autoDelay(net.rttLow)} fotograma${autoDelay(net.rttLow) > 1 ? 's' : ''} con este ping` : 'según el ping'}. ` : ''}Menos retardo = respuesta más inmediata; más = menos correcciones si la WiFi va justa.</p>`);
    const go = $('[data-a=go]', el);
    go.disabled = !guest;
  }
  checkCfg(m) {
    return { rounds: [1, 2, 3].includes(m.rounds) ? m.rounds : 2, time: [30, 60, 99].includes(m.time) ? m.time : 60, delay: [1, 2, 3, 4].includes(m.delay) ? m.delay : 'auto' };
  }
  // QR room: the camera first (with its permission, Chrome writes the phone's real WiFi address in the offer
  // instead of a private name the other phone may not find), then our offer as a QR
  async roomQR(net) {
    const el = $('.ol-room', this.wrap);
    const scanner = (this.scanner = new QRScanner($('video', el)));
    this.camMsg = '';
    await scanner.start().catch((e) => { this.camMsg = netError(e); this.refreshRoom(); });
    if (this.net !== net) { scanner.stop(); return; }
    await this.nextQR(net);
    let reading = false;
    scanner.onresult = async (t) => {
      if (reading || t === this._qrText || net.guests.length) return; // (its own code, seen in a reflection)
      reading = true;
      this.roomMsg = 'Conectando…'; this.refreshRoom();
      try { await net.acceptQR(t); this.roomMsg = ''; } catch (e) { if (this.net === net) { this.roomMsg = netError(e); this.refreshRoom(); } }
      reading = false;
    };
  }
  async nextQR(net) {
    if (net.guests.length) return;
    const text = await net.hostQR();
    if (this.net !== net || !text) return;
    this._qrText = text;
    this.paintQR(text);
  }
  paintQR(text) {
    const box = $('.ol-room [data-k=qr]', this.wrap);
    if (!box) return;
    box.innerHTML = '';
    box.appendChild(qrCanvas(text, 260));
    box.dataset.text = text;
  }

  // ------------------------------------------------------------------ joining
  joinCode(preset = '') {
    this.phase = 'join';
    const el = this.show(`<div class="ol-card ol-join">
      <div class="ol-head"><h2>UNIRSE</h2><p>Escribe el código que enseña el móvil que ha creado la partida.</p></div>
      <input class="ol-codein" data-k="code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="0000">
      <p class="ol-help" data-k="msg"></p>
      <div class="ol-row"><button class="ol-btn primary" data-a="ok">UNIRSE</button><button class="ol-btn ghost" data-a="back">◀ VOLVER</button></div></div>`);
    const input = $('input', el), msg = $('[data-k=msg]', el);
    let busy = false;
    // (a connection that does not get through, once more by itself before giving up)
    const go = async (again = false) => {
      const code = input.value.replace(/\D/g, '');
      if ((busy && !again) || code.length !== 4) return;
      busy = true; input.disabled = true;
      msg.innerHTML = `<i class="ol-spin"></i>${again ? 'Otro intento' : 'Conectando'} con la partida ${esc(code)}…`;
      const net = this.newNet('guest');
      try {
        await net.joinCode(code);
        if (this.net !== net) return;
        this.joined();
      } catch (e) {
        if (this.net !== net) return;
        net.close(); this.net = null;
        if (e.message === 'nolink' && !again && el.isConnected) { go(true); return; }
        busy = false; input.disabled = false; input.value = '';
        msg.textContent = netError(e);
      }
    };
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); if (input.value.length === 4) go(); });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    this.bind(el, { ok: () => go(), back: () => { this.close(); this.toLobby(); } });
    if (preset) { input.value = preset; go(); } else setTimeout(() => input.focus(), 50);
  }
  // UNIRSE CON QR: read the host's code, then show ours for it to read
  async joinQR() {
    this.phase = 'join';
    const net = this.newNet('guest');
    const el = this.show(`<div class="ol-card ol-joinqr">
      <div class="ol-head"><h2>UNIRSE CON QR</h2></div>
      <div class="ol-qrwrap">
        <div class="ol-qrstep" data-k="cam"><b>1</b>Enfoca el QR del móvil que crea la partida<div class="ol-cam"><video playsinline muted></video><i class="ol-scan"></i></div></div>
        <div class="ol-qrstep" data-k="mine" hidden><b>2</b>Ahora ese móvil escanea este QR<div class="ol-qr" data-k="qr"></div></div>
      </div>
      <p class="ol-help" data-k="msg"></p>
      <div class="ol-row"><button class="ol-btn ghost" data-a="back">CANCELAR</button></div></div>`);
    const msg = $('[data-k=msg]', el);
    const scanner = (this.scanner = new QRScanner($('video', el)));
    this.bind(el, { back: () => { this.close(); this.toLobby(); } });
    let reading = false;
    scanner.onresult = async (t) => {
      if (reading) return;
      reading = true;
      try {
        const answer = await net.joinQR(t);
        if (this.net !== net) return;
        scanner.stop();
        $('[data-k=cam]', el).hidden = true;
        $('[data-k=mine]', el).hidden = false;
        const box = $('[data-k=qr]', el);
        box.innerHTML = ''; box.appendChild(qrCanvas(answer, 260)); box.dataset.text = answer;
        msg.innerHTML = '<i class="ol-spin"></i>Esperando a que el otro móvil lo lea…';
        await net.waitOpen(180000, 'nolink');
        if (this.net !== net) return;
        this.joined();
      } catch (e) {
        if (this.net !== net) return;
        msg.textContent = netError(e);
        const m = e.message || '';
        if (m.startsWith('version') || m === 'notours') reading = false; // the right one may come next
      }
    };
    try { await scanner.start(); } catch (e) { if (this.net === net) msg.textContent = netError(e); }
  }
  // a guest is in: its name to the host, then wait for the fighters' select
  joined() {
    this.wake(true);
    this.score = [0, 0];
    const host = this.net.host;
    this.peerName = cleanName(host && host.prefs && host.prefs.name, 'Anfitrión');
    this.net.send({ t: 'prof', name: this.name });
    this.toast('¡Conectado!');
    this.g.audio.play('uiok');
    this.waitScreen();
  }
  waitScreen() {
    this.phase = 'wait';
    this.g.state = 'online';
    this.g.showScreen('online');
    this.g.hud.show(false);
    const el = this.show(`<div class="ol-card ol-wait">
      <div class="ol-head"><h2>¡CONECTADO!</h2></div>
      <div class="ol-slots" data-k="slots"></div>
      <div class="ol-rules ro" data-k="rules"></div>
      <p class="ol-help" data-k="msg"></p>
      <div class="ol-row"><button class="ol-btn ghost" data-a="back">SALIR DE LA PARTIDA</button></div></div>`);
    this.bind(el, { back: () => this.leave() });
    this.refreshWait();
  }
  refreshWait() {
    const el = $('.ol-wait', this.wrap);
    if (!el) return;
    const rtt = Math.round(this.net ? this.net.rttLow : 0);
    setHTML($('[data-k=slots]', el), `
      <div class="ol-slot p1 in"><i>1P</i><b>${esc(this.peerName)}</b><span>ANFITRIÓN</span></div>
      <div class="ol-vs">VS</div>
      <div class="ol-slot p2 in"><i>2P</i><b>${esc(this.name)}</b><span>TÚ · <em class="ol-ping ${rtt > 120 ? 'bad' : rtt > 60 ? 'meh' : 'good'}">${rtt} ms</em></span></div>`);
    const c = this.cfg;
    setHTML($('[data-k=rules]', el), `<span>RONDAS PARA GANAR <b>${c.rounds}</b></span><span>TIEMPO <b>${c.time} s</b></span><span>RETARDO <b>${c.delay === 'auto' ? 'AUTO' : c.delay}</b></span>`);
    setHTML($('[data-k=msg]', el), `<i class="ol-spin"></i>Esperando a que <b>${esc(this.peerName)}</b> empiece…${this.h2hLine() ? `<br><small>${this.h2hLine()}</small>` : ''}`);
  }

  // ------------------------------------------------------------------ the room's events
  onJoin() {
    this.g.audio.play('uiok');
    const g = this.net.guests[0];
    this.peerName = cleanName(g && g.prefs && g.prefs.name);
    this.toast(`¡${esc(this.peerName)} se ha unido!`);
    this.net.send({ t: 'prof', name: this.name });
    this.net.send({ t: 'cfg', ...this.cfg });
    this.roomMsg = '';
    if (this.scanner) { this.scanner.stop(); this.scanner = null; }
    this.refreshRoom();
  }
  // seconds without a word from the other phone (in the background, WiFi trouble): the fight waits by itself
  onStall(on) {
    this.stalled = on;
    if (!on) this.toast('Conexión recuperada');
  }
  // the link gone: before the fight, the room is free again; during it, the guest knocks again by itself (with a
  // code) and the host waits for it
  onLost() {
    const net = this.net;
    if (!net) return;
    if (net.role === 'host') {
      if (this.phase === 'room') { net.drop(1); this.peerName = 'Rival'; this.toast('El otro móvil se ha ido'); this.refreshRoom(); if (net.mode === 'qr') this.nextQR(net); return; }
      if (net.mode !== 'code') { this.connectionGone(); return; }
      this.lostPanel(`Se ha cortado la conexión con <b>${esc(this.peerName)}</b>. Si vuelve a unirse con el código <b>${esc(net.code)}</b>, seguís donde estabais.`);
      return;
    }
    if (net.mode !== 'code') { this.connectionGone(); return; }
    this.lostPanel(`<i class="ol-spin"></i>Reconectando con la partida <b>${esc(net.code)}</b>…`);
    net.rejoin().then((ok) => {
      if (this.net !== net) return;
      if (ok) { this.hideLost(); this.toast('¡De vuelta en la partida!'); this.resendState(); } else this.lostPanel('No se ha podido volver a la partida.', true);
    });
  }
  // host: the guest is back in its seat; it gets again what its screen needs
  onRejoin() {
    this.hideLost();
    this.toast(`¡${esc(this.peerName)} ha vuelto!`);
    this.resendState();
  }
  resendState() {
    const net = this.net;
    if (!net) return;
    if (net.role === 'host') {
      net.send({ t: 'prof', name: this.name });
      net.send({ t: 'cfg', ...this.cfg });
      if (this.phase === 'select') { net.send({ t: 'lobby', to: 'select' }); this.g.onlineResend?.(); }
      if (this.phase === 'loading' && this.spec) net.send(this.spec);
      if (this.paused) net.send({ t: 'pause', on: true });
    } else {
      net.send({ t: 'prof', name: this.name });
      if (this.phase === 'select') this.g.onlineResend?.();
      if (this.phase === 'loading' && this.spec && this.loadedMid === this.spec.mid) net.send({ t: 'ready', mid: this.spec.mid });
    }
  }
  lostPanel(html, final = false, kind = 'link') {
    const m = this.msgEl;
    this.lostKind = kind;
    m.innerHTML = `<div>${html}</div><div class="ol-row"><button class="ol-btn sm ghost" data-a="leave">SALIR</button></div>`;
    m.classList.add('on', 'panel');
    m.onclick = (e) => { if (e.target.closest('[data-a=leave]')) this.leave(); };
    this.lostOn = true;
    if (final) this.lostFinal = true;
  }
  hideLost() { this.lostOn = false; this.msgEl.classList.remove('on', 'panel'); this.msgEl.innerHTML = ''; }
  // no way back (QR, or the code failed): out to the menu with a message
  connectionGone() {
    const name = this.peerName;
    this.close();
    this.afterLeave(() => this.toast(`Se ha perdido la conexión con ${esc(name)}`, 3500));
  }
  // the other phone said goodbye
  onBye() {
    const name = this.peerName, net = this.net;
    if (net.role === 'host') {
      // the room stays open (the same code, or a new QR) for someone else, or the same player again
      net.drop(1); net.unlock(); net.started = false;
      this.endSession();
      this.hidePause(); this.hideLost();
      this.peerName = 'Rival';
      this.toast(`${esc(name)} ha salido de la partida`, 3000);
      const qr = net.mode === 'qr';
      if (this.phase === 'room') { this.refreshRoom(); if (qr) this.nextQR(net); return; }
      this.phase = 'room'; this._qrText = null;
      this.g.backToTitle(() => { if (this.net !== net) return; this.roomScreen(); if (qr) this.roomQR(net); });
      return;
    }
    this.close();
    this.afterLeave(() => this.toast(`${esc(name)} ha salido de la partida`, 3000));
  }

  // ------------------------------------------------------------------ select
  // host: into the fighters' select (both phones); nobody new can join from here on
  toSelect(tell = false) {
    const net = this.net;
    if (!net) return;
    if (net.role === 'host') {
      if (!net.guests.length) return;
      if (this.scanner) { this.scanner.stop(); this.scanner = null; }
      net.lock(); net.started = true;
      if (tell) net.send({ t: 'lobby', to: 'select' });
    }
    this.phase = 'select';
    this.hide();
    this.endSession();
    this.g.mode = 'online';
    this.g.toSelect();
  }
  // the select screen's VOLVER: the host goes back to the room (the guest waits there), the guest leaves
  backFromSelect() {
    if (!this.isHost) { this.leave(); return; }
    const net = this.net;
    net.send({ t: 'lobby', to: 'room' });
    this.phase = 'room';
    this.g.backToTitle(() => { if (this.net === net) this.roomScreen(); });
  }
  // host: both have picked
  bothPicked(p1, p2, stage) {
    if (!this.isHost || this.phase !== 'select') return;
    const delay = this.cfg.delay === 'auto' ? autoDelay(this.net.rttLow) : this.cfg.delay;
    const spec = { t: 'go', mid: Math.floor(Math.random() * 1e9), p1, p2, stage, rounds: this.cfg.rounds, time: this.cfg.time, delay };
    this.net.send(spec);
    this.load(spec);
  }

  // ------------------------------------------------------------------ loading and the start
  load(m) {
    const ids = this.g.roster || [];
    const spec = { t: 'go', mid: m.mid | 0, p1: String(m.p1), p2: String(m.p2), stage: String(m.stage), rounds: [1, 2, 3].includes(m.rounds) ? m.rounds : 2,
      time: [30, 60, 99].includes(m.time) ? m.time : 60, delay: Math.max(0, Math.min(6, m.delay | 0)) };
    if (!ids.includes(spec.p1) || !ids.includes(spec.p2)) { this.toast('El otro móvil ha elegido un luchador que este no tiene. Recargad la página.'); return; }
    if (this.spec && this.spec.mid === spec.mid && this.phase === 'loading') return; // (sent again after a cut)
    this.spec = spec;
    this.phase = 'loading';
    this.peerReady = false; this.selfReady = false; this.loadedMid = null; this.loadT = 0; this.loadMsg = false;
    this.choice = null; this.peerChoice = null;
    if (this.watching) { this.watching = false; $('#replayTag').classList.remove('on'); }
    this.endSession();
    this.hide();
    this.net.busy(); // (building the fight freezes the page a moment: the other phone waits for it)
    this.g.startFight(spec.p1, spec.p2, {
      stage: spec.stage,
      online: { spec, make: () => this.makeFacade(), ready: (match) => this.loaded(match), fail: () => this.loadFailed() },
    });
  }
  // the presentation side of an online match: effects through the gate (shown once even if a frame is replayed),
  // the camera mode taken from the match state, a knockout's ragdoll spawned (or kept, if the same knockout comes
  // round again in a replay), the end of the match through the session
  makeFacade() {
    const g = this.g, gate = (this.gate = new FxGate());
    this.rd = [null, null];
    const self = this;
    return {
      fx: gate.wrap('fx', g.fx),
      hud: gate.wrap('hud', g.hud),
      audio: gate.wrap('audio', g.audio),
      camCtl: gate.wrap('cam', g.camCtl, { skip: ['setMode', 'koWinner'], pass: ['right', 'forwardFlat'] }),
      get stage() { return g.stage; },
      ragdolls: {
        clear() { for (const f of self.match?.fighters || []) f.ragdoll = null; g.ragdolls.clear(); },
        freeze() { g.ragdolls.freeze(); },
      },
      onKO(att, def, p) { self.spawnRagdoll(def, att, p); gate.run('ko|' + def.index, () => g.koEffects(att, def)); },
      onMatchEnd() { self.session?.matchEnded(); },
    };
  }
  loaded(match) {
    if (!this.spec || this.phase !== 'loading') return;
    this.match = match;
    const gate = this.gate;
    // events (hit flashes) and cosmetic chances: replayed frames give the same ones and show them once
    const ev = [];
    ev.push = function (e) { gate.run(`ev|${e.t}|${e.att ? e.att.index : ''}|${e.def ? e.def.index : e.f ? e.f.index : ''}|${e.dmg ?? ''}`, () => Array.prototype.push.call(this, e)); return this.length; };
    match.events = ev;
    let cf = -1, ci = 0;
    match.crand = () => { if (match.frame !== cf) { cf = match.frame; ci = 0; } let h = Math.imul(cf * 977 + ci++ * 131 + 7, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
    match.later = (ms, fn) => gate.run('later', () => setTimeout(() => { if (this.match === match) fn(); }, ms));
    this.g.camCtl.normalFrom = match.viewN;
    this.g.ragdolls.drivePos = false;
    this.loadedMid = this.spec.mid;
    this.freeIn = 3; // 'loaded' once the first frames are drawn (the shaders compile then)
    if (this.isHost) { this.selfReady = true; this.maybeStart(); } else this.net.send({ t: 'ready', mid: this.spec.mid });
  }
  loadFailed() {
    this.toast('No se ha podido cargar el combate. Revisa la conexión.', 3500);
    this.leave();
  }
  maybeStart() {
    if (!this.isHost || !this.selfReady || !this.peerReady || this.phase !== 'loading') return;
    this.net.send({ t: 'start', mid: this.spec.mid });
    // the guest starts as the message arrives: the host half a round trip later, so both start together
    const mid = this.spec.mid;
    setTimeout(() => { if (this.spec && this.spec.mid === mid && this.phase === 'loading') this.begin(); }, Math.min(150, (this.net.rttLow || 0) / 2));
  }
  // both ready: the intro starts on both phones and the session takes over the match
  begin() {
    const g = this.g, m = this.match;
    if (!m || this.phase !== 'loading') return;
    this.phase = 'fight';
    this.paused = false; this.countdown = 0;
    this.session = new RollbackSession({
      match: m, local: this.local, delay: this.spec.delay, host: this.isHost, gate: this.gate,
      poll: () => this.ctrl.poll(),
      send: (buf) => this.net && this.net.sendFast(buf),
      sendRel: (msg) => this.net && this.net.send(msg),
      rtt: () => (this.net ? this.net.rttLow : 0),
      onFrame: (mm) => { if (!mm.hitstop) g.ragdolls.step(1 / FPS); },
    });
    this.session.onLoad = () => this.reconcileRagdolls();
    this.lastMode = null; this.lastRound = m.round;
    g.camCtl.setMode('intro', true);
    g.netBegin(m);
    this.meterEl.classList.add('on');
    this.setNames();
  }
  // the players' names on the health bars (this phone's marked)
  setNames() {
    const n = this.names();
    document.querySelectorAll('#hud .hpwrap').forEach((w, i) => {
      const el = $('.pn', w);
      if (el) el.innerHTML = i === this.local ? `<i>TÚ</i>${esc(n[i])}` : esc(n[i]);
    });
    $('#hud').classList.add('online');
  }

  // ------------------------------------------------------------------ every frame (from the game loop)
  // the session (while a fight is on); the meters and messages always
  tick(dt) {
    if (this.freeIn && --this.freeIn === 0 && this.net) this.net.free();
    if (this.session && this.match === this.g.match) {
      const s = this.session;
      s.paused = this.paused || this.countdown > 0;
      s.update(dt);
      this.gate.flush();
      this.reconcileRagdolls();
      this.syncCamera();
      if (s.endConfirmed && this.phase === 'fight') this.matchOver();
    }
    if ((this.meterT -= dt) <= 0) { this.meterT = 0.25; this.paintMeter(); }
    if (this.phase === 'room') { if ((this._roomT = (this._roomT || 0) - dt) <= 0) { this._roomT = 1; this.refreshRoom(); } }
    if (this.phase === 'wait') { if ((this._roomT = (this._roomT || 0) - dt) <= 0) { this._roomT = 1; this.refreshWait(); } }
    if (this.countdown > 0) this.stepCountdown(dt);
    // a long wait for the other phone to load (a first download of the fighters on a slow line): a way out
    if (this.phase === 'loading') {
      this.loadT += dt;
      if (this.loadT > 15 && !this.loadMsg && !this.lostOn) {
        this.loadMsg = true;
        this.lostPanel(`<i class="ol-spin"></i>Esperando a que <b>${esc(this.peerName)}</b> termine de cargar el combate…`, false, 'load');
      }
    } else if (this.loadMsg) { this.loadMsg = false; if (this.lostOn && this.lostKind === 'load') this.hideLost(); }
  }
  // the connection meter under the timer: bars and ms, and (tapped) what the netcode is doing
  paintMeter() {
    const el = this.meterEl;
    if (!el) return;
    const s = this.session;
    if (!s || !this.net) { el.classList.remove('on'); return; }
    const rtt = Math.round(this.net.rttLow || 0), stall = s.stallT > 0.25 || this.stalled;
    // (not over the cinematic intro, unless the connection is in trouble)
    if (this.match && this.match.phase === 'intro' && !stall) { el.classList.remove('on'); return; }
    const bars = stall ? 0 : rtt < 40 ? 4 : rtt < 80 ? 3 : rtt < 140 ? 2 : 1;
    el.className = `on q${bars}${el.classList.contains('more') ? ' more' : ''}`;
    const st = s.stats, avg = st.rollbacks ? st.rolled / st.rollbacks : 0;
    el.innerHTML = `<span class="bars">${[1, 2, 3, 4].map((k) => `<i class="${k <= bars ? 'on' : ''}"></i>`).join('')}</span><span class="ms">${stall ? '···' : rtt + ' ms'}</span>` +
      `<span class="det">RETARDO ${s.delay} · CORRECCIÓN ${avg.toFixed(1)} F · ESPERAS ${st.stalls} · ${st.desyncs ? `RESINC. ${st.resyncs}` : 'SINCRONÍA OK'}</span>`;
    // waiting for the other phone (its inputs stopped coming): the notice only for a real freeze, a second long (a
    // shorter one is a hiccup, and the meter shows it)
    const waiting = !this.lostOn && !this.paused && (s.stallT > 1 || this.stalled);
    if (waiting !== !!this._waitShown) {
      this._waitShown = waiting;
      if (waiting) { this.msgEl.innerHTML = `<i class="ol-spin"></i>Esperando a <b>${esc(this.peerName)}</b>…`; this.msgEl.classList.add('on'); this.msgEl.classList.remove('panel'); }
      else if (!this.lostOn) { this.msgEl.classList.remove('on'); }
    }
  }
  // the camera's mode follows the match state (a replay may move a throw or a knockout by a frame or two)
  syncCamera() {
    const m = this.match, cam = this.g.camCtl;
    const [mode, focus] = this.g.cameraFor(m);
    if (mode === 'ko') cam.koWinner = m.fighters[m.koWinner | 0];
    const newRound = m.round !== this.lastRound;
    this.lastRound = m.round;
    if (newRound && mode === 'fight') { cam.setMode('fight', true); this.lastMode = 'fight'; this.lastFocus = null; return; }
    if (mode !== this.lastMode || focus !== this.lastFocus) {
      if (!(mode === 'intro' && this.lastMode === null)) cam.setMode(mode, false, focus);
      this.lastMode = mode; this.lastFocus = focus;
    }
  }
  // a knockout spawns the body (the simulation only needs the flag); the same knockout replayed keeps it
  spawnRagdoll(def, att, p) {
    const R = this.g.ragdolls, F = this.match ? this.match.frame : 0, prev = this.rd && this.rd[def.index];
    if (prev && prev.frame === F && R.list.includes(prev.rd)) { def.ragdoll = prev.rd; return; }
    const rd = R.spawn(def, att, p);
    this.rd[def.index] = { frame: F, rd };
  }
  // after a rewind: bodies the match no longer has go, the ones it has again come back (or are spawned, for a
  // state taken from the other phone)
  reconcileRagdolls() {
    const R = this.g.ragdolls, m = this.match;
    if (!m) return;
    const keep = R.list.filter((r) => r.f.ragdoll === r);
    if (keep.length !== R.list.length) { R.list.length = 0; R.list.push(...keep); }
    for (const f of m.fighters) {
      if (f.ragdoll === RAGDOLL_WANTED) { f.ragdoll = null; const rd = R.spawn(f, f.opp, f.boneWorld('spine02')); this.rd[f.index] = { frame: m.frame, rd }; }
      else if (f.ragdoll && !R.list.includes(f.ragdoll)) R.list.push(f.ragdoll);
    }
  }

  // ------------------------------------------------------------------ pause
  // a pause on either phone pauses both; either can go on, after a countdown that both see
  requestPause() {
    if (!this.session || this.phase !== 'fight') return;
    // (paused already: the menu again, e.g. back from the move list; during the countdown back, a new pause)
    if (this.paused && this.countdown <= 0) { this.showPause(); return; }
    this.net.send({ t: 'pause', on: true });
    this.setPause(true, this.local);
  }
  requestResume() {
    if (!this.paused || this.countdown > 0) return;
    this.net.send({ t: 'resume' });
    this.startCountdown(true);
  }
  setPause(on, by) {
    if (!this.session || this.phase !== 'fight') return;
    if (on) {
      this.paused = true; this.pausedBy = by; this.countdown = 0;
      this.showPause();
      if (by !== this.local) this.toast(`${esc(this.peerName)} ha pausado el combate`);
    } else this.startCountdown(false);
  }
  showPause() {
    const g = this.g;
    g.state = 'pause';
    const p = $('#pause');
    p.classList.add('on', 'net');
    $('#pause .who').innerHTML = `Ha pausado <b>${esc(this.pausedBy === this.local ? 'tú' : this.peerName)}</b> · el combate está parado en los dos móviles`;
    g.setupMenu('#pause .menu.net', (act) => {
      if (act === 'resume') this.requestResume();
      else if (act === 'movelist') g.showMoveList();
      else if (act === 'forfeit') this.forfeit();
    });
    g.syncTouchUI();
  }
  hidePause() {
    const p = $('#pause');
    if (!p.classList.contains('net')) return;
    p.classList.remove('on', 'net');
    $('#overlay').classList.remove('on');
    if (this.g.state === 'pause' || this.g.state === 'overlay-pause') this.g.state = 'fight';
    this.g.menu = null;
    this.g.syncTouchUI();
  }
  startCountdown(mine) {
    if (!this.paused || this.countdown > 0) return;
    this.hidePause();
    if (!mine) this.toast(`${esc(this.peerName)} sigue: ¡prepárate!`, 1600);
    this.countdown = 3; this._cdShown = 0;
  }
  stepCountdown(dt) {
    if (!this.paused) { this.countdown = 0; return; }
    this.countdown -= dt;
    const n = Math.ceil(this.countdown);
    if (n !== this._cdShown && n > 0) { this._cdShown = n; this.g.hud.announce(String(n), 'round'); this.g.audio.play('ui'); }
    if (this.countdown <= 0) { this.countdown = 0; this.paused = false; this.g.hud.announce('¡YA!', 'fight'); }
  }
  // giving up the fight: the rival wins it
  forfeit() {
    this.net.send({ t: 'forfeit' });
    this.onForfeit(true);
  }
  onForfeit(mine) {
    if (this.phase !== 'fight') return;
    this.hidePause();
    this.paused = false;
    const winner = mine ? 1 - this.local : this.local;
    this.matchOver(winner, mine ? 'Has abandonado el combate' : `${this.peerName} ha abandonado el combate`);
  }

  // ------------------------------------------------------------------ the end of a fight
  // over on both phones (confirmed: no input still on its way can change it): the score, and what next
  matchOver(forced = null, why = '') {
    if (this.phase !== 'fight') return;
    const m = this.match;
    const winner = forced !== null ? forced : m.winner;
    if (winner === 0 || winner === 1) { this.score[winner]++; this.recordH2H(winner === this.local); }
    this.lastWinner = winner; this.lastWhy = why;
    // the whole fight as both players' inputs, for VER REPETICIÓN (not after a fight given up half way)
    const s = this.session;
    if (s && forced === null) { s.logConfirmed(); this.replay = { spec: { ...this.spec }, log: s.log.slice(0, s.logN * 2), frames: s.logN, names: this.names() }; } else this.replay = null;
    this.endSession();
    this.phase = 'results';
    this.choice = null; // (the other phone's may have come already: it reached its results a moment earlier)
    // the win screen goes on locally in the background (nothing in it depends on the other phone any more)
    if (forced !== null) { this.g.state = 'netresults'; this.showResults(); return; }
    this.g.state = 'netresults';
    setTimeout(() => { if (this.phase === 'results') this.showResults(); }, 400);
  }
  // the session ends; the match (if any) keeps playing its win screen without inputs
  endSession() {
    if (this.session) { this.session.stopped = true; this.lastStats = { ...this.session.stats, delay: this.session.delay }; this.session = null; }
    if (this.match) for (const f of this.match.fighters) f.ctrl = NEUTRAL_INPUT;
    this.paused = false; this.countdown = 0;
    this.meterEl?.classList.remove('on');
    if (this._waitShown) { this._waitShown = false; if (!this.lostOn) this.msgEl.classList.remove('on'); }
  }
  showResults() {
    const g = this.g, m = this.match, n = this.names();
    const w = this.lastWinner;
    const wf = m && (w === 0 || w === 1) ? m.fighters[w] : null;
    const me = this.local;
    const panel = $('#overlay .panel');
    $('#overlay').classList.add('on');
    g.state = 'netresults';
    const card = (i) => `<div class="ol-rs ${i ? 'p2' : 'p1'} ${w === i ? 'win' : ''}"><img src="${esc(g.portraits[m.fighters[i].id])}" alt=""><b>${i === me ? '<i>TÚ</i>' : ''}${esc(n[i])}</b><span>${esc(m.fighters[i].ch.meta.display)}</span></div>`;
    panel.innerHTML = `<div class="ol-results"><h3>${wf ? `${esc(wf.ch.meta.display)} GANA` : 'EMPATE'}</h3>
      <p class="ol-why">${this.lastWhy ? esc(this.lastWhy) : w === me ? '¡Victoria!' : wf ? 'Derrota' : ''}</p>
      <div class="ol-score">${card(0)}<div class="ol-big"><em>${this.score[0]}</em><span>–</span><em>${this.score[1]}</em><small>VICTORIAS</small></div>${card(1)}</div>
      <p class="ol-h2h">${this.h2hLine()}</p>
      <p class="ol-state" data-k="state"></p>
      <div class="actions"><button data-a="rematch" class="primary">REVANCHA</button><button data-a="select">CAMBIAR LUCHADOR</button>${this.replay ? '<button data-a="replay">▶ REPETICIÓN</button>' : ''}<button data-a="quit">SALIR</button></div></div>`;
    panel.onclick = null;
    panel.querySelectorAll('[data-a]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); g.audio.play('uiok'); this.choose(b.dataset.a); }));
    this.paintChoices();
  }
  paintChoices() {
    const el = $('#overlay .ol-results [data-k=state]');
    if (!el) return;
    const lbl = { rematch: 'quiere la revancha', select: 'quiere cambiar de luchador', quit: 'se va' };
    const parts = [];
    if (this.choice) parts.push(`Tú ${lbl[this.choice]}${this.choice === 'quit' ? '' : ' ✓'}`);
    parts.push(this.peerChoice ? `${esc(this.peerName)} ${lbl[this.peerChoice]} ✓` : `<i class="ol-spin"></i>Esperando a ${esc(this.peerName)}…`);
    el.innerHTML = parts.join(' · ');
    document.querySelectorAll('#overlay .ol-results [data-a]').forEach((b) => b.classList.toggle('chosen', b.dataset.a === this.choice));
  }
  choose(c) {
    if (this.phase !== 'results' || this.choice === c || this.watching) return;
    if (c === 'quit') { this.leave(); return; }
    if (c === 'replay') { if (!this.choice) this.watchReplay(); return; }
    this.choice = c;
    this.net.send({ t: 'end', c, mid: this.spec ? this.spec.mid : 0 });
    this.paintChoices();
    this.resolveChoices();
  }
  // the other phone's choice for this fight (kept even if it arrives before this phone shows its results)
  onPeerChoice(c, mid) {
    if (!['rematch', 'select'].includes(c) || !this.spec || (mid | 0) !== this.spec.mid || (this.phase !== 'results' && this.phase !== 'fight')) return;
    this.peerChoice = c;
    if (this.phase !== 'results') return;
    this.paintChoices();
    this.resolveChoices();
  }
  // the host decides once both have chosen: a rematch (same fighters and stage) or back to the select
  resolveChoices() {
    if (!this.isHost || !this.choice || !this.peerChoice) return;
    $('#overlay').classList.remove('on');
    if (this.choice === 'rematch' && this.peerChoice === 'rematch') {
      const s = this.spec;
      this.bothPickedAgain(s);
    } else this.toSelect(true);
  }
  bothPickedAgain(s) {
    const delay = this.cfg.delay === 'auto' ? autoDelay(this.net.rttLow) : this.cfg.delay;
    const spec = { ...s, mid: Math.floor(Math.random() * 1e9), delay };
    this.net.send(spec);
    this.load(spec);
  }

  // ------------------------------------------------------------------ the replay
  // the last fight again on this phone, from both players' inputs (the fight is deterministic, so it comes out
  // exactly as it was played): broadcast camera and effects, a tap or a key ends it and the results come back
  watchReplay() {
    const r = this.replay;
    if (!r || this.watching) return;
    this.watching = true;
    $('#overlay').classList.remove('on');
    this.g.startFight(r.spec.p1, r.spec.p2, { stage: r.spec.stage, replay: r });
  }
  // the fighters' controls in a replay: the recorded input of the frame being played, then nothing
  replayCtrl(match, r, i) {
    const out = {};
    return { poll: () => { const f = match.frame - 1; return unpackIn(f >= 0 && f < r.frames ? r.log[f * 2 + i] : NEUTRAL, out); } };
  }
  replayEnded() {
    if (!this.watching) return;
    this.watching = false;
    $('#replayTag').classList.remove('on');
    if (this.phase === 'results') this.showResults();
  }

  // ------------------------------------------------------------------ head to head
  // fights won and lost against each rival (by name), kept on this phone
  h2h() { try { return JSON.parse(lsGet('pdb_h2h') || '{}') || {}; } catch (e) { return {}; } }
  recordH2H(won) {
    const all = this.h2h(), k = this.peerName.toLowerCase(), r = all[k] || [0, 0];
    r[won ? 0 : 1]++;
    all[k] = r;
    lsSet('pdb_h2h', JSON.stringify(all));
  }
  h2hLine() {
    const r = this.h2h()[this.peerName.toLowerCase()];
    return r ? `Historial contra ${esc(this.peerName)}: <b>${r[0]}</b> victoria${r[0] === 1 ? '' : 's'} · <b>${r[1]}</b> derrota${r[1] === 1 ? '' : 's'}` : '';
  }

  // ------------------------------------------------------------------ leaving
  // out of the online game (a goodbye to the other phone first) and back to the online menu
  leave() {
    this.close(true);
    this.afterLeave();
  }
  close(sayBye = false) {
    const net = this.net;
    this.net = null;
    if (this.scanner) { this.scanner.stop(); this.scanner = null; }
    if (net) { if (sayBye) net.bye(); else net.close(); }
    this.endSession();
    this.hideLost();
    this.spec = null; this.match = null; this.gate = null; this._qrText = null; this.roomMsg = ''; this.camMsg = '';
    this.replay = null; this.watching = false;
    $('#replayTag')?.classList.remove('on');
    this.phase = 'off';
    this.wake(false);
    $('#hud').classList.remove('online');
    $('#pause').classList.remove('net');
    $('#overlay').classList.remove('on');
    this.g.camCtl.normalFrom = null;
    this.g.ragdolls.drivePos = true;
    if (this.g.mode === 'online') this.g.mode = 'versus';
  }
  afterLeave(then) {
    this.g.backToTitle(() => { this.toLobby(); if (then) then(); });
  }

  // keep the screen on while two phones play (a phone going to sleep drops the game)
  async wake(on) {
    try {
      if (on && !this._wl && navigator.wakeLock && !document.hidden) {
        const wl = await navigator.wakeLock.request('screen');
        this._wl = wl;
        wl.addEventListener('release', () => { if (this._wl === wl) this._wl = null; });
      } else if (!on && this._wl) { const wl = this._wl; this._wl = null; await wl.release(); }
    } catch (e) { /* not allowed right now */ }
  }
}
export { MAX_PREDICT };
