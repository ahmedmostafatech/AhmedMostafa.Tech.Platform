// ============================================================
// revision-page.js
// منطق صفحة تفاصيل مراجعة محددة (revision.html)
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getRevisionById } from '../services/revisions-service.js';
import { getQueryParam, formatPrice, formatDate, initSpotlightCards } from '../core/utils.js';

async function initRevisionDetailPage() {
  await initNavbar({ activePage: 'revisions' });

  const revisionId = getQueryParam('id') || getQueryParam('course_id');

  const loadingEl = document.getElementById('revision-loading');
  const errorEl = document.getElementById('revision-error');
  const contentEl = document.getElementById('revision-content');

  if (!revisionId) {
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) {
      errorEl.textContent = 'رابط المراجعة غير صحيح أو ينقصه المعرف.';
      errorEl.hidden = false;
    }
    return;
  }

  try {
    const rev = await getRevisionById(revisionId);

    if (loadingEl) loadingEl.hidden = true;

    if (!rev) {
      if (errorEl) {
        errorEl.textContent = 'عذراً، هذه المراجعة غير متاحة حالياً أو تم إيقاف التسجيل بها.';
        errorEl.hidden = false;
      }
      return;
    }

    // تعبئة البيانات
    document.title = `${rev.title} | أحمد مصطفى تك`;

    const titleEl = document.getElementById('rev-title');
    const descEl = document.getElementById('rev-desc');
    const priceEl = document.getElementById('rev-price');
    const expiryEl = document.getElementById('rev-expiry-badge');
    const regBtn = document.getElementById('rev-register-btn');

    if (titleEl) {
      // الحفاظ على خط الـ SVG المائل المعرج تحت العنوان
      titleEl.innerHTML = `
        ${rev.title}
        <svg viewBox="0 0 100 12" preserveAspectRatio="none">
          <path d="M0,7 Q25,0 50,7 T100,7" fill="none" stroke="#ffd154" stroke-width="3" stroke-linecap="round"/>
        </svg>
      `;
    }

    if (descEl) {
      descEl.textContent = rev.description || 'مراجعة شاملة وتفصيلية للمقرر مع مذكرات الشرح وحل نماذج الامتحانات النهائية.';
    }

    if (priceEl) {
      priceEl.textContent = formatPrice(rev.price_egp || 120);
    }

    if (expiryEl) {
      expiryEl.textContent = rev.access_until ? `سارية حتى: ${formatDate(rev.access_until)}` : 'سارية طوال الفصل الدراسي';
    }

    if (regBtn) {
      regBtn.href = `register.html?id=${encodeURIComponent(rev.id)}`;
    }

    if (contentEl) {
      contentEl.hidden = false;
    }

    // تشغيل تأثير الـ Spotlight Glow Cards التفاعلي على كل كروت الصفحة
    initSpotlightCards();

  } catch (err) {
    console.error('Failed to load revision details:', err);
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) {
      errorEl.textContent = 'تعذر تحميل بيانات المراجعة، يرجى المحاولة لاحقاً.';
      errorEl.hidden = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', initRevisionDetailPage);
