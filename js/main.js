// Puños de Barrio — main game shell.
import * as THREE from 'three';
import { DEVICE, defaultQuality, budget, setTextureCap, goFullscreenLandscape, fullscreenSupported, toggleFullscreen, viewSize, blockPageZoom, haptic } from './engine/device.js';
import { loadCharacterData, loadCharacterMeta, buildCharacter, texturesReady, texturesPending, LOD } from './charloader.js';
import { makeFighterMaterial, makeFighterKey, applyCostume, FIGHTER_KEY } from './materials.js';
import { TerraceStage } from './stage/terrace.js';
import { StreetStage } from './stage/street.js';
import { PorcheStage } from './stage/porche.js';
import { FestivalStage } from './stage/festival.js';
import { NeonStage } from './stage/neon.js';
import { CoreStage } from './stage/core.js';
import { PostFX } from './engine/post.js';
import { setupOffline } from './engine/offline.js';
import { FX, setFxViewHeight } from './fx/fx.js';
import { Wear } from './fx/wear.js';
import { HUD } from './ui/hud.js';
import { Audio } from './audio/audio.js';
import { FightCamera } from './fight/camera.js';
import { Match, SLOWMO, FATAL_FROM } from './fight/match.js';
import { FatalityDirector } from './fight/fatality.js';
import { FPS } from './fight/fighter.js';
import { KeyboardController, GamepadController, MergedController, KEYMAPS, menuKeysPressed, menuKeys, freeKeys, padHas, keyLabel, START, B1, B2, B3, B4 } from './fight/input.js';
import { TouchController, loadTouchPrefs, saveTouchPrefs } from './ui/touch.js';
import { AIController } from './fight/ai.js';
import { STYLES } from './fight/styles.js';
import { Accessories } from './fx/accessories.js';
import { Ragdolls } from './fight/ragdoll.js';
import { ContactShadows } from './fx/contact.js';
import { Online } from './ui/online.js';
import { Snap, saveMatch, loadMatch, packSnap, unpackSnap, RAGDOLL_WANTED } from './net/simstate.js';
import { VERSION } from './net/config.js';
import { GAME_VERSION } from './version.js';
import { FightRecorder, logCtrl, quietFacade } from './fight/replay.js';
import { STAT_ROWS, playLabel, playWorthShowing } from './fight/stats.js';
import { costumesOf, costumeChoices, mirrorCostume } from './fight/costumes.js';
import { Progress } from './ui/progress.js';
import { ENDINGS } from './ui/endings.js';
import { Training } from './ui/training.js';
import { ControlsUI, controlsHelp } from './ui/controls.js';
const _fkv = new THREE.Vector3();

const ROSTER = ['alejandro', 'orion', 'camilo', 'rafa', 'zapponi', 'dani', 'noemi', 'arnau'];
// (the first one is the main stage: the title and the select screen are set in it, it is the stage picked by
// default and the arcade's first fight; the arcade goes through them in this order)
const STAGES = {
  // a real street of the neighbourhood (the user's photo): graffiti shutters and a covered car park, overcast day
  porche: { cls: PorcheStage, name: 'LA PORTERÍA', sub: 'EL LUGAR DONDE SE VIENE A TRABAJAR', dust: [0.5, 0.5, 0.52], dustLight: 0.55, amb: 'porche', music: 'porche',
    desc: 'El lugar donde se viene a trabajar: las persianas llenas de grafitis frente al aparcamiento cubierto, un día gris en la calle de siempre.', tags: ['DÍA', 'NUBLADO', 'FUNK URBANO'], acc: '#ffb347',
    grade: { sat: 1.04, slope: [1.0, 1.0, 1.02] } },
  terrace: { cls: TerraceStage, name: 'AZOTEA AL ATARDECER', sub: 'VERANO EN EL BARRIO', dust: [0.78, 0.55, 0.42], dustLight: 0.85, amb: 'terrace', music: 'terrace',
    desc: 'La terraza con piscina mientras cae el sol sobre el Mediterráneo. El verano del barrio, en lo más alto.', tags: ['ATARDECER', 'VERANO', 'DISCO LATINA'], acc: '#ff7a45',
    grade: { sat: 1.1, slope: [1.02, 1.0, 0.96] } },
  street: { cls: StreetStage, name: 'LA META 10K', sub: 'CARRERA POPULAR DEL BARRIO', dust: [0.55, 0.55, 0.56], dustLight: 0.6, amb: 'street', music: 'street',
    desc: 'La línea de meta de la carrera popular, con el público animando desde las vallas.', tags: ['MAÑANA', 'SOL', 'ROCK'], acc: '#5cc8ff',
    grade: { sat: 1.12, slope: [1.0, 1.0, 1.02] } },
  // the open-air stage of the neighbourhood's festival at golden hour (the user's photo)
  festival: { cls: FestivalStage, name: 'EL FESTIVAL', sub: 'FIESTAS DEL BARRIO', surface: 'wood', dust: [0.66, 0.6, 0.52], dustLight: 0.8, amb: 'festival', music: 'festival',
    desc: 'El escenario de las fiestas a la hora dorada: el DJ, las luces y el barrio entero bailando.', tags: ['HORA DORADA', 'FIESTA', 'CLUB'], acc: '#ffd34d',
    grade: { sat: 1.08, slope: [1.02, 1.0, 0.97] } },
  // the neighbourhood in 2099: a cyberpunk street at night in the rain, neon signs mirrored in the wet asphalt (made by code)
  neon: { cls: NeonStage, name: 'DISTRITO NEÓN', sub: 'EL BARRIO EN 2099', surface: 'wet', dust: [0.35, 0.38, 0.45], dustLight: 0.35, amb: 'neon', music: 'neon',
    desc: 'Lluvia, rótulos de neón y coches voladores sobre el asfalto mojado. Así será el barrio en 2099.', tags: ['NOCHE', 'LLUVIA', 'SYNTHWAVE'], acc: '#ff3cb4',
    grade: { sat: 1.16, slope: [1.0, 0.98, 1.05] } },
  // Orión's home: the inside of the computer where the AI lives, the fight on the motherboard (made by code)
  pc: { cls: CoreStage, name: 'DENTRO DEL PC', sub: 'EL HOGAR DE ORIÓN', surface: 'metal', dust: [0.3, 0.6, 0.7], dustLight: 0.5, amb: 'pc', music: 'pc',
    desc: 'Dentro de la torre donde vive Orión: luchas sobre la tarjeta gráfica, entre ventiladores RGB, memorias y su bomba de agua con sus ojos rojos.', tags: ['DIGITAL', 'RGB', 'ELECTRO'], acc: '#3ce8ff',
    shot: { pos: [-6.5, 6.2, 9.0], look: [5.5, 3.6, -5.5], fov: 60 },
    grade: { sat: 1.12, slope: [0.98, 1.0, 1.05] } },
};
const STAGE_KEYS = Object.keys(STAGES);
const QNAME = { low: 'BAJA', medium: 'MEDIA', high: 'ALTA', ultra: 'ULTRA' };
// tips on the loading card
const TIPS = [
  'Mantén ATRÁS para bloquear los golpes altos y medios; ABAJO-ATRÁS bloquea los bajos.',
  'Toca ARRIBA o ABAJO para esquivar de lado, y ADELANTE dos veces para un dash.',
  'Agarre: 1+3 o 2+4. Para zafarte, pulsa 1 o 2 justo cuando te agarran.',
  'Cuando la barra de vida brilla en rojo tienes furia: 1+2+3+4 lanza tu RAGE ART.',
  'Al ganar, pulsa el botón PUÑETALITY (o ARRIBA + un golpe) para rematar al rival.',
  'En la selección de luchador, Q / E (o L1 / R1 en el mando) cambian el traje.',
  'Gana el arcade con un luchador y desbloquearás su traje de CAMPEÓN.',
  'CONTINUAR, en el título, retoma tu arcade justo donde lo dejaste.',
  'En ENTRENAMIENTO tienes las pruebas de combos de cada luchador.',
  'VERSUS ONLINE: dos móviles en la misma WiFi se encuentran solos, o con un código.',
  'ESC / START: pausa y lista de movimientos de tu luchador.',
  'Los controles se cambian en OPCIONES o desde la pausa, en CONTROLES.',
  'ALEATORIO, en la pantalla de escenarios, gira la ruleta; en el arcade, cada combate cae en uno distinto.',
  'Orión no acepta contraseñas débiles.',
  'Rafa dice que irá despacito. No te fíes.',
  'Noemí siempre lleva áloe vera encima. Por si acaso.',
  'Zapponi lo hace todo espectacular, vale.',
];
// each stage's picture on the stage select (tools/stageshots.sh: the stage alone, as the fight camera sees it)
const stageShot = (k) => `assets/stages/${k}.webp`;
const MAIN_STAGE = STAGE_KEYS[0];
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
// arcade difficulty: the CPU level (1..5, see fight/ai.js) of each fight in the ladder (one per rival). Measured with
// tools/diffbench.mjs: a novice wins 8 rounds in 10 against level 1, 7 against 2, 6 against 3, 3.5 against 4, 2 against 5
const DIFFICULTY = {
  easy: { name: 'FÁCIL', ai: [1, 1, 2, 2, 3, 3] },
  normal: { name: 'NORMAL', ai: [2, 2, 3, 3, 4, 4] },
  hard: { name: 'DIFÍCIL', ai: [3, 4, 4, 5, 5, 5] },
};
const DIFF_KEYS = Object.keys(DIFFICULTY);
// the arcade run kept on the device for CONTINUAR (see saveArcade)
const SAVE_KEY = 'pdb_save', SAVE_FORMAT = 2;
// JUGADA DEL COMBATE: the best play of a fight shown again at this speed (on top of the fight's own slow motion)
const HL_SPEED = 0.42;
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.canvas = $('#game');
    // the quality: the player's own choice, or (AUTOMÁTICA, the default) the one this device has shown it can hold
    // (autoTune: measured in the fights, kept for the next time the game opens), or the device's first guess
    const userQ = lsGet('pdb_quality');
    this.autoQ = !q.get('q') && (!userQ || userQ === 'auto');
    this.quality = q.get('q') || (this.autoQ ? lsGet('pdb_quality_auto') : userQ) || defaultQuality();
    this.difficulty = DIFFICULTY[lsGet('pdb_diff')] ? lsGet('pdb_diff') : 'normal';
    if (!['low', 'medium', 'high', 'ultra'].includes(this.quality)) this.quality = defaultQuality();
    const bud = budget(this.quality);
    setTextureCap(q.get('texcap') ? +q.get('texcap') : bud.maxTex);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, bud.dprMax) * (this.quality === 'low' ? 0.85 : 1));
    const vs = viewSize();
    this.renderer.setSize(vs.w, vs.h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    LOD.hair = { low: 0.45, medium: 0.7, high: 1.0, ultra: 1.0 }[this.quality] ?? 1.0;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, vs.w / vs.h, 0.05, 600);
    this.camera.position.set(0, 1.4, 5);
    this.camCtl = new FightCamera(this.camera);
    this.fx = new FX(this.scene, this.camera);
    this.audio = new Audio();
    this.hud = new HUD({});
    this.training = new Training(this); // (ENTRENAMIENTO: the partner's settings, recording, input history, combo trials)
    this.chars = {}; this.charLoads = {}; this.meta = {};
    this.state = 'loading';
    this.acc = 0; this.last = performance.now();
    this.timeScale = 1;
    this.effects = { hitFlash: 0, radial: 0, desat: 0, letterbox: 0, fade: 0 };
    this.touch = new TouchController($('#touch'));
    this.p1ctrl = new MergedController(new KeyboardController(KEYMAPS.p1), new GamepadController(0), this.touch);
    this.p2keys = new MergedController(new KeyboardController(KEYMAPS.p2), new GamepadController(1));
    this.controlsUI = new ControlsUI(this);
    // PUÑETALITY: what is drawn and heard of the finishing move (js/fight/fatality.js), and its button on the win screen
    this.fatal = new FatalityDirector(this);
    this.fatalBtn = $('#fatalBtn');
    this.fatalBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.fatalPress(); });
    // (the target over the loser does it too)
    this.fatalMark = $('#fatalMark');
    this.fatalMark?.addEventListener('click', (e) => { e.stopPropagation(); this.fatalPress(); });
    this.roster = ROSTER;
    // the version, small in a corner (which build this is: see js/version.js); out of the way during a fight
    this.verEl = $('#ver');
    if (this.verEl) this.verEl.textContent = 'v' + GAME_VERSION;
    // two phones over the WiFi (lobby, synchronised select, rollback fight): js/ui/online.js
    this.online = new Online(this);
    this.loadAudioPrefs();
    blockPageZoom();
    addEventListener('resize', () => this.resize());
    // iOS reports stale sizes for a moment after a rotation
    addEventListener('orientationchange', () => { for (const t of [120, 400, 900]) setTimeout(() => this.resize(), t); });
    addEventListener('pointerdown', (e) => {
      this.audio.init();
      // a touch on a hybrid laptop (or after a gamepad session) brings the touch controls (back)
      if (e.pointerType === 'touch' && this.touch.opt.show !== 'never') { this.padActive = false; this.touch.enable(); document.body.classList.add('touchui'); }
      const ph = this.match?.phase;
      if (e.target?.closest?.('#fatalBtn') || e.target?.closest?.('#fatalMark')) return; // (its own click: not a tap that ends the win screen)
      if (this.state === 'fight' && this.replaying) { this.online.replayEnded(); return; }
      if (this.state === 'highlight' && this.hl?.phase === 'play') { this.endHighlight(); return; }
      if (this.state === 'ending') { this.endingTap(); return; }
      if (this.state === 'fight' && (ph === 'intro' || ph === 'matchEnd' || ph === 'fatal')) this.touch.tap();
    }, { capture: true });
    addEventListener('keydown', () => this.audio.init());
    if ((DEVICE.touch && this.touch.opt.show !== 'never') || this.touch.opt.show === 'always') { this.touch.enable(); document.body.classList.add('touchui'); }
    // a gamepad takes over from the on-screen controls
    addEventListener('gamepadconnected', () => { this.padActive = true; this.refreshModeButtons(); });
    addEventListener('gamepaddisconnected', () => { this.padActive = false; this.refreshModeButtons(); });
    $('#touchPause').addEventListener('click', () => { if (this.state === 'fight') this.pause(true); });
    // app switched away / screen locked: pause the fight and silence the audio
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveArcade(); // (a phone may close a hidden page without warning)
      if (document.hidden && this.state === 'fight' && this.match?.phase === 'fight' && !this.online.inFight) this.pause(true);
      this.audio.setHidden(document.hidden);
    });
    addEventListener('pagehide', () => this.saveArcade());
    // rotated to portrait mid-fight (touch devices play in landscape): pause behind the rotate prompt
    matchMedia('(orientation: portrait)').addEventListener?.('change', (e) => { if (e.matches && document.body.classList.contains('touchui') && this.state === 'fight') this.pause(true); });
    // mobile browsers drop the GPU context under memory pressure or after long backgrounding
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; $('#glLost')?.classList.add('on'); });
    this.canvas.addEventListener('webglcontextrestored', () => location.reload());
  }

  // on-screen controls: only while fighting (dimmed after a KO), hidden in cinematics (a tap anywhere skips the
  // intro or leaves the victory screen) and while a gamepad is in use
  syncTouchUI() {
    const verOff = this.state === 'fight' || this.state === 'netwait' || this.state === 'highlight' || this.state === 'ending';
    if (this.verEl && verOff !== this._verOff) { this._verOff = verOff; this.verEl.classList.toggle('off', verOff); }
    this.camCtl.touchFrame = this.touch.enabled && document.body.classList.contains('touchui') && !this.padActive;
    if (!this.touch.enabled) return;
    const m = this.match;
    const inFight = this.state === 'fight' && !!m && !['showcase', 'intro', 'matchEnd', 'fatal'].includes(m.phase) && !this.padActive && !this.replaying;
    const cine = !!m && (m.phase === 'ko' || m.phase === 'end');
    if (inFight !== this._tv || cine !== this._tc) { this._tv = inFight; this._tc = cine; this.touch.setVisible(inFight, cine); }
    const p1 = m?.fighters?.[this.online.inFight ? this.online.local : 0];
    this.touch.setRage(!!(inFight && p1 && p1.rage && !p1.rageUsed && m.phase === 'fight'));
  }

  loadAudioPrefs() {
    try { const v = JSON.parse(lsGet('pdb_audio') || 'null'); if (v) Object.assign(this.audio.vol, v); } catch (e) { /* ignore */ }
    // accessibility (OPCIONES): subtitles, camera shake (1 normal, 0.4 gentle, 0 none), screen flashes (1, 0.35)
    this.prefs = { subs: true, shake: 1, flash: 1, fatal: true };
    try {
      const v = JSON.parse(lsGet('pdb_prefs') || 'null') || {};
      if (typeof v.subs === 'boolean') this.prefs.subs = v.subs;
      if ([0, 0.4, 1].includes(v.shake)) this.prefs.shake = v.shake;
      if ([0.35, 1].includes(v.flash)) this.prefs.flash = v.flash;
      if (typeof v.fatal === 'boolean') this.prefs.fatal = v.fatal;
    } catch (e) { /* ignore */ }
    this.applyPrefs();
  }
  applyPrefs() {
    this.hud.subtitles = this.prefs.subs;
    this.camCtl.shakeScale = this.prefs.shake;
  }
  saveAudioPrefs() { lsSet('pdb_audio', JSON.stringify(this.audio.vol)); }
  // VERSUS needs a second controller: hidden on touch-only devices until a gamepad shows up
  refreshModeButtons() {
    const vs = document.querySelector('#title .menu button[data-act="versus"]');
    if (vs) {
      const off = this.needsPad();
      vs.classList.toggle('off', off);
      vs.querySelector('.cont').textContent = off ? 'NECESITA MANDO' : 'MISMA PANTALLA';
    }
    this.refreshContinue();
    if (this.state === 'title') this.setupMenu(`#title .menu.${this.titleMenu || 'main'}`, (act) => this.titleAction(act));
  }
  // two players on one touch screen do not fit: the local versus wants a gamepad (or a keyboard) there
  needsPad() { return document.body.classList.contains('touchui') && !this.padActive && !navigator.getGamepads?.()?.[0]; }
  // the title's main menu or its VERSUS submenu (2 players on this screen, online on two phones)
  showTitleMenu(which) {
    this.titleMenu = which;
    $('#title .menu.main').hidden = which !== 'main';
    $('#title .menu.vs').hidden = which !== 'vs';
    $('#title .menu.extras').hidden = which !== 'extras';
    if (which === 'extras') this.refreshExtras();
    this.setupMenu(`#title .menu.${which}`, (act) => this.titleAction(act));
  }

  async boot() {
    const bar = $('#loading .bar i'), tip = $('#loading .tip'), status = $('#loading .st');
    const tips = ['Consejo: mantén atrás para bloquear golpes altos y medios.', 'Consejo: agáchate (abajo-atrás) para bloquear los golpes bajos.',
      'Consejo: toca arriba o abajo para esquivar lateralmente.', 'Consejo: abajo-adelante + 2 lanza al rival por los aires.', 'Consejo: 1+3 agarra; pulsa 1 o 2 para zafarte de un agarre.', 'Consejo: pulsa un botón justo al caer al suelo para recuperarte rodando.'];
    tip.textContent = tips[Math.floor(Math.random() * tips.length)];
    // (the bar runs on its own while the code downloads: index.html; from here on it shows the real progress)
    $('#loading .bar').classList.remove('indet');
    let shown = 0;
    const prog = (p) => { shown = Math.max(shown, p); bar.style.width = `${Math.round(shown * 100)}%`; };
    const say = (t) => { if (status) status.textContent = t; };
    prog(0.08);
    const T0 = performance.now(), times = (window.__bootTimes = {}), mark = (k) => { times[k] = Math.round(performance.now() - T0); };
    // the first screen only waits for the code, the stage and the menus' small files: the title comes up over the
    // stage, the two fighters of its backdrop walk in as soon as they have arrived and the rest of the roster follows
    // quietly, one at a time (a fighter is 5 to 8 MB: all of them first made a phone wait half a minute)
    // the game kept on the phone (published site only): a newer version stored and waiting shows a button to switch
    setupOffline((apply) => {
      if (document.querySelector('#swUpdate')) return;
      const b = document.createElement('button'); b.id = 'swUpdate'; b.textContent = 'NUEVA VERSIÓN DISPONIBLE · TOCA PARA ACTUALIZAR';
      b.onclick = () => { b.disabled = true; b.textContent = 'ACTUALIZANDO…'; apply(); };
      document.body.appendChild(b);
    });
    this.stagePick = STAGES[q.get('stage')] ? q.get('stage') : MAIN_STAGE;
    say(`Preparando ${STAGES[this.stagePick].name.toLowerCase().replace(/^./, (c) => c.toUpperCase())}…`);
    const LM = THREE.DefaultLoadingManager;
    LM.onProgress = (url, done, total) => prog(0.08 + 0.72 * done / Math.max(1, total));
    await this.setStage(this.stagePick, false);
    LM.onProgress = undefined; // (three.js calls it whenever it is not undefined)
    mark('stage');
    prog(0.8);
    // portraits (pre-rendered)
    this.portraits = {};
    for (const id of ROSTER) this.portraits[id] = `assets/portraits/${id}.jpg`;
    this.hud.portraits = this.portraits;
    // menus only need the descriptors; meshes load on demand
    say('Preparando a los luchadores…');
    const metas = await Promise.all(ROSTER.map(id => loadCharacterMeta(id).catch(() => null)));
    // a fighter whose files cannot be loaded is left out of the roster instead of stopping the boot
    for (let i = ROSTER.length - 1; i >= 0; i--) {
      if (metas[i]) this.meta[ROSTER[i]] = metas[i];
      else { console.warn('fighter not available:', ROSTER[i]); ROSTER.splice(i, 1); }
    }
    // achievements, endings and unlocks kept on this device (js/ui/progress.js)
    this.progress = new Progress({ roster: ROSTER, stageKeys: STAGE_KEYS });
    mark('metas');
    prog(0.86);
    say('Montando el escenario…');
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.quality);
    mark('post');
    this.bakeStage();
    mark('bake');
    this.applyGrade();
    this.accessories = new Accessories();
    this.ragdolls = new Ragdolls(this.scene);
    // stage obstacles (whichever stage is current): ragdolls stop at walls / barriers, cameras stay out of the set
    this.ragdolls.clampWalk = (p, r) => this.stage?.clampWalk?.(p, r);
    this.camCtl.clampCam = (p) => this.stage?.clampCam?.(p) || p;
    this.contact = new ContactShadows(this.scene);
    // until the backdrop's fighters are there, the title frames the stage where they will stand
    this.titleGhosts = [{ pos: new THREE.Vector3(-1.4, 0, 0), yaw: Math.PI / 2 }, { pos: new THREE.Vector3(1.4, 0, 0), yaw: -Math.PI / 2 }];
    // the shaders compiled before the first frame, in parallel where the GPU allows it (KHR_parallel_shader_compile):
    // the first frame used to compile them all at once and freeze the page for seconds
    say('Encendiendo los focos…');
    this.resize();
    try { await this.renderer.compileAsync?.(this.scene, this.camera); } catch (e) { /* compiled on first use */ }
    mark('compile');
    prog(1);
    this.loop();
    mark('loop');
    setTimeout(() => {
      mark('title');
      $('#loading').classList.remove('on');
      if (q.get('demo')) {
        this.mode = 'versus';
        const p1 = q.get('p1') || 'alejandro', p2 = q.get('p2') || 'rafa';
        this.startFight(p1, p2, { demo: true, ai: +(q.get('ai') || 3), training: q.get('demo') === 'training' });
      } else {
        this.toTitle();
        if (q.get('screen') === 'select') { this.mode = 'arcade'; this.toSelect(); }
        // (captures: the stage select, after a versus pick: ?frames=0&screen=stage[&cur=<n>])
        if (q.get('screen') === 'stage') { this.mode = 'versus'; this.toSelect(); this.sel.i = [1, 4]; this.sel.done = [true, true]; this.toStageSelect(); if (q.get('cur')) this.stageCursor(+q.get('cur'), true); }
        if (q.get('frames') === '0') setTimeout(() => (window.__ready = true), 2500);
      }
    }, 300);
    // then the backdrop's two fighters (they walk in if the title is still up) and the rest of the roster
    const ids = this.pickShowcase();
    try {
      await Promise.all(ids.map(id => this.ensureChar(id)));
      if (this.state === 'title' && !this.match) { this.showcaseIds = ids; await this.setupShowcase({ entrance: true }); }
      mark('showcase');
    } catch (e) { console.warn('title fighters:', e.message); }
    for (const id of ROSTER) { try { await this.ensureChar(id); } catch (e) { /* retried on demand */ } }
    mark('roster');
  }

  // dynamic resolution: keep ~60 fps by scaling the internal render resolution
  dynRes(dt) {
    if (q.get('nodynres')) return;
    const d = this.dyn || (this.dyn = { t: 0, acc: 0, n: 0, scale: 1, base: this.renderer.getPixelRatio() });
    d.acc += dt; d.n++; d.t += dt;
    if (d.t < 1.5) return;
    const avg = d.acc / d.n;
    let ns = d.scale;
    if (avg > 0.021 && d.scale > 0.6) ns = Math.max(0.6, d.scale * 0.88);
    else if (avg < 0.0135 && d.scale < 1) ns = Math.min(1, d.scale * 1.08);
    // (online, only down during a fight: every change rebuilds the render targets, a stutter the other phone would
    // have to wait for; it climbs back between fights)
    if (this.online.inFight && ns > d.scale) ns = d.scale;
    if (this.autoQ && !this.online.inFight && this.state === 'fight') this.autoTune(avg, d.scale);
    d.t = 0; d.acc = 0; d.n = 0;
    if (Math.abs(ns - d.scale) > 0.01) {
      d.scale = ns;
      this.renderer.setPixelRatio(d.base * ns);
      this.resize();
    }
  }

  // AUTOMÁTICA: a device that cannot hold its frame rate even at the lowest render resolution goes one quality down
  // (six seconds of it), one that has plenty to spare at full resolution for a minute goes one up (as far as ALTA);
  // kept for the next time the game opens (the quality is set as it starts), and said once
  autoTune(avg, scale) {
    const a = this.auto || (this.auto = { slow: 0, fast: 0, done: false });
    if (a.done) return;
    const order = ['low', 'medium', 'high', 'ultra'], i = order.indexOf(this.quality);
    a.slow = avg > 0.026 && scale <= 0.61 ? a.slow + 1 : Math.max(0, a.slow - 1);
    a.fast = avg < 0.0115 && scale >= 0.99 ? a.fast + 1 : 0;
    let to = null;
    if (a.slow >= 4 && i > 0) to = order[i - 1];
    else if (a.fast >= 40 && i >= 0 && i < 2) to = order[i + 1];
    if (!to) return;
    a.done = true;
    lsSet('pdb_quality_auto', to);
    this.online.toast?.(`Calidad <b>${QNAME[to]}</b> para este dispositivo, desde la próxima vez que abras el juego`, 4500);
  }

  resize() {
    const { w, h } = viewSize();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
  }

  // ------------------------------------------------------------------ stages
  // (a stage being built is not built twice: the stage select starts building the one picked while its ¡A LUCHAR!
  // plays, and the fight that follows waits for that same build)
  setStage(key, bake = true) {
    if (!STAGES[key]) key = MAIN_STAGE;
    if (this._stageBuild?.key === key) return this._stageBuild.p;
    if (this.stage && this.stageKey === key) return Promise.resolve();
    const build = { key, p: null };
    build.p = this.buildStage(key, bake).finally(() => { if (this._stageBuild === build) this._stageBuild = null; });
    this._stageBuild = build;
    return build.p;
  }
  async buildStage(key, bake) {
    this.disposeStage();
    const def = STAGES[key];
    this.stage = new def.cls(this.renderer, this.scene, this.quality);
    this.stageKey = key;
    this.audio.surface = def.surface || 'concrete';
    this.audio.setSpace(key); // (the blows ring in the stage's own space)
    this.stage.beatClock = () => this.audio.musicBeat(); // (the festival's lights and dancers keep the music's time)
    this.stage.fx = this.fx; this.stage.audio = this.audio; // (a stage that answers the fight: splashes, sparks, glass)
    this.fx.dustColor = new THREE.Color(...def.dust);
    this.fx.dustLight = def.dustLight ?? 0.8;
    this.camCtl.koView = this.stage.koView || null;
    await this.stage.ready();
    if (bake) this.bakeStage();
    this.applyGrade();
  }
  // per-stage colour grade (sunset warmth vs. neutral morning)
  applyGrade() {
    const g = STAGES[this.stageKey]?.grade;
    if (!this.post || !g) return;
    this.post.u.saturation.value = g.sat;
    this.post.u.slope.value.set(...g.slope);
  }
  // reflections are captured without fighters in the scene
  bakeStage() {
    const hidden = [];
    this.scene.traverse(o => { if (o.userData?.fighter && o.visible) { o.visible = false; hidden.push(o); } });
    this.stage.bakeEnvironment();
    hidden.forEach(o => (o.visible = true));
  }
  disposeStage() {
    const st = this.stage;
    if (!st) return;
    this.scene.remove(st.group);
    const mats = new Set(), texs = new Set();
    st.group.traverse(o => {
      o.geometry?.dispose?.();
      o.dispose?.(); // lights (shadow maps), reflectors (render targets), instanced meshes
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach(x => mats.add(x));
    });
    for (const m of mats) {
      for (const k of Object.keys(m)) if (m[k]?.isTexture) texs.add(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) texs.add(u.value);
      m.dispose();
    }
    texs.forEach(t => t.dispose());
    this.scene.environment?.dispose?.(); this.scene.environment = null;
    this.scene.fog = null;
    this.stage = null;
  }
  stageFor(opts) {
    if (opts.stage) return opts.stage;
    if (this.mode === 'arcade' && this.arcade) return this.arcade.stages?.[this.arcade.stage] || STAGE_KEYS[this.arcade.stage % STAGE_KEYS.length];
    return this.stagePick || MAIN_STAGE;
  }

  // mesh data for a fighter, fetched once (a failed fetch is retried the next time it is needed)
  ensureChar(id) {
    if (this.chars[id]) return Promise.resolve(this.chars[id]);
    if (!this.charLoads[id]) {
      this.charLoads[id] = loadCharacterData(id).then(d => (this.chars[id] = d)).catch((e) => { delete this.charLoads[id]; throw e; });
    }
    return this.charLoads[id];
  }
  pickShowcase() {
    const ids = [ROSTER[Math.floor(Math.random() * ROSTER.length)], ROSTER[Math.floor(Math.random() * ROSTER.length)]];
    if (ids[0] === ids[1]) ids[1] = ROSTER[(ROSTER.indexOf(ids[0]) + 2) % ROSTER.length];
    return ids;
  }
  // costume: index into js/fight/costumes.js (0: the clothes of the photo)
  makeFighterModel(id, costume = 0) {
    const key = makeFighterKey(), wear = new Wear();
    const ch = buildCharacter(this.chars[id], (def, base, lt, name) => wear.material(makeFighterMaterial(def, base, lt, name, key), def.type));
    ch.fighterKey = key; ch.wear = wear;
    this.accessories.attach(ch, STYLES[id], this.chars[id].meta);
    ch.group.userData.fighter = true;
    ch.costumeIdx = costume | 0;
    if (ch.costumeIdx) applyCostume(ch, costumesOf(id)[ch.costumeIdx]);
    // CABEZONES (EXTRAS, unlocked with the arcade): the head drawn bigger (only drawn: the fight measures the real one)
    if (this.progress?.d.bigHead) ch.bones.head?.scale.setScalar(1.6);
    return ch;
  }
  // the champion's costume of a fighter: unlocked by winning the arcade with him (js/ui/progress.js)
  champUnlocked(id) { return !!this.progress?.champ?.[id]; }
  costumeList(id) { return costumeChoices(id, (x) => this.champUnlocked(x)); }

  // ------------------------------------------------------------------ showcase / title
  // entrance: the first time, the fighters walk in from beyond the edges of the shot to where the title framed the
  // empty stage for them (js/main.js boot)
  async setupShowcase({ entrance = false } = {}) {
    const ids = this.showcaseIds || this.pickShowcase();
    this.showcaseIds = null;
    await Promise.all(ids.map(id => this.ensureChar(id)));
    this.clearFighters();
    const chars = ids.map(id => this.makeFighterModel(id));
    // (their shaders compiled before they appear: no hitch as they walk into the title)
    if (entrance) { try { await Promise.all(chars.map((c) => this.renderer.compileAsync?.(c.group, this.camera, this.scene))); } catch (e) { /* on first use */ } }
    chars.forEach(c => this.scene.add(c.group));
    this.match = new Match(this, chars, ids, { rounds: 2 });
    for (const f of this.match.fighters) f.ctrl = null;
    this.match.startIntro();
    this.match.phase = 'showcase';
    this.match.fighters.forEach(f => { f.setState('idle'); f.play('idle', 1); });
    this.entrance = null;
    if (entrance) {
      for (const f of this.match.fighters) {
        f.pos.x = Math.sign(f.pos.x) * 4.3; f.prevPos.copy(f.pos);
        f.setState('walkF'); f.play('walkF', 1);
      }
      this.entrance = { m: this.match };
    }
    this.camCtl.setMode('fight', true);
  }
  clearFighters() {
    this.fatal?.dispose(); this.syncFatalButton?.(null);
    if (this.match) for (const f of this.match.fighters) { this.scene.remove(f.ch.group); f.ch.group.traverse(o => o.geometry?.dispose?.()); }
    this.match = null;
    this.entrance = null;
    this.camCtl.normalFrom = null; // (a det match's side view: the next one sets its own)
    this.contact?.clear();
    this.ragdolls?.clear();
  }

  refreshDifficulty() {
    const el = $('#title .diffv');
    if (el) el.textContent = DIFFICULTY[this.difficulty].name;
  }
  // back to the title from a finished or abandoned fight: the fighters go, the title showcase comes back (then: a
  // screen to show over it instead of the title menu, as the online menu)
  backToTitle(then = null) {
    this.arcadeLive = false; // (an arcade run left here keeps the moment it was saved at)
    this.training.stop();
    this.fightSeq = (this.fightSeq || 0) + 1; // cancels a fight that may still be loading
    $('#fade').classList.remove('busy'); this.fade(false);
    $('#pause').classList.remove('on'); $('#overlay').classList.remove('on');
    this.clearFighters();
    this.audio.stopMusic?.();
    this.state = 'loading';
    this.setupShowcase().then(() => {
      if (!then) { this.toTitle(); return; }
      this.hud.show(false);
      this.effects.letterbox = 0;
      this.audio.music('menu');
      then();
    });
  }
  toTitle() {
    this.arcadeLive = false;
    this.state = 'title';
    this.showScreen('title');
    this.refreshDifficulty();
    this.hud.show(false);
    this.menuIndex = 0;
    this.titleMenu = 'main';
    $('#title .menu.main').hidden = false; $('#title .menu.vs').hidden = true; $('#title .menu.extras').hidden = true;
    this.refreshModeButtons(); // (sets the menu up with the buttons that show: CONTINUAR)
    $('#title .presskey').textContent = document.body.classList.contains('touchui') ? 'TOCA UNA OPCIÓN' : 'PULSA ENTER O ⓧ';
    this.audio.music('menu');
    this.audio.ambience(STAGES[this.stageKey]?.amb || STAGES[MAIN_STAGE].amb);
    this.effects.letterbox = 0;
  }
  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) if (s.id !== 'hud' && s.id !== 'loading') s.classList.toggle('on', s.id === id);
  }
  setupMenu(sel, cb) {
    const btns = [...document.querySelectorAll(`${sel} button`)].filter((b) => !b.hidden && b.style.display !== 'none');
    this.menu = { btns, cb, idx: 0 };
    btns.forEach((b, i) => {
      // (a mouse over a button while an overlay is up and no menu is live: nothing to move)
      b.onpointerenter = (e) => { if (e.pointerType !== 'mouse' || !this.menu || this.menu.btns !== btns) return; this.menu.idx = i; this.refreshMenu(); };
      b.onclick = () => { this.audio.init(); this.audio.play('uiok'); cb(b.dataset.act); };
    });
    this.refreshMenu();
  }
  refreshMenu() { this.menu.btns.forEach((b, i) => b.classList.toggle('sel', i === this.menu.idx)); }
  // k: what this frame's keys mean on a menu (either player's, js/fight/input.js menuKeys), pad: the first pad's
  menuInput(k, pad) {
    if (!this.menu) return;
    const row = this.state === 'results';
    const up = k.up || pad.up || (row && (k.left || pad.left));
    const down = k.down || pad.down || (row && (k.right || pad.right));
    if (up) { this.menu.idx = (this.menu.idx + this.menu.btns.length - 1) % this.menu.btns.length; this.refreshMenu(); this.audio.play('ui'); }
    if (down) { this.menu.idx = (this.menu.idx + 1) % this.menu.btns.length; this.refreshMenu(); this.audio.play('ui'); }
    if (k.ok || pad.ok) { this.audio.play('uiok'); this.menu.cb(this.menu.btns[this.menu.idx].dataset.act); }
  }
  titleAction(act) {
    this.audio.init();
    // phones: go fullscreen + landscape on the first tap (needs a user gesture; unsupported on iPhone Safari)
    if (document.body.classList.contains('touchui') && !this.fsAsked && !DEVICE.standalone && fullscreenSupported()) { this.fsAsked = true; goFullscreenLandscape(); }
    if (act === 'versus' && this.needsPad()) { this.online.toast('Para jugar dos en el mismo aparato hace falta un mando (o un teclado). En dos móviles: ONLINE.', 3200); return; }
    if (act === 'arcade' || act === 'versus' || act === 'training') { this.mode = act; this.toSelect(); }
    else if (act === 'vsmenu') this.showTitleMenu('vs');
    else if (act === 'extras') this.showTitleMenu('extras');
    else if (act === 'back') this.showTitleMenu('main');
    else if (act === 'achievements') this.showAchievements();
    else if (act === 'endings') this.showEndings();
    else if (act === 'bighead') { if (this.progress.d.bigHeadUnlocked) { this.progress.setBigHead(!this.progress.d.bigHead); this.refreshExtras(); this.setupShowcase(); } else this.online.toast('Se desbloquea al ganar el modo arcade.', 2600); }
    else if (act === 'online') this.online.open();
    else if (act === 'continue') this.continueArcade();
    else if (act === 'difficulty') { this.difficulty = DIFF_KEYS[(DIFF_KEYS.indexOf(this.difficulty) + 1) % DIFF_KEYS.length]; lsSet('pdb_diff', this.difficulty); this.refreshDifficulty(); }
    else if (act === 'options') this.showOptions();
    else if (act === 'controls') this.showControls();
  }

  // ------------------------------------------------------------------ select
  // two players choose on this screen (versus, or online: each phone moves its own cursor and sees the other's)
  isVs() { return this.mode === 'versus' || this.mode === 'online'; }
  // the cursor this screen's tap / hover / keys move (-1: none, everybody has picked)
  selTurn() {
    if (this.mode === 'online') { const L = this.online.local; return this.sel.done[L] ? -1 : L; }
    return !this.sel.done[0] ? 0 : (this.mode === 'versus' && !this.sel.done[1] ? 1 : -1);
  }
  // (keep: back from the stage select, the picks as they were, the last one undone by the caller)
  toSelect(keep = false) {
    this.state = 'select';
    this.audio.preloadVoices(ROSTER); // the pick shout plays straight away
    this.showScreen('select');
    this.menu = null;
    const online = this.mode === 'online';
    const grid = $('#select .grid');
    grid.innerHTML = '';
    grid.style.setProperty('--n', ROSTER.length); // (the cards shrink to fit the row: index.html)
    ROSTER.forEach((id) => {
      const c = document.createElement('div');
      c.className = 'card'; c.dataset.id = id;
      c.innerHTML = `<img src="${this.portraits[id]}" alt=""><div class="nm">${this.meta[id].display}</div>`;
      c.onclick = () => {
        const k = this.selTurn();
        if (k < 0) return;
        const idx = ROSTER.indexOf(id);
        // touch has no hover: the first tap shows the fighter, a second tap on the same card picks him
        if (document.body.classList.contains('touchui') && this.sel.i[k] !== idx) { this.sel.i[k] = idx; this.audio.play('ui'); this.refreshSel(); this.selMoved(k); return; }
        this.audio.play('uiok'); this.sel.i[k] = idx; this.confirmSel(k);
      };
      // hover preview for real mice only (touch screens send emulated mouse events right before the click)
      c.onpointerenter = (e) => { if (e.pointerType !== 'mouse') return; const k = this.selTurn(); if (k >= 0) { this.sel.i[k] = ROSTER.indexOf(id); this.refreshSel(); this.selMoved(k); } };
      grid.appendChild(c);
    });
    if (!keep || !this.sel) this.sel = { i: [0, 1], done: [false, !this.isVs()], c: [0, 0] };
    $('#selBack').onclick = () => {
      this.audio.play('ui');
      if (online) { const L = this.online.local; if (this.sel.done[L]) { this.sel.done[L] = false; this.refreshSel(); this.selMoved(L); } else this.online.backFromSelect(); return; }
      if (this.sel.done[1] && this.mode === 'versus') { this.sel.done[1] = false; this.refreshSel(); } else if (this.sel.done[0] && this.mode === 'versus') { this.sel.done[0] = false; this.refreshSel(); } else this.toTitle();
    };
    // (the stage select's pictures, fetched quietly while the fighters are picked: they are there when it opens)
    if (!this._ssPre) { this._ssPre = true; setTimeout(() => STAGE_KEYS.forEach((k) => { const im = new Image(); im.fetchPriority = 'low'; im.decoding = 'async'; im.src = stageShot(k); }), 1500); }
    $('#selHint').textContent = document.body.classList.contains('touchui') ? (online ? 'Toca tu luchador para verlo · tócalo otra vez para elegirlo' : 'Toca un luchador para verlo · tócalo otra vez para elegirlo') : '';
    this.refreshStageBar();
    this.refreshSel();
    this.previewIds = [null, null];
    if (online) this.onlineResend();
  }
  refreshStageBar() {
    const mode = this.mode === 'arcade' ? 'MODO ARCADE' : this.mode === 'versus' ? 'VERSUS' : this.mode === 'online' ? 'ONLINE' : 'ENTRENAMIENTO';
    const bar = $('#select .stagebar');
    // (the stage is picked on the next screen: toStageSelect)
    bar.textContent = this.mode === 'arcade' ? `${mode} · DIFICULTAD ${DIFFICULTY[this.difficulty].name}` : mode;
  }
  // online: this phone's cursor to the other phone (by fighter id: the rosters could differ) and its costume
  selMoved(k) {
    if (this.mode !== 'online' || k !== this.online.local || !this.online.net) return;
    this.online.net.send({ t: 'sel', id: ROSTER[this.sel.i[k]], done: !!this.sel.done[k], c: this.sel.c[k] | 0 });
  }
  // the costume player k picked, kept valid for the fighter under the cursor
  selCos(k) {
    const id = ROSTER[this.sel.i[k]], list = this.costumeList(id);
    return list.includes(this.sel.c[k]) ? this.sel.c[k] : 0;
  }
  // the costume each player will wear: the second player of a mirror match in another one than the first
  selCostumes() {
    const c0 = this.selCos(0);
    if (!this.isVs()) return [c0, 0];
    const id0 = ROSTER[this.sel.i[0]], id1 = ROSTER[this.sel.i[1]];
    return [c0, mirrorCostume(id0, c0, id1, this.selCos(1), this.mode === 'online' ? null : this.costumeList(id1))];
  }
  cycleCostume(k, d) {
    const s = this.sel;
    if (!s || s.done[k] || (this.mode === 'online' && k !== this.online.local)) return;
    const list = this.costumeList(ROSTER[s.i[k]]);
    if (list.length < 2) return;
    const at = Math.max(0, list.indexOf(this.selCos(k)));
    s.c[k] = list[(at + d + list.length) % list.length];
    this.audio.play('ui'); this.refreshSel(); this.selMoved(k);
  }
  onlineResend() {
    if (this.mode !== 'online' || (this.state !== 'select' && this.state !== 'stage')) return;
    this.selMoved(this.online.local);
    if (this.online.isHost && this.ss) this.online.net?.send({ t: 'stage', key: this.stageItems()[this.ss.cur] });
  }
  // the other phone's cursor
  onlineSel(m) {
    if (this.mode !== 'online' || !this.sel) return;
    // (on the stage select: the other player went back to change his fighter, so both go back)
    if (this.state === 'stage' && !m.done && !this.ss?.done) this.toSelect(true);
    if (this.state !== 'select') return;
    const R = 1 - this.online.local, idx = ROSTER.indexOf(String(m.id));
    if (idx < 0) return;
    const was = this.sel.done[R];
    this.sel.i[R] = idx; this.sel.done[R] = !!m.done;
    this.sel.c[R] = Math.max(0, Math.min(costumesOf(ROSTER[idx]).length - 1, m.c | 0));
    if (m.done && !was) { this.audio.preloadVoices([ROSTER[idx]]); this.audio.voice({ id: ROSTER[idx] }, 'attack'); } else this.audio.play('ui');
    this.refreshSel();
    this.onlineBoth();
  }
  // the host's cursor on the stage select (a stage, or 'random'), as the guest's phone shows it
  onlineStage(key) {
    if (this.mode !== 'online' || this.online.isHost || (!STAGES[key] && key !== 'random')) return;
    this.ssRemote = key;
    if (STAGES[key]) this.stagePick = key;
    if (this.state === 'stage' && this.ss && !this.ss.done) { const i = this.stageItems().indexOf(key); if (i !== this.ss.cur) { this.ss.cur = i; this.audio.play('ui'); this.refreshStageSel(); } }
  }
  onlineNames() { if (this.mode === 'online' && this.state === 'select') this.refreshSel(); }
  // both have picked: a moment to see both ready, then both phones on to the stage select (the host picks there)
  onlineBoth() {
    if (!this.sel.done[0] || !this.sel.done[1]) return;
    clearTimeout(this._goT);
    this._goT = setTimeout(() => {
      if (this.state !== 'select' || this.mode !== 'online' || !this.sel.done[0] || !this.sel.done[1]) return;
      this.toStageSelect();
    }, 700);
  }
  refreshSel() {
    const vs = this.isVs();
    const cards = [...document.querySelectorAll('#select .card')];
    cards.forEach((c, k) => {
      c.classList.toggle('p1', k === this.sel.i[0]);
      c.classList.toggle('p2', vs && k === this.sel.i[1]);
      c.querySelectorAll('.tag').forEach(t => t.remove());
      if (k === this.sel.i[0]) c.insertAdjacentHTML('beforeend', '<div class="tag t1">1P</div>');
      if (vs && k === this.sel.i[1]) c.insertAdjacentHTML('beforeend', '<div class="tag t2">2P</div>');
    });
    // online: whose side is whose, and this phone's marked
    const who = (i) => {
      if (this.mode !== 'online') return '';
      const n = this.online.names(), me = i === this.online.local;
      return `<div class="who ${me ? 'me' : ''}">${me ? '<i>TÚ</i>' : ''}${n[i].replace(/[&<>"']/g, '')}</div>`;
    };
    const cosNow = this.selCostumes();
    const info = (el, id, ready, i) => {
      const s = STYLES[id], st = s.stats;
      const bar = (v, mx) => `<span class="trk"><i style="width:${Math.round(v / mx * 110)}px"></i></span>`;
      // the costume: arrows to change it (Q / E, - / =, L1 / R1, or a tap), a lock where the champion's one is still locked
      const list = this.costumeList(id), all = costumesOf(id), mine = this.mode !== 'online' || i === this.online.local;
      const ci = cosNow[i], arrows = list.length > 1 && !ready && mine;
      const locked = all.some((c) => c.champ) && !this.champUnlocked(id);
      const cos = all.length > 1 ? `<div class="cos" data-k="${i}">${arrows ? '<b data-d="-1">◀</b>' : ''}<span>TRAJE <em>${all[ci].name}</em>${list.length > 1 ? ` <small>${list.indexOf(ci) + 1}/${list.length}</small>` : ''}</span>${arrows ? '<b data-d="1">▶</b>' : ''}${locked && !ready ? '<i title="Gana el arcade con este luchador">🔒 CAMPEÓN</i>' : ''}</div>` : '';
      el.innerHTML = `${who(i)}<div class="ttl">${s.title.toUpperCase()}</div><div class="big">${this.meta[id].display}</div><div class="dsc">${s.desc}</div>
        <div class="stats"><div class="stat"><b>FUERZA</b>${bar(st.power, 1.25)}</div><div class="stat"><b>VELOCIDAD</b>${bar(st.speed, 1.15)}</div><div class="stat"><b>AGUANTE</b>${bar(st.health, 200)}</div></div>
        ${cos}${ready ? '<div class="ready">¡LISTO!</div>' : ''}`;
      el.querySelectorAll('.cos b').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); this.cycleCostume(i, +b.dataset.d); }));
    };
    info($('#select .left'), ROSTER[this.sel.i[0]], this.sel.done[0], 0);
    if (vs) info($('#select .right'), ROSTER[this.sel.i[1]], this.sel.done[1], 1);
    else $('#select .right').innerHTML = this.mode === 'training' ? '<div class="ttl">SPARRING</div><div class="big">CPU</div>' : '<div class="ttl">RIVALES</div><div class="big">???</div>';
    this.updatePreview();
  }
  updatePreview() {
    const vs = this.isVs();
    // show the hovered fighters in 3D behind the UI
    const ids = [ROSTER[this.sel.i[0]], vs ? ROSTER[this.sel.i[1]] : (this.previewIds?.[1] || ROSTER[(this.sel.i[0] + 1) % ROSTER.length])];
    const cos = this.selCostumes();
    if (this.previewIds && this.previewIds[0] === ids[0] && this.previewIds[1] === ids[1] && this.match) {
      this.match.fighters.forEach((f, k) => { if ((f.ch.costumeIdx | 0) !== cos[k]) { f.ch.costumeIdx = cos[k]; applyCostume(f.ch, cos[k] ? costumesOf(ids[k])[cos[k]] : null); } });
      return;
    }
    // not downloaded yet: keep the current preview and come back when the mesh arrives
    if (!this.chars[ids[0]] || !this.chars[ids[1]]) {
      Promise.all(ids.map(id => this.ensureChar(id))).then(() => { if (this.state === 'select') this.updatePreview(); }).catch(() => {});
      return;
    }
    this.previewIds = ids;
    this.clearFighters();
    const chars = ids.map((id, k) => this.makeFighterModel(id, cos[k]));
    chars.forEach(c => this.scene.add(c.group));
    this.match = new Match(this, chars, ids, {});
    this.match.phase = 'showcase';
    const [a, b] = this.match.fighters;
    // single player: the fighter stands clear of the info panel and faces the camera
    if (vs) { a.pos.set(-0.75, 0, 0.6); b.pos.set(0.75, 0, 0.6); a.yaw = 0.35; b.yaw = -0.35; }
    else { a.pos.set(0.15, 0, 0.6); b.pos.set(2.5, 0, 0.6); a.yaw = -0.12; b.yaw = -0.35; }
    for (const f of this.match.fighters) { f.setState('idle'); f.play('intro', 1); f.prevPos.copy(f.pos); f.prevYaw = f.yaw; }
    if (!vs) b.ch.group.visible = false;
    this.camCtl.setMode('select', true);
  }
  // keys: the keys pressed this frame, M: what they mean on a menu for each player (js/fight/input.js menuKeys),
  // pads: each pad's menu buttons pressed this frame. (Q / E and - / = pick costumes while no player fights with them)
  selectInput(keys, M, pads) {
    const s = this.sel, F = freeKeys(keys), A = M.any;
    if (this.mode === 'online') {
      // this phone's player only, with either keyboard layout or the first pad
      const L = this.online.local;
      const l = A.left || pads[0].left, r = A.right || pads[0].right;
      const ok = A.ok || pads[0].ok, back = A.back || pads[0].back;
      if (F.has('KeyQ') || pads[0].lb) this.cycleCostume(L, -1);
      if (F.has('KeyE') || pads[0].rb) this.cycleCostume(L, 1);
      if (s.done[L]) { if (back) { s.done[L] = false; this.audio.play('ui'); this.refreshSel(); this.selMoved(L); } return; }
      if (l) { s.i[L] = (s.i[L] + ROSTER.length - 1) % ROSTER.length; this.audio.play('ui'); this.refreshSel(); this.selMoved(L); }
      if (r) { s.i[L] = (s.i[L] + 1) % ROSTER.length; this.audio.play('ui'); this.refreshSel(); this.selMoved(L); }
      if (ok) { this.audio.play('uiok'); this.confirmSel(L); }
      else if (back) this.online.backFromSelect();
      return;
    }
    const P = [0, 1].map((i) => ({ l: M.p[i].left || pads[i].left, r: M.p[i].right || pads[i].right, ok: M.p[i].ok || pads[i].ok, back: M.p[i].back || pads[i].back }));
    if (this.mode !== 'versus') { // single player: the second player's keys also move P1
      P[0].l ||= M.p[1].left; P[0].r ||= M.p[1].right; P[0].ok ||= M.p[1].ok; P[0].back ||= M.p[1].back;
    }
    if (F.has('KeyQ') || pads[0].lb) this.cycleCostume(0, -1);
    if (F.has('KeyE') || pads[0].rb) this.cycleCostume(0, 1);
    if (this.mode === 'versus') {
      if (F.has('Minus') || pads[1].lb) this.cycleCostume(1, -1);
      if (F.has('Equal') || pads[1].rb) this.cycleCostume(1, 1);
    }
    for (let i = 0; i < 2; i++) {
      if (i === 1 && this.mode !== 'versus') break;
      if (s.done[i]) { if (P[i].back) { s.done[i] = false; this.audio.play('uiback'); this.refreshSel(); } continue; }
      if (P[i].l) { s.i[i] = (s.i[i] + ROSTER.length - 1) % ROSTER.length; this.audio.play('ui'); this.refreshSel(); }
      if (P[i].r) { s.i[i] = (s.i[i] + 1) % ROSTER.length; this.audio.play('ui'); this.refreshSel(); }
      if (P[i].ok) { this.audio.play('uiok'); this.confirmSel(i); }
    }
    if (P[0].back && !s.done[0]) { this.audio.play('uiback'); this.toTitle(); }
  }
  confirmSel(i) {
    this.audio.preloadVoices([ROSTER[this.sel.i[i]]]);
    this.sel.done[i] = true;
    this.refreshSel();
    this.audio.voice({ id: ROSTER[this.sel.i[i]] }, 'attack');
    if (this.mode === 'online') { this.selMoved(i); this.onlineBoth(); return; }
    if (this.sel.done[0] && this.sel.done[1]) setTimeout(() => { if (this.state === 'select' && this.sel.done[0] && this.sel.done[1]) this.toStageSelect(); }, 700);
  }

  // ------------------------------------------------------------------ stage select
  // after the fighters, where they fight: a card for each stage and one for a random one (in the arcade, a stage of
  // its own for every fight of the ladder; otherwise the arcade goes round them in order from the one picked). The
  // stage under the cursor big, with its name, what it is like and its music, its picture blurred behind it all.
  // Online the host picks and the other phone watches his cursor move.
  stageItems() { return [...STAGE_KEYS, 'random']; }
  stageHost() { return this.mode !== 'online' || this.online.isHost; }
  toStageSelect() {
    this.state = 'stage';
    this.showScreen('stagesel');
    this.menu = null;
    const items = this.stageItems(), root = $('#stagesel'), touch = document.body.classList.contains('touchui');
    root.classList.remove('chosen');
    root.style.setProperty('--n', items.length);
    const mos = STAGE_KEYS.map((k) => `<i style="background-image:url(${stageShot(k)})"></i>`).join('');
    const row = $('#stagesel .ss-row');
    row.innerHTML = '';
    row.style.setProperty('--n', items.length);
    items.forEach((key, i) => {
      const c = document.createElement('div');
      c.className = 'ss-card' + (key === 'random' ? ' rnd' : ''); c.dataset.key = key;
      c.style.setProperty('--m', STAGE_KEYS.length);
      c.innerHTML = key === 'random' ? `<div class="mos">${mos}</div><b>?</b><div class="nm">ALEATORIO</div>` : `<img src="${stageShot(key)}" alt=""><div class="nm">${STAGES[key].name}</div>`;
      c.onclick = () => {
        if (!this.stageHost() || !this.ss || this.ss.done) return;
        // (touch: the first tap shows the stage, a second tap on the same card picks it)
        if (touch && this.ss.cur !== i) { this.stageCursor(i); return; }
        this.stageCursor(i, true); this.confirmStage();
      };
      c.onpointerenter = (e) => { if (e.pointerType === 'mouse' && this.stageHost() && this.ss && !this.ss.done) this.stageCursor(i); };
      row.appendChild(c);
    });
    $('#stagesel .ss-pic .mos').innerHTML = STAGE_KEYS.map((k) => `<b style="background-image:url(${stageShot(k)})"></b>`).join('');
    $('#stagesel .ss-pic .mos').style.setProperty('--m', STAGE_KEYS.length);
    // the picks: who fights whom
    const P = (id) => `<img src="${this.portraits[id]}" alt="">${this.meta[id].display}`;
    const id1 = ROSTER[this.sel.i[0]], id2 = this.isVs() ? ROSTER[this.sel.i[1]] : null;
    $('#stagesel .ss-match').innerHTML = `<span class="p1">${P(id1)}</span><em>VS</em><span class="p2">${id2 ? P(id2) : `<i class="q">?</i>${this.mode === 'training' ? 'SPARRING' : 'RIVALES'}`}</span>`;
    $('#ssBack').onclick = () => this.stageBack();
    // (the first player's keys as he has them: his directions, his 1 accepts, his 4 goes back)
    const kl = (a) => keyLabel(KEYMAPS.p1[a].find(Boolean) || '');
    const keysHint = touch ? '' : `${kl('left')} / ${kl('right')} para elegir · ${kl('b1')} o INTRO para confirmar · ${kl('b4')} o ESC para volver`;
    $('#ssHint').textContent = this.stageHost() ? (touch ? 'Toca un escenario para verlo · tócalo otra vez para elegirlo' : keysHint) : '';
    const start = this.mode === 'online' && !this.online.isHost ? (this.ssRemote || this.stagePick) : (this.stageRandom ? 'random' : this.stagePick);
    this.ss = { cur: Math.max(0, items.indexOf(start)), done: false, rolling: false, bg: 0 };
    this.refreshStageSel(true);
    if (this.mode === 'online' && this.online.isHost) this.online.net?.send({ t: 'stage', key: items[this.ss.cur] });
  }
  // build the stage the fight will be on while this screen still covers the view (the select's fighters stay, hidden
  // behind it; the fight clears them). Only off line: online both phones load together, from the host's 'go'
  prebuildStage(key) {
    if (this.mode === 'online' || this.stageKey === key) return;
    setTimeout(() => { if (this.state === 'stage') this.setStage(key).catch(() => {}); }, 250); // (after the pick's flash is on screen)
  }
  stageCursor(i, quiet = false) {
    const s = this.ss;
    if (!s || s.done || s.cur === i) return;
    s.cur = i;
    if (!quiet) this.audio.play('ui');
    this.refreshStageSel();
    if (this.mode === 'online' && this.online.isHost) this.online.net?.send({ t: 'stage', key: this.stageItems()[i] });
  }
  refreshStageSel(first = false) {
    const s = this.ss, items = this.stageItems(), key = items[s.cur], rnd = key === 'random', def = STAGES[key];
    const root = $('#stagesel');
    root.style.setProperty('--acc', rnd ? '#c86bff' : def.acc || '#ffcf4a');
    root.querySelectorAll('.ss-card').forEach((c, i) => c.classList.toggle('on', i === s.cur));
    // the picture: two layers crossfading (big and sharp in the frame, blurred behind everything)
    const url = rnd ? null : stageShot(key);
    const swap = (sel) => {
      const L = [...root.querySelectorAll(sel)];
      if (!url) { L.forEach((x) => x.classList.remove('on')); return; }
      const on = L.find((x) => x.classList.contains('on')), next = on && on.dataset.u === url ? on : L.find((x) => x !== on) || L[0];
      if (next.dataset.u !== url) { next.style.backgroundImage = `url(${url})`; next.dataset.u = url; }
      L.forEach((x) => x.classList.toggle('on', x === next));
    };
    swap('.ss-pic > i'); swap('.ss-bg > i');
    if (rnd) { const b = root.querySelector('.ss-bg > i'); b.style.backgroundImage = `url(${stageShot(STAGE_KEYS[0])})`; b.dataset.u = ''; b.classList.add('on'); }
    root.querySelector('.ss-pic .mos').classList.toggle('on', rnd);
    root.querySelector('.ss-pic .qm').classList.toggle('on', rnd);
    root.querySelector('.ss-frame .num').textContent = rnd ? '' : `${String(s.cur + 1).padStart(2, '0')} / ${String(STAGE_KEYS.length).padStart(2, '0')}`;
    if (!first) { const sh = root.querySelector('.ss-shine'); sh.classList.remove('go'); void sh.offsetWidth; sh.classList.add('go'); }
    const who = this.mode === 'online' && !this.online.isHost ? `<div class="who">LO ELIGE ${this.online.peerName.replace(/[&<>"']/g, '').toUpperCase()}</div>` : '';
    const info = rnd
      ? { sub: 'QUE DECIDA LA SUERTE', nm: 'ALEATORIO', dsc: this.mode === 'arcade' ? 'Un escenario al azar en cada combate del arcade.' : 'Un escenario al azar. La ruleta elige por ti.', tags: ['SORPRESA', `${STAGE_KEYS.length} ESCENARIOS`] }
      : { sub: def.sub, nm: def.name, dsc: def.desc || '', tags: def.tags || [] };
    // the button that starts the fight on the stage shown (the roulette's, on ALEATORIO), pulsing in its colour, with
    // the key (or the second tap) that does the same under it; nothing on the phone of a guest online (the host picks)
    let go = '';
    if (this.stageHost()) {
      const busy = s.rolling || s.done, touch = document.body.classList.contains('touchui');
      const label = s.done ? '¡A LUCHAR!' : s.rolling ? 'GIRANDO…' : rnd ? 'GIRAR LA RULETA' : '¡A LUCHAR!';
      const k1 = keyLabel(KEYMAPS.p1.b1.find(Boolean) || '');
      const hint = touch ? 'o toca otra vez la tarjeta' : `o pulsa ${k1} / INTRO`;
      go = `<button class="ss-go${busy ? ' busy' : ''}"><span>${label}</span><b>▶</b></button>${busy ? '' : `<div class="ss-gohint">${hint}</div>`}`;
    }
    root.querySelector('.ss-info').innerHTML = `<div class="sub">${info.sub}</div><div class="nm">${info.nm}</div><div class="dsc">${info.dsc}</div><div class="tags">${info.tags.map((t) => `<span>${t}</span>`).join('')}</div>${who}${go}`;
    const btn = root.querySelector('.ss-go');
    if (btn) btn.onclick = (e) => { e.stopPropagation(); this.confirmStage(); };
  }
  // keys: left / right move, a punch (or Enter) picks, back goes back to the fighters
  stageInput(keys, M, pads) {
    const s = this.ss;
    if (!s || s.done) return;
    const A = M.any, n = this.stageItems().length;
    if (A.back || pads[0].back || (this.mode !== 'online' && pads[1].back)) { this.stageBack(); return; }
    if (!this.stageHost()) return;
    const l = A.left || pads[0].left || pads[1].left || A.up || pads[0].up, r = A.right || pads[0].right || pads[1].right || A.down || pads[0].down;
    if (l) this.stageCursor((s.cur + n - 1) % n);
    if (r) this.stageCursor((s.cur + 1) % n);
    if (A.ok || pads[0].ok || pads[1].ok) this.confirmStage();
  }
  stageBack() {
    const s = this.ss;
    if (!s || s.done) return;
    this.audio.play('uiback');
    // the last pick undone: versus the second player's, otherwise the first's; online this phone's own
    if (this.mode === 'online') { const L = this.online.local; this.sel.done[L] = false; this.toSelect(true); this.selMoved(L); return; }
    if (this.mode === 'versus') this.sel.done[1] = false; else this.sel.done[0] = false;
    this.toSelect(true);
  }
  confirmStage() {
    const s = this.ss;
    if (!s || s.done || s.rolling || !this.stageHost()) return;
    const key = this.stageItems()[s.cur];
    if (key === 'random') { this.rollStage(); return; }
    this.stageChosen(key, false);
  }
  // ALEATORIO: the cursor runs over the stages, two laps and slowing down, and stops on one at random
  rollStage() {
    const s = this.ss, n = STAGE_KEYS.length;
    s.rolling = true;
    this.audio.play('uiok');
    const target = Math.floor(Math.random() * n);
    const steps = n * 2 + target + 1;
    let k = 0, at = -1;
    const step = () => {
      if (this.state !== 'stage' || this.ss !== s) return;
      at = (at + 1) % n; k++;
      s.cur = at; this.audio.play('ui'); this.refreshStageSel();
      if (this.mode === 'online') this.online.net?.send({ t: 'stage', key: STAGE_KEYS[at] });
      if (k >= steps) { s.rolling = false; this.stageChosen(STAGE_KEYS[at], true); return; }
      const t = k / steps;
      setTimeout(step, 55 + 330 * t * t * t);
    };
    step();
  }
  stageChosen(key, random) {
    const s = this.ss;
    s.done = true;
    this.stagePick = key; this.stageRandom = random;
    this.refreshStageSel(true);
    this.audio.play('uiok');
    // (the stage is built now, behind this screen, while ¡A LUCHAR! plays: the loading that follows is shorter)
    this.prebuildStage(key);
    const root = $('#stagesel');
    root.classList.add('chosen');
    root.querySelector(`.ss-card[data-key="${key}"]`)?.classList.add('pick');
    if (this.mode === 'online') {
      this.online.net?.send({ t: 'stage', key });
      setTimeout(() => { if (this.state === 'stage' && this.ss === s) this.online.bothPicked(ROSTER[this.sel.i[0]], ROSTER[this.sel.i[1]], key, this.selCostumes()); }, 900);
      return;
    }
    setTimeout(() => { if (this.state === 'stage' && this.ss === s) this.startMode(); }, 900);
  }

  startMode() {
    const p1 = ROSTER[this.sel.i[0]], cos = this.selCostumes();
    if (this.mode === 'arcade') {
      // one fight against each of the others, in random order; the title is won after the last one
      const others = ROSTER.filter(x => x !== p1).sort(() => Math.random() - 0.5);
      const n = STAGE_KEYS.length, i0 = Math.max(0, STAGE_KEYS.indexOf(this.stagePick));
      const stages = others.map((_, k) => STAGE_KEYS[(i0 + k) % n]);
      if (this.stageRandom) for (let k = 1; k < stages.length; k++) { let x; do x = STAGE_KEYS[Math.floor(Math.random() * n)]; while (n > 1 && x === stages[k - 1]); stages[k] = x; }
      this.arcade = { p1, ladder: others, stage: 0, diff: this.difficulty, costume: cos[0], stages };
      this.startFight(p1, this.arcade.ladder[0], { ai: this.arcadeAI(0), costumes: [cos[0], 0] });
    } else if (this.mode === 'versus') {
      this.startFight(p1, ROSTER[this.sel.i[1]], { human2: true, costumes: cos });
    } else {
      this.startFight(p1, ROSTER[(this.sel.i[0] + 1) % ROSTER.length], { training: true, costumes: [cos[0], 0] });
    }
  }

  arcadeAI(stage) {
    const t = DIFFICULTY[this.arcade?.diff || this.difficulty].ai;
    return t[Math.min(stage, t.length - 1)];
  }

  // ------------------------------------------------------------------ fight
  async startFight(id1, id2, opts = {}) {
    // one fight loads at a time: a newer call (or leaving to the title) makes an older one stop where it is
    const seq = this.fightSeq = (this.fightSeq || 0) + 1;
    const stale = () => seq !== this.fightSeq;
    this.state = 'loading';
    this.menu = null;
    // loading card: who fights whom (and where in the arcade ladder), on the stage they go to, a bar that fills as it
    // loads; it comes up only if the load takes a moment, and then stays long enough to be read (loadCard)
    const stageKey = this.stageFor(opts);
    const vs = $('#fadeVs'), stp = $('#fadeStep');
    if (vs) vs.textContent = `${this.meta[id1]?.display || id1}  vs  ${this.meta[id2]?.display || id2}`;
    if (stp) stp.textContent = this.mode === 'arcade' && this.arcade ? `COMBATE ${this.arcade.stage + 1} DE ${this.arcade.ladder.length}` : opts.online ? `VERSUS ONLINE · ${this.online.names().join('  vs  ')}` : opts.replay ? 'REPETICIÓN' : '';
    const card = this.loadCard(id1, id2, stageKey);
    this.fade(true);
    await new Promise(r => setTimeout(r, 380));
    if (stale()) { card.hide(true); return; }
    const busy = setTimeout(() => { if (!stale()) card.show(); }, 120);
    const done = (now) => { clearTimeout(busy); return card.hide(now); };
    this.audio.preloadVoices([id1, id2]);
    // the fighters' meshes (the bar climbs as each one arrives)
    let got = 0;
    const one = (id) => this.ensureChar(id).then((d) => { got++; card.set(0.05 + 0.25 * got / 2); return d; });
    try { await Promise.all([one(id1), one(id2)]); }
    catch (e) { if (stale()) return; done(true); if (opts.online) { opts.online.fail(); return; } this.fade(false); this.showOverlay('<h3>SIN CONEXIÓN</h3><p>No se pudo descargar un luchador. Revisa la conexión e inténtalo de nuevo.</p>', () => this.startFight(id1, id2, opts), () => this.backToTitle(), { ok: 'REINTENTAR', back: 'MENÚ' }); return; }
    if (stale()) { done(true); return; }
    this.clearFighters();
    // the stage (setStage returns the build already under way, when the stage select started it)
    card.set(0.32, 'PREPARANDO EL ESCENARIO…');
    await new Promise((r) => setTimeout(r, 0)); // (the card is painted before a stage's build holds the page)
    if (stageKey !== this.stageKey || this._stageBuild) await this.setStage(stageKey);
    this.audio.ambience(STAGES[stageKey].amb);
    if (stale()) { done(true); return; }
    // their textures: the bar counts them down as they arrive
    card.set(0.55, 'CARGANDO TEXTURAS…');
    const chars = [this.makeFighterModel(id1, opts.costumes?.[0]), this.makeFighterModel(id2, opts.costumes?.[1])];
    chars.forEach(c => this.scene.add(c.group));
    const n0 = Math.max(1, texturesPending());
    const tick = setInterval(() => card.set(0.55 + 0.33 * (1 - texturesPending() / n0)), 120);
    await texturesReady();
    clearInterval(tick);
    if (stale()) { done(true); chars.forEach(c => { this.scene.remove(c.group); c.group.traverse(o => o.geometry?.dispose?.()); }); return; }
    // the shaders built now, behind the card (in parallel where the browser can), not in the fight's first frames
    card.set(0.9, 'PREPARANDO LA IMAGEN…');
    try { await this.renderer.compileAsync?.(this.scene, this.camera); } catch (e) { /* built on first use */ }
    card.set(1, '¡LISTO!');
    await done();
    if (stale()) return;
    if (opts.online) { this.onlineFight(chars, id1, id2, opts); return; }
    if (opts.replay) { this.replayFight(chars, id1, id2, opts); return; }
    // arcade and versus fights are deterministic (det: nothing but the inputs counts, as online) and recorded, so
    // that their best play can be shown again (JUGADA DEL COMBATE); the camera follows the match's own side view
    const det = !opts.training && !opts.demo && (this.mode === 'arcade' || this.mode === 'versus');
    this.match = new Match(this, chars, [id1, id2], { training: !!opts.training, det });
    this.hud.setRounds(this.match.opts.rounds);
    // (a det fight's knocked-out fighter keeps the position the simulation gives him, the ragdoll is only drawn: driven
    // by the body, the position would follow the screen's frame rate and the play shown again would drift after a KO)
    this.camCtl.normalFrom = det ? this.match.viewN : null; this.ragdolls.drivePos = !det;
    this.rec = det ? new FightRecorder(this.match) : null;
    const [a, b] = this.match.fighters;
    a.ctrl = this.p1ctrl;
    if (opts.human2) b.ctrl = this.p2keys;
    else if (opts.training) { b.ctrl = { poll: () => ({ dx: 0, dy: 0, held: 0, pressed: 0 }) }; }
    else { const ai = new AIController(opts.ai || 3); ai.attach(b, this.match); b.ctrl = ai; }
    if (opts.demo && !opts.training) { const ai1 = new AIController(opts.ai || 3); ai1.attach(a, this.match); a.ctrl = ai1; }
    // (who is a person: only a person finishes with a PUÑETALITY; its line is fetched now, not as it starts)
    this.match.humans = this.fatalHumans(opts);
    // (and the computer, when it wins, finishes the person off with its own: with the PUÑETALITYs switched on)
    this.match.cpu = [!!opts.demo, !opts.human2];
    this.match.cpuFatal = this.prefs?.fatal !== false && !opts.demo && !opts.training;
    for (const id of [id1, id2]) if (STYLES[id]?.fatal) this.audio.preloadFatal?.(id);
    if (this.rec) { a.ctrl = this.rec.wrap(a.ctrl, 0); b.ctrl = this.rec.wrap(b.ctrl, 1); }
    if (opts.training && !opts.demo) this.training.start(this.match); else this.training.stop();
    // (without the saved moment: REINICIAR and the rematch start the fight from the beginning)
    this.fightOpts = { id1, id2, ...opts, resume: null };
    this.showScreen('none');
    this.hud.setFighters(this.match.fighters);
    this.hud.stageName = `${STAGES[this.stageKey].name}<small>${STAGES[this.stageKey].sub}</small>`;
    $('#trainingInfo').classList.toggle('on', !!opts.training);
    const hint = $('.movelist-hint');
    hint.textContent = document.body.classList.contains('touchui') ? 'II: pausa y lista de movimientos' : 'ESC / START: pausa y lista de movimientos'; hint.classList.remove('fade');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => hint.classList.add('fade'), 6000);
    this.state = 'fight';
    this.fx.warmup();
    if (opts.resume) {
      // CONTINUAR: the saved fight where it was, after a 3, 2, 1 (a save this game cannot read: the fight again)
      if (!this.resumeFight(opts.resume)) { this.startFight(id1, id2, { ...opts, resume: null }); return; }
      this.resumeT = 3; this._resumeShown = null;
    } else if (opts.training) this.match.startRound(); else this.match.startIntro();
    if (q.get('hp')) this.match.hpScale = +q.get('hp');
    // (?winnow=1: straight to player 1's win pose, for captures: index.html?demo=1&p1=…&winnow=1&readyon=win&readyat=<frame>)
    if (q.get('winnow')) { const m = this.match; m.startRound(); m.koWinner = 0; m.wins = [m.opts.rounds - 1, 0]; m.afterRound(); if (q.get('fatalbtn')) m.humans = [true, false]; }
    // (?fatalnow=1: straight to player 1's PUÑETALITY, for captures: index.html?demo=1&p1=noemi&p2=…&fatalnow=1&readyon=fatal&readyat=<frame>)
    if (q.get('fatalnow') && this.match.fighters[0].style.fatal) {
      const m = this.match;
      m.startRound(); m.wins = [m.opts.rounds, 0]; m.winner = 0; m.phase = 'matchEnd'; m.pt = 0; m.humans = [true, true];
      m.startFatal();
    }
    // (a new fight starts on the stage's next track; training has a calmer one of its own)
    this.audio.music(opts.training && !opts.demo ? 'training' : STAGES[this.stageKey].music, { fresh: true });
    this.fade(false);
    this.saveT = 3;
    if (this.mode === 'arcade') { this.arcadeLive = true; this.saveArcade(); }
  }
  fade(on) { $('#fade').classList.toggle('on', on); }
  // the loading card of a fight: both fighters (portrait, name, title), VS, the stage's picture behind and its name,
  // the bar and what is being done, a tip that changes every few seconds. show() brings it up; hide() takes it away,
  // once it has been up a little under a second (hide(true): at once)
  loadCard(id1, id2, stageKey) {
    const root = $('#fade'), ld = root.querySelector('.ld');
    ld.querySelectorAll('.ld-f').forEach((el, k) => {
      const id = k ? id2 : id1;
      el.querySelector('img').src = this.portraits[id] || '';
      el.querySelector('.nm').textContent = this.meta[id]?.display || id;
      el.querySelector('.tt').textContent = (STYLES[id]?.title || '').toUpperCase();
    });
    const st = STAGES[stageKey] || STAGES[MAIN_STAGE];
    ld.querySelector('.ld-bg').style.backgroundImage = `url(${stageShot(STAGES[stageKey] ? stageKey : MAIN_STAGE)})`;
    ld.querySelector('.ld-stage').innerHTML = `${st.name}<small>${st.sub}</small>`;
    const bar = ld.querySelector('.ld-bar i'), txt = ld.querySelector('.txt'), tip = ld.querySelector('.ld-tip');
    let label = 'CARGANDO LUCHADORES…', p = 0, shownAt = 0, tipT = null, k = Math.floor(Math.random() * TIPS.length);
    const paint = () => { bar.style.width = `${Math.round(p * 100)}%`; txt.innerHTML = `${label}<b>${Math.round(p * 100)}%</b>`; };
    const nextTip = () => { tip.style.opacity = 0; setTimeout(() => { k = (k + 1) % TIPS.length; tip.innerHTML = `<em>CONSEJO</em>${TIPS[k]}`; tip.style.opacity = 1; }, 400); };
    tip.innerHTML = `<em>CONSEJO</em>${TIPS[k]}`; tip.style.opacity = 1;
    bar.style.transition = 'none'; p = 0.04; paint(); void bar.offsetWidth; bar.style.transition = '';
    return {
      set(v, l) { p = Math.max(p, Math.min(1, v)); if (l) label = l; paint(); },
      show() { if (shownAt) return; shownAt = performance.now(); root.classList.add('busy'); tipT = setInterval(nextTip, 4500); },
      async hide(now) {
        clearInterval(tipT);
        if (shownAt && !now) { const w = 900 - (performance.now() - shownAt); if (w > 0) await new Promise((r) => setTimeout(r, w)); }
        root.classList.remove('busy');
      },
    };
  }

  // ------------------------------------------------------------------ continue (arcade)
  // The arcade run is kept on the device until it is won or a new one starts: the ladder, its difficulty and,
  // during a fight, the fight itself to the frame (the snapshot of js/net/simstate.js, the one the online mode
  // rewinds with). It is saved every few seconds and whenever the game leaves the screen (another app, the phone
  // locked, the tab closed), so a run that had to be left goes on from the title's CONTINUAR.
  saveArcade() {
    // (only while a run is being played: back at the title, the saved moment must stay as it was left)
    if (this.mode !== 'arcade' || !this.arcade || !this.arcadeLive || this.online.net) return;
    const m = this.match;
    let fight = null;
    // the fight to the frame while it is on (from its intro it starts again; between fights there is none)
    if (m && this.fightOpts && !this.fightOpts.replay && ['fight', 'pause', 'overlay-pause'].includes(this.state) && ['ready', 'fight', 'ko', 'end'].includes(m.phase) && !m.endSent) {
      try { fight = packSnap(m, saveMatch(m, this._saveSnap || (this._saveSnap = new Snap()))); } catch (e) { fight = null; }
    }
    const a = this.arcade;
    const data = { f: SAVE_FORMAT, v: VERSION, t: Date.now(), arcade: { p1: a.p1, ladder: a.ladder, stage: a.stage, diff: a.diff, costume: a.costume | 0, stages: a.stages }, fight };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage full or private mode */ }
  }
  // the saved run, if this roster can play it
  readSave() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
    const a = s && s.arcade;
    if (!a || !this.meta[a.p1] || !Array.isArray(a.ladder) || !a.ladder.length || a.ladder.some((id) => !this.meta[id]) || !(a.stage >= 0 && a.stage < a.ladder.length) || !DIFFICULTY[a.diff]) return null;
    return s;
  }
  clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* private mode */ } }
  // the title's CONTINUAR, when there is a run to go on with (whose, and how far up the ladder)
  refreshContinue() {
    const b = $('#title .menu button[data-act="continue"]');
    if (!b) return;
    const s = this.readSave();
    b.hidden = !s;
    if (s) b.querySelector('.cont').textContent = `ARCADE · ${this.meta[s.arcade.p1].display} · ${s.arcade.stage + 1}/${s.arcade.ladder.length}`;
  }
  continueArcade() {
    const s = this.readSave();
    if (!s) { this.refreshContinue(); return; }
    this.mode = 'arcade';
    const cos = Math.max(0, Math.min(costumesOf(s.arcade.p1).length - 1, s.arcade.costume | 0));
    const stages = Array.isArray(s.arcade.stages) ? s.arcade.stages.map(String) : undefined; // (older saves: round the stages in order)
    this.arcade = { p1: s.arcade.p1, ladder: s.arcade.ladder.slice(), stage: s.arcade.stage | 0, diff: s.arcade.diff, costume: cos, stages };
    // the fight to the frame only from this very version of the game (another one starts that fight again)
    const resume = s.fight && s.v === VERSION && s.f === SAVE_FORMAT ? s.fight : null;
    this.startFight(this.arcade.p1, this.arcade.ladder[this.arcade.stage], { ai: this.arcadeAI(this.arcade.stage), resume, costumes: [cos, 0] });
  }
  // a saved fight back where it was: the match to the frame, a knocked-out body, the bars and the camera's shot
  resumeFight(packed) {
    const m = this.match;
    try {
      const s = unpackSnap(m, packed);
      if (!s) return false;
      loadMatch(m, s);
    } catch (e) { console.warn('saved fight not loaded:', e.message); return false; }
    for (const f of m.fighters) if (f.ragdoll === RAGDOLL_WANTED) { f.ragdoll = null; this.ragdolls.spawn(f, f.opp, f.boneWorld('spine02')); }
    this.hud.roundStart(m.round, m.wins, m.fighters);
    this.hud.update(m);
    const [mode, focus] = this.cameraFor(m);
    if (mode === 'ko') this.camCtl.koWinner = m.fighters[m.koWinner | 0];
    this.camCtl.setMode(mode, true, focus);
    return true;
  }
  // the camera shot the match state calls for (a resumed fight, and online, where the match does not drive it)
  cameraFor(m) {
    if (m.phase === 'intro') return ['intro', null];
    if (m.phase === 'matchEnd') return ['win', m.fighters[m.winner] || null];
    if (m.phase === 'fatal') return ['fatal', m.fighters[m.fatalBy | 0] || null];
    if (m.phase === 'ko') return ['ko', m.fighters.find((f) => f.ko) || m.fighters[1 - (m.koWinner | 0)]];
    if (m.rageLock) return ['rage', m.rageLock.att];
    if (m.throwLock) return ['throw', null];
    return ['fight', null];
  }

  // online: the match built for both phones alike (det: nothing but the inputs counts), its presentation through the
  // online module (effects shown once, camera from the match state). It waits behind the black screen until the
  // other phone is ready too; then netBegin.
  onlineFight(chars, id1, id2, opts) {
    const o = opts.online, sp = o.spec;
    this.match = new Match(o.make(), chars, [id1, id2], { det: true, rounds: sp.rounds, time: sp.time });
    this.fightOpts = { id1, id2, ...opts };
    this.hud.setFighters(this.match.fighters);
    this.hud.setRounds(sp.rounds);
    this.hud.stageName = `${STAGES[this.stageKey].name}<small>${STAGES[this.stageKey].sub}</small>`;
    $('#trainingInfo').classList.remove('on');
    this.match.startIntro();
    for (const id of [id1, id2]) if (STYLES[id]?.fatal) this.audio.preloadFatal?.(id);
    this.fx.warmup();
    this.state = 'netwait';
    $('#fade').classList.add('busy');
    $('#fade .txt').textContent = 'ESPERANDO AL RIVAL…';
    o.ready(this.match);
  }
  // online: the last fight replayed on this phone from both players' inputs (same rules, same stage)
  replayFight(chars, id1, id2, opts) {
    const r = opts.replay, sp = r.spec;
    const m = (this.match = new Match(this, chars, [id1, id2], { det: true, rounds: sp.rounds, time: sp.time }));
    m.fighters.forEach((f, i) => { f.ctrl = this.online.replayCtrl(m, r, i); });
    this.fightOpts = { id1, id2, ...opts };
    this.camCtl.normalFrom = m.viewN;
    this.ragdolls.drivePos = false;
    this.hud.setFighters(m.fighters);
    this.hud.setRounds(sp.rounds);
    this.hud.stageName = `${STAGES[this.stageKey].name}<small>${STAGES[this.stageKey].sub}</small>`;
    $('#trainingInfo').classList.remove('on');
    this.showScreen('none');
    m.startIntro();
    this.state = 'fight';
    this.acc = 0;
    $('#replayTag').classList.add('on');
    this.audio.music(STAGES[this.stageKey].music);
    this.fade(false);
  }
  get replaying() { return !!(this.fightOpts && this.fightOpts.replay && this.online.watching); }
  netBegin(m) {
    if (m !== this.match) return;
    $('#fade').classList.remove('busy');
    $('#fade .txt').textContent = 'CARGANDO…';
    this.showScreen('none');
    const hint = $('.movelist-hint');
    hint.textContent = document.body.classList.contains('touchui') ? 'II: pausa y lista de movimientos' : 'ESC / START: pausa y lista de movimientos'; hint.classList.remove('fade');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => hint.classList.add('fade'), 6000);
    this.state = 'fight';
    this.acc = 0;
    this.audio.music(STAGES[this.stageKey].music);
    this.fade(false);
  }

  onKO(att, def, p) {
    this.ragdolls.spawn(def, att, p);
    this.koEffects(att, def);
  }
  // (online, a knockout replayed after a correction spawns the body again but shows these once)
  koEffects(att, def) {
    this.effects.radial = 0.6; this.effects.hitFlash = 0.5;
    def.rig?.setLids(0.92); // knocked out: eyes shut
    this.stage.cheer?.();
    this.audio.crowdSwell?.();
  }

  onMatchEnd(match) {
    // handled once per match (it used to fire on every frame after the win screen: each call started another load
    // of the next fight, skipped arcade rivals, left extra fighters standing in the scene and rebuilt the menus
    // under the finger)
    if (match !== this.match || match.endHandled) return;
    match.endHandled = true;
    // (online and replays: the online module has its own results screen)
    if (this.fightOpts && (this.fightOpts.replay || this.fightOpts.online)) { if (this.replaying) this.online.replayEnded(); return; }
    const won = match.winner === 0;
    const W = match.fighters[match.winner], name = (f) => f.ch.meta.display;
    if (this.mode === 'arcade' || this.mode === 'versus') this.progress.noteMatch(match, 0, this.mode, this.stageKey);
    const again = () => this.startFight(this.fightOpts.id1, this.fightOpts.id2, this.fightOpts);
    if (this.mode === 'arcade') {
      const a = this.arcade, n = a.ladder.length;
      if (won) {
        a.stage++;
        if (a.stage >= n) {
          this.clearSave(); // (the run is won: nothing left to continue)
          const un = this.progress.noteArcade(a.p1, a.diff);
          const champ = () => this.playEnding(a.p1, a.costume | 0, () => {
            const names = a.ladder.map(id => this.meta[id].display).join(', ');
            const notes = [`Final de ${this.meta[a.p1].display} añadido a EXTRAS ▸ FINALES`];
            if (un.costume) notes.push(`Traje de CAMPEÓN de ${this.meta[a.p1].display} desbloqueado (elígelo en la selección)`);
            if (un.heads) notes.push('Modo CABEZONES desbloqueado en EXTRAS');
            this.showOverlay(`<h3>¡CAMPEÓN DEL BARRIO!</h3><p style="font-size:20px">${this.meta[a.p1].display} ha vencido a todos sus amigos: ${names}.</p><p style="font-size:15px;opacity:.75">Dificultad ${DIFFICULTY[a.diff].name}</p><ul class="unlocks">${notes.map(n => `<li>🔓 ${n}</li>`).join('')}</ul>`, () => this.backToTitle(), null, { ok: 'MENÚ PRINCIPAL' });
          });
          this.showResults(match, '¡CAMPEÓN DEL BARRIO!', `${name(W)} gana la final · ${n} de ${n} combates`, [['CONTINUAR', 'champ', true], ['▶ VER JUGADA', 'hl'], ['MENÚ', 'menu']],
            (act) => { if (act === 'champ') champ(); else this.backToTitle(); });
          return;
        }
        const next = a.ladder[a.stage];
        this.saveArcade(); // (the next rival, from the start, if the game is closed now)
        this.showResults(match, `${name(W)} GANA`, `COMBATE ${a.stage} DE ${n} SUPERADO · SIGUIENTE: ${this.meta[next].display}`, [['SIGUIENTE COMBATE', 'next', true], ['▶ VER JUGADA', 'hl'], ['GUARDAR Y SALIR', 'menu']],
          (act) => { if (act === 'next') this.startFight(a.p1, next, { ai: this.arcadeAI(a.stage), costumes: [a.costume | 0, 0] }); else this.backToTitle(); });
      } else {
        this.saveArcade(); // (lost: CONTINUAR fights that rival again)
        this.showResults(match, 'HAS PERDIDO', `${name(W)} gana · ¿quieres la revancha?`, [['REVANCHA', 'again', true], ['▶ VER JUGADA', 'hl'], ['MENÚ', 'menu']],
          (act) => { if (act === 'again') again(); else this.backToTitle(); });
      }
    } else {
      this.showResults(match, `${name(W)} GANA`, `${match.wins[0]} – ${match.wins[1]} en rondas`, [['REVANCHA', 'again', true], ['▶ VER JUGADA', 'hl'], ['MENÚ', 'menu']],
        (act) => { if (act === 'again') again(); else this.backToTitle(); });
    }
  }

  // ------------------------------------------------------------------ results
  // the end of a fight: who won, both fighters' tallies, the play of the match (VER JUGADA shows it again in slow
  // motion, then comes back here) and what next. buttons: [label, action, primary]; 'hl' is handled here (left out
  // when there is nothing worth replaying), any other action goes to cb.
  // both fighters' tallies, row by row (the better of each in gold)
  statsTableHTML(match) {
    const rows = STAT_ROWS.map(([lbl, fn]) => {
      const a = fn(match.stats[0]), b = fn(match.stats[1]), na = parseFloat(a) || 0, nb = parseFloat(b) || 0;
      return `<tr><td class="${na > nb ? 'hi' : ''}">${a}</td><th>${lbl}</th><td class="${nb > na ? 'hi' : ''}">${b}</td></tr>`;
    }).join('');
    return `<table class="rs-stats">${rows}</table>`;
  }
  playLineHTML(match) {
    const best = match.best;
    return playWorthShowing(best) ? `<div class="rs-play"><span>JUGADA DEL COMBATE</span><b>${match.fighters[best.att].ch.meta.display} · ${playLabel(best)}</b></div>` : '';
  }
  resultsHTML(match, title, sub) {
    const F = match.fighters, w = match.winner;
    const card = (i) => `<div class="rs-f ${i ? 'p2' : 'p1'} ${w === i ? 'win' : ''}"><img src="${this.portraits[F[i].id]}" alt=""><b>${F[i].ch.meta.display}</b><span>${match.wins[i]} ${match.wins[i] === 1 ? 'RONDA' : 'RONDAS'}</span></div>`;
    return `<h3>${title}</h3>${sub ? `<div class="rs-sub">${sub}</div>` : ''}<div class="rs-grid">${card(0)}${this.statsTableHTML(match)}${card(1)}</div>${this.playLineHTML(match)}`;
  }
  showResults(match, title, sub, buttons, cb) {
    const src = this.highlightFrom(match);
    const btns = buttons.filter(([, act]) => act !== 'hl' || src);
    $('#overlay .panel').innerHTML = `<div class="results">${this.resultsHTML(match, title, sub)}</div><div class="actions">${btns.map(([l, act, pri]) => `<button data-act="${act}" class="${pri ? 'primary' : ''}">${l}</button>`).join('')}</div>`;
    $('#overlay').classList.add('on');
    $('#overlay').onclick = null;
    this.state = 'results';
    this.hud.show(false);
    this.setupMenu('#overlay .panel .actions', (act) => {
      if (act === 'hl') { this.playHighlight(src, () => this.showResults(match, title, sub, buttons, cb)); return; }
      $('#overlay').classList.remove('on');
      this.menu = null;
      cb(act);
    });
  }
  // how to replay the best play of a local fight (null: nothing worth showing, or not recorded)
  highlightFrom(match) {
    if (!playWorthShowing(match.best) || !this.rec || this.rec.m !== match) return null;
    const r = this.rec.bestReplay();
    if (!r) return null;
    return { ids: match.fighters.map(f => f.id), costumes: match.fighters.map(f => f.ch.costumeIdx | 0), spec: { rounds: match.opts.rounds, time: match.opts.time }, snap: r.snap, match, from: r.from, to: r.to,
      ctrl: (i) => logCtrl(this.rec, i), label: `${match.fighters[match.best.att].ch.meta.display} · ${playLabel(match.best)}` };
  }

  // ------------------------------------------------------------------ EXTRAS: achievements, endings, big heads
  refreshExtras() {
    const p = this.progress.d, b = $('#title .menu.extras button[data-act="bighead"]');
    if (b) b.innerHTML = p.bigHeadUnlocked ? `CABEZONES: <span class="diffv">${p.bigHead ? 'SÍ' : 'NO'}</span>` : 'CABEZONES <span class="cont">🔒 GANA EL ARCADE</span>';
    const e = $('#title .menu.extras button[data-act="endings"] .cont');
    if (e) e.textContent = `${ROSTER.filter(id => p.endings[id]).length} / ${ROSTER.length}`;
    const a = $('#title .menu.extras button[data-act="achievements"] .cont');
    if (a) a.textContent = `${Object.keys(p.ach).length}`;
  }
  showAchievements() {
    this.showOverlay(`<div class="achwrap">${this.progress.listHTML()}</div>`, () => this.backToExtras(), null, { ok: 'VOLVER' });
  }
  backToExtras() { this.state = 'title'; this.showTitleMenu('extras'); }
  showEndings() {
    const p = this.progress.d;
    const cards = ROSTER.map((id) => p.endings[id]
      ? `<button class="endc on" data-id="${id}"><img src="${this.portraits[id]}" alt=""><b>${this.meta[id].display}</b><span>${ENDINGS[id]?.title || ''}</span></button>`
      : `<div class="endc"><img src="${this.portraits[id]}" alt=""><b>${this.meta[id].display}</b><span>🔒 Gana el arcade con este luchador</span></div>`).join('');
    this.showOverlay(`<h3>FINALES</h3><div class="ends">${cards}</div>`, () => this.backToExtras(), null, { ok: 'VOLVER' });
    document.querySelectorAll('#overlay .endc.on').forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); this.audio.play('uiok'); $('#overlay').classList.remove('on');
      this.playEnding(b.dataset.id, 0, () => this.backToTitle(() => { this.toTitle(); this.showTitleMenu('extras'); }));
    }));
  }

  // ------------------------------------------------------------------ the arcade ending
  // the champion alone on the stage (an invisible stand-in as the second fighter: the engine is made for two), the
  // camera swinging slowly round him as he celebrates, his story typed out over the left of the screen; a tap shows
  // the whole text, another one goes on (onEnd)
  async playEnding(id, costume, onEnd) {
    const E = ENDINGS[id];
    if (!E) { onEnd(); return; }
    const seq = this.fightSeq = (this.fightSeq || 0) + 1;
    this.state = 'loading';
    $('#overlay').classList.remove('on');
    const other = ROSTER.find((x) => x !== id) || id;
    try { await Promise.all([this.ensureChar(id), this.ensureChar(other)]); } catch (e) { onEnd(); return; }
    if (seq !== this.fightSeq) return;
    this.clearFighters();
    const chars = [this.makeFighterModel(id, costume), this.makeFighterModel(other)];
    chars.forEach((c) => this.scene.add(c.group));
    const m = this.match = new Match(this, chars, [id, other], {});
    m.phase = 'showcase';
    const [a, b] = m.fighters;
    a.pos.set(0, 0, 0); a.yaw = 0; b.pos.set(40, 0, 40); b.ch.group.visible = false; // (facing the lens: the stage behind him)
    for (const f of m.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; f.snapPose = true; f.setState('idle'); f.play('win', 1); }
    a.setState('win');
    this.hud.show(false);
    this.camCtl.setMode('ending', true, a);
    this.state = 'ending';
    this.audio.music('ending');
    const el = $('#ending');
    el.querySelector('.ttl').textContent = E.title;
    el.querySelector('.who').textContent = `FINAL DE ${this.meta[id].display}`;
    const box = el.querySelector('.txt');
    box.innerHTML = E.text.map(() => '<p></p>').join('') + '<div class="fin">FIN</div><small class="tap">toca la pantalla o pulsa una tecla para continuar</small>';
    el.classList.add('on');
    this.end = { id, onEnd, t: 0, full: false, lines: E.text, chars: 0, total: E.text.join('').length };
    this.endingType();
  }
  endingType() {
    const E = this.end;
    if (!E || this.state !== 'ending') return;
    E.chars = E.full ? E.total : Math.min(E.total, E.chars + 2);
    let left = E.chars;
    const ps = document.querySelectorAll('#ending .txt p');
    E.lines.forEach((l, i) => { const n = Math.max(0, Math.min(l.length, left)); ps[i].textContent = l.slice(0, n); left -= l.length; });
    const done = E.chars >= E.total;
    $('#ending').classList.toggle('done', done);
    if (done) { E.full = true; return; }
    clearTimeout(this._endT); this._endT = setTimeout(() => this.endingType(), 34);
  }
  endingTap() {
    const E = this.end;
    if (!E) return;
    if (!E.full) { E.full = true; this.audio.play('ui'); this.endingType(); return; }
    this.end = null;
    clearTimeout(this._endT);
    $('#ending').classList.remove('on', 'done');
    this.audio.play('uiok');
    E.onEnd();
  }

  // ------------------------------------------------------------------ JUGADA DEL COMBATE
  // the play again: a new match on the same fighters, loaded from the snapshot the recorder kept from just before it
  // (online: from the first frame), fast-forwarded quietly to the moment and shown in slow motion with the fight's
  // own camera, effects and sounds; a tap or a key ends it early. src: { ids, spec, snap | packed | null, match, from,
  // to, ctrl(i), label }
  playHighlight(src, onEnd) {
    if (!src) { onEnd(); return; }
    $('#overlay').classList.remove('on');
    this.menu = null;
    this.fightSeq = (this.fightSeq || 0) + 1;
    this.clearFighters();
    const chars = src.ids.map((id, i) => this.makeFighterModel(id, src.costumes?.[i]));
    chars.forEach(c => this.scene.add(c.group));
    const fac = quietFacade(this);
    const m = new Match(fac, chars, src.ids, { det: true, rounds: src.spec.rounds, time: src.spec.time });
    m.later = (ms, fn) => setTimeout(() => { if (this.match === m && this.state === 'highlight') fn(); }, ms);
    try {
      if (src.snap) {
        // (the snapshot points at the recorded match's moves and clips: through their names to this match's own)
        const s = unpackSnap(m, src.packed || packSnap(src.match, src.snap));
        if (!s) throw new Error('snapshot');
        loadMatch(m, s);
        for (const f of m.fighters) f.ragdoll = null;
      } else m.startIntro();
    } catch (e) { console.warn('highlight not loaded:', e.message); this.clearFighters(); onEnd(); return; }
    m.fighters.forEach((f, i) => { f.ctrl = src.ctrl(i).bind(m); });
    this.match = m;
    this.ragdolls.drivePos = false; // (as in the fight it shows: see startFight)
    this.hl = { m, fac, src, onEnd, phase: 'ff' };
    this.state = 'highlight';
    this.acc = 0;
    this.hud.show(false);
    this.camCtl.normalFrom = m.viewN;
    $('#fade .txt').textContent = 'PREPARANDO LA JUGADA…';
    const vs = $('#fadeVs'), stp = $('#fadeStep'); if (vs) vs.textContent = ''; if (stp) stp.textContent = 'JUGADA DEL COMBATE';
    this.fade(true);
  }
  highlightTick(dt) {
    const h = this.hl, m = h.m;
    if (h.phase === 'ff') {
      // up to the moment, without showing anything (a few hundred frames per screen frame)
      for (let n = 0; n < 400 && m.frame < h.src.from; n++) { m.step(); m.events.length = 0; if (!m.hitstop) this.ragdolls.step(1 / FPS); }
      if (m.frame < h.src.from) return 1;
      h.phase = 'play';
      h.fac.st.quiet = false;
      this.hud.setFighters(m.fighters); this.hud.setRounds(m.opts.rounds);
      this.hud.roundStart(m.round, m.wins, m.fighters); this.hud.update(m);
      $('#announce').className = '';
      const [mode, focus] = this.cameraFor(m);
      this.camCtl.setMode(mode, true, focus);
      for (const f of m.fighters) { f.prevPos.copy(f.pos); f.prevYaw = f.yaw; }
      $('#hlTag b').textContent = h.src.label || '';
      $('#hlTag').classList.add('on');
      this.progress?.noteHighlight();
      this.audio.music(STAGES[this.stageKey].music);
      this.fade(false);
      return 1;
    }
    this.acc += dt * HL_SPEED * (m.slowmo > 0 ? SLOWMO : 1);
    for (let n = 0; n < 4 && this.acc >= 1 / FPS; n++) {
      m.step();
      if (!m.hitstop) this.ragdolls.step(1 / FPS);
      this.acc -= 1 / FPS;
    }
    if (m.frame >= h.src.to || (m.phase === 'matchEnd' && m.pt > 100)) { this.endHighlight(); return 1; }
    return this.acc * FPS;
  }
  endHighlight() {
    const h = this.hl;
    if (!h) return;
    this.hl = null;
    this.hlDone = h.m;
    $('#hlTag').classList.remove('on');
    this.fade(false);
    this.hud.show(false);
    h.onEnd();
  }

  showOverlay(html, onOk, onBack, labels = {}) {
    this.state = 'overlay';
    const acts = `<div class="actions"><button data-a="ok" class="primary">${labels.ok || 'ACEPTAR'}</button>${onBack || labels.back ? `<button data-a="back">${labels.back || 'VOLVER'}</button>` : ''}</div>`;
    $('#overlay .panel').innerHTML = html + acts;
    $('#overlay').classList.add('on');
    this.overlayCb = { ok: () => { $('#overlay').classList.remove('on'); onOk && onOk(); }, back: () => { $('#overlay').classList.remove('on'); (onBack || onOk)(); } };
    $('#overlay').onclick = null;
    $('#overlay .actions [data-a="ok"]').onclick = (e) => { e.stopPropagation(); this.audio.play('uiok'); this.overlayCb.ok(); };
    const bk = $('#overlay .actions [data-a="back"]'); if (bk) bk.onclick = (e) => { e.stopPropagation(); this.audio.play('ui'); this.overlayCb.back(); };
  }

  pause(on) {
    // online the pause is shared by both phones (js/ui/online.js); a replay simply ends
    if (this.online.inFight) { if (on) this.online.requestPause(); else this.online.requestResume(); return; }
    if (this.replaying) { if (on) this.online.replayEnded(); return; }
    if (on) {
      this.state = 'pause';
      $('#pause').classList.add('on');
      // (the arcade run is kept: CONTINUAR goes on from this very moment)
      $('#pause .menu.local [data-act="quit"]').textContent = this.mode === 'arcade' ? 'GUARDAR Y SALIR' : 'SALIR AL MENÚ';
      $('#pause .menu.local [data-act="tset"]').hidden = !(this.fightOpts?.training && this.training.m === this.match);
      // (the keys and buttons can be changed mid-fight; not on a phone played by touch only)
      $('#pause .menu.local [data-act="controls"]').hidden = document.body.classList.contains('touchui') && !this.padActive;
      this.setupMenu('#pause .menu.local', (act) => {
        if (act === 'resume') this.pause(false);
        else if (act === 'tset') this.showTrainingSettings();
        else if (act === 'restart') { $('#pause').classList.remove('on'); this.startFight(this.fightOpts.id1, this.fightOpts.id2, this.fightOpts); }
        else if (act === 'quit') { $('#pause').classList.remove('on'); this.saveArcade(); this.backToTitle(); }
        else if (act === 'movelist') this.showMoveList();
        else if (act === 'controls') this.controlsUI.show(() => this.pause(true), 'overlay-pause');
      });
    } else {
      $('#pause').classList.remove('on');
      $('#overlay').classList.remove('on');
      this.state = 'fight';
      this.menu = null;
    }
    this.syncTouchUI();
  }
  // ENTRENAMIENTO's settings over the pause (GRABAR and PRUEBAS DE COMBO close it and go back to the fight)
  showTrainingSettings() {
    const T = this.training;
    this.showOverlay(T.settingsHTML(), () => this.pause(true), null, { ok: 'VOLVER' });
    this.state = 'overlay-pause';
    T.bindSettings($('#overlay .panel'), (act) => {
      $('#overlay').classList.remove('on');
      this.pause(false);
      if (act === 'rec') T.startRecording();
      else if (act === 'trials') T.toggleTrials();
    });
  }
  showMoveList() {
    const f = this.match.fighters[this.online.inFight ? this.online.local : 0];
    const rows = f.commands.map(c => `<tr><td>${c.str.replace(/\+/g, ' + ')}</td><td>${f.moves[c.move].name}</td><td>${f.moves[c.move].hit ? ({ high: 'Alto', mid: 'Medio', low: 'Bajo', smid: 'Medio esp.', throw: 'Agarre' })[f.moves[c.move].hit.lvl] : ''}</td></tr>`).join('');
    this.showOverlay(`<h3>${f.ch.meta.display} — MOVIMIENTOS</h3><table>${rows}</table><p style="color:#999;font-size:14px;margin-top:10px">1 = puño izq · 2 = puño der · 3 = patada izq · 4 = patada der · f = hacia el rival · b = atrás · d = abajo · u = arriba</p>`, () => this.pause(true), null, { ok: 'VOLVER' });
    this.state = 'overlay-pause';
  }
  // EXTRAS -> CONTROLES: how to play, with the keys and buttons as the players have them (CONFIGURAR changes them)
  showControls() {
    const h = controlsHelp();
    this.showOverlay(`<h3>CONTROLES</h3><table>
      <tr><td>Jugador 1</td><td>${h.p1}</td></tr>
      <tr><td>Jugador 2</td><td>${h.p2}</td></tr>
      <tr><td>Mando</td><td>${h.pad}</td></tr>
      <tr><td>Botones</td><td>1 = puño izquierdo · 2 = puño derecho · 3 = patada izquierda · 4 = patada derecha</td></tr>
      <tr><td>Bloquear</td><td>Mantener atrás (alto/medio) · abajo-atrás (bajo)</td></tr>
      <tr><td>Esquivar</td><td>Toque rápido arriba o abajo</td></tr>
      <tr><td>Dash</td><td>adelante, adelante · atrás, atrás</td></tr>
      <tr><td>Agarre</td><td>1+3 o 2+4 · Escapar: 1 o 2 al ser agarrado</td></tr>
      <tr><td>Recuperación</td><td>Pulsa cualquier botón justo al caer al suelo para levantarte al instante</td></tr>
      <tr><td>Pausa</td><td>${h.pause}</td></tr>
      <tr><td>Táctil</td><td>Joystick a la izquierda (aparece donde apoyes el pulgar) · botones 1 2 3 4 a la derecha · el hueco entre dos botones pulsa los dos (1+2, 3+4, 1+3, 2+4) · el botón RAGE ART aparece cuando tienes furia · II = pausa</td></tr></table>`, () => this.controlsUI.show(() => this.showControls()), () => this.toTitle(), { ok: 'CONFIGURAR', back: 'VOLVER' });
  }
  // (keep: the choices made on the screen before going to CONTROLES and back, not saved yet)
  showOptions(keep) {
    const QN = { auto: `AUTOMÁTICA (${QNAME[this.quality]})`, ...QNAME };
    const t = this.touch.opt, sel = (id, list, cur) => `<select id="${id}">${list.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const fs = fullscreenSupported() ? '<div class="row"><span>Pantalla completa</span><button id="optFs" class="mini">ACTIVAR / SALIR</button></div>' : '';
    this.showOverlay(`<h3>OPCIONES</h3><div class="opts"><div>
      <h4>GENERAL</h4>
      <div class="row"><span>Calidad gráfica</span>${sel('optQ', Object.entries(QN), this.autoQ ? 'auto' : this.quality)}</div>
      <div class="row"><span>Música</span><input id="optM" type="range" min="0" max="1" step="0.05" value="${this.audio.vol.music}"></div>
      <div class="row"><span>Efectos</span><input id="optS" type="range" min="0" max="1" step="0.05" value="${this.audio.vol.sfx}"></div>
      <div class="row"><span>Voces</span><input id="optV" type="range" min="0" max="1" step="0.05" value="${this.audio.vol.voice}"></div>
      <div class="row"><span>Teclado y mando</span><button id="optCtl" class="mini">CONFIGURAR</button></div>
      ${fs}
      </div><div>
      <h4>CONTROLES TÁCTILES</h4>
      <div class="row"><span>Mostrar</span>${sel('optTs', [['auto', 'Automático'], ['always', 'Siempre'], ['never', 'Nunca']], t.show)}</div>
      <div class="row"><span>Tamaño</span>${sel('optTz', [[0.85, 'Pequeño'], [1, 'Normal'], [1.18, 'Grande']], t.size)}</div>
      <div class="row"><span>Opacidad</span><input id="optTo" type="range" min="0.35" max="1" step="0.05" value="${t.opacity}"></div>
      <div class="row"><span>Joystick</span>${sel('optTk', [['float', 'Flotante'], ['fixed', 'Fijo']], t.stick)}</div>
      <div class="row"><span>Vibración</span>${sel('optTh', [[1, 'Sí'], [0, 'No']], t.haptics ? 1 : 0)}</div>
      <h4>ACCESIBILIDAD</h4>
      <div class="row"><span>Subtítulos</span>${sel('optSub', [[1, 'Sí'], [0, 'No']], this.prefs.subs ? 1 : 0)}</div>
      <div class="row"><span>Temblor de cámara</span>${sel('optShk', [[1, 'Normal'], [0.4, 'Suave'], [0, 'Sin temblor']], this.prefs.shake)}</div>
      <div class="row"><span>Destellos</span>${sel('optFl', [[1, 'Normales'], [0.35, 'Suaves']], this.prefs.flash)}</div>
      <div class="row"><span>Puñetality</span>${sel('optFat', [[1, 'Activados'], [0, 'Desactivados']], this.prefs.fatal === false ? 0 : 1)}</div>
      </div></div>
      <p class="note">Un cambio de calidad gráfica recarga el juego.</p>
      <p class="note">Música: Kevin MacLeod (incompetech.com) · Público: Gregor Quendel · licencia CC BY 4.0 · Gritos: HaelDB, VoiceBosch, PlumpDev y SkyRae (OpenGameArt) · Voces: Piper (davefx; Sharvard, CC BY 3.0) · Golpes, pasos y ambiente (CC0): Kenney, artisticdude, IgnasD y Kresiek The Furry</p>`, () => {
      const T = this.touch;
      T.opt = { ...T.opt, show: $('#optTs').value, size: +$('#optTz').value, opacity: +$('#optTo').value, stick: $('#optTk').value, haptics: $('#optTh').value === '1' };
      saveTouchPrefs(T.opt);
      this.prefs = { subs: $('#optSub').value === '1', shake: +$('#optShk').value, flash: +$('#optFl').value, fatal: $('#optFat').value === '1' };
      // (a fight under way, off line: the change counts from now on)
      if (this.match?.humans && !this.online.inFight) { this.match.humans = this.fatalHumans(this.fightOpts || {}); this.match.cpuFatal = this.prefs.fatal !== false && !this.fightOpts?.demo && !this.fightOpts?.training; }
      lsSet('pdb_prefs', JSON.stringify(this.prefs));
      this.applyPrefs();
      if (T.opt.show === 'never') { T.disable(); document.body.classList.remove('touchui'); }
      else if (T.opt.show === 'always' || DEVICE.touch) { T.enable(); T.applyPrefs(); document.body.classList.add('touchui'); }
      this.saveAudioPrefs();
      const nq = $('#optQ')?.value;
      if (nq && nq !== (this.autoQ ? 'auto' : this.quality)) { lsSet('pdb_quality', nq); location.reload(); return; }
      this.toTitle();
    }, () => { this.saveAudioPrefs(); this.toTitle(); }, { ok: 'GUARDAR', back: 'VOLVER' });
    $('#optM').oninput = (e) => { this.audio.vol.music = +e.target.value; if (this.audio.musicBus) this.audio.musicBus.gain.value = +e.target.value; };
    $('#optS').oninput = (e) => { this.audio.vol.sfx = +e.target.value; if (this.audio.sfxBus) this.audio.sfxBus.gain.value = +e.target.value; };
    $('#optV').oninput = (e) => { this.audio.vol.voice = +e.target.value; if (this.audio.voiceBus) this.audio.voiceBus.gain.value = +e.target.value; };
    if ($('#optFs')) $('#optFs').onclick = () => toggleFullscreen();
    const FORM = ['optQ', 'optTs', 'optTz', 'optTo', 'optTk', 'optTh', 'optSub', 'optShk', 'optFl', 'optFat'];
    for (const id of FORM) if (keep?.[id] != null && $('#' + id)) $('#' + id).value = keep[id];
    $('#optCtl').onclick = (e) => {
      e.stopPropagation(); this.audio.play('uiok');
      const k = Object.fromEntries(FORM.map((id) => [id, $('#' + id)?.value]));
      $('#overlay').classList.remove('on');
      this.controlsUI.show(() => this.showOptions(k));
    };
  }

  // ------------------------------------------------------------------ loop
  padMenuState() {
    const out = [];
    for (let i = 0; i < 2; i++) {
      const g = navigator.getGamepads?.()[i];
      const prev = (this._pad || [])[i] || {};
      const cur = { left: false, right: false, up: false, down: false, ok: false, back: false, start: false, lb: false, rb: false, y: false };
      if (g) {
        const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
        cur.left = g.buttons[14]?.pressed || ax < -0.5; cur.right = g.buttons[15]?.pressed || ax > 0.5;
        cur.up = g.buttons[12]?.pressed || ay < -0.5; cur.down = g.buttons[13]?.pressed || ay > 0.5;
        // (the menus keep the usual buttons whatever the fight's are: bottom / left accept, right goes back; START is
        // the player's pause button)
        cur.ok = g.buttons[0]?.pressed || g.buttons[2]?.pressed; cur.back = g.buttons[1]?.pressed; cur.start = padHas(g, 'start');
        cur.lb = g.buttons[4]?.pressed; cur.rb = g.buttons[5]?.pressed; cur.y = g.buttons[3]?.pressed;
      }
      const edge = {};
      for (const k in cur) edge[k] = cur[k] && !prev[k];
      out.push({ edge, cur });
    }
    this._pad = out.map(o => o.cur);
    return out.map(o => o.edge);
  }

  loop() {
    if (window.__stopped) return;
    if (window.__stopAfterNext) { window.__stopped = true; }
    else requestAnimationFrame(() => this.loop());
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.last) / 1000);
    // (the online session gets the time that really went by, up to half a second: a phone that was stuck a moment
    // catches its frames up instead of making the other phone wait for them)
    const realDt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 'fight') this.dynRes(dt);
    // the keys pressed this frame, what they mean on the menus (each player's own keys: OPCIONES -> CONTROLES) and
    // the pads' menu buttons
    const keys = menuKeysPressed();
    const M = menuKeys(keys), A = M.any;
    const pads = this.padMenuState();
    if (this.controlsUI.open) this.controlsUI.input(keys, M, pads);
    else if (this.state === 'title') { if ((this.titleMenu === 'vs' || this.titleMenu === 'extras') && (A.back || pads[0].back)) { this.audio.play('uiback'); this.showTitleMenu('main'); } else this.menuInput(A, pads[0]); }
    else if (this.state === 'ending') { if (keys.size || pads[0].ok || pads[0].back || pads[0].start) this.endingTap(); }
    else if (this.state === 'select') this.selectInput(keys, M, pads);
    else if (this.state === 'stage') this.stageInput(keys, M, pads);
    else if (this.state === 'pause') { this.menuInput(A, pads[0]); if (A.back || pads[0].start || pads[0].back || pads[1].start) this.pause(false); }
    else if (this.state === 'results') this.menuInput(A, pads[0]);
    else if (this.state === 'highlight') { if (this.hl?.phase === 'play' && (keys.size || pads[0].ok || pads[0].back || pads[0].start)) this.endHighlight(); }
    else if (this.state === 'overlay' || this.state === 'overlay-pause') {
      if (A.ok || pads[0].ok) this.overlayCb.ok();
      else if (A.back || pads[0].back) this.overlayCb.back();
    } else if (this.state === 'fight' && this.replaying) {
      if (keys.size || pads[0].ok || pads[0].start || pads[0].back) this.online.replayEnded();
    } else if (this.state === 'fight') {
      if (keys.has('Escape') || pads[0].start || pads[1].start || (A.start && this.match?.phase === 'fight')) this.pause(true);
      else if (this.fightOpts?.training && this.training.m === this.match) this.training.tick(dt, freeKeys(keys));
    } else if (this.state === 'online') {
      if (keys.has('Escape')) this.online.escape();
    } else if (this.state === 'netresults') {
      if (A.ok || pads[0].ok) this.online.choose('rematch');
    }
    // online: the rollback session plays the frames (both phones' inputs), whatever this screen is showing
    this.online.tick(realDt);
    const netRun = !!this.online.session && this.match === this.online.match;
    // a resumed arcade fight: 3, 2, 1 before it goes on (the fight stands still meanwhile)
    const counting = this.resumeT > 0 && this.state === 'fight';
    if (counting) {
      this.resumeT = Math.max(0, this.resumeT - dt);
      const n = Math.ceil(this.resumeT);
      if (n !== this._resumeShown) { this._resumeShown = n; if (n > 0) { this.hud.announce(String(n), 'round'); this.audio.play('ui'); } else this.hud.announce('¡A LUCHAR!', 'fight'); }
    }
    // the arcade run on the device every few seconds of fight (and as the game leaves the screen: see the constructor)
    if (this.mode === 'arcade' && this.state === 'fight' && !counting && (this.saveT -= dt) <= 0) { this.saveT = 3; this.saveArcade(); }
    // simulation
    const m = this.match;
    let alpha = 1;
    this.syncTouchUI();
    if (m) {
      // (a play shown again stays where it ended, behind the results)
      const running = !netRun && !counting && m !== this.hlDone && (this.state === 'fight' || this.state === 'title' || this.state === 'select' || this.state === 'stage' || this.state === 'online' || this.state === 'netresults' || this.state === 'ending');
      if (netRun) alpha = this.online.session.alpha;
      else if (this.state === 'highlight' && this.hl && this.hl.m === m) alpha = this.highlightTick(dt);
      else if (running) {
        // (slow motion: after a knockout, a Rage Art, round the PUÑETALITY's cut; Match.timeRate)
        const scale = m.timeRate ? m.timeRate() : m.slowmo > 0 ? SLOWMO : 1;
        if (m.slowmo > 0 && !m.det) m.slowmo -= dt;
        this.acc += dt * scale;
        let steps = 0;
        let maxSteps = +(q.get('maxsteps') || 6);
        if (q.get('fixedstep')) this.acc = Math.max(this.acc, (+q.get('fixedstep')) / FPS);
        // capture mode: simulate without rendering until the requested frame
        const simonly = +(q.get('simonly') || 0);
        const ro = q.get('readyon'), ra = +(q.get('readyat') || 0);
        const stopAt = () => (ro === 'ko' && (m.phase === 'ko' || m.phase === 'matchEnd') && m.pt >= (ra || 45))
          || (ro === 'fatal' && m.phase === 'fatal' && m.pt >= ra)
          || (ro === 'intro' && m.phase === 'intro' && m.pt >= (ra || 40))
          || (ro === 'fight' && m.phase === 'fight' && m.pt >= (ra || 1))
          || (ro === 'win' && m.phase === 'matchEnd' && m.pt >= (ra || 90))
          // a few frames after the first heavy/counter hit past frame `readyat` (impact VFX checks)
          || (ro === 'hit' && m.lastHeavyFrame >= ra && m.frame - m.lastHeavyFrame >= +(q.get('hitage') || 2))
          || (ro === 'tech' && m.lastTechFrame >= ra && m.frame - m.lastTechFrame >= +(q.get('hitage') || 8));
        const koHit = stopAt();
        // impact captures freeze the simulation on the stop frame; the camera snaps and the particles age by `hitage` once
        if ((ro === 'hit' || ro === 'tech' || ro === 'fatal' || ro === 'fight' || (ro === 'win' && q.get('winnow'))) && koHit && !this.capFrozen) { this.capFrozen = 1; this.camCtl.snap = true; this.readyIn = 3; }
        const fastForward = simonly && m.phase !== 'showcase' && m.frame < simonly && !koHit;
        if (koHit && !window.__ready) { this.readyIn = (this.readyIn ?? 8) - 1; if (this.readyIn <= 0) window.__ready = true; }
        if (fastForward) { this.acc = 400 / FPS; maxSteps = 400; }
        if (this.capFrozen) { this.acc = 0; maxSteps = 0; }
        while (this.acc >= 1 / FPS && steps < maxSteps) {
          if (m.phase === 'showcase') this.showcaseStep(m);
          else { m.step(); if (this.rec && this.rec.m === m) this.rec.afterStep(); }
          if (fastForward && stopAt()) { this.acc = 0; break; }
          if (!m.hitstop) this.ragdolls.step(1 / FPS);
          this.acc -= 1 / FPS; steps++;
        }
        if (q.get('frames') && m.frame >= +q.get('frames') && !window.__ready) window.__ready = true;
        if (simonly && m.phase !== 'showcase' && m.frame >= simonly && !window.__ready) { this.readyIn = (this.readyIn ?? 6) - 1; if (this.readyIn <= 0) window.__ready = true; }
        if (fastForward) {
          for (const f of m.fighters) { if (!f.ragdoll && !f.drawnBy) f.syncRender(1); }
          this.ragdolls.sync();
          this.fatal.update(m, 1, steps / FPS);
          // the camera follows the simulated time too, so a capture shows the framing a player would see
          this.camCtl.introT = m.phase === 'intro' ? m.pt / FPS : null; this.camCtl.introCut = (m.introCut || 101) / FPS; this.camCtl.introEnd = (m.introEnd || 220) / FPS; this.camCtl.readyT = m.phase === 'ready' ? m.pt / FPS : null;
          this.camCtl.update(Math.min(2, steps / FPS), m.fighters);
          return;
        }
        alpha = this.acc * FPS;
      }
      for (const f of m.fighters) { if (!f.ragdoll && !f.drawnBy) f.syncRender(alpha); }
      this.ragdolls.sync();
      // (the PUÑETALITY: its props, the halves of the loser, the blood, the shot; after the fighters are posed)
      this.fatal.update(m, alpha, dt);
      this.syncFatalButton(m);
      this.contact.update(m.fighters);
      this.fx.updateTrails();
      for (const f of m.fighters) if (f.rage && !f.ko) this.fx.aura(f, dt);
      // stage shadow follows the action
      const c = new THREE.Vector3().addVectors(m.fighters[0].ch.group.position, m.fighters[1].ch.group.position).multiplyScalar(0.5);
      const spread = m.fighters[0].pos.distanceTo(m.fighters[1].pos);
      this.stage.followShadow(c, spread);
      this.stage.keyBoost = m.phase === 'intro' || m.phase === 'matchEnd' || m.phase === 'fatal' ? 1.4 : 1; // cinematic close-ups get more face light
      this.stage.followCamera(this.camera, c);
      // fill light: a share of the key, half way to white, stronger in the cinematic close-ups (js/materials.js)
      { const kc = FIGHTER_KEY.color.value, l = (kc.r + kc.g + kc.b) / 3;
        FIGHTER_KEY.fill.value.setRGB((kc.r + l) / 2, (kc.g + l) / 2, (kc.b + l) / 2).multiplyScalar(this.stage.keyBoost > 1 ? 0.36 : 0.15); }
      this.camCtl.introT = m.phase === 'intro' ? m.pt / FPS : null; this.camCtl.introCut = (m.introCut || 101) / FPS; this.camCtl.introEnd = (m.introEnd || 220) / FPS; this.camCtl.readyT = m.phase === 'ready' ? m.pt / FPS : null;
      // (the title's fighters walking in: the shot stays where they are heading)
      this.camCtl.update(dt, this.entrance?.m === m ? this.titleGhosts : m.fighters);
      // per-fighter key light (view space): from in front of each fighter, above and towards the lens, so a face in
      // profile is lit whichever side of the screen it is on; the rim kicks in from behind the fighter
      this.camera.updateMatrixWorld();
      for (const f of m.fighters) {
        const k = f.ch.fighterKey; if (!k) continue;
        const fv = _fkv.set(Math.sin(f.yaw), 0, Math.cos(f.yaw)).transformDirection(this.camera.matrixWorldInverse);
        k.dir.value.set(fv.x * 0.55, 0.62 + fv.y * 0.3, 0.55 + Math.max(0, fv.z) * 0.35).normalize();
        k.rimDir.value.set(-fv.x * 0.6, 0.35, -0.75).normalize();
        k.fillDir?.value.set(-fv.x * 0.35, 0.15, 0.95).normalize();
      }
      this.accessories.update(dt);
    } else if (this.titleGhosts && this.stage) {
      // the title before its two fighters have arrived: the stage framed as it will be with them
      const G = this.titleGhosts, c = new THREE.Vector3().addVectors(G[0].pos, G[1].pos).multiplyScalar(0.5);
      this.stage.followShadow(c, G[0].pos.distanceTo(G[1].pos));
      this.stage.keyBoost = 1;
      this.stage.followCamera(this.camera, c);
      this.camCtl.introT = null; this.camCtl.readyT = null;
      this.camCtl.update(dt, G);
    }
    // effects
    const e = this.effects;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
    e.radial = Math.max(0, e.radial - dt * 1.4);
    const targetDesat = m && m.slowmo > 0 ? 0.45 : 0;
    // (slow motion is heard too: the music and the background sink under a muffle, js/audio/audio.js slowmo)
    const slowHeard = !!targetDesat || (m?.phase === 'fatal' && m.timeRate() < 0.6);
    if (slowHeard !== !!this._slowHeard) { this._slowHeard = slowHeard; this.audio.slowmo?.(this._slowHeard); }
    e.desat += (targetDesat - e.desat) * (1 - Math.exp(-dt * 6));
    const lb = m && (m.phase === 'intro' || m.phase === 'matchEnd' || m.phase === 'fatal' || this.state === 'highlight') ? 1 : 0;
    e.letterbox += (lb - e.letterbox) * (1 - Math.exp(-dt * 4));
    // phones: the player's own fighter taking a blow is felt in the hand too (the vibration option rules)
    const mine = this.online.inFight ? this.online.local : 0, feel = document.body.classList.contains('touchui') && this.state === 'fight' && !this.replaying;
    if (m) for (const ev of m.events) {
      if (ev.t === 'hit' && (ev.heavy || ev.ch)) { e.radial = Math.max(e.radial, ev.ch ? 0.35 : 0.2); e.hitFlash = Math.max(e.hitFlash, ev.ch ? 0.35 : 0.18); }
      // the marks a fight leaves on them (js/fx/wear.js), and the stage's answer to a blow or a fall (stage.react)
      if (ev.t === 'hit' && ev.def?.ch?.wear) ev.def.ch.wear.hit(ev.def.ch, ev.pos, (ev.dmg || 10) / 22 * (ev.heavy || ev.ch ? 1.3 : 1));
      if (ev.t === 'land' && ev.f?.ch?.wear) ev.f.ch.wear.fall();
      if (this.stage?.react) this.stage.react(ev);
      if (feel && ev.t === 'hit' && ev.def && ev.def.index === mine) haptic(ev.def.ko ? 90 : ev.heavy || ev.ch ? 40 : 14);
      if (feel && ev.t === 'block' && ev.f && ev.f.index === mine) haptic(8);
      if (ev.t === 'rageArt') { e.radial = 0.8; e.hitFlash = 0.6; e.desat = 0.5; }
      if (ev.t === 'rage') { e.hitFlash = Math.max(e.hitFlash, 0.25); }
    }
    if (m) m.events.length = 0;
    setFxViewHeight(this.renderer.getDrawingBufferSize(this._dbs || (this._dbs = new THREE.Vector2())).y);
    this.fx.update(this.capFrozen ? (this.capFrozen++ === 1 ? (+(q.get('hitage') || 2)) / FPS : 0) : dt);
    this.stage.update(dt, this.camera);
    if (m && (this.state === 'fight' || this.state === 'pause')) { const wet = this.stage.wetness?.() || 0; for (const f of m.fighters) f.ch?.wear?.update(f, this.state === 'fight' ? dt : 0, wet, this.fx); }
    if (m && this.stage.feet) this.stage.feet(m.fighters, dt);
    if (q.get('fxtest')) { const [r, h, d] = q.get('fxtest').split(',').map(Number); e.radial = r; e.hitFlash = h; e.desat = d || 0; }
    // (capture: the stage alone, for the stage select screen's pictures: tools/stageshots.sh)
    if (q.get('nofighters')) {
      this.scene.traverse((o) => { if (o.userData?.fighter) o.visible = false; }); for (const el of document.querySelectorAll('.screen')) el.style.display = 'none';
      this.contact?.decals.forEach((d) => (d.visible = false));
      // (a wider, higher view than the fight's, the stage's showpiece behind: STAGES[k].shot or a general one)
      const c = STAGES[this.stageKey]?.shot || {};
      this.camera.position.set(...(c.pos || [0, 2.3, 7.4])); this.camera.lookAt(...(c.look || [0, 2.0, -6])); this.camera.fov = c.fov || 50; this.camera.updateProjectionMatrix();
    }
    if (this.post && !q.get('norender')) {
      const u = this.post.u;
      const fl = this.prefs?.flash ?? 1;
      u.hitFlash.value = e.hitFlash * fl; u.radial.value = e.radial * fl; u.desat.value = e.desat; u.letterbox.value = e.letterbox;
      u.fade.value = e.fade || 0;
      if (this.post.bokeh) {
        const cine = e.letterbox > 0.5 || this.camCtl.mode === 'ko' || this.camCtl.mode === 'win';
        this.post.bokeh.enabled = cine && this.state !== 'title';
        if (!cine) this._wasCine = false;
        if (cine) {
          // focus pulls smoothly (rack focus) instead of snapping between subjects
          const fd = this.camera.position.distanceTo(this.camCtl.focusPt || this.camCtl.look);
          this._focusD = this._focusD == null || !this._wasCine ? fd : this._focusD + (fd - this._focusD) * (1 - Math.exp(-5 * dt));
          this.post.bokeh.uniforms.focus.value = this._focusD;
          // the KO shot spans a lot of depth: a smaller aperture keeps the fallen fighter readable
          this.post.bokeh.uniforms.aperture.value = this.camCtl.mode === 'ko' ? 0.0018 : 0.0035;
          this._wasCine = true;
        }
      }
      this.post.render(dt);
    }
  }

  // ------------------------------------------------------------------ PUÑETALITY button
  // on the win screen of a person's win, if the winner has one: his own screen only (online, the winner's phone)
  syncFatalButton(m) {
    const b = this.fatalBtn;
    if (!b) return;
    const W = m && m.phase === 'matchEnd' && !m.endSent ? m.fighters[m.winner] : null;
    const on = !!W && this.state === 'fight' && !this.replaying && m.pt > FATAL_FROM && m.canFatal(W) && this.prefs?.fatal !== false && (!this.online.inFight || this.online.local === W.index);
    if (on !== !!this._fatalOn) {
      this._fatalOn = on; b.classList.toggle('on', on); this.fatalMark?.classList.toggle('on', on);
      if (on) {
        // whom to finish, and how: TOCA AQUÍ on a phone, the winner's own up key + a punch or kick otherwise
        const L = W.opp, who = b.querySelector('.who b'), h = b.querySelector('.h');
        if (who) who.textContent = this.meta[L.id]?.display || L.ch?.meta?.display || '';
        const km = W.index === 0 || this.online.inFight ? KEYMAPS.p1 : KEYMAPS.p2, up = km.up?.find(Boolean);
        if (h) h.textContent = document.body.classList.contains('touchui') ? 'TOCA AQUÍ' : `PULSA ${up ? keyLabel(up) : '↑'} + GOLPE`;
      }
    }
    if (on && this.fatalMark) {
      // the target on the loser's chest, wherever he lies
      const L = W.opp, bn = L.ch?.bones.spine03 || L.ch?.bones.spine02;
      const v = (bn ? bn.getWorldPosition(this._fmV || (this._fmV = new THREE.Vector3())) : this._fmV.copy(L.pos).setY(0.4)).project(this.camera);
      const r = this.canvas.getBoundingClientRect();
      // (only while he is in the shot, clear of the button: the win shots often leave him out, and then the button's
      // own "¡REMATA A …!" says it)
      const x = v.x, y = v.y, inside = v.z < 1 && Math.abs(x) < 0.88 && y > -0.62 && y < 0.8 && !(x > 0.25 && y < -0.2);
      this.fatalMark.style.visibility = inside ? 'visible' : 'hidden';
      this.fatalMark.style.transform = `translate(${(r.left + (x + 1) / 2 * r.width).toFixed(1)}px, ${(r.top + (1 - y) / 2 * r.height).toFixed(1)}px)`;
    }
    if (on) {
      // the time left before the win screen ends by itself (Match: matchEnd)
      const st = W.style, minT = st.say ? (st.sayAt || 80) + (st.sayLen || 120) : 60, end = Math.max(420, minT + 60);
      const k = Math.max(0, 1 - (m.pt - FATAL_FROM) / (end - FATAL_FROM));
      const bar = b.querySelector('.bar i');
      if (bar) bar.style.transform = `scaleX(${k.toFixed(3)})`;
    }
  }
  // who may finish with a PUÑETALITY: a person (not the CPU), and only with them switched on in OPCIONES (off line: online
  // the simulation must be the same on both phones, so there the option only hides the button)
  fatalHumans(opts) { const on = this.prefs?.fatal !== false; return [!opts.demo && on, !!opts.human2 && on]; }
  // the button pressed: up and 1 for the winner, through his own controls (an input like any other)
  fatalPress() {
    const m = this.match;
    if (!m || m.phase !== 'matchEnd' || m.endSent) return;
    const W = m.fighters[m.winner];
    const ctrl = this.online.inFight ? this.online.ctrl : (W.index === 0 ? this.p1ctrl : this.p2keys);
    this.audio.init();
    ctrl?.press?.(1, B1, 4);
  }

  showcaseStep(m) {
    const E = this.entrance && this.entrance.m === m ? this.entrance : null;
    for (const f of m.fighters) {
      f.inp = { d: 5, fwd: 0, up: 0, held: 0, pressed: 0 };
      f.prevPos.copy(f.pos); f.prevYaw = f.yaw;
      if (f.clipName === 'intro' && f.cf > 90) f.play('idle', 10);
      if (E && f.state === 'walkF') {
        // walking in, at a guard's walking pace, to the spot of the start of a round
        const to = Math.sign(f.pos.x) * 1.4, d = to - f.pos.x;
        f.pos.x += Math.sign(d) * Math.min(Math.abs(d), 1.35 / FPS);
        if (Math.abs(to - f.pos.x) < 1e-3) { f.pos.x = to; f.setState('idle'); f.play('idle', 10); }
      }
      f.animate();
    }
    if (E && m.fighters.every((f) => f.state !== 'walkF')) this.entrance = null;
    if (E) return;
    // idle sparring loop on the title screen: occasionally throw a move for the backdrop
    if (this.state === 'title' && Math.random() < 0.012) {
      const f = m.fighters[Math.random() < 0.5 ? 0 : 1];
      if (f.state === 'idle') {
        const names = Object.keys(f.moves).filter(n => f.moves[n].hit && !f.moves[n].throw);
        f.startMove(names[Math.floor(Math.random() * names.length)]);
        f.setState('showmove');
      }
    }
    for (const f of m.fighters) {
      if (f.state === 'showmove') { f.mf++; if (f.mf >= f.move.total) { f.setState('idle'); f.play('idle', 6); f.move = null; } }
    }
  }
}

function fatal(msg) {
  const e = $('#loading .err'); if (e) e.textContent = msg;
  const t = $('#loading .tip'); if (t) t.textContent = '';
}
let game;
try {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) throw new Error('webgl2');
  game = new Game();
} catch (err) {
  console.error(err);
  fatal(String(err?.message) === 'webgl2' || /WebGL/i.test(String(err?.message))
    ? 'Tu navegador o tu dispositivo no admite WebGL 2, necesario para el juego. Prueba con Chrome, Edge, Firefox o Safari actualizados, y activa la aceleración por hardware.'
    : 'Error al iniciar: ' + (err?.message || err));
  throw err;
}
window.__game = game;
window.__debug = () => {
  const m = game.match;
  return JSON.stringify({ state: game.state, stage: game.stageKey, loading: document.querySelector('#loading').className, phase: m?.phase, frame: m?.frame, round: m?.round,
    f: m?.fighters.map(f => ({ id: f.id, st: f.state, hp: f.hp, pos: f.pos.toArray().map(v => +v.toFixed(2)), mv: f.moveName })), screens: [...document.querySelectorAll('.screen.on')].map(e => e.id) });
};
game.boot().catch(err => {
  console.error(err);
  fatal('Error al cargar: ' + (err && err.message ? err.message : err) + (location.protocol === 'file:' ? ' — ábrelo desde un servidor web (python3 -m http.server).' : ' — revisa la conexión y recarga la página.'));
});
