// Adaptive (local mean) threshold via integral image. Pure JS, no DOM.

/** Integral image as Float64Array of (w+1)*(h+1); I[y][x] = sum of gray over [0,x) x [0,y). */
export function integralImage(gray) {
  const { width: w, height: h, data } = gray;
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const src = y * w;
    const dst = (y + 1) * stride;
    const prev = y * stride;
    for (let x = 0; x < w; x++) {
      rowSum += data[src + x];
      integral[dst + x + 1] = integral[prev + x + 1] + rowSum;
    }
  }
  return integral;
}

/**
 * Ink pixel (1) if gray < local mean - c, where the local mean is taken over a
 * (window x window) square clipped at the image border.
 */
export function adaptiveThreshold(gray, { window, c }) {
  const { width: w, height: h, data } = gray;
  const stride = w + 1;
  const integral = integralImage(gray);
  const half = Math.max(1, window >> 1);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = y - half < 0 ? 0 : y - half;
    const yb = y + half + 1 > h ? h : y + half + 1;
    const rowA = ya * stride;
    const rowB = yb * stride;
    for (let x = 0; x < w; x++) {
      const xa = x - half < 0 ? 0 : x - half;
      const xb = x + half + 1 > w ? w : x + half + 1;
      const sum = integral[rowB + xb] - integral[rowB + xa] - integral[rowA + xb] + integral[rowA + xa];
      const mean = sum / ((xb - xa) * (yb - ya));
      if (data[y * w + x] < mean - c) out[y * w + x] = 1;
    }
  }
  return { width: w, height: h, data: out };
}
