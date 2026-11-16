// js/omr/redform.js: borang SPM dakwat merah (LPM/KOM 28). Gambar sebenar tests/fixtures/real/ tidak
// dikomit (privasi), jadi ujian gambar sebenar dilangkau jika fail tiada.
import { assert, assertEqual, skip, loadImageData } from "./harness.js";
import { scanImage, detectMarkers } from "../js/omr/scan.js";
import { downscale } from "../js/omr/image.js";

const REAL = "./fixtures/real/spm-kom28-001.jpg";
const LAYOUT = { format: "spm-kom28", config: { numQuestions: 80 } };
// Jawapan yang dihitamkan pada gambar (disahkan secara visual): S1-20, S9 kosong, S21-80 kosong.
const EXPECTED = "DDAABDDD-DAACBABBACC" + "-".repeat(60);

let cached;
async function realImage() {
  if (cached !== undefined) return cached;
  try {
    const r = await fetch(new URL(REAL, import.meta.url), { method: "HEAD" });
    cached = r.ok ? await loadImageData(new URL(REAL, import.meta.url).href) : null;
  } catch {
    cached = null;
  }
  return cached;
}

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
];
