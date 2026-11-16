// Muat naik pukal (js/ui/views/bulk.js): nama murid daripada nama fail, padanan senarai nama.
import { assertEqual } from "./harness.js";
import { nameFromFile, matchRoster } from "../js/ui/views/bulk.js";
import { ROUTES } from "../js/app.js";

export default [
  {
    name: "nama fail -> nama murid",
    fn() {
      assertEqual(nameFromFile("Ahmad_bin_Ali.jpg"), "Ahmad bin Ali");
      assertEqual(nameFromFile("01_Ahmad bin Ali.JPG"), "Ahmad bin Ali");
      assertEqual(nameFromFile("3 - Siti Aminah.png"), "Siti Aminah");
      assertEqual(nameFromFile("Nur-Aisyah binti Omar.jpeg"), "Nur-Aisyah binti Omar");
      assertEqual(nameFromFile("  Lim   Wei Jie .heic"), "Lim Wei Jie");
    },
  },
  {
    name: "nama fail kamera / aplikasi mesej -> kosong (guru isi sendiri)",
    fn() {
      for (const f of ["IMG_20261116_0815.jpg", "PXL_20261116_081500123.jpg", "DSC0001.JPG", "WhatsApp Image 2026-11-16 at 08.15.00.jpeg", "Screenshot_20261116.png", "20261116_081500.jpg"]) {
        assertEqual(nameFromFile(f), "", f);
      }
    },
  },
  {
    name: "padanan senarai nama: nama atau kod, abaikan huruf besar/tanda baca",
    fn() {
      const roster = [{ code: "101", name: "Siti Aminah" }, { code: "A7", name: "Nur-Aisyah binti Omar" }];
      assertEqual(matchRoster(roster, "siti  aminah")?.code, "101");
      assertEqual(matchRoster(roster, "Nur Aisyah Binti Omar")?.code, "A7");
      assertEqual(matchRoster(roster, "101")?.name, "Siti Aminah");
      assertEqual(matchRoster(roster, "Ahmad"), null);
      assertEqual(matchRoster(roster, ""), null);
    },
  },
  {
    name: "laluan #/ujian/:id/pukal didaftarkan",
    fn() {
      assertEqual(ROUTES.some((r) => r.pattern === "/ujian/:id/pukal" && r.view === "bulk"), true);
    },
  },
];
