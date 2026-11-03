// ============================================================
// supabase/functions/send-activation-email/index.ts
// إرسال إيميل التفعيل وتأكيد الاشتراك للطالب مع رابط المراجعة (Google Drive)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const payload = await req.json();
    const record = payload.record || payload;

    const studentEmail = record.student_email || record.email;
    const studentName = escapeHtml(record.student_name || record.full_name || "عزيزي الطالب");
    const regCode = escapeHtml(record.registration_code || record.reg_code || "AMT-1000");
    const courseTitle = escapeHtml(record.course_title || "المادة الدراسية");
    const accessUntil = escapeHtml(record.access_until || "نهاية امتحانات الفصل الدراسي");
    const accessLink = record.access_link || "https://drive.google.com";

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
      <p style="margin:6px 0 0; opacity:0.85; font-size:13px;">تأكيد الاشتراك واستلام رابط المراجعة</p>
    </div>

    <div class="content">
      <div class="badge-success">🎉 تم استلام التحويل وتأكيد الاشتراك بنجاح</div>
      <h2 style="font-size:20px; color:#071022; margin-top:0;">أهلاً بك يا ${studentName} 👋</h2>
      <p style="font-size:15px; color:#475569;">
        تمت مراجعة عملية التحويل وتأكيد اشتراكك في <strong>${courseTitle}</strong>. يمكنك الآن الوصول لكافة الفيديوهات المسجلة والمذكرات ونماذج الامتحانات فوراً عبر الرابط بالأسفل:
      </p>

      <div class="details-box">
        <div style="margin-bottom:8px;">🆔 <strong>كود التسجيل:</strong> ${regCode}</div>
        <div style="margin-bottom:8px;">📚 <strong>المراجعة المفعلة:</strong> ${courseTitle}</div>
        <div style="margin-bottom:8px;">⏳ <strong>فترة الإتاحة:</strong> حتى ${accessUntil}</div>
        <div>📁 <strong>الرابط المباشر للمحتوى:</strong> <a href="${accessLink}" target="_blank" style="color:#365aa2; font-weight:bold; word-break:break-all;">اضغط هنا لفتح المجلد</a></div>
      </div>

      <div style="text-align:center;">
        <a href="${accessLink}" target="_blank" class="cta-btn">فتح مجلد المراجعة والبدء في المذاكرة 🚀</a>
      </div>

      <p style="font-size:13px; color:#64748b; margin-top:24px;">
        💡 يرجى حفظ هذا الإيميل للرجوع إليه وقتما تشاء. إذا واجهتك أي صعوبة في فتح الرابط، تواصل مع المهندس أحمد مباشرة على واتساب: <code>01066843568</code>
      </p>
    </div>

    <div class="footer">
      Ahmed Mostafa Tech &copy; 2026. نتمنى لك دوام التوفيق والامتياز.
    </div>
  </div>
</body>
</html>
    `.trim();

    if (!resendApiKey) {
      console.warn("RESEND_API_KEY is not set. Email body generated successfully (Simulation Mode).");
      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          message: "Email generated (simulation mode, no RESEND_API_KEY configured).",
          recipient: studentEmail,
          course: courseTitle,
          access_link: accessLink
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
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
      return new Response(
        JSON.stringify({ success: false, error: resendData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: resendData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
