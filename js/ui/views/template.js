import { h } from '../../util/dom.js';
import { getSetting } from '../../data/repo.js';
import { buildLayout } from '../../omr/layout.js';
import { renderSheetSvg, svgToNode } from '../../template/render-sheet.js';
import { S } from '../strings.ms.js';
import { loadTest, enc } from '../helpers.js';

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  ctx.setHeader({ title: S.template.title, back: notFound ? '#/' : `#/ujian/${enc(ctx.params.id)}` });
  if (notFound) return notFound;

  const layout = buildLayout(test.layoutConfig);
  const schoolName = await getSetting('schoolName', '');
  const svg = renderSheetSvg(layout, {
    title: test.name, testName: test.name, schoolName,
    labels: { name: S.template.studentName, className: S.template.studentClass, date: S.template.date },
  });
  const node = svgToNode(svg);

  return h('div', { class: 'stack' },
    h('p', { class: 'muted no-print' }, `${S.template.layoutCode}: `, h('strong', { class: 'num' }, layout.code)),
    h('button', { class: 'btn btn--lg btn--block no-print', type: 'button', onclick: () => window.print() }, S.template.print),
    h('p', { class: 'muted no-print' }, S.template.guide, ' ', S.template.useCopy),
    h('div', { class: 'sheet-preview' }, h('div', { class: 'sheet' }, node)));
}
