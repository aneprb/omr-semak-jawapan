// Ukuran ketepatan untuk laporan (docs/LAPORAN-UJIAN.md). Tidak menegaskan ambang baharu;
// ambang SPEC 3.4-3.6/3.11 ditegaskan dalam scan-synthetic.test.js. Angka dicetak sebagai baris NOTE.
import { assert, note, skip } from "./harness.js";
import { evaluate } from "./scan-synthetic.test.js";

const pct = (v) => (v * 100).toFixed(2) + "%";

export default [
  {
    name: "ukuran: set clean / distorted / blank / key (angka dalam NOTE)",
    async fn() {
      let any = false;
      for (const profile of ["clean", "distorted", "distorted2", "blank", "key"]) {
        const m = await evaluate(profile);
        if (!m) continue;
        any = true;
        note(
          `${profile} [${m.source}] kertas=${m.papers} ok=${m.ok} (${pct(m.okRate)}) ketepatanBulatan=${pct(m.accuracy)} ` +
            `positifPalsuOK=${m.falseOk}/${m.expectedBlankMulti} (${pct(m.expectedBlankMulti ? m.falseOk / m.expectedBlankMulti : 0)} daripada kosong/berganda; ${pct(m.falseOkRate)} semua soalan) ` +
            `UNCERTAIN=${m.uncertain} ID=${m.idCorrect}/${m.idTotal} orientasiSalah=${m.rotatedWrong}/${m.rotatedChecked} ` +
            `masaPurata=${m.msMean.toFixed(0)}ms masaMaks=${m.msMax.toFixed(0)}ms ralat=${JSON.stringify(m.errors)} ` +
            `ralatSudutPurata=${m.cornerN ? (m.cornerErrSum / m.cornerN).toFixed(2) : "-"}px maks=${m.cornerErrMax.toFixed(2)}px`,
        );
        if (m.badFiles.length) note(`  ${profile} gagal: ${m.badFiles.slice(0, 8).join(", ")}`);
        if (m.wrongDetail.length) note(`  ${profile} salah baca: ${m.wrongDetail.slice(0, 4).join(" | ")}`);
      }
      if (!any) skip("tiada fixture");
      assert(true);
    },
  },
];
