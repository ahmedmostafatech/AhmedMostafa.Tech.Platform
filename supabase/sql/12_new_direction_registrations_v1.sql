-- ============================================================
-- 12_new_direction_registrations_v1.sql
-- التحول للنموذج الجديد: نظام تسجيل وإدارة مدفوعات المراجعات
-- بدون حسابات طلاب، مع كود تسجيل تسلسلي AMT-1001، وتحكم كامل للأدمن
-- ============================================================

-- 1. إضافة الحقول الجديدة لجدول المراجعات (courses)
alter table public.courses
  add column if not exists short_description text,
  add column if not exists access_link text;

-- 2. إنشاء متسلسلة أكواد التسجيل (تبدأ من 1001)
create sequence if not exists public.registration_code_seq start with 1001;

-- 3. جدول التسجيلات الجديد (registrations)
create table if not exists public.registrations (
  id                  uuid primary key default gen_random_uuid(),
  registration_code   text unique not null default ('AMT-' || nextval('public.registration_code_seq')::text),
  course_id           uuid not null references public.courses(id),
  full_name           text not null,
  branch              text not null,
  phone               text not null,
  email               text not null,
  amount              numeric(10,2) not null,
  payment_method      text not null check (payment_method in ('vodafone_cash', 'instapay')),
  payment_status      text not null default 'pending_payment'
                      check (payment_status in ('pending_payment', 'under_review', 'paid', 'rejected', 'cancelled')),
  admin_note          text,
  rejection_reason    text,
  approved_at         timestamptz,
  approved_by         uuid references auth.users(id),
  email_sent          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- إنشاء فهارس للبحث السريع
create index if not exists idx_registrations_code on public.registrations(registration_code);
create index if not exists idx_registrations_phone on public.registrations(phone);
create index if not exists idx_registrations_email on public.registrations(email);
create index if not exists idx_registrations_status on public.registrations(payment_status);
create index if not exists idx_registrations_course on public.registrations(course_id);

-- 4. جدول سجل الإيميلات (email_logs) لمنع التكرار وتتبع التسليم
create table if not exists public.email_logs (
  id                  uuid primary key default gen_random_uuid(),
  registration_id     uuid not null references public.registrations(id) on delete cascade,
  recipient_email     text not null,
  email_type          text not null default 'activation',
  status              text not null check (status in ('sent', 'failed')),
  error_message       text,
  sent_at             timestamptz default now(),
  created_at          timestamptz not null default now()
);

-- 5. تفعيل أمان RLS (Row Level Security)
alter table public.registrations enable row level security;
alter table public.email_logs enable row level security;

-- سياسات جدول التسجيلات:
-- الأدمن يرى ويكتب ويعدل كل شيء
drop policy if exists "registrations: admin all" on public.registrations;
create policy "registrations: admin all" on public.registrations
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- سياسات جدول إيميلات التفعيل:
drop policy if exists "email_logs: admin all" on public.email_logs;
create policy "email_logs: admin all" on public.email_logs
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ملاحظة أمان: لا توجد أي سياسة SELECT أو UPDATE عامة (anon) على جدول registrations لحماية أرقام وإيميلات الطلاب من التسريب.

-- ============================================================
-- 6. الدوال الآمنة (RPC Functions - Security Definer)
-- ============================================================

-- أ) دالة تسجيل طالب جديد (متاحة للزوار بدون تسجيل دخول)
create or replace function public.register_student(
  p_course_id       uuid,
  p_full_name       text,
  p_branch          text,
  p_phone           text,
  p_email           text,
  p_payment_method  text
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_course          public.courses%rowtype;
  v_reg_id          uuid;
  v_reg_code        text;
  v_clean_phone     text;
  v_clean_email     text;
  v_clean_name      text;
  v_clean_branch    text;
begin
  -- 1. تنظيف والتحقق من الاسم
  v_clean_name := trim(p_full_name);
  if length(v_clean_name) < 3 then
    raise exception 'invalid name';
  end if;

  -- 2. تنظيف والتحقق من الفرع
  v_clean_branch := trim(p_branch);
  if length(v_clean_branch) < 2 then
    raise exception 'invalid branch';
  end if;

  -- 3. توحيد والتحقق من رقم الهاتف المصري (01xxxxxxxxx)
  v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v_clean_phone ~ '^201[0-25][0-9]{8}$' then
    v_clean_phone := '0' || substring(v_clean_phone from 3);
  elsif v_clean_phone ~ '^00201[0-25][0-9]{8}$' then
    v_clean_phone := '0' || substring(v_clean_phone from 5);
  end if;

  if v_clean_phone !~ '^01[0-25][0-9]{8}$' then
    raise exception 'invalid phone';
  end if;

  -- 4. تنظيف والتحقق من الإيميل
  v_clean_email := lower(trim(p_email));
  if v_clean_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'invalid email';
  end if;

  -- 5. التحقق من وسيلة الدفع
  if p_payment_method not in ('vodafone_cash', 'instapay') then
    raise exception 'invalid payment method';
  end if;

  -- 6. التحقق من وجود المادة وأنها منشورة وسارية
  select * into v_course
  from public.courses
  where id = p_course_id and is_published = true;

  if not found then
    raise exception 'course not found';
  end if;

  if v_course.access_until is not null and v_course.access_until < current_date then
    raise exception 'course access period ended';
  end if;

  -- 7. فحص ما إذا كان هناك تسجيل مسبق مؤكد (paid) لنفس الطالب والمادة
  if exists (
    select 1 from public.registrations
    where course_id = p_course_id
      and email = v_clean_email
      and payment_status = 'paid'
  ) then
    raise exception 'already registered and paid';
  end if;

  -- 8. إنشاء التسجيل
  v_reg_code := 'AMT-' || nextval('public.registration_code_seq')::text;

  insert into public.registrations (
    registration_code,
    course_id,
    full_name,
    branch,
    phone,
    email,
    amount,
    payment_method,
    payment_status
  ) values (
    v_reg_code,
    p_course_id,
    v_clean_name,
    v_clean_branch,
    v_clean_phone,
    v_clean_email,
    v_course.price_egp,
    p_payment_method,
    'pending_payment'
  )
  returning id into v_reg_id;

  -- إرجاع ملخص التسجيل فقط بأمان
  return json_build_object(
    'registration_id',   v_reg_id,
    'registration_code', v_reg_code,
    'course_title',      v_course.title,
    'amount',            v_course.price_egp,
    'payment_method',    p_payment_method,
    'full_name',         v_clean_name,
    'phone',             v_clean_phone,
    'email',             v_clean_email,
    'branch',            v_clean_branch
  );
end;
$$;

-- ب) دالة قراءة ملخص التسجيل (لعرض صفحة الدفع payment.html بأمان عبر ID التسجيل)
create or replace function public.get_registration_summary(p_reg_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_reg record;
begin
  select r.id, r.registration_code, r.full_name, r.branch, r.phone, r.email,
         r.amount, r.payment_method, r.payment_status, r.created_at,
         c.title as course_title
  into v_reg
  from public.registrations r
  join public.courses c on c.id = r.course_id
  where r.id = p_reg_id;

  if not found then
    return null;
  end if;

  return json_build_object(
    'id',                v_reg.id,
    'registration_code', v_reg.registration_code,
    'course_title',      v_reg.course_title,
    'amount',            v_reg.amount,
    'payment_method',    v_reg.payment_method,
    'payment_status',    v_reg.payment_status,
    'full_name',         v_reg.full_name,
    'phone',             v_reg.phone,
    'email',             v_reg.email,
    'branch',            v_reg.branch,
    'created_at',        v_reg.created_at
  );
end;
$$;

-- ج) دالة قبول الدفع (أدمن فقط)
create or replace function public.admin_approve_registration(
  p_reg_id     uuid,
  p_admin_note text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin_id  uuid := auth.uid();
  v_reg       record;
  v_course    record;
begin
  -- تأكيد صلاحية الأدمن
  if not exists (
    select 1 from public.profiles
    where id = v_admin_id and is_admin = true
  ) then
    raise exception 'forbidden';
  end if;

  -- فحص التسجيل
  select * into v_reg
  from public.registrations
  where id = p_reg_id;

  if not found then
    raise exception 'registration not found';
  end if;

  if v_reg.payment_status = 'paid' then
    raise exception 'registration already approved';
  end if;

  -- جلب رابط الوصول والمادة
  select title, access_link, access_until into v_course
  from public.courses
  where id = v_reg.course_id;

  -- تحديث حالة التسجيل
  update public.registrations
  set payment_status = 'paid',
      approved_at    = now(),
      approved_by    = v_admin_id,
      admin_note     = coalesce(p_admin_note, admin_note),
      updated_at     = now()
  where id = p_reg_id;

  -- إرجاع البيانات اللازمة لإرسال إيميل التفعيل فوراً
  return json_build_object(
    'registration_id',   v_reg.id,
    'registration_code', v_reg.registration_code,
    'course_title',      v_course.title,
    'access_link',       v_course.access_link,
    'access_until',      v_course.access_until,
    'student_name',      v_reg.full_name,
    'student_email',     v_reg.email,
    'student_phone',     v_reg.phone,
    'amount',            v_reg.amount,
    'payment_method',    v_reg.payment_method
  );
end;
$$;

-- د) دالة رفض التسجيل (أدمن فقط)
create or replace function public.admin_reject_registration(
  p_reg_id     uuid,
  p_reason     text default null,
  p_admin_note text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles
    where id = v_admin_id and is_admin = true
  ) then
    raise exception 'forbidden';
  end if;

  update public.registrations
  set payment_status   = 'rejected',
      rejection_reason = p_reason,
      admin_note       = coalesce(p_admin_note, admin_note),
      updated_at       = now()
  where id = p_reg_id;

  if not found then
    raise exception 'registration not found';
  end if;
end;
$$;

-- هـ) دالة إحصائيات لوحة الأدمن (أدمن فقط)
create or replace function public.admin_get_registration_stats()
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin_id        uuid := auth.uid();
  v_total           int;
  v_pending         int;
  v_under_review    int;
  v_paid            int;
  v_rejected        int;
  v_total_revenue   numeric(10,2);
  v_total_courses   int;
begin
  if not exists (
    select 1 from public.profiles
    where id = v_admin_id and is_admin = true
  ) then
    raise exception 'forbidden';
  end if;

  select count(*) into v_total from public.registrations;
  select count(*) into v_pending from public.registrations where payment_status = 'pending_payment';
  select count(*) into v_under_review from public.registrations where payment_status = 'under_review';
  select count(*) into v_paid from public.registrations where payment_status = 'paid';
  select count(*) into v_rejected from public.registrations where payment_status = 'rejected';
  select coalesce(sum(amount), 0) into v_total_revenue from public.registrations where payment_status = 'paid';
  select count(*) into v_total_courses from public.courses where is_published = true;

  return json_build_object(
    'total_registrations', v_total,
    'pending_payment',     v_pending,
    'under_review',        v_under_review,
    'paid',                v_paid,
    'rejected',            v_rejected,
    'total_revenue',       v_total_revenue,
    'published_courses',   v_total_courses
  );
end;
$$;

-- و) دالة تسجيل إرسال الإيميل
create or replace function public.admin_log_email(
  p_reg_id     uuid,
  p_status     text,
  p_error      text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_email    text;
begin
  if not exists (
    select 1 from public.profiles
    where id = v_admin_id and is_admin = true
  ) then
    raise exception 'forbidden';
  end if;

  select email into v_email from public.registrations where id = p_reg_id;

  insert into public.email_logs (registration_id, recipient_email, status, error_message)
  values (p_reg_id, coalesce(v_email, ''), p_status, p_error);

  if p_status = 'sent' then
    update public.registrations
    set email_sent = true, updated_at = now()
    where id = p_reg_id;
  end if;
end;
$$;

-- تحديث كاش PostgREST
notify pgrst, 'reload schema';

