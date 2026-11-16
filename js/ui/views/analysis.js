import { h, mount } from '../../util/dom.js';
import { listResults } from '../../data/repo.js';
import { computeStats, scoreDistribution } from '../../grading/stats.js';
import { itemAnalysis } from '../../grading/items.js';
import { itemsToRows, toCsv } from '../../data/csv.js';
import { downloadText } from '../../util/download.js';
import { stamp, slugify } from '../../util/format.js';
import { S } from '../strings.ms.js';
import { emptyState, toast } from '../components.js';
import { loadTest, choicesOf, enc } from '../helpers.js';

const DIFF_KIND = { Mudah: 'ok', Sederhana: '', Sukar: 'bad' };

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  ctx.setHeader({ title: S.analysis.title, back: notFound ? '#/' : `#/ujian/${enc(ctx.params.id)}`, wide: true });
  if (notFound) return notFound;
  const results = await listResults(test.id);
  if (!results.length) {
    return emptyState({ title: S.results.empty, body: S.analysis.needData, action: { label: S.home.scan, href: `#/ujian/${enc(test.id)}/imbas` } });
  }

  const items = itemAnalysis(results, test.key, choicesOf(test));
  const dist = scoreDistribution(results, test.layoutConfig.numQuestions);
  const maxCount = Math.max(1, ...dist.map((b) => b.count));
  const stats = computeStats(results);
  let sortBy = 'q';
  const root = h('div', { class: 'stack' });

  const sorted = () => {
    const f = { q: (a) => a.q, pct: (a) => a.pctCorrect ?? 101 }[sortBy];
    return [...items].sort((a, b) => f(a) - f(b));
  };

  function draw() {
    mount(root,
      h('p', { class: 'muted' }, `${S.results.count}: ${stats.count} · ${S.results.mean}: ${stats.meanCorrect}`),
      h('section', { class: 'card stack', 'aria-label': S.analysis.distribution },
        h('h2', null, S.analysis.distribution),
        dist.map((b) => h('div', { style: 'display:grid;grid-template-columns:72px 1fr 32px;gap:8px;align-items:center' },
          h('span', { class: 'num muted' }, `${b.fromPct}–${b.toPct}%`),
          h('div', { class: 'bar', role: 'img', 'aria-label': `${b.fromPct}–${b.toPct}%: ${b.count}` }, h('i', { style: `width:${(b.count / maxCount) * 100}%` })),
          h('span', { class: 'num' }, b.count)))),
      stats.count < 10 ? h('p', { class: 'muted', role: 'note' }, S.analysis.needTen) : null,
      h('div', { class: 'field', style: 'max-width:260px' },
        h('label', { for: 'sort' }, S.analysis.sortBy),
        h('select', { class: 'select', id: 'sort', onchange: (e) => { sortBy = e.target.value; draw(); document.getElementById('sort')?.focus(); } },
          h('option', { value: 'q', selected: sortBy === 'q' }, S.analysis.question),
          h('option', { value: 'pct', selected: sortBy === 'pct' }, S.analysis.pctCorrect))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('caption', { class: 'sr-only' }, S.analysis.title),
        h('thead', null, h('tr', null,
          [S.analysis.question, S.analysis.answer, S.analysis.pctCorrect, S.analysis.difficulty, S.analysis.discrimination, S.analysis.distractor]
            .map((t, i) => h('th', { scope: 'col', class: i === 0 || i === 1 || i === 2 || i === 4 ? 'num' : null }, t)))),
        h('tbody', null, sorted().map((it) => h('tr', null,
          h('td', { class: 'num' }, it.q),
          h('td', { class: 'num' }, it.key ?? '-'),
          h('td', { class: 'num' },
            h('div', { style: 'display:grid;grid-template-columns:48px 80px;gap:8px;align-items:center;justify-content:end' },
              h('span', null, it.pctCorrect ?? '-'), h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${it.pctCorrect ?? 0}%` })))),
          h('td', null,
            h('span', { class: `badge ${DIFF_KIND[it.difficulty] ? 'badge--' + DIFF_KIND[it.difficulty] : ''}` }, it.difficulty ?? '-'),
            it.discrimination !== null && it.discrimination < 0.2 ? h('span', { class: 'badge badge--warn', style: 'margin-left:6px' }, `! ${S.analysis.lowDisc}`) : null),
          h('td', { class: 'num' }, it.discrimination ?? '-'),
          h('td', null, it.topDistractor ?? '-')))))),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        downloadText(`analisis-item-${slugify(test.name)}-${stamp()}.csv`, toCsv(itemsToRows(test, items)));
        toast(S.results.exported);
      } }, S.analysis.exportCsv));
  }
  draw();
  return root;
}
