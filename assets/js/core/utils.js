// ============================================================
// utils.js
// أدوات صغيرة مشتركة (تنسيق، أمان، رسائل الأخطاء)
// ============================================================

import { APP_CONFIG, ROUTES } from './config.js';

// ---------- DOM ----------

export function qs(selector, root) {
  return (root || document).querySelector(selector);
}

export function qsa(selector, root) {
  return Array.from((root || document).querySelectorAll(selector));
}

// ---------- المسارات ----------

// إضافة BASE_PATH لأي مسار داخلي
export function sitePath(path) {
  let clean = String(path || '/');
  if (!clean.startsWith('/')) {
    clean = '/' + clean;
  }
  return APP_CONFIG.BASE_PATH + clean;
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// حماية من Open Redirect: نقبل مسار داخلي فقط
// لو fallback = null بنرجع null بدل المسار الافتراضي
export function sanitizeNextPath(rawPath, fallback) {
  let safeFallback = fallback === undefined ? sitePath(ROUTES.DASHBOARD) : fallback;

  if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.length > 500) {
    return safeFallback;
  }
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\')) {
    return safeFallback;
  }
  if (/[\u0000-\u001f]/.test(rawPath)) {
    return safeFallback;
  }
  return rawPath;
}

// ---------- أمان ----------

// تهريب النصوص قبل وضعها في innerHTML (حماية من XSS)
export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- الأسعار ----------

// عرض السعر بشكل جميل (120 ج.م أو 120.37 ج.م)
export function formatPrice(amount) {
  let value = Number(amount);
  if (!Number.isFinite(value)) {
    return '';
  }
  let hasDecimals = !Number.isInteger(value);
  return new Intl.NumberFormat(APP_CONFIG.LOCALE, {
    style: 'currency',
    currency: APP_CONFIG.CURRENCY,
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  }).format(value);
}

// المبلغ الدقيق بخانتين عشريتين (للتحويل والنسخ): 120.37
export function formatExactAmount(amount) {
  let value = Number(amount);
  if (!Number.isFinite(value)) {
    return '';
  }
  return value.toFixed(2);
}

// ---------- التواريخ ----------

function toValidDate(value) {
  let date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  let date = toValidDate(value);
  if (!date) {
    return '';
  }
  return new Intl.DateTimeFormat(APP_CONFIG.LOCALE, {
    timeZone: APP_CONFIG.TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function formatDateTime(value) {
  let date = toValidDate(value);
  if (!date) {
    return '';
  }
  return new Intl.DateTimeFormat(APP_CONFIG.LOCALE, {
    timeZone: APP_CONFIG.TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

// عدد الأيام المتبقية (بيقرب لأعلى، والصفر لو خلص)
export function daysLeft(value) {
  let date = toValidDate(value);
  if (!date) {
    return 0;
  }
  let diffMs = date.getTime() - Date.now();
  return diffMs <= 0 ? 0 : Math.ceil(diffMs / 86400000);
}

// ---------- أدوات عامة ----------

export function debounce(callback, waitMs) {
  let timerId = null;
  return function () {
    let args = arguments;
    let context = this;
    clearTimeout(timerId);
    timerId = setTimeout(function () {
      callback.apply(context, args);
    }, waitMs);
  };
}

// نسخ نص للحافظة (مع حل بديل للمتصفحات القديمة)
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('Clipboard API failed, using fallback:', error);
  }

  try {
    let area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copied = document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch (error) {
    console.error('Copy failed:', error);
    return false;
  }
}

// حالة التحميل للأزرار (منع الضغط المزدوج)
export function setButtonLoading(button, isLoading, loadingText) {
  if (!button) {
    return;
  }
  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (loadingText) {
      button.textContent = loadingText;
    }
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

// ---------- رسائل الأخطاء للمستخدم ----------

// المفتاح = جزء من رسالة الخطأ الإنجليزية (من دوال قاعدة البيانات)
let ERROR_MESSAGES = [
  ['already subscribed', 'أنت مشترك بالفعل في هذه المادة.'],
  ['not authenticated', 'لازم تسجل الدخول أولًا.'],
  ['course not found', 'المادة غير متاحة حاليًا.'],
  ['course access period ended', 'انتهت فترة الاشتراك في هذه المادة.'],
  ['invalid payment method', 'وسيلة الدفع غير صحيحة.'],
  ['invalid reference', 'رقم العملية غير صحيح، راجع الرقم وحاول مرة أخرى.'],
  ['order not found or already processed', 'الطلب غير موجود أو تمت معالجته بالفعل.'],
  ['no free amount', 'الضغط عالي حاليًا، حاول بعد دقائق.'],
  ['forbidden', 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'],
  ['orders_tx_reference_key', 'رقم العملية هذا مستخدم من قبل. راجع الرقم أو تواصل معنا.'],
  ['failed to fetch', 'مشكلة في الاتصال بالإنترنت، تأكد من الشبكة وحاول مرة أخرى.']
];

export function getErrorMessage(error) {
  let raw = error && error.message ? String(error.message) : '';
  let lowered = raw.toLowerCase();

  for (let i = 0; i < ERROR_MESSAGES.length; i++) {
    if (lowered.includes(ERROR_MESSAGES[i][0])) {
      return ERROR_MESSAGES[i][1];
    }
  }

  console.error('Unmapped error:', error);
  return 'حصل خطأ غير متوقع، حاول مرة أخرى.';
}