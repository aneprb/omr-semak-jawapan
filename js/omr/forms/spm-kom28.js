// Geometri borang "KERTAS JAWAPAN OBJEKTIF SPM" (LPM/KOM 28 PIN.6/2001), dicetak dakwat merah.
// DIJANA oleh tools/measure_spm.py daripada gambar sebenar; blok PARAMS ialah JSON (dibaca juga oleh
// tools/gen_sheets.py). Koordinat ternormal: u = 0..1 merentas lebar, v = 0..1 merentas tinggi
// "bingkai rujukan" = kawasan jawapan: sisi kiri ialah garis menegak antara maklumat calon dan kawasan
// jawapan, sisi atas ialah garis mendatar di bawah kotak pengawas, sisi kanan dan bawah ialah bingkai luar.
// Unit panjang dalam lapis susun atur: x = u, y = v * aspect (supaya bulatan kekal bulat/elips sebenar).

/*PARAMS-START*/
export const SPM_KOM28_PARAMS = {
  "aspect": 1.5318,
  "choices": ["A", "B", "C", "D"],
  "maxQuestions": 80,
  "perColumn": 30,
  "blockSize": 5,
  "bubble": {"rx": 0.01681, "ry": 0.00745},
  "colX": [[0.07028, 0.1333, 0.19513, 0.25695], [0.40401, 0.46703, 0.53066, 0.59128], [0.73834, 0.80197, 0.86379, 0.92622]],
  "rowV": [0.09595, 0.11918, 0.14286, 0.16574, 0.18854, 0.2496, 0.27253, 0.29591, 0.31915, 0.34254, 0.40433, 0.42799, 0.45153, 0.47522, 0.49887, 0.56152, 0.58525, 0.60962, 0.63313, 0.65661, 0.71859, 0.74174, 0.7645, 0.78705, 0.80936, 0.8688, 0.89096, 0.91331, 0.93539, 0.95775],
  "name": {"u": -0.55, "v": -0.205, "w": 0.53, "h": 0.093}
};
/*PARAMS-END*/

export const SPM_KOM28 = "spm-kom28";
export const SPM_MAX_QUESTIONS = SPM_KOM28_PARAMS.maxQuestions;

/** Pusat bulatan (u, v) soalan q (1-based) pilihan k (0=A..3=D). */
export function bubbleUV(q, k) {
  const p = SPM_KOM28_PARAMS;
  const col = Math.floor((q - 1) / p.perColumn);
  const row = (q - 1) % p.perColumn;
  return { u: p.colX[col][k], v: p.rowV[row] };
}

/** Blok 5 soalan (indeks 0..): { col, row0 } untuk soalan pertama dalam blok. */
export function blockOf(q) {
  const p = SPM_KOM28_PARAMS;
  const col = Math.floor((q - 1) / p.perColumn);
  const row = (q - 1) % p.perColumn;
  return { col, block: Math.floor(row / p.blockSize), row };
}

function r4(v) {
  return Math.round(v * 1e4) / 1e4;
}

/**
 * Susun atur dalam bentuk yang sama dengan buildLayout() (supaya overlay/semakan berfungsi), tetapi
 * koordinat ialah unit bingkai: x = u, y = v * aspect. config = { numQuestions: 1..80 }.
 */
export function buildSpmLayout(config) {
  const p = SPM_KOM28_PARAMS;
  const n = config && Number.isInteger(config.numQuestions) ? config.numQuestions : 0;
  if (n < 1 || n > p.maxQuestions) {
    const err = new Error("LAYOUT_INVALID: numQuestions mesti integer 1.." + p.maxQuestions);
    err.code = "LAYOUT_INVALID";
    throw err;
  }
  const a = p.aspect;
  const rxy = p.bubble;
  const questions = [];
  for (let q = 1; q <= n; q++) {
    const { col, row } = blockOf(q);
    questions.push({
      q,
      col,
      row,
      labelX: r4(p.colX[col][0] - 0.05),
      labelY: r4(p.rowV[row] * a),
      bubbles: p.choices.map((choice, k) => ({
        choice,
        cx: r4(p.colX[col][k]),
        cy: r4(p.rowV[row] * a),
        r: r4(Math.sqrt(rxy.rx * rxy.ry)),
        rx: r4(rxy.rx),
        ry: r4(rxy.ry * a),
      })),
    });
  }
  const nm = p.name;
  return {
    schema: "omr-layout",
    format: SPM_KOM28,
    version: 1,
    code: "SPM-KOM28-Q" + n,
    config: { numQuestions: n, numChoices: 4, idDigits: 0 },
    page: { widthMm: 1, heightMm: a },
    frame: { aspect: a },
    markers: [],
    orientationBar: null,
    regions: {
      name: { x: nm.u, y: r4(nm.v * a), w: nm.w, h: r4(nm.h * a) },
      className: { x: nm.u, y: r4((nm.v + nm.h) * a), w: nm.w, h: r4(0.03 * a) },
    },
    choices: p.choices.slice(),
    bubbleRadius: r4(Math.sqrt(rxy.rx * rxy.ry)),
    questions,
    choiceHeaders: [],
    idBlock: null,
  };
}
