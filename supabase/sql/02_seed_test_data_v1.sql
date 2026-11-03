-- ============================================================
-- 02_seed_test_data_v1.sql
-- بيانات تجريبية (شغّله بعد ملف 01)
-- ============================================================

-- مادة واحدة (CS101 مثلاً)
insert into public.courses (id, title, description, price, access_until, is_published)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'مراجعة علوم الحاسب — CS101',
  'مراجعة شاملة لمادة CS101 لطلاب EELU. تشمل كل المحاضرات والأسئلة المتوقعة.',
  120.00,
  '2027-01-31',
  true
)
on conflict (id) do nothing;

-- وحدة واحدة
insert into public.modules (id, course_id, title, sort_order)
values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'الوحدة الأولى: المقدمة',
  1
)
on conflict (id) do nothing;

-- فيديوان: مجاني + مدفوع
insert into public.videos (id, module_id, title, duration_sec, is_free, sort_order)
values
  (
    'cccccccc-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000001',
    'مقدمة المادة (مجاني)',
    600,
    true,
    1
  ),
  (
    'cccccccc-0000-0000-0000-000000000002',
    'bbbbbbbb-0000-0000-0000-000000000001',
    'المحاضرة الأولى (مدفوع)',
    3600,
    false,
    2
  )
on conflict (id) do nothing;

-- رابط يوتيوب للدرس المجاني فقط
-- ملاحظة: استخدم video ID حقيقي من يوتيوب لو أردت الاختبار الكامل
insert into public.video_sources (id, video_id, youtube_id)
values (
  'dddddddd-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  'dQw4w9WgXcQ'  -- مثال (Rick Roll) — غيّره برابط حقيقي
)
on conflict (id) do nothing;
