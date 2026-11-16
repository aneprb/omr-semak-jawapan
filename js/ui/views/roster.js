import { h } from '../../util/dom.js';
import { saveTest } from '../../data/repo.js';
import { S } from '../strings.ms.js';
import { toast } from '../components.js';
import { loadTest, enc } from '../helpers.js';

/** Parse "code,name" lines. Returns { roster, errorLine } (errorLine is 1-based or 0). */
export function parseRoster(text) {
  const roster = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const at = line.search(/[,;\t]/);
    const code = at < 0 ? '' : line.slice(0, at).trim();
    const name = at < 0 ? '' : line.slice(at + 1).trim();
    if (!code || !name || code.length > 30 || name.length > 120) return { roster, errorLine: i + 1 };
    roster.push({ code, name });
  }
  return { roster, errorLine: 0 };
}

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  ctx.setHeader({ title: S.roster.title, back: notFound ? '#/' : `#/ujian/${enc(ctx.params.id)}` });
  if (notFound) return notFound;

  const ta = h('textarea', { class: 'textarea', id: 'roster', rows: 10, spellcheck: 'false', placeholder: S.roster.placeholder, 'aria-describedby': 'roster-help roster-count' },
    test.roster.map((r) => `${r.code},${r.name}`).join('\n'));
  const err = h('div', { role: 'alert' });
  const count = h('p', { class: 'muted', id: 'roster-count', 'aria-live': 'polite' }, S.roster.count(test.roster.length));
  const field = h('div', { class: 'field' }, h('label', { for: 'roster' }, S.roster.title), h('span', { class: 'field__hint', id: 'roster-help' }, S.roster.help), ta, err);

  const refresh = () => {
    const r = parseRoster(ta.value);
    count.textContent = S.roster.count(r.roster.length);
    err.replaceChildren(r.errorLine ? h('p', { class: 'field__error' }, S.roster.lineError(r.errorLine)) : '');
    field.classList.toggle('field--error', !!r.errorLine);
    return r;
  };
  ta.addEventListener('input', refresh);

  const persist = async (roster) => {
    try { await saveTest({ ...test, roster }); test.roster = roster; toast(S.roster.saved); } catch { toast(S.errors.storage, { error: true }); }
  };

  return h('div', { class: 'stack' }, field, count,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { const r = refresh(); if (r.errorLine) { ta.focus(); return; } await persist(r.roster); } }, S.roster.save),
      h('button', { class: 'btn btn--secondary', type: 'button', onclick: async () => { ta.value = ''; refresh(); await persist([]); } }, S.roster.clear)));
}
