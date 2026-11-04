// ============================================================
// config.js
// الإعدادات العامة للمشروع (ملف علني، ممنوع فيه أي مفتاح سري)
// ============================================================

// رابط مشروع Supabase (من Project Settings ← API)
export let SUPABASE_URL = 'https://wsoazfbpdsmspygrofjf.supabase.co';

// المفتاح العلني فقط (anon أو publishable)
// تحذير: ممنوع نهائيًا وضع service_role أو أي مفتاح secret هنا
export let SUPABASE_PUBLIC_KEY = 'sb_publishable_Y1tmeibp1DPVfyuBLixPTw_7WLA0mNv';

// إعدادات التطبيق والعلامة التجارية
export let APP_CONFIG = Object.freeze({
  APP_NAME: 'Ahmed Mostafa Tech',
  BRAND_TITLE: 'أحمد مصطفى تيك | مراجعات تكنولوجيا المعلومات',
  BASE_PATH: '',
  LOCALE: 'ar-EG-u-nu-latn',
  TIMEZONE: 'Africa/Cairo',
  CURRENCY: 'EGP',
  WHATSAPP_PHONE: '01066843568',
  WHATSAPP_INTL: '201066843568',
  AUTH_STORAGE_KEY: 'amt-auth',
  ADMIN_NEXT_PATH_KEY: 'amt-admin-next-path'
});

// مسارات صفحات الموقع
export let ROUTES = Object.freeze({
  HOME: '/index.html',
  REVISIONS: '/revisions.html',
  REVISION: '/revision.html',
  REGISTER: '/register.html',
  PAYMENT: '/payment.html',
  TRACK: '/track.html',
  // مسارات لوحة الأدمن
  ADMIN_LOGIN: '/admin/login.html',
  ADMIN_HOME: '/admin/index.html',
  ADMIN_REGISTRATIONS: '/admin/registrations.html',
  ADMIN_REVISIONS: '/admin/revisions.html',
  ADMIN_DISCOUNTS: '/admin/discounts.html',
  ADMIN_REPORTS: '/admin/reports.html'
});

// حسابات استلام التحويلات وبيانات الدفع
export let PAYMENT_ACCOUNTS = Object.freeze({
  vodafone_cash: {
    label: 'فودافون كاش',
    account: '01066843568',
    instructions: 'حول المبلغ المحدد للمحفظة عبر تطبيق أنا فودافون أو كود *9*7*الرقم*المبلغ#'
  },
  instapay: {
    label: 'إنستاباي (InstaPay)',
    account: 'ahmedmo57@instapay',
    link: 'https://ipn.eg/S/ahmedmo57/instapay/3Iiwwf',
    instructions: 'حول من تطبيق إنستاباي على العنوان المبين أو اضغط على رابط الدفع المباشر'
  }
});
