# -*- coding: utf-8 -*-
"""Xuất Giấy đề nghị sửa hồ sơ BA điện tử ra PDF đúng mẫu (A4, font Tinos/Times)."""
import os
from datetime import datetime
from fpdf import FPDF

BASE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(BASE, "fonts")

SIG_TITLES = {
    "de_nghi": "NGƯỜI ĐỀ NGHỊ SỬA HSBA",
    "khtb": "DUYỆT/ TB.KHTH",
    "taichinh": "TC XÁC NHẬN ĐÃ HỦY THANH TOÁN",
}

X0, X1 = 25.0, 185.0  # lề nội dung (mm)


def fmt_date_parts(iso):
    """'2026-09-08' -> ('8', '9', '2026'); rỗng nếu không có."""
    if not iso:
        return "", "", ""
    try:
        d = datetime.strptime(str(iso)[:10], "%Y-%m-%d")
        return str(d.day), str(d.month), str(d.year)
    except (ValueError, TypeError):
        return "", "", ""


def fmt_dt(iso):
    """ISO -> '09:15 ngày 25/09/2026'."""
    if not iso:
        return ""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            d = datetime.strptime(str(iso)[:19], fmt)
            return d.strftime("%H:%M ngày %d/%m/%Y")
        except ValueError:
            continue
    return str(iso)


class FormPDF(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.add_font("Tinos", "", os.path.join(FONTS, "Tinos-Regular.ttf"))
        self.add_font("Tinos", "B", os.path.join(FONTS, "Tinos-Bold.ttf"))
        self.add_font("Tinos", "I", os.path.join(FONTS, "Tinos-Italic.ttf"))
        self.add_font("Tinos", "BI", os.path.join(FONTS, "Tinos-BoldItalic.ttf"))
        self.set_auto_page_break(True, margin=25)
        self.set_margins(20, 15, 20)

    # ---------- tiện ích vẽ ----------
    def dots(self, x, y_base, w, step=0.95, size=0.24):
        """Đường chấm tròn dưới ô nhập liệu (giống mẫu giấy)."""
        self.set_fill_color(0, 0, 0)
        n = int(w / step)
        for i in range(n + 1):
            self.rect(x + i * step, y_base + 0.4, size, size, style="F")

    def draw_value(self, x, y_base, w, value, size=12):
        """Vẽ giá trị + đường chấm bên dưới; tự thu nhỏ nếu quá rộng."""
        value = value or ""
        self.dots(x, y_base, w)
        if not value:
            return
        self.set_font("Tinos", "", size)
        tw = self.get_string_width(value)
        if tw > w:
            size = max(8.0, size * (w / tw))
            self.set_font("Tinos", "", size)
        self.set_text_color(0, 0, 0)
        self.text(x, y_base, value)

    def token_row(self, y, tokens, size=12):
        """Row gồm [('L', 'nhãn'), ('V', 'giá trị', bề rộng), ...]."""
        x = X0
        gap = 1.2
        for tok in tokens:
            if tok[0] == "L":
                self.set_font("Tinos", "", size)
                self.set_text_color(0, 0, 0)
                self.text(x, y, tok[1])
                x += self.get_string_width(tok[1])
            else:
                _, val, w = tok
                w = min(float(w), X1 - x)
                if w <= 2:
                    break
                self.draw_value(x, y, w, val, size)
                x += w + gap

    def wrap(self, text, first_w, rest_w, size=12):
        """Tách nội dung thành các dòng vừa bề rộng (dòng đầu hẹp hơn do nhãn)."""
        self.set_font("Tinos", "", size)
        words = (text or "").split()
        lines, cur, w_limit = [], [], first_w
        for wd in words:
            trial = (" ".join(cur + [wd])).strip()
            if self.get_string_width(trial) <= w_limit or not cur:
                cur.append(wd)
            else:
                lines.append(" ".join(cur))
                cur, w_limit = [wd], rest_w
        if cur:
            lines.append(" ".join(cur))
        return lines or [""]


def export_pdf(req, sigs, out_path):
    """req: dict phiếu; sigs: dict {'de_nghi'|'khtb'|'taichinh': dict chữ ký}."""
    sigs = sigs or {}
    pdf = FormPDF()
    pdf.add_page()

    # ===== Quốc hiệu + tiêu đề =====
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Tinos", "B", 13)
    pdf.set_xy(X0, 16)
    pdf.cell(X1 - X0, 6, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", align="C")
    pdf.set_font("Tinos", "", 12)
    pdf.set_xy(X0, 22.5)
    pdf.cell(X1 - X0, 6, "Độc lập – Tự do – Hạnh phúc", align="C")
    w_line = pdf.get_string_width("Độc lập – Tự do – Hạnh phúc")
    pdf.set_line_width(0.25)
    pdf.line((210 - w_line) / 2, 28.8, (210 + w_line) / 2, 28.8)

    pdf.set_font("Tinos", "B", 14)
    pdf.set_xy(X0, 36)
    pdf.cell(X1 - X0, 7, "GIẤY ĐỀ NGHỊ SỬA HỒ SƠ BỆNH ÁN ĐIỆN TỬ", align="C")

    pdf.set_font("Tinos", "", 12)
    pdf.set_xy(X0, 48)
    pdf.cell(X1 - X0, 6, "Kính gửi: Ban Kế hoạch tổng hợp.", align="C")

    # ===== Các trường thông tin =====
    y = 60
    pdf.token_row(y, [
        ("L", "Tôi tên: "), ("V", req.get("ten_nguoi_nghi", ""), 68),
        ("L", "  Chức danh: "), ("V", req.get("chuc_danh", ""), 42),
    ])
    y += 7
    pdf.token_row(y, [
        ("L", "Khoa: "), ("V", req.get("khoa", ""), 145),
    ])
    y += 8
    pdf.set_font("Tinos", "", 12)
    pdf.text(X0, y, "Cần sửa hồ sơ bệnh án điện tử của:")

    y += 7
    pdf.token_row(y, [
        ("L", "Người bệnh: "), ("V", req.get("ten_benh_nhan", ""), 133),
    ])
    y += 7
    pdf.token_row(y, [
        ("L", "Năm sinh: "), ("V", req.get("nam_sinh", ""), 55),
        ("L", "  Mã KCB: "), ("V", req.get("ma_kcb", ""), 58),
    ])
    y += 7
    d1, m1, y1 = fmt_date_parts(req.get("ngay_vao_vien"))
    d2, m2, y2 = fmt_date_parts(req.get("ngay_ra_vien"))
    pdf.token_row(y, [
        ("L", "Vào viện: ngày "), ("V", d1, 7),
        ("L", " tháng "), ("V", m1, 7),
        ("L", " năm "), ("V", y1, 10),
        ("L", "  Ra viện ngày "), ("V", d2, 7),
        ("L", " tháng "), ("V", m2, 7),
        ("L", " năm "), ("V", y2, 10),
    ], size=11)
    y += 7
    pdf.token_row(y, [
        ("L", "Mã thẻ BHYT "), ("V", req.get("ma_the_bhyt", ""), 133),
    ])
    y += 7
    pdf.token_row(y, [
        ("L", "Lý do sai: "), ("V", req.get("ly_do_sai", ""), 136),
    ])

    # ===== Nội dung sai (nhiều dòng chấm) =====
    y += 7
    label = "Nội dung sai: "
    pdf.set_font("Tinos", "", 12)
    lw = pdf.get_string_width(label)
    pdf.text(X0, y, label)
    lines = pdf.wrap(req.get("noi_dung_sai", ""), X1 - (X0 + lw), X1 - X0)
    n_lines = max(len(lines), 8)  # giữ phong cách mẫu giấy (nhiều dòng chấm)
    for i in range(n_lines):
        if i:
            y += 6.5
        if i == 0:
            pdf.draw_value(X0 + lw, y, X1 - (X0 + lw), lines[0])
        else:
            txt = lines[i] if i < len(lines) else ""
            pdf.draw_value(X0, y, X1 - X0, txt)

    # ===== Câu kết =====
    y += 11
    pdf.set_font("Tinos", "", 12)
    pdf.text(X0, y, "Kính đề nghị Ban KHTH cho sửa HSBA điện tử của người bệnh trên.")

    y += 8
    d, m, yy = fmt_date_parts(req.get("created_at"))
    date_line = f"Thành phố Hồ Chí Minh, ngày {d or '......'} tháng {m or '......'} năm {yy or '20....'}"
    pdf.set_font("Tinos", "I", 12)
    w_date = pdf.get_string_width(date_line)
    pdf.text(X1 - w_date, y, date_line)

    # ===== Chữ ký =====
    y += 12
    if y > 215:  # không đủ chỗ thì sang trang
        pdf.add_page()
        y = 30

    col_l, col_r = 68.0, 138.0  # tâm 2 cột ký

    def sig_block(xc, ytop, title, sig, note_label="Ý kiến"):
        pdf.set_font("Tinos", "B", 12)
        w = pdf.get_string_width(title)
        if w > 78:  # tiêu đề dài (TC) thì thu nhỏ
            pdf.set_font("Tinos", "B", max(9.5, 12 * 78 / w))
        pdf.text(xc - pdf.get_string_width(title) / 2, ytop, title)
        yy2 = ytop + 3
        if sig:
            yy2 += 5
            line1 = "(Đã xác nhận điện tử)"
            pdf.set_font("Tinos", "I", 10)
            pdf.text(xc - pdf.get_string_width(line1) / 2, yy2, line1)
            yy2 += 5.5
            name = sig.get("full_name") or ""
            pdf.set_font("Tinos", "B", 11)
            pdf.text(xc - pdf.get_string_width(name) / 2, yy2, name)
            yy2 += 5
            if sig.get("title"):
                pdf.set_font("Tinos", "", 10)
                pdf.text(xc - pdf.get_string_width(sig["title"]) / 2, yy2, sig["title"])
                yy2 += 5
            time_line = "Lúc: " + fmt_dt(sig.get("signed_at"))
            pdf.set_font("Tinos", "I", 10)
            pdf.text(xc - pdf.get_string_width(time_line) / 2, yy2, time_line)
            yy2 += 5
            if sig.get("note"):
                pdf.set_font("Tinos", "I", 9.5)
                note = f"{note_label}: {sig['note']}"
                nlines = pdf.wrap(note, 78, 78, size=9.5)
                for ln in nlines:
                    pdf.text(xc - pdf.get_string_width(ln) / 2, yy2, ln)
                    yy2 += 4.5
        return yy2

    y_l = sig_block(col_l, y, SIG_TITLES["khtb"], sigs.get("khtb"))
    y_r = sig_block(col_r, y, SIG_TITLES["de_nghi"], sigs.get("de_nghi"))

    # Ô xác nhận TC (bước 3) — dưới cột trái
    y_tc = max(y_l, y + 18) + 12
    if y_tc > 265:
        pdf.add_page()
        y_tc = 35
    sig_block(col_l, y_tc, SIG_TITLES["taichinh"], sigs.get("taichinh"), note_label="Ghi chú")

    # ===== Footer =====
    pdf.set_text_color(110, 110, 110)
    pdf.set_font("Tinos", "I", 8)
    now = datetime.now().strftime("%H:%M %d/%m/%Y")
    footer = f"In từ Hệ thống quản lý đề nghị sửa HSBA điện tử · Mã phiếu: {req.get('code', '')} · In lúc: {now}"
    pdf.text(X0, 287, footer)

    pdf.output(out_path)
    return out_path
