// Audio engine: recorded impacts, swishes and footsteps (with synthesized layers for weight), recorded voices
// (announcer, shouts, lines), recorded music and crowd.

// announcer lines (the clip files in assets/voice/ say the same; the text is the speech-synthesis fallback)
const ANN_TEXT = {
  round1: 'Ronda uno', round2: 'Ronda dos', round3: 'Ronda tres', round4: 'Ronda cuatro', round5: 'Ronda cinco',
  final: '¡Ronda final!', fight: '¡A luchar!', ko: 'K.O.', time: '¡Tiempo!', perfect: '¡Perfecto!', draw: '¡Empate!',
  win_alejandro: '¡Gana Alejandro!', win_arnau: '¡Gana Arnau!', win_camilo: '¡Gana Camilo!', win_rafa: '¡Gana Rafa!', win_zapponi: '¡Gana Zaponi!',
  win_dani: '¡Gana Dani!', win_noemi: '¡Gana Noemí!',
};

// background music: Kevin MacLeod (incompetech.com), CC BY 4.0 (see README; made by tools/music_build.py). Each stage
// has a style of its own and several tracks that follow each other (a new fight starts on the next one), and an
// angrier track for the final round: El Porche urban funk and hip hop, the rooftop Latin disco and salsa, the 10K
// finish line rock, the festival club and dance
const M = (n) => `assets/music/${n}.mp3`;
const MUSIC = {
  menu: [M('menu')], training: [M('training')], ending: [M('ending')],
  porche: [M('porche_a'), M('porche_b'), M('porche_c')],
  terrace: [M('terrace_a'), M('terrace_b'), M('terrace_c')],
  street: [M('street_a'), M('street_b'), M('street_c')],
  festival: [M('festival_a'), M('festival_b'), M('festival_c'), M('festival_d')],
};
const FINAL = { porche: M('porche_final'), terrace: M('terrace_final'), street: M('street_final'), festival: M('festival_final') };
// each track's tempo and first beat (s), measured by tools/music_build.py: the festival's lights and dancers keep time
const BEATS = { menu: [122, 0.441], training: [101, 0.546], ending: [110, 0.499], porche_a: [95, 0.61], porche_b: [121.32, 0.203], porche_c: [120, 0.128], porche_final: [116, 0.476], terrace_a: [117, 0.464], terrace_b: [100, 0.418], terrace_c: [115, 0.464], terrace_final: [117.82, 0.476], street_a: [124, 0.337], street_b: [85, 0.308], street_c: [128, 0.238], street_final: [104.5, 0.255], festival_a: [94, 0.43], festival_b: [88, 0.284], festival_c: [117, 0.464], festival_d: [140, 0.819], festival_final: [106.98, 0.505] };

// each stage's background loop (see ambience) and its level under the music; a crowd cheers on a knockout
const AMBIENCE = {
  street: { file: 'assets/sfx/crowd_loop.mp3', gain: 0.35, crowd: true },
  festival: { file: 'assets/sfx/crowd_loop.mp3', gain: 0.2, crowd: true },
  porche: { file: 'assets/sfx/amb_porche.mp3', gain: 0.32 },
  terrace: { file: 'assets/sfx/amb_terrace.mp3', gain: 0.3 },
};
// each stage's acoustics (setSpace): reverb tail length (s), how bright it stays (1 = like the dry sound), how much
// of a blow goes in, and the early reflections [ms, level] of what stands around
const SPACES = {
  porche: { tail: 1.1, bright: 0.85, send: 0.26, early: [[11, 0.5], [23, 0.35], [37, 0.3], [58, 0.22], [81, 0.15]] },
  terrace: { tail: 0.55, bright: 0.7, send: 0.12, early: [[9, 0.3], [27, 0.12]] },
  street: { tail: 1.35, bright: 0.75, send: 0.2, early: [[18, 0.25], [64, 0.2], [128, 0.32], [170, 0.12]] },
  festival: { tail: 1.6, bright: 0.5, send: 0.23, early: [[26, 0.3], [44, 0.22], [95, 0.14]] },
};

// fighters' shouts: recorded voices (assets/voice/fx, see voices.json) and a pitch per fighter
const FIGHTER_VOICE = { alejandro: ['vb', 1.0], arnau: ['h1', 1.05], camilo: ['h0', 1.0], rafa: ['h2', 0.93], zapponi: ['h3', 0.87],
  dani: ['vb', 0.9], noemi: ['f1', 0.97] };

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
