// ============================================================
// subscriptions-service.js
// كل الكلام مع Supabase المتعلق باشتراكات الطالب وطلباته
// ============================================================

import { supabase } from '../core/supabase-client.js';

// اشتراكات الطالب الحالية (مع بيانات المادة)
export async function getMySubscriptions() {
  let { data, error } = await supabase
    .from('subscriptions')
    .select(`
      id,
      starts_at,
      ends_at,
      courses (
        id,
        title,
        description,
        access_until
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getMySubscriptions failed:', error.message);
    return [];
  }

  return data || [];
}

// آخر طلبات الطالب (pending أو rejected)
export async function getMyOrders() {
  let { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      amount,
      payment_method,
      tx_reference,
      status,
      expires_at,
      created_at,
      courses ( id, title )
    `)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('getMyOrders failed:', error.message);
    return [];
  }

  return data || [];
}

// هل للطالب اشتراك ساري في مادة معينة؟
export async function checkAccess(courseId) {
  let { data, error } = await supabase
    .from('subscriptions')
    .select('id, ends_at')
    .eq('course_id', courseId)
    .gt('ends_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error('checkAccess failed:', error.message);
    return false;
  }

  return !!data;
}
