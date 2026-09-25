/**
 * Pdf.gs — Sinh GIẤY ĐỀ NGHỊ SỬA HỒ SƠ BỆNH ÁN ĐIỆN TỬ ra PDF đúng mẫu (A4, font serif).
 * Cách làm: dựng HTML đúng bố cục mẫu giấy → chuyển sang PDF.
 */
function getPdf(me, p) {
  var err = needUser(me); if (err) return { ok: false, error: err };
  var req = getReq(p.id);
  if (!req) return { ok: false, error: 'Không tìm thấy phiếu.' };
  var sigs = getSigs(req.id);
  var html = buildPdfHtml(req, sigs);
  var blob = Utilities.newBlob(html, MimeType.HTML, req.code + '.html').getAs(MimeType.PDF);
  return { ok: true, name: req.code + '.pdf', data: Utilities.base64Encode(blob.getBytes()) };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function dateParts(iso) {
  if (!iso) return ['', '', ''];
  var s = String(iso).slice(0, 10).split('-');
  if (s.length !== 3) return ['', '', ''];
  return [String(Number(s[2])), String(Number(s[1])), s[0]];
}
function fmtDt(iso) {
  if (!iso) return '';
  var s = String(iso);
  return s.slice(11, 16) + ' ngày ' + s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

function buildPdfHtml(req, sigs) {
  var vv = dateParts(req.ngay_vao_vien), rv = dateParts(req.ngay_ra_vien), cd = dateParts(req.created_at);
  var noiDung = String(req.noi_dung_sai || '');
  // tách dòng nội dung (đơn giản theo ký tự — giữ tối thiểu 8 dòng chấm như mẫu)
  var lines = [];
  var words = noiDung.split(/\s+/), cur = '';
  words.forEach(function (w) {
    var t = cur ? cur + ' ' + w : w;
    if (t.length > 92 && cur) { lines.push(cur); cur = w; } else cur = t;
  });
  if (cur) lines.push(cur);
  while (lines.length < 8) lines.push('');

  function val(v, w) {
    return '<span class="val" style="width:' + w + 'pt">' + esc(v) + '</span>';
  }
  function sigBlock(sig) {
    if (!sig) return '<div class="sigspace"></div>';
    var h = '<div class="sigok">(Đã xác nhận điện tử)</div>';
    h += '<div class="signame">' + esc(sig.full_name) + '</div>';
    if (sig.title) h += '<div class="sigline">' + esc(sig.title) + '</div>';
    h += '<div class="sigline it">Lúc: ' + esc(fmtDt(sig.signed_at)) + '</div>';
    if (sig.note) h += '<div class="sigline it small">Ý kiến: ' + esc(sig.note) + '</div>';
    return h;
  }

  return '<html><head><meta charset="utf-8"><style>' +
    '@page { size: A4; margin: 16mm 20mm; }' +
    'body { font-family: "Times New Roman", "Tinos", "Liberation Serif", serif; font-size: 12.5pt; color: #000; margin: 0; }' +
    '.c { text-align: center; }' +
    '.quoc-hieu { font-weight: bold; font-size: 13pt; letter-spacing: .3pt; }' +
    '.doc-lap { margin-top: 4pt; }' +
    '.doc-lap span { border-bottom: 1pt solid #000; padding-bottom: 1pt; }' +
    '.tieu-de { font-weight: bold; font-size: 14.5pt; margin: 26pt 0 16pt; }' +
    '.kinh-gui { margin-bottom: 14pt; }' +
    'table.form { width: 100%; border-collapse: collapse; }' +
    'table.form td { padding: 3.5pt 0; vertical-align: bottom; font-size: 12.5pt; }' +
    '.lbl { white-space: nowrap; padding-right: 4pt; }' +
    '.val { display: inline-block; border-bottom: 1px dotted #222; min-height: 15pt; padding: 0 2pt; }' +
    '.dotsrow { display: block; border-bottom: 1px dotted #222; min-height: 16pt; padding-top: 1pt; }' +
    '.kdn { margin-top: 18pt; }' +
    '.ngay-thang { text-align: right; font-style: italic; margin-top: 12pt; }' +
    'table.sig { width: 100%; border-collapse: collapse; margin-top: 6pt; }' +
    'table.sig td { width: 50%; text-align: center; vertical-align: top; padding-top: 10pt; }' +
    '.sigt { font-weight: bold; font-size: 12.5pt; }' +
    '.sigspace { min-height: 62pt; }' +
    '.sigok { font-style: italic; margin-top: 8pt; }' +
    '.signame { font-weight: bold; margin-top: 4pt; }' +
    '.sigline { margin-top: 2pt; }' +
    '.it { font-style: italic; }' +
    '.small { font-size: 10.5pt; }' +
    '.tcb { text-align: center; margin-top: 14pt; width: 50%; }' +
    '.footer { margin-top: 26pt; font-size: 8.5pt; color: #777; font-style: italic; text-align: center; }' +
    '</style></head><body>' +

    '<div class="c quoc-hieu">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>' +
    '<div class="c doc-lap"><span>Độc lập – Tự do – Hạnh phúc</span></div>' +
    '<div class="c tieu-de">GIẤY ĐỀ NGHỊ SỬA HỒ SƠ BỆNH ÁN ĐIỆN TỬ</div>' +
    '<div class="c kinh-gui">Kính gửi: Ban Kế hoạch tổng hợp.</div>' +

    '<table class="form">' +
    '<tr><td class="lbl">Tôi tên:</td><td>' + val(req.ten_nguoi_nghi, 230) +
    '</td><td class="lbl">Chức danh:</td><td>' + val(req.chuc_danh, 120) + '</td></tr>' +
    '<tr><td class="lbl">Khoa:</td><td colspan="3">' + val(req.khoa, 480) + '</td></tr>' +
    '<tr><td colspan="4">Cần sửa hồ sơ bệnh án điện tử của:</td></tr>' +
    '<tr><td class="lbl">Người bệnh:</td><td colspan="3">' + val(req.ten_benh_nhan, 430) + '</td></tr>' +
    '<tr><td class="lbl">Năm sinh:</td><td>' + val(req.nam_sinh, 150) +
    '</td><td class="lbl">Mã KCB:</td><td>' + val(req.ma_kcb, 160) + '</td></tr>' +
    '<tr><td class="lbl">Vào viện: ngày</td><td>' + val(vv[0], 24) +
    '<span class="lbl"> tháng </span>' + val(vv[1], 24) + '<span class="lbl"> năm </span>' + val(vv[2], 40) +
    '<span class="lbl">&nbsp;&nbsp;&nbsp;Ra viện ngày</span>' + val(rv[0], 24) +
    '<span class="lbl"> tháng </span>' + val(rv[1], 24) + '<span class="lbl"> năm </span>' + val(rv[2], 40) +
    '</td></tr>' +
    '<tr><td class="lbl">Mã thẻ BHYT</td><td colspan="3">' + val(req.ma_the_bhyt, 430) + '</td></tr>' +
    '<tr><td class="lbl">Lý do sai:</td><td colspan="3">' + val(req.ly_do_sai, 430) + '</td></tr>' +
    '<tr><td class="lbl" style="vertical-align: top">Nội dung sai:</td><td colspan="3">' +
    lines.map(function (l) {
      return '<span class="dotsrow">' + esc(l) + '</span>';
    }).join('') + '</td></tr>' +
    '</table>' +

    '<div class="kdn">Kính đề nghị Ban KHTH cho sửa HSBA điện tử của người bệnh trên.</div>' +
    '<div class="ngay-thang">Thành phố Hồ Chí Minh, ngày ' + (cd[0] || '......') +
    ' tháng ' + (cd[1] || '......') + ' năm ' + (cd[2] || '20....') + '</div>' +

    '<table class="sig"><tr>' +
    '<td><div class="sigt">DUYỆT/ TB.KHTH</div>' + sigBlock(sigs.khtb) +
    '<div class="sigt" style="margin-top:14pt">TC XÁC NHẬN ĐÃ HỦY THANH TOÁN</div>' + sigBlock(sigs.taichinh) + '</td>' +
    '<td><div class="sigt">NGƯỜI ĐỀ NGHỊ SỬA HSBA</div>' + sigBlock(sigs.de_nghi) + '</td>' +
    '</tr></table>' +

    '<div class="footer">In từ Hệ thống quản lý đề nghị sửa HSBA điện tử · Mã phiếu: ' +
    esc(req.code) + ' · In lúc: ' + esc(now()) + '</div>' +
    '</body></html>';
}
