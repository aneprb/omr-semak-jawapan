// Corner marker detection. Pure JS, no DOM.
// adaptive threshold -> components -> shape filter -> 3 extreme candidates per image corner
// -> test all combinations (<= 81) -> best valid quadrilateral.
import { DEFAULTS } from "./config.js";
import { downscaleGray } from "./image.js";
import { adaptiveThreshold } from "./threshold.js";
import { labelComponents } from "./components.js";
import { buildLayout } from "./layout.js";

// Nominal marker rectangle (mm) is read from the layout; no geometry numbers are duplicated here.
const REF = (() => {
  const m = buildLayout({ numQuestions: 10, numChoices: 4, idDigits: 0 }).markers;
  const [tl, tr, , bl] = m;
  const w = tr.cx - tl.cx;
  const h = bl.cy - tl.cy;
  return { w, h, size: tl.size, ratio: w / h };
})();

function oddWindow(w, h, frac) {
  let win = Math.round(Math.min(w, h) * frac);
  if (win % 2 === 0) win += 1;
  return Math.max(win, 15);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function interiorAngleDeg(prev, cur, next) {
  const ax = prev.x - cur.x;
  const ay = prev.y - cur.y;
  const bx = next.x - cur.x;
  const by = next.y - cur.y;
  const d = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}

function quadArea(p) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Candidate blobs that look like a solid isotropic square. */
function markerCandidates(det, o) {
  const w = det.width;
  const h = det.height;
  const minSide = o.markerSideFrac[0] * Math.min(w, h);
  const maxSide = o.markerSideFrac[1] * Math.min(w, h);
  const bin = adaptiveThreshold(det, {
    window: oddWindow(w, h, o.thresholdWindowFrac),
    c: o.thresholdC,
  });
  const comps = labelComponents(bin, { minArea: minSide * minSide, maxArea: maxSide * maxSide });
  const out = [];
  for (const c of comps) {
    if (c.fill < o.markerMinFill) continue;
    if (c.eig2 <= 0) continue;
    const ratio = c.eig1 / c.eig2;
    if (ratio > o.markerAspect[1] || ratio < o.markerAspect[0]) continue;
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const bb = bw > bh ? bw / bh : bh / bw;
    if (bb > 1.8) continue;
    out.push(c);
  }
  return out;
}

function topBy(cands, key, n) {
  return cands
    .map((c) => ({ c, v: key(c) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((e) => e.c);
}

/**
 * Evaluate a TL,TR,BR,BL combination. Returns {score} or {fail: "marker"|"geometry"}.
 */
function evaluateQuad(comps, imgArea, o) {
  const pts = comps.map((c) => ({ x: c.cx, y: c.cy }));
  const areas = comps.map((c) => c.area);

  // Marker areas must agree (filled answer bubbles are ~3-4x smaller than markers).
  const aMin = Math.min(...areas);
  const aMax = Math.max(...areas);
  if (aMax / aMin > o.markerAreaSpread) return { fail: "marker" };

  const area = quadArea(pts);
  if (area <= 0) return { fail: "geometry" };

  // Each blob must have the physical size of a marker at this quad's scale.
  const pxPerMm = Math.sqrt(area / (REF.w * REF.h));
  const expectedSide = REF.size * pxPerMm;
  for (const a of areas) {
    const r = Math.sqrt(a) / expectedSide;
    if (r < 0.6 || r > 1.6) return { fail: "marker" };
  }

  // Convex, clockwise (y down): all cross products positive.
  for (let i = 0; i < 4; i++) {
    if (!(cross(pts[i], pts[(i + 1) % 4], pts[(i + 2) % 4]) > 0)) return { fail: "geometry" };
  }

  let maxDev = 0;
  for (let i = 0; i < 4; i++) {
    const ang = interiorAngleDeg(pts[(i + 3) % 4], pts[i], pts[(i + 1) % 4]);
    if (ang < 45 || ang > 135) return { fail: "geometry" };
    maxDev = Math.max(maxDev, Math.abs(ang - 90));
  }

  const width = (dist(pts[0], pts[1]) + dist(pts[3], pts[2])) / 2;
  const height = (dist(pts[0], pts[3]) + dist(pts[1], pts[2])) / 2;
  const ratio = width / height;
  if (ratio < 0.5 || ratio > 1.0) return { fail: "geometry" };

  // Everything fits except the sheet is too small in the frame (move closer).
  if (area < 0.15 * imgArea) return { fail: "small", area, minSide: Math.sqrt(aMin) };

  const spreadScore = aMin / aMax;
  const rectScore = 1 - maxDev / 45;
  const aspectScore = Math.max(0.1, 1 - Math.abs(ratio - REF.ratio) / REF.ratio);
  return { score: (area / imgArea) * spreadScore * rectScore * aspectScore };
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} gray
 * @returns {{ok:boolean, corners:Array<{x:number,y:number}>|null, error?:string, candidates:number}}
 */
export function findMarkers(gray, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  const det = downscaleGray(gray, o.detectMaxSide);
  const imgArea = det.width * det.height;

  const cands = markerCandidates(det, o);
  if (cands.length < 4) return { ok: false, corners: null, error: "NO_MARKERS", candidates: cands.length };

  const tl = topBy(cands, (c) => -(c.cx + c.cy), 3);
  const tr = topBy(cands, (c) => c.cx - c.cy, 3);
  const br = topBy(cands, (c) => c.cx + c.cy, 3);
  const bl = topBy(cands, (c) => c.cy - c.cx, 3);

  let best = null;
  let bestScore = -1;
  let geometryFail = false;
  for (const a of tl) {
    for (const b of tr) {
      if (b === a) continue;
      for (const c of br) {
        if (c === a || c === b) continue;
        for (const d of bl) {
          if (d === a || d === b || d === c) continue;
          const combo = [a, b, c, d];
          const r = evaluateQuad(combo, imgArea, o);
          if (r.fail === "small" && r.area >= 0.04 * imgArea && r.minSide >= 0.012 * Math.min(det.width, det.height)) {
            geometryFail = true; // a real-looking marker quad, but the sheet is too far away
          }
          if (r.score !== undefined && r.score > bestScore) {
            bestScore = r.score;
            best = combo;
          }
        }
      }
    }
  }

  if (!best) {
    return {
      ok: false,
      corners: null,
      error: geometryFail ? "BAD_GEOMETRY" : "NO_MARKERS",
      candidates: cands.length,
    };
  }

  // Back to input gray coordinates (pixel-centre convention).
  const sx = gray.width / det.width;
  const sy = gray.height / det.height;
  const corners = best.map((c) => ({ x: (c.cx + 0.5) * sx - 0.5, y: (c.cy + 0.5) * sy - 0.5 }));
  return { ok: true, corners, candidates: cands.length };
}
