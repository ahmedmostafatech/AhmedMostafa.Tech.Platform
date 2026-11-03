// ============================================================
// admin-students-page.js
// منطق صفحة عرض الطلاب المسجلين
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import { getAllStudents } from '../../services/admin-service.js';
import {
  escapeHtml,
  formatDate,
  setButtonLoading,
  getErrorMessage,
  qs
} from '../../core/utils.js';

let studentsTbody = qs('#all-students-tbody');
let searchInput = qs('#search-students-input');
let refreshBtn = qs('#refresh-students-btn');
let countLabel = qs('#students-count-label');

let allStudents = [];

function renderStudentsTable(students) {
  if (!studentsTbody) return;

  if (!students || students.length === 0) {
    studentsTbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:var(--space-8); color:#64748b;">
          لا يوجد طلاب مطابقين للبحث.
        </td>
      </tr>
    `;
    return;
  }

  studentsTbody.innerHTML = students.map(function (s) {
    let phone = s.phone || '';
    let cleanPhone = phone.replace(/^0/, '20');
    let waLink = phone ? `https://wa.me/${cleanPhone}` : null;
    let subs = s.subscriptions || [];
    let activeSubs = subs.filter(function (sub) {
      return new Date(sub.ends_at) > new Date();
    });

    let roleBadge = s.is_admin ?
      '<span class="badge badge--accent">👑 أدمن</span>' :
      '<span class="badge" style="background:#f1f5f9; color:#475569;">طالب</span>';

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--color-primary);">${escapeHtml(s.full_name || 'بدون اسم')}</div>
        </td>
        <td>
          <div style="direction:ltr; text-align:right; font-size:var(--text-xs); color:#64748b;">
            ${escapeHtml(s.email || '—')}
          </div>
        </td>
        <td>
          ${phone ? `
            <a href="${escapeHtml(waLink)}" target="_blank" rel="noopener" class="badge badge--success" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
              <span>📱</span> <span style="direction:ltr;">${escapeHtml(phone)}</span>
            </a>
          ` : '<span style="color:#94a3b8; font-size:11px;">غير مسجل</span>'}
        </td>
        <td>${roleBadge}</td>
        <td>
          ${activeSubs.length > 0 ?
            `<span class="badge badge--success">${activeSubs.length} مواد نشطة</span>` :
            '<span style="color:#94a3b8; font-size:11px;">لا يوجد</span>'}
        </td>
        <td>
          <span style="font-size:11px; color:#64748b;">${formatDate(s.created_at)}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function applySearch() {
  let query = (searchInput.value || '').trim().toLowerCase();

  let filtered = allStudents.filter(function (s) {
    if (!query) return true;
    let name = (s.full_name || '').toLowerCase();
    let email = (s.email || '').toLowerCase();
    let phone = (s.phone || '').toLowerCase();

    return name.includes(query) || email.includes(query) || phone.includes(query);
  });

  if (countLabel) {
    countLabel.textContent = `إجمالي: ${filtered.length} طالب`;
  }

  renderStudentsTable(filtered);
}

async function loadStudents() {
  try {
    allStudents = await getAllStudents();
    applySearch();
  } catch (err) {
    console.error('Failed to load students:', err);
    alert('تعذر تحميل الطلاب: ' + getErrorMessage(err));
  }
}

async function init() {
  let ctx = await requireAdmin();
  if (!ctx) return;

  if (searchInput) {
    searchInput.addEventListener('input', applySearch);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      setButtonLoading(refreshBtn, true, '...');
      loadStudents().finally(function () {
        setButtonLoading(refreshBtn, false);
      });
    });
  }

  await loadStudents();
}

init();
