// ============================================================
// process-expired-access
// سحب صلاحية Drive تلقائيًا من التسجيلات المؤكدة اللي انتهى اشتراكها
// بتتنادى من pg_cron كل ساعة، ومحمية بسر في الهيدر
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let MAX_PER_RUN = 20;
let MAX_RUN_MS = 100000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// تاريخ النهارده بتوقيت القاهرة بصيغة YYYY-MM-DD
function todayInCairo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
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
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  // التحقق من السر المشترك مع المهمة المجدولة
  let expectedSecret = Deno.env.get('CRON_SECRET') || 'MySuperSecretKey_2026_AhmedTech_99';
  if (!expectedSecret || req.headers.get('x-cron-secret') !== expectedSecret) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  try {
    let scriptUrl = Deno.env.get('APPS_SCRIPT_URL') || 'https://script.google.com/macros/s/AKfycbxTpFzucBXi_wH8ze_HW4x-Fl6edYFodM4ZbIuM9MEw6wFXl1jf3jQwJjoQ_1wHUebCfg/exec';
    let scriptSecret = Deno.env.get('APPS_SCRIPT_SECRET') || 'MySuperSecretKey_2026_AhmedTech_99';
    if (!scriptUrl || !scriptSecret) {
      return jsonResponse({ ok: false, error: 'email gateway not configured' }, 500);
    }

    let admin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    let today = todayInCairo();
    let { data: rows, error: queryError } = await admin
      .from('registrations')
      .select('id, email, registration_code, courses!inner ( access_link, access_until )')
      .eq('payment_status', 'paid')
      .in('access_status', ['granted', 'revoke_failed'])
      .not('courses.access_until', 'is', null)
      .lt('courses.access_until', today)
      .limit(MAX_PER_RUN);

    if (queryError) {
      console.error('expired query failed:', queryError.message);
      return jsonResponse({ ok: false, error: 'query failed' }, 500);
    }

    let startedAt = Date.now();
    let revoked = 0;
    let failed = 0;
    let list = rows || [];

    for (let i = 0; i < list.length; i++) {
      if (Date.now() - startedAt > MAX_RUN_MS) {
        break;
      }

      let row: any = list[i];
      let course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
      let nowIso = new Date().toISOString();

      if (!course || !course.access_link) {
        await admin.from('registrations')
          .update({ access_status: 'revoke_failed', access_error: 'access link not set', updated_at: nowIso })
          .eq('id', row.id);
        failed++;
        continue;
      }

      let result = await revokeViaGateway(scriptUrl, scriptSecret, row.email, course.access_link);

      if (result.ok) {
        await admin.from('registrations')
          .update({
            access_status: 'revoked',
            access_revoked_at: nowIso,
            revoke_reason: 'انتهاء مدة الاشتراك تلقائيًا',
            access_error: null,
            updated_at: nowIso
          })
          .eq('id', row.id);
        revoked++;
      } else {
        await admin.from('registrations')
          .update({ access_status: 'revoke_failed', access_error: String(result.error).slice(0, 300), updated_at: nowIso })
          .eq('id', row.id);
        failed++;
      }
    }

    return jsonResponse({ ok: true, checked: list.length, revoked: revoked, failed: failed });
  } catch (err) {
    console.error('process-expired-access crashed:', err);
    return jsonResponse({ ok: false, error: 'internal error' }, 500);
  }
});

