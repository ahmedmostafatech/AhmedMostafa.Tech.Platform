// ============================================================
// course-page.js
// منطق صفحة المادة والاشتراك
// ============================================================

import { getCourseById, getFreeVideo } from '../services/courses-service.js';
import { checkCourseAccess } from '../services/subscriptions-service.js';
import { getSession } from '../core/auth.js';
import { initNavbar } from '../components/navbar.js';
import {
  escapeHtml,
  formatPrice,
  formatDate,
  getQueryParam,
  sitePath,
  qs
} from '../core/utils.js';
import { ROUTES } from '../core/config.js';

let currentCourse = null;
let userHasAccess = false;

// عرض المنهج والمحاضرات
function renderCurriculum(modules) {
  let listEl = qs('#curriculum-list');
  let statsEl = qs('#curriculum-stats');
  if (!listEl) return;

  if (!modules || modules.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:var(--space-8); color:var(--color-text-muted); background:var(--color-surface); border-radius:var(--radius-lg);">
        جاري رفع وإعداد المحاضرات للمادة حالياً... تابعنا!
      </div>
    `;
    return;
  }

  let totalVideos = 0;
  modules.forEach(function (m) {
    totalVideos += (m.videos && m.videos.length) || 0;
  });

  if (statsEl) {
    statsEl.textContent = `${modules.length} فصول • ${totalVideos} فيديو`;
  }

  listEl.innerHTML = modules.map(function (mod, modIndex) {
    let videos = mod.videos || [];
    return `
      <div class="curriculum-module">
        <div class="curriculum-module__header">
          <h3>
            <span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; background:rgba(54,90,162,0.12); color:var(--color-accent); border-radius:50%; font-size:var(--text-xs); font-weight:800;">
              ${modIndex + 1}
            </span>
            ${escapeHtml(mod.title)}
          </h3>
          <span style="font-size:var(--text-xs); color:var(--color-text-muted); font-weight:600;">
            ${videos.length} دروس
          </span>
        </div>
        <div>
          ${videos.length === 0 ? `
            <div style="padding:var(--space-3) var(--space-5); font-size:var(--text-xs); color:var(--color-text-light);">
              قريباً رفع دروس هذا الفصل
            </div>
          ` : videos.map(function (v) {
      let isFree = v.is_free;

      let actionBadge = '';
      if (userHasAccess) {
        let watchUrl = `${sitePath(ROUTES.WATCH)}?course_id=${encodeURIComponent(currentCourse.id)}&video_id=${encodeURIComponent(v.id)}`;
        actionBadge = `<a href="${watchUrl}" class="badge badge--success" style="text-decoration:none;">▶ شاهد الآن</a>`;
      } else if (isFree) {
        actionBadge = `<a href="#free-lesson-section" class="badge badge--free" style="text-decoration:none;"> درس مجاني</a>`;
      } else {
        actionBadge = `<span class="badge" style="background:var(--color-surface); color:var(--color-text-muted); border:1px solid var(--color-border);"> للمشتركين</span>`;
      }

      return `
              <div class="curriculum-video-item ${isFree ? 'is-free' : ''}">
                <div style="display:flex; align-items:center; gap:var(--space-3);">
                  <span style="font-size:0.9rem; opacity:0.7;">
                    ${isFree || userHasAccess ? '▶' : ''}
                  </span>
                  <div>
                    <div style="font-weight:600; color:var(--color-primary);">${escapeHtml(v.title)}</div>
                  </div>
                </div>
                <div>
                  ${actionBadge}
                </div>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// عرض مشغل الفيديو المجاني
function renderFreeVideo(freeVideo) {
  let container = qs('#free-video-container');
  let titleEl = qs('#free-video-title');
  if (!container) return;

  if (!freeVideo || !freeVideo.video_sources || !freeVideo.video_sources.youtube_id) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:rgba(255,255,255,0.7); gap:8px;">
        <span style="font-size:2rem;"></span>
        <span>جاري تجهيز الفيديو التجريبي للمادة</span>
      </div>
    `;
    return;
  }

  if (titleEl && freeVideo.title) {
    titleEl.textContent = freeVideo.title;
  }

  let ytid = freeVideo.video_sources.youtube_id;
  container.innerHTML = `
    <iframe
      src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytid)}?rel=0&modestbranding=1"
      title="${escapeHtml(freeVideo.title || 'المحاضرة المجانية')}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
  `;
}

// تهيئة الصفحة وتعبئة البيانات
async function init() {
  initNavbar({ activePage: 'course' });

  let courseId = getQueryParam('id') || getQueryParam('course_id');

  // جلب بيانات المادة
  try {
    currentCourse = await getCourseById(courseId);
  } catch (err) {
    console.error('Failed to load course:', err);
    currentCourse = null;
  }

  if (!currentCourse) {
    qs('#course-title').textContent = 'المادة غير متاحة حالياً';
    qs('#course-desc').textContent = 'راجع لوحة التحكم أو تواصل معنا لمعرفة مواعيد فتح الاشتراك.';
    let curriculumList = qs('#curriculum-list');
    if (curriculumList) {
      curriculumList.innerHTML = `
        <div style="text-align:center; padding:var(--space-8); color:var(--color-text-muted); background:var(--color-surface); border-radius:var(--radius-lg);">
          لا توجد مادة منشورة بهذا المعرّف حالياً.
        </div>
      `;
    }
    let freeContainer = qs('#free-video-container');
    if (freeContainer) {
      freeContainer.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100%; color:rgba(255,255,255,0.7);">
          المحتوى غير متوفر.
        </div>
      `;
    }
    let enrollBtn = qs('#course-enroll-btn');
    if (enrollBtn) {
      enrollBtn.classList.add('disabled');
      enrollBtn.setAttribute('aria-disabled', 'true');
      enrollBtn.removeAttribute('href');
    }
    return;
  }

  // فحص اشتراك المستخدم الحالي
  try {
    let session = await getSession();
    if (session && session.user) {
      userHasAccess = await checkCourseAccess(currentCourse.id);
    }
  } catch (e) {
    console.warn('Check access failed:', e);
    userHasAccess = false;
  }

  // تحديث نصوص الصفحة
  qs('#course-title').textContent = currentCourse.title;
  if (currentCourse.description) {
    qs('#course-desc').textContent = currentCourse.description;
  }

  // قراءة السعر من price_egp
  let priceVal = currentCourse.price_egp !== undefined && currentCourse.price_egp !== null
    ? currentCourse.price_egp
    : 120;
  qs('#course-price').textContent = formatPrice(priceVal);

  if (currentCourse.access_until) {
    let dateStr = formatDate(currentCourse.access_until);
    qs('#course-expiry-badge').textContent = `متاح حتى ${dateStr}`;
  }

  // أزرار الاشتراك
  let checkoutUrl = `${sitePath(ROUTES.CHECKOUT)}?course_id=${encodeURIComponent(currentCourse.id)}`;
  let enrollBtn = qs('#course-enroll-btn');
  let bottomEnrollBtn = qs('#bottom-enroll-btn');
  let freeCtaBtn = qs('#free-lesson-cta-btn');

  if (userHasAccess) {
    let watchUrl = `${sitePath(ROUTES.WATCH)}?course_id=${encodeURIComponent(currentCourse.id)}`;
    [enrollBtn, bottomEnrollBtn, freeCtaBtn].forEach(function (btn) {
      if (!btn) return;
      btn.textContent = 'أنت مشترك بالفعل — شاهد المحاضرات ▶';
      btn.href = watchUrl;
      btn.classList.remove('btn--accent');
      btn.classList.add('btn--primary');
    });
  } else {
    [enrollBtn, bottomEnrollBtn, freeCtaBtn].forEach(function (btn) {
      if (!btn) return;
      btn.href = checkoutUrl;
    });
  }

  // جلب الفيديو المجاني
  let freeVideo = await getFreeVideo(currentCourse.id);
  renderFreeVideo(freeVideo);

  // رسم المنهج
  renderCurriculum(currentCourse.modules || []);
}

init();
