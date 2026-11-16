// Kamera: sokongan, mula/henti, tangkap bingkai, tangkap auto, fail foto (PLAN.md 4.4).
import { canvasScale, isIOS } from "../util/platform.js";

export function cameraSupported() {
  return typeof window !== "undefined" && window.isSecureContext === true &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function startCamera(videoEl, opts = {}) {
  const { facingMode = "environment", width = 1920, height = 1080 } = opts;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facingMode }, width: { ideal: width }, height: { ideal: height } },
    });
  } catch (e) {
    // iOS/older engines may reject the size hints; retry with the bare minimum.
    if (e && (e.name === "OverconstrainedError" || e.name === "ConstraintNotSatisfiedError")) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facingMode } } });
    } else throw e;
  }
  // iOS needs playsinline + muted (+ autoplay) or the video goes fullscreen / refuses to play.
  videoEl.setAttribute("playsinline", "");
  videoEl.setAttribute("webkit-playsinline", "");
  videoEl.setAttribute("autoplay", "");
  videoEl.playsInline = true;
  videoEl.muted = true;
  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch (e) {
    stopCamera(stream); // do not leave the camera light on if play() is blocked
    throw e;
  }
  return stream;
}

// True when the stream/video died (iOS stops capture when the app is backgrounded).
export function cameraIsDead(stream, videoEl) {
  if (!stream) return true;
  const t = stream.getVideoTracks()[0];
  return !t || t.readyState === "ended" || !!(videoEl && videoEl.paused && videoEl.srcObject);
}

export function stopCamera(stream) {
  if (stream) for (const t of stream.getTracks()) t.stop();
}

function fitSize(w, h, maxSide) {
  const s = canvasScale(w, h, maxSide); // also keeps total pixels under the iOS canvas limit
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function drawToImageData(source, sw, sh, maxSide) {
  const { w, h } = fitSize(sw, sh, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  canvas.width = canvas.height = 0; // lepaskan memori
  return data;
}

// maxSide: 640 untuk bingkai pengesanan langsung, 1600 untuk tangkapan muktamad.
export function grabFrame(videoEl, maxSide = 640) {
  const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
  if (!vw || !vh) throw new Error("Video belum sedia");
  return drawToImageData(videoEl, vw, vh, maxSide);
}

async function viaBitmap(file, maxSide) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return drawToImageData(bmp, bmp.width, bmp.height, maxSide);
  } finally {
    if (bmp.close) bmp.close();
  }
}

// <img> honours EXIF orientation by default and decodes what Safari can display (incl. HEIC on iOS).
async function viaImg(file, maxSide) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    if (img.decode) await img.decode();
    else await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("decode")); });
    return drawToImageData(img, img.naturalWidth, img.naturalHeight, maxSide);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Downscaled to maxSide (and under the iOS ~16.7 MP canvas limit) before drawing.
// iOS Safari: <img> first (reliable EXIF/HEIC); elsewhere createImageBitmap first. Either falls back to the other.
export async function fileToImageData(file, maxSide = 1600) {
  const order = isIOS() || typeof createImageBitmap !== "function" ? [viaImg, viaBitmap] : [viaBitmap, viaImg];
  let err;
  for (const fn of order) {
    if (fn === viaBitmap && typeof createImageBitmap !== "function") continue;
    try { return await fn(file, maxSide); } catch (e) { err = e; }
  }
  throw err || new Error("Gambar tidak dapat dibaca");
}

// Sandaran bila tiada secure context: <input type=file accept=image/* capture=environment>.
// Mesti dipanggil dari gerak isyarat pengguna (klik). Pulangkan File atau null jika dibatalkan.
export function pickPhoto({ capture = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    input.style.display = "none";
    const done = (f) => { input.remove(); resolve(f); };
    input.addEventListener("change", () => done(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener("cancel", () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

// Olok-olok sehingga enjin OMR (client.detect) disambung: tidak pernah jumpa penanda.
export async function mockDetect(_imageData) {
  return { found: false, corners: null, error: "NO_MARKERS" };
}

function maxCornerShift(a, b) {
  let m = 0;
  for (let i = 0; i < 4; i++) m = Math.max(m, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  return m;
}

// detect(imageData) -> Promise<{found, corners, error}> disuntik (lalai: mockDetect).
// Status: searching (tiada penanda) | partial (ada tetapi geometri tidak sah / bergerak) | holding (stabil) | captured.
export function createAutoCapture({
  onStatus = () => {}, onCapture = () => {}, detect = mockDetect,
  stableFrames = 3, maxShiftFrac = 0.02, intervalMs = 200,
  detectMaxSide = 640, captureMaxSide = 1600,
} = {}) {
  let timer = null, video = null, busy = false, running = false;
  let prev = null, stable = 0, last = null;

  const emit = (s) => { if (s !== last) { last = s; onStatus(s); } };

  async function tick() {
    if (!running || busy || !video || !video.videoWidth) return;
    busy = true;
    try {
      const frame = grabFrame(video, detectMaxSide);
      const res = await detect(frame);
      if (!running) return;
      if (res && res.found && res.corners) {
        const limit = maxShiftFrac * Math.max(frame.width, frame.height);
        stable = prev && maxCornerShift(prev, res.corners) <= limit ? stable + 1 : 1;
        prev = res.corners;
        if (stable >= stableFrames) {
          running = false;
          clearInterval(timer);
          timer = null;
          emit("captured");
          onCapture(grabFrame(video, captureMaxSide));
          return;
        }
        emit(stable > 1 ? "holding" : "partial");
      } else {
        prev = null;
        stable = 0;
        emit(res && res.error === "BAD_GEOMETRY" ? "partial" : "searching");
      }
    } catch (_e) {
      stable = 0;
      prev = null;
      emit("searching");
    } finally {
      busy = false;
    }
  }

  return {
    start(videoEl) {
      this.stop();
      video = videoEl;
      running = true;
      prev = null;
      stable = 0;
      last = null;
      emit("searching");
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
