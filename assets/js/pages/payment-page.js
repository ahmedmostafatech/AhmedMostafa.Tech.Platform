// ============================================================
// payment-page.js
// منطق صفحة إرشادات الدفع ورابط الواتساب (payment.html)
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { mountReceiptPrinter } from '../components/receipt-printer.js';
import { getRegistrationSummary } from '../services/revisions-service.js';
import { supabase } from '../core/supabase-client.js';
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
        copyVodafoneBtn.innerHTML = ok ? '<i class="fa-solid fa-check"></i> تم النسخ' : 'فشل النسخ';
        setTimeout(function () { copyVodafoneBtn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ الرقم'; }, 2000);
      });
    }

    let copyInstapayBtn = document.getElementById('copy-instapay-btn');
    if (copyInstapayBtn) {
      copyInstapayBtn.addEventListener('click', async function () {
        let idVal = document.getElementById('instapay-id').textContent.trim();
        let ok = await copyToClipboard(idVal);
        copyInstapayBtn.innerHTML = ok ? '<i class="fa-solid fa-check"></i> تم النسخ' : 'فشل النسخ';
        setTimeout(function () { copyInstapayBtn.innerHTML = '<i class="fa-solid fa-copy"></i> نسخ المعرف'; }, 2000);
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
        showAlert('يرجى اختيار ملف صورة صالح (JPG أو PNG أو WEBP).', 'danger');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showAlert('حجم الصورة كبير جداً، الحد الأقصى 10 ميجابايت.', 'danger');
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
          showAlert('من فضلك اختر صورة الإيصال أولاً.', 'warning');
          return;
        }

        setButtonLoading(uploadBtn, true, 'جاري رفع الإيصال...');

        try {
          // 1. رفع الصورة إلى Supabase Storage
          let ext = selectedFile.name.split('.').pop() || 'jpg';
          let fileName = `receipt_${first.registration_code}_${Date.now()}.${ext}`;

          let { data: uploadData, error: uploadErr } = await supabase.storage
            .from('receipts')
            .upload(fileName, selectedFile, {
              cacheControl: '3600',
              upsert: true
            });

          if (uploadErr) {
            console.error('Storage upload error:', uploadErr);
            throw new Error('فشل رفع ملف الصورة، يمكنك إرسالها عبر واتساب مباشرة.');
          }

          // رابط الصورة العلني
          let { data: publicUrlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(fileName);

          let receiptUrl = publicUrlData ? publicUrlData.publicUrl : '';

          // 2. ربط رابط الإيصال بجميع التسجيلات التابعة لهذا الطلب
          for (let i = 0; i < regIds.length; i++) {
            try {
              await supabase.rpc('submit_registration_receipt', {
                p_reg_id: regIds[i],
                p_receipt_url: receiptUrl
              });
            } catch (rpcErr) {
              // fallback مباشر لحفظ proof_path و receipt_url
              await supabase.from('registrations').update({
                receipt_url: receiptUrl,
                proof_path: fileName,
                payment_status: 'under_review',
                updated_at: new Date().toISOString()
              }).eq('id', regIds[i]);
            }
          }

          // 3. إرسال إشعار فوري لتليجرام بالصورة لتمكين الأدمن من القبول بنقرة واحدة
          try {
            await supabase.functions.invoke('notify-telegram', {
              body: {
                registration_id: first.id,
                registration_code: combinedCodes,
                student_name: first.full_name,
                student_email: first.email,
                student_phone: first.phone,
                course_title: combinedCourses,
                amount: totalAmount,
                payment_method: first.payment_method,
                receipt_url: receiptUrl,
                proof_path: fileName
              }
            });
          } catch (tgErr) {
            console.warn('Telegram receipt notify warning:', tgErr);
          }

          showAlert('تم رفع إيصالك بنجاح! جاري مراجعته الآن وتفعيل المادة وإرسال الرابط لإيميلك.', 'success');
          uploadBtn.hidden = true;
          cancelBtn.hidden = true;

          // تحديث ماكينة الإيصال: تطبع تاني بحالة "تحت المراجعة"
          if (printer) {
            printer.setStatus({
              text: 'تحت المراجعة',
              tone: 'review',
              label: 'وصلنا الإيصال',
              note: 'وصلنا إيصالك وبنراجعه، والرابط هيوصلك على الإيميل أول ما نتأكد.'
            });
            printer.replay();
            let mountEl = document.getElementById('receipt-printer-mount');
            if (mountEl) mountEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

        } catch (err) {
          console.error('Receipt submission failed:', err);
          showAlert(err.message || 'حدث خطأ أثناء رفع الإيصال.', 'danger');
        } finally {
          setButtonLoading(uploadBtn, false);
        }
      });
    }

    // إظهار الصفحة الأول، وبعدها نركّب الماكينة (عشان الارتفاع يتحسب صح)
    if (contentEl) contentEl.hidden = false;

    let st = first.payment_status;
    let status = st === 'paid'
      ? { text: 'تم التأكيد', tone: 'ok' }
      : st === 'under_review'
        ? { text: 'تحت المراجعة', tone: 'review' }
        : { text: 'بانتظار التحويل', tone: 'wait' };

    let methodText = first.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';

    printer = mountReceiptPrinter(document.getElementById('receipt-printer-mount'), {
      title: combinedCourses,
      subtitle: 'إيصال تسجيل مبدئي',
      amountText: formatPrice(totalAmount),
      homeHref: 'track.html',
      homeLabel: 'متابعة الطلب',
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
          : 'وصلنا إيصالك وبنراجعه، والرابط هيوصلك على الإيميل أول ما نتأكد.'
      }
    });

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