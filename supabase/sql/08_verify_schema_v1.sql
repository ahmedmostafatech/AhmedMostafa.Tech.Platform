-- 08_verify_schema_v2.sql
-- فحص إن الجداول والأعمدة والدوال والأمان اتعملت صح
-- كل الصفوف لازم تطلع ok = true

with expected_columns(tbl, col) as (
  values
    ('profiles','full_name'), ('profiles','phone'),
    ('profiles','profile_complete'), ('profiles','is_admin'),
    ('courses','price_egp'), ('courses','access_until'), ('courses','is_published'),
    ('modules','course_id'), ('modules','sort_order'),
    ('videos','course_id'), ('videos','module_id'), ('videos','is_free'),
    ('video_sources','video_id'), ('video_sources','youtube_id'),
    ('orders','unique_amount'), ('orders','amount'), ('orders','payment_method'),
    ('orders','tx_reference'), ('orders','proof_path'),
    ('orders','status'), ('orders','expires_at'),
    ('subscriptions','user_id'), ('subscriptions','course_id'),
    ('subscriptions','ends_at'), ('subscriptions','status'),
    ('subscriptions','created_at')
),
expected_functions(fn) as (
  values
    ('update_my_profile'), ('create_order'), ('submit_payment'),
    ('approve_order'), ('reject_order'),
    ('is_admin'), ('has_access'), ('normalize_eg_phone')
),
expected_tables(tbl) as (
  values
    ('profiles'), ('courses'), ('modules'), ('videos'),
    ('video_sources'), ('orders'), ('subscriptions')
)

-- 1) الأعمدة
select 'column: ' || e.tbl || '.' || e.col as check_name,
       exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public'
           and c.table_name = e.tbl and c.column_name = e.col
       ) as ok
from expected_columns e

union all
-- 2) الدوال
select 'function: ' || f.fn,
       exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = f.fn
       )
from expected_functions f

union all
-- 3) تفعيل RLS على كل الجداول
select 'rls enabled: ' || t.tbl,
       coalesce((
         select c.relrowsecurity from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = t.tbl
       ), false)
from expected_tables t

union all
-- 4) قيد صيغة الموبايل
select 'constraint: profiles_phone_format_chk',
       exists (
         select 1 from pg_constraint
         where conname = 'profiles_phone_format_chk'
       )

union all
-- 5) tx_reference فريد
select 'unique index on orders.tx_reference',
       exists (
         select 1 from pg_indexes
         where schemaname = 'public' and tablename = 'orders'
           and indexdef ilike '%unique%' and indexdef ilike '%tx_reference%'
       )
       or exists (
         select 1 from pg_constraint
         where conrelid = 'public.orders'::regclass
           and contype = 'u'
           and pg_get_constraintdef(oid) ilike '%tx_reference%'
       )

union all
-- 6) trigger إنشاء profile عند التسجيل
select 'trigger on auth.users (profile creation)',
       exists (
         select 1 from pg_trigger
         where tgrelid = 'auth.users'::regclass and not tgisinternal
       )

union all
-- 7) الـ buckets الخاصة
select 'bucket private: ' || b,
       exists (
         select 1 from storage.buckets
         where id = b and public = false
       )
from (values ('payment-proofs'), ('payment-receipts')) as x(b)

order by 2, 1;