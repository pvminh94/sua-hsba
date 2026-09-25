# Bản Google Apps Script — Cài đặt A → Z

Phiên bản **không cần máy chủ, KHÔNG cần Gmail**: chạy trên Google, dữ liệu lưu trong Google Sheets
(một file do chủ sở hữu dự án sở hữu trong Google Drive), **đăng nhập bằng tài khoản/mật khẩu nội bộ**
do admin cấp — giữ nguyên quy trình 3 bước tick xác nhận + xuất PDF đúng mẫu giấy.

> ⚠️ **Lưu ý dữ liệu**: hệ thống lưu thông tin người bệnh (tên, mã KCB, mã thẻ BHYT)
> trên Google Sheets. Chỉ dùng khi CNTT/bệnh viện đã chấp nhận việc này.

---

## 1. Tạo dự án Apps Script (5 phút)

1. Đăng nhập tài khoản Google sẽ **sở hữu dữ liệu** (tài khoản quản trị) → **https://script.google.com** → **Blank project**.
2. Đổi tên dự án: **sua-hsba**.
3. Tạo đủ **7 tệp** trong editor — copy nội dung từ thư mục `gas/` trong repo này:

   | Tệp trong editor | Nguồn copy             | Loại tệp |
   |------------------|------------------------|----------|
   | `appsscript`     | `gas/appsscript.json`  | **JSON** (manifest) |
   | `Setup`          | `gas/Setup.gs`         | Script   |
   | `Code`           | `gas/Code.gs`          | Script   |
   | `Api`            | `gas/Api.gs`           | Script   |
   | `Pdf`            | `gas/Pdf.gs`           | Script   |
   | `Index`          | `gas/Index.html`       | HTML     |
   | `Styles`         | `gas/Styles.html`      | HTML     |
   | `App`            | `gas/App.html`         | HTML     |

   *(3 tệp HTML phải chọn loại **HTML**; nội dung tệp `App`/`Styles` đã có sẵn thẻ `<script>`/`<style>` bọc bên trong —
   `Index` gọi trần `<?!= include('App'); ?>`. Đừng thêm/bớt thẻ nếu không sẽ lỗi "Malformed HTML".)*

## 2. Khởi tạo dữ liệu

1. Chọn hàm **`setup`** → **Run** ▶ → cấp quyền (Review permissions → Advanced → Go to… → Allow).
2. Tạo Google Sheet **"Sửa HSBA điện tử — DỮ LIỆU"** trong Drive của bạn + 2 phiếu **[MẪU]**.
3. **Tài khoản admin đầu tiên** = email chủ dự án · **mật khẩu mặc định: `123456`** (đổi ngay sau khi đăng nhập).

## 3. Triển khai Web App

1. **Deploy** → **New deployment** → ⚙ → **Web app**:
   - **Execute as**: **Me** (người deploy — chủ dữ liệu)
   - **Who has access**: **Anyone**  ← KHÔNG yêu cầu đăng nhập Google
2. **Deploy** → copy **Web app URL** (`https://script.google.com/macros/s/…/exec`) gửi mọi người.
3. Sau mỗi lần sửa code: **Manage deployments** → ✏️ → Version: **New version** → Deploy.

## 4. Đăng nhập & cấp tài khoản

- Mở Web App → màn hình **đăng nhập nội bộ** (tài khoản + mật khẩu — không cần Google).
- Đăng nhập admin → **Quản trị tài khoản** → thêm người: **tài khoản** (vd: `bsminh`), **mật khẩu**, họ tên,
  chức danh, khoa + tick vai trò (Nhập liệu / Duyệt TB.KHTH / Tài chính / Quản trị).
- Mỗi người tự **Đổi mật khẩu** sau khi đăng nhập.
- Ai không có tài khoản sẽ bị chặn ở màn hình đăng nhập (đúng yêu cầu "chỉ một số tài khoản được vào").

Quy trình 3 bước ký, trả lại, lịch sử thao tác, xuất PDF đúng mẫu — **giống hệt** bản Flask.

## 5. Sự cố thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Trang báo "Authorization required" khi mở | Đăng nhập tài khoản chủ dự án → mở Apps Script editor → chạy hàm `migrate_` → Allow |
| Báo "Malformed HTML content" | File `App.html`/`Styles.html` phải có thẻ `<script>`/`<style>` bọc bên trong; `Index.html` include trần |
| Treo chữ "Đang tải…" | F12 xem Console; thường do lỗi JS — báo người sửa code redeploy |
| Sửa code nhưng web không đổi | Deploy → Manage deployments → **New version** |
| Quên mật khẩu admin | Mở Sheet dữ liệu → trang Users → xóa ô `password_hash` + `salt` của tài khoản đó, chạy `migrate_` trong editor → mật khẩu về `123456` |

## 6. Ngừng bản cũ (Flask trên máy chủ)

```bash
sudo systemctl disable --now sua-hsba
```
