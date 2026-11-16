// Grading helpers (pure functions, no DOM).

/** Merge scanned answers with teacher overrides into the final answer array. */
export function resolveFinal(scanned, overrides = {}) {
  const n = (scanned || []).reduce((m, s) => Math.max(m, s.q), 0);
  const final = new Array(n).fill(null);
  for (const s of scanned || []) final[s.q - 1] = s.choice ?? null;
  for (const [qs, v] of Object.entries(overrides || {})) {
    const q = Number(qs);
    if (!Number.isInteger(q) || q < 1) continue;
    while (final.length < q) final.push(null);
    final[q - 1] = v ?? null;
  }
  return final;
}

/** Grade one sheet. total = key.length; a null key entry is never correct. */
export function gradeSheet(final, key) {
  const perQuestion = key.map((k, i) => {
    const given = final[i] ?? null;
    return { q: i + 1, given, key: k, isCorrect: k != null && given !== null && given === k };
  });
  const correct = perQuestion.filter((p) => p.isCorrect).length;
  const total = key.length;
  const percent = total ? Math.round((correct / total) * 1000) / 10 : 0;
  return { correct, total, percent, perQuestion };
}

/** Return new Result copies with correct/total/percent recomputed. */
export function regradeAll(results, key) {
  return results.map((r) => {
    const g = gradeSheet(r.final || [], key);
    return { ...r, correct: g.correct, total: g.total, percent: g.percent };
  });
}

/**
 * Parse answer-key text. Accepts "ABCD...", "A B C", "A,B,C", lines, or
 * numbered "1.A 2-B 3:C". "-" or "?" means unset (null).
 */
export function parseKeyText(text, numQuestions, numChoices) {
  const errors = [];
  const valid = "ABCDE".slice(0, numChoices);
  const list = valid.split("").join(", ");
  const key = new Array(numQuestions).fill(null);
  const src = String(text || "").toUpperCase();
  if (/\d/.test(src)) {
    const re = /(\d+)\s*[.\-:)=]?\s*([A-Z?\-])/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(src))) {
      const q = Number(m[1]);
      const c = m[2];
      if (q < 1 || q > numQuestions) { errors.push(`Soalan ${q} di luar julat 1-${numQuestions}.`); continue; }
      if (seen.has(q)) errors.push(`Soalan ${q} diisi lebih sekali.`);
      seen.add(q);
      if (c === "-" || c === "?") continue;
      if (!valid.includes(c)) { errors.push(`Soalan ${q}: pilihan "${c}" tidak sah (hanya ${list}).`); continue; }
      key[q - 1] = c;
    }
  } else {
    const bad = new Set();
    const tokens = src.replace(/[\s,;]+/g, "").split("").filter((c) => c !== "");
    tokens.forEach((c, i) => {
      if (c === "-" || c === "?") return;
      if (!valid.includes(c)) { bad.add(c); return; }
      if (i < numQuestions) key[i] = c;
    });
    if (bad.size) errors.push(`Aksara tidak sah: ${[...bad].join(" ")} (hanya ${list}).`);
    if (tokens.length > numQuestions) errors.push(`Terlalu banyak jawapan: ${tokens.length}, dijangka ${numQuestions}.`);
    else if (tokens.length > 0 && tokens.length < numQuestions) errors.push(`Kurang jawapan: ${tokens.length}, dijangka ${numQuestions}.`);
  }
  return { key, errors };
}
