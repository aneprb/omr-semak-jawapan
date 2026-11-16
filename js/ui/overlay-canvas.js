// Review canvas: photo + result overlay. Shapes follow docs/DESIGN.md (colour is never the only cue):
//   correct = solid ring + check, wrong = rounded square + cross (+ dashed ring on the key answer),
//   check (blank/multiple/uncertain) = dashed ring + "!".
import { projectLayout } from '../omr/overlay.js';

const C = { ok: '#2fd072', bad: '#ff5a4d', warn: '#ffd34d', halo: 'rgba(0,0,0,.75)' };

export function imageToCanvas(imageData) {
  const c = document.createElement('canvas');
  c.width = imageData.width;
  c.height = imageData.height;
  c.getContext('2d').putImageData(imageData, 0, 0);
  return c;
}

function stroke(ctx, w, color, dash, path) {
  ctx.setLineDash(dash);
  ctx.lineWidth = w + 3; ctx.strokeStyle = C.halo; path(); ctx.stroke();
  ctx.lineWidth = w; ctx.strokeStyle = color; path(); ctx.stroke();
}
const ring = (ctx, x, y, r) => () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); };
const square = (ctx, x, y, r) => () => {
  const s = r * 2; const rad = r * 0.3;
  ctx.beginPath(); ctx.roundRect(x - r, y - r, s, s, rad);
};

function glyph(ctx, g, x, y, size, color) {
  ctx.setLineDash([]);
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = C.halo; ctx.strokeText(g, x, y);
  ctx.fillStyle = color; ctx.fillText(g, x, y);
}

/**
 * @param {HTMLCanvasElement} canvas target (size is set here)
 * @param {HTMLCanvasElement} source full-resolution photo canvas (imageToCanvas)
 * @param {{scan: object, layout: object, rows: Array<{given: string|null, key: string|null, kind: 'ok'|'bad'|'warn', selected: string[]}>}} o
 */
export function drawReview(canvas, source, { scan, layout, rows }, maxW = 1100) {
  const s = Math.min(1, maxW / source.width);
  canvas.width = Math.round(source.width * s);
  canvas.height = Math.round(source.height * s);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (!scan?.homography) return;
  const proj = projectLayout(scan.homography, layout);
  rows.forEach((row, i) => {
    const bubbles = proj.answers[i];
    if (!bubbles) return;
    const r0 = bubbles[0].rPx * s;
    const at = (choice) => bubbles.find((b) => b.choice === choice);
    const lw = Math.max(2, r0 * 0.35);
    const rr = r0 * 1.7;
    const gx = bubbles[0].x * s - r0 * 4.2;
    const gy = bubbles[0].y * s;
    const gsize = Math.max(10, r0 * 3);
    if (row.kind === 'ok') {
      const b = at(row.given);
      if (b) stroke(ctx, lw, C.ok, [], ring(ctx, b.x * s, b.y * s, rr));
      glyph(ctx, '✓', gx, gy, gsize, C.ok);
    } else if (row.kind === 'bad') {
      const b = at(row.given);
      if (b) stroke(ctx, lw, C.bad, [], square(ctx, b.x * s, b.y * s, rr));
      const k = at(row.key);
      if (k) stroke(ctx, lw, C.ok, [lw * 2, lw * 1.5], ring(ctx, k.x * s, k.y * s, rr));
      glyph(ctx, '✗', gx, gy, gsize, C.bad);
    } else {
      const picks = row.selected?.length ? row.selected : (row.given ? [row.given] : []);
      for (const p of picks) {
        const b = at(p);
        if (b) stroke(ctx, lw, C.warn, [lw * 2, lw * 1.5], ring(ctx, b.x * s, b.y * s, rr));
      }
      glyph(ctx, '!', gx, gy, gsize, C.warn);
    }
  });
  ctx.setLineDash([]);
}

/** Crop the student-name region (bounding box of the projected polygon), upright. */
export function drawNameCrop(canvas, source, scan, layout, maxW = 700) {
  if (!scan?.homography) return;
  const poly = projectLayout(scan.homography, layout).regions.name;
  const xs = poly.map((p) => p.x); const ys = poly.map((p) => p.y);
  const x0 = Math.max(0, Math.min(...xs)); const y0 = Math.max(0, Math.min(...ys));
  const x1 = Math.min(source.width, Math.max(...xs)); const y1 = Math.min(source.height, Math.max(...ys));
  const w = Math.max(1, x1 - x0); const h = Math.max(1, y1 - y0);
  const s = Math.min(1, maxW / w);
  canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
  const ctx = canvas.getContext('2d');
  if (scan.rotated180) { ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); }
  ctx.drawImage(source, x0, y0, w, h, 0, 0, canvas.width, canvas.height);
}
