// ============================================================
// supabase/functions/notify-telegram/index.ts
// تنبيه تليجرام للأدمن: داخلية فقط، والبيانات من الداتابيز مش من الطلب
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

let UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResp({ ok: false, error: "method_not_allowed" }, 405);

  // الدالة داخلية: لازم السر الداخلي
  let internal = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
  let incoming = req.headers.get("x-internal-secret") || "";
  if (!internal || incoming !== internal) {
    console.warn("notify-telegram: unauthorized call");
    return jsonResp({ ok: false, error: "unauthorized" }, 401);
  }

  let botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  let chatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";
  if (!botToken || !chatId) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return jsonResp({ ok: false, error: "not_configured" }, 500);
  }

  try {
    let body = await req.json();
    let ids: string[] = Array.isArray(body.registration_ids)
      ? body.registration_ids.map(function (v: unknown) { return String(v); }).filter(function (v: string) { return UUID_RE.test(v); })
      : [];
    if (ids.length === 0 || ids.length > 10) {
      return jsonResp({ ok: false, error: "invalid_ids" }, 400);
    }

    // حجز ذري: كل تسجيل ينبّه مرة واحدة بس
    let { data: claimed, error: claimErr } = await supabase
      .from("registrations")
      .update({ tg_notified_at: new Date().toISOString() })
      .in("id", ids)
      .is("tg_notified_at", null)
      .eq("payment_status", "under_review")
      .select("id, registration_code, full_name, email, phone, amount, payment_method, proof_path, courses(title)");
    if (claimErr) {
      console.error("claim failed:", claimErr.message);
      return jsonResp({ ok: false, error: "claim_failed" }, 500);
    }
    if (!claimed || claimed.length === 0) {
      return jsonResp({ ok: true, skipped: true });
    }

    let first: any = claimed[0];
    let total = 0;
    let codes: string[] = [];
    let titles: string[] = [];
    for (let i = 0; i < claimed.length; i++) {
      let r: any = claimed[i];
      total += Number(r.amount || 0);
      codes.push(String(r.registration_code));
      titles.push(r.courses && r.courses.title ? String(r.courses.title) : "مادة دراسية");
    }

    let payMethod = first.payment_method === "vodafone_cash" ? "🔴 فودافون كاش" : "🟣 إنستاباي";
    let phoneDigits = String(first.phone || "").replace(/\D/g, "");

    // رابط مؤقت لصورة الإيصال (10 دقايق) من المسار المخزّن في الداتابيز
    let photoUrl: string | null = null;
    if (first.proof_path) {
      let { data: signed, error: signErr } = await supabase.storage
        .from("receipts")
        .createSignedUrl(first.proof_path, 600);
      if (signErr) console.warn("signed url failed:", signErr.message);
      if (signed && signed.signedUrl) photoUrl = signed.signedUrl;
    }

    let message = [
      "🔔 <b>طلب اشتراك جديد في أحمد مصطفى تك!</b>",
      "",
      "👤 <b>الطالب:</b> " + esc(first.full_name),
      "📧 <b>الإيميل:</b> <code>" + esc(first.email) + "</code>",
      "📱 <b>الموبايل:</b> <code>" + esc(phoneDigits) + "</code>",
      "📚 <b>المادة:</b> " + esc(titles.join(" + ")),
      "💳 <b>طريقة الدفع:</b> " + payMethod,
      "💰 <b>المبلغ:</b> <code>" + total.toFixed(2) + " ج.م</code>",
      "🆔 <b>كود الطلب:</b> <code>" + esc(codes.join(" + ")) + "</code>",
      photoUrl ? "\n📎 <b>تم إرفاق صورة إيصال التحويل أعلاه ☝️</b>" : "",
    ].join("\n").trim();

    // صف أزرار لكل تسجيل (عشان قبول مادتين مايبقاش لأول واحدة بس)
    let keyboard: any[][] = [];
    for (let i = 0; i < claimed.length; i++) {
      let r: any = claimed[i];
      let single = claimed.length === 1;
      keyboard.push([
        { text: single ? "✅ قبول وتأكيد الدفع" : "✅ قبول " + r.registration_code, callback_data: "approve_" + r.id },
        { text: single ? "❌ رفض الطلب" : "❌ رفض " + r.registration_code, callback_data: "reject_" + r.id },
      ]);
      if (single) {
        keyboard.push([{ text: "🔍 وضع قيد الفحص", callback_data: "review_" + r.id }]);
      }
    }
    if (phoneDigits.length >= 10) {
      keyboard.push([{ text: "💬 فتح واتساب الطالب", url: "https://wa.me/" + phoneDigits.replace(/^0/, "20") }]);
    }

    let endpoint = photoUrl ? "sendPhoto" : "sendMessage";
    let tgBody: any = {
      chat_id: chatId,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    };
    if (photoUrl) {
      tgBody.photo = photoUrl;
      tgBody.caption = message;
    } else {
      tgBody.text = message;
      tgBody.disable_web_page_preview = true;
    }

    let tgRes = await fetch("https://api.telegram.org/bot" + botToken + "/" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tgBody),
    });
    let tgData = await tgRes.json();

    if (!tgData.ok) {
      // التنبيه فشل: نفك الحجز عشان تتعمل محاولة تانية
      console.error("telegram send failed:", JSON.stringify(tgData));
      await supabase.from("registrations").update({ tg_notified_at: null }).in("id", ids);
      return jsonResp({ ok: false, error: "telegram_failed" }, 502);
    }

    return jsonResp({ ok: true });
  } catch (err) {
    console.error("notify-telegram crashed:", String(err));
    return jsonResp({ ok: false, error: "internal_error" }, 500);
  }
}

Deno.serve(handler);