// ============================================================
// revision-page.js
// منطق صفحة تفاصيل مراجعة محددة (revision.html)
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getRevisionById } from '../services/revisions-service.js';
import { getQueryParam, formatPrice, formatDate, escapeHtml } from '../core/utils.js';

async function initRevisionDetailPage() {
  await initNavbar({ activePage: 'revisions' });

  let revisionId = getQueryParam('id') || getQueryParam('course_id');

  let loadingEl = document.getElementById('revision-loading');
  let errorEl = document.getElementById('revision-error');
  let contentEl = document.getElementById('revision-content');

  if (!revisionId) {
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) {
      errorEl.textContent = 'رابط المراجعة غير صحيح أو ينقصه المعرف.';
      errorEl.hidden = false;
    }
    return;
  }

  try {
    let rev = await getRevisionById(revisionId);

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

    let titleEl = document.getElementById('rev-title');
    let descEl = document.getElementById('rev-desc');
    let priceEl = document.getElementById('rev-price');
    let expiryEl = document.getElementById('rev-expiry-badge');
    let regBtn = document.getElementById('rev-register-btn');

    if (titleEl) titleEl.textContent = rev.title;
    if (descEl) descEl.textContent = rev.description || 'مراجعة شاملة وتفصيلية للمقرر مع مذكرات الشرح وحل نماذج الامتحانات.';
    if (priceEl) priceEl.textContent = formatPrice(rev.price_egp || 120);

    if (expiryEl) {
      expiryEl.textContent = rev.access_until ? `سارية حتى: ${formatDate(rev.access_until)}` : 'سارية طوال الفصل الدراسي';
    }

    if (regBtn) {
      regBtn.href = `register.html?id=${encodeURIComponent(rev.id)}`;
    }

    if (contentEl) contentEl.hidden = false;

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

