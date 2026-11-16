// Project layout geometry into image pixels for the review overlay. Pure JS, no DOM.
import { applyHomography } from "./homography.js";

function pxRadius(H, cx, cy, r) {
  const c = applyHomography(H, cx, cy);
  const a = applyHomography(H, cx + r, cy);
  const b = applyHomography(H, cx, cy + r);
  return (Math.hypot(a.x - c.x, a.y - c.y) + Math.hypot(b.x - c.x, b.y - c.y)) / 2;
}

function rectCorners(H, rect) {
  return [
    applyHomography(H, rect.x, rect.y),
    applyHomography(H, rect.x + rect.w, rect.y),
    applyHomography(H, rect.x + rect.w, rect.y + rect.h),
    applyHomography(H, rect.x, rect.y + rect.h),
  ];
}

/**
 * @param {number[]} H mm -> px (original input image)
 * @param {object} layout
 */
export function projectLayout(H, layout) {
  const answers = layout.questions.map((q) =>
    q.bubbles.map((b) => {
      const p = applyHomography(H, b.cx, b.cy);
      return { choice: b.choice, x: p.x, y: p.y, rPx: pxRadius(H, b.cx, b.cy, b.r) };
    }),
  );
  const idDigits = layout.idBlock
    ? layout.idBlock.digits.map((d) =>
        d.bubbles.map((b) => {
          const p = applyHomography(H, b.cx, b.cy);
          return { digit: b.digit, x: p.x, y: p.y, rPx: pxRadius(H, b.cx, b.cy, b.r) };
        }),
      )
    : [];
  return {
    answers,
    idDigits,
    regions: {
      name: rectCorners(H, layout.regions.name),
      className: rectCorners(H, layout.regions.className),
    },
  };
}
