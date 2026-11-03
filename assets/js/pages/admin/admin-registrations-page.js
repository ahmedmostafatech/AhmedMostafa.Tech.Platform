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
import { formatPrice, formatDateTime, escapeHtml, setButtonLoading, getErrorMessage, initSpotlightCards } from '../../core/utils.js';

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
      return `<span class="badge badge--muted" style="font-size:11px;">${escapeHtml(status)}</span>`;
  }
}

async function loadRegistrations() {
  const searchVal = document.getElementById('filter-search').value;
  const statusVal = document.getElementById('filter-status').value;
  const courseVal = document.getElementById('filter-course').value;
  const branchVal = document.getElementById('filter-branch').value;

  const tbody = document.getElementById('registrations-tbody');
  const countLabel = document.getElementById('regs-count-label');
  const alertEl = document.getElementById('regs-alert');

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
            <td colspan="10" class="text-center" style="padding:32px; color:rgba(255,255,255,0.4);">
              لا توجد نتائج مطابقة لشروط البحث والفلترة.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = currentRegistrations.map(r => {
        const courseTitle = r.courses ? r.courses.title : 'مراجعة غير محددة';
        const isInsta = r.payment_method === 'instapay';
        const methodBadge = isInsta
          ? '<span style="color:#c084fc; font-weight:700;"><i class="fa-solid fa-bolt"></i> إنستاباي</span>'
          : '<span style="color:#f87171; font-weight:700;"><i class="fa-solid fa-wallet"></i> فودافون كاش</span>';

        const cleanPhone = (r.phone || '').trim().replace(/^0/, '20');
        const waLink = `https://wa.me/${cleanPhone}`;

        return `
          <tr>
            <td style="font-weight:800; font-family:monospace; color:#ffd154;">${escapeHtml(r.registration_code)}</td>
            <td style="font-weight:700;">${escapeHtml(r.full_name)}</td>
            <td style="color:rgba(255,255,255,0.6);">${escapeHtml(r.branch)}</td>
            <td>
              <a href="${waLink}" target="_blank" rel="noopener" style="color:#22c55e; text-decoration:none; font-family:monospace; font-weight:700; display:inline-flex; align-items:center; gap:4px;">
                <i class="fa-brands fa-whatsapp"></i>
                <span>${escapeHtml(r.phone)}</span>
              </a>
            </td>
            <td style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(courseTitle)}</td>
            <td style="font-weight:800; color:#4ade80;">${formatPrice(r.amount)}</td>
            <td>${methodBadge}</td>
            <td>${getStatusBadge(r.payment_status)}</td>
            <td style="font-size:11px; color:rgba(255,255,255,0.5);" dir="ltr">${escapeHtml(r.email)}</td>
            <td style="text-align:center;">
              <button type="button" class="btn btn--secondary btn--sm btn-inspect-reg" data-id="${escapeHtml(r.id)}" style="font-size:11px; padding:4px 10px; border-radius:8px;">
                <i class="fa-solid fa-magnifying-glass"></i> فحص / إجراء
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // ربط أزرار الفحص
      tbody.querySelectorAll('.btn-inspect-reg').forEach(btn => {
        btn.addEventListener('click', function () {
          const regId = btn.getAttribute('data-id');
          openReviewModal(regId);
        });
      });
    }

    initSpotlightCards();

  } catch (err) {
    console.error('Failed to load registrations:', err);
    if (alertEl) {
      alertEl.textContent = 'حدث خطأ أثناء جلب التسجيلات: ' + getErrorMessage(err);
      alertEl.hidden = false;
    }
  }
}

function openReviewModal(regId) {
  selectedReg = currentRegistrations.find(r => r.id === regId);
  if (!selectedReg) return;

  const modal = document.getElementById('review-modal');
  const codeEl = document.getElementById('modal-reg-code');
  const detailsEl = document.getElementById('modal-reg-details');
  const noteInput = document.getElementById('modal-admin-note');
  const rejectBox = document.getElementById('reject-reason-box');
  const rejectInput = document.getElementById('modal-reject-reason');

  if (codeEl) codeEl.textContent = selectedReg.registration_code;
  if (noteInput) noteInput.value = selectedReg.admin_note || '';
  if (rejectBox) rejectBox.hidden = true;
  if (rejectInput) rejectInput.value = selectedReg.rejection_reason || '';

  const courseTitle = selectedReg.courses ? selectedReg.courses.title : 'غير محدد';
  const methodText = selectedReg.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';
  const cleanPhone = (selectedReg.phone || '').trim().replace(/^0/, '20');
  const waLink = `https://wa.me/${cleanPhone}`;

  if (detailsEl) {
    detailsEl.innerHTML = `
      <div><strong>اسم الطالب:</strong> ${escapeHtml(selectedReg.full_name)}</div>
      <div><strong>الفرع الجامعي:</strong> ${escapeHtml(selectedReg.branch)}</div>
      <div><strong>رقم الموبايل:</strong> <a href="${waLink}" target="_blank" style="color:#22c55e; font-weight:700; text-decoration:none;"><i class="fa-brands fa-whatsapp"></i> ${escapeHtml(selectedReg.phone)} (فتح واتساب)</a></div>
      <div><strong>البريد الإلكتروني:</strong> <span dir="ltr">${escapeHtml(selectedReg.email)}</span></div>
      <div><strong>المادة / المراجعة:</strong> ${escapeHtml(courseTitle)}</div>
      <div><strong>المبلغ المطلوب:</strong> <span style="font-weight:800; color:#4ade80;">${formatPrice(selectedReg.amount)}</span></div>
      <div><strong>وسيلة الدفع المحددة:</strong> ${escapeHtml(methodText)}</div>
      <div><strong>الحالة الحالية:</strong> ${getStatusBadge(selectedReg.payment_status)}</div>
      <div><strong>تاريخ ووقت التسجيل:</strong> ${formatDateTime(selectedReg.created_at)}</div>
      ${selectedReg.rejection_reason ? `<div style="color:#ef4444;"><strong>سبب الرفض السابق:</strong> ${escapeHtml(selectedReg.rejection_reason)}</div>` : ''}
    `;
  }

  if (modal) modal.hidden = false;
  initSpotlightCards();
}

function closeReviewModal() {
  const modal = document.getElementById('review-modal');
  if (modal) modal.hidden = true;
  selectedReg = null;
}

async function setupModalActions() {
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeReviewModal);

  const approveBtn = document.getElementById('btn-modal-approve');
  const rejectBtn = document.getElementById('btn-modal-reject');
  const reviewBtn = document.getElementById('btn-modal-review');

  // زر القبول
  if (approveBtn) {
    approveBtn.addEventListener('click', async function () {
      if (!selectedReg) return;
      const note = document.getElementById('modal-admin-note').value.trim();

      if (!confirm(`هل أنت متأكد من استلام تحويل مبلغ ${selectedReg.amount} EGP وتأكيد اشتراك الطالب (${selectedReg.full_name})؟`)) {
        return;
      }

      setButtonLoading(approveBtn, true, 'جاري التأكيد...');

      try {
        const res = await approveRegistration(selectedReg.id, note || null);

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

        alert(`تم تأكيد اشتراك الطالب (${res.student_name}) بنجاح!`);
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
      const note = document.getElementById('modal-admin-note').value.trim();

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
      const rejectBox = document.getElementById('reject-reason-box');
      const reasonInput = document.getElementById('modal-reject-reason');
      const note = document.getElementById('modal-admin-note').value.trim();

      if (rejectBox && rejectBox.hidden) {
        rejectBox.hidden = false;
        if (reasonInput) reasonInput.focus();
        return;
      }

      const reason = reasonInput ? reasonInput.value.trim() : '';
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
  const authContext = await requireAdmin('login.html');
  if (!authContext) return;

  // خروج
  const signOutBtn = document.getElementById('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // تعبئة فلتر المراجعات
  try {
    const revisions = await getAllRevisions();
    const courseSelect = document.getElementById('filter-course');
    if (courseSelect) {
      revisions.forEach(rev => {
        const opt = document.createElement('option');
        opt.value = rev.id;
        opt.textContent = rev.title;
        courseSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('Failed to populate course filter', e);
  }

  // تعبئة فلتر الفروع بالقائمة الثابتة الكاملة
  const branchSelect = document.getElementById('filter-branch');
  if (branchSelect) {
    UNIVERSITY_BRANCHES.forEach(branch => {
      const opt = document.createElement('option');
      opt.value = branch;
      opt.textContent = branch;
      branchSelect.appendChild(opt);
    });
  }

  // ربط أحداث الفلاتر
  ['filter-status', 'filter-course', 'filter-branch'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', loadRegistrations);
  });

  const searchInput = document.getElementById('filter-search');
  if (searchInput) {
    let debounceTimer = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(loadRegistrations, 300);
    });
  }

  const resetBtn = document.getElementById('reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      document.getElementById('filter-search').value = '';
      document.getElementById('filter-status').value = 'all';
      document.getElementById('filter-course').value = 'all';
      document.getElementById('filter-branch').value = 'all';
      loadRegistrations();
    });
  }

  const refreshBtn = document.getElementById('refresh-regs-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadRegistrations);

  await setupModalActions();
  await loadRegistrations();
}

document.addEventListener('DOMContentLoaded', initAdminRegistrationsPage);
