// Answer-sheet layout. Single source of truth for geometry (docs/PLAN.md section 4.1).
// Canonical coordinate system: millimetres on an A4 portrait page (210 x 297),
// origin top-left, y pointing down. All values rounded to 0.01 mm.

import { buildSpmLayout, SPM_KOM28, SPM_MAX_QUESTIONS } from "./forms/spm-kom28.js";

export const LAYOUT_VERSION = 1;

/** Sheet formats. "app" (absent) = printed sheet with black corner markers; SPM_KOM28 = official KPM red form. */
export const FORMATS = { APP: "app", SPM_KOM28 };

export const isRedForm = (config) => !!config && config.format === SPM_KOM28;

const ROWS_PER_COLUMN = 20;
const ALL_CHOICES = ["A", "B", "C", "D", "E"];

function r2(v) {
  return Math.round(v * 100) / 100;
}

export function validateLayoutConfig(config) {
  const errors = [];
  if (config === null || typeof config !== "object") {
    return { ok: false, errors: ["config mesti objek"] };
  }
  const { numQuestions, numChoices, idDigits } = config;
  if (config.format !== undefined && config.format !== FORMATS.APP && config.format !== SPM_KOM28) {
    return { ok: false, errors: ["format tidak dikenali"] };
  }
  if (isRedForm(config)) {
    if (!Number.isInteger(numQuestions) || numQuestions < 1 || numQuestions > SPM_MAX_QUESTIONS) {
      errors.push(`numQuestions mesti integer 1..${SPM_MAX_QUESTIONS}`);
    }
    if (numChoices !== 4) errors.push("numChoices mesti 4 untuk borang SPM");
    if (idDigits !== 0) errors.push("idDigits mesti 0 untuk borang SPM");
    return { ok: errors.length === 0, errors };
  }
  if (!Number.isInteger(numQuestions) || numQuestions < 10 || numQuestions > 60) {
    errors.push("numQuestions mesti integer 10..60");
  }
  if (numChoices !== 4 && numChoices !== 5) {
    errors.push("numChoices mesti 4 atau 5");
  }
  if (!Number.isInteger(idDigits) || idDigits < 0 || idDigits > 6) {
    errors.push("idDigits mesti integer 0..6");
  }
  return { ok: errors.length === 0, errors };
}

export function layoutCode(config) {
  if (isRedForm(config)) return `SPM-KOM28-Q${config.numQuestions}`;
  return `Q${config.numQuestions}-C${config.numChoices}-ID${config.idDigits}`;
}

export function buildLayout(config) {
  const v = validateLayoutConfig(config);
  if (!v.ok) {
    const err = new Error("LAYOUT_INVALID: " + v.errors.join("; "));
    err.code = "LAYOUT_INVALID";
    throw err;
  }
  if (isRedForm(config)) return buildSpmLayout(config);
  const { numQuestions, numChoices, idDigits } = config;
  const choices = ALL_CHOICES.slice(0, numChoices);
  const cols = Math.ceil(numQuestions / ROWS_PER_COLUMN);

  const markers = [
    { id: "TL", cx: 14, cy: 14, size: 8 },
    { id: "TR", cx: 196, cy: 14, size: 8 },
    { id: "BR", cx: 196, cy: 283, size: 8 },
    { id: "BL", cx: 14, cy: 283, size: 8 },
  ];

  const questions = [];
  for (let q = 1; q <= numQuestions; q++) {
    const col = Math.floor((q - 1) / ROWS_PER_COLUMN);
    const row = (q - 1) % ROWS_PER_COLUMN;
    const colX = 22 + col * 58;
    const cy = 100 + row * 8;
    questions.push({
      q,
      col,
      row,
      labelX: r2(colX),
      labelY: r2(cy),
      bubbles: choices.map((choice, k) => ({
        choice,
        cx: r2(colX + 12 + k * 7),
        cy: r2(cy),
        r: 2.5,
      })),
    });
  }

  const choiceHeaders = [];
  for (let col = 0; col < cols; col++) {
    const colX = 22 + col * 58;
    choices.forEach((choice, k) => {
      choiceHeaders.push({ col, choice, x: r2(colX + 12 + k * 7), y: 93 });
    });
  }

  let idBlock = null;
  if (idDigits > 0) {
    const writeBoxes = [];
    const digits = [];
    for (let j = 0; j < idDigits; j++) {
      writeBoxes.push({ x: r2(141.5 + j * 7), y: 27, w: 5, h: 6 });
      const bubbles = [];
      for (let d = 0; d <= 9; d++) {
        bubbles.push({ digit: d, cx: r2(144 + j * 7), cy: r2(38 + d * 5.5), r: 2.1 });
      }
      digits.push({ index: j, bubbles });
    }
    idBlock = { label: { x: 141, y: 24 }, writeBoxes, digits };
  }

  return {
    schema: "omr-layout",
    version: LAYOUT_VERSION,
    code: layoutCode(config),
    config: { numQuestions, numChoices, idDigits },
    page: { widthMm: 210, heightMm: 297 },
    markers,
    orientationBar: { x: 90, y: 11, w: 30, h: 6 },
    regions: {
      title: { x: 22, y: 22, w: 110, h: 8 },
      name: { x: 22, y: 32, w: 110, h: 10 },
      className: { x: 22, y: 44, w: 110, h: 10 },
      date: { x: 22, y: 56, w: 110, h: 8 },
    },
    choices,
    bubbleRadius: 2.5,
    questions,
    choiceHeaders,
    idBlock,
    footer: {
      x: 105,
      y: 272,
      text: "Hitamkan bulatan sepenuhnya dengan pensel 2B. Jangan lipat atau conteng penanda sudut.",
    },
  };
}
