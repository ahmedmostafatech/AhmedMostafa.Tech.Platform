// ============================================================
// admin-service.js
// جميع استعلامات ودوال لوحة التحكم مع Supabase
// (نظام التسجيلات والمراجعات الجديد)
// ============================================================

import { supabase } from '../core/supabase-client.js';

// 1. جلب إحصائيات لوحة التحكم الحية عبر RPC
export async function getAdminStats() {
  let { data, error } = await supabase.rpc('admin_get_registration_stats');
  if (error) {
    console.error('admin_get_registration_stats failed:', error.message);
    throw error;
  }
  return data;
}

// 2. جلب جميع التسجيلات مع إمكانية الفلترة والبحث
export async function getAllRegistrations(filters = {}) {
  let query = supabase
    .from('registrations')
    .select(`
      id,
      registration_code,
      course_id,
      full_name,
      branch,
      phone,
      email,
      amount,
      payment_method,
      payment_status,
      admin_note,
      rejection_reason,
      approved_at,
      email_sent,
      created_at,
      courses ( id, title, access_link )
    `)
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('payment_status', filters.status);
  }

  if (filters.course_id && filters.course_id !== 'all') {
    query = query.eq('course_id', filters.course_id);
  }

  if (filters.branch && filters.branch !== 'all') {
    query = query.eq('branch', filters.branch);
  }

  let { data, error } = await query;
  if (error) {
    console.error('getAllRegistrations failed:', error.message);
    throw error;
  }

  // فلترة نصية محلية للبحث السريع بالاسم أو الهاتف أو الكود أو الإيميل
  let results = data || [];
  if (filters.search && filters.search.trim()) {
    let term = filters.search.trim().toLowerCase();
    results = results.filter(function (r) {
      return (
        (r.full_name && r.full_name.toLowerCase().includes(term)) ||
        (r.registration_code && r.registration_code.toLowerCase().includes(term)) ||
        (r.phone && r.phone.includes(term)) ||
        (r.email && r.email.toLowerCase().includes(term))
      );
    });
  }

  return results;
}

// 3. جلب تفاصيل تسجيل محدد
export async function getRegistrationById(regId) {
  let { data, error } = await supabase
    .from('registrations')
    .select(`
      *,
      courses ( id, title, price_egp, access_link, access_until )
    `)
    .eq('id', regId)
    .single();

  if (error) {
    console.error('getRegistrationById failed:', error.message);
    throw error;
  }
  return data;
}

// 4. قبول تسجيل ودفع وتأكيد الاشتراك عبر RPC
export async function approveRegistration(regId, adminNote = null) {
  let { data, error } = await supabase.rpc('admin_approve_registration', {
    p_reg_id: regId,
    p_admin_note: adminNote
  });

  if (error) {
    console.error('admin_approve_registration failed:', error.message);
    throw error;
  }

  return data;
}

// 5. رفض تسجيل وتدوين السبب عبر RPC
export async function rejectRegistration(regId, reason = null, adminNote = null) {
  let { data, error } = await supabase.rpc('admin_reject_registration', {
    p_reg_id: regId,
    p_reason: reason,
    p_admin_note: adminNote
  });

  if (error) {
    console.error('admin_reject_registration failed:', error.message);
    throw error;
  }

  return true;
}

// 6. تحديث حالة التسجيل (مثلاً إلى under_review أو إضافة ملاحظة)
export async function updateRegistrationStatus(regId, status, adminNote = null) {
  let updateData = {
    payment_status: status,
    updated_at: new Date().toISOString()
  };
  if (adminNote !== null) {
    updateData.admin_note = adminNote;
  }

  let { data, error } = await supabase
    .from('registrations')
    .update(updateData)
    .eq('id', regId)
    .select()
    .single();

  if (error) {
    console.error('updateRegistrationStatus failed:', error.message);
    throw error;
  }
  return data;
}

// 7. جلب جميع المراجعات المنشورة وغير المنشورة لإدارة الأدمن
export async function getAllRevisions() {
  let { data, error } = await supabase
    .from('courses')
    .select('id, title, short_description, description, price_egp, access_until, access_link, is_published, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAllRevisions failed:', error.message);
    throw error;
  }
  return data || [];
}

// 8. إنشاء مراجعة جديدة
export async function createRevision({ title, short_description, description, price_egp, access_until, access_link, is_published = true }) {
  let { data, error } = await supabase
    .from('courses')
    .insert([{
      title: title.trim(),
      short_description: short_description ? short_description.trim() : null,
      description: description ? description.trim() : null,
      price_egp: parseInt(price_egp, 10) || 120,
      access_until: access_until || null,
      access_link: access_link ? access_link.trim() : null,
      is_published: !!is_published
    }])
    .select()
    .single();

  if (error) {
    console.error('createRevision failed:', error.message);
    throw error;
  }
  return data;
}

// 9. تعديل مراجعة موجودة
export async function updateRevision(courseId, fields) {
  let { data, error } = await supabase
    .from('courses')
    .update(fields)
    .eq('id', courseId)
    .select()
    .single();

  if (error) {
    console.error('updateRevision failed:', error.message);
    throw error;
  }
  return data;
}

// 10. تسجيل نجاح أو فشل إرسال الإيميل
export async function logEmailAttempt(regId, status, errorMsg = null) {
  let { error } = await supabase.rpc('admin_log_email', {
    p_reg_id: regId,
    p_status: status,
    p_error: errorMsg
  });

  if (error) {
    console.warn('admin_log_email failed:', error.message);
  }
}
