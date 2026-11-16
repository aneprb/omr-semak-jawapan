import { assertEqual, assertClose } from "./harness.js";
import { computeStats, scoreDistribution } from "../js/grading/stats.js";

const mk = (correct, total = 10) => ({ correct, total, percent: Math.round((correct / total) * 1000) / 10 });

export default [
  {
    name: "computeStats: empty gives nulls",
    fn() {
      const s = computeStats([]);
      assertEqual(s.count, 0);
      assertEqual(s.meanCorrect, null);
      assertEqual(s.sdCorrect, null);
    },
  },
  {
    name: "computeStats: odd count [2,4,9]",
    fn() {
      const s = computeStats([mk(9), mk(2), mk(4)]);
      assertEqual(s.count, 3);
      assertEqual(s.meanCorrect, 5);
      assertEqual(s.medianCorrect, 4);
      assertEqual(s.maxCorrect, 9);
      assertEqual(s.minCorrect, 2);
      assertClose(s.sdCorrect, 2.9, 0.001); // sqrt(26/3)=2.944 (population SD)
    },
  },
  {
    name: "computeStats: even count median and percent mean",
    fn() {
      const s = computeStats([mk(2), mk(4), mk(6), mk(8)]);
      assertEqual(s.medianCorrect, 5);
      assertEqual(s.meanCorrect, 5);
      assertEqual(s.meanPercent, 50);
      assertEqual(s.sdCorrect, 2.2); // sqrt(5)=2.236
    },
  },
  {
    name: "scoreDistribution: bins and 100% in last bin",
    fn() {
      const d = scoreDistribution([mk(0), mk(5), mk(10), mk(9), mk(10)], 10);
      assertEqual(d.length, 10);
      assertEqual(d[0], { fromPct: 0, toPct: 10, count: 1 });
      assertEqual(d[5].count, 1);
      assertEqual(d[9], { fromPct: 90, toPct: 100, count: 3 });
      assertEqual(d.reduce((s, b) => s + b.count, 0), 5);
    },
  },
  {
    name: "scoreDistribution: custom bin size and empty",
    fn() {
      const d = scoreDistribution([mk(5)], 10, 25);
      assertEqual(d.map((b) => b.count), [0, 0, 1, 0]);
      assertEqual(scoreDistribution([], 10).every((b) => b.count === 0), true);
    },
  },
];
