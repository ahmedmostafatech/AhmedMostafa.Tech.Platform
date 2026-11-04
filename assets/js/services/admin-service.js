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
      access_status,
      access_granted_at,
      access_revoked_at,
      revoke_reason,
      access_error,
      receipt_url,
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
  let { error } = await supabase.rpc('admin_reject_registration', {
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

// 10. إرسال إيميل التفعيل عبر Edge Function (بتاخد registration_id بس)
// force = true لإعادة إرسال متعمدة حتى لو اتبعت قبل كده
// بيرجع { ok: true } أو { ok: true, skipped: true }، وبيرمي خطأ بالسبب الحقيقي لو فشل
export async function sendActivationEmail(regId, force) {
  let { data, error } = await supabase.functions.invoke('send-activation-email', {
    body: { registration_id: regId, force: force === true }
  });

  if (error) {
    // الرد الحقيقي للفنكشن جوه error.context
    let realMessage = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        let body = await error.context.json();
        realMessage = body.details
          ? (body.error + ': ' + body.details)
          : (body.error || body.message || realMessage);
      }
    } catch (parseErr) {
      console.warn('Could not read function error body:', parseErr);
    }
    console.error('send-activation-email failed:', realMessage);
    throw new Error(realMessage);
  }

  // النجاح الوحيد المقبول: ok === true (أي شكل رد تاني يعتبر فشل)
  if (!data || data.ok !== true) {
    let failMessage = 'unexpected function response';
    if (data) {
      if (data.details) {
        failMessage = (data.error || 'email delivery failed') + ': ' + data.details;
      } else if (data.error || data.message) {
        failMessage = String(data.error || data.message);
      }
    }
    console.error('send-activation-email returned failure:', data);
    throw new Error(failMessage);
  }

  return data;
}

// 11. سحب صلاحية Drive من طالب
export async function revokeAccess(regId, reason) {
  let { data, error } = await supabase.functions.invoke('revoke-access', {
    body: { registration_id: regId, reason: reason || '' }
  });
  if (error) {
    let realMessage = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        let body = await error.context.json();
        realMessage = body.details ? (body.error + ': ' + body.details) : (body.error || body.message || realMessage);
      }
    } catch (parseErr) {}
    console.error('revoke-access failed:', realMessage);
    throw new Error(realMessage);
  }
  if (!data || data.ok !== true) {
    let failMessage = data && (data.details || data.error) ? (data.error + ': ' + (data.details || '')) : 'unexpected function response';
    throw new Error(failMessage);
  }
  return data;
}

// 12. حذف تسجيل طالب نهائياً
export async function deleteRegistration(regId) {
  let { data, error } = await supabase.rpc('admin_delete_registration', {
    p_reg_id: regId
  });
  if (error) {
    console.error('admin_delete_registration failed:', error.message);
    throw error;
  }
  return true;
}

// 13. جلب جميع أكواد الخصم
export async function getAllCoupons() {
  let { data, error } = await supabase
    .from('discount_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAllCoupons failed:', error.message);
    throw error;
  }
  return data || [];
}

// 14. إنشاء كود خصم جديد
export async function createCoupon({ code, discount_type, discount_value, max_uses, min_amount, expires_at }) {
  let { data, error } = await supabase
    .from('discount_codes')
    .insert([{
      code: code.trim().toUpperCase(),
      discount_type: discount_type || 'percentage',
      discount_value: Number(discount_value),
      max_uses: max_uses ? parseInt(max_uses, 10) : null,
      min_amount: min_amount ? Number(min_amount) : 0,
      expires_at: expires_at || null,
      is_active: true
    }])
    .select()
    .single();

  if (error) {
    console.error('createCoupon failed:', error.message);
    throw error;
  }
  return data;
}

// 15. تفعيل أو تعطيل كود خصم
export async function toggleCouponStatus(id, isActive) {
  let { data, error } = await supabase
    .from('discount_codes')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('toggleCouponStatus failed:', error.message);
    throw error;
  }
  return data;
}

// 16. حذف كود خصم
export async function deleteCoupon(id) {
  let { error } = await supabase
    .from('discount_codes')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('deleteCoupon failed:', error.message);
    throw error;
  }
  return true;
}
