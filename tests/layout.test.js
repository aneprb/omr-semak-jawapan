// js/omr/layout.js vs fixture emas dari tools/omr_layout.py (PLAN 4.1).
import { assert, assertEqual, assertClose, assertThrows, loadJson, requireModule } from "./harness.js";

const CODES = ["Q10-C4-ID0", "Q20-C5-ID4", "Q40-C5-ID6", "Q60-C4-ID2"];
const TOL = 0.01;
const KEYS = ["markers", "orientationBar", "regions", "questions", "idBlock"];

const mod = () => requireModule("../js/omr/layout.js");

/** Banding rekursif: nombor dengan toleransi, selainnya sama tepat. */
function compare(actual, expected, path) {
  if (typeof expected === "number") {
    assertClose(actual, expected, TOL, path);
  } else if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `${path}: bukan array`);
    assertEqual(actual.length, expected.length, `${path}.length`);
    expected.forEach((e, i) => compare(actual[i], e, `${path}[${i}]`));
  } else if (expected && typeof expected === "object") {
    assert(actual && typeof actual === "object", `${path}: bukan objek`);
    for (const k of Object.keys(expected)) compare(actual[k], expected[k], `${path}.${k}`);
  } else {
    assertEqual(actual, expected, path);
  }
}

const cases = CODES.map((code) => ({
  name: `susun atur ${code} sepadan fixture emas`,
  async fn() {
    const { buildLayout } = await mod();
    const golden = await loadJson(`./fixtures/layouts/${code}.json`);
    const layout = buildLayout(golden.config);
    assertEqual(layout.code, code, "code");
    assertEqual(layout.schema, "omr-layout", "schema");
    assertEqual(layout.page, golden.page, "page");
    assertEqual(layout.choices, golden.choices, "choices");
    assertClose(layout.bubbleRadius, golden.bubbleRadius, TOL, "bubbleRadius");
    for (const k of KEYS) compare(layout[k], golden[k], k);
    compare(layout.choiceHeaders, golden.choiceHeaders, "choiceHeaders");
  },
}));

cases.push(
  {
    name: "layoutCode menghasilkan Qn-Cn-IDn",
    async fn() {
      const { layoutCode } = await mod();
      assertEqual(layoutCode({ numQuestions: 40, numChoices: 5, idDigits: 4 }), "Q40-C5-ID4");
    },
  },
  {
    name: "validateLayoutConfig menolak konfigurasi tidak sah",
    async fn() {
      const { validateLayoutConfig } = await mod();
      assert(validateLayoutConfig({ numQuestions: 40, numChoices: 5, idDigits: 4 }).ok, "sah ditolak");
      for (const bad of [
        { numQuestions: 9, numChoices: 5, idDigits: 4 },
        { numQuestions: 61, numChoices: 5, idDigits: 4 },
        { numQuestions: 20.5, numChoices: 5, idDigits: 4 },
        { numQuestions: 20, numChoices: 3, idDigits: 4 },
        { numQuestions: 20, numChoices: 5, idDigits: 7 },
        { numQuestions: 20, numChoices: 5, idDigits: -1 },
      ]) {
        const r = validateLayoutConfig(bad);
        assert(!r.ok && r.errors.length > 0, `patut tidak sah: ${JSON.stringify(bad)}`);
      }
    },
  },
  {
    name: "buildLayout melempar LAYOUT_INVALID untuk konfigurasi tidak sah",
    async fn() {
      const { buildLayout } = await mod();
      await assertThrows(() => buildLayout({ numQuestions: 5, numChoices: 5, idDigits: 4 }), "LAYOUT_INVALID");
    },
  },
);

export default cases;
