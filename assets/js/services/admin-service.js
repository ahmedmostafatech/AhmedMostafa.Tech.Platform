// ============================================================
// admin-service.js
// جميع استعلامات وإجراءات لوحة تحكم الأدمن
// ============================================================

import { supabase } from '../core/supabase-client.js';

// نظرة عامة على الإحصائيات في الداشبورد
export async function getAdminOverview() {
  let [pendingRes, subsRes, studentsRes, recentOrdersRes] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).gt('ends_at', new Date().toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase
      .from('orders')
      .select(`
        id, amount, payment_method, tx_reference, proof_path, status, created_at,
        profiles:user_id ( id, email, full_name, phone ),
        courses:course_id ( id, title )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10)
  ]);

  return {
    pendingCount: pendingRes.count || 0,
    activeSubsCount: subsRes.count || 0,
    studentsCount: studentsRes.count || 0,
    recentPendingOrders: recentOrdersRes.data || []
  };
}

// جلب كل الطلبات مع إمكانية الفلترة بالحالة
export async function getAllOrders(statusFilter = 'all') {
  let query = supabase
    .from('orders')
    .select(`
      id, amount, payment_method, tx_reference, proof_path, status, created_at, expires_at,
      profiles:user_id ( id, email, full_name, phone ),
      courses:course_id ( id, title, price )
    `)
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  let { data, error } = await query;
  if (error) {
    console.error('getAllOrders error:', error.message);
    throw error;
  }

  return data || [];
}

// قبول طلب الاشتراك
export async function approveOrder(orderId) {
  // جلب بيانات الطالب والمادة لإرسال إيميل التفعيل
  let { data: order } = await supabase
    .from('orders')
    .select(`
      id, amount,
      profiles:user_id ( email, full_name ),
      courses:course_id ( title, access_until )
    `)
    .eq('id', orderId)
    .maybeSingle();

  let { error } = await supabase.rpc('approve_order', {
    p_order_id: orderId
  });

  if (error) {
    console.error('approve_order failed:', error.message);
    throw error;
  }

  // إرسال إيميل التفعيل في الخلفية تلقائياً
  if (order && order.profiles && order.profiles.email) {
    try {
      supabase.functions.invoke('send-activation-email', {
        body: {
          student_email: order.profiles.email,
          student_name: order.profiles.full_name,
          course_title: order.courses?.title,
          access_until: order.courses?.access_until
        }
      }).catch(function (err) {
        console.warn('send-activation-email background note:', err);
      });
    } catch (fnErr) {
      console.warn('send-activation-email invoke note:', fnErr);
    }
  }

  return true;
}

// رفض طلب الاشتراك
export async function rejectOrder(orderId) {
  let { error } = await supabase.rpc('reject_order', {
    p_order_id: orderId
  });

  if (error) {
    console.error('reject_order failed:', error.message);
    throw error;
  }

  return true;
}

// إنشاء رابط مؤقت لمعاينة صورة الإيصال من Storage
export async function getReceiptSignedUrl(proofPath) {
  if (!proofPath) return null;

  let { data, error } = await supabase.storage
    .from('payment-receipts')
    .createSignedUrl(proofPath, 3600); // صالح لمدة ساعة

  if (error) {
    console.warn('createSignedUrl error:', error.message);
    return null;
  }

  return data.signedUrl || null;
}

// جلب قائمة الطلاب
export async function getAllStudents() {
  let { data, error } = await supabase
    .from('profiles')
    .select(`
      id, email, full_name, phone, is_admin, created_at,
      subscriptions ( id, ends_at, course_id )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAllStudents error:', error.message);
    throw error;
  }

  return data || [];
}

// ============================================================
// إدارة الاشتراكات (Subscriptions)
// ============================================================

export async function getAllSubscriptions(statusFilter = 'all') {
  let query = supabase
    .from('subscriptions')
    .select(`
      id, user_id, course_id, order_id, starts_at, ends_at, created_at,
      profiles:user_id ( id, email, full_name, phone ),
      courses:course_id ( id, title, price ),
      orders:order_id ( amount, payment_method, tx_reference )
    `)
    .order('created_at', { ascending: false });

  let nowIso = new Date().toISOString();
  if (statusFilter === 'active') {
    query = query.gt('ends_at', nowIso);
  } else if (statusFilter === 'expired') {
    query = query.lte('ends_at', nowIso);
  }

  let { data, error } = await query;
  if (error) {
    console.error('getAllSubscriptions error:', error.message);
    throw error;
  }

  return data || [];
}

// تمديد أو تعديل تاريخ انتهاء الاشتراك
export async function updateSubscriptionEndsAt(subId, newEndsAt) {
  let { error } = await supabase
    .from('subscriptions')
    .update({ ends_at: newEndsAt })
    .eq('id', subId);

  if (error) {
    console.error('updateSubscriptionEndsAt error:', error.message);
    throw error;
  }

  return true;
}

// إلغاء أو إنهاء الاشتراك فوراً
export async function terminateSubscription(subId) {
  let { error } = await supabase
    .from('subscriptions')
    .update({ ends_at: new Date().toISOString() })
    .eq('id', subId);

  if (error) {
    console.error('terminateSubscription error:', error.message);
    throw error;
  }

  return true;
}

// تفعيل اشتراك يدوي لطالب
export async function addManualSubscription(userId, courseId, endsAtDate) {
  // 1. إنشاء طلب صوري معتمد
  let manualTx = 'MANUAL_' + Date.now();
  let { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      course_id: courseId,
      amount: 0,
      payment_method: 'vodafone_cash',
      tx_reference: manualTx,
      status: 'approved'
    })
    .select('id')
    .single();

  if (orderErr) {
    console.error('addManualSubscription orderErr:', orderErr.message);
    throw orderErr;
  }

  // 2. إدخال أو تحديث الاشتراك
  let endsAt = endsAtDate ? new Date(endsAtDate).toISOString() : new Date(Date.now() + 120 * 86400000).toISOString();
  let { error: subErr } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      course_id: courseId,
      order_id: order.id,
      starts_at: new Date().toISOString(),
      ends_at: endsAt
    }, { onConflict: 'user_id,course_id' });

  if (subErr) {
    console.error('addManualSubscription subErr:', subErr.message);
    throw subErr;
  }

  return true;
}

// ============================================================
// إدارة المحتوى (Courses, Modules, Videos)
// ============================================================

// جلب شجرة المواد والوحدات والفيديوهات مع روابط يوتيوب
export async function getAdminContentTree() {
  let { data, error } = await supabase
    .from('courses')
    .select(`
      id, title, description, price, access_until, is_published, created_at,
      modules (
        id, title, sort_order,
        videos (
          id, title, duration_sec, is_free, sort_order,
          video_sources ( youtube_id )
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAdminContentTree error:', error.message);
    throw error;
  }

  // ترتيب الوحدات والدروس
  if (data) {
    data.forEach(function (c) {
      if (c.modules) {
        c.modules.sort(function (a, b) { return a.sort_order - b.sort_order; });
        c.modules.forEach(function (m) {
          if (m.videos) {
            m.videos.sort(function (a, b) { return a.sort_order - b.sort_order; });
          }
        });
      }
    });
  }

  return data || [];
}

// تحديث بيانات المادة
export async function updateCourse(courseId, fields) {
  let { error } = await supabase
    .from('courses')
    .update(fields)
    .eq('id', courseId);

  if (error) throw error;
  return true;
}

// إضافة وحدة جديدة
export async function createModule(courseId, title, sortOrder = 0) {
  let { data, error } = await supabase
    .from('modules')
    .insert({ course_id: courseId, title: title, sort_order: sortOrder })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// حذف وحدة
export async function deleteModule(moduleId) {
  let { error } = await supabase
    .from('modules')
    .delete()
    .eq('id', moduleId);

  if (error) throw error;
  return true;
}

// إضافة فيديو جديد ورابط يوتيوب
export async function createVideoWithSource(moduleId, { title, durationSec, isFree, sortOrder, youtubeId }) {
  let { data: video, error: vErr } = await supabase
    .from('videos')
    .insert({
      module_id: moduleId,
      title: title,
      duration_sec: durationSec || 0,
      is_free: !!isFree,
      sort_order: sortOrder || 0
    })
    .select()
    .single();

  if (vErr) throw vErr;

  if (youtubeId && youtubeId.trim()) {
    let { error: sErr } = await supabase
      .from('video_sources')
      .insert({
        video_id: video.id,
        youtube_id: youtubeId.trim()
      });
    if (sErr) throw sErr;
  }

  return video;
}

// تحديث فيديو ورابط يوتيوب
export async function updateVideoWithSource(videoId, { title, durationSec, isFree, sortOrder, youtubeId }) {
  let { error: vErr } = await supabase
    .from('videos')
    .update({
      title: title,
      duration_sec: durationSec || 0,
      is_free: !!isFree,
      sort_order: sortOrder || 0
    })
    .eq('id', videoId);

  if (vErr) throw vErr;

  if (youtubeId !== undefined) {
    let cleanYt = String(youtubeId || '').trim();
    if (cleanYt) {
      let { error: sErr } = await supabase
        .from('video_sources')
        .upsert({
          video_id: videoId,
          youtube_id: cleanYt
        }, { onConflict: 'video_id' });
      if (sErr) throw sErr;
    }
  }

  return true;
}

// حذف فيديو
export async function deleteVideo(videoId) {
  let { error } = await supabase
    .from('videos')
    .delete()
    .eq('id', videoId);

  if (error) throw error;
  return true;
}

