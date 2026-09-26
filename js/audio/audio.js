// Audio engine: synthesized impacts, recorded voices (announcer, shouts), recorded music and crowd.

// announcer lines (the clip files in assets/voice/ say the same; the text is the speech-synthesis fallback)
const ANN_TEXT = {
  round1: 'Ronda uno', round2: 'Ronda dos', round3: 'Ronda tres', round4: 'Ronda cuatro', round5: 'Ronda cinco',
  final: '¡Ronda final!', fight: '¡A luchar!', ko: 'K.O.', time: '¡Tiempo!', perfect: '¡Perfecto!', draw: '¡Empate!',
  win_alejandro: '¡Gana Alejandro!', win_arnau: '¡Gana Arnau!', win_camilo: '¡Gana Camilo!', win_rafa: '¡Gana Rafa!', win_zapponi: '¡Gana Zaponi!',
  win_dani: '¡Gana Dani!',
};

// background music: Kevin MacLeod (incompetech.com), CC BY 4.0 (see README)
const MUSIC = { menu: 'assets/music/menu.mp3', terrace: 'assets/music/terrace.mp3', street: 'assets/music/street.mp3', porche: 'assets/music/porche.mp3' };

// fighters' shouts: recorded voices (assets/voice/fx, see voices.json) and a pitch per fighter
const FIGHTER_VOICE = { alejandro: ['vb', 1.0], arnau: ['h1', 1.05], camilo: ['h0', 1.0], rafa: ['h2', 0.93], zapponi: ['h3', 0.87],
  dani: ['vb', 0.9] };

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.vol = { master: 0.9, sfx: 1.0, music: 0.42, voice: 0.9 };
    this.listenerX = 0;
  }
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // a track whose start was blocked (no touch yet) starts on this touch
      if (this.musicTrack && this.musicEl?.paused && !document.hidden) this.musicEl.play()?.catch?.(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.vol.sfx; this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.vol.music; this.musicBus.connect(this.master);
    this.voiceBus = c.createGain(); this.voiceBus.gain.value = this.vol.voice; this.voiceBus.connect(this.master);
    // reverb send (outdoor slap + short tail)
    this.rev = c.createConvolver(); this.rev.buffer = this.impulse(1.6, 3.2);
    this.revSend = c.createGain(); this.revSend.gain.value = 0.22;
    this.revSend.connect(this.rev).connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.shaper = c.createWaveShaper(); this.shaper.curve = this.distCurve(18);
    this.loadVoice();
    for (const v of this.pendingSets || []) this.loadVoiceSet(v);
    this.pendingSets = null;
    // music and ambience asked for before the first touch start now (inside the touch, as iOS requires)
    if (this.wantMusic) this.music(this.wantMusic);
    if (this.wantAmb) this.ambience(this.wantAmb);
  }
  // the recorded shouts of one voice, fetched and decoded once
  loadVoiceSet(vid) {
    if (!this.ctx) { (this.pendingSets ||= new Set()).add(vid); return; }
    this.voiceSets ||= {};
    if (this.voiceSets[vid]) return;
    const set = this.voiceSets[vid] = {};
    this.voiceManifest ||= fetch('assets/voice/fx/voices.json').then(r => r.json()).catch(() => ({}));
    this.voiceManifest.then(man => {
      for (const [kind, files] of Object.entries(man[vid] || {})) {
        set[kind] = [];
        for (const file of files) {
          fetch('assets/voice/fx/' + file)
            .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
            .then(b => new Promise((ok, no) => this.ctx.decodeAudioData(b, ok, no)))
            .then(buf => set[kind].push(buf))
            .catch(() => { /* one clip less */ });
        }
      }
    });
  }
  // fetch the voices of the fighters about to fight
  preloadVoices(ids) { for (const id of ids) this.loadVoiceSet((FIGHTER_VOICE[id] || FIGHTER_VOICE.alejandro)[0]); }
  // announcer: recorded lines in Spanish (a neural voice, assets/voice/*.mp3), fetched once the audio context exists.
  // The browser's own speech synthesis is only the fallback when a clip is missing.
  loadVoice() {
    if (this.voiceClips || !this.ctx) return;
    this.voiceClips = {};
    for (const k of Object.keys(ANN_TEXT)) {
      fetch(`assets/voice/${k}.mp3`)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then(b => new Promise((ok, no) => this.ctx.decodeAudioData(b, ok, no)))
        .then(buf => { this.voiceClips[k] = buf; })
        .catch(() => { /* fallback to speech synthesis for this line */ });
    }
  }
  impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < c.sampleRate * 0.012 ? 0.2 : 1);
    }
    return b;
  }
  makeNoise(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  distCurve(k) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; curve[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x)); }
    return curve;
  }
  pan(x) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, (x || 0) * 0.25));
    return p;
  }
  // ------------------------------------------------------------------ primitives
  noise(t, dur, { type = 'bandpass', f0 = 1000, f1 = null, q = 1, gain = 0.5, attack = 0.002, out, rev = 0.2 }) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    if (rev) { const r = c.createGain(); r.gain.value = rev; g.connect(r).connect(this.revSend); }
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  tone(t, dur, { type = 'sine', f0 = 100, f1 = 40, gain = 0.6, attack = 0.001, out, dist = false, rev = 0.1 }) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (dist) { const sh = c.createWaveShaper(); sh.curve = this.shaper.curve; o.connect(sh); node = sh; }
    node.connect(g).connect(out);
    if (rev) { const r = c.createGain(); r.gain.value = rev; g.connect(r).connect(this.revSend); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  // ------------------------------------------------------------------ game sounds
  hit(kind, power = 1, pos) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + 0.001;
    const out = this.pan(pos?.x); out.connect(this.sfxBus);
    const p = power;
    switch (kind) {
      case 'light':
        this.tone(t, 0.09, { f0: 190, f1: 70, gain: 0.7 * p, out });
        this.noise(t, 0.06, { f0: 2400, q: 0.8, gain: 0.55, out });
        this.noise(t, 0.02, { type: 'highpass', f0: 5000, gain: 0.35, out, rev: 0 });
        break;
      case 'kick':
        this.tone(t, 0.14, { f0: 160, f1: 50, gain: 0.85 * p, out, dist: true });
        this.noise(t, 0.09, { f0: 1500, f1: 700, q: 0.9, gain: 0.6, out });
        this.noise(t, 0.03, { type: 'highpass', f0: 4000, gain: 0.3, out, rev: 0 });
        break;
      case 'heavy': case 'kickHeavy':
        this.tone(t, 0.32, { f0: 140, f1: 32, gain: 1.0 * p, out, dist: true, rev: 0.25 });
        this.tone(t, 0.18, { type: 'triangle', f0: 380, f1: 90, gain: 0.35, out });
        this.noise(t, 0.16, { f0: kind === 'kickHeavy' ? 1300 : 1900, f1: 500, q: 0.7, gain: 0.8, out, rev: 0.35 });
        this.noise(t, 0.04, { type: 'highpass', f0: 3500, gain: 0.5, out, rev: 0 });
        this.noise(t + 0.02, 0.4, { type: 'lowpass', f0: 400, gain: 0.25, out, rev: 0.4 });
        break;
      case 'slap': // open hand: a bright crack with little body
        this.noise(t, 0.05, { type: 'highpass', f0: 1800, gain: 0.95, out, rev: 0.15 });
        this.noise(t, 0.08, { f0: 3200, f1: 1500, q: 0.7, gain: 0.5, out });
        this.tone(t, 0.06, { f0: 260, f1: 120, gain: 0.3 * p, out });
        break;
      case 'block':
        this.tone(t, 0.05, { type: 'square', f0: 1400, f1: 900, gain: 0.12, out });
        this.tone(t, 0.08, { f0: 240, f1: 110, gain: 0.45, out });
        this.noise(t, 0.05, { f0: 3200, q: 1.5, gain: 0.35, out });
        break;
      case 'slam':
        this.tone(t, 0.6, { f0: 90, f1: 25, gain: 1.1, out, dist: true, rev: 0.4 });
        this.noise(t, 0.5, { type: 'lowpass', f0: 900, f1: 120, gain: 0.8, out, rev: 0.5 });
        this.noise(t, 0.08, { f0: 1800, gain: 0.5, out });
        break;
    }
  }
  whoosh(kind, power = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.02;
    const heavy = kind === 'heavy' || kind === 'kick';
    this.noise(t, heavy ? 0.24 : 0.14, { f0: heavy ? 900 : 1600, f1: heavy ? 350 : 700, q: 1.6, gain: heavy ? 0.28 : 0.16, attack: 0.05, out: this.sfxBus, rev: 0.05 });
  }
  play(name, pos) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const out = this.pan(pos?.x); out.connect(this.sfxBus);
    if (name === 'step') this.noise(t, 0.07, { type: 'lowpass', f0: 600, gain: 0.25, out, rev: 0.05 });
    else if (name === 'land') { this.tone(t, 0.12, { f0: 90, f1: 40, gain: 0.5, out }); this.noise(t, 0.1, { type: 'lowpass', f0: 800, gain: 0.3, out }); }
    else if (name === 'bodyfall') { this.tone(t, 0.3, { f0: 80, f1: 30, gain: 0.9, out, dist: true, rev: 0.3 }); this.noise(t, 0.35, { type: 'lowpass', f0: 1200, f1: 200, gain: 0.5, out, rev: 0.3 }); }
    else if (name === 'grab') this.noise(t, 0.2, { f0: 2000, q: 0.6, gain: 0.25, attack: 0.02, out });
    else if (name === 'block') this.hit('block', 1, pos);
    else if (name === 'ui') this.tone(t, 0.06, { type: 'triangle', f0: 880, f1: 660, gain: 0.15, out, rev: 0 });
    else if (name === 'uiok') { this.tone(t, 0.09, { type: 'triangle', f0: 660, f1: 990, gain: 0.2, out, rev: 0.1 }); this.tone(t + 0.07, 0.12, { type: 'triangle', f0: 990, f1: 1320, gain: 0.18, out }); }
  }
  // fighters' shouts (recorded): kind 'attack' (effort), 'hurt', 'hurtBig', 'ko', 'win'. Each fighter has a voice of
  // his own and a pitch; a clip is never repeated twice running, and a new shout cuts that fighter's previous one.
  voice(f, kind) {
    if (!this.enabled) return;
    const [vid, rate] = FIGHTER_VOICE[f.id] || FIGHTER_VOICE.alejandro;
    this.loadVoiceSet(vid);
    if (!this.ctx) return;
    const set = this.voiceSets?.[vid];
    const k = kind === 'win' ? 'attack' : kind;
    let list = set?.[k];
    if (k === 'ko' && !list?.length) list = set?.hurtBig;
    if (!list?.length) return; // still loading: better silent than a synthetic voice
    this.lastVoice ||= {}; this.voiceSrc ||= {};
    let i = Math.floor(Math.random() * list.length);
    const key = vid + k;
    if (list.length > 1 && i === this.lastVoice[key]) i = (i + 1) % list.length;
    this.lastVoice[key] = i;
    const c = this.ctx, t = c.currentTime + 0.005;
    const src = c.createBufferSource(); src.buffer = list[i];
    src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const g = c.createGain(); g.gain.value = kind === 'hurt' ? 0.85 : kind === 'win' ? 1.1 : 1.0;
    const out = this.pan(f.pos?.x);
    src.connect(g).connect(out).connect(this.voiceBus);
    const r = c.createGain(); r.gain.value = kind === 'ko' ? 0.22 : 0.12; g.connect(r).connect(this.revSend);
    try { this.voiceSrc[f.id]?.stop(); } catch (e) { /* already ended */ }
    this.voiceSrc[f.id] = src;
    src.start(t);
  }
  // key: 'round1'..'round5', 'final', 'fight', 'ko', 'time', 'perfect', 'draw', 'win_<fighter id>'
  announce(key) {
    if (!this.enabled) return;
    const buf = this.voiceClips?.[key];
    if (buf && this.ctx) {
      const c = this.ctx, t = c.currentTime + 0.02;
      try { this.annSrc?.stop(); } catch (e) { /* already ended */ }
      const src = c.createBufferSource(); src.buffer = buf;
      const g = c.createGain(); g.gain.value = 1.1;
      src.connect(g).connect(this.voiceBus);
      // a little of the arena's reverb around the voice
      const r = c.createGain(); r.gain.value = 0.1; g.connect(r).connect(this.revSend);
      src.start(t);
      this.annSrc = src;
      return;
    }
    // fallback: the device's own voice, in Spanish and at natural pitch and speed (the old low pitch sounded robotic)
    try {
      const s = window.speechSynthesis;
      const text = ANN_TEXT[key] || key;
      if (!s || !text) return;
      s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const vs = s.getVoices();
      const es = vs.find(v => /^es-ES/i.test(v.lang) && /natural|neural|google|jorge|pablo|alvaro|enrique/i.test(v.name)) || vs.find(v => /^es-ES/i.test(v.lang)) || vs.find(v => /^es/i.test(v.lang));
      if (es) u.voice = es;
      u.lang = es ? es.lang : 'es-ES';
      u.pitch = 0.95; u.rate = 1.0; u.volume = 1;
      s.speak(u);
    } catch (e) { /* no speech available */ }
  }
  // ------------------------------------------------------------------ recorded clips
  // decoded once and shared (crowd bed, KO cheer)
  loadBuffer(url) {
    this.bufCache ||= {};
    return (this.bufCache[url] ||= fetch(url)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then(b => new Promise((ok, no) => this.ctx.decodeAudioData(b, ok, no)))
      .catch(() => null));
  }
  // ------------------------------------------------------------------ ambience
  // Street stage: a recorded race-day crowd in a seamless loop. The terrace keeps only the music: the old synthesized
  // beds (filtered noise for cicadas and murmur) read as a strange hiss on phone speakers.
  ambience(kind) {
    this.wantAmb = kind;
    if (!this.ctx) return;
    if (this.amb?.kind === kind) return;
    this.stopAmbience();
    if (kind !== 'street') return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.master);
    out.gain.linearRampToValueAtTime(0.35, c.currentTime + 2);
    const swell = c.createGain(); swell.gain.value = 1; swell.connect(out);
    const amb = this.amb = { kind, out, swell, nodes: [] };
    this.loadBuffer('assets/sfx/crowd_loop.mp3').then(buf => {
      if (this.amb !== amb || !buf) return;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      // (a few milliseconds off each end: mp3 encoder padding would leave a gap at the loop point)
      src.loopStart = 0.03; src.loopEnd = buf.duration - 0.03;
      src.connect(swell); src.start(0, 0.03 + Math.random() * (buf.duration - 0.1));
      amb.nodes.push(src);
    });
  }
  // KO on the street: the crowd swells and a recorded cheer goes up
  crowdSwell() {
    const amb = this.amb;
    if (!this.ctx || !amb?.swell) return;
    const g = amb.swell.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1.8, t + 0.4); g.linearRampToValueAtTime(1, t + 5);
    this.loadBuffer('assets/sfx/cheer.mp3').then(buf => {
      if (!buf || this.amb !== amb) return;
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const cg = this.ctx.createGain(); cg.gain.value = 0.55;
      src.connect(cg).connect(this.sfxBus); src.start();
    });
  }
  stopAmbience() {
    this.wantAmb = null;
    if (!this.amb) return;
    const { out, nodes } = this.amb; const t = this.ctx.currentTime;
    out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value, t); out.gain.linearRampToValueAtTime(0, t + 0.5);
    setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) { /* not started */ } }); out.disconnect(); }, 700);
    this.amb = null;
  }
  // ------------------------------------------------------------------ music
  // Recorded tracks (assets/music: menu, one per stage) streamed by a single media element into the music bus: no big
  // decoded buffers on phones, and once the first touch has started it, iOS lets the game switch tracks later without
  // another touch. (The old music was synthesized note by note from a main-thread timer: it stuttered on phones.)
  music(track = 'menu') {
    this.wantMusic = track;
    if (!this.ctx || !this.musicOn) return;
    const el = this.musicElement();
    if (this.musicTrack === track && !el.paused) return;
    this.musicTrack = track;
    clearTimeout(this.musicSwap);
    const start = () => {
      el.src = MUSIC[track] || MUSIC.menu;
      el.play()?.catch?.(() => { /* blocked until a touch: init() starts it again */ });
      this.musicFade(1, 1.2);
    };
    if (!el.paused) { this.musicFade(0, 0.5); this.musicSwap = setTimeout(start, 550); } else start();
  }
  stopMusic() {
    this.wantMusic = null; this.musicTrack = null;
    clearTimeout(this.musicSwap);
    const el = this.musicEl;
    if (!el || el.paused) return;
    this.musicFade(0, 0.6);
    this.musicSwap = setTimeout(() => el.pause(), 650);
  }
  musicElement() {
    if (this.musicEl) return this.musicEl;
    const el = this.musicEl = new window.Audio();
    el.loop = true; el.preload = 'auto';
    try {
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(this.musicGain).connect(this.musicBus);
    } catch (e) { this.musicGain = null; /* plays straight out of the element */ }
    return el;
  }
  musicFade(to, sec) {
    if (!this.musicGain) { if (this.musicEl) this.musicEl.volume = to * Math.min(1, this.vol.music); return; }
    const g = this.musicGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + sec);
  }
  // page hidden (app switched, screen locked): everything stops, and comes back where it was
  setHidden(hidden) {
    if (!this.ctx) return;
    if (hidden) { this.ctx.suspend?.(); this.musicEl?.pause(); }
    else { this.ctx.resume?.(); if (this.musicTrack && this.musicEl?.src) this.musicEl.play()?.catch?.(() => {}); }
  }
}
