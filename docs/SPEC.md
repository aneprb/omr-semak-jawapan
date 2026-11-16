# SPEC: OMR Semak Jawapan (PWA)

Versi: 1.0 (MVP). Tarikh: 2026-11-16. Rujukan: `docs/KAJIAN-PESAING.md`, `docs/PLAN.md`.

## 1. Ringkasan
Aplikasi web progresif (PWA) yang berjalan di telefon guru. Guru mencetak kertas jawapan OMR yang dijana oleh app, pelajar menghitamkan bulatan A–E, kemudian guru mengimbas setiap kertas dengan kamera telefon. App mengira jawapan BETUL berbanding skema jawapan, memaparkan markah serta-merta, menyimpan keputusan di peranti (IndexedDB), memaparkan statistik dan analisis item, dan mengeksport CSV untuk Excel. Tiada pelayan, tiada akaun, tiada bayaran, UI Bahasa Melayu sepenuhnya, berfungsi luar talian.

## 2. Pengguna sasaran
- **Utama:** guru mata pelajaran SMK Malaysia yang menyemak ujian objektif (ujian bulanan, kuiz, latihan, peperiksaan dalaman), 30–200 kertas setiap ujian.
- **Peranti:** telefon Android bajet/sederhana (Chrome) dan iPhone (Safari); komputer riba sekolah untuk mencetak templat.
- **Tahap teknikal:** rendah hingga sederhana. Mesti boleh digunakan tanpa latihan selain panduan ringkas.

## 3. Masalah
Menyemak kertas objektif secara manual (stensil/topeng) mengambil masa, mudah tersilap kira, dan tidak menghasilkan analisis item. Aplikasi sedia ada (ZipGrade, GradeCam, Quick Key) berbahasa Inggeris, berbayar dalam USD atau berhad, dan memerlukan pemasangan kedai aplikasi atau akaun.

## 4. Andaian
1. Kertas dicetak pada A4 (putih) oleh pencetak biasa atau difotostat; skala cetakan tidak perlu tepat 100% kerana pengimbas menggunakan homografi berdasarkan 4 penanda sudut (hanya nisbah aspek yang penting; "Fit to page" yang mengekalkan nisbah dibenarkan).
2. Pelajar menggunakan pensel 2B atau pen hitam/biru gelap dan menghitamkan sekurang-kurangnya ~60% bulatan.
3. Satu jawapan sahaja bagi setiap soalan. Bulatan berganda = salah (bukan betul) dan ditanda untuk semakan.
4. Jawapan kosong = salah (tiada markah negatif). Setiap soalan bernilai 1 markah dalam v1.
5. Nama pelajar ditulis tangan dan **tidak dibaca** oleh app (tiada OCR). Identiti pelajar ditentukan melalui (a) bulatan kod ID pelajar (pilihan, 0–6 digit, cth. no. giliran), (b) senarai nama (roster) yang ditampal guru untuk ujian tersebut, atau (c) nama yang ditaip guru semasa semakan. Semasa semakan, app memaparkan keratan kawasan nama daripada foto supaya guru boleh membacanya.
6. Guru memilih ujian **sebelum** mengimbas; susun atur kertas ditentukan oleh tetapan ujian (tiada QR/pengesanan format automatik dalam v1). Kod susun atur (cth. `Q40-C5-ID4`) dicetak pada kertas untuk rujukan visual.
7. Foto kertas tidak disimpan secara lalai (privasi dan ruang storan); hanya jawapan yang dibaca dan markah.
8. Pembangunan dan ujian menggunakan data sintetik sahaja. Tiada nama/markah dilog ke konsol.
9. App dihidangkan secara setempat dengan `python -m http.server` (start.bat). Kamera langsung hanya dalam secure context (localhost atau HTTPS); telefon yang membuka melalui HTTP LAN menggunakan sandaran ambil foto (`<input type="file" capture>`). Pengehosan HTTPS (GitHub Pages) ialah langkah pilihan yang memerlukan kebenaran pemilik.
10. Service worker (luar talian/pasang) juga memerlukan secure context; di telefon melalui HTTP LAN, PWA tidak boleh dipasang dan luar talian tidak dijamin. Ini diterima untuk v1 dan didokumenkan.

## 5. Ciri MVP dan kriteria penerimaan
Setiap kriteria mesti boleh diuji (U = ujian automatik di `tests/`, M = ujian manual dengan senarai semak).

### C1. Jana dan cetak templat kertas jawapan
Guru memilih bilangan soalan (10–60), bilangan pilihan (4 = A–D atau 5 = A–E), bilangan digit ID (0–6), tajuk ujian pilihan; app memaparkan pratonton A4 dan butang "Cetak / Simpan PDF" (`window.print()`).
- 1.1 (U) `buildLayout({numQuestions, numChoices, idDigits})` menolak nilai di luar julat (soalan <10 atau >60, pilihan selain 4/5, digit <0 atau >6) dengan ralat `LAYOUT_INVALID`.
- 1.2 (U) Kedudukan setiap bulatan, penanda sudut dan bar orientasi dalam SVG templat adalah sama (toleransi 0.01 mm) dengan objek `Layout` daripada `buildLayout` (sumber kebenaran tunggal).
- 1.3 (U) Output `buildLayout` JS sama dengan fixture emas yang dijana oleh rujukan Python `tools/omr_layout.py` (toleransi 0.01 mm) bagi sekurang-kurangnya 4 konfigurasi.
- 1.4 (M) Cetakan Chrome (A4, margin "Tiada") menghasilkan satu halaman tepat dengan 4 penanda sudut kelihatan sepenuhnya, ruang Nama, Kelas, Tarikh, kod susun atur dan tajuk.
- 1.5 (M) Soalan dinomborkan mengikut lajur (1–20 lajur 1, 21–40 lajur 2, 41–60 lajur 3), huruf pilihan dicetak sebagai kepala lajur.

### C2. Cipta ujian dan skema jawapan
- 2.1 (M/U) Guru boleh cipta ujian dengan nama (wajib, 1–80 aksara), kelas/mata pelajaran (pilihan) dan tetapan susun atur; ujian disimpan dalam IndexedDB dan kekal selepas muat semula halaman.
- 2.2 (M) Skrin skema: grid soalan; ketik A–E bagi setiap soalan; butang "Seterusnya" automatik bergerak ke soalan berikut; penunjuk "x/N diisi".
- 2.3 (U) Skema boleh juga ditampal sebagai teks (cth. `ABCDA BCD...` atau `1A 2B ...`); penghurai mengabaikan ruang/nombor dan menolak huruf di luar julat pilihan.
- 2.4 (M) "Imbas kertas skema": mengimbas kertas yang dihitamkan guru dan mengisi skema; soalan BLANK/MULTIPLE/UNCERTAIN ditanda dan mesti diselesaikan sebelum simpan.
- 2.5 (U) Ujian tidak boleh mengimbas murid sehingga skema lengkap (semua soalan ada jawapan). Mengubah skema selepas ada keputusan akan mengira semula markah semua keputusan (dengan pengesahan).
- 2.6 (M) Susun atur ujian tidak boleh diubah selepas ada keputusan (dikunci); guru boleh "Duplikasi ujian" untuk susun atur baharu.

### C3. Imbas kertas
- 3.1 (M) Mod kamera langsung (secure context sahaja): pratonton video kamera belakang, bingkai panduan A4, penunjuk status ("Cari penanda…", "4 penanda dikesan, tahan…").
- 3.2 (U) Tangkap auto: apabila 4 penanda dikesan dalam 3 bingkai berturut-turut dengan anjakan sudut < 2% lebar bingkai, app menangkap bingkai resolusi penuh. Butang tangkap manual sentiasa ada.
- 3.3 (M) Sandaran: butang "Ambil foto / Pilih gambar" (`<input type="file" accept="image/*" capture="environment">`) sentiasa tersedia, dan menjadi mod utama jika `getUserMedia` tidak tersedia.
- 3.4 (U) `scanImage` pada set sintetik "bersih" (tools/gen_sheets.py, profil `clean`, ≥ 40 kertas): ketepatan bacaan bulatan ≥ 99.5%, dan 100% kertas `ok: true`.
- 3.5 (U) Pada set sintetik "herot" (perspektif sehingga 15°, putaran ±10°, putaran 180°, kabur, hingar, kecerunan cahaya, JPEG q=60): ≥ 95% kertas `ok: true`; bagi kertas `ok`, ketepatan bulatan ≥ 98%; tiada soalan MULTIPLE/BLANK sebenar yang dilaporkan sebagai `OK` dengan pilihan tunggal (kadar < 0.5%).
- 3.6 (U) Imej tanpa penanda (kertas kosong, gambar rawak) memulangkan `ok: false` dengan `error: 'NO_MARKERS'` dalam ≤ 2 s; tidak membuang pengecualian.
- 3.7 (M) Skrin hasil: markah `X/N`, peratus (1 tempat perpuluhan), overlay pada foto: bulatan hijau = betul, merah = salah (dengan jawapan betul ditunjuk), kuning = kosong/berganda/tidak pasti. Senarai amaran di bawah.
- 3.8 (M) Pembetulan manual: guru ketik soalan untuk menukar jawapan (A–E/Kosong); markah dikira semula serta-merta; soalan yang diedit ditanda `manualEdits`.
- 3.9 (M) Identiti: kod ID dibaca dari bulatan; jika roster wujud, nama dipadankan automatik; jika tidak, guru boleh taip nama. Keratan kawasan Nama dipaparkan.
- 3.10 (U) Kod pelajar pendua dalam ujian yang sama memaparkan amaran dengan pilihan "Ganti" atau "Simpan sebagai baharu".
- 3.11 (U) Masa `scanImage` bagi imej 1600×2263 px ≤ 1.5 s pada komputer riba sekolah (Chrome/Edge), dijalankan dalam Web Worker supaya UI tidak beku.

### C4. Keputusan, statistik, analisis item
- 4.1 (M) Senarai keputusan per ujian: Bil, Kod, Nama, Markah, %, tanda amaran jika ada suntingan manual; boleh isih mengikut nama/markah; padam satu keputusan (dengan pengesahan).
- 4.2 (U) Statistik: bilangan kertas, purata, median, tertinggi, terendah, sisihan piawai (dibundar 1 tempat perpuluhan) — betul bagi set data ujian yang diketahui.
- 4.3 (U) Analisis item per soalan: % betul, kiraan setiap pilihan + kosong + berganda, pengganggu paling popular (pilihan salah dengan kiraan tertinggi; seri = huruf terawal), label kesukaran (Mudah ≥ 80%, Sederhana 40–79%, Sukar < 40%), indeks diskriminasi (kumpulan atas/bawah 27%, hanya jika ≥ 10 kertas).
- 4.4 (M) Paparan analisis item boleh diisih dan menyerlahkan soalan Sukar dan diskriminasi < 0.2.

### C5. Eksport dan sandaran
- 5.1 (U) Eksport CSV keputusan: UTF-8 dengan BOM, pemisah koma, CRLF, medan dipetik mengikut RFC 4180; lajur: `Bil, Kod Pelajar, Nama, Betul, Jumlah, Peratus, S1..Sn`. Fail dibuka dengan betul dalam Excel (aksara BM dan nama berkoma kekal).
- 5.2 (U) Eksport CSV analisis item: `Soalan, Jawapan, % Betul, Kesukaran, Diskriminasi, A, B, C, D, E, Kosong, Berganda, Pengganggu Popular`.
- 5.3 (U) Medan CSV yang bermula dengan `= + - @` diawali `'` (pertahanan suntikan formula).
- 5.4 (U) Sandaran JSON (semua ujian + keputusan + tetapan) dan pulih: pusingan `export → clear → import` menghasilkan data yang sama (deep-equal). Import menolak fail dengan `app`/`schemaVersion` tidak sah tanpa mengubah data sedia ada. Pilihan import: "Gabung" (id sama dilangkau) atau "Ganti semua" (dengan pengesahan).

### C6. PWA
- 6.1 (M) `manifest.json` sah (nama BM, ikon 192/512 + maskable, `display: standalone`, `start_url: ./`), lulus semakan Lighthouse "Installable" apabila dihidangkan melalui localhost/HTTPS.
- 6.2 (M) Selepas lawatan pertama, app dimuat dan berfungsi sepenuhnya (cipta ujian, imbas foto, eksport) dalam mod luar talian (DevTools Offline).
- 6.3 (U) Senarai fail pra-cache dalam `sw.js` merangkumi setiap fail di `js/`, `css/`, `icons/`, `vendor/` (ujian membandingkan senarai dengan inventori fail yang dijana `tools/list_assets.py`).
- 6.4 (M) Versi cache baharu menggantikan cache lama; banner "Versi baharu tersedia — Muat semula".

### C7. Bukan fungsian
- 7.1 UI Bahasa Melayu sepenuhnya; semua rentetan dalam `js/ui/strings.ms.js`.
- 7.2 Tiada permintaan rangkaian ke pihak ketiga semasa runtime (semua aset setempat). Semakan: tab Network kosong selain asal sendiri.
- 7.3 Tiada `console.log` nama, kod pelajar atau markah (semakan grep oleh penyemak).
- 7.4 Sasaran mudah alih: skrin 360×640 ke atas, sasaran sentuh ≥ 44 px, kontras WCAG AA.
- 7.5 Pelayar sasaran: Chrome Android ≥ 110, Safari iOS ≥ 16, Edge/Chrome desktop terkini.

## 6. Kelebihan berbanding pesaing
Ciri asas wajib (KAJIAN-PESAING) semuanya diliputi: imbas kamera (C3), skema jawapan (C2), markah betul/jumlah (C3), borang piawai 10–60 soalan A–D/A–E (C1), simpan skor (C4), eksport CSV (C5), luar talian (C6).

Ciri pembeza yang dilaksanakan dalam MVP:
1. **Percuma tanpa had, tanpa akaun, data kekal di telefon** (IndexedDB, tiada pelayan) — berbanding had 100 imbasan/bulan ZipGrade dan akaun Quick Key/GradeCam.
2. **UI Bahasa Melayu penuh + penjana templat kertas sendiri** (A4, 10–60 soalan, A–D/A–E, kod ID, ruang Nama/Kelas) yang boleh difotostat di sekolah.
3. **PWA tanpa kedai aplikasi**, ringan (tiada OpenCV, enjin JS tulen < 100 KB), sesuai Android bajet.
4. **Analisis item BM** (% betul, pengganggu popular, kesukaran, diskriminasi) dengan eksport CSV.
5. **Pengesahan imbasan**: overlay hijau/merah/kuning, amaran kosong/berganda, pembetulan manual sebelum simpan, keratan kawasan nama.

## 7. Di luar skop (v1)
- Penyegerakan awan, akaun, log masuk, perkongsian antara peranti (selain fail sandaran JSON).
- Eksport .xlsx (CSV sahaja), laporan PDF.
- OCR nama tulisan tangan; QR/pengesanan format kertas automatik.
- Berbilang set soalan (A/B), pemberat markah, markah negatif, gred/PBD automatik.
- Borang tersuai sepenuhnya, soalan padanan/numerik/subjektif.
- Imbasan kelompok dari PDF/pengimbas rata.
- Integrasi KPM/MOEIS/IDMe/SchoolOS, LMS, AI.
- Menyimpan foto kertas.
- Pengehosan awam (GitHub Pages) — pilihan sahaja, perlu kebenaran pemilik.
