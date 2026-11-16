// Aliran hujung-ke-hujung: kunci -> imbas fixture -> semak -> simpan -> keputusan -> CSV (SPEC 2.5, 3.10, 4.1, 5.1).
// Memandu paparan sebenar (js/ui/views/*) dengan ctx olok-olok; pangkalan data sementara; data sintetik.
import { assert, assertEqual, loadImageData, loadJson, skip } from "./harness.js";
import { loadSet } from "./scan-synthetic.test.js";
import { useDb, closeDb, saveTest, listResults, getTest, saveResult } from "../js/data/repo.js";
import { deleteDb } from "../js/data/db.js";
import { buildLayout } from "../js/omr/layout.js";
import * as client from "../js/omr/client.js";
import { setCapture, clearCapture } from "../js/ui/state.js";
import { uuid } from "../js/util/uuid.js";
import { S } from "../js/ui/strings.ms.js";
import { render as renderReview } from "../js/ui/views/review.js";
import { render as renderResults } from "../js/ui/views/results.js";
import { render as renderScan } from "../js/ui/views/scan.js";
import { render as renderHome } from "../js/ui/views/test-home.js";
import { resultsToRows, toCsv } from "../js/data/csv.js";

let counter = 0;
async function withDb(fn) {
  const name = `omr-flow-${Date.now()}-${counter++}`;
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
    const v = cond();
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
const findBtn = (root, label) => [...root.querySelectorAll("button, a")].find((b) => textOf(b).includes(label));

/** Sediakan ujian + satu imbasan daripada fixture bersih (ada ID). */
async function prepare() {
  const set = await loadSet("clean");
  if (!set) skip("tiada fixture clean");
  let pick = null;
  for (const it of set.items) {
    const exp = await loadJson(`${set.dir}/${it.expected}`);
    if (exp.idCode && exp.config.idDigits > 0) {
      pick = { it, exp };
      break;
    }
  }
  if (!pick) skip("tiada fixture clean dengan ID");
  const { it, exp } = pick;
  const raw = await loadImageData(`${set.dir}/${it.file}`);
  const imageData = new ImageData(raw.data, raw.width, raw.height);
  const layoutConfig = { version: 1, ...exp.config };
  const layout = buildLayout(exp.config);
  const key = exp.answers.map((a) => (/^[A-E]$/.test(a) ? a : "A"));
  const expectedCorrect = exp.answers.filter((a) => /^[A-E]$/.test(a)).length;
  const now = new Date().toISOString();
  const test = {
    id: uuid(), name: "Ujian Sintetik", subject: "", className: "", layoutConfig, key,
    roster: [{ code: exp.idCode, name: "Pelajar Ujian 1" }], locked: false, createdAt: now, updatedAt: now,
  };
  await saveTest(test);
  const scan = await client.scan(imageData, layout);
  assertEqual(scan.ok, true, `imbasan ok (${scan.error})`);
  return { test, exp, imageData, scan, expectedCorrect, layout };
}

async function review(test, imageData, scan) {
  setCapture(test.id, { imageData, scan });
  const ctx = makeCtx(test.id);
  const root = await renderReview(ctx);
  document.body.append(root);
  return { root, ctx };
}

export default [
  {
    name: "skema tidak lengkap: paparan imbas enggan mengimbas (SPEC 2.5)",
    fn: () => withDb(async () => {
      const now = new Date().toISOString();
      const key = Array(10).fill("A");
      key[3] = null;
      const test = {
        id: uuid(), name: "T", subject: "", className: "", layoutConfig: { version: 1, numQuestions: 10, numChoices: 4, idDigits: 0 },
        key, roster: [], locked: false, createdAt: now, updatedAt: now,
      };
      await saveTest(test);
      const root = await renderScan(makeCtx(test.id));
      assert(textOf(root).includes(S.home.needKey), "mesej skema tiada");
      assertEqual(root.querySelector("video"), null, "kamera tidak patut dimulakan");
      // halaman ujian: butang imbas dilumpuhkan
      const home = await renderHome(makeCtx(test.id));
      const scanLink = [...home.querySelectorAll("a")].find((a) => a.getAttribute("href")?.endsWith("/imbas"));
      assertEqual(scanLink.getAttribute("aria-disabled"), "true");
    }),
  },
  {
    name: "imbas -> semak: markah dikira, ID dipadankan dengan roster, simpan menulis keputusan betul",
    fn: () => withDb(async () => {
      const { test, exp, imageData, scan, expectedCorrect } = await prepare();
      const { root, ctx } = await review(test, imageData, scan);
      const n = test.layoutConfig.numQuestions;
      assertEqual(textOf(root.querySelector(".score__value")), S.review.score(expectedCorrect, n), "markah paparan");
      assertEqual(root.querySelector("#rv-code").value, exp.idCode, "kod ID");
      assertEqual(root.querySelector("#rv-name").value, "Pelajar Ujian 1", "nama dari roster");
      findBtn(root, S.review.saveNext).click();
      await waitFor(() => ctx.navs.length, "navigasi selepas simpan");
      const rs = await listResults(test.id);
      assertEqual(rs.length, 1);
      assertEqual(rs[0].studentCode, exp.idCode);
      assertEqual(rs[0].correct, expectedCorrect);
      assertEqual(rs[0].total, n);
      assertEqual(rs[0].final.length, n);
      assertEqual(rs[0].manualEdits, []);
      assert(ctx.navs[0].endsWith("/imbas"), ctx.navs[0]);
      root.remove();
    }),
  },
  {
    name: "pembetulan manual: ubah satu soalan -> markah dikira semula, manualEdits direkod (SPEC 3.8)",
    fn: () => withDb(async () => {
      const { test, imageData, scan, expectedCorrect } = await prepare();
      const { root, ctx } = await review(test, imageData, scan);
      const rows = root.querySelectorAll("ul.list button.qrow");
      assertEqual(rows.length, test.layoutConfig.numQuestions);
      // soalan 1: tetapkan kepada jawapan yang betul jika salah, atau salah jika betul
      const wasCorrect = scan.answers[0].choice === test.key[0];
      rows[0].click();
      const dlg = await waitFor(() => document.querySelector("dialog[open]"), "dialog edit");
      const target = wasCorrect ? "B" === test.key[0] ? "C" : "B" : test.key[0];
      [...dlg.querySelectorAll("button.choice")].find((b) => b.textContent.trim() === target).click();
      await waitFor(() => !document.querySelector("dialog[open]"), "dialog tutup");
      const want = expectedCorrect + (wasCorrect ? -1 : 1);
      await waitFor(() => textOf(root.querySelector(".score__value")) === S.review.score(want, test.layoutConfig.numQuestions), "markah dikira semula");
      findBtn(root, S.review.saveNext).click();
      await waitFor(() => ctx.navs.length, "simpan");
      const rs = await listResults(test.id);
      assertEqual(rs[0].manualEdits, [1]);
      assertEqual(rs[0].correct, want);
      root.remove();
    }),
  },
  {
    name: "kod pelajar pendua: amaran; 'Simpan sebagai baharu' -> 2 keputusan; 'Ganti' -> kekal 1 (SPEC 3.10)",
    fn: () => withDb(async () => {
      const { test, exp, imageData, scan } = await prepare();
      for (const [label, expectCount] of [[null, 1], [S.review.dupNew, 2], [S.review.dupReplace, 2]]) {
        const { root, ctx } = await review(test, imageData, scan);
        findBtn(root, S.review.saveNext).click();
        if (label) {
          const dlg = await waitFor(() => document.querySelector("dialog[open]"), `dialog pendua (${label})`);
          assert(textOf(dlg).includes(exp.idCode), "amaran tidak menyebut kod");
          findBtn(dlg, label).click();
        }
        await waitFor(() => ctx.navs.length, `simpan (${label})`);
        assertEqual((await listResults(test.id)).length, expectCount, `selepas ${label}`);
        root.remove();
      }
    }),
  },
  {
    name: "keputusan: jadual, statistik dan eksport CSV (BOM, CRLF, lajur S1..Sn) (SPEC 4.1, 5.1)",
    fn: () => withDb(async () => {
      const { test, exp, imageData, scan, expectedCorrect } = await prepare();
      const { root, ctx } = await review(test, imageData, scan);
      findBtn(root, S.review.saveNext).click();
      await waitFor(() => ctx.navs.length, "simpan");
      root.remove();

      const view = await renderResults(makeCtx(test.id));
      document.body.append(view);
      const trs = view.querySelectorAll("tbody tr");
      assertEqual(trs.length, 1);
      assert(textOf(trs[0]).includes(`${expectedCorrect}/${test.layoutConfig.numQuestions}`), textOf(trs[0]));
      assert(textOf(trs[0]).includes("Pelajar Ujian 1"));

      // tangkap muat turun tanpa benar-benar memuat turun
      let blob = null;
      let name = null;
      const origUrl = URL.createObjectURL;
      const origClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = (b) => { blob = b; return "blob:test"; };
      HTMLAnchorElement.prototype.click = function () { name = this.download; };
      try {
        findBtn(view, S.results.exportCsv).click();
      } finally {
        URL.createObjectURL = origUrl;
        HTMLAnchorElement.prototype.click = origClick;
      }
      view.remove();
      assert(blob, "tiada Blob dieksport");
      assert(/^keputusan-ujian-sintetik-\d{8}\.csv$/.test(name), `nama fail ${name}`);
      assertEqual(blob.type, "text/csv;charset=utf-8");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      assertEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "BOM UTF-8");
      const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
      const lines = text.split("\r\n").filter(Boolean);
      assertEqual(lines.length, 2, "tajuk + 1 baris");
      const head = lines[0].split(",");
      assertEqual(head.slice(0, 6), ["Bil", "Kod Pelajar", "Nama", "Betul", "Jumlah", "Peratus"]);
      assertEqual(head.length, 6 + test.layoutConfig.numQuestions);
      assertEqual(head[6], "S1");
      const row = lines[1].split(",");
      assertEqual(row[3], String(expectedCorrect));
      assertEqual(row[1], exp.idCode);
    }),
  },
  {
    name: "CSV: nama berkoma/petikan dan awalan formula dipertahankan melalui saveResult -> resultsToRows (SPEC 5.1, 5.3)",
    fn: () => withDb(async () => {
      const now = new Date().toISOString();
      const test = {
        id: uuid(), name: "T", subject: "", className: "", layoutConfig: { version: 1, numQuestions: 10, numChoices: 4, idDigits: 0 },
        key: Array(10).fill("A"), roster: [], locked: false, createdAt: now, updatedAt: now,
      };
      await saveTest(test);
      const fin = Array(10).fill("A");
      await saveResult({
        id: uuid(), testId: test.id, studentCode: "=1+1", studentName: "Ali, \"Bin\" Abu",
        scanned: fin.map((c, i) => ({ q: i + 1, choice: c, status: "OK" })), final: fin, manualEdits: [],
        correct: 10, total: 10, percent: 100, scannedAt: now, updatedAt: now,
      });
      const csv = toCsv(resultsToRows(await getTest(test.id), await listResults(test.id)));
      assert(csv.includes("\"'=1+1\"") || csv.includes(",'=1+1,"), `formula tidak dineutralkan: ${csv}`);
      assert(csv.includes("\"Ali, \"\"Bin\"\" Abu\""), `petikan RFC 4180: ${csv}`);
    }),
  },
];
