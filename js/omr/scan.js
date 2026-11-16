// Main entry points of the OMR engine. Pure JS, no DOM. scanImage never throws.
import { DEFAULTS } from "./config.js";
import { downscale, toGray } from "./image.js";
import { findMarkers } from "./markers.js";
import { computeHomography } from "./homography.js";
import { calibrate, sampleLayout, checkOrientation } from "./sampler.js";
import { decideRow } from "./decide.js";

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function emptyResult(error, t0, extra = {}) {
  return {
    ok: false,
    error,
    corners: null,
    rotated180: false,
    homography: null,
    quality: { white: 0, black: 0, contrast: 0, ms: Math.round(now() - t0) },
    answers: [],
    studentId: { value: null, digits: [] },
    ...extra,
  };
}

function isValidImage(img) {
  return (
    img &&
    Number.isFinite(img.width) &&
    Number.isFinite(img.height) &&
    img.width > 0 &&
    img.height > 0 &&
    img.data &&
    img.data.length >= img.width * img.height * 4
  );
}

function isValidLayout(layout) {
  return !!(
    layout &&
    layout.schema === "omr-layout" &&
    Array.isArray(layout.markers) &&
    layout.markers.length === 4 &&
    Array.isArray(layout.questions) &&
    layout.questions.length > 0 &&
    layout.orientationBar &&
    layout.page
  );
}

function mergeOpts(opts) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  o.thresholds = { ...DEFAULTS.thresholds, ...((opts && opts.thresholds) || {}) };
  return o;
}

/** Homography mm -> px of `scaled` image, composed with scaled -> original px. */
function toOriginal(H, sx, sy) {
  // x_o = sx * x_d + (sx - 1) / 2 (pixel-centre convention)
  const A = [sx, 0, (sx - 1) / 2, 0, sy, (sy - 1) / 2, 0, 0, 1];
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = A[r * 3] * H[c] + A[r * 3 + 1] * H[3 + c] + A[r * 3 + 2] * H[6 + c];
    }
  }
  const k = out[8];
  return out.map((v) => v / k);
}

function layoutPoints(layout) {
  return layout.markers.map((m) => ({ x: m.cx, y: m.cy }));
}

export function scanImage(img, layout, opts) {
  const t0 = now();
  try {
    if (!isValidLayout(layout)) return emptyResult("LAYOUT_INVALID", t0);
    if (!isValidImage(img)) return emptyResult("IMAGE_TOO_SMALL", t0);
    const o = mergeOpts(opts);
    if (Math.min(img.width, img.height) < o.minSide) return emptyResult("IMAGE_TOO_SMALL", t0);

    const scaled = downscale(img, o.maxSide);
    const gray = toGray(scaled);

    const found = findMarkers(gray, o);
    if (!found.ok) return emptyResult(found.error || "NO_MARKERS", t0);

    const dstPts = layoutPoints(layout);
    let corners = found.corners; // image order TL,TR,BR,BL (scaled px)
    let H = computeHomography(dstPts, corners);
    if (!H) return emptyResult("BAD_GEOMETRY", t0);

    let rotated180 = false;
    if (checkOrientation(gray, H, layout)) {
      rotated180 = true;
      corners = [corners[2], corners[3], corners[0], corners[1]];
      H = computeHomography(dstPts, corners);
      if (!H) return emptyResult("BAD_GEOMETRY", t0);
    }

    const cal = calibrate(gray, H, layout);
    const sx = img.width / scaled.width;
    const sy = img.height / scaled.height;
    const origCorners = corners.map((p) => ({ x: (p.x + 0.5) * sx - 0.5, y: (p.y + 0.5) * sy - 0.5 }));
    const quality = { white: cal.white, black: cal.black, contrast: cal.contrast, ms: 0 };
    if (!(cal.contrast >= o.minContrast)) {
      quality.ms = Math.round(now() - t0);
      return emptyResult("LOW_CONTRAST", t0, {
        corners: origCorners,
        rotated180,
        homography: toOriginal(H, sx, sy),
        quality,
      });
    }

    const { answerFills, idFills } = sampleLayout(gray, H, layout, cal, o);

    const labels = layout.choices;
    const answers = layout.questions.map((q, i) => {
      const fills = answerFills[i];
      const d = decideRow(fills, labels, o.thresholds);
      return { q: q.q, choice: d.choice, status: d.status, selected: d.selected, fills };
    });

    let studentId = { value: null, digits: [] };
    if (layout.idBlock && layout.idBlock.digits.length > 0) {
      const digitLabels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
      const digits = idFills.map((fills) => {
        const d = decideRow(fills, digitLabels, o.thresholds);
        return { digit: d.choice === null ? null : Number(d.choice), status: d.status };
      });
      const allOk = digits.every((d) => d.status === "OK");
      studentId = { value: allOk ? digits.map((d) => String(d.digit)).join("") : null, digits };
    }

    quality.ms = Math.round(now() - t0);
    return {
      ok: true,
      error: null,
      corners: origCorners,
      rotated180,
      homography: toOriginal(H, sx, sy),
      quality,
      answers,
      studentId,
    };
  } catch (e) {
    return emptyResult("BAD_GEOMETRY", t0, { message: String((e && e.message) || e) });
  }
}

/** Fast path for live frames: marker detection only, no sampling. */
export function detectMarkers(img, opts) {
  try {
    if (!isValidImage(img)) return { found: false, corners: null, error: "IMAGE_TOO_SMALL" };
    const o = mergeOpts(opts);
    const small = downscale(img, o.detectMaxSide);
    const gray = toGray(small);
    const r = findMarkers(gray, o);
    if (!r.ok) return { found: false, corners: null, error: r.error || "NO_MARKERS" };
    const sx = img.width / small.width;
    const sy = img.height / small.height;
    const corners = r.corners.map((p) => ({ x: (p.x + 0.5) * sx - 0.5, y: (p.y + 0.5) * sy - 0.5 }));
    return { found: true, corners, error: null };
  } catch (e) {
    return { found: false, corners: null, error: "NO_MARKERS" };
  }
}
