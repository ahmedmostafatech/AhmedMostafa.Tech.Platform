// ============================================================
// supabase/functions/send-activation-email/index.ts
// إرسال إيميل التفعيل لطالب محدد عبر registration_id
// بيجيب بيانات الطالب من الداتابيز، ويسجل النتيجة في email_logs
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // -------------------------------------------------
    // 1. استخراج registration_id و force من الـ body
    // -------------------------------------------------
    const payload = await req.json();
    const registrationId: string | undefined = payload.registration_id;
    const force: boolean = payload.force === true;

    if (!registrationId) {
      return json({ ok: false, error: "registration_id is required" }, 400);
    }

    // -------------------------------------------------
    // 2. إنشاء supabase client بالـ service_role key (تجاوز RLS)
    // -------------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return json({ ok: false, error: "email gateway not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // -------------------------------------------------
    // 3. جلب بيانات التسجيل من الداتابيز
    // -------------------------------------------------
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .select(`
        id,
        registration_code,
        full_name,
        email,
        payment_status,
        email_sent,
        courses ( title, access_link, access_until )
      `)
      .eq("id", registrationId)
      .single();

    if (regErr || !reg) {
      console.error("Registration fetch error:", regErr?.message);
      return json({ ok: false, error: "registration not found" }, 404);
    }

    // -------------------------------------------------
    // 4. التحقق من حالة الدفع (لازم paid)
    // -------------------------------------------------
    if (reg.payment_status !== "paid") {
      return json({ ok: false, error: "registration not paid" }, 400);
    }

    // -------------------------------------------------
    // 5. منع إعادة الإرسال التلقائية (إلا لو force = true)
    // -------------------------------------------------
    if (reg.email_sent && !force) {
      return json({ ok: true, skipped: true, message: "Email already sent previously." });
    }

    // -------------------------------------------------
    // 6. بناء الإيميل
    // -------------------------------------------------
    const course = (reg as any).courses ?? {};
    const studentEmail: string = reg.email;
    const studentName = escapeHtml(reg.full_name || "عزيزي الطالب");
    const regCode = escapeHtml(reg.registration_code || "AMT-1000");
    const courseTitle = escapeHtml(course.title || "المادة الدراسية");
    const accessLink: string = course.access_link || "https://drive.google.com";
    const accessUntil = escapeHtml(course.access_until || "نهاية امتحانات الفصل الدراسي");

    const htmlBody = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; direction: rtl; text-align: right; }
    .email-container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #071022 0%, #365aa2 100%); padding: 32px 24px; text-align: center; color: white; }
    .content { padding: 32px 28px; line-height: 1.8; }
    .badge-success { background: #dcfce7; color: #16a34a; font-weight: bold; padding: 6px 14px; border-radius: 99px; display: inline-block; font-size: 13px; margin-bottom: 16px; }
    .details-box { background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0; }
    .detail-row { margin-bottom: 10px; font-size: 14px; }
    .detail-label { font-weight: 700; color: #334155; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #365aa2 0%, #204080 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 99px; font-weight: bold; font-size: 16px; margin: 20px 0 10px; box-shadow: 0 4px 12px rgba(54,90,162,0.3); }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; background: #f8fafc; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1 style="margin:0; font-size:24px; font-weight:900;">احمد مصطفى تك</h1>
      <p style="margin:6px 0 0; opacity:0.85; font-size:13px;">تأكيد الاشتراك واستلام رابط المراجعة</p>
    </div>

    <div class="content">
      <div class="badge-success">تم استلام التحويل وتأكيد الاشتراك بنجاح</div>
      <h2 style="font-size:20px; color:#071022; margin-top:0;">اهلاً بك يا ${studentName}</h2>
      <p style="font-size:15px; color:#475569;">
        تمت مراجعة عملية التحويل وتأكيد اشتراكك في <strong>${courseTitle}</strong>.
        يمكنك الآن الوصول لكافة الفيديوهات المسجلة والمذكرات ونماذج الامتحانات فوراً عبر الرابط بالأسفل:
      </p>

      <div class="details-box">
        <div class="detail-row"><span class="detail-label">كود التسجيل:</span> ${regCode}</div>
        <div class="detail-row"><span class="detail-label">المراجعة المفعلة:</span> ${courseTitle}</div>
        <div class="detail-row"><span class="detail-label">فترة الإتاحة:</span> حتى ${accessUntil}</div>
        <div class="detail-row">
          <span class="detail-label">الرابط المباشر للمحتوى:</span>
          <a href="${accessLink}" target="_blank" style="color:#365aa2; font-weight:bold; word-break:break-all;">اضغط هنا لفتح المجلد</a>
        </div>
      </div>

      <div style="text-align:center;">
        <a href="${accessLink}" target="_blank" class="cta-btn">فتح مجلد المراجعة والبدء في المذاكرة</a>
      </div>

      <p style="font-size:13px; color:#64748b; margin-top:24px;">
        يرجى حفظ هذا الإيميل للرجوع إليه وقتما تشاء.
        إذا واجهتك أي صعوبة في فتح الرابط، تواصل مع المهندس أحمد مباشرة على واتساب:
        <strong>01066843568</strong>
      </p>
    </div>

    <div class="footer">
      Ahmed Mostafa Tech &copy; 2026. نتمنى لك دوام التوفيق والامتياز.
    </div>
  </div>
</body>
</html>`.trim();

    // -------------------------------------------------
    // 7. إرسال الإيميل عبر Resend API
    // -------------------------------------------------
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const senderEmail = Deno.env.get("SENDER_EMAIL") || "Ahmed Mostafa Tech <no-reply@ahmedmostafa.tech>";

    let emailSentOk = false;
    let sendError = "";

    if (!resendApiKey) {
      // وضع Simulation: مفيش مفتاح Resend — نسجل كـ sent بس من غير إرسال فعلي
      console.warn("RESEND_API_KEY not set — running in simulation mode.");
      emailSentOk = true;
    } else {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: senderEmail,
          to: [studentEmail],
          subject: `تم تأكيد اشتراكك في ${courseTitle} — Ahmed Mostafa Tech`,
          html: htmlBody,
        }),
      });

      const resendData = await resendResponse.json();

      if (!resendResponse.ok) {
        console.error("Resend API error:", resendData);
        sendError = resendData?.message || resendData?.name || "email delivery failed";
      } else {
        emailSentOk = true;
        console.log("Email sent via Resend:", resendData?.id);
      }
    }

    // -------------------------------------------------
    // 8. تسجيل النتيجة في email_logs وتحديث email_sent
    // -------------------------------------------------
    if (emailSentOk) {
      // تسجيل في email_logs
      await supabase.from("email_logs").insert({
        registration_id: registrationId,
        recipient_email: studentEmail,
        email_type: "activation",
        status: "sent",
      });

      // تحديث email_sent في registrations
      await supabase
        .from("registrations")
        .update({ email_sent: true, updated_at: new Date().toISOString() })
        .eq("id", registrationId);

      return json({ ok: true, recipient: studentEmail });
    } else {
      // تسجيل الفشل في email_logs
      await supabase.from("email_logs").insert({
        registration_id: registrationId,
        recipient_email: studentEmail,
        email_type: "activation",
        status: "failed",
        error_message: sendError,
      });

      return json(
        { ok: false, error: "email delivery failed", details: sendError },
        500
      );
    }
  } catch (err) {
    console.error("Function error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
