// ============================================================
// admin-subs-page.js
// منطق إدارة وتمديد الاشتراكات والتفعيل اليدوي
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import {
  getAllSubscriptions,
  updateSubscriptionEndsAt,
  terminateSubscription,
  addManualSubscription,
  getAllStudents,
  getAdminContentTree
} from '../../services/admin-service.js';
import {
  escapeHtml,
  formatDate,
  daysLeft,
  setButtonLoading,
  getErrorMessage,
  qs,
  qsa
} from '../../core/utils.js';

let subsTbody = qs('#all-subs-tbody');
let filterBtns = qsa('.sub-filter-btn');
let searchInput = qs('#search-subs-input');
let refreshBtn = qs('#refresh-subs-btn');
let alertBox = qs('#subs-alert');

let manualModal = qs('#manual-sub-modal');
let openManualBtn = qs('#btn-open-manual-sub');
let closeManualBtn = qs('#manual-modal-close');
let manualForm = qs('#manual-sub-form');
let studentSelect = qs('#manual-student-select');
let courseSelect = qs('#manual-course-select');
let endsAtInput = qs('#manual-ends-at');
let manualSubmitBtn = qs('#manual-submit-btn');

let allLoadedSubs = [];
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

function renderSubsTable(subs) {
  if (!subsTbody) return;

  if (!subs || subs.length === 0) {
    subsTbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:var(--space-8); color:#64748b;">
          لا توجد اشتراكات مطابقة.
        </td>
      </tr>
    `;
    return;
  }

  subsTbody.innerHTML = subs.map(function (sub) {
    let student = sub.profiles || {};
    let course = sub.courses || {};
    let phone = student.phone || '';

    let cleanPhone = phone.replace(/^0/, '20');
    let waLink = phone ? `https://wa.me/${cleanPhone}` : null;

    let days = daysLeft(sub.ends_at);
    let isActive = days > 0;

    let statusBadge = isActive ?
      `<span class="badge badge--success">ساري (باقي ${days} يوم)</span>` :
      '<span class="badge" style="background:#e2e8f0; color:#64748b;">منتهي الصلاحية</span>';

    return `
      <tr data-sub-id="${escapeHtml(sub.id)}">
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
          <strong style="color:var(--color-primary);">${escapeHtml(course.title || 'المادة')}</strong>
        </td>
        <td>
          <span style="font-size:12px; color:#64748b;">${formatDate(sub.starts_at)}</span>
        </td>
        <td>
          <span style="font-size:12px; font-weight:700; color:#0f172a;">${formatDate(sub.ends_at)}</span>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn btn--secondary btn--sm btn-extend-sub" data-id="${escapeHtml(sub.id)}" data-current="${escapeHtml(sub.ends_at.slice(0, 10))}" style="font-size:11px; padding:2px 8px;">
              تمديد ⏳
            </button>
            ${isActive ? `
              <button type="button" class="btn btn--secondary btn--sm btn-terminate-sub" data-id="${escapeHtml(sub.id)}" style="font-size:11px; padding:2px 8px; color:var(--color-danger); border-color:rgba(220,38,38,0.2);">
                إنهاء 🚫
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  qsa('.btn-extend-sub').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let subId = btn.dataset.id;
      let curr = btn.dataset.current;
      let newDate = prompt('أدخل تاريخ الانتهاء الجديد (YYYY-MM-DD):', curr);
      if (!newDate) return;

      try {
        await updateSubscriptionEndsAt(subId, new Date(newDate).toISOString());
        showAlert('✅ تم تمديد الاشتراك بنجاح!', 'success');
        await loadSubscriptions();
      } catch (err) {
        alert('خطأ أثناء التمديد: ' + getErrorMessage(err));
      }
    });
  });

  qsa('.btn-terminate-sub').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let subId = btn.dataset.id;
      if (!confirm('هل أنت متأكد من إنهاء اشتراك هذا الطالب فوراً؟')) return;

      try {
        await terminateSubscription(subId);
        showAlert('تم إنهاء الاشتراك.', 'warning');
        await loadSubscriptions();
      } catch (err) {
        alert('خطأ: ' + getErrorMessage(err));
      }
    });
  });
}

function applySearchAndFilter() {
  let query = (searchInput.value || '').trim().toLowerCase();

  let filtered = allLoadedSubs.filter(function (sub) {
    let days = daysLeft(sub.ends_at);
    let isActive = days > 0;

    if (activeFilter === 'active' && !isActive) return false;
    if (activeFilter === 'expired' && isActive) return false;

    if (query) {
      let student = sub.profiles || {};
      let course = sub.courses || {};
      let name = (student.full_name || '').toLowerCase();
      let email = (student.email || '').toLowerCase();
      let phone = (student.phone || '').toLowerCase();
      let ctitle = (course.title || '').toLowerCase();

      return name.includes(query) || email.includes(query) || phone.includes(query) || ctitle.includes(query);
    }

    return true;
  });

  renderSubsTable(filtered);
}

async function loadSubscriptions() {
  try {
    allLoadedSubs = await getAllSubscriptions('all');
    applySearchAndFilter();
  } catch (err) {
    console.error('Failed to load subscriptions:', err);
    showAlert('تعذر تحميل الاشتراكات: ' + getErrorMessage(err), 'error');
  }
}

async function initManualModal() {
  if (openManualBtn) {
    openManualBtn.addEventListener('click', async function () {
      manualModal.classList.add('show');

      // تعبئة تاريخ افتراضي (بعد 4 شهور)
      let d = new Date();
      d.setMonth(d.getMonth() + 4);
      endsAtInput.value = d.toISOString().slice(0, 10);

      // تحميل الطلاب والمواد
      try {
        let [students, courses] = await Promise.all([
          getAllStudents(),
          getAdminContentTree()
        ]);

        studentSelect.innerHTML = '<option value="">-- اختر الطالب --</option>' + students.map(function (s) {
          return `<option value="${escapeHtml(s.id)}">${escapeHtml(s.full_name || s.email)} (${escapeHtml(s.email)})</option>`;
        }).join('');

        courseSelect.innerHTML = '<option value="">-- اختر المادة --</option>' + courses.map(function (c) {
          return `<option value="${escapeHtml(c.id)}">${escapeHtml(c.title)}</option>`;
        }).join('');
      } catch (e) {
        console.error('Failed to populate selects:', e);
      }
    });
  }

  if (closeManualBtn) {
    closeManualBtn.addEventListener('click', function () {
      manualModal.classList.remove('show');
    });
  }

  if (manualForm) {
    manualForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      let userId = studentSelect.value;
      let courseId = courseSelect.value;
      let endsAt = endsAtInput.value;

      if (!userId || !courseId || !endsAt) {
        alert('من فضلك اختر الطالب والمادة وتاريخ الانتهاء.');
        return;
      }

      setButtonLoading(manualSubmitBtn, true, 'جاري التفعيل...');

      try {
        await addManualSubscription(userId, courseId, endsAt);
        showAlert('✅ تم تفعيل الاشتراك للطالب بنجاح!', 'success');
        manualModal.classList.remove('show');
        await loadSubscriptions();
      } catch (err) {
        alert('خطأ: ' + getErrorMessage(err));
      } finally {
        setButtonLoading(manualSubmitBtn, false);
      }
    });
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
      applySearchAndFilter();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', applySearchAndFilter);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      setButtonLoading(refreshBtn, true, '...');
      loadSubscriptions().finally(function () {
        setButtonLoading(refreshBtn, false);
      });
    });
  }

  initManualModal();
  await loadSubscriptions();
}

init();
