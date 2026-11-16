// js/omr/homography.js (PLAN 4.2).
import { assert, assertEqual, assertClose } from "./harness.js";
import { computeHomography, applyHomography, invertHomography } from "../js/omr/homography.js";

const SQ = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const A4 = [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 297 }, { x: 0, y: 297 }];
const PERSP = [{ x: 120, y: 80 }, { x: 900, y: 150 }, { x: 860, y: 1300 }, { x: 60, y: 1200 }];

export default [
  {
    name: "identiti: titik sama dipetakan kepada diri sendiri, h[8] = 1",
    fn() {
      const H = computeHomography(SQ, SQ);
      assertEqual(H.length, 9);
      assertClose(H[8], 1, 1e-12);
      for (const p of [{ x: 0.3, y: 0.7 }, { x: 5, y: -2 }]) {
        const q = applyHomography(H, p.x, p.y);
        assertClose(q.x, p.x, 1e-9);
        assertClose(q.y, p.y, 1e-9);
      }
    },
  },
  {
    name: "skala + anjakan: A4 mm -> piksel dipetakan tepat",
    fn() {
      const dst = A4.map((p) => ({ x: 100 + p.x * 4, y: 50 + p.y * 4 }));
      const H = computeHomography(A4, dst);
      const m = applyHomography(H, 105, 148.5);
      assertClose(m.x, 100 + 105 * 4, 1e-6);
      assertClose(m.y, 50 + 148.5 * 4, 1e-6);
    },
  },
  {
    name: "perspektif: empat sudut dipetakan tepat; garis lurus kekal lurus",
    fn() {
      const H = computeHomography(A4, PERSP);
      A4.forEach((p, i) => {
        const q = applyHomography(H, p.x, p.y);
        assertClose(q.x, PERSP[i].x, 1e-6, `x${i}`);
        assertClose(q.y, PERSP[i].y, 1e-6, `y${i}`);
      });
      const top = applyHomography(H, 105, 0);
      const cross = (PERSP[1].x - PERSP[0].x) * (top.y - PERSP[0].y) - (PERSP[1].y - PERSP[0].y) * (top.x - PERSP[0].x);
      assertClose(cross, 0, 1e-3);
    },
  },
  {
    name: "invertHomography: H^-1 (H p) = p",
    fn() {
      const H = computeHomography(A4, PERSP);
      const Hi = invertHomography(H);
      assert(Hi, "songsang null");
      for (const p of [{ x: 14, y: 14 }, { x: 144, y: 87.5 }, { x: 196, y: 283 }]) {
        const f = applyHomography(H, p.x, p.y);
        const b = applyHomography(Hi, f.x, f.y);
        assertClose(b.x, p.x, 1e-6);
        assertClose(b.y, p.y, 1e-6);
      }
    },
  },
  {
    name: "tunggal: empat titik segaris -> null; input tidak sah -> null",
    fn() {
      const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
      assertEqual(computeHomography(line, SQ), null);
      assertEqual(computeHomography(SQ, line), null);
      assertEqual(computeHomography(SQ.slice(0, 3), SQ), null);
      assertEqual(computeHomography(null, SQ), null);
      assertEqual(invertHomography([1, 2, 3, 2, 4, 6, 3, 6, 9]), null);
    },
  },
  {
    name: "ketepatan berangka pada skala piksel besar (3024x4032)",
    fn() {
      const dst = [{ x: 210.5, y: 305.25 }, { x: 2800.1, y: 340.7 }, { x: 2760.9, y: 3800.3 }, { x: 180.2, y: 3750.8 }];
      const H = computeHomography(A4, dst);
      A4.forEach((p, i) => {
        const q = applyHomography(H, p.x, p.y);
        assertClose(q.x, dst[i].x, 1e-4);
        assertClose(q.y, dst[i].y, 1e-4);
      });
    },
  },
];
