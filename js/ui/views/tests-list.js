import { h } from '../../util/dom.js';
import { listTests, listResults } from '../../data/repo.js';
import { S } from '../strings.ms.js';
import { emptyState } from '../components.js';
import { keyComplete, enc } from '../helpers.js';

export async function render(ctx) {
  ctx.setHeader({ title: S.app.name });
  const tests = await listTests();
  const counts = await Promise.all(tests.map(async (t) => (await listResults(t.id)).length));
  if (!tests.length) {
    return h('div', { class: 'stack' },
      emptyState({ title: S.tests.emptyTitle, body: S.tests.emptyBody, action: { label: S.tests.new, href: '#/ujian/baru' } }));
  }
  return h('div', { class: 'stack' },
    h('h2', null, S.tests.title),
    h('ul', { class: 'list' }, tests.map((t, i) => h('li', null,
      h('a', { class: 'list-item', href: `#/ujian/${enc(t.id)}` },
        h('span', { class: 'list-item__main' },
          h('span', { class: 'list-item__title', style: 'display:block' }, t.name),
          h('span', { class: 'list-item__sub' },
            S.tests.meta(t.layoutConfig.numQuestions, counts[i]),
            t.className ? ` · ${t.className}` : '')),
        keyComplete(t) ? null : h('span', { class: 'badge badge--warn' }, `! ${S.tests.keyMissing}`))))),
    h('a', { class: 'btn btn--lg btn--block', href: '#/ujian/baru' }, `+ ${S.tests.new}`));
}
