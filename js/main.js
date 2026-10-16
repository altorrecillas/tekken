// Puños de Barrio — main game shell.
import * as THREE from 'three';
import { DEVICE, defaultQuality, budget, setTextureCap, goFullscreenLandscape, fullscreenSupported, toggleFullscreen, viewSize, blockPageZoom, haptic } from './engine/device.js';
import { loadCharacterData, loadCharacterMeta, buildCharacter, texturesReady, LOD } from './charloader.js';
import { makeFighterMaterial, makeFighterKey } from './materials.js';
import { TerraceStage } from './stage/terrace.js';
import { StreetStage } from './stage/street.js';
import { PorcheStage } from './stage/porche.js';
import { PostFX } from './engine/post.js';
import { FX, setFxViewHeight } from './fx/fx.js';
import { HUD } from './ui/hud.js';
import { Audio } from './audio/audio.js';
import { FightCamera } from './fight/camera.js';
import { Match, SLOWMO } from './fight/match.js';
import { FPS } from './fight/fighter.js';
import { KeyboardController, GamepadController, MergedController, KEYMAPS, menuKeysPressed, START, B1, B2, B3, B4 } from './fight/input.js';
import { TouchController, loadTouchPrefs, saveTouchPrefs } from './ui/touch.js';
import { AIController } from './fight/ai.js';
import { STYLES } from './fight/styles.js';
import { Accessories } from './fx/accessories.js';
import { Ragdolls } from './fight/ragdoll.js';
import { ContactShadows } from './fx/contact.js';
import { Online } from './ui/online.js';
const _fkv = new THREE.Vector3();

const ROSTER = ['alejandro', 'arnau', 'camilo', 'rafa', 'zapponi', 'dani'];
const STAGES = {
  terrace: { cls: TerraceStage, name: 'AZOTEA AL ATARDECER', sub: 'VERANO EN EL BARRIO', dust: [0.78, 0.55, 0.42], dustLight: 0.85, amb: 'terrace', music: 'terrace',
    grade: { sat: 1.1, slope: [1.02, 1.0, 0.96] } },
  street: { cls: StreetStage, name: 'LA META 10K', sub: 'CARRERA POPULAR DEL BARRIO', dust: [0.55, 0.55, 0.56], dustLight: 0.6, amb: 'street', music: 'street',
    grade: { sat: 1.12, slope: [1.0, 1.0, 1.02] } },
  // a real street of the neighbourhood (the user's photo): graffiti shutters and a covered car park, overcast day
  porche: { cls: PorcheStage, name: 'EL PORCHE', sub: 'GRAFITIS DEL BARRIO', dust: [0.5, 0.5, 0.52], dustLight: 0.55, amb: 'porche', music: 'porche',
    grade: { sat: 1.04, slope: [1.0, 1.0, 1.02] } },
};
const STAGE_KEYS = Object.keys(STAGES);
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
// arcade difficulty: the CPU level (1..5, see fight/ai.js) of each fight in the ladder (one per rival)
const DIFFICULTY = {
  easy: { name: 'FÁCIL', ai: [1, 2, 2, 3, 3] },
  normal: { name: 'NORMAL', ai: [2, 3, 3, 4, 4] },
  hard: { name: 'DIFÍCIL', ai: [3, 4, 5, 5, 5] },
};
const DIFF_KEYS = Object.keys(DIFFICULTY);
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.canvas = $('#game');
    this.quality = q.get('q') || lsGet('pdb_quality') || defaultQuality();
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
    this.chars = {}; this.charLoads = {}; this.meta = {};
    this.state = 'loading';
    this.acc = 0; this.last = performance.now();
    this.timeScale = 1;
    this.effects = { hitFlash: 0, radial: 0, desat: 0, letterbox: 0, fade: 0 };
    this.touch = new TouchController($('#touch'));
    this.p1ctrl = new MergedController(new KeyboardController(KEYMAPS.p1), new GamepadController(0), this.touch);
    this.p2keys = new MergedController(new KeyboardController(KEYMAPS.p2), new GamepadController(1));
    this.roster = ROSTER;
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
      if (this.state === 'fight' && this.replaying) { this.online.replayEnded(); return; }
      if (this.state === 'fight' && (ph === 'intro' || ph === 'matchEnd')) this.touch.tap();
    }, { capture: true });
    addEventListener('keydown', () => this.audio.init());
    if ((DEVICE.touch && this.touch.opt.show !== 'never') || this.touch.opt.show === 'always') { this.touch.enable(); document.body.classList.add('touchui'); }
    // a gamepad takes over from the on-screen controls
    addEventListener('gamepadconnected', () => { this.padActive = true; this.refreshModeButtons(); });
    addEventListener('gamepaddisconnected', () => { this.padActive = false; this.refreshModeButtons(); });
    $('#touchPause').addEventListener('click', () => { if (this.state === 'fight') this.pause(true); });
    // app switched away / screen locked: pause the fight and silence the audio
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'fight' && this.match?.phase === 'fight' && !this.online.inFight) this.pause(true);
      this.audio.setHidden(document.hidden);
    });
    // rotated to portrait mid-fight (touch devices play in landscape): pause behind the rotate prompt
    matchMedia('(orientation: portrait)').addEventListener?.('change', (e) => { if (e.matches && document.body.classList.contains('touchui') && this.state === 'fight') this.pause(true); });
    // mobile browsers drop the GPU context under memory pressure or after long backgrounding
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; $('#glLost')?.classList.add('on'); });
    this.canvas.addEventListener('webglcontextrestored', () => location.reload());
  }

  // on-screen controls: only while fighting (dimmed after a KO), hidden in cinematics (a tap anywhere skips the
  // intro or leaves the victory screen) and while a gamepad is in use
  syncTouchUI() {
    this.camCtl.touchFrame = this.touch.enabled && document.body.classList.contains('touchui') && !this.padActive;
    if (!this.touch.enabled) return;
    const m = this.match;
    const inFight = this.state === 'fight' && !!m && !['showcase', 'intro', 'matchEnd'].includes(m.phase) && !this.padActive && !this.replaying;
    const cine = !!m && (m.phase === 'ko' || m.phase === 'end');
    if (inFight !== this._tv || cine !== this._tc) { this._tv = inFight; this._tc = cine; this.touch.setVisible(inFight, cine); }
    const p1 = m?.fighters?.[this.online.inFight ? this.online.local : 0];
    this.touch.setRage(!!(inFight && p1 && p1.rage && !p1.rageUsed && m.phase === 'fight'));
  }

  loadAudioPrefs() {
    try { const v = JSON.parse(lsGet('pdb_audio') || 'null'); if (v) Object.assign(this.audio.vol, v); } catch (e) { /* ignore */ }
  }
  saveAudioPrefs() { lsSet('pdb_audio', JSON.stringify(this.audio.vol)); }
  // VERSUS needs a second controller: hidden on touch-only devices until a gamepad shows up
  refreshModeButtons() {
    const vs = document.querySelector('#title .menu button[data-act="versus"]');
    if (vs) vs.style.display = document.body.classList.contains('touchui') && !this.padActive && !navigator.getGamepads?.()?.[0] ? 'none' : '';
  }

  async boot() {
    const bar = $('#loading .bar i'), tip = $('#loading .tip');
    const tips = ['Consejo: mantén atrás para bloquear golpes altos y medios.', 'Consejo: agáchate (abajo-atrás) para bloquear los golpes bajos.',
      'Consejo: toca arriba o abajo para esquivar lateralmente.', 'Consejo: abajo-adelante + 2 lanza al rival por los aires.', 'Consejo: 1+3 agarra; pulsa 1 o 2 para zafarte de un agarre.', 'Consejo: pulsa un botón justo al caer al suelo para recuperarte rodando.'];
    tip.textContent = tips[Math.floor(Math.random() * tips.length)];
    const prog = (p) => (bar.style.width = `${Math.round(p * 100)}%`);
    prog(0.05);
    this.stagePick = STAGES[q.get('stage')] ? q.get('stage') : 'terrace';
    await this.setStage(this.stagePick, false);
    prog(0.35);
    // portraits (pre-rendered)
    this.portraits = {};
    for (const id of ROSTER) this.portraits[id] = `assets/portraits/${id}.jpg`;
    this.hud.portraits = this.portraits;
    // menus only need the descriptors; meshes load on demand (the two title fighters now, the rest in the
    // background once the title is up), so the first screen does not wait for the whole roster
    const metas = await Promise.all(ROSTER.map(id => loadCharacterMeta(id).catch(() => null)));
    // a fighter whose files cannot be loaded is left out of the roster instead of stopping the boot
    for (let i = ROSTER.length - 1; i >= 0; i--) {
      if (metas[i]) this.meta[ROSTER[i]] = metas[i];
      else { console.warn('fighter not available:', ROSTER[i]); ROSTER.splice(i, 1); }
    }
    this.showcaseIds = this.pickShowcase();
    let n = 0;
    await Promise.all(this.showcaseIds.map(id => this.ensureChar(id).then(() => prog(0.35 + 0.45 * ++n / 2))));
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.quality);
    this.bakeStage();
    this.applyGrade();
    prog(0.9);
    this.accessories = new Accessories();
    this.ragdolls = new Ragdolls(this.scene);
    // stage obstacles (whichever stage is current): ragdolls stop at walls / barriers, cameras stay out of the set
    this.ragdolls.clampWalk = (p, r) => this.stage?.clampWalk?.(p, r);
    this.camCtl.clampCam = (p) => this.stage?.clampCam?.(p) || p;
    this.contact = new ContactShadows(this.scene);
    // show two fighters in the background of the title
    await this.setupShowcase();
    await texturesReady();
    prog(1);
    this.resize();
    this.loop();
    // fetch the rest of the roster quietly, one at a time
    setTimeout(async () => { for (const id of ROSTER) { try { await this.ensureChar(id); } catch (e) { /* retried on demand */ } } }, 1500);
    setTimeout(() => {
      $('#loading').classList.remove('on');
      if (q.get('demo')) {
        this.mode = 'versus';
        const p1 = q.get('p1') || 'alejandro', p2 = q.get('p2') || 'rafa';
        this.startFight(p1, p2, { demo: true, ai: +(q.get('ai') || 3), training: q.get('demo') === 'training' });
      } else {
        this.toTitle();
        if (q.get('screen') === 'select') { this.mode = 'arcade'; this.toSelect(); }
        if (q.get('frames') === '0') setTimeout(() => (window.__ready = true), 2500);
      }
    }, 300);
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
    d.t = 0; d.acc = 0; d.n = 0;
    if (Math.abs(ns - d.scale) > 0.01) {
      d.scale = ns;
      this.renderer.setPixelRatio(d.base * ns);
      this.resize();
    }
  }

  resize() {
    const { w, h } = viewSize();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
  }

  // ------------------------------------------------------------------ stages
  async setStage(key, bake = true) {
    if (!STAGES[key]) key = 'terrace';
    if (this.stage && this.stageKey === key) return;
    this.disposeStage();
    const def = STAGES[key];
    this.stage = new def.cls(this.renderer, this.scene, this.quality);
    this.stageKey = key;
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
    if (this.mode === 'arcade' && this.arcade) return STAGE_KEYS[this.arcade.stage % STAGE_KEYS.length];
    return this.stagePick || 'terrace';
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
  makeFighterModel(id) {
    const key = makeFighterKey();
    const ch = buildCharacter(this.chars[id], (def, base, lt, name) => makeFighterMaterial(def, base, lt, name, key));
    ch.fighterKey = key;
    this.accessories.attach(ch, STYLES[id], this.chars[id].meta);
    ch.group.userData.fighter = true;
    return ch;
  }

  // ------------------------------------------------------------------ showcase / title
  async setupShowcase() {
    const ids = this.showcaseIds || this.pickShowcase();
    this.showcaseIds = null;
    await Promise.all(ids.map(id => this.ensureChar(id)));
    this.clearFighters();
    const chars = ids.map(id => this.makeFighterModel(id));
    chars.forEach(c => this.scene.add(c.group));
    this.match = new Match(this, chars, ids, { rounds: 2 });
    for (const f of this.match.fighters) f.ctrl = null;
    this.match.startIntro();
    this.match.phase = 'showcase';
    this.match.fighters.forEach(f => { f.setState('idle'); f.play('idle', 1); });
    this.camCtl.setMode('fight', true);
  }
  clearFighters() {
    if (this.match) for (const f of this.match.fighters) { this.scene.remove(f.ch.group); f.ch.group.traverse(o => o.geometry?.dispose?.()); }
    this.match = null;
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
    this.state = 'title';
    this.showScreen('title');
    this.refreshDifficulty();
    this.hud.show(false);
    this.menuIndex = 0;
    this.setupMenu('#title .menu', (act) => this.titleAction(act));
    this.refreshModeButtons();
    $('#title .presskey').textContent = document.body.classList.contains('touchui') ? 'TOCA UNA OPCIÓN' : 'PULSA ENTER O ⓧ';
    this.audio.music('menu');
    this.audio.ambience(STAGES[this.stageKey]?.amb || 'terrace');
    this.effects.letterbox = 0;
  }
  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) if (s.id !== 'hud' && s.id !== 'loading') s.classList.toggle('on', s.id === id);
  }
  setupMenu(sel, cb) {
    const btns = [...document.querySelectorAll(`${sel} button`)];
    this.menu = { btns, cb, idx: 0 };
    btns.forEach((b, i) => {
      b.onpointerenter = (e) => { if (e.pointerType !== 'mouse') return; this.menu.idx = i; this.refreshMenu(); };
      b.onclick = () => { this.audio.init(); this.audio.play('uiok'); cb(b.dataset.act); };
    });
    this.refreshMenu();
  }
  refreshMenu() { this.menu.btns.forEach((b, i) => b.classList.toggle('sel', i === this.menu.idx)); }
  menuInput(keys, pad) {
    if (!this.menu) return;
    const up = keys.has('ArrowUp') || keys.has('KeyW') || pad.up, down = keys.has('ArrowDown') || keys.has('KeyS') || pad.down;
    if (up) { this.menu.idx = (this.menu.idx + this.menu.btns.length - 1) % this.menu.btns.length; this.refreshMenu(); this.audio.play('ui'); }
    if (down) { this.menu.idx = (this.menu.idx + 1) % this.menu.btns.length; this.refreshMenu(); this.audio.play('ui'); }
    if (keys.has('Enter') || keys.has('KeyU') || keys.has('Space') || pad.ok) { this.audio.play('uiok'); this.menu.cb(this.menu.btns[this.menu.idx].dataset.act); }
  }
  titleAction(act) {
    this.audio.init();
    // phones: go fullscreen + landscape on the first tap (needs a user gesture; unsupported on iPhone Safari)
    if (document.body.classList.contains('touchui') && !this.fsAsked && !DEVICE.standalone && fullscreenSupported()) { this.fsAsked = true; goFullscreenLandscape(); }
    if (act === 'arcade' || act === 'versus' || act === 'training') { this.mode = act; this.toSelect(); }
    else if (act === 'online') this.online.open();
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
  toSelect() {
    this.state = 'select';
    this.audio.preloadVoices(ROSTER); // the pick shout plays straight away
    this.showScreen('select');
    this.menu = null;
    const online = this.mode === 'online';
    const grid = $('#select .grid');
    grid.innerHTML = '';
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
    this.sel = { i: [0, 1], done: [false, !this.isVs()] };
    $('#selBack').onclick = () => {
      this.audio.play('ui');
      if (online) { const L = this.online.local; if (this.sel.done[L]) { this.sel.done[L] = false; this.refreshSel(); this.selMoved(L); } else this.online.backFromSelect(); return; }
      if (this.sel.done[1] && this.mode === 'versus') { this.sel.done[1] = false; this.refreshSel(); } else if (this.sel.done[0] && this.mode === 'versus') { this.sel.done[0] = false; this.refreshSel(); } else this.toTitle();
    };
    $('#selHint').textContent = document.body.classList.contains('touchui') ? (online ? 'Toca tu luchador para verlo · tócalo otra vez para elegirlo' : 'Toca un luchador para verlo · tócalo otra vez para elegirlo') : '';
    this.refreshStageBar();
    this.refreshSel();
    this.previewIds = [null, null];
    if (online) this.onlineResend();
  }
  refreshStageBar() {
    const mode = this.mode === 'arcade' ? 'MODO ARCADE' : this.mode === 'versus' ? 'VERSUS' : this.mode === 'online' ? 'ONLINE' : 'ENTRENAMIENTO';
    const bar = $('#select .stagebar');
    if (this.mode === 'arcade') { bar.textContent = `${mode} · DIFICULTAD ${DIFFICULTY[this.difficulty].name}`; return; }
    // online the host picks the stage; the other phone sees it change
    if (this.mode === 'online' && !this.online.isHost) { bar.innerHTML = `${mode} · ESCENARIO <span class="stg">${STAGES[this.stagePick].name}</span> <small>(lo elige ${this.online.peerName.replace(/[&<>"']/g, '')})</small>`; return; }
    bar.innerHTML = `${mode} · ESCENARIO <span class="stg"><b data-d="-1">◀</b> ${STAGES[this.stagePick].name} <b data-d="1">▶</b></span> <small>(W / S)</small>`;
    bar.querySelectorAll('b').forEach(b => (b.onclick = () => this.cycleStage(+b.dataset.d)));
  }
  cycleStage(d) {
    if (this.mode === 'online' && !this.online.isHost) return;
    const i = STAGE_KEYS.indexOf(this.stagePick);
    this.stagePick = STAGE_KEYS[(i + d + STAGE_KEYS.length) % STAGE_KEYS.length];
    this.audio.play('ui');
    this.refreshStageBar();
    if (this.mode === 'online') this.online.net?.send({ t: 'stage', key: this.stagePick });
  }
  // online: this phone's cursor to the other phone (by fighter id: the rosters could differ)
  selMoved(k) {
    if (this.mode !== 'online' || k !== this.online.local || !this.online.net) return;
    this.online.net.send({ t: 'sel', id: ROSTER[this.sel.i[k]], done: !!this.sel.done[k] });
  }
  onlineResend() {
    if (this.mode !== 'online' || this.state !== 'select') return;
    this.selMoved(this.online.local);
    if (this.online.isHost) this.online.net?.send({ t: 'stage', key: this.stagePick });
  }
  // the other phone's cursor
  onlineSel(m) {
    if (this.mode !== 'online' || this.state !== 'select' || !this.sel) return;
    const R = 1 - this.online.local, idx = ROSTER.indexOf(String(m.id));
    if (idx < 0) return;
    const was = this.sel.done[R];
    this.sel.i[R] = idx; this.sel.done[R] = !!m.done;
    if (m.done && !was) { this.audio.preloadVoices([ROSTER[idx]]); this.audio.voice({ id: ROSTER[idx] }, 'attack'); } else this.audio.play('ui');
    this.refreshSel();
    this.onlineBoth();
  }
  onlineStage(key) {
    if (this.mode !== 'online' || this.online.isHost || !STAGES[key]) return;
    this.stagePick = key;
    if (this.state === 'select') { this.audio.play('ui'); this.refreshStageBar(); }
  }
  onlineNames() { if (this.mode === 'online' && this.state === 'select') this.refreshSel(); }
  // host: both have picked: a moment to see both ready, then the fight
  onlineBoth() {
    if (!this.online.isHost || !this.sel.done[0] || !this.sel.done[1]) return;
    clearTimeout(this._goT);
    this._goT = setTimeout(() => {
      if (this.state !== 'select' || this.mode !== 'online' || !this.sel.done[0] || !this.sel.done[1]) return;
      this.online.bothPicked(ROSTER[this.sel.i[0]], ROSTER[this.sel.i[1]], this.stagePick);
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
    const info = (el, id, ready, i) => {
      const s = STYLES[id], st = s.stats;
      const bar = (v, mx) => `<span class="trk"><i style="width:${Math.round(v / mx * 110)}px"></i></span>`;
      el.innerHTML = `${who(i)}<div class="ttl">${s.title.toUpperCase()}</div><div class="big">${this.meta[id].display}</div><div class="dsc">${s.desc}</div>
        <div class="stats"><div class="stat"><b>FUERZA</b>${bar(st.power, 1.25)}</div><div class="stat"><b>VELOCIDAD</b>${bar(st.speed, 1.15)}</div><div class="stat"><b>AGUANTE</b>${bar(st.health, 200)}</div></div>
        ${ready ? '<div class="ready">¡LISTO!</div>' : ''}`;
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
    if (this.previewIds && this.previewIds[0] === ids[0] && this.previewIds[1] === ids[1] && this.match) return;
    // not downloaded yet: keep the current preview and come back when the mesh arrives
    if (!this.chars[ids[0]] || !this.chars[ids[1]]) {
      Promise.all(ids.map(id => this.ensureChar(id))).then(() => { if (this.state === 'select') this.updatePreview(); }).catch(() => {});
      return;
    }
    this.previewIds = ids;
    this.clearFighters();
    const chars = ids.map(id => this.makeFighterModel(id));
    chars.forEach(c => this.scene.add(c.group));
    this.match = new Match(this, chars, ids, {});
    this.match.phase = 'showcase';
    const [a, b] = this.match.fighters;
    // single player: the fighter stands clear of the info panel and faces the camera
    if (vs) { a.pos.set(-0.75, 0, 0.6); b.pos.set(0.75, 0, 0.6); a.yaw = 0.35; b.yaw = -0.35; }
    else { a.pos.set(0.15, 0, 0.6); b.pos.set(2.5, 0, 0.6); a.yaw = -0.12; b.yaw = -0.35; a.lookAt = new THREE.Vector3(0, 1.1, 6.44); }
    for (const f of this.match.fighters) { f.setState('idle'); f.play('intro', 1); f.prevPos.copy(f.pos); f.prevYaw = f.yaw; }
    if (!vs) b.ch.group.visible = false;
    this.camCtl.setMode('select', true);
  }
  selectInput(keys, pads) {
    const s = this.sel;
    if (this.mode === 'online') {
      // this phone's player only, with either keyboard layout or the first pad
      const L = this.online.local;
      const l = keys.has('KeyA') || keys.has('ArrowLeft') || pads[0].left, r = keys.has('KeyD') || keys.has('ArrowRight') || pads[0].right;
      const ok = keys.has('KeyU') || keys.has('Enter') || keys.has('Space') || keys.has('Numpad4') || pads[0].ok, back = keys.has('Escape') || keys.has('KeyK') || keys.has('Backspace') || pads[0].back;
      if (this.online.isHost) {
        if (keys.has('KeyW') || keys.has('ArrowUp') || pads[0].up) this.cycleStage(-1);
        if (keys.has('KeyS') || keys.has('ArrowDown') || pads[0].down) this.cycleStage(1);
      }
      if (s.done[L]) { if (back) { s.done[L] = false; this.audio.play('ui'); this.refreshSel(); this.selMoved(L); } return; }
      if (l) { s.i[L] = (s.i[L] + ROSTER.length - 1) % ROSTER.length; this.audio.play('ui'); this.refreshSel(); this.selMoved(L); }
      if (r) { s.i[L] = (s.i[L] + 1) % ROSTER.length; this.audio.play('ui'); this.refreshSel(); this.selMoved(L); }
      if (ok) { this.audio.play('uiok'); this.confirmSel(L); }
      else if (back) this.online.backFromSelect();
      return;
    }
    const P = [
      { l: keys.has('KeyA') || pads[0].left, r: keys.has('KeyD') || pads[0].right, ok: keys.has('KeyU') || keys.has('Enter') || keys.has('Space') || pads[0].ok, back: keys.has('Escape') || keys.has('KeyK') || pads[0].back },
      { l: keys.has('ArrowLeft') || pads[1].left, r: keys.has('ArrowRight') || pads[1].right, ok: keys.has('Numpad4') || keys.has('Digit7') || keys.has('NumpadEnter') || pads[1].ok, back: keys.has('Backspace') || pads[1].back },
    ];
    if (this.mode !== 'versus') { // single player: arrows also move P1
      P[0].l ||= keys.has('ArrowLeft'); P[0].r ||= keys.has('ArrowRight');
    }
    if (this.mode !== 'arcade') {
      if (keys.has('KeyW') || keys.has('ArrowUp') || pads[0].up) this.cycleStage(-1);
      if (keys.has('KeyS') || keys.has('ArrowDown') || pads[0].down) this.cycleStage(1);
    }
    for (let i = 0; i < 2; i++) {
      if (i === 1 && this.mode !== 'versus') break;
      if (s.done[i]) { if (P[i].back) { s.done[i] = false; this.refreshSel(); } continue; }
      if (P[i].l) { s.i[i] = (s.i[i] + ROSTER.length - 1) % ROSTER.length; this.audio.play('ui'); this.refreshSel(); }
      if (P[i].r) { s.i[i] = (s.i[i] + 1) % ROSTER.length; this.audio.play('ui'); this.refreshSel(); }
      if (P[i].ok) { this.audio.play('uiok'); this.confirmSel(i); }
    }
    if (P[0].back && !s.done[0]) this.toTitle();
  }
  confirmSel(i) {
    this.audio.preloadVoices([ROSTER[this.sel.i[i]]]);
    this.sel.done[i] = true;
    this.refreshSel();
    this.audio.voice({ id: ROSTER[this.sel.i[i]] }, 'attack');
    if (this.mode === 'online') { this.selMoved(i); this.onlineBoth(); return; }
    if (this.sel.done[0] && this.sel.done[1]) setTimeout(() => this.startMode(), 700);
  }

  startMode() {
    const p1 = ROSTER[this.sel.i[0]];
    if (this.mode === 'arcade') {
      // one fight against each of the other four, in random order; the title is won after the last one
      const others = ROSTER.filter(x => x !== p1).sort(() => Math.random() - 0.5);
      this.arcade = { p1, ladder: others, stage: 0, diff: this.difficulty };
      this.startFight(p1, this.arcade.ladder[0], { ai: this.arcadeAI(0) });
    } else if (this.mode === 'versus') {
      this.startFight(p1, ROSTER[this.sel.i[1]], { human2: true });
    } else {
      this.startFight(p1, ROSTER[(this.sel.i[0] + 1) % ROSTER.length], { training: true });
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
    $('#fade .txt').textContent = 'CARGANDO…';
    // loading card: who fights next (and where in the arcade ladder), shown until the fight is ready
    const vs = $('#fadeVs'), stp = $('#fadeStep');
    if (vs) vs.textContent = `${this.meta[id1]?.display || id1}  vs  ${this.meta[id2]?.display || id2}`;
    if (stp) stp.textContent = this.mode === 'arcade' && this.arcade ? `COMBATE ${this.arcade.stage + 1} DE ${this.arcade.ladder.length}` : opts.online ? `VERSUS ONLINE · ${this.online.names().join('  vs  ')}` : opts.replay ? 'REPETICIÓN' : '';
    this.fade(true);
    await new Promise(r => setTimeout(r, 380));
    if (stale()) return;
    const busy = setTimeout(() => { if (!stale()) $('#fade').classList.add('busy'); }, 120);
    const done = () => { clearTimeout(busy); $('#fade').classList.remove('busy'); };
    this.audio.preloadVoices([id1, id2]);
    try { await Promise.all([this.ensureChar(id1), this.ensureChar(id2)]); }
    catch (e) { if (stale()) return; done(); if (opts.online) { opts.online.fail(); return; } this.fade(false); this.showOverlay('<h3>SIN CONEXIÓN</h3><p>No se pudo descargar un luchador. Revisa la conexión e inténtalo de nuevo.</p>', () => this.startFight(id1, id2, opts), () => this.backToTitle(), { ok: 'REINTENTAR', back: 'MENÚ' }); return; }
    if (stale()) return;
    this.clearFighters();
    const stageKey = this.stageFor(opts);
    if (stageKey !== this.stageKey) { await this.setStage(stageKey); this.audio.ambience(STAGES[stageKey].amb); }
    if (stale()) return;
    const chars = [this.makeFighterModel(id1), this.makeFighterModel(id2)];
    chars.forEach(c => this.scene.add(c.group));
    await texturesReady();
    if (stale()) { chars.forEach(c => { this.scene.remove(c.group); c.group.traverse(o => o.geometry?.dispose?.()); }); return; }
    done();
    if (opts.online) { this.onlineFight(chars, id1, id2, opts); return; }
    if (opts.replay) { this.replayFight(chars, id1, id2, opts); return; }
    this.match = new Match(this, chars, [id1, id2], { training: !!opts.training });
    this.hud.setRounds(this.match.opts.rounds);
    this.camCtl.normalFrom = null; this.ragdolls.drivePos = true; // (as they are outside an online fight)
    const [a, b] = this.match.fighters;
    a.ctrl = this.p1ctrl;
    if (opts.human2) b.ctrl = this.p2keys;
    else if (opts.training) { b.ctrl = { poll: () => ({ dx: 0, dy: 0, held: 0, pressed: 0 }) }; }
    else { const ai = new AIController(opts.ai || 3); ai.attach(b, this.match); b.ctrl = ai; }
    if (opts.demo && !opts.training) { const ai1 = new AIController(opts.ai || 3); ai1.attach(a, this.match); a.ctrl = ai1; }
    this.fightOpts = { id1, id2, ...opts };
    this.showScreen('none');
    this.hud.setFighters(this.match.fighters);
    this.hud.stageName = `${STAGES[this.stageKey].name}<small>${STAGES[this.stageKey].sub}</small>`;
    $('#trainingInfo').classList.toggle('on', !!opts.training);
    const hint = $('.movelist-hint');
    hint.textContent = document.body.classList.contains('touchui') ? 'II: pausa y lista de movimientos' : 'ESC / START: pausa y lista de movimientos'; hint.classList.remove('fade');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => hint.classList.add('fade'), 6000);
    this.state = 'fight';
    if (opts.training) this.match.startRound(); else this.match.startIntro();
    if (q.get('hp')) this.match.hpScale = +q.get('hp');
    this.audio.music(STAGES[this.stageKey].music);
    this.fade(false);
  }
  fade(on) { $('#fade').classList.toggle('on', on); }

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
    if (this.mode === 'arcade') {
      if (won) {
        this.arcade.stage++;
        if (this.arcade.stage >= this.arcade.ladder.length) {
          const names = this.arcade.ladder.map(id => this.meta[id].display).join(', ');
          this.showOverlay(`<h3>¡CAMPEÓN DEL BARRIO!</h3><p style="font-size:20px">${this.meta[this.arcade.p1].display} ha vencido a todos sus amigos: ${names}.</p><p style="font-size:15px;opacity:.75">Dificultad ${DIFFICULTY[this.arcade.diff].name}</p>`, () => this.backToTitle(), null, { ok: 'MENÚ PRINCIPAL' });
          return;
        }
        const next = this.arcade.ladder[this.arcade.stage];
        this.startFight(this.arcade.p1, next, { ai: this.arcadeAI(this.arcade.stage) });
      } else {
        this.showOverlay('<h3>HAS PERDIDO</h3><p style="font-size:20px">¿Quieres la revancha?</p>', () => this.startFight(this.fightOpts.id1, this.fightOpts.id2, this.fightOpts), () => this.backToTitle(), { ok: 'CONTINUAR', back: 'MENÚ' });
      }
    } else {
      this.showOverlay(`<h3>${match.fighters[match.winner].ch.meta.display} GANA</h3>`, () => this.startFight(this.fightOpts.id1, this.fightOpts.id2, this.fightOpts), () => this.backToTitle(), { ok: 'REVANCHA', back: 'MENÚ' });
    }
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
      this.setupMenu('#pause .menu.local', (act) => {
        if (act === 'resume') this.pause(false);
        else if (act === 'restart') { $('#pause').classList.remove('on'); this.startFight(this.fightOpts.id1, this.fightOpts.id2, this.fightOpts); }
        else if (act === 'quit') { $('#pause').classList.remove('on'); this.backToTitle(); }
        else if (act === 'movelist') this.showMoveList();
      });
    } else {
      $('#pause').classList.remove('on');
      $('#overlay').classList.remove('on');
      this.state = 'fight';
      this.menu = null;
    }
    this.syncTouchUI();
  }
  showMoveList() {
    const f = this.match.fighters[this.online.inFight ? this.online.local : 0];
    const rows = f.commands.map(c => `<tr><td>${c.str.replace(/\+/g, ' + ')}</td><td>${f.moves[c.move].name}</td><td>${f.moves[c.move].hit ? ({ high: 'Alto', mid: 'Medio', low: 'Bajo', smid: 'Medio esp.', throw: 'Agarre' })[f.moves[c.move].hit.lvl] : ''}</td></tr>`).join('');
    this.showOverlay(`<h3>${f.ch.meta.display} — MOVIMIENTOS</h3><table>${rows}</table><p style="color:#999;font-size:14px;margin-top:10px">1 = puño izq · 2 = puño der · 3 = patada izq · 4 = patada der · f = hacia el rival · b = atrás · d = abajo · u = arriba</p>`, () => this.pause(true), null, { ok: 'VOLVER' });
    this.state = 'overlay-pause';
  }
  showControls() {
    this.showOverlay(`<h3>CONTROLES</h3><table>
      <tr><td>Jugador 1</td><td>WASD mover · U = 1 (puño izq) · I = 2 (puño der) · J = 3 (patada izq) · K = 4 (patada der)</td></tr>
      <tr><td>Jugador 2</td><td>Flechas · Numpad 4/5/1/2 (o 7/8/9/0)</td></tr>
      <tr><td>Mando</td><td>□ 1 · △ 2 · ✕ 3 · ○ 4 · L1 1+2 · R1 3+4 · L2/R2 agarres</td></tr>
      <tr><td>Bloquear</td><td>Mantener atrás (alto/medio) · abajo-atrás (bajo)</td></tr>
      <tr><td>Esquivar</td><td>Toque rápido arriba o abajo</td></tr>
      <tr><td>Dash</td><td>adelante, adelante · atrás, atrás</td></tr>
      <tr><td>Agarre</td><td>1+3 o 2+4 · Escapar: 1 o 2 al ser agarrado</td></tr>
      <tr><td>Recuperación</td><td>Pulsa cualquier botón justo al caer al suelo para levantarte al instante</td></tr>
      <tr><td>Pausa</td><td>ESC / Enter / START</td></tr>
      <tr><td>Táctil</td><td>Joystick a la izquierda (aparece donde apoyes el pulgar) · botones 1 2 3 4 a la derecha · el hueco entre dos botones pulsa los dos (1+2, 3+4, 1+3, 2+4) · el botón RAGE ART aparece cuando tienes furia · II = pausa</td></tr></table>`, () => this.toTitle(), null, { ok: 'VOLVER' });
  }
  showOptions() {
    const QN = { low: 'BAJA', medium: 'MEDIA', high: 'ALTA', ultra: 'ULTRA' };
    const t = this.touch.opt, sel = (id, list, cur) => `<select id="${id}">${list.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const fs = fullscreenSupported() ? '<div class="row"><span>Pantalla completa</span><button id="optFs" class="mini">ACTIVAR / SALIR</button></div>' : '';
    this.showOverlay(`<h3>OPCIONES</h3><div class="opts"><div>
      <h4>GENERAL</h4>
      <div class="row"><span>Calidad gráfica</span>${sel('optQ', Object.entries(QN), this.quality)}</div>
      <div class="row"><span>Música</span><input id="optM" type="range" min="0" max="1" step="0.05" value="${this.audio.vol.music}"></div>
      <div class="row"><span>Efectos</span><input id="optS" type="range" min="0" max="1" step="0.05" value="${this.audio.vol.sfx}"></div>
      ${fs}
      </div><div>
      <h4>CONTROLES TÁCTILES</h4>
      <div class="row"><span>Mostrar</span>${sel('optTs', [['auto', 'Automático'], ['always', 'Siempre'], ['never', 'Nunca']], t.show)}</div>
      <div class="row"><span>Tamaño</span>${sel('optTz', [[0.85, 'Pequeño'], [1, 'Normal'], [1.18, 'Grande']], t.size)}</div>
      <div class="row"><span>Opacidad</span><input id="optTo" type="range" min="0.35" max="1" step="0.05" value="${t.opacity}"></div>
      <div class="row"><span>Joystick</span>${sel('optTk', [['float', 'Flotante'], ['fixed', 'Fijo']], t.stick)}</div>
      <div class="row"><span>Vibración</span>${sel('optTh', [[1, 'Sí'], [0, 'No']], t.haptics ? 1 : 0)}</div>
      </div></div>
      <p class="note">Un cambio de calidad gráfica recarga el juego.</p>
      <p class="note">Música: Kevin MacLeod (incompetech.com) · Público: Gregor Quendel · licencia CC BY 4.0</p>`, () => {
      const T = this.touch;
      T.opt = { ...T.opt, show: $('#optTs').value, size: +$('#optTz').value, opacity: +$('#optTo').value, stick: $('#optTk').value, haptics: $('#optTh').value === '1' };
      saveTouchPrefs(T.opt);
      if (T.opt.show === 'never') { T.disable(); document.body.classList.remove('touchui'); }
      else if (T.opt.show === 'always' || DEVICE.touch) { T.enable(); T.applyPrefs(); document.body.classList.add('touchui'); }
      this.saveAudioPrefs();
      const nq = $('#optQ')?.value;
      if (nq && nq !== this.quality) { lsSet('pdb_quality', nq); location.reload(); return; }
      this.toTitle();
    }, () => { this.saveAudioPrefs(); this.toTitle(); }, { ok: 'GUARDAR', back: 'VOLVER' });
    $('#optM').oninput = (e) => { this.audio.vol.music = +e.target.value; if (this.audio.musicBus) this.audio.musicBus.gain.value = +e.target.value; };
    $('#optS').oninput = (e) => { this.audio.vol.sfx = +e.target.value; if (this.audio.sfxBus) this.audio.sfxBus.gain.value = +e.target.value; };
    if ($('#optFs')) $('#optFs').onclick = () => toggleFullscreen();
  }

  // ------------------------------------------------------------------ loop
  padMenuState() {
    const out = [];
    for (let i = 0; i < 2; i++) {
      const g = navigator.getGamepads?.()[i];
      const prev = (this._pad || [])[i] || {};
      const cur = { left: false, right: false, up: false, down: false, ok: false, back: false, start: false };
      if (g) {
        const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
        cur.left = g.buttons[14]?.pressed || ax < -0.5; cur.right = g.buttons[15]?.pressed || ax > 0.5;
        cur.up = g.buttons[12]?.pressed || ay < -0.5; cur.down = g.buttons[13]?.pressed || ay > 0.5;
        cur.ok = g.buttons[0]?.pressed || g.buttons[2]?.pressed; cur.back = g.buttons[1]?.pressed; cur.start = g.buttons[9]?.pressed;
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
    this.last = now;
    if (this.state === 'fight') this.dynRes(dt);
    const keys = menuKeysPressed();
    const pads = this.padMenuState();
    if (this.state === 'title') this.menuInput(keys, pads[0]);
    else if (this.state === 'select') this.selectInput(keys, pads);
    else if (this.state === 'pause') { this.menuInput(keys, pads[0]); if (keys.has('Escape') || pads[0].start) this.pause(false); }
    else if (this.state === 'overlay' || this.state === 'overlay-pause') {
      if (keys.has('Enter') || keys.has('KeyU') || keys.has('Space') || pads[0].ok) this.overlayCb.ok();
      else if (keys.has('Escape') || keys.has('KeyK') || pads[0].back) this.overlayCb.back();
    } else if (this.state === 'fight' && this.replaying) {
      if (keys.size || pads[0].ok || pads[0].start || pads[0].back) this.online.replayEnded();
    } else if (this.state === 'fight') {
      if (keys.has('Escape') || pads[0].start || pads[1].start || (keys.has('Enter') && this.match?.phase === 'fight')) this.pause(true);
    } else if (this.state === 'online') {
      if (keys.has('Escape')) this.online.escape();
    } else if (this.state === 'netresults') {
      if (keys.has('Enter') || pads[0].ok) this.online.choose('rematch');
    }
    // online: the rollback session plays the frames (both phones' inputs), whatever this screen is showing
    this.online.tick(dt);
    const netRun = !!this.online.session && this.match === this.online.match;
    // simulation
    const m = this.match;
    let alpha = 1;
    this.syncTouchUI();
    if (m) {
      const running = !netRun && (this.state === 'fight' || this.state === 'title' || this.state === 'select' || this.state === 'online' || this.state === 'netresults');
      if (netRun) alpha = this.online.session.alpha;
      else if (running) {
        let scale = 1;
        if (m.slowmo > 0) { if (!m.det) m.slowmo -= dt; scale = SLOWMO; }
        this.acc += dt * scale;
        let steps = 0;
        let maxSteps = +(q.get('maxsteps') || 6);
        if (q.get('fixedstep')) this.acc = Math.max(this.acc, (+q.get('fixedstep')) / FPS);
        // capture mode: simulate without rendering until the requested frame
        const simonly = +(q.get('simonly') || 0);
        const ro = q.get('readyon'), ra = +(q.get('readyat') || 0);
        const stopAt = () => (ro === 'ko' && (m.phase === 'ko' || m.phase === 'matchEnd') && m.pt >= (ra || 45))
          || (ro === 'intro' && m.phase === 'intro' && m.pt >= (ra || 40))
          || (ro === 'win' && m.phase === 'matchEnd' && m.pt >= (ra || 90))
          // a few frames after the first heavy/counter hit past frame `readyat` (impact VFX checks)
          || (ro === 'hit' && m.lastHeavyFrame >= ra && m.frame - m.lastHeavyFrame >= +(q.get('hitage') || 2))
          || (ro === 'tech' && m.lastTechFrame >= ra && m.frame - m.lastTechFrame >= +(q.get('hitage') || 8));
        const koHit = stopAt();
        // impact captures freeze the simulation on the stop frame; the camera snaps and the particles age by `hitage` once
        if ((ro === 'hit' || ro === 'tech') && koHit && !this.capFrozen) { this.capFrozen = 1; this.camCtl.snap = true; this.readyIn = 3; }
        const fastForward = simonly && m.phase !== 'showcase' && m.frame < simonly && !koHit;
        if (koHit && !window.__ready) { this.readyIn = (this.readyIn ?? 8) - 1; if (this.readyIn <= 0) window.__ready = true; }
        if (fastForward) { this.acc = 400 / FPS; maxSteps = 400; }
        if (this.capFrozen) { this.acc = 0; maxSteps = 0; }
        while (this.acc >= 1 / FPS && steps < maxSteps) {
          if (m.phase === 'showcase') this.showcaseStep(m);
          else m.step();
          if (fastForward && stopAt()) { this.acc = 0; break; }
          if (!m.hitstop) this.ragdolls.step(1 / FPS);
          this.acc -= 1 / FPS; steps++;
        }
        if (q.get('frames') && m.frame >= +q.get('frames') && !window.__ready) window.__ready = true;
        if (simonly && m.phase !== 'showcase' && m.frame >= simonly && !window.__ready) { this.readyIn = (this.readyIn ?? 6) - 1; if (this.readyIn <= 0) window.__ready = true; }
        if (fastForward) {
          for (const f of m.fighters) { if (!f.ragdoll) f.syncRender(1); }
          this.ragdolls.sync();
          // the camera follows the simulated time too, so a capture shows the framing a player would see
          this.camCtl.introT = m.phase === 'intro' ? m.pt / FPS : null;
          this.camCtl.update(Math.min(2, steps / FPS), m.fighters);
          return;
        }
        alpha = this.acc * FPS;
      }
      for (const f of m.fighters) { if (!f.ragdoll) f.syncRender(alpha); }
      this.ragdolls.sync();
      this.contact.update(m.fighters);
      this.fx.updateTrails();
      for (const f of m.fighters) if (f.rage && !f.ko) this.fx.aura(f, dt);
      // stage shadow follows the action
      const c = new THREE.Vector3().addVectors(m.fighters[0].ch.group.position, m.fighters[1].ch.group.position).multiplyScalar(0.5);
      const spread = m.fighters[0].pos.distanceTo(m.fighters[1].pos);
      this.stage.followShadow(c, spread);
      this.stage.keyBoost = m.phase === 'intro' || m.phase === 'matchEnd' ? 1.4 : 1; // cinematic close-ups get more face light
      this.stage.followCamera(this.camera, c);
      this.camCtl.introT = m.phase === 'intro' ? m.pt / FPS : null;
      this.camCtl.update(dt, m.fighters);
      // per-fighter key light (view space): from in front of each fighter, above and towards the lens, so a face in
      // profile is lit whichever side of the screen it is on; the rim kicks in from behind the fighter
      this.camera.updateMatrixWorld();
      for (const f of m.fighters) {
        const k = f.ch.fighterKey; if (!k) continue;
        const fv = _fkv.set(Math.sin(f.yaw), 0, Math.cos(f.yaw)).transformDirection(this.camera.matrixWorldInverse);
        k.dir.value.set(fv.x * 0.55, 0.62 + fv.y * 0.3, 0.55 + Math.max(0, fv.z) * 0.35).normalize();
        k.rimDir.value.set(-fv.x * 0.6, 0.35, -0.75).normalize();
      }
      this.accessories.update(dt);
    }
    // effects
    const e = this.effects;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
    e.radial = Math.max(0, e.radial - dt * 1.4);
    const targetDesat = m && m.slowmo > 0 ? 0.45 : 0;
    e.desat += (targetDesat - e.desat) * (1 - Math.exp(-dt * 6));
    const lb = m && (m.phase === 'intro' || m.phase === 'matchEnd') ? 1 : 0;
    e.letterbox += (lb - e.letterbox) * (1 - Math.exp(-dt * 4));
    // phones: the player's own fighter taking a blow is felt in the hand too (the vibration option rules)
    const mine = this.online.inFight ? this.online.local : 0, feel = document.body.classList.contains('touchui') && this.state === 'fight' && !this.replaying;
    if (m) for (const ev of m.events) {
      if (ev.t === 'hit' && (ev.heavy || ev.ch)) { e.radial = Math.max(e.radial, ev.ch ? 0.35 : 0.2); e.hitFlash = Math.max(e.hitFlash, ev.ch ? 0.35 : 0.18); }
      if (feel && ev.t === 'hit' && ev.def && ev.def.index === mine) haptic(ev.def.ko ? 90 : ev.heavy || ev.ch ? 40 : 14);
      if (feel && ev.t === 'block' && ev.f && ev.f.index === mine) haptic(8);
      if (ev.t === 'rageArt') { e.radial = 0.8; e.hitFlash = 0.6; e.desat = 0.5; }
      if (ev.t === 'rage') { e.hitFlash = Math.max(e.hitFlash, 0.25); }
    }
    if (m) m.events.length = 0;
    setFxViewHeight(this.renderer.getDrawingBufferSize(this._dbs || (this._dbs = new THREE.Vector2())).y);
    this.fx.update(this.capFrozen ? (this.capFrozen++ === 1 ? (+(q.get('hitage') || 2)) / FPS : 0) : dt);
    this.stage.update(dt, this.camera);
    if (q.get('fxtest')) { const [r, h, d] = q.get('fxtest').split(',').map(Number); e.radial = r; e.hitFlash = h; e.desat = d || 0; }
    if (this.post && !q.get('norender')) {
      const u = this.post.u;
      u.hitFlash.value = e.hitFlash; u.radial.value = e.radial; u.desat.value = e.desat; u.letterbox.value = e.letterbox;
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

  showcaseStep(m) {
    for (const f of m.fighters) {
      f.inp = { d: 5, fwd: 0, up: 0, held: 0, pressed: 0 };
      f.prevPos.copy(f.pos); f.prevYaw = f.yaw;
      if (f.clipName === 'intro' && f.cf > 90) f.play('idle', 10);
      f.animate();
    }
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
