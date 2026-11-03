-- ============================================================
-- 09_fix_create_order_v1.sql
-- توحيد اسم بارامتر create_order مع كود الواجهة (p_payment_method)
-- ============================================================

-- لازم نحذف الدالة القديمة لأن Postgres ما بيسمحش بتغيير اسم بارامتر بـ create or replace
drop function if exists public.create_order(uuid, text);

create or replace function public.create_order(p_course_id uuid, p_payment_method text)
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
  if p_payment_method not in ('vodafone_cash','instapay') then
    raise exception 'invalid payment method';
  end if;

  -- اختياري: اشترط اكتمال بيانات الطالب (الاسم والموبايل) قبل الشراء
  -- شيل علامة -- من الأسطر التالية بعد ما تتأكد إن التسجيل بيحفظ الموبايل
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
    update public.orders set payment_method = p_payment_method
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
              v_course.price_egp + v_cents / 100.0, p_payment_method)
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

revoke execute on function public.create_order(uuid, text) from public, anon;
grant execute on function public.create_order(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- فحص: المفروض يظهر p_course_id uuid, p_payment_method text
select pg_get_function_arguments(p.oid) as create_order_args
from pg_proc p
where p.proname = 'create_order' and p.pronamespace = 'public'::regnamespace;