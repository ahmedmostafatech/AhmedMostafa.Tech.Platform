const fs = require('fs');
let c = fs.readFileSync('assets/js/pages/admin/admin-registrations-page.js', 'utf8');

// 1) Update import
c = c.replace(
  /sendActivationEmail\s*\}\s*from\s*['"]\.\.\/\.\.\/services\/admin-service\.js['"];/,
  `sendActivationEmail,
  revokeAccess,
  deleteRegistration
} from '../../services/admin-service.js';`
);

// 2) Add error message
c = c.replace(
  "['email delivery failed',",
  "['access revoke failed', 'فشل سحب الصلاحية من Drive. الرسالة بين القوسين بتوضح السبب، وهيتعاد تلقائيًا لو الاشتراك منتهي.'],\n  ['email delivery failed',"
);

// 3) Helper functions
let helperFunctions = `
// نص حالة صلاحية الوصول في نافذة الفحص
function accessStatusHtml(reg) {
  if (reg.payment_status !== 'paid') {
    return '';
  }
  let label = '';
  switch (reg.access_status) {
    case 'granted':
      label = '<span style="color:#22c55e;">ممنوحة</span>';
      break;
    case 'revoked':
      label = '<span style="color:#ef4444;">تم سحبها</span>' +
        (reg.access_revoked_at ? ' (' + formatDateTime(reg.access_revoked_at) + ')' : '') +
        (reg.revoke_reason ? ' - ' + escapeHtml(reg.revoke_reason) : '');
      break;
    case 'revoke_failed':
      label = '<span style="color:#f59e0b;">فشل السحب</span>' +
        (reg.access_error ? ' (' + escapeHtml(reg.access_error) + ')' : '');
      break;
    default:
      label = '<span style="color:rgba(255,255,255,0.5);">لم تُمنح بعد</span>';
  }
  return '<div><strong>صلاحية الفولدر:</strong> ' + label + '</div>';
}

// إنشاء زر سحب الوصول جوه نفس صف أزرار المودال
function ensureRevokeButton() {
  let existing = byId('btn-modal-revoke');
  if (existing) {
    return existing;
  }
  let approveBtn = byId('btn-modal-approve');
  if (!approveBtn || !approveBtn.parentElement) {
    return null;
  }
  let revokeBtn = document.createElement('button');
  revokeBtn.type = 'button';
  revokeBtn.id = 'btn-modal-revoke';
  revokeBtn.className = 'btn btn--secondary';
  revokeBtn.style.color = '#ef4444';
  revokeBtn.style.borderColor = 'rgba(239,68,68,0.5)';
  revokeBtn.hidden = true;
  revokeBtn.textContent = 'سحب الوصول';
  approveBtn.parentElement.appendChild(revokeBtn);
  return revokeBtn;
}

// إنشاء زر حذف التسجيل نهائياً
function ensureDeleteButton() {
  let existing = byId('btn-modal-delete');
  if (existing) {
    return existing;
  }
  let approveBtn = byId('btn-modal-approve');
  if (!approveBtn || !approveBtn.parentElement) {
    return null;
  }
  let deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.id = 'btn-modal-delete';
  deleteBtn.className = 'btn btn--secondary';
  deleteBtn.style.color = '#dc2626';
  deleteBtn.style.borderColor = 'rgba(220,38,38,0.4)';
  deleteBtn.textContent = 'حذف التسجيل نهائياً';
  approveBtn.parentElement.appendChild(deleteBtn);
  return deleteBtn;
}
`;

c = c.replace('// إظهار الأزرار المناسبة لحالة الطلب فقط\r\nfunction updateModalButtons', helperFunctions + '\r\n// إظهار الأزرار المناسبة لحالة الطلب فقط\r\nfunction updateModalButtons');
if (!c.includes('ensureDeleteButton')) {
  c = c.replace('// إظهار الأزرار المناسبة لحالة الطلب فقط\nfunction updateModalButtons', helperFunctions + '\n// إظهار الأزرار المناسبة لحالة الطلب فقط\nfunction updateModalButtons');
}

// 4) updateModalButtons
let newUpdateModalButtons = `function updateModalButtons(reg) {
  let status = reg.payment_status;
  let canApprove = status === 'pending_payment' || status === 'under_review';
  let canReject = canApprove;
  let canReview = status !== 'under_review' && status !== 'paid';
  let canSendEmail = status === 'paid';
  let canRevoke = status === 'paid' && reg.access_status !== 'revoked' && reg.access_status !== 'none';

  byId('btn-modal-approve').hidden = !canApprove;
  byId('btn-modal-reject').hidden = !canReject;
  byId('btn-modal-review').hidden = !canReview;

  let resendBtn = byId('btn-modal-resend');
  if (resendBtn) {
    resendBtn.hidden = !canSendEmail;
    if (reg.access_status === 'revoked') {
      resendBtn.textContent = 'إعادة منح الوصول وإرسال الإيميل';
    } else {
      resendBtn.textContent = reg.email_sent ? 'إعادة إرسال الإيميل' : 'إرسال إيميل التفعيل';
    }
  }

  let revokeBtn = byId('btn-modal-revoke');
  if (revokeBtn) {
    revokeBtn.hidden = !canRevoke;
  }
}`;

c = c.replace(/function updateModalButtons\(reg\) \{[\s\S]*?\r?\n\}/, newUpdateModalButtons);

// 5) openReviewModal details
c = c.replace('emailLine +\r\n', 'emailLine +\r\n      accessStatusHtml(reg) +\r\n');
if (!c.includes('accessStatusHtml(reg)')) {
  c = c.replace('emailLine +\n', 'emailLine +\n      accessStatusHtml(reg) +\n');
}

// 6) setupModalActions buttons & listeners
c = c.replace(
  'let resendBtn = ensureResendButton();',
  `let resendBtn = ensureResendButton();
  let revokeBtn = ensureRevokeButton();
  let deleteBtn = ensureDeleteButton();`
);

let handlers = `
  // زر سحب الوصول
  if (revokeBtn) {
    revokeBtn.addEventListener('click', async function () {
      if (!selectedReg || selectedReg.payment_status !== 'paid') {
        return;
      }
      let reg = selectedReg;
      let reason = prompt(
        'سبب سحب الوصول من ' + reg.full_name + ' (' + reg.email + '):',
        'سحب بقرار إداري'
      );
      if (reason === null) {
        return;
      }
      if (!confirm('هيتشال ' + reg.email + ' من فولدر المراجعة فورًا. متأكد؟')) {
        return;
      }
      setButtonLoading(revokeBtn, true, 'جاري السحب...');
      try {
        await revokeAccess(reg.id, reason.trim());
        closeReviewModal();
        await loadRegistrations();
        alert('تم سحب صلاحية ' + reg.email + ' من الفولدر.');
      } catch (err) {
        alert('فشل سحب الوصول:\\n' + emailErrorText(err));
      } finally {
        setButtonLoading(revokeBtn, false);
      }
    });
  }

  // زر حذف التسجيل نهائياً من قاعدة البيانات
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async function () {
      if (!selectedReg) return;
      let reg = selectedReg;
      if (!confirm('هل أنت متأكد تماماً من حذف تسجيل الطالب (' + reg.full_name + ') وسجلاته نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.')) {
        return;
      }
      setButtonLoading(deleteBtn, true, 'جاري الحذف...');
      try {
        await deleteRegistration(reg.id);
        closeReviewModal();
        await loadRegistrations();
        alert('تم حذف التسجيل نهائياً بنجاح.');
      } catch (err) {
        alert('فشل حذف التسجيل: ' + adminErrorMessage(err));
      } finally {
        setButtonLoading(deleteBtn, false);
      }
    });
  }
`;

c = c.replace('// زر قيد الفحص', handlers + '\n  // زر قيد الفحص');

fs.writeFileSync('assets/js/pages/admin/admin-registrations-page.js', c);
console.log('SUCCESS_UPDATE_PAGE');

