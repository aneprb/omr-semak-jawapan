// scanImage pada kertas sintetik (tools/gen_sheets.py). SPEC 3.4, 3.5, 3.6, 3.11.
// Guna set penuh di fixtures/sheets/generated/<profil>/ jika ada; jika tiada, guna set smoke.
import { assert, assertEqual, loadImageData, loadJson, skip } from "./harness.js";
import { buildLayout } from "../js/omr/layout.js";
import { scanImage, detectMarkers } from "../js/omr/scan.js";
import { pageHomography, renderSheet } from "./synth.js";
import * as client from "../js/omr/client.js";
import { projectLayout } from "../js/omr/overlay.js";
import { applyHomography } from "../js/omr/homography.js";

const SHEETS = "./fixtures/sheets";

/** Ulang percubaan jika sambungan setempat terputus sekejap (kadang-kadang berlaku pada peranti terurus). */
async function retry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw last;
}

async function exists(url) {
  try {
    return (await fetch(url, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

/** -> { dir, items:[{file, expected}] } atau null jika tiada fixture. */
export async function loadSet(profile) {
  const full = `${SHEETS}/generated/${profile}`;
  if (await exists(`${full}/manifest.json`)) {
    const m = await retry(() => loadJson(`${full}/manifest.json`));
    return { dir: full, source: "generated", items: m.items.filter((i) => i.profile === profile.replace(/\d+$/, "")) };
  }
  const smoke = `${SHEETS}/smoke`;
  if (await exists(`${smoke}/manifest.json`)) {
    const m = await retry(() => loadJson(`${smoke}/manifest.json`));
    return { dir: smoke, source: "smoke", items: m.items.filter((i) => i.profile === profile.replace(/\d+$/, "")) };
  }
  return null;
}

/** Nilai satu set. Pulangkan metrik; tiada assert di sini. */
export async function evaluate(profile, { limit = Infinity } = {}) {
  const set = await loadSet(profile);
  if (!set || set.items.length === 0) return null;
  const m = {
    profile,
    source: set.source,
    papers: 0,
    ok: 0,
    questions: 0,
    correct: 0, // soalan dibaca sama seperti jangkaan (kertas ok sahaja)
    falseOk: 0, // kosong/berganda sebenar dilaporkan OK
    expectedBlankMulti: 0,
    idTotal: 0,
    idCorrect: 0,
    rotatedChecked: 0,
    rotatedWrong: 0,
    cornerErrMax: 0,
    cornerErrSum: 0,
    cornerN: 0,
    msSum: 0,
    msMax: 0,
    errors: {},
    badFiles: [],
    uncertain: 0,
    wrongDetail: [],
  };
  let count = 0;
  for (const item of set.items) {
    if (count++ >= limit) break;
    const exp = await retry(() => loadJson(`${set.dir}/${item.expected}`));
    const img = await retry(() => loadImageData(`${set.dir}/${item.file}`));
    const layout = buildLayout(exp.config);
    const t0 = performance.now();
    const res = scanImage(img, layout);
    const ms = performance.now() - t0;
    m.papers++;
    m.msSum += ms;
    m.msMax = Math.max(m.msMax, ms);
    if (!res.ok) {
      m.errors[res.error] = (m.errors[res.error] || 0) + 1;
      m.badFiles.push(`${item.file}:${res.error}`);
      continue;
    }
    m.ok++;
    if (exp.transform && typeof exp.transform.rotated180 === "boolean") {
      m.rotatedChecked++;
      if (res.rotated180 !== exp.transform.rotated180) m.rotatedWrong++;
    }
    if (exp.transform && exp.transform.corners) {
      exp.transform.corners.forEach((c, i) => {
        const e = Math.hypot(res.corners[i].x - c[0], res.corners[i].y - c[1]);
        m.cornerErrMax = Math.max(m.cornerErrMax, e);
        m.cornerErrSum += e;
        m.cornerN++;
      });
    }
    exp.answers.forEach((want, i) => {
      const got = res.answers[i];
      m.questions++;
      let good;
      if (want === "MULTI") {
        m.expectedBlankMulti++;
        good = got.status === "MULTIPLE";
        if (got.status === "OK") m.falseOk++;
      } else if (want === null) {
        m.expectedBlankMulti++;
        good = got.status === "BLANK";
        if (got.status === "OK") m.falseOk++;
      } else {
        good = got.choice === want;
      }
      if (got.status === "UNCERTAIN") m.uncertain++;
      if (good) m.correct++;
      else if (m.wrongDetail.length < 12) {
        m.wrongDetail.push(
          `${item.file} q${i + 1} want=${want} got=${got.choice}/${got.status} fills=${got.fills.map((f) => f.toFixed(2)).join(",")}`,
        );
      }
    });
    if (exp.idCode) {
      m.idTotal++;
      if (res.studentId.value === exp.idCode) m.idCorrect++;
    }
  }
  m.accuracy = m.questions ? m.correct / m.questions : 0;
  m.okRate = m.papers ? m.ok / m.papers : 0;
  m.falseOkRate = m.questions ? m.falseOk / m.questions : 0;
  m.msMean = m.papers ? m.msSum / m.papers : 0;
  return m;
}

const cache = new Map();
function cached(profile) {
  if (!cache.has(profile)) cache.set(profile, evaluate(profile));
  return cache.get(profile);
}

function brief(m) {
  return `n=${m.papers} ok=${m.ok} acc=${(m.accuracy * 100).toFixed(2)}% falseOk=${m.falseOk} err=${JSON.stringify(m.errors)} bad=${m.badFiles.slice(0, 5).join(",")} wrong=${m.wrongDetail.slice(0, 3).join(" | ")}`;
}

/** Kertas Q40-C5-ID6 dibina dalam JS dengan corak jawapan yang diketahui. */
function jsSheet(w, h, hopts, ropts = {}) {
  const layout = buildLayout({ numQuestions: 40, numChoices: 5, idDigits: 6 });
  const want = [];
  const fills = {};
  for (const q of layout.questions) {
    const n = q.q;
    const letter = q.bubbles[(n * 3) % 5].choice;
    if (n % 7 === 0) want.push({ status: "BLANK", choice: null });
    else if (n % 11 === 0) {
      const other = q.bubbles[(n * 3 + 2) % 5].choice;
      fills[n] = [{ choice: letter, dark: 0.9 }, { choice: other, dark: 0.85 }];
      want.push({ status: "MULTIPLE", choice: null });
    } else if (n % 13 === 0) {
      fills[n] = [{ choice: letter, dark: 0.5 }];
      want.push({ status: null, choice: letter }); // tanda ringan: OK atau UNCERTAIN, pilihan betul
    } else {
      fills[n] = [{ choice: letter, dark: 0.92 }];
      want.push({ status: "OK", choice: letter });
    }
  }
  const H = pageHomography(layout, w, h, hopts);
  const img = renderSheet(layout, H, w, h, { fills, idCode: "012345", ...ropts });
  return { layout, H, img, want };
}

function checkJsSheet(res, want, label) {
  assertEqual(res.ok, true, `${label}: ok (${res.error})`);
  res.answers.forEach((a, i) => {
    const w = want[i];
    if (w.status) assertEqual(a.status, w.status, `${label}: q${i + 1} status`);
    assertEqual(a.choice, w.choice, `${label}: q${i + 1} choice`);
  });
  assertEqual(res.studentId.value, "012345", `${label}: ID`);
}

export const jsTests = [
  {
    name: "kertas dibina dalam JS 1600x2263 (putaran 6 darjah, cahaya 0.7, hingar): bacaan betul, masa <= 1500 ms (SPEC 3.11)",
    fn() {
      const { layout, img, want } = jsSheet(1600, 2263, { rotDeg: 6, skewX: 25, margin: 0.07 }, { light: 0.7, noise: 5 });
      const res = scanImage(img, layout);
      checkJsSheet(res, want, "1600x2263");
      assert(res.quality.ms <= 1500, `masa ${res.quality.ms} ms`);
      assertEqual(res.rotated180, false);
      assert(res.quality.contrast > 100, `kontras ${res.quality.contrast}`);
    },
  },
  {
    name: "kertas terbalik 180 dibetulkan: sudut, jawapan dan ID masih betul",
    fn() {
      const { layout, img, want, H } = jsSheet(1000, 1414, { flip180: true, rotDeg: -4 });
      const res = scanImage(img, layout);
      checkJsSheet(res, want, "terbalik");
      assertEqual(res.rotated180, true);
      layout.markers.forEach((m, i) => {
        const e = applyHomography(H, m.cx, m.cy);
        assert(Math.hypot(res.corners[i].x - e.x, res.corners[i].y - e.y) < 1.5, `sudut ${i}`);
      });
    },
  },
  {
    name: "foto telefon 12 MP (3024x4032) diskala dan diimbas <= 1500 ms; homografi dalam piksel imej asal",
    fn() {
      const { layout, img, want, H } = jsSheet(3024, 4032, { rotDeg: 3, margin: 0.04 }, { noise: 3 });
      const res = scanImage(img, layout);
      checkJsSheet(res, want, "12MP");
      assert(res.quality.ms <= 1500, `masa ${res.quality.ms} ms`);
      // H hasil harus memetakan penanda ke piksel imej asal (bukan imej diskala)
      layout.markers.forEach((m) => {
        const a = applyHomography(res.homography, m.cx, m.cy);
        const e = applyHomography(H, m.cx, m.cy);
        assert(Math.hypot(a.x - e.x, a.y - e.y) < 3, `homografi jauh ${Math.hypot(a.x - e.x, a.y - e.y).toFixed(2)} px`);
      });
    },
  },
  {
    name: "LOW_CONTRAST: kertas terlalu malap dipulangkan dengan ralat tepat",
    fn() {
      const { layout, img } = jsSheet(1000, 1414, {}, { paperGray: 60, tableGray: 50, light: 1 });
      // paper 60 vs penanda ~8 -> kontras ~52; paksa lebih rendah dengan minContrast tinggi
      const res = scanImage(img, layout, { minContrast: 120 });
      assertEqual(res.ok, false);
      assertEqual(res.error, "LOW_CONTRAST");
      assertEqual(res.answers.length, 0);
    },
  },
  {
    name: "projectLayout: pusat bulatan sepadan dengan homografi dan rPx > 0",
    fn() {
      const { layout, img } = jsSheet(1000, 1414, { rotDeg: 2 });
      const res = scanImage(img, layout);
      const p = projectLayout(res.homography, layout);
      assertEqual(p.answers.length, 40);
      assertEqual(p.answers[0].length, 5);
      assertEqual(p.idDigits.length, 6);
      assertEqual(p.idDigits[0].length, 10);
      assertEqual(p.regions.name.length, 4);
      assert(p.answers[0][0].rPx > 5 && p.answers[0][0].rPx < 30, `rPx ${p.answers[0][0].rPx}`);
      const b = layout.questions[0].bubbles[0];
      const e = applyHomography(res.homography, b.cx, b.cy);
      assertEqual([p.answers[0][0].x, p.answers[0][0].y], [e.x, e.y]);
    },
  },
  {
    name: "detectMarkers: laluan pantas untuk bingkai langsung (640 px) dan tanpa penanda",
    fn() {
      const { layout, img, H } = jsSheet(480, 640, { margin: 0.1 });
      const r = detectMarkers(img);
      assertEqual(r.found, true);
      assertEqual(r.error, null);
      layout.markers.forEach((m, i) => {
        const e = applyHomography(H, m.cx, m.cy);
        assert(Math.hypot(r.corners[i].x - e.x, r.corners[i].y - e.y) < 1.5, `sudut ${i}`);
      });
      const blank = { width: 480, height: 640, data: new Uint8ClampedArray(480 * 640 * 4).fill(230) };
      const rb = detectMarkers(blank);
      assertEqual(rb.found, false);
      assertEqual(rb.corners, null);
      assertEqual(rb.error, "NO_MARKERS");
    },
  },
  {
    name: "client.js: scan/detect melalui Web Worker sepadan dengan panggilan terus; ImageData asal kekal; detect berturut dilangkau",
    async fn() {
      const { layout, img, want } = jsSheet(900, 1273, { rotDeg: 2 });
      const before = img.data[1000];
      const viaWorker = await client.scan(img, layout);
      checkJsSheet(viaWorker, want, "worker");
      assertEqual(img.data.byteLength, 900 * 1273 * 4, "buffer asal tidak dipindahkan");
      assertEqual(img.data[1000], before);
      const direct = scanImage(img, layout);
      assertEqual(viaWorker.answers.map((a) => a.choice), direct.answers.map((a) => a.choice));
      const d1 = client.detect(img);
      const d2 = client.detect(img); // yang pertama belum selesai
      const [r1, r2] = await Promise.all([d1, d2]);
      assertEqual(r1.found, true);
      assertEqual(r2.skipped, true);
      const r3 = await client.detect(img);
      assertEqual(r3.found, true);
      client.terminate();
    },
  },
];

export default [
  {
    name: "set bersih: semua kertas ok dan ketepatan bulatan >= 99.5% (SPEC 3.4)",
    async fn() {
      const m = await cached("clean");
      if (!m) skip("tiada fixture clean");
      assertEqual(m.ok, m.papers, `kertas ok ${brief(m)}`);
      assert(m.accuracy >= 0.995, `ketepatan ${brief(m)}`);
      assertEqual(m.rotatedWrong, 0, "rotated180 salah pada set bersih");
    },
  },
  {
    name: "set herot: >= 95% ok, ketepatan >= 98%, positif palsu OK < 0.5% (SPEC 3.5)",
    async fn() {
      const m = await cached("distorted");
      if (!m) skip("tiada fixture distorted");
      assert(m.okRate >= 0.95, `kadar ok ${brief(m)}`);
      assert(m.accuracy >= 0.98, `ketepatan ${brief(m)}`);
      assert(m.falseOkRate < 0.005, `positif palsu ${brief(m)}`);
    },
  },
  {
    name: "set herot: orientasi 180 dan sudut penanda dikesan betul",
    async fn() {
      const m = await cached("distorted");
      if (!m) skip("tiada fixture distorted");
      assertEqual(m.rotatedWrong, 0, `rotated180 salah (${m.rotatedChecked} disemak)`);
      if (m.cornerN > 0) {
        assert(m.cornerErrSum / m.cornerN < 4, `ralat sudut purata ${(m.cornerErrSum / m.cornerN).toFixed(2)} px`);
      }
    },
  },
  {
    name: "tanpa penanda / kosong / 3 penanda: ok=false NO_MARKERS (SPEC 3.6)",
    async fn() {
      const m = await cached("blank");
      if (!m) skip("tiada fixture blank");
      assertEqual(m.ok, 0, `tiada kertas kosong patut ok: ${brief(m)}`);
      assertEqual(m.errors.NO_MARKERS || 0, m.papers, `semua NO_MARKERS: ${brief(m)}`);
      assert(m.msMax <= 2000, `masa maks ${m.msMax.toFixed(0)} ms`);
    },
  },
  {
    name: "masa purata scanImage <= 1500 ms (SPEC 3.11)",
    async fn() {
      const m = await cached("distorted");
      if (!m) skip("tiada fixture distorted");
      assert(m.msMean <= 1500, `purata ${m.msMean.toFixed(0)} ms, maks ${m.msMax.toFixed(0)} ms`);
    },
  },
  {
    name: "scanImage tidak melempar: susun atur rosak, imej kecil, imej kosong",
    async fn() {
      const layout = buildLayout({ numQuestions: 10, numChoices: 4, idDigits: 0 });
      const big = { width: 700, height: 900, data: new Uint8ClampedArray(700 * 900 * 4).fill(255) };
      const tiny = { width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4).fill(255) };
      assertEqual(scanImage(big, null).error, "LAYOUT_INVALID");
      assertEqual(scanImage(big, { schema: "x" }).error, "LAYOUT_INVALID");
      assertEqual(scanImage(tiny, layout).error, "IMAGE_TOO_SMALL");
      const r = scanImage(big, layout);
      assertEqual(r.ok, false);
      assertEqual(r.error, "NO_MARKERS");
      assertEqual(r.answers.length, 0);
      assertEqual(r.studentId, { value: null, digits: [] });
      assertEqual(r.corners, null);
    },
  },
  ...jsTests,
];
