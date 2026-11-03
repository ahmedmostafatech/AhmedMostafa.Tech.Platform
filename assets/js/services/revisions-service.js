// ============================================================
// revisions-service.js
// التعامل مع المراجعات وعمليات التسجيل بدون حسابات
// ============================================================

import { supabase } from '../core/supabase-client.js';

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
export async function registerStudent({ courseId, fullName, branch, phone, email, paymentMethod }) {
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

// جلب ملخص التسجيل لصفحة الدفع بأمان
export async function getRegistrationSummary(regId) {
  if (!regId) {
    return null;
  }

  let { data, error } = await supabase.rpc('get_registration_summary', {
    p_reg_id: regId
  });

  if (error) {
    console.error('get_registration_summary failed:', error.message);
    throw error;
  }

  return data;
}

