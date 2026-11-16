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

echo Memulakan OMR Semak Jawapan di http://localhost:8000/
echo Tekan Ctrl+C untuk berhenti.
echo.
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:8000/"
python tools\serve.py --bind 127.0.0.1 --port 8000
pause
