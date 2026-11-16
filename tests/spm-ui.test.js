// Integrasi UI borang SPM merah (docs/PLAN.md seksyen 11): susun atur, borang ujian, sandaran, templat,
// dan aliran imbas -> semak -> simpan pada gambar sebenar (dilangkau jika gambar tiada).
import { assert, assertEqual, skip, loadImageData } from "./harness.js";
import { buildLayout, validateLayoutConfig, layoutCode, isRedForm } from "../js/omr/layout.js";
import { validateBackup, exportAll, importAll } from "../js/data/backup.js";
import { useDb, closeDb, saveTest, listTests, listResults } from "../js/data/repo.js";
import { deleteDb } from "../js/data/db.js";
import * as client from "../js/omr/client.js";
import { setCapture, clearCapture } from "../js/ui/state.js";
import { uuid } from "../js/util/uuid.js";
import { S } from "../js/ui/strings.ms.js";
import { render as renderForm } from "../js/ui/views/test-form.js";
import { render as renderTemplate } from "../js/ui/views/template.js";
import { render as renderHome } from "../js/ui/views/test-home.js";
import { render as renderReview } from "../js/ui/views/review.js";

const SPM = (n = 40) => ({ version: 1, format: "spm-kom28", numQuestions: n, numChoices: 4, idDigits: 0 });
const REAL = new URL("./fixtures/real/spm-kom28-001.jpg", import.meta.url).href;
const MARKED = "DDAABDDD-DAACBABBACC"; // S1-20 pada gambar sebenar

let counter = 0;
async function withDb(fn) {
  const name = `omr-spm-${Date.now()}-${counter++}`;
  await useDb(name);
  try {
    await fn();
  } finally {
    clearCapture();
    for (const d of document.querySelectorAll("dialog")) d.remove();
    await closeDb();
    await deleteDb(name);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, what, ms = 4000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const v = await cond();
    if (v) return v;
    await sleep(25);
  }
  throw new Error(`tamat masa menunggu: ${what}`);
}
function makeCtx(id) {
  const navs = [];
  return { navs, params: { id }, query: {}, setHeader() {}, navigate: (h) => navs.push(h), onLeave() {} };
}
const textOf = (node) => node.textContent.replace(/\s+/g, " ");
function mkTest(layoutConfig, key) {
  const now = new Date().toISOString();
  return {
    id: uuid(), name: "Ujian SPM", subject: "", className: "", layoutConfig,
    key: key ?? Array(layoutConfig.numQuestions).fill("A"), roster: [], locked: false, createdAt: now, updatedAt: now,
  };
}
function setInput(form, sel, v) {
  const el = form.querySelector(sel);
  el.value = v;
  el.dispatchEvent(new Event("input"));
}
function pickSpm(form) {
  const spm = form.querySelector('input[name="sheet"][value="spm"]');
  spm.checked = true;
  spm.dispatchEvent(new Event("change"));
}

export default [
  {
    name: "susun atur: config SPM sah (1..80, A-D, tiada ID); buildLayout -> format spm-kom28",
    fn() {
      assert(validateLayoutConfig(SPM(80)).ok);
      assert(validateLayoutConfig(SPM(1)).ok);
      assert(!validateLayoutConfig(SPM(81)).ok);
      assert(!validateLayoutConfig({ ...SPM(), numChoices: 5 }).ok);
      assert(!validateLayoutConfig({ ...SPM(), idDigits: 2 }).ok);
      assert(!validateLayoutConfig({ ...SPM(), format: "lain" }).ok);
      const L = buildLayout(SPM(40));
      assertEqual(L.format, "spm-kom28");
      assertEqual(L.questions.length, 40);
      assertEqual(L.questions[0].bubbles.map((b) => b.choice), ["A", "B", "C", "D"]);
      assertEqual(layoutCode(SPM(40)), "SPM-KOM28-Q40");
      assert(isRedForm(SPM()) && !isRedForm({ version: 1, numQuestions: 20, numChoices: 4, idDigits: 0 }));
    },
  },
  {
    name: "borang ujian: pilih Borang SPM -> pilihan/digit disembunyi, 80 soalan diterima, layoutConfig SPM disimpan",
    fn: () => withDb(async () => {
      const ctx = makeCtx();
      const form = await renderForm(ctx);
      document.body.append(form);
      try {
        assert(form.querySelector("#f-digits"), "medan digit wujud untuk kertas app");
        pickSpm(form);
        assertEqual(form.querySelector("#f-digits"), null, "digit disembunyi");
        assertEqual(form.querySelector('input[name="choices"]'), null, "pilihan disembunyi");
        assert(!textOf(form).includes("null"), "tiada teks 'null'");
        setInput(form, "#f-name", "Percubaan SPM");
        setInput(form, "#f-n", "80");
        form.requestSubmit();
        await waitFor(() => ctx.navs.length, "navigasi selepas cipta");
        const [t] = await listTests();
        assertEqual(t.layoutConfig, SPM(80));
        assertEqual(t.key.length, 80);
      } finally {
        form.remove();
      }
    }),
  },
  {
    name: "borang ujian: Borang SPM dengan 81 soalan ditolak",
    fn: () => withDb(async () => {
      const form = await renderForm(makeCtx());
      document.body.append(form);
      try {
        pickSpm(form);
        setInput(form, "#f-name", "X");
        setInput(form, "#f-n", "81");
        form.requestSubmit();
        await sleep(50);
        assert(textOf(form).includes(S.form.numQuestionsSpmError), "mesej ralat");
        assertEqual((await listTests()).length, 0);
      } finally {
        form.remove();
      }
    }),
  },
  {
    name: "sandaran: format SPM disahkan dan kekal selepas eksport -> import",
    fn: () => withDb(async () => {
      await saveTest(mkTest(SPM(40)));
      const payload = await exportAll();
      const v = validateBackup(payload);
      assert(v.ok, v.errors.join("; "));
      const bad = structuredClone(payload);
      bad.tests[0].layoutConfig.format = "xyz";
      assert(!validateBackup(bad).ok, "format tidak dikenali mesti ditolak");
      await importAll(payload, "replace");
      const [back] = await listTests();
      assertEqual(back.layoutConfig.format, "spm-kom28");
    }),
  },
  {
    name: "templat & halaman ujian: SPM tunjuk panduan, bukan templat cetak",
    fn: () => withDb(async () => {
      const t = mkTest(SPM(40));
      await saveTest(t);
      const tpl = await renderTemplate(makeCtx(t.id));
      assert(textOf(tpl).includes(S.template.spmTitle));
      assertEqual(tpl.querySelector("svg"), null, "tiada SVG templat");
      const home = await renderHome(makeCtx(t.id));
      assert(textOf(home).includes(S.home.templateSpm));
    }),
  },
  {
    name: "aliran sebenar: imbas borang SPM -> semak -> simpan (markah dan jawapan betul)",
    fn: () => withDb(async () => {
      let ok = false;
      try { ok = (await fetch(REAL, { method: "HEAD" })).ok; } catch { ok = false; }
      if (!ok) skip("gambar sebenar tiada");
      const raw = await loadImageData(REAL);
      const n = 20;
      // skema: S1-10 = jawapan murid (S9 kosong -> 'A'), S11-20 semua 'D' (hanya yang sepadan dikira betul)
      const key = MARKED.split("").map((c, i) => (i < 10 ? (c === "-" ? "A" : c) : "D"));
      const t = mkTest(SPM(n), key);
      await saveTest(t);
      const imageData = new ImageData(raw.data, raw.width, raw.height);
      const scan = await client.scan(imageData, buildLayout(t.layoutConfig));
      assert(scan.ok, "imbasan: " + scan.error);
      assertEqual(scan.answers.map((a) => a.choice || "-").join(""), MARKED);
      const expected = scan.answers.filter((a, i) => a.choice && a.choice === key[i]).length;
      assertEqual(expected, 9);
      setCapture(t.id, { imageData, scan });
      const ctx = makeCtx(t.id);
      const root = await renderReview(ctx);
      document.body.append(root);
      try {
        assertEqual(textOf(root.querySelector(".score__value")), S.review.score(expected, n));
        [...root.querySelectorAll("button")].find((b) => textOf(b).includes(S.review.saveNext)).click();
        await waitFor(() => ctx.navs.length, "navigasi selepas simpan");
        const rs = await listResults(t.id);
        assertEqual(rs.length, 1);
        assertEqual(rs[0].correct, expected);
        assertEqual(rs[0].final.map((c) => c || "-").join(""), MARKED);
      } finally {
        root.remove();
      }
    }),
  },
];
