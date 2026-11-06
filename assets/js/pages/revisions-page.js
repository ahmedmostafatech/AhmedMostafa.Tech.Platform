// ============================================================
// revisions-page.js
// منطق صفحة عرض المراجعات المتاحة (revisions.html) بتصميم بريميوم وفلاتر فورية
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getPublishedRevisions } from '../services/revisions-service.js';
import { formatPrice, formatDate, escapeHtml } from '../core/utils.js';

let allRevisions = [];

function renderRevisions(revisions) {
  let gridEl = document.getElementById('revisions-grid');
  let emptyEl = document.getElementById('revisions-empty');
  let countEl = document.getElementById('revisions-count-badge');

  if (countEl) {
    countEl.innerHTML = `<i class="fa-solid fa-sparkles"></i> متاح حالياً ${revisions.length} مراجعة`;
  }

  if (!revisions || revisions.length === 0) {
    if (gridEl) gridEl.hidden = true;
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;

  if (gridEl) {
    gridEl.innerHTML = revisions.map(function (rev) {
      let desc = rev.short_description || rev.description || 'مراجعة مركّزة على كل محاور المنهج، عشان تدخل الامتحان وانت فاهم.';
      let priceText = formatPrice(rev.price_egp || 120);

      return `
        <article class="prem-revision-card">
          <div class="prem-card-glow"></div>
          
          <div class="prem-card-header">
            <div class="prem-live-pill">
              <span class="live-dot"></span>
              <span>متاح للحجز دلوقتي</span>
            </div>
            <span class="prem-faculty-badge">
              <i class="fa-solid fa-code"></i> EELU • CS
            </span>
          </div>

          <h2 class="prem-card-title">${escapeHtml(rev.title)}</h2>
          <p class="prem-card-desc">${escapeHtml(desc)}</p>

          <!-- ميزات المراجعة -->
          <ul class="prem-card-perks">
            <li><i class="fa-solid fa-circle-check"></i> شرح Full HD مركّز على اللي هييجي في الامتحان</li>
            <li><i class="fa-solid fa-circle-check"></i> سلايدات ومذكرات PDF جاهزة للطباعة</li>
            <li><i class="fa-solid fa-circle-check"></i> حل نماذج امتحانات سابقة بالتفصيل</li>
          </ul>

          <div class="prem-card-footer">
            <div class="prem-price-box">
              <span class="prem-price-lbl">سعر الاشتراك كامل</span>
              <span class="prem-price-val">${escapeHtml(priceText)}</span>
            </div>
            
            <div class="prem-actions-row">
              <a href="revision.html?id=${encodeURIComponent(rev.id)}" class="btn-prem-sub">
                <i class="fa-solid fa-circle-info"></i> التفاصيل
              </a>
              <a href="register.html?id=${encodeURIComponent(rev.id)}" class="btn-prem-main" aria-label="احجز مكانك في مراجعة ${escapeHtml(rev.title)}">
                <span>احجز مكانك</span>
                <i class="fa-solid fa-arrow-left"></i>
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    gridEl.hidden = false;
  }
}

async function initRevisionsPage() {
  await initNavbar({ activePage: 'revisions' });

  let loadingEl = document.getElementById('revisions-loading');
  let searchInput = document.getElementById('revisions-search-input');

  try {
    allRevisions = await getPublishedRevisions();

    if (loadingEl) loadingEl.hidden = true;

    renderRevisions(allRevisions);

    // بحث فوري بالاسم أو المحتوى
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        let term = searchInput.value.trim().toLowerCase();
        if (!term) {
          renderRevisions(allRevisions);
          return;
        }

        let filtered = allRevisions.filter(function (rev) {
          return (
            (rev.title && rev.title.toLowerCase().includes(term)) ||
            (rev.short_description && rev.short_description.toLowerCase().includes(term)) ||
            (rev.description && rev.description.toLowerCase().includes(term))
          );
        });

        renderRevisions(filtered);
      });
    }

  } catch (err) {
    console.error('Failed to load revisions:', err);
    if (loadingEl) loadingEl.hidden = true;
    let emptyEl = document.getElementById('revisions-empty');
    if (emptyEl) {
      emptyEl.innerHTML = `
        <div style="font-size:2.8rem; margin-bottom:12px; color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <h3 style="color:var(--color-primary); font-size:var(--text-lg); margin-bottom:8px;">مقدرتش أحمّل المراجعات دلوقتي</h3>
        <p style="color:var(--color-text-muted); font-size:var(--text-sm); max-width:400px; margin:0 auto;">
          اتأكد من النت وجرّب تاني.
        </p>
      `;
      emptyEl.hidden = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', initRevisionsPage);
