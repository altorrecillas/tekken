// What a player has done on this device: achievements (LOGROS), the arcade endings unlocked (FINALES), the
// champion's costumes and the big-head mode (CABEZONES) unlocked by winning the arcade, and the running totals some
// achievements count. Kept in localStorage; a toast announces every achievement as it is unlocked.
const KEY = 'pdb_progress';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// count(p, g) -> [done, needed] for the ones that show progress
export const ACHIEVEMENTS = [
  { id: 'firstWin', name: 'PRIMERA VICTORIA', desc: 'Gana tu primer combate.' },
  { id: 'arcade', name: 'CAMPEÓN DEL BARRIO', desc: 'Gana el modo arcade.' },
  { id: 'arcadeHard', name: 'LEYENDA DEL BARRIO', desc: 'Gana el modo arcade en dificultad DIFÍCIL.' },
  { id: 'allChamps', name: 'TODOS CAMPEONES', desc: 'Gana el modo arcade con todos los luchadores.', count: (p, g) => [g.roster.filter((id) => p.champ[id]).length, g.roster.length] },
  { id: 'perfect', name: '¡PERFECTO!', desc: 'Gana una ronda sin recibir ni un golpe.' },
  { id: 'combo5', name: 'COMBO DE 5', desc: 'Encadena un combo de 5 golpes.' },
  { id: 'combo7', name: 'COMBO DE 7', desc: 'Encadena un combo de 7 golpes.' },
  { id: 'rageKO', name: 'FURIA DESATADA', desc: 'Remata una ronda con un Rage Art.' },
  { id: 'counterKO', name: 'A CONTRAPIÉ', desc: 'Remata una ronda con un contraataque.' },
  { id: 'throwKO', name: 'AL SUELO', desc: 'Remata una ronda con un agarre.' },
  { id: 'comeback', name: 'REMONTADA', desc: 'Gana una ronda con un 10 % de vida o menos.' },
  { id: 'timeout', name: 'AL LÍMITE', desc: 'Gana una ronda por tiempo.' },
  { id: 'hits500', name: 'MANO DURA', desc: 'Conecta 500 golpes en total.', count: (p) => [Math.min(500, p.n.hits), 500] },
  { id: 'kos50', name: 'NOQUEADOR', desc: 'Gana 50 rondas por K.O.', count: (p) => [Math.min(50, p.n.kos), 50] },
  { id: 'tourist', name: 'DE GIRA POR EL BARRIO', desc: 'Pelea en todos los escenarios.', count: (p, g) => [g.stageKeys.filter((k) => p.stages[k]).length, g.stageKeys.length] },
  { id: 'versus', name: 'DOS EN EL SOFÁ', desc: 'Juega un combate VERSUS de dos jugadores en la misma pantalla.' },
  { id: 'online', name: 'CONECTADOS', desc: 'Gana un combate ONLINE.' },
  { id: 'student', name: 'ALUMNO APLICADO', desc: 'Completa todas las pruebas de combo de un luchador.' },
  { id: 'master', name: 'MAESTRO DEL BARRIO', desc: 'Completa todas las pruebas de combo de todos los luchadores.', count: (p, g) => [g.roster.filter((id) => p.trialsDone[id]).length, g.roster.length] },
  { id: 'cinema', name: 'MODO CINE', desc: 'Mira 5 jugadas del combate.', count: (p) => [Math.min(5, p.n.highlights), 5] },
  { id: 'endings', name: 'FINAL FELIZ', desc: 'Desbloquea el final de todos los luchadores.', count: (p, g) => [g.roster.filter((id) => p.endings[id]).length, g.roster.length] },
];

function fresh() {
  return { v: 1, ach: {}, champ: {}, endings: {}, stages: {}, trials: {}, trialsDone: {}, bigHeadUnlocked: false, bigHead: false,
    n: { hits: 0, kos: 0, wins: 0, fights: 0, highlights: 0 } };
}

export class Progress {
  // g: { roster, stageKeys } (what the totals are counted against)
  constructor(g) {
    this.g = g;
    let d = null;
    try { d = JSON.parse(lsGet(KEY) || 'null'); } catch (e) { d = null; }
    const f = fresh();
    this.d = d && typeof d === 'object' ? { ...f, ...d, n: { ...f.n, ...(d.n || {}) } } : f;
    this.queue = [];
    this.el = document.getElementById('achToast');
  }
  get champ() { return this.d.champ; }
  save() { lsSet(KEY, JSON.stringify(this.d)); }
  has(id) { return !!this.d.ach[id]; }
  unlock(id) {
    if (this.d.ach[id]) return false;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return false;
    this.d.ach[id] = Date.now();
    this.save();
    this.toast(`<span>🏆 LOGRO DESBLOQUEADO</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>`);
    return true;
  }
  // the achievements that count something, checked against their totals
  checkCounts() {
    for (const a of ACHIEVEMENTS) if (a.count && !this.has(a.id)) { const [n, need] = a.count(this.d, this.g); if (n >= need) this.unlock(a.id); }
  }

  // a fight over: what the player did in it. i: the player's fighter (-1: nobody's, a CPU demo), mode: arcade,
  // versus, online, stage: its key
  noteMatch(m, i, mode, stage) {
    const d = this.d;
    if (stage) d.stages[stage] = true;
    if (mode === 'versus') this.unlock('versus');
    if (i === 0 || i === 1) {
      const S = m.stats[i];
      d.n.fights++;
      d.n.hits += S.hits; d.n.kos += S.kos;
      if (m.winner === i) {
        d.n.wins++;
        this.unlock('firstWin');
        if (mode === 'online') this.unlock('online');
      }
      if (S.perfects > 0) this.unlock('perfect');
      if (S.combo >= 5) this.unlock('combo5');
      if (S.combo >= 7) this.unlock('combo7');
      if (S.rageKOs > 0) this.unlock('rageKO');
      if (S.chKOs > 0) this.unlock('counterKO');
      if (S.throwKOs > 0) this.unlock('throwKO');
      if (S.comebacks > 0) this.unlock('comeback');
      if (S.timeWins > 0) this.unlock('timeout');
    }
    this.checkCounts();
    this.save();
  }
  // the arcade won with fighter id: his ending and champion's costume, the big heads
  noteArcade(id, diff) {
    const d = this.d, firstTime = !d.champ[id];
    d.champ[id] = true; d.endings[id] = true;
    const firstHeads = !d.bigHeadUnlocked;
    d.bigHeadUnlocked = true;
    this.unlock('arcade');
    if (diff === 'hard') this.unlock('arcadeHard');
    this.checkCounts();
    this.save();
    return { costume: firstTime, heads: firstHeads };
  }
  noteHighlight() { this.d.n.highlights++; this.checkCounts(); this.save(); }
  // combo trials: done[k] for each trial of fighter id
  noteTrials(id, done) {
    const d = this.d;
    d.trials[id] = done.slice();
    if (done.length && done.every(Boolean)) { d.trialsDone[id] = true; this.unlock('student'); }
    this.checkCounts();
    this.save();
  }
  setBigHead(on) { this.d.bigHead = !!on && this.d.bigHeadUnlocked; this.save(); }

  // ------------------------------------------------------------------ the toast
  toast(html) {
    this.queue.push(html);
    if (!this.busy) this.next();
  }
  next() {
    const el = this.el || (this.el = document.getElementById('achToast'));
    const html = this.queue.shift();
    if (!el || !html) { this.busy = false; return; }
    this.busy = true;
    el.innerHTML = html;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => this.next(), 450); }, 3600);
  }

  // ------------------------------------------------------------------ the LOGROS screen
  listHTML() {
    const d = this.d;
    const got = ACHIEVEMENTS.filter((a) => d.ach[a.id]).length;
    const cards = ACHIEVEMENTS.map((a) => {
      const on = !!d.ach[a.id];
      let prog = '';
      if (!on && a.count) { const [n, need] = a.count(d, this.g); prog = `<i class="bar"><em style="width:${Math.round(100 * Math.min(1, n / need))}%"></em></i><small>${n} / ${need}</small>`; }
      const when = on ? `<small>${new Date(d.ach[a.id]).toLocaleDateString('es-ES')}</small>` : '';
      return `<div class="ach ${on ? 'on' : ''}"><b>${on ? '🏆' : '🔒'} ${esc(a.name)}</b><span>${esc(a.desc)}</span>${prog}${when}</div>`;
    }).join('');
    return `<h3>LOGROS <small>${got} / ${ACHIEVEMENTS.length}</small></h3><div class="achs">${cards}</div>`;
  }
}
