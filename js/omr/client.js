// Promise API over the OMR worker, with a main-thread fallback. Protocol: docs/PLAN.md section 4.3.
// Only module in the engine folder that touches browser APIs (Worker).

let worker = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map(); // id -> { kind, resolve, reject, image, layout, opts }
let detectInFlight = false;

let enginePromise = null;
function loadEngine() {
  if (!enginePromise) enginePromise = import("./scan.js");
  return enginePromise;
}

async function runLocal(entry) {
  try {
    const engine = await loadEngine();
    const result =
      entry.kind === "scan"
        ? engine.scanImage(entry.image, entry.layout, entry.opts)
        : engine.detectMarkers(entry.image, entry.opts);
    if (entry.kind === "detect") detectInFlight = false;
    entry.resolve(result);
  } catch (e) {
    if (entry.kind === "detect") detectInFlight = false;
    entry.reject(e);
  }
}

function failOverToMainThread() {
  workerFailed = true;
  if (worker) {
    try {
      worker.terminate();
    } catch (e) {
      /* ignore */
    }
    worker = null;
  }
  const entries = [...pending.values()];
  pending.clear();
  for (const entry of entries) runLocal(entry);
}

function getWorker() {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  } catch (e) {
    workerFailed = true;
    return null;
  }
  worker.onmessage = (ev) => {
    const msg = ev.data || {};
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (entry.kind === "detect") detectInFlight = false;
    if (msg.type === "scanResult" || msg.type === "detectResult") entry.resolve(msg.result);
    else if (msg.type === "error") entry.reject(new Error(msg.message));
  };
  worker.onerror = (ev) => {
    if (ev && ev.preventDefault) ev.preventDefault();
    failOverToMainThread();
  };
  return worker;
}

function post(kind, imageData, layout, opts) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const entry = { kind, resolve, reject, image: imageData, layout, opts };
    pending.set(id, entry);
    const w = getWorker();
    if (!w) {
      pending.delete(id);
      runLocal(entry);
      return;
    }
    // Copy so the caller's ImageData stays usable (needed later for the review overlay).
    const buffer = imageData.data.buffer.slice(
      imageData.data.byteOffset,
      imageData.data.byteOffset + imageData.data.byteLength,
    );
    const image = { width: imageData.width, height: imageData.height, buffer };
    const msg = kind === "scan" ? { type: "scan", id, image, layout, opts } : { type: "detect", id, image, opts };
    try {
      w.postMessage(msg, [buffer]);
    } catch (e) {
      pending.delete(id);
      runLocal(entry);
    }
  });
}

export function scan(imageData, layout, opts) {
  return post("scan", imageData, layout, opts);
}

/**
 * If an earlier detect request is still running the new frame is skipped and the promise
 * resolves with { found: false, corners: null, error: null, skipped: true }.
 */
export function detect(imageData, opts) {
  if (detectInFlight) {
    return Promise.resolve({ found: false, corners: null, error: null, skipped: true });
  }
  detectInFlight = true;
  return post("detect", imageData, undefined, opts);
}

export function terminate() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const entry of pending.values()) entry.reject(new Error("terminated"));
  pending.clear();
  detectInFlight = false;
  workerFailed = false;
}
