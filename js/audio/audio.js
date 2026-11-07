// Audio engine: recorded impacts, swishes and footsteps (with synthesized layers for weight), recorded voices
// (announcer, shouts, lines), recorded music and crowd.

// announcer lines (the clip files in assets/voice/ say the same; the text is the speech-synthesis fallback)
const ANN_TEXT = {
  round1: 'Ronda uno', round2: 'Ronda dos', round3: 'Ronda tres', round4: 'Ronda cuatro', round5: 'Ronda cinco',
  final: '¡Ronda final!', fight: '¡A luchar!', ko: 'K.O.', time: '¡Tiempo!', perfect: '¡Perfecto!', draw: '¡Empate!',
  win_alejandro: '¡Gana Alejandro!', win_aleix: '¡Gana Aleix!', win_camilo: '¡Gana Camilo!', win_rafa: '¡Gana Rafa!', win_zapponi: '¡Gana Zaponi!',
  win_dani: '¡Gana Dani!', win_noemi: '¡Gana Noemí!', win_orion: '¡Gana Orión!',
  punetality: '¡Puñetality!',
};

// background music: Kevin MacLeod (incompetech.com), CC BY 4.0 (see README; made by tools/music_build.py). Each stage
// has a style of its own and several tracks that follow each other (a new fight starts on the next one), and an
// angrier track for the final round: El Porche urban funk and hip hop, the rooftop Latin disco and salsa, the 10K
// finish line rock, the festival club and dance, the neon district dark synth, inside the PC electro
const M = (n) => `assets/music/${n}.mp3`;
const MUSIC = {
  menu: [M('menu')], training: [M('training')], ending: [M('ending')],
  porche: [M('porche_a'), M('porche_b'), M('porche_c')],
  terrace: [M('terrace_a'), M('terrace_b'), M('terrace_c')],
  street: [M('street_a'), M('street_b'), M('street_c')],
  festival: [M('festival_a'), M('festival_b'), M('festival_c'), M('festival_d')],
  neon: [M('neon_a'), M('neon_b'), M('neon_c')],
  pc: [M('pc_a'), M('pc_b'), M('pc_c')],
};
const FINAL = { porche: M('porche_final'), terrace: M('terrace_final'), street: M('street_final'), festival: M('festival_final'), neon: M('neon_final'), pc: M('pc_final') };
// each track's tempo and first beat (s), measured by tools/music_build.py: the festival's lights and dancers keep time
const BEATS = { menu: [122, 0.441], training: [101, 0.546], ending: [110, 0.499], porche_a: [95, 0.61], porche_b: [121.32, 0.203], porche_c: [120, 0.128], porche_final: [116, 0.476], terrace_a: [117, 0.464], terrace_b: [100, 0.418], terrace_c: [115, 0.464], terrace_final: [117.82, 0.476], street_a: [124, 0.337], street_b: [85, 0.308], street_c: [128, 0.238], street_final: [104.5, 0.255], festival_a: [94, 0.43], festival_b: [88, 0.284], festival_c: [117, 0.464], festival_d: [140, 0.819], festival_final: [106.98, 0.505], neon_a: [120, 0.459], neon_b: [124, 0.435], neon_c: [160, 0.145], neon_final: [155, 0.139], pc_a: [120, 0.453], pc_b: [128.38, 0.035], pc_c: [122, 0.447], pc_final: [140, 0.819] };

// each stage's background loop (see ambience) and its level under the music; a crowd cheers on a knockout
const AMBIENCE = {
  street: { file: 'assets/sfx/crowd_loop.mp3', gain: 0.35, crowd: true },
  festival: { file: 'assets/sfx/crowd_loop.mp3', gain: 0.2, crowd: true },
  porche: { file: 'assets/sfx/amb_porche.mp3', gain: 0.32 },
  terrace: { file: 'assets/sfx/amb_terrace.mp3', gain: 0.3 },
  neon: { file: 'assets/sfx/amb_neon.mp3', gain: 0.34 },
  pc: { file: 'assets/sfx/amb_pc.mp3', gain: 0.3 },
};
// each stage's acoustics (setSpace): reverb tail length (s), how bright it stays (1 = like the dry sound), how much
// of a blow goes in, and the early reflections [ms, level] of what stands around
const SPACES = {
  porche: { tail: 1.1, bright: 0.85, send: 0.26, early: [[11, 0.5], [23, 0.35], [37, 0.3], [58, 0.22], [81, 0.15]] },
  terrace: { tail: 0.55, bright: 0.7, send: 0.12, early: [[9, 0.3], [27, 0.12]] },
  street: { tail: 1.35, bright: 0.75, send: 0.2, early: [[18, 0.25], [64, 0.2], [128, 0.32], [170, 0.12]] },
  festival: { tail: 1.6, bright: 0.5, send: 0.23, early: [[26, 0.3], [44, 0.22], [95, 0.14]] },
  // (a street between towers, wet: hard close walls, a long bright tail)
  neon: { tail: 1.5, bright: 0.8, send: 0.25, early: [[14, 0.45], [29, 0.35], [52, 0.25], [88, 0.18]] },
  // (inside a metal case: close hard walls all round, a short bright ring)
  pc: { tail: 0.85, bright: 0.95, send: 0.22, early: [[5, 0.5], [11, 0.42], [19, 0.32], [31, 0.22]] },
};

// fighters' shouts: recorded voices (assets/voice/fx, see voices.json) and a pitch per fighter
const FIGHTER_VOICE = { alejandro: ['vb', 1.0], aleix: ['h1', 1.0], camilo: ['h0', 1.0], rafa: ['h2', 0.93], zapponi: ['h3', 0.87],
  dani: ['vb', 0.9], noemi: ['f1', 0.97],
  // (Orión, a machine: a deep voice made robotic as it plays, js/audio/audio.js robotFx)
  orion: ['h3', 0.8, 'robot'] };

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
    // the music and the stage's background go through one low-pass filter, open but for slow motion (slowmo)
    this.worldLP = c.createBiquadFilter(); this.worldLP.type = 'lowpass'; this.worldLP.frequency.value = 20000; this.worldLP.Q.value = 0.5;
    this.worldLP.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.vol.music;
    // (the music steps back for an instant under a big blow, as a mixing desk's side-chain would: hitDuck)
    this.musicHit = c.createGain(); this.musicHit.gain.value = 1;
    this.musicBus.connect(this.musicHit).connect(this.worldLP);
    this.voiceBus = c.createGain(); this.voiceBus.gain.value = this.vol.voice; this.voiceBus.connect(this.master);
    // reverb send: the stage's own space (setSpace), an outdoor slap and short tail until one is set
    this.rev = c.createConvolver(); this.rev.buffer = this.impulse(1.6, 3.2);
    this.revSend = c.createGain(); this.revSend.gain.value = 0.22;
    this.revSend.connect(this.rev).connect(this.master);
    if (this.wantSpace) this.setSpace(this.wantSpace);
    this.loadUI();
    this.noiseBuf = this.makeNoise(2);
    this.shaper = c.createWaveShaper(); this.shaper.curve = this.distCurve(18);
    this.loadVoice();
    this.loadTakes();
    for (const v of this.pendingSets || []) this.loadVoiceSet(v);
    this.pendingSets = null;
    for (const key of this.pendingLines || []) this.loadLine(...key.split(':').reverse());
    this.pendingLines = null;
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
  // fetch the voices of the fighters about to fight (their shouts, their presentation and victory lines)
  preloadVoices(ids) { for (const id of ids) { this.loadVoiceSet((FIGHTER_VOICE[id] || FIGHTER_VOICE.alejandro)[0]); this.loadLine(id, 'intro'); this.loadLine(id, 'quote'); } }
  // a fighter's spoken line, made by tools/quotes_tts.py: 'quote' his victory line (assets/voice/quote_<id>.mp3),
  // 'intro' his line in the fight's presentation (intro_<id>.mp3); with its loudness frame by frame, 60 a second:
  // the jaw follows it while he says it (talkLevel)
  loadLine(id, kind = 'quote') {
    const key = kind + ':' + id;
    if (!this.ctx) { (this.pendingLines ||= new Set()).add(key); return; }
    this.lines ||= {};
    if (this.lines[key]) return;
    const q = this.lines[key] = { buf: null, env: null };
    fetch(`assets/voice/${kind}_${id}.mp3`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then(b => new Promise((ok, no) => this.ctx.decodeAudioData(b, ok, no)))
      .then(buf => {
        const d = buf.getChannelData(0), w = Math.max(1, Math.floor(buf.sampleRate / 60)), n = Math.ceil(d.length / w), env = new Float32Array(n);
        let peak = 1e-6;
        for (let i = 0; i < n; i++) {
          let e = 0; const a = i * w, b = Math.min(d.length, a + w);
          for (let j = a; j < b; j++) e += d[j] * d[j];
          env[i] = Math.sqrt(e / Math.max(1, b - a)); peak = Math.max(peak, env[i]);
        }
        for (let i = 0; i < n; i++) env[i] /= peak;
        q.buf = buf; q.env = env;
      })
      .catch(() => { /* no line: he stays silent */ });
  }
  // the winner says his victory line
  say(f) { this.line(f, 'quote'); }
  // a fighter says one of his lines, placed like his shouts, with a little of the arena's reverb
  line(f, kind) {
    if (!this.enabled || !this.ctx) return;
    const q = this.lines?.[kind + ':' + f.id];
    if (!q?.buf) return;
    const c = this.ctx, t = c.currentTime + 0.02;
    const src = c.createBufferSource(); src.buffer = q.buf;
    const g = c.createGain(); g.gain.value = 1.1;
    src.connect(g).connect(this.pan(f.pos?.x)).connect(this.voiceBus);
    const r = c.createGain(); r.gain.value = 0.1; g.connect(r).connect(this.revSend);
    this.voiceSrc ||= {};
    try { this.voiceSrc[f.id]?.stop(); } catch (e) { /* already ended */ }
    this.voiceSrc[f.id] = src;
    src.start(t);
    this.duck(q.buf.duration);
    // (the mouth runs on the page's clock: the audio clock can stall or race where there is no output device; what is
    // heard comes out a little later than it is scheduled)
    const lat = 0.02 + Math.min(0.25, c.outputLatency || c.baseLatency || 0);
    (this.talk ||= {})[f.id] = { t0: performance.now() + lat * 1000, env: q.env, src };
  }
  // slow motion (a knockout, a Rage Art): the music and the background sink away under a muffle while the blows and
  // the voices stay crisp; they come back when time runs again
  slowmo(on) {
    if (!this.ctx || !this.worldLP) return;
    const t = this.ctx.currentTime, f = this.worldLP.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(Math.max(40, f.value), t);
    f.exponentialRampToValueAtTime(on ? 650 : 20000, t + (on ? 0.12 : 0.7));
  }
  // the music steps back while someone speaks (a line must be understood over it) and comes back after
  duck(sec) {
    const g = this.musicBus?.gain;
    if (!g) return;
    const t = this.ctx.currentTime, base = this.vol.music;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(base * 0.55, t + 0.15);
    g.setValueAtTime(base * 0.55, t + Math.max(0.2, sec - 0.2));
    g.linearRampToValueAtTime(base, t + sec + 0.5);
  }
  // the fighters stop talking (the presentation skipped)
  hush() {
    for (const id in this.voiceSrc || {}) { try { this.voiceSrc[id].stop(); } catch (e) { /* already ended */ } }
    this.voiceSrc = {};
    this.talk = {};
    const g = this.musicBus?.gain;
    if (g) { const t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(this.vol.music, t + 0.3); }
  }
  // how loud a speaking fighter's line is right now (0..1): how far his mouth opens
  talkLevel(id) {
    const T = this.talk?.[id];
    if (!T) return 0;
    const i = Math.floor((performance.now() - T.t0) * 0.06);
    if (i >= T.env.length) { delete this.talk[id]; return 0; }
    return i >= 0 ? T.env[i] : 0;
  }
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
  // ------------------------------------------------------------------ recorded effects
  // the fight's recorded effects (assets/sfx/fight.mp3 + fight.json, made by tools/sfx_build.py): one file, a table of
  // takes per group. The table is shifted by where its sync point really lands in the decoded file (an MP3 decoder may
  // add or trim a few milliseconds of silence at the start). Until it has loaded the synthesized sounds play.
  loadTakes() {
    if (this.takesLoading || !this.ctx) return;
    this.takesLoading = true;
    const bin = fetch('assets/sfx/fight.mp3').then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))));
    Promise.all([fetch('assets/sfx/fight.json').then(r => r.json()), bin])
      .then(([tab, b]) => new Promise((ok, no) => this.ctx.decodeAudioData(b, (buf) => ok([tab, buf]), no)))
      .then(([tab, buf]) => {
        const d = buf.getChannelData(0), sr = buf.sampleRate;
        const a = Math.max(0, Math.floor((tab.sync - 0.06) * sr)), e = Math.min(d.length, Math.floor((tab.sync + 0.12) * sr));
        let pk = 0;
        for (let i = a; i < e; i++) pk = Math.max(pk, Math.abs(d[i]));
        let at = a;
        while (at < e && Math.abs(d[at]) <= pk * 0.2) at++;
        const shift = Math.max(-0.05, Math.min(0.1, at / sr - tab.sync));
        const groups = {};
        for (const [g, list] of Object.entries(tab.groups)) groups[g] = list.map(([t, dur]) => [t + shift, dur]);
        this.takes = { buf, groups, last: {} };
      })
      .catch(() => { this.takesLoading = false; /* the synthesized sounds stay */ });
  }
  // one take of a group: at random but never the one just played, a little higher or lower and louder or softer
  // each time (no two punches sound the same)
  take(g, t, { out, gain = 1, rate = 1, rev = 0, vary = 0.05 } = {}) {
    const T = this.takes, list = T?.groups[g];
    if (!list?.length) return;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === T.last[g]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    T.last[g] = i;
    const [off, dur] = list[i], c = this.ctx;
    const s = c.createBufferSource(); s.buffer = T.buf;
    s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    const gn = c.createGain(); gn.gain.value = gain * (1 + (Math.random() * 2 - 1) * 0.12);
    s.connect(gn).connect(out);
    if (rev) { const r = c.createGain(); r.gain.value = rev; gn.connect(r).connect(this.revSend); }
    s.start(t, off, dur);
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
  // a blow landing: the recorded punch (light or heavy) with a body thud under kicks and big blows, a woody knock for a
  // block, a crack for an open hand; o.ch (counter hit) adds a sharp crack, o.ko (the blow that knocks him out) a deep
  // boom with a long tail
  hit(kind, power = 1, pos, o = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + 0.001;
    const out = this.pan(pos?.x); out.connect(this.sfxBus);
    const p = Math.min(1.35, power);
    if (!this.takes) { this.hitSynth(kind, p, out, t); return; }
    switch (kind) {
      case 'light':
        this.take('punchL', t, { out, gain: 0.72 * p, rate: 1.06, rev: 0.12 });
        break;
      case 'kick':
        this.take('punchL', t, { out, gain: 0.66 * p, rate: 0.9, rev: 0.12 });
        this.take('thudM', t + 0.004, { out, gain: 0.55 * p });
        break;
      case 'heavy':
        this.take('punchH', t, { out, gain: 0.92 * p, rev: 0.25 });
        this.take('thudM', t + 0.006, { out, gain: 0.45 });
        this.tone(t, 0.22, { f0: 120, f1: 38, gain: 0.3 * p, out, rev: 0 });
        break;
      case 'kickHeavy':
        this.take('punchH', t, { out, gain: 0.92 * p, rate: 0.88, rev: 0.3 });
        this.take('thudH', t + 0.004, { out, gain: 0.5 * p, rate: 1.1 });
        break;
      case 'slap':
        this.take('slap', t, { out, gain: 1.5, rate: 1.12, rev: 0.15 });
        this.noise(t, 0.035, { type: 'highpass', f0: 2600, gain: 0.55 * p, out, rev: 0.12 });
        break;
      case 'block':
        this.take('block', t, { out, gain: 1.7 * Math.min(1.2, p), rev: 0.1 });
        this.take('thudM', t, { out, gain: 0.25, rate: 1.3 });
        break;
      case 'slam':
        this.take('thudH', t, { out, gain: 1.0, rate: 0.9, rev: 0.4 });
        this.take('punchH', t + 0.01, { out, gain: 0.6, rate: 0.75, rev: 0.4 });
        this.tone(t, 0.5, { f0: 85, f1: 26, gain: 0.55, out, dist: true, rev: 0.3 });
        break;
    }
    if (o.ch) {
      this.take('slap', t, { out, gain: 1.1, rate: 1.35, vary: 0.03, rev: 0.2 });
      this.noise(t, 0.05, { type: 'highpass', f0: 3800, gain: 0.45, out, rev: 0.25 });
    }
    if (o.ko) {
      this.take('thudH', t + 0.01, { out, gain: 1.0, rate: 0.78, vary: 0.02, rev: 0.7 });
      this.tone(t, 0.95, { f0: 72, f1: 22, gain: 0.7, out, dist: true, rev: 0.6 });
    }
    // the big ones are felt: the music dips under them and the crowd reacts
    if (o.ko) this.hitDuck(0.55, 1.1);
    else if (o.ch || kind === 'heavy' || kind === 'kickHeavy' || kind === 'slam') this.hitDuck(o.ch ? 0.4 : 0.3, 0.3);
    if (!o.ko && (o.ch || kind === 'slam' || ((kind === 'heavy' || kind === 'kickHeavy') && p > 1))) this.crowdReact(o.ch || kind === 'slam');
  }
  // the synthesized blows (until the recorded ones have loaded)
  hitSynth(kind, p, out, t) {
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
  // a limb swinging through the air, a few frames before it lands (Match: pendingWhoosh)
  whoosh(kind, power = 1, pos) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.003;
    const heavy = kind === 'heavy' || kind === 'kick';
    const out = this.pan(pos?.x); out.connect(this.sfxBus);
    if (this.takes) {
      this.take(heavy ? 'swishH' : 'swishL', t, { out, gain: (heavy ? 0.5 : 0.34) * Math.min(1.2, power), rate: kind === 'kick' ? 0.84 : heavy ? 0.93 : 1.08, vary: 0.07, rev: 0.04 });
      return;
    }
    this.noise(t, heavy ? 0.24 : 0.14, { f0: heavy ? 900 : 1600, f1: heavy ? 350 : 700, q: 1.6, gain: heavy ? 0.28 : 0.16, attack: 0.05, out, rev: 0.05 });
  }
  play(name, pos) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const out = this.pan(pos?.x); out.connect(this.sfxBus);
    // (the floor's own sound on top: the neon district's wet street splashes, the graphics card's plate rings)
    if (name === 'step' || name === 'land' || name === 'bodyfall') {
      const big = name === 'bodyfall' ? 1 : name === 'land' ? 0.6 : 0.3;
      if (this.surface === 'wet') {
        this.noise(t + 0.004, 0.08 + 0.25 * big, { type: 'bandpass', f0: 2800, f1: 1100, q: 0.8, gain: 0.07 + 0.28 * big, attack: 0.003, out, rev: 0.15 });
        for (let k = 0; k < Math.round(1 + big * 5); k++) this.noise(t + 0.03 + Math.random() * 0.2 * big, 0.015, { type: 'bandpass', f0: 2000 + Math.random() * 3000, q: 3, gain: 0.03 + 0.05 * big, out, rev: 0.1 });
      } else if (this.surface === 'metal' && name !== 'step') {
        for (const [f, g] of [[610, 0.11], [1480, 0.07], [2710, 0.045], [4390, 0.025]]) this.tone(t, 0.5 + big * 0.5, { type: 'sine', f0: f, f1: f * 0.995, gain: g * (0.5 + big), attack: 0.002, out, rev: 0.45 });
      }
    }
    // (footsteps on the stage's floor: concrete, or the festival's wooden platform; `surface` is set with the stage)
    const step = this.surface === 'wood' ? 'stepW' : 'stepC', rec = !!this.takes;
    if (name === 'step') {
      if (rec) this.take(step, t, { out, gain: step === 'stepW' ? 0.38 : 0.6, rev: 0.05, vary: 0.08 });
      else this.noise(t, 0.07, { type: 'lowpass', f0: 600, gain: 0.25, out, rev: 0.05 });
    } else if (name === 'land') {
      if (rec) { this.take(step, t, { out, gain: step === 'stepW' ? 0.6 : 0.95, rate: 0.9 }); this.take('thudM', t, { out, gain: 0.5 }); }
      else { this.tone(t, 0.12, { f0: 90, f1: 40, gain: 0.5, out }); this.noise(t, 0.1, { type: 'lowpass', f0: 800, gain: 0.3, out }); }
    } else if (name === 'bodyfall') {
      // the body hits the floor and bounces once
      if (rec) {
        this.take('thudH', t, { out, gain: 0.95, rev: 0.3 });
        this.take('thudM', t + 0.11, { out, gain: 0.4, rate: 1.1 });
        this.take(step, t + 0.02, { out, gain: 0.7, rate: 0.8 });
        this.tone(t, 0.3, { f0: 80, f1: 30, gain: 0.4, out, dist: true, rev: 0.3 });
      } else { this.tone(t, 0.3, { f0: 80, f1: 30, gain: 0.9, out, dist: true, rev: 0.3 }); this.noise(t, 0.35, { type: 'lowpass', f0: 1200, f1: 200, gain: 0.5, out, rev: 0.3 }); }
    } else if (name === 'glass') {
      // a shop window cracking: a sharp crack, the crazing spreading, a few pieces tinkling down
      this.noise(t, 0.08, { type: 'highpass', f0: 2500, gain: 0.5, attack: 0.001, out, rev: 0.3 });
      this.tone(t, 0.15, { f0: 160, f1: 70, gain: 0.35, out, rev: 0.2 });
      for (let k = 0; k < 9; k++) this.noise(t + 0.03 + Math.random() * 0.25, 0.02, { type: 'bandpass', f0: 3500 + Math.random() * 4500, q: 4, gain: 0.08 + Math.random() * 0.1, out, rev: 0.3 });
      for (let k = 0; k < 5; k++) { const f = 3000 + Math.random() * 3000; this.tone(t + 0.3 + Math.random() * 0.5, 0.12, { type: 'sine', f0: f, f1: f * 0.98, gain: 0.03, attack: 0.002, out, rev: 0.35 }); }
    } else if (name === 'grab') {
      this.noise(t, 0.2, { f0: 2000, q: 0.6, gain: 0.25, attack: 0.02, out });
      if (rec) this.take('swishL', t, { out, gain: 0.3, rate: 0.62 });
    }
    else if (name === 'zap') {
      // the defibrillator: a hum that drops away under a burst of crackles
      this.tone(t, 0.32, { type: 'sawtooth', f0: 140, f1: 55, gain: 0.32, out, dist: true, rev: 0.25 });
      for (let k = 0; k < 7; k++) this.noise(t + k * 0.028 + Math.random() * 0.012, 0.035, { type: 'bandpass', f0: 2500 + Math.random() * 3500, q: 1.6, gain: 0.42, out, rev: 0.15 });
    }
    else if (name === 'block') this.hit('block', 1, pos);
    else if (name === 'ui') { if (!this.uiSound('ui_move', 0.42)) this.tone(t, 0.06, { type: 'triangle', f0: 880, f1: 660, gain: 0.15, out, rev: 0 }); }
    else if (name === 'uiok') {
      // a chime with a soft thump under it: a choice in a fighting game lands with some weight
      if (this.uiSound('ui_ok', 0.5)) { if (rec) this.take('thudM', t, { out, gain: 0.28, rate: 1.2, vary: 0.02 }); }
      else { this.tone(t, 0.09, { type: 'triangle', f0: 660, f1: 990, gain: 0.2, out, rev: 0.1 }); this.tone(t + 0.07, 0.12, { type: 'triangle', f0: 990, f1: 1320, gain: 0.18, out }); }
    }
    else if (name === 'uiback') { if (!this.uiSound('ui_back', 0.45)) this.tone(t, 0.07, { type: 'triangle', f0: 660, f1: 440, gain: 0.15, out, rev: 0 }); }
  }
  // ------------------------------------------------------------------ the PUÑETALITY (js/fight/fatality.js)
  // the winner's line in it (assets/voice/fatal_<id>.mp3, tools/quotes_tts.py --fatal), fetched for those who have one
  preloadFatal(id) { this.loadLine(id, 'fatal'); }
  // its sounds: the recorded blows and swishes with synthesized layers (the sword is a plant: it rings, but wet)
  fatal(kind, pos, o = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime + 0.004, rec = !!this.takes;
    const out = this.pan(pos?.x); out.connect(this.sfxBus);
    if (kind === 'drone') {
      // a low, uneasy hum under the build-up, and a heartbeat in it; stopped with kind 'droneOff'
      this.fatal('droneOff');
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.34, t + 1.6);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 2;
      const oscs = [55, 55.7, 82.4, 110.3].map((f, i) => { const o = c.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.connect(lp); o.start(t); return o; });
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.23; lg.gain.value = 90; lfo.connect(lg).connect(lp.frequency); lfo.start(t);
      lp.connect(g).connect(this.sfxBus);
      const r = c.createGain(); r.gain.value = 0.3; g.connect(r).connect(this.revSend);
      this.droneNodes = { g, oscs: [...oscs, lfo] };
    } else if (kind === 'droneOff') {
      const D = this.droneNodes; if (!D) return;
      this.droneNodes = null;
      D.g.gain.cancelScheduledValues(t); D.g.gain.setValueAtTime(Math.max(0.0001, D.g.gain.value), t); D.g.gain.exponentialRampToValueAtTime(0.0001, t + (o.fast ? 0.08 : 0.8));
      for (const x of D.oscs) x.stop(t + 1);
    } else if (kind === 'cutin') {
      // the cut to black as it starts: a deep hit and a breath of air pulled in
      this.tone(t, 1.4, { f0: 46, f1: 27, gain: 0.95, out, dist: true, rev: 0.6 });
      this.noise(t, 0.5, { type: 'lowpass', f0: 900, f1: 120, gain: 0.4, attack: 0.004, out, rev: 0.5 });
      this.noise(t + 0.1, 0.9, { type: 'bandpass', f0: 300, f1: 1600, q: 0.8, gain: 0.12, attack: 0.6, out, rev: 0.4 });
    } else if (kind === 'heart') {
      // lub-dub
      this.tone(t, 0.16, { f0: 70, f1: 38, gain: 0.55 * (o.gain ?? 1), out, rev: 0.05 });
      this.tone(t + 0.2, 0.13, { f0: 62, f1: 34, gain: 0.38 * (o.gain ?? 1), out, rev: 0.05 });
    } else if (kind === 'shing') {
      // drawn: a bright ring with a long tail, a hiss of air, and the wet snap of a leaf
      for (const [f, g, d] of [[2210, 0.09, 1.3], [3340, 0.07, 1.1], [5120, 0.05, 0.9], [7460, 0.035, 0.7], [1180, 0.05, 0.6]]) this.tone(t + 0.02, d, { type: 'sine', f0: f * 1.01, f1: f, gain: g, attack: 0.004, out, rev: 0.45 });
      this.noise(t, 0.22, { type: 'highpass', f0: 3000, gain: 0.22, attack: 0.03, out, rev: 0.2 });
      this.noise(t, 0.09, { type: 'lowpass', f0: 900, f1: 300, gain: 0.35, out, rev: 0.05 });
      if (rec) this.take('swishL', t, { out, gain: 0.45, rate: 1.25, rev: 0.2 });
    } else if (kind === 'glint') {
      this.tone(t, 0.5, { type: 'sine', f0: 6200, f1: 6000, gain: 0.06, attack: 0.01, out, rev: 0.5 });
      this.tone(t + 0.05, 0.4, { type: 'sine', f0: 9100, f1: 8900, gain: 0.04, attack: 0.01, out, rev: 0.5 });
    } else if (kind === 'whoosh') {
      if (rec) { this.take('swishH', t, { out, gain: 0.9, rate: 0.62, rev: 0.25 }); this.take('swishH', t + 0.05, { out, gain: 0.5, rate: 0.8, rev: 0.25 }); }
      this.noise(t, 0.38, { type: 'bandpass', f0: 500, f1: 2600, q: 1.2, gain: 0.3, attack: 0.18, out, rev: 0.2 });
    } else if (kind === 'slice') {
      // through: a tearing, wet cut, a deep punch under it and a long ring of the blade
      this.noise(t, 0.16, { type: 'bandpass', f0: 3200, f1: 500, q: 0.8, gain: 0.65, attack: 0.002, out, rev: 0.3 });
      this.noise(t + 0.02, 0.32, { type: 'lowpass', f0: 1400, f1: 180, q: 3, gain: 0.55, attack: 0.01, out, rev: 0.25 });
      if (rec) { this.take('slap', t, { out, gain: 1.4, rate: 0.55, rev: 0.4 }); this.take('punchH', t + 0.01, { out, gain: 0.9, rate: 0.7, rev: 0.4 }); this.take('thudH', t + 0.02, { out, gain: 0.7, rate: 0.75, rev: 0.4 }); }
      this.tone(t, 0.9, { f0: 64, f1: 28, gain: 0.85, out, dist: true, rev: 0.5 });
      for (const [f, g] of [[2980, 0.05], [4410, 0.035]]) this.tone(t + 0.03, 1.6, { type: 'sine', f0: f, f1: f * 0.995, gain: g, attack: 0.005, out, rev: 0.6 });
    } else if (kind === 'spurt') {
      // a pulse of the fountain: a hiss of spray with a gurgle in it
      const p = o.power ?? 1;
      this.noise(t, 0.42 * p + 0.1, { type: 'bandpass', f0: 1400, f1: 700, q: 0.9, gain: 0.32 * p, attack: 0.03, out, rev: 0.25 });
      for (let k = 0; k < 4; k++) this.noise(t + k * 0.06 + Math.random() * 0.03, 0.08, { type: 'lowpass', f0: 520 + Math.random() * 300, q: 6, gain: 0.25 * p, attack: 0.01, out, rev: 0.15 });
    } else if (kind === 'splat') {
      // the trunk lands: a heavy thud and a wet splash
      if (rec) { this.take('thudH', t, { out, gain: 1.0, rate: 0.85, rev: 0.35 }); this.take('slap', t + 0.01, { out, gain: 0.8, rate: 0.6, rev: 0.3 }); }
      this.tone(t, 0.35, { f0: 75, f1: 30, gain: 0.6, out, dist: true, rev: 0.3 });
      this.noise(t + 0.01, 0.35, { type: 'lowpass', f0: 1800, f1: 250, gain: 0.45, out, rev: 0.25 });
      for (let k = 0; k < 6; k++) this.noise(t + 0.08 + k * 0.05 + Math.random() * 0.04, 0.05, { type: 'bandpass', f0: 1800 + Math.random() * 1800, q: 2, gain: 0.12, out, rev: 0.2 });
    } else if (kind === 'fall') {
      // the legs fold and drop
      if (rec) { this.take('thudM', t, { out, gain: 0.9, rate: 0.9, rev: 0.3 }); this.take('thudH', t + 0.09, { out, gain: 0.6, rate: 1.05, rev: 0.3 }); }
      this.tone(t + 0.05, 0.25, { f0: 70, f1: 32, gain: 0.4, out, dist: true, rev: 0.3 });
    } else if (kind === 'flick') {
      if (rec) this.take('swishL', t, { out, gain: 0.7, rate: 0.85, rev: 0.15 });
      for (let k = 0; k < 9; k++) this.noise(t + 0.12 + k * 0.035 + Math.random() * 0.03, 0.04, { type: 'bandpass', f0: 1500 + Math.random() * 2500, q: 2, gain: 0.1, out, rev: 0.2 });
    } else if (kind === 'title') {
      // the name of it: a deep boom and a crash, then the announcer
      this.tone(t, 1.8, { f0: 52, f1: 26, gain: 1.0, out, dist: true, rev: 0.7 });
      this.noise(t, 1.6, { type: 'lowpass', f0: 4200, f1: 300, gain: 0.5, attack: 0.005, out, rev: 0.6 });
      if (rec) this.take('thudH', t, { out, gain: 1.2, rate: 0.6, rev: 0.6 });
      setTimeout(() => this.announce('punetality'), 250);
    } else if (kind === 'clank') {
      // two dumbbells taken up: the steel collars knock together
      for (const [f, g, d] of [[1850, 0.1, 0.5], [2790, 0.07, 0.4], [4120, 0.05, 0.3], [930, 0.06, 0.25]]) this.tone(t, d, { type: 'sine', f0: f, f1: f * 0.99, gain: g, attack: 0.002, out, rev: 0.3 });
      this.tone(t + 0.09, 0.3, { type: 'sine', f0: 2210, f1: 2190, gain: 0.05, attack: 0.002, out, rev: 0.3 });
      this.noise(t, 0.05, { type: 'highpass', f0: 2500, gain: 0.15, out, rev: 0.1 });
    } else if (kind === 'hookhit') {
      // a dumbbell into a face: a heavy punch, a crack and the iron's dull ring
      if (rec) { this.take('punchH', t, { out, gain: 1.1, rate: 0.82, rev: 0.3 }); this.take('thudH', t + 0.005, { out, gain: 0.7, rate: 0.9, rev: 0.3 }); }
      this.noise(t, 0.05, { type: 'bandpass', f0: 3200, q: 1.5, gain: 0.35, out, rev: 0.2 });
      this.tone(t, 0.6, { type: 'sine', f0: 410, f1: 395, gain: 0.07, attack: 0.002, out, rev: 0.4 });
      this.tone(t, 0.25, { f0: 70, f1: 35, gain: 0.5, out, dist: true, rev: 0.3 });
    } else if (kind === 'crunch') {
      // a skull giving way under forty kilos: cracks, a wet crush, a deep blow and the iron
      for (let k = 0; k < 7; k++) this.noise(t + k * 0.012 + Math.random() * 0.01, 0.03, { type: 'bandpass', f0: 1800 + Math.random() * 2600, q: 2.5, gain: 0.5 - k * 0.05, out, rev: 0.25 });
      this.noise(t + 0.01, 0.4, { type: 'lowpass', f0: 1500, f1: 160, q: 4, gain: 0.7, attack: 0.005, out, rev: 0.35 });
      if (rec) { this.take('thudH', t, { out, gain: 1.2, rate: 0.62, rev: 0.5 }); this.take('slap', t + 0.02, { out, gain: 1.0, rate: 0.5, rev: 0.4 }); this.take('punchH', t, { out, gain: 0.9, rate: 0.6, rev: 0.4 }); }
      this.tone(t, 1.1, { f0: 58, f1: 26, gain: 1.0, out, dist: true, rev: 0.6 });
      this.tone(t + 0.005, 0.9, { type: 'sine', f0: 380, f1: 370, gain: 0.06, attack: 0.002, out, rev: 0.5 });
    } else if (kind === 'dbland') {
      // a dumbbell hitting the floor: a dull thud, the rubber, and a bounce
      const p = o.power ?? 1;
      if (rec) this.take('thudM', t, { out, gain: 0.9 * p, rate: 0.75, rev: 0.3 });
      this.tone(t, 0.28, { f0: 95, f1: 45, gain: 0.55 * p, out, dist: true, rev: 0.25 });
      this.noise(t, 0.08, { type: 'lowpass', f0: 1100, gain: 0.3 * p, out, rev: 0.2 });
      this.tone(t, 0.35, { type: 'sine', f0: 620, f1: 600, gain: 0.03 * p, attack: 0.002, out, rev: 0.3 });
    } else if (kind === 'clap') {
      // dusting his hands
      if (rec) this.take('slap', t, { out, gain: 0.35, rate: 1.4, vary: 0.05, rev: 0.15 });
      else this.noise(t, 0.04, { type: 'bandpass', f0: 1800, q: 1, gain: 0.25, out, rev: 0.15 });
    } else if (kind === 'tap') {
      // his phone: a soft key click
      this.tone(t, 0.03, { type: 'triangle', f0: 2400, f1: 2200, gain: 0.04, attack: 0.001, out, rev: 0.05 });
    } else if (kind === 'bounce') {
      // a tennis ball on the floor: a hollow pock
      this.tone(t, 0.07, { type: 'sine', f0: 520, f1: 260, gain: 0.32, attack: 0.001, out, rev: 0.25 });
      this.noise(t, 0.035, { type: 'bandpass', f0: 1300, q: 2, gain: 0.25, out, rev: 0.2 });
    } else if (kind === 'catch') {
      this.noise(t, 0.05, { type: 'lowpass', f0: 900, gain: 0.18, out, rev: 0.1 });
    } else if (kind === 'toss') {
      this.noise(t, 0.25, { type: 'bandpass', f0: 700, f1: 1400, q: 1, gain: 0.07, attack: 0.08, out, rev: 0.1 });
    } else if (kind === 'serve') {
      // the strings on the ball: a hard, ringing pop and the crack of air
      this.tone(t, 0.12, { type: 'triangle', f0: 880, f1: 420, gain: 0.55, attack: 0.001, out, rev: 0.35 });
      this.noise(t, 0.06, { type: 'bandpass', f0: 2400, q: 1.4, gain: 0.6, attack: 0.001, out, rev: 0.4 });
      for (const [f, g] of [[1730, 0.06], [2650, 0.04]]) this.tone(t + 0.005, 0.35, { type: 'sine', f0: f, f1: f * 0.98, gain: g, attack: 0.002, out, rev: 0.4 });
      if (rec) this.take('slap', t, { out, gain: 0.8, rate: 1.4, rev: 0.4 });
      this.tone(t, 0.4, { f0: 70, f1: 32, gain: 0.5, out, dist: true, rev: 0.5 });
    } else if (kind === 'flyby') {
      // the ball tearing through the air
      this.noise(t, 0.5, { type: 'bandpass', f0: 2600, f1: 500, q: 2.5, gain: 0.35, attack: 0.05, out, rev: 0.2 });
      this.tone(t, 0.45, { type: 'sawtooth', f0: 900, f1: 260, gain: 0.05, attack: 0.03, out, rev: 0.2 });
    } else if (kind === 'thump') {
      // a ball buried in a chest: a deep, hollow blow
      if (rec) { this.take('punchH', t, { out, gain: 1.1, rate: 0.6, rev: 0.4 }); this.take('thudH', t, { out, gain: 1.0, rate: 0.65, rev: 0.4 }); }
      this.tone(t, 0.7, { f0: 60, f1: 30, gain: 0.9, out, dist: true, rev: 0.5 });
    } else if (kind === 'inflate') {
      // the body stretching from inside: a rising, straining groan of flesh
      const c2 = this.ctx, o = c2.createOscillator(), f = c2.createBiquadFilter(), g = c2.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(240, t + 2.6);
      f.type = 'bandpass'; f.Q.value = 6; f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(1200, t + 2.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 2.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 2.9);
      for (let k = 0; k < 10; k++) this.noise(t + 0.4 + k * 0.22 + Math.random() * 0.08, 0.06, { type: 'bandpass', f0: 500 + k * 120, q: 4, gain: 0.08 + k * 0.012, out, rev: 0.2 });
    } else if (kind === 'explode') {
      // he bursts: a huge wet blast, the splatter all round and the rain of it after
      this.tone(t, 2.0, { f0: 48, f1: 22, gain: 1.0, out, dist: true, rev: 0.8 });
      this.noise(t, 1.2, { type: 'lowpass', f0: 5000, f1: 200, gain: 0.85, attack: 0.002, out, rev: 0.7 });
      if (rec) { this.take('thudH', t, { out, gain: 1.4, rate: 0.5, rev: 0.7 }); this.take('slap', t + 0.01, { out, gain: 1.4, rate: 0.45, rev: 0.6 }); this.take('punchH', t, { out, gain: 1.0, rate: 0.5, rev: 0.6 }); }
      for (let k = 0; k < 40; k++) this.noise(t + 0.25 + Math.random() * 1.6, 0.05, { type: 'bandpass', f0: 900 + Math.random() * 2600, q: 2, gain: 0.05 + Math.random() * 0.08, out, rev: 0.3 });
    } else if (kind === 'gibland') {
      const p = o.power ?? 1;
      if (rec) { this.take('thudM', t, { out, gain: 0.8 * p, rate: 0.85, rev: 0.3 }); this.take('slap', t + 0.01, { out, gain: 0.45 * p, rate: 0.7, rev: 0.3 }); }
      this.noise(t, 0.2, { type: 'lowpass', f0: 1200, f1: 200, gain: 0.3 * p, out, rev: 0.3 });
    } else if (kind === 'twirl') {
      if (rec) this.take('swishL', t, { out, gain: 0.35, rate: 1.3, rev: 0.1 });
      else this.noise(t, 0.12, { type: 'bandpass', f0: 1800, q: 1.5, gain: 0.1, out, rev: 0.1 });
    } else if (kind === 'beep') {
      // a sports watch: two short beeps to start, one long one to stop
      const f = 2750;
      if (o.long) this.tone(t, 0.42, { type: 'square', f0: f, f1: f, gain: 0.05, attack: 0.002, out, rev: 0.05 });
      else for (const k of [0, 0.14]) this.tone(t + k, 0.08, { type: 'square', f0: f, f1: f, gain: 0.05, attack: 0.002, out, rev: 0.05 });
    } else if (kind === 'go') {
      // off: a hard push from the floor and a breath out
      if (rec) { this.take('stepC', t, { out, gain: 1.0, rate: 0.85 }); this.take('swishL', t + 0.03, { out, gain: 0.5, rate: 0.8 }); }
      this.noise(t, 0.25, { type: 'bandpass', f0: 900, f1: 500, q: 0.8, gain: 0.12, attack: 0.01, out, rev: 0.1 });
    } else if (kind === 'runstep') {
      const v = o.v ?? 4;
      if (rec) this.take(this.surface === 'wood' ? 'stepW' : 'stepC', t, { out, gain: 0.55 + Math.min(0.4, v * 0.03), rate: 1 + Math.min(0.5, v * 0.03), vary: 0.08 });
      else this.noise(t, 0.05, { type: 'lowpass', f0: 700, gain: 0.25, out });
    } else if (kind === 'windOn') {
      // the whirlwind: a roar of filtered noise whose pitch and weight follow its strength (windLevel), a whistle on top
      this.fatal('windOff', null, { fast: true });
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 0.7;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
      const g = c.createGain(); g.gain.value = 0.0001; const gw = c.createGain(); gw.gain.value = 0.0001;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.6; lg.gain.value = 250; lfo.connect(lg).connect(bp.frequency); lfo.start(t);
      src.connect(lp).connect(g).connect(this.sfxBus); src.connect(bp).connect(gw).connect(this.sfxBus);
      const r = c.createGain(); r.gain.value = 0.25; g.connect(r).connect(this.revSend);
      src.start(t);
      this.windNodes = { src, lp, bp, g, gw, lfo };
    } else if (kind === 'windLevel') {
      const N = this.windNodes; if (!N) return;
      const I = o.I ?? 0, red = o.red ?? 0;
      N.g.gain.setTargetAtTime(0.0001 + 0.42 * I, t, 0.12);
      N.lp.frequency.setTargetAtTime(250 + 1500 * I, t, 0.15);
      N.gw.gain.setTargetAtTime(0.0001 + 0.1 * I * (1 - 0.5 * red), t, 0.15);
      N.lfo.frequency.setTargetAtTime(0.5 + 2.5 * I, t, 0.2);
    } else if (kind === 'windOff') {
      const N = this.windNodes; if (!N) return;
      this.windNodes = null;
      const k = o.fast ? 0.06 : 0.5;
      N.g.gain.setTargetAtTime(0.0001, t, k); N.gw.gain.setTargetAtTime(0.0001, t, k);
      N.src.stop(t + k * 6); N.lfo.stop(t + k * 6);
    } else if (kind === 'shred') {
      // skin and cloth torn by the wind: wet rips and crackles
      const p = o.power ?? 1;
      for (let k = 0; k < 4; k++) this.noise(t + k * 0.03 + Math.random() * 0.03, 0.06, { type: 'bandpass', f0: 1200 + Math.random() * 2200, q: 2, gain: 0.12 * p, out, rev: 0.2 });
      this.noise(t, 0.18, { type: 'lowpass', f0: 900, f1: 250, q: 3, gain: 0.14 * p, out, rev: 0.2 });
    } else if (kind === 'evap') {
      // the body coming apart in the wind: a long wet tearing roar
      this.noise(t, 1.4, { type: 'bandpass', f0: 400, f1: 2400, q: 0.8, gain: 0.45, attack: 0.3, out, rev: 0.5 });
      this.noise(t, 1.2, { type: 'lowpass', f0: 600, f1: 200, q: 4, gain: 0.35, attack: 0.1, out, rev: 0.4 });
      for (let k = 0; k < 18; k++) this.noise(t + Math.random() * 1.3, 0.05, { type: 'bandpass', f0: 800 + Math.random() * 2500, q: 2, gain: 0.08 + Math.random() * 0.08, out, rev: 0.3 });
    } else if (kind === 'pop') {
      // gone: a deep wet burst, and the wind's last sigh
      this.tone(t, 1.3, { f0: 55, f1: 24, gain: 0.95, out, dist: true, rev: 0.7 });
      this.noise(t, 0.9, { type: 'lowpass', f0: 3800, f1: 220, gain: 0.6, attack: 0.003, out, rev: 0.6 });
      if (rec) { this.take('thudH', t, { out, gain: 1.1, rate: 0.55, rev: 0.6 }); this.take('slap', t + 0.01, { out, gain: 1.0, rate: 0.5, rev: 0.5 }); }
    } else if (kind === 'sizzle') {
      this.noise(t, 1.2, { type: 'highpass', f0: 3500, gain: 0.04, attack: 0.2, out, rev: 0.2 });
    } else if (kind === 'skid') {
      // trainers skidding on the ground: a rubbery squeal and grit
      // (long: a tyre locked and sliding)
      const L = o.long ? 1.5 : 1;
      this.tone(t, 0.55 * L, { type: 'sawtooth', f0: 1150, f1: 820, gain: 0.05, attack: 0.02, out, rev: 0.2 });
      this.noise(t, 0.6 * L, { type: 'bandpass', f0: 2600, f1: 1200, q: 1.2, gain: 0.22, attack: 0.02, out, rev: 0.2 });
      this.noise(t, 0.5 * L, { type: 'lowpass', f0: 700, gain: 0.18, attack: 0.02, out, rev: 0.15 });
    } else if (kind === 'pat') {
      // a slap on a big belly: the flat smack of the palms and the low, round answer of it
      const g = o.last ? 0.8 : 1;
      if (rec) { this.take('slap', t, { out, gain: 0.9 * g, rate: 0.72, rev: 0.25 }); this.take('thudM', t + 0.004, { out, gain: 0.45 * g, rate: 0.7, rev: 0.2 }); }
      else this.noise(t, 0.06, { type: 'bandpass', f0: 1400, q: 0.8, gain: 0.4 * g, out, rev: 0.25 });
      this.tone(t, 0.28, { type: 'sine', f0: 118, f1: 82, gain: 0.32 * g, out, rev: 0.2 });
    } else if (kind === 'stomp') {
      // a heavy man's stamp that breaks the ground: a deep boom, the crack of the slab and grit
      if (rec) { this.take('thudH', t, { out, gain: 1.3, rate: 0.55, rev: 0.55 }); this.take('stepC', t, { out, gain: 1.0, rate: 0.6 }); }
      this.tone(t, 1.3, { f0: 50, f1: 24, gain: 1.0, out, dist: true, rev: 0.7 });
      for (let k = 0; k < 6; k++) this.noise(t + 0.01 + k * 0.018 + Math.random() * 0.01, 0.04, { type: 'bandpass', f0: 1400 + Math.random() * 2200, q: 2, gain: 0.32 - k * 0.04, out, rev: 0.35 });
      this.noise(t, 0.6, { type: 'lowpass', f0: 900, f1: 120, gain: 0.45, attack: 0.004, out, rev: 0.5 });
    } else if (kind === 'crackrun') {
      // the crack running across the ground: a fast crackle going away, stone grinding under it
      for (let k = 0; k < 16; k++) this.noise(t + k * 0.022 + Math.random() * 0.012, 0.03, { type: 'bandpass', f0: 2600 - k * 90 + Math.random() * 900, q: 3, gain: 0.22 * (1 - k / 22), out, rev: 0.3 });
      this.noise(t, 0.45, { type: 'lowpass', f0: 380, f1: 160, q: 3, gain: 0.3, attack: 0.03, out, rev: 0.4 });
    } else if (kind === 'collapse') {
      // the ground giving way: a long, deep rumble, the slab breaking up, falling, echoing in the pit
      this.tone(t, 2.4, { f0: 38, f1: 22, gain: 0.9, attack: 0.05, out, dist: true, rev: 0.8 });
      this.noise(t, 2.2, { type: 'lowpass', f0: 520, f1: 90, q: 1.5, gain: 0.6, attack: 0.08, out, rev: 0.8 });
      this.noise(t + 0.05, 1.4, { type: 'bandpass', f0: 1800, f1: 500, q: 0.7, gain: 0.22, attack: 0.1, out, rev: 0.6 });
      if (rec) for (let k = 0; k < 5; k++) this.take('thudH', t + 0.08 + k * 0.17 + Math.random() * 0.06, { out, gain: 0.8 - k * 0.1, rate: 0.5 + Math.random() * 0.2, rev: 0.7 });
    } else if (kind === 'rubble') {
      // a chunk of the slab landing at the pit's bottom
      const s = Math.min(1, (o.s ?? 0.06) / 0.08);
      if (rec) this.take('thudM', t, { out, gain: 0.25 + 0.4 * s, rate: 1.1 - 0.4 * s, rev: 0.6, vary: 0.15 });
      this.noise(t, 0.08, { type: 'bandpass', f0: 900 + Math.random() * 1500, q: 1.5, gain: 0.12 + 0.12 * s, out, rev: 0.5 });
    } else if (kind === 'gasp') {
      // the loser's sharp breath in (no voice of his own for it: air through a throat)
      this.noise(t, 0.35, { type: 'bandpass', f0: 1300, f1: 2200, q: 2.5, gain: 0.16, attack: 0.04, out, rev: 0.25 });
      this.noise(t, 0.3, { type: 'bandpass', f0: 600, f1: 900, q: 4, gain: 0.08, attack: 0.05, out, rev: 0.2 });
    } else if (kind === 'heavystep') {
      // a big man running: each foot a thud, the ground answering
      if (rec) { this.take('stepC', t, { out, gain: 1.0, rate: 0.66, vary: 0.06 }); this.take('thudM', t, { out, gain: 0.4, rate: 0.62, rev: 0.25 }); }
      this.tone(t, 0.3, { f0: 64, f1: 34, gain: 0.45, out, rev: 0.25 });
    } else if (kind === 'bump') {
      // a belly bump that sends a man flying: a huge wet smack, a deep wobbling boom, the air knocked out
      if (rec) { this.take('slap', t, { out, gain: 1.4, rate: 0.48, rev: 0.5 }); this.take('thudH', t, { out, gain: 1.3, rate: 0.5, rev: 0.6 }); this.take('punchH', t + 0.01, { out, gain: 1.0, rate: 0.55, rev: 0.5 }); }
      this.tone(t, 1.4, { f0: 46, f1: 22, gain: 1.0, out, dist: true, rev: 0.8 });
      const w = c.createOscillator(), wg = c.createGain(), vib = c.createOscillator(), vg = c.createGain();
      w.type = 'sine'; w.frequency.setValueAtTime(140, t); w.frequency.exponentialRampToValueAtTime(70, t + 0.5);
      vib.frequency.value = 11; vg.gain.value = 14; vib.connect(vg).connect(w.frequency);
      wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.4, t + 0.01); wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      w.connect(wg).connect(out); w.start(t); vib.start(t); w.stop(t + 0.65); vib.stop(t + 0.65);
      this.noise(t, 0.7, { type: 'lowpass', f0: 2600, f1: 200, gain: 0.45, attack: 0.003, out, rev: 0.6 });
    } else if (kind === 'impale') {
      // onto the spikes: iron punching through, ribs giving, a wet crunch, a deep blow, the spikes ringing
      for (let k = 0; k < 9; k++) this.noise(t + k * 0.01 + Math.random() * 0.012, 0.035, { type: 'bandpass', f0: 1500 + Math.random() * 2800, q: 2.5, gain: 0.5 - k * 0.04, out, rev: 0.3 });
      this.noise(t + 0.005, 0.5, { type: 'lowpass', f0: 1700, f1: 150, q: 5, gain: 0.75, attack: 0.004, out, rev: 0.45 });
      if (rec) { this.take('thudH', t, { out, gain: 1.3, rate: 0.55, rev: 0.6 }); this.take('slap', t + 0.012, { out, gain: 1.1, rate: 0.45, rev: 0.5 }); this.take('punchH', t, { out, gain: 1.0, rate: 0.5, rev: 0.5 }); }
      this.tone(t, 1.3, { f0: 54, f1: 24, gain: 1.0, out, dist: true, rev: 0.7 });
      for (const [f, g] of [[612, 0.05], [883, 0.04], [1376, 0.03], [2011, 0.02]]) this.tone(t + 0.01, 1.4, { type: 'sine', f0: f * 1.004, f1: f, gain: g, attack: 0.002, out, rev: 0.7 });
    } else if (kind === 'cough') {
      // a wet, weak cough with blood in it
      const g = o.last ? 0.7 : 1;
      for (let k = 0; k < (o.last ? 1 : 2); k++) {
        this.noise(t + k * 0.24, 0.16, { type: 'bandpass', f0: 700, f1: 420, q: 1.5, gain: 0.3 * g, attack: 0.008, out, rev: 0.3 });
        for (let j = 0; j < 4; j++) this.noise(t + k * 0.24 + 0.04 + j * 0.03, 0.04, { type: 'lowpass', f0: 380 + Math.random() * 250, q: 7, gain: 0.18 * g, attack: 0.005, out, rev: 0.2 });
      }
    } else if (kind === 'drip') {
      // a drop into the pool at the pit's bottom: a small wet plink, echoing
      const f = 900 + Math.random() * 500;
      this.tone(t, 0.12, { type: 'sine', f0: f, f1: f * 2.1, gain: 0.05, attack: 0.002, out, rev: 0.8 });
    } else if (kind === 'whistle') {
      // a whistle through two fingers: a shrill rising note, a dip, up again
      const w = c.createOscillator(), wg = c.createGain(), bp = c.createBiquadFilter();
      w.type = 'sine'; bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 2;
      w.frequency.setValueAtTime(1900, t); w.frequency.exponentialRampToValueAtTime(3100, t + 0.18); w.frequency.setValueAtTime(2900, t + 0.3); w.frequency.exponentialRampToValueAtTime(2300, t + 0.4); w.frequency.exponentialRampToValueAtTime(3300, t + 0.62);
      wg.gain.setValueAtTime(0.0001, t); wg.gain.exponentialRampToValueAtTime(0.16, t + 0.04); wg.gain.setValueAtTime(0.16, t + 0.28); wg.gain.exponentialRampToValueAtTime(0.05, t + 0.38); wg.gain.exponentialRampToValueAtTime(0.18, t + 0.45); wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      w.connect(wg).connect(out); w.start(t); w.stop(t + 0.8);
      const r = c.createGain(); r.gain.value = 0.35; wg.connect(r).connect(this.revSend);
      this.noise(t, 0.7, { type: 'bandpass', f0: 3000, q: 4, gain: 0.03, attack: 0.03, out, rev: 0.3 });
    } else if (kind === 'bikeroll') {
      // a bike rolling in on its own: tyres on the ground, the freewheel ticking, slowing down
      const d = o.dur ?? 1.2;
      this.noise(t, d, { type: 'bandpass', f0: 1200, f1: 400, q: 0.8, gain: 0.12, attack: 0.15, out, rev: 0.2 });
      for (let k = 0; k < 26; k++) { const tk = t + d * (1 - Math.pow(1 - k / 26, 1.6)); this.noise(tk, 0.012, { type: 'highpass', f0: 5000, gain: 0.07 * (1 - k / 40), out, rev: 0.1 }); }
    } else if (kind === 'click') {
      // the helmet's buckle clicking shut
      this.noise(t, 0.015, { type: 'highpass', f0: 3500, gain: 0.35, out, rev: 0.1 });
      this.noise(t + 0.025, 0.012, { type: 'bandpass', f0: 2400, q: 3, gain: 0.25, out, rev: 0.1 });
    } else if (kind === 'knock') {
      // knuckles on a helmet: a hollow plastic tok
      this.tone(t, 0.09, { type: 'sine', f0: 820, f1: 560, gain: 0.22, attack: 0.001, out, rev: 0.2 });
      this.noise(t, 0.03, { type: 'bandpass', f0: 1800, q: 2, gain: 0.25, out, rev: 0.15 });
    } else if (kind === 'saddle') {
      // landing on the saddle: the bike takes his weight, a creak and a thump of the tyres
      if (rec) this.take('thudM', t, { out, gain: 0.5, rate: 0.8, rev: 0.2 });
      this.tone(t, 0.25, { f0: 90, f1: 50, gain: 0.3, out, rev: 0.2 });
      this.noise(t + 0.03, 0.18, { type: 'bandpass', f0: 700, f1: 500, q: 6, gain: 0.08, out, rev: 0.2 });
    } else if (kind === 'bell') {
      // a bike's bell: ring-ring, bright and ringing on
      for (let k = 0; k < 2; k++) for (const [f, g, dd] of [[3150, 0.09, 0.9], [4720, 0.05, 0.7], [7350, 0.025, 0.4]]) this.tone(t + k * 0.13, dd, { type: 'sine', f0: f, f1: f * 0.997, gain: g, attack: 0.002, out, rev: 0.35 });
      for (let k = 0; k < 2; k++) this.noise(t + k * 0.13, 0.02, { type: 'highpass', f0: 4000, gain: 0.1, out, rev: 0.1 });
    } else if (kind === 'rideOn') {
      // the bike under way: tyres on the ground and the chain, louder and brighter with the speed (rideLevel)
      this.fatal('rideOff', null, { fast: true });
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.9;
      const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3800; hp.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0.0001; const gc = c.createGain(); gc.gain.value = 0.0001;
      src.connect(bp).connect(g).connect(out); src.connect(hp).connect(gc).connect(out);
      src.start(t);
      this.rideNodes = { src, bp, g, gc };
    } else if (kind === 'rideLevel') {
      const N = this.rideNodes; if (!N) return;
      const v = Math.min(12, o.v ?? 0) / 12;
      N.g.gain.setTargetAtTime(0.0001 + 0.22 * v, t, 0.08);
      N.bp.frequency.setTargetAtTime(350 + 1400 * v, t, 0.1);
      N.gc.gain.setTargetAtTime(0.0001 + 0.05 * v * (o.pedal ? 1 : 0.4), t, 0.1);
    } else if (kind === 'rideOff') {
      const N = this.rideNodes; if (!N) return;
      this.rideNodes = null;
      const k = o.fast ? 0.05 : 0.35;
      N.g.gain.setTargetAtTime(0.0001, t, k); N.gc.gain.setTargetAtTime(0.0001, t, k);
      N.src.stop(t + k * 6);
    } else if (kind === 'zoom') {
      // the bike going through at forty an hour, right past the ear
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.35); bp.frequency.exponentialRampToValueAtTime(500, t + 0.9);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      src.connect(bp).connect(g).connect(out); src.start(t); src.stop(t + 1.2);
    } else if (kind === 'split') {
      // a body split down its middle: a long wet rip, bone giving all the way up, a deep blow
      this.noise(t, 0.55, { type: 'bandpass', f0: 500, f1: 2600, q: 1.2, gain: 0.55, attack: 0.01, out, rev: 0.35 });
      for (let k = 0; k < 12; k++) this.noise(t + k * 0.03 + Math.random() * 0.012, 0.03, { type: 'bandpass', f0: 1500 + Math.random() * 2800, q: 2.5, gain: 0.45 - k * 0.025, out, rev: 0.3 });
      if (rec) { this.take('slap', t, { out, gain: 1.3, rate: 0.45, rev: 0.5 }); this.take('thudH', t, { out, gain: 1.2, rate: 0.55, rev: 0.6 }); this.take('punchH', t + 0.04, { out, gain: 0.9, rate: 0.6, rev: 0.5 }); }
      this.tone(t, 1.2, { f0: 56, f1: 26, gain: 1.0, out, dist: true, rev: 0.7 });
      for (let k = 0; k < 5; k++) this.noise(t + 0.08 + k * 0.07, 0.07, { type: 'lowpass', f0: 500 + Math.random() * 300, q: 6, gain: 0.3, attack: 0.01, out, rev: 0.25 });
    } else if (kind === 'scan') {
      // Orión's scan: a soft electronic sweep down and up, ticking
      this.tone(t, 0.75, { type: 'sine', f0: 2400, f1: 900, gain: 0.05, attack: 0.02, out, rev: 0.15 });
      this.tone(t + 0.75, 0.6, { type: 'sine', f0: 900, f1: 2400, gain: 0.05, attack: 0.02, out, rev: 0.15 });
      for (let k = 0; k < 10; k++) this.tone(t + k * 0.13, 0.025, { type: 'square', f0: 3200, f1: 3200, gain: 0.018, attack: 0.001, out, rev: 0.05 });
    } else if (kind === 'charge') {
      // the eyes charging: a whine rising for a second, a low hum swelling under it
      this.tone(t, 0.95, { type: 'sawtooth', f0: 180, f1: 2600, gain: 0.07, attack: 0.5, out, rev: 0.2 });
      this.tone(t, 0.95, { type: 'sine', f0: 60, f1: 95, gain: 0.25, attack: 0.6, out, rev: 0.1 });
      this.noise(t + 0.3, 0.6, { type: 'bandpass', f0: 2000, f1: 6000, q: 4, gain: 0.05, attack: 0.4, out, rev: 0.2 });
    } else if (kind === 'beamOn') {
      // the beams: a crack as they fire, then a harsh buzzing roar (two detuned saws through a growling filter) and the
      // hiss of what they burn; stopped by beamOff
      this.fatal('beamOff', null, { fast: true });
      this.noise(t, 0.35, { type: 'lowpass', f0: 6000, f1: 300, gain: 0.5, attack: 0.002, out, rev: 0.5 });
      this.tone(t, 0.5, { f0: 120, f1: 40, gain: 0.6, out, dist: true, rev: 0.4 });
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
      const lp = c.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 900; lp.Q.value = 1.4;
      const oscs = [110, 111.7, 220.6].map((f) => { const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.connect(lp); o2.start(t); return o2; });
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 23; lg.gain.value = 400; lfo.connect(lg).connect(lp.frequency); lfo.start(t);
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000; const gh = c.createGain(); gh.gain.value = 0.05;
      src.connect(hp).connect(gh).connect(g); src.start(t);
      lp.connect(g).connect(this.sfxBus);
      const r = c.createGain(); r.gain.value = 0.25; g.connect(r).connect(this.revSend);
      this.beamNodes = { g, stop: [...oscs, lfo, src] };
    } else if (kind === 'beamOff') {
      const N = this.beamNodes; if (!N) return;
      this.beamNodes = null;
      const k = o.fast ? 0.04 : 0.12;
      N.g.gain.setTargetAtTime(0.0001, t, k);
      for (const n of N.stop) n.stop(t + k * 8);
      if (!o.fast) this.tone(t, 0.4, { type: 'sawtooth', f0: 900, f1: 80, gain: 0.06, out, rev: 0.3 });
    } else if (kind === 'ignite') {
      // catching fire: a whoosh of air drawn in and a soft boom
      const p = o.small ? 0.45 : 1;
      this.noise(t, 0.7, { type: 'bandpass', f0: 300, f1: 1800, q: 0.7, gain: 0.4 * p, attack: 0.12, out, rev: 0.4 });
      this.tone(t + 0.1, 0.6, { f0: 70, f1: 38, gain: 0.45 * p, out, rev: 0.3 });
    } else if (kind === 'fireOn') {
      // the fire: a roar (low noise, its weight following fireLevel) and crackles scattered through it
      this.fatal('fireOff', null, { fast: true });
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0.0001;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 3.3; lg.gain.value = 120; lfo.connect(lg).connect(lp.frequency); lfo.start(t);
      src.connect(lp).connect(g).connect(this.sfxBus); src.start(t);
      const r = c.createGain(); r.gain.value = 0.2; g.connect(r).connect(this.revSend);
      this.fireNodes = { src, lp, g, lfo, I: 0.3, out };
    } else if (kind === 'fireLevel') {
      const N = this.fireNodes; if (!N) return;
      const I = o.I ?? 0.5; N.I = I;
      N.g.gain.setTargetAtTime(0.0001 + 0.32 * I, t, 0.2);
      N.lp.frequency.setTargetAtTime(300 + 1400 * I, t, 0.2);
      // (crackles: a few sharp pops each time)
      for (let k = 0; k < Math.round(1 + I * 4); k++) this.noise(t + Math.random() * 0.1, 0.012 + Math.random() * 0.02, { type: 'bandpass', f0: 1500 + Math.random() * 4000, q: 3, gain: 0.05 + Math.random() * 0.08 * I, out, rev: 0.15 });
    } else if (kind === 'fireOff') {
      const N = this.fireNodes; if (!N) return;
      this.fireNodes = null;
      const k = o.fast ? 0.05 : 0.8;
      N.g.gain.setTargetAtTime(0.0001, t, k);
      N.src.stop(t + k * 6); N.lfo.stop(t + k * 6);
    } else if (kind === 'crumble') {
      // the charred body falling in on itself: a dry collapse, grit pouring, a soft thud
      const p = o.small ? 0.5 : 1;
      this.noise(t, 1.3, { type: 'bandpass', f0: 2500, f1: 700, q: 0.6, gain: 0.22 * p, attack: 0.05, out, rev: 0.3 });
      this.tone(t + 0.05, 0.5, { f0: 90, f1: 40, gain: 0.35 * p, out, rev: 0.3 });
      for (let k = 0; k < 14 * p; k++) this.noise(t + Math.random() * 1.1, 0.03, { type: 'bandpass', f0: 1500 + Math.random() * 3000, q: 2, gain: 0.04 + Math.random() * 0.05, out, rev: 0.2 });
    } else if (kind === 'halfthud') {
      // half a body landing on the ground: a heavy wet slap
      const p = o.power ?? 1;
      if (rec) { this.take('thudH', t, { out, gain: 1.0 * p, rate: 0.7, rev: 0.4 }); this.take('slap', t + 0.01, { out, gain: 0.8 * p, rate: 0.6, rev: 0.35 }); }
      this.tone(t, 0.45, { f0: 75, f1: 34, gain: 0.6 * p, out, dist: true, rev: 0.4 });
      this.noise(t, 0.3, { type: 'lowpass', f0: 1200, f1: 200, gain: 0.35 * p, out, rev: 0.3 });
    } else if (kind === 'summon') {
      // the leaf growing out of the hilt: a rising shimmer
      this.noise(t, 0.7, { type: 'bandpass', f0: 600, f1: 5200, q: 3, gain: 0.16, attack: 0.25, out, rev: 0.5 });
      for (let k = 0; k < 6; k++) this.tone(t + k * 0.07, 0.5, { type: 'sine', f0: 1320 * Math.pow(1.122, k), f1: 1320 * Math.pow(1.122, k), gain: 0.035, attack: 0.02, out, rev: 0.6 });
    }
  }
  // a machine's voice, as it plays (his lines are made robotic beforehand, tools/quotes_tts.py): half of it ring-
  // modulated against a low hum, a short metal comb (a few ms of echo fed back), a speaker's band. Returns the input
  // node; its oscillator stops after `dur` s
  robotFx(out, t, dur) {
    const c = this.ctx;
    const inp = c.createGain(), dry = c.createGain(), ring = c.createGain();
    dry.gain.value = 0.55; ring.gain.value = 0;
    const osc = c.createOscillator(); osc.frequency.value = 58;
    const depth = c.createGain(); depth.gain.value = 0.9; osc.connect(depth).connect(ring.gain); osc.start(t); osc.stop(t + dur);
    const comb = c.createDelay(0.05); comb.delayTime.value = 0.007;
    const fb = c.createGain(); fb.gain.value = 0.45; comb.connect(fb).connect(comb);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.55;
    const lift = c.createGain(); lift.gain.value = 1.6;
    inp.connect(dry); inp.connect(ring);
    for (const n of [dry, ring]) { n.connect(comb); n.connect(bp); }
    comb.connect(bp); bp.connect(lift).connect(out);
    return inp;
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
    if (FIGHTER_VOICE[f.id]?.[2] === 'robot') { const fx = this.robotFx(out, t, list[i].duration / src.playbackRate.value + 0.3); src.connect(g).connect(fx); out.connect(this.voiceBus); }
    else src.connect(g).connect(out).connect(this.voiceBus);
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
  // Each stage's acoustics: the blows, falls and steps ring in the stage's own space. A reverb tail of filtered noise
  // (its length, how bright it stays, how much of every sound goes in) with the early reflections of what is around:
  // El Porche's facades and the car park's arches answer soon and often, the open rooftop barely, the finish line's
  // tall buildings give a late slap back, the festival's stage shell a warm, longer tail.
  setSpace(key) {
    this.wantSpace = key;
    if (!this.ctx) return;
    const S = SPACES[key] || SPACES.porche;
    if (this.space === key) return;
    this.space = key;
    this.rev.buffer = this.spaceImpulse(S);
    const t = this.ctx.currentTime;
    this.revSend.gain.cancelScheduledValues(t); this.revSend.gain.setValueAtTime(S.send, t);
  }
  spaceImpulse({ tail, bright, early }) {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * tail);
    const b = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      // a tail that darkens as it dies: white noise for the first part, then a running low-pass of it
      let lp = 0;
      const k = Math.exp(-2 * Math.PI * 2200 * bright / sr);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * 2 - 1, u = i / n;
        lp = lp * k + x * (1 - k);
        const mix = Math.min(1, u * 2.5);
        d[i] = (x * (1 - mix) + lp * 2.2 * mix) * Math.pow(1 - u, 2.6) * (i < sr * 0.008 ? i / (sr * 0.008) : 1) * 0.7;
      }
      // the early reflections: short bursts at their delays, a little apart in the two ears
      for (const [ms, g] of early) {
        const at = Math.floor(sr * (ms + (ch ? 1.7 : 0)) / 1000);
        for (let j = 0; j < 90 && at + j < n; j++) d[at + j] += (Math.random() * 2 - 1) * g * Math.exp(-j / 22);
      }
    }
    return b;
  }
  // the menus' sounds: recorded (Kenney Interface Sounds, CC0)
  loadUI() {
    this.ui = {};
    for (const k of ['ui_move', 'ui_ok', 'ui_back']) this.loadBuffer(`assets/sfx/${k}.mp3`).then(b => { if (b) this.ui[k] = b; });
  }
  uiSound(k, gain) {
    const b = this.ui?.[k];
    if (!b) return false;
    const src = this.ctx.createBufferSource(); src.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(this.sfxBus); src.start();
    return true;
  }
  // a big blow: the music dips for an instant (a knockout: further and longer)
  hitDuck(depth = 0.35, back = 0.35) {
    const g = this.musicHit?.gain;
    if (!g) return;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 - depth, t + 0.012); g.linearRampToValueAtTime(1, t + 0.012 + back);
  }
  // the crowd (the street's and the festival's) reacts to a big blow: a short swell, and a cheer for a counter hit
  crowdReact(big) {
    const amb = this.amb;
    if (!this.ctx || !amb?.swell || !amb.crowd) return;
    const t = this.ctx.currentTime;
    if (t < (this.crowdT || 0)) return;
    this.crowdT = t + (big ? 4 : 2.5);
    const g = amb.swell.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(big ? 1.6 : 1.3, t + 0.25); g.linearRampToValueAtTime(1, t + (big ? 2.5 : 1.6));
    if (big) this.loadBuffer('assets/sfx/cheer.mp3').then(buf => {
      if (!buf || this.amb !== amb) return;
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const cg = this.ctx.createGain(); cg.gain.value = 0.22;
      src.playbackRate.value = 0.95 + Math.random() * 0.1;
      src.connect(cg).connect(this.sfxBus); src.start(this.ctx.currentTime, 0.2);
      cg.gain.setValueAtTime(0.22, this.ctx.currentTime + 1.2); cg.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.4);
    });
  }
  // Each stage's recorded background in a seamless loop, under the music: the race-day crowd on the street (and, further
  // off, at the festival), a city street at El Porche, an evening outdoors on the rooftop (tools/ambience_build.py).
  // (The old synthesized beds, filtered noise for cicadas and murmur, read as a strange hiss on phone speakers.)
  ambience(kind) {
    this.wantAmb = kind;
    if (!this.ctx) return;
    if (this.amb?.kind === kind) return;
    this.stopAmbience();
    const bed = AMBIENCE[kind];
    if (!bed) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.worldLP);
    out.gain.linearRampToValueAtTime(bed.gain, c.currentTime + 2);
    const swell = c.createGain(); swell.gain.value = 1; swell.connect(out);
    const amb = this.amb = { kind, out, swell, nodes: [], crowd: !!bed.crowd };
    this.loadBuffer(bed.file).then(buf => {
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
    if (!this.ctx || !amb?.swell || !amb.crowd) return;
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
  // Recorded tracks (assets/music: the menus', each stage's) streamed by a single media element into the music bus: no big
  // decoded buffers on phones, and once the first touch has started it, iOS lets the game switch tracks later without
  // another touch. (The old music was synthesized note by note from a main-thread timer: it stuttered on phones.)
  // fresh: a new fight (it starts on the stage's next track even if that stage's music is already playing)
  music(track = 'menu', { fresh = false } = {}) {
    this.wantMusic = track;
    if (!this.ctx || !this.musicOn) return;
    const el = this.musicElement();
    // the same music asked again (a replay, a highlight) carries on, the final round's track included
    if (this.musicTrack === track && !el.paused && !(fresh && (MUSIC[track]?.length > 1 || this.musicFinal))) return;
    this.musicTrack = track;
    this.musicFinal = false;
    const list = MUSIC[track] || MUSIC.menu;
    // a new fight starts on the stage's next track (the first one at random)
    this.musicNext = this.musicNext || {};
    if (this.musicNext[track] === undefined) this.musicNext[track] = Math.floor(Math.random() * list.length);
    const k = this.musicNext[track] % list.length;
    this.musicNext[track] = k + 1;
    this.musicPlay(list[k]);
  }
  // the final round: the stage's angrier track takes over (and plays on until the fight ends)
  finalRound() {
    const fin = FINAL[this.musicTrack];
    if (!fin || this.musicFinal || !this.ctx || !this.musicOn) return;
    this.musicFinal = true;
    this.musicPlay(fin, 0.8);
  }
  // one file into the element: the playing one fades out first
  musicPlay(src, out = 0.5) {
    const el = this.musicElement();
    clearTimeout(this.musicSwap);
    const start = () => {
      el.src = src; this.musicKey = src.split('/').pop().replace('.mp3', '');
      el.play()?.catch?.(() => { /* blocked until a touch: init() starts it again */ });
      this.musicFade(1, 1.2);
    };
    if (!el.paused) { this.musicFade(0, out); this.musicSwap = setTimeout(start, out * 1000 + 50); } else start();
  }
  // a track that ends (they all end on a short fade of their own) gives way to the next of its stage; the menus, the
  // training and the final round play theirs again
  musicEnded() {
    const el = this.musicEl, list = MUSIC[this.musicTrack];
    if (!el || !this.musicTrack) return;
    if (this.musicFinal || !list || list.length < 2) { el.currentTime = 0; el.play()?.catch?.(() => {}); return; }
    const k = this.musicNext[this.musicTrack] % list.length;
    this.musicNext[this.musicTrack] = k + 1;
    el.src = list[k]; this.musicKey = list[k].split('/').pop().replace('.mp3', '');
    el.play()?.catch?.(() => {});
    this.musicFade(1, 0.6);
  }
  // the music's beat: beats since the playing track's first one, as heard (the output's delay taken off), for the
  // stage's lights and dancers; null when nothing plays
  musicBeat() {
    const el = this.musicEl, b = BEATS[this.musicKey];
    if (!el || el.paused || !b || !this.ctx) return null;
    const late = (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0.03);
    return (el.currentTime - late - b[1]) * b[0] / 60;
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
    el.loop = false; el.preload = 'auto';
    el.addEventListener('ended', () => this.musicEnded());
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
