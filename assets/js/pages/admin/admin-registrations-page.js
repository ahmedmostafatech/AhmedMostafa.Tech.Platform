// ============================================================
// admin-registrations-page.js
// منطق صفحة إدارة التسجيلات والمدفوعات (admin/registrations.html)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import {
  getAllRegistrations,
  getAllRevisions,
  approveRegistration,
  rejectRegistration,
  updateRegistrationStatus,
  sendActivationEmail
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
  ['email delivery failed', 'فشل إرسال الإيميل من البوابة.']
];

let currentRegistrations = [];
let selectedReg = null;
let loadCounter = 0;

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

    if (countLabel) {
      countLabel.textContent = 'عرض ' + currentRegistrations.length + ' تسجيل';
    }

    if (!tbody) {
      return;
    }

    if (currentRegistrations.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="10" class="text-center" style="padding:32px; color:rgba(255,255,255,0.4);">' +
        'لا توجد نتائج مطابقة لشروط البحث والفلترة.' +
        '</td></tr>';
      return;
    }

    tbody.innerHTML = currentRegistrations.map(renderRegistrationRow).join('');
    initSpotlightCards();
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

// إظهار الأزرار المناسبة لحالة الطلب فقط
function updateModalButtons(reg) {
  let status = reg.payment_status;
  let canApprove = status === 'pending_payment' || status === 'under_review';
  let canReject = canApprove;
  let canReview = status !== 'under_review' && status !== 'paid';
  let canSendEmail = status === 'paid';

  byId('btn-modal-approve').hidden = !canApprove;
  byId('btn-modal-reject').hidden = !canReject;
  byId('btn-modal-review').hidden = !canReview;

  let resendBtn = byId('btn-modal-resend');
  if (resendBtn) {
    resendBtn.hidden = !canSendEmail;
    resendBtn.textContent = reg.email_sent ? 'إعادة إرسال الإيميل' : 'إرسال إيميل التفعيل';
  }
}

function openReviewModal(regId) {
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

  setupModalActions();
  await loadRegistrations();
}

document.addEventListener('DOMContentLoaded', initAdminRegistrationsPage);