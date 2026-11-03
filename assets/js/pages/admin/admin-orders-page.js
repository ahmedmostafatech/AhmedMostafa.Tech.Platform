// ============================================================
// admin-orders-page.js
// منطق صفحة إدارة وبحث الطلبات
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import {
  getAllOrders,
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

let ordersTbody = qs('#all-orders-tbody');
let filterBtns = qsa('.filter-btn');
let searchInput = qs('#search-orders-input');
let refreshBtn = qs('#refresh-orders-btn');
let alertBox = qs('#orders-alert');

let receiptModal = qs('#receipt-modal');
let receiptModalBody = qs('#receipt-modal-body');
let receiptModalClose = qs('#receipt-modal-close');

let allLoadedOrders = [];
let activeFilter = 'all';

function showAlert(message, type = 'info') {
  if (!alertBox) return;
  alertBox.className = `alert alert--${type}`;
  alertBox.textContent = message;
  alertBox.hidden = false;
  setTimeout(function () {
    alertBox.hidden = true;
  }, 4000);
}

let STATUS_BADGES = {
  pending: '<span class="badge badge--warning">⏳ في الانتظار</span>',
  paid: '<span class="badge badge--success">✅ مقبول ومفعل</span>',
  approved: '<span class="badge badge--success">✅ مقبول ومفعل</span>',
  rejected: '<span class="badge badge--danger">❌ مرفوض</span>',
  expired: '<span class="badge" style="background:#e2e8f0; color:#64748b;">⌛ منتهي</span>'
};

async function openReceiptModal(proofPath) {
  if (!receiptModal) return;
  receiptModalBody.innerHTML = `
    <div style="padding:var(--space-6); color:#64748b;">
      <div class="skeleton" style="height:250px; border-radius:var(--radius-md);"></div>
      <p style="margin-top:12px;">جاري تحميل صورة الإيصال...</p>
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
          ⚠️ تعذر تحميل صورة الإيصال.
        </div>
      `;
    }
  } catch (err) {
    receiptModalBody.innerHTML = `
      <div style="padding:var(--space-6); color:var(--color-danger);">
        ⚠️ خطأ: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

function renderOrdersTable(orders) {
  if (!ordersTbody) return;

  if (!orders || orders.length === 0) {
    ordersTbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:var(--space-8); color:#64748b;">
          لا توجد طلبات مطابقة للبحث أو الفلتر المحدد.
        </td>
      </tr>
    `;
    return;
  }

  ordersTbody.innerHTML = orders.map(function (order) {
    let student = order.profiles || {};
    let course = order.courses || {};
    let phone = student.phone || '';

    let cleanPhone = phone.replace(/^0/, '20');
    let waLink = phone ? `https://wa.me/${cleanPhone}` : null;
    let methodLabel = order.payment_method === 'vodafone_cash' ? '🔴 فودافون كاش' : '🟣 إنستاباي';
    let statusBadge = STATUS_BADGES[order.status] || order.status;

    let hasRef = !!(order.tx_reference && String(order.tx_reference).trim());
    let canApprove = order.status === 'pending' && hasRef;
    let canReject = order.status === 'pending';

    let actionHtml = '';
    if (canApprove) {
      actionHtml = `
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn-action-approve" data-id="${escapeHtml(order.id)}">قبول ✅</button>
          <button type="button" class="btn-action-reject" data-id="${escapeHtml(order.id)}">رفض ❌</button>
        </div>
      `;
    } else if (canReject && !hasRef) {
      actionHtml = `
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="badge" style="background:#f1f5f9; color:#94a3b8; font-size:10px;">لم يُرسل التحويل</span>
          <button type="button" class="btn-action-reject" data-id="${escapeHtml(order.id)}" style="font-size:11px; padding:2px 6px;">إلغاء ✕</button>
        </div>
      `;
    } else {
      actionHtml = '<span style="color:#94a3b8; font-size:11px;">مكتمل</span>';
    }

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
              🖼️ عرض
            </button>
          ` : '<span style="color:#94a3b8; font-size:11px;">بدون</span>'}
        </td>
        <td>${statusBadge}</td>
        <td>
          <span style="font-size:11px; color:#64748b;">${formatDateTime(order.created_at)}</span>
        </td>
        <td>${actionHtml}</td>
      </tr>
    `;
  }).join('');

  qsa('.btn-view-receipt').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openReceiptModal(btn.dataset.path);
    });
  });

  qsa('.btn-action-approve').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let orderId = btn.dataset.id;
      if (!confirm('هل تأكدت من وصول المبلغ في محفظتك وتريد قبول هذا الطلب وتفعيل الكورس للطالب؟')) return;

      btn.disabled = true;
      btn.textContent = '...';
      try {
        await approveOrder(orderId);
        showAlert('✅ تم قبول الطلب وتفعيل الكورس بنجاح!', 'success');
        await loadOrders();
      } catch (err) {
        alert('خطأ: ' + getErrorMessage(err));
        btn.disabled = false;
        btn.textContent = 'قبول ✅';
      }
    });
  });

  qsa('.btn-action-reject').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let orderId = btn.dataset.id;
      let reason = prompt('هل تريد إضافة سبب للرفض (اختياري)؟', '');
      if (reason === null) return; // الضغط على إلغاء

      btn.disabled = true;
      btn.textContent = '...';
      try {
        await rejectOrder(orderId, reason);
        showAlert('تم رفض الطلب.', 'warning');
        await loadOrders();
      } catch (err) {
        alert('خطأ: ' + getErrorMessage(err));
        btn.disabled = false;
        btn.textContent = 'رفض ❌';
      }
    });
  });
}

function applyFilters() {
  let query = (searchInput.value || '').trim().toLowerCase();

  let filtered = allLoadedOrders.filter(function (order) {
    // 1. فلتر الحالة
    if (activeFilter !== 'all') {
      let matchStatus = activeFilter === 'approved' ? 'paid' : activeFilter;
      if (order.status !== matchStatus) {
        return false;
      }
    }

    // 2. البحث بالنص
    if (query) {
      let student = order.profiles || {};
      let name = (student.full_name || '').toLowerCase();
      let email = (student.email || '').toLowerCase();
      let phone = (student.phone || '').toLowerCase();
      let ref = (order.tx_reference || '').toLowerCase();

      let match = name.includes(query) || email.includes(query) || phone.includes(query) || ref.includes(query);
      if (!match) return false;
    }

    return true;
  });

  renderOrdersTable(filtered);
}

async function loadOrders() {
  try {
    allLoadedOrders = await getAllOrders('all');
    applyFilters();
  } catch (err) {
    console.error('Failed to load orders:', err);
    showAlert('تعذر تحميل الطلبات: ' + getErrorMessage(err), 'error');
  }
}

async function init() {
  let ctx = await requireAdmin();
  if (!ctx) return;

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilters();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      setButtonLoading(refreshBtn, true, '...');
      loadOrders().finally(function () {
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

  await loadOrders();
}

init();
