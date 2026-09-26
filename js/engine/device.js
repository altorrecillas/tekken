// Device profile: what kind of screen/input we run on, and the budgets that follow from it.
// Imported first by main.js: it also installs the mobile texture cap before any texture is requested.
import * as THREE from 'three';

const q = new URLSearchParams(location.search);
const mq = (s) => matchMedia(s).matches;

// touch-first device (phones, tablets); a laptop with a touch screen still has a fine pointer
const coarse = mq('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !mq('(pointer: fine)'));
const shortSide = Math.min(screen.width, screen.height);
const forced = q.get('device'); // debug: ?device=phone|tablet|desktop

export const DEVICE = {
  touch: forced ? forced !== 'desktop' : coarse,
  phone: forced ? forced === 'phone' : coarse && shortSide < 600,
  tablet: forced ? forced === 'tablet' : coarse && shortSide >= 600,
  ios: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)') || navigator.standalone === true,
  lowMemory: (navigator.deviceMemory || 8) <= 4,
};

// quality the game starts with when the player has not chosen one
export function defaultQuality() {
  if (DEVICE.phone) return DEVICE.lowMemory ? 'low' : 'medium';
  if (DEVICE.tablet) return 'medium';
  return 'high';
}

// render budget per quality: max device pixel ratio and max texture edge (phones keep 1024 px textures:
// a fighter's full 2048 px set alone is ~250 MB of GPU memory with mipmaps)
export function budget(quality) {
  const mobile = DEVICE.phone || DEVICE.tablet;
  return {
    dprMax: { low: 1, medium: mobile ? 1.5 : 1, high: 1.5, ultra: 2 }[quality] ?? 1.5,
    maxTex: quality === 'low' || DEVICE.phone || (mobile && DEVICE.lowMemory) ? 1024 : (mobile && quality !== 'ultra' ? 2048 : 0),
  };
}

let maxTex = 0;
export function setTextureCap(px) { maxTex = px || 0; }

// Downscale every loaded image above the cap before it reaches the GPU (TextureLoader uses ImageLoader).
const origLoad = THREE.ImageLoader.prototype.load;
THREE.ImageLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  if (!maxTex) return origLoad.call(this, url, onLoad, onProgress, onError);
  return origLoad.call(this, url, (img) => {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (Math.max(w, h) <= maxTex) { onLoad?.(img); return; }
    const k = maxTex / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    onLoad?.(c);
  }, onProgress, onError);
};

// Fullscreen + landscape lock where the platform allows it (Android; iPad Safari). iPhone Safari has neither:
// there the page relies on the landscape prompt and on "Add to Home Screen" (standalone manifest).
export async function goFullscreenLandscape() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && (el.requestFullscreen || el.webkitRequestFullscreen)) {
      await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
    }
  } catch (e) { /* denied or unsupported */ }
  try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* unsupported (iOS) or not fullscreen */ }
}
export function fullscreenSupported() {
  const el = document.documentElement;
  return !!(document.fullscreenEnabled && (el.requestFullscreen || el.webkitRequestFullscreen));
}
export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else goFullscreenLandscape();
}

// haptic tick (Android Chrome; iOS Safari has no vibration API)
let hapticsOn = true;
export function setHaptics(on) { hapticsOn = on; }
export function haptic(ms = 12) { if (hapticsOn && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } }
