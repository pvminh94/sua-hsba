@echo off
rem  Khoi dong he thong (chay install.bat truoc khi dung lan dau)
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv\Scripts\python (
  echo Chua cai dat! Hay chuot phai install.bat -^> Run as administrator
  pause & exit /b 1
)
start "" http://localhost:8000
.venv\Scripts\python app.py
pause
