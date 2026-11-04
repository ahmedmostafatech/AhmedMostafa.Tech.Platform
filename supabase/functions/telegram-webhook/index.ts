// ============================================================
// supabase/functions/telegram-webhook/index.ts
// يستقبل أوامر تليجرام وضغطات الأزرار من الأدمن
// الأوامر المدعومة: /start, /help, /pending, /stats, /find, /unpaid, /summary
// الأزرار المدعومة: approve, reject, review, del
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

// طلب Telegram API
async function tgApi(botToken: string, method: string, body: unknown) {
  let res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// إرسال رسالة تليجرام
async function sendMsg(botToken: string, chatId: string | number, text: string, replyMarkup?: any) {
  return tgApi(botToken, "sendMessage", {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

// إرسال إيميل التفعيل وإضافة صلاحية جوجل درايف عبر Apps Script
async function sendEmailViaScript(scriptUrl: string, secret: string, reg: any, course: any) {
  let studentName = reg.full_name || "طالبنا العزيز";
  let courseTitle = course.title || "المادة الدراسية";
  let accessLink = course.access_link || "https://drive.google.com";
  let accessUntil = course.access_until || "نهاية الامتحانات";
  let regCode = reg.registration_code || "";

  let htmlBody = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><style>
body{font-family:Tahoma,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#1e293b;direction:rtl;text-align:right}
.container{max-width:580px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.05)}
.header{background:linear-gradient(135deg,#071022,#365aa2);padding:28px 24px;text-align:center;color:#fff}
.content{padding:28px}
.box{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:16px;margin:18px 0}
.cta{display:inline-block;background:#365aa2;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:99px;font-weight:700;font-size:15px;margin-top:16px}
.footer{text-align:center;padding:16px;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9}
</style></head>
<body>
<div class="container">
  <div class="header">
    <h2 style="margin:0;font-size:22px;">أحمد مصطفى تك</h2>
    <p style="margin:4px 0 0;opacity:.85;font-size:13px;">تأكيد الاشتراك وتفعيل صلاحية المراجعة</p>
  </div>
  <div class="content">
    <p style="font-size:16px;">أهلاً بك يا <strong>${studentName}</strong> 👋</p>
    <p style="color:#475569;">تم تأكيد اشتراكك في <strong>${courseTitle}</strong> وتمت إضافة بريدك كصلاحية مشاهدة على مجلد Google Drive.</p>
    <div class="box">
      <div style="margin-bottom:8px"><strong>كود التسجيل:</strong> ${regCode}</div>
      <div style="margin-bottom:8px"><strong>المراجعة:</strong> ${courseTitle}</div>
      <div style="margin-bottom:8px"><strong>فترة الإتاحة:</strong> حتى ${accessUntil}</div>
      <div><strong>رابط المحتوى:</strong><br>
        <a href="${accessLink}" style="color:#365aa2;font-weight:700;word-break:break-all;">${accessLink}</a>
      </div>
    </div>
    <div style="text-align:center">
      <a href="${accessLink}" class="cta">فتح مجلد المراجعة 🚀</a>
    </div>
    <p style="font-size:13px;color:#64748b;margin-top:20px;">للتواصل والدعم على واتساب: <strong>01066843568</strong></p>
  </div>
  <div class="footer">Ahmed Mostafa Tech &copy; 2026. دوام التوفيق والامتياز.</div>
</div>
</body></html>`;

  let controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), 40000);

  try {
    let res = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret,
        to: reg.email,
        folder_link: accessLink,
        subject: `تم تأكيد اشتراكك في ${courseTitle} — Ahmed Mostafa Tech`,
        html: htmlBody,
        text: `أهلاً ${studentName}، تم تأكيد اشتراكك في ${courseTitle}. رابط المراجعة: ${accessLink}`,
      }),
      redirect: "follow",
      signal: controller.signal,
    });

    let raw = await res.text();
    try {
      let parsed = JSON.parse(raw);
      return { ok: parsed.ok === true, granted: parsed.granted === true, error: parsed.error || null };
    } catch {
      return { ok: false, granted: false, error: "unexpected gateway response" };
    }
  } catch (err) {
    return { ok: false, granted: false, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const expectedChatId = Deno.env.get("TELEGRAM_CHAT_ID") || "";
    const scriptUrl = Deno.env.get("APPS_SCRIPT_URL") || "https://script.google.com/macros/s/AKfycbxTpFzucBXi_wH8ze_HW4x-Fl6edYFodM4ZbIuM9MEw6wFXl1jf3jQwJjoQ_1wHUebCfg/exec";
    const scriptSec = Deno.env.get("APPS_SCRIPT_SECRET") || "MySuperSecretKey_2026_AhmedTech_99";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!botToken) {
      return jsonResp({ ok: false, error: "TELEGRAM_BOT_TOKEN not configured" }, 500);
    }

    // التحقق المرن من السر (case-insensitive header)
    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
    if (webhookSecret) {
      let incomingSecret =
        req.headers.get("x-telegram-bot-api-secret-token") ||
        req.headers.get("X-Telegram-Bot-Api-Secret-Token") ||
        "";
      if (incomingSecret && incomingSecret !== webhookSecret) {
        console.warn("Webhook secret mismatch");
        return jsonResp({ ok: false, error: "unauthorized" }, 403);
      }
    }

    const update = await req.json();
    const admin = createClient(supabaseUrl, serviceKey);

    // ========================================================
    // 1. معالجة الضغط على أزرار التليجرام (Callback Queries)
    // ========================================================
    if (update.callback_query) {
      const cb = update.callback_query;
      const callbackData: string = cb.data || "";
      const msgChatId = cb.message?.chat?.id;
      const msgId = cb.message?.message_id;
      const callerName = esc(cb.from?.first_name || "الأدمن");

      // التحقق من صلاحية الشات (الأدمن فقط)
      if (expectedChatId && String(msgChatId) !== String(expectedChatId)) {
        await tgApi(botToken, "answerCallbackQuery", {
          callback_query_id: cb.id,
          text: "⛔ غير مصرح. هذه الأوامر مخصصة للأدمن فقط.",
          show_alert: true,
        });
        return jsonResp({ ok: false });
      }

      const colonIdx = callbackData.indexOf(":");
      if (colonIdx === -1) {
        await tgApi(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "بيانات غير صالحة." });
        return jsonResp({ ok: false });
      }

      const action = callbackData.slice(0, colonIdx);
      const regId = callbackData.slice(colonIdx + 1);

      // جلب بيانات الطلب
      const { data: reg } = await admin
        .from("registrations")
        .select("id, registration_code, full_name, email, phone, amount, payment_status, email_sent, access_status, course_id, receipt_url")
        .eq("id", regId)
        .maybeSingle();

      if (!reg) {
        await tgApi(botToken, "answerCallbackQuery", {
          callback_query_id: cb.id,
          text: "لم يتم العثور على هذا الطلب في قاعدة البيانات.",
          show_alert: true,
        });
        return jsonResp({ ok: false });
      }

      const { data: course } = await admin
        .from("courses")
        .select("title, access_link, access_until")
        .eq("id", reg.course_id)
        .maybeSingle();

      // --- قيد الفحص (review) ---
      if (action === "review") {
        if (reg.payment_status === "paid") {
          await tgApi(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "الطلب مؤكد بالفعل." });
          return jsonResp({ ok: true });
        }
        await admin.from("registrations").update({
          payment_status: "under_review",
          updated_at: new Date().toISOString()
        }).eq("id", regId);

        await tgApi(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "🔍 تم نقل الطلب إلى (قيد الفحص)." });
        
        let newText = (cb.message.text || cb.message.caption || "") + `\n\n🔍 <b>قيد الفحص</b> — بواسطة ${callerName}`;
        if (cb.message.photo) {
          await tgApi(botToken, "editMessageCaption", { chat_id: msgChatId, message_id: msgId, caption: newText, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
        } else {
          await tgApi(botToken, "editMessageText", { chat_id: msgChatId, message_id: msgId, text: newText, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
        }
        return jsonResp({ ok: true });
      }

      // --- رفض الطلب (reject) ---
      if (action === "reject") {
        if (reg.payment_status === "paid") {
          await tgApi(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "الطلب مؤكد بالفعل ولا يمكن رفضه من تليجرام." });
          return jsonResp({ ok: true });
        }
        await admin.from("registrations").update({
          payment_status: "rejected",
          rejection_reason: `تم الرفض بواسطة الأدمن عبر تليجرام (${callerName})`,
          updated_at: new Date().toISOString()
        }).eq("id", regId);

        await tgApi(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "❌ تم رفض الطلب." });
        
        let newText = (cb.message.text || cb.message.caption || "") + `\n\n❌ <b>مرفوض</b> — رفضه ${callerName}`;
        if (cb.message.photo) {
          await tgApi(botToken, "editMessageCaption", { chat_id: msgChatId, message_id: msgId, caption: newText, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
        } else {
          await tgApi(botToken, "editMessageText", { chat_id: msgChatId, message_id: msgId, text: newText, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } });
        }
        return jsonResp({ ok: true });
      }

      // --- قبول الطلب وتفعيل الاشتراك (approve) ---
      if (action === "approve") {
        if (reg.payment_status === "paid") {
          await tgApi(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "الطلب مؤكد بالفعل مسبقاً." });
          return jsonResp({ ok: true });
        }

        // 1. تحديث الداتابيز
        let { error: approveErr } = await admin.from("registrations").update({
          payment_status: "paid",
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", regId);

        if (approveErr) {
          await tgApi(botToken, "answerCallbackQuery", {
            callback_query_id: cb.id,
            text: "حدث خطأ أثناء التأكيد: " + approveErr.message,
            show_alert: true
          });
          return jsonResp({ ok: false });
        }

        await tgApi(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "✅ تم التأكيد! جاري إرسال الإيميل..." });

        // 2. إرسال الإيميل وصلاحية Drive
        let emailResult = { ok: false, granted: false, error: "not attempted" };
        let nowIso = new Date().toISOString();

        if (course && course.access_link && scriptUrl && scriptSec) {
          emailResult = await sendEmailViaScript(scriptUrl, scriptSec, reg, course);
        } else {
          emailResult.error = course?.access_link ? "script not configured" : "access link not set";
        }

        let updateData: any = { updated_at: nowIso };
        if (emailResult.ok) {
          updateData.email_sent = true;
          updateData.access_status = "granted";
          updateData.access_granted_at = nowIso;
          updateData.access_error = null;
        } else {
          updateData.email_sent = false;
          updateData.access_error = String(emailResult.error || "").slice(0, 300);
        }
        await admin.from("registrations").update(updateData).eq("id", regId);

        await admin.from("email_logs").insert({
          registration_id: regId,
          recipient_email: reg.email,
          email_type: "activation",
          status: emailResult.ok ? "sent" : "failed",
          error_message: emailResult.ok ? null : String(emailResult.error || "").slice(0, 300),
        });

        let statusLine = emailResult.ok
          ? `✅ <b>مؤكد وتم تفعيل الوصول وإرسال الإيميل</b> (${callerName})`
          : `✅ <b>مؤكد في الداتابيز / لكن فشل الإيميل</b> (${callerName})\n⚠️ السبب: <code>${esc(String(emailResult.error || ""))}</code>`;

        let waBtn = reg.phone
          ? [[{ text: "💬 واتساب الطالب", url: `https://wa.me/${String(reg.phone).replace(/\D/g, "").replace(/^0/, "2")}` }]]
          : [];

        let newText = (cb.message.text || cb.message.caption || "") + "\n\n" + statusLine;
        if (cb.message.photo) {
          await tgApi(botToken, "editMessageCaption", { chat_id: msgChatId, message_id: msgId, caption: newText, parse_mode: "HTML", reply_markup: { inline_keyboard: waBtn } });
        } else {
          await tgApi(botToken, "editMessageText", { chat_id: msgChatId, message_id: msgId, text: newText, parse_mode: "HTML", reply_markup: { inline_keyboard: waBtn } });
        }

        return jsonResp({ ok: true, approved: true });
      }

      await tgApi(botToken, "answerCallbackQuery", { callback_query_id: cb.id, text: "أمر غير معروف." });
      return jsonResp({ ok: false });
    }

    // ========================================================
    // 2. معالجة الرسائل والأوامر النصية من الأدمن في تليجرام
    // ========================================================
    if (update.message && update.message.text) {
      const msg = update.message;
      const text = msg.text.trim();
      const chatId = msg.chat.id;

      if (expectedChatId && String(chatId) !== String(expectedChatId)) {
        await sendMsg(botToken, chatId, "⛔ هذا البوت مخصص لإدارة منصة أحمد مصطفى تك فقط.");
        return jsonResp({ ok: false });
      }

      // --- أمر /start أو /help ---
      if (text.startsWith("/start") || text.startsWith("/help")) {
        let helpText = `
👋 <b>أهلاً بك يا باشمهندس أحمد في بوت المنصة!</b>

إليك الأوامر المتاحة لإدارة الاشتراكات والطلبات:
• 📋 <b>/pending</b> : عرض الطلبات المعلقة مع أزرار للقبول/الرفض فوراً.
• 📊 <b>/stats</b> : إحصائيات سريعة عن تسجيلات وأرباح اليوم.
• 🔍 <b>/find [رقم أو كود أو اسم]</b> : البحث عن طالب واتخاذ إجراء.
• ⏳ <b>/unpaid</b> : قائمة الطلاب المعلقين منذ أكثر من 24 ساعة للتذكير على واتساب.
• 📈 <b>/summary</b> : تقرير اليوم الشامل فوراً.
`.trim();
        await sendMsg(botToken, chatId, helpText);
        return jsonResp({ ok: true });
      }

      // --- أمر /stats ---
      if (text.startsWith("/stats")) {
        let { data: stats } = await admin.rpc("telegram_get_stats_today");
        let s = stats || { total_today: 0, paid_today: 0, pending_today: 0, revenue_today: 0, total_pending: 0 };

        let statsMsg = `
📊 <b>إحصائيات المنصة الحية اليوم:</b>

• 📝 <b>تسجيلات اليوم:</b> ${s.total_today} طالب
• ✅ <b>الاشتراكات المؤكدة اليوم:</b> ${s.paid_today}
• ⏳ <b>طلبات اليوم المعلقة:</b> ${s.pending_today}
• 💰 <b>إيرادات اليوم المحصلة:</b> <b>${Number(s.revenue_today).toFixed(2)} ج.م</b>
• ⚠️ <b>إجمالي المعلق في المنصة:</b> ${s.total_pending} طلب

<i>اضغط /pending لعرض الطلبات التي تنتظر موافقتك.</i>
`.trim();
        await sendMsg(botToken, chatId, statsMsg);
        return jsonResp({ ok: true });
      }

      // --- أمر /pending ---
      if (text.startsWith("/pending")) {
        let { data: pendingList } = await admin
          .from("registrations")
          .select("id, registration_code, full_name, phone, amount, payment_method, created_at, receipt_url, courses ( title )")
          .in("payment_status", ["pending_payment", "under_review"])
          .order("created_at", { ascending: false })
          .limit(5);

        if (!pendingList || pendingList.length === 0) {
          await sendMsg(botToken, chatId, "🎉 <b>رائع! لا توجد أي طلبات معلقة حالياً، كل الطلبات مؤكدة.</b>");
          return jsonResp({ ok: true });
        }

        await sendMsg(botToken, chatId, `⏳ <b>يوجد ${pendingList.length} طلب معلق بانتظار المراجعة:</b>`);

        for (let reg of pendingList) {
          let cTitle = (reg as any).courses?.title || "مادة دراسية";
          let payM = reg.payment_method === "instapay" ? "إنستاباي" : "فودافون كاش";
          let waPhone = String(reg.phone).replace(/\D/g, "").replace(/^0/, "2");

          let cardText = `
🆔 <b>كود:</b> <code>${reg.registration_code}</code>
👤 <b>الطالب:</b> ${esc(reg.full_name)}
📱 <b>الهاتف:</b> <code>${reg.phone}</code>
📚 <b>المادة:</b> ${esc(cTitle)}
💰 <b>المبلغ:</b> <b>${reg.amount} ج.م</b> (${payM})
${reg.receipt_url ? `📎 <a href="${reg.receipt_url}">عرض صورة الإيصال المرفق</a>` : "⚠️ لم يرفع إيصال بالموقع"}
`.trim();

          let btns = [
            [
              { text: "✅ قبول وتفعيل", callback_data: `approve:${reg.id}` },
              { text: "❌ رفض", callback_data: `reject:${reg.id}` },
            ],
            [
              { text: "💬 فتح واتساب", url: `https://wa.me/${waPhone}` },
            ]
          ];

          await sendMsg(botToken, chatId, cardText, { inline_keyboard: btns });
        }
        return jsonResp({ ok: true });
      }

      // --- أمر /unpaid ---
      if (text.startsWith("/unpaid")) {
        let cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        let { data: unpaidList } = await admin
          .from("registrations")
          .select("id, registration_code, full_name, phone, amount, created_at, courses ( title )")
          .eq("payment_status", "pending_payment")
          .lt("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!unpaidList || unpaidList.length === 0) {
          await sendMsg(botToken, chatId, "✅ <b>لا توجد طلبات معلقة تجاوزت 24 ساعة بدون دفع.</b>");
          return jsonResp({ ok: true });
        }

        let resp = `⏳ <b>قائمة الطلاب المسجلين من أكثر من 24 ساعة ولم يرسلوا التحويل:</b>\n\n`;
        let btns = [];

        for (let item of unpaidList) {
          let cTitle = (item as any).courses?.title || "";
          let waPhone = String(item.phone).replace(/\D/g, "").replace(/^0/, "2");
          let reminderMsg = encodeURIComponent(`أهلاً بك يا ${item.full_name}، بنفكرك بحجزك لمراجعة ${cTitle} بكود ${item.registration_code}. لو حولت يا ريت تبعتلنا الإيصال لتأكيد اشتراكك واستلام الرابط.`);
          
          btns.push([{
            text: `💬 تذكير: ${item.full_name} (${item.amount} ج.م)`,
            url: `https://wa.me/${waPhone}?text=${reminderMsg}`
          }]);
        }

        await sendMsg(botToken, chatId, resp, { inline_keyboard: btns });
        return jsonResp({ ok: true });
      }

      // --- أمر /find ---
      if (text.startsWith("/find")) {
        let query = text.replace("/find", "").trim();
        if (!query) {
          await sendMsg(botToken, chatId, "يرجى كتابة كلمة البحث بعد الأمر، مثلاً: <code>/find 01157502004</code> أو <code>/find AMT-1002</code>");
          return jsonResp({ ok: true });
        }

        let { data: found } = await admin
          .from("registrations")
          .select("id, registration_code, full_name, phone, email, amount, payment_status, receipt_url, courses ( title )")
          .or(`phone.ilike.%${query}%,registration_code.ilike.%${query}%,full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5);

        if (!found || found.length === 0) {
          await sendMsg(botToken, chatId, `لم يتم العثور على أي طالب يطابق: <b>${esc(query)}</b>`);
          return jsonResp({ ok: true });
        }

        for (let item of found) {
          let cTitle = (item as any).courses?.title || "مادة";
          let waPhone = String(item.phone).replace(/\D/g, "").replace(/^0/, "2");
          let statusText = item.payment_status === "paid" ? "✅ مؤكد" : item.payment_status === "rejected" ? "❌ مرفوض" : "⏳ معلق";

          let card = `
👤 <b>${esc(item.full_name)}</b> (${statusText})
🆔 <b>كود:</b> <code>${item.registration_code}</code>
📱 <b>الهاتف:</b> <code>${item.phone}</code>
📧 <b>الإيميل:</b> ${esc(item.email)}
📚 <b>المادة:</b> ${esc(cTitle)} | <b>${item.amount} ج.م</b>
${item.receipt_url ? `📎 <a href="${item.receipt_url}">عرض الإيصال المرفوع</a>` : ""}
`.trim();

          let btns = [];
          if (item.payment_status !== "paid") {
            btns.push([
              { text: "✅ قبول وتفعيل", callback_data: `approve:${item.id}` },
              { text: "❌ رفض", callback_data: `reject:${item.id}` },
            ]);
          }
          btns.push([{ text: "💬 فتح واتساب", url: `https://wa.me/${waPhone}` }]);

          await sendMsg(botToken, chatId, card, { inline_keyboard: btns });
        }
        return jsonResp({ ok: true });
      }

      // --- أمر /summary ---
      if (text.startsWith("/summary")) {
        let { data: stats } = await admin.rpc("telegram_get_stats_today");
        let s = stats || { total_today: 0, paid_today: 0, pending_today: 0, revenue_today: 0, total_pending: 0 };
        let dateCairo = new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "full" }).format(new Date());

        let summaryMsg = `
🌙 <b>التقرير اليومي لمنصة أحمد مصطفى تك</b>
📅 <i>${dateCairo}</i>

📈 <b>إجمالي التسجيلات الجديدة اليوم:</b> ${s.total_today} طالب
✅ <b>الاشتراكات المكتملة والمؤكدة:</b> ${s.paid_today} اشتراك
💰 <b>إجمالي الإيرادات المحصلة اليوم:</b> <b>${Number(s.revenue_today).toFixed(2)} ج.م</b>
⏳ <b>الطلبات المعلقة اليوم:</b> ${s.pending_today} طلب
⚠️ <b>إجمالي الطلبات المعلقة بالنظام:</b> ${s.total_pending} طلب

<i>أتمنى لك دوام النجاح والتوفيق يا باشمهندس أحمد!</i>
`.trim();
        await sendMsg(botToken, chatId, summaryMsg);
        return jsonResp({ ok: true });
      }

      // رد افتراضي على أي رسالة أخرى
      await sendMsg(botToken, chatId, "مرحباً يا باشمهندس! اكتب <b>/help</b> لرؤية الأوامر السريعة المتاحة.");
      return jsonResp({ ok: true });
    }

    return jsonResp({ ok: true });
  } catch (err) {
    console.error("telegram-webhook crashed:", err);
    return jsonResp({ ok: false, error: (err as Error).message }, 500);
  }
});
