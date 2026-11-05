-- ============================================================
-- 14_admin_registration_guards_v1.sql
-- حراسة حالات القبول والرفض + قفل الصف + منع القبول بدون لينك
-- آمن للتشغيل أكثر من مرة، ولا يحذف أي بيانات
-- ============================================================

-- قبول التسجيل (نفس التوقيع ونفس مفاتيح الإرجاع)
create or replace function public.admin_approve_registration(
  p_reg_id uuid,
  p_admin_note text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_reg public.registrations%rowtype;
  v_course record;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  -- قفل الصف عشان ضغطتين متزامنتين ما يعدّوش الاتنين
  select * into v_reg
  from public.registrations
  where id = p_reg_id
  for update;

  if not found then
    raise exception 'registration not found';
  end if;

  if v_reg.payment_status = 'paid' then
    raise exception 'registration already approved';
  end if;

  -- القبول من بانتظار التحويل أو قيد المراجعة فقط
  if v_reg.payment_status not in ('pending_payment', 'under_review') then
    raise exception 'registration not approvable';
  end if;

  select title, access_link, access_until into v_course
  from public.courses
  where id = v_reg.course_id;

  -- ممنوع القبول لو المادة ملهاش لينك دخول
  if v_course.access_link is null or btrim(v_course.access_link) = '' then
    raise exception 'access link not set';
  end if;

  update public.registrations
  set payment_status = 'paid',
      approved_at    = now(),
      approved_by    = v_admin_id,
      admin_note     = coalesce(p_admin_note, admin_note),
      updated_at     = now()
  where id = p_reg_id;

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

-- رفض التسجيل (السبب إلزامي، والرفض من بانتظار التحويل أو قيد المراجعة فقط)
create or replace function public.admin_reject_registration(
  p_reg_id uuid,
  p_reason text default null,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if v_reason is null then
    raise exception 'rejection reason required';
  end if;

  update public.registrations
  set payment_status   = 'rejected',
      rejection_reason = v_reason,
      admin_note       = coalesce(p_admin_note, admin_note),
      updated_at       = now()
  where id = p_reg_id
    and payment_status in ('pending_payment', 'under_review');

  if not found then
    if exists (select 1 from public.registrations where id = p_reg_id) then
      raise exception 'registration not rejectable';
    end if;
    raise exception 'registration not found';
  end if;
end;
$$;

-- دوال الأدمن للمستخدم المسجّل فقط (وبتفحص is_admin جواها كطبقة تانية)
revoke execute on function public.admin_approve_registration(uuid, text) from public, anon;
revoke execute on function public.admin_reject_registration(uuid, text, text) from public, anon;
revoke execute on function public.admin_log_email(uuid, text, text) from public, anon;
revoke execute on function public.admin_get_registration_stats() from public, anon;
grant execute on function public.admin_approve_registration(uuid, text) to authenticated;
grant execute on function public.admin_reject_registration(uuid, text, text) to authenticated;
grant execute on function public.admin_log_email(uuid, text, text) to authenticated;
grant execute on function public.admin_get_registration_stats() to authenticated;

notify pgrst, 'reload schema';

-- فحص النتيجة: كل الصفوف لازم true
select 'approve فيها حراسة الحالة' as check_item,
       (select prosrc like '%registration not approvable%' from pg_proc
        where proname = 'admin_approve_registration' and pronamespace = 'public'::regnamespace) as ok
union all
select 'reject بتطلب سبب',
       (select prosrc like '%rejection reason required%' from pg_proc
        where proname = 'admin_reject_registration' and pronamespace = 'public'::regnamespace)
union all
select 'anon مش بيقدر ينفذ admin_approve',
       not has_function_privilege('anon', 'public.admin_approve_registration(uuid, text)', 'execute')
union all
select 'anon مش بيقدر ينفذ admin_reject',
       not has_function_privilege('anon', 'public.admin_reject_registration(uuid, text, text)', 'execute');
       