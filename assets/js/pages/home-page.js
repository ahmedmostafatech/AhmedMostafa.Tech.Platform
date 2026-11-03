// ============================================================
// home-page.js
// منطق الصفحة الرئيسية وعرض المراجعات البارزة
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getPublishedRevisions } from '../services/revisions-service.js';
import { formatPrice, escapeHtml } from '../core/utils.js';

function renderRevisionsGrid(revisions) {
  let gridEl = document.getElementById('featured-revisions-grid');
  let emptyEl = document.getElementById('revisions-empty');
  let loadingEl = document.getElementById('featured-revisions-loading');

  if (loadingEl) loadingEl.hidden = true;

  if (!revisions || revisions.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  if (gridEl) {
    gridEl.innerHTML = revisions.map(function (rev) {
      let desc = rev.short_description || rev.description || 'مراجعة شاملة لجميع محاور المنهج مع حل نماذج امتحانات عملية.';
      let priceText = formatPrice(rev.price_egp || 120);

      return `
        <article class="revision-card">
          <div class="revision-card__header">
            <span class="badge badge--accent">متاح للحجز الآن</span>
            <span style="font-size:var(--text-xs); color:var(--color-text-muted);">EELU</span>
          </div>
          <h3 class="revision-card__title">${escapeHtml(rev.title)}</h3>
          <p class="revision-card__desc">${escapeHtml(desc)}</p>
          <div class="revision-card__footer">
            <div>
              <span style="font-size:var(--text-xs); color:var(--color-text-muted); display:block;">سعر الاشتراك</span>
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
}

async function initHomePage() {
  // 1. تشغيل شريط الملاحة
  await initNavbar({ activePage: 'home' });

  // 2. جلب المراجعات المنشورة
  try {
    let revisions = await getPublishedRevisions();
    renderRevisionsGrid(revisions);
  } catch (err) {
    console.error('Failed to load revisions on home page:', err);
    let loadingEl = document.getElementById('featured-revisions-loading');
    let emptyEl = document.getElementById('revisions-empty');
    if (loadingEl) loadingEl.hidden = true;
    if (emptyEl) {
      emptyEl.textContent = 'تعذر تحميل المراجعات حالياً. برجاء التأكد من اتصال الإنترنت ثم إعادة المحاولة.';
      emptyEl.hidden = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', initHomePage);
