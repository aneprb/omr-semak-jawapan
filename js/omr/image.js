// Basic image helpers on ImageData-like objects. Pure JS, no DOM.
// Coordinate convention: the value of pixel (i, j) lives at integer coordinates (i, j).

/**
 * Box-average downscale so that the longest side <= maxSide.
 * Returns the original image when it is already small enough.
 */
export function downscale(img, maxSide) {
  const { width: w, height: h, data: src } = img;
  const longest = Math.max(w, h);
  if (longest <= maxSide) return img;
  const scale = maxSide / longest;
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const sx = w / dw;
  const sy = h / dh;
  const out = new Uint8ClampedArray(dw * dh * 4);

  // Precompute source column ranges once per destination column.
  const x0 = new Int32Array(dw);
  const x1 = new Int32Array(dw);
  for (let dx = 0; dx < dw; dx++) {
    const a = Math.floor(dx * sx);
    x0[dx] = a;
    x1[dx] = Math.min(w, Math.max(a + 1, Math.floor((dx + 1) * sx)));
  }

  for (let dy = 0; dy < dh; dy++) {
    const ya = Math.floor(dy * sy);
    const yb = Math.min(h, Math.max(ya + 1, Math.floor((dy + 1) * sy)));
    for (let dx = 0; dx < dw; dx++) {
      const xa = x0[dx];
      const xb = x1[dx];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let y = ya; y < yb; y++) {
        let p = (y * w + xa) * 4;
        for (let x = xa; x < xb; x++, p += 4) {
          r += src[p];
          g += src[p + 1];
          b += src[p + 2];
          a += src[p + 3];
        }
      }
      const n = (yb - ya) * (xb - xa);
      const o = (dy * dw + dx) * 4;
      out[o] = (r / n + 0.5) | 0;
      out[o + 1] = (g / n + 0.5) | 0;
      out[o + 2] = (b / n + 0.5) | 0;
      out[o + 3] = (a / n + 0.5) | 0;
    }
  }
  return { width: dw, height: dh, data: out };
}

/** RGBA -> gray, Y = (77R + 150G + 29B) >> 8. */
export function toGray(img) {
  const { width: w, height: h, data: src } = img;
  const n = w * h;
  const out = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = (77 * src[p] + 150 * src[p + 1] + 29 * src[p + 2]) >> 8;
  }
  return { width: w, height: h, data: out };
}

/** Box-average downscale of a gray image so that the longest side <= maxSide. */
export function downscaleGray(gray, maxSide) {
  const { width: w, height: h, data: src } = gray;
  const longest = Math.max(w, h);
  if (longest <= maxSide) return gray;
  const scale = maxSide / longest;
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  const sx = w / dw;
  const sy = h / dh;
  const out = new Uint8ClampedArray(dw * dh);
  const x0 = new Int32Array(dw);
  const x1 = new Int32Array(dw);
  for (let dx = 0; dx < dw; dx++) {
    const a = Math.floor(dx * sx);
    x0[dx] = a;
    x1[dx] = Math.min(w, Math.max(a + 1, Math.floor((dx + 1) * sx)));
  }
  for (let dy = 0; dy < dh; dy++) {
    const ya = Math.floor(dy * sy);
    const yb = Math.min(h, Math.max(ya + 1, Math.floor((dy + 1) * sy)));
    for (let dx = 0; dx < dw; dx++) {
      const xa = x0[dx];
      const xb = x1[dx];
      let s = 0;
      for (let y = ya; y < yb; y++) {
        const row = y * w;
        for (let x = xa; x < xb; x++) s += src[row + x];
      }
      out[dy * dw + dx] = (s / ((yb - ya) * (xb - xa)) + 0.5) | 0;
    }
  }
  return { width: dw, height: dh, data: out };
}

/** Bilinear sample, 0..255. Outside the image (x < 0, x > w-1, ...) -> 255 (white). */
export function bilinear(gray, x, y) {
  const w = gray.width;
  const h = gray.height;
  if (!(x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1)) return 255;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const fx = x - x0;
  const fy = y - y0;
  const d = gray.data;
  const a = d[y0 * w + x0];
  const b = d[y0 * w + x1];
  const c = d[y1 * w + x0];
  const e = d[y1 * w + x1];
  const top = a + (b - a) * fx;
  const bot = c + (e - c) * fx;
  return top + (bot - top) * fy;
}
