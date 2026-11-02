-- ============================================================
-- 03_make_admin_v1.sql
-- ترقية حسابي لأدمن (شغّله مرة واحدة بعد أول تسجيل دخول)
-- ============================================================

update public.profiles
set is_admin = true
where email = 'ahmedmostafa15k@gmail.com';

-- تأكيد النتيجة
select id, email, full_name, is_admin from public.profiles;