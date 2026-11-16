// Item analysis (pure functions).

export function itemAnalysis(results, key, choices) {
  const n = results.length;
  const k = Math.ceil(0.27 * n);
  const ranked = [...results].sort((a, b) => b.correct - a.correct);
  const upper = ranked.slice(0, k);
  const lower = ranked.slice(n - k);
  return key.map((kc, i) => {
    const counts = Object.fromEntries(choices.map((c) => [c, 0]));
    counts.blank = 0;
    counts.multiple = 0;
    let correctCount = 0;
    for (const r of results) {
      const g = r.final?.[i] ?? null;
      if (g === null) {
        const multi = r.scanned?.find((s) => s.q === i + 1)?.status === "MULTIPLE";
        if (multi) counts.multiple++; else counts.blank++;
      } else if (choices.includes(g)) {
        counts[g]++;
      }
      if (kc != null && g === kc) correctCount++;
    }
    const pctCorrect = n ? Math.round((correctCount / n) * 1000) / 10 : null;
    let topDistractor = null;
    let best = 0;
    for (const c of choices) {
      if (c !== kc && counts[c] > best) { best = counts[c]; topDistractor = c; }
    }
    const difficulty = pctCorrect === null ? null : pctCorrect >= 80 ? "Mudah" : pctCorrect >= 40 ? "Sederhana" : "Sukar";
    let discrimination = null;
    if (n >= 10 && kc != null) {
      const p = (g) => g.filter((r) => r.final?.[i] === kc).length / g.length;
      discrimination = Math.round((p(upper) - p(lower)) * 100) / 100;
    }
    return { q: i + 1, key: kc, n, correctCount, pctCorrect, counts, topDistractor, difficulty, discrimination };
  });
}
