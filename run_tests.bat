@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where python >/dev/null 2>nul
if errorlevel 1 (
  echo Python tidak ditemui. Sila pasang Python 3 dan tandakan "Add python.exe to PATH".
  pause
  exit /b 1
)

python toolsun_tests.py
pause
exit /b %errorlevel%
