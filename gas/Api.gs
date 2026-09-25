/**
 * Api.js — Nghiệp vụ: đăng nhập nội bộ, tài khoản, phiếu, ký xác nhận 3 bước, quản trị.
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
var DEFAULT_PW = '123456';
var SESSION_TTL = 21600; // 6 giờ

// ---------------- tiện ích CSDL (Google Sheets) ----------------
function getDbId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Chưa khởi tạo dữ liệu.');
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
      headers.forEach(function (h, i) { if (h) o[h] = r[i]; });
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
        if (h && fields.hasOwnProperty(h)) values[r][c] = fields[h];
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
    values[0].forEach(function (h, i) { if (h) o[h] = values[r][i]; });
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
    id: nextId(SHEET_LOGS), request_id: requestId || '',
    user_email: (user && (user.username || user.email)) || '',
    full_name: (user && user.full_name) || '', action: action, detail: detail || '', created_at: now()
  });
}
function rolesOf(u) { return String(u ? u.roles : '').split(',').filter(Boolean); }
function hasRole(u, role) { return rolesOf(u).indexOf(role) >= 0; }
function identMatch(a, u) {
  if (!u) return false;
  var s = String(a || '').toLowerCase().trim();
  return s === String(u.username || '').toLowerCase().trim() ||
         s === String(u.email || '').toLowerCase().trim();
}

// ---------------- mật khẩu & phiên ----------------
function hashPw(pw, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(salt) + '|' + String(pw), Utilities.Charset.UTF_8);
  for (var i = 0; i < 1500; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  }
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function newSalt() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function createSession(user) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('sess_' + token, String(user.id), SESSION_TTL);
  return token;
}
function sessionUser(payload) {
  var token = payload && payload._token;
  if (!token) return null;
  var uid = CacheService.getScriptCache().get('sess_' + token);
  if (!uid) return null;
  return readAll(SHEET_USERS).filter(function (u) {
    return Number(u.id) === Number(uid) && Number(u.active) === 1;
  })[0] || null;
}

/** Nâng cấp bảng Users cũ: thêm cột username, password_hash, salt (mật khẩu mặc định 123456). */
function migrate_() {
  var sh = sheetByName(SHEET_USERS);
  var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
    .map(function (h) { return String(h || ''); });
  var need = HEADERS.Users.filter(function (h) { return headers.indexOf(h) < 0; });
  if (!need.length) return;
  var newHeaders = headers.filter(function (h) { return h; });
  HEADERS.Users.forEach(function (h) { if (newHeaders.indexOf(h) < 0) newHeaders.push(h); });
  sh.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]).setFontWeight('bold');
  readAll(SHEET_USERS).forEach(function (u) {
    var salt = newSalt();
    updateById(SHEET_USERS, u.id, {
      username: String(u.username || u.email || ('user' + u.id)),
      salt: salt,
      password_hash: hashPw(DEFAULT_PW, salt)
    });
  });
}

// ---------------- đăng nhập ----------------
function login(p) {
  var uname = String(p.username || '').toLowerCase().trim();
  var pw = String(p.password || '');
  if (!uname || !pw) return { ok: false, error: 'Nhập đủ tài khoản và mật khẩu.' };
  var u = readAll(SHEET_USERS).filter(function (x) {
    return Number(x.active) === 1 &&
      (String(x.username || '').toLowerCase() === uname || String(x.email || '').toLowerCase() === uname);
  })[0];
  if (!u || !u.password_hash || hashPw(pw, u.salt) !== u.password_hash) {
    return { ok: false, error: 'Sai tài khoản hoặc mật khẩu.' };
  }
  addLog('', u, 'Đăng nhập', '');
  return { ok: true, token: createSession(u), user: pubUser(u) };
}
function logout(p) {
  var token = p && p._token;
  if (token) CacheService.getScriptCache().remove('sess_' + token);
  return { ok: true };
}
function changePassword(p) {
  var u = sessionUser(p);
  if (!u) return { ok: false, error: 'Chưa đăng nhập.' };
  var oldPw = String(p.old_password || ''), newPw = String(p.new_password || '');
  if (hashPw(oldPw, u.salt) !== u.password_hash) return { ok: false, error: 'Mật khẩu hiện tại không đúng.' };
  if (String(newPw).length < 6) return { ok: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
  return withLock(function () {
    var salt = newSalt();
    updateById(SHEET_USERS, u.id, { salt: salt, password_hash: hashPw(newPw, salt) });
    addLog('', u, 'Đổi mật khẩu', '');
    return { ok: true };
  });
}

// ---------------- truy vấn ----------------
function getState(p) {
  var u = sessionUser(p);
  return {
    ok: true,
    needLogin: !u,
    user: u ? pubUser(u) : null,
    roles: ROLES, status: STATUS, sigTitles: SIG_TITLES, confirmTexts: CONFIRM_TEXT
  };
}
function pubUser(u) {
  return {
    id: Number(u.id), username: u.username || u.email, email: u.email, full_name: u.full_name,
    title: u.title, department: u.department, roles: rolesOf(u), active: Number(u.active) === 1
  };
}
function needUser(me) {
  return me ? null : 'NOT_ALLOWED';
}
function canSign(me, req, sigType) {
  if (!me) return false;
  if (sigType === 'de_nghi') return identMatch(req.requester_email, me);
  if (sigType === 'khtb') return hasRole(me, 'khtb');
  if (sigType === 'taichinh') return hasRole(me, 'taichinh');
  return false;
}
function canEdit(me, req) {
  if (!me || ['cho_de_nghi', 'tra_lai'].indexOf(req.status) < 0) return false;
  return hasRole(me, 'admin') || identMatch(req.created_by_email, me) || identMatch(req.requester_email, me);
}
function canDelete(me, req) {
  if (!me) return false;
  if (hasRole(me, 'admin')) return true;
  return identMatch(req.created_by_email, me) && ['cho_de_nghi', 'tra_lai'].indexOf(req.status) >= 0;
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
    .map(function (r) { return { req: r, myAction: eligibleSig(me, r) }; });
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
  return { ok: true, users: readAll(SHEET_USERS)
    .filter(function (u) { return Number(u.active) === 1; }).map(pubUser) };
}

// ---------------- tạo / sửa / xóa phiếu ----------------
var REQ_FIELDS = ['requester_email', 'ten_nguoi_nghi', 'chuc_danh', 'khoa', 'ten_benh_nhan',
  'nam_sinh', 'ma_kcb', 'ngay_vao_vien', 'ngay_ra_vien', 'ma_the_bhyt', 'ly_do_sai', 'noi_dung_sai'];

function validateReq(d) {
  if (!d.requester_email || !d.ten_nguoi_nghi || !d.khoa || !d.ten_benh_nhan || !d.ly_do_sai || !d.noi_dung_sai)
    return 'Vui lòng nhập đủ các trường bắt buộc (đánh dấu *).';
  return null;
}

function createRequest(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  if (!hasRole(me, 'nhap') && !hasRole(me, 'admin'))
    return { ok: false, error: 'Bạn không có quyền tạo phiếu.' };
  var d = {};
  REQ_FIELDS.forEach(function (f) { d[f] = String(p[f] || '').trim(); });
  var vErr = validateReq(d); if (vErr) return { ok: false, error: vErr };
  return withLock(function () {
    var id = nextId(SHEET_REQUESTS);
    var code = 'SDS-' + ('0000' + id).slice(-4);
    var row = {
      id: id, code: code,
      created_by_email: me.username || me.email, requester_email: d.requester_email,
      status: 'cho_de_nghi', ly_do_tra_lai: '', created_at: now(), updated_at: now()
    };
    REQ_FIELDS.forEach(function (f) { row[f] = d[f]; });
    appendRow(SHEET_REQUESTS, row);
    var kyNgay = p.ky_ngay === true && identMatch(d.requester_email, me);
    if (kyNgay) {
      appendRow(SHEET_SIGNATURES, {
        id: nextId(SHEET_SIGNATURES), request_id: id, sig_type: 'de_nghi',
        user_email: me.username || me.email, full_name: d.ten_nguoi_nghi, title: d.chuc_danh,
        note: '', signed_at: now()
      });
      updateById(SHEET_REQUESTS, id, { status: 'cho_khtb', updated_at: now() });
    }
    addLog(id, me, 'Tạo phiếu', 'Mã phiếu ' + code);
    if (kyNgay) addLog(id, me, 'Xác nhận (Ký điện tử)', SIG_TITLES.de_nghi);
    return { ok: true, id: id, code: code };
  });
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

// ---------------- ký xác nhận ----------------
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
      user_email: me.username || me.email, full_name: me.full_name, title: me.title,
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

// ---------------- quản trị tài khoản ----------------
function listUsers(me) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  if (!hasRole(me, 'admin')) return { ok: false, error: 'Chỉ quản trị mới xem được danh sách tài khoản.' };
  return { ok: true, users: readAll(SHEET_USERS).map(pubUser) };
}

function saveUser(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  if (!hasRole(me, 'admin')) return { ok: false, error: 'Chỉ quản trị mới quản lý tài khoản.' };
  var username = String(p.username || '').toLowerCase().trim();
  var fullName = String(p.full_name || '').trim();
  if (!username || !fullName) return { ok: false, error: 'Tài khoản và họ tên là bắt buộc.' };
  if (!/^[a-z0-9._@-]{3,40}$/.test(username))
    return { ok: false, error: 'Tài khoản: 3–40 ký tự, chỉ gồm chữ thường, số, dấu . _ - @' };
  var password = String(p.password || '');
  var roles = ['nhap', 'khtb', 'taichinh', 'admin'].filter(function (r) { return p['role_' + r]; }).join(',');
  var active = p.active ? 1 : 0;
  return withLock(function () {
    var users = readAll(SHEET_USERS);
    var exist = users.filter(function (u) {
      return String(u.username || u.email || '').toLowerCase().trim() === username;
    })[0];
    if (p.id) {
      var old = users.filter(function (u) { return Number(u.id) === Number(p.id); })[0];
      if (!old) return { ok: false, error: 'Không tìm thấy tài khoản.' };
      if (exist && Number(exist.id) !== Number(p.id))
        return { ok: false, error: 'Tài khoản đã tồn tại.' };
      var fields = {
        username: username, full_name: fullName, email: String(p.email || '').trim(),
        title: String(p.title || '').trim(), department: String(p.department || '').trim(),
        roles: roles, active: active
      };
      if (password) {
        if (password.length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
        fields.salt = newSalt();
        fields.password_hash = hashPw(password, fields.salt);
      }
      updateById(SHEET_USERS, p.id, fields);
      addLog('', me, 'Cập nhật tài khoản', username);
    } else {
      if (exist) return { ok: false, error: 'Tài khoản đã tồn tại.' };
      if (password.length < 6) return { ok: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
      var salt = newSalt();
      appendRow(SHEET_USERS, {
        id: nextId(SHEET_USERS), username: username, full_name: fullName,
        email: String(p.email || '').trim(), title: String(p.title || '').trim(),
        department: String(p.department || '').trim(), roles: roles, active: active,
        created_at: now(), salt: salt, password_hash: hashPw(password, salt)
      });
      addLog('', me, 'Thêm tài khoản', username);
    }
    return { ok: true };
  });
}
