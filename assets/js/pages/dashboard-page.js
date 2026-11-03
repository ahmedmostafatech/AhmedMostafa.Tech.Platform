// ============================================================
// dashboard-page.js
// منطق لوحة تحكم الطالب
// ============================================================

import { requireAuth } from '../core/guard.js';
import { getMyProfile, signOut, updateMyProfile } from '../core/auth.js';
import { getMySubscriptions, getMyOrders } from '../services/subscriptions-service.js';
import { initNavbar } from '../components/navbar.js';
import {
  escapeHtml,
  formatDate,
  formatDateTime,
  formatPrice,
  daysLeft,
  sitePath,
  qs,
  setButtonLoading,
  getErrorMessage,
  validateEgyptianPhone
} from '../core/utils.js';
import { ROUTES } from '../core/config.js';

// ============================================================
// أيقونات وتسميات الحالة
// ============================================================

let STATUS_MAP = {
  pending: { label: 'في الانتظار', icon: '⏳', cls: 'badge--warning' },
  paid: { label: 'تم القبول والتفعيل', icon: '✅', cls: 'badge--success' },
  approved: { label: 'تم القبول والتفعيل', icon: '✅', cls: 'badge--success' },
  rejected: { label: 'مرفوض', icon: '❌', cls: 'badge--danger' },
  expired: { label: 'انتهت صلاحيته', icon: '⌛', cls: 'badge--muted' }
};

let currentActiveProfile = null;
let currentActiveSession = null;

// ============================================================
// 1. Header الترحيب
// ============================================================

function renderWelcome(profile, session) {
  let el = document.getElementById('dash-welcome');
  if (!el) return;

  let name = '';
  if (profile && profile.full_name) {
    name = profile.full_name.split(' ')[0];
  } else if (session && session.user && session.user.email) {
    name = session.user.email.split('@')[0];
  }

  let hour = new Date().getHours();
  let greeting = hour < 12 ? 'صباح الخير' : hour < 18 ? 'مساء الخير' : 'مساء النور';

  el.innerHTML = `
    <div class="dash-welcome">
      <div class="dash-welcome__text">
        <p class="dash-welcome__greeting">${escapeHtml(greeting)} 👋</p>
        <h1 class="dash-welcome__name">${escapeHtml(name || 'طالب')}</h1>
        <p class="dash-welcome__sub">
          تقدر تشوف اشتراكاتك وتتابع طلباتك من هنا.
        </p>
      </div>
      <div class="dash-welcome__avatar">
        ${escapeHtml((name || '؟').charAt(0).toUpperCase())}
      </div>
    </div>
  `;
}

// ============================================================
// 2. بطاقات الاشتراكات
// ============================================================

function renderSubscriptions(subs) {
  let el = document.getElementById('dash-subs');
  if (!el) return;

  if (!subs || subs.length === 0) {
    el.innerHTML = `
      <div class="dash-empty">
        <div class="dash-empty__icon">📚</div>
        <h3 class="dash-empty__title">مش مشترك لحد دلوقتي</h3>
        <p class="dash-empty__desc">اشترك في مادة وابدأ مذاكرتك!</p>
        <a href="${escapeHtml(sitePath(ROUTES.COURSE))}" class="btn btn--accent">
          شوف المواد المتاحة →
        </a>
      </div>
    `;
    return;
  }

  el.innerHTML = subs.map(function (sub) {
    let course = sub.courses || {};
    let daysLeft_ = daysLeft(sub.ends_at);
    let isActive = daysLeft_ > 0 && sub.status !== 'suspended';
    let endDate = formatDate(sub.ends_at);
    let startDate = formatDate(sub.starts_at);

    let urgencyClass = '';
    let urgencyMsg = '';
    if (isActive && daysLeft_ <= 7) {
      urgencyClass = 'dash-sub-card--urgent';
      urgencyMsg = `<div class="dash-sub-card__urgent">⚠️ باقي ${daysLeft_} يوم بس!</div>`;
    }

    let watchUrl = `${sitePath(ROUTES.WATCH)}?course_id=${encodeURIComponent(course.id || '')}`;

    return `
      <div class="dash-sub-card ${urgencyClass}">
        <div class="dash-sub-card__header">
          <div class="dash-sub-card__course-info">
            <span class="dash-sub-card__tag ${isActive ? 'badge--success' : 'badge--muted'}">
              ${isActive ? '🟢 نشط' : '🔴 منتهي'}
            </span>
            <h3 class="dash-sub-card__title">${escapeHtml(course.title || 'مادة غير معروفة')}</h3>
          </div>
          ${isActive ? `
            <a href="${escapeHtml(watchUrl)}"
               class="btn btn--accent btn--sm" id="watch-btn-${escapeHtml(sub.id)}">
              ▶ شاهد دلوقتي
            </a>
          ` : ''}
        </div>

        <div class="dash-sub-card__meta">
          <div class="dash-sub-meta-item">
            <span class="dash-sub-meta-item__label">بدأ في</span>
            <span class="dash-sub-meta-item__value">${escapeHtml(startDate)}</span>
          </div>
          <div class="dash-sub-meta-item">
            <span class="dash-sub-meta-item__label">ينتهي في</span>
            <span class="dash-sub-meta-item__value">${escapeHtml(endDate)}</span>
          </div>
          <div class="dash-sub-meta-item">
            <span class="dash-sub-meta-item__label">المتبقي</span>
            <span class="dash-sub-meta-item__value ${isActive ? 'text--success' : 'text--muted'}">
              ${isActive ? daysLeft_ + ' يوم' : 'انتهى'}
            </span>
          </div>
        </div>

        ${urgencyMsg}

        ${isActive ? `
          <div class="dash-sub-card__progress">
            <div class="dash-sub-card__progress-bar" style="width: ${Math.min(100, Math.round((daysLeft_ / 90) * 100))}%"></div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ============================================================
// 3. جدول الطلبات
// ============================================================

function renderOrders(orders) {
  let el = document.getElementById('dash-orders');
  if (!el) return;

  // نعرض الطلبات المعلقة أو المرفوضة (المقبولة paid تظهر كاشتراك نشط)
  let pendingOrders = (orders || []).filter(function (o) {
    return o.status === 'pending' || o.status === 'rejected';
  });

  if (pendingOrders.length === 0) {
    el.innerHTML = `
      <p style="color:var(--color-text-muted); font-size:var(--text-sm); text-align:center; padding:var(--space-5) 0;">
        مفيش طلبات معلقة حالياً 🎉
      </p>
    `;
    return;
  }

  el.innerHTML = `
    <div class="dash-orders-table">
      ${pendingOrders.map(function (order) {
    let st = STATUS_MAP[order.status] || STATUS_MAP.pending;
    let course = order.courses || {};
    let isPending = order.status === 'pending';
    let isExpired = isPending && order.expires_at && new Date(order.expires_at) < new Date();

    let checkoutUrl = `${sitePath(ROUTES.CHECKOUT)}?course_id=${encodeURIComponent(course.id || '')}`;

    let actionButtonHtml = '';
    if (isPending && !isExpired) {
      if (!order.tx_reference) {
        actionButtonHtml = `
              <div class="dash-order-row__action">
                <a href="${escapeHtml(checkoutUrl)}" class="btn btn--secondary btn--sm">
                  📤 أكمل الدفع
                </a>
              </div>
            `;
      } else {
        actionButtonHtml = `
              <div class="dash-order-row__action">
                <a href="${escapeHtml(checkoutUrl)}" class="btn btn--ghost btn--sm">
                  تفاصيل التحويل 👁️
                </a>
              </div>
            `;
      }
    }

    return `
          <div class="dash-order-row">
            <div class="dash-order-row__info">
              <span class="dash-order-row__course">${escapeHtml(course.title || 'طلب مراجعة')}</span>
              <span class="dash-order-row__date">${escapeHtml(formatDateTime(order.created_at))}</span>
            </div>
            <div class="dash-order-row__meta">
              <span class="dash-order-row__amount num">${escapeHtml(formatPrice(order.amount))}</span>
              <span class="badge ${isExpired ? 'badge--warning' : st.cls}">
                ${isExpired ? '⌛ انتهى الوقت' : st.icon + ' ' + st.label}
              </span>
            </div>
            ${actionButtonHtml}
          </div>
        `;
  }).join('')}
    </div>
  `;
}

// ============================================================
// 4. بطاقة معلومات الحساب
// ============================================================

function renderAccountCard(profile, session) {
  let el = document.getElementById('dash-account');
  if (!el) return;

  let email = (profile && profile.email) || (session && session.user && session.user.email) || '—';
  let phone = profile && profile.phone ? profile.phone : '';
  let joinDate = profile && profile.created_at ? formatDate(profile.created_at) : '—';

  el.innerHTML = `
    <div class="dash-account-card">
      <div class="dash-account-card__avatar">
        ${escapeHtml(((profile && profile.full_name) || email).charAt(0).toUpperCase())}
      </div>
      <div class="dash-account-card__info" style="flex:1;">
        <div class="dash-account-card__name">${escapeHtml((profile && profile.full_name) || email.split('@')[0])}</div>
        <div class="dash-account-card__email" style="direction:ltr; text-align:right;">${escapeHtml(email)}</div>
        <div style="margin-top:6px; font-size:var(--text-xs);">
          ${phone ? `
            <span style="display:inline-flex; align-items:center; gap:4px; color:var(--color-text-body); font-weight:600;">
              <span>📱</span> <span style="direction:ltr;">${escapeHtml(phone)}</span>
            </span>
          ` : `
            <button type="button" id="dash-add-phone-btn" class="badge badge--warning" style="cursor:pointer; border:none; padding:4px 8px;">
              ⚠️ أضف رقم الموبايل لتفعيل الكورس
            </button>
          `}
        </div>
        <div class="dash-account-card__joined" style="margin-top:4px;">انضم في ${escapeHtml(joinDate)}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <button type="button" id="dash-edit-profile-btn" class="btn btn--secondary btn--sm" style="font-size:var(--text-xs); padding:0 var(--space-3);">
          ✏️ تعديل
        </button>
        <button type="button" id="dash-signout-btn" class="btn btn--secondary btn--sm" style="font-size:var(--text-xs); color:var(--color-danger); border-color:rgba(220,38,38,0.2);">
          خروج
        </button>
      </div>
    </div>
  `;

  let editBtn = document.getElementById('dash-edit-profile-btn');
  if (editBtn) {
    editBtn.addEventListener('click', function () {
      openProfileModal(profile, session, false);
    });
  }

  let addPhoneBtn = document.getElementById('dash-add-phone-btn');
  if (addPhoneBtn) {
    addPhoneBtn.addEventListener('click', function () {
      openProfileModal(profile, session, true);
    });
  }

  let signOutBtn = document.getElementById('dash-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      signOutBtn.disabled = true;
      signOutBtn.textContent = '...';
      await signOut();
    });
  }
}

// ============================================================
// 5. إدارة نافذة تعديل / إكمال الملف الشخصي
// ============================================================

function openProfileModal(profile, session, isFirstTimePrompt) {
  let modal = document.getElementById('profile-modal');
  let nameInput = document.getElementById('profile-name');
  let phoneInput = document.getElementById('profile-phone');
  let emailInput = document.getElementById('profile-email-readonly');
  let banner = document.getElementById('profile-modal-banner');
  let errorEl = document.getElementById('profile-modal-error');
  let successEl = document.getElementById('profile-modal-success');

  if (!modal) return;

  if (errorEl) errorEl.hidden = true;
  if (successEl) successEl.hidden = true;

  let currentName = (profile && profile.full_name) || (session && session.user && session.user.email ? session.user.email.split('@')[0] : '');
  let currentEmail = (profile && profile.email) || (session && session.user && session.user.email) || '';
  let currentPhone = (profile && profile.phone) || '';

  if (nameInput) nameInput.value = currentName;
  if (phoneInput) phoneInput.value = currentPhone;
  if (emailInput) emailInput.value = currentEmail;

  if (banner) {
    banner.hidden = !isFirstTimePrompt;
  }

  modal.classList.add('show');
}

function closeProfileModal() {
  let modal = document.getElementById('profile-modal');
  if (modal) modal.classList.remove('show');
}

function setupProfileModalEvents() {
  let modal = document.getElementById('profile-modal');
  let closeBtn = document.getElementById('profile-modal-close');
  let form = document.getElementById('profile-form');
  let submitBtn = document.getElementById('profile-submit-btn');
  let errorEl = document.getElementById('profile-modal-error');
  let successEl = document.getElementById('profile-modal-success');
  let phoneInput = document.getElementById('profile-phone');
  let nameInput = document.getElementById('profile-name');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeProfileModal);
  }

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        closeProfileModal();
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (errorEl) errorEl.hidden = true;
      if (successEl) successEl.hidden = true;

      let nameVal = nameInput ? nameInput.value.trim() : '';
      let phoneVal = phoneInput ? phoneInput.value.trim() : '';

      if (!nameVal || nameVal.length < 3) {
        if (errorEl) {
          errorEl.textContent = 'من فضلك اكتب اسمك ثلاثي على الأقل.';
          errorEl.hidden = false;
        }
        return;
      }

      let phoneCheck = validateEgyptianPhone(phoneVal);
      if (!phoneCheck.isValid) {
        if (errorEl) {
          errorEl.textContent = phoneCheck.error;
          errorEl.hidden = false;
        }
        return;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      try {
        let updatedProfile = await updateMyProfile({
          fullName: nameVal,
          phone: phoneCheck.normalized
        });

        currentActiveProfile = updatedProfile;

        if (successEl) {
          successEl.textContent = '✅ تم تحديث بياناتك بنجاح!';
          successEl.hidden = false;
        }

        renderWelcome(updatedProfile, currentActiveSession);
        renderAccountCard(updatedProfile, currentActiveSession);

        setTimeout(function () {
          closeProfileModal();
        }, 1200);
      } catch (err) {
        console.error('Update profile error:', err);
        if (errorEl) {
          errorEl.textContent = getErrorMessage(err);
          errorEl.hidden = false;
        }
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }
}

// ============================================================
// 6. Skeleton أثناء التحميل
// ============================================================

function showSkeletons() {
  let subsEl = document.getElementById('dash-subs');
  if (subsEl) {
    subsEl.innerHTML = [1, 2].map(function () {
      return `
        <div class="dash-sub-card">
          <div style="display:flex; gap:12px; margin-bottom:16px;">
            <div class="skeleton" style="width:60px; height:22px; border-radius:99px;"></div>
          </div>
          <div class="skeleton" style="height:22px; width:70%; margin-bottom:12px;"></div>
          <div style="display:flex; gap:24px;">
            <div class="skeleton" style="height:16px; width:80px;"></div>
            <div class="skeleton" style="height:16px; width:80px;"></div>
            <div class="skeleton" style="height:16px; width:60px;"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ============================================================
// 7. Init
// ============================================================

async function init() {
  // تأكد من تسجيل الدخول (requireAuth يزيل class="guard-pending" تلقائياً)
  let session = await requireAuth();
  if (!session) return;
  currentActiveSession = session;

  // تشغيل الـ Navbar
  let profile = null;
  try {
    profile = await getMyProfile(false);
  } catch (err) {
    console.warn('dashboard: getMyProfile failed', err);
  }
  currentActiveProfile = profile;

  initNavbar({ activePage: 'dashboard' });

  // رسالة الترحيب والملف الشخصي
  renderWelcome(profile, session);
  renderAccountCard(profile, session);
  setupProfileModalEvents();

  // لو المستخدم مسجل بحساب جوجل ومعندوش رقم موبايل متسجل، نظهر له النافذة يكمل بياناته
  if (!profile || !profile.phone) {
    setTimeout(function () {
      openProfileModal(profile, session, true);
    }, 600);
  }

  // skeleton
  showSkeletons();

  // جلب البيانات بالتوازي
  let [subs, orders] = await Promise.all([
    getMySubscriptions().catch(function (err) {
      console.error('Failed to get subscriptions:', err);
      return [];
    }),
    getMyOrders().catch(function (err) {
      console.error('Failed to get orders:', err);
      return [];
    })
  ]);

  // رسم البيانات
  renderSubscriptions(subs);
  renderOrders(orders);
}

init();
