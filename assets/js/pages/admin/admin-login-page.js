// ============================================================
// admin-login-page.js
// تسجيل دخول الأدمن المخصص والمحمي
// ============================================================

import { getSession, getMyProfile, signInWithEmail, signOut } from '../../core/auth.js';
import { setButtonLoading, getErrorMessage, initSpotlightCards } from '../../core/utils.js';

async function initAdminLoginPage() {
  initSpotlightCards();

  let form = document.getElementById('admin-login-form');
  let submitBtn = document.getElementById('admin-submit-btn');
  let errorEl = document.getElementById('login-error');

  // فحص الجلسة إذا كان الأدمن مسجلاً بالفعل
  try {
    let session = await getSession();
    if (session) {
      let profile = await getMyProfile(true);
      if (profile && profile.is_admin) {
        window.location.replace('index.html');
        return;
      }
    }
  } catch (e) {
    // متابعة تسجيل الدخول بشكل طبيعي
  }

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (errorEl) errorEl.hidden = true;

      let email = document.getElementById('admin-email').value.trim();
      let pass = document.getElementById('admin-pass').value;

      if (!email || !pass) {
        if (errorEl) {
          errorEl.textContent = 'من فضلك أدخل البريد الإلكتروني وكلمة المرور.';
          errorEl.hidden = false;
        }
        return;
      }

      setButtonLoading(submitBtn, true, 'جاري التحقق...');

      try {
        let authRes = await signInWithEmail(email, pass);
        if (!authRes || !authRes.user) {
          throw new Error('فشل تسجيل الدخول.');
        }

        // فحص صلاحية الأدمن
        let profile = await getMyProfile(true);
        if (!profile || !profile.is_admin) {
          await signOut();
          throw new Error('هذا الحساب ليس لديه صلاحيات الدخول للوحة التحكم.');
        }

        // توجيه ناجح للوحة التحكم
        window.location.replace('index.html');

      } catch (err) {
        console.error('Admin login failed:', err);
        setButtonLoading(submitBtn, false);
        if (errorEl) {
          errorEl.textContent = getErrorMessage(err);
          errorEl.hidden = false;
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initAdminLoginPage);
