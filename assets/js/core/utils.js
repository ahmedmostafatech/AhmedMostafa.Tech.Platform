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

// ---------- التحقق من المدخلات (Validation) ----------

// تحويل الأرقام العربية إلى إنجليزية
export function normalizeArabicDigits(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[٠-٩]/g, function (d) {
    return String(d.charCodeAt(0) - 1632);
  });
}

// التحقق من رقم الموبايل المصري وتنسيقه (11 خانة: 010, 011, 012, 015)
export function validateEgyptianPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, normalized: '', error: 'من فضلك اكتب رقم الموبايل.' };
  }

  let cleaned = normalizeArabicDigits(phone.trim())
    .replace(/[\s\-\(\)\.]/g, '');

  // دعم الصيغ المختلفة: +2010..., 002010..., 2010..., 010..., 10...
  let match = cleaned.match(/^(?:(?:\+?20)|(?:0020))?0?(1[0125]\d{8})$/);

  if (!match) {
    return {
      isValid: false,
      normalized: cleaned,
      error: 'رقم الموبايل لازم يكون رقم مصري صحيح (مثلاً 01012345678).'
    };
  }

  let normalized = '0' + match[1];
  return { isValid: true, normalized: normalized, error: null };
}

// التحقق من البريد الإلكتروني
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { isValid: false, normalized: '', error: 'من فضلك اكتب البريد الإلكتروني.' };
  }

  let cleaned = email.trim();
  let emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  if (!emailRegex.test(cleaned)) {
    return {
      isValid: false,
      normalized: cleaned,
      error: 'صيغة البريد الإلكتروني مش صحيحة (مثال: student@gmail.com).'
    };
  }

  return { isValid: true, normalized: cleaned.toLowerCase(), error: null };
}

// التحقق من كلمة المرور
export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'من فضلك اكتب كلمة المرور.' };
  }

  if (password.length < 8) {
    return { isValid: false, error: 'كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل.' };
  }

  return { isValid: true, error: null };
}

// ---------- رسائل الأخطاء للمستخدم ----------

// المفتاح = جزء من رسالة الخطأ الإنجليزية (من دوال قاعدة البيانات أو Supabase Auth)
let ERROR_MESSAGES = [
  // من دوال قاعدة البيانات
  ['already subscribed', 'أنت مشترك بالفعل في هذه المادة.'],
  ['not authenticated', 'لازم تسجل الدخول أولًا.'],
  ['course not found', 'المادة غير متاحة حاليًا.'],
  ['course access period ended', 'انتهت فترة الاشتراك في هذه المادة.'],
  ['invalid payment method', 'وسيلة الدفع غير صحيحة.'],
  ['invalid reference', 'رقم العملية غير صحيح (4 خانات على الأقل)، راجع الرقم وحاول مرة أخرى.'],
  ['order not found or already processed', 'الطلب غير موجود أو تمت معالجته بالفعل.'],
  ['order not found', 'الطلب غير موجود.'],  ['order not found or already processed', 'الطلب غير موجود أو تمت معالجته بالفعل.'],
  ['no free amount', 'الضغط عالي حاليًا، حاول بعد دقائق.'],
  ['forbidden', 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'],
  ['invalid name', 'من فضلك اكتب اسمك بشكل صحيح.'],
  ['invalid phone', 'رقم الموبايل غير صحيح (لازم يكون رقم مصري 11 خانة).'],
  ['profile not found', 'تعذر العثور على بياناتك، سجّل خروج وادخل تاني.'],
  ['orders_tx_reference', 'رقم العملية هذا مستخدم من قبل. راجع الرقم أو تواصل معنا.'],

  // من Supabase Auth
  ['invalid login credentials', 'بيانات الدخول غير صحيحة، اتأكد من الإيميل وكلمة المرور.'],
  ['invalid_credentials', 'بيانات الدخول غير صحيحة، اتأكد من الإيميل وكلمة المرور.'],
  ['email not confirmed', 'البريد الإلكتروني لم يتم تأكيده بعد.'],
  ['user already registered', 'البريد الإلكتروني ده مسجل بالفعل، تقدر تسجل دخول بيه على طول.'],
  ['user_already_exists', 'البريد الإلكتروني ده مسجل بالفعل، تقدر تسجل دخول بيه.'],
  ['password should be at least', 'كلمة المرور لازم تكون 8 حروف أو أرقام على الأقل.'],
  ['signup requires a valid password', 'من فضلك اكتب كلمة مرور صالحة لا تقل عن 8 خانات.'],
  ['email rate limit exceeded', 'محاولات كتير في وقت قصير، استنى دقيقة وجرب تاني.'],
  ['over_email_send_rate_limit', 'محاولات كتير في وقت قصير، استنى شوية وجرب تاني.'],

  // الشبكة
  ['failed to fetch', 'مشكلة في الاتصال بالإنترنت، تأكد من الشبكة وحاول مرة أخرى.'],
  ['network request failed', 'مشكلة في الاتصال بالإنترنت، اتأكد من الشبكة وجرب تاني.']
];

export function getErrorMessage(error) {
  let raw = error && error.message ? String(error.message) : '';
  let lowered = raw.toLowerCase();

  for (let i = 0; i < ERROR_MESSAGES.length; i++) {
    if (lowered.includes(ERROR_MESSAGES[i][0])) {
      return ERROR_MESSAGES[i][1];
    }
  }

  // رسائل عربية جاهزة مرمية من الكود نفسه (التحقق، رفع الملفات)
  if (/[\u0600-\u06FF]/.test(raw)) {
    return raw;
  }

  console.error('Unmapped error:', error);
  return 'حصل خطأ غير متوقع، حاول مرة أخرى.';
}
