// ============================================================
// watch-page.js
// منطق صفحة مشاهدة المحاضرات وقائمة التشغيل
// ============================================================

import { requireAuth } from '../core/guard.js';
import { getMyProfile } from '../core/auth.js';
import { getCourseById } from '../services/courses-service.js';
import { checkCourseAccess } from '../services/subscriptions-service.js';
import { createPlayer } from '../components/player.js';
import {
  escapeHtml,
  getQueryParam,
  sitePath,
  qs,
  qsa
} from '../core/utils.js';
import { ROUTES } from '../core/config.js';

let currentSession = null;
let currentProfile = null;
let currentCourse = null;
let userHasAccess = false;
let currentVideoId = null;
let flatVideosList = [];

// عناصر الصفحة
let topbarCourseTitle = qs('#topbar-course-title');
let userDisplayBadge = qs('#user-display-badge');
let coursePageLink = qs('#course-page-link');

let playerBox = qs('#watch-player-box');
let videoCurrentTitle = qs('#video-current-title');
let videoModuleTag = qs('#video-module-tag');
let videoAccessBadge = qs('#video-access-badge');
let videoDurationTag = qs('#video-duration-tag');

let prevBtn = qs('#prev-video-btn');
let nextBtn = qs('#next-video-btn');
let playlistContainer = qs('#playlist-container');
let playlistCountBadge = qs('#playlist-count-badge');

// عرض الفيديو المختار
function loadVideo(videoItem) {
  if (!videoItem) return;

  currentVideoId = videoItem.id;

  // تحديث بيانات العنوان والتصنيف
  if (videoCurrentTitle) videoCurrentTitle.textContent = videoItem.title;
  if (videoModuleTag) videoModuleTag.textContent = videoItem.moduleTitle || 'محاضرة';
  if (videoDurationTag) videoDurationTag.textContent = ' منصة أحمد مصطفى تك';

  let isFree = videoItem.is_free;
  let canWatch = userHasAccess || isFree;

  if (canWatch) {
    if (videoAccessBadge) {
      videoAccessBadge.className = isFree ? 'badge badge--free' : 'badge badge--success';
      videoAccessBadge.textContent = isFree ? ' درس مجاني' : ' مشمول باشتراكك';
    }

    let ytid = (videoItem.video_sources && videoItem.video_sources.youtube_id) || '';
    createPlayer(playerBox, {
      youtubeId: ytid,
      title: videoItem.title,
      userEmail: (currentProfile && currentProfile.email) || currentSession.user.email,
      userName: (currentProfile && currentProfile.full_name) || ''
    });
  } else {
    if (videoAccessBadge) {
      videoAccessBadge.className = 'badge badge--warning';
      videoAccessBadge.textContent = ' للمشتركين فقط';
    }

    let checkoutUrl = `${sitePath(ROUTES.CHECKOUT)}?course_id=${encodeURIComponent(currentCourse.id)}`;

    if (playerBox) {
      playerBox.innerHTML = `
        <div class="locked-video-card">
          <div style="font-size:3.5rem; margin-bottom:var(--space-3);"></div>
          <h2 style="font-size:var(--text-2xl); font-weight:800; color:#fff; margin-bottom:var(--space-2);">
            هذه المحاضرة مخصصة للمشتركين
          </h2>
          <p style="font-size:var(--text-sm); color:#94a3b8; max-width:480px; line-height:1.7; margin-bottom:var(--space-5);">
            اشترك الآن في مادة "${escapeHtml(currentCourse.title)}" لفتح جميع فيديوهات الشرح وحل امتحانات الفاينال والمتابعة حتى ليلة الامتحان!
          </p>
          <a href="${escapeHtml(checkoutUrl)}" class="btn btn--accent btn--lg" style="padding-inline:var(--space-8);">
            اشترك الآن وفعل حسابك 
          </a>
        </div>
      `;
    }
  }

  // تحديث حالة الأزرار السابق والتالي
  let currentIndex = flatVideosList.findIndex(function (v) { return v.id === videoItem.id; });
  if (currentIndex >= 0) {
    if (prevBtn) prevBtn.disabled = currentIndex === 0;
    if (nextBtn) nextBtn.disabled = currentIndex === flatVideosList.length - 1;
  }

  // تحديث تمييز العنصر النشط في القائمة الجانبية
  qsa('.playlist-item').forEach(function (el) {
    if (el.dataset.videoId === videoItem.id) {
      el.classList.add('active');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      el.classList.remove('active');
    }
  });

  // تحديث الرابط في المتصفح دون إعادة تحميل الصفحة
  let url = new URL(window.location.href);
  url.searchParams.set('video_id', videoItem.id);
  if (currentCourse && currentCourse.id) {
    url.searchParams.set('course_id', currentCourse.id);
  }
  window.history.replaceState({}, document.title, url.toString());
}

// رسم القائمة الجانبية
function renderPlaylist(modules) {
  flatVideosList = [];

  let html = modules.map(function (mod, modIdx) {
    let videos = mod.videos || [];

    let videosHtml = videos.map(function (v) {
      // إلحاق اسم الوحدة بالفيديو
      v.moduleTitle = mod.title;
      flatVideosList.push(v);

      let isFree = v.is_free;
      let canWatch = userHasAccess || isFree;
      let isActive = v.id === currentVideoId;

      let icon = canWatch ? '▶' : '';
      let badge = '';
      if (isFree) {
        badge = '<span class="badge badge--free" style="font-size:10px; padding:2px 6px;">مجاني</span>';
      }

      return `
        <a
          href="javascript:void(0)"
          class="playlist-item ${isActive ? 'active' : ''} ${!canWatch ? 'locked' : ''}"
          data-video-id="${escapeHtml(v.id)}"
        >
          <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
            <span style="font-size:0.85rem; opacity:0.7;">${icon}</span>
            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${escapeHtml(v.title)}
            </span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            ${badge}
          </div>
        </a>
      `;
    }).join('');

    return `
      <div class="playlist-module">
        <div class="playlist-module__title">
          <span>${modIdx + 1}. ${escapeHtml(mod.title)}</span>
          <span>${videos.length} دروس</span>
        </div>
        <div>${videosHtml}</div>
      </div>
    `;
  }).join('');

  if (playlistContainer) playlistContainer.innerHTML = html;
  if (playlistCountBadge) playlistCountBadge.textContent = `${flatVideosList.length} محاضرات`;

  // ربط أحداث النقر على عناصر القائمة
  qsa('.playlist-item').forEach(function (el) {
    el.addEventListener('click', function () {
      let vidId = el.dataset.videoId;
      let target = flatVideosList.find(function (v) { return v.id === vidId; });
      if (target) {
        loadVideo(target);
      }
    });
  });
}

// تهيئة الصفحة
async function init() {
  currentSession = await requireAuth();
  if (!currentSession) return;

  try {
    currentProfile = await getMyProfile(false);
  } catch (err) {
    console.warn('Failed to load profile:', err);
  }

  // تحديث شارة المستخدم
  let displayName = (currentProfile && currentProfile.full_name) || currentSession.user.email.split('@')[0];
  if (userDisplayBadge) userDisplayBadge.textContent = ` ${displayName}`;

  let targetVideoId = getQueryParam('video_id');
  let targetCourseId = getQueryParam('course_id');

  // جلب بيانات المادة
  try {
    currentCourse = await getCourseById(targetCourseId);
  } catch (err) {
    console.error('Failed to load course:', err);
    currentCourse = null;
  }

  if (!currentCourse) {
    if (topbarCourseTitle) topbarCourseTitle.textContent = 'المادة غير متاحة';
    if (playerBox) {
      playerBox.innerHTML = `
        <div class="locked-video-card">
          <h2>عذراً، المادة المطلوبة غير متوفرة أو غير منشورة</h2>
          <a href="dashboard.html" class="btn btn--secondary" style="margin-top:16px;">العودة للداشبورد</a>
        </div>
      `;
    }
    return;
  }

  if (topbarCourseTitle) topbarCourseTitle.textContent = currentCourse.title;
  if (coursePageLink) {
    coursePageLink.href = `course.html?id=${encodeURIComponent(currentCourse.id)}`;
  }

  // فحص صلاحية اشتراك المستخدم
  try {
    userHasAccess = await checkCourseAccess(currentCourse.id);
  } catch (e) {
    console.warn('checkCourseAccess failed:', e);
    userHasAccess = false;
  }

  // بناء القائمة المسطحة
  let modules = currentCourse.modules || [];
  renderPlaylist(modules);

  // اختيار الفيديو المراد عرضه:
  // 1. لو محدد في الرابط video_id
  // 2. أو أول فيديو متاح
  let selected = null;
  if (targetVideoId) {
    selected = flatVideosList.find(function (v) { return v.id === targetVideoId; });
  }
  if (!selected && flatVideosList.length > 0) {
    // لو مش مشترك، يفضل فتح أول فيديو مجاني إن وُجد
    if (!userHasAccess) {
      selected = flatVideosList.find(function (v) { return v.is_free; }) || flatVideosList[0];
    } else {
      selected = flatVideosList[0];
    }
  }

  if (selected) {
    loadVideo(selected);
  } else {
    if (playerBox) {
      playerBox.innerHTML = `
        <div class="locked-video-card">
          <h3>لا توجد محاضرات متاحة في هذه المادة بعد.</h3>
        </div>
      `;
    }
  }

  // أحداث أزرار السابق والتالي
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      let idx = flatVideosList.findIndex(function (v) { return v.id === currentVideoId; });
      if (idx > 0) {
        loadVideo(flatVideosList[idx - 1]);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      let idx = flatVideosList.findIndex(function (v) { return v.id === currentVideoId; });
      if (idx >= 0 && idx < flatVideosList.length - 1) {
        loadVideo(flatVideosList[idx + 1]);
      }
    });
  }
}

init();
