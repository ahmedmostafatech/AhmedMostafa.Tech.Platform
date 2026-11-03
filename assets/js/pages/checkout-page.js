// ============================================================
// checkout-page.js
// منطق صفحة تأكيد الاشتراك والدفع
// ============================================================

import { requireAuth } from '../core/guard.js';
import { getMyProfile } from '../core/auth.js';
import { getCourseById } from '../services/courses-service.js';
import { checkCourseAccess } from '../services/subscriptions-service.js';
import {
  createOrder,
  submitPayment,
  uploadReceiptProof,
  getActivePendingOrder
} from '../services/orders-service.js';
import { initNavbar } from '../components/navbar.js';
import {
  escapeHtml,
  formatPrice,
  formatExactAmount,
  formatDate,
  getQueryParam,
  sitePath,
  setButtonLoading,
  getErrorMessage,
  copyToClipboard,
  qs,
  qsa
} from '../core/utils.js';
import { ROUTES } from '../core/config.js';

let currentSession = null;
let currentProfile = null;
let currentCourse = null;
let currentOrderId = null;
let currentOrderAmount = null;
let selectedMethod = 'vodafone_cash';
let receiptFile = null;

// عناصر DOM
let activeUserEmailEl = qs('#active-user-email');
let exactAmountEl = qs('#checkout-exact-amount');
let copyAmountBtn = qs('#copy-amount-btn');
let copyNumberBtn = qs('#copy-number-btn');
let transferNumberEl = qs('#transfer-target-number');
let transferInstructionsNote = qs('#transfer-instructions-note');

let methodCards = qsa('.payment-method-card');
let confirmForm = qs('#payment-confirm-form');
let txRefInput = qs('#tx-ref-input');
let txRefErr = qs('#tx-ref-err');
let submitBtn = qs('#submit-order-btn');
let errorAlert = qs('#checkout-error');

let dropZone = qs('#drop-zone');
let fileInput = qs('#receipt-file-input');
let previewImg = qs('#receipt-preview-img');

let formSection = qs('#checkout-form-section');
let successSection = qs('#checkout-success-section');

function showError(msg) {
  if (!errorAlert) return;
  errorAlert.textContent = msg;
  errorAlert.hidden = false;
  errorAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  if (!errorAlert) return;
  errorAlert.textContent = '';
  errorAlert.hidden = true;
}

// تحديث طريقة الدفع المختارة
function setPaymentMethod(method) {
  selectedMethod = method;

  methodCards.forEach(function (card) {
    let radio = card.querySelector('input[type="radio"]');
    if (radio && radio.value === method) {
      card.classList.add('active');
      radio.checked = true;
    } else {
      card.classList.remove('active');
    }
  });

  if (method === 'vodafone_cash') {
    transferNumberEl.textContent = '01066843568';
    transferInstructionsNote.textContent = '💡 حول كاش عادي للمحفظة من تطبيق أنا فودافون أو كود *9*7*الرقم*المبلغ#';
  } else {
    transferNumberEl.textContent = '01066843568';
    transferInstructionsNote.textContent = '💡 حول من تطبيق إنستاباي (InstaPay) على رقم الموبايل أو المعرف الموضح أعلاه.';
  }
}

// الحصول على الطلب أو إنشائه
async function ensureOrder() {
  hideError();

  try {
    // 1. هل يوجد طلب معلق بالفعل لنفس المادة للمستخدم؟
    let existing = await getActivePendingOrder(currentCourse.id);
    if (existing) {
      currentOrderId = existing.id;
      currentOrderAmount = existing.amount;
      exactAmountEl.textContent = `${formatExactAmount(existing.amount)} ج.م`;
      setPaymentMethod(existing.payment_method || 'vodafone_cash');
      return;
    }

    // 2. إذا لم يوجد، ننشئ طلباً جديداً
    let orderRes = await createOrder(currentCourse.id, selectedMethod);
    if (orderRes) {
      currentOrderId = orderRes.order_id || orderRes.id;
      currentOrderAmount = orderRes.amount;
      exactAmountEl.textContent = `${formatExactAmount(orderRes.amount)} ج.م`;
    }
  } catch (err) {
    console.error('Failed to create/get order:', err);
    showError(getErrorMessage(err));
    exactAmountEl.textContent = `${currentCourse.price_egp || currentCourse.price || 120}.00 ج.م`;
  }
}

// إعداد السحب والإفلات لرفع الملفات
function setupFileUploader() {
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) {
      handleSelectedFile(fileInput.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(function (eventName) {
    dropZone.addEventListener(eventName, function (e) {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(function (eventName) {
    dropZone.addEventListener(eventName, function (e) {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });
}

function handleSelectedFile(file) {
  receiptFile = file;

  if (file.type.startsWith('image/')) {
    let reader = new FileReader();
    reader.onload = function (e) {
      previewImg.src = e.target.result;
      previewImg.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    previewImg.style.display = 'none';
  }

  let textEl = dropZone.querySelector('div[style*="font-weight:700"]');
  if (textEl) {
    textEl.textContent = `✅ تم اختيار الملف: ${file.name}`;
  }
}

// تهيئة الصفحة
async function init() {
  // 1. حماية الصفحة بالـ Auth
  currentSession = await requireAuth();
  if (!currentSession) return;

  document.documentElement.classList.remove('guard-pending');
  initNavbar({ activePage: 'checkout' });

  // 2. تحميل الحساب
  currentProfile = await getMyProfile(false);
  if (activeUserEmailEl) {
    activeUserEmailEl.textContent = (currentProfile && currentProfile.email) || currentSession.user.email;
  }

  // تنبيه إذا كان رقم الهاتف غير مكتمل
  if (currentProfile && !currentProfile.phone) {
    showError('تنبيه: حسابك لا يحتوي على رقم موبايل مسجل. يرجى إكماله من لوحة التحكم لتفادي أي تأخير في مراجعة وتفعيل اشتراكك.');
  }

  // 3. جلب بيانات المادة
  let courseId = getQueryParam('course_id') || getQueryParam('id');
  currentCourse = await getCourseById(courseId);

  if (!currentCourse) {
    showError('المادة المطلوبة غير موجودة أو غير متاحة للاشتراك حالياً.');
    return;
  }

  // 4. هل المستخدم مشترك بالفعل؟
  let hasAccess = false;
  try {
    hasAccess = await checkCourseAccess(currentCourse.id);
  } catch (e) {
    hasAccess = false;
  }

  if (hasAccess) {
    showError('أنت مشترك بالفعل في هذه المادة ولديك حق الوصول لجميع الفيديوهات!');
    setTimeout(function () {
      window.location.replace(sitePath(ROUTES.DASHBOARD));
    }, 2000);
    return;
  }

  // 5. تحديث ملخص المادة في العمود الجانبي
  qs('#summary-course-title').textContent = currentCourse.title;
  if (currentCourse.access_until) {
    qs('#summary-expiry-date').textContent = formatDate(currentCourse.access_until);
  }
  qs('#summary-total-price').textContent = formatPrice(currentCourse.price_egp || currentCourse.price || 120);

  // 6. أحداث اختيار طريقة الدفع
  methodCards.forEach(function (card) {
    card.addEventListener('click', function () {
      let radio = card.querySelector('input[type="radio"]');
      if (radio) {
        setPaymentMethod(radio.value);
      }
    });
  });

  // 7. أزرار النسخ
  if (copyNumberBtn) {
    copyNumberBtn.addEventListener('click', async function () {
      let num = transferNumberEl.textContent.trim();
      let ok = await copyToClipboard(num);
      copyNumberBtn.textContent = ok ? 'تم النسخ ✅' : 'انسخ يدوياً';
      setTimeout(function () { copyNumberBtn.textContent = '📋 نسخ الرقم'; }, 2500);
    });
  }

  if (copyAmountBtn) {
    copyAmountBtn.addEventListener('click', async function () {
      if (!currentOrderAmount) return;
      let exact = formatExactAmount(currentOrderAmount);
      let ok = await copyToClipboard(exact);
      copyAmountBtn.textContent = ok ? 'تم نسخ المبلغ ✅' : 'انسخ يدوياً';
      setTimeout(function () { copyAmountBtn.textContent = '📋 نسخ المبلغ بالظبط'; }, 2500);
    });
  }

  // 8. إعداد رافع الملفات
  setupFileUploader();

  // 9. إنشاء أو استرجاع الطلب الفريد
  await ensureOrder();

  // 10. إرسال النموذج وتأكيد الدفع
  if (confirmForm) {
    confirmForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideError();
      if (txRefErr) {
        txRefErr.textContent = '';
        txRefErr.classList.remove('show');
      }

      let txRef = txRefInput.value.trim();
      if (!txRef || txRef.length < 3) {
        if (txRefErr) {
          txRefErr.textContent = 'من فضلك اكتب رقم العملية المرجعي من رسالة التحويل (على الأقل 3 خانات).';
          txRefErr.classList.add('show');
        }
        txRefInput.classList.add('form-input--error');
        return;
      }
      txRefInput.classList.remove('form-input--error');

      if (!currentOrderId) {
        showError('حصل خطأ في إنشاء الطلب، أعد تحميل الصفحة وحاول مجدداً.');
        return;
      }

      setButtonLoading(submitBtn, true, 'جاري إرسال وتأكيد الطلب...');

      try {
        // رفع صورة الإيصال إن وُجدت
        let proofPath = null;
        if (receiptFile) {
          proofPath = await uploadReceiptProof(currentSession.user.id, currentOrderId, receiptFile);
        }

        // استدعاء submit_payment مع بيانات الإشعار
        await submitPayment(currentOrderId, txRef, proofPath, {
          amount: currentOrderAmount,
          courseTitle: currentCourse ? currentCourse.title : 'مادة دراسية',
          studentEmail: (currentProfile && currentProfile.email) || currentSession.user.email,
          studentName: (currentProfile && currentProfile.full_name) || '',
          studentPhone: (currentProfile && currentProfile.phone) || '',
          paymentMethod: selectedMethod
        });

        // إظهار شاشة النجاح
        if (formSection) formSection.hidden = true;
        if (successSection) {
          qs('#success-order-id').textContent = currentOrderId.slice(0, 8) + '...';
          qs('#success-order-amount').textContent = `${formatExactAmount(currentOrderAmount)} ج.م`;
          successSection.hidden = false;
          successSection.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (err) {
        console.error('Submit payment failed:', err);
        showError(getErrorMessage(err));
        setButtonLoading(submitBtn, false);
      }
    });
  }
}

init();
