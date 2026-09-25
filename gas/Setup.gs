/**
 * Setup.gs — CHẠY 1 LẦN ĐẦU TIÊN để tạo cơ sở dữ liệu (Google Sheets) + dữ liệu mẫu.
 * Cách chạy: mở Apps Script editor → chọn hàm setup → Run.
 * Người chạy setup sẽ trở thành ADMIN đầu tiên (email Google của bạn).
 */
var SHEET_USERS = 'Users';
var SHEET_REQUESTS = 'Requests';
var SHEET_SIGNATURES = 'Signatures';
var SHEET_LOGS = 'Logs';

var HEADERS = {
  Users: ['id', 'email', 'full_name', 'title', 'department', 'roles', 'active', 'created_at'],
  Requests: ['id', 'code', 'created_by_email', 'requester_email', 'ten_nguoi_nghi', 'chuc_danh', 'khoa',
    'ten_benh_nhan', 'nam_sinh', 'ma_kcb', 'ngay_vao_vien', 'ngay_ra_vien', 'ma_the_bhyt',
    'ly_do_sai', 'noi_dung_sai', 'status', 'ly_do_tra_lai', 'created_at', 'updated_at'],
  Signatures: ['id', 'request_id', 'sig_type', 'user_email', 'full_name', 'title', 'note', 'signed_at'],
  Logs: ['id', 'request_id', 'user_email', 'full_name', 'action', 'detail', 'created_at']
};

function setup() {
  var props = PropertiesService.getScriptProperties();
  var dbId = props.getProperty('SPREADSHEET_ID');
  var ss;
  if (dbId) {
    try { ss = SpreadsheetApp.openById(dbId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Sửa HSBA điện tử — DỮ LIỆU');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  [SHEET_USERS, SHEET_REQUESTS, SHEET_SIGNATURES, SHEET_LOGS].forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
  if (def) ss.deleteSheet(def);

  // Admin đầu tiên = người đang chạy setup
  var me = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail();
  if (!me) throw new Error('Không xác định được email. Hãy đăng nhập Google rồi chạy lại setup.');
  if (readAll(SHEET_USERS).length === 0) {
    appendRow(SHEET_USERS, {
      id: 1, email: me, full_name: 'Quản trị viên', title: '', department: '',
      roles: 'nhap,khtb,taichinh,admin', active: 1, created_at: now()
    });
    // 2 phiếu MẪU để xem quy trình (admin tự tick được cả 3 bước)
    appendRow(SHEET_REQUESTS, {
      id: 1, code: 'SDS-0001', created_by_email: me, requester_email: me,
      ten_nguoi_nghi: 'Quản trị viên', chuc_danh: '', khoa: 'Phòng Kế hoạch tổng hợp',
      ten_benh_nhan: '[MẪU] Nguyễn Thị Lan', nam_sinh: '1980', ma_kcb: 'KCB2600123',
      ngay_vao_vien: '2026-09-01', ngay_ra_vien: '2026-09-08', ma_the_bhyt: 'GD4010012345678',
      ly_do_sai: 'Nhập sai ngày ra viện trên hồ sơ.',
      noi_dung_sai: 'Ngày ra viện đang ghi 07/09/2026, đúng phải là 08/09/2026. Kính đề nghị cho sửa lại ngày ra viện trong HSBA điện tử.',
      status: 'cho_de_nghi', ly_do_tra_lai: '', created_at: now(), updated_at: now()
    });
    appendRow(SHEET_REQUESTS, {
      id: 2, code: 'SDS-0002', created_by_email: me, requester_email: me,
      ten_nguoi_nghi: 'Quản trị viên', chuc_danh: '', khoa: 'Khoa Nội',
      ten_benh_nhan: '[MẪU] Trần Văn Bình', nam_sinh: '2015', ma_kcb: 'KCB2600456',
      ngay_vao_vien: '2026-08-20', ngay_ra_vien: '2026-08-25', ma_the_bhyt: 'GD4010098765432',
      ly_do_sai: 'Sai mã KCB ban đầu.',
      noi_dung_sai: 'Mã KCB ban đầu ghi KCB2600455, đúng phải là KCB2600456. Kính đề nghị cho sửa lại mã KCB trong HSBA điện tử.',
      status: 'hoan_tat', ly_do_tra_lai: '', created_at: now(), updated_at: now()
    });
    [['de_nghi', 'Tôi xác nhận nội dung trên là đúng.'],
     ['khtb', 'Đồng ý cho sửa.'],
     ['taichinh', 'Đã hủy giao dịch GD-2026-0912.']].forEach(function (s, i) {
      appendRow(SHEET_SIGNATURES, {
        id: i + 1, request_id: 2, sig_type: s[0], user_email: me,
        full_name: 'Quản trị viên', title: '', note: s[1], signed_at: now()
      });
    });
    appendRow(SHEET_LOGS, {
      id: 1, request_id: null, user_email: me, full_name: 'Quản trị viên',
      action: 'Khởi tạo hệ thống', detail: 'Setup dữ liệu ban đầu', created_at: now()
    });
  }
  Logger.log('SETUP XONG! Spreadsheet ID: ' + ss.getId());
  Logger.log('Email admin đầu tiên: ' + me);
}
