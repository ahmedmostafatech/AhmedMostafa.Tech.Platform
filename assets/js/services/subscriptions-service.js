// ============================================================
// subscriptions-service.js
// كل الكلام مع Supabase المتعلق باشتراكات الطالب وطلباته
// ============================================================

import { supabase } from '../core/supabase-client.js';
import { getSession } from '../core/auth.js';

// اشتراكات الطالب الحالية (مع بيانات المادة)
export async function getMySubscriptions() {
  let session = await getSession();
  if (!session || !session.user) {
    return [];
  }

  let query = supabase
    .from('subscriptions')
    .select(`
      id,
      user_id,
      status,
      starts_at,
      ends_at,
      created_at,
      courses (
        id,
        title,
        description,
        price_egp,
        access_until
      )
    `)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  let { data, error } = await query;

  if (error) {
    console.error('getMySubscriptions failed:', error.message);
    return [];
  }

  return data || [];
}

// آخر طلبات الطالب (pending أو rejected)
export async function getMyOrders() {
  let session = await getSession();
  if (!session || !session.user) {
    return [];
  }

  let query = supabase
    .from('orders')
    .select(`
      id,
      user_id,
      amount,
      payment_method,
      tx_reference,
      status,
      expires_at,
      created_at,
      courses ( id, title )
    `)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  let { data, error } = await query;

  if (error) {
    console.error('getMyOrders failed:', error.message);
    return [];
  }

  return data || [];
}

// فحص هل للطالب اشتراك ساري في مادة معينة عبر دالة has_access في الداتابيز
export async function checkCourseAccess(courseId) {
  if (!courseId) {
    return false;
  }

  let { data, error } = await supabase.rpc('has_access', {
    p_course_id: courseId
  });

  if (error) {
    console.error('checkCourseAccess failed:', error.message);
    return false;
  }

  return !!data;
}

// اسم قديم للتوافق العكسي مع أي كود سابق
export let checkAccess = checkCourseAccess;
