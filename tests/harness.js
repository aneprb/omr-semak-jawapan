// Harness ujian pelayar kecil (tiada pustaka). Setiap *.test.js mengeksport
// `export default [ { name, fn }, ... ]` atau menggunakan test() daripada fail ini.

export class SkipError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "SkipError";
  }
}

const registered = [];

/** Nota maklumat (angka ukuran) yang dicetak dalam ringkasan sebagai baris NOTE. */
export const notes = [];
export function note(text) {
  notes.push(text);
}

/** Daftar satu ujian (cara alternatif kepada `export default [...]`). */
export function test(name, fn) {
  registered.push({ name, fn });
}

/** Ambil dan kosongkan ujian yang didaftar melalui test() sejak panggilan lepas. */
export function drainRegistered() {
  return registered.splice(0, registered.length);
}

export function skip(reason = "dilangkau") {
  throw new SkipError(reason);
}

export function assert(cond, msg = "assert gagal") {
  if (!cond) throw new Error(msg);
}

function show(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

export function assertEqual(actual, expected, msg = "") {
  if (!deepEqual(actual, expected)) {
    throw new Error(`${msg ? msg + ": " : ""}dijangka ${show(expected)}, dapat ${show(actual)}`);
  }
}

export function assertClose(actual, expected, tol = 0.01, msg = "") {
  if (typeof actual !== "number" || !(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg ? msg + ": " : ""}dijangka ${expected} +/- ${tol}, dapat ${actual}`);
  }
}

export async function assertThrows(fn, code) {
  try {
    await fn();
  } catch (e) {
    if (code !== undefined && e.code !== code) {
      throw new Error(`dijangka ralat code=${code}, dapat code=${e.code} (${e.message})`);
    }
    return e;
  }
  throw new Error("dijangka lemparan ralat, tiada");
}

/** Muat fixture JSON relatif kepada tests/ (url dari akar pelayan atau relatif kepada halaman). */
export async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gagal memuat ${url}: HTTP ${res.status}`);
  return res.json();
}

/** Muat imej -> { width, height, data } (mirip ImageData). Hanya untuk harness. */
export async function loadImageData(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gagal memuat ${url}: HTTP ${res.status}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const id = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close?.();
  return { width: id.width, height: id.height, data: id.data };
}

/** Import dinamik modul yang mungkin belum wujud: lempar SkipError jika 404. */
export async function requireModule(url) {
  const abs = new URL(url, location.href).href;
  let head;
  try {
    head = await fetch(abs, { method: "HEAD" });
  } catch (e) {
    throw new SkipError(`modul tidak dapat dicapai: ${url}`);
  }
  if (!head.ok) throw new SkipError(`modul belum wujud: ${url}`);
  return import(abs);
}
