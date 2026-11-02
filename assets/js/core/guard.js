// ============================================================
// guard.js
// حراس الصفحات (تجربة مستخدم فقط، الحماية الحقيقية في RLS)
// الصفحات المحمية لازم يكون <html class="guard-pending"> ليتخفى المحتوى لحد التأكد
// ============================================================

import { ROUTES } from './config.js';
import { getSession, getMyProfile, consumeNextPath } from './auth.js';
import { sitePath, sanitizeNextPath, getQueryParam } from './utils.js';

// إظهار الصفحة بعد التأكد من الصلاحية
function revealPage() {
  document.documentElement.classList.remove('guard-pending');
}

function goTo(path) {
  window.location.replace(path);
}

// فحص الجلسة من غير إظهار الصفحة (بيستخدمه requireAuth و requireAdmin)
async function checkSessionOrRedirect() {
  let session = await getSession();
  if (!session) {
    let next = encodeURIComponent(window.location.pathname + window.location.search);
    goTo(sitePath(ROUTES.LOGIN) + '?next=' + next);
    return null;
  }
  return session;
}

// صفحة تحتاج تسجيل دخول
// الاستخدام: let session = await requireAuth(); if (!session) { return; }
export async function requireAuth() {
  let session = await checkSessionOrRedirect();
  if (!session) {
    return null;
  }
  revealPage();
  return session;
}

// صفحة للأدمن فقط
// الاستخدام: let ctx = await requireAdmin(); if (!ctx) { return; }
export async function requireAdmin() {
  let session = await checkSessionOrRedirect();
  if (!session) {
    return null;
  }

  let profile = await getMyProfile(false);
  if (!profile || profile.is_admin !== true) {
    console.warn('Admin access denied, redirecting to home.');
    goTo(sitePath(ROUTES.HOME));
    return null;
  }

  revealPage();
  return { session: session, profile: profile };
}

// صفحة الدخول: لو المستخدم مسجل بالفعل نحوله للصفحة المطلوبة
// بيرجع true لو حصل تحويل
export async function redirectIfAuthenticated() {
  let session = await getSession();
  if (!session) {
    revealPage();
    return false;
  }

  let storedNext = consumeNextPath();
  let queryNext = sanitizeNextPath(getQueryParam('next'), sitePath(ROUTES.DASHBOARD));
  goTo(storedNext || queryNext);
  return true;
}