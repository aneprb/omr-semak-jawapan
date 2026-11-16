import { h } from '../../util/dom.js';
import { saveTest } from '../../data/repo.js';
import { uuid } from '../../util/uuid.js';
import { S } from '../strings.ms.js';
import { field, toast } from '../components.js';
import { enc } from '../helpers.js';

export async function render(ctx) {
  ctx.setHeader({ title: S.form.titleNew, back: '#/' });
  const v = { name: '', className: '', subject: '', n: '40', choices: '5', digits: '4' };
  const form = h('form', { class: 'stack', novalidate: true });
  let errors = {};

  function draw() {
    const set = (k) => (e) => { v[k] = e.target.value; };
    form.replaceChildren(
      field({ id: 'f-name', label: S.form.name, hint: S.form.nameHint, error: errors.name,
        control: (id) => h('input', { class: 'input', id, name: 'name', type: 'text', maxlength: 80, required: true, autocomplete: 'off', value: v.name, oninput: set('name') }) }),
      h('div', { class: 'grid-2 stack' },
        field({ id: 'f-class', label: `${S.form.className} ${S.form.optional}`,
          control: (id) => h('input', { class: 'input', id, type: 'text', maxlength: 80, value: v.className, oninput: set('className') }) }),
        field({ id: 'f-subject', label: `${S.form.subject} ${S.form.optional}`,
          control: (id) => h('input', { class: 'input', id, type: 'text', maxlength: 80, value: v.subject, oninput: set('subject') }) })),
      field({ id: 'f-n', label: S.form.numQuestions, hint: S.form.numQuestionsHint, error: errors.n,
        control: (id) => h('input', { class: 'input num', id, type: 'number', inputmode: 'numeric', min: 10, max: 60, step: 1, value: v.n, oninput: set('n') }) }),
      h('div', { class: 'field', role: 'radiogroup', 'aria-labelledby': 'f-ch-label' },
        h('span', { class: 'label', id: 'f-ch-label' }, S.form.numChoices),
        h('div', { class: 'seg' },
          [['4', S.form.choices4], ['5', S.form.choices5]].map(([val, label]) => h('label', null,
            h('input', { type: 'radio', name: 'choices', value: val, checked: v.choices === val, onchange: () => { v.choices = val; } }),
            h('span', null, label))))),
      field({ id: 'f-digits', label: S.form.idDigits, hint: S.form.idDigitsHint, error: errors.digits,
        control: (id) => h('input', { class: 'input num', id, type: 'number', inputmode: 'numeric', min: 0, max: 6, step: 1, value: v.digits, oninput: set('digits') }) }),
      h('button', { class: 'btn btn--lg btn--block', type: 'submit' }, S.form.create));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = v.name.trim();
    const n = Number(v.n);
    const d = Number(v.digits);
    errors = {};
    if (name.length < 1 || name.length > 80) errors.name = S.form.nameError;
    if (!Number.isInteger(n) || n < 10 || n > 60 || v.n === '') errors.n = S.form.numQuestionsError;
    if (!Number.isInteger(d) || d < 0 || d > 6 || v.digits === '') errors.digits = S.form.idDigitsError;
    if (Object.keys(errors).length) {
      draw();
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    const now = new Date().toISOString();
    const test = {
      id: uuid(), name, subject: v.subject.trim(), className: v.className.trim(),
      layoutConfig: { version: 1, numQuestions: n, numChoices: Number(v.choices), idDigits: d },
      key: new Array(n).fill(null), roster: [], locked: false, createdAt: now, updatedAt: now,
    };
    try {
      await saveTest(test);
    } catch {
      toast(S.errors.storage, { error: true });
      return;
    }
    toast(S.form.saved);
    ctx.navigate(`#/ujian/${enc(test.id)}`);
  });

  draw();
  return form;
}
