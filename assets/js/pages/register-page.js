// ============================================================
// register-page.js
// منطق صفحة تسجيل بيانات الطالب بدون حساب (register.html)
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getRevisionById, registerStudent } from '../services/revisions-service.js';
import {
  getQueryParam,
  formatPrice,
  validateEgyptianPhone,
  validateEmail,
  setButtonLoading,
  getErrorMessage,
  escapeHtml
} from '../core/utils.js';

let currentCourse = null;
let selectedPaymentMethod = 'vodafone_cash';

function setupPaymentMethodRadios() {
  let cards = document.querySelectorAll('.method-radio-card');
  cards.forEach(function (card) {
    let radio = card.querySelector('input[type="radio"]');
    if (radio) {
      card.addEventListener('click', function () {
        cards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        radio.checked = true;
        selectedPaymentMethod = radio.value;
      });
    }
  });
}

async function initRegisterPage() {
  await initNavbar({ activePage: 'revisions' });
  setupPaymentMethodRadios();

  let courseId = getQueryParam('id') || getQueryParam('course_id');
  let errorEl = document.getElementById('register-error');
  let titleEl = document.getElementById('summary-course-title');
  let priceEl = document.getElementById('summary-course-price');
  let form = document.getElementById('register-form');
  let submitBtn = document.getElementById('submit-reg-btn');

  if (!courseId) {
    if (errorEl) {
      errorEl.textContent = 'من فضلك اختر المراجعة أولاً من صفحة المراجعات المتاحة.';
      errorEl.hidden = false;
    }
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  // جلب بيانات المراجعة المختارة
  try {
    currentCourse = await getRevisionById(courseId);
    if (!currentCourse) {
      if (errorEl) {
        errorEl.textContent = 'المراجعة المطلوبة غير متاحة حالياً للتسجيل.';
        errorEl.hidden = false;
      }
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    if (titleEl) titleEl.textContent = currentCourse.title;
    if (priceEl) priceEl.textContent = formatPrice(currentCourse.price_egp || 120);

  } catch (err) {
    console.error('Failed to load course for registration:', err);
    if (errorEl) {
      errorEl.textContent = 'تعذر تحميل بيانات المراجعة، يرجى إعادة المحاولة.';
      errorEl.hidden = false;
    }
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  // معالجة إرسال الفورم
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (errorEl) errorEl.hidden = true;

      let nameInput = document.getElementById('reg-name');
      let branchInput = document.getElementById('reg-branch');
      let phoneInput = document.getElementById('reg-phone');
      let emailInput = document.getElementById('reg-email');

      let nameVal = nameInput ? nameInput.value.trim() : '';
      let branchVal = branchInput ? branchInput.value.trim() : '';
      let phoneVal = phoneInput ? phoneInput.value.trim() : '';
      let emailVal = emailInput ? emailInput.value.trim() : '';

      let hasError = false;

      // تحقق الاسم
      let nameErrEl = document.getElementById('name-error');
      if (!nameVal || nameVal.length < 3) {
        if (nameErrEl) nameErrEl.classList.add('show');
        if (nameInput) nameInput.classList.add('form-input--error');
        hasError = true;
      } else {
        if (nameErrEl) nameErrEl.classList.remove('show');
        if (nameInput) nameInput.classList.remove('form-input--error');
      }

      // تحقق الفرع
      let branchErrEl = document.getElementById('branch-error');
      if (!branchVal || branchVal.length < 2) {
        if (branchErrEl) branchErrEl.classList.add('show');
        if (branchInput) branchInput.classList.add('form-input--error');
        hasError = true;
      } else {
        if (branchErrEl) branchErrEl.classList.remove('show');
        if (branchInput) branchInput.classList.remove('form-input--error');
      }

      // تحقق الموبايل
      let phoneErrEl = document.getElementById('phone-error');
      let phoneCheck = validateEgyptianPhone(phoneVal);
      if (!phoneCheck.valid) {
        if (phoneErrEl) phoneErrEl.classList.add('show');
        if (phoneInput) phoneInput.classList.add('form-input--error');
        hasError = true;
      } else {
        if (phoneErrEl) phoneErrEl.classList.remove('show');
        if (phoneInput) phoneInput.classList.remove('form-input--error');
      }

      // تحقق الإيميل
      let emailErrEl = document.getElementById('email-error');
      if (!validateEmail(emailVal)) {
        if (emailErrEl) emailErrEl.classList.add('show');
        if (emailInput) emailInput.classList.add('form-input--error');
        hasError = true;
      } else {
        if (emailErrEl) emailErrEl.classList.remove('show');
        if (emailInput) emailInput.classList.remove('form-input--error');
      }

      if (hasError) {
        return;
      }

      // إرسال التسجيل إلى السيرفر
      setButtonLoading(submitBtn, true, 'جاري تأكيد التسجيل وحجز المقعد...');

      try {
        let result = await registerStudent({
          courseId: currentCourse.id,
          fullName: nameVal,
          branch: branchVal,
          phone: phoneCheck.normalized,
          email: emailVal,
          paymentMethod: selectedPaymentMethod
        });

        if (result && result.registration_id) {
          // التوجيه الفوري لصفحة الدفع مع معرّف التسجيل
          window.location.href = `payment.html?id=${encodeURIComponent(result.registration_id)}`;
        } else {
          throw new Error('لم يتم استلام كود التسجيل من السيرفر.');
        }

      } catch (err) {
        console.error('Registration failed:', err);
        setButtonLoading(submitBtn, false);
        if (errorEl) {
          errorEl.textContent = getErrorMessage(err);
          errorEl.hidden = false;
          errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initRegisterPage);

