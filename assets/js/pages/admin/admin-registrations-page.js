// ============================================================
// admin-registrations-page.js
// منطق صفحة إدارة التسجيلات والمدفوعات (admin/registrations.html)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import { supabase } from '../../core/supabase-client.js';
import {
  getAllRegistrations,
  getAllRevisions,
  approveRegistration,
  rejectRegistration,
  updateRegistrationStatus,
  sendActivationEmail,
  revokeAccess,
  deleteRegistration
} from '../../services/admin-service.js';
import {
  formatPrice,
  formatDateTime,
  escapeHtml,
  setButtonLoading,
  getErrorMessage,
  initSpotlightCards
} from '../../core/utils.js';

// -------------------------------------------------------
// قائمة الفروع الجامعية (تظهر دائماً في الفلتر)
// -------------------------------------------------------
let UNIVERSITY_BRANCHES = [
  'فرع القاهرة',
  'فرع الإسكندرية',
  'فرع المنوفية (شبين الكوم)',
  'فرع أسيوط',
  'فرع طنطا',
  'فرع الزقازيق',
  'فرع دمياط',
  'فرع المنصورة',
  'فرع بورسعيد',
  'فرع الإسماعيلية',
  'فرع السويس',
  'فرع بني سويف',
  'فرع الفيوم',
  'فرع المنيا',
  'فرع قنا',
  'فرع الأقصر',
  'فرع أسوان',
  'فرع سوهاج',
  'فرع كفر الشيخ',
  'فرع الغردقة',
  'فرع السادات',
  'فرع العريش',
  'فرع مرسى مطروح',
  'فرع شرم الشيخ',
  'فرع آخر'
];

// رسائل أخطاء دوال الأدمن والإيميل (بتيجي بالإنجليزي)
// الترتيب مهم: الأخص الأول، لأن أول تطابق هو اللي بيتعرض
let ADMIN_ERROR_MESSAGES = [
  ['forbidden', 'ليس لديك صلاحية الأدمن. سجّل الدخول بحساب الأدمن.'],
  ['not authenticated', 'انتهت الجلسة، سجّل الدخول تاني.'],
  ['registration not found', 'التسجيل غير موجود. حدّث الصفحة وحاول مرة أخرى.'],
  ['registration already approved', 'هذا التسجيل مؤكد بالفعل.'],
  ['registration not approvable', 'حالة الطلب الحالية لا تسمح بالقبول. ضعه قيد الفحص أولًا.'],
  ['registration not rejectable', 'حالة الطلب الحالية لا تسمح بالرفض.'],
  ['registration not paid', 'الدفع لسه ما اتأكدش، فمينفعش يتبعت اللينك.'],
  ['rejection reason required', 'سبب الرفض مطلوب.'],
  ['access link not set', 'لازم تضيف لينك الدخول للمادة من صفحة إدارة المراجعات قبل القبول.'],
  ['invalid registration id', 'رقم التسجيل غير صالح، حدّث الصفحة.'],
  ['email gateway not configured', 'إعدادات الإيميل ناقصة في Supabase (APPS_SCRIPT_URL و APPS_SCRIPT_SECRET).'],
  ['daily quota exhausted', 'خلص حد الإرسال اليومي في Gmail، جرّب بكرة.'],
  ['unauthorized', 'سر بوابة الإيميل غير مطابق بين Supabase وGoogle Apps Script.'],
  ['unexpected gateway response', 'رابط بوابة الإيميل مش شغال (لازم رابط /exec ومنشور لـ Anyone، وبعد أي تعديل لازم Deployment جديد).'],
  ['unexpected function response', 'رد الفنكشن غير متوقع. اتأكد إن المنشورة هي نسخة send-activation-email الجديدة.'],
  ['access revoke failed', 'فشل سحب الصلاحية من Drive. الرسالة بين القوسين بتوضح السبب، وهيتعاد تلقائيًا لو الاشتراك منتهي.'],
  ['email delivery failed', 'فشل إرسال الإيميل من البوابة.'],
    ['folder is public', 'فولدر Drive لسه متاح لأي حد معاه اللينك. غيّر General access لـ Restricted وجرّب تاني.'],
  ['invalid drive link', 'لينك Drive في المادة مش صحيح. تأكد إنه لينك فولدر أو ملف.'],
  ['access grant failed', 'فشل منح صلاحية الفولدر للطالب. اتأكد إن إيميله حساب جوجل وإن لينك المادة صحيح.'],
];

let currentRegistrations = [];
let selectedReg = null;
let loadCounter = 0;

// متغيرات التقسيم للصفحات (Pagination)
let currentPage = 1;
let pageSize = 15;

function byId(id) {
  return document.getElementById(id);
}

// ترجمة رسالة الخطأ (الأولوية لرسائل الأدمن ثم الرسائل العامة)
function adminErrorMessage(err) {
  let raw = err && err.message ? String(err.message).toLowerCase() : '';
  for (let i = 0; i < ADMIN_ERROR_MESSAGES.length; i++) {
    if (raw.includes(ADMIN_ERROR_MESSAGES[i][0])) {
      return ADMIN_ERROR_MESSAGES[i][1];
    }
  }
  return getErrorMessage(err);
}

// رسالة خطأ الإيميل: الترجمة + السبب الأصلي بين قوسين (للتشخيص)
function emailErrorText(err) {
  let raw = err && err.message ? String(err.message) : 'Unknown';
  return adminErrorMessage(err) + '\n(' + raw + ')';
}

function getStatusBadge(status) {
  switch (status) {
    case 'paid':
      return '<span class="badge badge--success" style="font-size:11px;">مؤكد (Paid)</span>';
    case 'under_review':
      return '<span class="badge badge--accent" style="font-size:11px;">قيد المراجعة</span>';
    case 'pending_payment':
      return '<span class="badge badge--warning" style="font-size:11px;">بانتظار التحويل</span>';
    case 'rejected':
      return '<span class="badge badge--danger" style="font-size:11px;">مرفوض</span>';
    case 'cancelled':
      return '<span class="badge badge--muted" style="font-size:11px;">ملغي</span>';
    default:
      return '<span class="badge badge--muted" style="font-size:11px;">' + escapeHtml(status) + '</span>';
  }
}

// رابط واتساب بالصيغة الدولية (من غير صفر)
function buildWhatsAppLink(phone) {
  let digits = String(phone || '').replace(/\D/g, '').replace(/^0/, '20');
  return 'https://wa.me/' + digits;
}

function renderRegistrationRow(r) {
  let courseTitle = r.courses ? r.courses.title : 'مراجعة غير محددة';
  let isInsta = r.payment_method === 'instapay';
  let methodBadge = isInsta
    ? '<span style="color:#c084fc; font-weight:700;"><i class="fa-solid fa-bolt"></i> إنستاباي</span>'
    : '<span style="color:#f87171; font-weight:700;"><i class="fa-solid fa-wallet"></i> فودافون كاش</span>';
  let waLink = buildWhatsAppLink(r.phone);

  return '' +
    '<tr>' +
      '<td style="font-weight:800; font-family:monospace; color:#ffd154;">' + escapeHtml(r.registration_code) + '</td>' +
      '<td style="font-weight:700;">' + escapeHtml(r.full_name) + '</td>' +
      '<td style="color:rgba(255,255,255,0.6);">' + escapeHtml(r.branch) + '</td>' +
      '<td>' +
        '<a href="' + waLink + '" target="_blank" rel="noopener" style="color:#22c55e; text-decoration:none; font-family:monospace; font-weight:700; display:inline-flex; align-items:center; gap:4px;">' +
          '<i class="fa-brands fa-whatsapp"></i>' +
          '<span>' + escapeHtml(r.phone) + '</span>' +
        '</a>' +
      '</td>' +
      '<td style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(courseTitle) + '</td>' +
      '<td style="font-weight:800; color:#4ade80;">' + formatPrice(r.amount) + '</td>' +
      '<td>' + methodBadge + '</td>' +
      '<td>' + getStatusBadge(r.payment_status) + '</td>' +
      '<td style="font-size:11px; color:rgba(255,255,255,0.5);" dir="ltr">' + escapeHtml(r.email) + '</td>' +
      '<td style="text-align:center;">' +
        '<button type="button" class="btn btn--secondary btn--sm btn-inspect-reg" data-id="' + escapeHtml(r.id) + '" style="font-size:11px; padding:4px 10px; border-radius:8px;">' +
          '<i class="fa-solid fa-magnifying-glass"></i> فحص / إجراء' +
        '</button>' +
      '</td>' +
    '</tr>';
}

// -------------------------------------------------------
// عرض صفحة محددة وتحديث شريط الصفحات (Pagination)
// -------------------------------------------------------
function renderCurrentPage() {
  let tbody = byId('registrations-tbody');
  let countLabel = byId('regs-count-label');
  let paginationWrap = byId('pagination-controls');
  let pageInfoLabel = byId('page-info-label');
  let prevBtn = byId('prev-page-btn');
  let nextBtn = byId('next-page-btn');
  let pageNumbersWrap = byId('page-numbers-wrap');

  let totalItems = currentRegistrations.length;
  let totalPages = Math.ceil(totalItems / pageSize) || 1;

  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  if (countLabel) {
    countLabel.textContent = 'إجمالي التسجيلات المطابقة: ' + totalItems;
  }

  if (!tbody) return;

  if (totalItems === 0) {
    tbody.innerHTML =
      '<tr><td colspan="10" class="text-center" style="padding:32px; color:rgba(255,255,255,0.4);">' +
      'لا توجد نتائج مطابقة لشروط البحث والفلترة.' +
      '</td></tr>';
    if (paginationWrap) paginationWrap.hidden = true;
    return;
  }

  let startIndex = (currentPage - 1) * pageSize;
  let endIndex = Math.min(startIndex + pageSize, totalItems);
  let pageItems = currentRegistrations.slice(startIndex, endIndex);

  tbody.innerHTML = pageItems.map(renderRegistrationRow).join('');
  initSpotlightCards();

  if (paginationWrap) {
    paginationWrap.hidden = false;
  }

  if (pageInfoLabel) {
    pageInfoLabel.textContent = 'عرض ' + (startIndex + 1) + ' إلى ' + endIndex + ' من أصل ' + totalItems;
  }

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }

  if (pageNumbersWrap) {
    pageNumbersWrap.innerHTML = '';
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);

    for (let p = startPage; p <= endPage; p++) {
      let pBtn = document.createElement('button');
      pBtn.type = 'button';
      pBtn.textContent = p;
      pBtn.style.minWidth = '32px';
      pBtn.style.height = '32px';
      pBtn.style.padding = '0 6px';
      pBtn.style.borderRadius = '6px';
      pBtn.style.fontSize = '12px';
      pBtn.style.fontWeight = '700';
      pBtn.style.cursor = 'pointer';
      pBtn.style.border = '1px solid rgba(255,255,255,0.15)';

      if (p === currentPage) {
        pBtn.style.background = '#2563eb';
        pBtn.style.color = '#ffffff';
        pBtn.style.borderColor = '#2563eb';
      } else {
        pBtn.style.background = 'rgba(255,255,255,0.05)';
        pBtn.style.color = '#cbd5e1';
      }

      pBtn.addEventListener('click', function () {
        currentPage = p;
        renderCurrentPage();
      });

      pageNumbersWrap.appendChild(pBtn);
    }
  }
}

async function loadRegistrations() {
  loadCounter = loadCounter + 1;
  let requestId = loadCounter;

  let tbody = byId('registrations-tbody');
  let countLabel = byId('regs-count-label');
  let alertEl = byId('regs-alert');

  if (alertEl) {
    alertEl.hidden = true;
  }

  try {
    let results = await getAllRegistrations({
      search: byId('filter-search').value,
      status: byId('filter-status').value,
      course_id: byId('filter-course').value,
      branch: byId('filter-branch').value
    });

    // تجاهل أي رد قديم وصل بعد طلب أحدث
    if (requestId !== loadCounter) {
      return;
    }

    currentRegistrations = results;
    currentPage = 1;
    renderCurrentPage();
  } catch (err) {
    console.error('Failed to load registrations:', err);
    if (alertEl) {
      alertEl.textContent = 'حدث خطأ أثناء جلب التسجيلات: ' + adminErrorMessage(err);
      alertEl.hidden = false;
    }
  }
}

// ربط أزرار الفحص مرة واحدة على الجدول (بدل إعادة الربط مع كل تحميل)
function handleTableClick(event) {
  let btn = event.target.closest('.btn-inspect-reg');
  if (!btn) {
    return;
  }
  openReviewModal(btn.getAttribute('data-id'));
}


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

// إظهار الأزرار المناسبة لحالة الطلب فقط
function updateModalButtons(reg) {
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
}

 async function openReviewModal(regId) {
  let reg = currentRegistrations.find(function (r) {
    return r.id === regId;
  });
  if (!reg) {
    return;
  }
  selectedReg = reg;

  let modal = byId('review-modal');
  let codeEl = byId('modal-reg-code');
  let detailsEl = byId('modal-reg-details');
  let noteInput = byId('modal-admin-note');
  let rejectBox = byId('reject-reason-box');
  let rejectInput = byId('modal-reject-reason');

  if (codeEl) {
    codeEl.textContent = reg.registration_code;
  }
  if (noteInput) {
    noteInput.value = reg.admin_note || '';
  }
  if (rejectBox) {
    rejectBox.hidden = true;
  }
  if (rejectInput) {
    rejectInput.value = reg.rejection_reason || '';
  }

  let courseTitle = reg.courses ? reg.courses.title : 'غير محدد';
  let methodText = reg.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';
  let waLink = buildWhatsAppLink(reg.phone);

  // حالة إيميل التفعيل للطلبات المؤكدة
  let emailLine = '';
  if (reg.payment_status === 'paid') {
    emailLine = reg.email_sent
      ? '<div><strong>إيميل التفعيل:</strong> <span style="color:#22c55e;">تم إرساله</span></div>'
      : '<div><strong>إيميل التفعيل:</strong> <span style="color:#f59e0b;">لم يُرسل بعد، استخدم زر إرسال إيميل التفعيل</span></div>';
  }

  if (detailsEl) {
    detailsEl.innerHTML =
      '<div><strong>اسم الطالب:</strong> ' + escapeHtml(reg.full_name) + '</div>' +
      '<div><strong>الفرع الجامعي:</strong> ' + escapeHtml(reg.branch) + '</div>' +
      '<div><strong>رقم الموبايل:</strong> <a href="' + waLink + '" target="_blank" rel="noopener" style="color:#22c55e; font-weight:700; text-decoration:none;"><i class="fa-brands fa-whatsapp"></i> ' + escapeHtml(reg.phone) + ' (فتح واتساب)</a></div>' +
      '<div><strong>البريد الإلكتروني:</strong> <span dir="ltr">' + escapeHtml(reg.email) + '</span></div>' +
      '<div><strong>المادة / المراجعة:</strong> ' + escapeHtml(courseTitle) + '</div>' +
      '<div><strong>المبلغ المطلوب:</strong> <span style="font-weight:800; color:#4ade80;">' + formatPrice(reg.amount) + '</span></div>' +
      '<div><strong>وسيلة الدفع المحددة:</strong> ' + escapeHtml(methodText) + '</div>' +
      '<div><strong>الحالة الحالية:</strong> ' + getStatusBadge(reg.payment_status) + '</div>' +
      '<div><strong>تاريخ ووقت التسجيل:</strong> ' + formatDateTime(reg.created_at) + '</div>' +
      emailLine +
      (reg.rejection_reason
        ? '<div style="color:#ef4444;"><strong>سبب الرفض السابق:</strong> ' + escapeHtml(reg.rejection_reason) + '</div>'
        : '');
  }

  // عرض كارت معاينة صورة إيصال التحويل المرفوع
  let receiptBox = byId('modal-receipt-container');
  if (receiptBox) {
    // رابط مؤقت لصورة الإيصال من المسار المخزّن (الأدمن بس يقدر يعمله)
let finalReceiptUrl = null;
let proofPath = reg.proof_path || null;

if (proofPath) {
  try {
    let { data: signed, error: signErr } = await supabase.storage
      .from('receipts')
      .createSignedUrl(proofPath, 600);
    if (signErr) {
      console.warn('receipt signed url failed:', signErr.message);
    } else if (signed && signed.signedUrl) {
      finalReceiptUrl = signed.signedUrl;
    }
  } catch (err) {
    console.warn('Error creating signed url for receipt:', err);
  }
}

    if (finalReceiptUrl) {
      receiptBox.innerHTML = `
        <div style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="color:#0f172a; font-size:13px; display:flex; align-items:center; gap:6px;">
              <i class="fa-solid fa-receipt" style="color:#2563eb;"></i>
              صورة إيصال التحويل المرفوعة
            </strong>
            <a href="${escapeHtml(finalReceiptUrl)}" target="_blank" rel="noopener" class="btn btn--secondary btn--sm" style="font-size:11px; padding:4px 10px; border-radius:8px;">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> فتح بالحجم الكامل
            </a>
          </div>
          <div style="text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:8px; overflow:hidden;">
            <a href="${escapeHtml(finalReceiptUrl)}" target="_blank" rel="noopener">
              <img src="${escapeHtml(finalReceiptUrl)}" alt="إيصال التحويل" style="max-height:220px; max-width:100%; border-radius:8px; object-fit:contain; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            </a>
          </div>
          <span style="display:block; font-size:11px; color:#64748b; margin-top:6px; text-align:center;">
            💡 اضغط على الصورة لفتحها في تبويب مستقل لتكبيرها وفحص أرقام العملية والمبلغ.
          </span>
        </div>
      `;
    } else {
      receiptBox.innerHTML = `
        <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px; color:#64748b; font-size:12px;">
            <i class="fa-solid fa-image-slash" style="font-size:16px;"></i>
            <span>لم يتم رفع صورة إيصال من الموقع — مراجعة الإيصال عبر الواتساب.</span>
          </div>
          <a href="${waLink}" target="_blank" rel="noopener" style="color:#16a34a; font-weight:700; font-size:12px; text-decoration:none; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;">
            <i class="fa-brands fa-whatsapp"></i> فتح المحادثة
          </a>
        </div>
      `;
    }
  }

  updateModalButtons(reg);

  if (modal) {
    modal.hidden = false;
  }
  initSpotlightCards();
}

function closeReviewModal() {
  let modal = byId('review-modal');
  if (modal) {
    modal.hidden = true;
  }
  selectedReg = null;
}

// إنشاء زر إرسال/إعادة إرسال الإيميل جوه نفس صف أزرار المودال
function ensureResendButton() {
  let existing = byId('btn-modal-resend');
  if (existing) {
    return existing;
  }

  let approveBtn = byId('btn-modal-approve');
  if (!approveBtn || !approveBtn.parentElement) {
    return null;
  }

  let resendBtn = document.createElement('button');
  resendBtn.type = 'button';
  resendBtn.id = 'btn-modal-resend';
  resendBtn.className = 'btn btn--secondary';
  resendBtn.hidden = true;
  resendBtn.textContent = 'إرسال إيميل التفعيل';
  approveBtn.parentElement.appendChild(resendBtn);
  return resendBtn;
}

function setupModalActions() {
  let modal = byId('review-modal');
  let closeBtn = byId('modal-close-btn');
  let approveBtn = byId('btn-modal-approve');
  let rejectBtn = byId('btn-modal-reject');
  let reviewBtn = byId('btn-modal-review');
  let resendBtn = ensureResendButton();
  let revokeBtn = ensureRevokeButton();
  let deleteBtn = ensureDeleteButton();

  if (closeBtn) {
    closeBtn.addEventListener('click', closeReviewModal);
  }

  // إغلاق بالضغط على الخلفية أو زر Esc
  if (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        closeReviewModal();
      }
    });
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeReviewModal();
    }
  });

  // زر القبول
  if (approveBtn) {
    approveBtn.addEventListener('click', async function () {
      if (!selectedReg) {
        return;
      }
      let reg = selectedReg;
      let note = byId('modal-admin-note').value.trim();

      if (!confirm('هل أنت متأكد من استلام تحويل مبلغ ' + reg.amount + ' EGP وتأكيد اشتراك الطالب (' + reg.full_name + ')؟')) {
        return;
      }

      setButtonLoading(approveBtn, true, 'جاري التأكيد...');

      // 1) تأكيد الدفع في الداتابيز
      let payload = null;
      try {
        payload = await approveRegistration(reg.id, note || null);
      } catch (err) {
        alert('حدث خطأ أثناء القبول: ' + adminErrorMessage(err));
        setButtonLoading(approveBtn, false);
        return;
      }

      // 2) إرسال إيميل التفعيل (السيرفر بيتحقق ويسجل النتيجة بنفسه)
      let emailOk = false;
      let emailSkipped = false;
      let emailError = '';
      try {
        let result = await sendActivationEmail(payload.registration_id, false);
        emailOk = true;
        emailSkipped = !!(result && result.skipped);
      } catch (mailErr) {
        emailError = emailErrorText(mailErr);
        console.warn('Activation email failed:', mailErr);
      }

      setButtonLoading(approveBtn, false);
      closeReviewModal();
      await loadRegistrations();

      if (emailOk && !emailSkipped) {
        alert('تم تأكيد اشتراك الطالب (' + payload.student_name + ') وإرسال إيميل التفعيل.');
      } else if (emailOk && emailSkipped) {
        alert('تم تأكيد اشتراك الطالب (' + payload.student_name + '). الإيميل كان اتبعت قبل كده.');
      } else {
        alert(
          'تم تأكيد الدفع في النظام، لكن فشل إرسال إيميل التفعيل:\n' + emailError +
          '\n\nافتح التسجيل واضغط "إرسال إيميل التفعيل" بعد حل المشكلة، أو ابعت اللينك على واتساب.'
        );
      }
    });
  }

  // زر إرسال / إعادة إرسال إيميل التفعيل (للتسجيلات المؤكدة فقط)
  if (resendBtn) {
    resendBtn.addEventListener('click', async function () {
      if (!selectedReg || selectedReg.payment_status !== 'paid') {
        return;
      }
      let reg = selectedReg;

      // لو الإيميل اتبعت قبل كده نطلب تأكيد قبل الإرسال المتعمد
      let force = reg.email_sent === true;
      if (force && !confirm('الإيميل اتبعت قبل كده. تبعته تاني إلى ' + reg.email + '؟')) {
        return;
      }

      setButtonLoading(resendBtn, true, 'جاري الإرسال...');
      try {
        let result = await sendActivationEmail(reg.id, force);
        closeReviewModal();
        await loadRegistrations();
        if (result && result.skipped) {
          alert('الإيميل كان اتبعت قبل كده، ولم يُرسل مرة تانية.');
        } else {
          alert('تم إرسال إيميل التفعيل إلى ' + reg.email + '.');
        }
      } catch (err) {
        alert('فشل إرسال الإيميل:\n' + emailErrorText(err));
      } finally {
        setButtonLoading(resendBtn, false);
      }
    });
  }

  
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
        alert('فشل سحب الوصول:\n' + emailErrorText(err));
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

  // زر قيد الفحص
  if (reviewBtn) {
    reviewBtn.addEventListener('click', async function () {
      if (!selectedReg) {
        return;
      }
      let reg = selectedReg;
      let note = byId('modal-admin-note').value.trim();

      setButtonLoading(reviewBtn, true, 'جاري الحفظ...');
      try {
        await updateRegistrationStatus(reg.id, 'under_review', note || null);
        closeReviewModal();
        await loadRegistrations();
      } catch (err) {
        alert('حدث خطأ: ' + adminErrorMessage(err));
      } finally {
        setButtonLoading(reviewBtn, false);
      }
    });
  }

  // زر الرفض
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async function () {
      if (!selectedReg) {
        return;
      }
      let reg = selectedReg;
      let rejectBox = byId('reject-reason-box');
      let reasonInput = byId('modal-reject-reason');
      let note = byId('modal-admin-note').value.trim();

      // الضغطة الأولى بتظهر خانة السبب فقط
      if (rejectBox && rejectBox.hidden) {
        rejectBox.hidden = false;
        if (reasonInput) {
          reasonInput.focus();
        }
        return;
      }

      let reason = reasonInput ? reasonInput.value.trim() : '';
      if (!reason) {
        alert('من فضلك اكتب سبب الرفض لتوضيحه في السجل.');
        return;
      }

      if (!confirm('هل أنت متأكد من رفض هذا الطلب؟')) {
        return;
      }

      setButtonLoading(rejectBtn, true, 'جاري الرفض...');
      try {
        await rejectRegistration(reg.id, reason, note || null);
        closeReviewModal();
        await loadRegistrations();
      } catch (err) {
        alert('حدث خطأ أثناء الرفض: ' + adminErrorMessage(err));
      } finally {
        setButtonLoading(rejectBtn, false);
      }
    });
  }
}

async function initAdminRegistrationsPage() {
  let authContext = await requireAdmin('login.html');
  if (!authContext) {
    return;
  }

  // خروج
  let signOutBtn = byId('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // تعبئة فلتر المراجعات
  try {
    let revisions = await getAllRevisions();
    let courseSelect = byId('filter-course');
    if (courseSelect) {
      for (let i = 0; i < revisions.length; i++) {
        let opt = document.createElement('option');
        opt.value = revisions[i].id;
        opt.textContent = revisions[i].title;
        courseSelect.appendChild(opt);
      }
    }
  } catch (e) {
    console.warn('Failed to populate course filter:', e);
  }

  // تعبئة فلتر الفروع بالقائمة الثابتة الكاملة
  let branchSelect = byId('filter-branch');
  if (branchSelect) {
    for (let j = 0; j < UNIVERSITY_BRANCHES.length; j++) {
      let branchOpt = document.createElement('option');
      branchOpt.value = UNIVERSITY_BRANCHES[j];
      branchOpt.textContent = UNIVERSITY_BRANCHES[j];
      branchSelect.appendChild(branchOpt);
    }
  }

  // ربط أحداث الفلاتر
  let filterIds = ['filter-status', 'filter-course', 'filter-branch'];
  for (let k = 0; k < filterIds.length; k++) {
    let el = byId(filterIds[k]);
    if (el) {
      el.addEventListener('change', loadRegistrations);
    }
  }

  let searchInput = byId('filter-search');
  if (searchInput) {
    let debounceTimer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadRegistrations, 300);
    });
  }

  let resetBtn = byId('reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      byId('filter-search').value = '';
      byId('filter-status').value = 'all';
      byId('filter-course').value = 'all';
      byId('filter-branch').value = 'all';
      loadRegistrations();
    });
  }

  let refreshBtn = byId('refresh-regs-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadRegistrations);
  }

  let tbody = byId('registrations-tbody');
  if (tbody) {
    tbody.addEventListener('click', handleTableClick);
  }

  // أحداث التنقل بين الصفحات وتغيير عدد العناصر
  let pageSizeSelect = byId('page-size-select');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', function () {
      pageSize = parseInt(pageSizeSelect.value, 10) || 15;
      currentPage = 1;
      renderCurrentPage();
    });
  }

  let prevBtn = byId('prev-page-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (currentPage > 1) {
        currentPage--;
        renderCurrentPage();
      }
    });
  }

  let nextBtn = byId('next-page-btn');
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      let totalPages = Math.ceil(currentRegistrations.length / pageSize) || 1;
      if (currentPage < totalPages) {
        currentPage++;
        renderCurrentPage();
      }
    });
  }

  setupModalActions();
  await loadRegistrations();
}

document.addEventListener('DOMContentLoaded', initAdminRegistrationsPage);