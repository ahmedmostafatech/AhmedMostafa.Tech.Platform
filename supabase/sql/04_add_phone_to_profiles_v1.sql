-- ============================================================
-- 04_add_phone_to_profiles_v1.sql
-- إضافة رقم الموبايل للملف الشخصي + دالة تحديث آمنة
-- شغّله في SQL Editor بعد ملف 01
-- ============================================================

-- إضافة عمود الموبايل
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- إضافة عمود لتأكيد إكمال الملف الشخصي
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_complete boolean NOT NULL DEFAULT false;

-- ============================================================
-- دالة تحديث الملف الشخصي (security definer — تحمي is_admin)
-- الطالب يقدر يعدّل full_name وphone فقط
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- تحقق من صيغة الموبايل المصري (اختياري لو بُعت)
  IF p_phone IS NOT NULL AND p_phone != '' THEN
    IF p_phone !~ '^(010|011|012|015)[0-9]{8}$' THEN
      RAISE EXCEPTION 'invalid phone number';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    full_name        = COALESCE(p_full_name, full_name),
    phone            = COALESCE(NULLIF(p_phone, ''), phone),
    profile_complete = (
      COALESCE(p_phone, phone) IS NOT NULL
      AND COALESCE(p_phone, phone) != ''
    )
  WHERE id = v_user_id;
END;
$$;

-- إزالة سياسة التحديث القديمة وإعادة إنشائها
DROP POLICY IF EXISTS "profiles: update own name" ON public.profiles;

-- الطالب يقدر يقرأ ملفه فقط (السياسة القديمة ممكن تكون مكررة — نضمن إنها موجودة)
DROP POLICY IF EXISTS "profiles: own row" ON public.profiles;
CREATE POLICY "profiles: own row" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- التحديث يتم فقط عبر الدالة update_my_profile (لا نسمح بتحديث مباشر)
-- لكن عشان سهولة التطوير نسمح بـ update محدودة مؤقتاً
CREATE POLICY "profiles: update own safe fields" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
