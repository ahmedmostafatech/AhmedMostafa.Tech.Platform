// ============================================================
// courses-service.js
// كل الكلام مع Supabase المتعلق بالمواد والفيديوهات
// ============================================================

import { supabase } from '../core/supabase-client.js';

// الأعمدة المشتركة في استعلام المادة (price_egp مش price، ومفيش duration_sec)
let COURSE_SELECT = `
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
      title,
      is_free,
      sort_order,
      video_sources ( youtube_id )
    )
  )
`;

// ترتيب الوحدات والفيديوهات
function sortCourseTree(course) {
  if (course && course.modules) {
    course.modules.sort(function (a, b) { return a.sort_order - b.sort_order; });
    course.modules.forEach(function (m) {
      if (m.videos) {
        m.videos.sort(function (a, b) { return a.sort_order - b.sort_order; });
      }
    });
  }
  return course;
}

// جلب المادة الأحدث المنشورة
export async function getPublishedCourse() {
  let { data, error } = await supabase
    .from('courses')
    .select(COURSE_SELECT)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('getPublishedCourse failed:', error.message);
    return null;
  }

  return sortCourseTree(data);
}

// جلب أول فيديو مجاني في المادة
export async function getFreeVideo(courseId) {
  let { data, error } = await supabase
    .from('videos')
    .select(`
      id,
      title,
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

// جلب مادة معينة بالـ ID (أو الأحدث المنشورة لو مفيش ID)
export async function getCourseById(courseId) {
  if (!courseId) {
    return await getPublishedCourse();
  }

  let { data, error } = await supabase
    .from('courses')
    .select(COURSE_SELECT)
    .eq('id', courseId)
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    console.error('getCourseById failed:', error.message);
    return null;
  }

  return sortCourseTree(data);
}