// ============================================================
// receipts-service.js
// رفع إيصال الدفع عن طريق Edge Function (signed upload URL)
// ============================================================

import { supabase } from '../core/supabase-client.js';
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from '../core/config.js';

// نداء دالة submit-receipt مع تحويل أي خطأ لكائن فيه code
async function callReceiptFunction(payload) {
  let url = SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/submit-receipt';
  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLIC_KEY,
        'Authorization': 'Bearer ' + SUPABASE_PUBLIC_KEY
      },
      body: JSON.stringify(payload)
    });
  } catch (networkError) {
    console.error('submit-receipt network error:', String(networkError));
    let netErr = new Error('network_error');
    netErr.code = 'network_error';
    throw netErr;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (parseError) {
    data = null;
  }

  if (!response.ok) {
    let code = data && data.error ? String(data.error) : 'request_failed';
    console.error('submit-receipt failed:', response.status, code);
    let err = new Error(code);
    err.code = code;
    throw err;
  }
  return data;
}

// رفع الإيصال: طلب رابط، رفع الملف، ثم تأكيد
export async function uploadReceiptSecure({ registrationIds, file }) {
  let contentType = file.type;

  let init = await callReceiptFunction({
    action: 'init',
    registrationIds: registrationIds,
    contentType: contentType
  });

  let { error: uploadErr } = await supabase.storage
    .from('receipts')
    .uploadToSignedUrl(init.path, init.token, file, { contentType: contentType });

  if (uploadErr) {
    console.error('signed upload failed:', uploadErr.message);
    let upErr = new Error('upload_failed');
    upErr.code = 'upload_failed';
    throw upErr;
  }

  return await callReceiptFunction({
    action: 'complete',
    registrationIds: registrationIds,
    path: init.path
  });
}

// رسائل الأخطاء للطالب
export function getReceiptErrorMessage(err) {
  let messages = {
    invalid_file_type: 'نوع الصورة غير مدعوم. ارفع صورة JPG أو PNG أو WebP.',
    already_submitted: 'الإيصال ده اتبعت قبل كده وبيتراجع حالياً.',
    rate_limited: 'محاولات كتير في وقت قصير. استنى شوية وحاول تاني.',
    network_error: 'مشكلة في الاتصال. اتأكد من الإنترنت وحاول تاني.'
  };
  if (err && err.code && messages[err.code]) {
    return messages[err.code];
  }
  return 'معرفتش أرفع الصورة. ممكن تبعتها لي واتساب مباشرة.';
}