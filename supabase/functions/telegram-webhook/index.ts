// ============================================================
// supabase/functions/telegram-webhook/index.ts
// يستقبل أوامر تليجرام وضغطات الأزرار من الأدمن
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace/>/g, "&gt;");
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sendTelegramMsg(token: string, chatId: number, text: string, buttons?: any[][]) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResp({ ok: false, error: "method not allowed" }, 405);
  }

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!botToken) {
      return jsonResp({ ok: false, error: "TELEGRAM_BOT_TOKEN not configured" }, 500);
    }

    // التحقق المرن من السر المشترك
    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
    if (webhookSecret) {
      const incomingSecret =
        req.headers.get("x-telegram-bot-api-secret-token") ||
        req.headers.get("X-Telegram-Bot-Api-Secret-Token") ||
        "";
      if (incomingSecret && incomingSecret !== webhookSecret) {
        console.warn("Webhook secret mismatch");
        return jsonResp({ ok: false, error: "unauthorized" }, 403);
      }
    }

    const payload = await req.json();
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ========================================================
    // 1. التعامل مع ضغطات الأزرار (Callback Queries)
    // ========================================================
    if (payload.callback_query) {
      const query = payload.callback_query;
      const callbackId = query.id;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;
      const rawData = String(query.data || "");

      let action = "";
      let regId = "";

      if (rawData.includes("_")) {
        const parts = rawData.split("_");
        action = parts[0];
        regId = parts.slice(1).join("_");
      } else if (rawData.includes(":")) {
        const parts = rawData.split(":");
        action = parts[0];
        regId = parts.slice(1).join(":");
      }

      let responseText = "";
      let statusAlert = false;
      let nextButtons: any[][] = [];

      // جلب بيانات التسجيل
      const { data: reg } = await admin
        .from("registrations")
        .select("id, registration_code, full_name, email, phone, payment_status, email_sent")
        .eq("id", regId)
        .maybeSingle();

      const waPhone = reg?.phone ? String(reg.phone).replace(/\D/g, "").replace(/^0/, "20") : "";

      // أ) قبول وتأكيد الدفع (approve)
      if (action === "approve") {
        const { error: approveErr } = await admin.rpc("admin_approve_registration", {
          p_reg_id: regId,
          p_admin_note: "تم القبول وتأكيد الدفع عبر بوت تليجرام",
        });

        if (approveErr && !approveErr.message.includes("already approved")) {
          responseText = "❌ فشل القبول: " + approveErr.message;
          statusAlert = true;
        } else {
          // استدعاء إرسال الإيميل تلقائياً فور نجاح القبول
          let emailOk = false;
          let emailErrorMsg = "";

          try {
            const { data: mailRes, error: mailErr } = await admin.functions.invoke("send-activation-email", {
              body: { registration_id: regId, force: false },
            });

            if (mailErr) {
              emailErrorMsg = mailErr.message;
            } else if (mailRes && mailRes.ok) {
              emailOk = true;
            } else {
              emailErrorMsg = mailRes?.error || "رد غير متوقع من بوابة الإيميل";
            }
          } catch (e) {
            emailErrorMsg = (e as Error).message;
          }

          if (emailOk) {
            responseText = "✅ تم القبول وتأكيد الدفع، وتم إرسال إيميل التفعيل وصلاحية Drive للطالب بنجاح! 🎉";
          } else {
            responseText = `✅ تم تأكيد الدفع بنجاح، لكن تعذر إرسال الإيميل تلقائياً (${emailErrorMsg}).`;
          }

          nextButtons = [
            [{ text: "📧 إعادة إرسال الإيميل", callback_data: "resend_" + regId }],
          ];
          if (waPhone) {
            nextButtons.push([{ text: "💬 فتح واتساب الطالب", url: `https://wa.me/${waPhone}` }]);
          }
        }
      }
      // ب) إعادة إرسال الإيميل (resend)
      else if (action === "resend") {
        try {
          const { data: mailRes, error: mailErr } = await admin.functions.invoke("send-activation-email", {
            body: { registration_id: regId, force: true },
          });

          if (mailErr) {
            responseText = "❌ فشل إرسال الإيميل: " + mailErr.message;
            statusAlert = true;
          } else if (mailRes && mailRes.ok) {
            responseText = "📧 تم إرسال إيميل التفعيل ورابط المراجعة للطالب بنجاح!";
          } else {
            responseText = "⚠️ فشل الإرسال: " + (mailRes?.error || "خطأ غير متوقع");
            statusAlert = true;
          }
        } catch (e) {
          responseText = "❌ حدث خطأ أثناء إرسال الإيميل: " + (e as Error).message;
          statusAlert = true;
        }

        nextButtons = [
          [{ text: "📧 إعادة إرسال الإيميل مجدداً", callback_data: "resend_" + regId }],
        ];
        if (waPhone) {
          nextButtons.push([{ text: "💬 فتح واتساب الطالب", url: `https://wa.me/${waPhone}` }]);
        }
      }
      // ج) وضع قيد الفحص (review)
      else if (action === "review") {
        const { error } = await admin.from("registrations").update({
          payment_status: "under_review",
          admin_note: "تم وضعه قيد الفحص من تليجرام",
          updated_at: new Date().toISOString(),
        }).eq("id", regId);

        if (error) {
          responseText = "❌ فشل نقل الطلب: " + error.message;
          statusAlert = true;
        } else {
          responseText = "🔍 تم وضع الطلب قيد الفحص والمراجعة.";
          nextButtons = [
            [
              { text: "✅ قبول وتأكيد الدفع", callback_data: "approve_" + regId },
              { text: "❌ رفض الطلب", callback_data: "reject_" + regId },
            ],
          ];
          if (waPhone) nextButtons.push([{ text: "💬 فتح واتساب", url: `https://wa.me/${waPhone}` }]);
        }
      }
      // د) رفض الطلب (reject)
      else if (action === "reject") {
        const { error } = await admin.from("registrations").update({
          payment_status: "rejected",
          rejection_reason: "تم الرفض عبر بوت تليجرام",
          updated_at: new Date().toISOString(),
        }).eq("id", regId);

        if (error) {
          responseText = "❌ فشل الرفض: " + error.message;
          statusAlert = true;
        } else {
          responseText = "🚫 تم رفض الطلب.";
          if (waPhone) {
            nextButtons = [[{ text: "💬 إبلاغ الطالب عبر واتساب", url: `https://wa.me/${waPhone}` }]];
          }
        }
      } else {
        responseText = "أمر غير معروف.";
        statusAlert = true;
      }

      // إجابة تليجرام لإغلاق التحميل على الزر
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackId,
          text: responseText.slice(0, 190),
          show_alert: statusAlert,
        }),
      });

      // تعديل نص الرسالة أو الكابشن
      const currentCaption = query.message.caption || query.message.text || "";
      const updatedText = currentCaption + "\n\n📌 <b>إجراء الأدمن:</b> " + responseText;

      const editMethod = query.message.photo ? "editMessageCaption" : "editMessageText";
      const editBody: any = {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: nextButtons },
      };

      if (query.message.photo) {
        editBody.caption = updatedText;
      } else {
        editBody.text = updatedText;
        editBody.disable_web_page_preview = true;
      }

      await fetch(`https://api.telegram.org/bot${botToken}/${editMethod}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editBody),
      });

      return jsonResp({ ok: true });
    }

    // ========================================================
    // 2. معالجة الرسائل والأوامر النصية من الأدمن (/pending, /stats, إلخ)
    // ========================================================
    if (payload.message && payload.message.text) {
      const msg = payload.message;
      const text = msg.text.trim();
      const chatId = msg.chat.id;

      if (text === "/pending") {
        const { data: pending } = await admin
          .from("registrations")
          .select("id, registration_code, full_name, amount, payment_method, proof_path, receipt_url, courses(title)")
          .in("payment_status", ["pending_payment", "under_review"])
          .order("created_at", { ascending: false })
          .limit(5);

        if (!pending || pending.length === 0) {
          await sendTelegramMsg(botToken, chatId, "✨ لا توجد أي طلبات معلقة حالياً.");
        } else {
          for (const reg of pending) {
            const courseTitle = (reg as any).courses?.title || "مادة دراسية";
            const msgText = `📌 <b>طلب معلق:</b>\nالكود: <code>${reg.registration_code}</code>\nالاسم: ${esc(reg.full_name)}\nالمادة: ${esc(courseTitle)}\nالمبلغ: <b>${reg.amount} ج.م</b>`;
            const buttons = [
              [
                { text: "✅ قبول وتأكيد الدفع", callback_data: "approve_" + reg.id },
                { text: "❌ رفض", callback_data: "reject_" + reg.id },
              ],
            ];
            await sendTelegramMsg(botToken, chatId, msgText, buttons);
          }
        }
        return jsonResp({ ok: true });
      } else if (text === "/stats") {
        const { data: stats } = await admin.rpc("telegram_get_stats_today");
        const s = stats || { total_today: 0, paid_today: 0, revenue_today: 0, total_pending: 0 };
        const msgText = `📊 <b>إحصائيات اليوم:</b>\n• إجمالي التسجيلات: ${s.total_today}\n• المؤكد والمدفوع: ${s.paid_today}\n• الإيرادات: <b>${s.revenue_today} ج.م</b>\n• إجمالي المعلق: ${s.total_pending}`;
        await sendTelegramMsg(botToken, chatId, msgText);
        return jsonResp({ ok: true });
      } else if (text === "/summary") {
        const { data: stats } = await admin.rpc("telegram_get_stats_today");
        const s = stats || { total_today: 0, paid_today: 0, pending_today: 0, revenue_today: 0, total_pending: 0 };
        const dateCairo = new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "full" }).format(new Date());

        const summaryMsg = `
🌙 <b>التقرير اليومي لمنصة أحمد مصطفى تك</b>
📅 <i>${dateCairo}</i>

📈 <b>إجمالي التسجيلات الجديدة اليوم:</b> ${s.total_today} طالب
✅ <b>الاشتراكات المكتملة والمؤكدة:</b> ${s.paid_today} اشتراك
💰 <b>إجمالي الإيرادات المحصلة اليوم:</b> <b>${Number(s.revenue_today).toFixed(2)} ج.م</b>
⏳ <b>الطلبات المعلقة اليوم:</b> ${s.pending_today} طلب
⚠️ <b>إجمالي الطلبات المعلقة بالنظام:</b> ${s.total_pending} طلب

<i>أتمنى لك دوام النجاح والتوفيق يا باشمهندس أحمد!</i>
`.trim();
        await sendTelegramMsg(botToken, chatId, summaryMsg);
        return jsonResp({ ok: true });
      } else if (text === "/start" || text === "/help") {
        await sendTelegramMsg(botToken, chatId, "👋 مرحباً بك في بوت منصة أحمد مصطفى تك!\nالأوامر المتاحة:\n• /pending لعرض الطلبات المعلقة والبت فيها فوراً\n• /stats لإحصائيات اليوم وسجل المبيعات\n• /summary للتقرير اليومي الشامل");
        return jsonResp({ ok: true });
      }

      await sendTelegramMsg(botToken, chatId, "مرحباً يا باشمهندس! اكتب <b>/help</b> لرؤية الأوامر السريعة المتاحة.");
      return jsonResp({ ok: true });
    }

    return jsonResp({ ok: true });
  } catch (err) {
    console.error("telegram-webhook crashed:", err);
    return jsonResp({ ok: false, error: String(err) }, 500);
  }
});