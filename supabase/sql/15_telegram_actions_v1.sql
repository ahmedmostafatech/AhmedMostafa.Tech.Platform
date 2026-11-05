-- ============================================================
-- 15_telegram_actions_v1.sql
-- إنشاء دالة لتنفيذ إجراءات تليجرام بصلاحيات service_role فقط
-- ============================================================

create or replace function public.telegram_apply_action(
  p_reg_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reg record;
  v_course record;
begin
  -- 1. فحص وجود التسجيل وقفل السطر للتعديل
  select * into v_reg
  from public.registrations
  where id = p_reg_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  -- 2. إجراء الوضع قيد الفحص (review)
  if p_action = 'review' then
    if v_reg.payment_status = 'under_review' then
      return jsonb_build_object('result', 'already');
    end if;

    update public.registrations
    set payment_status = 'under_review',
        updated_at     = now()
    where id = p_reg_id;

    return jsonb_build_object('result', 'done');
  end if;

  -- 3. إجراء القبول والتأكيد (approve)
  if p_action = 'approve' then
    if v_reg.payment_status = 'paid' then
      return jsonb_build_object('result', 'already');
    end if;

    -- التثبت من وجود رابط الوصول للمادة
    select access_link into v_course
    from public.courses
    where id = v_reg.course_id;

    if v_course.access_link is null or trim(v_course.access_link) = '' then
      return jsonb_build_object('result', 'no_access_link');
    end if;

    update public.registrations
    set payment_status = 'paid',
        approved_at    = coalesce(approved_at, now()),
        updated_at     = now()
    where id = p_reg_id;

    return jsonb_build_object('result', 'done');
  end if;

  -- 4. إجراء الرفض (reject)
  if p_action = 'reject' then
    if v_reg.payment_status = 'rejected' then
      return jsonb_build_object('result', 'already');
    end if;

    update public.registrations
    set payment_status   = 'rejected',
        rejection_reason = coalesce(p_reason, 'تم الرفض عبر تليجرام'),
        updated_at       = now()
    where id = p_reg_id;

    return jsonb_build_object('result', 'done');
  end if;

  return jsonb_build_object('result', 'not_allowed');
end;
$function$;

-- إعطاء الصلاحية لـ service_role وسحبها من العامة
revoke all on function public.telegram_apply_action(uuid, text, text) from public, anon, authenticated;
grant execute on function public.telegram_apply_action(uuid, text, text) to service_role;

notify pgrst, 'reload schema';