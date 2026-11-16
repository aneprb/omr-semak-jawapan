import { h, mount } from '../../util/dom.js';
import { saveTest, listResults, saveResult } from '../../data/repo.js';
import { parseKeyText, regradeAll } from '../../grading/grade.js';
import { S } from '../strings.ms.js';
import { confirmDialog, toast } from '../components.js';
import { getState, deleteState } from '../state.js';
import { loadTest, choicesOf, enc } from '../helpers.js';

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  ctx.setHeader({ title: S.key.title, back: notFound ? '#/' : `#/ujian/${enc(ctx.params.id)}` });
  if (notFound) return notFound;

  const n = test.layoutConfig.numQuestions;
  const choices = choicesOf(test);
  const draft = [...test.key];
  let cur = Math.max(0, draft.findIndex((k) => k === null));
  let tab = 'tap';
  let pasteErrors = [];
  let dirty = false;
  const scanned = getState('keyDraft');
  if (scanned && scanned.testId === test.id && scanned.key.length === n) {
    deleteState('keyDraft');
    scanned.key.forEach((k, i) => { draft[i] = k; });
    dirty = true;
    cur = Math.max(0, draft.findIndex((k) => k === null));
    if (scanned.unresolved) setTimeout(() => toast(S.key.unresolved(scanned.unresolved)), 0);
  }
  const root = h('div', { class: 'stack' });

  const filled = () => draft.filter((k) => k !== null).length;

  async function save() {
    const results = await listResults(test.id);
    if (results.length) {
      const ok = await confirmDialog({ title: S.key.recalcTitle, body: S.key.recalcBody(results.length), confirm: S.key.recalcConfirm });
      if (!ok) return;
    }
    try {
      await saveTest({ ...test, key: [...draft] });
      if (results.length) for (const r of regradeAll(results, draft)) await saveResult(r);
    } catch { toast(S.errors.storage, { error: true }); return; }
    test.key = [...draft];
    dirty = false;
    toast(S.key.saved);
    draw();
  }

  function setAnswer(i, c) { draft[i] = c; dirty = true; if (i < n - 1) cur = i + 1; draw(); }

  function tabs() {
    return h('div', { class: 'seg' }, [['tap', S.key.tabTap], ['paste', S.key.tabPaste]].map(([k, label]) => h('button', {
      type: 'button', 'aria-pressed': String(tab === k), class: 'seg-btn',
      style: `flex:1;min-height:44px;border:0;font-weight:650;background:${tab === k ? 'var(--primary)' : 'transparent'};color:${tab === k ? 'var(--on-primary)' : 'var(--primary)'}`,
      onclick: () => { tab = k; draw(); },
    }, label)).concat(h('a', {
      class: 'seg-btn', style: 'flex:1;min-height:44px;display:grid;place-items:center;font-weight:650;text-decoration:none;',
      href: `#/ujian/${enc(test.id)}/imbas?skema=1`,
    }, S.key.tabScan)));
  }

  function tapPanel() {
    return h('div', { class: 'stack' },
      h('div', { class: 'row row--between' },
        h('h2', { 'aria-live': 'polite' }, S.key.question(cur + 1)),
        h('span', { class: 'muted num' }, S.key.filled(filled(), n))),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': n, 'aria-valuenow': filled(), 'aria-label': S.key.filled(filled(), n) },
        h('i', { style: `width:${(filled() / n) * 100}%` })),
      h('div', { class: 'choices', role: 'group', 'aria-label': S.key.question(cur + 1) },
        choices.map((c) => h('button', { class: 'choice', type: 'button', 'aria-pressed': String(draft[cur] === c), onclick: () => setAnswer(cur, c) }, c)),
        h('button', { class: 'choice choice--blank', type: 'button', 'aria-pressed': String(draft[cur] === null), onclick: () => { draft[cur] = null; dirty = true; draw(); } }, S.review.blank)),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn--secondary', type: 'button', disabled: cur === 0, onclick: () => { cur--; draw(); } }, S.key.prev),
        h('button', { class: 'btn btn--secondary', type: 'button', disabled: cur === n - 1, onclick: () => { cur++; draw(); } }, S.key.next)),
      h('div', { class: 'choices', style: 'max-width:none;grid-template-columns:repeat(auto-fill,minmax(44px,1fr))', role: 'group', 'aria-label': S.key.title },
        draft.map((k, i) => h('button', {
          class: 'choice', type: 'button', style: `min-height:44px;font-size:.95rem;${i === cur ? 'box-shadow:0 0 0 3px var(--focus);' : ''}`,
          'aria-pressed': String(k !== null), 'aria-current': i === cur ? 'true' : null,
          'aria-label': `${S.key.question(i + 1)}: ${k ?? S.review.blank}`, onclick: () => { cur = i; draw(); },
        }, String(i + 1)))));
  }

  function pastePanel() {
    const ta = h('textarea', { class: 'textarea', id: 'paste', rows: 5, placeholder: S.key.pasteHint, spellcheck: 'false', autocapitalize: 'characters', 'aria-describedby': pasteErrors.length ? 'paste-err' : null });
    return h('div', { class: 'stack' },
      h('div', { class: pasteErrors.length ? 'field field--error' : 'field' },
        h('label', { for: 'paste' }, S.key.pasteLabel), ta,
        pasteErrors.length ? h('div', { id: 'paste-err', role: 'alert' }, pasteErrors.map((e) => h('p', { class: 'field__error' }, e))) : null),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const r = parseKeyText(ta.value, n, test.layoutConfig.numChoices);
        pasteErrors = r.errors;
        if (!r.errors.length) { r.key.forEach((k, i) => { draft[i] = k; }); dirty = true; tab = 'tap'; cur = Math.max(0, draft.findIndex((k) => k === null)); }
        draw();
      } }, S.key.pasteApply));
  }

  function draw() {
    mount(root,
      tabs(),
      tab === 'tap' ? tapPanel() : pastePanel(),
      filled() < n ? h('p', { class: 'muted' }, S.key.incomplete) : null,
      h('button', { class: 'btn btn--lg btn--block', type: 'button', disabled: !dirty, onclick: save }, S.app.save));
  }

  draw();
  return root;
}
