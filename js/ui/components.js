// Reusable UI pieces. All text comes from strings.ms.js (S) or the caller.
import { h } from '../util/dom.js';
import { S } from './strings.ms.js';

export function toast(message, { error = false, ms = 3500 } = {}) {
  const host = document.querySelector('.toast-host');
  if (!host) return;
  const el = h('div', { class: error ? 'toast toast--error' : 'toast', role: error ? 'alert' : 'status' }, message);
  host.append(el);
  setTimeout(() => el.remove(), error ? ms * 2 : ms);
}

/** Modal confirm. Resolves true on confirm, false on cancel/Escape. Restores focus. */
export function confirmDialog({ title, body, confirm = S.app.ok, danger = false }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    let result = false;
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-title' },
      h('h2', { id: 'dlg-title' }, title),
      body ? h('p', null, body) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => dlg.close() }, S.app.cancel),
        h('button', { class: danger ? 'btn btn--danger' : 'btn', type: 'button', onclick: () => { result = true; dlg.close(); } }, confirm)));
    dlg.addEventListener('close', () => { dlg.remove(); opener?.focus?.(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/**
 * Pick the answer for one question. Resolves to a choice letter, null (blank) or undefined (cancelled).
 */
export function answerDialog({ q, choices, current = null, keyAnswer = null }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    let result;
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-title' },
      h('h2', { id: 'dlg-title' }, S.review.editTitle(q)),
      h('p', { class: 'muted' }, S.review.editHint),
      h('div', { class: 'choices', role: 'group', 'aria-label': S.review.editTitle(q) },
        choices.map((c) => h('button', {
          class: c === keyAnswer ? 'choice choice--key' : 'choice', type: 'button', 'aria-pressed': String(c === current),
          onclick: () => { result = c; dlg.close(); },
        }, c)),
        h('button', { class: 'choice choice--blank', type: 'button', 'aria-pressed': String(current === null), onclick: () => { result = null; dlg.close(); } }, S.review.blank)),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => dlg.close() }, S.app.cancel)));
    dlg.addEventListener('close', () => { dlg.remove(); opener?.focus?.(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function emptyState({ title, body, action }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'bubbles', 'aria-hidden': 'true' },
      [0, 1, 2].map((i) => h('span', { class: 'choice', style: 'width:28px;min-height:28px;height:28px;' + (i === 1 ? 'background:var(--graphite)' : '') }))),
    h('h2', null, title),
    body ? h('p', { class: 'muted' }, body) : null,
    action ? h('a', { class: 'btn', href: action.href }, action.label) : null);
}

export function skeleton(rows = 3) {
  return h('div', { class: 'stack', 'aria-busy': 'true', 'aria-label': S.app.loading },
    Array.from({ length: rows }, () => h('div', { class: 'skeleton', style: 'height:56px' })));
}

/** Labelled form field. `control` receives the generated id. */
export function field({ id, label, hint, error, control }) {
  const hintId = hint ? `${id}-hint` : null;
  const errId = error ? `${id}-err` : null;
  const el = control(id);
  const desc = [hintId, errId].filter(Boolean).join(' ');
  if (desc) el.setAttribute('aria-describedby', desc);
  if (error) el.setAttribute('aria-invalid', 'true');
  return h('div', { class: error ? 'field field--error' : 'field' },
    h('label', { for: id }, label),
    el,
    hint ? h('span', { class: 'field__hint', id: hintId }, hint) : null,
    error ? h('span', { class: 'field__error', id: errId, role: 'alert' }, error) : null);
}

/** Per-question row status: { kind: 'ok'|'bad'|'warn', glyph, label } (shape + symbol + text). */
export function questionStatus({ given, key, scannedStatus, edited }) {
  if (!edited && scannedStatus && scannedStatus !== 'OK') {
    const label = scannedStatus === 'BLANK' ? S.review.blank : scannedStatus === 'MULTIPLE' ? S.review.multiple : S.review.uncertain;
    return { kind: 'warn', glyph: '!', label };
  }
  if (given !== null && given === key) return { kind: 'ok', glyph: '✓', label: S.review.correct };
  if (given === null) return { kind: 'warn', glyph: '!', label: S.review.blank };
  return { kind: 'bad', glyph: '✗', label: S.review.wrong };
}

export function questionRow({ q, given, key, status, edited, onclick }) {
  const ans = h('span', { class: 'qrow__ans' },
    `${S.review.studentAnswer}: ${given ?? '-'}  ·  ${S.review.keyAnswer}: ${key ?? '-'}`,
    edited ? h('span', { class: 'badge' }, S.review.edited) : null);
  const end = h('span', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' },
    h('span', { class: `mark mark--${status.kind}`, 'aria-hidden': 'true' }, status.glyph),
    h('span', { class: 'badge badge--' + status.kind }, status.label));
  const inner = [h('span', { class: 'qrow__no' }, q), ans, end];
  return onclick
    ? h('button', { class: 'qrow', type: 'button', onclick }, inner)
    : h('div', { class: 'qrow' }, inner);
}

/** Modal with several actions. options: [{label, value, primary?}]. Resolves to value or undefined (cancel). */
export function choiceDialog({ title, body, options }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    let result;
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-title' },
      h('h2', { id: 'dlg-title' }, title),
      body ? h('p', null, body) : null,
      h('div', { class: 'stack', style: 'margin-top:24px' },
        options.map((o) => h('button', { class: o.primary ? 'btn' : 'btn btn--secondary', type: 'button', onclick: () => { result = o.value; dlg.close(); } }, o.label)),
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => dlg.close() }, S.app.cancel)));
    dlg.addEventListener('close', () => { dlg.remove(); opener?.focus?.(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
