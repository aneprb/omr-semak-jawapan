// Technical debug log only (timings, error kinds). NEVER pass student data.
function enabled() {
  try { return globalThis.localStorage?.getItem('omrDebug') === '1'; } catch { return false; }
}
export function debug(tag, msg) {
  if (enabled()) console.debug(`[omr:${String(tag)}]`, String(msg ?? ''));
}
export function warn(tag, msg) {
  if (enabled()) console.warn(`[omr:${String(tag)}]`, String(msg ?? ''));
}
