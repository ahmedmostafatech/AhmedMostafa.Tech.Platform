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
    ? '<span class="badge badge--accent" style="font-size:12px; padding:4px 10px; font-weight:700;"><i class="fa-solid fa-percent" style="margin-left:4px;"></i> نسبة</span>'
    : '<span class="badge badge--primary" style="font-size:12px; padding:4px 10px; font-weight:700;"><i class="fa-solid fa-coins" style="margin-left:4px;"></i> مبلغ ثابت</span>';

  let usesPercent = coupon.max_uses ? Math.min(100, Math.round((coupon.used_count / coupon.max_uses) * 100)) : 0;
  let usesText = coupon.max_uses
    ? `<div style="display:flex; flex-direction:column; gap:4px;">
         <span style="font-weight:800; font-size:13px;">${coupon.used_count} <span style="font-weight:400; color:#64748b;">/ ${coupon.max_uses}</span></span>
         <div style="width:70px; height:5px; background:#e2e8f0; border-radius:99px; overflow:hidden;">
           <div style="width:${usesPercent}%; height:100%; background:#3b82f6;"></div>
         </div>
       </div>`
    : `<span style="font-weight:800; color:#1e293b;">${coupon.used_count}</span> <span style="font-size:11px; color:#64748b;">(مفتوح)</span>`;

  let minAmountText = coupon.min_amount > 0 ? `<span style="font-weight:700;">${coupon.min_amount} ج.م</span>` : '<span style="color:#94a3b8;">بدون حد</span>';

  let isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
  let expiryText = coupon.expires_at ? formatDateTime(coupon.expires_at) : '<span style="color:#16a34a; font-weight:700;">دائم</span>';

  let statusBadge = '';
  if (isExpired) {
    statusBadge = '<span class="badge badge--danger" style="font-size:11px; padding:4px 8px;"><i class="fa-solid fa-clock-rotate-left"></i> منتهي</span>';
  } else if (coupon.is_active) {
    statusBadge = '<span class="badge badge--success" style="font-size:11px; padding:4px 8px;"><i class="fa-solid fa-circle-check"></i> مفعّل</span>';
  } else {
    statusBadge = '<span class="badge badge--muted" style="font-size:11px; padding:4px 8px;"><i class="fa-solid fa-pause"></i> معطّل</span>';
  }

  let toggleBtnText = coupon.is_active ? 'تعطيل الكود' : 'تفعيل الكود';
  let toggleBtnClass = coupon.is_active ? 'btn--secondary' : 'btn--primary';

  return `
    <tr style="border-bottom:1px solid #f1f5f9; transition:background .15s;">
      <td style="padding:14px 16px;">
        <div style="display:inline-flex; align-items:center; gap:6px; background:#fdf2f8; border:1px dashed #f472b6; padding:6px 12px; border-radius:8px;">
          <i class="fa-solid fa-tag" style="color:#ec4899; font-size:13px;"></i>
          <span style="font-weight:900; font-family:monospace; font-size:15px; color:#be185d; letter-spacing:0.5px;">${escapeHtml(coupon.code)}</span>
        </div>
      </td>
      <td style="padding:14px 16px;">${typeBadge}</td>
      <td style="padding:14px 16px; font-weight:900; font-size:15px; color:#0f172a;">${escapeHtml(valText)}</td>
      <td style="padding:14px 16px;">${usesText}</td>
      <td style="padding:14px 16px; font-size:13px;">${minAmountText}</td>
      <td style="padding:14px 16px; font-size:12px; color:#475569;">${expiryText}</td>
      <td style="padding:14px 16px;">${statusBadge}</td>
      <td style="padding:14px 16px; text-align:center; white-space:nowrap;">
        <div style="display:inline-flex; gap:6px;">
          <button type="button" class="btn ${toggleBtnClass} btn--sm btn-toggle-coupon" data-id="${escapeHtml(coupon.id)}" data-active="${coupon.is_active}" style="min-height:32px; padding:0 12px; font-size:12px; border-radius:8px; font-weight:700;">
            ${toggleBtnText}
          </button>
          <button type="button" class="btn btn--secondary btn--sm btn-delete-coupon" data-id="${escapeHtml(coupon.id)}" data-code="${escapeHtml(coupon.code)}" title="حذف الكود" style="min-height:32px; width:34px; padding:0; border-radius:8px; color:#ef4444; border-color:rgba(239,68,68,0.3); display:inline-flex; align-items:center; justify-content:center;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
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

