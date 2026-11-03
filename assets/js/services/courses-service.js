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
      price,
      access_until,
      modules (
        id,
        title,
        sort_order,
        videos (
          id,
          title,
          duration_sec,
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
  let { data, error } = await supabase
    .from('videos')
    .select(`
      id, title, duration_sec,
      modules!inner ( course_id ),
      video_sources ( youtube_id )
    `)
    .eq('is_free', true)
    .eq('modules.course_id', courseId)
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
  let { count, error } = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('modules.course_id', courseId);

  if (error) {
    return 0;
  }
  return count || 0;
}

// جلب مادة معينة بالـ ID (أو الأولى إذا لم يُحدد ID)
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
      price,
      access_until,
      modules (
        id,
        title,
        sort_order,
        videos (
          id,
          title,
          duration_sec,
          is_free,
          sort_order,
          video_sources ( youtube_id )
        )
      )
    `)
    .eq('id', courseId)
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

