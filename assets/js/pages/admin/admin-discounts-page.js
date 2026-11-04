// ============================================================
// admin-discounts-page.js
// منطق صفحة إدارة أكواد الخصم والكوبونات (admin/discounts.html)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import {
  getAllCoupons,
  createCoupon,
  toggleCouponStatus,
  deleteCoupon
} from '../../services/admin-service.js';
import {
  formatDateTime,
  escapeHtml,
  setButtonLoading,
  initSpotlightCards
} from '../../core/utils.js';

let couponsList = [];

function byId(id) {
  return document.getElementById(id);
}

function renderCouponRow(coupon) {
  let isPercentage = coupon.discount_type === 'percentage';
  let valText = isPercentage ? `${coupon.discount_value}%` : `${coupon.discount_value} ج.م`;
  let typeBadge = isPercentage
    ? '<span class="badge badge--accent" style="font-size:11px;">نسبة مئوية</span>'
    : '<span class="badge badge--primary" style="font-size:11px;">مبلغ ثابت</span>';

  let usesText = coupon.max_uses
    ? `<span style="font-weight:700;">${coupon.used_count}</span> / ${coupon.max_uses}`
    : `<span style="font-weight:700;">${coupon.used_count}</span> (غير محدود)`;

  let minAmountText = coupon.min_amount > 0 ? `${coupon.min_amount} ج.م` : 'بدون حد';

  let isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
  let expiryText = coupon.expires_at ? formatDateTime(coupon.expires_at) : 'دائم';

  let statusBadge = '';
  if (isExpired) {
    statusBadge = '<span class="badge badge--danger" style="font-size:11px;">منتهي</span>';
  } else if (coupon.is_active) {
    statusBadge = '<span class="badge badge--success" style="font-size:11px;">مفعّل</span>';
  } else {
    statusBadge = '<span class="badge badge--muted" style="font-size:11px;">معطّل</span>';
  }

  let toggleBtnText = coupon.is_active ? 'تعطيل' : 'تفعيل';
  let toggleBtnClass = coupon.is_active ? 'btn--secondary' : 'btn--primary';

  return `
    <tr>
      <td style="font-weight:900; font-family:monospace; font-size:14px; color:#ec4899;">
        <i class="fa-solid fa-tag" style="margin-left:4px; font-size:12px;"></i>
        ${escapeHtml(coupon.code)}
      </td>
      <td>${typeBadge}</td>
      <td style="font-weight:800; color:#16a34a;">${escapeHtml(valText)}</td>
      <td>${usesText}</td>
      <td>${escapeHtml(minAmountText)}</td>
      <td style="font-size:11px; color:#64748b;">${escapeHtml(expiryText)}</td>
      <td>${statusBadge}</td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn ${toggleBtnClass} btn--sm btn-toggle-coupon" data-id="${escapeHtml(coupon.id)}" data-active="${coupon.is_active}" style="padding:4px 10px; font-size:11px; border-radius:6px; margin-left:4px;">
          ${toggleBtnText}
        </button>
        <button type="button" class="btn btn--secondary btn--sm btn-delete-coupon" data-id="${escapeHtml(coupon.id)}" data-code="${escapeHtml(coupon.code)}" style="padding:4px 10px; font-size:11px; border-radius:6px; color:#ef4444; border-color:rgba(239,68,68,0.3);">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `;
}

async function loadCoupons() {
  let tbody = byId('coupons-tbody');
  let alertEl = byId('discounts-alert');

  if (alertEl) alertEl.hidden = true;

  try {
    couponsList = await getAllCoupons();

    // تحديث بطاقات الإحصائيات
    let totalUses = couponsList.reduce((sum, c) => sum + (c.used_count || 0), 0);
    let activeCount = couponsList.filter(c => c.is_active && (!c.expires_at || new Date(c.expires_at) >= new Date())).length;

    if (byId('stat-total-coupons')) byId('stat-total-coupons').textContent = couponsList.length;
    if (byId('stat-active-coupons')) byId('stat-active-coupons').textContent = activeCount;
    if (byId('stat-total-uses')) byId('stat-total-uses').textContent = totalUses;

    if (!tbody) return;

    if (couponsList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center" style="padding:40px; color:#94a3b8;">
            لا توجد أكواد خصم حالياً. اضغط "إنشاء كود خصم جديد" لإضافة أول كود.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = couponsList.map(renderCouponRow).join('');
    initSpotlightCards();

  } catch (err) {
    console.error('Failed to load coupons:', err);
    if (alertEl) {
      alertEl.textContent = 'فشل جلب أكواد الخصم: ' + (err.message || 'خطأ غير معروف');
      alertEl.hidden = false;
    }
  }
}

function setupModalActions() {
  let modal = byId('create-coupon-modal');
  let openBtn = byId('open-create-modal-btn');
  let closeBtn = byId('modal-close-btn');
  let cancelBtn = byId('modal-cancel-btn');
  let form = byId('create-coupon-form');
  let submitBtn = byId('modal-submit-btn');

  function openModal() {
    if (modal) modal.hidden = false;
    if (byId('coupon-code-input')) byId('coupon-code-input').focus();
  }

  function closeModal() {
    if (modal) modal.hidden = true;
    if (form) form.reset();
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      let code = byId('coupon-code-input').value.trim();
      let type = byId('coupon-type-select').value;
      let val = byId('coupon-value-input').value.trim();
      let maxUses = byId('coupon-max-uses-input').value.trim();
      let minAmount = byId('coupon-min-amount-input').value.trim();
      let expires = byId('coupon-expires-input').value;

      if (!code || !val) {
        alert('من فضلك املأ البيانات المطلوبة.');
        return;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      try {
        await createCoupon({
          code: code,
          discount_type: type,
          discount_value: val,
          max_uses: maxUses ? parseInt(maxUses, 10) : null,
          min_amount: minAmount ? Number(minAmount) : 0,
          expires_at: expires ? new Date(expires).toISOString() : null
        });

        closeModal();
        await loadCoupons();
        alert('تم إنشاء كود الخصم بنجاح!');
      } catch (err) {
        alert('فشل إنشاء الكود: ' + (err.message || 'خطأ غير معروف'));
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }
}

function setupTableActions() {
  let tbody = byId('coupons-tbody');
  if (!tbody) return;

  tbody.addEventListener('click', async function (e) {
    // تبديل الحالة
    let toggleBtn = e.target.closest('.btn-toggle-coupon');
    if (toggleBtn) {
      let id = toggleBtn.getAttribute('data-id');
      let currentActive = toggleBtn.getAttribute('data-active') === 'true';
      toggleBtn.disabled = true;

      try {
        await toggleCouponStatus(id, !currentActive);
        await loadCoupons();
      } catch (err) {
        alert('فشل تحديث حالة الكود: ' + err.message);
      } finally {
        toggleBtn.disabled = false;
      }
      return;
    }

    // حذف الكود
    let deleteBtn = e.target.closest('.btn-delete-coupon');
    if (deleteBtn) {
      let id = deleteBtn.getAttribute('data-id');
      let code = deleteBtn.getAttribute('data-code');

      if (!confirm(`هل أنت متأكد من حذف كود الخصم (${code}) نهائياً؟`)) {
        return;
      }

      deleteBtn.disabled = true;
      try {
        await deleteCoupon(id);
        await loadCoupons();
        alert('تم حذف كود الخصم.');
      } catch (err) {
        alert('فشل حذف الكود: ' + err.message);
      } finally {
        deleteBtn.disabled = false;
      }
    }
  });
}

async function initAdminDiscountsPage() {
  let authContext = await requireAdmin('login.html');
  if (!authContext) return;

  let signOutBtn = byId('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  let refreshBtn = byId('refresh-coupons-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadCoupons);
  }

  setupModalActions();
  setupTableActions();
  await loadCoupons();
}

document.addEventListener('DOMContentLoaded', initAdminDiscountsPage);

