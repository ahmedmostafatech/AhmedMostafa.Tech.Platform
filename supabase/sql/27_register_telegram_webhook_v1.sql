-- 27_register_telegram_webhook_v1.sql
-- تسجيل Telegram Webhook (شغّله يدوياً مرة واحدة بعد نشر فنكشن telegram-webhook)
-- ضع رابط الفنكشن الصحيح قبل التشغيل

-- الخطوة 1: تسجيل الـ Webhook على تليجرام
-- (بدّل TOKEN بالتوكن الحقيقي والـ URL برابط الفنكشن المنشورة)

-- select net.http_post(
--   url := 'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook',
--   body := jsonb_build_object(
--     'url', 'https://wsoazfbpdsmspygrofjf.supabase.co/functions/v1/telegram-webhook',
--     'allowed_updates', array['callback_query'],
--     'secret_token', '{TELEGRAM_WEBHOOK_SECRET}'
--   ),
--   headers := '{"Content-Type":"application/json"}'::jsonb
-- );

-- الخطوة 2: التحقق من الـ Webhook الحالي
-- select net.http_get(
--   url := 'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getWebhookInfo',
--   headers := '{"Content-Type":"application/json"}'::jsonb
-- );

