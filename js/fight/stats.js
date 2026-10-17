// The tallies of a match (shown on the results screen) and its best play (JUGADA DEL COMBATE, replayed in slow
// motion). They are kept by the match as part of the simulation (js/fight/match.js), so they come out the same on
// both phones online and a frame replayed by the rollback cannot count anything twice (js/net/simstate.js saves
// them with the rest of the state).

// per fighter
export const STAT_KEYS = ['hits', 'dmg', 'combo', 'comboDmg', 'counters', 'launches', 'throws', 'escapes', 'blocks', 'rageArts', 'kos', 'perfects',
  // how the rounds were won (achievements, js/ui/progress.js): knockouts by a counter hit, a Rage Art or a throw, rounds won
  // on 10% of health or less, rounds won on time
  'chKOs', 'rageKOs', 'throwKOs', 'comebacks', 'timeWins'];
// a play in progress (one per attacker: from the first blow of a combo, a throw or a Rage Art until the victim is
// back on his feet) and the best one of the match
export const PLAY_KEYS = ['on', 'f0', 'f1', 'hits', 'dmg', 'flags', 'round'];
export const BEST_KEYS = ['score', 'att', 'f0', 'f1', 'hits', 'dmg', 'flags', 'round', 'seq'];
// what a play had in it
export const PF = { CH: 1, LAUNCH: 2, KO: 4, RAGE: 8, THROW: 16, PERFECT: 32, FINAL: 64 };

export const newStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
export const newPlay = () => Object.fromEntries(PLAY_KEYS.map((k) => [k, 0]));
export const newBest = () => ({ ...Object.fromEntries(BEST_KEYS.map((k) => [k, 0])), att: -1 });

// how spectacular a play was: its damage, its length (long combos count extra), and what it had in it
export function playScore(P) {
  const f = P.flags;
  return P.dmg + P.hits * 5 + Math.max(0, P.hits - 3) * 6 + (f & PF.CH ? 10 : 0) + (f & PF.LAUNCH ? 12 : 0) + (f & PF.RAGE ? 25 : 0)
    + (f & PF.THROW ? 8 : 0) + (f & PF.KO ? 30 : 0) + (f & PF.FINAL ? 25 : 0) + (f & PF.PERFECT ? 20 : 0);
}
// worth replaying: a real combo, a knockout, a throw or a Rage Art (not a lone jab)
export const playWorthShowing = (b) => b && b.att >= 0 && (b.hits >= 3 || (b.flags & (PF.KO | PF.RAGE | PF.THROW | PF.LAUNCH)) !== 0) && b.score >= 40;

// the play in words, for the results screen and the banner over the replay
export function playLabel(b) {
  const f = b.flags, parts = [];
  if (f & PF.RAGE) parts.push('RAGE ART');
  else if (f & PF.THROW && b.hits <= 1) parts.push('AGARRE');
  else if (b.hits >= 2) parts.push(`COMBO DE ${b.hits} GOLPES`);
  else parts.push(f & PF.CH ? 'CONTRAATAQUE' : 'GOLPE');
  if (f & PF.LAUNCH && !(f & PF.RAGE)) parts.push('CON LANZAMIENTO');
  if (f & PF.CH && b.hits >= 2) parts.push('CON CONTRAATAQUE');
  let tail = `${b.dmg} DE DAÑO`;
  if (f & PF.FINAL) tail += ' · K.O. FINAL'; else if (f & PF.KO) tail += ' · K.O.';
  if (f & PF.PERFECT) tail += ' · ¡PERFECTO!';
  return `${parts.join(' ')} · ${tail}`;
}

// the rows of the results table: label, value of a fighter's tallies
export const STAT_ROWS = [
  ['GOLPES', (s) => s.hits],
  ['DAÑO', (s) => s.dmg],
  ['MEJOR COMBO', (s) => (s.combo >= 2 ? `${s.combo} <small>(${s.comboDmg})</small>` : '—')],
  ['CONTRAATAQUES', (s) => s.counters],
  ['LANZAMIENTOS', (s) => s.launches],
  ['AGARRES', (s) => s.throws],
  ['BLOQUEOS', (s) => s.blocks],
  ['RAGE ARTS', (s) => s.rageArts],
];
