-- ============================================================
-- 02_seed_test_data_v2.sql
-- بيانات تجريبية متوافقة مع 07_full_schema_v2_with_phone.sql
-- آمن للتكرار (on conflict)
-- ============================================================

-- مادة واحدة
insert into public.courses (id, title, description, price_egp, access_until, is_published)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'مراجعة علوم الحاسب — CS101',
  'مراجعة شاملة لمادة CS101 لطلاب EELU. تشمل كل المحاضرات والأسئلة المتوقعة.',
  120,
  '2027-01-31',
  true
)
on conflict (id) do nothing;

-- موديول واحد
insert into public.modules (id, course_id, title, sort_order)
values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'الوحدة الأولى: المقدمة',
  1
)
on conflict (id) do nothing;

-- فيديوان: مجاني + مدفوع
insert into public.videos (id, course_id, module_id, title, is_free, sort_order)
values
  (
    'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000001',
    'مقدمة المادة (مجاني)',
    true,
    1
  ),
  (
    'cccccccc-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'bbbbbbbb-0000-0000-0000-000000000001',
    'المحاضرة الأولى (مدفوع)',
    false,
    2
  )
on conflict (id) do nothing;

-- روابط يوتيوب (جدول video_sources مفيهوش عمود id)
-- غيّر الـ ID لفيديو حقيقي Unlisted من قناتك قبل الاختبار الكامل
insert into public.video_sources (video_id, youtube_id)
values
  ('cccccccc-0000-0000-0000-000000000001', 'dQw4w9WgXcQ'),
  ('cccccccc-0000-0000-0000-000000000002', 'dQw4w9WgXcQ')
on conflict (video_id) do nothing;