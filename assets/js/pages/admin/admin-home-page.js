// ============================================================
// admin-home-page.js
// منطق شاشة الإحصائيات العامة للأدمن (admin/index.html)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import { getAdminStats, getAllRegistrations } from '../../services/admin-service.js';
import { formatPrice, formatDateTime, escapeHtml } from '../../core/utils.js';

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

async function loadDashboard() {
  let errorEl = document.getElementById('stats-error');
  if (errorEl) errorEl.hidden = true;

  try {
    // 1. جلب الإحصائيات الحية
    let stats = await getAdminStats();

    let totalEl = document.getElementById('stat-total');
    let pendingEl = document.getElementById('stat-pending');
    let reviewEl = document.getElementById('stat-review');
    let paidEl = document.getElementById('stat-paid');
    let rejectedEl = document.getElementById('stat-rejected');
    let revenueEl = document.getElementById('stat-revenue');
    let badgeEl = document.getElementById('nav-pending-badge');

    if (totalEl) totalEl.textContent = stats.total_registrations || 0;
    if (pendingEl) pendingEl.textContent = stats.pending_payment || 0;
    if (reviewEl) reviewEl.textContent = stats.under_review || 0;
    if (paidEl) paidEl.textContent = stats.paid || 0;
    if (rejectedEl) rejectedEl.textContent = stats.rejected || 0;
    if (revenueEl) revenueEl.textContent = formatPrice(stats.total_revenue || 0);

    let activeReviewCount = (stats.pending_payment || 0) + (stats.under_review || 0);
    if (badgeEl) {
      if (activeReviewCount > 0) {
        badgeEl.textContent = activeReviewCount;
        badgeEl.style.display = 'inline-flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // 2. جلب أحدث 5 تسجيلات
    let regs = await getAllRegistrations();
    let recent = regs.slice(0, 7);
    let tbody = document.getElementById('recent-reg-body');

    if (tbody) {
      if (recent.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center" style="padding:24px; color:#94a3b8;">
              لا توجد أي تسجيلات حتى الآن.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = recent.map(function (r) {
          let courseTitle = r.courses ? r.courses.title : 'مراجعة غير محددة';
          let methodText = r.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';
          return `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px; font-weight:800; font-family:monospace; color:var(--color-primary);">${escapeHtml(r.registration_code)}</td>
              <td style="padding:10px; font-weight:700;">${escapeHtml(r.full_name)}</td>
              <td style="padding:10px; color:#64748b;">${escapeHtml(r.branch)}</td>
              <td style="padding:10px;">${escapeHtml(courseTitle)}</td>
              <td style="padding:10px; font-weight:800; color:var(--color-accent);">${formatPrice(r.amount)}</td>
              <td style="padding:10px;">${escapeHtml(methodText)}</td>
              <td style="padding:10px;">${getStatusBadge(r.payment_status)}</td>
              <td style="padding:10px; color:#64748b; font-size:11px;">${formatDateTime(r.created_at)}</td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch (err) {
    console.error('Failed to load dashboard:', err);
    if (errorEl) {
      errorEl.textContent = 'حدث خطأ أثناء تحميل الإحصائيات، تأكد من الاتصال.';
      errorEl.hidden = false;
    }
  }
}

async function initAdminHomePage() {
  // فحص صلاحية الأدمن والتوجيه لصفحة تسجيل الدخول إن لم يكن مسجلاً
  let authContext = await requireAdmin('login.html');
  if (!authContext) return;

  // زر الخروج
  let signOutBtn = document.getElementById('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // زر التحديث
  let refreshBtn = document.getElementById('refresh-stats-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadDashboard);
  }

  await loadDashboard();
}

document.addEventListener('DOMContentLoaded', initAdminHomePage);
