// ============================================================
// toast.js
// إشعارات خفيفة وسريعة تظهر وتختفي تلقائياً
// ============================================================

import { escapeHtml } from '../core/utils.js';

// إنشاء حاوية الـ toasts مرة واحدة
function getOrCreateContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-label', 'إشعارات');
    document.body.appendChild(container);
  }
  return container;
}

// ألوان وأنماط أنواع الإشعارات
let TOAST_STYLES = {
  success: { bg: '#ecfdf3', border: '#abefc6', color: '#067647', icon: '<i class="fa-solid fa-circle-check"></i>' },
  error: { bg: '#fdf2f1', border: '#f5c6c2', color: '#c0392b', icon: '<i class="fa-solid fa-circle-xmark"></i>' },
  info: { bg: 'rgba(54,90,162,0.08)', border: 'rgba(54,90,162,0.25)', color: '#274880', icon: '<i class="fa-solid fa-circle-info"></i>' },
  warning: { bg: '#fffaeb', border: '#fedf89', color: '#7a4a00', icon: '<i class="fa-solid fa-triangle-exclamation"></i>' }
};

/**
 * إظهار إشعار Toast منبثق
 * @param {string} message نص الإشعار
 * @param {string} type نوع الإشعار (success, error, info, warning)
 * @param {number} durationMs مدة الظهور بالمللي ثانية
 */
export function showToast(message, type = 'info', durationMs = 3500) {
  let container = getOrCreateContainer();
  let style = TOAST_STYLES[type] || TOAST_STYLES.info;

  let toast = document.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    background: ${style.bg};
    border: 1px solid ${style.border};
    color: ${style.color};
    padding: 12px 16px;
    border-radius: var(--radius-lg, 12px);
    font-family: var(--font-sans, 'IBM Plex Sans Arabic', sans-serif);
    font-size: var(--text-sm, 0.875rem);
    font-weight: 600;
    line-height: 1.5;
    box-shadow: 0 8px 24px rgba(7, 16, 34, 0.14);
    pointer-events: auto;
    animation: toast-in 0.3s cubic-bezier(0.34, 1.4, 0.64, 1) both;
    cursor: pointer;
    user-select: none;
    direction: rtl;
  `;

  // حقن أنيميشن الدخول والخروج مرة واحدة
  if (!document.getElementById('toast-keyframes')) {
    let styleEl = document.createElement('style');
    styleEl.id = 'toast-keyframes';
    styleEl.textContent = `
      @keyframes toast-in {
        from { opacity: 0; transform: translateY(12px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes toast-out {
        from { opacity: 1; transform: scale(1); }
        to   { opacity: 0; transform: scale(0.92); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  toast.innerHTML = `
    <span style="font-size:1.1rem; flex-shrink:0;">${style.icon}</span>
    <span style="flex:1;">${escapeHtml(message || '')}</span>
  `;

  container.appendChild(toast);

  // إغلاق بعد انتهاء المدة
  function closeToast() {
    toast.style.animation = 'toast-out 0.2s ease forwards';
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 220);
  }

  let timer = setTimeout(closeToast, durationMs);

  // إغلاق فوري عند النقر
  toast.addEventListener('click', function () {
    clearTimeout(timer);
    closeToast();
  });
}

// دوال مساعدة مباشرة
export function toastSuccess(msg, durationMs) {
  showToast(msg, 'success', durationMs || 3500);
}

export function toastError(msg, durationMs) {
  showToast(msg, 'error', durationMs || 5000);
}

export function toastInfo(msg, durationMs) {
  showToast(msg, 'info', durationMs || 3500);
}

export function toastWarning(msg, durationMs) {
  showToast(msg, 'warning', durationMs || 4000);
}
