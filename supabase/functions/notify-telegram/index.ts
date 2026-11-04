// ============================================================
// supabase/functions/notify-telegram/index.ts
// إرسال إشعار فوري للأدمن على تليجرام عند تقديم طلب دفع جديد
// مع أزرار Inline وصورة الإيصال (sendPhoto) إن وجدت
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function esc(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const payload = await req.json();
    const record = payload.record || payload;

    const studentName = esc(record.student_name || record.full_name || "طالب جديد");
    const studentEmail = esc(record.student_email || record.email || "—");
    const studentPhone = String(record.student_phone || record.phone || "—").replace(/\D/g, "");
    const courseTitle = esc(record.course_title || record.title || "مادة دراسية");
    const amount = record.amount ? `${Number(record.amount).toFixed(2)} ج.م` : "—";
    const payMethod = record.payment_method === "vodafone_cash" ? "🔴 فودافون كاش" : "🟣 إنستاباي";
    const txRef = esc(record.tx_reference || "—");
    const regId = String(record.registration_id || record.id || "");
    const regCode = esc(record.registration_code || record.code || "—");

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!botToken || !chatId) {
      console.warn("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
      return jsonResp({ success: false, simulated: true, message: "Telegram not configured." });
    }

    let receiptUrl: string | null = record.receipt_url || null;
    const proofPath: string | null = record.proof_path || null;

    if (!receiptUrl && proofPath && supabaseUrl && serviceKey) {
      try {
        const supabase = createClient(supabaseUrl, serviceKey);
        const { data: signedData } = await supabase.storage
          .from("receipts")
          .createSignedUrl(proofPath, 60 * 60 * 24 * 7);

        if (signedData?.signedUrl) {
          receiptUrl = signedData.signedUrl;
        } else {
          const { data: pubData } = supabase.storage
            .from("receipts")
            .getPublicUrl(proofPath);
          if (pubData?.publicUrl) receiptUrl = pubData.publicUrl;
        }
      } catch (err) {
        console.warn("Could not generate signed url for proof_path:", err);
      }
    }

    const message = `
🔔 <b>طلب اشتراك جديد في أحمد مصطفى تك!</b>

👤 <b>الطالب:</b> ${studentName}
📧 <b>الإيميل:</b> <code>${studentEmail}</code>
📱 <b>الموبايل:</b> <code>${studentPhone}</code>
📚 <b>المادة:</b> ${courseTitle}
💳 <b>طريقة الدفع:</b> ${payMethod}
💰 <b>المبلغ:</b> <code>${amount}</code>
🔢 <b>رقم العملية:</b> <code>${txRef}</code>
🆔 <b>كود الطلب:</b> <code>${regCode}</code>
${receiptUrl ? "\n📎 <b>تم إرفاق صورة إيصال التحويل أعلاه ☝️</b>" : ""}
`.trim();

    const inlineKeyboard: any = {
      inline_keyboard: []
    };

    if (regId) {
      inlineKeyboard.inline_keyboard.push([
        { text: "✅ قبول وتأكيد الدفع", callback_data: `approve_${regId}` },
        { text: "❌ رفض الطلب", callback_data: `reject_${regId}` },
      ]);
      inlineKeyboard.inline_keyboard.push([
        { text: "🔍 وضع قيد الفحص", callback_data: `review_${regId}` },
      ]);
    }

    if (studentPhone && studentPhone.length >= 10) {
      const waPhone = studentPhone.startsWith("2") ? studentPhone : "2" + studentPhone.replace(/^0/, "");
      inlineKeyboard.inline_keyboard.push([
        { text: "💬 فتح واتساب الطالب", url: `https://wa.me/${waPhone}` },
      ]);
    }

    let endpoint = "sendMessage";
    let bodyData: any = {
      chat_id: chatId,
      parse_mode: "HTML",
      reply_markup: inlineKeyboard,
    };

    if (receiptUrl) {
      endpoint = "sendPhoto";
      bodyData.photo = receiptUrl;
      bodyData.caption = message;
    } else {
      bodyData.text = message;
      bodyData.disable_web_page_preview = true;
    }

    const telegramRes = await fetch(
      `https://api.telegram.org/bot${botToken}/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      }
    );

    const tgData = await telegramRes.json();
    return jsonResp({ success: tgData.ok, result: tgData });

  } catch (err) {
    console.error("notify-telegram error:", err);
    return jsonResp({ success: false, error: (err as Error).message }, 500);
  }
});