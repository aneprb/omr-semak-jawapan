// js/omr/threshold.js dan js/omr/image.js
import { assert, assertEqual, assertClose } from "./harness.js";
import { integralImage, adaptiveThreshold } from "../js/omr/threshold.js";
import { downscale, toGray, bilinear } from "../js/omr/image.js";
import { grayImage, fillRect } from "./synth.js";

function count(bin) {
  let n = 0;
  for (let i = 0; i < bin.data.length; i++) n += bin.data[i];
  return n;
}

export default [
  {
    name: "integralImage: jumlah kotak betul, saiz (w+1)*(h+1)",
    fn() {
      const gray = { width: 3, height: 2, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6]) };
      const I = integralImage(gray);
      assertEqual(I.length, 4 * 3);
      assertEqual(I[2 * 4 + 3], 21, "jumlah penuh");
      assertEqual(I[1 * 4 + 3], 6, "baris pertama");
      assertEqual(I[2 * 4 + 1], 5, "lajur pertama");
    },
  },
  {
    name: "adaptiveThreshold: latar seragam tiada dakwat",
    fn() {
      const bin = adaptiveThreshold(grayImage(120, 100, 180), { window: 31, c: 7 });
      assertEqual(count(bin), 0);
    },
  },
  {
    name: "adaptiveThreshold: segi empat hitam penuh (tiada lubang) apabila tetingkap > saiz penanda",
    fn() {
      const g = grayImage(400, 300, 230);
      fillRect(g, 100, 100, 130, 130, 10); // penanda 30 px
      const bin = adaptiveThreshold(g, { window: 63, c: 7 });
      let inside = 0;
      for (let y = 100; y < 130; y++) for (let x = 100; x < 130; x++) inside += bin.data[y * 400 + x];
      assertEqual(inside, 900, "semua piksel penanda ialah dakwat");
      assertEqual(count(bin), 900, "tiada dakwat di luar penanda");
    },
  },
  {
    name: "adaptiveThreshold: tetingkap lebih kecil daripada penanda menghasilkan lubang (sebab 1/8)",
    fn() {
      const g = grayImage(400, 300, 230);
      fillRect(g, 100, 100, 160, 160, 10); // 60 px
      const bin = adaptiveThreshold(g, { window: 21, c: 7 });
      assertEqual(bin.data[130 * 400 + 130], 0, "pusat penanda besar hilang dengan tetingkap kecil");
    },
  },
  {
    name: "adaptiveThreshold: tahan kecerunan cahaya",
    fn() {
      const g = grayImage(400, 300, 0);
      for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x++) g.data[y * 400 + x] = 120 + (x / 400) * 130;
      fillRect(g, 300, 100, 330, 130, 20);
      fillRect(g, 40, 100, 70, 130, 20);
      const bin = adaptiveThreshold(g, { window: 63, c: 7 });
      assertEqual(count(bin), 1800, "hanya dua penanda");
    },
  },
  {
    name: "adaptiveThreshold: menghormati sempadan imej (tetingkap dipotong)",
    fn() {
      const g = grayImage(50, 50, 200);
      fillRect(g, 0, 0, 10, 10, 0);
      const bin = adaptiveThreshold(g, { window: 41, c: 7 });
      assertEqual(bin.data[0], 1);
      assertEqual(bin.data[49 * 50 + 49], 0);
    },
  },
  {
    name: "toGray: Y = (77R+150G+29B)>>8",
    fn() {
      const img = { width: 2, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 255]) };
      const g = toGray(img);
      assertEqual(g.data[0], (77 * 255 + 150 * 255 + 29 * 255) >> 8);
      assertEqual(g.data[1], (77 * 255) >> 8);
    },
  },
  {
    name: "downscale: sisi terpanjang <= maxSide, purata kotak, imej kecil dikembalikan sama",
    fn() {
      const w = 400;
      const h = 200;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const v = (i % w) < 200 ? 0 : 200;
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
      }
      const img = { width: w, height: h, data };
      assert(downscale(img, 500) === img, "tidak diubah jika sudah kecil");
      const d = downscale(img, 100);
      assertEqual(d.width, 100);
      assertEqual(d.height, 50);
      assertEqual(d.data[(10 * 100 + 10) * 4], 0);
      assertEqual(d.data[(10 * 100 + 80) * 4], 200);
      assertEqual(d.data[3], 255);
    },
  },
  {
    name: "bilinear: interpolasi dan luar imej -> 255",
    fn() {
      const g = { width: 2, height: 2, data: new Uint8ClampedArray([0, 100, 100, 200]) };
      assertClose(bilinear(g, 0, 0), 0, 1e-9);
      assertClose(bilinear(g, 0.5, 0), 50, 1e-9);
      assertClose(bilinear(g, 0.5, 0.5), 100, 1e-9);
      assertClose(bilinear(g, 1, 1), 200, 1e-9);
      assertEqual(bilinear(g, -0.1, 0), 255);
      assertEqual(bilinear(g, 0, 1.5), 255);
    },
  },
];
