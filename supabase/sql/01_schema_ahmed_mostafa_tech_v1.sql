-- ============================================================
-- 01_schema_ahmed_mostafa_tech_v1.sql
-- المخطط الكامل لقاعدة البيانات (شغّله مرة واحدة في SQL Editor)
-- ============================================================

-- ============================================================
-- 1. تفعيل الامتدادات المطلوبة
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- 2. جدول profiles (ملف الطالب)
-- ============================================================
create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null,
  full_name   text,
  is_admin    boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- trigger: إنشاء profile تلقائي عند أول تسجيل دخول
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3. جداول المحتوى
-- ============================================================

-- المواد الدراسية
create table if not exists public.courses (
  id            uuid        primary key default uuid_generate_v4(),
  title         text        not null,
  description   text,
  price         numeric(10,2) not null default 120,
  access_until  date        not null,  -- آخر يوم متاح للاشتراك
  is_published  boolean     not null default false,
  created_at    timestamptz not null default now()
);

-- الوحدات داخل المادة
create table if not exists public.modules (
  id          uuid        primary key default uuid_generate_v4(),
  course_id   uuid        not null references public.courses(id) on delete cascade,
  title       text        not null,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

-- الفيديوهات
create table if not exists public.videos (
  id          uuid        primary key default uuid_generate_v4(),
  module_id   uuid        not null references public.modules(id) on delete cascade,
  title       text        not null,
  duration_sec int,
  is_free     boolean     not null default false,  -- الدرس المجاني
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

-- روابط يوتيوب (منفصلة للأمان)
create table if not exists public.video_sources (
  id          uuid        primary key default uuid_generate_v4(),
  video_id    uuid        not null unique references public.videos(id) on delete cascade,
  youtube_id  text        not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 4. جداول الدفع والاشتراكات
-- ============================================================

create type public.order_status as enum ('pending', 'approved', 'rejected', 'expired');
create type public.payment_method as enum ('vodafone_cash', 'instapay');

-- الطلبات
create table if not exists public.orders (
  id              uuid          primary key default uuid_generate_v4(),
  user_id         uuid          not null references auth.users(id) on delete cascade,
  course_id       uuid          not null references public.courses(id),
  amount          numeric(10,2) not null,  -- المبلغ الفريد (مثلاً 120.37)
  payment_method  payment_method not null,
  tx_reference    text          unique,     -- رقم العملية (UNIQUE)
  proof_path      text,                     -- مسار الإيصال في Storage
  status          order_status  not null default 'pending',
  expires_at      timestamptz   not null default (now() + interval '1 hour'),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

-- الاشتراكات النشطة
create table if not exists public.subscriptions (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  course_id   uuid        not null references public.courses(id),
  order_id    uuid        not null unique references public.orders(id),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (user_id, course_id)  -- اشتراك واحد فقط لكل مادة
);

-- ============================================================
-- 5. دالة مساعدة: هل للمستخدم اشتراك ساري؟
-- ============================================================
create or replace function public.has_access(p_user_id uuid, p_course_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user_id
      and course_id = p_course_id
      and ends_at > now()
  );
$$;

-- ============================================================
-- 6. دوال الدفع (security definer — لا تغيرها)
-- ============================================================

-- إنشاء طلب جديد بمبلغ فريد
create or replace function public.create_order(
  p_course_id     uuid,
  p_payment_method payment_method
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_price     numeric(10,2);
  v_cents     int;
  v_unique_amount numeric(10,2);
  v_order_id  uuid;
  v_attempt   int := 0;
begin
  -- تأكد من تسجيل الدخول
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- تحقق من المادة
  select price into v_price
  from public.courses
  where id = p_course_id and is_published = true;

  if not found then
    raise exception 'course not found';
  end if;

  -- تحقق إن الاشتراك لسه ممكن
  if not exists (
    select 1 from public.courses
    where id = p_course_id and access_until >= current_date
  ) then
    raise exception 'course access period ended';
  end if;

  -- تحقق إن المستخدم مش مشترك فعلاً
  if public.has_access(v_user_id, p_course_id) then
    raise exception 'already subscribed';
  end if;

  -- إيجاد مبلغ فريد (قروش من 01 لـ 99)
  loop
    v_cents := floor(random() * 99) + 1;
    v_unique_amount := v_price + (v_cents::numeric / 100);
    v_attempt := v_attempt + 1;

    exit when not exists (
      select 1 from public.orders
      where amount = v_unique_amount
        and status = 'pending'
        and expires_at > now()
    );

    if v_attempt >= 50 then
      raise exception 'no free amount';
    end if;
  end loop;

  -- إنشاء الطلب
  insert into public.orders (user_id, course_id, amount, payment_method, expires_at)
  values (v_user_id, p_course_id, v_unique_amount, p_payment_method, now() + interval '1 hour')
  returning id into v_order_id;

  return json_build_object(
    'order_id', v_order_id,
    'amount', v_unique_amount
  );
end;
$$;

-- إرسال بيانات الدفع (رقم العملية + الإيصال)
create or replace function public.submit_payment(
  p_order_id    uuid,
  p_tx_reference text,
  p_proof_path   text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- تحقق إن الطلب موجود وخاص بالمستخدم وفي وضع pending
  if not exists (
    select 1 from public.orders
    where id = p_order_id
      and user_id = v_user_id
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'order not found or already processed';
  end if;

  -- تحقق من رقم العملية
  if p_tx_reference is null or length(trim(p_tx_reference)) < 3 then
    raise exception 'invalid reference';
  end if;

  update public.orders
  set
    tx_reference = trim(p_tx_reference),
    proof_path   = p_proof_path,
    status       = 'pending',
    expires_at   = now() + interval '12 hours',
    updated_at   = now()
  where id = p_order_id and user_id = v_user_id;
end;
$$;

-- قبول الطلب (أدمن فقط)
create or replace function public.approve_order(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_access_until date;
  v_ends_at timestamptz;
begin
  -- تأكد من الأدمن
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'forbidden';
  end if;

  -- جلب الطلب
  select * into v_order
  from public.orders
  where id = p_order_id and status = 'pending';

  if not found then
    raise exception 'order not found or already processed';
  end if;

  -- جلب تاريخ انتهاء المادة
  select access_until into v_access_until
  from public.courses where id = v_order.course_id;

  -- نهاية الاشتراك = نهاية آخر يوم بتوقيت القاهرة
  v_ends_at := (v_access_until + interval '1 day')::timestamp at time zone 'Africa/Cairo';

  -- تحديث الطلب
  update public.orders
  set status = 'approved', updated_at = now()
  where id = p_order_id;

  -- إنشاء أو تحديث الاشتراك
  insert into public.subscriptions (user_id, course_id, order_id, ends_at)
  values (v_order.user_id, v_order.course_id, p_order_id, v_ends_at)
  on conflict (user_id, course_id) do update
    set order_id  = excluded.order_id,
        starts_at = now(),
        ends_at   = excluded.ends_at;
end;
$$;

-- رفض الطلب (أدمن فقط)
create or replace function public.reject_order(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'forbidden';
  end if;

  update public.orders
  set status = 'rejected', updated_at = now()
  where id = p_order_id and status = 'pending';

  if not found then
    raise exception 'order not found or already processed';
  end if;
end;
$$;

-- ============================================================
-- 7. RLS (Row Level Security)
-- ============================================================

-- تفعيل RLS على كل الجداول
alter table public.profiles          enable row level security;
alter table public.courses           enable row level security;
alter table public.modules           enable row level security;
alter table public.videos            enable row level security;
alter table public.video_sources     enable row level security;
alter table public.orders            enable row level security;
alter table public.subscriptions     enable row level security;

-- ---------- profiles ----------
-- المستخدم يرى ملفه فقط، والأدمن يرى الكل
create policy "profiles: own row" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: admin sees all" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- المستخدم يعدل اسمه فقط
create policy "profiles: update own name" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------- courses ----------
-- الكل يرى المواد المنشورة
create policy "courses: public read" on public.courses
  for select using (is_published = true);

-- الأدمن يرى الكل ويكتب
create policy "courses: admin all" on public.courses
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ---------- modules ----------
create policy "modules: public read" on public.modules
  for select using (
    exists (select 1 from public.courses where id = course_id and is_published = true)
  );

create policy "modules: admin all" on public.modules
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ---------- videos ----------
create policy "videos: public read" on public.videos
  for select using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_id and c.is_published = true
    )
  );

create policy "videos: admin all" on public.videos
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ---------- video_sources (الأهم) ----------
-- الكل يرى الدروس المجانية فقط
create policy "video_sources: free lessons" on public.video_sources
  for select using (
    exists (
      select 1 from public.videos v
      where v.id = video_id and v.is_free = true
    )
  );

-- أصحاب الاشتراك الساري
create policy "video_sources: subscribed users" on public.video_sources
  for select using (
    exists (
      select 1
      from public.videos v
      join public.modules m on m.id = v.module_id
      where v.id = video_id
        and public.has_access(auth.uid(), m.course_id)
    )
  );

-- الأدمن يرى الكل
create policy "video_sources: admin all" on public.video_sources
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ---------- orders ----------
-- المستخدم يرى طلباته فقط
create policy "orders: own rows" on public.orders
  for select using (auth.uid() = user_id);

-- الأدمن يرى الكل
create policy "orders: admin all" on public.orders
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ---------- subscriptions ----------
-- المستخدم يرى اشتراكاته فقط
create policy "subscriptions: own rows" on public.subscriptions
  for select using (auth.uid() = user_id);

-- الأدمن يرى الكل
create policy "subscriptions: admin all" on public.subscriptions
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ============================================================
-- 8. Storage Bucket للإيصالات
-- ============================================================
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- كل مستخدم يرفع في مجلده فقط
create policy "payment-proofs: upload own folder" on storage.objects
  for insert with check (
    bucket_id = 'payment-proofs'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- المستخدم يرى ملفاته
create policy "payment-proofs: read own" on storage.objects
  for select using (
    bucket_id = 'payment-proofs'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- الأدمن يرى الكل
create policy "payment-proofs: admin read all" on storage.objects
  for select using (
    bucket_id = 'payment-proofs'
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
