// Pembina imej sintetik dalam JS untuk ujian enjin (bukan fail ujian). Tiada DOM.
import { computeHomography, invertHomography, applyHomography } from "../js/omr/homography.js";

/** Homografi mm -> px yang meletakkan halaman A4 dalam imej (w x h) dengan sedikit putaran/perspektif. */
export function pageHomography(layout, w, h, { margin = 0.06, rotDeg = 0, skewX = 0, skewY = 0, flip180 = false } = {}) {
  const pw = layout.page.widthMm;
  const ph = layout.page.heightMm;
  const mx = w * margin;
  const my = h * margin;
  let quad = [
    { x: mx + skewX, y: my },
    { x: w - mx, y: my + skewY },
    { x: w - mx - skewX, y: h - my },
    { x: mx, y: h - my - skewY },
  ];
  if (rotDeg) {
    const a = (rotDeg * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    quad = quad.map((p) => ({
      x: cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a),
      y: cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a),
    }));
  }
  if (flip180) quad = [quad[2], quad[3], quad[0], quad[1]];
  return computeHomography(
    [
      { x: 0, y: 0 },
      { x: pw, y: 0 },
      { x: pw, y: ph },
      { x: 0, y: ph },
    ],
    quad,
  );
}

function fillShape(buf, w, h, H, Hinv, bbox, test, value) {
  const pts = bbox.map(([x, y]) => applyHomography(H, x, y));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))) - 1);
  const x1 = Math.min(w - 1, Math.ceil(Math.max(...pts.map((p) => p.x))) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))) - 1);
  const y1 = Math.min(h - 1, Math.ceil(Math.max(...pts.map((p) => p.y))) + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const m = applyHomography(Hinv, x, y);
      if (test(m.x, m.y)) buf[y * w + x] = value;
    }
  }
}

/**
 * Render a gray image of a sheet.
 * opts: { fills: {[q]: [{choice, dark}]}, idCode, skipMarkers: ["BL"], light: 0..1 (left-right gradient min),
 *         noise: sigma, tableGray, paperGray, seed }
 * Returns RGBA {width,height,data}.
 */
export function renderSheet(layout, H, w, h, opts = {}) {
  const { fills = {}, idCode = null, skipMarkers = [], light = 1, noise = 0, tableGray = 70, paperGray = 240, seed = 1 } = opts;
  const Hinv = invertHomography(H);
  const g = new Float32Array(w * h);
  const pw = layout.page.widthMm;
  const ph = layout.page.heightMm;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = applyHomography(Hinv, x, y);
      const inside = m.x >= 0 && m.x <= pw && m.y >= 0 && m.y <= ph;
      g[y * w + x] = inside ? paperGray : tableGray;
    }
  }

  for (const mk of layout.markers) {
    if (skipMarkers.includes(mk.id)) continue;
    const hs = mk.size / 2;
    fillShape(
      g, w, h, H, Hinv,
      [[mk.cx - hs, mk.cy - hs], [mk.cx + hs, mk.cy - hs], [mk.cx + hs, mk.cy + hs], [mk.cx - hs, mk.cy + hs]],
      (x, y) => Math.abs(x - mk.cx) <= hs && Math.abs(y - mk.cy) <= hs,
      8,
    );
  }
  const ob = layout.orientationBar;
  fillShape(
    g, w, h, H, Hinv,
    [[ob.x, ob.y], [ob.x + ob.w, ob.y], [ob.x + ob.w, ob.y + ob.h], [ob.x, ob.y + ob.h]],
    (x, y) => x >= ob.x && x <= ob.x + ob.w && y >= ob.y && y <= ob.y + ob.h,
    8,
  );

  const bubble = (b, dark) => {
    const rr = b.r * 0.88;
    fillShape(
      g, w, h, H, Hinv,
      [[b.cx - b.r, b.cy - b.r], [b.cx + b.r, b.cy - b.r], [b.cx + b.r, b.cy + b.r], [b.cx - b.r, b.cy + b.r]],
      (x, y) => (x - b.cx) ** 2 + (y - b.cy) ** 2 <= rr * rr,
      paperGray - dark * (paperGray - 8),
    );
  };
  for (const q of layout.questions) {
    for (const f of fills[q.q] || []) {
      const b = q.bubbles.find((bb) => bb.choice === f.choice);
      bubble(b, f.dark);
    }
  }
  if (idCode && layout.idBlock) {
    layout.idBlock.digits.forEach((d, j) => bubble(d.bubbles[Number(idCode[j])], 0.95));
  }

  // Lighting gradient (multiplicative, left -> right in image space) and noise (deterministic LCG).
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = g[y * w + x] * (light + (1 - light) * (1 - x / w));
      if (noise > 0) v += (rnd() + rnd() + rnd() - 1.5) * 2 * noise;
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** Build a bin/gray image from a draw callback. */
export function grayImage(w, h, value = 255) {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h).fill(value) };
}

export function fillRect(img, x0, y0, x1, y1, value) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data[y * img.width + x] = value;
}
