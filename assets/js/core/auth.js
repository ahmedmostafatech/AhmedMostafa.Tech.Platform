// ============================================================
// auth.js
// تسجيل الدخول والخروج والجلسة وبيانات الطالب
// ============================================================

import { supabase } from './supabase-client.js';
import { APP_CONFIG, ROUTES } from './config.js';
import { sitePath, sanitizeNextPath } from './utils.js';

// كاش لبيانات الطالب الحالي (مربوط بـ id عشان لو اتغير المستخدم)
let cachedProfile = null;

// تنظيف الكاش عند الخروج (من غير أي نداء لـ Supabase هنا)
supabase.auth.onAuthStateChange(function (event) {
  if (event === 'SIGNED_OUT') {
    cachedProfile = null;
  }
});

// الجلسة الحالية أو null
export async function getSession() {
  let { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('getSession failed:', error.message);
    return null;
  }
  return data.session || null;
}

// تسجيل الدخول بجوجل (nextPath = الصفحة اللي يرجعلها بعد الدخول)
export async function signInWithGoogle(nextPath) {
  let safeNext = sanitizeNextPath(nextPath);

  try {
    sessionStorage.setItem(APP_CONFIG.NEXT_PATH_STORAGE_KEY, safeNext);
  } catch (error) {
    console.warn('sessionStorage unavailable, next path will be lost:', error);
  }

  // جوجل بيرجع للمستخدم على صفحة الدخول، وهي اللي بتحوله للصفحة المطلوبة
  let redirectTo = window.location.origin + sitePath(ROUTES.LOGIN);

  let { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo,
      queryParams: { prompt: 'select_account' }
    }
  });

  if (error) {
    console.error('Google sign-in failed:', error.message);
    throw error;
  }
}

// قراءة الصفحة المحفوظة قبل الدخول (مرة واحدة) أو null
export function consumeNextPath() {
  try {
    let stored = sessionStorage.getItem(APP_CONFIG.NEXT_PATH_STORAGE_KEY);
    sessionStorage.removeItem(APP_CONFIG.NEXT_PATH_STORAGE_KEY);
    return sanitizeNextPath(stored, null);
  } catch (error) {
    return null;
  }
}

// تسجيل الخروج من هذا الجهاز فقط، وبعدها للرئيسية
export async function signOut() {
  let { error } = await supabase.auth.signOut({ scope: 'local' });
  cachedProfile = null;
  if (error) {
    console.error('Sign-out failed:', error.message);
  }
  window.location.replace(sitePath(ROUTES.HOME));
}

// بيانات الطالب من جدول profiles (مع كاش)
export async function getMyProfile(forceRefresh) {
  let session = await getSession();
  if (!session) {
    return null;
  }

  let userId = session.user.id;
  if (!forceRefresh && cachedProfile && cachedProfile.userId === userId) {
    return cachedProfile.profile;
  }

  let { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_admin, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load profile:', error.message);
    return null;
  }

  cachedProfile = { userId: userId, profile: data };
  return data;
}

// هل المستخدم أدمن؟ (للعرض فقط، الحماية الحقيقية في RLS)
export async function isAdmin() {
  let profile = await getMyProfile(false);
  return !!(profile && profile.is_admin === true);
}

// الاسم اللي يظهر في الواجهة
export function getDisplayName(profile, session) {
  if (profile && profile.full_name) {
    return profile.full_name;
  }
  let email =
    (profile && profile.email) ||
    (session && session.user && session.user.email) ||
    '';
  return email ? email.split('@')[0] : 'طالب';
}

// الاستماع لتغيرات الدخول والخروج (بيرجع دالة لإلغاء الاستماع)
export function onAuthChange(callback) {
  let { data } = supabase.auth.onAuthStateChange(function (event, session) {
    // تأجيل التنفيذ لتجنب deadlock (توصية Supabase: ما تنادي Supabase داخل الـ callback مباشرة)
    setTimeout(function () {
      callback(event, session);
    }, 0);
  });

  return function unsubscribe() {
    data.subscription.unsubscribe();
  };
}