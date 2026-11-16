// js/omr/markers.js pada imej sintetik yang dibina dalam JS.
import { assert, assertEqual } from "./harness.js";
import { buildLayout } from "../js/omr/layout.js";
import { toGray } from "../js/omr/image.js";
import { findMarkers } from "../js/omr/markers.js";
import { applyHomography } from "../js/omr/homography.js";
import { pageHomography, renderSheet, grayImage, fillRect } from "./synth.js";

const layout = buildLayout({ numQuestions: 20, numChoices: 5, idDigits: 4 });

function allFilled(lay) {
  const fills = {};
  for (const q of lay.questions) fills[q.q] = [{ choice: q.bubbles[q.q % lay.choices.length].choice, dark: 0.9 }];
  return fills;
}

function expectCorners(res, H, order, tol, label) {
  assert(res.ok, `${label}: findMarkers gagal (${res.error}, calon ${res.candidates})`);
  order.forEach((idx, i) => {
    const m = layout.markers[idx];
    const e = applyHomography(H, m.cx, m.cy);
    const d = Math.hypot(res.corners[i].x - e.x, res.corners[i].y - e.y);
    assert(d <= tol, `${label}: sudut ${i} jauh ${d.toFixed(2)} px (> ${tol})`);
  });
}

function sheet(w, h, hopts, ropts) {
  const H = pageHomography(layout, w, h, hopts);
  const img = renderSheet(layout, H, w, h, ropts);
  return { H, gray: toGray(img) };
}

const TL_TR_BR_BL = [0, 1, 2, 3];

export default [
  {
    name: "4 penanda dikesan pada kertas lurus (800x1130), ralat pusat <= 1 px",
    fn() {
      const { H, gray } = sheet(800, 1130, {}, { fills: allFilled(layout), idCode: "1234" });
      expectCorners(findMarkers(gray), H, TL_TR_BR_BL, 1.0, "lurus");
    },
  },
  {
    name: "putaran 8 darjah dan perspektif",
    fn() {
      const { H, gray } = sheet(800, 1130, { rotDeg: 8, skewX: 30, skewY: 20, margin: 0.1 }, { fills: allFilled(layout), noise: 4 });
      expectCorners(findMarkers(gray), H, TL_TR_BR_BL, 1.5, "putar+perspektif");
    },
  },
  {
    name: "imej besar 1600x2263 diskala ke resolusi pengesanan; sudut dalam piksel imej input",
    fn() {
      const { H, gray } = sheet(1600, 2263, { rotDeg: -5, margin: 0.05 }, { fills: allFilled(layout), idCode: "0987", noise: 3 });
      expectCorners(findMarkers(gray), H, TL_TR_BR_BL, 2.0, "besar");
    },
  },
  {
    name: "kertas terbalik 180: sudut dipulangkan mengikut kedudukan imej (TL imej = penanda BR kertas)",
    fn() {
      const { H, gray } = sheet(800, 1130, { flip180: true, rotDeg: 3 }, { fills: allFilled(layout) });
      expectCorners(findMarkers(gray), H, [2, 3, 0, 1], 1.5, "terbalik");
    },
  },
  {
    name: "kecerunan cahaya 0.6 dan hingar tidak menghalang pengesanan",
    fn() {
      const { H, gray } = sheet(800, 1130, { rotDeg: 4 }, { fills: allFilled(layout), light: 0.6, noise: 8 });
      expectCorners(findMarkers(gray), H, TL_TR_BR_BL, 1.5, "cahaya");
    },
  },
  {
    name: "bulatan jawapan yang dihitamkan tidak disalah anggap sebagai penanda",
    fn() {
      const fills = {};
      for (const q of layout.questions) fills[q.q] = q.bubbles.map((b) => ({ choice: b.choice, dark: 1 }));
      const { H, gray } = sheet(800, 1130, {}, { fills, idCode: "9999" });
      expectCorners(findMarkers(gray), H, TL_TR_BR_BL, 1.0, "semua hitam");
    },
  },
  {
    name: "hanya 3 penanda -> NO_MARKERS",
    fn() {
      const { gray } = sheet(800, 1130, {}, { fills: allFilled(layout), skipMarkers: ["BL"] });
      const r = findMarkers(gray);
      assertEqual(r.ok, false);
      assertEqual(r.error, "NO_MARKERS");
      assertEqual(r.corners, null);
    },
  },
  {
    name: "kertas kosong, latar seragam dan hingar rawak -> NO_MARKERS",
    fn() {
      assertEqual(findMarkers(grayImage(800, 1130, 240)).error, "NO_MARKERS");
      const noise = grayImage(800, 1130, 128);
      let s = 12345;
      for (let i = 0; i < noise.data.length; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        noise.data[i] = s >>> 24;
      }
      const r = findMarkers(noise);
      assertEqual(r.ok, false);
      assert(r.error === "NO_MARKERS" || r.error === "BAD_GEOMETRY", `ralat ${r.error}`);
    },
  },
  {
    name: "empat bintik kecil sama saiz dalam kuadrilateral < 15% imej -> BAD_GEOMETRY",
    fn() {
      const g = grayImage(800, 600, 240);
      for (const [x, y] of [[300, 200], [500, 200], [500, 400], [300, 400]]) fillRect(g, x - 4, y - 4, x + 4, y + 4, 10);
      const r = findMarkers(g);
      assertEqual(r.ok, false);
      assertEqual(r.error, "BAD_GEOMETRY");
    },
  },
  {
    name: "empat segi empat tidak berkaitan saiz fizikal penanda ditolak (bukan penanda)",
    fn() {
      // blob hampir menjadi satu kuadrilateral besar tetapi terlalu besar untuk 8 mm pada skala itu
      const g = grayImage(800, 1130, 240);
      for (const [x, y] of [[60, 60], [740, 60], [740, 1070], [60, 1070]]) fillRect(g, x - 30, y - 30, x + 30, y + 30, 10);
      const r = findMarkers(g);
      assertEqual(r.ok, false, "blob 60 px pada skala ~3.6 px/mm bukan penanda 8 mm");
    },
  },
  {
    name: "calon dipulangkan untuk diagnostik",
    fn() {
      const { gray } = sheet(800, 1130, {}, {});
      const r = findMarkers(gray);
      assert(r.candidates >= 4, `calon ${r.candidates}`);
    },
  },
];
