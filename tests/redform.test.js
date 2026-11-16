// js/omr/redform.js: borang SPM dakwat merah (LPM/KOM 28). Gambar sebenar tests/fixtures/real/ tidak
// dikomit (privasi), jadi ujian gambar sebenar dilangkau jika fail tiada.
import { assert, assertEqual, skip, loadImageData } from "./harness.js";
import { scanImage, detectMarkers } from "../js/omr/scan.js";
import { downscale } from "../js/omr/image.js";

const REAL = "./fixtures/real/spm-kom28-001.jpg";
const LAYOUT = { format: "spm-kom28", config: { numQuestions: 80 } };
// Jawapan yang dihitamkan pada gambar (disahkan secara visual): S1-20, S9 kosong, S21-80 kosong.
const EXPECTED = "DDAABDDD-DAACBABBACC" + "-".repeat(60);

// Gambar telefon 002-006 (borang yang sama, pelbagai keadaan): terpotong di bawah, jauh, senget, berputar +
// perspektif, pen merah dan tanda guru berdekatan. Jawapan S1-20 disahkan secara visual.
const PHONE = ["002", "003", "004", "005", "006"];
const PHONE_EXPECTED = "BCCBACDACCAACCAACBCB" + "-".repeat(60);

const cache = new Map();
async function loadReal(path) {
  if (cache.has(path)) return cache.get(path);
  let img = null;
  try {
    const r = await fetch(new URL(path, import.meta.url), { method: "HEAD" });
    img = r.ok ? await loadImageData(new URL(path, import.meta.url).href) : null;
  } catch {
    img = null;
  }
  cache.set(path, img);
  return img;
}
const realImage = () => loadReal(REAL);

function rotate180(img) {
  const n = img.width * img.height;
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) data[(n - 1 - i) * 4 + c] = img.data[i * 4 + c];
  return { width: img.width, height: img.height, data };
}

const answerString = (r) => r.answers.map((a) => a.choice || "-").join("");

export default [
  {
    name: "kertas kosong (kelabu rata) -> NO_FRAME, tiada pengesanan langsung",
    fn() {
      const g = { width: 900, height: 1200, data: new Uint8ClampedArray(900 * 1200 * 4).fill(200) };
      assertEqual(scanImage(g, LAYOUT, {}).error, "NO_FRAME");
      assertEqual(detectMarkers(g, { format: "spm-kom28" }).found, false);
    },
  },
  {
    name: "susun atur tidak sah -> LAYOUT_INVALID",
    fn() {
      const g = { width: 900, height: 1200, data: new Uint8ClampedArray(900 * 1200 * 4).fill(200) };
      assertEqual(scanImage(g, { format: "spm-kom28", config: { numQuestions: 0 } }, {}).error, "LAYOUT_INVALID");
    },
  },
  {
    name: "gambar sebenar: panel jawapan dikesan, 80 soalan dibaca tepat, tiada UNCERTAIN",
    async fn() {
      const img = await realImage();
      if (!img) skip("tests/fixtures/real/spm-kom28-001.jpg tiada");
      const r = scanImage(img, LAYOUT, {});
      assert(r.ok, "imbasan gagal: " + r.error);
      assertEqual(r.rotated180, false);
      assertEqual(answerString(r), EXPECTED);
      const unsure = r.answers.filter((a) => a.status === "UNCERTAIN").map((a) => a.q);
      assertEqual(unsure, []);
    },
  },
  {
    name: "gambar sebenar diputar 180 darjah: dikesan terbalik, jawapan sama",
    async fn() {
      const img = await realImage();
      if (!img) skip("tests/fixtures/real/spm-kom28-001.jpg tiada");
      const r = scanImage(rotate180(img), LAYOUT, {});
      assert(r.ok, "imbasan gagal: " + r.error);
      assertEqual(r.rotated180, true);
      assertEqual(answerString(r), EXPECTED);
    },
  },
  {
    name: "gambar sebenar: pengesanan langsung pada bingkai 1200 px menjumpai borang",
    async fn() {
      const img = await realImage();
      if (!img) skip("tests/fixtures/real/spm-kom28-001.jpg tiada");
      const d = detectMarkers(downscale(img, 1200), { format: "spm-kom28" });
      assert(d.found, "tidak dijumpai: " + d.error);
    },
  },
  ...PHONE.map((id) => ({
    name: `gambar telefon ${id}: dikesan (imbasan + langsung), jawapan tepat`,
    async fn() {
      const img = await loadReal(`./fixtures/real/spm-kom28-${id}.jpg`);
      if (!img) skip(`tests/fixtures/real/spm-kom28-${id}.jpg tiada`);
      const r = scanImage(img, LAYOUT, {});
      assert(r.ok, "imbasan gagal: " + r.error);
      assertEqual(r.rotated180, false);
      const got = answerString(r);
      if (id === "002") {
        // bahagian bawah terpotong: S30 dan S60 di luar gambar -> UNCERTAIN tanpa pilihan, bukan MULTIPLE
        assertEqual(got.slice(0, 20), PHONE_EXPECTED.slice(0, 20));
        for (const a of r.answers) if (a.status === "UNCERTAIN") assert(a.offImage && a.choice === null, "S" + a.q);
        assert(!r.answers.some((a) => a.status === "MULTIPLE"), "MULTIPLE");
      } else {
        assertEqual(got, PHONE_EXPECTED);
        assertEqual(r.answers.filter((a) => a.status !== "OK" && a.status !== "BLANK").map((a) => a.q), []);
      }
      const d = detectMarkers(downscale(img, 1200), { format: "spm-kom28" });
      assert(d.found, "pengesanan langsung gagal: " + d.error);
    },
  })),
  {
    name: "separuh atas / bawah borang sahaja -> NO_FRAME (bukan kekisi palsu)",
    async fn() {
      const img = await realImage();
      if (!img) skip("tests/fixtures/real/spm-kom28-001.jpg tiada");
      const { width: w, height: h } = img;
      const hh = Math.floor(h * 0.45);
      const top = { width: w, height: hh, data: img.data.slice(0, w * hh * 4) };
      const bot = { width: w, height: hh, data: img.data.slice(w * (h - hh) * 4) };
      assertEqual(scanImage(top, LAYOUT, {}).error, "NO_FRAME");
      assertEqual(scanImage(bot, LAYOUT, {}).error, "NO_FRAME");
    },
  },
  {
    name: "ambang guru yang sama dengan lalai hitam tidak menimpa ambang borang merah",
    async fn() {
      const img = await loadReal("./fixtures/real/spm-kom28-005.jpg");
      if (!img) skip("tests/fixtures/real/spm-kom28-005.jpg tiada");
      const r = scanImage(img, LAYOUT, { thresholds: { blank: 0.2, mark: 0.45, multiRatio: 0.75, minGap: 0.2 } });
      assertEqual(answerString(r), PHONE_EXPECTED);
    },
  },
];
