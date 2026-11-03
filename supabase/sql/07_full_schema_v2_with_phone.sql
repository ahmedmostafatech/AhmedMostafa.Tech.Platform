-- ============================================================
-- 07_full_schema_v2_with_phone.sql
-- السكريبت الكامل لقاعدة بيانات Ahmed Mostafa Tech
-- آمن للتشغيل أكتر من مرة، وبيشتغل على الداتابيز الحالية أو الجديدة
-- ============================================================

-- ============================================================
-- 1) الجداول
-- ============================================================

-- بيانات المستخدمين (بتتعمل تلقائيًا عند التسجيل)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  profile_complete boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- لو الجدول موجود من قبل: إضافة الأعمدة الناقصة
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists profile_complete boolean not null default false;

-- المواد (access_until = آخر يوم في الترم)
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_egp integer not null check (price_egp > 0),
  access_until date not null,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

-- الموديولات
create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0
);

-- الفيديوهات (العناوين فقط، علنية للكل)
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id uuid references public.modules(id) on delete set null,
  title text not null,
  sort_order integer not null default 0,
  is_free boolean not null default false,
  created_at timestamptz not null default now()
);

-- روابط اليوتيوب في جدول منفصل ومحمي
create table if not exists public.video_sources (
  video_id uuid primary key references public.videos(id) on delete cascade,
  youtube_id text not null
);

-- طلبات الدفع
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id),
  base_price integer not null,
  unique_amount numeric(10,2) not null,
  amount numeric(10,2) generated always as (unique_amount) stored,
  payment_method text not null check (payment_method in ('vodafone_cash','instapay')),
  tx_reference text unique,
  proof_path text,
  status text not null default 'pending'
    check (status in ('pending','paid','rejected','expired')),
  reject_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 minutes'),
  reviewed_at timestamptz
);

alter table public.orders
  add column if not exists amount numeric(10,2) generated always as (unique_amount) stored;

-- الاشتراكات (طالب واحد = اشتراك واحد في كل مادة)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  order_id uuid references public.orders(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

alter table public.subscriptions
  add column if not exists created_at timestamptz not null default now();

-- ============================================================
-- 2) القيود والفهارس
-- ============================================================

-- صيغة رقم الموبايل المصري المخزّن: 01 + (0|1|2|5) + 8 أرقام
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_phone_format_chk'
  ) then
    alter table public.profiles
      add constraint profiles_phone_format_chk
      check (phone is null or phone ~ '^01[0125][0-9]{8}$');
  end if;
end;
$$;

-- المبلغ الفريد ما يتكررش بين الطلبات المعلقة (أساس المطابقة التلقائية لاحقًا)
create unique index if not exists orders_pending_amount_uq
  on public.orders (unique_amount) where status = 'pending';

create index if not exists orders_user_idx on public.orders (user_id);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists subscriptions_ends_idx on public.subscriptions (ends_at);
create index if not exists videos_course_idx on public.videos (course_id, sort_order);
create index if not exists modules_course_idx on public.modules (course_id, sort_order);
create index if not exists profiles_phone_idx on public.profiles (phone) where phone is not null;
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ============================================================
-- 3) دوال مساعدة
-- ============================================================

-- توحيد رقم الموبايل المصري (بترجع null لو الرقم غير صحيح، ومبتعملش error أبدًا)
-- بتقبل: 01012345678 / +201012345678 / 00201012345678 / 201012345678 / أرقام هندية / مسافات
create or replace function public.normalize_eg_phone(p_raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
begin
  if p_raw is null then
    return null;
  end if;

  -- الأرقام الهندية إلى لاتينية
  v := translate(p_raw, '٠١٢٣٤٥٦٧٨٩', '0123456789');
  -- إبقاء الأرقام وعلامة + فقط
  v := regexp_replace(v, '[^0-9+]', '', 'g');

  if v like '+20%' then
    v := '0' || substr(v, 4);
  elsif v like '0020%' then
    v := '0' || substr(v, 5);
  elsif v ~ '^20[0-9]{10}$' then
    v := '0' || substr(v, 3);
  end if;

  if v ~ '^01[0125][0-9]{8}$' then
    return v;
  end if;
  return null;
end;
$$;

-- هل المستخدم الحالي أدمن؟
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- هل المستخدم الحالي عنده اشتراك ساري في المادة دي؟
create or replace function public.has_access(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid()
      and s.course_id = p_course_id
      and s.status = 'active'
      and s.ends_at > now()
  );
$$;

-- ============================================================
-- 4) إنشاء الـ profile تلقائيًا عند التسجيل (مع الاسم والموبايل لو اتبعتوا)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
begin
  v_name := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  )), '');
  v_phone := public.normalize_eg_phone(new.raw_user_meta_data->>'phone');

  insert into public.profiles (id, email, full_name, phone, profile_complete)
  values (new.id, new.email, v_name, v_phone, (v_name is not null and v_phone is not null))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 5) دوال الأعمال (كل عمليات الدفع والبيانات الحساسة بتمر من هنا)
-- ============================================================

-- الطالب يحدّث اسمه ورقم موبايله (الطريقة الوحيدة لتعديل الموبايل)
create or replace function public.update_my_profile(
  p_full_name text default null,
  p_phone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- تنظيف الاسم (مسافات زيادة)
  v_name := nullif(trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')), '');
  if v_name is not null and (char_length(v_name) < 3 or char_length(v_name) > 80) then
    raise exception 'invalid name';
  end if;

  -- توحيد والتحقق من رقم الموبايل
  if p_phone is not null and trim(p_phone) <> '' then
    v_phone := public.normalize_eg_phone(p_phone);
    if v_phone is null then
      raise exception 'invalid phone';
    end if;
  end if;

  update public.profiles
  set full_name = coalesce(v_name, full_name),
      phone = coalesce(v_phone, phone),
      profile_complete = (
        coalesce(v_name, full_name) is not null
        and coalesce(v_phone, phone) is not null
      )
  where id = auth.uid()
  returning * into v_profile;

  if not found then
    raise exception 'profile not found';
  end if;

  return v_profile;
end;
$$;

-- إنشاء طلب جديد بمبلغ فريد (مثلاً 120.37)
create or replace function public.create_order(p_course_id uuid, p_method text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses;
  v_order public.orders;
  v_cents integer;
  v_try integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_method not in ('vodafone_cash','instapay') then
    raise exception 'invalid payment method';
  end if;

  -- اختياري: اشترط اكتمال بيانات الطالب (الاسم والموبايل) قبل الشراء
  -- شيل علامة -- من الأسطر التالية بعد ما تتأكد إن نموذج استكمال البيانات شغّال
  -- if not exists (
  --   select 1 from public.profiles where id = auth.uid() and profile_complete
  -- ) then
  --   raise exception 'profile incomplete';
  -- end if;

  select * into v_course from public.courses
  where id = p_course_id and is_published;
  if not found then
    raise exception 'course not found';
  end if;
  if v_course.access_until < current_date then
    raise exception 'course access period ended';
  end if;
  if public.has_access(p_course_id) then
    raise exception 'already subscribed';
  end if;

  -- إنهاء الطلبات المعلقة اللي وقتها خلص
  update public.orders set status = 'expired'
  where status = 'pending' and expires_at < now();

  -- لو للطالب طلب معلق على نفس المادة نرجعه (ونحدّث وسيلة الدفع)
  select * into v_order from public.orders
  where user_id = auth.uid() and course_id = p_course_id and status = 'pending'
  limit 1;
  if found then
    update public.orders set payment_method = p_method
    where id = v_order.id returning * into v_order;
    return v_order;
  end if;

  -- اختيار مبلغ فريد (السعر + من 1 لـ 99 قرش)
  loop
    v_try := v_try + 1;
    v_cents := 1 + floor(random() * 99)::int;
    begin
      insert into public.orders (user_id, course_id, base_price, unique_amount, payment_method)
      values (auth.uid(), p_course_id, v_course.price_egp,
              v_course.price_egp + v_cents / 100.0, p_method)
      returning * into v_order;
      return v_order;
    exception when unique_violation then
      if v_try >= 30 then
        raise exception 'no free amount, try again later';
      end if;
    end;
  end loop;
end;
$$;

-- الطالب يبعت رقم العملية وصورة الإيصال
create or replace function public.submit_payment(
  p_order_id uuid,
  p_tx_reference text,
  p_proof_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := upper(trim(p_tx_reference));
begin
  if v_ref is null or length(v_ref) < 4 then
    raise exception 'invalid reference';
  end if;

  -- بعد الإرسال نمدد الحجز 12 ساعة لحد ما الأدمن يراجع الطلب
  update public.orders
  set tx_reference = v_ref,
      proof_path = coalesce(p_proof_path, proof_path),
      expires_at = greatest(expires_at, now() + interval '12 hours')
  where id = p_order_id
    and user_id = auth.uid()
    and status in ('pending','expired');

  if not found then
    raise exception 'order not found or already processed';
  end if;
end;
$$;

-- الأدمن يقبل الطلب ← يفعّل الاشتراك لحد آخر يوم في الترم
create or replace function public.approve_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_course public.courses;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found';
  end if;
  if v_order.status = 'paid' then
    return;
  end if;

  select * into v_course from public.courses where id = v_order.course_id;

  update public.orders
  set status = 'paid', reviewed_at = now()
  where id = v_order.id;

  -- الاشتراك ينتهي مع نهاية يوم تاريخ الانتهاء بتوقيت القاهرة
  insert into public.subscriptions (user_id, course_id, order_id, starts_at, ends_at, status)
  values (
    v_order.user_id, v_order.course_id, v_order.id, now(),
    ((v_course.access_until + 1)::timestamp at time zone 'Africa/Cairo'),
    'active'
  )
  on conflict (user_id, course_id) do update
    set order_id = excluded.order_id,
        ends_at = excluded.ends_at,
        status = 'active';
end;
$$;

-- الأدمن يرفض الطلب
create or replace function public.reject_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  update public.orders
  set status = 'rejected', reject_reason = p_reason, reviewed_at = now()
  where id = p_order_id and status in ('pending','expired');
end;
$$;

-- ============================================================
-- 6) صلاحيات التنفيذ والتعديل
-- ============================================================

-- الدوال دي للمستخدمين المسجلين فقط
revoke execute on function public.create_order(uuid, text) from public, anon;
revoke execute on function public.submit_payment(uuid, text, text) from public, anon;
revoke execute on function public.approve_order(uuid) from public, anon;
revoke execute on function public.reject_order(uuid, text) from public, anon;
revoke execute on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.create_order(uuid, text) to authenticated;
grant execute on function public.submit_payment(uuid, text, text) to authenticated;
grant execute on function public.approve_order(uuid) to authenticated;
grant execute on function public.reject_order(uuid, text) to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- الزائر (anon) ممنوع من أي كتابة
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- المستخدم يعدل الاسم فقط مباشرة (الموبايل و is_admin ممنوعين، الموبايل عن طريق الدالة)
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ============================================================
-- 7) سياسات الأمان RLS
-- ============================================================

alter table public.profiles       enable row level security;
alter table public.courses        enable row level security;
alter table public.modules        enable row level security;
alter table public.videos         enable row level security;
alter table public.video_sources  enable row level security;
alter table public.orders         enable row level security;
alter table public.subscriptions  enable row level security;

-- profiles: كل واحد يشوف بياناته (ومنها الموبايل)، والأدمن يشوف الكل
drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- courses
drop policy if exists "courses: public read published" on public.courses;
create policy "courses: public read published" on public.courses
  for select using (is_published or public.is_admin());

drop policy if exists "courses: admin all" on public.courses;
create policy "courses: admin all" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- modules
drop policy if exists "modules: public read" on public.modules;
create policy "modules: public read" on public.modules
  for select using (
    exists (select 1 from public.courses c where c.id = modules.course_id and c.is_published)
    or public.is_admin()
  );

drop policy if exists "modules: admin all" on public.modules;
create policy "modules: admin all" on public.modules
  for all using (public.is_admin()) with check (public.is_admin());

-- videos (العناوين فقط)
drop policy if exists "videos: public read" on public.videos;
create policy "videos: public read" on public.videos
  for select using (
    exists (select 1 from public.courses c where c.id = videos.course_id and c.is_published)
    or public.is_admin()
  );

drop policy if exists "videos: admin all" on public.videos;
create policy "videos: admin all" on public.videos
  for all using (public.is_admin()) with check (public.is_admin());

-- video_sources: الـ ID يظهر للأدمن أو للدرس المجاني أو للمشترك بإشتراك ساري
drop policy if exists "video_sources: free or subscribed or admin" on public.video_sources;
create policy "video_sources: free or subscribed or admin" on public.video_sources
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.videos v
      where v.id = video_sources.video_id
        and (v.is_free or public.has_access(v.course_id))
    )
  );

drop policy if exists "video_sources: admin write" on public.video_sources;
create policy "video_sources: admin write" on public.video_sources
  for all using (public.is_admin()) with check (public.is_admin());

-- orders: الطالب يشوف طلباته، والأدمن يشوف ويعدل الكل (الطالب بيكتب من الدوال فقط)
drop policy if exists "orders: read own or admin" on public.orders;
create policy "orders: read own or admin" on public.orders
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "orders: admin write" on public.orders;
create policy "orders: admin write" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

-- subscriptions
drop policy if exists "subscriptions: read own or admin" on public.subscriptions;
create policy "subscriptions: read own or admin" on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "subscriptions: admin write" on public.subscriptions;
create policy "subscriptions: admin write" on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 8) تخزين صور الإيصالات (خاص)
-- ============================================================

-- bucket بالاسمين: الأصلي واللي بيستخدمه كود الواجهة
insert into storage.buckets (id, name, public)
values
  ('payment-proofs', 'payment-proofs', false),
  ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;

-- حد أقصى 5 ميجا، وصور أو PDF فقط
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id in ('payment-proofs', 'payment-receipts');

-- الطالب يرفع في فولدر باسم الـ id بتاعه بس
drop policy if exists "proofs: upload to own folder" on storage.objects;
drop policy if exists "receipts: upload to own folder" on storage.objects;
create policy "receipts: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('payment-proofs', 'payment-receipts')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- الطالب يشوف صوره، والأدمن يشوف الكل
drop policy if exists "proofs: read own or admin" on storage.objects;
drop policy if exists "receipts: read own or admin" on storage.objects;
create policy "receipts: read own or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('payment-proofs', 'payment-receipts')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ============================================================
-- 9) ترتيب البيانات الموجودة
-- ============================================================

-- إنشاء profile لأي حساب موجود ومالوش profile
insert into public.profiles (id, email, full_name)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- حساب الأدمن مكتمل
update public.profiles set profile_complete = true where is_admin = true;

-- تحديث كاش الـ API
notify pgrst, 'reload schema';