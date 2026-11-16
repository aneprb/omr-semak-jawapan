// SPEC 1.2: SVG templat sepadan dengan Layout (toleransi 0.01 mm) untuk pelbagai konfigurasi.
import { assert, assertEqual, assertClose } from "./harness.js";
import { buildLayout } from "../js/omr/layout.js";
import { renderSheetSvg } from "../js/template/render-sheet.js";

const TOL = 0.01;

function checkConfig(config) {
  const layout = buildLayout(config);
  const svg = renderSheetSvg(layout, { title: "Ujian Sintetik", schoolName: "SMK Contoh", testName: "Ujian Sintetik" });
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  assert(!doc.querySelector("parsererror"), `SVG tidak sah ${layout.code}`);
  const root = doc.documentElement;
  assertEqual(root.getAttribute("viewBox"), "0 0 210 297");
  assertEqual(root.getAttribute("width"), "210mm");
  assertEqual(root.getAttribute("height"), "297mm");

  const circles = [...doc.querySelectorAll("circle")].map((c) => ({
    cx: +c.getAttribute("cx"), cy: +c.getAttribute("cy"), r: +c.getAttribute("r"), used: false,
  }));
  const bubbles = layout.questions.flatMap((q) => q.bubbles);
  if (layout.idBlock) for (const d of layout.idBlock.digits) bubbles.push(...d.bubbles);
  assertEqual(circles.length, bubbles.length, `${layout.code}: bilangan bulatan`);
  for (const b of bubbles) {
    const c = circles.find((k) => !k.used && Math.abs(k.cx - b.cx) <= TOL && Math.abs(k.cy - b.cy) <= TOL);
    assert(c, `${layout.code}: bulatan (${b.cx},${b.cy}) tiada dalam SVG`);
    c.used = true;
    assertClose(c.r, b.r, TOL, "jejari");
  }

  const rects = [...doc.querySelectorAll("rect")].map((r) => ({
    x: +r.getAttribute("x"), y: +r.getAttribute("y"), w: +r.getAttribute("width"), h: +r.getAttribute("height"), fill: r.getAttribute("fill"),
  }));
  for (const m of layout.markers) {
    const r = rects.find((k) => k.fill === "#000" && Math.abs(k.x - (m.cx - m.size / 2)) <= TOL && Math.abs(k.y - (m.cy - m.size / 2)) <= TOL);
    assert(r, `${layout.code}: penanda ${m.id} tiada`);
    assertClose(r.w, m.size, TOL);
    assertClose(r.h, m.size, TOL);
  }
  const ob = layout.orientationBar;
  const bar = rects.find((k) => k.fill === "#000" && Math.abs(k.x - ob.x) <= TOL && Math.abs(k.y - ob.y) <= TOL);
  assert(bar, `${layout.code}: bar orientasi tiada`);
  assertClose(bar.w, ob.w, TOL);
  assertClose(bar.h, ob.h, TOL);
  if (layout.idBlock) {
    for (const wb of layout.idBlock.writeBoxes) {
      assert(rects.some((k) => Math.abs(k.x - wb.x) <= TOL && Math.abs(k.y - wb.y) <= TOL && Math.abs(k.w - wb.w) <= TOL), `${layout.code}: kotak tulis`);
    }
  }
  const text = doc.documentElement.textContent;
  assert(text.includes(layout.code), `${layout.code}: kod susun atur tiada pada kertas`);
  assert(text.includes("Ujian Sintetik"), "tajuk tiada");
  for (const t of ["Nama", "Kelas", "Tarikh"]) assert(text.includes(t), `ruang ${t} tiada`);
  for (const c of layout.choices) assert(text.includes(c), `huruf ${c} tiada`);
}

const cases = [];
for (const n of [10, 20, 21, 40, 41, 60]) {
  for (const c of [4, 5]) {
    for (const d of [0, 3, 6]) {
      cases.push({ name: `SVG sepadan Layout ${n}/${c}/${d} (SPEC 1.2)`, fn: () => checkConfig({ numQuestions: n, numChoices: c, idDigits: d }) });
    }
  }
}
cases.push({
  name: "teks pengguna dilepaskan (XML escape) dalam SVG",
  fn() {
    const layout = buildLayout({ numQuestions: 10, numChoices: 4, idDigits: 0 });
    const svg = renderSheetSvg(layout, { title: "<script>x</script> & \"q\"", testName: "<b>T</b>", schoolName: "A&B" });
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    assert(!doc.querySelector("parsererror"), "SVG rosak dengan teks khas");
    assertEqual(doc.querySelectorAll("script, b").length, 0);
  },
});
export default cases;
