# PLAN: OMR Semak Jawapan (PWA)

Versi: 1.0. Tarikh: 2026-11-16. Rujukan: `docs/SPEC.md` (kriteria penerimaan C1–C7).
Bahagian 4 (Kontrak) ialah **SUMBER KEBENARAN** untuk semua agent. Sebarang perubahan kontrak mesti dikemas kini di sini dahulu.

---

## 1. Tech stack dan sebab

| Lapisan | Pilihan | Sebab |
|---|---|---|
| App | HTML + CSS + JavaScript vanilla (ES modules), tiada build, tiada npm | Node.js tiada pada laptop pemilik; ES modules disokong semua pelayar sasaran |
| Enjin OMR | JS tulen atas `Uint8ClampedArray` (tiada OpenCV.js) | OpenCV.js ~8 MB terlalu berat untuk Android bajet; algoritma yang diperlukan (ambang adaptif, komponen bersambung, homografi 4 titik, pensampelan) kecil (< 100 KB) dan boleh diuji |
| Pemprosesan latar | Module Web Worker (`new Worker(url, {type:'module'})`) | Imbasan ~0.5–1.5 s tidak membekukan UI |
| Storan | IndexedDB (API asli, pembalut kecil sendiri) | Tiada backend; data kekal di peranti; tiada pustaka diperlukan |
| Cetak | SVG dalam unit mm + `@media print` + `window.print()` | Geometri tepat, "Simpan sebagai PDF" percuma dalam pelayar |
| PWA | `manifest.json` + `sw.js` (cache-first, pra-cache berversi) | Luar talian + boleh dipasang |
| Pelayan setempat | `tools/serve.py` (subkelas `http.server`, Python 3.14 stdlib) melalui `start.bat` | Python ada; membetulkan MIME `.js` yang kadang-kadang salah pada Windows (registry) yang memecahkan ES modules |
| Alat ujian | Harness ujian pelayar sendiri (`tests/index.html`) + Python (Pillow) untuk jana kertas sintetik + Edge headless untuk larian automatik | Tiada Node; Edge sentiasa ada pada Windows |
| Pustaka luaran | **Tiada dalam v1.** Jika kemudian perlu, salin fail dengan versi tepat dari cdnjs/jsdelivr ke `vendor/<nama>@<versi>/` dan catat URL + SHA-256 dalam `vendor/README.md`. Runtime tidak sekali-kali memuat dari CDN. | Luar talian, tiada pihak ketiga |

---

## 2. Seni bina

```
+--------------------------------------------------------------------------------+
|  index.html  (shell, nav)                    sw.js + precache-manifest.js       |
|     |                                         (cache-first, luar talian)        |
|  js/app.js  -- router hash (#/...) --> js/ui/views/*.js                         |
|     |                                                                           |
|     +--> js/ui/camera.js -----------------+  getUserMedia / <input capture>     |
|     |        (bingkai 640px, stabil 3x)   |                                     |
|     |                                     v                                     |
|     |                         js/omr/client.js  (Promise API ke worker)         |
|     |                                     |  postMessage (ArrayBuffer transfer) |
|     |                                     v                                     |
|     |                         js/omr/worker.js  (module worker)                 |
|     |                                     |                                     |
|     |      +------------------ ENJIN OMR (JS tulen, tiada DOM) ---------------+ |
|     |      | layout.js  image.js  threshold.js  components.js  markers.js     | |
|     |      | homography.js  sampler.js  decide.js  scan.js  config.js         | |
|     |      +------------------------------------------------------------------+ |
|     |                                                                           |
|     +--> js/template/render-sheet.js  (Layout -> SVG mm)  --> window.print()    |
|     +--> js/grading/{grade,stats,items}.js   (fungsi tulen)                     |
|     +--> js/data/{db,repo,backup,csv}.js     --> IndexedDB "omr-semak-jawapan"  |
+--------------------------------------------------------------------------------+

Aliran imbasan:
 foto/bingkai -> ImageData RGBA -> [worker] downscale(1600) -> toGray -> findMarkers
   -> computeHomography(mm->px) -> semak orientasi (180°) -> kalibrasi putih/hitam
   -> sampleFills (setiap bulatan) -> decide (OK/BLANK/MULTIPLE/UNCERTAIN)
   -> ScanResult -> [UI] gradeSheet(key) -> skrin semak (overlay + edit) -> saveResult
```

Prinsip:
- `js/omr/*`, `js/grading/*`, `js/data/csv.js` adalah **fungsi tulen** tanpa DOM/`window`/`document` supaya boleh dijalankan dalam worker dan harness ujian. Input imej sentiasa objek mirip `ImageData` (`{width, height, data}`), bukan elemen kanvas.
- Satu fungsi `buildLayout` menjana geometri untuk **kedua-dua** penjana templat dan pengimbas. Tiada nombor geometri disalin ke tempat lain (kecuali port rujukan Python yang disahkan dengan fixture emas).
- Tiada `console.log` data pelajar. Gunakan `js/util/log.js` (`debug(tag, msg)` yang hanya aktif jika `localStorage.omrDebug === '1'`, dan hanya untuk mesej teknikal seperti masa/ralat).

---

## 3. Model data (IndexedDB)

Pangkalan data: `omr-semak-jawapan`, versi `1`. Semua `id` ialah UUID v4 (`crypto.randomUUID()`, sandaran `js/util/uuid.js`). Masa dalam ISO 8601 (`new Date().toISOString()`).

| Stor | keyPath | Indeks |
|---|---|---|
| `tests` | `id` | `updatedAt` |
| `results` | `id` | `testId` (`testId`), `testId_code` (`['testId','studentCode']`, tidak unik) |
| `settings` | `key` | — |

### 3.1 `Test`
```js
{
  id: "uuid",
  name: "Ujian Bulanan Sains Mac",        // 1–80 aksara, wajib
  subject: "Sains" | "",                   // pilihan
  className: "4 Bestari" | "",             // pilihan
  layoutConfig: { version: 1, numQuestions: 40, numChoices: 5, idDigits: 4 },
  key: ["A","C",null, ...],                // panjang = numQuestions; null = belum diisi
  roster: [{ code: "0012", name: "Pelajar Sintetik 1" }],   // pilihan, boleh []
  locked: false,                           // true apabila ada >= 1 keputusan (layoutConfig tidak boleh diubah)
  createdAt: "ISO", updatedAt: "ISO"
}
```

### 3.2 `Result`
```js
{
  id: "uuid",
  testId: "uuid",
  studentCode: "0012" | "",                // dari bulatan ID atau taipan guru
  studentName: "..." | "",                 // dari roster atau taipan guru
  scanned: [ { q: 1, choice: "A"|null, status: "OK"|"BLANK"|"MULTIPLE"|"UNCERTAIN" }, ... ],
  final:   ["A", null, "C", ...],          // jawapan muktamad selepas pembetulan (panjang N)
  manualEdits: [3, 17],                    // nombor soalan yang diubah guru
  correct: 31, total: 40, percent: 77.5,   // dikira oleh gradeSheet(final, test.key)
  scannedAt: "ISO", updatedAt: "ISO"
}
```
Foto tidak disimpan. `fills` mentah tidak disimpan (hanya dalam memori semasa semakan).

### 3.3 `settings`
```js
{ key: "schoolName", value: "SMK Contoh" }
{ key: "thresholds", value: { blank: 0.20, mark: 0.45, multiRatio: 0.75, minGap: 0.20 } }  // pilihan, lalai dari config.js
{ key: "autoCapture", value: true }
{ key: "lastBackupAt", value: "ISO" }
```

### 3.4 Format sandaran JSON
```js
{
  app: "omr-semak-jawapan",
  schemaVersion: 1,
  exportedAt: "ISO",
  tests: [Test, ...],
  results: [Result, ...],
  settings: [{key, value}, ...]
}
```
Nama fail: `omr-sandaran-YYYYMMDD-HHmm.json`.

Hubungan: `Test 1 — N Result` (`Result.testId`). Padam ujian = padam semua keputusannya (dalam satu transaksi).

---

## 4. Kontrak antara modul (SUMBER KEBENARAN)

Jenis asas:
```ts
type Choice   = "A" | "B" | "C" | "D" | "E";
type Status   = "OK" | "BLANK" | "MULTIPLE" | "UNCERTAIN";
type Pt       = { x: number, y: number };          // piksel imej, asal kiri-atas, y ke bawah
type RGBAImage = { width: number, height: number, data: Uint8ClampedArray };   // 4 bait/piksel (ImageData)
type GrayImage = { width: number, height: number, data: Uint8ClampedArray };   // 1 bait/piksel, 0=hitam 255=putih
type BinImage  = { width: number, height: number, data: Uint8Array };          // 1 = dakwat, 0 = kertas
type ErrorCode = "LAYOUT_INVALID" | "IMAGE_TOO_SMALL" | "NO_MARKERS" | "BAD_GEOMETRY" | "LOW_CONTRAST";
```

### 4.1 Format susun atur templat (`js/omr/layout.js`) — KRITIKAL

Sistem koordinat kanonik: **milimeter pada halaman A4 potret 210 × 297**, asal kiri-atas, y ke bawah. Semua nilai dibundar ke 0.01 mm.

```js
export const LAYOUT_VERSION = 1;
export function buildLayout(config) -> Layout      // melempar Error dengan .code = "LAYOUT_INVALID"
export function layoutCode(config) -> string        // "Q40-C5-ID4"
export function validateLayoutConfig(config) -> { ok: boolean, errors: string[] }
```
`config = { numQuestions: 10..60 (integer), numChoices: 4|5, idDigits: 0..6 }`

```js
Layout = {
  schema: "omr-layout", version: 1,
  code: "Q40-C5-ID4",
  config: { numQuestions, numChoices, idDigits },
  page: { widthMm: 210, heightMm: 297 },
  markers: [                                   // SENTIASA susunan TL, TR, BR, BL
    { id: "TL", cx: 14,  cy: 14,  size: 8 },
    { id: "TR", cx: 196, cy: 14,  size: 8 },
    { id: "BR", cx: 196, cy: 283, size: 8 },
    { id: "BL", cx: 14,  cy: 283, size: 8 }
  ],
  orientationBar: { x: 90, y: 11, w: 30, h: 6 },   // segi empat hitam padat, tengah atas
  regions: {
    title:     { x: 22, y: 22, w: 110, h: 8 },
    name:      { x: 22, y: 32, w: 110, h: 10 },    // keratan untuk paparan semakan
    className: { x: 22, y: 44, w: 110, h: 10 },
    date:      { x: 22, y: 56, w: 110, h: 8 }
  },
  choices: ["A","B","C","D","E"].slice(0, numChoices),
  bubbleRadius: 2.5,                           // jawapan (diameter 5 mm)
  questions: [                                 // panjang = numQuestions, q bermula 1
    { q: 1, col: 0, row: 0, labelX: 22, labelY: 100,
      bubbles: [ { choice: "A", cx: 34, cy: 100, r: 2.5 }, ... ] }
  ],
  choiceHeaders: [ { col: 0, choice: "A", x: 34, y: 93 }, ... ],
  idBlock: null | {                            // null jika idDigits = 0
    label: { x: 141, y: 24 },
    writeBoxes: [ { x: 141.5, y: 27, w: 5, h: 6 }, ... ],   // satu kotak per digit, untuk tulis tangan
    digits: [                                  // panjang = idDigits
      { index: 0, bubbles: [ { digit: 0, cx: 144, cy: 38, r: 2.1 }, ... { digit: 9, cx: 144, cy: 87.5, r: 2.1 } ] }
    ]
  },
  footer: { x: 105, y: 272, text: "Hitamkan bulatan sepenuhnya dengan pensel 2B. Jangan lipat atau conteng penanda sudut." }
}
```

Formula geometri (dilaksana sama dalam `layout.js` dan `tools/omr_layout.py`):
- Penanda: segi empat hitam padat sisi 8 mm, pusat seperti di atas. Homografi menggunakan **pusat** penanda.
- Lajur jawapan: `cols = ceil(numQuestions / 20)`; soalan `q` (1-based): `col = floor((q-1)/20)`, `row = (q-1) % 20`.
- `colX = 22 + col * 58`; `labelX = colX`; `cy = labelY = 100 + row * 8`.
- Bulatan pilihan `k` (0-based): `cx = colX + 12 + k * 7`, `r = 2.5`.
- Kepala pilihan: `x = colX + 12 + k * 7`, `y = 93` (huruf A–E dicetak di atas setiap lajur). **Tiada huruf di dalam bulatan.**
- Blok ID (jika `idDigits > 0`): digit lajur `j`: `cx = 144 + j * 7`; baris digit `d` (0–9): `cy = 38 + d * 5.5`, `r = 2.1`. `writeBoxes[j] = { x: 141.5 + j*7, y: 27, w: 5, h: 6 }`.
- Garis luar bulatan dicetak 0.3 mm kelabu `#555`; penanda dan bar orientasi `#000` padat.
- Kawasan kosong rujukan putih (untuk kalibrasi): titik `(colX + 8, cy)` di antara label nombor dan bulatan A bagi setiap soalan.

Ujian fixture emas: `tests/fixtures/layouts/Q10-C4-ID0.json`, `Q20-C5-ID4.json`, `Q40-C5-ID6.json`, `Q60-C4-ID2.json` dijana oleh `python tools/omr_layout.py --golden tests/fixtures/layouts`. Ujian JS membandingkan `markers`, `orientationBar`, `regions`, `questions`, `idBlock` (toleransi 0.01).

### 4.2 Fungsi awam enjin OMR

`js/omr/config.js`
```js
export const DEFAULTS = {
  maxSide: 1600,             // imej diskala turun supaya sisi terpanjang <= 1600 px
  detectMaxSide: 800,        // resolusi untuk pengesanan penanda
  minSide: 600,              // di bawah ini -> IMAGE_TOO_SMALL
  thresholdWindowFrac: 1/8,  // tetingkap ambang adaptif = ganjil(round(min(w,h) * frac)); MESTI > saiz penanda
  thresholdC: 7,             // piksel dakwat jika gray < purata_tempatan - C
  markerSideFrac: [0.008, 0.08],   // sisi penanda (sqrt luas) relatif min(w,h)
  markerMinFill: 0.45,       // luas / luas kotak sempadan (tahan putaran ±30°)
  markerAspect: [0.6, 1.67], // nisbah nilai eigen kovarians (bentuk isotropik)
  markerAreaSpread: 3.0,     // luas maks / luas min antara 4 penanda terpilih
  minContrast: 40,           // putih - hitam (aras kelabu) ; di bawah -> LOW_CONTRAST
  sampleRadiusFrac: 0.6,     // pensampelan dalam cakera 0.6 r (elak garis luar bulatan)
  sampleGrid: 7,             // grid 7x7 dalam cakera (~37 titik)
  thresholds: { blank: 0.20, mark: 0.45, multiRatio: 0.75, minGap: 0.20 }
};
```

`js/omr/image.js`
```js
export function downscale(img: RGBAImage, maxSide: number) -> RGBAImage   // purata kotak; kembalikan img asal jika sudah kecil
export function toGray(img: RGBAImage) -> GrayImage                      // Y = (77R + 150G + 29B) >> 8
export function bilinear(gray: GrayImage, x: number, y: number) -> number // 0..255; luar imej -> 255
```

`js/omr/threshold.js`
```js
export function integralImage(gray: GrayImage) -> Float64Array          // (w+1)*(h+1)
export function adaptiveThreshold(gray: GrayImage, { window: number, c: number }) -> BinImage
```

`js/omr/components.js`
```js
export function labelComponents(bin: BinImage) -> Component[]   // 8-ketersambungan, tindanan eksplisit (tiada rekursi)
Component = { label, area, minX, minY, maxX, maxY, cx, cy, fill /*area/bboxArea*/, eig1, eig2 /*kovarians*/ }
```

`js/omr/markers.js`
```js
export function findMarkers(gray: GrayImage, opts = DEFAULTS) -> MarkerResult
MarkerResult = {
  ok: boolean,
  corners: [Pt, Pt, Pt, Pt] | null,     // TL, TR, BR, BL (pusat penanda, piksel imej input)
  error?: "NO_MARKERS" | "BAD_GEOMETRY",
  candidates: number                     // untuk diagnostik
}
```
Algoritma: ambang adaptif -> komponen -> tapis (saiz, `fill`, `eig1/eig2`) -> bagi setiap sudut imej ambil 3 calon paling ekstrem (TL: min `x+y`; TR: maks `x-y`; BR: maks `x+y`; BL: maks `y-x`) -> uji semua gabungan (≤ 81) -> pilih gabungan sah dengan skor terbaik. Sah = sisi empat cembung, luas ≥ 15% imej, tiada sudut dalaman < 45° atau > 135°, `markerAreaSpread` dipatuhi, nisbah sisi purata (lebar/tinggi) dalam 0.5–1.0 (A4 potret ≈ 0.707, dengan perspektif).

`js/omr/homography.js`
```js
export function computeHomography(src: Pt[4], dst: Pt[4]) -> number[9] | null   // baris-utama, h[8] = 1; null jika singular
export function applyHomography(H: number[9], x: number, y: number) -> Pt
export function invertHomography(H: number[9]) -> number[9] | null
```
Konvensyen: dalam `scanImage`, `H` memetakan **mm (kanonik) -> piksel imej input asal** (bukan imej diskala).

`js/omr/sampler.js`
```js
export function calibrate(gray: GrayImage, H, layout) -> { white: number, black: number, contrast: number }
  // white = median kelabu pada titik rujukan putih; black = median kelabu di 50% dalam setiap penanda
export function sampleFill(gray: GrayImage, H, cx: number, cy: number, r: number, cal, opts) -> number
  // 0..1 = purata clamp((white - g) / (white - black), 0, 1) pada titik grid dalam cakera r*sampleRadiusFrac
export function sampleLayout(gray: GrayImage, H, layout, cal, opts) -> { answerFills: number[][], idFills: number[][] }
  // answerFills[q-1][k], idFills[j][d]
export function checkOrientation(gray: GrayImage, H, layout) -> boolean   // true = kertas terbalik 180°
```

`js/omr/decide.js`
```js
export function decideRow(fills: number[], labels: string[], t = DEFAULTS.thresholds)
  -> { choice: string|null, status: Status, selected: string[] }
```
Peraturan (susun `fills` menurun: `top`, `second`):
1. `top < t.blank` -> `BLANK`, `choice = null`, `selected = []`.
2. bilangan `fills >= t.mark` ≥ 2 **dan** `second >= top * t.multiRatio` -> `MULTIPLE`, `choice = null`, `selected` = semua label dengan `fill >= t.mark`.
3. `top < t.mark` **atau** `top - second < t.minGap` -> `UNCERTAIN`, `choice` = label `top` (cadangan), `selected = [choice]`.
4. selainnya -> `OK`, `choice` = label `top`.

`js/omr/scan.js` (titik masuk utama)
```js
export function scanImage(img: RGBAImage, layout: Layout, opts?: Partial<typeof DEFAULTS>) -> ScanResult   // tidak pernah melempar; ralat dalam .error
export function detectMarkers(img: RGBAImage, opts?) -> DetectResult  // laluan pantas untuk bingkai langsung (tiada pensampelan)

ScanResult = {
  ok: boolean,
  error: ErrorCode | null,
  corners: [Pt,Pt,Pt,Pt] | null,      // TL,TR,BR,BL selepas pembetulan orientasi, piksel imej input asal
  rotated180: boolean,
  homography: number[9] | null,       // mm -> px imej input asal
  quality: { white: number, black: number, contrast: number, ms: number },
  answers: Array<{ q: number, choice: Choice|null, status: Status, selected: Choice[], fills: number[] }>,  // panjang N
  studentId: { value: string|null, digits: Array<{ digit: number|null, status: Status }> }  // value null jika mana-mana digit bukan OK; idDigits=0 -> { value: null, digits: [] }
}
DetectResult = { found: boolean, corners: [Pt,Pt,Pt,Pt] | null, error: ErrorCode | null }
```
Jika `ok === false`: `answers = []`, `studentId = { value: null, digits: [] }`.

`js/omr/overlay.js` (tulen, tiada DOM)
```js
export function projectLayout(H: number[9], layout: Layout) -> {
  answers: Array<Array<{ choice, x, y, rPx }>>,   // pusat bulatan dalam piksel imej
  idDigits: Array<Array<{ digit, x, y, rPx }>>,
  regions: { name: Pt[4], className: Pt[4] }      // sudut poligon untuk keratan
}
```

### 4.3 Protokol worker (`js/omr/worker.js` <-> `js/omr/client.js`)
```js
// utama -> worker
{ type: "scan",   id: number, image: { width, height, buffer: ArrayBuffer }, layout: Layout, opts?: object }   // buffer dipindah (transfer)
{ type: "detect", id: number, image: { width, height, buffer: ArrayBuffer }, opts?: object }
// worker -> utama
{ type: "scanResult",   id, result: ScanResult }
{ type: "detectResult", id, result: DetectResult }
{ type: "error",        id, message: string }          // hanya pepijat tidak dijangka
```
`client.js`:
```js
export function scan(imageData: ImageData, layout, opts?) -> Promise<ScanResult>
export function detect(imageData: ImageData, opts?) -> Promise<DetectResult>   // jika permintaan detect lama belum selesai, bingkai baharu dilangkau
export function terminate() -> void
```
Sandaran: jika `Worker` modul gagal dicipta, `client.js` memanggil `scanImage` terus di utas utama.

### 4.4 Kamera (`js/ui/camera.js`, pembangun-mobile)
```js
export function cameraSupported() -> boolean        // window.isSecureContext && !!navigator.mediaDevices?.getUserMedia
export async function startCamera(videoEl, { facingMode: "environment", width: 1920, height: 1080 }) -> MediaStream
export function stopCamera(stream) -> void
export function grabFrame(videoEl, maxSide = 640 | 1600) -> ImageData
export function createAutoCapture({ onStatus(status), onCapture(imageData), stableFrames: 3, maxShiftFrac: 0.02, intervalMs: 200 })
  -> { start(videoEl), stop() }       // status: "searching" | "partial" | "holding" | "captured"
export async function fileToImageData(file: File, maxSide = 1600) -> ImageData   // createImageBitmap + kanvas, hormati orientasi EXIF (imageOrientation: "from-image"); iOS: <img> dahulu, sandaran createImageBitmap; kecil ke had piksel kanvas iOS (platform.canvasScale)
```

### 4.5 Penggredan dan analisis (`js/grading/*`, penganalisis-data)
```js
// grade.js
export function resolveFinal(scanned: Array<{q, choice}>, overrides: { [q: number]: Choice|null }) -> (Choice|null)[]
export function gradeSheet(final: (Choice|null)[], key: Choice[]) -> {
  correct: number, total: number, percent: number,      // percent = Math.round(correct/total*1000)/10
  perQuestion: Array<{ q, given: Choice|null, key: Choice, isCorrect: boolean }>
}
export function regradeAll(results: Result[], key: Choice[]) -> Result[]     // salinan baharu, correct/total/percent dikemas kini
export function parseKeyText(text: string, numQuestions: number, numChoices: 4|5) -> { key: (Choice|null)[], errors: string[] }

// stats.js
export function computeStats(results: Result[]) -> {
  count, meanCorrect, medianCorrect, maxCorrect, minCorrect, sdCorrect, meanPercent    // dibundar 1 tp; count 0 -> semua null
}
export function scoreDistribution(results, total, binSize = 10) -> Array<{ fromPct, toPct, count }>

// items.js
export function itemAnalysis(results: Result[], key: Choice[], choices: Choice[]) -> ItemStat[]
ItemStat = {
  q, key, n, correctCount, pctCorrect,               // pctCorrect 1 tp
  counts: { A, B, C, D, E?, blank, multiple },       // multiple dikira dari scanned.status==="MULTIPLE" && final[q-1]===null
  topDistractor: Choice | null,                      // pilihan salah kiraan tertinggi (>0); seri -> huruf terawal
  difficulty: "Mudah" | "Sederhana" | "Sukar",       // >=80, 40–79.9, <40
  discrimination: number | null                      // (p_atas - p_bawah), kumpulan 27% (ceil); null jika n < 10; 2 tp
}
```

### 4.6 Data dan eksport (`js/data/*`)
```js
// db.js
export function openDb(name = "omr-semak-jawapan") -> Promise<IDBDatabase>   // nama boleh diganti untuk ujian
// repo.js (semua kembalikan Promise)
listTests() -> Test[] (isih updatedAt menurun) ; getTest(id) ; saveTest(test) ; deleteTest(id)   // cascade results
listResults(testId) -> Result[] ; saveResult(result) ; deleteResult(id) ; findResultsByCode(testId, code) -> Result[]
getSetting(key, fallback) ; setSetting(key, value)
// backup.js
exportAll() -> BackupPayload ; validateBackup(obj) -> { ok, errors } ; importAll(payload, mode: "merge"|"replace") -> { tests, results, skipped } ; clearAll()
// csv.js (tulen)
export function toCsv(rows: (string|number|null)[][]) -> string    // "\uFEFF" + baris CRLF, RFC 4180, peneutralan = + - @ dengan awalan '
export function resultsToRows(test: Test, results: Result[]) -> rows   // Bil, Kod Pelajar, Nama, Betul, Jumlah, Peratus, S1..Sn (kosong="", berganda="*")
export function itemsToRows(test: Test, items: ItemStat[]) -> rows     // Soalan, Jawapan, % Betul, Kesukaran, Diskriminasi, A..E, Kosong, Berganda, Pengganggu Popular
// util/download.js
export function downloadText(filename, text, mime = "text/csv;charset=utf-8")
```
Nama fail CSV: `keputusan-<slug-nama-ujian>-YYYYMMDD.csv`, `analisis-item-<slug>-YYYYMMDD.csv`.

### 4.7 Templat (`js/template/render-sheet.js`)
```js
export function renderSheetSvg(layout: Layout, { title: string, schoolName: string, testName: string }) -> string
  // <svg xmlns viewBox="0 0 210 297" width="210mm" height="297mm"> ... semua geometri dari layout sahaja
```
`css/print.css`: `@page { size: A4 portrait; margin: 0 }`, sembunyikan semua kecuali `.sheet`. Panduan cetak dalam UI: "Margin: Tiada, Skala: 100% / Lalai".

### 4.8 Laluan UI (hash router, `js/app.js`)
| Laluan | Skrin |
|---|---|
| `#/` | Senarai ujian + butang "Ujian Baharu" |
| `#/ujian/baru` | Borang cipta ujian (nama, kelas, subjek, soalan, pilihan, digit ID) |
| `#/ujian/:id` | Ringkasan ujian: Imbas, Skema, Cetak Templat, Keputusan, Analisis, Eksport, Roster, Duplikasi, Padam |
| `#/ujian/:id/skema` | Isi skema (ketik / tampal teks / imbas kertas skema) |
| `#/ujian/:id/roster` | Tampal senarai `kod,nama` (satu per baris) |
| `#/ujian/:id/templat` | Pratonton + cetak |
| `#/ujian/:id/imbas` | Kamera langsung / ambil foto |
| `#/ujian/:id/semak` | Hasil imbasan: overlay, markah, amaran, edit, identiti, Simpan / Imbas Semula |
| `#/ujian/:id/keputusan` | Senarai keputusan + statistik + eksport CSV |
| `#/ujian/:id/keputusan/:rid` | Lihat/edit satu keputusan (tanpa foto) |
| `#/ujian/:id/analisis` | Analisis item + taburan markah + eksport CSV |
| `#/tetapan` | Nama sekolah, tangkap auto, ambang lanjutan, sandaran/pulih, padam semua, tentang |

Imej tangkapan dihantar antara `imbas` dan `semak` melalui modul keadaan memori (`js/ui/state.js`), tidak melalui URL atau storan.

---

## 5. Struktur folder

```
projects/omr-semak-jawapan/
  index.html
  manifest.json
  sw.js                         # importScripts("precache-manifest.js"); cache-first; skipWaiting atas mesej
  precache-manifest.js          # DIJANA: self.CACHE_VERSION, self.PRECACHE = [...]
  start.bat                     # python tools\serve.py --bind 127.0.0.1 --port 8000 + buka pelayar
  start-lan.bat                 # --bind 0.0.0.0 (telefon LAN; mungkin memerlukan kebenaran firewall)
  README.md
  .gitignore                    # tests/fixtures/sheets/generated/, __pycache__/
  css/
    app.css                     # token reka bentuk, komponen, mudah alih dahulu
    print.css
  icons/
    icon-192.png  icon-512.png  icon-maskable-512.png  favicon.svg
  js/
    app.js                      # bootstrap, router, daftar SW, banner kemas kini
    util/   uuid.js  log.js  download.js  dom.js  format.js
    omr/    config.js  layout.js  image.js  threshold.js  components.js  markers.js
            homography.js  sampler.js  decide.js  scan.js  overlay.js  worker.js  client.js
    grading/ grade.js  stats.js  items.js
    data/   db.js  repo.js  backup.js  csv.js
    template/ render-sheet.js
    ui/
      strings.ms.js             # semua teks BM
      state.js  camera.js  components.js  overlay-canvas.js
      views/ tests-list.js  test-form.js  test-home.js  key-entry.js  roster.js
             template.js  scan.js  review.js  results.js  result-detail.js
             analysis.js  settings.js
  vendor/
    README.md                   # kosong dalam v1; format: nama@versi, URL CDN, SHA-256
  tests/
    index.html                  # harness: jalankan semua *.test.js, tulis <pre id="summary">
    harness.js                  # test(), assert, assertEqual, assertClose, loadImageData(url)
    layout.test.js  homography.test.js  threshold.test.js  components.test.js
    markers.test.js  decide.test.js  scan-synthetic.test.js  grade.test.js
    stats.test.js  items.test.js  csv.test.js  backup.test.js  precache.test.js
    fixtures/
      layouts/  Q10-C4-ID0.json  Q20-C5-ID4.json  Q40-C5-ID6.json  Q60-C4-ID2.json
      sheets/smoke/             # ~8 imej kecil dikomit (bersih + herot + kosong) + .json jangkaan
      sheets/generated/         # gitignored; set penuh dari gen_sheets.py
      assets.json               # DIJANA oleh list_assets.py
  tools/
    serve.py                    # http.server + MIME tegas (.js/.mjs text/javascript, .json, .webmanifest, .svg) + Cache-Control: no-cache
    omr_layout.py               # port rujukan build_layout + --golden
    gen_sheets.py               # jana kertas sintetik (Pillow)
    run_tests.py                # mula serve + Edge headless + hurai keputusan + kod keluar
    list_assets.py              # jana precache-manifest.js + tests/fixtures/assets.json
    make_icons.py               # jana ikon PNG (Pillow)
    requirements.txt            # pillow==<versi tepat semasa pemasangan>
  docs/
    KAJIAN-PESAING.md  SPEC.md  PLAN.md  PANDUAN-GURU.md (penulis-panduan)
```

---

## 6. Senarai tugas mengikut agent

Legenda: **[S]** = boleh dibuat selari dengan tugas [S] lain dalam fasa yang sama; **[B: x]** = bergantung pada tugas x.

### Fasa 0 — Rangka (pendek, blocking)
- **D0 devops**: struktur folder, `tools/serve.py`, `start.bat`, `start-lan.bat`, `.gitignore`, `README.md` ringkas, `index.html` shell kosong yang memuat `js/app.js`. Sahkan `.js` dihidang sebagai `text/javascript`.

### Fasa 1 — Selari penuh [B: D0]
- **E1 pembangun-frontend (enjin OMR)** [S]: `config.js`, `layout.js` (DAHULUKAN — sasaran siap pertama), `image.js`, `threshold.js`, `components.js`, `homography.js`, `decide.js`.
- **T1 penguji** [S]: `tools/omr_layout.py` + fixture emas; `tests/harness.js`, `tests/index.html`, `tools/run_tests.py`; `tools/gen_sheets.py` (profil `clean`, `distorted`, `blank`, `key`) dengan benih tetap; set `smoke` dikomit.
- **U1 pereka-ui** [S]: token reka bentuk & `css/app.css`, wireframe teks setiap skrin di 4.8 (terutamanya `imbas` dan `semak`: bingkai panduan, legenda warna hijau/merah/kuning, sasaran sentuh ≥ 44 px), `strings.ms.js` draf.
- **A1 penganalisis-data** [S]: `grading/grade.js`, `stats.js`, `items.js`, `data/csv.js` + ujian unit masing-masing.
- **F1 pembangun-frontend (UI/data)** [S]: `data/db.js`, `repo.js`, `backup.js`, `util/*`, `js/app.js` router, `ui/state.js`.
- **M1 pembangun-mobile** [S]: `manifest.json`, `sw.js`, `tools/list_assets.py`, `tools/make_icons.py` + ikon, `ui/camera.js` (sokongan, mula/henti, `grabFrame`, `fileToImageData`, autocapture dengan `detect` olok-olok).

### Fasa 2 [B: Fasa 1]
- **E2 pembangun-frontend (enjin)** [S]: `markers.js`, `sampler.js`, `scan.js`, `overlay.js`, `worker.js`, `client.js`; lulus `markers.test.js` dan `scan-synthetic.test.js` (SPEC 3.4–3.6, 3.11). Kalibrasi ambang bersama penguji.
- **F2 pembangun-frontend (UI)** [S] [B: U1, A1, F1]: `template/render-sheet.js` [B: E1] + `views/template.js`; `tests-list`, `test-form`, `test-home`, `key-entry` (ketik + tampal), `roster`, `results`, `result-detail`, `analysis`, `settings`.
- **T2 penguji** [S]: ujian unit untuk modul Fasa 1 (layout vs emas, homografi, CSV, backup, precache); jana set penuh `generated/`.

### Fasa 3 — Integrasi [B: E2, F2, M1]
- **F3 pembangun-frontend + M3 pembangun-mobile** (bersama): `views/scan.js` (kamera + autocapture sebenar + sandaran fail), `views/review.js` (overlay `ui/overlay-canvas.js`, edit manual, keratan nama, amaran pendua, simpan), "imbas kertas skema" dalam `key-entry`.
- **M3 pembangun-mobile**: jalankan `list_assets.py`, sahkan luar talian & pasang (localhost), banner kemas kini.

### Fasa 4 — Pengesahan [B: Fasa 3]
- **T4 penguji** [S]: larian penuh `run_tests.py`; senarai semak manual SPEC (M) termasuk cetak sebenar + imbas di telefon (data sintetik: kertas diisi dengan nama "Pelajar Ujian 1..n").
- **P4 pakar-prestasi** [S] (pilihan): profil `scanImage` pada telefon Android bajet; optimumkan gelung panas jika > 1.5 s.
- **R4 penyemak** [S]: semak pematuhan kontrak (tiada geometri di luar `layout.js`), tiada pihak ketiga runtime, grep `console.` untuk data pelajar, pertahanan suntikan CSV, aksesibiliti asas.
- **G4 penulis-panduan** [S]: `docs/PANDUAN-GURU.md` (BM): cetak templat, cipta ujian, imbas, betulkan, eksport ke Excel, sandaran, petua cahaya.
- **D4 devops** (pilihan, PERLU KEBENARAN PEMILIK): aliran kerja GitHub Pages untuk HTTPS. Jangan laksanakan/tolak tanpa kelulusan.

---

## 7. Agent pakar diperlukan

| Agent | Perlu? | Tugas | Fail disentuh |
|---|---|---|---|
| pereka-ui | Ya | U1: token, wireframe 12 skrin, reka skrin imbas/semak, legenda warna boleh dibezakan buta warna (ikon ✓/✗/! selain warna) | `css/app.css`, `js/ui/strings.ms.js` (draf), nota wireframe dalam PR |
| pembangun-mobile | Ya | M1/M3: PWA (manifest, SW, pra-cache berversi, ikon), kamera + tangkap auto, sandaran `<input capture>`, EXIF | `manifest.json`, `sw.js`, `precache-manifest.js`, `tools/list_assets.py`, `tools/make_icons.py`, `icons/*`, `js/ui/camera.js`, `js/ui/views/scan.js` (bersama) |
| penganalisis-data | Ya | A1: penggredan, statistik, analisis item, CSV Excel | `js/grading/*`, `js/data/csv.js`, `tests/{grade,stats,items,csv}.test.js` |
| penulis-panduan | Ya | G4: panduan guru BM | `docs/PANDUAN-GURU.md`, bahagian Tentang di `views/settings.js` (teks sahaja) |
| pakar-prestasi | Pilihan | P4: profil enjin OMR di peranti bajet, Web Worker, peruntukan memori | `js/omr/*` (pengoptimuman tanpa ubah kontrak) |
| pakar-ai | Tiada | — | — |
| pakar-integrasi | Tiada | Tiada e-mel/WhatsApp/bayaran/API | — |
| pengikis-web | Tiada | — | — |
| pakar-database | Tiada | Tiada pelayan DB; IndexedDB dikendali pembangun-frontend (F1) | — |

Agent teras: **pembangun-frontend** (dua aliran: enjin OMR E1/E2 dan UI/data F1–F3; disarankan dua sesi berasingan), **penguji** (T1/T2/T4), **penyemak** (R4), **devops** (D0, D4 pilihan). Tiada pembangun-backend.

---

## 8. Strategi ujian

1. **Ujian unit pelayar** (`tests/index.html`): harness kecil sendiri; setiap `*.test.js` mengeksport `export default [ {name, fn} ]`. Ujian enjin menggunakan imej sintetik yang dibina dalam JS (cth. segi empat hitam pada latar putih) dan fixture PNG/JPG. `loadImageData(url)` menggunakan `fetch` + `createImageBitmap` + `OffscreenCanvas` (hanya dalam harness; enjin kekal tulen).
2. **Fixture emas susun atur**: Python `omr_layout.py` ialah port bebas; padanan JS↔Python menjamin penjana templat, penjana kertas sintetik dan pengimbas berkongsi geometri yang sama.
3. **Kertas sintetik** (`tools/gen_sheets.py`, Pillow):
   - Render halaman pada 150 DPI (1240×1754) terus dari `build_layout`, isi bulatan mengikut jawapan rawak berbenih: 90% satu jawapan penuh, 4% kosong, 3% berganda, 3% tanda ringan (40–60% kepekatan); ID rawak.
   - Profil `distorted`: letak atas latar kelabu/bertekstur, perspektif (`Image.transform(..., Image.PERSPECTIVE)`) sehingga 15°, putaran ±10°, 10% terbalik 180°, `GaussianBlur` 0–1.5, hingar Gaussian, kecerunan cahaya 0.6–1.0, JPEG q=60–90, saiz output 1200–2400 px.
   - Profil `blank`: kertas kosong, gambar rawak, kertas dengan 3 penanda sahaja -> jangkaan `NO_MARKERS`.
   - Profil `key`: kertas skema penuh.
   - Setiap imej ada `.json` jangkaan: `{ config, answers: (Choice|null|"MULTI")[], idCode, profile, seed, transform }`, ditambah `manifest.json`.
   - Nama/teks pada kertas sintetik: "Pelajar Ujian N" sahaja.
4. **Ukuran** (`scan-synthetic.test.js`): ketepatan bulatan, kadar `ok`, kadar positif palsu `OK` untuk kosong/berganda, masa purata — dibandingkan dengan ambang SPEC 3.4–3.6, 3.11. Laporan ringkas dalam `<pre id="summary">`.
5. **Larian automatik** `python tools/run_tests.py`: mula `serve.py` pada port bebas dalam thread, jalankan `msedge --headless=new --disable-gpu --virtual-time-budget=120000 --dump-dom http://127.0.0.1:<port>/tests/index.html`, hurai `PASS n / FAIL m`, kod keluar 0/1. Laluan Edge lalai: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` (boleh ganti `--browser`). Jika headless gagal, buka halaman ujian secara manual.
6. **Ujian manual** (senarai semak dalam PR penguji): cetak sebenar (Chrome, A4), imbas dengan telefon (kamera langsung pada localhost di laptop; foto melalui HTTP LAN), cahaya kelas/malap, kertas fotostat, luar talian, pasang PWA, buka CSV dalam Excel.
7. **Privasi**: `R4` grep `console\.(log|info|debug)` dalam `js/` — hanya melalui `util/log.js` dan tiada data pelajar.

---

## 9. Arahan pasang, jalan dan uji

Prasyarat: Python 3.14 (ada), Git (ada), Chrome atau Edge. Tiada Node/npm.

```bat
:: 1. Jalankan app (laptop sahaja, kamera langsung berfungsi di localhost)
cd "projects\omr-semak-jawapan"
start.bat
:: -> http://localhost:8000/

:: 2. Telefon melalui Wi-Fi yang sama (mod ambil foto; kamera langsung & luar talian tidak tersedia pada HTTP)
start-lan.bat
:: buka http://<IP-laptop>:8000/ di telefon. Firewall Windows mungkin menyekat; jika perlu kebenaran admin, guna pilihan HTTPS di bawah.

:: 3. Alat ujian (sekali sahaja; tanpa admin)
python -m pip install --user -r tools\requirements.txt

:: 4. Jana fixture
python tools\omr_layout.py --golden tests\fixtures\layouts
python tools\gen_sheets.py --profile clean --count 40 --seed 1 --out tests\fixtures\sheets\generated\clean
python tools\gen_sheets.py --profile distorted --count 60 --seed 2 --out tests\fixtures\sheets\generated\distorted
python tools\gen_sheets.py --profile blank --count 10 --seed 3 --out tests\fixtures\sheets\generated\blank

:: 5. Jana senarai pra-cache selepas menambah/membuang fail
python tools\list_assets.py

:: 6. Jalankan ujian
python tools\run_tests.py
:: atau buka http://localhost:8000/tests/index.html
```

**Pilihan HTTPS (PERLU KEBENARAN PEMILIK, tidak dilaksanakan secara lalai):** hos folder ini di GitHub Pages (repo/cawangan khusus, kandungan statik sahaja, tiada data pelajar dalam repo). Ini membolehkan kamera langsung, pemasangan PWA dan luar talian pada telefon. Alternatif pembangunan tanpa admin: Chrome Android `chrome://flags/#unsafely-treat-insecure-origin-as-secure` dengan `http://<IP-laptop>:8000` (untuk ujian sahaja, bukan untuk guru).

---

## 10. Risiko dan mitigasi
| Risiko | Mitigasi |
|---|---|
| Ketepatan pada fotostat pudar / cahaya malap | Kalibrasi putih/hitam per kertas, ambang relatif, `LOW_CONTRAST` dengan mesej BM, status `UNCERTAIN` + semakan manual |
| Penanda terpotong oleh margin pencetak | Penanda 10 mm dari tepi (pusat 14 mm); panduan cetak "Margin: Tiada"; ujian cetak manual |
| Tetingkap ambang adaptif lebih kecil daripada penanda menghasilkan "lubang" | `thresholdWindowFrac = 1/8` (> saiz penanda); ujian unit khusus |
| MIME `.js` salah pada Windows | `tools/serve.py` dengan peta MIME tegas |
| Telefon melalui HTTP tiada kamera langsung/SW | Sandaran `<input capture>`; pilihan HTTPS didokumenkan |
| Kehilangan data (pelayar padam storan) | `navigator.storage.persist()` dipohon; peringatan sandaran jika `lastBackupAt` > 7 hari |
| Geometri JS dan Python bercapah | Fixture emas + ujian padanan wajib |

## 11. Borang SPM dakwat merah (LPM/KOM 28)

Borang rasmi "Kertas Jawapan Objektif SPM" tiada penanda hitam; enjin berasingan `js/omr/redform.js`,
dipilih apabila `layout.format === "spm-kom28"` (`scanImage` / `detectMarkers` dalam `scan.js`).

- **Geometri**: `js/omr/forms/spm-kom28.js`, dijana oleh `tools/measure_spm.py` daripada gambar sebenar.
  Bingkai rujukan = panel jawapan (garis menegak kiri, garis mendatar di bawah kotak pengawas, bingkai luar
  kanan/bawah), bukan bingkai luar borang.
- **Saluran**: peta kemerahan `rn` + saluran "red dropout" `rp` -> garis Hough -> calon segiempat (skor
  didominasi liputan garis supaya panel tidak ditenggelami varian bingkai luar) -> padanan kekisi per blok
  5 soalan + per baris menggunakan templat **gumpalan** (pusat + garis luar separuh skala pada peta kabur
  kotak) -> homografi kuasa dua terkecil -> sampel isian dalam `rp` -> `decide.js`.
- **Kenapa gumpalan, bukan garis luar**: garis elips bercetak nipis, nombor soalan dan huruf A-D tebal;
  padanan garis luar sahaja mempunyai dua puncak (±setengah bulatan) dan terkunci ke kiri.
- **Penerimaan** (1.1.1): skor teguh (median gelembung - median jurang pada peta kemerahan nipis) >= 10,
  segiempat munasabah (lebar >= 0.15 sisi panjang, nisbah aspek 0.6-1.6x, cembung) dan >= 90% pusat gelembung
  dalam gambar. Gambar sebenar: betul 15-17, varian blok/180 salah 11-12; separuh borang -> NO_FRAME.
- **Resolusi**: imbasan penuh 1600 px; pengesanan langsung perlukan >= 1200 px (garis panel hilang di bawah
  itu). Kamera kini mengambil bingkai pengesanan 640 px — mesti dinaikkan untuk borang merah.
- **Ujian**: `tests/redform.test.js` (gambar sebenar dalam `tests/fixtures/real/`, tidak dikomit; dilangkau jika tiada).

**Integrasi UI (siap 2026-11-16)**: `layoutConfig.format = "spm-kom28"` (A-D, 1..80 soalan, idDigits 0) dipilih
di `test-form.js`; `buildLayout` menghantar ke `buildSpmLayout`; `sandaran` mengekalkan `format`; paparan imbas
hantar `{ format }` ke `client.detect` dengan bingkai 1200 px dan mesej `NO_FRAME`; templat diganti panduan.
Ujian: `tests/spm-ui.test.js`.

**Gambar telefon sebenar (1.1.1, 2026-11-16)**: 5 gambar guru (terpotong, jauh, senget, berputar + perspektif,
pen merah / komputer riba / tanda guru) kini dibaca tepat. Perubahan utama dalam `redform.js`:
- kemerahan dengan lantai `RN_FLOOR` (piksel gelap bukan merah); topeng garis "rabung" (rn - purata setempat) dan
  peta skor "nipis" supaya objek merah pejal (pen) hanya tinggal tepi;
- calon 3 garis (sisi hilang dilengkapkan dari nisbah panel) dan liputan garis hanya dalam gambar;
- `profileCandidates`: calon tanpa garis dari profil lajur (12 lajur + lajur nombor) dan baris (30 baris), dengan
  sudut baris berasingan (ricih perspektif) dan pilihan anjakan blok sebelum mendaki;
- `refineCorners`: daki bukit sudut kasar-ke-halus memaksimumkan kontras kekisi; ujian varian (+-2 blok,
  +-1 kumpulan lajur, 180 darjah) dengan skor teguh median; `saneQuad` menolak kekisi yang runtuh ke satu objek;
- soalan yang gelembungnya terkeluar dari gambar -> `UNCERTAIN` tanpa pilihan (`offImage`);
- ambang borang merah: kosong 0.15, hitam 0.25, jurang 0.15 (pensel lebih pudar melalui cetakan merah);
  ambang guru di Tetapan hanya menimpa jika berbeza daripada lalai hitam.
Masa imbasan penuh ~1-1.4 s pada desktop.

## 12. Muat naik gambar pukal (1.2.0, 2026-11-16)

Laluan `#/ujian/:id/pukal` (`js/ui/views/bulk.js`), pautan di halaman ujian di bawah "Imbas kertas".
- Guru pilih banyak gambar (`<input multiple>`); nama fail menjadi nama murid (`nameFromFile`: `_` -> ruang,
  nombor senarai di depan dibuang; nama kamera/WhatsApp -> kosong) dan dipadankan dengan senarai nama
  (`matchRoster`, nama atau kod) untuk kod murid.
- Gambar diimbas satu demi satu dalam worker; hanya File, lakaran kecil dan hasil imbasan disimpan dalam memori
  (`state.js`, kunci `bulk:<testId>`), jadi senarai kekal semasa ke halaman Semak dan kembali.
- "Semak" membuka `review.js` dengan nama/kod, `returnTo` dan `onSaved`; "Simpan semua" menyimpan semua yang
  belum disimpan (nama wajib; kod sama dalam senarai nama menggantikan keputusan lama).

**Ketahanan enjin terhadap saiz gambar (1.2.0)**: app mengecilkan gambar dengan kanvas, yang dahulu boleh
menganjak kekisi satu blok atau memusingkannya 180 darjah. `robustScore` kini juga mengira: penalti merah pada
petak kosong S81-90 dan satu blok di atas baris 1, bonus nombor soalan di kiri lajur A (berbanding kanan lajur D),
bonus garis bingkai atas/bawah panel, dan bonus blok 5 soalan yang paling lemah. Varian terbaik digilap dengan
purata terpangkas (75 % bawah) skor itu sendiri. Gambar kecil (< 0.9 x 1600 px) dibesarkan dahulu.
Ujian sapuan (5 gambar x 10 saiz 1300-2000 px): 48/50 betul; semua saiz 1600 (laluan app) betul.

