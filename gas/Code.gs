/**
 * Code.js — Điểm vào Web App (bản đăng nhập nội bộ: tài khoản/mật khẩu, KHÔNG cần Google).
 * Web app mở ẩn danh, chạy dưới quyền chủ sở hữu (MYSELF) — dữ liệu trong Drive của chủ sở hữu.
 */

function doGet() {
  ensureSetup_();
  var t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate()
    .setTitle('Quản lý đề nghị sửa HSBA điện tử')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Tự khởi tạo dữ liệu 1 lần (tạo Sheet + admin). Chủ sở hữu dự án = admin đầu tiên. */
function ensureSetup_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SPREADSHEET_ID')) return;
  setup(); // xem Setup.js
}

/** Gọi từ client: api('ten_hanh_dong', payload) → object JSON */
function api(action, payload) {
  try {
    payload = payload || {};
    ensureSetup_();
    migrate_(); // đảm bảo bảng Users có cột username/password
    switch (action) {
      case 'login':        return login(payload);
      case 'logout':       return logout(payload);
      case 'state':        return getState(payload);
      case 'changePassword': return changePassword(payload);
      case 'list':         return listRequests(sessionUser(payload), payload);
      case 'get':          return getRequest(sessionUser(payload), payload);
      case 'usersSelect':  return usersForSelect(sessionUser(payload));
      case 'create':       return createRequest(sessionUser(payload), payload);
      case 'update':       return updateRequest(sessionUser(payload), payload);
      case 'resubmit':     return resubmitRequest(sessionUser(payload), payload);
      case 'delete':       return deleteRequest(sessionUser(payload), payload);
      case 'confirm':      return confirmSig(sessionUser(payload), payload);
      case 'return':       return returnRequest(sessionUser(payload), payload);
      case 'users':        return listUsers(sessionUser(payload));
      case 'saveUser':     return saveUser(sessionUser(payload), payload);
      case 'getPdf':       return getPdf(sessionUser(payload), payload);
      default: return { ok: false, error: 'Hành động không hợp lệ: ' + action };
    }
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}
