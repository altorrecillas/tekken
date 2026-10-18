// DOM heads-up display for fights.
const $ = (s, r = document) => r.querySelector(s);

export class HUD {
  constructor(portraits) {
    this.root = $('#hud');
    this.portraits = portraits || {};
    this.w = [$('.hpwrap.p1'), $('.hpwrap.p2')];
    this.fill = this.w.map(w => $('.fill', w));
    this.trail = this.w.map(w => $('.trail', w));
    this.name = this.w.map(w => $('.plate .nm', w));
    this.wins = this.w.map(w => [...w.querySelectorAll('.wins i')]);
    this.timer = $('#timer');
    this.combos = [$('.combo.c1'), $('.combo.c2')];
    this.ann = $('#announce');
    this.intro = $('#introNames');
    this.stageEl = $('#stageName');
    this.winnerEl = $('#winner');
    this.hint = $('.movelist-hint');
    this.training = $('#trainingInfo');
    this.comboT = [0, 0];
    this.lastHp = [1, 1];
  }
  show(on = true) { this.root.classList.toggle('on', on); }
  // victory pose: the bars and timer leave the frame to the winner (restored by the next round's intro)
  hideBars() {
    for (const w of this.w) w.style.visibility = 'hidden';
    this.timer.style.visibility = 'hidden';
  }
  hideAll() {
    this.show(true);
    for (const w of this.w) w.style.visibility = 'hidden';
    this.timer.style.visibility = 'hidden';
    this.winnerEl.classList.remove('show');
  }
  // the win markers under each name: one per round needed to win the match (online the host picks 1 to 3)
  setRounds(n) {
    this.w.forEach((w, i) => {
      const box = $('.plate .wins', w);
      if (box.children.length !== n) box.innerHTML = '<i></i>'.repeat(n);
      this.wins[i] = [...box.querySelectorAll('i')];
    });
  }
  setFighters(fighters) {
    fighters.forEach((f, i) => {
      this.name[i].textContent = f.ch.meta.display;
      const p = $('.portrait', this.w[i]);
      if (this.portraits[f.id]) p.style.backgroundImage = `url(${this.portraits[f.id]})`;
    });
  }
  introNames(fighters, i) {
    const f = fighters[i];
    this.intro.innerHTML = `<div class="nm" style="${i ? 'margin-left:auto;margin-right:6%;text-align:right' : ''}">${f.ch.meta.display}</div><div class="ttl" style="${i ? 'text-align:right;margin-right:6.3%' : ''}">${f.style.title.toUpperCase()}</div>`;
    this.intro.classList.remove('show'); void this.intro.offsetWidth; this.intro.classList.add('show');
    if (i === 0 && this.stageName && this.stageEl) { this.stageEl.innerHTML = this.stageName; this.stageEl.classList.add('show'); }
  }
  // the line a fighter says in the presentation, under his name and title (Match.startIntro)
  introLine(i, text) {
    if (this.subtitles === false) return;
    const el = document.createElement('div');
    el.className = 'ln';
    if (i) el.style.cssText = 'margin-left:auto;margin-right:6.3%;text-align:right';
    el.textContent = `“${text}”`;
    this.intro.appendChild(el);
    void el.offsetWidth; el.classList.add('on');
  }
  roundStart(round, wins, fighters) {
    this.show(true);
    this.intro.classList.remove('show');
    this.stageEl?.classList.remove('show');
    this.winnerEl.classList.remove('show');
    for (const w of this.w) w.style.visibility = 'visible';
    this.timer.style.visibility = 'visible';
    this.setFighters(fighters);
    this.wins.forEach((arr, i) => arr.forEach((el, k) => el.classList.toggle('on', k < wins[i])));
    this.fill.forEach(f => (f.style.transform = 'scaleX(1)'));
    this.trail.forEach(f => { f.style.transition = 'none'; f.style.transform = 'scaleX(1)'; void f.offsetWidth; f.style.transition = ''; });
    this.lastHp = [1, 1];
  }
  announce(text, cls = '') {
    const a = this.ann;
    a.className = '';
    a.textContent = text;
    void a.offsetWidth;
    a.className = 'show ' + cls;
  }
  popup(side, text, cls = 'ch') {
    const el = document.createElement('div');
    el.className = `popup ${side ? 'r' : 'l'} ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
  combo(side, hits, dmg) {
    const c = this.combos[side];
    c.querySelector('.hits').textContent = hits > 1 ? `${hits} GOLPES` : '';
    c.querySelector('.dmg').textContent = `${dmg} DAÑO`;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    this.comboT[side] = 100;
  }
  // pick (0..1): which of his lines the winner says (online both phones pass the same, so both show the same)
  winner(f, wins) {
    this.winnerEl.innerHTML = `<div class="sub">GANADOR</div><div class="nm">${f.ch.meta.display}</div><div class="quote"></div>`;
    this.winnerEl.classList.add('show');
    this.wins.forEach((arr, i) => arr.forEach((el, k) => el.classList.toggle('on', k < wins[i])));
  }
  // the winner's line, when he says it (Match: on its frame of the win pose)
  // (subtitles: OPCIONES -> Subtítulos)
  say(f) {
    const q = this.winnerEl.querySelector('.quote');
    if (!q || !f.style.say || this.subtitles === false) return;
    q.textContent = `“${f.style.say}”`;
    q.classList.add('on');
  }
  update(match) {
    match.fighters.forEach((f, i) => {
      const r = Math.max(0, f.hp / f.maxHp);
      this.fill[i].style.transform = `scaleX(${r})`;
      this.fill[i].classList.toggle('low', r < 0.25);
      this.w[i].classList.toggle('rage', !!(f.rage && !f.ko));
      if (r < this.lastHp[i]) this.trail[i].style.transform = `scaleX(${r})`;
      if (r > this.lastHp[i]) this.trail[i].style.transform = `scaleX(${r})`;
      this.lastHp[i] = r;
    });
    const t = Math.max(0, match.timer);
    this.timer.textContent = match.training ? '∞' : t;
    this.timer.classList.toggle('low', t <= 10 && !match.training);
    for (let i = 0; i < 2; i++) if (this.comboT[i] > 0 && --this.comboT[i] === 0) this.combos[i].classList.remove('show');
    if (match.training) {
      const [a, b] = match.fighters;
      const e = match.lastEvent;
      this.training.innerHTML = `<b>ENTRENAMIENTO</b><br>Estado CPU: ${b.state}<br>${e ? e : ''}`;
    }
  }
}
