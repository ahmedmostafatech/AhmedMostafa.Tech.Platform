// ============================================================
// send-activation-email
// إرسال إيميل التفعيل ومنح صلاحية Google Drive للطالب
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml(data: {
  studentName: string;
  regCode: string;
  courseTitle: string;
  accessUntil: string;
  accessLink: string;
}): { html: string; text: string } {
  const html = `<!DOCTYPE html>
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
      <h1 style="margin:0; font-size:24px; font-weight:900;">أحمد مصطفى تك</h1>
      <p style="margin:6px 0 0; opacity:0.85; font-size:13px;">تأكيد الاشتراك وتفعيل صلاحية المراجعة</p>
    </div>
    <div class="content">
      <div class="badge-success">تم استلام التحويل وتفعيل الوصول بنجاح</div>
      <h2 style="font-size:20px; color:#071022; margin-top:0;">أهلاً بك يا ${escapeHtml(data.studentName)}</h2>
      <p style="font-size:15px; color:#475569;">
        تمت مراجعة عملية التحويل وتأكيد اشتراكك في <strong>${escapeHtml(data.courseTitle)}</strong>، وتمت إضافة بريدك الإلكتروني كصلاحية مشاهدة مباشرة على مجلد Google Drive.
      </p>
      <div class="details-box">
        <div class="detail-row"><span class="detail-label">كود التسجيل:</span> ${escapeHtml(data.regCode)}</div>
        <div class="detail-row"><span class="detail-label">المراجعة المفعلة:</span> ${escapeHtml(data.courseTitle)}</div>
        <div class="detail-row"><span class="detail-label">فترة الإتاحة:</span> حتى ${escapeHtml(data.accessUntil)}</div>
        <div class="detail-row">
          <span class="detail-label">الرابط المباشر للمحتوى:</span><br>
          <a href="${escapeHtml(data.accessLink)}" target="_blank" style="color:#365aa2; font-weight:bold; word-break:break-all;">${escapeHtml(data.accessLink)}</a>
        </div>
      </div>
      <div style="text-align:center;">
        <a href="${escapeHtml(data.accessLink)}" target="_blank" class="cta-btn">فتح مجلد المراجعة والبدء في المذاكرة 🚀</a>
      </div>
      <p style="font-size:13px; color:#64748b; margin-top:24px;">
        💡 يرجى التأكد من تسجيل الدخول بحساب Google هذا للوصول إلى المجلد. للتواصل والدعم على واتساب: <strong>01066843568</strong>
      </p>
    </div>
    <div class="footer">
      Ahmed Mostafa Tech &copy; 2026. نتمنى لك دوام التوفيق والامتياز.
    </div>
  </div>
</body>
</html>`;

  const text = `أهلاً بك ${data.studentName}\nتم تأكيد اشتراكك في ${data.courseTitle}.\nرابط المراجعة على Google Drive:\n${data.accessLink}\nكود التسجيل: ${data.regCode}`;
  return { html, text };
}

async function sendViaGateway(scriptUrl: string, secret: string, to: string, folderLink: string, mail: any) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 40000);

  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret: secret,
        to: to,
        folder_link: folderLink,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      }),
      redirect: 'follow',
      signal: controller.signal
    });

    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw);
      return {
        ok: parsed.ok === true,
        granted: parsed.granted === true,
        error: parsed.error || null
      };
    } catch (_parseErr) {
      return { ok: false, granted: false, error: 'unexpected gateway response (' + res.status + ')' };
    }
  } catch (err) {
    return { ok: false, granted: false, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function logEmail(admin: any, reg: any, status: string, errorMsg: string | null) {
  try {
    const { error } = await admin.from('email_logs').insert({
      registration_id: reg.id,
      recipient_email: reg.email,
      email_type: 'activation',
      status: status,
      error_message: errorMsg
    });
    if (error) console.error('email_logs insert failed:', error.message);
  } catch (e) {
    console.warn('logEmail failed:', e);
  }
}

Deno.serve(async function (req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const scriptUrl = Deno.env.get('APPS_SCRIPT_URL') || '';
    const scriptSecret = Deno.env.get('APPS_SCRIPT_SECRET') || '';

    if (!scriptUrl || !scriptSecret) {
      return jsonResponse({
        ok: false,
        error: 'email gateway not configured (APPS_SCRIPT_URL / APPS_SCRIPT_SECRET missing in Secrets)'
      }, 500);
    }

    // ---------- المصادقة ----------
    // 1) نداء داخلي من فنكشن تانية (تليجرام): هيدر x-internal-secret
    // 2) نداء بمفتاح الخدمة
    // 3) نداء من أدمن مسجل دخول (لوحة الأدمن)
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') || '';
    const sentSecret = req.headers.get('x-internal-secret') || '';
    const hasInternalSecret = internalSecret !== '' && sentSecret === internalSecret;

    const authHeader = req.headers.get('Authorization') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isServiceCall = serviceKey !== '' && bearerToken === serviceKey;

    if (!hasInternalSecret && !isServiceCall) {
      if (!authHeader) {
        return jsonResponse({ ok: false, error: 'not authenticated' }, 401);
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData || !userData.user) {
        return jsonResponse({ ok: false, error: 'not authenticated' }, 401);
      }
      const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
      if (adminError || isAdmin !== true) {
        return jsonResponse({ ok: false, error: 'forbidden' }, 403);
      }
    }

    // ---------- قراءة الطلب ----------
    let body: any = {};
    try {
      body = await req.json();
    } catch (_parseErr) {
      body = {};
    }

    const regId = String(body.registration_id || '');
    const force = body.force === true;

    if (!/^[0-9a-f-]{36}$/i.test(regId)) {
      return jsonResponse({ ok: false, error: 'invalid registration id' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: reg, error: regError } = await admin
      .from('registrations')
      .select('id, registration_code, full_name, email, payment_status, email_sent, access_status, course_id')
      .eq('id', regId)
      .maybeSingle();

    if (regError || !reg) {
      return jsonResponse({ ok: false, error: 'registration not found' }, 404);
    }

    if (reg.payment_status !== 'paid') {
      return jsonResponse({ ok: false, error: 'registration not paid' }, 400);
    }

    if (reg.email_sent && !force) {
      return jsonResponse({ ok: true, skipped: true, message: 'email already sent' });
    }

    const { data: course, error: courseError } = await admin
      .from('courses')
      .select('title, access_link, access_until')
      .eq('id', reg.course_id)
      .maybeSingle();

    if (courseError || !course || !course.access_link) {
      return jsonResponse({ ok: false, error: 'access link not set' }, 400);
    }

    const emailContent = buildEmailHtml({
      studentName: reg.full_name || 'طالبنا العزيز',
      regCode: reg.registration_code || '',
      courseTitle: course.title || 'المادة الدراسية',
      accessUntil: course.access_until || 'نهاية امتحانات الفصل الدراسي',
      accessLink: course.access_link
    });

    const mail = {
      subject: `تم تأكيد اشتراكك في ${course.title} — Ahmed Mostafa Tech`,
      html: emailContent.html,
      text: emailContent.text
    };

    const result = await sendViaGateway(scriptUrl, scriptSecret, reg.email, course.access_link, mail);
    const nowIso = new Date().toISOString();

    // ---------- نجاح الإرسال ----------
    if (result.ok) {
      const { error: updErr } = await admin.from('registrations').update({
        email_sent: true,
        access_status: 'granted',
        access_granted_at: nowIso,
        access_revoked_at: null,
        revoke_reason: null,
        access_error: null,
        updated_at: nowIso
      }).eq('id', regId);
      if (updErr) console.error('registration update failed:', updErr.message);

      const { error: logErr } = await admin.from('email_logs').insert({
        registration_id: reg.id,
        recipient_email: reg.email,
        email_type: 'activation',
        status: 'sent',
        error_message: null
      });
      if (logErr) console.error('email_logs insert failed:', logErr.message);

      return jsonResponse({
        ok: true,
        update_error: updErr ? updErr.message : null,
        log_error: logErr ? logErr.message : null
      });
    }

    // ---------- فشل الإرسال ----------
    const failUpdate: Record<string, unknown> = { updated_at: nowIso };
    if (!force) {
      failUpdate.email_sent = false;
    }
    if (result.granted) {
      failUpdate.access_status = 'granted';
      failUpdate.access_granted_at = nowIso;
      failUpdate.access_revoked_at = null;
      failUpdate.revoke_reason = null;
      failUpdate.access_error = null;
    }
    const { error: failUpdErr } = await admin.from('registrations').update(failUpdate).eq('id', regId);
    if (failUpdErr) console.error('failure update failed:', failUpdErr.message);

    await logEmail(admin, reg, 'failed', result.error);
    return jsonResponse({ ok: false, error: 'email delivery failed', details: result.error }, 500);

  } catch (err) {
    console.error('send-activation-email crashed:', err);
    return jsonResponse({ ok: false, error: 'internal error', details: String(err) }, 500);
  }
});