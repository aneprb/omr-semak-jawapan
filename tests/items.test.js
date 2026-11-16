import { assertEqual } from "./harness.js";
import { itemAnalysis } from "../js/grading/items.js";

const choices = ["A", "B", "C", "D"];
const key = ["A", "B"];

// 10 results ranked by correct (9..0). Q1 (key A): r0-r5 A, r6-r7 B, r8 C, r9 blank.
// Q2 (key B): r0 B, r1-r8 A, r9 MULTIPLE.
function build() {
  const q1 = ["A", "A", "A", "A", "A", "A", "B", "B", "C", null];
  return q1.map((a, i) => {
    const b = i === 0 ? "B" : i === 9 ? null : "A";
    return {
      correct: 9 - i,
      final: [a, b],
      scanned: [
        { q: 1, choice: a, status: a ? "OK" : "BLANK" },
        { q: 2, choice: b, status: i === 9 ? "MULTIPLE" : "OK" },
      ],
    };
  });
}

export default [
  {
    name: "itemAnalysis: counts, pct, difficulty, topDistractor (Q1)",
    fn() {
      const [q1] = itemAnalysis(build(), key, choices);
      assertEqual(q1.n, 10);
      assertEqual(q1.correctCount, 6);
      assertEqual(q1.pctCorrect, 60);
      assertEqual(q1.counts, { A: 6, B: 2, C: 1, D: 0, blank: 1, multiple: 0 });
      assertEqual(q1.topDistractor, "B");
      assertEqual(q1.difficulty, "Sederhana");
    },
  },
  {
    name: "itemAnalysis: multiple counted separately, Sukar (Q2)",
    fn() {
      const q2 = itemAnalysis(build(), key, choices)[1];
      assertEqual(q2.counts, { A: 8, B: 1, C: 0, D: 0, blank: 0, multiple: 1 });
      assertEqual(q2.pctCorrect, 10);
      assertEqual(q2.difficulty, "Sukar");
      assertEqual(q2.topDistractor, "A");
    },
  },
  {
    name: "itemAnalysis: discrimination with 27% groups (ceil 3 of 10)",
    fn() {
      const [q1, q2] = itemAnalysis(build(), key, choices);
      assertEqual(q1.discrimination, 1); // upper 3/3, lower 0/3
      assertEqual(q2.discrimination, 0.33); // upper 1/3, lower 0/3
    },
  },
  {
    name: "itemAnalysis: n < 10 gives null discrimination",
    fn() {
      const rs = build().slice(0, 9);
      assertEqual(itemAnalysis(rs, key, choices)[0].discrimination, null);
    },
  },
  {
    name: "itemAnalysis: tie in distractors picks earliest letter; no wrong answers gives null",
    fn() {
      const rs = [
        { correct: 0, final: ["C"], scanned: [{ q: 1, choice: "C", status: "OK" }] },
        { correct: 0, final: ["B"], scanned: [{ q: 1, choice: "B", status: "OK" }] },
        { correct: 1, final: ["A"], scanned: [{ q: 1, choice: "A", status: "OK" }] },
      ];
      assertEqual(itemAnalysis(rs, ["A"], choices)[0].topDistractor, "B");
      assertEqual(itemAnalysis([rs[2]], ["A"], choices)[0].topDistractor, null);
    },
  },
  {
    name: "itemAnalysis: difficulty boundaries and empty results",
    fn() {
      const mk = (a) => ({ correct: 0, final: [a], scanned: [{ q: 1, choice: a, status: "OK" }] });
      const five = [mk("A"), mk("A"), mk("A"), mk("A"), mk("B")];
      assertEqual(itemAnalysis(five, ["A"], choices)[0].difficulty, "Mudah"); // 80
      const e = itemAnalysis([], ["A"], choices)[0];
      assertEqual(e.n, 0);
      assertEqual(e.pctCorrect, null);
    },
  },
];
