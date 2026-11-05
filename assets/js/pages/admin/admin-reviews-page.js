// ============================================================
// admin-reviews-page.js
// إدارة آراء وتقييمات الطلاب للوحة الأدمن (admin/reviews.html)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import {
  getAllReviews,
  updateReviewStatus,
  deleteReview,
  createAdminReview
} from '../../services/admin-service.js';
import {
  formatDateTime,
  escapeHtml,
  initSpotlightCards
} from '../../core/utils.js';

let reviewsList = [];

function byId(id) {
  return document.getElementById(id);
}

function renderReviewCard(r) {
  const isApproved = r.status === 'approved';
  const isRejected = r.status === 'rejected';
  const isPending = r.status === 'pending';

  let statusBadge = '';
  if (isApproved) {
    statusBadge = '<span class="badge badge--success" style="font-size:11px; padding:4px 10px;"><i class="fa-solid fa-circle-check"></i> معتمد ومنشور</span>';
  } else if (isRejected) {
    statusBadge = '<span class="badge badge--danger" style="font-size:11px; padding:4px 10px;"><i class="fa-solid fa-ban"></i> مرفوض</span>';
  } else {
    statusBadge = '<span class="badge badge--warning" style="font-size:11px; padding:4px 10px;"><i class="fa-solid fa-hourglass-half"></i> بانتظار الموافقة</span>';
  }

  const displayName = r.is_anonymous || !r.student_name ? 'اسم مخفي للخصوصية 🔒' : escapeHtml(r.student_name);
  const dateFormatted = formatDateTime(r.created_at);

  return `
    <div class="review-admin-card" style="background:#ffffff; border:1.5px solid ${isApproved ? '#bbf7d0' : isPending ? '#fed7aa' : '#e2e8f0'}; border-radius:18px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 16px rgba(0,0,0,0.03); position:relative;">
      <div>
        <!-- رأس الكارت -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:8px;">
          <div>
            <strong style="font-size:15px; color:#0f172a; display:block;">${displayName}</strong>
            <span style="font-size:12px; color:#64748b;"><i class="fa-solid fa-location-dot" style="color:#ef4444; margin-left:4px;"></i>${escapeHtml(r.branch || 'غير محدد')}</span>
          </div>
          <div>${statusBadge}</div>
        </div>

        <!-- نص الرأي -->
        <div style="background:#f8fafc; border:1px solid #f1f5f9; border-radius:12px; padding:12px 14px; margin-bottom:14px; font-size:13px; line-height:1.6; color:#334155; font-style:italic;">
          "${escapeHtml(r.review_text)}"
        </div>

        <div style="font-size:11px; color:#94a3b8; margin-bottom:12px;">
          <i class="fa-solid fa-clock"></i> تاريخ الإرسال: ${escapeHtml(dateFormatted)}
        </div>
      </div>

      <!-- أزرار اتخاذ القرار -->
      <div style="display:flex; gap:8px; border-top:1px solid #f1f5f9; padding-top:14px;">
        ${!isApproved ? `
          <button type="button" class="btn btn--primary btn--sm btn-approve-review" data-id="${escapeHtml(r.id)}" style="flex:1; border-radius:10px; font-size:12px; font-weight:700; background:#16a34a; border-color:#16a34a;">
            <i class="fa-solid fa-check"></i> موافقة ونشر
          </button>
        ` : ''}

        ${!isRejected ? `
          <button type="button" class="btn btn--secondary btn--sm btn-reject-review" data-id="${escapeHtml(r.id)}" style="flex:1; border-radius:10px; font-size:12px; font-weight:700; color:#d97706; border-color:#fed7aa;">
            <i class="fa-solid fa-ban"></i> رفض
          </button>
        ` : ''}

        <button type="button" class="btn btn--secondary btn--sm btn-delete-review" data-id="${escapeHtml(r.id)}" title="حذف نهائي" style="width:38px; padding:0; border-radius:10px; color:#ef4444; border-color:rgba(239,68,68,0.3); display:inline-flex; align-items:center; justify-content:center;">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

async function loadReviews() {
  const container = byId('reviews-cards-container');
  const alertEl = byId('reviews-alert');
  if (alertEl) alertEl.hidden = true;

  try {
    reviewsList = await getAllReviews();

    const total = reviewsList.length;
    const approved = reviewsList.filter(r => r.status === 'approved').length;
    const pending = reviewsList.filter(r => r.status === 'pending').length;

    if (byId('stat-total-reviews')) byId('stat-total-reviews').textContent = total;
    if (byId('stat-approved-reviews')) byId('stat-approved-reviews').textContent = approved;
    if (byId('stat-pending-reviews')) byId('stat-pending-reviews').textContent = pending;

    if (!container) return;

    if (reviewsList.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:60px 20px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:18px;">
          <i class="fa-solid fa-comments fa-2x" style="color:#94a3b8; margin-bottom:12px;"></i>
          <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0 0 6px;">لا توجد آراء مسجلة حتى الآن</h3>
          <p style="font-size:13px; color:#64748b; margin:0;">عندما يرسل الطلاب تقييماتهم ستظهر هنا للموافقة، أو يمكنك إضافة آراء يدوياً عبر الزر بالأعلى.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = reviewsList.map(renderReviewCard).join('');
    initSpotlightCards();

  } catch (err) {
    console.error('Failed to load reviews:', err);
    if (alertEl) {
      alertEl.textContent = 'فشل جلب الآراء: ' + (err.message || 'خطأ غير متوقع');
      alertEl.hidden = false;
    }
  }
}

function setupActions() {
  const container = byId('reviews-cards-container');
  const modal = byId('add-review-modal');
  const openModalBtn = byId('open-add-review-modal');
  const closeModalBtn = byId('modal-close-review-btn');
  const cancelModalBtn = byId('modal-cancel-review-btn');
  const addForm = byId('add-review-form');

  if (openModalBtn) openModalBtn.addEventListener('click', () => { if (modal) modal.hidden = false; });
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => { if (modal) modal.hidden = true; });
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', () => { if (modal) modal.hidden = true; });

  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentName = byId('admin-review-name').value.trim();
      const isAnonymous = byId('admin-review-anon').checked;
      const branch = byId('admin-review-branch').value.trim();
      const reviewText = byId('admin-review-text').value.trim();

      try {
        await createAdminReview({ studentName, isAnonymous, branch, reviewText, status: 'approved' });
        addForm.reset();
        if (modal) modal.hidden = true;
        await loadReviews();
      } catch (err) {
        alert('فشل إضافة الرأي: ' + err.message);
      }
    });
  }

  if (byId('refresh-reviews-btn')) {
    byId('refresh-reviews-btn').addEventListener('click', loadReviews);
  }

  if (container) {
    container.addEventListener('click', async (e) => {
      const approveBtn = e.target.closest('.btn-approve-review');
      const rejectBtn = e.target.closest('.btn-reject-review');
      const deleteBtn = e.target.closest('.btn-delete-review');

      if (approveBtn) {
        const id = approveBtn.getAttribute('data-id');
        approveBtn.disabled = true;
        try {
          await updateReviewStatus(id, 'approved');
          await loadReviews();
        } catch (err) {
          alert('تعذر الموافقة: ' + err.message);
        }
      }

      if (rejectBtn) {
        const id = rejectBtn.getAttribute('data-id');
        rejectBtn.disabled = true;
        try {
          await updateReviewStatus(id, 'rejected');
          await loadReviews();
        } catch (err) {
          alert('تعذر الرفض: ' + err.message);
        }
      }

      if (deleteBtn) {
        const id = deleteBtn.getAttribute('data-id');
        if (confirm('هل أنت متأكد من حذف هذا الرأي نهائياً؟')) {
          deleteBtn.disabled = true;
          try {
            await deleteReview(id);
            await loadReviews();
          } catch (err) {
            alert('تعذر الحذف: ' + err.message);
          }
        }
      }
    });
  }

  const signoutBtn = byId('admin-signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      await signOut();
      window.location.href = 'login.html';
    });
  }
}

async function init() {
  await requireAdmin();
  setupActions();
  await loadReviews();
}

document.addEventListener('DOMContentLoaded', init);
