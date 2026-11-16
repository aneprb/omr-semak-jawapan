// CSV serialisation (pure). UTF-8 BOM, CRLF, RFC 4180, formula-injection defence.

function cell(v) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows) {
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function resultsToRows(test, results) {
  const n = test.layoutConfig.numQuestions;
  const head = ["Bil", "Kod Pelajar", "Nama", "Betul", "Jumlah", "Peratus"];
  for (let q = 1; q <= n; q++) head.push("S" + q);
  const rows = [head];
  results.forEach((r, idx) => {
    const row = [idx + 1, r.studentCode ?? "", r.studentName ?? "", r.correct, r.total, r.percent];
    for (let q = 1; q <= n; q++) {
      const g = r.final?.[q - 1] ?? null;
      if (g !== null) row.push(g);
      else row.push(r.scanned?.find((s) => s.q === q)?.status === "MULTIPLE" ? "*" : "");
    }
    rows.push(row);
  });
  return rows;
}

export function itemsToRows(test, items) {
  const rows = [["Soalan", "Jawapan", "% Betul", "Kesukaran", "Diskriminasi", "A", "B", "C", "D", "E", "Kosong", "Berganda", "Pengganggu Popular"]];
  for (const it of items) {
    const c = it.counts || {};
    rows.push([
      it.q, it.key ?? "", it.pctCorrect, it.difficulty ?? "", it.discrimination,
      c.A ?? "", c.B ?? "", c.C ?? "", c.D ?? "", c.E ?? "",
      c.blank ?? 0, c.multiple ?? 0, it.topDistractor ?? "",
    ]);
  }
  return rows;
}
