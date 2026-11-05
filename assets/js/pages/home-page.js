// ============================================================
// home-page.js
// منطق الصفحة الرئيسية وعرض المراجعات البارزة
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getPublishedRevisions, getApprovedReviews, submitStudentReview } from '../services/revisions-service.js';
import { formatPrice, escapeHtml } from '../core/utils.js';

function setupReviewModal() {
  const openBtn = document.getElementById('open-review-modal-btn');
  const modal = document.getElementById('submit-review-modal');
  const closeBtn = document.getElementById('close-review-modal-btn');
  const cancelBtn = document.getElementById('cancel-review-modal-btn');
  const form = document.getElementById('submit-review-form');
  const alertEl = document.getElementById('review-modal-alert');
  const submitBtn = document.getElementById('submit-review-btn');

  if (!modal || !openBtn) return;

  function openModal() {
    modal.hidden = false;
    if (alertEl) alertEl.hidden = true;
  }

  function closeModal() {
    modal.hidden = true;
    if (form) form.reset();
  }

  openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentName = document.getElementById('review-student-name').value.trim();
      const isAnonymous = document.getElementById('review-is-anonymous').checked;
      const branch = document.getElementById('review-branch').value.trim();
      const reviewText = document.getElementById('review-text').value.trim();

      if (!branch || !reviewText) {
        if (alertEl) {
          alertEl.className = 'alert alert--error';
          alertEl.textContent = 'يرجى كتابة الفرع ونص الرأي.';
          alertEl.hidden = false;
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';
      }

      try {
        await submitStudentReview({ studentName, isAnonymous, branch, reviewText });
        if (alertEl) {
          alertEl.className = 'alert alert--success';
          alertEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> شكراً جزيلاً لك! تم استلام رأيك بنجاح وسيظهر في الموقع فور اعتماده من الإدارة.';
          alertEl.hidden = false;
        }
        form.reset();
        setTimeout(() => {
          closeModal();
        }, 3000);
      } catch (err) {
        console.error('Review submit failed:', err);
        if (alertEl) {
          alertEl.className = 'alert alert--error';
          alertEl.textContent = 'حصل خطأ أثناء إرسال رأيك: ' + (err.message || 'حاول مرة أخرى');
          alertEl.hidden = false;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال الرأي';
        }
      }
    });
  }
}

// دمج الريفيوز الحية القادمة من قاعدة البيانات مع الكروت الافتراضية
async function loadDynamicReviews() {
  try {
    const liveReviews = await getApprovedReviews();
    if (!liveReviews || liveReviews.length === 0) return;

    // تحويل ريفيو قاعدة البيانات لشكل كارت التستيمونيال
    const mapped = liveReviews.map(r => {
      const name = r.is_anonymous || !r.student_name ? 'طالب (اسم مخفي للخصوصية)' : r.student_name;
      const initials = r.is_anonymous || !r.student_name ? '🔒' : name.substring(0, 2);
      return {
        q: r.review_text,
        n: name,
        h: '@' + (r.is_anonymous ? 'verified_student' : 'student'),
        c: r.branch || 'جامعة EELU',
        av: initials
      };
    });

    function buildCard(item) {
      return '<div class="t-card-3d">' +
        '<div class="t-user-row">' +
        '<div class="t-avatar">' + item.av + '</div>' +
        '<div class="t-meta">' +
        '<div class="t-name">' + item.n + '</div>' +
        '<div class="t-handle">' + item.h + '</div>' +
        '</div>' +
        '<div class="t-country">' + item.c + '</div>' +
        '</div>' +
        '<p class="t-text">"' + item.q + '"</p>' +
        '</div>';
    }

    // إدراجهم في أعمدة الماركيه
    for (let col = 1; col <= 4; col++) {
      const el = document.getElementById('t-col-' + col);
      if (el) {
        const subset = mapped.slice((col - 1) * 2, col * 2);
        if (subset.length > 0) {
          const cardsHtml = subset.map(buildCard).join('');
          el.insertAdjacentHTML('afterbegin', cardsHtml);
        }
      }
    }
  } catch (err) {
    console.warn('Could not load dynamic reviews:', err);
  }
}

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

  // 3. تفعيل نافذة إضافة رأي الطالب
  setupReviewModal();

  // 4. تحميل الآراء المعتمدة من Supabase ديناميكياً
  loadDynamicReviews();
}

document.addEventListener('DOMContentLoaded', initHomePage);
