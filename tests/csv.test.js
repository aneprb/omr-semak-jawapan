import { assert, assertEqual } from "./harness.js";
import { toCsv, resultsToRows, itemsToRows } from "../js/data/csv.js";

const test = { layoutConfig: { numQuestions: 3, numChoices: 4, idDigits: 4 } };

export default [
  {
    name: "toCsv: BOM, CRLF, null as empty, numbers plain",
    fn() {
      const s = toCsv([["a", 1, null], ["b", 2.5, ""]]);
      assertEqual(s, "﻿a,1,\r\nb,2.5,");
      assertEqual(s.charCodeAt(0), 0xfeff);
    },
  },
  {
    name: "toCsv: RFC 4180 quoting of comma, quote, newline",
    fn() {
      assertEqual(toCsv([["Ali, Bin", 'say "hi"', "l1\nl2"]]), '﻿"Ali, Bin","say ""hi""","l1\nl2"');
    },
  },
  {
    name: "toCsv: formula injection prefixed with apostrophe",
    fn() {
      const s = toCsv([["=1+1", "+cmd", "-5x", "@SUM(A1)", "\tx", "\rx", "aman=ok"]]);
      assert(s.includes("'=1+1,'+cmd,'-5x,'@SUM(A1),'\tx,"), s);
      assert(s.includes("\"'\rx\""), "CR cell prefixed and quoted");
      assert(s.endsWith(",aman=ok"), "mid-string = untouched");
    },
  },
  {
    name: "toCsv: negative numbers are not neutralised, Malay text intact",
    fn() {
      assertEqual(toCsv([[-3, "Nur Aisyah binti Ö"]]), "﻿-3,Nur Aisyah binti Ö");
    },
  },
  {
    name: "resultsToRows: header, blank and multiple marker",
    fn() {
      const r = {
        studentCode: "0012", studentName: "Pelajar, Sintetik 1", correct: 1, total: 3, percent: 33.3,
        final: ["A", null, null],
        scanned: [
          { q: 1, choice: "A", status: "OK" },
          { q: 2, choice: null, status: "BLANK" },
          { q: 3, choice: null, status: "MULTIPLE" },
        ],
      };
      const rows = resultsToRows(test, [r]);
      assertEqual(rows[0], ["Bil", "Kod Pelajar", "Nama", "Betul", "Jumlah", "Peratus", "S1", "S2", "S3"]);
      assertEqual(rows[1], [1, "0012", "Pelajar, Sintetik 1", 1, 3, 33.3, "A", "", "*"]);
      assertEqual(resultsToRows(test, []).length, 1);
    },
  },
  {
    name: "itemsToRows: header and row mapping",
    fn() {
      const it = {
        q: 1, key: "A", n: 10, correctCount: 6, pctCorrect: 60,
        counts: { A: 6, B: 2, C: 1, D: 0, blank: 1, multiple: 0 },
        topDistractor: "B", difficulty: "Sederhana", discrimination: null,
      };
      const rows = itemsToRows(test, [it]);
      assertEqual(rows[0].length, 13);
      assertEqual(rows[0][12], "Pengganggu Popular");
      assertEqual(rows[1], [1, "A", 60, "Sederhana", null, 6, 2, 1, 0, "", 1, 0, "B"]);
    },
  },
];
