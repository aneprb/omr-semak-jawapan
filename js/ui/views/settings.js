import { h } from '../../util/dom.js';
import { getSetting, setSetting } from '../../data/repo.js';
import { exportAll, importAll, parseBackupText, validateBackup, clearAll, backupFilename, MAX_BACKUP_BYTES } from '../../data/backup.js';
import { DEFAULTS } from '../../omr/config.js';
import { downloadText } from '../../util/download.js';
import { storageStatus, requestPersist, formatBytes } from '../../data/persist.js';
import { isIOS } from '../../util/platform.js';
import { formatDateTime } from '../../util/format.js';
import { APP_VERSION } from '../../version.js';
import { S } from '../strings.ms.js';
import { confirmDialog, toast, field } from '../components.js';

const TH_FIELDS = [['blank', 'Kosong'], ['mark', 'Hitam'], ['multiRatio', 'Nisbah berganda'], ['minGap', 'Jurang minimum']];

export async function render(ctx) {
  ctx.setHeader({ title: S.settings.title });
  const [schoolName, autoCapture, thresholds, lastBackup] = await Promise.all([
    getSetting('schoolName', ''), getSetting('autoCapture', true), getSetting('thresholds', null), getSetting('lastBackupAt', null),
  ]);
  const th = { ...DEFAULTS.thresholds, ...(thresholds || {}) };
  const lastEl = h('p', { class: 'muted' }, lastBackup ? formatDateTime(lastBackup) : '');
  const importMsg = h('p', { role: 'alert', class: 'field__error', hidden: true }, S.settings.importBad);
  let mode = 'merge';

  const saveSafe = async (k, v) => { try { await setSetting(k, v); } catch { toast(S.errors.storage, { error: true }); } };

  async function doExport() {
    const payload = await exportAll();
    downloadText(backupFilename(), JSON.stringify(payload), 'application/json');
    const now = new Date().toISOString();
    await saveSafe('lastBackupAt', now);
    lastEl.textContent = formatDateTime(now);
    toast(S.settings.exportDone);
  }

  async function doImport(file) {
    importMsg.hidden = true;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('size');
      const obj = parseBackupText(await file.text());
      if (!validateBackup(obj).ok) throw new Error('invalid');
      if (mode === 'replace') {
        const ok = await confirmDialog({ title: S.settings.replaceTitle, body: S.settings.replaceBody, confirm: S.settings.importReplace, danger: true });
        if (!ok) return;
      }
      await importAll(obj, mode);
      toast(S.settings.importDone);
    } catch {
      importMsg.hidden = false;
    }
  }

  async function wipe() {
    const ok = await confirmDialog({ title: S.settings.wipeTitle, body: S.settings.wipeBody, confirm: S.settings.wipe, danger: true });
    if (!ok) return;
    await clearAll();
    toast(S.settings.wiped);
    ctx.navigate('#/');
  }

  const storageEl = h('p', { class: 'muted', 'aria-live': 'polite' }, S.settings.storageUnknown);
  storageStatus().then(async (st) => {
    if (!st.supported) return;
    if (st.persisted === false && (await requestPersist())) st.persisted = true;
    const lines = [];
    if (st.persisted != null) lines.push(st.persisted ? S.settings.storagePersisted : S.settings.storageNotPersisted);
    if (st.usage != null && st.quota != null) lines.push(S.settings.storageUsage(formatBytes(st.usage), formatBytes(st.quota)));
    if (lines.length) storageEl.textContent = lines.join(' ');
  });

  const fileInput =h('input', { class: 'sr-only', id: 'import-file', type: 'file', accept: 'application/json,.json', tabindex: '-1', onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await doImport(f); } });

  return h('div', { class: 'stack' },
    h('section', { class: 'card stack' },
      field({ id: 's-school', label: S.settings.school, hint: S.settings.schoolHint,
        control: (id) => h('input', { class: 'input', id, type: 'text', maxlength: 120, value: schoolName, onchange: (e) => saveSafe('schoolName', e.target.value.trim()) }) }),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: autoCapture, onchange: (e) => saveSafe('autoCapture', e.target.checked) }), S.settings.autoCapture)),
    h('details', { class: 'card stack' },
      h('summary', { style: 'min-height:44px;display:flex;align-items:center;font-weight:650;cursor:pointer' }, S.settings.advanced),
      h('p', { class: 'muted' }, S.settings.thresholdHint),
      TH_FIELDS.map(([k, label]) => field({ id: `th-${k}`, label,
        control: (id) => h('input', { class: 'input num', id, type: 'number', min: 0, max: 1, step: 0.01, value: th[k],
          onchange: async (e) => {
            const v = Number(e.target.value);
            if (!(v >= 0 && v <= 1) || e.target.value === '') { e.target.value = th[k]; return; }
            th[k] = v; await saveSafe('thresholds', { ...th });
          } }) }))),
    h('section', { class: 'card stack' },
      h('h2', null, S.settings.backup),
      lastEl,
      h('button', { class: 'btn', type: 'button', onclick: doExport }, S.settings.backupExport),
      h('div', { class: 'field', role: 'radiogroup', 'aria-label': S.settings.backupImport },
        h('div', { class: 'seg' }, [['merge', S.settings.importMerge], ['replace', S.settings.importReplace]].map(([val, label]) => h('label', null,
          h('input', { type: 'radio', name: 'mode', value: val, checked: val === 'merge', onchange: () => { mode = val; } }), h('span', null, label))))),
      h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => fileInput.click() }, S.settings.backupImport),
      fileInput, importMsg),
    h('section', { class: 'card stack' },
      h('h2', null, S.settings.storage),
      storageEl,
      isIOS() ? h('p', { class: 'muted', role: 'note' }, S.settings.iosStorageWarn) : null),
    h('section', { class: 'card stack' },
      h('button', { class: 'btn btn--danger', type: 'button', onclick: wipe }, S.settings.wipe)),
    h('section', { class: 'stack' },
      h('h2', null, S.settings.about),
      h('p', { class: 'muted' }, S.settings.aboutBody),
      h('p', { class: 'muted num' }, S.settings.version(APP_VERSION))));
}
