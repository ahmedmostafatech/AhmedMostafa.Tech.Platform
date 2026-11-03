// ============================================================
// admin-home-page.js
// منطق لوحة تحكم الأدمن الرئيسية
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import {
  getAdminOverview,
  approveOrder,
  rejectOrder,
  getReceiptSignedUrl
} from '../../services/admin-service.js';
import {
  escapeHtml,
  formatExactAmount,
  formatDateTime,
  setButtonLoading,
  getErrorMessage,
  qs,
  qsa
} from '../../core/utils.js';

let pendingOrdersTbody = qs('#pending-orders-tbody');
let statPending = qs('#stat-pending-orders');
let statActiveSubs = qs('#stat-active-subs');
let statStudents = qs('#stat-total-students');
let navPendingBadge = qs('#nav-pending-badge');
let refreshBtn = qs('#admin-refresh-btn');
let alertBox = qs('#admin-alert');

let receiptModal = qs('#receipt-modal');
let receiptModalBody = qs('#receipt-modal-body');
let receiptModalClose = qs('#receipt-modal-close');

function showAlert(message, type = 'info') {
  if (!alertBox) return;
  alertBox.className = `alert alert--${type}`;
  alertBox.textContent = message;
  alertBox.hidden = false;
  setTimeout(function () {
    alertBox.hidden = true;
  }, 4500);
}

// فتح نافذة الإيصال
async function openReceiptModal(proofPath) {
  if (!receiptModal) return;

  receiptModalBody.innerHTML = `
    <div style="padding:var(--space-6); color:#64748b;">
      <div class="skeleton" style="height:250px; border-radius:var(--radius-md);"></div>
      <p style="margin-top:12px;">جاري تحميل صورة الإيصال بأمان...</p>
    </div>
  `;
  receiptModal.classList.add('show');

  try {
    let signedUrl = await getReceiptSignedUrl(proofPath);
    if (signedUrl) {
      receiptModalBody.innerHTML = `
        <img src="${escapeHtml(signedUrl)}" alt="إيصال التحويل" class="receipt-modal-img">
        <div style="margin-top:var(--space-4);">
          <a href="${escapeHtml(signedUrl)}" target="_blank" rel="noopener" class="btn btn--secondary btn--sm">
            فتح الصورة بالحجم الكامل ↗
          </a>
        </div>
      `;
    } else {
      receiptModalBody.innerHTML = `
        <div style="padding:var(--space-6); color:var(--color-danger);">
          ⚠️ تعذر تحميل صورة الإيصال (الملف غير متاح أو منتهي الصلاحية).
        </div>
      `;
    }
  } catch (err) {
    receiptModalBody.innerHTML = `
      <div style="padding:var(--space-6); color:var(--color-danger);">
        ⚠️ حدث خطأ أثناء جلب الإيصال: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

// عرض جدول الطلبات المعلقة
function renderPendingTable(orders) {
  if (!pendingOrdersTbody) return;

  if (!orders || orders.length === 0) {
    pendingOrdersTbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:var(--space-8); color:#64748b;">
          🎉 لا توجد طلبات معلقة حالياً، كل الطلبات تمت معالجتها!
        </td>
      </tr>
    `;
    return;
  }

  pendingOrdersTbody.innerHTML = orders.map(function (order) {
    let student = order.profiles || {};
    let course = order.courses || {};
    let phone = student.phone || '';

    let cleanPhone = phone.replace(/^0/, '20');
    let waLink = phone ? `https://wa.me/${cleanPhone}` : null;

    let methodLabel = order.payment_method === 'vodafone_cash' ? '🔴 فودافون كاش' : '🟣 إنستاباي';

    return `
      <tr data-order-id="${escapeHtml(order.id)}">
        <td>
          <div style="font-weight:700; color:var(--color-primary);">${escapeHtml(student.full_name || 'بدون اسم')}</div>
          <div style="font-size:var(--text-xs); color:#64748b; direction:ltr; text-align:right;">${escapeHtml(student.email || '—')}</div>
        </td>
        <td>
          ${phone ? `
            <a href="${escapeHtml(waLink)}" target="_blank" rel="noopener" class="badge badge--success" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
              <span>📱</span> <span style="direction:ltr;">${escapeHtml(phone)}</span>
            </a>
          ` : '<span style="color:#94a3b8; font-size:11px;">غير مسجل</span>'}
        </td>
        <td>
          <strong style="color:var(--color-primary); font-size:var(--text-xs);">${escapeHtml(course.title || 'المادة')}</strong>
        </td>
        <td>
          <span style="font-size:var(--text-xs); font-weight:600;">${escapeHtml(methodLabel)}</span>
        </td>
        <td>
          <span style="font-weight:800; color:#0f172a; direction:ltr; display:inline-block;">
            ${formatExactAmount(order.amount)} ج.م
          </span>
        </td>
        <td>
          <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700; color:#334155; font-size:var(--text-xs); direction:ltr; display:inline-block;">
            ${escapeHtml(order.tx_reference || '—')}
          </code>
        </td>
        <td>
          ${order.proof_path ? `
            <button type="button" class="btn btn--secondary btn--sm btn-view-receipt" data-path="${escapeHtml(order.proof_path)}" style="font-size:var(--text-xs); padding:2px 8px;">
              🖼️ عرض الإيصال
            </button>
          ` : '<span style="color:#94a3b8; font-size:11px;">بدون إيصال</span>'}
        </td>
        <td>
          <span style="font-size:11px; color:#64748b;">${formatDateTime(order.created_at)}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-action-approve" data-id="${escapeHtml(order.id)}" title="قبول الطلب وتفعيل الكورس فوراً">
              قبول ✅
            </button>
            <button type="button" class="btn-action-reject" data-id="${escapeHtml(order.id)}" title="رفض الطلب">
              رفض ❌
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // ربط أزرار عرض الإيصال
  qsa('.btn-view-receipt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openReceiptModal(btn.dataset.path);
    });
  });

  // ربط أزرار القبول
  qsa('.btn-action-approve').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let orderId = btn.dataset.id;
      if (!confirm('هل أنت متأكد من قبول هذا الطلب وتفعيل الاشتراك للطالب؟')) return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        await approveOrder(orderId);
        showAlert('✅ تم قبول الطلب وتفعيل اشتراك الطالب بنجاح!', 'success');
        await loadDashboardData();
      } catch (err) {
        alert('حدث خطأ أثناء قبول الطلب: ' + getErrorMessage(err));
        btn.disabled = false;
        btn.textContent = 'قبول ✅';
      }
    });
  });

  // ربط أزرار الرفض
  qsa('.btn-action-reject').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let orderId = btn.dataset.id;
      if (!confirm('هل أنت متأكد من رفض هذا الطلب؟')) return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        await rejectOrder(orderId);
        showAlert('تم رفض الطلب بنجاح.', 'warning');
        await loadDashboardData();
      } catch (err) {
        alert('حدث خطأ أثناء رفض الطلب: ' + getErrorMessage(err));
        btn.disabled = false;
        btn.textContent = 'رفض ❌';
      }
    });
  });
}

// تحميل وتحديث بيانات لوحة التحكم
async function loadDashboardData() {
  try {
    let data = await getAdminOverview();

    statPending.textContent = data.pendingCount;
    statActiveSubs.textContent = data.activeSubsCount;
    statStudents.textContent = data.studentsCount;

    if (navPendingBadge) {
      navPendingBadge.textContent = data.pendingCount;
      navPendingBadge.style.display = data.pendingCount > 0 ? 'inline-flex' : 'none';
    }

    renderPendingTable(data.recentPendingOrders);
  } catch (err) {
    console.error('Failed to load admin overview:', err);
    showAlert('تعذر جلب بيانات الأدمن: ' + getErrorMessage(err), 'error');
  }
}

// تهيئة الصفحة
async function init() {
  let ctx = await requireAdmin();
  if (!ctx) return;

  let profile = ctx.profile;
  let adminNameEl = qs('#admin-user-name');
  if (adminNameEl && profile) {
    adminNameEl.textContent = `👑 ${profile.full_name || profile.email.split('@')[0]}`;
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      setButtonLoading(refreshBtn, true, 'جاري التحديث...');
      loadDashboardData().finally(function () {
        setButtonLoading(refreshBtn, false);
      });
    });
  }

  if (receiptModalClose) {
    receiptModalClose.addEventListener('click', function () {
      receiptModal.classList.remove('show');
    });
  }

  if (receiptModal) {
    receiptModal.addEventListener('click', function (e) {
      if (e.target === receiptModal) {
        receiptModal.classList.remove('show');
      }
    });
  }

  await loadDashboardData();
}

init();
