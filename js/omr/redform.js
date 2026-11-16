// Red-ink answer sheets (KPM "Kertas Jawapan Objektif SPM", LPM/KOM 28). Pure JS, no DOM.
//
// Pipeline (docs/PLAN.md section 11):
//   1. redness map  rn = (R - max(G,B)) / max(R,110)  (lighting independent) + "red dropout" gray
//      rp = R + kappa * (R - max(G,B))  (red ink ~ paper, graphite stays dark)
//   2. frame: long straight lines (Hough + run length) -> candidate quadrilaterals
//   3. lattice fit: per 5-question block (then per row) local shift that maximises the match of the
//      printed red ellipses -> copes with curved paper and print tolerance; also decides 0/180 degrees
//   4. fill sampling in the red-dropout channel, then decide.js
// The reference frame is the answer panel (see forms/spm-kom28.js); layout units: x = u, y = v * aspect.

import { DEFAULTS } from "./config.js";
import { downscale } from "./image.js";
import { computeHomography, applyHomography } from "./homography.js";
import { decideRow } from "./decide.js";
import { SPM_KOM28_PARAMS as P, blockOf } from "./forms/spm-kom28.js";

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

const KAPPA = 1.0; // red dropout strength
const RN_FLOOR = 110; // see buildMaps
const OUTLINE_K = 12; // sample points on each ellipse outline
const MAX_TILT_DEG = 20;
const N_Q = P.maxQuestions;
const N_CH = P.choices.length;

// ---------------------------------------------------------------- maps
export function buildMaps(img) {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const rn = new Uint8Array(n);
  const rp = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const m = g > b ? g : b;
    const c = r - m;
    if (c > 0) {
      // denominator floor: dark pixels (laptop edges, shadows) have tiny chroma noise that would otherwise
      // read as strongly "red" and flood the line detector; printed red ink on paper has R >> 110.
      const v = (255 * c) / (r > RN_FLOOR ? r : RN_FLOOR);
      rn[i] = v > 255 ? 255 : v | 0;
      const q = r + KAPPA * c;
      rp[i] = q > 255 ? 255 : q;
    } else {
      rp[i] = r;
    }
  }
  return { w, h, rn, rp };
}

/** Separable box blur (radius r, edges clamped) of a Uint8 map. */
function boxBlur(src, w, h, r) {
  const size = 2 * r + 1;
  const tmp = new Uint16Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + (k < 0 ? 0 : k > w - 1 ? w - 1 : k)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum;
      const add = x + r + 1 > w - 1 ? w - 1 : x + r + 1;
      const sub = x - r < 0 ? 0 : x - r;
      sum += src[row + add] - src[row + sub];
    }
  }
  const area = size * size;
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[(k < 0 ? 0 : k > h - 1 ? h - 1 : k) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (sum / area + 0.5) | 0;
      const add = y + r + 1 > h - 1 ? h - 1 : y + r + 1;
      const sub = y - r < 0 ? 0 : y - r;
      sum += tmp[add * w + x] - tmp[sub * w + x];
    }
  }
  return out;
}

const blur3 = (src, w, h) => boxBlur(src, w, h, 1);

/** Ink level (99th percentile of rn) and mask threshold. */
function inkThreshold(rn) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < rn.length; i++) hist[rn[i]]++;
  const target = rn.length * 0.99;
  let acc = 0;
  let p = 0;
  for (; p < 256; p++) {
    acc += hist[p];
    if (acc >= target) break;
  }
  return { p99: p, T: Math.max(16, Math.min(48, Math.round(0.3 * p))) };
}

// ---------------------------------------------------------------- lines
// A line is { nx, ny, c } with nx*x + ny*y = c, (nx, ny) unit normal.

function bilin8(map, w, h, x, y) {
  if (!(x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1)) return 0;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const fx = x - x0;
  const fy = y - y0;
  const a = map[y0 * w + x0];
  const b = map[y0 * w + x1];
  const c = map[y1 * w + x0];
  const d = map[y1 * w + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function collectPoints(mask, w, h, maxPts) {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
  const stride = Math.max(1, Math.ceil(count / maxPts));
  const xs = new Int16Array(Math.ceil(count / stride) + 1);
  const ys = new Int16Array(xs.length);
  let n = 0;
  let k = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (k++ % stride === 0) {
          xs[n] = x;
          ys[n] = y;
          n++;
        }
      }
    }
  }
  return { xs, ys, n };
}

/** Longest run (gap tolerant) of mask hits along a line. -> { len, p0, p1 } */
function runScore(mask, w, h, nx, ny, c, gap, band) {
  const dx = -ny;
  const dy = nx;
  const bx = nx * c;
  const by = ny * c;
  const L = Math.ceil(Math.hypot(w, h));
  let best = 0;
  let bestA = 0;
  let bestB = 0;
  let has = false;
  let start = 0;
  let last = 0;
  for (let u = -L; u <= L; u++) {
    const x = bx + u * dx;
    const y = by + u * dy;
    if (x < 1 || y < 1 || x > w - 2 || y > h - 2) continue;
    let hit = false;
    for (let d = -band; d <= band && !hit; d++) {
      const xi = Math.round(x + d * nx);
      const yi = Math.round(y + d * ny);
      if (xi >= 0 && yi >= 0 && xi < w && yi < h && mask[yi * w + xi]) hit = true;
    }
    if (!hit) continue;
    if (!has) {
      has = true;
      start = u;
    } else if (u - last > gap) {
      if (last - start > best) {
        best = last - start;
        bestA = start;
        bestB = last;
      }
      start = u;
    }
    last = u;
  }
  if (has && last - start > best) {
    best = last - start;
    bestA = start;
    bestB = last;
  }
  return {
    len: best,
    p0: { x: bx + bestA * dx, y: by + bestA * dy },
    p1: { x: bx + bestB * dx, y: by + bestB * dy },
  };
}

function houghLines(mask, pts, w, h, family, K) {
  const base = family === "H" ? 90 : 0;
  const nT = 2 * MAX_TILT_DEG + 1;
  const diag = Math.ceil(Math.hypot(w, h)) + 2;
  const RB = 3;
  const nR = Math.ceil((2 * diag) / RB) + 2;
  const acc = new Int32Array(nT * nR);
  const { xs, ys, n } = pts;
  for (let t = 0; t < nT; t++) {
    const th = ((base - MAX_TILT_DEG + t) * Math.PI) / 180;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    const off = t * nR;
    for (let i = 0; i < n; i++) {
      const r = ((xs[i] * cs + ys[i] * sn + diag) / RB) | 0;
      acc[off + r]++;
    }
  }
  const lines = [];
  const minVotes = Math.max(40, Math.min(w, h) * 0.12);
  for (let k = 0; k < K; k++) {
    let bi = 0;
    let bv = 0;
    for (let i = 0; i < acc.length; i++) {
      if (acc[i] > bv) {
        bv = acc[i];
        bi = i;
      }
    }
    if (bv < minVotes) break;
    const t = (bi / nR) | 0;
    const r = bi - t * nR;
    for (let tt = Math.max(0, t - 2); tt <= Math.min(nT - 1, t + 2); tt++) {
      for (let rr = Math.max(0, r - 3); rr <= Math.min(nR - 1, r + 3); rr++) acc[tt * nR + rr] = 0;
    }
    // refine on run length
    const th0 = ((base - MAX_TILT_DEG + t) * Math.PI) / 180;
    const rho0 = r * RB - diag + RB / 2;
    let best = null;
    for (let dt = -2; dt <= 2; dt++) {
      const th = th0 + (dt * 0.3 * Math.PI) / 180;
      const nx = Math.cos(th);
      const ny = Math.sin(th);
      for (let dr = -2; dr <= 2; dr += 1) {
        const c = rho0 + dr;
        const s = runScore(mask, w, h, nx, ny, c, 8, 1);
        if (!best || s.len > best.len) best = { len: s.len, p0: s.p0, p1: s.p1, nx, ny, c };
      }
    }
    if (best && best.len > Math.min(w, h) * 0.12) lines.push(best);
  }
  lines.sort((a, b) => b.len - a.len);
  return lines;
}

function lineAt(line, fixed, byX) {
  // byX: given x -> y ; else given y -> x
  if (byX) return (line.c - line.nx * fixed) / (Math.abs(line.ny) < 1e-9 ? 1e-9 : line.ny);
  return (line.c - line.ny * fixed) / (Math.abs(line.nx) < 1e-9 ? 1e-9 : line.nx);
}

function intersect(a, b) {
  const det = a.nx * b.ny - a.ny * b.nx;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (a.c * b.ny - a.ny * b.c) / det, y: (a.nx * b.c - a.c * b.nx) / det };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDeg(a, b, c) {
  // angle at b between a-b and c-b
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const cs = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-9);
  return (Math.acos(Math.max(-1, Math.min(1, cs))) * 180) / Math.PI;
}

function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Fraction of a side (p -> q) covered by mask pixels within +-band px of the segment. */
function segCoverage(mask, w, h, p, q, band) {
  const n = 64;
  let hits = 0;
  let valid = 0;
  const len = dist(p, q) || 1;
  const nx = -(q.y - p.y) / len;
  const ny = (q.x - p.x) / len;
  for (let i = 0; i < n; i++) {
    const t = 0.04 + (0.92 * i) / (n - 1);
    const x = p.x + (q.x - p.x) * t;
    const y = p.y + (q.y - p.y) * t;
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) continue; // cropped photo: judge only the visible part
    valid++;
    let hit = false;
    for (let d = -band; d <= band && !hit; d += 1) {
      const xi = Math.round(x + d * nx);
      const yi = Math.round(y + d * ny);
      if (xi >= 0 && yi >= 0 && xi < w && yi < h && mask[yi * w + xi]) hit = true;
    }
    if (hit) hits++;
  }
  return valid >= 8 ? hits / valid : 0;
}

/** Unit direction along a line, pointing right (H) or down (V). */
function lineDir(l, family) {
  let dx = -l.ny;
  let dy = l.nx;
  if ((family === "H" && dx < 0) || (family === "V" && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  return { x: dx, y: dy };
}

/** Drop near-duplicate lines (a dense texture yields many almost identical Hough peaks). */
function dedupeLines(lines, w, h, family, n) {
  const out = [];
  const tol = 0.015 * Math.hypot(w, h);
  const mid = family === "H" ? w / 2 : h / 2;
  for (const l of lines) {
    const a = Math.atan2(l.ny, l.nx);
    const at = lineAt(l, mid, family === "H");
    if (out.some((o) => Math.abs(Math.atan2(o.ny, o.nx) - a) < (3 * Math.PI) / 180 && Math.abs(lineAt(o, mid, family === "H") - at) < tol)) continue;
    out.push(l);
    if (out.length >= n) break;
  }
  return out;
}

/** Candidate frame quadrilaterals (image order TL, TR, BR, BL) from long straight lines. */
function frameCandidates(mask, w, h, opts) {
  const pts = collectPoints(mask, w, h, 260000);
  if (pts.n < 200) return { quads: [], lines: 0 };
  const nl = (opts && opts.nLines) || 14;
  const hs = dedupeLines(houghLines(mask, pts, w, h, "H", 140), w, h, "H", nl);
  const vs = dedupeLines(houghLines(mask, pts, w, h, "V", 140), w, h, "V", nl);
  const dbg = opts && opts.debug;
  const why = { aspect: 0, area: 0, angle: 0, cov: 0, ok: 0, outside: 0, ok3: 0 };
  if (dbg) {
    dbg.pts = pts.n;
    dbg.hs = hs.map((l) => ({ len: Math.round(l.len), p0: l.p0, p1: l.p1 }));
    dbg.vs = vs.map((l) => ({ len: Math.round(l.len), p0: l.p0, p1: l.p1 }));
    dbg.why = why;
  }
  const band = Math.max(4, Math.round(Math.max(w, h) * 0.006));
  const quads = [];
  const margin = 0.04;
  const inside = (p) => p && p.x > -margin * w && p.x < (1 + margin) * w && p.y > -margin * h && p.y < (1 + margin) * h;
  const midX = w / 2;
  const midY = h / 2;
  for (let i = 0; i < hs.length; i++) {
    for (let j = 0; j < hs.length; j++) {
      if (i === j) continue;
      const top = hs[i];
      const bot = hs[j];
      if (lineAt(top, midX, true) >= lineAt(bot, midX, true) - h * 0.1) continue;
      for (let k = 0; k < vs.length; k++) {
        for (let m = 0; m < vs.length; m++) {
          if (k === m) continue;
          const left = vs[k];
          const right = vs[m];
          if (lineAt(left, midY, false) >= lineAt(right, midY, false) - w * 0.1) continue;
          const TL = intersect(top, left);
          const TR = intersect(top, right);
          const BR = intersect(bot, right);
          const BL = intersect(bot, left);
          if (!inside(TL) || !inside(TR) || !inside(BR) || !inside(BL)) {
            why.outside++;
            continue;
          }
          const wTop = dist(TL, TR);
          const wBot = dist(BL, BR);
          const hL = dist(TL, BL);
          const hR = dist(TR, BR);
          const aspect = (wTop + wBot) / (hL + hR);
          if (aspect < 0.45 || aspect > 0.95) {
            why.aspect++;
            continue;
          }
          const area = polyArea([TL, TR, BR, BL]);
          if (area < 0.1 * w * h) {
            why.area++;
            continue;
          }
          let ok = true;
          for (const ang of [angleDeg(BL, TL, TR), angleDeg(TL, TR, BR), angleDeg(TR, BR, BL), angleDeg(BR, BL, TL)]) {
            if (ang < 70 || ang > 110) ok = false;
          }
          if (!ok) {
            why.angle++;
            continue;
          }
          const cov = [
            segCoverage(mask, w, h, TL, TR, band),
            segCoverage(mask, w, h, BL, BR, band),
            segCoverage(mask, w, h, TL, BL, band),
            segCoverage(mask, w, h, TR, BR, band),
          ];
          const minCov = Math.min(...cov);
          const meanCov = (cov[0] + cov[1] + cov[2] + cov[3]) / 4;
          if (minCov < 0.3 || meanCov < 0.5) {
            why.cov++;
            continue;
          }
          why.ok++;
          // coverage dominates: the answer panel (inner frame) must not be crowded out by outer-frame variants
          quads.push({ corners: [TL, TR, BR, BL], score: meanCov * meanCov * minCov * Math.pow(area / (w * h), 0.25), cov: meanCov, area });
        }
      }
    }
  }
  // 3-line candidates: one side of the panel is missing (cropped photo, faint print); complete it from the known
  // panel aspect. The corner refinement in selectFrame() fixes the perspective error of this guess.
  const A = P.aspect;
  const far = 0.3;
  const insideFar = (p) => p && p.x > -far * w && p.x < (1 + far) * w && p.y > -far * h && p.y < (1 + far) * h;
  const add3 = (corners, real) => {
    const [TL, TR, BR, BL] = corners;
    if (!corners.every(insideFar)) return;
    const segs = { top: [TL, TR], bottom: [BL, BR], left: [TL, BL], right: [TR, BR] };
    const cov = real.map((k) => segCoverage(mask, w, h, segs[k][0], segs[k][1], band));
    const minCov = Math.min(...cov);
    const meanCov = cov.reduce((x, y) => x + y, 0) / cov.length;
    if (minCov < 0.35 || meanCov < 0.55) return;
    for (const ang of [angleDeg(BL, TL, TR), angleDeg(TL, TR, BR), angleDeg(TR, BR, BL), angleDeg(BR, BL, TL)]) if (ang < 65 || ang > 115) return;
    const area = polyArea(corners);
    if (area < 0.08 * w * h) return;
    why.ok3++;
    quads.push({ corners, score: 0.8 * meanCov * meanCov * minCov * Math.pow(Math.min(1, area / (w * h)), 0.25), cov: meanCov, area, partial: true });
  };
  const along = (p, d, t) => ({ x: p.x + d.x * t, y: p.y + d.y * t });
  for (const top of hs) {
    const dT = lineDir(top, "H");
    for (let k = 0; k < vs.length; k++) {
      for (let m = 0; m < vs.length; m++) {
        if (k === m) continue;
        const left = vs[k];
        const right = vs[m];
        if (lineAt(left, midY, false) >= lineAt(right, midY, false) - w * 0.1) continue;
        const TL = intersect(top, left);
        const TR = intersect(top, right);
        if (!inside(TL) || !inside(TR)) continue;
        const W = dist(TL, TR);
        const dL = lineDir(left, "V");
        const dR = lineDir(right, "V");
        add3([TL, TR, along(TR, dR, A * W), along(TL, dL, A * W)], ["top", "left", "right"]); // no bottom
      }
    }
    for (const bot of hs) {
      if (bot === top || lineAt(top, midX, true) >= lineAt(bot, midX, true) - h * 0.1) continue;
      const dB = lineDir(bot, "H");
      for (const side of vs) {
        const P1 = intersect(top, side);
        const P2 = intersect(bot, side);
        if (!inside(P1) || !inside(P2)) continue;
        const W = dist(P1, P2) / A;
        add3([P1, along(P1, dT, W), along(P2, dB, W), P2], ["top", "bottom", "left"]); // side = left, no right
        add3([along(P1, dT, -W), P1, P2, along(P2, dB, -W)], ["top", "bottom", "right"]); // side = right, no left
      }
    }
  }
  for (const bot of hs) {
    for (let k = 0; k < vs.length; k++) {
      for (let m = 0; m < vs.length; m++) {
        if (k === m) continue;
        const left = vs[k];
        const right = vs[m];
        if (lineAt(left, midY, false) >= lineAt(right, midY, false) - w * 0.1) continue;
        const BL = intersect(bot, left);
        const BR = intersect(bot, right);
        if (!inside(BL) || !inside(BR)) continue;
        const W = dist(BL, BR);
        add3([along(BL, lineDir(left, "V"), -A * W), along(BR, lineDir(right, "V"), -A * W), BR, BL], ["bottom", "left", "right"]); // no top
      }
    }
  }

  quads.sort((a, b) => b.score - a.score);
  // drop near-duplicates
  const tol = 0.012 * Math.hypot(w, h);
  const out = [];
  for (const q of quads) {
    if (out.some((o) => o.corners.every((c, i) => dist(c, q.corners[i]) < tol))) continue;
    out.push(q);
    if (out.length >= (opts && opts.maxQuads ? opts.maxQuads : 6)) break;
  }
  return { quads: out, lines: hs.length + vs.length };
}

// ---------------------------------------------------------------- profile candidates
/**
 * Line-independent candidates from the bubble lattice itself (far / tilted photos, where the thin printed
 * frame lines vanish): deskew by column sharpness, match the 12-column pattern (4 | 4 | 4) on the x profile,
 * then the 30-row / 6-block pattern on the y profile inside that column range. Returns upright rectangles
 * (rotated by the deskew angle); refineCorners() then fits the perspective.
 */
function profileCandidates(mask, w, h, maxOut = 12) {
  const pts = collectPoints(mask, w, h, 60000);
  if (pts.n < 500) return [];
  const { xs, ys, n } = pts;
  const D = Math.hypot(w, h);
  const nb = Math.ceil(2 * D) + 2;
  const off = Math.ceil(D) + 1;
  // 1. deskew: angle with the sharpest x' histogram (bubble columns become narrow peaks)
  let bestA = 0;
  let bestE = -1;
  const hist = new Float64Array(nb);
  for (let a = -24; a <= 24; a += 1.5) {
    const t = (a * Math.PI) / 180;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    hist.fill(0);
    for (let i = 0; i < n; i++) hist[((xs[i] * c + ys[i] * sn) / 2 + off / 2) | 0]++;
    let e = 0;
    for (let i = 0; i < hist.length; i++) e += hist[i] * hist[i];
    if (e > bestE) {
      bestE = e;
      bestA = t;
    }
  }
  const c = Math.cos(bestA);
  const sn = Math.sin(bestA);
  const xr = new Float32Array(n);
  const yr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xr[i] = xs[i] * c + ys[i] * sn;
    yr[i] = -xs[i] * sn + ys[i] * c;
  }
  const prefix = (vals, mask2) => {
    const hst = new Float64Array(nb);
    for (let i = 0; i < n; i++) if (!mask2 || mask2(i)) hst[(vals[i] + off) | 0]++;
    const pf = new Float64Array(nb + 1);
    for (let i = 0; i < nb; i++) pf[i + 1] = pf[i] + hst[i];
    return (a, b) => {
      const lo = Math.max(0, Math.min(nb, Math.round(a + off)));
      const hi = Math.max(0, Math.min(nb, Math.round(b + off)));
      return hi > lo ? (pf[hi] - pf[lo]) / (hi - lo) : 0;
    };
  };
  // 2. x profile: 12 choice columns vs the paper between them
  const winX = prefix(xr);
  // the bold question numbers left of column A look like a fifth column; model them, otherwise the pattern
  // slides one column (numbers taken as A) or one group
  const NUM_DU = 0.033;
  const cols = P.colX.flat();
  const peaksX = cols.concat(P.colX.map((g) => g[0] - NUM_DU));
  const gapsX = [];
  for (const g of P.colX) for (let k = 0; k + 1 < g.length; k++) gapsX.push((g[k] + g[k + 1]) / 2);
  for (let k = 0; k + 1 < P.colX.length; k++) gapsX.push((P.colX[k][N_CH - 1] + P.colX[k + 1][0] - NUM_DU) / 2);
  gapsX.push(0.965); // paper between the last D column and the right frame line
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xr[i] < minX) minX = xr[i];
    if (xr[i] > maxX) maxX = xr[i];
  }
  const xc = [];
  for (let W = 0.18 * Math.min(w, h); W <= 1.05 * Math.max(w, h); W *= 1.015) {
    const hw = Math.max(1, P.bubble.rx * W * 0.7);
    const gw = Math.max(1, P.bubble.rx * W * 0.35);
    const step = Math.max(1, W * 0.004);
    for (let x0 = minX - 0.1 * W; x0 + 0.9 * W <= maxX; x0 += step) {
      let pk = 0;
      for (const u of peaksX) pk += winX(x0 + u * W - hw, x0 + u * W + hw);
      let gp = 0;
      for (const u of gapsX) gp += winX(x0 + u * W - gw, x0 + u * W + gw);
      xc.push({ W, x0, s: pk / peaksX.length - gp / gapsX.length });
    }
  }
  xc.sort((a, b) => b.s - a.s);
  const xTop = [];
  for (const e of xc) {
    if (xTop.some((o) => Math.abs(o.x0 - e.x0) < 0.08 * o.W && Math.abs(o.W / e.W - 1) < 0.08)) continue;
    xTop.push(e);
    if (xTop.length >= 3) break;
  }
  // 3. y profile inside the column range: 30 rows vs the gaps between 5-question blocks
  const rows = P.rowV;
  const gapsY = [];
  for (let r = P.blockSize; r < rows.length; r += P.blockSize) gapsY.push((rows[r - 1] + rows[r]) / 2);
  const out = [];
  for (const xe of xTop) {
    const lo = xe.x0 + (cols[0] - 0.03) * xe.W;
    const hi = xe.x0 + (cols[cols.length - 1] + 0.03) * xe.W;
    const inside = (i) => xr[i] >= lo && xr[i] <= hi;
    // rows get their own angle: a photo taken at a slant shears the sheet, so rows and columns are not
    // perpendicular in the image
    let bestB = bestA;
    let bestEb = -1;
    for (let db = -12; db <= 12; db += 1) {
      const t = bestA + (db * Math.PI) / 180;
      const cb = Math.cos(t);
      const sb = Math.sin(t);
      hist.fill(0);
      for (let i = 0; i < n; i++) if (inside(i)) hist[((-xs[i] * sb + ys[i] * cb) / 2 + off / 2) | 0]++;
      let e = 0;
      for (let i = 0; i < hist.length; i++) e += hist[i] * hist[i];
      if (e > bestEb) {
        bestEb = e;
        bestB = t;
      }
    }
    // try the sheared row angle and plain perpendicular rows; the robust score picks
    const angles = Math.abs(bestB - bestA) > 0.02 ? [bestA, bestB] : [bestA];
    for (const angB of angles) {
      const cb = Math.cos(angB);
      const sb = Math.sin(angB);
      for (let i = 0; i < n; i++) yr[i] = -xs[i] * sb + ys[i] * cb;
      const winY = prefix(yr, inside);
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        if (!inside(i)) continue;
        if (yr[i] < minY) minY = yr[i];
        if (yr[i] > maxY) maxY = yr[i];
      }
      const yc = [];
      for (let f = 0.6; f <= 1.4; f *= 1.015) {
        const Hh = P.aspect * xe.W * f;
        const hw = Math.max(1, P.bubble.ry * Hh * 0.8);
        const gw = Math.max(1, P.bubble.ry * Hh * 1.2);
        for (let y0 = minY - 0.15 * Hh; y0 + 0.85 * Hh <= maxY + 0.15 * Hh; y0 += Math.max(1, Hh * 0.003)) {
          let pk = 0;
          for (const v of rows) pk += winY(y0 + v * Hh - hw, y0 + v * Hh + hw);
          let gp = 0;
          for (const v of gapsY) gp += winY(y0 + v * Hh - gw, y0 + v * Hh + gw);
          yc.push({ Hh, y0, s: pk / rows.length - gp / gapsY.length });
        }
      }
      yc.sort((a, b) => b.s - a.s);
      const yTop = [];
      for (const e of yc) {
        if (yTop.some((o) => Math.abs(o.y0 - e.y0) < 0.05 * o.Hh && Math.abs(o.Hh / e.Hh - 1) < 0.05)) continue;
        yTop.push(e);
        if (yTop.length >= 2) break;
      }
      for (const ye of yTop) {
        // solve x*c + y*sn = X and -x*sb + y*cb = Y
        const det = c * cb + sn * sb;
        const back = (X, Y) => ({ x: (X * cb - Y * sn) / det, y: (X * sb + Y * c) / det });
        const { x0, W } = xe;
        const { y0, Hh } = ye;
        out.push({ corners: [back(x0, y0), back(x0 + W, y0), back(x0 + W, y0 + Hh), back(x0, y0 + Hh)], score: xe.s + ye.s, profile: true });
      }
    }
  }
  return out.slice(0, maxOut);
}

// ---------------------------------------------------------------- lattice
const BUBBLES = []; // [{ q, k, u, v, block }] for all printed bubbles (80 x 4)
const BLOCKS = []; // [{ col, block, items: [index into BUBBLES], rows: [[index x4] x5] }]
(function init() {
  const blockIndex = new Map();
  for (let q = 1; q <= N_Q; q++) {
    const { col, block, row } = blockOf(q);
    const key = col * 10 + block;
    if (!blockIndex.has(key)) {
      blockIndex.set(key, BLOCKS.length);
      BLOCKS.push({ col, block, items: [], rows: [] });
    }
    const b = BLOCKS[blockIndex.get(key)];
    const rowIdx = [];
    for (let k = 0; k < N_CH; k++) {
      const idx = BUBBLES.length;
      BUBBLES.push({ q, k, u: P.colX[col][k], v: P.rowV[row], block: blockIndex.get(key) });
      b.items.push(idx);
      rowIdx.push(idx);
    }
    b.rows.push(rowIdx);
  }
})();

const PHI = [];
for (let i = 0; i < OUTLINE_K; i++) PHI.push((2 * Math.PI * i) / OUTLINE_K);

/** Per-bubble pixel centres and outline offsets for a unit->px homography. */
function projectBubbles(Hu) {
  const cx = new Float32Array(BUBBLES.length);
  const cy = new Float32Array(BUBBLES.length);
  const off = new Float32Array(BUBBLES.length * OUTLINE_K * 2);
  const { rx, ry } = P.bubble;
  for (let i = 0; i < BUBBLES.length; i++) {
    const b = BUBBLES[i];
    const c = applyHomography(Hu, b.u, b.v);
    cx[i] = c.x;
    cy[i] = c.y;
    for (let k = 0; k < OUTLINE_K; k++) {
      const p = applyHomography(Hu, b.u + rx * Math.cos(PHI[k]), b.v + ry * Math.sin(PHI[k]));
      off[(i * OUTLINE_K + k) * 2] = p.x - c.x;
      off[(i * OUTLINE_K + k) * 2 + 1] = p.y - c.y;
    }
  }
  return { cx, cy, off };
}

function outlineScore(map, w, h, pr, i, sx, sy) {
  let s = 0;
  const x0 = pr.cx[i] + sx;
  const y0 = pr.cy[i] + sy;
  const base = i * OUTLINE_K * 2;
  for (let k = 0; k < OUTLINE_K; k++) {
    const x = Math.round(x0 + pr.off[base + k * 2]);
    const y = Math.round(y0 + pr.off[base + k * 2 + 1]);
    if (x >= 0 && y >= 0 && x < w && y < h) s += map[y * w + x];
  }
  return s / OUTLINE_K;
}

function blockScore(map, w, h, pr, items, sx, sy) {
  let s = 0;
  for (let t = 0; t < items.length; t++) s += outlineScore(map, w, h, pr, items[t], sx, sy);
  return s / items.length;
}

/**
 * "Blob" response: centre + outline points at half scale on a box-blurred redness map. The printed
 * ellipse outline is thin while the question numbers and the letters A-D are bold, so an outline-only
 * match locks half a bubble off (two peaks); the blob (ellipse + letter) has a single peak at the centre.
 */
function blobScore(map, w, h, pr, i, sx, sy) {
  const x0 = pr.cx[i] + sx;
  const y0 = pr.cy[i] + sy;
  let x = Math.round(x0);
  let y = Math.round(y0);
  let s = x >= 0 && y >= 0 && x < w && y < h ? map[y * w + x] : 0;
  const base = i * OUTLINE_K * 2;
  for (let k = 0; k < OUTLINE_K; k++) {
    x = Math.round(x0 + 0.5 * pr.off[base + k * 2]);
    y = Math.round(y0 + 0.5 * pr.off[base + k * 2 + 1]);
    if (x >= 0 && y >= 0 && x < w && y < h) s += map[y * w + x];
  }
  return s / (OUTLINE_K + 1);
}

function blockBlob(map, w, h, pr, items, sx, sy) {
  let s = 0;
  for (let t = 0; t < items.length; t++) s += blobScore(map, w, h, pr, items[t], sx, sy);
  return s / items.length;
}

/**
 * Local lattice fit. Returns { quality, good, shifts: [{dx,dy}] per bubble, pr }.
 * quality = mean outline redness after snapping; good = fraction of bubbles above `T`.
 */
function fitLattice(maps, rnS, Hu, T, frameW, opts) {
  const { w, h } = maps;
  const pr = projectBubbles(Hu);
  const snapMap = maps.rnM || rnS;
  const snap = maps.rnM ? blockBlob : blockScore;
  const S = Math.max(4, Math.round((opts && opts.searchFrac ? opts.searchFrac : 0.022) * frameW));
  const shiftX = new Float32Array(BUBBLES.length);
  const shiftY = new Float32Array(BUBBLES.length);

  for (const blk of BLOCKS) {
    let best = -1;
    let bx = 0;
    let by = 0;
    const step = S > 8 ? 2 : 1;
    for (let dy = -S; dy <= S; dy += step) {
      for (let dx = -S; dx <= S; dx += step) {
        const s = snap(snapMap, w, h, pr, blk.items, dx, dy) - 0.02 * (Math.abs(dx) + Math.abs(dy));
        if (s > best) {
          best = s;
          bx = dx;
          by = dy;
        }
      }
    }
    if (step > 1) {
      let rx0 = bx;
      let ry0 = by;
      for (let dy = ry0 - 1; dy <= ry0 + 1; dy++) {
        for (let dx = rx0 - 1; dx <= rx0 + 1; dx++) {
          const s = snap(snapMap, w, h, pr, blk.items, dx, dy) - 0.02 * (Math.abs(dx) + Math.abs(dy));
          if (s > best) {
            best = s;
            bx = dx;
            by = dy;
          }
        }
      }
    }
    // row refinement around the block shift (small, regularised)
    for (const row of blk.rows) {
      const base = snap(snapMap, w, h, pr, row, bx, by);
      let rbest = base;
      let rdx = bx;
      let rdy = by;
      for (let dy = by - 3; dy <= by + 3; dy++) {
        for (let dx = bx - 3; dx <= bx + 3; dx++) {
          const pen = 0.6 * ((dx - bx) * (dx - bx) + (dy - by) * (dy - by));
          const s = snap(snapMap, w, h, pr, row, dx, dy) - pen;
          if (s > rbest) {
            rbest = s;
            rdx = dx;
            rdy = dy;
          }
        }
      }
      for (const idx of row) {
        shiftX[idx] = rdx;
        shiftY[idx] = rdy;
      }
    }
  }
  let sum = 0;
  let good = 0;
  for (let i = 0; i < BUBBLES.length; i++) {
    const s = outlineScore(rnS, w, h, pr, i, shiftX[i], shiftY[i]);
    sum += s;
    if (s >= T) good++;
  }
  let bsum = 0;
  if (maps.rnM) for (let i = 0; i < BUBBLES.length; i++) bsum += blobScore(maps.rnM, w, h, pr, i, shiftX[i], shiftY[i]);
  return { quality: sum / BUBBLES.length, good: good / BUBBLES.length, blob: bsum / BUBBLES.length, shiftX, shiftY, pr };
}

// ---------------------------------------------------------------- homography LS
function solveLinear(A, b) {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let c = r + 1; c < n; c++) s -= m[r][c] * x[c];
    x[r] = s / m[r][r];
  }
  return x;
}

/** Least-squares homography src -> dst (h[8] = 1) with Hartley-style normalisation. */
export function fitHomographyLS(src, dst) {
  const n = src.length;
  if (n < 4) return null;
  const nrm = (pts) => {
    let mx = 0;
    let my = 0;
    for (const p of pts) {
      mx += p.x;
      my += p.y;
    }
    mx /= pts.length;
    my /= pts.length;
    let d = 0;
    for (const p of pts) d += Math.hypot(p.x - mx, p.y - my);
    d /= pts.length;
    const s = d > 1e-9 ? Math.SQRT2 / d : 1;
    return { mx, my, s };
  };
  const ns = nrm(src);
  const nd = nrm(dst);
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const acc = (row, rhs) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let i = 0; i < n; i++) {
    const x = (src[i].x - ns.mx) * ns.s;
    const y = (src[i].y - ns.my) * ns.s;
    const u = (dst[i].x - nd.mx) * nd.s;
    const v = (dst[i].y - nd.my) * nd.s;
    acc([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    acc([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const sol = solveLinear(AtA, Atb);
  if (!sol) return null;
  const Hn = [sol[0], sol[1], sol[2], sol[3], sol[4], sol[5], sol[6], sol[7], 1];
  // H = Td^-1 * Hn * Ts
  const Ts = [ns.s, 0, -ns.s * ns.mx, 0, ns.s, -ns.s * ns.my, 0, 0, 1];
  const TdInv = [1 / nd.s, 0, nd.mx, 0, 1 / nd.s, nd.my, 0, 0, 1];
  const mul = (A, B) => {
    const o = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
    return o;
  };
  const Hf = mul(TdInv, mul(Hn, Ts));
  const k = Hf[8];
  if (!(Math.abs(k) > 1e-12)) return null;
  const out = Hf.map((v) => v / k);
  return out.every(Number.isFinite) ? out : null;
}

// ---------------------------------------------------------------- orientation + selection
const UNIT = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function rotateCorners(c, rot180) {
  return rot180 ? [c[2], c[3], c[0], c[1]] : c;
}

const COARSE_PHI = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (2 * Math.PI * i) / 8);

/** Cheap lattice response (no snapping) on a heavily blurred redness map: mean over all ellipses. */
function coarseScore(rnB, w, h, Hu) {
  const { rx, ry } = P.bubble;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < BUBBLES.length; i++) {
    const b = BUBBLES[i];
    for (let k = -1; k < COARSE_PHI.length; k++) {
      const du = k < 0 ? 0 : rx * Math.cos(COARSE_PHI[k]);
      const dv = k < 0 ? 0 : ry * Math.sin(COARSE_PHI[k]);
      const p = applyHomography(Hu, b.u + du, b.v + dv);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (x >= 0 && y >= 0 && x < w && y < h) sum += rnB[y * w + x];
      n++;
    }
  }
  return sum / n;
}

// "Gap" points: places on the panel that are always paper (between 5-question blocks, between the three
// question columns). Contrast = bubbles - gaps penalises a lattice that is too small/large or a row/column off.
const GAPS = [];
(function initGaps() {
  const v = P.rowV;
  const per = P.blockSize;
  for (let col = 0; col < P.colX.length; col++) {
    for (let r = per; r < v.length; r += per) {
      const gv = (v[r - 1] + v[r]) / 2;
      for (const u of P.colX[col]) GAPS.push({ u, v: gv });
    }
  }
  for (let col = 0; col + 1 < P.colX.length; col++) {
    const gu = (P.colX[col][N_CH - 1] + P.colX[col + 1][0]) / 2;
    for (let r = 0; r < v.length; r += 2) GAPS.push({ u: gu, v: v[r] });
  }
  // Symmetry breakers (the lattice is periodic per 5-row block and nearly 180-degree symmetric):
  // the paper strip above row 1, and the empty slots below question 80 in the third column.
  const allU = P.colX.flat();
  const topV = v[0] - 1.6 * (v[1] - v[0]);
  for (const u of allU) GAPS.push({ u, v: topV });
  const last = P.colX.length - 1;
  const used = N_Q - last * P.perColumn; // rows used in the last column (80 - 60 = 20)
  for (let r = used; r < v.length; r++) for (const u of P.colX[last]) GAPS.push({ u, v: v[r] });
})();

// Points on the four panel frame lines: the one feature that pins the lattice vertically (the paper strip
// above row 1 looks exactly like a gap between 5-row blocks, so without it a one-block shift scores the same).
const FRAME = [];
for (let t = 0.02; t < 1; t += 0.04) FRAME.push({ u: t, v: 0 }, { u: t, v: 1 }, { u: 0, v: t }, { u: 1, v: t });
const FRAME_W = 0.3;

/** Mean of `map` at the projected points that fall inside the image -> { mean, frac }. */
function sampleMean(map, w, h, Hu, pts) {
  let s = 0;
  let n = 0;
  for (const q of pts) {
    const p = applyHomography(Hu, q.u, q.v);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x >= 0 && y >= 0 && x < w && y < h) {
      s += map[y * w + x];
      n++;
    }
  }
  return { mean: n ? s / n : 0, frac: n / pts.length };
}

/**
 * bubbles + frame - gaps. Points outside the photo are unknown, not empty (cropped photos), but the
 * lattice must stay mostly inside the image.
 */
function latticeContrast(map, w, h, Hu) {
  const b = sampleMean(map, w, h, Hu, BUBBLES);
  const f = sampleMean(map, w, h, Hu, FRAME);
  const g = sampleMean(map, w, h, Hu, GAPS);
  return (b.mean + FRAME_W * f.mean - g.mean) * Math.min(1, b.frac / 0.75);
}

/**
 * Coarse-to-fine hill climb of the 4 frame corners on increasingly sharp blur maps, maximising the lattice
 * contrast. Heavy blur first so the climb is not trapped one row/choice off; fixes perspective and the
 * guessed side of 3-line candidates.
 */
function refineCorners(prep, corners, fineOnly) {
  const { w, h } = prep.maps;
  const diag = Math.hypot(w, h);
  let c = corners.map((p) => ({ x: p.x, y: p.y }));
  const levels = [
    [prep.rnD, 0.02],
    [prep.rnC, 0.01],
    [prep.rnB, 0.005],
    [prep.maps.rnM, 0.0025],
  ].slice(fineOnly ? 2 : 0);
  const moves = [];
  for (let i = 0; i < 4; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) moves.push({ i, dx, dy });
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) moves.push({ i: -1, dx, dy }); // translate all
  moves.push({ s: 1 }, { s: -1 }); // scale about the centre
  let best = -Infinity;
  for (const [map, frac] of levels) {
    const step = Math.max(1, frac * diag);
    let H = computeHomography(UNIT, c);
    if (!H) return null;
    best = latticeContrast(map, w, h, H);
    for (let it = 0; it < 40; it++) {
      let improved = false;
      for (const mv of moves) {
        let t;
        if (mv.s) {
          const cx = (c[0].x + c[1].x + c[2].x + c[3].x) / 4;
          const cy = (c[0].y + c[1].y + c[2].y + c[3].y) / 4;
          const k = 1 + (mv.s * step) / Math.max(1, dist(c[0], c[2]));
          t = c.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
        } else {
          t = c.map((p, j) => (mv.i < 0 || mv.i === j ? { x: p.x + mv.dx * step, y: p.y + mv.dy * step } : p));
        }
        const H2 = computeHomography(UNIT, t);
        if (!H2) continue;
        const sc = latticeContrast(map, w, h, H2);
        if (sc > best + 1e-6) {
          best = sc;
          c = t;
          improved = true;
        }
      }
      if (!improved) break;
    }
  }
  return { corners: c, contrast: best };
}

const BLOCK_DV = P.rowV[P.blockSize] - P.rowV[0];
const GROUP_DU = P.colX[1][0] - P.colX[0][0];

/**
 * Robust fine-scale lattice score: median per-bubble blob response (centre + half-size ellipse) minus the
 * median at the gap points. Medians ignore filled bubbles and red clutter (packaging, pens) that a mean
 * rewards. Shifts: optional per-bubble pixel offsets from fitLattice.
 */
function robustScore(map, w, h, Hu, shiftX, shiftY) {
  const { rx, ry } = P.bubble;
  const vals = [];
  for (let i = 0; i < BUBBLES.length; i++) {
    const b = BUBBLES[i];
    let s = 0;
    let n = 0;
    for (let k = -1; k < COARSE_PHI.length; k++) {
      const du = k < 0 ? 0 : 0.5 * rx * Math.cos(COARSE_PHI[k]);
      const dv = k < 0 ? 0 : 0.5 * ry * Math.sin(COARSE_PHI[k]);
      const p = applyHomography(Hu, b.u + du, b.v + dv);
      const x = Math.round(p.x + (shiftX ? shiftX[i] : 0));
      const y = Math.round(p.y + (shiftY ? shiftY[i] : 0));
      if (x >= 0 && y >= 0 && x < w && y < h) {
        s += map[y * w + x];
        n++;
      }
    }
    if (n >= 5) vals.push(s / n);
  }
  if (vals.length < 0.6 * BUBBLES.length) return -Infinity;
  const gv = [];
  for (const q of GAPS) {
    const p = applyHomography(Hu, q.u, q.v);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (x >= 0 && y >= 0 && x < w && y < h) gv.push(map[y * w + x]);
  }
  return median(vals) - median(gv);
}

/** Same lattice moved by k 5-row blocks (v), j question columns (u) and/or turned 180 degrees. */
function variantCorners(Hu, k, rot, j = 0) {
  const c = UNIT.map((p) => applyHomography(Hu, p.x + j * GROUP_DU, p.y + k * BLOCK_DV));
  return rotateCorners(c, rot);
}

/**
 * Plausible panel geometry: big enough, roughly the panel's aspect, convex. A climb can collapse a lattice
 * onto one red blob (pen, logo), where every bubble samples red and the median score is huge.
 */
function saneQuad(c, w, h) {
  const fw = (dist(c[0], c[1]) + dist(c[3], c[2])) / 2;
  const fh = (dist(c[0], c[3]) + dist(c[1], c[2])) / 2;
  if (!(fw >= MIN_FRAME_FRAC * Math.max(w, h))) return false;
  const ar = fh / fw / P.aspect;
  if (ar < 0.6 || ar > 1.6) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const d = c[(i + 2) % 4];
    const cr = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    const sg = Math.sign(cr);
    if (sg === 0 || (sign && sg !== sign)) return false;
    sign = sg;
  }
  return true;
}

/** Best (quad, orientation) by lattice quality; coarse screening first, then full snapping fit. */
function selectFrame(maps, rnS, rnB, T, quads, opts) {
  const { w, h } = maps;
  const screened = [];
  for (const q of quads) {
    for (const rot of [false, true]) {
      const corners = rotateCorners(q.corners, rot);
      const Hu = computeHomography(UNIT, corners);
      if (!Hu) continue;
      screened.push({ quad: q, rot, corners, Hu, coarse: coarseScore(rnB, w, h, Hu) });
    }
  }
  screened.sort((a, b) => b.coarse - a.coarse);
  if (opts && opts.debug) opts.debug.coarse = screened.slice(0, 8).map((e) => ({ c: e.coarse, rot: e.rot, corners: e.corners }));
  // refine the most promising candidates (distinct quads), then keep the best few by fine contrast
  const refined = [];
  const toRefine = screened.slice(0, (opts && opts.refine) || 8);
  for (const e of screened) if (e.quad.profile && !toRefine.includes(e)) toRefine.push(e);
  for (const e of toRefine) {
    let start = e.corners;
    if (e.quad.profile) {
      // profile rectangles have the row period right but may sit whole blocks off (other red grids on the
      // sheet look like rows): pick the block shift on a medium blur before climbing
      let bs = -Infinity;
      for (let k = -4; k <= 4; k++) {
        const cs = variantCorners(e.Hu, k, false, 0);
        const Hv = computeHomography(UNIT, cs);
        const sc = Hv ? robustScore(rnB, w, h, Hv) : -Infinity;
        if (sc > bs) {
          bs = sc;
          start = cs;
        }
      }
    }
    const r = refineCorners(opts.prep, start);
    if (!r) continue;
    const Hu = computeHomography(UNIT, r.corners);
    if (!Hu) continue;
    refined.push({ ...e, corners: r.corners, Hu, contrast: r.contrast });
  }
  refined.sort((a, b) => b.contrast - a.contrast);
  // The lattice is periodic per block and nearly 180-degree symmetric: test the shifted / turned variants
  // of the best refinements on the fine map with the robust (median) score, then polish the winner.
  const rnM = maps.rnM;
  const finals = [];
  for (const e of refined.slice(0, (opts && opts.variants) || 10)) {
    let bestV = null;
    for (const rot of [false, true]) {
      for (let k = -2; k <= 2; k++) {
        for (let j = -1; j <= 1; j++) {
          const cs = variantCorners(e.Hu, k, rot, j);
          const Hv = computeHomography(UNIT, cs);
          if (!Hv) continue;
          const sc = robustScore(rnM, w, h, Hv);
          if (!bestV || sc > bestV.sc) bestV = { cs, sc, k: k + "/" + j, rot };
        }
      }
    }
    if (!bestV || !Number.isFinite(bestV.sc)) continue;
    const r = refineCorners(opts.prep, bestV.cs, true);
    const cs = r ? r.corners : bestV.cs;
    const Hu = computeHomography(UNIT, cs);
    if (!Hu || !saneQuad(cs, w, h)) continue;
    finals.push({ ...e, corners: cs, Hu, rot: e.rot !== bestV.rot, robust: robustScore(rnM, w, h, Hu), variant: bestV.k });
  }
  finals.sort((a, b) => b.robust - a.robust);
  if (opts && opts.debug) {
    opts.debug.refined = refined.map((e) => ({ contrast: e.contrast, rot: e.rot, corners: e.corners }));
    opts.debug.finals = finals.map((e) => ({ robust: e.robust, variant: e.variant, rot: e.rot, corners: e.corners }));
  }
  const top = finals.slice(0, (opts && opts.fullFits) || 3);
  let best = null;
  const evals = [];
  for (const e of top) {
    const frameW = (dist(e.corners[0], e.corners[1]) + dist(e.corners[3], e.corners[2])) / 2;
    e.fit = fitLattice(maps, rnS, e.Hu, T, frameW, opts);
    e.frameW = frameW;
    e.fit.robust = robustScore(rnM, w, h, e.Hu, e.fit.shiftX, e.fit.shiftY);
    e.score = e.fit.robust;
    evals.push(e);
    if (!best || e.score > best.score) best = e;
  }
  if (!best) return null;
  let other = 0;
  for (const e of evals) if (e.quad === best.quad && e.rot !== best.rot) other = e.score;
  best.ratio = other > 0 ? best.score / other : 99;
  return best;
}

function prepare(img, maxSide) {
  const scaled = downscale(img, maxSide);
  const maps = buildMaps(scaled);
  const { p99, T } = inkThreshold(maps.rn);
  // Line mask: red AND clearly redder than its neighbourhood. Large reddish areas (a laptop or desk under warm
  // light) are flat, so they drop out; thin printed lines and ellipse outlines stay.
  const local = boxBlur(maps.rn, maps.w, maps.h, Math.max(3, Math.round(Math.max(maps.w, maps.h) / 200)));
  const ridge = Math.max(6, Math.round(0.4 * T));
  const mask = new Uint8Array(maps.rn.length);
  // thin-structure redness (rn minus local mean): bubble outlines and letters stay, solid red objects
  // (a red pen next to the sheet) keep only their edges, so they cannot outscore the printed lattice
  const thin = new Uint8Array(maps.rn.length);
  for (let i = 0; i < mask.length; i++) {
    const d = maps.rn[i] - local[i];
    thin[i] = d > 0 ? d : 0;
    mask[i] = maps.rn[i] > T && d > ridge ? 1 : 0;
  }
  const rnS = blur3(maps.rn, maps.w, maps.h);
  const big = Math.max(maps.w, maps.h);
  maps.rnM = boxBlur(thin, maps.w, maps.h, Math.max(2, Math.round(big / 530)));
  const rnB = boxBlur(thin, maps.w, maps.h, Math.max(3, Math.round(big / 260)));
  const rnC = boxBlur(thin, maps.w, maps.h, Math.max(5, Math.round(big / 110)));
  const rnD = boxBlur(thin, maps.w, maps.h, Math.max(9, Math.round(big / 55)));
  return { scaled, maps, p99, T, mask, rnS, rnB, rnC, rnD, sx: img.width / scaled.width, sy: img.height / scaled.height };
}

// Acceptance (6 real phone photos: right panel robust 15-17, best wrong block/rotation 11-12; non-forms and
// half-photographed sheets collapse to a tiny or off-image lattice):
const MIN_ROBUST = 10; // median bubble minus median gap on the thin-redness map
const MIN_FRAME_FRAC = 0.15; // panel width vs the longer image side
const MIN_INSIDE = 0.9; // share of bubble centres inside the image

/** Share of printed bubble centres that fall inside the image (photo cropped through the panel -> low). */
function insideFrac(Hu, w, h) {
  let k = 0;
  for (const b of BUBBLES) {
    const p = applyHomography(Hu, b.u, b.v);
    if (p.x >= 0 && p.y >= 0 && p.x <= w - 1 && p.y <= h - 1) k++;
  }
  return k / BUBBLES.length;
}

function acceptFrame(sel, w, h) {
  if (!sel || !(sel.fit.robust >= MIN_ROBUST) || !saneQuad(sel.corners, w, h)) return false;
  return insideFrac(sel.Hu, w, h) >= MIN_INSIDE;
}

function toOriginalPt(p, sx, sy) {
  return { x: (p.x + 0.5) * sx - 0.5, y: (p.y + 0.5) * sy - 0.5 };
}

// ---------------------------------------------------------------- public: detect
/** Fast path for live frames: frame + lattice verification, no sampling. */
export function detectRedForm(img, opts) {
  try {
    const o = { ...DEFAULTS, ...(opts || {}) };
    // the thin panel lines vanish below ~1200 px working size (real photo), so live frames need 1200
    const prep = prepare(img, (opts && opts.red && opts.red.detectMaxSide) || DEFAULTS.red.detectMaxSide);
    if (prep.p99 < 24) return { found: false, corners: null, error: "NO_FRAME" };
    const { quads } = frameCandidates(prep.mask, prep.maps.w, prep.maps.h, { maxQuads: DEFAULTS.red.maxQuads });
    quads.push(...profileCandidates(prep.mask, prep.maps.w, prep.maps.h));
    if (quads.length === 0) return { found: false, corners: null, error: "NO_FRAME" };
    const sel = selectFrame(prep.maps, prep.rnS, prep.rnB, prep.T, quads, { searchFrac: 0.03, fullFits: 2, refine: 6, prep });
    if (!acceptFrame(sel, prep.maps.w, prep.maps.h)) return { found: false, corners: null, error: "NO_FRAME" };
    const corners = sel.corners.map((p) => toOriginalPt(p, prep.sx, prep.sy));
    return { found: true, corners, error: null };
  } catch (e) {
    return { found: false, corners: null, error: "NO_FRAME" };
  }
}

// ---------------------------------------------------------------- sampling
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

const RING = [];
for (let i = 0; i < 16; i++) RING.push((2 * Math.PI * i) / 16 + 0.1);

/**
 * Fill fraction 0..1 of one ellipse from the red-dropout gray `rp`.
 * Sampling grid inside the ellipse scaled by `inner`; paper level from the annulus just outside.
 * (cx, cy) and the px half-axes (ax, ay) describe the (axis aligned) ellipse in `rp` pixels.
 */
function sampleEllipse(rp, w, h, cx, cy, ax, ay, o) {
  const inner = o.redInner;
  const vals = [];
  const ring = [];
  for (const sc of [1.35, 1.6]) {
    for (let i = 0; i < RING.length; i++) {
      ring.push(bilin8(rp, w, h, cx + ax * sc * Math.cos(RING[i]), cy + ay * sc * Math.sin(RING[i])));
    }
  }
  const white = percentile(ring, 0.7);
  const nx = 7;
  const ny = 5;
  for (let j = 0; j < ny; j++) {
    const v = (j / (ny - 1)) * 2 - 1;
    for (let i = 0; i < nx; i++) {
      const u = (i / (nx - 1)) * 2 - 1;
      if (u * u + v * v > 1) continue;
      vals.push(bilin8(rp, w, h, cx + u * ax * inner, cy + v * ay * inner));
    }
  }
  return { vals, white };
}

function fillFrom(vals, white, blackFrac) {
  if (!(white > 20)) return 0;
  const black = white * blackFrac;
  const den = white - black;
  let s = 0;
  for (const g of vals) {
    let f = (white - g) / den;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    s += f;
  }
  return vals.length ? s / vals.length : 0;
}

// ---------------------------------------------------------------- public: scan
function emptyResult(error, t0, extra) {
  return {
    ok: false,
    error,
    format: "spm-kom28",
    corners: null,
    rotated180: false,
    homography: null,
    quality: { white: 0, black: 0, contrast: 0, ms: Math.round(now() - t0) },
    answers: [],
    studentId: { value: null, digits: [] },
    ...(extra || {}),
  };
}

export function scanRedForm(img, layout, opts) {
  const t0 = now();
  try {
    const o = { ...DEFAULTS, ...(opts || {}) };
    // settings store the whole threshold set once any value is edited; only values the teacher actually
    // changed from the (black sheet) defaults override the red-sheet ones
    const user = {};
    for (const [k, v] of Object.entries((opts && opts.thresholds) || {})) if (v !== DEFAULTS.thresholds[k]) user[k] = v;
    o.thresholds = { ...DEFAULTS.thresholds, ...DEFAULTS.red.thresholds, ...user };
    const n = layout && layout.config ? layout.config.numQuestions : 0;
    if (!layout || layout.format !== "spm-kom28" || !Number.isInteger(n) || n < 1 || n > N_Q) {
      return emptyResult("LAYOUT_INVALID", t0);
    }
    if (!img || !(img.width > 0) || !(img.height > 0) || !img.data || img.data.length < img.width * img.height * 4) {
      return emptyResult("IMAGE_TOO_SMALL", t0);
    }
    if (Math.min(img.width, img.height) < o.minSide) return emptyResult("IMAGE_TOO_SMALL", t0);

    const red = { ...DEFAULTS.red, ...((opts && opts.red) || {}) };
    o.redInner = red.inner;
    const prep = prepare(img, red.maxSide);
    const { maps, T, mask, rnS, rnB, sx, sy } = prep;
    if (prep.p99 < 24) return emptyResult("NO_FRAME", t0);

    if (opts && opts.debug) {
      opts.debug.p99 = prep.p99;
      opts.debug.T = T;
      opts.debug.size = [maps.w, maps.h];
    }
    const { quads } = frameCandidates(mask, maps.w, maps.h, { maxQuads: red.maxQuads, debug: opts && opts.debug });
    quads.push(...profileCandidates(mask, maps.w, maps.h));
    if (quads.length === 0) return emptyResult("NO_FRAME", t0);
    const sel = selectFrame(maps, rnS, rnB, T, quads, { debug: opts && opts.debug, prep });
    if (opts && opts.debug) {
      opts.debug.quads = quads.map((q) => ({ corners: q.corners, score: q.score, cov: q.cov }));
      opts.debug.sel = sel && {
        rot: sel.rot,
        corners: sel.corners,
        quality: sel.fit.quality,
        blob: sel.fit.blob,
        robust: sel.fit.robust,
        inside: insideFrac(sel.Hu, maps.w, maps.h),
        good: sel.fit.good,
        ratio: sel.ratio,
        T,
        p99: prep.p99,
      };
    }
    if (!acceptFrame(sel, maps.w, maps.h)) return emptyResult("NO_FRAME", t0);

    // ---- global homography refined from the snapped bubble centres
    const { fit } = sel;
    const srcPts = [];
    const dstPts = [];
    for (let i = 0; i < BUBBLES.length; i++) {
      const s = outlineScore(rnS, maps.w, maps.h, fit.pr, i, fit.shiftX[i], fit.shiftY[i]);
      if (s >= T) {
        srcPts.push({ x: BUBBLES[i].u, y: BUBBLES[i].v });
        dstPts.push({ x: fit.pr.cx[i] + fit.shiftX[i], y: fit.pr.cy[i] + fit.shiftY[i] });
      }
    }
    let Hu = sel.Hu;
    if (srcPts.length >= 40) {
      const H2 = fitHomographyLS(srcPts, dstPts);
      if (H2) Hu = H2;
    }

    // ---- sampling
    const a = P.aspect;
    const rxPx = [];
    const ryPx = [];
    const answers = [];
    const positions = [];
    const whites = [];
    const labels = P.choices;
    const wdt = maps.w;
    const hgt = maps.h;
    const fillsAll = [];
    for (let q = 1; q <= n; q++) {
      const fills = [];
      const pos = [];
      for (let k = 0; k < N_CH; k++) {
        const i = (q - 1) * N_CH + k;
        const cx = fit.pr.cx[i] + fit.shiftX[i];
        const cy = fit.pr.cy[i] + fit.shiftY[i];
        // px half axes from the local outline offsets (horizontal / vertical extremes)
        const base = i * OUTLINE_K * 2;
        let axp = 0;
        let ayp = 0;
        for (let t = 0; t < OUTLINE_K; t++) {
          axp = Math.max(axp, Math.abs(fit.pr.off[base + t * 2]));
          ayp = Math.max(ayp, Math.abs(fit.pr.off[base + t * 2 + 1]));
        }
        rxPx.push(axp);
        ryPx.push(ayp);
        const s = sampleEllipse(maps.rp, wdt, hgt, cx, cy, axp, ayp, o);
        // the paper ring reaches 1.6 half-axes; any of it off the photo (cropped sheet) -> unreadable
        s.off = cx - 1.6 * axp < 0 || cy - 1.6 * ayp < 0 || cx + 1.6 * axp > wdt - 1 || cy + 1.6 * ayp > hgt - 1;
        whites.push(s.white);
        fills.push(s);
        pos.push({ x: cx, y: cy });
      }
      fillsAll.push(fills);
      positions.push(pos);
    }
    const whiteMed = median(whites);
    if (!(whiteMed >= red.minWhite)) {
      return emptyResult("LOW_CONTRAST", t0, {
        corners: rotateCorners(sel.corners, false).map((p) => toOriginalPt(p, sx, sy)),
        rotated180: sel.rot,
      });
    }
    for (let q = 1; q <= n; q++) {
      const fills = fillsAll[q - 1].map((s) => fillFrom(s.vals, s.white, red.blackFrac));
      if (fillsAll[q - 1].some((s) => s.off)) {
        answers.push({ q, choice: null, status: "UNCERTAIN", selected: [], fills, offImage: true });
        continue;
      }
      const d = decideRow(fills, labels, o.thresholds);
      answers.push({ q, choice: d.choice, status: d.status, selected: d.selected, fills });
    }

    // ---- result in original image pixels; layout coordinates are x = u, y = v * aspect
    const toLayout = [1, 0, 0, 0, 1 / a, 0, 0, 0, 1];
    const mul = (A, B) => {
      const out = new Array(9).fill(0);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
      return out;
    };
    const toOrig = [sx, 0, (sx - 1) / 2, 0, sy, (sy - 1) / 2, 0, 0, 1];
    const Hl = mul(toOrig, mul(Hu, toLayout));
    const kk = Hl[8];
    const homography = Hl.map((v) => v / kk);
    const corners = UNIT.map((u) => toOriginalPt(applyHomography(Hu, u.x, u.y), sx, sy));
    const positionsOrig = positions.map((row) => row.map((p) => toOriginalPt(p, sx, sy)));
    const white = Math.round(whiteMed);
    return {
      ok: true,
      error: null,
      format: "spm-kom28",
      corners,
      rotated180: sel.rot,
      homography,
      quality: { white, black: Math.round(white * red.blackFrac), contrast: Math.round(white * (1 - red.blackFrac)), ms: Math.round(now() - t0) },
      answers,
      studentId: { value: null, digits: [] },
      positions: positionsOrig,
    };
  } catch (e) {
    return emptyResult("BAD_GEOMETRY", t0, { message: String((e && e.message) || e) });
  }
}

// Internals exposed for tests/diagnostics only.
export const _internals = { robustScore, variantCorners, profileCandidates, refineCorners, latticeContrast, blockScore, outlineScore, projectBubbles, coarseScore, UNIT, boxBlur, buildMaps, blur3, inkThreshold, collectPoints, houghLines, runScore, frameCandidates, fitLattice, selectFrame, prepare, BUBBLES, BLOCKS };
