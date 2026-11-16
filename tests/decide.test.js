// js/omr/decide.js (PLAN 4.2)
import { assertEqual } from "./harness.js";
import { decideRow } from "../js/omr/decide.js";

const L = ["A", "B", "C", "D", "E"];

export default [
  {
    name: "BLANK apabila nilai teratas < 0.20",
    fn() {
      assertEqual(decideRow([0.05, 0.1, 0.19, 0, 0], L), { choice: null, status: "BLANK", selected: [] });
    },
  },
  {
    name: "OK: satu tanda jelas",
    fn() {
      assertEqual(decideRow([0.05, 0.9, 0.1, 0, 0], L), { choice: "B", status: "OK", selected: ["B"] });
      assertEqual(decideRow([0.1, 0.1, 0.1, 0.8], L.slice(0, 4)), { choice: "D", status: "OK", selected: ["D"] });
    },
  },
  {
    name: "MULTIPLE: dua tanda kuat setanding",
    fn() {
      assertEqual(decideRow([0.9, 0.8, 0, 0, 0], L), { choice: null, status: "MULTIPLE", selected: ["A", "B"] });
      assertEqual(decideRow([0.7, 0.1, 0.65, 0, 0.5], L), { choice: null, status: "MULTIPLE", selected: ["A", "C", "E"] });
    },
  },
  {
    name: "MULTIPLE: sempadan multiRatio (second >= top*0.75)",
    fn() {
      const t = { blank: 0.2, mark: 0.45, multiRatio: 0.75, minGap: 0.2 };
      assertEqual(decideRow([1.0, 0.75, 0, 0], L.slice(0, 4), t).status, "MULTIPLE");
      // second < top*0.75 dan jurang 0.26 >= minGap -> OK (tanda kedua separa dipadam)
      assertEqual(decideRow([1.0, 0.74, 0, 0], L.slice(0, 4), t).status, "OK");
    },
  },
  {
    name: "dua tanda dengan second jauh lebih lemah -> OK",
    fn() {
      assertEqual(decideRow([0.95, 0.5, 0, 0, 0], L), { choice: "A", status: "OK", selected: ["A"] });
    },
  },
  {
    name: "UNCERTAIN: tanda ringan (top < mark) mencadangkan pilihan teratas",
    fn() {
      assertEqual(decideRow([0.1, 0.35, 0.05, 0, 0], L), { choice: "B", status: "UNCERTAIN", selected: ["B"] });
    },
  },
  {
    name: "UNCERTAIN: jurang kecil antara dua tanda (top - second < minGap) tetapi bukan MULTIPLE",
    fn() {
      // second 0.40 < mark -> bukan MULTIPLE; jurang 0.15 < 0.20
      assertEqual(decideRow([0.55, 0.4, 0, 0, 0], L), { choice: "A", status: "UNCERTAIN", selected: ["A"] });
    },
  },
  {
    name: "ambang tersuai dihormati; nilai sempadan tepat",
    fn() {
      const t = { blank: 0.3, mark: 0.6, multiRatio: 0.5, minGap: 0.1 };
      assertEqual(decideRow([0.29, 0, 0, 0], L.slice(0, 4), t).status, "BLANK");
      assertEqual(decideRow([0.3, 0, 0, 0], L.slice(0, 4), t).status, "UNCERTAIN");
      assertEqual(decideRow([0.6, 0, 0, 0], L.slice(0, 4), t).status, "OK");
      assertEqual(decideRow([0.8, 0.4, 0, 0], L.slice(0, 4), t).status, "OK");
      assertEqual(decideRow([0.8, 0.6, 0, 0], L.slice(0, 4), t).status, "MULTIPLE");
    },
  },
  {
    name: "label digit (0-9) berfungsi sama",
    fn() {
      const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
      const fills = new Array(10).fill(0.02);
      fills[7] = 0.93;
      assertEqual(decideRow(fills, digits), { choice: "7", status: "OK", selected: ["7"] });
    },
  },
];
