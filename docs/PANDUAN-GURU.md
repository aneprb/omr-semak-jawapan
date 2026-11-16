# Panduan Guru: OMR Semak Jawapan

Panduan ini untuk guru yang mahu menyemak kertas jawapan objektif (OMR) dengan kamera telefon atau komputer riba. Tidak perlu pengetahuan teknikal. Ikut langkah demi langkah.

---

## 1. Pengenalan

**OMR Semak Jawapan** ialah aplikasi web untuk menyemak kertas jawapan objektif (pilihan A hingga D atau A hingga E).

Apa yang app ini boleh buat:

- Menjana **templat kertas jawapan** A4 yang boleh dicetak atau difotostat.
- Menyimpan **skema jawapan** (kunci jawapan) bagi setiap ujian.
- Mengimbas kertas murid dengan **kamera** dan mengira jawapan betul secara automatik.
- Menunjukkan **markah**, peratus, dan kedudukan setiap soalan.
- Menunjukkan **analisis item** (soalan mana sukar, pilihan mana paling banyak dipilih).
- Mengeksport keputusan ke **CSV** (boleh dibuka dalam Excel).

Yang penting diingat:

- **Tiada akaun dan tiada log masuk.** Anda terus buka app.
- **Data disimpan dalam pelayar (browser) peranti tempat anda menggunakannya.** Data tidak naik ke internet. Oleh itu, **buat sandaran (backup) secara berkala**. Lihat bahagian 14.
- App ini tidak membaca nama tulisan tangan murid. Nama dipadankan daripada senarai nama yang anda tampal, atau anda taip sendiri.

> 📷 [Gambar: Skrin utama app dengan senarai "Ujian Saya" dan butang "+ Ujian Baharu"]

---

## 2. Mula: Menjalankan app di komputer riba sekolah

Anda perlu menjalankan app sekali setiap kali mahu menggunakannya.

1. Buka folder **projects\omr-semak-jawapan** (folder app ini).
2. Dwi-klik fail **start.bat**.
3. Tunggu sehingga tetingkap hitam memaparkan tulisan **Memulakan OMR Semak Jawapan di http://localhost:8000/**.
4. Pelayar (browser) akan terbuka sendiri. Jika tidak, buka pelayar dan taip **http://localhost:8000/** di bar alamat.
5. Biarkan tetingkap hitam itu terbuka selagi anda menggunakan app. Untuk berhenti, tekan **Ctrl + C** di tetingkap hitam itu, atau tutup tetingkapnya.

> Jika tetingkap hitam memaparkan **"Python tidak ditemui"**, komputer itu belum ada Python 3. Minta bantuan pentadbir ICT sekolah untuk memasangnya.

> 📷 [Gambar: Tetingkap hitam start.bat dengan mesej "Memulakan OMR Semak Jawapan di http://localhost:8000/"]

---

## 3. Mula: Menggunakan telefon (mod Ambil foto)

Anda boleh menggunakan telefon untuk mengimbas. Telefon dan komputer riba mesti disambung ke **Wi-Fi yang sama**.

Dalam mod ini, kamera langsung (video) **tidak tersedia**. Anda guna butang **Ambil foto / Pilih gambar** untuk mengambil gambar kertas. Ini adalah mod yang betul untuk telefon di sekolah.

1. Di komputer riba, dwi-klik **start-lan.bat**.
2. Tetingkap hitam akan memaparkan satu atau lebih alamat, contohnya **http://192.168.1.25:8000/**. Catat alamat yang betul (alamat IP komputer anda).
3. Di telefon, buka pelayar (Chrome untuk Android, Safari untuk iPhone).
4. Taip alamat tadi di bar alamat, kemudian tekan Enter.
5. Jika telefon tidak dapat membuka laman, periksa:
   - Telefon dan komputer riba disambung ke Wi-Fi yang sama.
   - Tetingkap start-lan.bat masih terbuka.
   - Firewall Windows dibenarkan untuk Python (jika ditanya, klik **Benarkan**).

> Dalam mod ini app **tidak dipasang** sebagai aplikasi dan **tidak dijamin berfungsi tanpa internet**. Untuk kerja harian, gunakan komputer riba (localhost) atau minta pentadbir ICT menyediakan HTTPS.

> 📷 [Gambar: Tetingkap start-lan.bat dengan alamat IP yang dipaparkan]

**Penting:** Data di telefon dan data di komputer riba **berbeza**. Jika anda buka app melalui alamat IP di telefon, semua ujian yang dicipta di telefon hanya ada di telefon itu.

### 3a. Pasang di iPhone / iPad

Syarat: pentadbir menyediakan pautan **HTTPS** untuk app, dan anda guna **Safari**.

1. Buka pautan app dalam Safari.
2. Ketik butang **Kongsi** (kotak dengan anak panah ke atas).
3. Pilih **Tambah ke Skrin Utama**, kemudian ketik **Tambah**.
4. Buka app daripada ikon **Semak OMR** di Skrin Utama.
5. Apabila diminta, ketik **Benarkan** untuk kamera. Jika kamera tidak bermula, ketik **Mulakan kamera**.

Perkara penting di iPhone:
- Lampu suluh tidak tersedia. Imbas di tempat yang cukup cahaya.
- Muat turun CSV atau sandaran akan membuka lembaran **Kongsi**. Pilih **Simpan ke Fail**.
- iOS boleh memadam data Safari biasa jika app tidak dibuka 7 hari. Pasang ke Skrin Utama dan buat **sandaran** secara berkala (Tetapan > Muat turun sandaran).

---

## 4. Cipta ujian baharu

1. Di skrin utama, klik **+ Ujian Baharu**.
2. Isi borang **Ujian Baharu**:
   - **Nama ujian** (wajib): contoh **Ujian Bulanan 3**. Panjang 1 hingga 80 aksara.
   - **Kelas** (pilihan): contoh **5 Cerdik**.
   - **Mata pelajaran** (pilihan): contoh **Sains**.
   - **Jenis kertas jawapan**: pilih **Kertas cetakan app** (kertas yang dicetak daripada app ini) atau **Borang SPM (merah)** (lihat bahagian 4a).
   - **Bilangan soalan**: masukkan nombor dari **10 hingga 60**.
   - **Bilangan pilihan**: pilih **A–D** (4 pilihan) atau **A–E** (5 pilihan).
   - **Digit kod pelajar**: masukkan **0 hingga 6**. Pilih **0** jika tidak mahu guna kod pelajar. Kod pelajar ialah nombor giliran atau nombor pendaftaran yang dihitamkan murid pada kertas.
3. Klik **Cipta ujian**.
4. Mesej **Ujian disimpan.** akan muncul. Anda dibawa ke ringkasan ujian.

> Susun atur kertas ditentukan oleh tetapan ini. Jika sudah ada keputusan, susun atur tidak boleh diubah. Untuk susun atur baharu, guna **Duplikasi ujian** (lihat bahagian 13).

> 📷 [Gambar: Borang Ujian Baharu dengan semua medan diisi]

### 4a. Guna borang SPM rasmi (dakwat merah)

App boleh membaca borang rasmi **"Kertas Jawapan Objektif SPM" (LPM/KOM 28)** yang dicetak merah.

1. Pada **Jenis kertas jawapan**, pilih **Borang SPM (merah)**.
2. **Bilangan soalan**: **1 hingga 80**. Pilihan sentiasa **A–D** dan tiada kod pelajar (taip nama murid semasa menyemak).
3. Tiada templat untuk dicetak. Pautan **Panduan borang SPM** di ringkasan ujian memberi tip mengimbas.
4. Semasa mengimbas: letak borang di atas permukaan rata, pastikan **seluruh kawasan jawapan (bingkai merah bersoalan 1–80)** kelihatan, cahaya sekata dan tiada pantulan. Borang yang terbalik (180°) dibaca dengan betul.
5. Murid mesti menghitamkan bulatan dengan **pensel 2B**. Dakwat merah borang tidak dikira sebagai tanda.

---

## 5. Masukkan skema jawapan (kunci jawapan)

Skema ialah jawapan betul untuk setiap soalan. **Skema mesti lengkap sebelum anda boleh mengimbas kertas murid.**

1. Di ringkasan ujian, klik **Skema jawapan**.
2. Pilih salah satu cara di bahagian atas skrin:
   - **Ketik**: masukkan satu soalan pada satu masa.
   - **Tampal**: tampal jawapan sebagai teks.
   - **Imbas kertas**: imbas kertas yang anda sudah hitamkan sebagai contoh.

### 5a. Cara Ketik

1. Pilih soalan (contoh soalan 1 dalam grid nombor).
2. Ketik huruf jawapan betul: **A**, **B**, **C**, **D** atau **E** (ikut bilangan pilihan).
3. Klik **Seterusnya** untuk pergi ke soalan berikutnya. Klik **Sebelumnya** untuk berpatah balik.
4. Perhatikan penunjuk **x/N diisi** (contoh **12/40 diisi**). Tunggu sehingga semua soalan diisi.

> 📷 [Gambar: Skrin Skema Jawapan, mod Ketik, dengan penunjuk "Soalan 7" dan "12/40 diisi"]

### 5b. Cara Tampal

1. Klik tab **Tampal**.
2. Tampal jawapan dalam kotak **Tampal skema**. Contoh format yang diterima:
   - `ABCDA BCDDE` (huruf bersambung)
   - `1A 2B 3C` (nombor dan huruf)
3. Klik **Guna skema ini**.
4. Jika ada huruf yang tidak sah, app akan memaparkan mesej seperti **Huruf tidak sah: F**. Betulkan teks, kemudian cuba lagi. Hanya pilihan yang ada pada kertas dibenarkan (A–D atau A–E).

### 5c. Cara Imbas kertas skema

1. Hitamkan kertas jawapan contoh dengan pensel 2B, mengikut jawapan betul.
2. Klik tab **Imbas kertas** dan imbas kertas itu seperti biasa (lihat bahagian 9).
3. Jika ada soalan **kosong**, **berganda** atau **tidak pasti**, app akan memaparkan mesej seperti **3 soalan perlu diselesaikan**. Betulkan soalan itu dengan menaip jawapan yang betul. Anda tidak boleh simpan selagi soalan itu belum diselesaikan.

> 📷 [Gambar: Tab Imbas kertas dalam Skema Jawapan dengan mesej "soalan perlu diselesaikan"]

**Nota:** Jika anda mengubah skema selepas sudah ada keputusan, app akan bertanya **Ubah skema?** dengan maklumat berapa keputusan akan dikira semula. Klik **Ubah dan kira semula** jika anda pasti.

---

## 6. Masukkan senarai nama murid (roster)

Senarai nama membolehkan app memadankan kod murid dengan nama secara automatik. Langkah ini **pilihan**.

1. Di ringkasan ujian, klik **Senarai nama**.
2. Dalam kotak **Senarai Nama**, tampal satu murid untuk setiap baris dalam format **kod,nama**. Contoh:

   ```
   1001,Pelajar Ujian 1
   1002,Pelajar Ujian 2
   1003,Pelajar Ujian 3
   ```

3. Perhatikan kiraan di bawah, contohnya **3 pelajar**.
4. Klik **Simpan senarai**. Mesej **Senarai nama disimpan.** akan muncul.
5. Jika ada baris yang salah format, app akan memaparkan mesej **Baris 4 tidak sah. Guna format kod,nama.** Betulkan baris itu.

Untuk memadam senarai, klik **Kosongkan senarai**.

> 📷 [Gambar: Skrin Senarai Nama dengan contoh kod,nama dan kiraan "3 pelajar"]

---

## 7. Cetak templat kertas jawapan

1. Di ringkasan ujian, klik **Cetak templat**.
2. Semak pratonton kertas. Pastikan **kod susun atur** (contoh **Q40-C5-ID4**) dan ruang **Nama**, **Kelas** dan **Tarikh** kelihatan.
3. Klik **Cetak / Simpan PDF**.
4. Pada tetingkap cetak, tetapkan:
   - **Saiz kertas**: **A4**.
   - **Margin**: **Tiada** (None).
   - **Skala**: **100%** atau **Lalai** (Default).
   - **Pengepala dan pengaki** (Headers and footers): **dinyahtanda** jika ada pilihan ini.
   - **Jangan** pilih **Muatkan ke halaman** (Fit to page). Pilihan ini mengubah saiz kertas dan boleh menyebabkan penanda sudut terpotong.
5. Klik **Cetak**. Jika mahu fail PDF, pilih **Simpan sebagai PDF** di bahagian pencetak.
6. Periksa hasil cetakan: **satu halaman sahaja** dan **keempat-empat penanda sudut hitam kelihatan sepenuhnya**.

> Fotostat dibenarkan. Pastikan keempat-empat penanda sudut tetap kelihatan.

> 📷 [Gambar: Skrin Templat Kertas Jawapan dengan butang "Cetak / Simpan PDF" dan tetingkap cetak dengan Skala 100%]

---

## 8. Murid menghitamkan bulatan

Beritahu murid cara menjawab sebelum peperiksaan:

1. Guna **pensel 2B** atau **pen hitam/biru gelap**.
2. Hitamkan bulatan **penuh**, sekurang-kurangnya kira-kira **60%** daripada bulatan.
3. Hanya **satu** jawapan bagi setiap soalan.
4. Jika mahu tukar jawapan, **padam bersih** dengan pemadam. Jangan conteng atau tulis tanda lain.
5. Jangan lipat, koyak atau conteng penanda sudut di setiap penjuru kertas.
6. Tulis nama dan kelas di ruang yang disediakan.

Kesan kepada markah:

- Bulatan **kosong** dikira **salah** (tiada markah tolak).
- Bulatan **berganda** (dua atau lebih) dikira **salah** dan ditanda untuk semakan.

> 📷 [Gambar: Contoh bulatan yang dihitamkan dengan betul, dan contoh yang salah (separuh, berganda, conteng)]

---

## 9. Imbas kertas murid

Sebelum mengimbas, pastikan **skema lengkap** (lihat bahagian 5). Jika tidak, butang **Imbas kertas** tidak aktif dan app akan memaparkan **Lengkapkan skema dahulu sebelum mengimbas.**

### 9a. Persediaan

- Pastikan **cahaya cukup**. Elakkan bayang dan cahaya terang yang memantul di kertas.
- Letakkan kertas **rata** di atas meja.
- Pastikan **keempat-empat penanda sudut** kelihatan sepenuhnya.

### 9b. Imbas dengan kamera langsung (komputer riba atau telefon yang dibenarkan)

1. Di ringkasan ujian, klik **Imbas kertas**.
2. Halakan kamera ke kertas. Ikut bingkai A4 di skrin.
3. Perhatikan status di bahagian bawah skrin:
   - **Cari penanda…**: app belum jumpa penanda.
   - **2 daripada 4 penanda dikesan**: app sedang mencari penanda lain.
   - **4 penanda dikesan, tahan…**: tahan kamera tetap.
4. Jika **Tangkap auto** dihidupkan (lihat bahagian 12), app akan menangkap gambar sendiri apabila kertas stabil. Jika tidak, klik butang bulat **Tangkap**.
5. Tunggu mesej **Membaca kertas…**.
6. Skrin **Semak Imbasan** akan dipaparkan (lihat bahagian 10).

> 📷 [Gambar: Skrin Imbas Kertas dengan bingkai A4 dan status "4 penanda dikesan, tahan…"]

### 9c. Imbas dengan telefon (mod Ambil foto)

1. Di skrin **Imbas Kertas**, klik **Ambil foto / Pilih gambar**.
2. Kamera telefon akan terbuka. Ambil gambar kertas dengan jelas dan rata.
3. Jika telefon membenarkan, anda juga boleh pilih gambar sedia ada dari galeri.
4. Tunggu mesej **Membaca kertas…**, kemudian semak hasilnya.

> Jika app memaparkan **Penanda sudut tidak dijumpai**, ambil semula gambar dengan cahaya yang lebih baik. Lihat FAQ bahagian 15.

> 📷 [Gambar: Skrin telefon dengan butang "Ambil foto / Pilih gambar"]

**Ingat:** Foto kertas **tidak disimpan**. Hanya jawapan dan markah yang disimpan.

---

## 10. Semak dan betulkan jawapan

Selepas imbasan, skrin **Semak Imbasan** memaparkan:

- **Markah besar**, contoh **35/40**, dan peratus, contoh **87.5%**.
- **Kod pelajar** dan **nama pelajar**. Jika nama sudah ada dalam senarai, app memaparkan **Nama dipadankan daripada senarai.**
- **Kawasan nama** pada kertas (keratan gambar) supaya anda boleh membaca nama tulisan tangan.
- **Foto kertas** dengan tanda betul, salah dan semak.
- **Senarai amaran**, contoh **3 soalan perlu disemak**.

### Maksud tanda

| Tanda | Maksud |
|---|---|
| ✓ **Betul** | Jawapan murid sama dengan skema. |
| ✗ **Salah** | Jawapan murid tidak sama dengan skema. Jawapan betul juga ditunjukkan. |
| ! **Semak** | Kosong, berganda, atau app tidak pasti. Perlu disemak. |

### Cara betulkan satu soalan

1. Klik soalan yang bertanda **!** atau **✗** dalam senarai.
2. Dialog **Betulkan soalan N** akan terbuka. Contoh **Betulkan soalan 7**.
3. Pilih jawapan sebenar pelajar: **A**, **B**, **C**, **D**, **E** atau **Kosong**.
4. Markah akan dikira semula serta-merta. Soalan yang diubah ditanda **Disunting**.

### Pilihan di hujung skrin

- **Simpan**: simpan keputusan murid ini.
- **Simpan dan imbas seterusnya**: simpan, kemudian buka kamera untuk kertas seterusnya.
- **Imbas semula**: buang imbasan ini dan ambil gambar baharu.

**Jika kod pelajar sudah wujud:** app memaparkan **Kod pelajar sudah ada**. Pilih:

- **Ganti**: keputusan lama diganti dengan keputusan baharu.
- **Simpan sebagai baharu**: kedua-dua keputusan disimpan.

**Jika anda keluar tanpa menyimpan:** app bertanya **Buang imbasan ini?**. Klik **Buang** jika anda pasti, atau batal untuk kembali.

> 📷 [Gambar: Skrin Semak Imbasan dengan markah 35/40, overlay hijau dan merah, serta senarai amaran]

---

## 11. Keputusan dan analisis item

### 11a. Lihat keputusan

1. Di ringkasan ujian, klik **Keputusan** (atau tab **Keputusan** di bawah).
2. Kad **Statistik** memaparkan: **Bilangan kertas**, **Purata**, **Median**, **Tertinggi**, **Terendah** dan **Sisihan piawai**.
3. Jadual memaparkan **Bil**, **Kod**, **Nama**, **Markah** dan **%**.
4. Klik pengepala lajur atau butang **Isih ikut nama** atau **Isih ikut markah** untuk mengisih.
5. Klik satu baris untuk melihat **Butiran keputusan**. Di sini anda boleh:
   - Menyunting nama atau kod, kemudian klik **Simpan**.
   - Memadam keputusan itu dengan klik **Padam**, kemudian sahkan.

Tanda **Ada suntingan manual** bermaksud ada soalan yang diubah oleh guru.

> 📷 [Gambar: Skrin Keputusan dengan kad Statistik dan jadual pelajar]

### 11b. Lihat analisis item

1. Di ringkasan ujian, klik **Analisis item** (atau tab **Analisis** di bawah).
2. Jadual memaparkan untuk setiap soalan:
   - **Soalan** dan **Jawapan** (jawapan betul).
   - **% betul**.
   - **Kesukaran**: **Mudah** (80% atau lebih betul), **Sederhana** (40% hingga 79%), **Sukar** (kurang 40%).
   - **Diskriminasi**: menunjukkan sama ada soalan membezakan murid pandai dan lemah. Dikira apabila ada **10 kertas atau lebih**.
   - **Pengganggu popular**: pilihan salah yang paling banyak dipilih murid. Ini membantu anda melihat kesilapan biasa.
3. Soalan **Sukar** dan soalan dengan diskriminasi rendah ditanda dengan lencana **Sukar** atau **Diskriminasi rendah**.

> 📷 [Gambar: Skrin Analisis Item dengan lencana Sukar dan Diskriminasi rendah]

---

## 12. Tetapan

Klik ikon **Tetapan** (atau tab **Tetapan** di bar bawah) di skrin utama.

- **Nama sekolah**: nama yang dipaparkan pada kertas jawapan. Tulis nama penuh sekolah anda.
- **Tangkap auto semasa mengimbas**: hidupkan atau matikan tangkap automatik (kamera langsung sahaja).
- **Tetapan lanjutan**: buka hanya jika bacaan bulatan tidak tepat. Ubah **Ambang bulatan dihitamkan** dengan berhati-hati.
- **Sandaran**: lihat bahagian 14.
- **Padam semua data**: lihat amaran di bahagian 14.
- **Tentang**: menunjukkan versi app.

> 📷 [Gambar: Skrin Tetapan dengan bahagian Sandaran]

---

## 13. Duplikasi, padam ujian

### Duplikasi ujian

Gunakan **Duplikasi ujian** untuk membuat salinan ujian, contohnya apabila anda mahu susun atur baharu (kerana susun atur ujian asal dikunci selepas ada keputusan).

1. Di ringkasan ujian, klik **Duplikasi ujian**.
2. Mesej **Ujian diduplikasi.** akan muncul.

### Padam ujian

1. Di ringkasan ujian, klik **Padam ujian**.
2. Dialog **Padam ujian ini?** akan muncul. Ia memberi amaran bahawa semua keputusan akan hilang.
3. Klik **Padam** untuk sahkan. Tindakan ini **tidak boleh dibatalkan**.

Buat sandaran dahulu sebelum memadam.

---

## 14. Eksport CSV dan sandaran

### 14a. Eksport keputusan ke Excel (CSV)

1. Di skrin **Keputusan**, klik **Eksport CSV**.
2. Fail CSV akan dimuat turun, contohnya **keputusan-ujian-bulanan-3-20261116.csv**.
3. Buka fail itu dengan Excel. Lajur utama ialah **Bil, Kod Pelajar, Nama, Betul, Jumlah, Peratus** dan **S1** hingga **Sn** (jawapan setiap soalan).

Untuk analisis item, di skrin **Analisis item**, klik **Eksport CSV analisis**.

> Jika aksara Bahasa Melayu kelihatan pelik di Excel, buka Excel dahulu, kemudian pilih **Data > Dari Teks/CSV** dan pilih fail itu. Pastikan Encoding ialah **UTF-8**.

> 📷 [Gambar: Fail CSV dibuka dalam Excel dengan lajur Bil, Kod Pelajar, Nama dan Markah]

### 14b. Sandaran (backup) data

Data anda hanya ada dalam pelayar di peranti ini. Jika pelayar dikosongkan, komputer diformat atau telefon rosak, data akan **hilang**. Sebab itu sandaran **penting**.

**Buat sandaran berkala:**

1. Klik **Tetapan**.
2. Di bahagian **Sandaran**, klik **Muat turun sandaran**.
3. Fail **.json** akan dimuat turun. Simpan fail itu di **pemacu USB**, **Google Drive** atau tempat selamat lain. Tamatkan dengan menamakan fail ikut tarikh, contohnya **sandaran-2026-11-16.json**.
4. Ulang langkah ini sekurang-kurangnya **sekali seminggu** dan selepas setiap sesi semakan yang penting.

**Pulih data daripada sandaran:**

1. Klik **Tetapan**.
2. Di bahagian **Sandaran**, pilih mod:
   - **Gabung (langkau yang sama)**: tambah data daripada fail. Ujian yang sudah ada tidak diubah.
   - **Ganti semua data**: semua data sedia ada diganti dengan isi fail. App akan minta pengesahan.
3. Klik **Pulihkan daripada fail**, kemudian pilih fail **.json** anda.
4. Jika fail bukan sandaran yang sah, app memaparkan **Fail ini bukan sandaran yang sah. Data anda tidak diubah.**

**Jangan kosongkan data laman:** Jangan padam sejarah atau "data laman" dalam tetapan pelayar anda, dan jangan gunakan ciri **Padam semua data** melainkan anda sudah membuat sandaran. Jika tidak, semua ujian dan keputusan akan hilang.

> 📷 [Gambar: Bahagian Sandaran dalam Tetapan dengan butang Muat turun sandaran dan Pulihkan daripada fail]

---

## 15. Soalan lazim (FAQ) dan penyelesaian masalah

### S1. Saya tidak boleh log masuk. Di mana kata laluan?

Tiada log masuk dan tiada kata laluan. Buka app, terus gunakan. Jika laman tidak terbuka, lihat **S2**.

### S2. Pelayar memaparkan "tidak dapat dicapai" atau "halaman tidak wujud"

- Pastikan **start.bat** atau **start-lan.bat** masih berjalan (tetingkap hitam belum ditutup).
- Periksa alamat. Di komputer riba: **http://localhost:8000/**. Di telefon: alamat yang dipaparkan oleh start-lan.bat.
- Pastikan telefon disambung ke Wi-Fi yang sama.

### S3. Tetingkap hitam memaparkan "Address already in use" atau port 8000 digunakan

Maksudnya app sudah berjalan di tetingkap lain.

1. Cari tetingkap hitam yang lain dengan tajuk **OMR Semak Jawapan**, kemudian tutup.
2. Jika tidak jumpa, mulakan semula komputer riba.
3. Kemudian dwi-klik **start.bat** semula.

### S4. Kamera tidak dibenarkan atau app memaparkan "Kebenaran kamera ditolak"

1. Di pelayar, klik ikon **kunci** atau **tetapan laman** di sebelah alamat.
2. Tukar **Kamera** kepada **Benarkan**.
3. Muat semula halaman (tekan **F5** atau tarik ke bawah di telefon).

Jika tiada pilihan kamera, gunakan **Ambil foto / Pilih gambar**.

### S5. App memaparkan "Kamera langsung tidak tersedia" atau "Kamera langsung hanya berfungsi melalui localhost atau HTTPS"

Ini normal jika anda membuka app melalui alamat IP di telefon. Gunakan butang **Ambil foto / Pilih gambar**. Kamera langsung hanya berfungsi di komputer riba (localhost).

### S6. "Penanda sudut tidak dijumpai" (penanda tidak dijumpai)

Penyebab biasa dan cara membetulkan:

- **Penanda sudut terpotong atau tidak kelihatan.** Ambil gambar sekali lagi dengan keempat-empat sudut kertas dalam bingkai.
- **Cahaya terlalu malap atau ada bayang.** Ambil gambar di tempat yang lebih terang, tanpa bayang anda.
- **Kertas berkedut atau melengkung.** Ratakan kertas di atas meja.
- **Kertas dicetak dengan skala salah.** Cetak semula dengan **Skala 100%** dan **bukan Muatkan ke halaman**.
- **Kertas terlalu jauh atau terlalu dekat.** Dekatkan kamera supaya kertas memenuhi bingkai.
- **Kertas kosong atau bukan kertas OMR.** App hanya boleh membaca kertas yang dijana oleh app ini.

Klik **Cuba lagi** untuk mencuba semula.

### S7. "Kertas tidak dapat dibaca. Cuba lagi dengan cahaya yang lebih baik."

Ambil gambar sekali lagi. Pastikan cahaya cukup, kertas rata, dan tiada kesan jari di lensa kamera.

### S8. Soalan berganda: app menandakan **!** dan memaparkan "Berganda"

Ini bermaksud murid menghitamkan lebih daripada satu bulatan untuk soalan itu.

1. Semak kertas itu secara fizikal.
2. Jika jawapan memang berganda, biarkan. Ia dikira **salah**.
3. Jika anda pasti jawapan sebenar murid, klik soalan itu dan pilih jawapan yang betul. Soalan itu akan ditanda **Disunting**.

### S9. Soalan kosong: app menandakan **!** dan memaparkan "Kosong"

Kosong dikira **salah**. Jika murid sebenarnya sudah menjawab tetapi bulatan tidak dikesan, semak kertas dan betulkan soalan itu.

### S10. App salah membaca jawapan murid

Ketepatan membaca bergantung pada cara bulatan dihitamkan dan kualiti foto. Betulkan dengan cara ini:

1. Klik soalan yang salah dalam senarai.
2. Pilih jawapan sebenar.
3. Markah akan dikira semula.

Jika kesilapan kerap berlaku, periksa cara murid menghitamkan bulatan (bahagian 8) dan cahaya semasa imbasan.

### S11. Saya tersilap tekan "Simpan sebagai baharu" dan ada dua keputusan untuk murid yang sama

Pergi ke skrin **Keputusan**, klik baris yang berlebihan, kemudian klik **Padam**.

### S12. Data hilang: ujian dan keputusan tidak ada

Kemungkinan penyebab:

- **Alamat berbeza.** Data disimpan mengikut alamat laman. **http://localhost:8000/** dan **http://192.168.1.25:8000/** ialah dua tempat berbeza. Buka alamat yang sama seperti sebelum ini.
- **Pelayar berbeza.** Chrome dan Edge menyimpan data secara berasingan. Guna pelayar yang sama.
- **Data pelayar dikosongkan**, atau **Padam semua data** telah diklik.
- **Telefon atau komputer berbeza.** Data tidak dikongsi antara peranti.

Jika data benar-benar hilang, pulihkan daripada fail **sandaran .json** (lihat bahagian 14b).

### S13. Adakah app boleh digunakan tanpa internet?

Ya, selepas kali pertama app dibuka menggunakan **localhost**. Di telefon melalui alamat IP, app mungkin tidak berfungsi sepenuhnya tanpa internet.

### S14. Adakah foto murid disimpan?

Tidak. Foto kertas tidak disimpan secara lalai. Hanya jawapan dan markah disimpan.

### S15. Soalan saya lebih daripada 60, atau saya mahu pilihan A hingga E untuk sesetengah soalan sahaja

App hanya menyokong **10 hingga 60 soalan** dan pilihan **A–D** atau **A–E** bagi keseluruhan ujian. Soalan berbilang set (A/B), soalan padanan, dan soalan bertulis belum disokong.

### S16. Adakah nama murid dibaca secara automatik?

Tidak. App tidak membaca tulisan tangan. Gunakan **Senarai nama** (bahagian 6), atau taip nama murid semasa menyemak. Anda boleh melihat keratan nama pada kertas di skrin **Semak Imbasan**.

---

## Lampiran: Ringkasan langkah

1. Mula app: **start.bat** (komputer riba) atau **start-lan.bat** (telefon).
2. **+ Ujian Baharu** → isi borang → **Cipta ujian**.
3. **Skema jawapan** → masukkan jawapan betul.
4. **Senarai nama** (pilihan) → **Simpan senarai**.
5. **Cetak templat** → **Cetak / Simpan PDF** (A4, Margin Tiada, Skala 100%).
6. Murid hitamkan bulatan dengan pensel 2B.
7. **Imbas kertas** → **Tangkap** atau **Ambil foto / Pilih gambar**.
8. Semak → betulkan jika perlu → **Simpan dan imbas seterusnya**.
9. **Keputusan** dan **Analisis item** → **Eksport CSV**.
10. **Tetapan** → **Muat turun sandaran** (sekurang-kurangnya seminggu sekali).
