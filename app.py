# -*- coding: utf-8 -*-
"""
Hệ thống quản lý GIẤY ĐỀ NGHỊ SỬA HỒ SƠ BỆNH ÁN ĐIỆN TỬ
- Chỉ tài khoản được admin cấp mới đăng nhập được.
- Quy trình ký điện tử 3 bước: Người đề nghị → Duyệt/TB.KHTH → TC xác nhận hủy thanh toán.
- Mỗi người ký đăng nhập đúng tài khoản của mình rồi tick xác nhận (lưu tài khoản + thời gian).
- Xuất PDF đúng mẫu giấy để in/lưu trữ.
"""
import os
import secrets
import sqlite3
from datetime import datetime
from functools import wraps

from flask import (Flask, abort, flash, g, redirect, render_template, request,
                   send_file, session, url_for)
from werkzeug.security import check_password_hash, generate_password_hash

from pdf_export import SIG_TITLES, export_pdf

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "data", "app.db")
EXPORTS_DIR = os.path.join(BASE, "exports")
SECRET_FILE = os.path.join(BASE, "data", "secret_key.bin")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

ROLES = {
    "nhap": "Nhập liệu / Người đề nghị",
    "khtb": "Duyệt – TB.KHTH",
    "taichinh": "Tài chính (hủy thanh toán)",
    "admin": "Quản trị",
}

STATUS = {
    "cho_de_nghi": "Chờ người đề nghị xác nhận",
    "cho_khtb": "Chờ Duyệt/TB.KHTH",
    "cho_tc": "Chờ TC xác nhận hủy TT",
    "hoan_tat": "Hoàn tất",
    "tra_lai": "Đã trả lại",
}

STAGE_SIG = {"cho_de_nghi": "de_nghi", "cho_khtb": "khtb", "cho_tc": "taichinh"}
NEXT_STATUS = {"de_nghi": "cho_khtb", "khtb": "cho_tc", "taichinh": "hoan_tat"}

CONFIRM_TEXT = {
    "de_nghi": ("Tôi xác nhận nội dung giấy đề nghị trên là đúng và gửi Ban KHTH "
                "để đề nghị sửa HSBA điện tử."),
    "khtb": "Tôi đã xem xét và DUYỆT / Thông báo cho sửa HSBA điện tử theo nội dung trên.",
    "taichinh": ("Tôi xác nhận ĐÃ HỦY THANH TOÁN (giao dịch BHYT) liên quan đến "
                 "hồ sơ bệnh án này."),
}

CREATE_FIELDS = [
    "requester_user_id", "ten_nguoi_nghi", "chuc_danh", "khoa", "ten_benh_nhan",
    "nam_sinh", "ma_kcb", "ngay_vao_vien", "ngay_ra_vien", "ma_the_bhyt",
    "ly_do_sai", "noi_dung_sai",
]


# ---------------------------------------------------------------- tiện ích
def load_or_create_secret():
    os.makedirs(os.path.dirname(SECRET_FILE), exist_ok=True)
    if not os.path.exists(SECRET_FILE):
        with open(SECRET_FILE, "wb") as f:
            f.write(secrets.token_bytes(32))
    with open(SECRET_FILE, "rb") as f:
        return f.read().hex()


app.config["SECRET_KEY"] = load_or_create_secret()


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def split_roles(user):
    return [r for r in (user["roles"] or "").split(",") if r]


def has_role(user, *roles):
    rs = split_roles(user)
    return any(r in rs for r in roles)


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def add_log(request_id, user, action, detail=""):
    db = get_db()
    db.execute(
        "INSERT INTO logs (request_id, user_id, username, full_name, action, detail, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (request_id, user["id"], user["username"], user["full_name"], action, detail, now_str()),
    )
    db.commit()


def get_request_or_404(req_id):
    row = get_db().execute("SELECT * FROM requests WHERE id=?", (req_id,)).fetchone()
    if not row:
        abort(404)
    return row


def get_sigs(req_id):
    rows = get_db().execute(
        "SELECT s.*, u.username AS username FROM signatures s "
        "LEFT JOIN users u ON u.id = s.user_id WHERE s.request_id=?", (req_id,)).fetchall()
    return {r["sig_type"]: r for r in rows}


def can_sign(user, req, sig_type):
    if sig_type == "de_nghi":
        return user["id"] == req["requester_user_id"]
    if sig_type == "khtb":
        return has_role(user, "khtb")
    if sig_type == "taichinh":
        return has_role(user, "taichinh")
    return False


def can_edit(user, req):
    if req["status"] not in ("cho_de_nghi", "tra_lai"):
        return False
    return (user["id"] in (req["created_by"], req["requester_user_id"])
            or has_role(user, "admin"))


def can_delete(user, req):
    if has_role(user, "admin"):
        return True
    return (user["id"] == req["created_by"]
            and req["status"] in ("cho_de_nghi", "tra_lai"))


def eligible_sig_types(user, req):
    """Các loại chữ ký mà user được phép thực hiện ở trạng thái hiện tại."""
    sig_type = STAGE_SIG.get(req["status"])
    if sig_type and can_sign(user, req, sig_type):
        return sig_type
    return None


# ---------------------------------------------------------------- đăng nhập
def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def role_required(*roles):
    def deco(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not session.get("user_id"):
                return redirect(url_for("login"))
            user = get_db().execute("SELECT * FROM users WHERE id=?",
                                    (session["user_id"],)).fetchone()
            if not user or not has_role(user, *roles):
                abort(403)
            return view(*args, **kwargs)
        return wrapped
    return deco


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    return get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()


@app.before_request
def csrf_protect():
    # phát hành token cho phiên
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    if request.method == "POST":
        token = request.form.get("csrf", "")
        if not token or token != session.get("csrf"):
            abort(400, "CSRF token không hợp lệ. Hãy tải lại trang và thử lại.")


@app.context_processor
def inject_globals():
    return {
        "ROLES": ROLES, "STATUS": STATUS, "SIG_TITLES": SIG_TITLES,
        "CONFIRM_TEXT": CONFIRM_TEXT, "cur_user": current_user(),
    }


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        user = get_db().execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        if user and user["active"] and check_password_hash(user["password_hash"], password):
            session["user_id"] = user["id"]
            add_log(None, user, "Đăng nhập")
            dest = request.args.get("next") or url_for("index")
            return redirect(dest)
        flash("Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản đã bị khóa.", "error")
    return render_template("login.html")


@app.route("/logout")
def logout():
    if session.get("user_id"):
        user = current_user()
        if user:
            add_log(None, user, "Đăng xuất")
    session.clear()
    return redirect(url_for("login"))


@app.route("/doi-mat-khau", methods=["GET", "POST"])
@login_required
def change_password():
    user = current_user()
    if request.method == "POST":
        old = request.form.get("old_password") or ""
        new = request.form.get("new_password") or ""
        confirm = request.form.get("confirm_password") or ""
        if not check_password_hash(user["password_hash"], old):
            flash("Mật khẩu hiện tại không đúng.", "error")
        elif len(new) < 6:
            flash("Mật khẩu mới phải có ít nhất 6 ký tự.", "error")
        elif new != confirm:
            flash("Xác nhận mật khẩu mới không khớp.", "error")
        else:
            db = get_db()
            db.execute("UPDATE users SET password_hash=? WHERE id=?",
                       (generate_password_hash(new), user["id"]))
            db.commit()
            add_log(None, user, "Đổi mật khẩu")
            flash("Đã đổi mật khẩu thành công.", "ok")
            return redirect(url_for("index"))
    return render_template("change_password.html")


# ---------------------------------------------------------------- danh sách
@app.route("/")
@login_required
def index():
    q = (request.args.get("q") or "").strip()
    status = request.args.get("status") or ""
    sql = ("SELECT r.*, u.full_name AS creator_name FROM requests r "
           "LEFT JOIN users u ON u.id = r.created_by WHERE 1=1")
    args = []
    if status:
        sql += " AND r.status=?"
        args.append(status)
    if q:
        like = f"%{q}%"
        sql += (" AND (r.ten_benh_nhan LIKE ? OR r.ma_kcb LIKE ? OR r.code LIKE ? "
                "OR r.ma_the_bhyt LIKE ? OR r.ten_nguoi_nghi LIKE ?)")
        args += [like] * 5
    sql += " ORDER BY r.id DESC"
    rows = get_db().execute(sql, args).fetchall()
    user = current_user()
    items = []
    for r in rows:
        items.append({
            "req": r,
            "my_action": eligible_sig_types(user, r),
        })
    return render_template("list.html", items=items, q=q, status_filter=status)


# ---------------------------------------------------------------- tạo / sửa phiếu
@app.route("/tao", methods=["GET", "POST"])
@login_required
def create_request():
    user = current_user()
    if not (has_role(user, "nhap") or has_role(user, "admin")):
        abort(403)
    db = get_db()
    users = db.execute("SELECT * FROM users WHERE active=1 ORDER BY full_name").fetchall()
    if request.method == "POST":
        data = {f: (request.form.get(f) or "").strip() for f in CREATE_FIELDS}
        if not data["requester_user_id"] or not data["ten_nguoi_nghi"] or not data["khoa"] \
                or not data["ten_benh_nhan"] or not data["ly_do_sai"] or not data["noi_dung_sai"]:
            flash("Vui lòng nhập đủ các trường bắt buộc (đánh dấu *).", "error")
            return render_template("form.html", users=users, values=data, mode="new")
        cur = db.execute(
            "INSERT INTO requests (code, created_by, requester_user_id, ten_nguoi_nghi, chuc_danh, "
            "khoa, ten_benh_nhan, nam_sinh, ma_kcb, ngay_vao_vien, ngay_ra_vien, ma_the_bhyt, "
            "ly_do_sai, noi_dung_sai, status, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ("TMP", user["id"], int(data["requester_user_id"]),
             data["ten_nguoi_nghi"], data["chuc_danh"], data["khoa"], data["ten_benh_nhan"],
             data["nam_sinh"], data["ma_kcb"], data["ngay_vao_vien"], data["ngay_ra_vien"],
             data["ma_the_bhyt"], data["ly_do_sai"], data["noi_dung_sai"],
             "cho_de_nghi", now_str(), now_str()),
        )
        req_id = cur.lastrowid
        code = f"SDS-{req_id:04d}"
        db.execute("UPDATE requests SET code=? WHERE id=?", (code, req_id))

        # tick ký ngay (nếu người tạo chính là người đề nghị và có tick xác nhận)
        ky_ngay = request.form.get("ky_ngay") == "1"
        if ky_ngay and user["id"] == int(data["requester_user_id"]):
            db.execute(
                "INSERT INTO signatures (request_id, sig_type, user_id, full_name, title, note, signed_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (req_id, "de_nghi", user["id"], data["ten_nguoi_nghi"], data["chuc_danh"],
                 "", now_str()),
            )
            db.execute("UPDATE requests SET status='cho_khtb', updated_at=? WHERE id=?",
                       (now_str(), req_id))
        db.commit()
        add_log(req_id, user, "Tạo phiếu", f"Mã phiếu {code}")
        if ky_ngay and user["id"] == int(data["requester_user_id"]):
            add_log(req_id, user, "Xác nhận (Ký điện tử)", "Người đề nghị sửa HSBA")
        flash(f"Đã tạo phiếu {code}.", "ok")
        return redirect(url_for("detail", req_id=req_id))
    return render_template("form.html", users=users, values={}, mode="new")


@app.route("/p/<int:req_id>/sua", methods=["GET", "POST"])
@login_required
def edit_request(req_id):
    user = current_user()
    req = get_request_or_404(req_id)
    if not can_edit(user, req):
        abort(403)
    db = get_db()
    users = db.execute("SELECT * FROM users WHERE active=1 ORDER BY full_name").fetchall()
    if request.method == "POST":
        data = {f: (request.form.get(f) or "").strip() for f in CREATE_FIELDS}
        if not data["requester_user_id"] or not data["ten_nguoi_nghi"] or not data["khoa"] \
                or not data["ten_benh_nhan"] or not data["ly_do_sai"] or not data["noi_dung_sai"]:
            flash("Vui lòng nhập đủ các trường bắt buộc (đánh dấu *).", "error")
            return render_template("form.html", users=users, values=data, mode="edit", req=req)
        sets = ", ".join(f"{f}=?" for f in CREATE_FIELDS)
        db.execute(
            f"UPDATE requests SET {sets}, updated_at=? WHERE id=?",
            [data[f] for f in CREATE_FIELDS] + [now_str(), req_id],
        )
        db.commit()
        add_log(req_id, user, "Cập nhật nội dung phiếu")
        flash("Đã lưu nội dung.", "ok")
        return redirect(url_for("detail", req_id=req_id))
    values = {f: req[f] for f in CREATE_FIELDS}
    return render_template("form.html", users=users, values=values, mode="edit", req=req)


@app.route("/p/<int:req_id>/gui-lai", methods=["POST"])
@login_required
def resubmit(req_id):
    user = current_user()
    req = get_request_or_404(req_id)
    if not can_edit(user, req) or req["status"] != "tra_lai":
        abort(403)
    db = get_db()
    db.execute("UPDATE requests SET status='cho_de_nghi', ly_do_tra_lai='', updated_at=? WHERE id=?",
               (now_str(), req_id))
    db.commit()
    add_log(req_id, user, "Gửi lại phiếu sau khi bị trả lại")
    flash("Đã gửi lại phiếu — chờ người đề nghị xác nhận.", "ok")
    return redirect(url_for("detail", req_id=req_id))


@app.route("/p/<int:req_id>/xoa", methods=["POST"])
@login_required
def delete_request(req_id):
    user = current_user()
    req = get_request_or_404(req_id)
    if not can_delete(user, req):
        abort(403)
    db = get_db()
    db.execute("DELETE FROM signatures WHERE request_id=?", (req_id,))
    db.execute("DELETE FROM logs WHERE request_id=?", (req_id,))
    db.execute("DELETE FROM requests WHERE id=?", (req_id,))
    db.commit()
    flash(f"Đã xóa phiếu {req['code']}.", "ok")
    return redirect(url_for("index"))


# ---------------------------------------------------------------- ký xác nhận
@app.route("/p/<int:req_id>/xac-nhan", methods=["POST"])
@login_required
def confirm(req_id):
    user = current_user()
    req = get_request_or_404(req_id)
    sig_type = request.form.get("sig_type") or ""
    if sig_type not in ("de_nghi", "khtb", "taichinh"):
        abort(400)
    # đúng giai đoạn + đúng người được ký
    if STAGE_SIG.get(req["status"]) != sig_type or not can_sign(user, req, sig_type):
        abort(403)
    if request.form.get("xac_nhan") != "1":
        flash("Bạn cần tick xác nhận trước khi ký.", "error")
        return redirect(url_for("detail", req_id=req_id))
    note = (request.form.get("note") or "").strip()
    db = get_db()
    db.execute(
        "INSERT INTO signatures (request_id, sig_type, user_id, full_name, title, note, signed_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (req_id, sig_type, user["id"], user["full_name"], user["title"], note, now_str()),
    )
    new_status = NEXT_STATUS[sig_type]
    db.execute("UPDATE requests SET status=?, updated_at=? WHERE id=?", (new_status, now_str(), req_id))
    db.commit()
    add_log(req_id, user, "Xác nhận (Ký điện tử)", SIG_TITLES[sig_type] + (f" — Ý kiến: {note}" if note else ""))
    flash("Đã xác nhận thành công.", "ok")
    return redirect(url_for("detail", req_id=req_id))


@app.route("/p/<int:req_id>/tra-lai", methods=["POST"])
@login_required
def return_request(req_id):
    user = current_user()
    req = get_request_or_404(req_id)
    sig_type = STAGE_SIG.get(req["status"])
    if not sig_type or not can_sign(user, req, sig_type):
        abort(403)
    ly_do = (request.form.get("ly_do") or "").strip()
    if not ly_do:
        flash("Vui lòng nhập lý do trả lại.", "error")
        return redirect(url_for("detail", req_id=req_id))
    db = get_db()
    db.execute("DELETE FROM signatures WHERE request_id=?", (req_id,))
    db.execute("UPDATE requests SET status='tra_lai', ly_do_tra_lai=?, updated_at=? WHERE id=?",
               (ly_do, now_str(), req_id))
    db.commit()
    add_log(req_id, user, "Trả lại phiếu", f"Lý do: {ly_do}")
    flash("Đã trả lại phiếu.", "ok")
    return redirect(url_for("detail", req_id=req_id))


@app.route("/p/<int:req_id>")
@login_required
def detail(req_id):
    user = current_user()
    req = get_request_or_404(req_id)
    sigs = get_sigs(req_id)
    logs = get_db().execute(
        "SELECT * FROM logs WHERE request_id=? ORDER BY id", (req_id,)).fetchall()
    return render_template(
        "detail.html", req=req, sigs=sigs, logs=logs,
        my_action=eligible_sig_types(user, req),
        can_edit=can_edit(user, req), can_delete=can_delete(user, req),
    )


@app.route("/p/<int:req_id>/pdf")
@login_required
def pdf(req_id):
    req = get_request_or_404(req_id)
    sigs = get_sigs(req_id)
    os.makedirs(EXPORTS_DIR, exist_ok=True)
    out = os.path.join(EXPORTS_DIR, f"{req['code']}.pdf")
    export_pdf(dict(req), {k: dict(v) for k, v in sigs.items()}, out)
    return send_file(out, as_attachment=True, download_name=f"{req['code']}.pdf")


# ---------------------------------------------------------------- quản trị
@app.route("/admin/nguoi-dung")
@role_required("admin")
def admin_users():
    rows = get_db().execute("SELECT * FROM users ORDER BY id").fetchall()
    return render_template("admin_users.html", users=rows)


@app.route("/admin/nguoi-dung/tao", methods=["GET", "POST"])
@role_required("admin")
def admin_user_new():
    return _user_form(None)


@app.route("/admin/nguoi-dung/<int:uid>/sua", methods=["GET", "POST"])
@role_required("admin")
def admin_user_edit(uid):
    return _user_form(uid)


def _user_form(uid):
    db = get_db()
    user = None
    if uid is not None:
        user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        if not user:
            abort(404)
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        full_name = (request.form.get("full_name") or "").strip()
        title = (request.form.get("title") or "").strip()
        department = (request.form.get("department") or "").strip()
        password = request.form.get("password") or ""
        roles = ",".join(r for r in ROLES if request.form.get(f"role_{r}"))
        active = 1 if request.form.get("active") == "1" else 0
        if not username or not full_name:
            flash("Tên đăng nhập và họ tên là bắt buộc.", "error")
            return render_template("user_form.html", u=user, values=request.form)
        exists = db.execute("SELECT id FROM users WHERE username=? AND id!=?",
                            (username, uid or -1)).fetchone()
        if exists:
            flash("Tên đăng nhập đã tồn tại.", "error")
            return render_template("user_form.html", u=user, values=request.form)
        if uid is None:
            if len(password) < 6:
                flash("Mật khẩu phải có ít nhất 6 ký tự.", "error")
                return render_template("user_form.html", u=user, values=request.form)
            db.execute(
                "INSERT INTO users (username, password_hash, full_name, title, department, roles, active, created_at) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (username, generate_password_hash(password), full_name, title,
                 department, roles, active, now_str()),
            )
            db.commit()
            flash(f"Đã tạo tài khoản {username}.", "ok")
        else:
            if password:
                if len(password) < 6:
                    flash("Mật khẩu mới phải có ít nhất 6 ký tự.", "error")
                    return render_template("user_form.html", u=user, values=request.form)
                db.execute("UPDATE users SET password_hash=? WHERE id=?",
                           (generate_password_hash(password), uid))
            db.execute(
                "UPDATE users SET username=?, full_name=?, title=?, department=?, roles=?, active=? WHERE id=?",
                (username, full_name, title, department, roles, active, uid),
            )
            db.commit()
            flash("Đã cập nhật tài khoản.", "ok")
        return redirect(url_for("admin_users"))
    return render_template("user_form.html", u=user, values={})


# ---------------------------------------------------------------- CSDL
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    title TEXT DEFAULT '',
    department TEXT DEFAULT '',
    roles TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    created_by INTEGER,
    requester_user_id INTEGER,
    ten_nguoi_nghi TEXT,
    chuc_danh TEXT,
    khoa TEXT,
    ten_benh_nhan TEXT,
    nam_sinh TEXT,
    ma_kcb TEXT,
    ngay_vao_vien TEXT,
    ngay_ra_vien TEXT,
    ma_the_bhyt TEXT,
    ly_do_sai TEXT,
    noi_dung_sai TEXT,
    status TEXT,
    ly_do_tra_lai TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS signatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    sig_type TEXT,
    user_id INTEGER,
    full_name TEXT,
    title TEXT,
    note TEXT,
    signed_at TEXT
);
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    user_id INTEGER,
    username TEXT,
    full_name TEXT,
    action TEXT,
    detail TEXT,
    created_at TEXT
);
"""

DEMO_USERS = [
    ("admin", "admin@123", "Quản trị viên", "Cán bộ", "Phòng CNTT", "admin"),
    ("bsminh", "123456", "BS. Đỗ Văn Minh", "Bác sĩ", "Khoa Nội", "nhap"),
    ("dieuduong.hoa", "123456", "ĐD. Nguyễn Thị Hoa", "Điều dưỡng", "Khoa Nhi", "nhap"),
    ("khtb.lan", "123456", "Trần Thị Lan", "Chuyên viên", "Phòng Kế hoạch tổng hợp", "khtb"),
    ("tc.hung", "123456", "Lê Văn Hùng", "Kế toán viên", "Phòng Tài chính kế toán", "taichinh"),
]


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(EXPORTS_DIR, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    cur = db.execute("SELECT COUNT(*) c FROM users").fetchone()
    if cur["c"] == 0:
        for username, pw, name, title, dept, roles in DEMO_USERS:
            db.execute(
                "INSERT INTO users (username, password_hash, full_name, title, department, roles, active, created_at) "
                "VALUES (?,?,?,?,?,?,1,?)",
                (username, generate_password_hash(pw), name, title, dept, roles, now_str()),
            )
        # 2 phiếu MẪU để xem thử quy trình
        now = now_str()
        samples = [
            ("bsminh", 2, "BS. Đỗ Văn Minh", "Bác sĩ", "Khoa Nội", "[MẪU] Nguyễn Thị Lan",
             "1980", "KCB2600123", "2026-09-01", "2026-09-08", "GD4010012345678",
             "Nhập sai ngày ra viện trên hồ sơ.",
             "Ngày ra viện đang ghi 07/09/2026, đúng phải là 08/09/2026. Kính đề nghị cho sửa lại ngày ra viện trong HSBA điện tử.",
             "cho_khtb"),
            ("dieuduong.hoa", 3, "ĐD. Nguyễn Thị Hoa", "Điều dưỡng", "Khoa Nhi", "[MẪU] Trần Văn Bình",
             "2015", "KCB2600456", "2026-08-20", "2026-08-25", "GD4010098765432",
             "Sai mã KCB ban đầu.",
             "Mã KCB ban đầu ghi KCB2600455, đúng phải là KCB2600456. Kính đề nghị cho sửa lại mã KCB trong HSBA điện tử.",
             "hoan_tat"),
        ]
        for i, (creator, req_uid, name, title, dept, benh_nhan, ns, kcb, vv, rv, bhyt,
                ly_do, noi_dung, status) in enumerate(samples, start=1):
            db.execute(
                "INSERT INTO requests (code, created_by, requester_user_id, ten_nguoi_nghi, chuc_danh, khoa, "
                "ten_benh_nhan, nam_sinh, ma_kcb, ngay_vao_vien, ngay_ra_vien, ma_the_bhyt, ly_do_sai, "
                "noi_dung_sai, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (f"SDS-{i:04d}", req_uid, req_uid, name, title, dept, benh_nhan, ns, kcb,
                 vv, rv, bhyt, ly_do, noi_dung, status, now, now),
            )
        # chữ ký mẫu: phiếu 1 — người đề nghị đã ký; phiếu 2 — đủ 3 ký
        db.execute(
            "INSERT INTO signatures (request_id, sig_type, user_id, full_name, title, note, signed_at) VALUES (?,?,?,?,?,?,?)",
            (1, "de_nghi", 2, "BS. Đỗ Văn Minh", "Bác sĩ", "", now),
        )
        db.execute(
            "INSERT INTO signatures (request_id, sig_type, user_id, full_name, title, note, signed_at) VALUES (?,?,?,?,?,?,?)",
            (2, "de_nghi", 3, "ĐD. Nguyễn Thị Hoa", "Điều dưỡng", "", now),
        )
        db.execute(
            "INSERT INTO signatures (request_id, sig_type, user_id, full_name, title, note, signed_at) VALUES (?,?,?,?,?,?,?)",
            (2, "khtb", 4, "Trần Thị Lan", "Chuyên viên", "Đồng ý cho sửa.", now),
        )
        db.execute(
            "INSERT INTO signatures (request_id, sig_type, user_id, full_name, title, note, signed_at) VALUES (?,?,?,?,?,?,?)",
            (2, "taichinh", 5, "Lê Văn Hùng", "Kế toán viên", "Đã hủy giao dịch GD-2026-0912.", now),
        )
    db.commit()
    db.close()


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    try:
        from waitress import serve
        print(f"* Hệ thống đang chạy tại cổng {port} (waitress)")
        serve(app, host="0.0.0.0", port=port, threads=8)
    except ImportError:
        app.run(host="0.0.0.0", port=port, threaded=True)
