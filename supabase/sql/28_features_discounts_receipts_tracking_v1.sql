-- ============================================================
-- 28_features_discounts_receipts_tracking_v1.sql
-- دعم أكواد الخصم، رفع الإيصالات، صفحة متابعة الطلب، والإحصائيات
-- ============================================================

-- 1. إضافة حقول الإيصال والخصم لجدول التسجيلات
alter table public.registrations
  add column if not exists receipt_url text,
  add column if not exists discount_code text,
  add column if not exists discount_amount numeric(10,2) default 0,
  add column if not exists original_amount numeric(10,2);

-- تحديث الحقول للتسجيلات القديمة
update public.registrations
set original_amount = amount
where original_amount is null;

-- 2. إنشاء جدول أكواد الخصم (discount_codes)
create table if not exists public.discount_codes (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  discount_type     text not null check (discount_type in ('percentage', 'fixed')),
  discount_value    numeric(10,2) not null check (discount_value > 0),
  max_uses          int default null, -- null = غير محدود
  used_count        int not null default 0,
  min_amount        numeric(10,2) not null default 0,
  is_active         boolean not null default true,
  expires_at        timestamptz default null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- فهرس للبحث السريع عن الكود
create index if not exists idx_discount_codes_code on public.discount_codes (upper(trim(code)));

-- تفعيل RLS على جدول أكواد الخصم
alter table public.discount_codes enable row level security;

-- صلاحية الأدمن الكاملة على جدول الأكواد
drop policy if exists "discount_codes: admin all" on public.discount_codes;
create policy "discount_codes: admin all" on public.discount_codes
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- 3. دالة التحقق من كود الخصم وحساب القيمة (RPC للزوار)
create or replace function public.validate_discount_code(
  p_code          text,
  p_total_amount  numeric
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_code_rec      public.discount_codes%rowtype;
  v_discount      numeric(10,2) := 0;
  v_final_amount  numeric(10,2) := p_total_amount;
  v_clean_code    text;
begin
  v_clean_code := upper(trim(coalesce(p_code, '')));

  if v_clean_code = '' then
    raise exception 'کود الخصم فارغ';
  end if;

  select * into v_code_rec
  from public.discount_codes
  where upper(trim(code)) = v_clean_code;

  if not found then
    raise exception 'كود الخصم غير صحيح أو غير موجود';
  end if;

  if not v_code_rec.is_active then
    raise exception 'كود الخصم غير مفعّل حالياً';
  end if;

  if v_code_rec.expires_at is not null and v_code_rec.expires_at < now() then
    raise exception 'كود الخصم منتهي الصلاحية';
  end if;

  if v_code_rec.max_uses is not null and v_code_rec.used_count >= v_code_rec.max_uses then
    raise exception 'تم استهلاك الحد الأقصى لاستخدام هذا الكود';
  end if;

  if p_total_amount < v_code_rec.min_amount then
    raise exception 'الحد الأدنى للطلب لتطبيق هذا الكود هو % ج.م', v_code_rec.min_amount;
  end if;

  -- حساب قيمة الخصم
  if v_code_rec.discount_type = 'percentage' then
    v_discount := round((p_total_amount * (v_code_rec.discount_value / 100.0)), 2);
  else
    v_discount := v_code_rec.discount_value;
  end if;

  -- منع أن يكون الخصم أكبر من المبلغ الإجمالي
  if v_discount > p_total_amount then
    v_discount := p_total_amount;
  end if;

  v_final_amount := p_total_amount - v_discount;

  return json_build_object(
    'valid',           true,
    'code',            v_code_rec.code,
    'discount_type',   v_code_rec.discount_type,
    'discount_value',  v_code_rec.discount_value,
    'discount_amount', v_discount,
    'original_amount', p_total_amount,
    'final_amount',    v_final_amount
  );
end;
$$;

-- 4. تحديث دالة تسجيل الطالب لدعم كود الخصم
create or replace function public.register_student_with_coupon(
  p_course_id       uuid,
  p_full_name       text,
  p_branch          text,
  p_phone           text,
  p_email           text,
  p_payment_method  text,
  p_discount_code   text default null
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
  v_orig_amount     numeric(10,2);
  v_discount_amount numeric(10,2) := 0;
  v_final_amount    numeric(10,2);
  v_used_coupon     text := null;
  v_coupon_res      json;
begin
  -- تنظيف والتحقق
  v_clean_name := trim(p_full_name);
  if length(v_clean_name) < 3 then
    raise exception 'invalid name';
  end if;

  v_clean_branch := trim(p_branch);
  if length(v_clean_branch) < 2 then
    raise exception 'invalid branch';
  end if;

  v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v_clean_phone ~ '^201[0-25][0-9]{8}$' then
    v_clean_phone := '0' || substring(v_clean_phone from 3);
  elsif v_clean_phone ~ '^00201[0-25][0-9]{8}$' then
    v_clean_phone := '0' || substring(v_clean_phone from 5);
  end if;

  if v_clean_phone !~ '^01[0-25][0-9]{8}$' then
    raise exception 'invalid phone';
  end if;

  v_clean_email := lower(trim(p_email));
  if v_clean_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'invalid email';
  end if;

  if p_payment_method not in ('vodafone_cash', 'instapay') then
    raise exception 'invalid payment method';
  end if;

  select * into v_course
  from public.courses
  where id = p_course_id and is_published = true;

  if not found then
    raise exception 'course not found';
  end if;

  v_orig_amount := v_course.price_egp;
  v_final_amount := v_orig_amount;

  -- فحص كود الخصم إن وجد
  if p_discount_code is not null and trim(p_discount_code) <> '' then
    begin
      v_coupon_res := public.validate_discount_code(p_discount_code, v_orig_amount);
      v_discount_amount := (v_coupon_res->>'discount_amount')::numeric;
      v_final_amount := (v_coupon_res->>'final_amount')::numeric;
      v_used_coupon := (v_coupon_res->>'code');

      -- زيادة عدد مرات استخدام الكود
      update public.discount_codes
      set used_count = used_count + 1, updated_at = now()
      where upper(trim(code)) = upper(trim(v_used_coupon));
    exception when others then
      -- إذا كان الكود غير صالح نتجاهله ونكمل بالمبلغ الأصلي
      v_discount_amount := 0;
      v_final_amount := v_orig_amount;
      v_used_coupon := null;
    end;
  end if;

  v_reg_code := 'AMT-' || nextval('public.registration_code_seq')::text;

  insert into public.registrations (
    registration_code,
    course_id,
    full_name,
    branch,
    phone,
    email,
    amount,
    original_amount,
    discount_code,
    discount_amount,
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
    v_final_amount,
    v_orig_amount,
    v_used_coupon,
    v_discount_amount,
    p_payment_method,
    'pending_payment',
    'none'
  )
  returning id into v_reg_id;

  return json_build_object(
    'registration_id',   v_reg_id,
    'registration_code', v_reg_code,
    'course_title',      v_course.title,
    'amount',            v_final_amount,
    'original_amount',   v_orig_amount,
    'discount_code',     v_used_coupon,
    'discount_amount',   v_discount_amount,
    'payment_method',    p_payment_method,
    'full_name',         v_clean_name,
    'phone',             v_clean_phone,
    'email',             v_clean_email,
    'branch',            v_clean_branch
  );
end;
$$;

-- 5. دالة حفظ رابط الإيصال وتحديث الحالة إلى under_review
create or replace function public.submit_registration_receipt(
  p_reg_id      uuid,
  p_receipt_url text
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_reg record;
begin
  if p_receipt_url is null or trim(p_receipt_url) = '' then
    raise exception 'رابط الإيصال غير صالح';
  end if;

  update public.registrations
  set receipt_url     = trim(p_receipt_url),
      payment_status  = case when payment_status = 'pending_payment' then 'under_review' else payment_status end,
      updated_at      = now()
  where id = p_reg_id
  returning * into v_reg;

  if not found then
    raise exception 'التسجيل غير موجود';
  end if;

  return json_build_object(
    'ok',                true,
    'registration_id',   v_reg.id,
    'registration_code', v_reg.registration_code,
    'payment_status',    v_reg.payment_status,
    'receipt_url',       v_reg.receipt_url
  );
end;
$$;

-- 6. دالة متابعة الطلب (track_registration) للطلاب
create or replace function public.track_registration(
  p_code          text,
  p_phone_suffix  text
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_reg         record;
  v_clean_code  text;
  v_clean_suff  text;
begin
  v_clean_code := upper(trim(coalesce(p_code, '')));
  v_clean_suff := regexp_replace(coalesce(p_phone_suffix, ''), '[^0-9]', '', 'g');

  if length(v_clean_code) < 4 then
    raise exception 'كود التسجيل غير صالح';
  end if;

  if length(v_clean_suff) < 4 then
    raise exception 'يرجى إدخال 4 أرقام على الأقل من رقم الموبايل للتأكيد';
  end if;

  select r.*, c.title as course_title, c.access_link, c.access_until
  into v_reg
  from public.registrations r
  join public.courses c on c.id = r.course_id
  where upper(trim(r.registration_code)) = v_clean_code
    and r.phone like ('%' || v_clean_suff);

  if not found then
    raise exception 'لم يتم العثور على حجز مطابق لكود التسجيل ورقم الموبايل المدخل';
  end if;

  return json_build_object(
    'registration_code', v_reg.registration_code,
    'full_name',         v_reg.full_name,
    'course_title',      v_reg.course_title,
    'amount',            v_reg.amount,
    'payment_method',    v_reg.payment_method,
    'payment_status',    v_reg.payment_status,
    'access_status',     v_reg.access_status,
    'rejection_reason',  v_reg.rejection_reason,
    'access_link',       case when v_reg.payment_status = 'paid' then v_reg.access_link else null end,
    'access_until',      v_reg.access_until,
    'email',             v_reg.email,
    'has_receipt',       (v_reg.receipt_url is not null),
    'created_at',        v_reg.created_at,
    'approved_at',       v_reg.approved_at
  );
end;
$$;

-- 7. دالة إحصائيات التليجرام اليومية والبحث المباشر
create or replace function public.telegram_get_stats_today()
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_today_start     timestamptz := (now() at time zone 'Africa/Cairo')::date at time zone 'Africa/Cairo';
  v_total_today     int;
  v_paid_today      int;
  v_pending_today   int;
  v_revenue_today   numeric(10,2);
  v_total_pending   int;
begin
  select count(*) into v_total_today
  from public.registrations
  where created_at >= v_today_start;

  select count(*), coalesce(sum(amount), 0)
  into v_paid_today, v_revenue_today
  from public.registrations
  where payment_status = 'paid' and (approved_at >= v_today_start or (approved_at is null and updated_at >= v_today_start));

  select count(*) into v_pending_today
  from public.registrations
  where payment_status in ('pending_payment', 'under_review') and created_at >= v_today_start;

  select count(*) into v_total_pending
  from public.registrations
  where payment_status in ('pending_payment', 'under_review');

  return json_build_object(
    'total_today',     v_total_today,
    'paid_today',      v_paid_today,
    'pending_today',   v_pending_today,
    'revenue_today',   v_revenue_today,
    'total_pending',   v_total_pending
  );
end;
$$;

-- 8. إنشاء storage bucket للإيصالات إذا لم يكن موجوداً
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = true;

-- سياسة رفع الصور لأي زائر لرفع إيصاله
drop policy if exists "receipts: allow public upload" on storage.objects;
create policy "receipts: allow public upload" on storage.objects
  for insert with check (bucket_id = 'receipts');

drop policy if exists "receipts: allow public read" on storage.objects;
create policy "receipts: allow public read" on storage.objects
  for select using (bucket_id = 'receipts');

notify pgrst, 'reload schema';

