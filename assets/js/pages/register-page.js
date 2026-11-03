// ============================================================
// register-page.js
// منطق صفحة تسجيل بيانات الطالب مع إمكانية اختيار أكثر من مراجعة والتبديل المباشر
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { getPublishedRevisions, registerStudent } from '../services/revisions-service.js';
import {
  getQueryParam,
  formatPrice,
  validateEgyptianPhone,
  validateEmail,
  setButtonLoading,
  getErrorMessage,
  escapeHtml
} from '../core/utils.js';

let availableRevisions = [];
let selectedCourseIds = new Set();
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

function updateSummaryPill() {
  let countEl = document.getElementById('summary-course-count');
  let titlesEl = document.getElementById('summary-course-titles');
  let priceEl = document.getElementById('summary-total-price');
  let errBox = document.getElementById('courses-selection-error');

  let selectedList = availableRevisions.filter(function (r) {
    return selectedCourseIds.has(r.id);
  });

  let totalAmount = selectedList.reduce(function (sum, r) {
    return sum + Number(r.price_egp || 120);
  }, 0);

  if (countEl) countEl.textContent = `${selectedList.length} مراجعة`;
  if (priceEl) priceEl.textContent = formatPrice(totalAmount);

  if (titlesEl) {
    if (selectedList.length === 0) {
      titlesEl.innerHTML = '<span style="color:#ef4444; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> لم تختر أي مراجعة بعد — حدد مراجعتك بالأسفل</span>';
      if (errBox) errBox.classList.add('show');
    } else {
      titlesEl.innerHTML = selectedList.map(function (r) {
        return `<span class="selected-course-tag"><i class="fa-solid fa-check"></i> ${escapeHtml(r.title)}</span>`;
      }).join(' ');
      if (errBox) errBox.classList.remove('show');
    }
  }
}

function renderRevisionsPicker() {
  let pickerEl = document.getElementById('revisions-picker-list');
  if (!pickerEl) return;

  if (availableRevisions.length === 0) {
    pickerEl.innerHTML = '<div style="color:#64748b; font-size:13px; padding:12px;">لا توجد مراجعات معلنة حالياً.</div>';
    return;
  }

  pickerEl.innerHTML = availableRevisions.map(function (rev) {
    let isChecked = selectedCourseIds.has(rev.id);
    let priceText = formatPrice(rev.price_egp || 120);

    return `
      <label class="rev-pick-card ${isChecked ? 'active' : ''}" data-id="${escapeHtml(rev.id)}">
        <input type="checkbox" class="rev-pick-checkbox" value="${escapeHtml(rev.id)}" ${isChecked ? 'checked' : ''} style="display:none;">
        
        <div class="rev-pick-box-check">
          <i class="fa-solid fa-check"></i>
        </div>

        <div class="rev-pick-info">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px; flex-wrap:wrap;">
            <strong class="rev-pick-title">${escapeHtml(rev.title)}</strong>
            <span class="rev-pick-tag"><i class="fa-solid fa-code"></i> EELU CS</span>
          </div>
          <span class="rev-pick-desc">${escapeHtml(rev.short_description || 'مراجعة شاملة للامتحان النهائي والعملي')}</span>
        </div>

        <div class="rev-pick-price">
          ${escapeHtml(priceText)}
        </div>
      </label>
    `;
  }).join('');

  // ربط أحداث النقر والاختيار المتعدد
  pickerEl.querySelectorAll('.rev-pick-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      e.preventDefault();
      let id = card.getAttribute('data-id');
      let chk = card.querySelector('.rev-pick-checkbox');

      if (selectedCourseIds.has(id)) {
        selectedCourseIds.delete(id);
        card.classList.remove('active');
        if (chk) chk.checked = false;
      } else {
        selectedCourseIds.add(id);
        card.classList.add('active');
        if (chk) chk.checked = true;
      }

      updateSummaryPill();
    });
  });

  updateSummaryPill();
}

async function initRegisterPage() {
  await initNavbar({ activePage: 'revisions' });
  setupPaymentMethodRadios();

  let paramId = getQueryParam('id') || getQueryParam('course_id');
  let errorEl = document.getElementById('register-error');
  let form = document.getElementById('register-form');
  let submitBtn = document.getElementById('submit-reg-btn');

  // جلب كل المراجعات المنشورة
  try {
    availableRevisions = await getPublishedRevisions();

    if (availableRevisions.length === 0) {
      if (errorEl) {
        errorEl.textContent = 'لا توجد مراجعات متاحة حالياً للتسجيل.';
        errorEl.hidden = false;
      }
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    // تحديد المراجعة المطلوبة مسبقاً إذا وُجدت في الرابط
    if (paramId) {
      let found = availableRevisions.find(function (r) { return r.id === paramId; });
      if (found) {
        selectedCourseIds.add(found.id);
      } else {
        // افتراضياً نختار أول مراجعة
        selectedCourseIds.add(availableRevisions[0].id);
      }
    } else {
      // اختيار أول مراجعة كخيار افتراضي سلس
      selectedCourseIds.add(availableRevisions[0].id);
    }

    renderRevisionsPicker();

  } catch (err) {
    console.error('Failed to load courses for registration:', err);
    if (errorEl) {
      errorEl.textContent = 'تعذر تحميل المراجعات المتاحة، يرجى إعادة المحاولة.';
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

      // التأكد من اختيار مراجعة واحدة على الأقل
      if (selectedCourseIds.size === 0) {
        let errBox = document.getElementById('courses-selection-error');
        if (errBox) errBox.classList.add('show');
        errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

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
      if (!phoneCheck.isValid) {
        if (phoneErrEl) {
          phoneErrEl.textContent = phoneCheck.error || 'رقم موبايل مصري غير صحيح (11 رقم يبدأ بـ 01)';
          phoneErrEl.classList.add('show');
        }
        if (phoneInput) phoneInput.classList.add('form-input--error');
        hasError = true;
      } else {
        if (phoneErrEl) phoneErrEl.classList.remove('show');
        if (phoneInput) phoneInput.classList.remove('form-input--error');
      }

      // تحقق الإيميل
      let emailErrEl = document.getElementById('email-error');
      let emailCheck = validateEmail(emailVal);
      if (!emailCheck.isValid) {
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

      // إرسال طلبات التسجيل لكل مراجعة محددة
      setButtonLoading(submitBtn, true, 'جاري حجز المقاعد وتجهيز كود التسجيل...');

      try {
        let registrationIds = [];
        let selectedArray = Array.from(selectedCourseIds);

        for (let i = 0; i < selectedArray.length; i++) {
          let cid = selectedArray[i];
          let result = await registerStudent({
            courseId: cid,
            fullName: nameVal,
            branch: branchVal,
            phone: phoneCheck.normalized,
            email: emailCheck.normalized,
            paymentMethod: selectedPaymentMethod
          });

          if (result && result.registration_id) {
            registrationIds.push(result.registration_id);
          }
        }

        if (registrationIds.length > 0) {
          window.location.href = `payment.html?id=${encodeURIComponent(registrationIds.join(','))}`;
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
