-- ============================================================
-- 09b_create_order_require_profile_v1.sql
-- إلزامي: اشتراط اكتمال الملف الشخصي للطالب (الاسم ورقم الموبايل)
-- في قاعدة البيانات مباشرة قبل إنشاء أي طلب شراء في create_order
-- ============================================================

-- حذف الدالة القديمة لتفادي تعارض أنواع البارامترات السابقة
drop function if exists public.create_order(uuid, text);

create or replace function public.create_order(
  p_course_id      uuid,
  p_payment_method text
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_price         int;
  v_cents         int;
  v_unique_amount numeric(10,2);
  v_order_id      uuid;
  v_attempt       int := 0;
begin
  -- 1. التأكد من تسجيل الدخول
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- 2. التحقق من وسيلة الدفع (text check)
  if p_payment_method not in ('vodafone_cash', 'instapay') then
    raise exception 'invalid payment method';
  end if;

  -- 3. التحقق الصارم من اكتمال الملف الشخصي (الاسم ورقم الهاتف)
  if not exists (
    select 1 from public.profiles
    where id = v_user_id
      and profile_complete = true
      and phone is not null
      and length(trim(phone)) >= 10
  ) then
    raise exception 'profile incomplete';
  end if;

  -- 4. التحقق من وجود المادة وأنها منشورة وجلب السعر بالجنيه
  select price_egp into v_price
  from public.courses
  where id = p_course_id and is_published = true;

  if not found then
    raise exception 'course not found';
  end if;

  -- 5. التحقق من سريان فترة إتاحة المادة
  if not exists (
    select 1 from public.courses
    where id = p_course_id and access_until >= current_date
  ) then
    raise exception 'course access period ended';
  end if;

  -- 6. التحقق من عدم وجود اشتراك سارٍ بالفعل
  if exists (
    select 1 from public.subscriptions
    where user_id = v_user_id
      and course_id = p_course_id
      and ends_at > now()
  ) then
    raise exception 'already subscribed';
  end if;

  -- 7. فحص وجود طلب معلق وسارٍ لنفس المادة للمستخدم لإعادة استخدامه وتحديث وسيلة الدفع
  select id, amount into v_order_id, v_unique_amount
  from public.orders
  where user_id = v_user_id
    and course_id = p_course_id
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    update public.orders
    set payment_method = p_payment_method,
        updated_at = now()
    where id = v_order_id;

    return json_build_object(
      'id', v_order_id,
      'order_id', v_order_id,
      'amount', v_unique_amount,
      'payment_method', p_payment_method
    );
  end if;

  -- 8. توليد مبلغ فريد بإضافة قروش عشوائية (1 إلى 99 قرشاً)
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

  -- 9. إنشاء الطلب بمهلة 60 دقيقة
  insert into public.orders (user_id, course_id, amount, payment_method, expires_at)
  values (v_user_id, p_course_id, v_unique_amount, p_payment_method, now() + interval '1 hour')
  returning id into v_order_id;

  return json_build_object(
    'id', v_order_id,
    'order_id', v_order_id,
    'amount', v_unique_amount,
    'payment_method', p_payment_method
  );
end;
$$;

-- إعادة تحميل كاش PostgREST لتحديث المخطط فوراً
notify pgrst, 'reload schema';
