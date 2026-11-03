// ============================================================
// home-page.js
// منطق الصفحة الرئيسية
// ============================================================

import { initNavbar }        from '../components/navbar.js';
import { getPublishedCourse } from '../services/courses-service.js';
import { getSession }         from '../core/auth.js';
import { formatPrice, formatDate, escapeHtml, sitePath, daysLeft } from '../core/utils.js';
import { ROUTES }             from '../core/config.js';

// ============================================================
// 1. بناء قسم الـ Hero
// ============================================================

function renderHero(session) {
  let ctaHref  = session ? sitePath(ROUTES.DASHBOARD) : sitePath(ROUTES.COURSE);
  let ctaLabel = session ? 'اتفرج على مراجعاتك' : 'اشترك دلوقتي';

  let heroEl = document.getElementById('hero-content');
  if (!heroEl) return;

  heroEl.innerHTML = `
    <span class="hero__eyebrow">
      🎓 مراجعات EELU الجامعة المفتوحة
    </span>

    <h1 class="hero__title">
      ذاكر صح<br>
      <span class="hero__title-accent">واجح بثقة</span>
    </h1>

    <p class="hero__desc">
      مراجعات فيديو احترافية لطلاب EELU — مسجّلة بوضوح وشرح مبسّط،
      تشوفها امتى ما حبيت وتذاكر بالراحة.
    </p>

    <div class="hero__actions">
      <a href="${escapeHtml(ctaHref)}" class="btn btn--accent btn--xl" id="hero-cta-btn">
        ${escapeHtml(ctaLabel)} →
      </a>
      <a href="#free-preview" class="btn btn--ghost btn--lg" id="hero-free-btn">
        شوف الدرس المجاني
      </a>
    </div>

    <div class="hero__stats">
      <div>
        <div class="hero__stat-value num">+500</div>
        <div class="hero__stat-label">طالب مشترك</div>
      </div>
      <div>
        <div class="hero__stat-value num">4.9 ⭐</div>
        <div class="hero__stat-label">تقييم الطلاب</div>
      </div>
      <div>
        <div class="hero__stat-value">EELU</div>
        <div class="hero__stat-label">الجامعة المفتوحة</div>
      </div>
    </div>
  `;
}

// ============================================================
// 2. بناء كارد المادة
// ============================================================

function renderCourseCard(course) {
  let cardEl = document.getElementById('course-card-container');
  if (!cardEl) return;

  if (!course) {
    cardEl.innerHTML = `
      <div class="alert alert--info" style="max-width:500px; margin-inline:auto;">
        المواد قريباً — ابقى متابعنا! 🔜
      </div>
    `;
    return;
  }

  let daysRemaining = daysLeft(course.access_until + 'T23:59:59');
  let accessUntilText = formatDate(course.access_until);

  // حساب عدد الفيديوهات
  let totalVideos = 0;
  let freeVideos  = 0;
  if (course.modules) {
    course.modules.forEach(function (m) {
      if (m.videos) {
        totalVideos += m.videos.length;
        freeVideos  += m.videos.filter(function (v) { return v.is_free; }).length;
      }
    });
  }

  cardEl.innerHTML = `
    <div class="course-card">
      <div class="course-card__header">
        <span class="course-card__tag">📚 متاح دلوقتي</span>
        <h3 class="course-card__title">${escapeHtml(course.title)}</h3>
        <p class="course-card__desc">${escapeHtml(course.description || '')}</p>
      </div>

      <div class="course-card__body">
        <div class="course-card__features">
          <div class="course-card__feature">
            <div class="course-card__feature-icon">🎬</div>
            <span>${totalVideos} فيديو — فيهم ${freeVideos} مجاني تشوفه دلوقتي</span>
          </div>
          <div class="course-card__feature">
            <div class="course-card__feature-icon">📅</div>
            <span>الاشتراك لحد ${escapeHtml(accessUntilText)} (${daysRemaining} يوم متبقي)</span>
          </div>
          <div class="course-card__feature">
            <div class="course-card__feature-icon">💳</div>
            <span>دفع بفودافون كاش أو إنستاباي</span>
          </div>
          <div class="course-card__feature">
            <div class="course-card__feature-icon">🔒</div>
            <span>اشتراكك محمي لحد آخر الترم</span>
          </div>
        </div>

        <div class="course-card__price-row">
          <div>
            <div class="course-card__price num">${escapeHtml(formatPrice(course.price))}</div>
            <div class="course-card__price-sub">لكل الترم الدراسي</div>
          </div>
          <a href="${escapeHtml(sitePath(ROUTES.COURSE) + '?id=' + encodeURIComponent(course.id))}"
             class="btn btn--accent btn--lg" id="course-subscribe-btn">
            اشترك دلوقتي
          </a>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// 3. بناء الدرس المجاني
// ============================================================

function renderFreePreview(course) {
  let previewEl = document.getElementById('free-preview-container');
  if (!previewEl) return;

  // دوّر على الفيديو المجاني
  let freeVideo = null;
  if (course && course.modules) {
    for (let m of course.modules) {
      if (m.videos) {
        freeVideo = m.videos.find(function (v) {
          return v.is_free && v.video_sources && v.video_sources.youtube_id;
        });
        if (freeVideo) break;
      }
    }
  }

  if (!freeVideo) {
    previewEl.innerHTML = `
      <div class="alert alert--info" style="max-width:600px; margin-inline:auto; text-align:center;">
        الدرس المجاني قريباً — ترقّب! 🎬
      </div>
    `;
    return;
  }

  let videoId = freeVideo.video_sources.youtube_id;

  previewEl.innerHTML = `
    <div style="max-width:680px; margin-inline:auto;">
      <div style="
        border-radius: var(--radius-xl);
        overflow: hidden;
        box-shadow: var(--shadow-xl);
        aspect-ratio: 16/9;
        background: #000;
      ">
        <iframe
          id="free-video-frame"
          src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1"
          title="${escapeHtml(freeVideo.title)}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
          style="width:100%; height:100%; display:block;"
        ></iframe>
      </div>
      <p style="
        text-align:center;
        margin-top: var(--space-3);
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      ">
        📌 ${escapeHtml(freeVideo.title)} — مجاني تماماً
      </p>
    </div>
  `;
}

// ============================================================
// 4. FAQ
// ============================================================

function renderFAQ() {
  let faqEl = document.getElementById('faq-list');
  if (!faqEl) return;

  let items = [
    {
      q: 'إيه الـ EELU دي؟',
      a: 'EELU هي الجامعة المصرية للتعلم الإلكتروني — الجامعة المفتوحة. مراجعاتنا مخصوصة ليها ومتكيّفة مع مناهجها بالظبط.'
    },
    {
      q: 'أقدر أشوف الفيديوهات امتى وفين؟',
      a: 'في أي وقت ومن أي جهاز! الفيديوهات على يوتيوب Unlisted — مش هتبان في البحث، بس أنت هتشوفها من خلال الموقع بعد ما تشترك.'
    },
    {
      q: 'إزاي أدفع؟',
      a: 'بتحوّل المبلغ على فودافون كاش أو إنستاباي، وبعدين بترفع صورة الإيصال في الموقع. بعد مراجعة الأدمن هيفعّل اشتراكك على طول.'
    },
    {
      q: 'لو مش عاجبني — فيه استرداد؟',
      a: 'في الدرس المجاني عشان تتأكد الأول! بس بعد الاشتراك مفيش استرداد لأن الفيديوهات بتبقى متاحة ليك من اللحظة دي.'
    },
    {
      q: 'الاشتراك لحد امتى؟',
      a: 'لحد آخر يوم في الترم الدراسي الحالي — التاريخ بيتحدد وقت الاشتراك وبيظهر لك في لوحة التحكم.'
    },
    {
      q: 'أقدر أشارك الاشتراك مع صاحبي؟',
      a: 'الاشتراك شخصي لحسابك على جوجل بس. المشاركة بتتعدى شروط الاستخدام وبيبقى فيه علامة مائية بإيميلك على الفيديو.'
    }
  ];

  faqEl.innerHTML = items.map(function (item, i) {
    return `
      <details class="faq-item" id="faq-${i}">
        <summary class="faq-question">
          <span>${escapeHtml(item.q)}</span>
          <span class="faq-question__icon" aria-hidden="true">+</span>
        </summary>
        <div class="faq-answer">${escapeHtml(item.a)}</div>
      </details>
    `;
  }).join('');
}

// ============================================================
// 5. Skeleton loaders (أثناء التحميل)
// ============================================================

function showCourseCardSkeleton() {
  let cardEl = document.getElementById('course-card-container');
  if (!cardEl) return;
  cardEl.innerHTML = `
    <div class="course-card" style="max-width:520px; margin-inline:auto;">
      <div class="course-card__header" style="padding:var(--space-6);">
        <div class="skeleton" style="height:18px; width:80px; margin-bottom:12px; border-radius:99px;"></div>
        <div class="skeleton" style="height:28px; width:80%; margin-bottom:10px;"></div>
        <div class="skeleton" style="height:16px; width:60%;"></div>
      </div>
      <div class="course-card__body">
        ${[1,2,3,4].map(function () {
          return `<div class="skeleton" style="height:16px; margin-bottom:12px; border-radius:6px;"></div>`;
        }).join('')}
        <div class="skeleton" style="height:52px; border-radius:99px; margin-top:16px;"></div>
      </div>
    </div>
  `;
}

// ============================================================
// 6. Init
// ============================================================

async function init() {
  // تشغيل الـ Navbar
  initNavbar({ activePage: 'home' });

  // جلب الجلسة لتخصيص زر الـ hero
  let session = null;
  try {
    session = await getSession();
  } catch (err) {
    console.warn('home-page: getSession failed', err);
  }

  // بناء الـ Hero
  renderHero(session);

  // skeleton أثناء التحميل
  showCourseCardSkeleton();

  // جلب المادة
  let course = null;
  try {
    course = await getPublishedCourse();
  } catch (err) {
    console.error('home-page: getPublishedCourse failed', err);
  }

  // بناء الكارد والدرس المجاني
  renderCourseCard(course);
  renderFreePreview(course);

  // FAQ
  renderFAQ();

  // إظهار الصفحة (إزالة guard-pending لو موجودة)
  document.documentElement.classList.remove('guard-pending');
}

init();
