import { h, mount } from '../../util/dom.js';
import { listResults } from '../../data/repo.js';
import { computeStats } from '../../grading/stats.js';
import { resultsToRows, toCsv } from '../../data/csv.js';
import { downloadText } from '../../util/download.js';
import { stamp, slugify, formatPercent } from '../../util/format.js';
import { S } from '../strings.ms.js';
import { emptyState, toast } from '../components.js';
import { loadTest, enc } from '../helpers.js';

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  const back = notFound ? '#/' : `#/ujian/${enc(ctx.params.id)}`;
  ctx.setHeader({ title: S.results.title, back, wide: true });
  if (notFound) return notFound;

  const results = await listResults(test.id);
  if (!results.length) {
    return emptyState({ title: S.results.empty, body: S.results.emptyBody, action: { label: S.home.scan, href: `#/ujian/${enc(test.id)}/imbas` } });
  }

  let sort = { by: 'scannedAt', dir: 1 };
  const root = h('div', { class: 'stack' });
  const stats = computeStats(results);
  const stat = (label, v) => h('div', { class: 'card' }, h('div', { class: 'muted' }, label), h('div', { class: 'num', style: 'font-size:var(--fs-lg);font-weight:800' }, v ?? '-'));

  const sorted = () => {
    const key = { name: (r) => (r.studentName || '').toLowerCase(), mark: (r) => r.correct, scannedAt: (r) => r.scannedAt, code: (r) => r.studentCode };
    const f = key[sort.by];
    return [...results].sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0) * sort.dir);
  };
  const th = (label, by, cls) => h('th', { class: cls, scope: 'col', 'aria-sort': sort.by === by ? (sort.dir > 0 ? 'ascending' : 'descending') : null },
    h('button', { type: 'button', onclick: () => { sort = { by, dir: sort.by === by ? -sort.dir : 1 }; draw(); } }, label));

  function draw() {
    mount(root,
      h('section', { class: 'stack', 'aria-label': S.results.stats },
        h('div', { class: 'grid-2', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px' },
          stat(S.results.count, stats.count), stat(S.results.mean, `${stats.meanCorrect} (${formatPercent(stats.meanPercent)})`),
          stat(S.results.median, stats.medianCorrect), stat(S.results.max, stats.maxCorrect),
          stat(S.results.min, stats.minCorrect), stat(S.results.sd, stats.sdCorrect))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('caption', { class: 'sr-only' }, S.results.title),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col', class: 'num' }, S.results.no), th(S.results.code, 'code'), th(S.results.name, 'name'),
          th(S.results.mark, 'mark', 'num'), h('th', { scope: 'col', class: 'num' }, S.results.pct))),
        h('tbody', null, sorted().map((r, i) => h('tr', null,
          h('td', { class: 'num' }, i + 1),
          h('td', { class: 'num' }, r.studentCode || '-'),
          h('td', null, h('a', { href: `#/ujian/${enc(test.id)}/keputusan/${enc(r.id)}` }, r.studentName || S.results.noName),
            r.manualEdits?.length ? h('span', { class: 'badge', title: S.results.editedFlag, style: 'margin-left:8px' }, S.review.edited) : null),
          h('td', { class: 'num' }, `${r.correct}/${r.total}`),
          h('td', { class: 'num' }, formatPercent(r.percent)))))),
      ),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        downloadText(`keputusan-${slugify(test.name)}-${stamp()}.csv`, toCsv(resultsToRows(test, sorted())));
        toast(S.results.exported);
      } }, S.results.exportCsv));
  }
  draw();
  return root;
}
