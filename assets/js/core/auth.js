// ============================================================
// auth.js
// تسجيل الدخول والخروج والجلسة وبيانات الطالب وتعديل الملف
// ============================================================

import { supabase } from './supabase-client.js';
import { APP_CONFIG, ROUTES } from './config.js';
import { sitePath, sanitizeNextPath, validateEgyptianPhone, validateEmail, validatePassword } from './utils.js';

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

// تسجيل الدخول بالبريد الإلكتروني وكلمة المرور
export async function signInWithEmail(email, password) {
  let emailVal = validateEmail(email);
  if (!emailVal.isValid) {
    throw new Error(emailVal.error);
  }
  if (!password) {
    throw new Error('من فضلك اكتب كلمة المرور.');
  }

  let { data, error } = await supabase.auth.signInWithPassword({
    email: emailVal.normalized,
    password: password
  });

  if (error) {
    console.error('Email sign-in failed:', error.message);
    throw error;
  }

  cachedProfile = null;
  return data;
}

// إنشاء حساب جديد (الـ profile بيتعمل تلقائيًا بالـ trigger من الـ metadata)
export async function signUpWithEmail(email, password, options) {
  let fullName = options ? options.fullName : '';
  let phone = options ? options.phone : '';

  let emailVal = validateEmail(email);
  if (!emailVal.isValid) {
    throw new Error(emailVal.error);
  }

  let passVal = validatePassword(password);
  if (!passVal.isValid) {
    throw new Error(passVal.error);
  }

  let cleanName = (fullName || '').trim();
  if (!cleanName || cleanName.length < 2) {
    throw new Error('من فضلك اكتب اسمك بالكامل.');
  }

  let phoneVal = validateEgyptianPhone(phone);
  if (!phoneVal.isValid) {
    throw new Error(phoneVal.error);
  }

  let { data, error } = await supabase.auth.signUp({
    email: emailVal.normalized,
    password: password,
    options: {
      data: {
        full_name: cleanName,
        phone: phoneVal.normalized
      }
    }
  });

  if (error) {
    console.error('Sign-up failed:', error.message);
    throw error;
  }

  cachedProfile = null;
  return data;
}

// طلب استعادة كلمة المرور (مش مستخدمة حاليًا، الزر اتشال من الواجهة)
export async function resetPassword(email) {
  let emailVal = validateEmail(email);
  if (!emailVal.isValid) {
    throw new Error(emailVal.error);
  }

  let redirectTo = window.location.origin + sitePath(ROUTES.LOGIN);
  let { data, error } = await supabase.auth.resetPasswordForEmail(emailVal.normalized, {
    redirectTo: redirectTo
  });

  if (error) {
    console.error('Reset password failed:', error.message);
    throw error;
  }

  return data;
}

// تعديل بيانات الملف الشخصي (الاسم والموبايل) عبر الدالة update_my_profile فقط
export async function updateMyProfile(fields) {
  let session = await getSession();
  if (!session) {
    throw new Error('not authenticated');
  }

  let fullName = fields ? fields.fullName : undefined;
  let phone = fields ? fields.phone : undefined;

  let cleanName = fullName !== undefined && fullName !== null ? String(fullName).trim() : null;
  let normalizedPhone = null;

  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    let phoneVal = validateEgyptianPhone(String(phone));
    if (!phoneVal.isValid) {
      throw new Error(phoneVal.error);
    }
    normalizedPhone = phoneVal.normalized;
  }

  let { error } = await supabase.rpc('update_my_profile', {
    p_full_name: cleanName,
    p_phone: normalizedPhone
  });

  if (error) {
    console.error('update_my_profile failed:', error.message);
    throw error;
  }

  // تحديث user_metadata كمان (اختياري، مش بيوقف العملية لو فشل)
  try {
    let metaUpdate = {};
    if (cleanName !== null) metaUpdate.full_name = cleanName;
    if (normalizedPhone !== null) metaUpdate.phone = normalizedPhone;
    if (Object.keys(metaUpdate).length > 0) {
      await supabase.auth.updateUser({ data: metaUpdate });
    }
  } catch (metaErr) {
    console.warn('Auth user_metadata update note:', metaErr);
  }

  cachedProfile = null;
  return await getMyProfile(true);
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

// تسجيل الخروج من هذا الجهاز فقط، وبعدها للمسار المطلوب (الافتراضي: الرئيسية)
export async function signOut(redirectPath) {
  let { error } = await supabase.auth.signOut({ scope: 'local' });
  cachedProfile = null;
  if (error) {
    console.error('Sign-out failed:', error.message);
  }

  let target = sanitizeNextPath(redirectPath, null);
  window.location.replace(target || sitePath(ROUTES.HOME));
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
    .select('id, email, full_name, phone, profile_complete, is_admin, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load profile from table:', error.message);
  }

  // دمج مع Auth User Metadata لو في حقول مش متسجلة
  let userMeta = (session.user && session.user.user_metadata) || {};
  let finalProfile = data || {
    id: userId,
    email: session.user.email,
    full_name: userMeta.full_name || userMeta.name || session.user.email.split('@')[0],
    phone: userMeta.phone || null,
    profile_complete: !!userMeta.phone,
    is_admin: false,
    created_at: session.user.created_at
  };

  if (!finalProfile.phone && userMeta.phone) {
    finalProfile.phone = userMeta.phone;
    finalProfile.profile_complete = true;
  }
  if (!finalProfile.full_name && (userMeta.full_name || userMeta.name)) {
    finalProfile.full_name = userMeta.full_name || userMeta.name;
  }

  cachedProfile = { userId: userId, profile: finalProfile };
  return finalProfile;
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