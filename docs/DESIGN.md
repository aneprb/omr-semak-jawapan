# DESIGN: OMR Semak Jawapan

Fail rujukan: `css/app.css` (token + komponen), `css/print.css`, `js/ui/strings.ms.js`. Tiada fon luar, tiada build.

## 1. Arah visual: "kertas, dakwat, grafit"
Rupa app diambil daripada kertas OMR itu sendiri, bukan daripada templat dashboard.
- **Bulatan ialah motif tunggal.** Butang pilihan A–E, butang tangkap, lencana betul dan butang radio semuanya bulatan; bulatan "dihitamkan" (grafit pekat) = dipilih. Elemen lain tenang dan rata.
- **Dakwat biru tua** (`--ink` #17305c) untuk header dan tindakan utama, seperti pen peperiksaan; latar kelabu-biru sejuk (bukan krim); grafit untuk bulatan terisi.
- **Satu momen berani:** skrin imbas (bingkai A4 gelap dengan 4 sudut yang bertukar warna) dan nombor markah besar pada skrin semak. Skrin lain disiplin dan senyap.
- Tipografi: tindanan `system-ui` (luar talian). Angka guna `ui-rounded` + `tabular-nums` supaya markah/lajur sejajar. Skala: 13 / 15 / 17 / 20 / 26 / 52 px. Huruf kecil ayat biasa, tiada HURUF BESAR.
- Radius: 8 (input kecil), 12 (butang, kad), 20 (markah, dialog), bulat (pilihan). Bayang hanya pada toast/dialog/pratonton kertas.

## 2. Token (ringkasan; sumber: `:root` dalam app.css)
| Peranan | Cerah | Gelap | Kontras (teks pada latar) |
|---|---|---|---|
| Latar / permukaan | #f3f5f7 / #fff | #0e141b / #17202a | - |
| Teks / pudar | #101828 / #475467 | #e8edf3 / #a3b0c0 | >= 7:1 / >= 7:1 |
| Utama | #1b4db1 (teks putih) | #8cb4ff (teks #0b1b3a) | 7.6:1 / 9:1 |
| Betul | #14703a atas #dcf3e3 | #6fdc98 atas #12301f | >= 5:1 |
| Salah | #b42318 atas #fde4e1 | #ff9a90 atas #3b1713 | >= 5:1 |
| Semak | #7a4a00 atas #fdecb5, garis #c98a00 | #ffd46b atas #3a2c05 | >= 5:1 |
| Fokus | #ff7a00 cincin 3px, offset 2px | #ffb15c | kelihatan pada semua latar |
Jarak: 4/8/12/16/24/32/48. Sasaran sentuh `--tap: 44px`; butang imbas/simpan 56px. Mod gelap automatik melalui `prefers-color-scheme`; skrin imbas sentiasa gelap.

### Buta warna: kod bentuk + simbol + warna
| Status | Warna | Bentuk | Simbol | Overlay pada foto |
|---|---|---|---|---|
| Betul | hijau | bulatan penuh | ✓ | cincin hijau tebal sekeliling bulatan jawapan |
| Salah | merah | segi empat bucu bulat | ✗ | cincin merah pada jawapan pelajar + cincin hijau putus pada jawapan betul |
| Semak (kosong/berganda/tidak pasti) | kuning | cincin putus-putus | ! | cincin kuning putus-putus; kosong = tiada tanda lain, berganda = cincin pada setiap bulatan terisi |
`overlay-canvas.js` mesti menggunakan bentuk garisan yang sama (penuh / segi empat / putus) dan melukis simbol kecil di tepi nombor soalan. Warna tidak pernah satu-satunya penanda; setiap baris soalan juga ada teks (Betul/Salah/Semak).

## 3. Komponen (kelas dalam app.css)
- **Butang:** `.btn` (utama), `.btn--secondary`, `.btn--danger`, `.btn--ghost`, `.btn--block`, `.btn--lg`, `.btn-icon`. Satu `.btn` utama setiap skrin.
- **Kad / senarai:** `.card`, `.card--hero`, `.list > li > .list-item` (anak panah automatik), `.list-item__title/__sub`.
- **Borang:** `.field` + label di atas + `.input/.select/.textarea`; ralat `.field--error` dengan `.field__error` (✗ + teks, bukan warna sahaja); `.seg` untuk A–D/A–E; `.check`.
- **Grid pilihan:** `.choices > .choice[aria-pressed]` (bulatan 52px, terisi grafit bila dipilih), `.choice--blank` (segi empat putus "Kosong"), `.choice--key` (cincin hijau = skema).
- **Status:** `.mark--ok/--bad/--warn`, `.legend`, `.badge--ok/--bad/--warn`, `.score` (+ `__value`, `__pct`).
- **Jadual:** `.table-wrap > .table` (tatal mendatar di telefon, pengepala melekit, `th button` untuk isih), `.bar` untuk taburan.
- **Maklum balas:** `.toast-host > .toast`, `dialog` (elemen asli `<dialog>`, `showModal()`), `.banner` (kemas kini), `.empty` (keadaan kosong: 3 bulatan + satu ayat + satu butang), `.skeleton` (memuat).
- **Navigasi:** `.header` (tajuk + butang kembali), `.tabbar` (bawah di telefon, bar atas di >= 768px).
- **Imbas:** `.scan`, `.frame` (+ `data-found="0..4"`, `data-state="hold"`), `.scan__status`, `.shutter`.

## 4. Responsif
- **375px:** satu lajur, tab bawah, jadual tatal mendatar, bar tindakan melekit di bawah.
- **768px:** tab menjadi bar atas, `.grid-2` untuk kad, toast di sudut bawah.
- **1280px:** `.main--wide .split` (foto semak di kiri, senarai soalan di kanan); keputusan/analisis lebar 1100px. Skrin imbas guna `object-fit: contain`.
Semua interaktif ada `:focus-visible` (cincin oren 3px). `prefers-reduced-motion` mematikan animasi (denyut bingkai, shimmer).

## 5. Peta skrin dan wireframe
Navigasi: Senarai `#/` -> Ujian Baharu -> Ringkasan `#/ujian/:id` -> {Skema, Roster, Templat, Imbas -> Semak -> (Simpan) Imbas semula | Keputusan -> Butiran, Analisis}. Tab bawah: Ujian | Tetapan (dalam ujian: Imbas | Keputusan | Analisis | Skema). Semua skrin untuk guru (tiada peranan lain).

### `#/` Senarai ujian
```
[ Semak Jawapan OMR          ⚙ ]
 Ujian Saya
 +---------------------------+
 | Ujian Bulanan 3        >  |
 | 40 soalan · 32 kertas     |
 +---------------------------+
 (kosong: ○○○ "Belum ada ujian" + [Ujian Baharu])
 [        + Ujian Baharu       ]   <- utama
 [ Ujian | Tetapan ]
```
### `#/ujian/baru` Borang
```
[<  Ujian Baharu ]
 Nama ujian*  [____________]  (ralat: ✗ Isi nama ujian ...)
 Kelas [____]  Mata pelajaran [____]
 Bilangan soalan [ 40 ]   Pilihan [A–D|A–E]   Digit kod [ 4 ]
 [         Cipta ujian        ]
```
### `#/ujian/:id` Ringkasan
```
[<  Ujian Bulanan 3 ]
 +kad hero: Skema 40/40 diisi · 32 kertas diimbas+
 [      Imbas kertas  (56px, utama)      ]
 Senarai: Skema jawapan > Keputusan > Analisis item >
          Cetak templat > Senarai nama > Eksport CSV
 [Duplikasi]            [Padam (dialog pengesahan)]
```
Jika skema belum lengkap: butang Imbas tidak aktif + teks "Lengkapkan skema dahulu...".
### `#/ujian/:id/skema`
```
[<  Skema Jawapan ]   Ketik | Tampal | Imbas kertas
 Soalan 7                       12/40 diisi  ▓▓░░░
 ( A ) ( B ) ( C ) ( D ) ( E )  [ Kosong ]
 [ Sebelumnya ]        [ Seterusnya ]
 grid nombor soalan 1..40 (terisi = bulatan grafit)
 Tampal: textarea + [Guna skema ini] + ralat huruf tidak sah
```
### `#/ujian/:id/roster`
Textarea `kod,nama` + kiraan "N pelajar" + [Simpan senarai] + [Kosongkan]; ralat baris tidak sah di bawah textarea.
### `#/ujian/:id/templat`
Pratonton A4 (`.sheet-preview` > `.sheet` SVG), kod susun atur, panduan "Margin Tiada, Skala 100%", [Cetak / Simpan PDF] utama. Cetak guna `print.css` (hitam putih, margin 0, satu halaman).

### `#/ujian/:id/imbas` (skrin utama 1)
```
+----------------------------------+
| ✕ Tutup   Ujian Bulanan 3   🔦 A |  <- gelap, ✕ 44px
|  ┌                          ┐    |
|                                  |
|     video belakang, bingkai      |
|     A4 (210:297) 88% tinggi     |
|  └                          ┘    |
|  [ 4 penanda dikesan, tahan… ]   |  <- status, aria-live=polite
|  (auto)   (  ◯ tangkap  )  [📷]  |
+----------------------------------+
```
Keadaan bingkai: `data-found=0` putih ("Cari penanda…"); 1–3 kuning ("2 daripada 4 penanda dikesan"); 4 hijau + denyut ("tahan…"); selepas tangkap "Membaca kertas…" dengan spinner. Sudut juga berubah ketebalan (pulse) supaya bukan warna sahaja. Tanpa kamera/ditolak/HTTP LAN: mesej ringkas + butang besar "Ambil foto / Pilih gambar" sebagai tindakan utama. Ralat `NO_MARKERS`: mesej + [Cuba lagi].

### `#/ujian/:id/semak` (skrin utama 2)
```
[<  Semak Imbasan ]
 +-----------+  Kod [1001]   Nama [Pelajar Ujian 1__]
 |   35/40   |  (padan senarai ✓)  [keratan nama kertas]
 |   87.5%   |
 +-----------+
 [ foto + overlay ✓ ✗ ! ]   legenda: ✓ Betul  ✗ Salah  ! Semak
 ! 3 soalan perlu disemak
 Senarai soalan (baris 56px, ketik untuk betulkan):
  [ 7 ] Pelajar: B   Skema: C     ✗ Salah
  [12 ] Pelajar: -   Skema: A     !  Kosong
 -- lembaran bawah (dialog) "Betulkan soalan 7":
  ( A )( B )( C )( D )( E ) [Kosong]  [Selesai]
[ Imbas semula ]  [ Simpan dan imbas seterusnya ] (sticky)
```
Pendua kod: dialog "Ganti / Simpan sebagai baharu". Baris disunting ada lencana "Disunting". Pada 1280px: foto kiri, senarai kanan (`.split`).

### `#/ujian/:id/keputusan`
Kad statistik (purata, median, tertinggi, terendah, sisihan piawai), jadual Bil/Kod/Nama/Markah/% dengan pengepala boleh diisih, penanda suntingan, [Eksport CSV]. Ketik baris -> `#/ujian/:id/keputusan/:rid`.
### `#/ujian/:id/keputusan/:rid`
Markah besar, nama/kod boleh diedit, senarai soalan sama seperti semak tetapi tanpa foto, [Simpan], [Padam] (dialog).
### `#/ujian/:id/analisis`
Taburan markah (bar `.bar`), jadual per soalan: Soalan, Jawapan, % betul (+bar), Kesukaran (lencana Mudah/Sederhana/Sukar, teks), Diskriminasi, Pengganggu. Baris Sukar atau diskriminasi < 0.2 diberi lencana "Sukar"/"Diskriminasi rendah" (bukan warna sahaja). [Eksport CSV analisis].
### `#/tetapan`
Nama sekolah, suis tangkap auto, "Tetapan lanjutan" (ambang), Sandaran (muat turun / pulihkan Gabung|Ganti), Padam semua data (dialog), Tentang + versi.

## 6. Nada teks
Ayat biasa, kata kerja aktif, istilah tetap: **ujian, skema, kertas, imbas, semak, simpan, keputusan, analisis**. Tindakan yang sama kekal nama yang sama (Simpan -> toast "Keputusan disimpan."). Ralat menyatakan apa berlaku dan cara membetulkan; tiada permohonan maaf. Keadaan kosong mengajak bertindak.

## 7. Nota untuk pembangun
- Gunakan `S` dari `strings.ms.js`; jangan tulis teks dalam pandangan. Fungsi dalam `S` menerima nilai interpolasi.
- Dialog: `<dialog>` + `showModal()`; pulihkan fokus ke pencetus selepas tutup. Toast: `role="status"`; ralat `role="alert"`.
- Bingkai imbas: tetapkan `data-found` (0–4) dan `data-state="hold"` daripada keputusan `detect`; status teks dalam `.scan__status[aria-live]`.
- Elemen `.sheet` membungkus SVG templat supaya `print.css` berfungsi.
- Belum disahkan pada peranti sebenar: kontras dihitung bukan diukur; semak dengan Lighthouse pada Fasa 4.
