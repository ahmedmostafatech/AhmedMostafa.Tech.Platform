-- ============================================================
-- 13_hardening_registrations_v1.sql
-- تقوية أمان نظام التسجيل الجديد (المرحلة 2)
-- آمن للتشغيل أكثر من مرة، ولا يحذف أي جدول أو بيانات
-- ============================================================

-- ============================================================
-- 1) جدول خاص بروابط الدخول (للأدمن فقط)
-- ============================================================

create table if not exists public.course_private (
  course_id uuid primary key references public.courses(id) on delete cascade,
  access_link text,
  drive_folder_id text,
  updated_at timestamptz not null default now()
);

alter table public.course_private enable row level security;

drop policy if exists "course_private: admin all" on public.course_private;
create policy "course_private: admin all" on public.course_private
  for all using (public.is_admin()) with check (public.is_admin());

-- نسخ الروابط الحالية (من غير حذفها من courses في الوقت الحالي)
insert into public.course_private (course_id, access_link)
select c.id, c.access_link
from public.courses c
where c.access_link is not null
on conflict (course_id) do nothing;

-- ============================================================
-- 2) جدول محاولات التسجيل (لتحديد المعدل حسب الـ IP)
-- ============================================================

create table if not exists public.registration_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists registration_attempts_ip_idx
  on public.registration_attempts (ip_hash, created_at desc);

-- RLS مفعّل من غير سياسات = مقفول على الكل، والدوال (security definer) بس بتكتب فيه
alter table public.registration_attempts enable row level security;

-- ============================================================
-- 3) منع تكرار التسجيل المفتوح (إيميل + مادة)
-- ============================================================

create unique index if not exists registrations_open_email_course_uq
  on public.registrations (lower(email), course_id)
  where payment_status in ('pending_payment', 'under_review');

-- ============================================================
-- 4) register_student (نسخة محسّنة، نفس التوقيع ونفس مفاتيح الإرجاع)
-- ============================================================

create or replace function public.register_student(
  p_course_id uuid,
  p_full_name text,
  p_branch text,
  p_phone text,
  p_email text,
  p_payment_method text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses%rowtype;
  v_reg public.registrations%rowtype;
  v_name text;
  v_branch text;
  v_phone text;
  v_email text;
  v_ip text;
  v_ip_hash text;
  v_code text;
  v_new_id uuid;
begin
  -- 1) تنظيف المدخلات (null بيتحول لنص فاضي عشان الفحص ما يتخطاهوش)
  v_name := regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'invalid name';
  end if;

  v_branch := regexp_replace(trim(coalesce(p_branch, '')), '\s+', ' ', 'g');
  if char_length(v_branch) < 2 or char_length(v_branch) > 60 then
    raise exception 'invalid branch';
  end if;

  -- 2) رقم الموبايل المصري (بيرجع 01xxxxxxxxx أو null لو غير صحيح)
  v_phone := public.normalize_eg_phone(p_phone);
  if v_phone is null then
    raise exception 'invalid phone';
  end if;

  -- 3) الإيميل (regex من غير شرطات مائلة عشان ما يحصلش لبس في الـ escaping)
  v_email := lower(trim(coalesce(p_email, '')));
  if char_length(v_email) > 254
     or v_email !~ '^[a-z0-9._%+-]+@[a-z0-9-]+([.][a-z0-9-]+)*[.][a-z]{2,}$' then
    raise exception 'invalid email';
  end if;

  -- 4) وسيلة الدفع
  if p_payment_method is null or p_payment_method not in ('vodafone_cash', 'instapay') then
    raise exception 'invalid payment method';
  end if;

  -- 5) المادة منشورة وسارية
  select * into v_course
  from public.courses
  where id = p_course_id and is_published = true;

  if not found then
    raise exception 'course not found';
  end if;

  if v_course.access_until is not null and v_course.access_until < current_date then
    raise exception 'course access period ended';
  end if;

  -- 6) حد المعدل حسب الـ IP (20 في الساعة). لو الـ IP مش متاح بنتخطى الفحص
  v_ip := nullif(trim(split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
    ',', 1)), '');

  if v_ip is not null then
    v_ip_hash := encode(sha256(convert_to(v_ip || ':amt-registration', 'UTF8')), 'hex');

    delete from public.registration_attempts
    where created_at < now() - interval '1 day';

    if (
      select count(*) from public.registration_attempts
      where ip_hash = v_ip_hash and created_at > now() - interval '1 hour'
    ) >= 20 then
      raise exception 'too many requests';
    end if;

    insert into public.registration_attempts (ip_hash) values (v_ip_hash);
  end if;

  -- 7) لو الطالب مؤكد (paid) بالفعل في المادة دي
  if exists (
    select 1 from public.registrations
    where course_id = p_course_id
      and lower(email) = v_email
      and payment_status = 'paid'
  ) then
    raise exception 'already registered and paid';
  end if;

  -- 8) لو فيه تسجيل مفتوح لنفس الإيميل والمادة: نرجّع نفس الكود ونحدّث وسيلة الدفع فقط
  select * into v_reg
  from public.registrations
  where course_id = p_course_id
    and lower(email) = v_email
    and payment_status in ('pending_payment', 'under_review')
  limit 1;

  if found then
    update public.registrations
    set payment_method = p_payment_method, updated_at = now()
    where id = v_reg.id;

    -- بنرجّع المدخلات اللي اتبعتت (مش بيانات التسجيل القديم) عشان ما نكشفش بيانات حد تاني
    return json_build_object(
      'registration_id',   v_reg.id,
      'registration_code', v_reg.registration_code,
      'course_title',      v_course.title,
      'amount',            v_reg.amount,
      'payment_method',    p_payment_method,
      'full_name',         v_name,
      'phone',             v_phone,
      'email',             v_email,
      'branch',            v_branch,
      'already_exists',    true
    );
  end if;

  -- 9) إنشاء تسجيل جديد
  v_code := 'AMT-' || nextval('public.registration_code_seq')::text;

  begin
    insert into public.registrations (
      registration_code, course_id, full_name, branch, phone, email,
      amount, payment_method, payment_status
    ) values (
      v_code, p_course_id, v_name, v_branch, v_phone, v_email,
      v_course.price_egp, p_payment_method, 'pending_payment'
    )
    returning id into v_new_id;
  exception when unique_violation then
    -- حالة سباق: طلبين لنفس الإيميل والمادة في نفس اللحظة
    select * into v_reg
    from public.registrations
    where course_id = p_course_id
      and lower(email) = v_email
      and payment_status in ('pending_payment', 'under_review')
    limit 1;

    if not found then
      raise;
    end if;

    return json_build_object(
      'registration_id',   v_reg.id,
      'registration_code', v_reg.registration_code,
      'course_title',      v_course.title,
      'amount',            v_reg.amount,
      'payment_method',    p_payment_method,
      'full_name',         v_name,
      'phone',             v_phone,
      'email',             v_email,
      'branch',            v_branch,
      'already_exists',    true
    );
  end;

  return json_build_object(
    'registration_id',   v_new_id,
    'registration_code', v_code,
    'course_title',      v_course.title,
    'amount',            v_course.price_egp,
    'payment_method',    p_payment_method,
    'full_name',         v_name,
    'phone',             v_phone,
    'email',             v_email,
    'branch',            v_branch,
    'already_exists',    false
  );
end;
$$;

-- ============================================================
-- 5) get_registration_summary (تقنيع الموبايل والإيميل، نفس المفاتيح)
-- ============================================================

create or replace function public.get_registration_summary(p_reg_id uuid)
returns json
language plpgsql
security definer
set search_path = public
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
    'phone',             left(v_reg.phone, 3) || '****' || right(v_reg.phone, 4),
    'email',             left(split_part(v_reg.email, '@', 1), 1) || '***@' || split_part(v_reg.email, '@', 2),
    'branch',            v_reg.branch,
    'created_at',        v_reg.created_at
  );
end;
$$;

-- ============================================================
-- 6) الصلاحيات
-- ============================================================

-- دوال التسجيل العام: مسموحة للزائر
revoke execute on function public.register_student(uuid, text, text, text, text, text) from public;
grant execute on function public.register_student(uuid, text, text, text, text, text) to anon, authenticated;

revoke execute on function public.get_registration_summary(uuid) from public;
grant execute on function public.get_registration_summary(uuid) to anon, authenticated;

-- دوال الأدمن: للمستخدم المسجّل فقط (وبتفحص is_admin جواها كطبقة تانية)
revoke execute on function public.admin_approve_registration(uuid, text) from public, anon;
revoke execute on function public.admin_reject_registration(uuid, text, text) from public, anon;
revoke execute on function public.admin_log_email(uuid, text, text) from public, anon;
revoke execute on function public.admin_get_registration_stats() from public, anon;
grant execute on function public.admin_approve_registration(uuid, text) to authenticated;
grant execute on function public.admin_reject_registration(uuid, text, text) to authenticated;
grant execute on function public.admin_log_email(uuid, text, text) to authenticated;
grant execute on function public.admin_get_registration_stats() to authenticated;

-- دالة النظام القديم: ما تتنفذش من الزائر
revoke execute on function public.create_order(uuid, text) from public, anon;
grant execute on function public.create_order(uuid, text) to authenticated;

-- الجداول الجديدة: الزائر مالوش أي صلاحية (الوصول عن طريق الدوال فقط)
revoke all on public.registrations from anon;
revoke all on public.email_logs from anon;
revoke all on public.course_private from anon;
revoke all on public.registration_attempts from anon, authenticated;

-- تقليل الصلاحيات الزايدة على المستخدم المسجّل
revoke truncate, references, trigger on public.registrations from authenticated;
revoke truncate, references, trigger on public.email_logs from authenticated;
revoke truncate, references, trigger on public.course_private from authenticated;

notify pgrst, 'reload schema';

-- ============================================================
-- 7) فحص النتيجة (كل الصفوف المتوقعة مكتوبة قدامها)
-- ============================================================

select 'course_private rows (= عدد المواد اللي ليها لينك)' as check_item,
       (select count(*) from public.course_private)::text as result
union all
select 'anon يقدر ينفذ admin_approve_registration (المتوقع false)',
       has_function_privilege('anon', 'public.admin_approve_registration(uuid, text)', 'execute')::text
union all
select 'anon يقدر ينفذ register_student (المتوقع true)',
       has_function_privilege('anon', 'public.register_student(uuid, text, text, text, text, text)', 'execute')::text
union all
select 'anon يقدر يقرأ registrations (المتوقع false)',
       has_table_privilege('anon', 'public.registrations', 'select')::text
union all
select 'فهرس منع التكرار موجود (المتوقع true)',
       exists (select 1 from pg_indexes where indexname = 'registrations_open_email_course_uq')::text;