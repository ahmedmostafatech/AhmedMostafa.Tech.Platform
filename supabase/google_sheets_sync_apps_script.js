// ============================================================
// Google Apps Script — مزامنة التسجيلات وإرسال الإيميلات مجاناً
// (انسخ هذا الكود والصقه في Google Sheets: Extensions -> Apps Script)
// ============================================================

/**
 * دالة استقبال الطلبات الخارجية (Web App POST Endpoint)
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // تأكد من وجود عناوين الأعمدة في أول سطر
    if (sheet.getLastRow() === 0) {
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

    if (action === 'new_registration') {
      // إضافة سطر جديد عند تسجيل الطالب
      sheet.appendRow([
        new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
        data.registration_code || '',
        data.full_name || '',
        data.branch || '',
        "'" + (data.phone || ''), // علامة ' لمنع مسح الصفر الأول
        data.email || '',
        data.course_title || '',
        data.amount || '',
        data.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش',
        'بانتظار التحويل (pending_payment)',
        ''
      ]);

      return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Row added' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'approve_and_send_email') {
      // البحث عن الطالب وتحديث حالته وإرسال الإيميل
      var code = data.registration_code;
      var values = sheet.getDataRange().getValues();
      var foundRow = -1;

      for (var i = 1; i < values.length; i++) {
        if (values[i][1] == code) {
          foundRow = i + 1;
          break;
        }
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 10).setValue('مؤكد (Paid)');
        sheet.getRange(foundRow, 11).setValue(new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }));
      }

      // إرسال الإيميل عبر Gmail المجاني
      if (data.student_email && data.access_link) {
        var subject = "تم تأكيد اشتراكك في " + data.course_title + " — Ahmed Mostafa Tech";
        var htmlBody = `
          <div dir="rtl" style="font-family:Tahoma, Arial, sans-serif; line-height:1.8; color:#1e293b; max-width:560px; margin:0 auto; padding:20px; border:1px solid #e2e8f0; border-radius:12px;">
            <h2 style="color:#071022;">أهلاً بك يا ${data.student_name} 👋</h2>
            <p style="font-size:15px;">تم تأكيد استلام تحويلك وتفعيل اشتراكك في <strong>${data.course_title}</strong> بنجاح.</p>
            <div style="background:#f8fafc; padding:15px; border-radius:8px; margin:15px 0;">
              <div>🆔 <strong>كود التسجيل:</strong> ${data.registration_code}</div>
              <div>📚 <strong>المادة:</strong> ${data.course_title}</div>
              <div>📁 <strong>رابط الوصول لمجلد المراجعة:</strong> <br><a href="${data.access_link}" style="color:#365aa2; font-weight:bold; font-size:16px;">اضغط هنا لفتح Google Drive</a></div>
            </div>
            <p style="font-size:13px; color:#64748b;">لو واجهتك أي مشكلة، تواصل مباشرة على واتساب: 01066843568</p>
            <hr style="border:0; border-top:1px solid #e2e8f0;">
            <p style="font-size:11px; color:#94a3b8; text-align:center;">Ahmed Mostafa Tech © 2026</p>
          </div>
        `;

        GmailApp.sendEmail(data.student_email, subject, "تم تأكيد اشتراكك. رابط المراجعة: " + data.access_link, {
          htmlBody: htmlBody,
          name: "Ahmed Mostafa Tech"
        });
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Status updated and email sent' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, message: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

