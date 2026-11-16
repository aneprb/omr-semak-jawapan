// Backup / restore (PLAN.md section 3.4). Validation is strict: a bad file never touches the database.
import { getDb } from './repo.js';
import { reqP, txDone } from './db.js';
import { UUID_RE } from '../util/uuid.js';
import { stampWithTime } from '../util/format.js';

export const BACKUP_APP = 'omr-semak-jawapan';
export const SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const STATUSES = ['OK', 'BLANK', 'MULTIPLE', 'UNCERTAIN'];
const SETTING_KEYS = ['schoolName', 'thresholds', 'autoCapture', 'lastBackupAt'];
const THRESHOLD_KEYS = ['blank', 'mark', 'multiRatio', 'minGap'];

export const backupFilename = (d = new Date()) => `omr-sandaran-${stampWithTime(d)}.json`;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isIso = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isId = (v) => typeof v === 'string' && UUID_RE.test(v);

function checkTest(t, path, errors) {
  if (!isObj(t)) { errors.push(`${path}: bukan objek`); return null; }
  if (!isId(t.id)) errors.push(`${path}.id: UUID tidak sah`);
  if (!(isStr(t.name, 80) && t.name.trim().length >= 1)) errors.push(`${path}.name: 1-80 aksara diperlukan`);
  if (!isStr(t.subject ?? '', 80)) errors.push(`${path}.subject: tidak sah`);
  if (!isStr(t.className ?? '', 80)) errors.push(`${path}.className: tidak sah`);
  const lc = t.layoutConfig;
  let n = 0;
  let c = 0;
  if (!isObj(lc) || lc.version !== 1 || !isInt(lc.numQuestions, 1, 200) || !isInt(lc.numChoices, 2, 5) || !isInt(lc.idDigits, 0, 10)
    || !(lc.format === undefined || lc.format === 'app' || lc.format === 'spm-kom28')) {
    errors.push(`${path}.layoutConfig: tidak sah`);
  } else { n = lc.numQuestions; c = lc.numChoices; }
  if (!Array.isArray(t.key) || (n && t.key.length !== n)) errors.push(`${path}.key: panjang mesti ${n}`);
  else {
    const letters = 'ABCDE'.slice(0, c);
    t.key.forEach((k, i) => {
      if (k !== null && !(typeof k === 'string' && k.length === 1 && letters.includes(k))) errors.push(`${path}.key[${i}]: pilihan tidak sah`);
    });
  }
  if (!Array.isArray(t.roster) || t.roster.length > 5000) errors.push(`${path}.roster: tidak sah`);
  else t.roster.forEach((r, i) => {
    if (!isObj(r) || !isStr(r.code, 30) || !isStr(r.name, 120)) errors.push(`${path}.roster[${i}]: tidak sah`);
  });
  if (typeof t.locked !== 'boolean') errors.push(`${path}.locked: mesti boolean`);
  if (!isIso(t.createdAt)) errors.push(`${path}.createdAt: tarikh tidak sah`);
  if (!isIso(t.updatedAt)) errors.push(`${path}.updatedAt: tarikh tidak sah`);
  return { n, c };
}

function checkResult(r, path, testInfo, errors) {
  if (!isObj(r)) { errors.push(`${path}: bukan objek`); return; }
  if (!isId(r.id)) errors.push(`${path}.id: UUID tidak sah`);
  if (!isId(r.testId)) errors.push(`${path}.testId: UUID tidak sah`);
  const info = testInfo.get(r.testId);
  if (isId(r.testId) && !info) errors.push(`${path}.testId: ujian tiada dalam fail`);
  if (!isStr(r.studentCode, 30)) errors.push(`${path}.studentCode: tidak sah`);
  if (!isStr(r.studentName, 120)) errors.push(`${path}.studentName: tidak sah`);
  const n = info ? info.n : 0;
  const letters = info ? 'ABCDE'.slice(0, info.c) : 'ABCDE';
  const okChoice = (v) => v === null || (typeof v === 'string' && v.length === 1 && letters.includes(v));
  if (!Array.isArray(r.scanned) || (n && r.scanned.length !== n)) errors.push(`${path}.scanned: panjang mesti ${n}`);
  else r.scanned.forEach((s, i) => {
    if (!isObj(s) || s.q !== i + 1 || !okChoice(s.choice) || !STATUSES.includes(s.status)) errors.push(`${path}.scanned[${i}]: tidak sah`);
  });
  if (!Array.isArray(r.final) || (n && r.final.length !== n) || !r.final.every(okChoice)) errors.push(`${path}.final: tidak sah`);
  if (!Array.isArray(r.manualEdits) || !r.manualEdits.every((q) => isInt(q, 1, n || 200))) errors.push(`${path}.manualEdits: tidak sah`);
  if (!isInt(r.total, 1, 200) || (n && r.total !== n)) errors.push(`${path}.total: tidak sah`);
  if (!isInt(r.correct, 0, 200) || (isInt(r.total, 1, 200) && r.correct > r.total)) errors.push(`${path}.correct: tidak sah`);
  if (typeof r.percent !== 'number' || !Number.isFinite(r.percent) || r.percent < 0 || r.percent > 100) errors.push(`${path}.percent: tidak sah`);
  if (!isIso(r.scannedAt)) errors.push(`${path}.scannedAt: tarikh tidak sah`);
  if (!isIso(r.updatedAt)) errors.push(`${path}.updatedAt: tarikh tidak sah`);
}

function checkSetting(s, path, errors) {
  if (!isObj(s) || !SETTING_KEYS.includes(s.key)) { errors.push(`${path}.key: tidak dikenali`); return; }
  const v = s.value;
  if (s.key === 'schoolName' && !isStr(v, 120)) errors.push(`${path}.value: tidak sah`);
  if (s.key === 'autoCapture' && typeof v !== 'boolean') errors.push(`${path}.value: tidak sah`);
  if (s.key === 'lastBackupAt' && !isIso(v)) errors.push(`${path}.value: tidak sah`);
  if (s.key === 'thresholds' && !(isObj(v) && Object.keys(v).every((k) => THRESHOLD_KEYS.includes(k) && typeof v[k] === 'number' && v[k] >= 0 && v[k] <= 1))) {
    errors.push(`${path}.value: tidak sah`);
  }
}

/** @returns {{ok: boolean, errors: string[]}} */
export function validateBackup(obj) {
  const errors = [];
  if (!isObj(obj)) return { ok: false, errors: ['Fail bukan objek JSON'] };
  if (obj.app !== BACKUP_APP) errors.push('app: bukan fail sandaran aplikasi ini');
  if (obj.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion: hanya versi ${SCHEMA_VERSION} disokong`);
  if (!isIso(obj.exportedAt)) errors.push('exportedAt: tarikh tidak sah');
  for (const k of ['tests', 'results', 'settings']) if (!Array.isArray(obj[k])) errors.push(`${k}: mesti senarai`);
  if (errors.length) return { ok: false, errors };

  const testInfo = new Map();
  const seen = new Set();
  obj.tests.forEach((t, i) => {
    const info = checkTest(t, `tests[${i}]`, errors);
    if (isObj(t) && isId(t.id)) {
      if (seen.has(t.id)) errors.push(`tests[${i}].id: pendua`);
      seen.add(t.id);
      if (info) testInfo.set(t.id, info);
    }
  });
  const seenR = new Set();
  obj.results.forEach((r, i) => {
    checkResult(r, `results[${i}]`, testInfo, errors);
    if (isObj(r) && isId(r.id)) {
      if (seenR.has(r.id)) errors.push(`results[${i}].id: pendua`);
      seenR.add(r.id);
    }
  });
  const seenS = new Set();
  obj.settings.forEach((s, i) => {
    checkSetting(s, `settings[${i}]`, errors);
    if (isObj(s)) { if (seenS.has(s.key)) errors.push(`settings[${i}].key: pendua`); seenS.add(s.key); }
  });
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

/** Parse backup text safely. Throws Error with a BM message. */
export function parseBackupText(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES) throw new Error('Fail terlalu besar atau tidak sah');
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('Fail bukan JSON yang sah'); }
  return obj;
}

// Copy only known fields so unexpected keys in a file never reach the database.
const cleanTest = (t) => ({
  id: t.id, name: t.name, subject: t.subject ?? '', className: t.className ?? '',
  layoutConfig: {
    version: 1, numQuestions: t.layoutConfig.numQuestions, numChoices: t.layoutConfig.numChoices, idDigits: t.layoutConfig.idDigits,
    ...(t.layoutConfig.format === 'spm-kom28' ? { format: 'spm-kom28' } : {}),
  },
  key: [...t.key], roster: t.roster.map((r) => ({ code: r.code, name: r.name })),
  locked: t.locked, createdAt: t.createdAt, updatedAt: t.updatedAt,
});
const cleanResult = (r) => ({
  id: r.id, testId: r.testId, studentCode: r.studentCode, studentName: r.studentName,
  scanned: r.scanned.map((s) => ({ q: s.q, choice: s.choice, status: s.status })),
  final: [...r.final], manualEdits: [...r.manualEdits],
  correct: r.correct, total: r.total, percent: r.percent, scannedAt: r.scannedAt, updatedAt: r.updatedAt,
});

export async function exportAll() {
  const db = await getDb();
  const tx = db.transaction(['tests', 'results', 'settings'], 'readonly');
  const [tests, results, settings] = await Promise.all(
    ['tests', 'results', 'settings'].map((n) => reqP(tx.objectStore(n).getAll())),
  );
  return { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tests, results, settings };
}

/**
 * @param {object} payload parsed backup
 * @param {"merge"|"replace"} mode merge keeps newer existing rows; replace wipes first
 * @returns {Promise<{tests:number, results:number, skipped:number}>}
 */
export async function importAll(payload, mode = 'merge') {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Mod pulih tidak sah');
  const v = validateBackup(payload);
  if (!v.ok) throw new Error(`Fail sandaran tidak sah: ${v.errors[0]}`);
  const db = await getDb();
  const tx = db.transaction(['tests', 'results', 'settings'], 'readwrite');
  const done = txDone(tx);
  const st = { tests: tx.objectStore('tests'), results: tx.objectStore('results'), settings: tx.objectStore('settings') };
  const out = { tests: 0, results: 0, skipped: 0 };
  try {
    if (mode === 'replace') for (const s of Object.values(st)) s.clear();
    const upsert = async (store, row) => {
      if (mode === 'merge') {
        const cur = await reqP(store.get(row.id));
        if (cur && cur.updatedAt >= row.updatedAt) { out.skipped++; return false; }
      }
      store.put(row);
      return true;
    };
    for (const t of payload.tests) if (await upsert(st.tests, cleanTest(t))) out.tests++;
    for (const r of payload.results) if (await upsert(st.results, cleanResult(r))) out.results++;
    for (const s of payload.settings) st.settings.put({ key: s.key, value: structuredClone(s.value) });
  } catch (e) {
    try { tx.abort(); } catch { /* already finished */ }
    await done.catch(() => {});
    throw e;
  }
  await done;
  return out;
}

export async function clearAll() {
  const db = await getDb();
  const tx = db.transaction(['tests', 'results', 'settings'], 'readwrite');
  for (const n of ['tests', 'results', 'settings']) tx.objectStore(n).clear();
  await txDone(tx);
}
