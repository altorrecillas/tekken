// The connections of a game on several phones: player 1's phone is the host and the
// others (up to MAX_PLAYERS - 1) join it. Pairing: a room code through the PeerJS cloud
// (which the phones on the same WiFi also find by themselves: lan.js), or QR codes with
// no internet at all (a pair of codes per phone that joins). A hello checks that every
// phone runs the same version, a ping every second watches each link, a phone whose link
// drops can take its seat back, and a goodbye is said before leaving. What the game
// sends is up to it: send() for messages that must arrive, in order (JSON), sendFast()
// for its state many times a second (binary; a lost packet is never sent again, the
// next one replaces it).
// From Super Off Road v0.71 (js/net/netplay.js), without its race.

import { CloudSignal, ROOM_PREFIX } from './signal.js';
import { Link, ICE_ONLINE } from './link.js';
import { packSDP, unpackSDP } from './sdp.js';
import { lanKey, LanBeacon } from './lan.js';
import { APP_ID, VERSION, MAX_PLAYERS } from './config.js';

export const NET_PROTO = 1;
const params = new URLSearchParams(location.search);
const sigURL = () => params.get('sig') || undefined; // tests: a local stand-in for the cloud server
const rid = () => Math.random().toString(36).slice(2, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A timeout that counts only the time this page is alive: a phone frozen for a few
// seconds (building a level, compiling shaders, busy) does not run the clock down while
// it cannot even read the answer that has already arrived
function liveTimeout(ms, fn) {
  let live = 0, last = performance.now();
  const iv = setInterval(() => {
    const now = performance.now();
    live += Math.min(now - last, 1000);
    last = now;
    if (live >= ms) { clearInterval(iv); fn(); }
  }, 250);
  return iv;
}

// One link to another phone (a guest has one, to the host; the host one per guest)
class Peer {
  constructor(net, offerer, ice) {
    this.net = net;
    this.player = null;      // the player on the other phone (known after the hello)
    this.open = false;       // connected and greeted
    this.rtt = 0; this.pongs = 0;
    this.rtts = [];          // the last round trips (for rttLow)
    this.heard = performance.now();
    this.stalled = false;
    this.quietTill = 0;      // that phone is busy (building a level): silence expected until it is free
    this.src = null; this.cid = null; // the room server's ids for this attempt
    this.prefs = {};         // host: what that guest told about itself in its hello
    const L = (this.link = new Link(offerer, ice));
    L.onopen = () => {
      this.heard = performance.now();
      if (net.role === 'guest') L.send({ t: 'hello', proto: NET_PROTO, version: VERSION, prefs: net.prefs, rejoin: net.token });
      this._pt = setInterval(() => this._ping(), 1000);
    };
    L.onclose = () => this._down();
    L.onmessage = (m) => { this._heard(); net._message(this, m); };
    L.onfast = (buf) => { this._heard(); net._fast(this, buf); };
  }
  // (each channel as soon as it is open: the hello can reach the host before its second
  // channel is even announced, and a welcome held back for that is lost: the phone
  // joining then waits for nothing)
  send(m) { this.link.send(m); }
  sendFast(buf) { this.link.sendFast(buf); }
  _heard() {
    this.heard = performance.now();
    if (this.stalled) { this.stalled = false; this.net._stall(this, false); }
  }
  // a word every second; four seconds of silence is a stall (the other phone in the
  // background, the WiFi dropping out). A loss: the link closing, or ten seconds of
  // silence while the connection itself says the other end is gone (a phone that is only
  // busy still answers at the network level; one without WiFi does not), rather than
  // the half minute a browser waits before giving up: a guest can come back at once
  _ping() {
    const L = this.link;
    if (!L.isOpen) return;
    if (L.rel && L.rel.readyState === 'closed') { L._lost('channel rel closed (seen by the ping)'); return; }
    L.send({ t: 'ping', ts: performance.now() });
    const now = performance.now();
    // this page frozen for a while (a busy phone, a tab coming back): that silence was
    // ours, not the other phone's; its messages are still waiting to be read
    if (this._tick && now - this._tick > 2500) this.heard = Math.max(this.heard, now - 1000);
    this._tick = now;
    const quiet = now - this.heard;
    if (!this.open || now < this.quietTill) return;
    if (!this.stalled && quiet > 4000) { this.stalled = true; this.net._stall(this, true); }
    const ice = L.pc.iceConnectionState;
    if (quiet > 10000 && ice !== 'connected' && ice !== 'completed') L._lost(`${Math.round(quiet / 1000)} s without a word, connection ${ice}`);
  }
  _down() {
    clearInterval(this._pt);
    const was = this.open;
    this.open = false;
    this.net._down(this, was);
  }
  close() { clearInterval(this._pt); this.link.onclose = null; this.link.close(); this.open = false; }
}

export class NetPlay {
  constructor(role) {
    this.role = role;                         // 'host' (player 1) or 'guest'
    this.local = role === 'host' ? 0 : null;  // the player on this phone (0 is player 1; a guest learns it in the welcome)
    this.mode = null;                         // 'code' or 'qr'
    this.code = null;
    this.sig = null;
    this.peers = [];                          // host: one per guest; guest: the host
    this.max = MAX_PLAYERS;                   // host: players in the room, itself included
    this.locked = false;                      // host: no new players (the game is about to start or has)
    this.started = false;                     // host: the game is on (only a known player may come back)
    this.gameId = role === 'host' ? rid() : null;
    this.token = null;                        // guest: what lets it back into the same seat
    this.seats = {};                          // host: token -> player
    this.prefs = {};                          // guest: what the host should know about it (goes in the hello)
    this.beacon = null;                       // host: the room announced on this WiFi
    this.handlers = {};
    // events for the game, with the player concerned
    this.onjoin = null; this.onlost = null; this.onstall = null; this.onrejoin = null;
    this.onfast = null;                       // (buf, player): the game's binary messages
    this._waiters = [];
  }

  on(type, fn) { this.handlers[type] = fn; }
  log(...a) { if (this.debug) console.info('[net]', ...a); }
  get host() { return this.role === 'guest' ? this.peers[0] : null; }
  get open() { return this.role === 'guest' ? !!(this.peers[0] && this.peers[0].open) : this.peers.some((p) => p.open); }
  get rtt() { const o = this.peers.filter((p) => p.open); return o.length ? Math.max(...o.map((p) => p.rtt)) : 0; }
  // the round trip of the network itself: the lower quartile of the last pings, without the moments one of the
  // phones was busy and answered late (building a scene: measured then, the plain average ran to 100 ms and more
  // on a WiFi of 5)
  get rttLow() {
    const o = this.peers.filter((p) => p.open && p.rtts.length);
    if (!o.length) return this.rtt;
    return Math.max(...o.map((p) => { const s = p.rtts.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 4)]; }));
  }
  get stalled() { return this.peers.some((p) => p.open && p.stalled); }
  // host: the guests in the game, by player
  get guests() { return this.peers.filter((p) => p.open && p.player != null).sort((a, b) => a.player - b.player); }
  peerOf(player) { return this.peers.find((p) => p.player === player && p.open); }
  // to everyone (host) or to the host (guest); `except`: players left out
  send(m, except = null) { for (const p of this.peers) if (p.open && !(except && except.includes(p.player))) p.send(m); }
  sendTo(player, m) { const p = this.peerOf(player); if (p) p.send(m); }
  sendFast(buf, except = null) { for (const p of this.peers) if (p.open && !(except && except.includes(p.player))) p.sendFast(buf); }
  sendFastTo(player, buf) { const p = this.peerOf(player); if (p) p.sendFast(buf); }
  // This phone is about to freeze for a while (building a level and drawing its first
  // frames, when the shaders compile): the others wait instead of taking it for gone.
  // free() after the first frames are drawn (not before: that is when it freezes).
  busy() { this.send({ t: 'loading' }); }
  free() { this.send({ t: 'loaded' }); }
  hushPeer(player, ms) {
    const p = this.peers.find((x) => x.player === player);
    if (p) { p.quietTill = ms ? performance.now() + ms : 0; p.heard = performance.now(); }
  }

  // ---------------------------------------------------------------- pairing
  // host, with internet: a free 4-digit room on the cloud server
  async hostCode() {
    this.mode = 'code';
    let last = null;
    for (let i = 0; i < 6; i++) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      const sig = new CloudSignal(ROOM_PREFIX + code, sigURL());
      try { await sig.open(); } catch (e) { last = e; if (e.message === 'taken') continue; throw e; }
      // (cancelled while the server answered: the room must not stay open, or a phone
      // typing its code would still be let in)
      if (this.closed) { sig.close(); throw new Error('closed'); }
      this._roomSig(sig, code);
      return code;
    }
    throw last || new Error('taken');
  }
  _roomSig(sig, code) {
    this.sig = sig; this.code = code;
    sig.onmessage = (m) => this._hostSignal(m);
    sig.onclose = () => { if (this.sig === sig) { this.sig = null; this._reopenRoom(code); } };
  }
  // The room's line to the server dropped (a phone changing network, the server going
  // down a moment): the same room again, so that a phone losing the game can come back
  // with the same code. (Right after a drop the server may still hold the old one.)
  async _reopenRoom(code) {
    if (this._reopening) return;
    this._reopening = true;
    for (let i = 0; i < 20 && !this.closed && !this.sig; i++) {
      await sleep(2500 + i * 1500);
      if (this.closed || this.sig) break;
      const sig = new CloudSignal(ROOM_PREFIX + code, sigURL());
      try { await sig.open(); } catch (e) { continue; }
      if (this.closed) { sig.close(); break; }
      this._roomSig(sig, code);
      this.log('room open again', code);
    }
    this._reopening = false;
  }
  _hostSignal(m) {
    const p = m.payload || {};
    if (m.type === 'OFFER') {
      const meta = p.metadata || {};
      if (meta.probe) return; // (a search for games on the WiFi, sent to a beacon)
      // a full or started game only lets a known player back in
      const known = meta.rejoin && this.seats[meta.rejoin] != null;
      this.log('offer from', m.src, { guests: this.guests.length, max: this.max, locked: this.locked, known: !!known });
      if ((this.locked || this.guests.length >= this.max - 1) && !known) return;
      const old = this.peers.find((x) => x.src === m.src && !x.open);
      if (old) { this.peers.splice(this.peers.indexOf(old), 1); old.close(); }
      const peer = new Peer(this, false, ICE_ONLINE);
      peer.src = m.src; peer.cid = p.connectionId;
      this.peers.push(peer);
      peer.link.oncandidate = (c) => { if (this.sig) this.sig.candidate(m.src, c, p.connectionId); };
      peer.link.answer(p.sdp).then((ans) => { if (this.sig && this.peers.includes(peer)) this.sig.answer(m.src, ans, p.connectionId); }).catch(() => {});
    } else if (m.type === 'CANDIDATE') {
      const peer = this.peers.find((x) => x.src === m.src && x.cid === p.connectionId);
      if (peer) peer.link.addCandidate(p.candidate);
    }
  }
  // host with a room code: announce the room to the phones on the same WiFi until
  // lock() (false: no internet, or a network that shows each phone with its own address)
  async announce() {
    if (this.mode !== 'code' || !this.code || this.beacon || this.locked) return false;
    const key = await lanKey();
    if (!key || this.closed || this.locked || this.beacon) return false;
    const beacon = (this.beacon = new LanBeacon(() => (this.locked ? null : { code: this.code, n: 1 + this.guests.length, max: this.max })));
    const ok = await beacon.start(key);
    if (!ok && this.beacon === beacon) this.beacon = null;
    return ok;
  }
  // host: no more players (the game starts): off the WiFi's list, and a QR code still
  // waiting for a phone is dropped
  lock() {
    this.locked = true;
    if (this.beacon) { this.beacon.close(); this.beacon = null; }
    for (const p of this.peers.filter((x) => !x.open)) { this.peers.splice(this.peers.indexOf(p), 1); p.close(); }
  }
  // host: back to the room (someone left before the start): new players welcome again
  unlock() { this.locked = false; this.announce(); }
  // host: the guests' players in order with no gaps (1, 2, …) after someone left, so the
  // game can use them as indices; each guest that moves is told ('seat')
  compactSeats() {
    this.guests.forEach((peer, i) => {
      if (peer.player === i + 1) return;
      for (const [k, v] of Object.entries(this.seats)) if (v === peer.player) this.seats[k] = i + 1;
      peer.player = i + 1;
      peer.send({ t: 'seat', player: i + 1 });
    });
  }

  // guest, with internet: knock on the room; resolves once connected and greeted
  async joinCode(code) {
    this.mode = 'code'; this.code = code;
    if (!this.sig) {
      const sig = new CloudSignal(ROOM_PREFIX + 'g' + rid(), sigURL());
      await sig.open();
      if (this.closed) { sig.close(); throw new Error('closed'); }
      this.sig = sig;
      sig.onclose = () => { if (this.sig === sig) this.sig = null; };
    }
    const sig = this.sig, dst = ROOM_PREFIX + code, cid = 'dc_' + rid();
    const peer = this._guestPeer(true, ICE_ONLINE);
    let answered = false;
    peer.link.oncandidate = (c) => sig.candidate(dst, c, cid);
    sig.onmessage = (m) => {
      if (m.src !== dst || !m.payload || m.payload.connectionId !== cid) return;
      if (m.type === 'ANSWER') { answered = true; peer.link.accept(m.payload.sdp).catch(() => {}); } else if (m.type === 'CANDIDATE') peer.link.addCandidate(m.payload.candidate);
    };
    sig.offer(dst, await peer.link.offer(false), cid, { game: APP_ID, proto: NET_PROTO, version: VERSION, rejoin: this.token || undefined });
    // twelve seconds for the room to answer (no answer: no such game); once it has, time
    // for the connection itself (a slow WiFi, a relay through the internet)
    await new Promise((resolve, reject) => {
      const w = { peer: null, resolve, reject, t: liveTimeout(45000, () => this._settle(w, new Error('nolink'))) };
      this._waiters.push(w);
      w.also = liveTimeout(12000, () => { if (!answered) this._settle(w, new Error('notfound')); });
    });
    // the room's server is not needed any more (a new knock opens it again)
    sig.close(); this.sig = null;
  }
  _guestPeer(offerer, ice) {
    for (const p of this.peers) p.close();
    const peer = new Peer(this, offerer, ice);
    this.peers = [peer];
    return peer;
  }
  // guest, room code: knock on the same room again for a while after losing the link
  // (into the same seat, thanks to the welcome's token). true once back in
  async rejoin(tries = 15, gap = 3000) {
    for (let i = 0; i < tries && !this.closed && !this.open; i++) {
      try { await this.joinCode(this.code); } catch (e) {
        const m = e.message || '';
        if (m === 'busy' || m === 'full' || m === 'closed' || m.startsWith('version')) break;
        await sleep(gap);
      }
    }
    return !this.closed && this.open;
  }

  // QR, no internet, host: a code to show (a whole offer, for one phone)
  async hostQR() {
    this.mode = 'qr';
    for (const p of this.peers.filter((x) => x.qr && !x.open)) { this.peers.splice(this.peers.indexOf(p), 1); p.close(); }
    const peer = new Peer(this, true, []);
    peer.qr = true;
    this.peers.push(peer);
    const offer = await peer.link.offer(true);
    if (this.closed) { peer.close(); return null; } // (gone meanwhile: nothing to show)
    return packSDP(offer, VERSION);
  }
  // host: the answer read with the camera from the phone that read our code
  async acceptQR(text) {
    const u = unpackSDP(text);
    if (!u || u.type !== 'answer') throw new Error('notours');
    if (u.version !== VERSION) throw new Error('version:' + u.version);
    const peer = this.peers.find((p) => p.qr && !p.open && !p.answered);
    if (!peer) throw new Error('nolink');
    peer.answered = true;
    await peer.link.accept({ type: 'answer', sdp: u.sdp });
    await this.waitOpen(15000, 'nolink', peer);
  }
  // guest: the host's code read with the camera -> the answer to show back
  async joinQR(text) {
    const u = unpackSDP(text);
    if (!u || u.type !== 'offer') throw new Error('notours');
    if (u.version !== VERSION) throw new Error('version:' + u.version);
    this.mode = 'qr';
    const peer = this._guestPeer(false, []);
    return packSDP(await peer.link.answer({ type: 'offer', sdp: u.sdp }, true), VERSION);
  }

  // resolves when a hello is done (that peer's; for a guest, its link to the host;
  // rejects with `why` after `ms` or with the host's refusal)
  waitOpen(ms, why, peer = null) {
    if (peer ? peer.open : this.role === 'guest' && this.open) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const w = { peer, resolve, reject, t: liveTimeout(ms, () => this._settle(w, new Error(why))) };
      this._waiters.push(w);
    });
  }
  _settle(w, err) {
    const i = this._waiters.indexOf(w);
    if (i < 0) return;
    this._waiters.splice(i, 1);
    clearInterval(w.t); clearInterval(w.also);
    if (err) w.reject(err); else w.resolve();
  }
  _opened(peer, err = null) { for (const w of this._waiters.slice()) if (!w.peer || w.peer === peer) this._settle(w, err); }

  _message(peer, m) {
    const from = this.role === 'host' ? peer.player : 0;
    switch (m.t) {
      case 'hello': {
        if (this.role !== 'host') return;
        this.log('hello', { rel: peer.link.rel && peer.link.rel.readyState, fast: peer.link.fast && peer.link.fast.readyState, linkOpen: peer.link.isOpen });
        if (m.proto !== NET_PROTO || m.version !== VERSION) { peer.send({ t: 'refuse', why: 'version', version: VERSION }); return; }
        // back after losing the link: the same seat; a new phone: the first free one
        let player = m.rejoin != null ? this.seats[m.rejoin] : null;
        const back = player != null;
        if (!back) {
          if (this.locked || this.started) { peer.send({ t: 'refuse', why: 'busy', version: VERSION }); return; }
          const taken = new Set(this.peers.filter((p) => p.open && p !== peer).map((p) => p.player));
          player = null;
          for (let n = 1; n < this.max && player == null; n++) if (!taken.has(n)) player = n;
          if (player == null) { peer.send({ t: 'refuse', why: 'full', version: VERSION }); return; }
        }
        // a seat taken back: the old link of that player goes
        for (const p of this.peers.slice()) if (p !== peer && p.player === player) { this.peers.splice(this.peers.indexOf(p), 1); p.close(); }
        const token = back ? m.rejoin : rid();
        this.seats[token] = player;
        peer.player = player; peer.prefs = m.prefs && typeof m.prefs === 'object' ? m.prefs : {}; peer.open = true;
        peer.send({ t: 'welcome', gameId: this.gameId, player, token, version: VERSION });
        this._opened(peer);
        if (back) { if (this.onrejoin) this.onrejoin(player); } else if (this.onjoin) this.onjoin(player);
        return;
      }
      case 'welcome':
        if (this.role !== 'guest') return;
        this.gameId = m.gameId; this.local = m.player | 0; this.token = m.token;
        peer.player = 0; peer.open = true;
        this._opened(peer);
        return;
      case 'refuse': this._opened(peer, new Error(m.why === 'version' ? 'version:' + m.version : String(m.why))); return;
      case 'ping': peer.send({ t: 'pong', ts: m.ts }); return;
      case 'pong': { const r = performance.now() - m.ts; peer.rtt = peer.rtt ? peer.rtt * 0.7 + r * 0.3 : r; peer.rtts.push(r); if (peer.rtts.length > 20) peer.rtts.shift(); peer.pongs++; return; }
      case 'loading': this.hushPeer(from, 40000); this.log(`player ${from + 1} busy`); return;
      case 'loaded': this.hushPeer(from, 0); this.log(`player ${from + 1} free`); return;
      case 'seat': if (this.role === 'guest') this.local = m.player | 0; break; // (the game is told too)
      default:
    }
    // the game's own messages, only from a phone already greeted
    if (!peer.open) return;
    const fn = this.handlers[m.t];
    if (fn) fn(m, from);
  }
  _fast(peer, buf) {
    if (!(buf instanceof ArrayBuffer) || !peer.open || !this.onfast) return;
    this.onfast(buf, this.role === 'host' ? peer.player : 0);
  }
  _stall(peer, on) { if (peer.player != null && this.onstall) this.onstall(peer.player, on); }
  _down(peer, was) {
    if (!was) { this._opened(peer, new Error('nolink')); return; }
    if (this.onlost) this.onlost(peer.player);
  }

  close() {
    this.closed = true;
    this.onjoin = this.onlost = this.onstall = this.onrejoin = this.onfast = null;
    this.handlers = {};
    if (this.beacon) { this.beacon.close(); this.beacon = null; }
    for (const w of this._waiters.slice()) this._settle(w, new Error('closed'));
    for (const p of this.peers) p.close();
    this.peers = [];
    if (this.sig) { this.sig.close(); this.sig = null; }
  }
  // a goodbye that has a chance to arrive before the links go (nothing is heard meanwhile)
  bye() {
    this.onjoin = this.onlost = this.onstall = this.onrejoin = this.onfast = null;
    this.handlers = {};
    this.send({ t: 'bye' });
    for (const p of this.peers) p.link.hush(); // (the goodbye is the last thing sent)
    setTimeout(() => this.close(), 250);
  }
  // host: let one player go (the others play on)
  drop(player) {
    const p = this.peers.find((x) => x.player === player);
    if (p) {
      this.peers.splice(this.peers.indexOf(p), 1);
      // gone already: its link closing (the other phone's goodbye closes it too) is no loss
      clearInterval(p._pt); p.link.onclose = null;
      p.send({ t: 'bye' }); p.link.hush(); setTimeout(() => p.close(), 250);
    }
    for (const [k, v] of Object.entries(this.seats)) if (v === player) delete this.seats[k];
  }
}
