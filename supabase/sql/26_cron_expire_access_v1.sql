-- 26_cron_expire_access_v1.sql
-- جدولة فنكشن سحب الصلاحية المنتهية كل ساعة
-- مهم: ما تحطش السر الحقيقي في الملف المحفوظ في المشروع (GitHub). شغّل سطر السر يدويًا في SQL Editor

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) تخزين السر في Vault (شغّل السطر ده يدويًا بقيمة حقيقية، نفس قيمة CRON_SECRET)
-- select vault.create_secret('PUT_THE_SAME_VALUE_AS_CRON_SECRET_HERE', 'cron_secret');

-- 2) الجدولة: كل ساعة عند الدقيقة 5 (التوقيت داخل الفنكشن بالقاهرة، فمفيش مشكلة صيفي/شتوي)
select cron.schedule(
  'expire-access-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://wsoazfbpdsmspygrofjf.supabase.co/functions/v1/process-expired-access',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

