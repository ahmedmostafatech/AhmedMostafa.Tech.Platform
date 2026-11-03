// ============================================================
// revisions-page.js
// منطق صفحة عرض المراجعات المتاحة (revisions.html)
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getPublishedRevisions } from '../services/revisions-service.js';
import { formatPrice, formatDate, escapeHtml } from '../core/utils.js';

async function initRevisionsPage() {
  await initNavbar({ activePage: 'revisions' });

  let gridEl = document.getElementById('revisions-grid');
  let emptyEl = document.getElementById('revisions-empty');
  let loadingEl = document.getElementById('revisions-loading');

  try {
    let revisions = await getPublishedRevisions();

    if (loadingEl) loadingEl.hidden = true;

    if (!revisions || revisions.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (gridEl) {
      gridEl.innerHTML = revisions.map(function (rev) {
        let desc = rev.short_description || rev.description || 'مراجعة منهجية شاملة مع تدريبات وحلول نماذج امتحانات.';
        let priceText = formatPrice(rev.price_egp || 120);
        let expiryText = rev.access_until ? `سارية حتى ${formatDate(rev.access_until)}` : 'سارية طوال الفصل الدراسي';

        return `
          <article class="revision-card">
            <div class="revision-card__header">
              <span class="badge badge--accent">متاح للتسجيل</span>
              <span style="font-size:var(--text-xs); color:var(--color-text-muted);">${escapeHtml(expiryText)}</span>
            </div>
            <h2 class="revision-card__title">${escapeHtml(rev.title)}</h2>
            <p class="revision-card__desc">${escapeHtml(desc)}</p>
            <div class="revision-card__footer">
              <div>
                <span style="font-size:var(--text-xs); color:var(--color-text-muted); display:block;">السعر الإجمالي</span>
                <span class="revision-card__price">${escapeHtml(priceText)}</span>
              </div>
              <div style="display:flex; gap:8px;">
                <a href="revision.html?id=${encodeURIComponent(rev.id)}" class="btn btn--secondary btn--sm">
                  التفاصيل
                </a>
                <a href="register.html?id=${encodeURIComponent(rev.id)}" class="btn btn--accent btn--sm" style="font-weight:700;">
                  احجز الآن
                </a>
              </div>
            </div>
          </article>
        `;
      }).join('');

      gridEl.hidden = false;
    }
  } catch (err) {
    console.error('Failed to load revisions page:', err);
    if (loadingEl) loadingEl.hidden = true;
    if (emptyEl) {
      emptyEl.textContent = 'حدث خطأ أثناء تحميل المراجعات. يرجى إعادة المحاولة.';
      emptyEl.hidden = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', initRevisionsPage);

