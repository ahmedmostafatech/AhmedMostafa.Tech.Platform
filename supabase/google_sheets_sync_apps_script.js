// ============================================================
// Code.gs
// بوابة Drive والإيميل (Web App) تستقبل طلبات من Edge Functions فقط
// العمليات: منح صلاحية + إرسال إيميل (الافتراضي) أو سحب صلاحية (action = revoke)
// ============================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('GATEWAY_SECRET') || "MySuperSecretKey_2026_AhmedTech_99";

    // التحقق من السر المشترك
    if (!secret || data.secret !== secret) {
      return reply_({ ok: false, error: 'unauthorized' });
    }

    if (data.action === 'revoke') {
      return handleRevoke_(data);
    }
    return handleGrantAndMail_(data);
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  }
}

// منح صلاحية Viewer ثم إرسال الإيميل
function handleGrantAndMail_(data) {
  if (!data.to || !data.subject || !data.html) {
    return reply_({ ok: false, error: 'bad request' });
  }
  if (!isValidEmail_(data.to)) {
    return reply_({ ok: false, error: 'invalid recipient' });
  }
  if (MailApp.getRemainingDailyQuota() < 1) {
    return reply_({ ok: false, error: 'daily quota exhausted' });
  }

  // 1) منح الصلاحية (لو فشل ما نبعتش الإيميل)
  var granted = false;
  if (data.folder_link) {
    var grant = grantAccess_(data.folder_link, data.to);
    if (!grant.ok) {
      return reply_({ ok: false, granted: false, error: 'access grant failed: ' + grant.error });
    }
    granted = true;
  }

  // 2) إرسال الإيميل (لو فشل بعد منح الصلاحية بنرجّع granted = true)
  try {
    MailApp.sendEmail({
      to: data.to,
      subject: data.subject,
      body: data.text || '',
      htmlBody: data.html,
      name: 'Ahmed Mostafa Tech'
    });
  } catch (mailErr) {
    return reply_({ ok: false, granted: granted, error: 'mail failed: ' + String(mailErr) });
  }

  return reply_({ ok: true, granted: granted, remaining: MailApp.getRemainingDailyQuota() });
}

// سحب الصلاحية
function handleRevoke_(data) {
  if (!data.to || !data.folder_link) {
    return reply_({ ok: false, error: 'bad request' });
  }
  if (!isValidEmail_(data.to)) {
    return reply_({ ok: false, error: 'invalid recipient' });
  }

  var result = revokeAccess_(data.folder_link, data.to);
  if (!result.ok) {
    return reply_({ ok: false, error: 'access revoke failed: ' + result.error });
  }
  return reply_({ ok: true, revoked: true });
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

// استخراج ID الفولدر أو الملف من لينك Drive
function extractDriveId_(link) {
  var s = String(link || '');
  var m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ||
    s.match(/\/d\/([A-Za-z0-9_-]{10,})/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

// جلب فولدر أو ملف بالـ ID
function getDriveItem_(id) {
  try {
    return DriveApp.getFolderById(id);
  } catch (folderErr) {
    return DriveApp.getFileById(id);
  }
}

// هل الإيميل لسه عنده صلاحية مباشرة (مشاهد أو محرر)؟
function hasDirectAccess_(item, email) {
  var target = String(email).toLowerCase();
  var users = item.getViewers().concat(item.getEditors());
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].getEmail()).toLowerCase() === target) {
      return true;
    }
  }
  return false;
}

// إضافة الإيميل Viewer (بيرفض لو المشاركة العامة شغالة)
function grantAccess_(link, email) {
  var id = extractDriveId_(link);
  if (!id) {
    return { ok: false, error: 'invalid drive link' };
  }

  try {
    var item = getDriveItem_(id);
    var access = item.getSharingAccess();
    if (access === DriveApp.Access.ANYONE || access === DriveApp.Access.ANYONE_WITH_LINK) {
      return { ok: false, error: 'folder is public: set General access to Restricted in Drive' };
    }

    item.addViewer(String(email).toLowerCase());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// إزالة الإيميل من الفولدر، ثم التأكد إنه فعلًا اتشال
function revokeAccess_(link, email) {
  var id = extractDriveId_(link);
  if (!id) {
    return { ok: false, error: 'invalid drive link' };
  }

  try {
    var item = getDriveItem_(id);
    var lowered = String(email).toLowerCase();

    item.removeViewer(lowered);
    if (hasDirectAccess_(item, lowered)) {
      try {
        item.removeEditor(lowered);
      } catch (editorErr) {
        // نتجاهل
      }
    }

    if (hasDirectAccess_(item, lowered)) {
      return { ok: false, error: 'permission still present after removal' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function reply_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
