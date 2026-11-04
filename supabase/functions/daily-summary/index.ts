// ============================================================
// supabase/functions/daily-summary/index.ts
// إرسال ملخص يومي تلقائي إلى تليجرام الساعة 9:00 مساءً بتوقيت القاهرة
// يتم تشغيلها بواسطة Supabase pg_cron
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!botToken || !chatId) {
      return jsonResp({ ok: false, error: "Telegram bot token or chat ID not configured" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let { data: stats, error: statsError } = await admin.rpc("telegram_get_stats_today");
    if (statsError) {
      console.error("Failed to get stats:", statsError.message);
    }

    let s = stats || { total_today: 0, paid_today: 0, pending_today: 0, revenue_today: 0, total_pending: 0 };
    let dateCairo = new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "full" }).format(new Date());

    let message = `
🌙 <b>ملخص منصة أحمد مصطفى تك — الساعة 9:00 مساءً</b>
📅 <i>${dateCairo}</i>

📈 <b>تسجيلات اليوم:</b> ${s.total_today} طالب
✅ <b>المؤكد والمدفوع:</b> ${s.paid_today} اشتراك
💰 <b>إيرادات اليوم:</b> <b>${Number(s.revenue_today).toFixed(2)} ج.م</b>
⏳ <b>المعلق اليوم:</b> ${s.pending_today} طلب
⚠️ <b>إجمالي الطلبات المعلقة:</b> ${s.total_pending} طلب

${s.total_pending > 0 ? "⚡ <i>اكتب /pending لرؤية الطلبات المعلقة واتخاذ القرار مباشرة.</i>" : "✨ <i>كل الطلبات مؤكدة بنجاح، أحسنت!</i>"}
`.trim();

    let res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    let tgData = await res.json();
    return jsonResp({ ok: tgData.ok, result: tgData });

  } catch (err) {
    console.error("daily-summary error:", err);
    return jsonResp({ ok: false, error: (err as Error).message }, 500);
  }
});

