import { openDb, DB_NAME, reqP, txDone } from './db.js';

let dbName = DB_NAME;
let dbPromise = null;

/** Switch database (tests use a throwaway name). Closes the current connection. */
export async function useDb(name = DB_NAME) {
  await closeDb();
  dbName = name;
}
export async function closeDb() {
  if (dbPromise) {
    const p = dbPromise;
    dbPromise = null;
    try { (await p).close(); } catch { /* ignore */ }
  }
}
export function getDb() {
  if (!dbPromise) dbPromise = openDb(dbName).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}
async function store(names, mode = 'readonly') {
  const db = await getDb();
  const tx = db.transaction(names, mode);
  return { tx, s: (n) => tx.objectStore(n) };
}

export async function listTests() {
  const { s } = await store('tests');
  const all = await reqP(s('tests').getAll());
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
export async function getTest(id) {
  const { s } = await store('tests');
  return (await reqP(s('tests').get(id))) ?? null;
}
export async function saveTest(test) {
  const t = { ...test, updatedAt: new Date().toISOString() };
  if (!t.createdAt) t.createdAt = t.updatedAt;
  const { tx, s } = await store('tests', 'readwrite');
  s('tests').put(t);
  await txDone(tx);
  return t;
}
/** Deletes a test and all its results in one transaction. */
export async function deleteTest(id) {
  const { tx, s } = await store(['tests', 'results'], 'readwrite');
  s('tests').delete(id);
  s('results').index('testId').openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
    const c = e.target.result;
    if (c) { s('results').delete(c.primaryKey); c.continue(); }
  };
  await txDone(tx);
}
export async function listResults(testId) {
  const { s } = await store('results');
  return reqP(s('results').index('testId').getAll(IDBKeyRange.only(testId)));
}
export async function getResult(id) {
  const { s } = await store('results');
  return (await reqP(s('results').get(id))) ?? null;
}
/** Saves a result and locks its test (layoutConfig can no longer change). */
export async function saveResult(result) {
  const r = { ...result, updatedAt: new Date().toISOString() };
  if (!r.scannedAt) r.scannedAt = r.updatedAt;
  const { tx, s } = await store(['tests', 'results'], 'readwrite');
  s('results').put(r);
  const g = s('tests').get(r.testId);
  g.onsuccess = () => {
    const t = g.result;
    if (t && !t.locked) s('tests').put({ ...t, locked: true });
  };
  await txDone(tx);
  return r;
}
export async function deleteResult(id) {
  const { tx, s } = await store('results', 'readwrite');
  s('results').delete(id);
  await txDone(tx);
}
export async function findResultsByCode(testId, code) {
  const { s } = await store('results');
  return reqP(s('results').index('testId_code').getAll(IDBKeyRange.only([testId, code])));
}
export async function getSetting(key, fallback = undefined) {
  const { s } = await store('settings');
  const row = await reqP(s('settings').get(key));
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  const { tx, s } = await store('settings', 'readwrite');
  s('settings').put({ key, value });
  await txDone(tx);
}
