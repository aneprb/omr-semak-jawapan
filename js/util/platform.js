// Platform helpers (iOS / standalone / canvas limits). Pure functions take their inputs as
// arguments so they can be unit-tested; the *Now() wrappers read the real globals.

// iPadOS 13+ reports a Mac user agent, so also check touch points.
export function detectIOS({ ua = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

// Safari proper: iOS, and not a third-party browser shell (Chrome/Firefox/Edge/Opera/Brave-like).
export function detectIOSSafari(env = {}) {
  const ua = env.ua || '';
  return detectIOS(env) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo/.test(ua);
}

// iOS exposes navigator.standalone; other browsers use the display-mode media query.
export function detectStandalone({ navStandalone = false, matchMedia = null } = {}) {
  if (navStandalone === true) return true;
  try {
    return !!(matchMedia && matchMedia('(display-mode: standalone)').matches);
  } catch {
    return false;
  }
}

// iOS Safari limits a canvas to ~16.7 MP (4096x4096). Returns the scale (<=1) that fits both
// the longest side and the total pixel budget.
export const IOS_CANVAS_MAX_PIXELS = 16_000_000;
export function canvasScale(w, h, maxSide, maxPixels = IOS_CANVAS_MAX_PIXELS) {
  if (!(w > 0) || !(h > 0)) return 1;
  let s = Math.min(1, maxSide / Math.max(w, h));
  const px = w * h * s * s;
  if (px > maxPixels) s *= Math.sqrt(maxPixels / px);
  return s;
}

export function shouldShowInstallBanner({ iosSafari, standalone, dismissed }) {
  return !!iosSafari && !standalone && !dismissed;
}

const env = () => ({
  ua: globalThis.navigator?.userAgent || '',
  platform: globalThis.navigator?.platform || '',
  maxTouchPoints: globalThis.navigator?.maxTouchPoints || 0,
});

export const isIOS = () => detectIOS(env());
export const isIOSSafari = () => detectIOSSafari(env());
export const isStandalone = () => detectStandalone({
  navStandalone: globalThis.navigator?.standalone === true,
  matchMedia: globalThis.matchMedia ? (q) => globalThis.matchMedia(q) : null,
});

// localStorage may throw (private mode / blocked): always guarded.
const DISMISS_KEY = 'omr.iosInstallDismissed';
export function installBannerDismissed() {
  try { return globalThis.localStorage?.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
export function dismissInstallBanner() {
  try { globalThis.localStorage?.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
}
