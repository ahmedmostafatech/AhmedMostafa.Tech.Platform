// ============================================================
// toast.js
// إشعارات خفيفة تظهر في أسفل الشاشة
// ============================================================

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

// أنواع الـ toast
let TOAST_STYLES = {
  success: { bg: '#ecfdf3', border: '#abefc6', color: '#067647', icon: '✓' },
  error:   { bg: '#fdf2f1', border: '#f5c6c2', color: '#c0392b', icon: '✗' },
  info:    { bg: 'rgba(54,90,162,0.08)', border: 'rgba(54,90,162,0.25)', color: '#274880', icon: 'ℹ' },
  warning: { bg: '#fffaeb', border: '#fedf89', color: '#7a4a00', icon: '⚠' }
};

export function showToast(message, type, durationMs) {
  type       = type       || 'info';
  durationMs = durationMs || 3500;

  let container = getOrCreateContainer();
  let style      = TOAST_STYLES[type] || TOAST_STYLES.info;

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
    border-radius: 12px;
    font-family: 'Tajawal', sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.5;
    box-shadow: 0 8px 24px rgba(7,16,34,0.14);
    pointer-events: auto;
    animation: toast-in 0.3s cubic-bezier(0.34, 1.4, 0.64, 1) both;
    cursor: pointer;
    user-select: none;
  `;

  let style_el = document.createElement('style');
  style_el.textContent = `
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(12px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes toast-out {
      from { opacity: 1; transform: scale(1); }
      to   { opacity: 0; transform: scale(0.92); }
    }
  `;

  if (!document.getElementById('toast-keyframes')) {
    style_el.id = 'toast-keyframes';
    document.head.appendChild(style_el);
  }

  toast.innerHTML = `
    <span style="font-size:1.1rem; flex-shrink:0;">${style.icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // إغلاق بعد المدة
  function closeToast() {
    toast.style.animation = 'toast-out 0.2s ease forwards';
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 220);
  }

  let timer = setTimeout(closeToast, durationMs);

  // إغلاق بالضغط
  toast.addEventListener('click', function () {
    clearTimeout(timer);
    closeToast();
  });
}

// اختصارات
export function toastSuccess(msg) { showToast(msg, 'success'); }
export function toastError(msg)   { showToast(msg, 'error', 4500); }
export function toastInfo(msg)    { showToast(msg, 'info'); }
export function toastWarning(msg) { showToast(msg, 'warning', 4000); }
