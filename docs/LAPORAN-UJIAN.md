# Laporan Ujian: OMR Semak Jawapan

Tarikh larian: 2026-11-16. Persekitaran: Edge headless (`python tools/run_tests.py`, tanpa bendera), Windows 11, data sintetik sahaja.
Keputusan larian terakhir (dijalankan dua kali berturut-turut, kedua-duanya sama): **PASS 149 / FAIL 0 / SKIP 0**.

## 1. Cara menjalankan semula

```bat
python -m pip install --user -r tools\requirements.txt
python tools\omr_layout.py --golden tests\fixtures\layouts
python tools\gen_sheets.py --profile clean     --count 40  --seed 1  --out tests\fixtures\sheets\generated\clean
python tools\gen_sheets.py --profile distorted --count 60  --seed 2  --out tests\fixtures\sheets\generated\distorted
python tools\gen_sheets.py --profile distorted --count 150 --seed 99 --out tests\fixtures\sheets\generated\distorted2
python tools\gen_sheets.py --profile blank     --count 10  --seed 3  --out tests\fixtures\sheets\generated\blank
python tools\gen_sheets.py --profile key       --count 4   --seed 4  --out tests\fixtures\sheets\generated\key
python tools\run_tests.py            :: ringkasan + baris NOTE (angka ukuran)
python tools\run_tests.py --only flow,template --verbose
```

`run_tests.py` menerima laporan melalui `POST /__report` (bukan `--dump-dom`), kerana `--virtual-time-budget` memotong ujian IndexedDB secara rawak. Had masa lalai 600 s. Mod lama: `--dump-dom --budget 600000`.

## 2. Kriteria penerimaan SPEC

| Kriteria | Jenis | Ujian | Status |
|---|---|---|---|
| 1.1 buildLayout menolak julat tidak sah (`LAYOUT_INVALID`) | U | layout.test.js: validateLayoutConfig, buildLayout melempar LAYOUT_INVALID | LULUS |
| 1.2 SVG templat = Layout (0.01 mm) | U | template.test.js: 36 konfigurasi (10/20/21/40/41/60 x 4/5 x 0/3/6 digit): bulatan, penanda, bar, kotak tulis, kod, Nama/Kelas/Tarikh, XML escape | LULUS |
| 1.3 JS = fixture emas Python (4 konfigurasi) | U | layout.test.js: Q10-C4-ID0, Q20-C5-ID4, Q40-C5-ID6, Q60-C4-ID2 | LULUS |
| 1.4 Cetakan Chrome A4 satu halaman | M | Senarai semak M1 | MANUAL |
| 1.5 Nombor soalan ikut lajur, huruf kepala lajur | M (sebahagian U) | Penomboran/kepala lajur disahkan dalam template.test.js dan layout.test.js; cetakan sebenar M1 | LULUS (U) / MANUAL (cetak) |
| 2.1 Cipta ujian, kekal selepas muat semula | M/U | backup.test.js (simpan/baca IndexedDB), flow.test.js (saveTest -> paparan) | LULUS (U) / MANUAL (muat semula UI) |
| 2.2 Skrin skema ketik A-E, Seterusnya, x/N | M | Senarai semak M5 | MANUAL |
| 2.3 Skema ditampal sebagai teks | U | grade.test.js: parseKeyText (bersambung, berpemisah, bernombor, huruf luar julat, bilangan salah) | LULUS |
| 2.4 Imbas kertas skema | M | Senarai semak M6 (enjin: set profil `key` ok 4/4, ketepatan 100%) | MANUAL |
| 2.5 Tidak boleh imbas sebelum skema lengkap; ubah skema -> kira semula | U | flow.test.js: paparan imbas menolak skema tidak lengkap, butang imbas aria-disabled; grade.test.js: regradeAll | LULUS |
| 2.6 Susun atur dikunci selepas ada keputusan | M | Senarai semak M5 | MANUAL |
| 3.1 Kamera langsung | M | Senarai semak M3 | MANUAL |
| 3.2 Tangkap auto 3 bingkai stabil, anjakan < 2% | U | autocapture.test.js (5 ujian: 3 stabil, 2 stabil, anjakan 0.6% vs 12%, BAD_GEOMETRY, ralat detect) | LULUS |
| 3.3 Sandaran ambil foto | M | Senarai semak M4 (`pickPhoto` ada; `fileToImageData` melalui fixture dalam flow.test.js menggunakan `loadImageData`) | MANUAL |
| 3.4 Set clean: 100% ok, ketepatan >= 99.5% | U | scan-synthetic.test.js. Ukuran: 40 kertas, ok 100%, ketepatan 100.00% | LULUS |
| 3.5 Set herot: >= 95% ok, ketepatan >= 98%, positif palsu < 0.5% | U | scan-synthetic.test.js. Ukuran: 60 kertas ok 100%, 100.00%; 150 kertas (benih lain) ok 100%, 100.00%; positif palsu 0/110 dan 0/325 | LULUS |
| 3.6 Tanpa penanda -> NO_MARKERS <= 2 s | U | scan-synthetic.test.js. Ukuran: 10/10 NO_MARKERS (kosong, gambar rawak, 3 penanda); masa maks 34 ms | LULUS |
| 3.7 Skrin hasil: markah, %, overlay hijau/merah/kuning | M (sebahagian U) | flow.test.js: markah `X/N` dalam paparan semak; warna overlay M7 | LULUS (markah) / MANUAL (overlay) |
| 3.8 Pembetulan manual, markah dikira semula, `manualEdits` | M (U ditambah) | flow.test.js: ubah soalan 1 -> markah berubah, `manualEdits == [1]` | LULUS |
| 3.9 Identiti dari bulatan ID, padan roster, keratan nama | M (sebahagian U) | flow.test.js: kod ID dibaca, nama dari roster; ID dibaca betul 30/30, 45/45, 112/112; keratan nama M7 | LULUS (U) / MANUAL (keratan) |
| 3.10 Kod pendua: Ganti / Simpan sebagai baharu | U | flow.test.js: amaran menyebut kod; "Simpan sebagai baharu" -> 2 keputusan; "Ganti" -> kekal 2 selepas penggantian | LULUS |
| 3.11 scanImage 1600x2263 <= 1.5 s, dalam Worker | U | scan-synthetic.test.js: 1600x2263 dan 3024x4032 <= 1500 ms; client.js melalui Worker sama dengan panggilan terus. Ukuran purata kertas sintetik ~30 ms | LULUS (laptop ini); ulang pada telefon: M9 |
| 4.1 Senarai keputusan, isih, padam | M (sebahagian U) | flow.test.js: jadual keputusan 1 baris, markah dan nama betul; isih/padam M8 | LULUS (jadual) / MANUAL |
| 4.2 Statistik | U | stats.test.js | LULUS |
| 4.3 Analisis item | U | items.test.js | LULUS |
| 4.4 Paparan analisis diisih/diserlahkan | M | Senarai semak M8 | MANUAL |
| 5.1 CSV keputusan (BOM, CRLF, RFC 4180, lajur) | U | csv.test.js; flow.test.js: eksport sebenar dari paparan Keputusan (BOM EF BB BF, CRLF, lajur Bil..Peratus, S1..Sn, nama fail `keputusan-<slug>-YYYYMMDD.csv`); buka dalam Excel M10 | LULUS (U) / MANUAL (Excel) |
| 5.2 CSV analisis item | U | csv.test.js: itemsToRows | LULUS |
| 5.3 Peneutralan `= + - @` | U | csv.test.js; flow.test.js (kod `=1+1` -> `'=1+1`) | LULUS |
| 5.4 Sandaran export -> clear -> import; tolak fail tidak sah; merge/replace | U | backup.test.js (11 ujian) | LULUS |
| 6.1 manifest sah, Installable | M (sebahagian U) | precache.test.js: medan manifest wajib; Lighthouse M11 | LULUS (medan) / MANUAL |
| 6.2 Luar talian penuh | M | Senarai semak M11 | MANUAL |
| 6.3 Pra-cache = inventori aset | U | precache.test.js (versi, senarai = assets.json, tiada tests/tools/docs, setiap aset HTTP 200) | LULUS |
| 6.4 Banner versi baharu | M | Senarai semak M11 | MANUAL |
| 7.1 Semua teks dalam `strings.ms.js` | semak kod | Belum disemak oleh penguji dan belum ada ujian automatik | MANUAL (penyemak R4) |
| 7.2 Tiada rangkaian pihak ketiga | semak kod | grep `https?://` dalam `js/`, `css/`, `index.html`, `sw.js`, `manifest.json`: hanya `http://www.w3.org/2000/svg` (ruang nama XML, bukan permintaan) | LULUS |
| 7.3 Tiada `console.log` data pelajar | semak kod | grep `console\.` dalam `js/`: hanya `util/log.js` (`console.debug`/`console.warn`, aktif jika `omrDebug=1`, mesej teknikal) | LULUS |
| 7.4 Skrin 360x640, sentuh >= 44 px, kontras AA | M | Senarai semak M12 | MANUAL |
| 7.5 Pelayar sasaran | M | Senarai semak M3, M4 (Edge desktop diuji automatik) | MANUAL |

Tambahan di luar SPEC: homography.test.js (6 ujian: identiti, skala, perspektif, songsangan, tunggal/tidak sah, ketepatan skala besar); kertas terbalik 180, foto 12 MP, LOW_CONTRAST, `projectLayout`, `detectMarkers`, Worker (scan-synthetic.test.js).

## 3. Angka ketepatan (set sintetik, benih tetap)

| Set | Kertas | `ok` | Ketepatan bulatan | OK palsu (kosong/berganda dibaca OK) | ID betul | Orientasi 180 salah | Ralat sudut purata / maks | Masa purata / maks |
|---|---|---|---|---|---|---|---|---|
| clean | 40 | 40 (100%) | 100.00% | 0 / 95 | 30/30 | 0/40 | - | 31 / 34 ms |
| distorted (benih 2) | 60 | 60 (100%) | 100.00% | 0 / 110 | 45/45 | 0/60 | 0.72 px / 2.14 px | 29 / 46 ms |
| distorted2 (benih 99) | 150 | 150 (100%) | 100.00% | 0 / 325 | 112/112 | 0/150 | 0.78 px / 2.91 px | 28 / 47 ms |
| blank | 10 | 0, NO_MARKERS 10/10 | - | - | - | - | - | 31 / 34 ms |
| key | 4 | 4 (100%) | 100.00% | - | - | 0/4 | - | 30 / 31 ms |

Semua melepasi sasaran SPEC 3.4 (>= 99.5%), 3.5 (>= 95% `ok`, >= 98%, < 0.5%), 3.6 dan 3.11. Penjelasan:
- Tanda ringan (40-60% kepekatan) dibaca dengan pilihan betul tetapi sebahagian ditanda `UNCERTAIN` (29, 28, 88 soalan); ini tingkah laku dikehendaki (guru menyemak).
- Angka 100% menunjukkan set sintetik **lebih mudah daripada dunia sebenar** (pensel pudar, bayang, kertas berkedut, fotostat). Ia membuktikan geometri dan algoritma betul, bukan ketepatan di lapangan. Ujian manual M2-M3 perlu untuk itu.
- Masa diukur dalam Edge headless pada laptop ini; Android bajet dijangka jauh lebih perlahan, sebab itu M9 diperlukan.

## 4. Pepijat dijumpai

- `tools/run_tests.py` (alat ujian): mod `--dump-dom` + `--virtual-time-budget` memotong ujian IndexedDB secara rawak (ringkasan "sedang berjalan..."). Dibetulkan dengan pelaporan melalui POST dan tamat masa 600 s.
- `tests/autocapture.test.js` (ujian sendiri): jujukan ujian berakhir pada bingkai yang berulang sehingga menjadi stabil; dibetulkan dengan menambah `none` di hujung. Bukan pepijat app.
- Tiada pepijat ditemui dalam `js/` melalui ujian baharu (homography, template, autocapture, flow, metrics).

## 5. Senarai semak manual untuk pemilik (M)

Gunakan data sintetik sahaja: nama pada kertas "Pelajar Ujian 1..n".

- [ ] **M1 Cetak sebenar (1.4, 1.5)**: Buka `#/ujian/<id>/templat`, "Cetak / Simpan PDF" dalam Chrome, A4, margin **Tiada**, skala 100%. Satu halaman sahaja; empat penanda hitam penuh; ruang Nama, Kelas, Tarikh, kod susun atur, tajuk kelihatan; soalan bernombor ikut lajur. Cuba juga "Fit to page" dan fotostat.
- [ ] **M2 Isi dan imbas kertas sebenar**: isi dengan pensel 2B ~60% hitam (bukan penuh); termasuk satu kosong, satu berganda, satu tanda ringan. Imbas, bandingkan markah dengan kiraan tangan.
- [ ] **M3 Kamera langsung (3.1, 7.5)**: `start.bat` lalu buka `http://localhost:8000/` pada laptop berkamera (atau HTTPS jika dihoskan). Status berubah "Cari penanda" -> "4 penanda dikesan, tahan"; tangkap auto berlaku sendiri; butang tangkap manual berfungsi.
- [ ] **M4 Telefon (3.3, 7.5)**: `start-lan.bat`, buka `http://<IP-laptop>:8000/` pada telefon Android (Chrome) dan iPhone (Safari). Tanpa HTTPS, hanya sandaran "Ambil foto / Pilih gambar" tersedia. Ambil foto kertas, hasil imbasan betul.
- [ ] **M5 Skema dan kunci susun atur (2.2, 2.6)**: ketik jawapan, "Seterusnya" bergerak, penunjuk x/N; selepas ada keputusan, susun atur tidak boleh diubah; "Duplikasi ujian" berfungsi; tampal skema dan ubah skema lalu semua markah dikira semula (dengan pengesahan).
- [ ] **M6 Imbas kertas skema (2.4)**: imbas kertas yang dihitamkan guru; soalan kosong/berganda ditanda dan mesti diselesaikan sebelum simpan.
- [ ] **M7 Skrin hasil (3.7, 3.9)**: overlay hijau/merah/kuning disertai simbol (bukan warna sahaja), jawapan betul ditunjuk pada soalan salah, keratan nama boleh dibaca, kod ID memadankan roster.
- [ ] **M8 Keputusan dan analisis (4.1, 4.4)**: isih ikut nama/markah, padam satu keputusan (dengan pengesahan), analisis item menyerlahkan soalan Sukar dan diskriminasi < 0.2.
- [ ] **M9 Prestasi pada telefon bajet**: masa dari tangkap hingga hasil <= 1.5 s (SPEC 3.11); UI tidak beku semasa mengimbas.
- [ ] **M10 CSV dalam Excel (5.1)**: buka CSV keputusan dan analisis item; aksara Bahasa Melayu betul, nama berkoma kekal dalam satu sel, lajur S1..Sn, `'` mendahului sel yang bermula `=`.
- [ ] **M11 PWA (6.1, 6.2, 6.4)**: Lighthouse "Installable" lulus pada localhost; pasang ke skrin utama; DevTools Offline: cipta ujian, imbas foto, eksport masih berfungsi; naikkan versi cache dan sahkan banner "Versi baharu tersedia".
- [ ] **M12 Mudah alih (7.4)**: lebar 360x640, sasaran sentuh >= 44 px, kontras teks (Lighthouse Accessibility), navigasi papan kekunci.
- [ ] **M13 Cahaya malap dan fotostat**: imbas di bawah cahaya kelas yang malap, kertas fotostat pudar, kertas sedikit berkedut; app memberi mesej jelas (LOW_CONTRAST / NO_MARKERS) atau status `UNCERTAIN`, bukan jawapan salah senyap.

## 6. Had yang diketahui

- Ujian hujung-ke-hujung memandu paparan `review`, `results`, `scan` (hanya pintu skema) dan `test-home` dengan `ctx` olok-olok dan imej fixture; kamera langsung, overlay visual dan butang dalam penyemak imbas sebenar tidak diuji secara automatik.
- Kertas sintetik menggunakan satu kekuatan hitam yang munasabah; ketepatan pada tulisan pensel sebenar belum diukur (rujuk M2, M13).
