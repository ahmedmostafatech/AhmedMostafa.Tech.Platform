-- ============================================================
-- 29_cron_daily_summary_v1.sql
-- جدولة إرسال التقرير اليومي إلى تليجرام الساعة 9:00 مساءً بتوقيت القاهرة
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- جدولة المهمة يومياً الساعة 19:00 بتوقيت UTC (الساعة 9:00 مساءً بتوقيت القاهرة)
select cron.schedule(
  'daily-telegram-summary-9pm',
  '0 19 * * *',
  $$
  select net.http_post(
    url := 'https://wsoazfbpdsmspygrofjf.supabase.co/functions/v1/daily-summary',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

