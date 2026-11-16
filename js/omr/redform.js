// Red-ink answer sheets (KPM "Kertas Jawapan Objektif SPM", LPM/KOM 28). Pure JS, no DOM.
//
// Pipeline (docs/PLAN.md section 11):
//   1. redness map  rn = (R - max(G,B)) / max(R,50)  (lighting independent) + "red dropout" gray
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
      const v = (255 * c) / (r > 50 ? r : 50);
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
    valid++;
    let hit = false;
    for (let d = -band; d <= band && !hit; d += 1) {
      const xi = Math.round(x + d * nx);
      const yi = Math.round(y + d * ny);
      if (xi >= 0 && yi >= 0 && xi < w && yi < h && mask[yi * w + xi]) hit = true;
    }
    if (hit) hits++;
  }
  return valid ? hits / valid : 0;
}

/** Candidate frame quadrilaterals (image order TL, TR, BR, BL) from long straight lines. */
function frameCandidates(mask, w, h, opts) {
  const pts = collectPoints(mask, w, h, 260000);
  if (pts.n < 200) return { quads: [], lines: 0 };
  const nl = (opts && opts.nLines) || 14;
  const hs = houghLines(mask, pts, w, h, "H", 140).slice(0, nl);
  const vs = houghLines(mask, pts, w, h, "V", 140).slice(0, nl);
  const dbg = opts && opts.debug;
  const why = { aspect: 0, area: 0, angle: 0, cov: 0, ok: 0, outside: 0 };
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
  const top = screened.slice(0, (opts && opts.fullFits) || 3);
  let best = null;
  const evals = [];
  for (const e of top) {
    const frameW = (dist(e.quad.corners[0], e.quad.corners[1]) + dist(e.quad.corners[3], e.quad.corners[2])) / 2;
    e.fit = fitLattice(maps, rnS, e.Hu, T, frameW, opts);
    e.frameW = frameW;
    e.score = e.fit.blob !== undefined ? e.fit.blob : e.fit.quality;
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
  const mask = new Uint8Array(maps.rn.length);
  for (let i = 0; i < mask.length; i++) mask[i] = maps.rn[i] > T ? 1 : 0;
  const rnS = blur3(maps.rn, maps.w, maps.h);
  maps.rnM = boxBlur(maps.rn, maps.w, maps.h, Math.max(2, Math.round(Math.max(maps.w, maps.h) / 530)));
  const rnB = boxBlur(maps.rn, maps.w, maps.h, Math.max(3, Math.round(Math.max(maps.w, maps.h) / 260)));
  return { scaled, maps, p99, T, mask, rnS, rnB, sx: img.width / scaled.width, sy: img.height / scaled.height };
}

// Acceptance on the blob response after snapping (real photo: right panel ~1.8 T, best wrong quad ~1.07 T,
// 180 degrees ~1.0 T). Outline quality/good are kept for diagnostics only.
const MIN_BLOB_FRAC = 1.4;

function acceptFrame(sel, T) {
  return !!sel && sel.fit.blob >= MIN_BLOB_FRAC * T;
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
    if (quads.length === 0) return { found: false, corners: null, error: "NO_FRAME" };
    const sel = selectFrame(prep.maps, prep.rnS, prep.rnB, prep.T, quads, { searchFrac: 0.03, fullFits: 2 });
    if (!acceptFrame(sel, prep.T)) return { found: false, corners: null, error: "NO_FRAME" };
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
    o.thresholds = { ...DEFAULTS.thresholds, ...DEFAULTS.red.thresholds, ...((opts && opts.thresholds) || {}) };
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
    if (quads.length === 0) return emptyResult("NO_FRAME", t0);
    const sel = selectFrame(maps, rnS, rnB, T, quads, { debug: opts && opts.debug });
    if (opts && opts.debug) {
      opts.debug.quads = quads.map((q) => ({ corners: q.corners, score: q.score, cov: q.cov }));
      opts.debug.sel = sel && {
        rot: sel.rot,
        corners: sel.corners,
        quality: sel.fit.quality,
        blob: sel.fit.blob,
        good: sel.fit.good,
        ratio: sel.ratio,
        T,
        p99: prep.p99,
      };
    }
    if (!acceptFrame(sel, T)) return emptyResult("NO_FRAME", t0);

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
export const _internals = { blockScore, outlineScore, projectBubbles, coarseScore, UNIT, boxBlur, buildMaps, blur3, inkThreshold, collectPoints, houghLines, runScore, frameCandidates, fitLattice, selectFrame, prepare, BUBBLES, BLOCKS };
