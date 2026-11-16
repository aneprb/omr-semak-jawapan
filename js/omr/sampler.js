// Calibration and fill sampling on a gray image through the mm -> px homography. Pure JS.
import { DEFAULTS } from "./config.js";
import { bilinear } from "./image.js";
import { applyHomography } from "./homography.js";

function median(values) {
  if (values.length === 0) return 0;
  const a = values.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const a = values.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
}

function grayAtMm(gray, H, x, y) {
  const p = applyHomography(H, x, y);
  return bilinear(gray, p.x, p.y);
}

/**
 * white = median gray on the white reference points (between question number and bubble A);
 * black = median gray inside the central 50% of each corner marker.
 */
export function calibrate(gray, H, layout) {
  const whites = [];
  for (const q of layout.questions) {
    // Average a short horizontal run to suppress single-pixel noise.
    const x = q.labelX + 8;
    const y = q.labelY;
    const v = (grayAtMm(gray, H, x - 0.8, y) + grayAtMm(gray, H, x, y) + grayAtMm(gray, H, x + 0.8, y)) / 3;
    whites.push(v);
  }
  const blacks = [];
  for (const m of layout.markers) {
    const half = m.size * 0.25;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        blacks.push(grayAtMm(gray, H, m.cx + i * half * 0.75, m.cy + j * half * 0.75));
      }
    }
  }
  const white = median(whites);
  const black = median(blacks);
  return { white, black, contrast: white - black };
}

const RING_ANGLES = 16;
const RING_COS = [];
const RING_SIN = [];
for (let i = 0; i < RING_ANGLES; i++) {
  const a = (2 * Math.PI * i) / RING_ANGLES + 0.1;
  RING_COS.push(Math.cos(a));
  RING_SIN.push(Math.sin(a));
}

/** Local paper brightness around a bubble (annulus just outside the printed outline). */
function localWhite(gray, H, cx, cy, r) {
  const vals = [];
  const radii = [r * 1.3, r * 1.5];
  for (const rad of radii) {
    for (let i = 0; i < RING_ANGLES; i++) {
      vals.push(grayAtMm(gray, H, cx + rad * RING_COS[i], cy + rad * RING_SIN[i]));
    }
  }
  return percentile(vals, 0.7);
}

/**
 * Fill fraction 0..1 of a bubble: mean of clamp((white - g) / (white - black)) over a grid inside
 * a disc of radius r * sampleRadiusFrac. `white` is estimated locally (ring around the bubble) so
 * uneven lighting does not bias the result; `black` scales with it. Falls back to the global
 * calibration when the local estimate is implausible.
 * (cx, cy, r) are in mm (layout coordinates).
 */
export function sampleFill(gray, H, cx, cy, r, cal, opts = DEFAULTS) {
  const o = opts || DEFAULTS;
  const grid = o.sampleGrid || DEFAULTS.sampleGrid;
  const rho = r * (o.sampleRadiusFrac || DEFAULTS.sampleRadiusFrac);

  let white = cal.white;
  let black = cal.black;
  const lw = localWhite(gray, H, cx, cy, r);
  if (lw > cal.black + 0.35 * cal.contrast && lw >= 0.4 * cal.white && lw <= 1.4 * cal.white) {
    white = Math.min(255, lw);
    black = cal.white > 0 ? cal.black * (white / cal.white) : cal.black;
  }
  const den = white - black;
  if (!(den > 1)) return 0;

  let sum = 0;
  let n = 0;
  const lim = rho * rho + 1e-9;
  for (let i = 0; i < grid; i++) {
    const u = grid === 1 ? 0 : (i / (grid - 1) * 2 - 1) * rho;
    for (let j = 0; j < grid; j++) {
      const v = grid === 1 ? 0 : (j / (grid - 1) * 2 - 1) * rho;
      if (u * u + v * v > lim) continue;
      const g = grayAtMm(gray, H, cx + u, cy + v);
      let f = (white - g) / den;
      if (f < 0) f = 0;
      else if (f > 1) f = 1;
      sum += f;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** answerFills[q-1][k], idFills[j][d]. */
export function sampleLayout(gray, H, layout, cal, opts = DEFAULTS) {
  const answerFills = layout.questions.map((q) =>
    q.bubbles.map((b) => sampleFill(gray, H, b.cx, b.cy, b.r, cal, opts)),
  );
  const idFills = layout.idBlock
    ? layout.idBlock.digits.map((d) => d.bubbles.map((b) => sampleFill(gray, H, b.cx, b.cy, b.r, cal, opts)))
    : [];
  return { answerFills, idFills };
}

function meanGrayRect(gray, H, cx, cy, hw, hh) {
  let s = 0;
  let n = 0;
  for (let i = 0; i < 9; i++) {
    const x = cx + (i / 8 * 2 - 1) * hw;
    for (let j = 0; j < 3; j++) {
      const y = cy + (j - 1) * hh;
      s += grayAtMm(gray, H, x, y);
      n++;
    }
  }
  return s / n;
}

/**
 * true = the sheet is upside down (180 deg). The orientation bar (solid black, top centre)
 * must be darker than the mirrored spot at the bottom centre (blank paper).
 */
export function checkOrientation(gray, H, layout) {
  const bar = layout.orientationBar;
  const cx = bar.x + bar.w / 2;
  const cy = bar.y + bar.h / 2;
  const hw = bar.w / 2 - 2;
  const hh = bar.h / 2 - 1.5;
  const mx = layout.page.widthMm - cx;
  const my = layout.page.heightMm - cy;
  const barMean = meanGrayRect(gray, H, cx, cy, hw, hh);
  const mirrorMean = meanGrayRect(gray, H, mx, my, hw, hh);
  return mirrorMean + 20 < barMean;
}
