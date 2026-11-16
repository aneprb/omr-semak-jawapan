// js/omr/components.js
import { assert, assertEqual, assertClose } from "./harness.js";
import { labelComponents } from "../js/omr/components.js";

function bin(w, h) {
  return { width: w, height: h, data: new Uint8Array(w * h) };
}
function rect(b, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b.data[y * b.width + x] = 1;
}

export default [
  {
    name: "dua segi empat terpisah -> 2 komponen dengan luas, kotak sempadan dan pusat betul",
    fn() {
      const b = bin(60, 40);
      rect(b, 5, 5, 15, 15); // 10x10
      rect(b, 30, 10, 50, 20); // 20x10
      const c = labelComponents(b);
      assertEqual(c.length, 2);
      const a = c[0];
      assertEqual(a.area, 100);
      assertEqual([a.minX, a.minY, a.maxX, a.maxY], [5, 5, 14, 14]);
      assertClose(a.cx, 9.5, 1e-9);
      assertClose(a.cy, 9.5, 1e-9);
      assertClose(a.fill, 1, 1e-9);
      assertClose(a.eig1 / a.eig2, 1, 1e-6, "segi empat sama isotropik");
      const r = c[1];
      assertEqual(r.area, 200);
      assert(r.eig1 / r.eig2 > 3, "segi empat panjang tidak isotropik");
    },
  },
  {
    name: "8-ketersambungan: piksel pepenjuru bergabung",
    fn() {
      const b = bin(6, 6);
      b.data[0] = 1;
      b.data[1 * 6 + 1] = 1;
      b.data[2 * 6 + 2] = 1;
      b.data[5 * 6 + 5] = 1;
      const c = labelComponents(b);
      assertEqual(c.length, 2);
      assertEqual(c[0].area, 3);
      assertEqual(c[1].area, 1);
    },
  },
  {
    name: "cakera: fill ~ pi/4 dan isotropik",
    fn() {
      const b = bin(100, 100);
      for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) if ((x - 50) ** 2 + (y - 50) ** 2 <= 30 * 30) b.data[y * 100 + x] = 1;
      const [c] = labelComponents(b);
      assertClose(c.fill, Math.PI / 4, 0.04);
      assertClose(c.cx, 50, 0.05);
      assertClose(c.eig1 / c.eig2, 1, 0.02);
    },
  },
  {
    name: "gelung (cincin) ialah satu komponen dengan fill rendah",
    fn() {
      const b = bin(60, 60);
      rect(b, 10, 10, 50, 50);
      rect(b, 15, 15, 45, 45);
      for (let y = 15; y < 45; y++) for (let x = 15; x < 45; x++) b.data[y * 60 + x] = 0;
      const c = labelComponents(b);
      assertEqual(c.length, 1);
      assert(c[0].fill < 0.6, `fill ${c[0].fill}`);
    },
  },
  {
    name: "imej besar satu komponen ular tidak menyebabkan limpahan tindanan (tiada rekursi)",
    fn() {
      const w = 800;
      const h = 800;
      const b = bin(w, h);
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x++) b.data[y * w + x] = 1;
        if (y + 1 < h) b.data[(y + 1) * w + (((y / 2) % 2) ? 0 : w - 1)] = 1;
      }
      const c = labelComponents(b);
      assertEqual(c.length, 1);
      assertEqual(c[0].area, 400 * 800 + 400);
    },
  },
  {
    name: "pilihan minArea/maxArea menapis; imej kosong -> []",
    fn() {
      const b = bin(30, 30);
      rect(b, 0, 0, 2, 2);
      rect(b, 10, 10, 20, 20);
      assertEqual(labelComponents(b).length, 2);
      assertEqual(labelComponents(b, { minArea: 10 }).length, 1);
      assertEqual(labelComponents(b, { maxArea: 10 }).length, 1);
      assertEqual(labelComponents(bin(10, 10)).length, 0);
    },
  },
];
