# Kajian Pesaing: OMR Semak Jawapan (PWA untuk guru SMK)

Tarikh: 2026-11-16. Skop: ciri dan aliran kerja sahaja. Carian terhad (beberapa laman gagal dicapai), maka butiran bertanda "perlu disahkan" belum disemak.

## Ringkasan
- ZipGrade ialah penanda aras: murah (percuma 100 imbasan/bulan, USD 6.99/tahun untuk tanpa had), luar talian, eksport CSV, analisis item, borang tersuai.
- GradeCam menyasarkan sekolah/daerah melalui lesen (harga tidak diumumkan); Quick Key berasaskan akaun dan langganan.
- Semua pesaing utama berbahasa Inggeris dan berbayar dalam USD. Tiada aplikasi OMR guru Malaysia yang jelas tersedia secara awam; hanya projek akademik (cth. UNIMAS "Smart Grading", tidak dapat disahkan sama ada boleh dimuat turun).
- Peluang terbesar: PWA percuma, BM, tanpa akaun, data kekal di telefon, templat kertas boleh dicetak sendiri dan dipadankan dengan format ujian SMK.

## Profil pesaing
1. **ZipGrade** (zipgrade.com). Sasaran: guru individu. Harga: percuma 100 imbasan/bulan; USD 6.99/tahun tanpa had. Kekuatan: iOS dan Android, imbas tanpa internet, borang 20/50/100 soalan, Custom Form Wizard, eksport CSV, analisis item, sync pilihan. Kelemahan: aplikasi natif (perlu pasang), UI Inggeris, laman web tidak setara aplikasi, sokongan sukar dihubungi, permintaan bahasa lain (cth. Arab) tidak dipenuhi.
2. **GradeCam** (gradecam.com). Sasaran: sekolah/daerah, integrasi LMS. Harga: tidak disiarkan, hubungi jualan. Kekuatan: ekosistem dan integrasi (PowerSchool, Instructure). Kelemahan: berlesen institusi, tidak sesuai guru individu; kaedah imbas dan platform perlu disahkan.
3. **Quick Key** (quickkeyapp.com). Halaman harga tidak dapat dicapai (404). Diketahui umum: berasaskan akaun dan langganan; butiran perlu disahkan.
4. **FormScanner** (formscanner.org). Perisian desktop sumber terbuka (Java) yang memproses imej borang yang diimbas. Laman tidak dapat dicapai semasa kajian; butiran perlu disahkan. Kelemahan lazim: perlu pengimbas rata dan komputer, bukan kamera telefon.
5. **Aplikasi OMR di Google Play** (pelbagai). Tidak dikaji satu per satu; kualiti berbeza-beza, banyak beriklan. Perlu disahkan.
6. **Projek tempatan/akademik**: UNIMAS "Smart Grading" (scholarhub.unimas.my) dan projek OMR Indonesia berasaskan OpenCV (eksport Excel, ketepatan dilaporkan ~97.2%). Bukti bahawa pendekatan ini boleh dilaksanakan; bukan produk siap untuk guru SMK.
7. **Alternatif manual**: semak dengan topeng/stensil kertas, Excel, Google Form, CamScanner (ke PDF sahaja; tidak menyemak).

## Matriks ciri
| Ciri | ZipGrade | GradeCam | Quick Key | FormScanner | Cadangan kita |
|---|---|---|---|---|---|
| Imbas kamera telefon | ✅ | perlu disahkan | perlu disahkan | ❌ (imej/pengimbas) | ✅ |
| Luar talian | ✅ | perlu disahkan | perlu disahkan | ✅ (desktop) | ✅ |
| Tanpa akaun | ⚠️ (sync pilihan) | ❌ | ❌ | ✅ | ✅ |
| Percuma tanpa had | ⚠️ (100/bulan) | ❌ | ⚠️ | ✅ | ✅ |
| Borang tersuai | ✅ | perlu disahkan | perlu disahkan | ✅ | ⚠️ (templat tetap dahulu) |
| Eksport CSV | ✅ | perlu disahkan | perlu disahkan | ✅ | ✅ (CSV/Excel) |
| Analisis item | ✅ | perlu disahkan | perlu disahkan | ❌ | ✅ |
| Bahasa Melayu | ❌ | ❌ | ❌ | ❌ | ✅ |
| Tiada pemasangan (PWA) | ❌ | ⚠️ | ❌ | ❌ | ✅ |

## Aduan pengguna teratas (bukti terhad)
1. Laman web tidak setara aplikasi, sukar urus kuiz dari web (ulasan App Store ZipGrade, via justuseapp.com).
2. Tiada sokongan bahasa tempatan (permintaan Arab di App Store ZipGrade).
3. Sokongan pelanggan sukar dihubungi (ulasan Dis 2025, via justuseapp.com; aggregator pihak ketiga).
4. Had 100 imbasan/bulan memaksa bayaran (halaman rasmi ZipGrade).
5. Kandungan/kurikulum luar negara tidak sepadan (satu ulasan ZipGrade). Perlu kajian lanjut: ulasan Play Store, Reddit.

Catatan: penilaian ZipGrade sangat tinggi (~4.9 iOS), jadi jurang utama ialah bahasa, kos dan konteks Malaysia, bukan kualiti imbasan.

## Ciri asas wajib (MVP)
Imbas kamera, skema jawapan, markah betul/jumlah, borang piawai (cth. 20/40/50 soalan; A-E), simpan senarai pelajar/skor, eksport CSV, berfungsi luar talian.

## Ciri pembeza
1. **Percuma, tanpa akaun, data kekal di telefon** (IndexedDB; tiada pelayan). Sebab: privasi data murid (selaras PDPA) dan kos sifar. Usaha: Kecil.
2. **UI Bahasa Melayu penuh + templat kertas jawapan PDF sendiri** (A4, penanda sudut, 5 pilihan A-E, ruang nama/kelas/no. giliran) boleh dicetak/difotostat di sekolah. Usaha: Sederhana.
3. **PWA luar talian** (service worker), tiada pemasangan kedai aplikasi, sesuai Android bajet. Usaha: Kecil-Sederhana.
4. **Analisis item** (peratus betul setiap soalan, taburan pilihan, soalan sukar/mudah, taburan markah) dalam BM, sesuai laporan PBD/peperiksaan dalaman. Usaha: Kecil.
5. **Eksport CSV dan Excel (.xlsx)** dengan lajur sedia untuk rekod markah. Usaha: Kecil.
6. **Pengesahan imbasan**: pratonton jawapan dikesan, tanda bulatan berganda/kosong, edit manual sebelum simpan. Usaha: Sederhana.
7. **Berbilang set (A/B)** dan pemberat markah. Usaha: Sederhana (fasa kemudian).

## Jangan buat (MVP)
Penyegerakan awan/akaun, integrasi LMS (gaya GradeCam), borang sepenuhnya tersuai/matching/gridded-numeric, peperiksaan dalam talian, soalan subjektif, AI penilaian, sebarang integrasi KPM/MOEIS.

## Cadangan MVP (mengikut keutamaan)
1. Templat PDF borang piawai (20/40/50 soalan, A-E) dengan penanda sudut.
2. Pengimbas kamera + pengesanan bulatan (OpenCV.js/WASM, tempatan sahaja) dengan semakan kualiti (cahaya, kedudukan).
3. Skema jawapan dan pengiraan markah betul.
4. Pratonton dan pembetulan manual.
5. Simpan setempat (kelas, ujian, skor) + eksport CSV/Excel.
6. Analisis item.
7. PWA luar talian + UI BM.
8. Risiko utama: ketepatan pada kertas fotostat dan cahaya buruk. Uji dengan data sintetik/kertas sampel sahaja.

## Sumber
- https://www.zipgrade.com/
- https://gradecam.com/
- https://justuseapp.com/en/app/635077270/zipgrade/reviews
- https://apps.apple.com/app/zipgrade/id635077270
- https://splitmetrics.com/apps/zipgrade/id635077270/
- https://scholarhub.unimas.my/handle/123456789/495
- https://bajangjournal.com/index.php/J-ABDI/article/view/12302
- https://studentdiploma.utmspace.edu.my/wp-content/uploads/2020/09/LAMPIRAN-3-MANUAL-INSTALL-DAN-GUNA-SCANNER.pdf
- Tidak dapat dicapai: quickkeyapp.com/pricing (404), formscanner.org (ralat SSL).
