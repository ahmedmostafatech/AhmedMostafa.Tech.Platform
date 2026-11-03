// ============================================================
// Google Apps Script — مزامنة التسجيلات وإرسال الإيميلات مجاناً
// (انسخ هذا الكود والصقه في Google Sheets: Extensions -> Apps Script)
// ============================================================

// كلمة السر للتحقق من أن الطلب قادم من الموقع وموثوق
var SECRET_KEY = "MySuperSecretKey_2026_AhmedTech_99";

/**
 * دالة استقبال الطلبات الخارجية (Web App POST Endpoint)
 */
function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "";
    if (!contents) {
      return makeResponse({ success: false, error: "Empty request body" });
    }

    var data = JSON.parse(contents);

    // التحقق من كلمة السر للحماية (إذا تم إرسالها)
    if (data.secret && data.secret !== SECRET_KEY) {
      return makeResponse({ success: false, error: "Unauthorized: Invalid secret key" });
    }

    var action = data.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss ? ss.getActiveSheet() : null;

    if (sheet && sheet.getLastRow() === 0) {
      sheet.appendRow([
        'تاريخ التسجيل',
        'كود التسجيل',
        'اسم الطالب',
        'الفرع',
        'رقم الهاتف',
        'البريد الإلكتروني',
        'المراجعة',
        'المبلغ (ج.م)',
        'وسيلة الدفع',
        'حالة الدفع',
        'تاريخ الاعتماد'
      ]);
    }

    // 1. تسجيل طالب جديد
    if (action === 'new_registration') {
      if (sheet) {
        sheet.appendRow([
          new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
          data.registration_code || '',
          data.full_name || '',
          data.branch || '',
          "'" + (data.phone || ''),
          data.email || '',
          data.course_title || '',
          data.amount || '',
          data.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش',
          'بانتظار التحويل (pending_payment)',
          ''
        ]);
      }
      return makeResponse({ success: true, message: 'Row added' });
    }

    // 2. تأكيد الدفع وإرسال الإيميل
    if (action === 'approve_and_send_email') {
      var code = data.registration_code;
      if (sheet) {
        var values = sheet.getDataRange().getValues();
        var foundRow = -1;
        for (var i = 1; i < values.length; i++) {
          if (String(values[i][1]).trim() == String(code).trim()) {
            foundRow = i + 1;
            break;
          }
        }

        if (foundRow > 0) {
          sheet.getRange(foundRow, 10).setValue('مؤكد (Paid)');
          sheet.getRange(foundRow, 11).setValue(new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }));
        }
      }

      // إرسال الإيميل عبر Gmail
      var recipient = data.student_email || data.email;
      var link = data.access_link || "https://drive.google.com";
      var title = data.course_title || "المادة الدراسية";
      var name = data.student_name || data.full_name || "عزيزي الطالب";

      if (recipient) {
        var subject = "تم تأكيد اشتراكك في " + title + " — Ahmed Mostafa Tech";
        var htmlBody = `
          <div dir="rtl" style="font-family:Tahoma, Arial, sans-serif; line-height:1.8; color:#1e293b; max-width:580px; margin:0 auto; padding:24px; border:1px solid #e2e8f0; border-radius:14px; background:#ffffff;">
            <div style="background:linear-gradient(135deg, #071022 0%, #365aa2 100%); padding:20px; text-align:center; color:#ffffff; border-radius:10px; margin-bottom:20px;">
              <h2 style="margin:0; font-size:22px;">أحمد مصطفى تك</h2>
              <p style="margin:4px 0 0; opacity:0.85; font-size:13px;">تأكيد الاشتراك وتفعيل رابط المراجعة</p>
            </div>
            <h3 style="color:#071022;">أهلاً بك يا ${name} 👋</h3>
            <p style="font-size:15px; color:#475569;">تم مراجعة وتأكيد استلام التحويل، وتم تفعيل اشتراكك في <strong>${title}</strong> بنجاح.</p>
            <div style="background:#f8fafc; border:1.5px solid #e2e8f0; padding:16px; border-radius:10px; margin:20px 0;">
              <div style="margin-bottom:8px;">🆔 <strong>كود التسجيل:</strong> ${code}</div>
              <div style="margin-bottom:8px;">📚 <strong>المراجعة:</strong> ${title}</div>
              <div style="margin-bottom:8px;">⏳ <strong>فترة الإتاحة:</strong> حتى ${data.access_until || 'نهاية الامتحانات'}</div>
              <div>📁 <strong>رابط المحتوى المباشر:</strong><br>
                <a href="${link}" target="_blank" style="color:#365aa2; font-weight:bold; font-size:15px; word-break:break-all;">${link}</a>
              </div>
            </div>
            <div style="text-align:center; margin:25px 0;">
              <a href="${link}" target="_blank" style="background:#365aa2; color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:99px; font-weight:bold; font-size:15px; display:inline-block;">فتح مجلد المراجعة والبدء 🚀</a>
            </div>
            <p style="font-size:13px; color:#64748b;">إذا واجهتك أي مشكلة، تواصل مباشرة على واتساب: <strong>01066843568</strong></p>
            <hr style="border:0; border-top:1px solid #e2e8f0; margin:20px 0;">
            <p style="font-size:11px; color:#94a3b8; text-align:center;">Ahmed Mostafa Tech © 2026. نتمنى لك دوام التوفيق والامتياز.</p>
          </div>
        `;

        GmailApp.sendEmail(recipient, subject, "تم تأكيد اشتراكك في " + title + ". رابط المراجعة: " + link, {
          htmlBody: htmlBody,
          name: "Ahmed Mostafa Tech"
        });
      }

      return makeResponse({ success: true, message: 'Status updated and email sent to ' + recipient });
    }

    return makeResponse({ success: false, message: 'Unknown action: ' + action });

  } catch (error) {
    return makeResponse({ success: false, error: error.toString() });
  }
}

function makeResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
