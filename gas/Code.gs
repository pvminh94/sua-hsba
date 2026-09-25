/**
 * Code.gs — Điểm vào của Web App Google Apps Script.
 * Triển khai: Deploy → New deployment → Web app
 *   Execute as: USER ACCESSING THE WEB APP
 *   Who has access: ANYONE WITH A GOOGLE ACCOUNT
 */

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  return t.evaluate()
    .setTitle('Quản lý đề nghị sửa HSBA điện tử')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** Gọi từ client: api('ten_hanh_dong', payload) → object JSON */
function api(action, payload) {
  try {
    payload = payload || {};
    var me = currentUser();
    switch (action) {
      case 'state':        return getState(me);
      case 'list':         return listRequests(me, payload);
      case 'get':          return getRequest(me, payload);
      case 'usersSelect':  return usersForSelect(me);
      case 'create':       return createRequest(me, payload);
      case 'update':       return updateRequest(me, payload);
      case 'resubmit':     return resubmitRequest(me, payload);
      case 'delete':       return deleteRequest(me, payload);
      case 'confirm':      return confirmSig(me, payload);
      case 'return':       return returnRequest(me, payload);
      case 'users':        return listUsers(me);
      case 'saveUser':     return saveUser(me, payload);
      case 'getPdf':       return getPdf(me, payload);
      default: return { ok: false, error: 'Hành động không hợp lệ: ' + action };
    }
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}
