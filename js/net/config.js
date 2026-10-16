// What changes from one game to another: the rest of js/net/ (but rollback.js and simstate.js, which are this
// game's) is the same for every game. Two games with the same APP_ID would find each other's rooms on the PeerJS
// cloud, so each has its own.
import { STYLES } from '../fight/styles.js';

// the ids of this game on the PeerJS cloud start with this: letters and digits, words joined by a single '-'
export const APP_ID = 'punos-de-barrio';
// Both phones simulate the whole fight, so they must run exactly the same game: a phone with another version is
// turned away with a message instead of playing a fight that slowly turns into another one. The version is the
// online release (raise it whenever the fight simulation's code changes) and a fingerprint of every fighter's
// moves and stats, so that a phone with an older copy cached is caught even if the release was not raised.
const NET_RELEASE = '1.0';
function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36).slice(0, 5);
}
export const VERSION = `${NET_RELEASE}-${fingerprint(JSON.stringify(STYLES, (k, v) => (typeof v === 'function' ? String(v) : v)))}`;
// the version as people read it (the fingerprint is for the phones)
export const VERSION_SHOWN = NET_RELEASE;
// a QR code's text starts with this (and the format number): another game's QR is turned down (no '|' in it)
export const QR_TAG = 'PDB';
// a fight is two players: the host (player 1, the left fighter) and one guest
export const MAX_PLAYERS = 2;
