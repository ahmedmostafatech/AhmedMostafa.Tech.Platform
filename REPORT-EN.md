# Security Assessment — Ahmed Mostafa Tech Platform

**Target:** https://ahmedmostafatechplatform.vercel.app
**Backend / API:** https://wsoazfbpdsmspygrofjf.supabase.co
**Test window:** 6–7 November 2026
**Method:** External black-box penetration test, anonymous (unauthenticated) role only
**Frameworks:** OWASP Top 10 (2021), OWASP ASVS 4.0

---

## 1. Executive summary

Four confirmed vulnerabilities (one High, three Medium), plus one previously-claimed finding that was **falsified and retracted** during verification. No Critical findings.

The most important issue is not technical. **The entire business workflow depends on a Telegram notification.** A student pays, an alert arrives on the owner's phone, and the owner approves or rejects the payment. The first vulnerability lets **anyone on the internet send forged payment alerts** — without registering, paying, or even visiting the site.

| # | Finding | Severity | CVSS | Status | Tracker |
|---|---|---|---|---|---|
| 1 | `notify-telegram` callable with no credential | **High** | 6.5 | Confirmed | ISSUE-5 |
| 2 | `receipts` bucket listable + downloadable by anon | Medium | 5.3 | Confirmed | ISSUE-1 |
| 3 | Paid `access_link` leaked in public select | Medium | 5.3 | Confirmed | ISSUE-2 |
| 4 | Anon can upload into private `receipts` bucket | Medium | 5.3 | Confirmed | ISSUE-3 |
| 5 | ~~No rate limit on password grant~~ | **Info** | 0.0 | **False positive** | ISSUE-4 |
| 6 | `courses.title` → `innerHTML` stored XSS | Low | — | Proven / unreachable | report-only |

**Every finding was obtained without creating an account or supplying any credential.** Any person with a browser can reproduce them today.

### Architecture note (why these findings exist)

The site is static HTML on Vercel. All data access goes **directly from the browser** to Supabase using the publishable key shipped in `config.js`. Real authorization is therefore Postgres RLS + Storage policies + Edge Function configuration. `core/guard.js` says in its own comment that the page guards are cosmetic.

Students never hold a session (`disable_signup: true` → HTTP 422). Only the admin does. **The entire backend is exercised as the `anon` role, so "what can anon do" *is* the security model.** All four findings are gaps in that model.

---

## 2. Screenshots and extracted images

All images are in:

```
deliverables/images/
```

Absolute path:

```
/workspace/tasks/6015576a-ed87-4279-bae0-61c8fe1e5789/deliverables/images/
```

### 2.1 Images downloaded from the site (evidence for findings 2 and 4)

| File | Content | Provenance |
|---|---|---|
| `01-receipt-downloaded-anonymously-AMT-1012.jpg` | "Al-Aseel Honey" advertisement — anthropomorphic black horse in sunglasses | Retrieved **with no login**, 2,150,624 bytes, 3375×3375 |
| `02-receipt-two-jars-AMT-1021.jpg` | Two-jar honey advert (clover + sidr) | Same bucket |
| `03-receipt-guess-contest-AMT-1019.jpg` | "Guess what's in your hand?" teaser advert | Same bucket |

### 2.2 Exploit screenshots (finding 6)

| File | Content |
|---|---|
| `04-XSS-executed-revision-title.png` | **Code executed** — top-right overlay shows `alert('ZTESTXSS2415')` fired, `sink: revision-page.js line ~52` |
| `05-XSS-control-reviews-escaped.png` | **Counterfactual control** — same input on the reviews page renders as inert text, isolating the defect to the revision page |

### 2.3 Site screenshots (documentation)

| File | Content |
|---|---|
| `06-register-turnstile-failed.png` | Registration page, Cloudflare Turnstile `Verification failed` |
| `07-register-turnstile-unchecked.png` | Same page, pre-verification |
| `08-register-form-course-120egp.png` | Registration form — CS101 for EGP 120 |
| `09-payment-methods-vodafone-instapay.png` | Payment options: Vodafone Cash / InstaPay |

> **Note:** none of these images are sensitive. No student data, payment details or PII appear in them. Image 01 is evidence only because it was retrieved **anonymously**.

---

## 3. Finding 1 (High) — Unauthenticated Telegram alert forgery

**Asset:** `POST /functions/v1/notify-telegram`
**CWE-306:** Missing Authentication for Critical Function
**CVSS 3.1:** 6.5 `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N`

### 3.1 Observation

The Edge Function is deployed with `verify_jwt = false` and performs no verification of its own. It forwards the caller's JSON body verbatim to the owner's private Telegram chat (chat id `1224705261`, bot `AhmedMostafaTech_bot`).

Five independent states were tested. **All returned HTTP 200 and delivered a real `message_id`:**

| Authentication state | HTTP | message_id |
|---|---|---|
| Valid publishable key | 200 | 111 |
| **No `apikey`, no `Authorization`** | 200 | 112 |
| Wrong `apikey` | 200 | 113 |
| Garbage Bearer token | 200 | 114 |
| Empty body `{}` | 200 | 98 |

**The publishable key is not even a prerequisite.** The function is open to unauthenticated internet traffic.

### 3.2 The control that makes this conclusive

`register-with-turnstile` *does* enforce an origin allowlist. An identical `Origin: https://evil.example` was sent to both functions in a single recorded file (`evidence/requests/logic/origin-parity.txt`):

| Function | Result |
|---|---|
| `register-with-turnstile` | **403** `{"error":"forbidden_origin"}` |
| `notify-telegram` | **200**, delivered message_id 108 |

The allowlist exists in one function and is simply missing from the other. This is an omission, not a design choice.

### 3.3 Enumeration confirms it is the only unguarded surface

Only three functions are deployed. `send-email` and `get-course` return 404 `NOT_FOUND` (verified with a control name that also 404s, proving 404 means absent). So there is no hidden additional unguarded function.

### 3.4 Impact

1. **Alert forgery.** An attacker submits a fake student name, email, phone, course, registration code and receipt image URL. All fields are attacker-controlled and rendered verbatim. The owner cannot distinguish it from a genuine alert.
2. **Channel flooding.** Four messages were delivered back-to-back with no throttle (message_id 104–107). A flood buries genuine students' alerts.
3. **Zero cost, zero prerequisites.** No registration, no Turnstile, no payment.

**Stated limitation:** approval is a human decision. This proves injection and flooding of the approval channel — **not** that a forged alert results in an approved payment.

### 3.5 Remediation

**Immediate (5 minutes):** set `verify_jwt = true`.

```bash
supabase functions deploy notify-telegram --no-verify-jwt false
```

**Preferred:** send the notification from *inside* `register-with-turnstile` after Turnstile verification succeeds. Then an alert cannot exist without a real, verified registration, and `notify-telegram` can be closed to the internet entirely.

**Also:** reuse the same origin allowlist that `register-with-turnstile` already implements.

### 3.6 Proof of concept

`/workspace/pocs/poc_notify_telegram_injection.py` — exits 0.

---

## 4. Finding 2 (Medium) — Anonymous listing and download of every receipt

**Asset:** `POST /storage/v1/object/list/receipts`
**CWE-284:** Improper Access Control
**CVSS 3.1:** 5.3 `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`

### 4.1 Observation

The bucket is private — `/object/public/...` returns `400 NoSuchBucket` — yet Storage LIST, SELECT and SIGN are all granted to `anon`:

| Operation | Result |
|---|---|
| `POST /storage/v1/object/list/receipts` | 200 — every object's name, size, mimetype, eTag, timestamps |
| `GET /storage/v1/object/authenticated/receipts/<name>` | 200 — real 2,150,624-byte 3375×3375 JPEG |
| `POST /storage/v1/object/sign/receipts/<name>` | 200 — valid signedURL |

### 4.2 What actually leaked (and what did not)

The 13 objects were downloaded and **the images were opened and read**. They are **honey advertisements** (عسل الأصيل), and only **4 are distinct** (a fifth is a 1-byte probe created during testing).

MD5 grouping across the 13 files:

| Distinct images | Files |
|---|---|
| 1 | 6 files (`AMT-1019, 1020, 1023, 1025, 1026, 1030`) |
| 1 | 4 files (`AMT-1012, 1017, 1018, 1024`) |
| 1 | 1 file (`AMT-1021`) |
| 1 | 1 file (`AMT-1022`) |
| 1 | 1 file — 1-byte probe (`AMT-9999`) |

**So no student financial data is exposed.** What *is* exposed:

1. **Registration codes** — object names embed them: `receipt_AMT-1012_1793791453183.jpg`
2. **Registration volume and timing** — from filenames and timestamps

### 4.3 Why that matters

The registration code `AMT-1012` is **exactly the identifier the "Where is my order?" tracking page accepts**. An attacker can harvest every code and enumerate order status for the whole customer base.

### 4.4 Remediation

```sql
-- grant SELECT to admin only
CREATE POLICY "admin reads receipts"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'receipts' );
```

Then revoke anon LIST / SELECT / SIGN.

Also: the client calls `getPublicUrl()`, which builds a dead `/object/public/...` URL that the app then stores as `receipt_url`. Remove it and store the object name only, generating a signed URL at render time.

---

## 5. Finding 3 (Medium) — Paid course `access_link` exposed to anonymous users

**Asset:** `GET /rest/v1/courses?select=*`
**CWE-284:** Improper Access Control
**CVSS 3.1:** 5.3 `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`

### 5.1 Observation

Both seed courses are returned in full, including `access_link` (the paid Google Drive folder), plus `price_egp` and `is_published`. No purchase, no session.

```
access_link: https://drive.google.com/drive/folders/1YBXS-ftOIiB-GcBOyfAHHRZKe1kiVgyR?usp=sharing
price_egp:   120
```

Both courses share the same folder, so one disclosure covers the entire catalogue.

### 5.2 Fair mitigating fact (verified)

The Drive folder requires a Google sign-in, so the URL is disclosed while the *contents* remain protected from an anonymous visitor. This is sold-content metadata leakage, not proven free access.

**But** if the folder sharing is ever relaxed to "anyone with the link", every course becomes free instantly and silently.

### 5.3 Remediation

**Fast:** request only the needed columns instead of `select=*`.

```javascript
.select('id, title, short_description, price_egp, access_until')
```

**Better:** serve `access_link` only through an access-checked function.

```sql
CREATE OR REPLACE FUNCTION get_course_link(p_course_id uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT access_link FROM courses
  WHERE id = p_course_id AND has_access(p_course_id);
$$;
```

> **Warning:** the client must be updated in the same change or the course page will render empty.

---

## 6. Finding 4 (Medium) — Anonymous upload into the private `receipts` bucket

**Asset:** `POST /storage/v1/object/receipts/<name>`
**CWE-434:** Unrestricted Upload of File with Dangerous Type
**CVSS 3.1:** 5.3 `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`

### 6.1 Observation

`POST` with only the publishable key returns 200 `{"Key":"receipts/...","Id":"..."}`. No size, MIME or path restriction — `text/plain`, `text/html` and `image/svg+xml` all uploaded. The client-side `image/*` and 10 MB checks are bypassed by calling the API directly.

### 6.2 Precisely bounded by observation

| Attempt | Result |
|---|---|
| Overwrite an existing receipt | **400 `AccessDenied`** — existing student receipts are safe from tampering |
| Delete a receipt | **400 `AccessDenied`** single; batch DELETE returns 200 but is a **silent no-op** (object still GETs 200) |
| Execute script from uploaded file | **No** — HTML served as `text/plain` + `nosniff`; SVG as `image/svg+xml` + `nosniff` |

### 6.3 Impact

Unbounded, **undeletable** storage consumption by anyone, at the owner's expense — and it cannot be cleaned up without dashboard or service-role access. No data-integrity impact.

### 6.4 Remediation

```sql
CREATE POLICY "auth uploads receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'receipts' );
```

> **Caution:** if the upload step happens *before* the student authenticates (as the current flow appears to), this will break it. In that case keep anonymous upload but add a **server-side** size cap and MIME allowlist, and ensure the owner can purge old objects.

---

## 7. Finding 5 (Info) — "No rate limiting" was FALSE; a limiter exists

**Asset:** `POST /auth/v1/token?grant_type=password`
**Status:** `false_positive` — claim retracted

### 7.1 What was wrong

The original claim rested on 12 consecutive wrong-password attempts returning 400 with no 429. **That was a probe-depth limitation, not an absence of a control.** A deeper test found the limiter immediately:

```
attempts 01..29  -> 400 invalid_credentials
attempt 30       -> 429 {"code":429,"error_code":"over_request_rate_limit","msg":"Request rate limit reached"}
```

Reproduced across **four independent trials** (first 429 at 30, then 32 after a full reset).

### 7.2 Measured refill rate

Drain the bucket, idle N seconds, then burst:

| Idle | Accepted | tokens/s |
|---|---|---|
| 0 s | 0 | — (still limited) |
| 10 s | 5 | 0.50 |
| 20 s | 11 | 0.55 |
| 30 s | 16 | 0.53 |
| 60 s | 31 | 0.52 |

**Sustained ceiling ≈ 0.52 guesses/s ≈ 1800/hour/IP.**

Inverse control: 1 req/s → 29 of 60 returned 429; 1 req/3 s and 1 req/5 s → **30/30 accepted**.

### 7.3 Two facts that *strengthen* the application

1. **Per-IP, not per-account.** Two different emails competed for the same ~30-token budget (admin 10/10 accepted, ghost address 8/12). **There is no per-account lockout**, so an attacker cannot lock the real admin out.
2. **No user enumeration.** The real admin address and a non-existent address return byte-identical `400 invalid_credentials`; `/auth/v1/recover` returns `200 {}` for both.

### 7.4 The only genuine residual

No `Retry-After` and no `RateLimit-*` header on the 429. The client cannot tell how long to wait. This is a **usability shortfall, not a vulnerability**. A per-account limiter would be stronger than per-IP, but the current control works.

**Severity corrected: Medium 5.9 → Info.** No password was cracked and no login obtained.

---

## 8. Finding 6 (Low, report-only) — Proven stored XSS with blocked reachability

**Asset:** `assets/js/pages/revision-page.js:52`

```javascript
titleEl.innerHTML = `${rev.title} <svg ...></svg>`;
```

### 8.1 Execution is proven, not inferred

The byte-identical shipped module, run against an attacker-shaped row, produced a live `<img>` node inside `#rev-title` and fired `alert('ZTESTXSS2415')` (`imgCount=1`). A counterfactual with `escapeHtml` added produced `imgCount=0`, `fired=[]` — isolating it as a genuine escaping omission.

It is the **only** unescaped data sink among 61 `innerHTML` assignments in the entire client (see `evidence/js/SINK-TABLE.md`).

### 8.2 Reachability is the limitation

Anon cannot write `courses` — `INSERT` and `PATCH` both return **401 `42501 permission denied`**. Only the admin panel writes `courses.title`. So today the payload must be admin-authored.

### 8.3 Why it still matters

- The admin session lives in **`localStorage`** (`amt-auth`), which `HttpOnly` cannot protect from XSS.
- **No CSP** was present in 0 of 72 recorded responses.

The chain exists but is not currently reachable by a low-privileged user — hence report-only rather than filed.

### 8.4 Remediation (one line)

```javascript
titleEl.innerHTML = `${escapeHtml(rev.title)} <svg ...></svg>`;
```

`escapeHtml` already exists in the codebase and is used elsewhere.

---

## 9. Controls that held (tested negatives — do not promote)

| Control | Result | Evidence |
|---|---|---|
| RLS on `registrations`, `profiles`, `orders`, `subscriptions`, `discount_codes`, `email_logs` | all `Content-Range: */0` for anon | authz |
| Privilege escalation via `profiles.is_admin = true` INSERT | 401 `42501` | `213-profiles-insert.txt` |
| All four `admin_*` RPCs | 401 `42501` | RPC sweep |
| `register_student` / `_with_coupon` (Turnstile-bypass lead) | 401 `42501` — lead fails | logic |
| Direct anon INSERT into `registrations` | 401 `42501` RLS | logic |
| Review moderation bypass (`status=approved`) | 401 `42501` | injection |
| Turnstile enforcement | genuine — dummy tokens rejected | logic |
| Review render path (the fields anon *can* control) | fully escaped, `imgNodes=0` | client-side |
| SQL / PostgREST filter injection | none — no `.or()`/`.filter()` string building anywhere | injection |
| `postMessage`, `eval`, prototype pollution, template injection | none exist / N/A | client-side |
| `sanitizeNextPath` open redirect | 12 bypass shapes all rejected | client-side |
| TLS 1.0 / 1.1 | server rejects (`SSL alert 70`) — 1.2/1.3 only | transport |
| HTTP request smuggling | CL.TE / TE.CL / H2 all 405, `n_responses=1` | transport |
| Cache poisoning / deception | clean | transport |

**Explicit non-findings** (hardening only, must not become issues): missing CSP; generic version banners; readable `/admin/*` HTML (all data behind it returns 42501 or 0 rows); CORS `*` on static pages (no `Allow-Credentials`; session is in localStorage).

---

## 10. Coverage limitations

1. **No registration row was ever created.** Cloudflare Turnstile refused to verify from the sandbox datacenter IP (`Verification failed` — image 06). Every finding is therefore row-free and does not depend on the registration flow succeeding end-to-end.
2. **No admin session.** `disable_signup: true` (422) and no credentials were supplied. Session fixation, JWT claim tampering, refresh rotation, logout invalidation and reset-token entropy are all **INCONCLUSIVE**. `submit_registration_receipt` is anon-callable but no real registration id was reachable to test it.
3. **Nuclei `0 findings` is INCONCLUSIVE, not "clean".** The Vercel Security Checkpoint bot challenge produced 188 phantom 403s in a first pass. A CLI-only reading of this host is unreliable.
4. **No CVE cross-reference was possible.** No component discloses a version anywhere. Any advisory-match claim would be an assumption.

### Corrections made during verification

| Original claim | Correction |
|---|---|
| "SSRF via `receipt_url`" | **Not** backend SSRF — Telegram's crawler fetched it (`149.154.161.219`, UA `TelegramBot`). No internal reach. |
| "12 student receipts exposed" | They are honey advertisements; 4 distinct images across 13 files. Only filenames are sensitive. |
| "TLS 1.0/1.1 unavailable" | Server-verified only after re-running with `SECLEVEL=0`; the first reading was a client OpenSSL 3.0 default. |
| "No rate limiting on password grant" | **False positive.** 429 at attempt ~30; per-IP bucket ~0.5 guesses/s. |

---

## 11. Test artefacts left on the target

Anonymous DELETE is a no-op, so these **must be removed by the owner** via the dashboard or a service-role key:

- **~10 objects** in `receipts`: `ztest-logic-*`, `ZTEST-root-probe-2348.txt`, `receipt_AMT-9999_0000000000000.jpg`, `ZTEST-XSS-2355.svg`
- **6 `reviews` rows** at `status=pending` (invisible to anon)
- **~20 real Telegram messages** were delivered to the owner while exercising Finding 1

**No existing row was modified or deleted.**

---

## 12. Remediation plan

| # | Action | Effort | Closes |
|---|---|---|---|
| 1 | `verify_jwt = true` + origin allowlist on `notify-telegram` | 5 min | Finding 1 |
| 2 | Storage policies: anon SELECT + INSERT on `receipts` | 10 min | Findings 2 + 4 |
| 3 | Explicit column list on `courses` (drop `access_link`) | 15 min | Finding 3 |
| 4 | `escapeHtml(rev.title)` in `revision-page.js:52` | 1 min | Finding 6 sink |
| 5 | Per-account limiter + `Retry-After` | optional | Hardening only |

**Start with #1.** It is the highest severity and the fastest fix, and it closes the most business-critical exposure: forged payment alerts.

---

## 13. Preventative guidance

### The governing rule

> **Everything a user can see must require authorization; everything they do not need must not be exposed.**

### Before every deploy

1. **Ask: "what should an anonymous visitor see?"** Then request *only those columns* — never `select=*`. Extra columns are unintended disclosure.
2. **Every new bucket: closed by default.** Supabase grants broad defaults; create the bucket, revoke everything, then open only what is needed.
3. **Every new Edge Function: start from `verify_jwt = true`.** An exception needs a documented reason.

### 5-minute pre-deploy test (incognito window, not logged in)

```javascript
// 1. Is anything over-exposed?
fetch('https://wsoazfbpdsmspygrofjf.supabase.co/rest/v1/courses?select=*', {
  headers: { apikey: 'YOUR_KEY' }
}).then(r => r.json()).then(console.log)

// 2. Is the bucket listable?
fetch('https://wsoazfbpdsmspygrofjf.supabase.co/storage/v1/object/list/receipts', {
  method: 'POST',
  headers: { apikey: 'YOUR_KEY', 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '', limit: 100, offset: 0 })
}).then(r => r.json()).then(console.log)

// 3. Can anon write?
fetch('https://wsoazfbpdsmspygrofjf.supabase.co/storage/v1/object/receipts/test.txt', {
  method: 'POST',
  headers: { apikey: 'YOUR_KEY', 'Content-Type': 'text/plain' },
  body: 'test'
}).then(r => r.status).then(console.log)
```

**If any of these returns data or 200, there is a gap.**

### Standing practices

1. **The publishable key is not a secret** — it ships in client code. That is by design, and it means **policies are the only protection**. Never rely on the key being unknown.
2. **Any policy change requires a matching client change**, or pages render empty.
3. **Back up before changing Supabase policies.**
4. **Re-run the three checks monthly.**

---

## 14. Conclusion

The application is **well built**. RLS holds on every sensitive table, privileged RPCs are correctly denied, Turnstile works, and there is no SQL injection or open redirect. The failures are **forgotten configuration**, not design.

All four vulnerabilities are fixable in **under 30 minutes**. The most severe takes **5 minutes**.

---

**Arabic report:** `deliverables/REPORT-AR.md`
**Images:** `deliverables/images/`
**Full self-verifying package (every request/response/falsification condition):** `report.md`
