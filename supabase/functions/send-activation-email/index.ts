// ============================================================
// send-activation-email
// إرسال إيميل تفعيل الاشتراك بعد قبول الدفع (للأدمن فقط)
// بتاخد registration_id بس، وبتقرا كل حاجة تانية من الداتابيز
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

let METHOD_LABELS: Record<string, string> = {
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستاباي'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function escapeHtml(value: unknown): string {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// تاريخ بالعربي وأرقام لاتينية بتوقيت القاهرة
function formatDateAr(dateOnly: string | null): string {
  if (!dateOnly) return '';
  let date = new Date(dateOnly + 'T12:00:00Z');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

// بناء نص الإيميل
function buildEmail(reg: any, course: any) {
  let subject = 'تم تأكيد اشتراكك — Ahmed Mostafa Tech';
  let untilText = formatDateAr(course.access_until);
  let amount = Number(reg.amount).toFixed(2);
  let methodLabel = METHOD_LABELS[reg.payment_method] || reg.payment_method;

  let untilRow = untilText
    ? '<tr><td style="padding:6px 0;color:#64748b;">صلاحية الوصول حتى</td><td style="padding:6px 0;font-weight:700;">' + escapeHtml(untilText) + '</td></tr>'
    : '';

  let html =
    '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#f1f5f9;padding:24px;">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">' +
    '<div style="background:#0b1d3a;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:700;">Ahmed Mostafa Tech</div>' +
    '<div style="padding:24px;color:#0f172a;line-height:1.9;font-size:15px;">' +
    '<p style="margin:0 0 12px;">أهلًا ' + escapeHtml(reg.full_name) + '،</p>' +
    '<p style="margin:0 0 16px;">تم تأكيد دفعك واشتراكك في <strong>' + escapeHtml(course.title) + '</strong>. تقدر تفتح المراجعة من الزرار اللي تحت.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">' +
    '<tr><td style="padding:6px 0;color:#64748b;">رقم التسجيل</td><td style="padding:6px 0;font-weight:700;" dir="ltr">' + escapeHtml(reg.registration_code) + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#64748b;">المبلغ</td><td style="padding:6px 0;font-weight:700;">' + escapeHtml(amount) + ' جنيه (' + escapeHtml(methodLabel) + ')</td></tr>' +
    untilRow +
    '</table>' +
    '<p style="text-align:center;margin:24px 0;"><a href="' + escapeHtml(course.access_link) + '" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:700;display:inline-block;">فتح المراجعة</a></p>' +
    '<p style="margin:0 0 8px;font-size:13px;color:#475569;">لو الزرار ما اشتغلش، انسخ اللينك ده وافتحه في المتصفح:</p>' +
    '<p style="margin:0 0 16px;font-size:12px;word-break:break-all;color:#475569;" dir="ltr">' + escapeHtml(course.access_link) + '</p>' +
    '<p style="margin:0;font-size:13px;color:#475569;">اللينك خاص بيك، يُفضل ما تشاركوش مع حد. وأي استفسار كلمنا على واتساب.</p>' +
    '</div></div></div>';

  let text =
    'أهلًا ' + reg.full_name + '،\n\n' +
    'تم تأكيد اشتراكك في ' + course.title + '.\n' +
    'رقم التسجيل: ' + reg.registration_code + '\n' +
    'رابط المراجعة: ' + course.access_link + '\n' +
    (untilText ? 'صلاحية الوصول حتى: ' + untilText + '\n' : '') +
    '\nAhmed Mostafa Tech';

  return { subject: subject, html: html, text: text };
}

// الإرسال عبر بوابة Apps Script
async function sendViaGateway(scriptUrl: string, secret: string, to: string, mail: any) {
  let controller = new AbortController();
  let timer = setTimeout(function () { controller.abort(); }, 25000);

  try {
    let res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret: secret,
        to: to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      }),
      redirect: 'follow',
      signal: controller.signal
    });

    let raw = await res.text();
    try {
      let parsed = JSON.parse(raw);
      return { ok: parsed.ok === true, error: parsed.error || null };
    } catch (parseErr) {
      return { ok: false, error: 'unexpected gateway response (' + res.status + ')' };
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// تسجيل محاولة الإرسال في email_logs
async function logEmail(admin: any, reg: any, status: string, errorMessage: string | null) {
  try {
    let { error } = await admin.from('email_logs').insert({
      registration_id: reg.id,
      recipient_email: reg.email,
      email_type: 'activation',
      status: status,
      error_message: errorMessage,
      sent_at: status === 'sent' ? new Date().toISOString() : null
    });
    if (error) {
      console.error('email_logs insert failed:', error.message);
    }
  } catch (err) {
    console.error('email_logs insert exception:', err);
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
    let supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    let anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    let serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    let scriptUrl = Deno.env.get('APPS_SCRIPT_URL') || '';
    let scriptSecret = Deno.env.get('APPS_SCRIPT_SECRET') || '';

    if (!scriptUrl || !scriptSecret) {
      return jsonResponse({ ok: false, error: 'email gateway not configured' }, 500);
    }

    // 1) التأكد إن اللي بينادي أدمن
    let authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return jsonResponse({ ok: false, error: 'not authenticated' }, 401);
    }

    let userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    let { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData || !userData.user) {
      return jsonResponse({ ok: false, error: 'not authenticated' }, 401);
    }

    let { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
    if (adminError || isAdmin !== true) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403);
    }

    // 2) قراءة الطلب
    let body: any = {};
    try {
      body = await req.json();
    } catch (parseErr) {
      body = {};
    }

    let regId = String(body.registration_id || '');
    let force = body.force === true;
    if (!/^[0-9a-f-]{36}$/i.test(regId)) {
      return jsonResponse({ ok: false, error: 'invalid registration id' }, 400);
    }

    // 3) قراءة التسجيل والمادة بصلاحية السيرفر
    let admin = createClient(supabaseUrl, serviceKey);

    let { data: reg, error: regError } = await admin
      .from('registrations')
      .select('id, registration_code, full_name, email, amount, payment_method, payment_status, email_sent, course_id')
      .eq('id', regId)
      .maybeSingle();

    if (regError || !reg) {
      return jsonResponse({ ok: false, error: 'registration not found' }, 404);
    }

    // ممنوع إرسال لينك الدخول قبل قبول الدفع
    if (reg.payment_status !== 'paid') {
      return jsonResponse({ ok: false, error: 'registration not paid' }, 400);
    }

    let { data: course } = await admin
      .from('courses')
      .select('title, access_link, access_until')
      .eq('id', reg.course_id)
      .maybeSingle();

    if (!course || !course.access_link || !/^https?:\/\//i.test(course.access_link)) {
      return jsonResponse({ ok: false, error: 'access link not set' }, 400);
    }

    // 4) منع الإرسال المكرر: نحجز الإرسال بشكل ذري (إلا لو إعادة إرسال متعمدة)
    if (!force) {
      let { data: claimed } = await admin
        .from('registrations')
        .update({ email_sent: true, updated_at: new Date().toISOString() })
        .eq('id', regId)
        .or('email_sent.is.null,email_sent.eq.false')
        .select('id');

      if (!claimed || claimed.length === 0) {
        return jsonResponse({ ok: true, skipped: true });
      }
    }

    // 5) الإرسال
    let mail = buildEmail(reg, course);
    let result = await sendViaGateway(scriptUrl, scriptSecret, reg.email, mail);

    if (result.ok) {
      if (force) {
        await admin.from('registrations')
          .update({ email_sent: true, updated_at: new Date().toISOString() })
          .eq('id', regId);
      }
      await logEmail(admin, reg, 'sent', null);
      return jsonResponse({ ok: true });
    }

    // فشل: نرجّع الحجز عشان زر إعادة الإرسال يشتغل
    if (!force) {
      await admin.from('registrations')
        .update({ email_sent: false, updated_at: new Date().toISOString() })
        .eq('id', regId);
    }
    await logEmail(admin, reg, 'failed', result.error);
    return jsonResponse({ ok: false, error: 'email delivery failed', details: result.error });
  } catch (err) {
    console.error('send-activation-email crashed:', err);
    return jsonResponse({ ok: false, error: 'internal error' }, 500);
  }
});