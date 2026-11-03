// ============================================================
// supabase/functions/notify-telegram/index.ts
// إرسال إشعار فوري للأدمن على تليجرام عند تقديم طلب دفع جديد
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// تنظيف النصوص لتجنب أخطاء Telegram HTML Parser
function escapeTelegramHtml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

serve(async (req) => {
  // معالجة طلبات CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // استخراج بيانات الطلب سواء تم الاستدعاء من الكود أو من Database Webhook
    const record = payload.record || payload;

    const studentName = escapeTelegramHtml(record.student_name || record.full_name || "طالب جديد");
    const studentEmail = escapeTelegramHtml(record.student_email || record.email || "—");
    const studentPhone = escapeTelegramHtml(record.student_phone || record.phone || "—");
    const courseTitle = escapeTelegramHtml(record.course_title || "مادة دراسية");
    const amount = record.amount ? `${Number(record.amount).toFixed(2)} ج.م` : "—";
    const paymentMethod = record.payment_method === "vodafone_cash" ? "🔴 فودافون كاش" : "🟣 إنستاباي";
    const txRef = escapeTelegramHtml(record.tx_reference || "—");
    const orderId = escapeTelegramHtml(record.id || record.order_id || "—");

    // المتغيرات السرية المسجلة في Supabase Secrets
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (!botToken || !chatId) {
      console.warn("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured in Supabase secrets.");
      return new Response(
        JSON.stringify({
          success: false,
          simulated: true,
          message: "Telegram credentials missing in environment secrets (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const message = `
🔔 <b>طلب اشتراك جديد في أحمد مصطفى تك!</b>

👤 <b>الطالب:</b> ${studentName}
📧 <b>الإيميل:</b> ${studentEmail}
📱 <b>الموبايل:</b> ${studentPhone}
📚 <b>المادة:</b> ${courseTitle}
💳 <b>طريقة الدفع:</b> ${paymentMethod}
💰 <b>المبلغ الدقيق:</b> <code>${amount}</code>
🔢 <b>رقم العملية:</b> <code>${txRef}</code>
🆔 <b>رقم الطلب:</b> <code>${orderId}</code>

⚡ <i>افتح لوحة تحكم الأدمن لمراجعة الإيصال وتأكيد الاشتراك.</i>
    `.trim();

    const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    const telegramData = await telegramRes.json();

    return new Response(
      JSON.stringify({ success: telegramData.ok, result: telegramData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("notify-telegram error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
