// ============================================================
// supabase/functions/send-activation-email/index.ts
// إرسال إيميل التفعيل وتأكيد الاشتراك للطالب (عبر Resend أو SMTP)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record = payload.record || payload;

    const studentEmail = record.student_email || record.email;
    const studentName = record.student_name || record.full_name || "عزيزي الطالب";
    const courseTitle = record.course_title || "المادة الدراسية";
    const accessUntil = record.access_until || "نهاية امتحانات الترم";
    const siteUrl = record.site_url || "https://ahmedmostafa.tech";

    if (!studentEmail) {
      return new Response(
        JSON.stringify({ success: false, message: "Student email is required." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const senderEmail = Deno.env.get("SENDER_EMAIL") || "Ahmed Mostaf Tech <no-reply@ahmedmostafa.tech>";

    const htmlBody = `
<!DOCTYPE html>
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
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #365aa2 0%, #204080 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 99px; font-weight: bold; font-size: 16px; margin: 20px 0 10px; box-shadow: 0 4px 12px rgba(54,90,162,0.3); }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; background: #f8fafc; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1 style="margin:0; font-size:24px; font-weight:900;">أحمد مصطفى تك</h1>
      <p style="margin:6px 0 0; opacity:0.85; font-size:13px;">منصة مراجعات طلاب الجامعة المصرية للتعلم الإلكتروني EELU</p>
    </div>

    <div class="content">
      <div class="badge-success">🎉 تم تأكيد الاشتراك بنجاح</div>
      <h2 style="font-size:20px; color:#071022; margin-top:0;">أهلاً بيك يا ${studentName} 👋</h2>
      <p style="font-size:15px; color:#475569;">
        تمت مراجعة عملية التحويل وتفعيل اشتراكك في مادة <strong>${courseTitle}</strong>. المحتوى بالكامل مفتوح لك الآن وتقدر تبدأ المذاكرة فوراً!
      </p>

      <div class="details-box">
        <div style="margin-bottom:8px;">📚 <strong>المادة المفعلة:</strong> ${courseTitle}</div>
        <div style="margin-bottom:8px;">⏳ <strong>صلاحية المشاهدة:</strong> حتى ${accessUntil}</div>
        <div>📱 <strong>الأجهزة:</strong> متاح المشاهدة من الموبايل أو اللابتوب</div>
      </div>

      <div style="text-align:center;">
        <a href="${siteUrl}/dashboard.html" class="cta-btn">ابدأ المشاهدة من لوحة التحكم 🚀</a>
      </div>

      <p style="font-size:13px; color:#64748b; margin-top:24px;">
        لو عندك أي استفسار في أي وقت، تقدر تتواصل معنا مباشرة عبر واتساب على الرقم: <code>01066843568</code>
      </p>
    </div>

    <div class="footer">
      منصة أحمد مصطفى تك © 2026. نتمنى لك دوام التوفيق والامتياز.
    </div>
  </div>
</body>
</html>
    `.trim();

    if (!resendApiKey) {
      console.warn("RESEND_API_KEY secret not found. Email logged for simulation.");
      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          message: "RESEND_API_KEY not configured. Email logged.",
          recipient: studentEmail
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: senderEmail,
        to: [studentEmail],
        subject: `🎉 تم تفعيل اشتراكك في مادة ${courseTitle} | أحمد مصطفى تك`,
        html: htmlBody
      })
    });

    const emailData = await emailRes.json();

    return new Response(
      JSON.stringify({ success: emailRes.ok, result: emailData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("send-activation-email error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
