// ============================================================
// supabase/functions/send-activation-email/index.ts
// إرسال إيميل التفعيل وتحديث Google Sheet عبر Google Apps Script Webhook
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// رابط الـ Apps Script ومفتاح الأمان (مع دعم القراءة من بيئة Deno أو الافتراضي المباشر)
const DEFAULT_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxTpFzucBXi_wH8ze_HW4x-Fl6edYFodM4ZbIuM9MEw6wFXl1jf3jQwJjoQ_1wHUebCfg/exec";
const DEFAULT_SECRET_KEY = "MySuperSecretKey_2026_AhmedTech_99";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const registrationId: string | undefined = payload.registration_id;
    const force: boolean = payload.force === true;

    if (!registrationId) {
      return json({ ok: false, error: "registration_id is required" }, 400);
    }

    // 1. الاتصال بـ Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return json({ ok: false, error: "email gateway not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 2. جلب بيانات التسجيل والمراجعة
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .select(`
        id,
        registration_code,
        full_name,
        branch,
        phone,
        email,
        amount,
        payment_method,
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

    if (reg.payment_status !== "paid") {
      return json({ ok: false, error: "registration not paid" }, 400);
    }

    if (reg.email_sent && !force) {
      return json({ ok: true, skipped: true, message: "Email already sent previously." });
    }

    const course = (reg as any).courses ?? {};
    const accessLink = course.access_link || "https://drive.google.com";

    // 3. تجهيز طلب Google Apps Script
    const appsScriptUrl = Deno.env.get("APPS_SCRIPT_URL") || DEFAULT_APPS_SCRIPT_URL;
    const secretKey = Deno.env.get("APPS_SCRIPT_SECRET") || DEFAULT_SECRET_KEY;

    const scriptPayload = {
      action: "approve_and_send_email",
      secret: secretKey,
      registration_id: reg.id,
      registration_code: reg.registration_code,
      student_name: reg.full_name,
      student_email: reg.email,
      phone: reg.phone,
      branch: reg.branch,
      course_title: course.title || "المادة الدراسية",
      amount: reg.amount,
      payment_method: reg.payment_method,
      access_link: accessLink,
      access_until: course.access_until || "نهاية الفصل الدراسي"
    };

    console.log("Calling Google Apps Script Webhook:", appsScriptUrl);

    // Google Apps Script redirects (302) on POST to an execution output URL.
    // fetch handles redirects automatically with redirect: 'follow'.
    const scriptResponse = await fetch(appsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(scriptPayload),
      redirect: "follow",
    });

    const scriptResultText = await scriptResponse.text();
    console.log("Google Apps Script response raw:", scriptResultText);

    let scriptResult: any = {};
    try {
      scriptResult = JSON.parse(scriptResultText);
    } catch {
      scriptResult = { success: scriptResponse.ok, raw: scriptResultText };
    }

    if (!scriptResponse.ok || scriptResult.success === false) {
      const errMsg = scriptResult.error || scriptResult.message || "Google Apps Script error";
      console.error("Google Apps Script failed:", errMsg);

      await supabase.from("email_logs").insert({
        registration_id: registrationId,
        recipient_email: reg.email,
        email_type: "activation",
        status: "failed",
        error_message: errMsg,
      });

      return json({ ok: false, error: "email delivery failed", details: errMsg }, 500);
    }

    // 4. تسجيل النجاح وتحديث الداتابيز
    await supabase.from("email_logs").insert({
      registration_id: registrationId,
      recipient_email: reg.email,
      email_type: "activation",
      status: "sent",
    });

    await supabase
      .from("registrations")
      .update({ email_sent: true, updated_at: new Date().toISOString() })
      .eq("id", registrationId);

    return json({ ok: true, recipient: reg.email, scriptResponse: scriptResult });

  } catch (err) {
    console.error("Function fatal error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
