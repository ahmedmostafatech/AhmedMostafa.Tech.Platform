// ============================================================
// login-page.js
// منطق صفحة تسجيل الدخول
// ============================================================

import { signInWithGoogle } from '../core/auth.js';
import { redirectIfAuthenticated } from '../core/guard.js';
import {
  qs,
  getQueryParam,
  sanitizeNextPath,
  setButtonLoading,
  getErrorMessage,
  copyToClipboard
} from '../core/utils.js';

let googleButton = qs('#google-btn');
let errorBox = qs('#login-error');
let embeddedWarning = qs('#embedded-warning');
let copyLinkButton = qs('#copy-link-btn');

// إظهار الصفحة لو حصل أي خطأ في الفحص (عشان ما تفضلش فاضية)
function revealPageFallback() {
  document.documentElement.classList.remove('guard-pending');
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.textContent = '';
  errorBox.hidden = true;
}

// هل الصفحة مفتوحة داخل متصفح مدمج في تطبيق؟ (جوجل بيمنع الدخول منه)
function isEmbeddedBrowser() {
  let ua = navigator.userAgent || '';
  let knownApps = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|TikTok|musical_ly|BytedanceWebview|Line\/|Twitter|MicroMessenger/i;
  let androidWebView = /; wv\)/i;
  return knownApps.test(ua) || androidWebView.test(ua);
}

// قراءة خطأ OAuth لو جوجل أو Supabase رجعوه في الرابط
function readOAuthErrorFromUrl() {
  let query = new URLSearchParams(window.location.search);
  let hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  let errorCode = query.get('error') || hash.get('error');
  if (!errorCode) {
    return null;
  }

  let description = query.get('error_description') || hash.get('error_description');
  console.warn('OAuth error returned:', errorCode, description);

  // تنظيف الرابط من بيانات الخطأ (مع الإبقاء على next)
  let cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('error');
  cleanUrl.searchParams.delete('error_code');
  cleanUrl.searchParams.delete('error_description');
  cleanUrl.hash = '';
  window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search);

  return errorCode;
}

async function handleGoogleClick() {
  hideError();
  setButtonLoading(googleButton, true, 'جاري التحويل إلى جوجل...');

  try {
    let nextPath = sanitizeNextPath(getQueryParam('next'));
    await signInWithGoogle(nextPath);
    // المتصفح بيتحول لجوجل هنا، فمش بنرجّع حالة الزر عمدًا
  } catch (error) {
    console.error('Google login click failed:', error);
    showError(getErrorMessage(error));
    setButtonLoading(googleButton, false);
  }
}

async function handleCopyLinkClick() {
  let link = window.location.origin + window.location.pathname;
  let copied = await copyToClipboard(link);
  copyLinkButton.textContent = copied ? 'تم النسخ، الصقه في Chrome' : 'تعذر النسخ، انسخ الرابط يدويًا';
  setTimeout(function () {
    copyLinkButton.textContent = 'نسخ رابط الصفحة';
  }, 3000);
}

async function init() {
  try {
    // لو مسجل بالفعل بيتحول للصفحة المطلوبة، وإلا بتظهر الصفحة
    let redirected = await redirectIfAuthenticated();
    if (redirected) {
      return;
    }
  } catch (error) {
    console.error('Login page init failed:', error);
    revealPageFallback();
  }

  let oauthError = readOAuthErrorFromUrl();
  if (oauthError === 'access_denied') {
    showError('تم إلغاء تسجيل الدخول. حاول مرة أخرى.');
  } else if (oauthError) {
    showError('تعذر إكمال تسجيل الدخول، حاول مرة أخرى.');
  }

  if (isEmbeddedBrowser()) {
    embeddedWarning.hidden = false;
  }

  googleButton.addEventListener('click', handleGoogleClick);
  copyLinkButton.addEventListener('click', handleCopyLinkClick);
}

init();