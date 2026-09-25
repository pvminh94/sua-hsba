# Hệ thống quản lý GIẤY ĐỀ NGHỊ SỬA HỒ SƠ BỆNH ÁN ĐIỆN TỬ

Thay cho quy trình giấy tờ cũ (in giấy → ký tay → đưa lên → chụp ảnh gửi TC hủy thanh toán):
mọi người **đăng nhập tài khoản riêng**, nhập nội dung theo đúng mẫu giấy, và **tick xác nhận
điện tử** (lưu tài khoản + thời gian) theo 3 bước. Cuối cùng xuất **PDF đúng mẫu giấy** để in/lưu.

---

## 1. Cài đặt tự động (A → Z)

### Linux (Ubuntu/Debian/CentOS/RHEL…) — 1 lệnh duy nhất

```bash
curl -fsSL https://raw.githubusercontent.com/pvminh94/sua-hsba/main/install.sh | sudo bash
```

Script tự động: cài Python 3 + git → tải mã nguồn về `/opt/sua-hsba` → cài thư viện →
khởi tạo dữ liệu → cài dịch vụ chạy nền (tự khởi động cùng máy) → mở tường lửa →
**tự phát hiện cổng bị ứng dụng khác chiếm (vd: ERPNext) và chuyển sang cổng trống** →
kiểm tra hoạt động → in thông tin truy cập. Chạy lại lần nữa cũng không sao.

Tùy chỉnh: `PORT=8080 APP_DIR=/opt/hsba curl -fsSL ... | sudo bash`

> Nếu tải sẵn mã nguồn (ZIP/USB) thì chỉ cần: `sudo bash install.sh`

### Windows — chạy 2 tệp

1. Cài **Python 3** từ https://www.python.org/downloads/ (khi cài **tick “Add python.exe to PATH”**)
2. Chuột phải **`install.bat` → Run as administrator** (cài thư viện + tạo dữ liệu)
3. Chạy **`start.bat`** để khởi động (tự mở trình duyệt tại `http://localhost:8000`)

Máy khác trong mạng LAN truy cập `http://<IP-máy-cài>:8000`
(xem IP bằng `ipconfig`; nếu không vào được, mở cổng tường lửa 8000 — dòng lệnh nằm trong `install.bat`).

## 2. Chạy thủ công (mọi hệ điều hành)

Yêu cầu: Python 3.9+ (tải tại https://python.org — khi cài nhớ tick **Add to PATH**).

```bash
cd sua-hsba
pip install -r requirements.txt
python app.py
```

Ứng dụng chạy tại cổng **8000** (đổi bằng biến môi trường `PORT`).

- Trên máy cài đặt: mở trình duyệt vào `http://localhost:8000`
- Các máy khác trong mạng LAN: vào `http://<địa-chỉ-IP-máy-cài>:8000`
  (xem IP bằng lệnh `ipconfig` (Windows) / `ip addr` (Linux); có thể cần mở tường lửa
  cho cổng 8000 — Windows: *Windows Defender Firewall → Advanced settings → Inbound Rules → New Rule → Port → 8000*).

## 3. Tài khoản mặc định (ĐỔI MẬT KHẨU NGAY khi dùng thật!)

| Tên đăng nhập | Mật khẩu  | Vai trò                                    |
|---------------|-----------|--------------------------------------------|
| `admin`       | `admin@123` | Quản trị (cấp tài khoản, phân quyền)     |
| `bsminh`      | `123456`  | Nhập liệu / Người đề nghị (tài khoản mẫu) |
| `dieuduong.hoa` | `123456` | Nhập liệu / Người đề nghị (tài khoản mẫu) |
| `khtb.lan`    | `123456`  | Duyệt – TB.KHTH (tài khoản mẫu)            |
| `tc.hung`     | `123456`  | Tài chính – xác nhận hủy thanh toán (mẫu)  |

> Có sẵn 2 phiếu **[MẪU]** để xem thử quy trình. Muốn bắt đầu sạch: đăng nhập `admin`
> → xóa 2 phiếu mẫu → xóa các tài khoản mẫu → đổi mật khẩu admin.

## 4. Vai trò (phân quyền)

| Vai trò                     | Quyền                                                         |
|-----------------------------|---------------------------------------------------------------|
| **Nhập liệu / Người đề nghị** | Tạo, sửa phiếu; tick xác nhận vai trò **NGƯỜI ĐỀ NGHỊ SỬA HSBA** (chỉ đúng tài khoản được chỉ định trên phiếu) |
| **Duyệt – TB.KHTH**         | Tick **DUYỆT/TB.KHTH** hoặc trả lại phiếu                     |
| **Tài chính (hủy thanh toán)** | Tick **TC XÁC NHẬN ĐÃ HỦY THANH TOÁN** hoặc trả lại phiếu   |
| **Quản trị**                | Cấp/sửa/khóa tài khoản, phân quyền (không ký thay người khác) |

Một người có thể gán nhiều vai trò cùng lúc (ví dụ vừa KHTH vừa tài chính).

## 5. Quy trình 3 bước ký

1. **Người đề nghị** tạo phiếu (điền đủ các trường theo mẫu giấy), tick xác nhận ngay khi tạo
   (hoặc đăng nhập sau đó để tick) → *Chờ Duyệt/TB.KHTH*.
2. **TB.KHTH** đăng nhập, xem nội dung, tick **DUYỆT** (có ô ý kiến) hoặc **Trả lại** kèm lý do
   → *Chờ TC xác nhận hủy TT*.
3. **Tài chính (TC)** xác nhận **đã hủy thanh toán** (ghi chú số biên bản/mã giao dịch nếu cần)
   → *Hoàn tất*.

Mỗi lần tick, hệ thống lưu **tài khoản, họ tên, chức danh, thời gian, ý kiến** — đây là căn cứ
xác nhận thay cho chữ ký tay. Trang chi tiết phiếu có mục **Lịch sử thao tác** đầy đủ.

Nút **⬇ Tải PDF** cho ra giấy đề nghị **đúng mẫu** (A4, font Times), trong đó các ô ký ghi
tên + thời gian tick xác nhận của từng người + ô xác nhận của TC.

## 6. Dữ liệu & sao lưu

- Toàn bộ nội dung lưu trong thư mục `data/app.db` (một file duy nhất — **copy file này để sao lưu**).
- Bản PDF đã xuất lưu trong thư mục `exports/` (mỗi phiếu 1 file `SDS-xxxx.pdf`).
- Font chữ trong `fonts/` (không cần internet khi chạy).

## 7. Mẹo vận hành

- Trên Linux đã cài bằng `install.sh`: hệ thống chạy như dịch vụ, tự khởi động cùng máy
  (`sudo systemctl restart sua-hsba` để khởi động lại, `journalctl -u sua-hsba -f` để xem log).
- Trên Windows: chạy `start.bat` (muốn tự khởi động cùng Windows, đưa `start.bat` vào
  thư mục Startup — Win+R → `shell:startup`).
- **Chỉ tài khoản do admin cấp mới đăng nhập được** — đúng yêu cầu "một số tài khoản được vào".
