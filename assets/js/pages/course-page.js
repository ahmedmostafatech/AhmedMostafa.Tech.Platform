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

// تحويل ثواني الفيديو إلى صيغة مقروءة (مثلاً 24 دقيقة)
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  let mins = Math.round(seconds / 60);
  if (mins < 60) {
    return `${mins} دقيقة`;
  }
  let hours = Math.floor(mins / 60);
  let remMins = mins % 60;
  return `${hours} ساعة ${remMins > 0 ? `و ${remMins} دقيقة` : ''}`;
}

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
          ` : videos.map(function (v, vIdx) {
            let isFree = v.is_free;
            let duration = formatDuration(v.duration_sec);

            let actionBadge = '';
            if (userHasAccess) {
              actionBadge = `<a href="watch.html?video_id=${escapeHtml(v.id)}" class="badge badge--success" style="text-decoration:none;">▶ شاهد الآن</a>`;
            } else if (isFree) {
              actionBadge = `<a href="#free-lesson-section" class="badge badge--free" style="text-decoration:none;">🎁 درس مجاني</a>`;
            } else {
              actionBadge = `<span class="badge" style="background:var(--color-surface); color:var(--color-text-muted); border:1px solid var(--color-border);">🔒 للمشتركين</span>`;
            }

            return `
              <div class="curriculum-video-item ${isFree ? 'is-free' : ''}">
                <div style="display:flex; align-items:center; gap:var(--space-3);">
                  <span style="font-size:0.9rem; opacity:0.7;">
                    ${isFree || userHasAccess ? '▶' : '🔒'}
                  </span>
                  <div>
                    <div style="font-weight:600; color:var(--color-primary);">${escapeHtml(v.title)}</div>
                    ${duration ? `<div style="font-size:var(--text-xs); color:var(--color-text-muted); margin-top:2px;">⏱️ ${escapeHtml(duration)}</div>` : ''}
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
        <span style="font-size:2rem;">🎬</span>
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
      src="https://www.youtube-nocookie.com/embed/${escapeHtml(ytid)}?rel=0&modestbranding=1"
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

  // جلب الجلسة الحالية
  let session = await getSession();

  // جلب بيانات المادة
  currentCourse = await getCourseById(courseId);

  if (!currentCourse) {
    qs('#course-title').textContent = 'المادة غير متاحة حالياً';
    qs('#course-desc').textContent = 'راجع لوحة التحكم أو تواصل معنا لمعرفة مواعيد فتح الاشتراك.';
    return;
  }

  // فحص اشتراك المستخدم الحالي
  if (session && session.user) {
    try {
      userHasAccess = await checkCourseAccess(currentCourse.id);
    } catch (e) {
      userHasAccess = false;
    }
  }

  // تحديث نصوص الصفحة
  qs('#course-title').textContent = currentCourse.title;
  if (currentCourse.description) {
    qs('#course-desc').textContent = currentCourse.description;
  }

  let formattedPrice = formatPrice(currentCourse.price || 120);
  qs('#course-price').textContent = formattedPrice;

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
    let dashUrl = sitePath(ROUTES.DASHBOARD);
    [enrollBtn, bottomEnrollBtn, freeCtaBtn].forEach(function (btn) {
      if (!btn) return;
      btn.textContent = 'أنت مشترك بالفعل — ادخل للداشبورد ✅';
      btn.href = dashUrl;
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
