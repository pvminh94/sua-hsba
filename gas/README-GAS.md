# Bản Google Apps Script — Cài đặt A → Z

Phiên bản **không cần máy chủ**: chạy trên Google, dữ liệu lưu trong Google Sheets
(một file do bạn sở hữu trong Google Drive), đăng nhập bằng **tài khoản Google**,
giữ nguyên quy trình 3 bước tick xác nhận + xuất PDF đúng mẫu giấy.

> ⚠️ **Lưu ý dữ liệu**: hệ thống lưu thông tin người bệnh (tên, mã KCB, mã thẻ BHYT)
> trên Google. Chỉ dùng khi CNTT/bệnh viện đã chấp nhận việc này.

---

## 1. Tạo dự án Apps Script (5 phút)

1. Đăng nhập tài khoản Google sẽ **sở hữu dữ liệu** (gọi là tài khoản quản trị).
2. Vào **https://script.google.com** → **Blank project** (Dự án mới).
3. Đổi tên dự án: **sua-hsba**.
4. Tạo đủ **6 tệp** trong editor (nút ＋ cạnh *Files*) — copy nội dung từ thư mục `gas/`
   trong repo này (https://github.com/pvminh94/sua-hsba/tree/main/gas):

   | Tệp trong editor        | Nguồn copy     | Loại tệp        |
   |-------------------------|----------------|-----------------|
   | `Setup`                 | `gas/Setup.gs` | Script          |
   | `Code`                  | `gas/Code.gs`  | Script          |
   | `Api`                   | `gas/Api.gs`   | Script          |
   | `Pdf`                   | `gas/Pdf.gs`   | Script          |
   | `Index`                 | `gas/Index.html`   | HTML        |
   | `Styles`                | `gas/Styles.html`  | HTML        |
   | `App`                   | `gas/App.html`     | HTML        |

   *(Lưu ý: chọn loại **HTML** khi tạo 3 tệp cuối, tên tệp KHÔNG kèm phần mở rộng.)*

## 2. Khởi tạo dữ liệu

1. Ở editor, ô dropdown chọn hàm → chọn **`setup`** → bấm **Run** ▶.
2. Lần đầu Google hỏi quyền → **Review permissions** → chọn tài khoản →
   *Advanced* → *Go to sua-hsba (unsafe)* → **Allow**.
   *(Cảnh báo "unsafe" là do ứng dụng chưa xác minh — bình thường với script tự làm.)*
3. Chạy xong sẽ tạo 1 Google Sheet tên **"Sửa HSBA điện tử — DỮ LIỆU"** trong Drive của bạn
   (gồm 4 trang: Users, Requests, Signatures, Logs) + 2 phiếu **[MẪU]**.
   **Bạn (người chạy setup) là ADMIN đầu tiên** — đăng nhập bằng chính email này.

## 3. Triển khai Web App

1. Trong editor: **Deploy** → **New deployment** → biểu tượng bánh răng → **Web app**.
2. Điền:
   - **Description**: `Bản chính` (tùy ý)
   - **Execute as**: **User accessing the web app**  ← quan trọng!
   - **Who has access**: **Anyone with a Google account**  ← quan trọng!
3. **Deploy** → copy **Web app URL** (dạng `https://script.google.com/macros/s/AKfy…/exec`).
4. Gửi URL này cho mọi người — mở là ra trang đăng nhập.

> ⚠️ **Sau mỗi lần sửa code**: Deploy → **Manage deployments** → ✏️ → Version: **New version** → Deploy
> (không bước này thì người dùng vẫn thấy bản cũ).

## 4. Cấp tài khoản cho mọi người

1. Đăng nhập Web App bằng email admin → **Quản trị tài khoản** → **＋ Thêm tài khoản**.
2. Nhập **email Google** của từng người + họ tên, chức danh, khoa + tick vai trò:
   - **Nhập liệu / Người đề nghị** — tạo phiếu, ký vai trò *NGƯỜI ĐỀ NGHỊ SỬA HSBA*
   - **Duyệt – TB.KHTH** — tick *DUYỆT/TB.KHTH* hoặc trả lại phiếu
   - **Tài chính (hủy thanh toán)** — tick *TC XÁC NHẬN ĐÃ HỦY THANH TOÁN*
   - **Quản trị** — cấp tài khoản (không ký thay người khác)
3. Người chưa có trong danh sách đăng nhập vào sẽ thấy thông báo
   *"Tài khoản chưa được cấp quyền"* + email của họ — cứ báo họ đọc email đó cho bạn.

Quy trình 3 bước ký, trả lại, lịch sử thao tác, xuất PDF đúng mẫu — **giống hệt** bản trước.

## 5. Dùng thử & dọn dữ liệu mẫu

- Có 2 phiếu **[MẪU]** (SDS-0001 chờ ký, SDS-0002 đã hoàn tất — bấm *Xem PDF* để xem).
- Muốn bắt đầu sạch: mở Google Sheet dữ liệu → xóa các dòng [MẪU] ở trang `Requests` +
  `Signatures`, hoặc xóa thẳng phiếu bằng nút **Xóa** trên web.

## 6. Sự cố thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| Không xác định được tài khoản Google | Kiểm tra mục 3: phải chọn *Execute as: User accessing*; đăng nhập Gmail trên trình duyệt rồi tải lại |
| Báo "app isn't verified" khi cấp quyền | *Advanced* → *Go to … (unsafe)* → Allow (ứng dụng nội bộ chưa qua xác minh Google) |
| Sửa code nhưng web không đổi | Deploy → Manage deployments → New version (mục 3.4) |
| Không tải được file PDF (bị chặn) | Dùng nút **👁 Xem PDF** rồi bấm tải / Ctrl+S trong khung xem |
| Cần đổi tên, vai trò, khóa tài khoản | Quản trị tài khoản → Sửa |

## 7. Ngừng bản cũ (Flask trên máy chủ)

Khi đã dùng ổn định bản GAS, tắt hẳn bản cũ trên server:

```bash
sudo systemctl disable --now sua-hsba
```

---

*Giấy đề nghị sửa HSBA điện tử — bản Google Apps Script. Mã nguồn: https://github.com/pvminh94/sua-hsba*
