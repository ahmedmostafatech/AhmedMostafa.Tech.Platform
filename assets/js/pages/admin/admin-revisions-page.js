// ============================================================
// admin-revisions-page.js
// منطق صفحة إدارة المراجعات (admin/revisions.html)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import { getAllRevisions, createRevision, updateRevision } from '../../services/admin-service.js';
import { formatPrice, formatDate, escapeHtml, setButtonLoading, getErrorMessage, initSpotlightCards } from '../../core/utils.js';

let allRevisions = [];

async function loadRevisionsTable() {
  const tbody = document.getElementById('revisions-tbody');
  const alertEl = document.getElementById('revisions-alert');
  if (alertEl) alertEl.hidden = true;

  try {
    allRevisions = await getAllRevisions();

    if (tbody) {
      if (allRevisions.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center" style="padding:32px; color:rgba(255,255,255,0.4);">
              لا توجد مراجعات مسجلة حتى الآن. اضغط على "إضافة مراجعة جديدة" بالأعلى لإضافة أول مراجعة.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = allRevisions.map(rev => {
        const priceText = formatPrice(rev.price_egp || 120);
        const expiryText = rev.access_until ? formatDate(rev.access_until) : 'مفتوح طوال الترم';
        const hasLinkBadge = rev.access_link
          ? `<a href="${escapeHtml(rev.access_link)}" target="_blank" rel="noopener" style="color:#22c55e; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-link"></i> رابط معين</a>`
          : '<span style="color:#f59e0b; font-weight:700; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-triangle-exclamation"></i> غير معين</span>';

        const publishBadge = rev.is_published
          ? '<span class="badge badge--success" style="font-size:11px;"><i class="fa-solid fa-circle-check"></i> منشور للطلاب</span>'
          : '<span class="badge badge--muted" style="font-size:11px;"><i class="fa-solid fa-eye-slash"></i> مسودة (مخفي)</span>';

        return `
          <tr>
            <td style="font-weight:800; color:#ffffff;">${escapeHtml(rev.title)}</td>
            <td style="font-weight:800; color:#4ade80;">${escapeHtml(priceText)}</td>
            <td style="color:rgba(255,255,255,0.6);">${escapeHtml(expiryText)}</td>
            <td>${hasLinkBadge}</td>
            <td>${publishBadge}</td>
            <td style="text-align:center;">
              <div style="display:flex; gap:8px; justify-content:center;">
                <button type="button" class="btn btn--secondary btn--sm btn-edit-rev" data-id="${escapeHtml(rev.id)}" style="font-size:11px; padding:4px 10px; border-radius:8px;">
                  <i class="fa-solid fa-pen"></i> تعديل
                </button>
                <button type="button" class="btn btn--ghost btn--sm btn-toggle-publish" data-id="${escapeHtml(rev.id)}" data-published="${rev.is_published ? 'true' : 'false'}" style="font-size:11px; padding:4px 10px; border-radius:8px;">
                  ${rev.is_published ? '<i class="fa-solid fa-eye-slash"></i> إخفاء' : '<i class="fa-solid fa-eye"></i> إتاحة'}
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // ربط أزرار التعديل
      tbody.querySelectorAll('.btn-edit-rev').forEach(btn => {
        btn.addEventListener('click', function () {
          const id = btn.getAttribute('data-id');
          openEditModal(id);
        });
      });

      // ربط أزرار تغيير النشر السريع
      tbody.querySelectorAll('.btn-toggle-publish').forEach(btn => {
        btn.addEventListener('click', async function () {
          const id = btn.getAttribute('data-id');
          const currentPub = btn.getAttribute('data-published') === 'true';
          try {
            await updateRevision(id, { is_published: !currentPub });
            await loadRevisionsTable();
          } catch (e) {
            alert('فشل تحديث حالة النشر: ' + getErrorMessage(e));
          }
        });
      });
    }

    initSpotlightCards();

  } catch (err) {
    console.error('Failed to load revisions table:', err);
    if (alertEl) {
      alertEl.textContent = 'حدث خطأ أثناء جلب المراجعات: ' + getErrorMessage(err);
      alertEl.hidden = false;
    }
  }
}

function openCreateModal() {
  const modal = document.getElementById('revision-modal');
  const form = document.getElementById('revision-form');
  const heading = document.getElementById('modal-rev-heading');

  if (form) form.reset();
  document.getElementById('rev-form-id').value = '';
  document.getElementById('rev-form-price').value = '120';
  document.getElementById('rev-form-published').checked = true;

  if (heading) {
    heading.innerHTML = '<i class="fa-solid fa-plus" style="color:#72a2ff;"></i> إضافة مراجعة جديدة';
  }
  if (modal) modal.hidden = false;
  initSpotlightCards();
}

function openEditModal(id) {
  const rev = allRevisions.find(r => r.id === id);
  if (!rev) return;

  const modal = document.getElementById('revision-modal');
  const heading = document.getElementById('modal-rev-heading');

  document.getElementById('rev-form-id').value = rev.id;
  document.getElementById('rev-form-title').value = rev.title || '';
  document.getElementById('rev-form-short').value = rev.short_description || '';
  document.getElementById('rev-form-desc').value = rev.description || '';
  document.getElementById('rev-form-price').value = rev.price_egp || 120;
  document.getElementById('rev-form-expiry').value = rev.access_until ? rev.access_until.split('T')[0] : '';
  document.getElementById('rev-form-link').value = rev.access_link || '';
  document.getElementById('rev-form-published').checked = !!rev.is_published;

  if (heading) {
    heading.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color:#ffd154;"></i> تعديل بيانات المراجعة';
  }
  if (modal) modal.hidden = false;
  initSpotlightCards();
}

function closeRevModal() {
  const modal = document.getElementById('revision-modal');
  if (modal) modal.hidden = true;
}

async function initAdminRevisionsPage() {
  const authContext = await requireAdmin('login.html');
  if (!authContext) return;

  // خروج
  const signOutBtn = document.getElementById('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // فتح وإغلاق المودال
  const openBtn = document.getElementById('btn-open-create-modal');
  if (openBtn) openBtn.addEventListener('click', openCreateModal);

  const closeBtn = document.getElementById('modal-rev-close');
  if (closeBtn) closeBtn.addEventListener('click', closeRevModal);

  const cancelBtn = document.getElementById('btn-cancel-rev-modal');
  if (cancelBtn) cancelBtn.addEventListener('click', closeRevModal);

  // إرسال فورم الحفظ
  const form = document.getElementById('revision-form');
  const submitBtn = document.getElementById('btn-submit-rev-form');

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      const revId = document.getElementById('rev-form-id').value;
      const title = document.getElementById('rev-form-title').value.trim();
      const shortDesc = document.getElementById('rev-form-short').value.trim();
      const desc = document.getElementById('rev-form-desc').value.trim();
      const price = parseInt(document.getElementById('rev-form-price').value, 10) || 120;
      const expiry = document.getElementById('rev-form-expiry').value || null;
      const link = document.getElementById('rev-form-link').value.trim();
      const isPub = document.getElementById('rev-form-published').checked;

      if (!title) {
        alert('من فضلك اكتب عنوان المراجعة.');
        return;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      try {
        if (revId) {
          // تعديل
          await updateRevision(revId, {
            title: title,
            short_description: shortDesc || null,
            description: desc || null,
            price_egp: price,
            access_until: expiry,
            access_link: link || null,
            is_published: isPub,
            updated_at: new Date().toISOString()
          });
        } else {
          // إضافة
          await createRevision({
            title: title,
            short_description: shortDesc,
            description: desc,
            price_egp: price,
            access_until: expiry,
            access_link: link,
            is_published: isPub
          });
        }

        closeRevModal();
        await loadRevisionsTable();

      } catch (err) {
        alert('حدث خطأ أثناء حفظ المراجعة: ' + getErrorMessage(err));
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  await loadRevisionsTable();
}

document.addEventListener('DOMContentLoaded', initAdminRevisionsPage);
