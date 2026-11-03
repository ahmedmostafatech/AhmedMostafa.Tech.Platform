// ============================================================
// admin-home-page.js
// منطق شاشة الإحصائيات العامة المتقدمة للأدمن (admin/index.html)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import { getAdminStats, getAllRegistrations } from '../../services/admin-service.js';
import { formatPrice, formatDateTime, escapeHtml, initSpotlightCards } from '../../core/utils.js';

let growthChartInstance = null;
let paymentChartInstance = null;

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

function renderCharts(registrations) {
  if (typeof Chart === 'undefined') return;

  // 1. حساب بيانات آخر 7 أيام
  const daysMap = {};
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    daysMap[key] = 0;
  }

  // فرز التسجيلات حسب الأيام
  let vfCount = 0;
  let instaCount = 0;

  registrations.forEach(r => {
    // إحصاء وسائل الدفع
    if (r.payment_method === 'instapay') {
      instaCount++;
    } else {
      vfCount++;
    }

    if (r.created_at) {
      const d = new Date(r.created_at);
      const key = d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
      if (daysMap[key] !== undefined) {
        daysMap[key]++;
      }
    }
  });

  // رسم 1: نمو التسجيلات (Line Chart)
  const growthCanvas = document.getElementById('growthChart');
  if (growthCanvas) {
    if (growthChartInstance) {
      growthChartInstance.destroy();
    }

    const ctx = growthCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    growthChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Object.keys(daysMap),
        datasets: [{
          label: 'عدد التسجيلات',
          data: Object.values(daysMap),
          borderColor: '#3b82f6',
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#ffd154',
          pointBorderColor: '#ffffff',
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl: true,
            titleFont: { family: 'IBM Plex Sans Arabic' },
            bodyFont: { family: 'IBM Plex Sans Arabic' }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { family: 'IBM Plex Sans Arabic' } }
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0, color: 'rgba(255, 255, 255, 0.6)', font: { family: 'IBM Plex Sans Arabic' } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        }
      }
    });
  }

  // رسم 2: توزيع وسائل الدفع (Doughnut Chart)
  const paymentCanvas = document.getElementById('paymentMethodChart');
  if (paymentCanvas) {
    if (paymentChartInstance) {
      paymentChartInstance.destroy();
    }

    const ctx2 = paymentCanvas.getContext('2d');
    paymentChartInstance = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['فودافون كاش', 'إنستاباي'],
        datasets: [{
          data: [vfCount || 0, instaCount || 0],
          backgroundColor: ['#ef4444', '#a855f7'],
          borderColor: '#0a1224',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            rtl: true,
            labels: {
              color: 'rgba(255, 255, 255, 0.8)',
              font: { family: 'IBM Plex Sans Arabic', size: 12 },
              padding: 16
            }
          },
          tooltip: {
            rtl: true,
            titleFont: { family: 'IBM Plex Sans Arabic' },
            bodyFont: { family: 'IBM Plex Sans Arabic' }
          }
        },
        cutout: '70%'
      }
    });
  }
}

async function loadDashboard() {
  const errorEl = document.getElementById('stats-error');
  if (errorEl) errorEl.hidden = true;

  try {
    // 1. جلب الإحصائيات الحية
    const stats = await getAdminStats();

    const totalEl = document.getElementById('stat-total');
    const pendingEl = document.getElementById('stat-pending');
    const paidEl = document.getElementById('stat-paid');
    const revenueEl = document.getElementById('stat-revenue');
    const badgeEl = document.getElementById('nav-pending-badge');

    if (totalEl) totalEl.textContent = stats.total_registrations || 0;
    if (pendingEl) pendingEl.textContent = (stats.pending_payment || 0) + (stats.under_review || 0);
    if (paidEl) paidEl.textContent = stats.paid || 0;
    if (revenueEl) revenueEl.textContent = formatPrice(stats.total_revenue || 0);

    const activeReviewCount = (stats.pending_payment || 0) + (stats.under_review || 0);
    if (badgeEl) {
      if (activeReviewCount > 0) {
        badgeEl.textContent = activeReviewCount;
        badgeEl.style.display = 'inline-flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // 2. جلب جميع التسجيلات للرسم البياني والجدول
    const regs = await getAllRegistrations();
    renderCharts(regs);

    const recent = regs.slice(0, 8);
    const tbody = document.getElementById('recent-reg-body');

    if (tbody) {
      if (recent.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center" style="padding:32px; color:rgba(255,255,255,0.4);">
              لا توجد أي تسجيلات مسجلة حتى الآن.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = recent.map(r => {
          const courseTitle = r.courses ? r.courses.title : 'مراجعة غير محددة';
          const isInsta = r.payment_method === 'instapay';
          const methodBadge = isInsta
            ? '<span style="color:#c084fc; font-weight:700;"><i class="fa-solid fa-bolt"></i> إنستاباي</span>'
            : '<span style="color:#f87171; font-weight:700;"><i class="fa-solid fa-wallet"></i> فودافون كاش</span>';

          return `
            <tr>
              <td style="font-weight:800; font-family:monospace; color:#ffd154;">${escapeHtml(r.registration_code)}</td>
              <td style="font-weight:700;">${escapeHtml(r.full_name)}</td>
              <td style="color:rgba(255,255,255,0.6);">${escapeHtml(r.branch)}</td>
              <td style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(courseTitle)}</td>
              <td style="font-weight:800; color:#4ade80;">${formatPrice(r.amount)}</td>
              <td>${methodBadge}</td>
              <td>${getStatusBadge(r.payment_status)}</td>
              <td style="color:rgba(255,255,255,0.45); font-size:11px;">${formatDateTime(r.created_at)}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // تفعيل تأثير Spotlight Glow Cards
    initSpotlightCards();

  } catch (err) {
    console.error('Failed to load dashboard:', err);
    if (errorEl) {
      errorEl.textContent = 'حدث خطأ أثناء تحميل الإحصائيات، تأكد من الاتصال بقاعدة البيانات.';
      errorEl.hidden = false;
    }
  }
}

async function initAdminHomePage() {
  const authContext = await requireAdmin('login.html');
  if (!authContext) return;

  // زر الخروج
  const signOutBtn = document.getElementById('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // زر التحديث
  const refreshBtn = document.getElementById('refresh-stats-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadDashboard);
  }

  await loadDashboard();
}

document.addEventListener('DOMContentLoaded', initAdminHomePage);
