// ============================================================
// supabase/functions/register-with-turnstile/index.ts
// تسجيل الطالب بعد التحقق من Turnstile على السيرفر + rate limit
// التنبيه بيتبعت في الخلفية عشان الطالب مايستناش تليجرام
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: any;

let ALLOWED_ORIGINS = ["https://ahmedmostafatechplatform.vercel.app"];
let ALLOWED_HOSTNAMES = ["ahmedmostafatechplatform.vercel.app"];
let MAX_COURSES = 10;
let UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// عميل بصلاحية service_role
let supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function corsHeaders(origin: string | null): Record<string, string> {
  let headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResp(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string {
  let cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  let xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

// تنظيف نص وتحديد طوله
function str(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

// تسجيل زمن المرحلة في اللوج (بيرجّع الوقت الحالي للمرحلة اللي بعدها)
function lap(label: string, since: number): number {
  let now = performance.now();
  console.log("timing", label, Math.round(now - since), "ms");
  return now;
}

// فحص rate limit (لو الفحص نفسه فشل بنسمح ونسجّل الخطأ)
async function allow(key: string, max: number, seconds: number): Promise<boolean> {
  let { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max_tokens: max,
    p_interval_seconds: seconds,
  });
  if (error) {
    console.error("rate limit check failed:", error.message);
    return true;
  }
  return data === true;
}

// التحقق من الـ token عند Cloudflare بالـ Secret Key
async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  let secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not set");
    return false;
  }

  let form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip !== "unknown") form.set("remoteip", ip);

  try {
    let res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    let data = await res.json();

    if (!data.success) {
      console.warn("turnstile rejected:", JSON.stringify(data["error-codes"]));
      return false;
    }
    if (data.action && data.action !== "register") {
      console.warn("turnstile action mismatch:", data.action);
      return false;
    }
    if (data.hostname && !ALLOWED_HOSTNAMES.includes(data.hostname)) {
      console.warn("turnstile hostname mismatch:", data.hostname);
      return false;
    }
    return true;
  } catch (e) {
    console.error("turnstile verify error:", String(e));
    return false;
  }
}

// تنبيه تليجرام "تسجيل جديد" عن طريق notify-telegram الداخلية
async function notifyRegistered(ids: string[]): Promise<void> {
  let internal = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
  if (!internal) {
    console.error("INTERNAL_FUNCTION_SECRET is not set");
    return;
  }
  try {
    let res = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/notify-telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        "x-internal-secret": internal,
      },
      body: JSON.stringify({ registration_ids: ids, kind: "registered" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) console.error("notify-telegram returned", res.status);
  } catch (e) {
    console.error("notify-telegram call failed:", String(e));
  }
}

async function handler(req: Request): Promise<Response> {
  let origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "method_not_allowed" }, 405, origin);
  }
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResp({ error: "forbidden_origin" }, 403, origin);
  }

  let t = performance.now();

  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResp({ error: "invalid_json" }, 400, origin);
  }

  // قراءة وتنظيف المدخلات (التحقق التفصيلي بيحصل جوه دالة SQL)
  let token = str(body.turnstileToken, 2048);
  let email = str(body.email, 254).toLowerCase();
  let fullName = str(body.fullName, 200);
  let branch = str(body.branch, 200);
  let phone = str(body.phone, 30);
  let paymentMethod = str(body.paymentMethod, 30);
  let discountCode = body.discountCode ? str(body.discountCode, 50) : null;

  let courseIds: string[] = Array.isArray(body.courseIds)
    ? Array.from(new Set(body.courseIds.map(function (c: unknown) { return String(c); })))
    : [];

  if (!token) return jsonResp({ error: "turnstile_missing" }, 400, origin);
  if (!email) return jsonResp({ error: "invalid email" }, 400, origin);
  if (
    courseIds.length < 1 || courseIds.length > MAX_COURSES ||
    courseIds.some(function (c) { return !UUID_RE.test(c); })
  ) {
    return jsonResp({ error: "invalid_courses" }, 400, origin);
  }

  let ip = getClientIp(req);

  // 1) فحص حد الـ IP والتحقق من Turnstile بالتوازي
  let checks = await Promise.all([
    allow("reg:ip:" + ip, 10, 600),
    verifyTurnstile(token, ip),
  ]);
  t = lap("ip-limit+turnstile", t);

  if (!checks[0]) return jsonResp({ error: "rate_limited" }, 429, origin);
  if (!checks[1]) return jsonResp({ error: "turnstile_failed" }, 403, origin);

  // 2) حد الإيميل (بعد Turnstile عشان محدش يستهلك حد إيميل غيره)
  if (!(await allow("reg:email:" + email, 5, 3600))) {
    return jsonResp({ error: "rate_limited" }, 429, origin);
  }
  t = lap("email-limit", t);

  // 3) تسجيل كل المواد بالتوازي
  let settled = await Promise.all(courseIds.map(function (cid) {
    return supabase.rpc("register_student_with_coupon", {
      p_course_id: cid,
      p_full_name: fullName,
      p_branch: branch,
      p_phone: phone,
      p_email: email,
      p_payment_method: paymentMethod,
      p_discount_code: discountCode,
    });
  }));
  t = lap("register-rpcs", t);

  let results: any[] = [];
  let firstError: string | null = null;
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].error) {
      if (!firstError) firstError = String(settled[i].error!.message);
    } else {
      results.push(settled[i].data);
    }
  }
  if (firstError) {
    // رسالة Postgres زي 'invalid phone' بترجع زي ما هي عشان getErrorMessage يترجمها
    console.error("registration failed:", firstError);
    return jsonResp({ error: firstError, results }, 400, origin);
  }

  // 4) تنبيه تليجرام في الخلفية
  let regIds: string[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i] && results[i].registration_id) regIds.push(String(results[i].registration_id));
  }
  if (regIds.length > 0) {
    let task = notifyRegistered(regIds);
    if (typeof EdgeRuntime !== "undefined") {
      EdgeRuntime.waitUntil(task);
    } else {
      await task;
    }
  }

  console.log("registered", results.length, "course(s)");
  return jsonResp({ results }, 200, origin);
}

Deno.serve(handler);