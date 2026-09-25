@echo off
rem ==========================================================================
rem  CAI DAT TU DONG (A - Z) tren Windows - He thong quan ly de nghi sua HSBA
rem  Chuot phai install.bat -> Run as administrator (khong can thiet lam)
rem ==========================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ==========================================================================
echo  CAI DAT HE THONG QUAN LY GIAY DE NGHI SUA HSBA DIEN TU
echo ==========================================================================

echo [1/4] Kiem tra Python...
set PY=
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo   CHUA CAI PYTHON. Tai https://www.python.org/downloads/
  echo   (khi cai NHỚ tick "Add python.exe to PATH")
  pause & exit /b 1
)
for /f "tokens=2" %%v in ('%PY% --version') do echo   Python %%v san sang.

echo [2/4] Tao moi truong ao...
if not exist .venv %PY% -m venv .venv

echo [3/4] Cai thu vien (Flask, fpdf2, waitress)...
.venv\Scripts\python -m pip install --quiet --upgrade pip
.venv\Scripts\python -m pip install --quiet -r requirements.txt

echo [4/4] Khoi tao co so du lieu...
.venv\Scripts\python -c "from app import init_db; init_db()"

echo.
echo ==========================================================================
echo  CAI DAT XONG!
echo    - Chay start.bat de khoi dong (tu dong mo trinh duyet).
echo    - May khac trong mang LAN: http://^<IP-may-nay^>:8000
echo      (xem IP bang lenh: ipconfig)
echo    - Mo cong tuong lua Windows cho cong 8000 neu may khac khong vao duoc:
echo      netsh advfirewall firewall add rule name="sua-hsba" dir=in action=allow protocol=TCP localport=8000
echo    - Tai khoan mac dinh: admin / admin@123  (DOI MAT KHAU ngay khi dung that!)
echo ==========================================================================
pause
