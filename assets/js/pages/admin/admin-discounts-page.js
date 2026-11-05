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

function renderCouponCard(coupon) {
  let isPercentage = coupon.discount_type === 'percentage';
  let valText = isPercentage ? `${coupon.discount_value}%` : `${coupon.discount_value} ج.م`;
  let typeBadge = isPercentage
    ? '<span class="badge badge--accent" style="font-size:12px; padding:4px 10px; font-weight:700;"><i class="fa-solid fa-percent" style="margin-left:4px;"></i> خصم نسبة</span>'
    : '<span class="badge badge--primary" style="font-size:12px; padding:4px 10px; font-weight:700;"><i class="fa-solid fa-coins" style="margin-left:4px;"></i> خصم نقدي</span>';

  let usesPercent = coupon.max_uses ? Math.min(100, Math.round((coupon.used_count / coupon.max_uses) * 100)) : 0;
  let usesText = coupon.max_uses
    ? `${coupon.used_count} من أصل ${coupon.max_uses}`
    : `${coupon.used_count} (غير محدود)`;

  let minAmountText = coupon.min_amount > 0 ? `${coupon.min_amount} ج.م` : 'بدون حد أدنى';

  let isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
  let expiryText = coupon.expires_at ? formatDateTime(coupon.expires_at) : 'صالح بشكل دائم';

  let statusBadge = '';
  if (isExpired) {
    statusBadge = '<span class="badge badge--danger" style="font-size:11px; padding:4px 10px;"><i class="fa-solid fa-clock-rotate-left"></i> منتهي الصلاحية</span>';
  } else if (coupon.is_active) {
    statusBadge = '<span class="badge badge--success" style="font-size:11px; padding:4px 10px;"><i class="fa-solid fa-circle-check"></i> شغال ومفعّل</span>';
  } else {
    statusBadge = '<span class="badge badge--muted" style="font-size:11px; padding:4px 10px;"><i class="fa-solid fa-pause"></i> متوقف مؤقتاً</span>';
  }

  let toggleBtnText = coupon.is_active ? 'تعطيل الكود' : 'تفعيل الكود';
  let toggleBtnClass = coupon.is_active ? 'btn--secondary' : 'btn--primary';

  return `
    <div class="coupon-modern-card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:18px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 16px rgba(15,23,42,0.04); position:relative; overflow:hidden; min-width:0;">
      <div style="position:absolute; top:0; left:0; right:0; height:4px; background:${coupon.is_active && !isExpired ? 'linear-gradient(90deg, #ec4899, #3b82f6)' : '#94a3b8'};"></div>
      
      <div style="min-width:0;">
        <!-- رأس الكارت -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:8px; flex-wrap:wrap;">
          <div style="display:inline-flex; align-items:center; gap:8px; background:#fdf2f8; border:1px dashed #f472b6; padding:6px 12px; border-radius:10px; max-width:100%; overflow:hidden;">
            <i class="fa-solid fa-tag" style="color:#ec4899; font-size:14px; flex-shrink:0;"></i>
            <span style="font-weight:900; font-family:monospace; font-size:16px; color:#be185d; letter-spacing:1px; word-break:break-all;">${escapeHtml(coupon.code)}</span>
          </div>
          <div style="flex-shrink:0;">${statusBadge}</div>
        </div>

        <!-- قيمة الخصم ونوعه -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; background:#f8fafc; padding:12px 14px; border-radius:12px; gap:8px; flex-wrap:wrap;">
          <div>
            <span style="font-size:11px; color:#64748b; display:block; margin-bottom:2px;">قيمة التوفير:</span>
            <span style="font-size:18px; font-weight:900; color:#0f172a; white-space:nowrap;">${escapeHtml(valText)}</span>
          </div>
          <div style="flex-shrink:0;">${typeBadge}</div>
        </div>

        <!-- إحصائيات الاستخدام والحدود -->
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px; font-size:12px; color:#475569;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:6px;">
              <span><i class="fa-solid fa-users" style="color:#3b82f6; width:16px;"></i> مرات الاستخدام:</span>
              <span style="font-weight:700; color:#0f172a;">${usesText}</span>
            </div>
            ${coupon.max_uses ? `
              <div style="width:100%; height:6px; background:#e2e8f0; border-radius:99px; overflow:hidden;">
                <div style="width:${usesPercent}%; height:100%; background:#3b82f6; border-radius:99px;"></div>
              </div>
            ` : ''}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <span><i class="fa-solid fa-cart-shopping" style="color:#10b981; width:16px;"></i> الحد الأدنى:</span>
            <span style="font-weight:700; color:#0f172a;">${minAmountText}</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <span><i class="fa-solid fa-calendar-days" style="color:#f59e0b; width:16px;"></i> الصلاحية:</span>
            <span style="font-weight:600; color:#64748b; font-size:11px;">${expiryText}</span>
          </div>
        </div>
      </div>

      <!-- أزرار الإجراءات -->
      <div style="display:flex; gap:8px; border-top:1px solid #f1f5f9; padding-top:14px; margin-top:6px;">
        <button type="button" class="btn ${toggleBtnClass} btn--sm btn-toggle-coupon" data-id="${escapeHtml(coupon.id)}" data-active="${coupon.is_active}" style="flex:1; border-radius:10px; font-weight:800; min-height:38px;">
          ${toggleBtnText}
        </button>
        <button type="button" class="btn btn--secondary btn--sm btn-delete-coupon" data-id="${escapeHtml(coupon.id)}" data-code="${escapeHtml(coupon.code)}" title="حذف الكود نهائياً" style="width:40px; padding:0; border-radius:10px; color:#ef4444; border-color:rgba(239,68,68,0.3); display:inline-flex; align-items:center; justify-content:center; min-height:38px; flex-shrink:0;">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

async function loadCoupons() {
  let container = byId('coupons-cards-container');
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

    if (!container) return;

    if (couponsList.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:60px 20px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:18px;">
          <i class="fa-solid fa-tags fa-2x" style="color:#94a3b8; margin-bottom:12px;"></i>
          <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0 0 6px;">لا توجد أكواد خصم حالياً</h3>
          <p style="font-size:13px; color:#64748b; margin:0;">اضغط على زر "إنشاء كود خصم جديد" بالأعلى لإضافة أول كود للطلاب</p>
        </div>
      `;
      return;
    }

    container.innerHTML = couponsList.map(renderCouponCard).join('');
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
  let container = byId('coupons-cards-container') || byId('coupons-tbody');
  if (!container) return;

  container.addEventListener('click', async function (e) {
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

