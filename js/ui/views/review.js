import { h, mount } from '../../util/dom.js';
import { saveResult, findResultsByCode } from '../../data/repo.js';
import { gradeSheet } from '../../grading/grade.js';
import { buildLayout } from '../../omr/layout.js';
import { uuid } from '../../util/uuid.js';
import { getCapture, clearCapture } from '../state.js';
import { imageToCanvas, drawReview, drawNameCrop } from '../overlay-canvas.js';
import { S } from '../strings.ms.js';
import { answerDialog, choiceDialog, confirmDialog, emptyState, field, questionRow, questionStatus, toast } from '../components.js';
import { loadTest, choicesOf, enc } from '../helpers.js';

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  const id = enc(ctx.params.id);
  if (notFound) { ctx.setHeader({ title: S.review.title, back: `#/ujian/${id}/imbas`, wide: true }); return notFound; }
  const cap = getCapture(test.id);
  // bulk upload hands over its own return page and the name typed there
  const backTo = cap?.returnTo ?? `#/ujian/${id}/imbas`;
  ctx.setHeader({ title: S.review.title, back: backTo, wide: true });
  if (!cap) return emptyState({ title: S.review.noImage, action: { label: S.home.scan, href: `#/ujian/${id}/imbas` } });

  const { imageData, scan } = cap;
  const layout = buildLayout(test.layoutConfig);
  const choices = choicesOf(test);
  const source = imageToCanvas(imageData);
  const final = scan.answers.map((a) => a.choice ?? null);
  const manual = new Set();
  const rosterByCode = new Map(test.roster.map((r) => [r.code, r.name]));
  let code = cap.code ?? scan.studentId?.value ?? '';
  let name = cap.name || (rosterByCode.get(code) ?? '');
  let matched = rosterByCode.has(code);
  let saving = false;
  let gone = false;

  const photo = h('canvas', { role: 'img', 'aria-label': S.review.title });
  const nameCanvas = h('canvas', { role: 'img', 'aria-label': S.review.nameCrop });
  const dynamic = h('div', { class: 'stack' });
  const root = h('div', { class: 'split stack' });

  const rows = () => {
    const g = gradeSheet(final, test.key);
    return g.perQuestion.map((p, i) => {
      const edited = manual.has(p.q);
      const sc = scan.answers[i];
      const st = questionStatus({ given: p.given, key: p.key, scannedStatus: sc.status, edited });
      return { ...p, edited, st, selected: sc.selected ?? [] };
    });
  };

  function paintPhoto() {
    const rs = rows();
    drawReview(photo, source, { scan, layout, rows: rs.map((r) => ({ given: r.given, key: r.key, kind: r.st.kind, selected: r.edited ? [] : r.selected })) });
  }

  async function edit(i) {
    const picked = await answerDialog({ q: i + 1, choices, current: final[i], keyAnswer: test.key[i] });
    if (picked === undefined || gone) return;
    final[i] = picked;
    manual.add(i + 1);
    paintAll();
  }

  function paintDynamic() {
    const rs = rows();
    const g = gradeSheet(final, test.key);
    const warns = rs.filter((r) => r.st.kind === 'warn').length;
    mount(dynamic,
      h('div', { class: 'score', role: 'status' },
        h('div', { class: 'score__value' }, S.review.score(g.correct, g.total)),
        h('div', { class: 'score__pct num' }, S.review.percent(g.percent))),
      h('div', { class: 'legend' },
        h('span', null, h('span', { class: 'mark mark--ok', 'aria-hidden': 'true' }, '✓'), S.review.legendOk.replace(/^✓ /, '')),
        h('span', null, h('span', { class: 'mark mark--bad', 'aria-hidden': 'true' }, '✗'), S.review.legendBad.replace(/^✗ /, '')),
        h('span', null, h('span', { class: 'mark mark--warn', 'aria-hidden': 'true' }, '!'), S.review.legendWarn.replace(/^! /, ''))),
      h('p', { class: warns ? 'badge badge--warn' : 'muted', role: 'status' }, warns ? `! ${S.review.warnings(warns)}` : S.review.noWarnings),
      h('ul', { class: 'list' }, rs.map((r, i) => h('li', null,
        questionRow({ q: r.q, given: r.given, key: r.key, status: r.st, edited: r.edited, onclick: () => edit(i) })))));
  }

  function paintAll() { paintPhoto(); paintDynamic(); }

  const nameInput = h('input', { class: 'input', id: 'rv-name', type: 'text', maxlength: 120, value: name, autocomplete: 'off' });
  const matchNote = h('span', { class: 'field__hint', 'aria-live': 'polite' }, matched ? S.review.nameMatched : S.review.nameType);
  nameInput.addEventListener('input', () => { name = nameInput.value.trim(); matched = false; matchNote.textContent = S.review.nameType; });
  const codeInput = h('input', { class: 'input num', id: 'rv-code', type: 'text', maxlength: 30, value: code, autocomplete: 'off', inputmode: 'numeric' });
  codeInput.addEventListener('input', () => {
    code = codeInput.value.trim();
    if (rosterByCode.has(code)) { name = rosterByCode.get(code); nameInput.value = name; matched = true; matchNote.textContent = S.review.nameMatched; }
  });

  async function save() {
    if (saving) return;
    saving = true;
    try {
      let replaceId = null;
      if (code) {
        const dups = await findResultsByCode(test.id, code);
        if (dups.length) {
          const pick = await choiceDialog({
            title: S.review.dupTitle, body: S.review.dupBody(code),
            options: [{ label: S.review.dupReplace, value: 'replace', primary: true }, { label: S.review.dupNew, value: 'new' }],
          });
          if (pick === undefined) return;
          if (pick === 'replace') replaceId = dups[0].id;
        }
      }
      const g = gradeSheet(final, test.key);
      const rid = replaceId ?? uuid();
      await saveResult({
        id: rid, testId: test.id, studentCode: code, studentName: name,
        scanned: scan.answers.map((a) => ({ q: a.q, choice: a.choice ?? null, status: a.status })),
        final: [...final], manualEdits: [...manual].sort((a, b) => a - b),
        correct: g.correct, total: g.total, percent: g.percent, scannedAt: new Date().toISOString(),
      });
      clearCapture();
      toast(S.review.saved);
      cap.onSaved?.({ id: rid, name, code });
      ctx.navigate(backTo);
    } catch {
      toast(S.errors.storage, { error: true });
    } finally { saving = false; }
  }

  async function rescan() {
    const ok = cap.returnTo ? true : await confirmDialog({ title: S.review.discardTitle, body: S.review.discardBody, confirm: S.review.discard, danger: true });
    if (!ok) return;
    clearCapture();
    ctx.navigate(backTo);
  }

  ctx.onLeave(() => { gone = true; source.width = source.height = 0; });

  mount(root,
    h('div', { class: 'stack' },
      h('div', { class: 'review-photo' }, photo),
      h('div', { class: 'stack' }, h('span', { class: 'section-title' }, S.review.nameCrop), h('div', { class: 'name-crop' }, nameCanvas))),
    h('div', { class: 'stack' },
      h('div', { class: 'grid-2 stack' },
        field({ id: 'rv-code', label: S.review.studentCode, control: () => codeInput }),
        h('div', { class: 'field' }, h('label', { for: 'rv-name' }, S.review.studentName), nameInput, matchNote)),
      dynamic,
      h('div', { class: 'actionbar' },
        h('button', { class: 'btn btn--secondary', type: 'button', onclick: rescan }, cap.returnTo ? S.app.back : S.review.rescan),
        h('button', { class: 'btn btn--lg', type: 'button', onclick: save }, cap.returnTo ? S.review.save : S.review.saveNext))));

  paintAll();
  drawNameCrop(nameCanvas, source, scan, layout);
  return root;
}
