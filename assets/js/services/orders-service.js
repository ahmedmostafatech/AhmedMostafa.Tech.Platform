// ============================================================
// orders-service.js
// إدارة الطلبات والدفع ورفع الإيصالات
// ============================================================

import { supabase } from '../core/supabase-client.js';
import { getSession } from '../core/auth.js';

// إنشاء طلب جديد برقم فريد من خلال دالة create_order
export async function createOrder(courseId, paymentMethod) {
  let { data, error } = await supabase.rpc('create_order', {
    p_course_id: courseId,
    p_payment_method: paymentMethod
  });

  if (error) {
    console.error('create_order failed:', error.message);
    throw error;
  }

  // دالة create_order ترجع صفا أو كائناً فيه order_id و amount
  return data;
}

// رفع صورة إيصال التحويل إلى Storage bucket (payment-receipts)
export async function uploadReceiptProof(userId, orderId, file) {
  if (!file) {
    return null;
  }

  // فحص الحجم (أقصى حد 5MB)
  let maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('حجم صورة الإيصال كبير جداً، أقصى حد مسموح به هو 5 ميجابايت.');
  }

  // امتداد آمن
  let rawExt = file.name.split('.').pop() || 'jpg';
  let cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(cleanExt)) {
    cleanExt = 'jpg';
  }

  let filePath = `${userId}/${orderId}_${Date.now()}.${cleanExt}`;

  let { data, error } = await supabase.storage
    .from('payment-receipts')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Storage upload error:', error.message);
    throw error;
  }

  return (data && data.path) || filePath;
}

// تأكيد إرسال الدفع (رقم العملية + مسار الإيصال)
export async function submitPayment(orderId, txReference, proofPath, extraDetails = {}) {
  let cleanRef = String(txReference || '').trim();
  if (cleanRef.length < 4) {
    throw new Error('invalid reference');
  }

  let { error } = await supabase.rpc('submit_payment', {
    p_order_id: orderId,
    p_tx_reference: cleanRef,
    p_proof_path: proofPath || null
  });

  if (error) {
    console.error('submit_payment failed:', error.message);
    throw error;
  }

  // إرسال إشعار تليجرام في الخلفية
  try {
    supabase.functions.invoke('notify-telegram', {
      body: {
        order_id: orderId,
        tx_reference: cleanRef,
        amount: extraDetails.amount,
        course_title: extraDetails.courseTitle,
        student_email: extraDetails.studentEmail,
        student_name: extraDetails.studentName,
        student_phone: extraDetails.studentPhone,
        payment_method: extraDetails.paymentMethod
      }
    }).catch(function (err) {
      console.warn('notify-telegram background note:', err);
    });
  } catch (fnErr) {
    console.warn('notify-telegram invoke note:', fnErr);
  }

  return true;
}

// جلب تفاصيل طلب معين بالـ ID
export async function getOrder(orderId) {
  let { data, error } = await supabase
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
      courses (
        id,
        title,
        price_egp,
        access_until
      )
    `)
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    console.error('getOrder failed:', error.message);
    return null;
  }

  return data;
}

// فحص إذا كان للمستخدم طلب معلق وساري المفعول لنفس المادة
export async function getActivePendingOrder(courseId) {
  let session = await getSession();
  if (!session || !session.user) {
    return null;
  }

  let { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      user_id,
      amount,
      payment_method,
      status,
      expires_at,
      created_at
    `)
    .eq('course_id', courseId)
    .eq('user_id', session.user.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getActivePendingOrder failed:', error.message);
    return null;
  }

  return data;
}
