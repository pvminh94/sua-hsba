/**
 * Api.gs — Nghiệp vụ: tài khoản, phiếu, ký xác nhận 3 bước, trả lại, quản trị.
 * Mọi quyền đều kiểm tra lại phía server (không chỉ ẩn nút trên giao diện).
 */

var ROLES = {
  nhap: 'Nhập liệu / Người đề nghị',
  khtb: 'Duyệt – TB.KHTH',
  taichinh: 'Tài chính (hủy thanh toán)',
  admin: 'Quản trị'
};
var STATUS = {
  cho_de_nghi: 'Chờ người đề nghị xác nhận',
  cho_khtb: 'Chờ Duyệt/TB.KHTH',
  cho_tc: 'Chờ TC xác nhận hủy TT',
  hoan_tat: 'Hoàn tất',
  tra_lai: 'Đã trả lại'
};
var SIG_TITLES = {
  de_nghi: 'NGƯỜI ĐỀ NGHỊ SỬA HSBA',
  khtb: 'DUYỆT/ TB.KHTH',
  taichinh: 'TC XÁC NHẬN ĐÃ HỦY THANH TOÁN'
};
var CONFIRM_TEXT = {
  de_nghi: 'Tôi xác nhận nội dung giấy đề nghị trên là đúng và gửi Ban KHTH để đề nghị sửa HSBA điện tử.',
  khtb: 'Tôi đã xem xét và DUYỆT / Thông báo cho sửa HSBA điện tử theo nội dung trên.',
  taichinh: 'Tôi xác nhận ĐÃ HỦY THANH TOÁN (giao dịch BHYT) liên quan đến hồ sơ bệnh án này.'
};
var STAGE_SIG = { cho_de_nghi: 'de_nghi', cho_khtb: 'khtb', cho_tc: 'taichinh' };
var NEXT_STATUS = { de_nghi: 'cho_khtb', khtb: 'cho_tc', taichinh: 'hoan_tat' };

// ---------------- tiện ích CSDL (Google Sheets) ----------------
function getDbId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Chưa khởi tạo dữ liệu. Hãy chạy hàm setup() trong Apps Script editor.');
  return id;
}
function sheetByName(name) {
  var sh = SpreadsheetApp.openById(getDbId()).getSheetByName(name);
  if (!sh) throw new Error('Thiếu sheet ' + name);
  return sh;
}
function readAll(name) {
  var values = sheetByName(name).getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).filter(function (r) { return r[0] !== '' && r[0] != null; })
    .map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { o[h] = r[i]; });
      return o;
    });
}
function nextId(name) {
  var max = 0;
  readAll(name).forEach(function (r) { if (Number(r.id) > max) max = Number(r.id); });
  return max + 1;
}
function appendRow(name, obj) {
  var headers = HEADERS[name];
  sheetByName(name).appendRow(headers.map(function (h) {
    return obj[h] === undefined ? '' : obj[h];
  }));
}
function updateById(name, id, fields) {
  var sh = sheetByName(name);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  for (var r = 1; r < values.length; r++) {
    if (Number(values[r][0]) === Number(id)) {
      headers.forEach(function (h, c) {
        if (fields.hasOwnProperty(h)) values[r][c] = fields[h];
      });
      sh.getRange(r + 1, 1, 1, headers.length).setValues([values[r]]);
      return true;
    }
  }
  return false;
}
function deleteRows(name, matchFn) {
  var sh = sheetByName(name);
  var values = sh.getDataRange().getValues();
  var toDelete = [];
  for (var r = 1; r < values.length; r++) {
    var o = {};
    values[0].forEach(function (h, i) { o[h] = values[r][i]; });
    if (matchFn(o)) toDelete.push(r + 1);
  }
  for (var i = toDelete.length - 1; i >= 0; i--) sh.deleteRow(toDelete[i]);
}
function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function now() {
  return Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm:ss');
}
function addLog(requestId, user, action, detail) {
  appendRow(SHEET_LOGS, {
    id: nextId(SHEET_LOGS), request_id: requestId || '', user_email: user.email,
    full_name: user.full_name, action: action, detail: detail || '', created_at: now()
  });
}
function rolesOf(u) { return String(u ? u.roles : '').split(',').filter(Boolean); }
function hasRole(u, role) { return rolesOf(u).indexOf(role) >= 0; }

// ---------------- đăng nhập / phân quyền ----------------
function currentUser() {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase().trim();
  if (!email) return { email: '', user: null, noEmail: true };
  var user = readAll(SHEET_USERS).filter(function (u) {
    return String(u.email).toLowerCase().trim() === email && Number(u.active) === 1;
  })[0] || null;
  return { email: email, user: user };
}
function needUser(me) {
  if (me.noEmail) return 'Không xác định được tài khoản Google của bạn. Hãy đăng nhập tài khoản Google rồi thử lại.';
  if (!me.user) return 'NOT_ALLOWED';
  return null;
}
function canSign(me, req, sigType) {
  var u = me.user;
  if (!u) return false;
  if (sigType === 'de_nghi') return String(req.requester_email).toLowerCase() === me.email;
  if (sigType === 'khtb') return hasRole(u, 'khtb');
  if (sigType === 'taichinh') return hasRole(u, 'taichinh');
  return false;
}
function canEdit(me, req) {
  if (['cho_de_nghi', 'tra_lai'].indexOf(req.status) < 0) return false;
  return hasRole(me.user, 'admin') ||
    me.email === String(req.created_by_email).toLowerCase() ||
    me.email === String(req.requester_email).toLowerCase();
}
function canDelete(me, req) {
  if (hasRole(me.user, 'admin')) return true;
  return me.email === String(req.created_by_email).toLowerCase() &&
    ['cho_de_nghi', 'tra_lai'].indexOf(req.status) >= 0;
}
function eligibleSig(me, req) {
  var sigType = STAGE_SIG[req.status];
  return sigType && canSign(me, req, sigType) ? sigType : null;
}
function getSigs(reqId) {
  var out = {};
  readAll(SHEET_SIGNATURES).forEach(function (s) {
    if (Number(s.request_id) === Number(reqId)) out[s.sig_type] = s;
  });
  return out;
}
function getReq(id) {
  return readAll(SHEET_REQUESTS).filter(function (r) { return Number(r.id) === Number(id); })[0] || null;
}

// ---------------- các hành động ----------------
function getState(me) {
  return {
    ok: true,
    email: me.email,
    user: me.user ? pubUser(me.user) : null,
    noEmail: !!me.noEmail,
    notAllowed: !me.noEmail && !me.user,
    roles: ROLES, status: STATUS, sigTitles: SIG_TITLES, confirmTexts: CONFIRM_TEXT
  };
}
function pubUser(u) {
  return {
    id: Number(u.id), email: u.email, full_name: u.full_name, title: u.title,
    department: u.department, roles: rolesOf(u), active: Number(u.active) === 1
  };
}
function listRequests(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  var q = String(p.q || '').toLowerCase();
  var status = p.status || '';
  var items = readAll(SHEET_REQUESTS).filter(function (r) {
    if (status && r.status !== status) return false;
    if (!q) return true;
    return [r.ten_benh_nhan, r.ma_kcb, r.code, r.ma_the_bhyt, r.ten_nguoi_nghi]
      .join(' ').toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) { return Number(b.id) - Number(a.id); })
    .map(function (r) {
      return { req: r, myAction: eligibleSig(me, r) };
    });
  return { ok: true, items: items };
}
function getRequest(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  var req = getReq(p.id);
  if (!req) return { ok: false, error: 'Không tìm thấy phiếu #' + p.id };
  var logs = readAll(SHEET_LOGS).filter(function (l) { return Number(l.request_id) === Number(req.id); });
  return {
    ok: true, req: req, sigs: getSigs(req.id), logs: logs,
    myAction: eligibleSig(me, req), canEdit: canEdit(me, req), canDelete: canDelete(me, req)
  };
}
function usersForSelect(me) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  return {
    ok: true, users: readAll(SHEET_USERS)
      .filter(function (u) { return Number(u.active) === 1; })
      .map(pubUser)
  };
}

var REQ_FIELDS = ['requester_email', 'ten_nguoi_nghi', 'chuc_danh', 'khoa', 'ten_benh_nhan',
  'nam_sinh', 'ma_kcb', 'ngay_vao_vien', 'ngay_ra_vien', 'ma_the_bhyt', 'ly_do_sai', 'noi_dung_sai'];

function validateReq(d) {
  if (!d.requester_email || !d.ten_nguoi_nghi || !d.khoa || !d.ten_benh_nhan || !d.ly_do_sai || !d.noi_dung_sai)
    return 'Vui lòng nhập đủ các trường bắt buộc (đánh dấu *).';
  return null;
}

function createRequest(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  if (!hasRole(me.user, 'nhap') && !hasRole(me.user, 'admin'))
    return { ok: false, error: 'Bạn không có quyền tạo phiếu.' };
  var d = {};
  REQ_FIELDS.forEach(function (f) { d[f] = String(p[f] || '').trim(); });
  var vErr = validateReq(d); if (vErr) return { ok: false, error: vErr };
  var result = withLock(function () {
    var id = nextId(SHEET_REQUESTS);
    var code = 'SDS-' + ('0000' + id).slice(-4);
    var row = {
      id: id, code: code, created_by_email: me.email, status: 'cho_de_nghi',
      ly_do_tra_lai: '', created_at: now(), updated_at: now()
    };
    REQ_FIELDS.forEach(function (f) { row[f] = d[f]; });
    appendRow(SHEET_REQUESTS, row);
    var kyNgay = p.ky_ngay === true &&
      String(d.requester_email).toLowerCase().trim() === me.email;
    if (kyNgay) {
      appendRow(SHEET_SIGNATURES, {
        id: nextId(SHEET_SIGNATURES), request_id: id, sig_type: 'de_nghi',
        user_email: me.email, full_name: d.ten_nguoi_nghi, title: d.chuc_danh,
        note: '', signed_at: now()
      });
      updateById(SHEET_REQUESTS, id, { status: 'cho_khtb', updated_at: now() });
    }
    addLog(id, me, 'Tạo phiếu', 'Mã phiếu ' + code);
    if (kyNgay) addLog(id, me, 'Xác nhận (Ký điện tử)', SIG_TITLES.de_nghi);
    return { ok: true, id: id, code: code };
  });
  return result;
}

function updateRequest(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  var req = getReq(p.id);
  if (!req) return { ok: false, error: 'Không tìm thấy phiếu.' };
  if (!canEdit(me, req)) return { ok: false, error: 'Bạn không có quyền sửa phiếu này.' };
  var d = {};
  REQ_FIELDS.forEach(function (f) { d[f] = String(p[f] || '').trim(); });
  var vErr = validateReq(d); if (vErr) return { ok: false, error: vErr };
  return withLock(function () {
    d.updated_at = now();
    updateById(SHEET_REQUESTS, req.id, d);
    addLog(req.id, me, 'Cập nhật nội dung phiếu', '');
    return { ok: true };
  });
}

function resubmitRequest(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  var req = getReq(p.id);
  if (!req || req.status !== 'tra_lai' || !canEdit(me, req))
    return { ok: false, error: 'Không thể gửi lại phiếu này.' };
  return withLock(function () {
    updateById(SHEET_REQUESTS, req.id, { status: 'cho_de_nghi', ly_do_tra_lai: '', updated_at: now() });
    addLog(req.id, me, 'Gửi lại phiếu sau khi bị trả lại', '');
    return { ok: true };
  });
}

function deleteRequest(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  var req = getReq(p.id);
  if (!req || !canDelete(me, req)) return { ok: false, error: 'Bạn không có quyền xóa phiếu này.' };
  return withLock(function () {
    deleteRows(SHEET_SIGNATURES, function (s) { return Number(s.request_id) === Number(req.id); });
    deleteRows(SHEET_LOGS, function (l) { return Number(l.request_id) === Number(req.id); });
    deleteRows(SHEET_REQUESTS, function (r) { return Number(r.id) === Number(req.id); });
    return { ok: true };
  });
}

function confirmSig(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  var sigType = p.sig_type;
  if (['de_nghi', 'khtb', 'taichinh'].indexOf(sigType) < 0) return { ok: false, error: 'Loại ký không hợp lệ.' };
  var req = getReq(p.id);
  if (!req) return { ok: false, error: 'Không tìm thấy phiếu.' };
  if (STAGE_SIG[req.status] !== sigType || !canSign(me, req, sigType))
    return { ok: false, error: 'Bạn không có quyền ký ở bước này (hoặc đã có người ký).' };
  if (p.xac_nhan !== true) return { ok: false, error: 'Bạn cần tick xác nhận trước khi ký.' };
  var note = String(p.note || '').trim();
  return withLock(function () {
    if (getSigs(req.id)[sigType]) return { ok: false, error: 'Bước này đã được xác nhận trước đó.' };
    appendRow(SHEET_SIGNATURES, {
      id: nextId(SHEET_SIGNATURES), request_id: req.id, sig_type: sigType,
      user_email: me.email, full_name: me.user.full_name, title: me.user.title,
      note: note, signed_at: now()
    });
    updateById(SHEET_REQUESTS, req.id, { status: NEXT_STATUS[sigType], updated_at: now() });
    addLog(req.id, me, 'Xác nhận (Ký điện tử)',
      SIG_TITLES[sigType] + (note ? ' — Ý kiến: ' + note : ''));
    return { ok: true };
  });
}

function returnRequest(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  var req = getReq(p.id);
  if (!req) return { ok: false, error: 'Không tìm thấy phiếu.' };
  var sigType = STAGE_SIG[req.status];
  if (!sigType || !canSign(me, req, sigType))
    return { ok: false, error: 'Bạn không có quyền trả lại phiếu ở bước này.' };
  var lyDo = String(p.ly_do || '').trim();
  if (!lyDo) return { ok: false, error: 'Vui lòng nhập lý do trả lại.' };
  return withLock(function () {
    deleteRows(SHEET_SIGNATURES, function (s) { return Number(s.request_id) === Number(req.id); });
    updateById(SHEET_REQUESTS, req.id, { status: 'tra_lai', ly_do_tra_lai: lyDo, updated_at: now() });
    addLog(req.id, me, 'Trả lại phiếu', 'Lý do: ' + lyDo);
    return { ok: true };
  });
}

function listUsers(me) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  if (!hasRole(me.user, 'admin')) return { ok: false, error: 'Chỉ quản trị mới xem được danh sách tài khoản.' };
  return { ok: true, users: readAll(SHEET_USERS).map(pubUser) };
}

function saveUser(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  if (!hasRole(me.user, 'admin')) return { ok: false, error: 'Chỉ quản trị mới quản lý tài khoản.' };
  var email = String(p.email || '').toLowerCase().trim();
  var fullName = String(p.full_name || '').trim();
  if (!email || !fullName) return { ok: false, error: 'Email và họ tên là bắt buộc.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Email không hợp lệ.' };
  var roles = ['nhap', 'khtb', 'taichinh', 'admin'].filter(function (r) { return p['role_' + r]; }).join(',');
  var active = p.active ? 1 : 0;
  return withLock(function () {
    var users = readAll(SHEET_USERS);
    var exist = users.filter(function (u) {
      return String(u.email).toLowerCase().trim() === email;
    })[0];
    if (p.id) {
      var old = users.filter(function (u) { return Number(u.id) === Number(p.id); })[0];
      if (!old) return { ok: false, error: 'Không tìm thấy tài khoản.' };
      if (exist && Number(exist.id) !== Number(p.id))
        return { ok: false, error: 'Email đã tồn tại trong danh sách.' };
      updateById(SHEET_USERS, p.id, {
        email: email, full_name: fullName,
        title: String(p.title || '').trim(), department: String(p.department || '').trim(),
        roles: roles, active: active
      });
      addLog('', me, 'Cập nhật tài khoản', email);
    } else {
      if (exist) return { ok: false, error: 'Email đã tồn tại trong danh sách.' };
      appendRow(SHEET_USERS, {
        id: nextId(SHEET_USERS), email: email, full_name: fullName,
        title: String(p.title || '').trim(), department: String(p.department || '').trim(),
        roles: roles, active: active, created_at: now()
      });
      addLog('', me, 'Thêm tài khoản', email);
    }
    return { ok: true };
  });
}
