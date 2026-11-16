import { h, mount } from '../../util/dom.js';
import { getResult, saveResult, deleteResult } from '../../data/repo.js';
import { gradeSheet } from '../../grading/grade.js';
import { S } from '../strings.ms.js';
import { confirmDialog, answerDialog, questionRow, questionStatus, toast, field, emptyState } from '../components.js';
import { loadTest, choicesOf, enc } from '../helpers.js';

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  const listHref = `#/ujian/${enc(ctx.params.id)}/keputusan`;
  ctx.setHeader({ title: S.results.detail, back: notFound ? '#/' : listHref });
  if (notFound) return notFound;
  const result = await getResult(ctx.params.rid);
  if (!result || result.testId !== test.id) {
    return emptyState({ title: S.errors.resultNotFound, action: { label: S.results.title, href: listHref } });
  }

  const choices = choicesOf(test);
  const root = h('div', { class: 'stack' });
  let dirty = false;

  async function editQuestion(i) {
    const picked = await answerDialog({ q: i + 1, choices, current: result.final[i] ?? null, keyAnswer: test.key[i] });
    if (picked === undefined) return;
    result.final[i] = picked;
    if (!result.manualEdits.includes(i + 1)) result.manualEdits.push(i + 1);
    result.manualEdits.sort((a, b) => a - b);
    Object.assign(result, (({ correct, total, percent }) => ({ correct, total, percent }))(gradeSheet(result.final, test.key)));
    dirty = true;
    draw();
  }

  function draw() {
    const g = gradeSheet(result.final, test.key);
    mount(root,
      h('div', { class: 'score', role: 'status' },
        h('div', { class: 'score__value' }, S.review.score(g.correct, g.total)),
        h('div', { class: 'score__pct num' }, S.review.percent(g.percent))),
      h('div', { class: 'grid-2 stack' },
        field({ id: 'rd-code', label: S.review.studentCode, control: (id) => h('input', { class: 'input num', id, type: 'text', maxlength: 30, value: result.studentCode, oninput: (e) => { result.studentCode = e.target.value.trim(); dirty = true; } }) }),
        field({ id: 'rd-name', label: S.review.studentName, control: (id) => h('input', { class: 'input', id, type: 'text', maxlength: 120, value: result.studentName, oninput: (e) => { result.studentName = e.target.value.trim(); dirty = true; } }) })),
      h('div', { class: 'legend' },
        h('span', null, h('span', { class: 'mark mark--ok', 'aria-hidden': 'true' }, '✓'), S.review.correct),
        h('span', null, h('span', { class: 'mark mark--bad', 'aria-hidden': 'true' }, '✗'), S.review.wrong),
        h('span', null, h('span', { class: 'mark mark--warn', 'aria-hidden': 'true' }, '!'), S.review.check)),
      h('ul', { class: 'list' }, g.perQuestion.map((p, i) => {
        const edited = result.manualEdits.includes(p.q);
        const status = questionStatus({ given: p.given, key: p.key, scannedStatus: result.scanned.find((s) => s.q === p.q)?.status, edited });
        return h('li', null, questionRow({ q: p.q, given: p.given, key: p.key, status, edited, onclick: () => editQuestion(i) }));
      })),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn--lg', type: 'button', onclick: save }, S.app.save),
        h('button', { class: 'btn btn--danger', type: 'button', onclick: remove }, S.app.delete)));
  }

  async function save() {
    try {
      await saveResult(result);
      dirty = false;
      toast(S.review.saved);
    } catch { toast(S.errors.storage, { error: true }); }
  }
  async function remove() {
    const ok = await confirmDialog({ title: S.results.deleteTitle, body: S.results.deleteBody, confirm: S.app.delete, danger: true });
    if (!ok) return;
    await deleteResult(result.id);
    toast(S.results.deleted);
    ctx.navigate(listHref);
  }

  window.addEventListener('beforeunload', warnUnsaved);
  ctx.onLeave(() => window.removeEventListener('beforeunload', warnUnsaved));
  function warnUnsaved(e) { if (dirty) e.preventDefault(); }

  draw();
  return root;
}
