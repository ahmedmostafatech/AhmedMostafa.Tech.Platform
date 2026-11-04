// ============================================================
// revoke-access
// سحب صلاحية Drive من طالب (للأدمن فقط)
// بتاخد registration_id وسبب اختياري
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

// سحب الصلاحية عبر بوابة Apps Script
async function revokeViaGateway(scriptUrl: string, secret: string, email: string, folderLink: string) {
  let controller = new AbortController();
  let timer = setTimeout(function () { controller.abort(); }, 30000);

  try {
    let res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        secret: secret,
        action: 'revoke',
        to: email,
        folder_link: folderLink
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
    let scriptUrl = Deno.env.get('APPS_SCRIPT_URL') || 'https://script.google.com/macros/s/AKfycbxTpFzucBXi_wH8ze_HW4x-Fl6edYFodM4ZbIuM9MEw6wFXl1jf3jQwJjoQ_1wHUebCfg/exec';
    let scriptSecret = Deno.env.get('APPS_SCRIPT_SECRET') || 'MySuperSecretKey_2026_AhmedTech_99';

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
    let reason = String(body.reason || '').trim().slice(0, 300) || 'سحب يدوي من الأدمن';
    if (!/^[0-9a-f-]{36}$/i.test(regId)) {
      return jsonResponse({ ok: false, error: 'invalid registration id' }, 400);
    }

    // 3) قراءة التسجيل والمادة
    let admin = createClient(supabaseUrl, serviceKey);

    let { data: reg } = await admin
      .from('registrations')
      .select('id, email, access_status, course_id')
      .eq('id', regId)
      .maybeSingle();

    if (!reg) {
      return jsonResponse({ ok: false, error: 'registration not found' }, 404);
    }

    let { data: course } = await admin
      .from('courses')
      .select('access_link')
      .eq('id', reg.course_id)
      .maybeSingle();

    if (!course || !course.access_link) {
      return jsonResponse({ ok: false, error: 'access link not set' }, 400);
    }

    // 4) السحب
    let result = await revokeViaGateway(scriptUrl, scriptSecret, reg.email, course.access_link);
    let nowIso = new Date().toISOString();

    if (result.ok) {
      await admin.from('registrations')
        .update({
          access_status: 'revoked',
          access_revoked_at: nowIso,
          revoke_reason: reason,
          access_error: null,
          updated_at: nowIso
        })
        .eq('id', regId);
      return jsonResponse({ ok: true });
    }

    await admin.from('registrations')
      .update({ access_status: 'revoke_failed', access_error: String(result.error).slice(0, 300), updated_at: nowIso })
      .eq('id', regId);
    return jsonResponse({ ok: false, error: 'access revoke failed', details: result.error }, 500);
  } catch (err) {
    console.error('revoke-access crashed:', err);
    return jsonResponse({ ok: false, error: 'internal error' }, 500);
  }
});

