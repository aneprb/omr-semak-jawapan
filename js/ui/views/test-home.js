import { h } from '../../util/dom.js';
import { saveTest, deleteTest, listResults } from '../../data/repo.js';
import { resultsToRows, toCsv } from '../../data/csv.js';
import { downloadText } from '../../util/download.js';
import { stamp, slugify } from '../../util/format.js';
import { uuid } from '../../util/uuid.js';
import { S } from '../strings.ms.js';
import { confirmDialog, toast } from '../components.js';
import { loadTest, keyComplete, keyFilled, enc } from '../helpers.js';
import { isRedForm } from '../../omr/layout.js';

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  if (notFound) { ctx.setHeader({ title: S.app.name, back: '#/' }); return notFound; }
  ctx.setHeader({ title: test.name, back: '#/' });
  const results = await listResults(test.id);
  const id = enc(test.id);
  const n = test.layoutConfig.numQuestions;
  const ready = keyComplete(test);

  const link = (label, href, sub) => h('li', null, h('a', { class: 'list-item', href },
    h('span', { class: 'list-item__main' }, h('span', { class: 'list-item__title', style: 'display:block' }, label),
      sub ? h('span', { class: 'list-item__sub' }, sub) : null)));

  const exportCsv = async () => {
    const rows = resultsToRows(test, results);
    downloadText(`keputusan-${slugify(test.name)}-${stamp()}.csv`, toCsv(rows));
    toast(S.results.exported);
  };

  const duplicate = async () => {
    const now = new Date().toISOString();
    const copy = {
      ...structuredClone(test), id: uuid(), name: `${test.name} (2)`.slice(0, 80),
      locked: false, createdAt: now, updatedAt: now,
    };
    await saveTest(copy);
    toast(S.home.duplicated);
    ctx.navigate(`#/ujian/${enc(copy.id)}`);
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: S.home.deleteTitle, body: S.home.deleteBody, confirm: S.app.delete, danger: true });
    if (!ok) return;
    await deleteTest(test.id);
    toast(S.home.deleted);
    ctx.navigate('#/');
  };

  return h('div', { class: 'stack' },
    h('section', { class: 'card card--hero stack' },
      h('p', null, S.home.keyDone(keyFilled(test), n)),
      h('p', { class: 'muted' }, S.home.papers(results.length) + (test.className ? ` · ${test.className}` : '') + (test.subject ? ` · ${test.subject}` : ''))),
    h('a', { class: 'btn btn--lg btn--block', href: `#/ujian/${id}/imbas`, 'aria-disabled': ready ? null : 'true', tabindex: ready ? null : '-1', 'aria-describedby': ready ? null : 'need-key' }, S.home.scan),
    ready ? null : h('p', { id: 'need-key', class: 'muted', role: 'status' }, S.home.needKey),
    h('ul', { class: 'list' },
      link(S.home.key, `#/ujian/${id}/skema`),
      link(S.home.results, `#/ujian/${id}/keputusan`, S.home.papers(results.length)),
      link(S.home.analysis, `#/ujian/${id}/analisis`),
      link(isRedForm(test.layoutConfig) ? S.home.templateSpm : S.home.template, `#/ujian/${id}/templat`),
      link(S.home.roster, `#/ujian/${id}/roster`, S.roster.count(test.roster.length))),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn--secondary', type: 'button', onclick: exportCsv, disabled: results.length === 0 }, S.home.export),
      h('button', { class: 'btn btn--secondary', type: 'button', onclick: duplicate }, S.home.duplicate),
      h('button', { class: 'btn btn--danger', type: 'button', onclick: remove }, S.home.delete)));
}
