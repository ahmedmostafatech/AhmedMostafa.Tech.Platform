// ============================================================
// payment-page.js
// منطق صفحة إرشادات الدفع ورابط الواتساب (payment.html)
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getRegistrationSummary } from '../services/revisions-service.js';
import {
  getQueryParam,
  formatPrice,
  formatDateTime,
  copyToClipboard,
  escapeHtml
} from '../core/utils.js';
import { APP_CONFIG, PAYMENT_ACCOUNTS } from '../core/config.js';

async function initPaymentPage() {
  await initNavbar({ activePage: 'revisions' });

  let regId = getQueryParam('id') || getQueryParam('reg_id');

  let loadingEl = document.getElementById('payment-loading');
  let errorEl = document.getElementById('payment-error');
  let contentEl = document.getElementById('payment-content');

  if (!regId) {
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) {
      errorEl.textContent = 'رابط غير صالح، ينقص معرف التسجيل.';
      errorEl.hidden = false;
    }
    return;
  }

  try {
    let regParam = getQueryParam('id') || getQueryParam('reg_id') || getQueryParam('ids');
    let regIds = regParam.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    let summaries = [];
    for (let i = 0; i < regIds.length; i++) {
      try {
        let s = await getRegistrationSummary(regIds[i]);
        if (s) summaries.push(s);
      } catch (err) {
        console.warn('Failed to load summary for id:', regIds[i], err);
      }
    }

    if (loadingEl) loadingEl.hidden = true;

    if (summaries.length === 0) {
      if (errorEl) {
        errorEl.textContent = 'لم يتم العثور على بيانات هذا التسجيل، يرجى التأكد من الرابط.';
        errorEl.hidden = false;
      }
      return;
    }

    let first = summaries[0];
    let totalAmount = summaries.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
    let combinedCodes = summaries.map(function (item) { return item.registration_code; }).join(' • ');
    let combinedCourses = summaries.map(function (item) { return item.course_title; }).join(' + ');

    // عرض بيانات الحجز
    let codeEl = document.getElementById('reg-code-text');
    let titleEl = document.getElementById('summary-course-title');
    let nameEl = document.getElementById('summary-student-name');
    let branchEl = document.getElementById('summary-student-branch');
    let amountEl = document.getElementById('summary-amount');
    let emailEl = document.getElementById('summary-email');
    let dateEl = document.getElementById('reg-date');

    if (codeEl) codeEl.textContent = combinedCodes;
    if (titleEl) titleEl.textContent = combinedCourses;
    if (nameEl) nameEl.textContent = first.full_name;
    if (branchEl) branchEl.textContent = first.branch;
    if (amountEl) amountEl.textContent = formatPrice(totalAmount);
    if (emailEl) emailEl.textContent = first.email;
    if (dateEl && first.created_at) dateEl.textContent = formatDateTime(first.created_at);

    // تجهيز رابط الواتساب المجهز مسبقاً
    let whatsappBtn = document.getElementById('whatsapp-send-btn');
    if (whatsappBtn) {
      let methodLabel = first.payment_method === 'instapay' ? 'إنستاباي (InstaPay)' : 'فودافون كاش';
      let waText = `السلام عليكم، أنا سجلت في مراجعة: ${combinedCourses}.

بيانات التسجيل:
الاسم: ${first.full_name}
كود التسجيل: ${combinedCodes}
الفرع: ${first.branch}
رقم الهاتف: ${first.phone}
طريقة الدفع: ${methodLabel}
المبلغ الإجمالي: ${totalAmount} EGP

مرفق لحضرتك صورة إيصال التحويل، برجاء مراجعة الدفع وتأكيد الاشتراك.`;

      let waUrl = `https://wa.me/${APP_CONFIG.WHATSAPP_INTL}?text=${encodeURIComponent(waText)}`;
      whatsappBtn.href = waUrl;
    }

    // إعداد أزرار النسخ
    let copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', async function () {
        let ok = await copyToClipboard(combinedCodes);
        copyCodeBtn.innerHTML = ok ? '<i class="fa-solid fa-check"></i> تم النسخ' : 'فشل النسخ';
        setTimeout(function () {
          copyCodeBtn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ كود التسجيل';
        }, 2000);
      });
    }

    let copyVodafoneBtn = document.getElementById('copy-vodafone-btn');
    if (copyVodafoneBtn) {
      copyVodafoneBtn.addEventListener('click', async function () {
        let num = document.getElementById('vodafone-num').textContent.trim();
        let ok = await copyToClipboard(num);
        copyVodafoneBtn.textContent = ok ? 'تم النسخ ✅' : 'فشل النسخ';
        setTimeout(function () { copyVodafoneBtn.textContent = '📋 نسخ الرقم'; }, 2000);
      });
    }

    let copyInstapayBtn = document.getElementById('copy-instapay-btn');
    if (copyInstapayBtn) {
      copyInstapayBtn.addEventListener('click', async function () {
        let idVal = document.getElementById('instapay-id').textContent.trim();
        let ok = await copyToClipboard(idVal);
        copyInstapayBtn.textContent = ok ? 'تم النسخ ✅' : 'فشل النسخ';
        setTimeout(function () { copyInstapayBtn.textContent = '📋 نسخ المعرف'; }, 2000);
      });
    }

    if (contentEl) contentEl.hidden = false;

  } catch (err) {
    console.error('Failed to load payment summary:', err);
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) {
      errorEl.textContent = 'تعذر تحميل بيانات التسجيل، يرجى المحاولة ثانية.';
      errorEl.hidden = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', initPaymentPage);

