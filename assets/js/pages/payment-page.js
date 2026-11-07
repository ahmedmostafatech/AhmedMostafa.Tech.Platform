// ============================================================
// payment-page.js
// منطق صفحة إرشادات الدفع ورابط الواتساب (payment.html)
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { mountReceiptPrinter } from '../components/receipt-printer.js';
import { getRegistrationSummary } from '../services/revisions-service.js';
import { supabase } from '../core/supabase-client.js';
import { uploadReceiptSecure, getReceiptErrorMessage } from '../services/receipts-service.js';
import {
  getQueryParam,
  formatPrice,
  formatDateTime,
  copyToClipboard,
  escapeHtml,
  setButtonLoading
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
      errorEl.textContent = 'الرابط ده ناقصه معرّف التسجيل.';
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
        errorEl.textContent = 'مش لاقي بيانات التسجيل ده. راجع الرابط وجرّب تاني.';
        errorEl.hidden = false;
      }
      return;
    }

    let first = summaries[0];
    let totalAmount = summaries.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
    let combinedCodes = summaries.map(function (item) { return item.registration_code; }).join(' • ');
    let combinedCourses = summaries.map(function (item) { return item.course_title; }).join(' + ');

    // ماكينة الإيصال (بتتركّب في آخر الدالة بعد ما الصفحة تظهر)
    let printer = null;

    // عرض بيانات الحجز (باقي البيانات بقت على ورقة الإيصال)
    let codeEl = document.getElementById('reg-code-text');
    let dateEl = document.getElementById('reg-date');

    if (codeEl) codeEl.textContent = combinedCodes;
    if (dateEl && first.created_at) dateEl.textContent = formatDateTime(first.created_at);

    // تجهيز رابط الواتساب المجهز مسبقاً
    let whatsappBtn = document.getElementById('whatsapp-send-btn');
    if (whatsappBtn) {
      let methodLabel = first.payment_method === 'instapay' ? 'إنستاباي (InstaPay)' : 'فودافون كاش';
      let waText = `السلام عليكم يا هندسة، أنا سجّلت في مراجعة: ${combinedCourses}.

بياناتي:
الاسم: ${first.full_name}
كود التسجيل: ${combinedCodes}
الفرع: ${first.branch}
رقم الموبايل: ${first.phone}
طريقة الدفع: ${methodLabel}
المبلغ الإجمالي: ${totalAmount} EGP

بعتلك صورة إيصال التحويل. ممكن تراجع الدفع وتفعل اشتراكي؟ .`;

      let waUrl = `https://wa.me/${APP_CONFIG.WHATSAPP_INTL}?text=${encodeURIComponent(waText)}`;
      whatsappBtn.href = waUrl;
    }

    // إعداد أزرار النسخ
    let copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', async function () {
        let ok = await copyToClipboard(combinedCodes);
        copyCodeBtn.innerHTML = ok ? '<i class="fa-solid fa-check"></i> اتنسخ' : 'معرفتش أنسخ، جرّب تاني';
        setTimeout(function () {
          copyCodeBtn.innerHTML = '<i class="fa-solid fa-copy"></i> انسخ كود التسجيل';
        }, 2000);
      });
    }

    let copyVodafoneBtn = document.getElementById('copy-vodafone-btn');
    if (copyVodafoneBtn) {
      copyVodafoneBtn.addEventListener('click', async function () {
        let num = document.getElementById('vodafone-num').textContent.trim();
        let ok = await copyToClipboard(num);
        copyVodafoneBtn.innerHTML = ok ? '<i class="fa-solid fa-check"></i> اتنسخ' : 'معرفتش أنسخ، جرّب تاني';
        setTimeout(function () { copyVodafoneBtn.innerHTML = '<i class="fa-solid fa-copy"></i> انسخ الرقم'; }, 2000);
      });
    }

    let copyInstapayBtn = document.getElementById('copy-instapay-btn');
    if (copyInstapayBtn) {
      copyInstapayBtn.addEventListener('click', async function () {
        let idVal = document.getElementById('instapay-id').textContent.trim();
        let ok = await copyToClipboard(idVal);
        copyInstapayBtn.innerHTML = ok ? '<i class="fa-solid fa-check"></i> اتنسخ' : 'معرفتش أنسخ، جرّب تاني';
        setTimeout(function () { copyInstapayBtn.innerHTML = '<i class="fa-solid fa-copy"></i> انسخ المعرّف'; }, 2000);
      });
    }

    // إعداد رفع صورة الإيصال مباشرة
    let fileInput = document.getElementById('receipt-file-input');
    let dropzone = document.getElementById('receipt-dropzone');
    let previewBox = document.getElementById('receipt-preview-box');
    let previewImg = document.getElementById('receipt-preview-img');
    let uploadBtn = document.getElementById('btn-upload-receipt');
    let cancelBtn = document.getElementById('btn-cancel-receipt');
    let alertBox = document.getElementById('receipt-upload-alert');
    let selectedFile = null;

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', function () {
        fileInput.click();
      });

      dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--color-accent)';
        dropzone.style.background = '#f1f5f9';
      });

      dropzone.addEventListener('dragleave', function () {
        dropzone.style.borderColor = '#cbd5e1';
        dropzone.style.background = '#fff';
      });

      dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.style.borderColor = '#cbd5e1';
        dropzone.style.background = '#fff';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleSelectedFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) {
          handleSelectedFile(fileInput.files[0]);
        }
      });
    }

    function handleSelectedFile(file) {
      if (!file.type.startsWith('image/')) {
        showAlert('اختار صورة بصيغة JPG أو PNG أو WEBP.', 'danger');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showAlert('الصورة كبيرة، الحد الأقصى 10 ميجا.', 'danger');
        return;
      }
      selectedFile = file;
      let reader = new FileReader();
      reader.onload = function (e) {
        previewImg.src = e.target.result;
        previewBox.hidden = false;
        dropzone.hidden = true;
        if (alertBox) alertBox.hidden = true;
      };
      reader.readAsDataURL(file);
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        selectedFile = null;
        fileInput.value = '';
        previewBox.hidden = true;
        dropzone.hidden = false;
      });
    }

    function showAlert(msg, type) {
      if (!alertBox) return;
      alertBox.textContent = msg;
      alertBox.className = 'alert alert--' + type;
      alertBox.hidden = false;
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', async function () {
        if (!selectedFile) {
          showAlert('اختار صورة الإيصال الأول.', 'warning');
          return;
        }

        setButtonLoading(uploadBtn, true, 'برفع الإيصال...');

        try {
          // 1. رفع الصورة إلى Supabase Storage
// الرفع والتأكيد وتنبيه تليجرام كلها بتحصل عن طريق السيرفر
try {
  await uploadReceiptSecure({ registrationIds: regIds, file: selectedFile });
} catch (uploadErr) {
  console.error('Receipt upload failed:', uploadErr);
  throw new Error(getReceiptErrorMessage(uploadErr));
}

          showAlert('وصلني إيصالك. هراجعه دلوقتي وأفعّل المادة، والرابط هيوصلك على إيميلك.', 'success');
          uploadBtn.hidden = true;
          cancelBtn.hidden = true;

          // تحديث ماكينة الإيصال: تطبع تاني بحالة "تحت المراجعة"
          if (printer) {
            printer.setStatus({
              text: 'تحت المراجعة',
              tone: 'review',
              label: 'وصلني الإيصال',
              note: 'الإيصال وصلني وبراجعه، والرابط هيوصلك على الإيميل أول ما أتأكد.'
            });
            printer.replay();
            let mountEl = document.getElementById('receipt-printer-mount');
            if (mountEl) mountEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

        } catch (err) {
          console.error('Receipt submission failed:', err);
          showAlert(err.message || 'حصلت مشكلة وأنا برفع الإيصال. جرّب تاني أو ابعته واتساب.', 'danger');
        } finally {
          setButtonLoading(uploadBtn, false);
        }
      });
    }

    // إظهار الصفحة الأول، وبعدها نركّب الماكينة (عشان الارتفاع يتحسب صح)
    if (contentEl) contentEl.hidden = false;

    let st = first.payment_status;
    let status = st === 'paid'
      ? { text: 'اتأكّد', tone: 'ok' }
      : st === 'under_review'
        ? { text: 'تحت المراجعة', tone: 'review' }
        : { text: 'مستني التحويل', tone: 'wait' };

    let methodText = first.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';

    printer = mountReceiptPrinter(document.getElementById('receipt-printer-mount'), {
      title: combinedCourses,
      subtitle: 'إيصال تسجيل مبدئي',
      amountText: formatPrice(totalAmount),
      homeHref: 'track.html',
      homeLabel: 'طلبي وصل فين؟',
      homeIcon: 'fa-magnifying-glass',
      receipt: {
        heading: 'إيصال تسجيل',
        code: first.registration_code,
        rows: [
          { label: 'كود التسجيل', value: combinedCodes, ltr: true },
          { label: 'الاسم', value: first.full_name },
          { label: 'الفرع', value: first.branch },
          { label: 'المادة', value: combinedCourses },
          { label: 'وسيلة التحويل', value: methodText },
          { label: 'الإيميل', value: first.email, ltr: true },
          { label: 'التاريخ', value: first.created_at ? formatDateTime(first.created_at) : '-' }
        ],
        total: { label: 'المطلوب تحويله', value: formatPrice(totalAmount) },
        status: status,
        note: status.tone === 'wait'
          ? 'حوّل المبلغ وارفع صورة الإيصال هنا أو ابعتها واتساب مع كود التسجيل.'
          : 'الإيصال وصلني وبراجعه، والرابط هيوصلك على الإيميل أول ما أتأكد.'
      }
    });

  } catch (err) {
    console.error('Failed to load payment summary:', err);
    if (loadingEl) loadingEl.hidden = true;
    if (errorEl) {
      errorEl.textContent = 'معرفتش أحمّل بيانات تسجيلك، جرّب تاني.';
      errorEl.hidden = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', initPaymentPage);