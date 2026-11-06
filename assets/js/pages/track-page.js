// ============================================================
// track-page.js
// منطق صفحة متابعة حالة الطلب للطلاب (track.html)
// ============================================================

import { initNavbar } from '../components/navbar.js';
import { trackStudentRegistration } from '../services/revisions-service.js';
import {
  formatPrice,
  formatDateTime,
  escapeHtml,
  setButtonLoading,
  getQueryParam,
  initSpotlightCards
} from '../core/utils.js';

function byId(id) {
  return document.getElementById(id);
}

async function handleTrack(code, phoneSuffix) {
  let submitBtn = byId('btn-track-submit');
  let errBox = byId('track-error');
  let resultBox = byId('track-result-box');

  if (errBox) errBox.hidden = true;

  setButtonLoading(submitBtn, true, 'بدوّر على طلبك...');

  try {
    let reg = await trackStudentRegistration(code, phoneSuffix);

    // ملء بيانات النتيجة
    byId('res-code').textContent = reg.registration_code;
    byId('res-name').textContent = reg.full_name;
    byId('res-course').textContent = reg.course_title;
    byId('res-amount').textContent = formatPrice(reg.amount);
    byId('res-method').textContent = reg.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش';
    byId('res-date').textContent = formatDateTime(reg.created_at);
    byId('res-email').textContent = reg.email;
    byId('res-receipt-status').textContent = reg.has_receipt ? 'الإيصال وصلني' : 'لسه ما بعتش إيصال من الموقع';

    // ضبط بانر وشارة الحالة
    let badgeEl = byId('res-status-badge');
    let bannerEl = byId('res-status-banner');
    let titleEl = byId('res-status-title');
    let descEl = byId('res-status-desc');
    let accessBox = byId('res-access-box');
    let payBox = byId('res-pay-box');

    accessBox.hidden = true;
    payBox.hidden = true;

    if (reg.payment_status === 'paid') {
      badgeEl.innerHTML = '<span class="badge badge--success">مؤكد ومفعّل</span>';
      bannerEl.className = 'status-banner status-banner--paid';
      titleEl.textContent = 'مبروك، اشتراكك اتفعّل';
      descEl.textContent = `الرابط جاهز وتقدر تبدأ تذاكر. صلاحيتك لحد ${reg.access_until ? formatDateTime(reg.access_until) : 'نهاية الامتحانات'}.`;

      if (reg.access_link) {
        byId('res-drive-btn').href = reg.access_link;
        accessBox.hidden = false;
      }

    } else if (reg.payment_status === 'under_review') {
      badgeEl.innerHTML = '<span class="badge badge--accent">قيد المراجعة</span>';
      bannerEl.className = 'status-banner status-banner--review';
      titleEl.textContent = 'وصلني الإيصال وبراجعه';
      descEl.textContent = 'خد نفس، دقايق وتتفعّل بإذن الله. أول ما التحويل يتأكد الرابط هيجيلك على الإيميل.';

    } else if (reg.payment_status === 'rejected') {
      badgeEl.innerHTML = '<span class="badge badge--danger">مرفوض</span>';
      bannerEl.className = 'status-banner status-banner--rejected';
      titleEl.textContent = 'مقدرتش أأكد الطلب';
      descEl.textContent = reg.rejection_reason
        ? `السبب: ${reg.rejection_reason}. كلّمني واتساب ومعاك كود التسجيل وهنحلها.`
        : 'مقدرتش أطابق التحويل مع الإيصال. كلّمني واتساب ومعاك كود التسجيل وهنحلها سوا.';

    } else {
      // pending_payment
      badgeEl.innerHTML = '<span class="badge badge--warning">مستني التحويل</span>';
      bannerEl.className = 'status-banner status-banner--pending';
      titleEl.textContent = 'بياناتك اتسجّلت، فاضل التحويل';
      descEl.textContent = 'حوّل المبلغ وارفع صورة الإيصال أو ابعتها واتساب، وأنا أكمّل من عندي.';

      // رابط صفحة الدفع
      byId('res-pay-link').href = `payment.html?id=${encodeURIComponent(code)}`;
      payBox.hidden = false;
    }

    resultBox.hidden = false;
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    initSpotlightCards();

  } catch (err) {
    console.error('Tracking failed:', err);
    if (resultBox) resultBox.hidden = true;
    if (errBox) {
      errBox.textContent = err.message || 'مش لاقي طلب بالبيانات دي. اتأكد من الكود وآخر 4 أرقام من الموبايل.';
      errBox.hidden = false;
    }
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

async function initTrackPage() {
  await initNavbar({ activePage: 'track' });

  let form = byId('track-form');
  let codeInput = byId('track-code');
  let phoneInput = byId('track-phone');

  // تعبئة الكود من الرابط إن وجد (مثل ?code=AMT-1002)
  let paramCode = getQueryParam('code') || getQueryParam('reg_code');
  if (paramCode && codeInput) {
    codeInput.value = paramCode.toUpperCase();
    if (phoneInput) phoneInput.focus();
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      let code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      let phone = phoneInput ? phoneInput.value.trim() : '';

      if (!code || !phone) {
        let errBox = byId('track-error');
        if (errBox) {
          errBox.textContent = 'اكتب كود التسجيل ورقم الموبايل الأول.';
          errBox.hidden = false;
        }
        return;
      }

      handleTrack(code, phone);
    });
  }

  initSpotlightCards();
}

document.addEventListener('DOMContentLoaded', initTrackPage);

