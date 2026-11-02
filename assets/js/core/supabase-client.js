// ============================================================
// supabase-client.js
// إنشاء عميل Supabase مرة واحدة فقط واستخدامه في كل المشروع
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.1/+esm';
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY, APP_CONFIG } from './config.js';

// فحص أمان: هل المفتاح اللي اتحط مفتاح سري بالغلط؟
function looksLikeSecretKey(key) {
  if (key.startsWith('sb_secret_')) {
    return true;
  }
  let parts = key.split('.');
  if (parts.length !== 3) {
    return false;
  }
  try {
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    let padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    let payload = JSON.parse(atob(padded));
    return payload.role === 'service_role';
  } catch (error) {
    return false;
  }
}

// التأكد إن الإعدادات اتملت صح قبل ما نكمل
function assertConfigIsValid() {
  let urlIsValid =
    typeof SUPABASE_URL === 'string' &&
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('YOUR-PROJECT');

  let keyIsValid =
    typeof SUPABASE_PUBLIC_KEY === 'string' &&
    SUPABASE_PUBLIC_KEY.length > 20 &&
    !SUPABASE_PUBLIC_KEY.includes('YOUR_');

  if (!urlIsValid) {
    throw new Error('Supabase config error: SUPABASE_URL is missing or invalid in config.js');
  }
  if (!keyIsValid) {
    throw new Error('Supabase config error: SUPABASE_PUBLIC_KEY is missing or invalid in config.js');
  }
  if (looksLikeSecretKey(SUPABASE_PUBLIC_KEY)) {
    throw new Error('SECURITY: a secret key was found in config.js. Use the public (anon/publishable) key only.');
  }
}

assertConfigIsValid();

export let supabase = createClient(SUPABASE_URL.replace(/\/+$/, ''), SUPABASE_PUBLIC_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // مهم: بيكمل تسجيل الدخول بجوجل لما المستخدم يرجع من صفحة جوجل
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: APP_CONFIG.AUTH_STORAGE_KEY
  }
});