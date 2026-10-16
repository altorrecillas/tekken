// Two rollback sessions (js/net/rollback.js), each with its own match, joined by a fake network: latency, jitter,
// packets lost and arriving out of order on the fast channel, the reliable one late but in order, and each "phone"
// drawing at its own uneven frame rate. Both play a whole match with recorded inputs; checked:
//  - both agree on every state check and none was ever corrected (no desync);
//  - the fight both played is exactly the one the inputs give offline (same hashes as a reference match);
//  - a desync forced on purpose (the guest's state nudged) is spotted and fixed by the host's state;
//  - how much was predicted, rewound and waited for.
// Imported by netsim.mjs (node --import ./register.mjs netsim.mjs --only session).
const GAME = process.env.GAME_ROOT || decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const { RollbackSession, FxGate, CHECK_EVERY } = await import(GAME + '/js/net/rollback.js');
const { AIController } = await import(GAME + '/js/fight/ai.js');
const { Snap, saveMatch, hashSnap } = await import(GAME + '/js/net/simstate.js');

// a link with latency (ms), jitter (ms), loss (fast channel) on a simulated clock
function link(clock, rnd, { lat, jit, loss }) {
  const q = [];
  let relT = 0;
  return {
    q,
    fast(buf, to) { if (rnd() < loss) return; q.push({ at: clock.t + lat + rnd() * jit, to, fast: true, data: buf.slice(0) }); },
    rel(msg, to) { relT = Math.max(relT, clock.t + lat + rnd() * jit); q.push({ at: relT, to, fast: false, data: JSON.parse(JSON.stringify(msg)) }); },
    deliver() {
      q.sort((a, b) => a.at - b.at);
      while (q.length && q[0].at <= clock.t) { const m = q.shift(); if (m.fast) m.to.receive(m.data); else m.to.receiveRel(m.data); }
    },
  };
}

export async function sessionTest({ makeMatch, check, rnd }) {
  let failures = 0;
  const ok = (c, what) => { check(c, what); if (!c) failures++; };
  const ids = ['dani', 'zapponi'];
  // the inputs: two CPU players recorded on an offline match (the same as netsim's recording)
  const REC = 7000;
  const R = makeMatch(ids);
  const ais = [new AIController(5), new AIController(5)];
  const rec = [];
  R.fighters.forEach((f, i) => { ais[i].attach(f, R); f.ctrl = { poll: () => { const v = ais[i].poll(); (rec[R.frame - 1] || (rec[R.frame - 1] = []))[i] = { ...v }; return v; } }; });
  R.startIntro();
  for (let i = 0; i < REC; i++) R.step();

  const scenarios = [
    { name: 'good WiFi', lat: 6, jit: 6, loss: 0.01, delay: 2, fpsA: 60, fpsB: 60 },
    { name: 'busy WiFi', lat: 25, jit: 40, loss: 0.08, delay: 2, fpsA: 60, fpsB: 45 },
    { name: 'no delay, slow phone', lat: 10, jit: 15, loss: 0.03, delay: 0, fpsA: 60, fpsB: 30 },
    { name: 'bad network', lat: 70, jit: 90, loss: 0.2, delay: 3, fpsA: 50, fpsB: 60 },
    { name: 'forced desync', lat: 8, jit: 8, loss: 0.02, delay: 2, fpsA: 60, fpsB: 60, corrupt: 1500 },
    // a phone that gets stuck now and then (a garbage collection, a first texture: 150-450 ms), on a good WiFi; the
    // game used to hand the session at most 0.1 s per refresh, so the frames lost in a hiccup were never caught up
    // and the other phone had to wait for them ('esperando a...' with a ping of 30 ms)
    { name: 'phone hiccups, as before', lat: 15, jit: 10, loss: 0.01, delay: 2, fpsA: 60, fpsB: 60, hitch: [0.006, 150, 450], cap: 0.1, maxPredict: 8 },
    { name: 'phone hiccups, window 12', lat: 15, jit: 10, loss: 0.01, delay: 2, fpsA: 60, fpsB: 60, hitch: [0.006, 150, 450], cap: 0.5, maxPredict: 12 },
    { name: 'phone hiccups', lat: 15, jit: 10, loss: 0.01, delay: 2, fpsA: 60, fpsB: 60, hitch: [0.006, 150, 450], cap: 0.5 },
  ];
  for (const sc of scenarios) {
    // the inputs each phone reads: its player's recorded input for the frame it is reading for
    const D = sc.delay;
    const clock = { t: 0 };
    const net = link(clock, rnd, sc);
    // (neutral before the delay: nothing has been read for those frames yet)
    const input = (f, i) => (f < D ? { dx: 0, dy: 0, held: 0, pressed: 0 } : rec[f]?.[i] || { dx: 0, dy: 0, held: 0, pressed: 0 });

    const phones = [0, 1].map((local) => {
      const m = makeMatch(ids);
      m.startIntro();
      const gate = new FxGate();
      const P = { m, local, gate, t: 0, last: 0, fps: local ? sc.fpsB : sc.fpsA, ended: false };
      P.s = new RollbackSession({
        match: m, local, delay: D, host: local === 0, gate, maxPredict: sc.maxPredict,
        poll: () => input(P.s.linMax, local),
        send: (buf) => net.fast(buf, phones[1 - local].s),
        sendRel: (msg) => net.rel(msg, phones[1 - local].s),
        rtt: () => sc.lat * 2 + sc.jit,
      });
      m.game.onMatchEnd = () => P.s.matchEnded();
      return P;
    });
    // run: each phone refreshes at its own uneven rate, the network delivers in between
    let corrupted = false, maxAhead = 0, maxGap = 0, longWaits = 0, oldNotices = 0;
    const oldT = [0, 0]; // (the notice's old rule: any refresh that hit the limit counted as waiting, 0.4 s showed it)
    const tEnd = (REC / 60) * 1000 * 1.6;
    while (clock.t < tEnd && !phones.every((p) => p.s.frame >= REC - 20)) {
      clock.t += 1;
      net.deliver();
      for (const p of phones) {
        if (clock.t < p.t) continue;
        // the time since this phone's last refresh (the game hands the session up to `cap` seconds of it), then
        // when the next one comes: a frame of its rate, now and then (guest) a hiccup
        const elapsed = clock.t - p.last;
        p.last = clock.t;
        let next = (1000 / p.fps) * (0.75 + rnd() * 0.5);
        if (sc.hitch && p.local === 1 && rnd() < sc.hitch[0]) next += sc.hitch[1] + rnd() * (sc.hitch[2] - sc.hitch[1]);
        p.t = clock.t + next;
        if (p.s.frame >= REC - 20) continue;
        const w0 = p.s.stallT;
        p.s.update(Math.min(sc.cap || 0.5, elapsed / 1000));
        if (w0 <= 1 && p.s.stallT > 1) longWaits++; // (the 'waiting for the other phone' notice would show)
        const o0 = oldT[p.local];
        oldT[p.local] = p.s.waited ? o0 + Math.min(sc.cap || 0.5, elapsed / 1000) : 0;
        if (o0 <= 0.4 && oldT[p.local] > 0.4) oldNotices++;
        p.gate.flush();
        maxAhead = Math.max(maxAhead, p.s.ahead);
      }
      maxGap = Math.max(maxGap, Math.abs(phones[0].s.frame - phones[1].s.frame));
      if (sc.corrupt && !corrupted && phones[1].s.frame > sc.corrupt) { phones[1].m.fighters[0].hp -= 7; phones[1].m.fighters[1].pos.x += 0.05; corrupted = true; }
    }
    const [A, B] = phones.map((p) => p.s);
    // the last checkpoint both have: same hash, and the reference's
    const lastCk = Math.floor(Math.min(A.checked, B.checked) / CHECK_EVERY) * CHECK_EVERY;
    const hA = A.finalHash.get(lastCk), hB = B.finalHash.get(lastCk);
    const st = (s) => `${s.stats.rollbacks} rewinds (avg ${(s.stats.rolled / Math.max(1, s.stats.rollbacks)).toFixed(1)}, max ${s.stats.maxRoll}), ${s.stats.stalls} waits ${Math.round(s.stats.stallMs)} ms`;
    console.log(`  [${sc.name}] lat ${sc.lat}±${sc.jit} ms, loss ${sc.loss * 100}%, delay ${D}, ${sc.fpsA}/${sc.fpsB} fps: frames ${A.frame}/${B.frame}, ${A.stats.checks} checks; host ${st(A)}; guest ${st(B)}; max ${maxAhead} predicted, max ${maxGap} apart; notices: ${longWaits} (with the old rule ${oldNotices})`);
    if (sc.hitch && sc.cap >= 0.5 && !sc.maxPredict) {
      ok(longWaits === 0, `[${sc.name}] no 'waiting for the other phone' notice (a freeze of over a second)`);
      ok(A.stats.stallMs < 2500, `[${sc.name}] the other phone stands still ${Math.round(A.stats.stallMs)} ms in two minutes (6.4 s before the catch-up and the wider window)`);
    }
    if (sc.corrupt) {
      ok(B.stats.desyncs >= 1 && B.stats.resyncs >= 1, `[${sc.name}] the nudged guest is spotted (${B.stats.desyncs}) and takes the host's state (${B.stats.resyncs})`);
      ok(hA !== undefined && hA === hB, `[${sc.name}] both agree again afterwards (checkpoint ${lastCk})`);
    } else {
      ok(A.stats.desyncs === 0 && B.stats.desyncs === 0, `[${sc.name}] no disagreement in ${A.stats.checks} checks`);
      ok(hA !== undefined && hA === hB, `[${sc.name}] both end on the same state (checkpoint ${lastCk})`);
      // the offline fight those inputs give, at the same checkpoint
      const rr = makeMatch(ids);
      rr.fighters.forEach((f, i) => { f.ctrl = { poll: () => input(rr.frame - 1, i) }; });
      rr.startIntro();
      for (let i = 0; i < lastCk; i++) rr.step();
      ok(hashSnap(rr, saveMatch(rr, new Snap())) === hA, `[${sc.name}] and it is the fight the inputs give offline`);
    }
  }
  return failures;
}
