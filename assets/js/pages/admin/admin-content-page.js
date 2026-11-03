// ============================================================
// admin-content-page.js
// منطق إدارة المواد والوحدات والفيديوهات
// ============================================================

import { requireAdmin } from '../../core/guard.js';
import {
  getAdminContentTree,
  updateCourse,
  createModule,
  deleteModule,
  createVideoWithSource,
  updateVideoWithSource,
  deleteVideo
} from '../../services/admin-service.js';
import {
  escapeHtml,
  formatPrice,
  formatDate,
  setButtonLoading,
  getErrorMessage,
  qs,
  qsa
} from '../../core/utils.js';

let treeContainer = qs('#courses-tree-container');
let refreshBtn = qs('#refresh-content-btn');
let alertBox = qs('#content-alert');

let videoModal = qs('#video-modal');
let videoModalClose = qs('#video-modal-close');
let videoForm = qs('#video-form');
let videoIdHidden = qs('#video-id-hidden');
let videoModuleIdHidden = qs('#video-module-id-hidden');
let videoTitleInput = qs('#video-title-input');
let videoDurationInput = qs('#video-duration-input');
let videoYoutubeInput = qs('#video-youtube-input');
let videoIsFreeInput = qs('#video-is-free-input');
let videoSubmitBtn = qs('#video-submit-btn');

let loadedCourses = [];

function showAlert(message, type = 'info') {
  if (!alertBox) return;
  alertBox.className = `alert alert--${type}`;
  alertBox.textContent = message;
  alertBox.hidden = false;
  setTimeout(function () {
    alertBox.hidden = true;
  }, 4000);
}

// استخراج الـ YouTube ID إذا أدخل الأدمن الرابط كاملاً
function extractYouTubeId(urlOrId) {
  if (!urlOrId) return '';
  let str = urlOrId.trim();

  // لو كان ID عادي (11 حرف)
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // لو رابط كامل
  let match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : str;
}

function openAddVideoModal(moduleId) {
  videoIdHidden.value = '';
  videoModuleIdHidden.value = moduleId;
  videoTitleInput.value = '';
  videoDurationInput.value = '30';
  videoYoutubeInput.value = '';
  videoIsFreeInput.checked = false;

  qs('#video-modal-title').textContent = 'إضافة محاضرة جديدة 🎬';
  videoModal.classList.add('show');
}

function openEditVideoModal(moduleId, video) {
  videoIdHidden.value = video.id;
  videoModuleIdHidden.value = moduleId;
  videoTitleInput.value = video.title || '';
  videoDurationInput.value = Math.round((video.duration_sec || 0) / 60) || '';
  videoYoutubeInput.value = (video.video_sources && video.video_sources.youtube_id) || '';
  videoIsFreeInput.checked = !!video.is_free;

  qs('#video-modal-title').textContent = 'تعديل المحاضرة ✏️';
  videoModal.classList.add('show');
}

function renderTree(courses) {
  if (!treeContainer) return;

  if (!courses || courses.length === 0) {
    treeContainer.innerHTML = `
      <div style="text-align:center; padding:var(--space-8); background:#fff; border-radius:var(--radius-xl); color:#64748b;">
        لا توجد مواد مسجلة حالياً في قاعدة البيانات.
      </div>
    `;
    return;
  }

  treeContainer.innerHTML = courses.map(function (course) {
    let modules = course.modules || [];

    return `
      <div class="content-tree-course" data-course-id="${escapeHtml(course.id)}">
        <!-- هيدر المادة -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--space-3); border-bottom:1px solid #e2e8f0; padding-bottom:var(--space-4);">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge ${course.is_published ? 'badge--success' : 'badge--warning'}">
                ${course.is_published ? 'منشورة للطلاب ✅' : 'مسودة غير منشورة 🔒'}
              </span>
              <h2 style="font-size:var(--text-xl); font-weight:800; color:var(--color-primary); margin:0;">
                ${escapeHtml(course.title)}
              </h2>
            </div>
            <p style="font-size:var(--text-xs); color:var(--color-text-muted); margin:4px 0 0;">
              السعر: <strong>${formatPrice(course.price)}</strong> • ينتهي الاشتراك: <strong>${formatDate(course.access_until)}</strong>
            </p>
          </div>

          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn--secondary btn--sm btn-toggle-publish" data-id="${escapeHtml(course.id)}" data-published="${course.is_published}">
              ${course.is_published ? 'إخفاء (جعله مسودة)' : 'نشر للطلاب 🚀'}
            </button>
            <button type="button" class="btn btn--primary btn--sm btn-add-module" data-course-id="${escapeHtml(course.id)}">
              ➕ إضافة وحدة / فصل
            </button>
          </div>
        </div>

        <!-- قائمة الفصول والوحدات -->
        <div>
          ${modules.length === 0 ? `
            <div style="padding:var(--space-5); text-align:center; color:#94a3b8; font-size:var(--text-xs);">
              لا توجد وحدات بعد. اضغط "إضافة وحدة" للبدء.
            </div>
          ` : modules.map(function (m, mIdx) {
            let videos = m.videos || [];

            return `
              <div class="content-module-box">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-3);">
                  <div style="font-weight:800; color:var(--color-primary); font-size:var(--text-sm);">
                    📁 ${mIdx + 1}. ${escapeHtml(m.title)} (${videos.length} دروس)
                  </div>
                  <div style="display:flex; gap:6px;">
                    <button type="button" class="btn btn--secondary btn--sm btn-add-video" data-module-id="${escapeHtml(m.id)}" style="font-size:11px; padding:2px 8px;">
                      ➕ إضافة درس
                    </button>
                    <button type="button" class="btn btn--secondary btn--sm btn-delete-module" data-module-id="${escapeHtml(m.id)}" style="font-size:11px; padding:2px 8px; color:var(--color-danger); border-color:rgba(220,38,38,0.2);">
                      حذف الوحدة ✕
                    </button>
                  </div>
                </div>

                <!-- قائمة الفيديوهات -->
                <div>
                  ${videos.length === 0 ? `
                    <div style="padding:var(--space-3); font-size:11px; color:#94a3b8;">
                      لا توجد محاضرات في هذا الفصل.
                    </div>
                  ` : videos.map(function (v) {
                    let ytid = (v.video_sources && v.video_sources.youtube_id) || '';
                    return `
                      <div class="content-video-row">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span style="font-size:1.1rem;">🎬</span>
                          <div>
                            <div style="font-weight:700; color:#0f172a; font-size:var(--text-sm);">
                              ${escapeHtml(v.title)}
                              ${v.is_free ? '<span class="badge badge--free" style="margin-right:6px; font-size:10px;">مجاني للتجربة</span>' : ''}
                            </div>
                            <div style="font-size:11px; color:#64748b; margin-top:2px; display:flex; gap:10px;">
                              <span>⏱️ ${Math.round((v.duration_sec || 0) / 60)} دقيقة</span>
                              <span style="direction:ltr; font-family:monospace;">YT: ${escapeHtml(ytid || 'غير مربوط')}</span>
                            </div>
                          </div>
                        </div>

                        <div style="display:flex; gap:6px;">
                          <button type="button" class="btn btn--secondary btn--sm btn-edit-video" data-module-id="${escapeHtml(m.id)}" data-video-json="${escapeHtml(JSON.stringify(v))}" style="font-size:11px; padding:2px 8px;">
                            تعديل ✏️
                          </button>
                          <button type="button" class="btn btn--secondary btn--sm btn-delete-video" data-id="${escapeHtml(v.id)}" style="font-size:11px; padding:2px 8px; color:var(--color-danger); border-color:rgba(220,38,38,0.2);">
                            حذف ✕
                          </button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // ربط أحداث النشر
  qsa('.btn-toggle-publish').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let cid = btn.dataset.id;
      let isPub = btn.dataset.published === 'true';
      try {
        await updateCourse(cid, { is_published: !isPub });
        showAlert(isPub ? 'تم تحويل المادة إلى مسودة.' : 'تم نشر المادة للطلاب بنجاح! 🚀', 'success');
        await loadTree();
      } catch (e) {
        alert('خطأ: ' + getErrorMessage(e));
      }
    });
  });

  // إضافة وحدة
  qsa('.btn-add-module').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let cid = btn.dataset.courseId;
      let title = prompt('أدخل عنوان الوحدة أو الفصل الجديد:');
      if (!title || !title.trim()) return;

      try {
        await createModule(cid, title.trim(), 0);
        showAlert('✅ تم إنشاء الوحدة بنجاح!', 'success');
        await loadTree();
      } catch (e) {
        alert('خطأ: ' + getErrorMessage(e));
      }
    });
  });

  // حذف وحدة
  qsa('.btn-delete-module').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let mid = btn.dataset.moduleId;
      if (!confirm('هل أنت متأكد من حذف هذه الوحدة وجميع الفيديوهات التابعة لها؟')) return;

      try {
        await deleteModule(mid);
        showAlert('تم حذف الوحدة.', 'warning');
        await loadTree();
      } catch (e) {
        alert('خطأ: ' + getErrorMessage(e));
      }
    });
  });

  // إضافة درس
  qsa('.btn-add-video').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openAddVideoModal(btn.dataset.moduleId);
    });
  });

  // تعديل درس
  qsa('.btn-edit-video').forEach(function (btn) {
    btn.addEventListener('click', function () {
      let mid = btn.dataset.moduleId;
      let videoObj = JSON.parse(btn.dataset.videoJson);
      openEditVideoModal(mid, videoObj);
    });
  });

  // حذف درس
  qsa('.btn-delete-video').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      let vid = btn.dataset.id;
      if (!confirm('هل أنت متأكد من حذف هذا الدرس؟')) return;

      try {
        await deleteVideo(vid);
        showAlert('تم حذف الدرس بنجاح.', 'warning');
        await loadTree();
      } catch (e) {
        alert('خطأ: ' + getErrorMessage(e));
      }
    });
  });
}

async function loadTree() {
  try {
    loadedCourses = await getAdminContentTree();
    renderTree(loadedCourses);
  } catch (err) {
    console.error('Failed to load courses tree:', err);
    showAlert('تعذر تحميل المحتوى: ' + getErrorMessage(err), 'error');
  }
}

async function init() {
  let ctx = await requireAdmin();
  if (!ctx) return;

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      setButtonLoading(refreshBtn, true, '...');
      loadTree().finally(function () {
        setButtonLoading(refreshBtn, false);
      });
    });
  }

  if (videoModalClose) {
    videoModalClose.addEventListener('click', function () {
      videoModal.classList.remove('show');
    });
  }

  if (videoModal) {
    videoModal.addEventListener('click', function (e) {
      if (e.target === videoModal) {
        videoModal.classList.remove('show');
      }
    });
  }

  if (videoForm) {
    videoForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      let videoId = videoIdHidden.value;
      let moduleId = videoModuleIdHidden.value;
      let title = videoTitleInput.value.trim();
      let mins = Number(videoDurationInput.value) || 0;
      let rawYt = videoYoutubeInput.value.trim();
      let isFree = videoIsFreeInput.checked;

      if (!title) {
        alert('من فضلك اكتب عنوان المحاضرة.');
        return;
      }

      let ytid = extractYouTubeId(rawYt);
      if (!ytid) {
        alert('من فضلك اكتب معرف فيديو يوتيوب أو الرابط.');
        return;
      }

      setButtonLoading(videoSubmitBtn, true, 'جاري الحفظ...');

      try {
        if (videoId) {
          // تعديل
          await updateVideoWithSource(videoId, {
            title: title,
            durationSec: mins * 60,
            isFree: isFree,
            youtubeId: ytid
          });
          showAlert('✅ تم تحديث المحاضرة بنجاح!', 'success');
        } else {
          // إضافة جديد
          await createVideoWithSource(moduleId, {
            title: title,
            durationSec: mins * 60,
            isFree: isFree,
            youtubeId: ytid
          });
          showAlert('✅ تم إضافة المحاضرة الجديدة بنجاح!', 'success');
        }

        videoModal.classList.remove('show');
        await loadTree();
      } catch (err) {
        alert('حدث خطأ أثناء الحفظ: ' + getErrorMessage(err));
      } finally {
        setButtonLoading(videoSubmitBtn, false);
      }
    });
  }

  await loadTree();
}

init();
