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
  logEmailAttempt
} from '../../services/admin-service.js';
import { supabase } from '../../core/supabase-client.js';
import { formatPrice, formatDateTime, escapeHtml, setButtonLoading, getErrorMessage } from '../../core/utils.js';

// -------------------------------------------------------
// قائمة الفروع الجامعية الثابتة (تظهر دائماً في الفلتر)
// -------------------------------------------------------
const UNIVERSITY_BRANCHES = [
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

let currentRegistrations = [];
let selectedReg = null;

function getStatusBadge(status) {
  switch (status) {
    case 'paid':
      return '<span class="badge badge--success">مؤكد (Paid)</span>';
    case 'under_review':
      return '<span class="badge badge--accent">قيد المراجعة</span>';
    case 'pending_payment':
      return '<span class="badge badge--warning">بانتظار التحويل</span>';
    case 'rejected':
      return '<span class="badge badge--danger">مرفوض</span>';
    case 'cancelled':
      return '<span class="badge badge--muted">ملغي</span>';
    default:
      return `<span class="badge badge--muted">${escapeHtml(status)}</span>`;
  }
}

async function loadRegistrations() {
  let searchVal = document.getElementById('filter-search').value;
  let statusVal = document.getElementById('filter-status').value;
  let courseVal = document.getElementById('filter-course').value;
  let branchVal = document.getElementById('filter-branch').value;

  let tbody = document.getElementById('registrations-tbody');
  let countLabel = document.getElementById('regs-count-label');
  let alertEl = document.getElementById('regs-alert');

  if (alertEl) alertEl.hidden = true;

  try {
    currentRegistrations = await getAllRegistrations({
      search: searchVal,
      status: statusVal,
      course_id: courseVal,
      branch: branchVal
    });

    if (countLabel) {
      countLabel.textContent = `عرض ${currentRegistrations.length} تسجيل`;
    }

    if (tbody) {
      if (currentRegistrations.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="text-center" style="padding:32px; color:#94a3b8;">
              لا توجد نتائج مطابقة لشروط البحث والفلترة.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = currentRegistrations.map(function (r) {
        let courseTitle = r.courses ? r.courses.title : 'مراجعة غير محددة';
        let methodText = r.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';
        let waLink = `https://wa.me/${r.phone.replace(/^0/, '2')}`;

        return `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px; font-weight:800; font-family:monospace; color:var(--color-primary);">${escapeHtml(r.registration_code)}</td>
            <td style="padding:10px; font-weight:700;">${escapeHtml(r.full_name)}</td>
            <td style="padding:10px; color:#64748b;">${escapeHtml(r.branch)}</td>
            <td style="padding:10px;">
              <a href="${waLink}" target="_blank" rel="noopener" style="color:#16a34a; text-decoration:none; font-family:monospace; font-weight:700;">
                ${escapeHtml(r.phone)} 💬
              </a>
            </td>
            <td style="padding:10px; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(courseTitle)}</td>
            <td style="padding:10px; font-weight:800; color:var(--color-accent);">${formatPrice(r.amount)}</td>
            <td style="padding:10px;">${escapeHtml(methodText)}</td>
            <td style="padding:10px;">${getStatusBadge(r.payment_status)}</td>
            <td style="padding:10px; font-size:11px; color:#64748b;" dir="ltr">${escapeHtml(r.email)}</td>
            <td style="padding:10px; text-align:center;">
              <button type="button" class="btn btn--secondary btn--sm btn-inspect-reg" data-id="${escapeHtml(r.id)}" style="font-size:11px; padding:4px 10px;">
                فحص / إجراء
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // ربط أزرار الفحص
      tbody.querySelectorAll('.btn-inspect-reg').forEach(function (btn) {
        btn.addEventListener('click', function () {
          let regId = btn.getAttribute('data-id');
          openReviewModal(regId);
        });
      });
    }

  } catch (err) {
    console.error('Failed to load registrations:', err);
    if (alertEl) {
      alertEl.textContent = 'حدث خطأ أثناء جلب التسجيلات: ' + getErrorMessage(err);
      alertEl.hidden = false;
    }
  }
}

function openReviewModal(regId) {
  selectedReg = currentRegistrations.find(function (r) { return r.id === regId; });
  if (!selectedReg) return;

  let modal = document.getElementById('review-modal');
  let codeEl = document.getElementById('modal-reg-code');
  let detailsEl = document.getElementById('modal-reg-details');
  let noteInput = document.getElementById('modal-admin-note');
  let rejectBox = document.getElementById('reject-reason-box');
  let rejectInput = document.getElementById('modal-reject-reason');

  if (codeEl) codeEl.textContent = selectedReg.registration_code;
  if (noteInput) noteInput.value = selectedReg.admin_note || '';
  if (rejectBox) rejectBox.hidden = true;
  if (rejectInput) rejectInput.value = selectedReg.rejection_reason || '';

  let courseTitle = selectedReg.courses ? selectedReg.courses.title : 'غير محدد';
  let methodText = selectedReg.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';

  if (detailsEl) {
    detailsEl.innerHTML = `
      <div><strong>اسم الطالب:</strong> ${escapeHtml(selectedReg.full_name)}</div>
      <div><strong>الفرع:</strong> ${escapeHtml(selectedReg.branch)}</div>
      <div><strong>رقم الموبايل:</strong> <a href="https://wa.me/${selectedReg.phone.replace(/^0/, '2')}" target="_blank" style="color:#16a34a; font-weight:700;">${escapeHtml(selectedReg.phone)} (فتح واتساب)</a></div>
      <div><strong>البريد الإلكتروني:</strong> <span dir="ltr">${escapeHtml(selectedReg.email)}</span></div>
      <div><strong>المادة:</strong> ${escapeHtml(courseTitle)}</div>
      <div><strong>المبلغ:</strong> <span style="font-weight:800; color:var(--color-accent);">${formatPrice(selectedReg.amount)}</span></div>
      <div><strong>وسيلة الدفع:</strong> ${escapeHtml(methodText)}</div>
      <div><strong>الحالة الحالية:</strong> ${getStatusBadge(selectedReg.payment_status)}</div>
      <div><strong>تاريخ التسجيل:</strong> ${formatDateTime(selectedReg.created_at)}</div>
      ${selectedReg.rejection_reason ? `<div style="color:var(--color-danger);"><strong>سبب الرفض السابق:</strong> ${escapeHtml(selectedReg.rejection_reason)}</div>` : ''}
    `;
  }

  if (modal) modal.hidden = false;
}

function closeReviewModal() {
  let modal = document.getElementById('review-modal');
  if (modal) modal.hidden = true;
  selectedReg = null;
}

async function setupModalActions() {
  let closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeReviewModal);

  let approveBtn = document.getElementById('btn-modal-approve');
  let rejectBtn = document.getElementById('btn-modal-reject');
  let reviewBtn = document.getElementById('btn-modal-review');

  // زر القبول
  if (approveBtn) {
    approveBtn.addEventListener('click', async function () {
      if (!selectedReg) return;
      let note = document.getElementById('modal-admin-note').value.trim();

      if (!confirm(`هل أنت متأكد من استلام تحويل مبلغ ${selectedReg.amount} EGP وتأكيد اشتراك الطالب (${selectedReg.full_name})؟`)) {
        return;
      }

      setButtonLoading(approveBtn, true, 'جاري التأكيد...');

      try {
        let res = await approveRegistration(selectedReg.id, note || null);

        // محاولة إرسال إيميل التفعيل التلقائي وتسجيل الحالة
        try {
          await supabase.functions.invoke('send-activation-email', {
            body: res
          });
          await logEmailAttempt(res.registration_id, 'sent');
        } catch (eMailErr) {
          console.warn('Activation email invocation error:', eMailErr);
          await logEmailAttempt(res.registration_id, 'failed', eMailErr ? eMailErr.message : 'Unknown');
        }

        alert(`✅ تم تأكيد اشتراك الطالب (${res.student_name}) بنجاح!`);
        closeReviewModal();
        await loadRegistrations();
      } catch (err) {
        alert('حدث خطأ أثناء القبول: ' + getErrorMessage(err));
      } finally {
        setButtonLoading(approveBtn, false);
      }
    });
  }

  // زر قيد الفحص
  if (reviewBtn) {
    reviewBtn.addEventListener('click', async function () {
      if (!selectedReg) return;
      let note = document.getElementById('modal-admin-note').value.trim();

      setButtonLoading(reviewBtn, true, 'جاري الحفظ...');
      try {
        await updateRegistrationStatus(selectedReg.id, 'under_review', note || null);
        closeReviewModal();
        await loadRegistrations();
      } catch (err) {
        alert('حدث خطأ: ' + getErrorMessage(err));
      } finally {
        setButtonLoading(reviewBtn, false);
      }
    });
  }

  // زر الرفض
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async function () {
      if (!selectedReg) return;
      let rejectBox = document.getElementById('reject-reason-box');
      let reasonInput = document.getElementById('modal-reject-reason');
      let note = document.getElementById('modal-admin-note').value.trim();

      if (rejectBox && rejectBox.hidden) {
        rejectBox.hidden = false;
        if (reasonInput) reasonInput.focus();
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
        await rejectRegistration(selectedReg.id, reason, note || null);
        closeReviewModal();
        await loadRegistrations();
      } catch (err) {
        alert('حدث خطأ أثناء الرفض: ' + getErrorMessage(err));
      } finally {
        setButtonLoading(rejectBtn, false);
      }
    });
  }
}

async function initAdminRegistrationsPage() {
  let authContext = await requireAdmin('login.html');
  if (!authContext) return;

  // خروج
  let signOutBtn = document.getElementById('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // تعبئة فلتر المراجعات
  try {
    let revisions = await getAllRevisions();
    let courseSelect = document.getElementById('filter-course');
    if (courseSelect) {
      revisions.forEach(function (rev) {
        let opt = document.createElement('option');
        opt.value = rev.id;
        opt.textContent = rev.title;
        courseSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('Failed to populate course filter', e);
  }

  // تعبئة فلتر الفروع بالقائمة الثابتة الكاملة
  let branchSelect = document.getElementById('filter-branch');
  if (branchSelect) {
    UNIVERSITY_BRANCHES.forEach(function (branch) {
      let opt = document.createElement('option');
      opt.value = branch;
      opt.textContent = branch;
      branchSelect.appendChild(opt);
    });
  }

  // ربط أحداث الفلاتر
  ['filter-status', 'filter-course', 'filter-branch'].forEach(function (id) {
    let el = document.getElementById(id);
    if (el) el.addEventListener('change', loadRegistrations);
  });

  let searchInput = document.getElementById('filter-search');
  if (searchInput) {
    let debounceTimer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadRegistrations, 300);
    });
  }

  let resetBtn = document.getElementById('reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      document.getElementById('filter-search').value = '';
      document.getElementById('filter-status').value = 'all';
      document.getElementById('filter-course').value = 'all';
      document.getElementById('filter-branch').value = 'all';
      loadRegistrations();
    });
  }

  let refreshBtn = document.getElementById('refresh-regs-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadRegistrations);

  await setupModalActions();
  await loadRegistrations();
}

document.addEventListener('DOMContentLoaded', initAdminRegistrationsPage);
