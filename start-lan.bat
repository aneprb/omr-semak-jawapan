@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python tidak ditemui. Sila pasang Python 3 dan tandakan "Add python.exe to PATH".
  pause
  exit /b 1
)

echo ============================================================
echo  MOD LAN - untuk telefon dalam rangkaian Wi-Fi yang sama
echo ============================================================
echo Buka salah satu alamat ini di telefon:
for /f "tokens=2 delims=:(" %%a in ('ipconfig ^| findstr /C:"IPv4"') do call :showip %%a
echo.
echo AMARAN:
echo  - Kamera langsung dan pemasangan PWA hanya berfungsi di localhost atau HTTPS.
echo  - Di telefon, guna butang "Ambil foto" untuk mengimbas kertas.
echo  - Firewall Windows mungkin menyekat sambungan; benarkan Python jika ditanya.
echo.
echo Tekan Ctrl+C untuk berhenti.
echo.
python tools\serve.py --bind 0.0.0.0 --port 8000 --app-only
pause
exit /b 0

:showip
echo    http://%~1:8000/
goto :eof
