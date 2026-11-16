// Per-row decision from fill fractions (docs/PLAN.md section 4.2). Pure JS.
import { DEFAULTS } from "./config.js";

/**
 * @param {number[]} fills fill fraction 0..1 for each label
 * @param {string[]} labels same length as fills
 * @param {{blank:number,mark:number,multiRatio:number,minGap:number}} [t]
 * @returns {{choice:string|null,status:"OK"|"BLANK"|"MULTIPLE"|"UNCERTAIN",selected:string[]}}
 */
export function decideRow(fills, labels, t = DEFAULTS.thresholds) {
  const th = { ...DEFAULTS.thresholds, ...(t || {}) };
  const n = fills.length;
  if (n === 0) return { choice: null, status: "BLANK", selected: [] };

  let topIdx = 0;
  for (let i = 1; i < n; i++) if (fills[i] > fills[topIdx]) topIdx = i;
  const top = fills[topIdx];
  let second = 0;
  for (let i = 0; i < n; i++) if (i !== topIdx && fills[i] > second) second = fills[i];

  // 1. nothing marked
  if (top < th.blank) return { choice: null, status: "BLANK", selected: [] };

  // 2. two or more real marks of similar strength
  let marked = 0;
  for (let i = 0; i < n; i++) if (fills[i] >= th.mark) marked++;
  if (marked >= 2 && second >= top * th.multiRatio) {
    const selected = [];
    for (let i = 0; i < n; i++) if (fills[i] >= th.mark) selected.push(labels[i]);
    return { choice: null, status: "MULTIPLE", selected };
  }

  // 3. weak or ambiguous mark: suggest the strongest one
  if (top < th.mark || top - second < th.minGap) {
    return { choice: labels[topIdx], status: "UNCERTAIN", selected: [labels[topIdx]] };
  }

  // 4. clear single mark
  return { choice: labels[topIdx], status: "OK", selected: [labels[topIdx]] };
}
