# OMR Semak Jawapan

Aplikasi web statik (PWA) untuk menyemak kertas jawapan objektif (OMR). Guru mencetak kertas
jawapan yang dijana oleh aplikasi, pelajar menghitamkan bulatan A–E, dan guru mengimbas setiap
kertas dengan kamera telefon atau laptop. Aplikasi mengira jawapan yang betul, memaparkan markah
serta-merta, dan menyimpan keputusan di peranti.

Tiada akaun, tiada pelayan, tiada bayaran. UI sepenuhnya dalam Bahasa Melayu.

## Ciri

- **Cipta ujian**: bilangan soalan (cth. 10, 20, 40, 60), pilihan (4 atau 5), digit kod ID pelajar (0–6),
  dan medan Nama, Kelas, Tarikh pada kertas.
- **Cetak kertas OMR**: templat A4 yang dijana terus daripada susun atur yang sama dengan pengimbas.
- **Skema jawapan**: ketik A–E satu demi satu, atau tampal teks skema.
- **Imbas kertas**: kamera langsung dengan tangkapan automatik apabila kertas stabil, atau ambil foto
  sebagai sandaran. Pengesanan dengan 4 penanda sudut dan pembetulan perspektif.
- **Keputusan**: markah dan peratus setiap pelajar, overlay hijau/merah/kuning untuk semakan,
  pembetulan manual dengan kiraan semula markah.
- **Identiti pelajar**: dibaca daripada bulatan kod ID, dipadankan dengan senarai nama (roster) yang
  ditampal guru. Keratan kawasan nama dipaparkan untuk dibaca guru (tiada OCR).
- **Statistik dan analisis item**: purata, median, taburan, dan peratus betul setiap soalan.
- **Eksport dan sandaran**: CSV keputusan dan analisis item (serasi Excel), sandaran JSON penuh
  yang boleh diimport semula.
- **Luar talian**: service worker menyimpan aplikasi selepas kali pertama dimuat.

## Tech stack

- HTML, CSS dan JavaScript (ES modules, tanpa build, tanpa npm)
- IndexedDB untuk penyimpanan di peranti
- Web Worker untuk pengimbasan (UI tidak tersekat)
- Service Worker dan manifest PWA
- Python 3 (stdlib sahaja) untuk pelayan setempat
- Ujian: Microsoft Edge headless melalui `tools/run_tests.py`

## Keperluan

- **Python 3** (diuji dengan 3.14). Tiada pakej tambahan untuk menjalankan aplikasi.
- **Microsoft Edge** atau **Google Chrome** (untuk pelayar dan ujian).
- Windows 10/11 disyorkan (skrip `.bat` disediakan). Pengguna Mac/Linux boleh jalankan
  `python tools/serve.py` secara terus.
- Tiada Node.js atau npm diperlukan.

## Cara jalan

1. Dwi-klik **`start.bat`**.
2. Pelayar akan dibuka di **http://localhost:8000/**.
3. Tekan `Ctrl+C` dalam tetingkap konsol untuk berhenti.

Jika `start.bat` tidak berfungsi, jalankan secara manual dari folder projek:

```bat
python tools\serve.py
```

## Guna di telefon

### Mod LAN (Ambil foto)

1. Pastikan telefon dan laptop berada dalam rangkaian Wi-Fi yang sama.
2. Dwi-klik **`start-lan.bat`**. Skrip memaparkan alamat seperti `http://192.168.1.20:8000/`.
3. Buka alamat itu di telefon. Gunakan butang **Ambil foto** untuk mengimbas kertas.
4. Jika Firewall Windows bertanya, benarkan Python.

Mod ini hanya menghidangkan aplikasi (`--app-only`); folder `tests/`, `tools/` dan `docs/` tidak
boleh diakses dari telefon.

### Kamera langsung dan pasang PWA (HTTPS)

Kamera langsung, pemasangan PWA dan jaminan luar talian memerlukan **HTTPS** atau localhost.
Pada telefon melalui HTTP LAN, hanya mod Ambil foto tersedia.

Pilihan HTTPS (GitHub Pages) **belum dilaksanakan** dan memerlukan kebenaran pemilik projek.
Jangan hos data pelajar di mana-mana laman awam.

### Pasang di iPhone / iPad (Safari iOS 16+)

Tiada Mac atau app natif diperlukan. Syarat: app dihoskan pada pautan **HTTPS** (bukan `http://` LAN)
dan dibuka dalam **Safari** (pelayar lain tidak digalakkan untuk pemasangan).

1. Buka pautan HTTPS app dalam Safari.
2. Ketik butang **Kongsi** (kotak dengan anak panah ke atas) di bawah/atas skrin.
3. Tatal dan pilih **Tambah ke Skrin Utama**, tetapkan nama **Semak OMR**, ketik **Tambah**.
4. Buka app daripada ikon di Skrin Utama. Ketik **Benarkan** apabila diminta kebenaran kamera
   (iOS mungkin bertanya semula pada setiap pelancaran).

Nota iOS: lampu suluh tidak disokong; muat turun CSV/sandaran dibuka melalui lembaran Kongsi
(pilih Simpan ke Fail); data Safari biasa boleh dipadam selepas 7 hari tidak digunakan, jadi
pasang ke Skrin Utama dan buat sandaran berkala. Pengesahan penuh hanya boleh dibuat pada iPhone sebenar.

## Cara uji

```bat
run_tests.bat
```

atau:

```bat
python tools\run_tests.py
```

Keputusan yang dijangka: `PASS 149 / FAIL 0 / SKIP 0`. Skrip memerlukan Edge di laluan lalai
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`; guna `--browser LALUAN` jika
pelayar anda di tempat lain. Pilihan lain: `--only layout,decide` untuk jalankan sebahagian ujian,
`--verbose` untuk butiran.

Ujian boleh juga dibuka secara manual di http://localhost:8000/tests/index.html.

Data ujian ialah data sintetik yang dijana oleh `tools/gen_sheets.py`. Tiada data pelajar sebenar
dalam repositori. Laporan terperinci: `docs/LAPORAN-UJIAN.md`.

## Struktur folder

```
index.html          shell aplikasi
manifest.json       manifest PWA
sw.js               service worker (luar talian)
precache-manifest.js senarai aset pra-cache (dijana oleh tools/list_assets.py)
css/                gaya
icons/              ikon PWA
js/                 kod aplikasi (ES modules)
  omr/              pengesanan dan pengimbasan
  template/         penjanaan kertas dan susun atur
  grading/          markah dan skema
  data/             IndexedDB, CSV, sandaran
  ui/               paparan dan komponen
  util/             utiliti
tools/              pelayan (serve.py), alat ujian, penjana fixture
tests/              ujian automatik, fixture sintetik, harness
docs/               spesifikasi, pelan, laporan ujian, panduan
start.bat           jalankan aplikasi (localhost)
start-lan.bat       jalankan untuk telefon (rangkaian LAN, --app-only)
run_tests.bat       jalankan ujian automatik
```

Dokumen rujukan:

- `docs/SPEC.md`: spesifikasi dan kriteria penerimaan
- `docs/PLAN.md`: pelan dan arahan pasang, jalan, uji (bahagian 9)
- `docs/LAPORAN-UJIAN.md`: keputusan ujian dan senarai semak manual
- `docs/SEMAKAN.md`: semakan kod dan keselamatan
- `docs/PANDUAN-GURU.md`: panduan pengguna untuk guru

## Privasi

- **Semua data kekal di peranti.** Keputusan, skema dan ujian disimpan dalam IndexedDB pelayar
  anda. Tiada data dihantar ke pelayan atau perkhidmatan luar.
- **Foto kertas tidak disimpan** secara lalai. Hanya jawapan dan markah yang disimpan.
- **Tiada telemetri**, tiada analitik, tiada iklan, tiada akaun.
- Pelayan setempat hanya menghidangkan fail statik. Mod LAN tidak mendedahkan kod ujian atau dokumen.
- Nama pelajar dan markah tidak dilog ke konsol.
- Sandaran JSON mengandungi data sekolah. Simpan fail itu dengan selamat dan jangan kongsi melalui
  saluran tidak selamat.
