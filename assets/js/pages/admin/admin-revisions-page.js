// ============================================================
// admin-revisions-page.js
// منطق صفحة إدارة المراجعات (admin/revisions.html)
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { signOut } from '../../core/auth.js';
import { getAllRevisions, createRevision, updateRevision } from '../../services/admin-service.js';
import { formatPrice, formatDate, escapeHtml, setButtonLoading, getErrorMessage } from '../../core/utils.js';

let allRevisions = [];

async function loadRevisionsTable() {
  let tbody = document.getElementById('revisions-tbody');
  let alertEl = document.getElementById('revisions-alert');
  if (alertEl) alertEl.hidden = true;

  try {
    allRevisions = await getAllRevisions();

    if (tbody) {
      if (allRevisions.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center" style="padding:32px; color:#94a3b8;">
              لا توجد مراجعات مسجلة حتى الآن. اضغط على "إضافة مراجعة جديدة" بالأعلى لإضافة أول مراجعة.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = allRevisions.map(function (rev) {
        let priceText = formatPrice(rev.price_egp || 120);
        let expiryText = rev.access_until ? formatDate(rev.access_until) : 'مفتوح';
        let hasLinkBadge = rev.access_link
          ? `<a href="${escapeHtml(rev.access_link)}" target="_blank" rel="noopener" style="color:#16a34a; font-weight:700; text-decoration:none;">رابط معين 🔗</a>`
          : '<span style="color:#f59e0b; font-weight:700;">غير معين ⚠️</span>';

        let publishBadge = rev.is_published
          ? '<span class="badge badge--success">منشور للطلاب</span>'
          : '<span class="badge badge--muted">مسودة (مخفي)</span>';

        return `
          <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:12px; font-weight:800; color:var(--color-primary);">${escapeHtml(rev.title)}</td>
            <td style="padding:12px; font-weight:800; color:var(--color-accent);">${escapeHtml(priceText)}</td>
            <td style="padding:12px; color:#64748b;">${escapeHtml(expiryText)}</td>
            <td style="padding:12px;">${hasLinkBadge}</td>
            <td style="padding:12px;">${publishBadge}</td>
            <td style="padding:12px; text-align:center;">
              <div style="display:flex; gap:6px; justify-content:center;">
                <button type="button" class="btn btn--secondary btn--sm btn-edit-rev" data-id="${escapeHtml(rev.id)}" style="font-size:11px; padding:3px 8px;">
                  ✏️ تعديل
                </button>
                <button type="button" class="btn btn--ghost btn--sm btn-toggle-publish" data-id="${escapeHtml(rev.id)}" data-published="${rev.is_published ? 'true' : 'false'}" style="font-size:11px; padding:3px 8px;">
                  ${rev.is_published ? 'إخفاء' : 'إتاحة'}
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      // ربط أزرار التعديل
      tbody.querySelectorAll('.btn-edit-rev').forEach(function (btn) {
        btn.addEventListener('click', function () {
          let id = btn.getAttribute('data-id');
          openEditModal(id);
        });
      });

      // ربط أزرار تغيير النشر السريع
      tbody.querySelectorAll('.btn-toggle-publish').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          let id = btn.getAttribute('data-id');
          let currentPub = btn.getAttribute('data-published') === 'true';
          try {
            await updateRevision(id, { is_published: !currentPub });
            await loadRevisionsTable();
          } catch (e) {
            alert('فشل تحديث حالة النشر: ' + getErrorMessage(e));
          }
        });
      });
    }

  } catch (err) {
    console.error('Failed to load revisions table:', err);
    if (alertEl) {
      alertEl.textContent = 'حدث خطأ أثناء جلب المراجعات: ' + getErrorMessage(err);
      alertEl.hidden = false;
    }
  }
}

function openCreateModal() {
  let modal = document.getElementById('revision-modal');
  let form = document.getElementById('revision-form');
  let heading = document.getElementById('modal-rev-heading');

  if (form) form.reset();
  document.getElementById('rev-form-id').value = '';
  document.getElementById('rev-form-price').value = '120';
  document.getElementById('rev-form-published').checked = true;

  if (heading) heading.textContent = 'إضافة مراجعة جديدة';
  if (modal) modal.hidden = false;
}

function openEditModal(id) {
  let rev = allRevisions.find(function (r) { return r.id === id; });
  if (!rev) return;

  let modal = document.getElementById('revision-modal');
  let heading = document.getElementById('modal-rev-heading');

  document.getElementById('rev-form-id').value = rev.id;
  document.getElementById('rev-form-title').value = rev.title || '';
  document.getElementById('rev-form-short').value = rev.short_description || '';
  document.getElementById('rev-form-desc').value = rev.description || '';
  document.getElementById('rev-form-price').value = rev.price_egp || 120;
  document.getElementById('rev-form-expiry').value = rev.access_until ? rev.access_until.split('T')[0] : '';
  document.getElementById('rev-form-link').value = rev.access_link || '';
  document.getElementById('rev-form-published').checked = !!rev.is_published;

  if (heading) heading.textContent = 'تعديل بيانات المراجعة';
  if (modal) modal.hidden = false;
}

function closeRevModal() {
  let modal = document.getElementById('revision-modal');
  if (modal) modal.hidden = true;
}

async function initAdminRevisionsPage() {
  let authContext = await requireAdmin('login.html');
  if (!authContext) return;

  // خروج
  let signOutBtn = document.getElementById('admin-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      await signOut('login.html');
    });
  }

  // فتح وإغلاق المودال
  let openBtn = document.getElementById('btn-open-create-modal');
  if (openBtn) openBtn.addEventListener('click', openCreateModal);

  let closeBtn = document.getElementById('modal-rev-close');
  if (closeBtn) closeBtn.addEventListener('click', closeRevModal);

  let cancelBtn = document.getElementById('btn-cancel-rev-modal');
  if (cancelBtn) cancelBtn.addEventListener('click', closeRevModal);

  // إرسال فورم الحفظ
  let form = document.getElementById('revision-form');
  let submitBtn = document.getElementById('btn-submit-rev-form');

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      let revId = document.getElementById('rev-form-id').value;
      let title = document.getElementById('rev-form-title').value.trim();
      let shortDesc = document.getElementById('rev-form-short').value.trim();
      let desc = document.getElementById('rev-form-desc').value.trim();
      let price = parseInt(document.getElementById('rev-form-price').value, 10) || 120;
      let expiry = document.getElementById('rev-form-expiry').value || null;
      let link = document.getElementById('rev-form-link').value.trim();
      let isPub = document.getElementById('rev-form-published').checked;

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
