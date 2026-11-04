-- 25_access_tracking_v1.sql
-- تتبع حالة صلاحية Drive لكل تسجيل (ممنوحة / مسحوبة / فشل السحب)
-- وحذف القيد الذي يمنع التسجيل المتكرر، وإتاحة حذف التسجيل للأدمن

alter table public.registrations
  add column if not exists access_status text not null default 'none',
  add column if not exists access_granted_at timestamptz,
  add column if not exists access_revoked_at timestamptz,
  add column if not exists revoke_reason text,
  add column if not exists access_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'registrations_access_status_check'
  ) then
    alter table public.registrations
      add constraint registrations_access_status_check
      check (access_status in ('none', 'granted', 'revoked', 'revoke_failed'));
  end if;
end $$;

-- فهرس صغير للمهمة المجدولة
create index if not exists registrations_access_pending_idx
  on public.registrations (access_status)
  where access_status in ('granted', 'revoke_failed');

-- 1. تعديل دالة register_student للسماح بالتسجيل المتعدد حتى لو دفع قبل كدا بنفس الإيميل
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

  -- 3. توحيد والتحقق من رقم الهاتف المصري
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

  -- 6. التحقق من وجود المادة وأنها منشورة
  select * into v_course
  from public.courses
  where id = p_course_id and is_published = true;

  if not found then
    raise exception 'course not found';
  end if;

  -- 7. إنشاء التسجيل بدون منع التكرار
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
    payment_status,
    access_status
  ) values (
    v_reg_code,
    p_course_id,
    v_clean_name,
    v_clean_branch,
    v_clean_phone,
    v_clean_email,
    v_course.price_egp,
    p_payment_method,
    'pending_payment',
    'none'
  )
  returning id into v_reg_id;

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

-- 2. دالة لحذف تسجيل بواسطة الأدمن
create or replace function public.admin_delete_registration(p_reg_id uuid)
returns boolean
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

  delete from public.email_logs where registration_id = p_reg_id;
  delete from public.registrations where id = p_reg_id;

  return true;
end;
$$;

notify pgrst, 'reload schema';

