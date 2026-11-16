// Connected-component labelling (8-connectivity) with an explicit stack (no recursion).
// Pure JS, no DOM.

/**
 * @param {{width:number,height:number,data:Uint8Array}} bin 1 = ink, 0 = paper
 * @param {{minArea?:number, maxArea?:number}} [opts] optional: skip components outside the area range
 * @returns {Array<{label:number,area:number,minX:number,minY:number,maxX:number,maxY:number,
 *   cx:number,cy:number,fill:number,eig1:number,eig2:number}>}
 */
export function labelComponents(bin, opts = {}) {
  const { width: w, height: h, data } = bin;
  const minArea = opts.minArea || 1;
  const maxArea = opts.maxArea || Infinity;
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n > 0 ? n : 1);
  const out = [];
  let label = 0;

  for (let start = 0; start < n; start++) {
    if (data[start] === 0 || seen[start] === 1) continue;

    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    while (sp > 0) {
      const p = stack[--sp];
      const y = (p / w) | 0;
      const x = p - y * w;
      area++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const xl = x > 0 ? x - 1 : 0;
      const xr = x < w - 1 ? x + 1 : w - 1;
      const yt = y > 0 ? y - 1 : 0;
      const yb = y < h - 1 ? y + 1 : h - 1;
      for (let yy = yt; yy <= yb; yy++) {
        const row = yy * w;
        for (let xx = xl; xx <= xr; xx++) {
          const q = row + xx;
          if (data[q] === 1 && seen[q] === 0) {
            seen[q] = 1;
            stack[sp++] = q;
          }
        }
      }
    }

    if (area < minArea || area > maxArea) continue;

    const mx = sx / area;
    const my = sy / area;
    // +1/12: variance of a unit pixel, keeps 1-pixel components well defined.
    const vxx = sxx / area - mx * mx + 1 / 12;
    const vyy = syy / area - my * my + 1 / 12;
    const vxy = sxy / area - mx * my;
    const half = (vxx + vyy) / 2;
    const diff = Math.sqrt(((vxx - vyy) / 2) ** 2 + vxy * vxy);
    const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);

    out.push({
      label: ++label,
      area,
      minX,
      minY,
      maxX,
      maxY,
      cx: mx,
      cy: my,
      fill: area / bboxArea,
      eig1: half + diff,
      eig2: Math.max(half - diff, 0),
    });
  }
  return out;
}
