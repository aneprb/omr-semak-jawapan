// Backup/restore tests. Uses a throwaway IndexedDB, synthetic data only.
import { assert, assertEqual } from './harness.js';
import { useDb, closeDb, saveTest, saveResult, setSetting, listTests, listResults, getSetting, deleteTest } from '../js/data/repo.js';
import { deleteDb } from '../js/data/db.js';
import { exportAll, importAll, validateBackup, clearAll, parseBackupText } from '../js/data/backup.js';
import { uuid } from '../js/util/uuid.js';

const iso = (s = 0) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

function mkTest(over = {}) {
  return {
    id: uuid(), name: 'Ujian Sintetik', subject: 'Sains', className: '4 Uji',
    layoutConfig: { version: 1, numQuestions: 4, numChoices: 4, idDigits: 2 },
    key: ['A', 'B', null, 'D'], roster: [{ code: '01', name: 'Pelajar Ujian 1' }],
    locked: false, createdAt: iso(1), updatedAt: iso(1), ...over,
  };
}
function mkResult(testId, over = {}) {
  return {
    id: uuid(), testId, studentCode: '01', studentName: 'Pelajar Ujian 1',
    scanned: ['A', 'B', 'C', null].map((c, i) => ({ q: i + 1, choice: c, status: c ? 'OK' : 'BLANK' })),
    final: ['A', 'B', 'C', null], manualEdits: [3], correct: 2, total: 4, percent: 50,
    scannedAt: iso(2), updatedAt: iso(2), ...over,
  };
}
function mkPayload() {
  const t = mkTest();
  return {
    app: 'omr-semak-jawapan', schemaVersion: 1, exportedAt: iso(9),
    tests: [t], results: [mkResult(t.id)], settings: [{ key: 'schoolName', value: 'SMK Contoh' }],
  };
}

let n = 0;
async function fresh() {
  const name = `omr-test-${Date.now()}-${n++}`;
  await useDb(name);
  return name;
}
async function withDb(fn) {
  const name = await fresh();
  try { await fn(); } finally { await closeDb(); await deleteDb(name); }
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const bad = (mut) => { const p = mkPayload(); mut(p); return validateBackup(p); };

export default [
  { name: 'backup: payload sah lulus validasi', fn: () => { const v = validateBackup(mkPayload()); assert(v.ok, v.errors.join('; ')); } },
  { name: 'backup: menolak bukan objek / app salah / versi salah', fn: () => {
    assert(!validateBackup(null).ok); assert(!validateBackup([]).ok);
    assert(!bad((p) => { p.app = 'lain'; }).ok);
    assert(!bad((p) => { p.schemaVersion = 2; }).ok);
    assert(!bad((p) => { delete p.results; }).ok);
  } },
  { name: 'backup: menolak ujian tidak sah', fn: () => {
    assert(!bad((p) => { p.tests[0].id = 'bukan-uuid'; }).ok);
    assert(!bad((p) => { p.tests[0].name = ''; }).ok);
    assert(!bad((p) => { p.tests[0].name = 'x'.repeat(81); }).ok);
    assert(!bad((p) => { p.tests[0].key = ['A']; }).ok);
    assert(!bad((p) => { p.tests[0].key[0] = 'E'; }).ok);
    assert(!bad((p) => { p.tests[0].layoutConfig.numChoices = 9; }).ok);
    assert(!bad((p) => { p.tests[0].locked = 'ya'; }).ok);
    assert(!bad((p) => { p.tests.push(p.tests[0]); }).ok);
  } },
  { name: 'backup: menolak keputusan tidak sah', fn: () => {
    assert(!bad((p) => { p.results[0].testId = uuid(); }).ok);
    assert(!bad((p) => { p.results[0].final = ['A']; }).ok);
    assert(!bad((p) => { p.results[0].scanned[0].status = 'XX'; }).ok);
    assert(!bad((p) => { p.results[0].correct = 9; }).ok);
    assert(!bad((p) => { p.results[0].percent = 101; }).ok);
    assert(!bad((p) => { p.results[0].manualEdits = [99]; }).ok);
  } },
  { name: 'backup: menolak tetapan tidak dikenali', fn: () => {
    assert(!bad((p) => { p.settings.push({ key: '__proto__', value: 1 }); }).ok);
    assert(!bad((p) => { p.settings[0].value = 5; }).ok);
  } },
  { name: 'backup: parseBackupText menolak JSON rosak', fn: () => {
    let threw = false;
    try { parseBackupText('{rosak'); } catch { threw = true; }
    assert(threw, 'sepatutnya baling ralat');
  } },
  { name: 'backup: eksport -> kosongkan -> import (replace) = sama', fn: () => withDb(async () => {
    const t = mkTest();
    await saveTest(t);
    await saveResult(mkResult(t.id));
    await setSetting('schoolName', 'SMK Contoh');
    const a = await exportAll();
    assertEqual(a.tests.length, 1); assertEqual(a.results.length, 1);
    await clearAll();
    assertEqual((await listTests()).length, 0);
    const out = await importAll(clone(a), 'replace');
    assertEqual(out.tests, 1); assertEqual(out.results, 1);
    const b = await exportAll();
    assertEqual(JSON.stringify(b.tests), JSON.stringify(a.tests));
    assertEqual(JSON.stringify(b.results), JSON.stringify(a.results));
    assertEqual(await getSetting('schoolName'), 'SMK Contoh');
  }) },
  { name: 'backup: merge tidak menimpa data lebih baharu, lalu skipped', fn: () => withDb(async () => {
    const p = mkPayload();
    await importAll(clone(p), 'replace');
    const older = clone(p);
    older.tests[0].name = 'Nama Lama'; older.tests[0].updatedAt = iso(0);
    const out = await importAll(older, 'merge');
    assertEqual(out.skipped >= 1, true);
    assertEqual((await listTests())[0].name, 'Ujian Sintetik');
    const newer = clone(p);
    newer.tests[0].name = 'Nama Baharu'; newer.tests[0].updatedAt = iso(50);
    await importAll(newer, 'merge');
    assertEqual((await listTests())[0].name, 'Nama Baharu');
  }) },
  { name: 'backup: fail tidak sah tidak mengubah pangkalan data', fn: () => withDb(async () => {
    const p = mkPayload();
    await importAll(clone(p), 'replace');
    const broken = clone(p);
    broken.results[0].final = ['A'];
    let threw = false;
    try { await importAll(broken, 'replace'); } catch { threw = true; }
    assert(threw, 'sepatutnya baling ralat');
    assertEqual((await listTests()).length, 1);
    assertEqual((await listResults(p.tests[0].id)).length, 1);
  }) },
  { name: 'backup: medan tambahan dibuang semasa import', fn: () => withDb(async () => {
    const p = mkPayload();
    p.tests[0].evil = 'x'; p.results[0].extra = 1;
    await importAll(p, 'replace');
    const a = await exportAll();
    assertEqual('evil' in a.tests[0], false);
    assertEqual('extra' in a.results[0], false);
  }) },
  { name: 'repo: deleteTest cascade padam keputusan', fn: () => withDb(async () => {
    const t = mkTest();
    await saveTest(t);
    await saveResult(mkResult(t.id)); await saveResult(mkResult(t.id));
    assertEqual((await listResults(t.id)).length, 2);
    await deleteTest(t.id);
    assertEqual((await listResults(t.id)).length, 0);
    assertEqual((await listTests()).length, 0);
  }) },
];
