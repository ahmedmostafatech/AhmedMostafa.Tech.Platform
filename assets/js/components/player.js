// ============================================================
// player.js
// مشغل الفيديوهات الآمن مع العلامة المائية للطلاب
// ============================================================

import { escapeHtml } from '../core/utils.js';

/**
 * إنشاء مشغل فيديو يوتيوب مع علامة مائية للمستخدم
 * @param {HTMLElement} container الحاوية
 * @param {Object} options خيارات المشغل (youtubeId, title, userEmail, userName)
 */
export function createPlayer(container, options = {}) {
  if (!container) return;

  let { youtubeId, title, userEmail, userName } = options;

  if (!youtubeId) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:rgba(255,255,255,0.7); gap:12px; background:#071022;">
        <i class="fa-solid fa-film" style="font-size:2.5rem; color:rgba(255,255,255,0.5);"></i>
        <p style="font-size:var(--text-base); margin:0;">الفيديو غير متوفر أو جاري تجهيزه.</p>
      </div>
    `;
    return;
  }

  // نص العلامة المائية: إيميل الطالب الموثق ورقم الحساب لمنع تسريب الشاشة
  let watermarkText = userEmail || userName || 'Ahmed Mostaf Tech';

  container.innerHTML = `
    <div class="player-wrapper" id="amt-player-wrapper" style="position:relative; width:100%; height:100%; background:#000; overflow:hidden;">
      <iframe
        id="amt-main-video-iframe"
        src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
        title="${escapeHtml(title || 'محاضرة المراجعة')}"
        style="width:100%; height:100%; border:none; position:absolute; inset:0;"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>

      <!-- علامة مائية ثابتة في الزاوية العلوية -->
      <div class="player-watermark player-watermark--corner" aria-hidden="true" style="
        position: absolute;
        top: 14px;
        left: 14px;
        z-index: 10;
        pointer-events: none;
        background: rgba(7, 16, 34, 0.55);
        color: rgba(255, 255, 255, 0.45);
        padding: 4px 10px;
        border-radius: 6px;
        font-family: monospace;
        font-size: 11px;
        user-select: none;
        backdrop-filter: blur(2px);
      ">
        ${escapeHtml(watermarkText)}
      </div>

      <!-- علامة مائية عائمة متغيرة الموضع لمنع قص وتغطية الشاشة -->
      <div id="amt-floating-watermark" aria-hidden="true" style="
        position: absolute;
        top: 60%;
        left: 40%;
        z-index: 10;
        pointer-events: none;
        background: rgba(0, 0, 0, 0.35);
        color: rgba(255, 255, 255, 0.28);
        padding: 3px 8px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 11px;
        user-select: none;
        transition: top 1s ease, left 1s ease;
      ">
        ${escapeHtml(watermarkText)}
      </div>
    </div>
  `;

  // تحريك العلامة المائية العائمة كل 20 ثانية لموضع عشوائي خفيف
  let wrapperEl = container.querySelector('#amt-player-wrapper');
  let floatingEl = container.querySelector('#amt-floating-watermark');

  if (floatingEl && wrapperEl) {
    let timer = setInterval(function () {
      if (!document.body.contains(floatingEl)) {
        clearInterval(timer);
        return;
      }
      // مواضع عشوائية آمنة بعيداً عن أطراف الفيديو المزدحمة
      let randomTop = Math.floor(Math.random() * 60) + 20; // 20% to 80%
      let randomLeft = Math.floor(Math.random() * 60) + 20; // 20% to 80%
      floatingEl.style.top = `${randomTop}%`;
      floatingEl.style.left = `${randomLeft}%`;
    }, 20000);
  }
}
