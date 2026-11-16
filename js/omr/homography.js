// 4-point homography (direct linear solve, h[8] = 1). Row-major 3x3 as number[9]. Pure JS.

/** Solve H such that dst ~ H * src. Returns null if the system is singular. */
export function computeHomography(src, dst) {
  if (!src || !dst || src.length !== 4 || dst.length !== 4) return null;
  // Build 8x9 augmented matrix.
  const m = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting.
  let scale = 0;
  for (const row of m) for (let j = 0; j < 8; j++) scale = Math.max(scale, Math.abs(row[j]));
  const eps = 1e-12 * (scale || 1);
  for (let col = 0; col < 8; col++) {
    let piv = col;
    let best = Math.abs(m[col][col]);
    for (let r = col + 1; r < 8; r++) {
      const val = Math.abs(m[r][col]);
      if (val > best) {
        best = val;
        piv = r;
      }
    }
    if (!(best > eps)) return null;
    if (piv !== col) {
      const t = m[col];
      m[col] = m[piv];
      m[piv] = t;
    }
    const pv = m[col][col];
    for (let r = col + 1; r < 8; r++) {
      const f = m[r][col] / pv;
      if (f === 0) continue;
      for (let c = col; c < 9; c++) m[r][c] -= f * m[col][c];
    }
  }
  const h = new Array(9);
  for (let r = 7; r >= 0; r--) {
    let s = m[r][8];
    for (let c = r + 1; c < 8; c++) s -= m[r][c] * h[c];
    h[r] = s / m[r][r];
  }
  h[8] = 1;
  for (let i = 0; i < 9; i++) if (!Number.isFinite(h[i])) return null;
  return h;
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-12) return { x: NaN, y: NaN };
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

export function invertHomography(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const norm = Math.max(...H.map(Math.abs)) || 1;
  if (!(Math.abs(det) > 1e-12 * norm * norm * norm)) return null;
  const inv = [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ].map((v) => v / det);
  if (!(Math.abs(inv[8]) > 1e-15)) return null;
  const k = inv[8];
  const out = inv.map((v) => v / k);
  for (let j = 0; j < 9; j++) if (!Number.isFinite(out[j])) return null;
  return out;
}
