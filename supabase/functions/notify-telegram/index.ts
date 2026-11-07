// ============================================================
// supabase/functions/notify-telegram/index.ts
// تنبيه تليجرام للأدمن: داخلية فقط، والبيانات من الداتابيز مش من الطلب
// kind = "registered" (تسجيل جديد) أو "receipt" (وصل إيصال، هو الافتراضي)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

let supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

let UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let COLUMNS = "id, registration_code, full_name, email, phone, amount, payment_method, proof_path, courses(title)";

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

  let claimedIds: string[] = [];
  let marker = "tg_notified_at";

  try {
    let body = await req.json();
    let ids: string[] = Array.isArray(body.registration_ids)
      ? body.registration_ids.map(function (v: unknown) { return String(v); }).filter(function (v: string) { return UUID_RE.test(v); })
      : [];
    if (ids.length === 0 || ids.length > 10) {
      return jsonResp({ ok: false, error: "invalid_ids" }, 400);
    }

    // نوع التنبيه: تسجيل جديد أو وصول إيصال
    let isRegistered = body.kind === "registered";
    marker = isRegistered ? "tg_registered_at" : "tg_notified_at";
    let neededStatus = isRegistered ? "pending_payment" : "under_review";

    // حجز ذري: كل تسجيل ينبّه مرة واحدة بس لكل نوع
    let patch: Record<string, string | null> = {};
    patch[marker] = new Date().toISOString();

    let { data: claimed, error: claimErr } = await supabase
      .from("registrations")
      .update(patch)
      .in("id", ids)
      .is(marker, null)
      .eq("payment_status", neededStatus)
      .select(COLUMNS);
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
      claimedIds.push(String(r.id));
      total += Number(r.amount || 0);
      codes.push(String(r.registration_code));
      titles.push(r.courses && r.courses.title ? String(r.courses.title) : "مادة دراسية");
    }

    let payMethod = first.payment_method === "vodafone_cash" ? "🔴 فودافون كاش" : "🟣 إنستاباي";
    let phoneDigits = String(first.phone || "").replace(/\D/g, "");

    // رابط مؤقت لصورة الإيصال (10 دقايق) من المسار المخزّن في الداتابيز
    let photoUrl: string | null = null;
    if (!isRegistered && first.proof_path) {
      let { data: signed, error: signErr } = await supabase.storage
        .from("receipts")
        .createSignedUrl(first.proof_path, 600);
      if (signErr) console.warn("signed url failed:", signErr.message);
      if (signed && signed.signedUrl) photoUrl = signed.signedUrl;
    }

    let lines: string[] = [
      isRegistered
        ? "📝 <b>تسجيل جديد في أحمد مصطفى تك</b>"
        : "🔔 <b>وصل إيصال دفع جديد!</b>",
      "",
      "👤 <b>الطالب:</b> " + esc(first.full_name),
      "📧 <b>الإيميل:</b> <code>" + esc(first.email) + "</code>",
      "📱 <b>الموبايل:</b> <code>" + esc(phoneDigits) + "</code>",
      "📚 <b>المادة:</b> " + esc(titles.join(" + ")),
      "💳 <b>طريقة الدفع:</b> " + payMethod,
      "💰 <b>المبلغ:</b> <code>" + total.toFixed(2) + " ج.م</code>",
      "🆔 <b>كود الطلب:</b> <code>" + esc(codes.join(" + ")) + "</code>",
    ];
    if (isRegistered) {
      lines.push("", "⏳ <b>الحالة:</b> في انتظار تحويل الطالب وإرسال الإيصال");
    } else if (photoUrl) {
      lines.push("", "📎 <b>تم إرفاق صورة إيصال التحويل أعلاه ☝️</b>");
    }
    let message = lines.join("\n");

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
      // التنبيه فشل: نفك الحجز للتسجيلات اللي حجزناها بس
      console.error("telegram send failed:", JSON.stringify(tgData));
      await undoClaim(claimedIds, marker);
      return jsonResp({ ok: false, error: "telegram_failed" }, 502);
    }

    return jsonResp({ ok: true });
  } catch (err) {
    console.error("notify-telegram crashed:", String(err));
    await undoClaim(claimedIds, marker);
    return jsonResp({ ok: false, error: "internal_error" }, 500);
  }
}

// فك الحجز عشان تتعمل محاولة تانية
async function undoClaim(ids: string[], marker: string): Promise<void> {
  if (ids.length === 0) return;
  let undo: Record<string, string | null> = {};
  undo[marker] = null;
  let { error } = await supabase.from("registrations").update(undo).in("id", ids);
  if (error) console.error("undo claim failed:", error.message);
}

Deno.serve(handler);