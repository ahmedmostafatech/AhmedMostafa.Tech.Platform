-- ============================================================
-- 30_reviews_system_v1.sql
-- نظام تقييمات وآراء الطلاب (Student Reviews & Testimonials)
-- ============================================================

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  student_name text,
  is_anonymous boolean not null default false,
  branch text not null,
  review_text text not null,
  rating integer default 5 check (rating >= 1 and rating <= 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- الفهارس
create index if not exists idx_reviews_status on public.reviews (status);
create index if not exists idx_reviews_created_at on public.reviews (created_at desc);

-- تفعيل RLS
alter table public.reviews enable row level security;

-- سياسات الأمان:
-- 1. القراءة العامة للجميع (فقط المراجعات المعتمدة approved)
drop policy if exists "Public can read approved reviews" on public.reviews;
create policy "Public can read approved reviews"
  on public.reviews
  for select
  using (status = 'approved');

-- 2. إرسال ريفيو جديد مفتوح للجميع (anon و authenticated) بحالة pending افتراضياً
drop policy if exists "Anyone can submit a review" on public.reviews;
create policy "Anyone can submit a review"
  on public.reviews
  for insert
  with check (status = 'pending');

-- 3. الأدمن يملك كامل الصلاحيات (select, update, delete, insert)
drop policy if exists "Admin full access on reviews" on public.reviews;
create policy "Admin full access on reviews"
  on public.reviews
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Seed ببعض الآراء الأولية المعتمدة
insert into public.reviews (student_name, is_anonymous, branch, review_text, rating, status)
values
  ('أحمد علي', false, 'القاهرة', 'المراجعة دي غيرت تقديري تماماً في مادة هياكل البيانات، الشرح منظم وبيجيب من الآخر.', 5, 'approved'),
  ('سارة محمود', false, 'المنصورة', 'أفضل استثمار عملته في وقت الامتحانات، المحتوى مركز ومحلول فيه كل أفكار الامتحانات السابقة.', 5, 'approved'),
  ('كريم أحمد', false, 'الإسكندرية', 'الشرح مبسط وذكي وواضح جداً، المهندس أحمد بيشرح بأسلوب يخليك تفهم أصعب جزئية في دقائق.', 5, 'approved'),
  ('طالب مجهول', true, 'طنطا', 'كنت فاقد الأمل في المادة، بفضل الله ثم المراجعة دي دخلت الامتحان وأنا واثق ومستعد.', 5, 'approved'),
  ('نور إبراهيم', false, 'المنوفية', 'التسجيل كان سريع جداً والرابط وصلني على الإيميل في وقت قياسي بدون أي تعقيدات.', 5, 'approved'),
  ('ياسمين خالد', false, 'بورسعيد', 'الأسلوب السلس في حل المسائل البرمجية خلاني أفهم المبدأ مش بس أحفظ، بجد شكراً جداً.', 5, 'approved')
on conflict do nothing;

