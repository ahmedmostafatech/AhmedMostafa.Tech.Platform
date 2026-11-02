// ============================================================
// config.js
// الإعدادات العامة للمشروع (ملف علني، ممنوع فيه أي مفتاح سري)
// ============================================================

// رابط مشروع Supabase (من Project Settings ← API)
export let SUPABASE_URL = 'https://wsoazfbpdsmspygrofjf.supabase.co';

// المفتاح العلني فقط (anon أو publishable)
// تحذير: ممنوع نهائيًا وضع service_role أو أي مفتاح secret هنا
export let SUPABASE_PUBLIC_KEY = 'sb_publishable_Y1tmeibp1DPVfyuBLixPTw_7WLA0mNv';

// إعدادات التطبيق
export let APP_CONFIG = Object.freeze({
  APP_NAME: 'Ahmed Mostafa Tech',
  // لو الموقع هيترفع على مسار فرعي (مثلاً /my-site) حطه هنا، وإلا سيبه فاضي
  BASE_PATH: '',
  // أرقام لاتينية (120.37) عشان الطالب ينسخ المبلغ بسهولة
  LOCALE: 'ar-EG-u-nu-latn',
  TIMEZONE: 'Africa/Cairo',
  CURRENCY: 'EGP',
  AUTH_STORAGE_KEY: 'amt-auth',
  NEXT_PATH_STORAGE_KEY: 'amt-next-path'
});

// مسارات الصفحات (من الجذر)
export let ROUTES = Object.freeze({
  HOME: '/index.html',
  LOGIN: '/login.html',
  DASHBOARD: '/dashboard.html',
  COURSE: '/course.html',
  CHECKOUT: '/checkout.html',
  WATCH: '/watch.html',
  ADMIN_HOME: '/admin/index.html'
});

// حسابات استلام الفلوس (بتظهر للطالب في صفحة الدفع)
export let PAYMENT_ACCOUNTS = Object.freeze({
  vodafone_cash: { label: 'فودافون كاش', account: '01066843568' },
  instapay: { label: 'إنستاباي', account: 'ahmedmo5787@instapay' }
});