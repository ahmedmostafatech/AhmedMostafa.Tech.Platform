import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async function (req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  // التحقق من السر المشترك مع تليجرام
  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
  const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token') || req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';

  if (expectedSecret && incomingSecret !== expectedSecret) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  try {
    const payload = await req.json();
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const admin = createClient(supabaseUrl, serviceKey);

    // 1. التعامل مع الضغط على الأزرار (Callback Queries)
    if (payload.callback_query) {
      const query = payload.callback_query;
      const callbackId = query.id;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;
      const data = query.data || '';

      let responseText = '';

      if (data.startsWith('approve_')) {
        const regId = data.replace('approve_', '');
        
        // استدعاء دالة القبول من الداتابيز
        const { error } = await admin.rpc('admin_approve_registration', {
          p_reg_id: regId,
          p_admin_note: 'تم القبول عبر بوت تليجرام'
        });

        if (error) {
          responseText = '❌ فشل القبول: ' + error.message;
        } else {
          responseText = '✅ تم قبول الطلب بنجاح وتفعيل الحساب!';
          
          // استدعاء دالة إرسال الإيميل
          try {
            await admin.functions.invoke('send-activation-email', {
              body: { registration_id: regId, force: true }
            });
          } catch (e) {
            console.error('Email trigger error:', e);
          }
        }
      } else if (data.startsWith('reject_')) {
        const regId = data.replace('reject_', '');
        const { error } = await admin.from('registrations').update({
          payment_status: 'rejected',
          rejection_reason: 'تم الرفض عبر تليجرام',
          updated_at: new Date().toISOString()
        }).eq('id', regId);

        if (error) {
          responseText = '❌ فشل الرفض: ' + error.message;
        } else {
          responseText = '🚫 تم رفض الطلب.';
        }
      }

      // الإجابة على التليجرام لإغلاق التحميل على الزر
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackId, text: responseText })
      });

      // تحديث الرسالة في الشات
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: query.message.text + '\n\nإجراء الأدمن: ' + responseText
        })
      });

      return jsonResponse({ ok: true });
    }

    // 2. التعامل مع الأوامر النصية (/pending, /stats, إلخ)
    if (payload.message && payload.message.text) {
      const chatId = payload.message.chat.id;
      const text = payload.message.text.trim();

      if (text === '/pending') {
        const { data: pending } = await admin
          .from('registrations')
          .select('id, registration_code, full_name, amount')
          .eq('payment_status', 'pending_payment')
          .limit(5);

        if (!pending || pending.length === 0) {
          await sendTelegramMsg(botToken, chatId, '✨ لا توجد طلبات معلقة حالياً.');
        } else {
          for (const reg of pending) {
            const msg = `📌 <b>طلب معلق:</b>\nالكود: <code>${reg.registration_code}</code>\nالاسم: ${reg.full_name}\nالمبلغ: ${reg.amount} ج.م`;
            const buttons = [
              [
                { text: '✅ قبول وتفعيل', callback_data: 'approve_' + reg.id },
                { text: '❌ رفض', callback_data: 'reject_' + reg.id }
              ]
            ];
            await sendTelegramMsg(botToken, chatId, msg, buttons);
          }
        }
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('telegram-webhook crashed:', err);
    return jsonResponse({ ok: false, error: String(err) }, 500);
  }
});

async function sendTelegramMsg(token: string, chatId: number, text: string, buttons?: any[][]) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined
    })
  });
}