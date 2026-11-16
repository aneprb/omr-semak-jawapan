# Semakan Kod & Keselamatan (R4)

Ujian selepas pembetulan: `python tools\run_tests.py` -> PASS 149 / FAIL 0 / SKIP 0.

| Tahap | Fail | Isu | Status |
|---|---|---|---|
| Tinggi | index.html:7 | Tiada Content-Security-Policy (pertahanan berlapis XSS/exfiltrasi) | Dibetulkan: meta CSP `default-src 'self'`, tanpa skrip inline, `connect-src 'self'`, `object-src 'none'`. `list_assets.py` dijalankan semula (versi cache 2ecc41e2c784). |
| Sederhana | start-lan.bat:26 | Bind 0.0.0.0 menghidang seluruh folder projek (tests/, tools/, docs/) kepada LAN | Cadangan: amaran dalam skrip; hidang sub-set aset sahaja |
| Sederhana | tools/serve.py:35 | SimpleHTTPRequestHandler menyenaraikan direktori | Cadangan: matikan list_directory |
| Rendah | js/data/backup.js:~99 | `percent`/`correct` tidak disemak silang dengan `final`/kunci; perbandingan `updatedAt` merge ialah rentetan | Cadangan: kira semula semasa import; banding Date.parse |
| Rendah | js/data/csv.js:5 | Awalan formula selepas ruang putih tidak dilindungi | Cadangan: trim sebelum ujian regex |
| Rendah | js/util/log.js | console.* hanya bila `omrDebug=1`; hanya mesej teknikal | Diterima |

Disahkan bersih: tiada innerHTML/eval/fetch luar/telemetri (grep); h() guna text node; SVG templat escape (esc); import sandaran disahkan penuh sebelum sebarang tulis DB, medan disalin ikut senarai putih (prototype pollution tidak sampai ke DB), had 50 MB disemak pada file.size; serve.py bind lalai 127.0.0.1, traversal dilindungi stdlib, tiada /__report; SW tidak cache runtime/non-200; stopCamera dan terminate di onLeave; aria-live/role=alert wujud. Tiada geometri di luar layout.js; worker menangkap ralat.
