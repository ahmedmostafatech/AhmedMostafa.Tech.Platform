// ============================================================
// courses-service.js
// كل الكلام مع Supabase المتعلق بالمواد والفيديوهات
// ============================================================

import { supabase } from '../core/supabase-client.js';

// جلب المادة الأولى المنشورة مع أول وحدة وأول درسين
export async function getPublishedCourse() {
  let { data, error } = await supabase
    .from('courses')
    .select(`
      id,
      title,
      description,
      price_egp,
      access_until,
      modules (
        id,
        title,
        sort_order,
        videos (
          id,
          course_id,
          module_id,
          title,
          is_free,
          sort_order,
          video_sources ( youtube_id )
        )
      )
    `)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getPublishedCourse failed:', error.message);
    return null;
  }

  // ترتيب الوحدات والفيديوهات
  if (data && data.modules) {
    data.modules.sort(function (a, b) { return a.sort_order - b.sort_order; });
    data.modules.forEach(function (m) {
      if (m.videos) {
        m.videos.sort(function (a, b) { return a.sort_order - b.sort_order; });
      }
    });
  }

  return data;
}

// جلب الفيديو المجاني الأول في المادة
export async function getFreeVideo(courseId) {
  if (!courseId) {
    return null;
  }

  let { data, error } = await supabase
    .from('videos')
    .select(`
      id,
      course_id,
      module_id,
      title,
      is_free,
      sort_order,
      video_sources ( youtube_id )
    `)
    .eq('course_id', courseId)
    .eq('is_free', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getFreeVideo failed:', error.message);
    return null;
  }

  return data;
}

// عدد الفيديوهات الإجمالي في المادة
export async function getVideosCount(courseId) {
  if (!courseId) {
    return 0;
  }

  let { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);

  if (error) {
    console.error('getVideosCount failed:', error.message);
    return 0;
  }
  return count || 0;
}

// جلب مادة معينة بالـ ID (أو الأولى المنشورة إذا لم يُحدد ID)
export async function getCourseById(courseId) {
  if (!courseId) {
    return await getPublishedCourse();
  }

  let { data, error } = await supabase
    .from('courses')
    .select(`
      id,
      title,
      description,
      price_egp,
      access_until,
      modules (
        id,
        title,
        sort_order,
        videos (
          id,
          course_id,
          module_id,
          title,
          is_free,
          sort_order,
          video_sources ( youtube_id )
        )
      )
    `)
    .eq('id', courseId)
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    console.error('getCourseById failed:', error.message);
    return null;
  }

  if (data && data.modules) {
    data.modules.sort(function (a, b) { return a.sort_order - b.sort_order; });
    data.modules.forEach(function (m) {
      if (m.videos) {
        m.videos.sort(function (a, b) { return a.sort_order - b.sort_order; });
      }
    });
  }

  return data;
}
