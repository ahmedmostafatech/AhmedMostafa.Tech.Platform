// ============================================================
// supabase/functions/submit-receipt/index.ts
// رفع إيصال الدفع بشكل آمن: signed upload URL + تأكيد + تنبيه تليجرام
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
declare const EdgeRuntime: any;

let ALLOWED_ORIGINS = ["https://ahmedmostafatechplatform.vercel.app"];
let MAX_REGS = 10;
let UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let PATH_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9_.-]{1,100}$/;
let EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

// تنظيف قايمة الـ IDs: UUID صحيح، بدون تكرار، من 1 لـ 10
function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  let seen: Record<string, boolean> = {};
  let out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    let id = String(value[i]).toLowerCase();
    if (UUID_RE.test(id) && !seen[id]) {
      seen[id] = true;
      out.push(id);
    }
  }
  return out.length <= MAX_REGS ? out : [];
}

// تحميل التسجيلات والتأكد إنها كلها موجودة وحالتها pending_payment
async function loadPendingRegs(ids: string[]): Promise<boolean> {
  let { data, error } = await supabase
    .from("registrations")
    .select("id, payment_status")
    .in("id", ids);
  if (error || !data || data.length !== ids.length) return false;
  for (let i = 0; i < data.length; i++) {
    if (data[i].payment_status !== "pending_payment") return false;
  }
  return true;
}

// نداء notify-telegram الداخلي (نفس أسلوب telegram-webhook مع send-activation-email)
async function notifyTelegram(ids: string[]): Promise<boolean> {
  let internal = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
  if (!internal) {
    console.error("INTERNAL_FUNCTION_SECRET is not set");
    return false;
  }
  try {
    let res = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/notify-telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        "x-internal-secret": internal,
      },
      body: JSON.stringify({ registration_ids: ids }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error("notify-telegram returned", res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error("notify-telegram call failed:", String(e));
    return false;
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

  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResp({ error: "invalid_json" }, 400, origin);
  }

  let ids = cleanIds(body.registrationIds);
  if (ids.length === 0) {
    return jsonResp({ error: "invalid_registrations" }, 400, origin);
  }

  let ip = getClientIp(req);
  if (!(await allow("rcpt:ip:" + ip, 20, 600))) {
    return jsonResp({ error: "rate_limited" }, 429, origin);
  }

  // ---------- الخطوة 1: طلب رابط رفع ----------
  if (body.action === "init") {
    let ext = EXT_BY_TYPE[String(body.contentType || "")];
    if (!ext) {
      return jsonResp({ error: "invalid_file_type" }, 400, origin);
    }
    if (!(await loadPendingRegs(ids))) {
      return jsonResp({ error: "already_submitted" }, 409, origin);
    }

    // اسم الملف عشوائي، والفولدر هو أول تسجيل
    let path = ids[0] + "/receipt_" + Date.now() + "_" + crypto.randomUUID().slice(0, 8) + "." + ext;
    let { data, error } = await supabase.storage.from("receipts").createSignedUploadUrl(path);
    if (error || !data) {
      console.error("createSignedUploadUrl failed:", error ? error.message : "no data");
      return jsonResp({ error: "upload_init_failed" }, 500, origin);
    }
    return jsonResp({ path: data.path, token: data.token }, 200, origin);
  }

  // ---------- الخطوة 2: تأكيد الرفع ----------
  if (body.action === "complete") {
    let path = String(body.path || "");
    if (!PATH_RE.test(path) || path.split("/")[0] !== ids[0]) {
      return jsonResp({ error: "invalid_path" }, 400, origin);
    }

    // نتأكد إن الملف اترفع فعلاً
    let parts = path.split("/");
    let { data: files, error: listErr } = await supabase.storage
      .from("receipts")
      .list(parts[0], { limit: 100, search: parts[1] });
    if (listErr) {
      console.error("storage list failed:", listErr.message);
      return jsonResp({ error: "verify_failed" }, 500, origin);
    }
    let found = false;
    for (let i = 0; files && i < files.length; i++) {
      if (files[i].name === parts[1]) found = true;
    }
    if (!found) {
      return jsonResp({ error: "file_not_found" }, 400, origin);
    }

    // تخزين المسار ونقل الحالة (بشرط إنها لسه pending_payment)
    let { data: updated, error: updErr } = await supabase
      .from("registrations")
      .update({
        proof_path: path,
        payment_status: "under_review",
        updated_at: new Date().toISOString(),
      })
      .in("id", ids)
      .eq("payment_status", "pending_payment")
      .select("id");
    if (updErr) {
      console.error("update failed:", updErr.message);
      return jsonResp({ error: "save_failed" }, 500, origin);
    }
    if (!updated || updated.length !== ids.length) {
      return jsonResp({ error: "already_submitted" }, 409, origin);
    }

// التنبيه بيتبعت في الخلفية: فشله مايبوظش الرفع، والإيصال محفوظ
let task = notifyTelegram(ids);
if (typeof EdgeRuntime !== "undefined") {
  EdgeRuntime.waitUntil(task);
} else {
  await task;
}
console.log("receipt saved for", ids.length, "registration(s)");
return jsonResp({ ok: true }, 200, origin);
  }

  return jsonResp({ error: "unknown_action" }, 400, origin);
}

Deno.serve(handler);