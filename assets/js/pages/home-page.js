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
          alertEl.textContent = 'اكتب فرعك ورأيك الأول.';
          alertEl.hidden = false;
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> بابعت...';
      }

      try {
        await submitStudentReview({ studentName, isAnonymous, branch, reviewText });
        if (alertEl) {
          alertEl.className = 'alert alert--success';
          alertEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> شكراً ليك، رأيك وصلني وهيظهر في الموقع أول ما أراجعه.';
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
          alertEl.textContent = 'حصلت مشكلة وأنا باستلم رأيك: ' + (err.message || 'جرّب تاني') + '.';
          alertEl.hidden = false;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ابعت رأيي';
        }
      }
    });
  }
}

// ── آراء الطلاب (Marquee) ──
let allReviewCards = [];
let lastColsCount = 0;

function reviewColumnCount() {
  const w = window.innerWidth;
  return w <= 768 ? 2 : (w <= 1024 ? 3 : 4);
}

function buildReviewCard(item) {
  return '<div class="t-card-3d">' +
    '<div class="t-user-row">' +
    '<div class="t-avatar">' + item.av + '</div>' +
    '<div class="t-meta">' +
    '<div class="t-name">' + escapeHtml(item.n) + '</div>' +
    '<div class="t-handle">' + escapeHtml(item.h) + '</div>' +
    '</div>' +
    '<div class="t-country">' + escapeHtml(item.c) + '</div>' +
    '</div>' +
    '<p class="t-text">"' + escapeHtml(item.q) + '"</p>' +
    '</div>';
}

function renderReviewColumns() {
  if (!allReviewCards.length) return;

  const colsCount = reviewColumnCount();
  lastColsCount = colsCount;

  // توزيع الآراء على الأعمدة بالتناوب
  const buckets = Array.from({ length: colsCount }, () => []);
  allReviewCards.forEach((item, i) => buckets[i % colsCount].push(item));

  for (let col = 1; col <= 4; col++) {
    const el = document.getElementById('t-col-' + col);
    if (!el) continue;

    if (col > colsCount) { el.innerHTML = ''; continue; }

    // لو عدد الآراء قليل نكررها لحد ما العمود يتملي
    const base = buckets[col - 1].length
      ? buckets[col - 1]
      : [allReviewCards[(col - 1) % allReviewCards.length]];
    let list = base.slice();
    while (list.length < 6) list = list.concat(base);

    // نكرر المحتوى مرتين عشان لفة -50% تبقى سلسة من غير فراغ
    const html = list.map(buildReviewCard).join('');
    el.innerHTML = html + html;

    // السرعة ثابتة تقريباً مهما كان عدد الكروت
    el.style.animationDuration = Math.max(30, list.length * 7) + 's';
  }
}

async function loadDynamicReviews() {
  const stage = document.querySelector('.perspective-stage');
  try {
    const liveReviews = await getApprovedReviews();
    if (!liveReviews || liveReviews.length === 0) {
      if (stage) stage.style.display = 'none';
      return;
    }

    allReviewCards = liveReviews.slice(0, 40).map(function (r) {
      const hidden = r.is_anonymous || !r.student_name;
      const name = hidden ? 'طالب مجهول' : r.student_name;
      return {
        q: r.review_text,
        n: name,
        h: '@' + (hidden ? 'student' : 'student'),
        c: r.branch || 'جامعة EELU',
        av: hidden ? '<i class="fa-solid fa-user-secret"></i>' : escapeHtml(name.substring(0, 2))
      };
    });

    renderReviewColumns();

    // إعادة التوزيع لو عدد الأعمدة اتغير (تدوير الشاشة / تغيير الحجم)
    let t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (reviewColumnCount() !== lastColsCount) renderReviewColumns();
      }, 200);
    });
  } catch (err) {
    console.warn('Could not load dynamic reviews:', err);
    if (stage) stage.style.display = 'none';
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

          <h3 class="prem-card-title">${escapeHtml(rev.title)}</h3>
          <p class="prem-card-desc">${escapeHtml(desc)}</p>

          <!-- ميزات المراجعة الحصرية -->
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

async function initHomePage() {
  // 1. تشغيل شريط الملاحة
  const navbarPromise = initNavbar({ activePage: 'home' });

  // 2. تفعيل نافذة إضافة رأي الطالب
  setupReviewModal();

  // 3. جلب المراجعات المنشورة والآراء المعتمدة بالتوازي (Parallel Requests)
  const revisionsPromise = (async () => {
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
  })();

  const reviewsPromise = loadDynamicReviews();

  // تنفيذ الجميع بالتوازي
  await Promise.allSettled([navbarPromise, revisionsPromise, reviewsPromise]);
}

document.addEventListener('DOMContentLoaded', initHomePage);
