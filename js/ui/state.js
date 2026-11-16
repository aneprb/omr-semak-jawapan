// In-memory handoff between views (imbas -> semak). Never persisted, never in the URL.
const store = new Map();

/** Captured image (ImageData-like) waiting for review, and optional scan result. */
export function setCapture(testId, capture) { store.set('capture', { testId, ...capture, at: Date.now() }); }
export function getCapture(testId) {
  const c = store.get('capture');
  return c && c.testId === testId ? c : null;
}
export function clearCapture() { store.delete('capture'); }

/** Generic keyed values (e.g. 'scanResult'); cleared on page reload by design. */
export function setState(key, value) { store.set(key, value); }
export function getState(key, fallback = undefined) { return store.has(key) ? store.get(key) : fallback; }
export function deleteState(key) { store.delete(key); }
export function clearAllState() { store.clear(); }
