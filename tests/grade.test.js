import { assert, assertEqual } from "./harness.js";
import { resolveFinal, gradeSheet, regradeAll, parseKeyText } from "../js/grading/grade.js";

const key = ["A", "B", "C", "D"];

export default [
  {
    name: "resolveFinal: overrides replace scanned and can clear",
    fn() {
      const scanned = [
        { q: 1, choice: "A", status: "OK" },
        { q: 2, choice: null, status: "BLANK" },
        { q: 3, choice: "C", status: "OK" },
      ];
      assertEqual(resolveFinal(scanned, { 2: "B", 3: null }), ["A", "B", null]);
      assertEqual(resolveFinal(scanned, {}), ["A", null, "C"]);
    },
  },
  {
    name: "gradeSheet: counts, percent rounding, perQuestion",
    fn() {
      const g = gradeSheet(["A", "B", null, "A"], key);
      assertEqual(g.correct, 2);
      assertEqual(g.total, 4);
      assertEqual(g.percent, 50);
      assertEqual(g.perQuestion[2], { q: 3, given: null, key: "C", isCorrect: false });
      assertEqual(gradeSheet(["A", "B", "C"], ["A", "B", "C", "D", "A", "B", "C"]).percent, 42.9);
    },
  },
  {
    name: "gradeSheet: null key never correct, empty key gives 0%",
    fn() {
      assertEqual(gradeSheet([null, "A"], [null, "A"]).correct, 1);
      assertEqual(gradeSheet([], []).percent, 0);
    },
  },
  {
    name: "regradeAll: returns new copies with updated score",
    fn() {
      const rs = [{ id: "r1", final: ["A", "B", "C", "D"], correct: 0, total: 0, percent: 0 }];
      const out = regradeAll(rs, ["A", "B", "C", "A"]);
      assertEqual(out[0].correct, 3);
      assertEqual(out[0].percent, 75);
      assert(out[0] !== rs[0], "must be a copy");
      assertEqual(rs[0].correct, 0);
    },
  },
  {
    name: "parseKeyText: continuous, separated and lowercase",
    fn() {
      assertEqual(parseKeyText("abcd", 4, 4), { key: ["A", "B", "C", "D"], errors: [] });
      assertEqual(parseKeyText("A, B\nC D", 4, 4).key, ["A", "B", "C", "D"]);
    },
  },
  {
    name: "parseKeyText: numbered format and unset marks",
    fn() {
      const r = parseKeyText("1.A 2-B 4:D", 4, 4);
      assertEqual(r.key, ["A", "B", null, "D"]);
      assertEqual(r.errors, []);
      assertEqual(parseKeyText("A-C?", 4, 4).key, ["A", null, "C", null]);
    },
  },
  {
    name: "parseKeyText: errors for invalid choice, count and range",
    fn() {
      assert(parseKeyText("ABCE", 4, 4).errors.length > 0, "E invalid for 4 choices");
      assertEqual(parseKeyText("ABCDE", 4, 5).errors.length, 1);
      assertEqual(parseKeyText("AB", 4, 4).errors.length, 1);
      assert(parseKeyText("9.A", 4, 4).errors.length > 0, "out of range");
      assertEqual(parseKeyText("ABCDE", 5, 5).key[4], "E");
    },
  },
];
