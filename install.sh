#!/usr/bin/env bash
# ============================================================================
#  CÀI ĐẶT TỰ ĐỘNG (A → Z)
#  Hệ thống quản lý GIẤY ĐỀ NGHỊ SỬA HỒ SƠ BỆNH ÁN ĐIỆN TỬ
#
#  Cách dùng (chọn 1 trong 2):
#    1) Đã tải sẵn mã nguồn:        sudo bash install.sh
#    2) Cài thẳng từ GitHub:       curl -fsSL https://raw.githubusercontent.com/pvminh94/sua-hsba/main/install.sh | sudo bash
#
#  Tùy chỉnh (đặt biến môi trường trước khi chạy, không bắt buộc):
#    PORT=8000                  cổng web (mặc định 8000)
#    APP_DIR=/opt/sua-hsba      thư mục cài đặt (mặc định: /opt/sua-hsba nếu có quyền root,
#                               ~/sua-hsba nếu chạy bằng tài khoản thường)
#    REPO_URL=...               địa chỉ repo để nạp mã nguồn khi chạy qua curl
#
#  Script tự kiểm tra & cài: Python 3, git → nạp mã nguồn → thư viện →
#  khởi tạo dữ liệu → dịch vụ chạy nền (systemd) → tường lửa → kiểm tra chạy.
#  Chạy lại lần nữa cũng không sao (idempotent).
# ============================================================================
set -euo pipefail

APP_NAME="sua-hsba"
SERVICE_NAME="sua-hsba"
REPO_URL="${REPO_URL:-https://github.com/pvminh94/sua-hsba.git}"
PORT="${PORT:-8000}"
BRANCH="main"

# ---------- màu & log ----------
if [ -t 1 ]; then
  G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1;34m'; N='\033[0m'
else
  G=''; Y=''; R=''; B=''; N=''
fi
step() { echo -e "\n${B}[$1]${N} $2"; }
ok()   { echo -e "  ${G}✔${N} $1"; }
warn() { echo -e "  ${Y}!${N} $1"; }
die()  { echo -e "  ${R}✘ LỖI:${N} $1"; exit 1; }

# ---------- phân quyền / tài khoản chạy ----------
if [ "$(id -u)" = 0 ]; then
  RUN_USER="${SUDO_USER:-root}"
else
  RUN_USER="$(whoami)"
fi
as_run_user() {
  if [ "$(id -u)" = 0 ] && [ "$RUN_USER" != root ]; then
    sudo -u "$RUN_USER" -H "$@"
  else
    "$@"
  fi
}

echo -e "${B}============================================================================${N}"
echo -e "${B} CÀI ĐẶT HỆ THỐNG QUẢN LÝ GIẤY ĐỀ NGHỊ SỬA HSBA ĐIỆN TỬ${N}"
echo -e "${B}============================================================================${N}"
echo "  Tài khoản chạy : $RUN_USER"
echo "  Cổng web       : $PORT"

# ---------- [1/7] Hệ điều hành & Python 3 ----------
step "1/7" "Kiểm tra hệ điều hành & cài Python 3 (nếu thiếu)..."
OS="$(uname -s)"
NEED_PKGS=""
command -v python3 >/dev/null 2>&1 || NEED_PKGS="$NEED_PKGS python3 python3-pip"
if command -v python3 >/dev/null 2>&1 && ! python3 -c "import venv, ensurepip" >/dev/null 2>&1; then
  NEED_PKGS="$NEED_PKGS python3-venv"     # Debian/Ubuntu tách riêng gói venv
fi
command -v git >/dev/null 2>&1 || NEED_PKGS="$NEED_PKGS git"
command -v curl >/dev/null 2>&1 || NEED_PKGS="$NEED_PKGS curl"

if [ -n "$NEED_PKGS" ]; then
  warn "Cần cài thêm:$NEED_PKGS"
  if [ "$OS" = "Linux" ]; then
    if command -v apt-get >/dev/null 2>&1; then
      APT="apt-get"; [ "$(id -u)" != 0 ] && APT="sudo apt-get"
      $APT update -qq && $APT install -y -qq python3 python3-pip python3-venv git curl \
        || warn "Cài đặt bằng apt-get thất bại (thiếu quyền root?)"
    elif command -v dnf >/dev/null 2>&1; then
      DNF="dnf"; [ "$(id -u)" != 0 ] && DNF="sudo dnf"
      $DNF install -y -q python3 python3-pip git curl || warn "Cài đặt bằng dnf thất bại"
    elif command -v yum >/dev/null 2>&1; then
      YUM="yum"; [ "$(id -u)" != 0 ] && YUM="sudo yum"
      $YUM install -y -q python3 python3-pip git curl || warn "Cài đặt bằng yum thất bại"
    else
      warn "Không nhận diện được trình quản lý gói — hãy cài tay:$NEED_PKGS"
    fi
  elif [ "$OS" = "Darwin" ]; then
    command -v brew >/dev/null 2>&1 && brew install python3 git || warn "Cần Homebrew để cài Python 3"
  fi
fi
command -v python3 >/dev/null 2>&1 || die "Chưa cài được Python 3. Hãy cài Python 3 rồi chạy lại script."
python3 - << 'PYV' || die "Cần Python >= 3.8"
import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)
PYV
ok "Python $(python3 --version 2>&1 | awk '{print $2}')"

# ---------- [2/7] Nạp mã nguồn ----------
step "2/7" "Nạp mã nguồn..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" 2>/dev/null && pwd || true)"
if [ -n "${APP_DIR:-}" ]; then
  DEST="$APP_DIR"
elif [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/app.py" ]; then
  DEST="$SCRIPT_DIR"                       # chạy ngay trong thư mục mã nguồn
elif [ "$(id -u)" = 0 ]; then
  DEST="/opt/$APP_NAME"
else
  DEST="$HOME/$APP_NAME"
fi

if [ -f "$DEST/app.py" ]; then
  ok "Đã có mã nguồn tại $DEST"
  if [ -d "$DEST/.git" ] && [ "$DEST" != "$SCRIPT_DIR" ]; then
    git -C "$DEST" pull --ff-only >/dev/null 2>&1 && ok "Đã cập nhật bản mới nhất" || warn "Giữ nguyên bản hiện tại (git pull thất bại)"
  fi
else
  command -v git >/dev/null 2>&1 || die "Cần git để tải mã nguồn."
  mkdir -p "$(dirname "$DEST")"
  if [ "$(id -u)" = 0 ] && [ "$RUN_USER" != root ]; then
    chown "$RUN_USER" "$(dirname "$DEST")"
  fi
  as_run_user git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$DEST" \
    || die "Không tải được mã nguồn từ $REPO_URL"
  ok "Đã tải mã nguồn về $DEST"
fi
if [ "$(id -u)" = 0 ]; then chown -R "$RUN_USER" "$DEST"; fi

# ---------- [3/7] Môi trường ảo & thư viện ----------
step "3/7" "Tạo môi trường ảo Python & cài thư viện (Flask, fpdf2, waitress)..."
if [ ! -x "$DEST/.venv/bin/python" ]; then
  if ! as_run_user python3 -m venv "$DEST/.venv" 2>/dev/null; then
    warn "Thiếu gói python3-venv — thử cài bổ sung rồi tạo lại..."
    if command -v apt-get >/dev/null 2>&1; then
      APT="apt-get"; [ "$(id -u)" != 0 ] && APT="sudo apt-get"
      $APT install -y -qq python3-venv
    elif command -v dnf >/dev/null 2>&1; then
      DNF="dnf"; [ "$(id -u)" != 0 ] && DNF="sudo dnf"
      $DNF install -y -q python3-pip
    fi
    as_run_user python3 -m venv "$DEST/.venv" || die "Không tạo được môi trường ảo Python."
  fi
fi
as_run_user "$DEST/.venv/bin/python" -m pip install --quiet --upgrade pip
as_run_user "$DEST/.venv/bin/python" -m pip install --quiet -r "$DEST/requirements.txt"
ok "Thư viện đã sẵn sàng"

# ---------- [4/7] Khởi tạo dữ liệu ----------
step "4/7" "Khởi tạo cơ sở dữ liệu (data/app.db)..."
as_run_user "$DEST/.venv/bin/python" -c "import sys; sys.path.insert(0,'$DEST'); from app import init_db; init_db()"
ok "Cơ sở dữ liệu đã tạo (nếu đã có dữ liệu thì giữ nguyên)"

# ---------- [5/7] Dịch vụ chạy nền ----------
step "5/7" "Cài dịch vụ chạy nền..."

# dừng bản cũ (nếu có) để kiểm tra cổng trống
if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = 0 ]; then
  systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
fi
pkill -f "$DEST/.venv/bin/python $DEST/app.py" >/dev/null 2>&1 || true

# tìm cổng trống — tránh cổng bị ứng dụng khác chiếm (ví dụ ERPNext/frappe)
port_busy() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1$"; }
PORT_WANTED="$PORT"
while port_busy "$PORT"; do
  warn "Cổng $PORT đã bị ứng dụng khác chiếm (có thể là ERPNext/frappe) → thử cổng $((PORT+1))"
  PORT=$((PORT+1))
  [ "$PORT" -gt "$((PORT_WANTED+30))" ] && die "Không tìm được cổng trống. Hãy chạy lại với PORT=<cổng còn trống>."
done
[ "$PORT" != "$PORT_WANTED" ] && ok "Sẽ dùng cổng trống: $PORT"

cat > "$DEST/start.sh" << EOF
#!/usr/bin/env bash
cd "\$(dirname "\$0")"
export PORT=$PORT
exec .venv/bin/python app.py
EOF
chmod +x "$DEST/start.sh"

if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = 0 ]; then
  cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=He thong quan ly Giay de nghi sua HSBA dien tu
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$DEST
ExecStart=$DEST/.venv/bin/python $DEST/app.py
Environment=PORT=$PORT
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME" >/dev/null 2>&1
  systemctl restart "$SERVICE_NAME"
  sleep 2
  if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "--------- 10 dòng log gần nhất ---------"
    journalctl -u "$SERVICE_NAME" -n 10 --no-pager || true
    die "Dịch vụ '$SERVICE_NAME' không khởi động được (xem log trên)."
  fi
  ok "Dịch vụ '$SERVICE_NAME' đã bật (tự chạy khi khởi động máy)"
else
  (cd "$DEST" && nohup .venv/bin/python app.py > "$DEST/app.log" 2>&1 &) \
    && ok "Đã khởi động nền (log: $DEST/app.log)"
  warn "Muốn tự chạy khi khởi động máy: thêm dòng sau vào 'crontab -e':"
  warn "  @reboot $DEST/start.sh > $DEST/app.log 2>&1 &"
fi

# ---------- [6/7] Tường lửa ----------
step "6/7" "Mở tường lửa cổng $PORT (nếu có)..."
if [ "$(id -u)" = 0 ] || command -v sudo >/dev/null 2>&1; then
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$PORT/tcp" >/dev/null 2>&1 && ok "ufw: đã mở cổng $PORT/tcp"
  elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="$PORT/tcp" >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 \
      && ok "firewalld: đã mở cổng $PORT/tcp"
  else
    ok "Không phát hiện tường lửa đang bật — bỏ qua"
  fi
fi

# ---------- [7/7] Kiểm tra hoạt động ----------
step "7/7" "Kiểm tra hệ thống hoạt động..."
HEALTH_OK=0
for i in $(seq 1 15); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/login"; then HEALTH_OK=1; break; fi
  sleep 1
done
[ "$HEALTH_OK" = 1 ] && ok "Trang đăng nhập phản hồi tốt tại cổng $PORT" \
  || warn "Chưa kiểm tra được (có thể chậm khởi động). Xem log: $DEST/app.log hoặc journalctl -u $SERVICE_NAME"

# ---------- thông tin truy cập ----------
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$LAN_IP" ] && LAN_IP="<IP-máy-cài>"
echo -e "\n${G}============================================================================${N}"
echo -e "${G} CÀI ĐẶT THÀNH CÔNG!${N}"
echo -e "${G}============================================================================${N}"
echo "  • Trên máy cài đặt : http://localhost:$PORT"
echo "  • Máy trong mạng   : http://$LAN_IP:$PORT"
echo "  • Thư mục cài đặt  : $DEST"
echo "  • Dữ liệu          : $DEST/data/app.db   (copy file này để sao lưu)"
echo "  • PDF đã xuất      : $DEST/exports/"
echo ""
echo "  Tài khoản mặc định (ĐỔI MẬT KHẨU NGAY khi dùng thật!):"
echo "    admin    / admin@123   — Quản trị (cấp tài khoản, phân quyền)"
echo "    bsminh   / 123456      — Người đề nghị (mẫu)"
echo "    khtb.lan / 123456      — Duyệt – TB.KHTH (mẫu)"
echo "    tc.hung  / 123456      — Tài chính, xác nhận hủy thanh toán (mẫu)"
echo ""
echo "  Lệnh quản lý:"
if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = 0 ]; then
  echo "    sudo systemctl restart $SERVICE_NAME   # khởi động lại"
  echo "    sudo systemctl stop $SERVICE_NAME      # dừng"
  echo "    journalctl -u $SERVICE_NAME -f         # xem log"
else
  echo "    $DEST/start.sh                          # khởi động lại"
fi
echo -e "${G}============================================================================${N}"
