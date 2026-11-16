// Score statistics (pure functions).
const r1 = (x) => Math.round(x * 10) / 10;

export function computeStats(results) {
  const n = results.length;
  if (!n) {
    return { count: 0, meanCorrect: null, medianCorrect: null, maxCorrect: null, minCorrect: null, sdCorrect: null, meanPercent: null };
  }
  const c = results.map((r) => r.correct).sort((a, b) => a - b);
  const mean = c.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 ? c[(n - 1) / 2] : (c[n / 2 - 1] + c[n / 2]) / 2;
  const sd = Math.sqrt(c.reduce((s, v) => s + (v - mean) ** 2, 0) / n); // population SD
  const meanPct = results.reduce((s, r) => s + r.percent, 0) / n;
  return {
    count: n,
    meanCorrect: r1(mean),
    medianCorrect: r1(median),
    maxCorrect: c[n - 1],
    minCorrect: c[0],
    sdCorrect: r1(sd),
    meanPercent: r1(meanPct),
  };
}

/** Histogram by percent. Bins are [from,to) except the last, which includes 100. */
export function scoreDistribution(results, total, binSize = 10) {
  const bins = [];
  for (let f = 0; f < 100; f += binSize) bins.push({ fromPct: f, toPct: Math.min(f + binSize, 100), count: 0 });
  for (const r of results) {
    const pct = total ? (r.correct / total) * 100 : 0;
    let i = Math.floor(pct / binSize);
    if (i >= bins.length) i = bins.length - 1;
    bins[i].count++;
  }
  return bins;
}
