// Bulk upload: many photos at once, each labelled with a student name (from the file name, editable).
// Photos are scanned one by one in the worker; only the File, a small thumbnail and the scan result are kept
// (a decoded 1600 px image is ~8 MB, too much for 40 photos on a phone). "Semak" decodes the file again.
import { h, mount } from '../../util/dom.js';
import { warn } from '../../util/log.js';
import { getSetting, saveResult, findResultsByCode } from '../../data/repo.js';
import { buildLayout } from '../../omr/layout.js';
import * as client from '../../omr/client.js';
import { gradeSheet } from '../../grading/grade.js';
import { fileToImageData } from '../camera.js';
import { uuid } from '../../util/uuid.js';
import { setCapture, getState, setState } from '../state.js';
import { S } from '../strings.ms.js';
import { confirmDialog, toast } from '../components.js';
import { loadTest, keyComplete, enc } from '../helpers.js';

const ERR = {
  NO_MARKERS: () => S.scan.failNoMarkers,
  BAD_GEOMETRY: () => S.scan.failNoMarkers,
  LOW_CONTRAST: () => `${S.scan.failGeneric} ${S.scan.hintLight}`,
  IMAGE_TOO_SMALL: () => 'Gambar terlalu kecil.',
  NO_FRAME: () => S.scan.failNoFrame,
};

const CAMERA_NAME = /^(img|pxl|dsc|dcim|photo|image|screenshot|whatsapp|wa\d|signal|mvimg|\d{6,})/i;

/** Student name from a file name: "01_Ahmad_bin_Ali.jpg" -> "Ahmad bin Ali"; camera names -> "". */
export function nameFromFile(fileName) {
  let s = String(fileName || '').replace(/\.[a-z0-9]{2,5}$/i, '');
  if (CAMERA_NAME.test(s)) return '';
  s = s.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\d{1,3}\s*[.)-]?\s+/, ''); // leading list number "01 " / "1. " / "3 - "
  s = s.replace(/^[-.\s]+|[-.\s]+$/g, '');
  return s.slice(0, 120);
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Roster entry for a name or code typed / taken from the file name. */
export function matchRoster(roster, label) {
  const n = norm(label);
  if (!n) return null;
  return roster.find((r) => norm(r.name) === n || norm(r.code) === n) ?? null;
}

async function thumbOf(img) {
  const k = Math.min(1, 144 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  const src = document.createElement('canvas');
  src.width = img.width; src.height = img.height;
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  src.width = src.height = 0;
  return c.toDataURL('image/jpeg', 0.7);
}

export async function render(ctx) {
  const { test, notFound } = await loadTest(ctx.params.id);
  const id = enc(ctx.params.id);
  ctx.setHeader({ title: S.bulk.title, back: `#/ujian/${id}` });
  if (notFound) return notFound;
  if (!keyComplete(test)) {
    return h('div', { class: 'stack' }, h('p', { role: 'alert' }, S.home.needKey), h('a', { class: 'btn', href: `#/ujian/${id}/skema` }, S.home.key));
  }

  const layout = buildLayout(test.layoutConfig);
  const thresholds = await getSetting('thresholds', null);
  const scanOpts = thresholds ? { thresholds: { ...thresholds } } : undefined;
  const here = `#/ujian/${id}/pukal`;

  // list survives the trip to the review page and back (memory only, cleared on reload)
  const stateKey = `bulk:${test.id}`;
  const st = getState(stateKey) ?? { items: [], running: false };
  setState(stateKey, st);
  let gone = false;
  ctx.onLeave(() => { gone = true; if (st.paint === paintList) st.paint = null; });

  const listEl = h('ul', { class: 'stack', style: 'list-style:none;padding:0;margin:0' });
  const progressEl = h('p', { class: 'muted', 'aria-live': 'polite' });
  const saveBtn = h('button', { class: 'btn btn--lg btn--block', type: 'button' });
  const clearBtn = h('button', { class: 'btn btn--ghost', type: 'button' }, S.bulk.clear);
  const pickBtn = h('button', { class: 'btn btn--secondary', type: 'button' }, S.bulk.pick);
  const fileInput = h('input', { class: 'sr-only', type: 'file', accept: 'image/*', multiple: true, tabindex: '-1' });

  function statusOf(it) {
    if (it.savedId) return h('span', { class: 'badge badge--ok' }, `✓ ${S.bulk.saved}`);
    if (it.state === 'waiting') return h('span', { class: 'muted' }, S.bulk.waiting);
    if (it.state === 'processing') return h('span', { class: 'muted' }, S.bulk.processing);
    if (it.state === 'error') return h('span', { class: 'badge badge--bad' }, it.error);
    const g = it.grade;
    return h('span', { class: 'row', style: 'gap:var(--s2)' },
      h('strong', { class: 'num' }, S.bulk.score(g.correct, g.total, g.percent)),
      it.warns ? h('span', { class: 'badge badge--warn' }, `! ${S.bulk.warn(it.warns)}`) : null);
  }

  function itemNode(it) {
    const nameId = `bk-${it.key}`;
    const input = h('input', { class: 'input', id: nameId, type: 'text', maxlength: 120, value: it.name, placeholder: S.bulk.namePh, autocomplete: 'off', disabled: !!it.savedId });
    const note = h('span', { class: 'field__hint', 'aria-live': 'polite' }, it.code ? S.bulk.rosterMatch : '');
    input.addEventListener('input', () => {
      it.name = input.value.trim();
      const m = matchRoster(test.roster, it.name);
      it.code = m ? m.code : '';
      note.textContent = m ? S.bulk.rosterMatch : '';
      input.removeAttribute('aria-invalid');
      paintFooter();
    });
    const reviewBtn = h('button', { class: 'btn btn--secondary', type: 'button', disabled: it.state !== 'done' || !!it.savedId, onclick: () => openReview(it) }, S.bulk.review);
    const removeBtn = h('button', { class: 'btn btn--ghost', type: 'button', disabled: it.state === 'processing', onclick: () => {
      st.items = st.items.filter((x) => x !== it);
      paintList();
    } }, S.bulk.remove);
    it.input = input;
    return h('li', { class: 'card bulk-item' },
      it.thumb ? h('img', { class: 'bulk-item__thumb', src: it.thumb, alt: '' }) : h('div', { class: 'bulk-item__thumb', 'aria-hidden': 'true' }),
      h('div', { class: 'bulk-item__body' },
        h('div', { class: 'field' }, h('label', { for: nameId }, `${S.bulk.name} · ${it.file.name}`), input, note),
        h('div', { class: 'bulk-item__status' }, statusOf(it)),
        h('div', { class: 'row' }, reviewBtn, removeBtn)));
  }

  function paintFooter() {
    const done = st.items.filter((it) => it.state === 'done' || it.state === 'error').length;
    progressEl.textContent = st.items.length ? S.bulk.progress(done, st.items.length) : S.bulk.empty;
    const ready = st.items.filter((it) => it.state === 'done' && !it.savedId);
    saveBtn.textContent = S.bulk.saveAll(ready.length);
    saveBtn.disabled = ready.length === 0 || st.running;
    clearBtn.hidden = st.items.length === 0;
    pickBtn.textContent = st.items.length ? S.bulk.pickMore : S.bulk.pick;
  }

  function paintList() {
    if (gone) return;
    mount(listEl, ...st.items.map(itemNode));
    paintFooter();
  }
  // the queue may outlive this page (review and back): it always repaints the page that is showing
  st.paint = paintList;
  const repaint = () => st.paint?.();

  async function run() {
    if (st.running) return;
    st.running = true;
    repaint();
    try {
      for (;;) {
        const it = st.items.find((x) => x.state === 'waiting');
        if (!it) break;
        it.state = 'processing';
        repaint();
        try {
          const img = await fileToImageData(it.file, 1600);
          it.thumb = await thumbOf(img);
          const res = await client.scan(img, layout, scanOpts); // transfers (detaches) img's buffer
          if (!res.ok) {
            it.state = 'error';
            it.error = (ERR[res.error] ?? (() => S.scan.failGeneric))();
          } else {
            it.scan = res;
            const final = res.answers.map((a) => a.choice ?? null);
            it.grade = gradeSheet(final, test.key);
            it.warns = res.answers.filter((a) => a.status === 'MULTIPLE' || a.status === 'UNCERTAIN').length;
            it.state = 'done';
          }
        } catch (e) {
          warn('bulk', `gagal: ${e?.message}`);
          it.state = 'error';
          it.error = S.scan.failGeneric;
        }
      }
    } finally {
      st.running = false;
      repaint();
    }
  }

  function addFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/') && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)) continue;
      const name = nameFromFile(file.name);
      const m = matchRoster(test.roster, name);
      st.items.push({
        key: uuid().slice(0, 8), file, state: 'waiting',
        name: m ? m.name : name, code: m ? m.code : '',
      });
    }
    paintList();
    run();
  }

  async function openReview(it) {
    try {
      const img = await fileToImageData(it.file, 1600);
      setCapture(test.id, {
        imageData: img, scan: it.scan, name: it.name, code: it.code, returnTo: here,
        onSaved: (r) => { it.savedId = r.id; it.name = r.name; it.code = r.code; },
      });
      ctx.navigate(`#/ujian/${id}/semak`);
    } catch {
      toast(S.scan.failGeneric, { error: true });
    }
  }

  async function saveAll() {
    const ready = st.items.filter((it) => it.state === 'done' && !it.savedId);
    if (!ready.length) return;
    const missing = ready.filter((it) => !it.name);
    if (missing.length) {
      for (const it of missing) it.input?.setAttribute('aria-invalid', 'true');
      missing[0].input?.focus();
      toast(S.bulk.nameMissing, { error: true });
      return;
    }
    const warns = ready.filter((it) => it.warns).length;
    const ok = await confirmDialog({ title: S.bulk.saveTitle, body: S.bulk.saveBody(ready.length, warns), confirm: S.app.save });
    if (!ok) return;
    let saved = 0;
    try {
      for (const it of ready) {
        // same student code (roster match) scanned again replaces the earlier result, like the review page's default
        let rid = uuid();
        if (it.code) {
          const dups = await findResultsByCode(test.id, it.code);
          if (dups.length) rid = dups[0].id;
        }
        const final = it.scan.answers.map((a) => a.choice ?? null);
        const g = gradeSheet(final, test.key);
        await saveResult({
          id: rid, testId: test.id, studentCode: it.code, studentName: it.name,
          scanned: it.scan.answers.map((a) => ({ q: a.q, choice: a.choice ?? null, status: a.status })),
          final, manualEdits: [], correct: g.correct, total: g.total, percent: g.percent, scannedAt: new Date().toISOString(),
        });
        it.savedId = rid;
        saved++;
      }
      toast(S.bulk.savedAll(saved));
    } catch {
      toast(S.errors.storage, { error: true });
    }
    paintList();
  }

  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    if (files.length) addFiles(files);
  });
  pickBtn.addEventListener('click', () => fileInput.click());
  saveBtn.addEventListener('click', saveAll);
  clearBtn.addEventListener('click', async () => {
    if (st.running) return;
    const unsaved = st.items.filter((it) => it.state === 'done' && !it.savedId).length;
    if (unsaved && !(await confirmDialog({ title: S.bulk.clear, body: S.review.discardBody, confirm: S.review.discard, danger: true }))) return;
    st.items = [];
    paintList();
  });

  paintList();
  if (st.items.some((it) => it.state === 'waiting')) run();

  return h('div', { class: 'stack' },
    h('p', { class: 'muted' }, S.bulk.help),
    h('div', { class: 'row' }, pickBtn, clearBtn, fileInput),
    progressEl,
    listEl,
    saveBtn);
}
