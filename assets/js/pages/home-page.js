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
      let desc = rev.short_description || rev.description || 'مراجعة مكثفة وشاملة لجميع محاور المنهج واجتياز الامتحان العملي والنظري بنجاح.';
      let priceText = formatPrice(rev.price_egp || 120);

      return `
        <article class="prem-revision-card">
          <div class="prem-card-glow"></div>
          
          <div class="prem-card-header">
            <div class="prem-live-pill">
              <span class="live-dot"></span>
              <span>متاح للحجز الفوري</span>
            </div>
            <span class="prem-faculty-badge">
              <i class="fa-solid fa-code"></i> EELU • CS
            </span>
          </div>

          <h3 class="prem-card-title">${escapeHtml(rev.title)}</h3>
          <p class="prem-card-desc">${escapeHtml(desc)}</p>

          <!-- ميزات المراجعة الحصرية -->
          <ul class="prem-card-perks">
            <li><i class="fa-solid fa-circle-check"></i> شروحات Full HD مركزة ومباشرة على الامتحان</li>
            <li><i class="fa-solid fa-circle-check"></i> سلايدات الشرح ومذكرات PDF جاهزة للطباعة</li>
            <li><i class="fa-solid fa-circle-check"></i> حل نماذج الامتحانات السابقة بالتفصيل</li>
          </ul>

          <div class="prem-card-footer">
            <div class="prem-price-box">
              <span class="prem-price-lbl">سعر الاشتراك الكامل</span>
              <span class="prem-price-val">${escapeHtml(priceText)}</span>
            </div>
            
            <div class="prem-actions-row">
              <a href="revision.html?id=${encodeURIComponent(rev.id)}" class="btn-prem-sub">
                <i class="fa-solid fa-circle-info"></i> التفاصيل
              </a>
              <a href="register.html?id=${encodeURIComponent(rev.id)}" class="btn-prem-main">
                <span>احجز الآن</span>
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
