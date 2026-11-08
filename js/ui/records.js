// The challenge modes' records, kept on the device (localStorage 'pdb_records'): SUPERVIVENCIA (most fights won in a
// row, the health carried from one fight to the next) and CONTRARRELOJ (all the rivals beaten in the shortest fight
// time). The best ten of each, with the fighter, the difficulty and the day.
const KEY = 'pdb_records', KEEP = 10;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// fight frames (60 a second) as 1:23.45
export const clock = (frames) => {
  const cs = Math.round(frames / 60 * 100), m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60;
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

export class Records {
  constructor() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* private mode, or broken: start again */ }
    this.d = { survival: Array.isArray(d?.survival) ? d.survival : [], timeattack: Array.isArray(d?.timeattack) ? d.timeattack : [] };
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { /* private mode */ } }
  // survival: n fights won (ties: more health left); time attack: total fight frames. Returns its place (0 = the
  // new best) or -1 when it does not make the table
  add(kind, e) {
    const L = this.d[kind];
    const better = kind === 'survival' ? (a, b) => b.n - a.n || (b.hp || 0) - (a.hp || 0) : (a, b) => a.frames - b.frames;
    const row = { ...e, t: Date.now() };
    L.push(row); L.sort(better);
    const at = L.indexOf(row);
    L.length = Math.min(L.length, KEEP);
    this.save();
    return at < KEEP ? at : -1;
  }
  best(kind) { return this.d[kind][0] || null; }
  count() { return this.d.survival.length + this.d.timeattack.length; }

  // both tables, side by side (one under the other on a narrow screen). meta: the fighters' names, diffName: a
  // difficulty key's label, mark: { kind, at } a row to light up (the one just set)
  html(meta, diffName, mark = null) {
    const day = (t) => { const d = new Date(t); return `${d.getDate()}/${d.getMonth() + 1}`; };
    const table = (kind, title, val, empty) => {
      const L = this.d[kind];
      const rows = L.map((r, i) => `<tr class="${mark && mark.kind === kind && mark.at === i ? 'new' : ''}"><td class="pos">${i + 1}</td><td class="who">${esc(meta[r.id]?.display || r.id)}</td><td class="val">${val(r)}</td><td class="dif">${esc(diffName(r.diff))}</td><td class="day">${day(r.t)}</td></tr>`).join('');
      return `<div class="rec"><h4>${title}</h4>${L.length ? `<table>${rows}</table>` : `<p class="none">${empty}</p>`}</div>`;
    };
    return `<div class="records">${table('survival', 'SUPERVIVENCIA', (r) => `${r.n} <small>${r.n === 1 ? 'combate' : 'combates'}</small>`, 'Aún no hay marcas: aguanta todos los combates que puedas.')}`
      + `${table('timeattack', 'CONTRARRELOJ', (r) => clock(r.frames), 'Aún no hay marcas: vence a todos lo más rápido posible.')}</div>`;
  }
}
