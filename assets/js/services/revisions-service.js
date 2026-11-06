// ============================================================
// revisions-service.js
// التعامل مع المراجعات وعمليات التسجيل بدون حسابات
// ============================================================

import { supabase } from '../core/supabase-client.js';
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from '../core/config.js';

// جلب كل المراجعات المنشورة المتاحة للزوار
export async function getPublishedRevisions() {
  let { data, error } = await supabase
    .from('courses')
    .select('id, title, description, short_description, price_egp, access_until, created_at')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getPublishedRevisions failed:', error.message);
    throw error;
  }

  return data || [];
}

// جلب تفاصيل مراجعة محددة بالمعرف (ID)
export async function getRevisionById(courseId) {
  if (!courseId) {
    return null;
  }

  let { data, error } = await supabase
    .from('courses')
    .select('id, title, description, short_description, price_egp, access_until, created_at')
    .eq('id', courseId)
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    console.error('getRevisionById failed:', error.message);
    throw error;
  }

  return data;
}

// تسجيل طالب جديد في مراجعة عبر الدالة الآمنة (RPC)
export async function registerStudent({ courseId, fullName, branch, phone, email, paymentMethod, discountCode = null }) {
  // محاولة استخدام الدالة المحدثة مع دعم الكوبون
  try {
    let { data, error } = await supabase.rpc('register_student_with_coupon', {
      p_course_id: courseId,
      p_full_name: fullName,
      p_branch: branch,
      p_phone: phone,
      p_email: email,
      p_payment_method: paymentMethod,
      p_discount_code: discountCode || null
    });
    if (!error) return data;
    console.warn('register_student_with_coupon not found, falling back to register_student');
  } catch (e) {
    // fallback
  }

  let { data, error } = await supabase.rpc('register_student', {
    p_course_id: courseId,
    p_full_name: fullName,
    p_branch: branch,
    p_phone: phone,
    p_email: email,
    p_payment_method: paymentMethod
  });

  if (error) {
    console.error('register_student failed:', error.message);
    throw error;
  }

  return data;
}

// فحص كود الخصم عبر RPC
export async function validateCoupon(code, totalAmount) {
  let { data, error } = await supabase.rpc('validate_discount_code', {
    p_code: code,
    p_total_amount: totalAmount
  });

  if (error) {
    throw error;
  }
  return data;
}

// تتبع حالة التسجيل للطلاب
export async function trackStudentRegistration(code, phoneSuffix) {
  let { data, error } = await supabase.rpc('track_registration', {
    p_code: code,
    p_phone_suffix: phoneSuffix
  });

  if (error) {
    throw error;
  }
  return data;
}

// جلب ملخص التسجيل لصفحة الدفع بأمان
export async function getRegistrationSummary(regId) {
  if (!regId) {
    return null;
  }

  let { data, error } = await supabase.rpc('get_registration_summary', {
    p_reg_id: regId
  });

  if (error) {
    console.warn('get_registration_summary RPC failed, trying fallback select:', error.message);
    // Fallback direct query if RPC has issue
    let fallback = await supabase
      .from('registrations')
      .select('id, registration_code, full_name, email, phone, branch, amount, payment_method, payment_status, created_at, courses(id, title)')
      .eq('id', regId)
      .maybeSingle();

    if (fallback.error) {
      console.error('getRegistrationSummary fallback error:', fallback.error.message);
      throw error;
    }
    if (fallback.data) {
      return {
        id: fallback.data.id,
        // field names matching what payment-page.js expects:
        registration_code: fallback.data.registration_code,
        code: fallback.data.registration_code,
        full_name: fallback.data.full_name,
        student_name: fallback.data.full_name,
        email: fallback.data.email,
        phone: fallback.data.phone,
        branch: fallback.data.branch,
        course_title: fallback.data.courses ? fallback.data.courses.title : 'مراجعة دراسية',
        amount: fallback.data.amount,
        payment_method: fallback.data.payment_method,
        payment_status: fallback.data.payment_status,
        created_at: fallback.data.created_at
      };
    }
  }

  return data;
}

// جلب الآراء المعتمدة للصفحة الرئيسية
export async function getApprovedReviews() {
  try {
    let { data, error } = await supabase
      .from('reviews')
      .select('id, student_name, is_anonymous, branch, review_text, rating, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(24);

    if (error) {
      console.warn('getApprovedReviews failed or table not created yet:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('getApprovedReviews fallback:', err);
    return [];
  }
}

// إرسال ريفيو جديد من الطالب (بانتظار موافقة الأدمن)
export async function submitStudentReview({ studentName, isAnonymous, branch, reviewText, rating = 5 }) {
  let { data, error } = await supabase
    .from('reviews')
    .insert([
      {
        student_name: isAnonymous ? null : (studentName || null),
        is_anonymous: Boolean(isAnonymous),
        branch: branch.trim(),
        review_text: reviewText.trim(),
        rating: Number(rating) || 5,
        status: 'pending'
      }
    ])
    .select();

  if (error) {
    console.error('submitStudentReview failed:', error.message);
    throw error;
  }
  return data;
}


// تسجيل الطالب عن طريق الـ Edge Function بعد التحقق من Turnstile على السيرفر
export async function registerStudentSecure({ courseIds, fullName, branch, phone, email, paymentMethod, discountCode = null, turnstileToken }) {
  let url = SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/register-with-turnstile';
  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLIC_KEY,
        'Authorization': 'Bearer ' + SUPABASE_PUBLIC_KEY
      },
      body: JSON.stringify({
        courseIds: courseIds,
        fullName: fullName,
        branch: branch,
        phone: phone,
        email: email,
        paymentMethod: paymentMethod,
        discountCode: discountCode,
        turnstileToken: turnstileToken
      })
    });
  } catch (networkError) {
    console.error('register-with-turnstile network error:', String(networkError));
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
    console.error('register-with-turnstile failed:', response.status, code);
    let err = new Error(code);
    err.code = code;
    throw err;
  }

  return (data && data.results) ? data.results : [];
}