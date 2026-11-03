// ============================================================
// login-page.js
// منطق تسجيل الدخول وإنشاء الحساب
// ============================================================

import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  resetPassword
} from '../core/auth.js';
import { redirectIfAuthenticated } from '../core/guard.js';
import {
  qs,
  qsa,
  getQueryParam,
  sanitizeNextPath,
  setButtonLoading,
  getErrorMessage,
  copyToClipboard,
  validateEgyptianPhone,
  validateEmail,
  validatePassword
} from '../core/utils.js';

// عناصر التبويب
let tabLoginBtn = qs('#tab-login-btn');
let tabSignupBtn = qs('#tab-signup-btn');
let paneLogin = qs('#pane-login');
let paneSignup = qs('#pane-signup');

// التنبيهات العامة
let errorBox = qs('#auth-error');
let successBox = qs('#auth-success');
let embeddedWarning = qs('#embedded-warning');
let copyLinkButton = qs('#copy-link-btn');

// نماذج وأزرار
let loginForm = qs('#login-form');
let signupForm = qs('#signup-form');
let googleButtons = qsa('.google-auth-trigger');

// استعادة كلمة المرور
let forgotLink = qs('#forgot-password-link');
let forgotModal = qs('#forgot-modal');
let forgotModalClose = qs('#forgot-modal-close');
let resetForm = qs('#reset-form');
let resetEmailInput = qs('#reset-email');
let resetModalError = qs('#reset-modal-error');
let resetModalSuccess = qs('#reset-modal-success');

// إظهار وإخفاء رسائل الخطأ العامة
function showError(message) {
  if (successBox) successBox.hidden = true;
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  if (!errorBox) return;
  errorBox.textContent = '';
  errorBox.hidden = true;
}

function showSuccess(message) {
  hideError();
  if (!successBox) return;
  successBox.textContent = message;
  successBox.hidden = false;
}

// عرض أخطاء الحقول الفردية
function setFieldError(fieldId, errorMsg) {
  let input = qs('#' + fieldId);
  let errSpan = qs('#' + fieldId + '-err');

  if (input) {
    if (errorMsg) {
      input.classList.add('form-input--error');
    } else {
      input.classList.remove('form-input--error');
    }
  }

  if (errSpan) {
    errSpan.textContent = errorMsg || '';
    if (errorMsg) {
      errSpan.classList.add('show');
    } else {
      errSpan.classList.remove('show');
    }
  }
}

function clearAllFieldErrors(form) {
  if (!form) return;
  qsa('.form-input--error', form).forEach(function (el) {
    el.classList.remove('form-input--error');
  });
  qsa('.form-field-error', form).forEach(function (el) {
    el.textContent = '';
    el.classList.remove('show');
  });
}

// تبديل التبويب
function switchTab(target) {
  hideError();
  if (successBox) successBox.hidden = true;

  if (target === 'signup') {
    tabSignupBtn.classList.add('active');
    tabSignupBtn.setAttribute('aria-selected', 'true');
    tabLoginBtn.classList.remove('active');
    tabLoginBtn.setAttribute('aria-selected', 'false');

    paneSignup.hidden = false;
    paneLogin.hidden = true;
  } else {
    tabLoginBtn.classList.add('active');
    tabLoginBtn.setAttribute('aria-selected', 'true');
    tabSignupBtn.classList.remove('active');
    tabSignupBtn.setAttribute('aria-selected', 'false');

    paneLogin.hidden = false;
    paneSignup.hidden = true;
  }
}

// هل المتصفح مدمج في تطبيق؟
function isEmbeddedBrowser() {
  let ua = navigator.userAgent || '';
  let knownApps = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|TikTok|musical_ly|BytedanceWebview|Line\/|Twitter|MicroMessenger/i;
  let androidWebView = /; wv\)/i;
  return knownApps.test(ua) || androidWebView.test(ua);
}

// قراءة خطأ OAuth
function readOAuthErrorFromUrl() {
  let query = new URLSearchParams(window.location.search);
  let hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  let errorCode = query.get('error') || hash.get('error');
  if (!errorCode) return null;

  let description = query.get('error_description') || hash.get('error_description');
  console.warn('OAuth error returned:', errorCode, description);

  let cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('error');
  cleanUrl.searchParams.delete('error_code');
  cleanUrl.searchParams.delete('error_description');
  cleanUrl.hash = '';
  window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);

  return errorCode;
}

// أزرار جوجل
async function handleGoogleClick(btn) {
  hideError();
  setButtonLoading(btn, true, 'جاري فتح حساب Google...');

  try {
    let nextPath = sanitizeNextPath(getQueryParam('next'));
    await signInWithGoogle(nextPath);
  } catch (error) {
    console.error('Google login failed:', error);
    showError(getErrorMessage(error));
    setButtonLoading(btn, false);
  }
}

// إظهار وإخفاء كلمات المرور
function initPasswordToggles() {
  qsa('.toggle-password-visibility').forEach(function (btn) {
    btn.addEventListener('click', function () {
      let targetId = btn.getAttribute('data-target');
      let targetInput = qs('#' + targetId);
      if (!targetInput) return;

      if (targetInput.type === 'password') {
        targetInput.type = 'text';
        btn.textContent = '🔒';
      } else {
        targetInput.type = 'password';
        btn.textContent = '👁️';
      }
    });
  });
}

// استعادة كلمة المرور
function initResetModal() {
  if (!forgotLink || !forgotModal) return;

  forgotLink.addEventListener('click', function () {
    if (resetModalError) resetModalError.hidden = true;
    if (resetModalSuccess) resetModalSuccess.hidden = true;
    resetEmailInput.value = qs('#login-email')?.value || '';
    forgotModal.classList.add('show');
  });

  if (forgotModalClose) {
    forgotModalClose.addEventListener('click', function () {
      forgotModal.classList.remove('show');
    });
  }

  forgotModal.addEventListener('click', function (e) {
    if (e.target === forgotModal) {
      forgotModal.classList.remove('show');
    }
  });

  if (resetForm) {
    resetForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      let email = resetEmailInput.value.trim();
      let submitBtn = qs('#reset-submit-btn');

      if (resetModalError) resetModalError.hidden = true;
      if (resetModalSuccess) resetModalSuccess.hidden = true;

      let emailVal = validateEmail(email);
      if (!emailVal.isValid) {
        resetModalError.textContent = emailVal.error;
        resetModalError.hidden = false;
        return;
      }

      setButtonLoading(submitBtn, true, 'جاري الإرسال...');

      try {
        await resetPassword(emailVal.normalized);
        resetModalSuccess.textContent = 'تم إرسال رابط استعادة كلمة المرور إلى بريدك، تفقّد صندوق الوارد أو الرسائل غير المرغوب فيها (Spam).';
        resetModalSuccess.hidden = false;
      } catch (err) {
        resetModalError.textContent = getErrorMessage(err);
        resetModalError.hidden = false;
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }
}

// معالجة نموذج تسجيل الدخول
function initLoginForm() {
  if (!loginForm) return;

  let emailInput = qs('#login-email');
  let passInput = qs('#login-password');
  let submitBtn = qs('#login-submit-btn');

  // تنظيف الأخطاء عند الكتابة
  emailInput.addEventListener('input', function () {
    setFieldError('login-email', null);
  });
  passInput.addEventListener('input', function () {
    setFieldError('login-password', null);
  });

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();
    clearAllFieldErrors(loginForm);

    let email = emailInput.value.trim();
    let password = passInput.value;

    let hasError = false;

    let emailVal = validateEmail(email);
    if (!emailVal.isValid) {
      setFieldError('login-email', emailVal.error);
      hasError = true;
    }

    if (!password) {
      setFieldError('login-password', 'من فضلك اكتب كلمة المرور.');
      hasError = true;
    }

    if (hasError) return;

    setButtonLoading(submitBtn, true, 'جاري تسجيل الدخول...');

    try {
      await signInWithEmail(emailVal.normalized, password);
      let nextPath = sanitizeNextPath(getQueryParam('next'));
      window.location.replace(nextPath);
    } catch (err) {
      console.error('Login error:', err);
      showError(getErrorMessage(err));
      setButtonLoading(submitBtn, false);
    }
  });
}

// معالجة نموذج إنشاء حساب
function initSignupForm() {
  if (!signupForm) return;

  let nameInput = qs('#signup-name');
  let phoneInput = qs('#signup-phone');
  let emailInput = qs('#signup-email');
  let passInput = qs('#signup-password');
  let confirmPassInput = qs('#signup-confirm-password');
  let submitBtn = qs('#signup-submit-btn');

  // مسح الأخطاء عند الكتابة
  [nameInput, phoneInput, emailInput, passInput, confirmPassInput].forEach(function (inp) {
    if (!inp) return;
    inp.addEventListener('input', function () {
      setFieldError(inp.id, null);
    });
  });

  // فحص الموبايل عند الخروج من الحقل
  phoneInput.addEventListener('blur', function () {
    if (phoneInput.value.trim()) {
      let val = validateEgyptianPhone(phoneInput.value);
      if (!val.isValid) {
        setFieldError('signup-phone', val.error);
      } else {
        phoneInput.value = val.normalized; // تحويله للتنسيق الموحد
      }
    }
  });

  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();
    clearAllFieldErrors(signupForm);

    let fullName = nameInput.value.trim();
    let phone = phoneInput.value.trim();
    let email = emailInput.value.trim();
    let password = passInput.value;
    let confirmPass = confirmPassInput.value;

    let hasError = false;

    if (!fullName || fullName.length < 3) {
      setFieldError('signup-name', 'من فضلك اكتب اسمك ثلاثي على الأقل.');
      hasError = true;
    }

    let phoneVal = validateEgyptianPhone(phone);
    if (!phoneVal.isValid) {
      setFieldError('signup-phone', phoneVal.error);
      hasError = true;
    }

    let emailVal = validateEmail(email);
    if (!emailVal.isValid) {
      setFieldError('signup-email', emailVal.error);
      hasError = true;
    }

    let passVal = validatePassword(password);
    if (!passVal.isValid) {
      setFieldError('signup-password', passVal.error);
      hasError = true;
    }

    if (password !== confirmPass) {
      setFieldError('signup-confirm-password', 'كلمتا المرور غير متطابقتين.');
      hasError = true;
    }

    if (hasError) return;

    setButtonLoading(submitBtn, true, 'جاري إنشاء حسابك...');

    try {
      let res = await signUpWithEmail(emailVal.normalized, password, {
        fullName: fullName,
        phone: phoneVal.normalized
      });

      // لو Supabase طلب تأكيد الإيميل
      if (res && res.user && !res.session) {
        showSuccess('🎉 تم إنشاء حسابك بنجاح! راجع بريدك الإلكتروني لتأكيد الحساب ثم سجّل الدخول.');
        switchTab('login');
        setButtonLoading(submitBtn, false);
        return;
      }

      // لو دخل مباشرة
      let nextPath = sanitizeNextPath(getQueryParam('next'));
      window.location.replace(nextPath);
    } catch (err) {
      console.error('Signup error:', err);
      showError(getErrorMessage(err));
      setButtonLoading(submitBtn, false);
    }
  });
}

// البدء والتهيئة
async function init() {
  try {
    let redirected = await redirectIfAuthenticated();
    if (redirected) return;
  } catch (error) {
    console.error('Guard check failed:', error);
  } finally {
    document.documentElement.classList.remove('guard-pending');
  }

  // أحداث التبويب
  if (tabLoginBtn && tabSignupBtn) {
    tabLoginBtn.addEventListener('click', function () { switchTab('login'); });
    tabSignupBtn.addEventListener('click', function () { switchTab('signup'); });

    // فحص الرابط: هل مطلوب فتح الـ signup مباشرة؟
    let tabParam = getQueryParam('tab') || getQueryParam('mode');
    if (tabParam === 'signup' || tabParam === 'register') {
      switchTab('signup');
    }
  }

  // أزرار جوجل
  googleButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      handleGoogleClick(btn);
    });
  });

  // فحص المتصفحات المدمجة
  if (isEmbeddedBrowser() && embeddedWarning) {
    embeddedWarning.hidden = false;
  }

  if (copyLinkButton) {
    copyLinkButton.addEventListener('click', async function () {
      let link = window.location.origin + window.location.pathname;
      let copied = await copyToClipboard(link);
      copyLinkButton.textContent = copied ? 'تم النسخ، الصقه في Chrome' : 'تعذر النسخ، انسخ الرابط يدويًا';
      setTimeout(function () {
        copyLinkButton.textContent = '📋 انسخ الرابط';
      }, 3000);
    });
  }

  // فحص أخطاء الـ OAuth
  let oauthErr = readOAuthErrorFromUrl();
  if (oauthErr) {
    showError('حصل مشكلة في تسجيل الدخول بحساب Google. جرّب تاني أو استخدم الإيميل وكلمة المرور.');
  }

  // إعداد النماذج
  initPasswordToggles();
  initResetModal();
  initLoginForm();
  initSignupForm();
}

init();