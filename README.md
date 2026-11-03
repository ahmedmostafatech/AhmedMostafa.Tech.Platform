# Ahmed Mostafa Tech — منصة المراجعات التعليمية

منصة لبيع مراجعات مسجلة لطلاب الجامعات (EELU أولًا) باشتراك لكل مادة، بأتمتة قدر الإمكان، بحيث يوصل الطالب لمراجعته حتى لو صاحب المنصة نايم أو مش بيرد على الواتس.

**آخر تحديث:** 2026-11-03

---

## 1. القرارات الأساسية

| البند | القرار |
|---|---|
| البداية | مادة واحدة منشورة، سعر الاشتراك 120 جنيه (`price_egp`) |
| مدة الاشتراك | لحد نهاية يوم `courses.access_until` بتوقيت القاهرة |
| الدرس المجاني | درس واحد مفتوح من غير تسجيل |
| الأدمن | شخص واحد (صاحب المنصة) |
| التكلفة | صفر، من غير خدمات مدفوعة ولا دومين |
| الفيديو | يوتيوب Unlisted مدمج، التحميل أوفلاين غير مطلوب |
| الدفع | فودافون كاش وإنستاباي (حسابين منفصلين في `PAYMENT_ACCOUNTS`) |
| خطة الدفع | **أ)** قبول يدوي بضغطة زر أولًا، ثم **ب)** مطابقة تلقائية بـ SMS فوقه |
| تسجيل الدخول | إيميل وباسورد **وجوجل** (الاتنين موجودين) |
| تأكيد الإيميل | **Confirm email مقفول** (انظر القسم 5) |
| نسيت كلمة المرور | **اتشال من الواجهة**، وبدله "تواصل معنا" على واتساب |
| تفعيل الاشتراك | على الإيميل المسجّل به الطالب فقط |
| بيانات الطالب | الاسم ورقم الموبايل إجباريين قبل الدفع (بيتجمعوا في التسجيل أو في صفحة الدفع لو دخل بجوجل) |
| التقنيات | HTML/CSS/JS عادي (ES Modules) + Supabase، من غير build |
| الاستضافة | Cloudflare Pages (انظر القسم 13) |
| الواجهة | عربي RTL، أرقام لاتينية (120.37) |

---

## 2. الأساسيات اللي ما تتغيرش (اقرأها قبل أي تعديل)

1. **الحماية الحقيقية في RLS داخل Supabase، مش في الواجهة.** `guard.js` وأي فحص في الصفحات تجربة مستخدم فقط.
2. **الطالب ما يكتبش على `orders` ولا `subscriptions` مباشرة.** كل عمليات الدفع تمر من دوال معينة (القسم 4.3). مفيش سياسة كتابة للطالب على الجداول دي.
3. **أسماء الدوال وبارامتراتها عقد بين الداتابيز والواجهة.** تغيير اسم بارامتر في أي طرف = كسر. غيّر الطرفين مع بعض.
4. **أسماء الدوال المصدّرة من ملفات `core/` و`services/` عقد بين الملفات** (القسم 8). ما تغيّرش اسم ولا شكل الإرجاع من غير ما تدوّر على كل مكان بيستخدمه وتعدّله في نفس الوقت (حصلت مشكلة اسم `checkCourseAccess` وكسرت الصفحة).
5. **روابط اليوتيوب في `video_sources` فقط**، وبتظهر للأدمن أو للدرس المجاني أو لصاحب اشتراك ساري.
6. **الموبايل بيتعدّل عبر `update_my_profile` فقط.** `is_admin` ما يتعدّلش من الواجهة أبدًا، بالـ SQL بس. (متأكد: الطالب يقدر يعدّل `full_name` مباشرة وبس.)
7. **مفتاح `service_role` ممنوع في الواجهة.** `config.js` فيه المفتاح العلني فقط، و`supabase-client.js` بيرفض أي secret.
8. **أي تغيير في الداتابيز = سكريبت SQL جديد بإصدار** (`_v2` وهكذا) محفوظ في `supabase/sql/`، مش تعديل يدوي من Table Editor.
9. **بعد أي تعديل في الأعمدة أو الدوال:** شغّل `notify pgrst, 'reload schema';`.
10. **أي نص ديناميكي داخل `innerHTML`** لازم يعدّي على `escapeHtml()`.
11. **أسماء الأعمدة الفعلية:** `courses.price_egp` (مش `price`)، ومفيش `videos.duration_sec`. أي استعلام لازم يستخدم الأسماء من القسم 4.1.
12. **`has_access()` هي المرجع الحقيقي للاشتراك الساري**، وملهاش استثناء للأدمن. حسابك كأدمن مش هيتعامل كمشترك، فاختبر الشراء بحساب طالب تجريبي.
13. **`[hidden]` لازم يغلب `display`:** في `base.css` سطر `[hidden] { display: none !important; }`، من غيره صناديق الأخطاء والأزرار المخفية بتظهر.

---

## 3. هيكل المشروع

```text
AhmedMostaf.Tech.Platform/
├── index.html, course.html, login.html, checkout.html, dashboard.html, watch.html
├── admin/  (index, orders, students, subscriptions, content).html
├── assets/
│   ├── css/  base, layout, components, admin
│   ├── img/
│   └── js/
│       ├── core/        config, supabase-client, auth, guard, utils
│       ├── services/    courses, orders, subscriptions, admin
│       ├── components/  navbar, player, toast
│       └── pages/       ملف لكل صفحة (+ admin/)
├── supabase/
│   ├── sql/        سكريبتات الداتابيز (القسم 4.6)
│   └── functions/  notify-telegram, send-activation-email (لسه ما اتعملوش)
├── _headers, .gitignore, README.md
```

### قاعدة الطبقات
```text
صفحة HTML  ←  pages/xxx-page.js  ←  services/xxx-service.js  ←  supabase-client.js
```
- الصفحة تتعامل مع الـ DOM فقط.
- كل الكلام مع Supabase داخل `services/` (و`auth.js`) فقط.

---

## 4. قاعدة البيانات (Supabase)

### 4.1 الجداول (الأعمدة الفعلية)

| الجدول | الأعمدة |
|---|---|
| `profiles` | `id`, `email`, `full_name`, `phone`, `profile_complete`, `is_admin`, `created_at` |
| `courses` | `id`, `title`, `description`, `price_egp` (integer), `access_until` (date), `is_published`, `created_at` |
| `modules` | `id`, `course_id`, `title`, `sort_order` |
| `videos` | `id`, `course_id`, `module_id`, `title`, `sort_order`, `is_free`, `created_at` |
| `video_sources` | `video_id` (PK, FK على videos بـ cascade), `youtube_id` — **مفيهوش `id`** |
| `orders` | `id`, `user_id`, `course_id`, `base_price`, `amount`, `unique_amount`, `payment_method`, `tx_reference` (UNIQUE), `proof_path`, `status`, `expires_at`, `reviewed_at`, `reject_reason`, `created_at` |
| `subscriptions` | `id`, `user_id`, `course_id`, `order_id`, `starts_at`, `ends_at`, `status`, `created_at` — فريد على `user_id + course_id` |

قيود: `orders.payment_method` ∈ (`vodafone_cash`, `instapay`)، و`orders.status` ∈ (`pending`, `paid`, `rejected`, `expired`)، و`subscriptions.status` ∈ (`active`, `suspended`).

**شكل الاستعلام المتداخل:** `videos(... video_sources(youtube_id))` بيرجع `video_sources` كـ **object أو null** (مش array)، لأن `video_id` هو الـ PK. أي كود لازم يقرا `video.video_sources && video.video_sources.youtube_id`، مش `video_sources[0]`.

### 4.2 رقم الموبايل
- بيتخزن بصيغة موحدة `01xxxxxxxxx` (القيد `profiles_phone_format_chk`).
- بيتوحد بدالة `normalize_eg_phone` وبتقبل: `+20` / `0020` / `20` / أرقام هندية / مسافات.
- بيتحفظ من مكانين: وقت التسجيل (الـ trigger يقرأه من metadata)، وعبر `update_my_profile`.
- الطالب يشوف رقمه فقط، والأدمن يشوف الكل. **ما يتعرضش في أي صفحة عامة.**

### 4.3 الدوال (العقد مع الواجهة وسلوكها الفعلي)

| الدالة | البارامترات | ترجع | بتعمل إيه فعلًا |
|---|---|---|---|
| `update_my_profile` | `p_full_name`, `p_phone` (الاتنين اختياريين) | `profiles` | تحديث الاسم والموبايل بعد التحقق، وتحدد `profile_complete` |
| `create_order` | `p_course_id`, `p_payment_method` | **صف `orders` كامل** | لو للطالب طلب `pending` على نفس المادة: ترجعه **وتحدّث وسيلة الدفع عليه**. غير كده تنشئ طلب بمبلغ فريد = السعر + (1 لـ 99 قرش)، وتحجزه 60 دقيقة. بترفض لو المادة منتهية أو الطالب مشترك فعلًا |
| `submit_payment` | `p_order_id`, `p_tx_reference`, `p_proof_path` (اختياري) | void | رقم العملية **4 خانات على الأقل** وبيتحول لحروف كبيرة، وبيمدد الحجز 12 ساعة. **الطلب بيفضل `pending`** |
| `approve_order` | `p_order_id` | void | أدمن فقط. بتحوّل الطلب لـ `paid` وتعمل/تجدد الاشتراك لحد نهاية يوم `access_until` بتوقيت القاهرة. لو الطلب `paid` بترجع من غير خطأ. **مش بتفحص إن الطلب فيه رقم عملية ولا إنه مش `rejected`** |
| `reject_order` | `p_order_id`, `p_reason` (اختياري) | void | أدمن فقط |

دوال مساعدة: `is_admin()` و`has_access(p_course_id uuid)` و`normalize_eg_phone(text)`. (الكل `security definer`.)

**جاهز بس مقفول:** في `create_order` سطور معلّقة بتفرض `profile_complete` قبل الشراء من الداتابيز. فعّلها بسكريبت `09b` لو عايز الإلزام الحقيقي (دلوقتي الواجهة بس بتفرضه).

**رسائل الأخطاء اللي بترميها الدوال** (مترجمة في `getErrorMessage`):
`not authenticated`, `invalid payment method`, `course not found`, `course access period ended`, `already subscribed`, `no free amount, try again later`, `invalid reference`, `order not found or already processed`, `order not found`, `forbidden`, `invalid name`, `invalid phone`, `profile not found`.

### 4.4 سياسات الأمان (RLS) — اتأكدت من الداتابيز
- `courses`: قراءة لو منشورة أو أدمن، والكتابة للأدمن.
- `modules` / `videos`: قراءة لو المادة منشورة أو أدمن، والكتابة للأدمن.
- `video_sources`: قراءة للأدمن، أو لو الفيديو `is_free`، أو `has_access` للمادة. الكتابة للأدمن.
- `orders` / `subscriptions`: قراءة بتاعت الطالب أو أدمن، والكتابة للأدمن فقط.
- `profiles`: قراءة صفه أو أدمن. تعديل مباشر لـ `full_name` فقط بصلاحية الأعمدة (`is_admin` و`email` و`phone` و`profile_complete` مقفولين).
- الزائر (`anon`) ممنوع من أي كتابة.

### 4.5 التخزين
- Buckets خاصة: `payment-proofs` و`payment-receipts` (الكود بيستخدم الثاني).
- حد 5 ميجا، وصور أو PDF فقط.
- **الرفع والقراءة في فولدر باسم الـ id بتاع الطالب فقط** (`<user_id>/ملف`). **مفيش سياسة UPDATE**، فالرفع لازم `upsert: false` (اسم الملف فيه `Date.now()` عشان ما يتكررش).

### 4.6 سكريبتات `supabase/sql/` (بالترتيب)

| الملف | الغرض | الحالة |
|---|---|---|
| `01_schema_ahmed_mostafa_tech_v1.sql` | الهيكل الأول | حل محله `07` |
| `02_seed_test_data_v2.sql` | مادة CS101 وموديول ودرسين (مجاني ومدفوع) | **اتشغّل** (الـ v1 كان قديم ومش متوافق) |
| `03_make_admin_v1.sql` | ترقية حسابك لأدمن | اتشغّل |
| `04_check_admin_v1.sql` | فحص المستخدمين والأدمن | للفحص |
| `05_fix_profiles_v1.sql`, `06_compat_columns_v*.sql` | ترقيع | حل محلهم `07` |
| **`07_full_schema_v2_with_phone.sql`** | **السكريبت الكامل (آمن للتكرار)** | اتشغّل |
| `08_verify_schema_v2.sql` | فحص الهيكل (47 فحص) | **اتشغّل: كله `true`** |
| **`09_fix_create_order_v1.sql`** | توحيد بارامتر `p_payment_method` | **اتشغّل** |
| `09b_create_order_require_profile_v1.sql` | إلزام اكتمال البيانات من الداتابيز | **اختياري، لسه** |
| `10_admin_reset_password_v1.sql` | تغيير باسورد طالب من عندك (القسم 5) | جاهز، جرّبه على حساب تجريبي |
| `11_unpublish_test_course_v1.sql` | إخفاء مادة (قرار مفتوح، القسم 15) | لسه |
| استعلامات فحص (للقراءة فقط) | أعمدة الجداول وتوقيعات الدوال وكود الدوال والسياسات وصلاحيات `profiles` | اتشغّلوا، النتايج مأخوذة في الأقسام 4.3 و4.4 |

**مشروع جديد من الصفر:** `07` ثم `09` ثم `02` ثم سجّل دخول وشغّل `03`، وبعدها `08`.

---

## 5. تسجيل الدخول والصلاحيات

- **الطلاب:** إيميل وباسورد (`signUpWithEmail` و`signInWithEmail`)، أو جوجل (`signInWithGoogle`). الـ profile بيتعمل بالـ trigger من الـ metadata، من غير `upsert` من الواجهة.
- **الدخول بجوجل بيجي من غير موبايل** → `profile_complete = false` → صفحة الدفع بتعرض خطوة "بياناتك للتواصل" قبل إنشاء الطلب.
- **الأدمن:** أي حساب `profiles.is_admin = true`، وبيتعمل بـ SQL فقط. صفحات `admin/` بتتحمي بـ `requireAdmin()` للتجربة، وبالـ RLS للأمان الحقيقي.
- **Confirm email مقفول** لأن خدمة الإيميل الافتراضية في Supabase بترسل لأعضاء فريقك فقط وبحد حوالي 2 إيميل في الساعة (راجع الحد الحالي). لما الطلاب يزيدوا اربط SMTP خاص (Brevo أو Gmail SMTP) وافتح التأكيد، وساعتها نرجّع "نسيت كلمة المرور".

### نتائج قرار قفل Confirm email
1. أي حد يقدر يسجل بإيميل مش بتاعه. **التفعيل بيتم على الإيميل المسجّل فقط**، فالمتضرر هو صاحب الإيميل الغلط. وصفحة الدفع بتعرض الإيميل بوضوح.
2. **استعادة كلمة المرور مش بتشتغل.** الزر اتشال، وبدله رابط واتساب. لتغيير باسورد طالب:
```sql
   -- 10_admin_reset_password_v1.sql
   -- جرّبه على حساب تجريبي أولًا
   update auth.users
   set encrypted_password = crypt('NEW_PASSWORD_HERE', gen_salt('bf')),
       updated_at = now()
   where email = 'student@example.com';
```
3. **دخول جوجل + إيميل بنفس العنوان:** خطر نظري (حد يسجل بإيميل واحد تاني وباسورد، وبعدين صاحبه يدخل بجوجل ويندمج الحساب). القرار: **جوجل متسيب**، ولازم نعمل اختبار واحد بحسابين تجريبيين (القسم 11.3) ونشوف Supabase بيدمج ولا لأ. المتصفحات المدمجة (فيسبوك/إنستجرام) جوجل بيرفضها، فالإيميل هو البديل ليهم.
4. بوتات التسجيل: يتقفل لاحقًا بكابتشا مجانية (Cloudflare Turnstile).

---

## 6. تدفق الدفع والتفعيل (خيار أ)

1. الطالب يفتح المادة ← "اشترك" ← لو مش مسجل يتحول لصفحة الدخول ويرجع لـ `checkout.html?course_id=...`.
2. لو بياناته ناقصة (جوجل) يكتب الاسم والموبايل → `update_my_profile`.
3. يختار وسيلة الدفع ويضغط "متابعة" ← `create_order` (طلب بمبلغ فريد، محجوز 60 دقيقة). لو رجع للصفحة قبل الإرسال والطلب لسه معلق، بيرجع نفس الطلب ويقدر يغيّر الوسيلة.
4. يحوّل **المبلغ بالظبط** لرقم فودافون كاش أو معرّف إنستاباي (من `PAYMENT_ACCOUNTS.<method>.account`).
5. يكتب رقم العملية (4 خانات+) ويرفع الإيصال (اختياري) ← `submit_payment`، والحجز بيتمدد 12 ساعة. الطلب بيفضل `pending`، ولو الطالب فتح الصفحة تاني يشوف شاشة "قيد المراجعة".
6. الطلب يظهر في `admin/orders.html`. **الأدمن يقارن المبلغ ورقم العملية بإشعار محفظته الحقيقي** (مش بالصورة) ويضغط قبول ← `approve_order`.
7. الاشتراك يتفعل لحد نهاية يوم `access_until`، ويفتح له الفيديو. الانتهاء أوتوماتيك لأن `has_access()` بتقارن بالوقت الحالي.

---

## 7. الفيديو والحماية

- يوتيوب Unlisted مدمج (iframe) في `watch.html` عبر `player.js`.
- **مفيش حماية 100% مع يوتيوب**، لأن الـ ID لازم يوصل للمتصفح. الطبقات: (1) الـ ID خلف RLS، (2) علامة مائية بإيميل الطالب فوق الفيديو (لسه)، (3) Unlisted.
- بدل الأوفلاين: ملخص PDF لكل مراجعة.

---

## 8. عقد الواجهة (الدوال المصدّرة بين الملفات)

**`core/utils.js`:** `qs`, `qsa`, `sitePath`, `getQueryParam`, `sanitizeNextPath`, `escapeHtml`, `formatPrice`, `formatExactAmount`, `formatDate`, `formatDateTime`, `daysLeft`, `debounce`, `copyToClipboard`, `setButtonLoading`, `normalizeArabicDigits`, `validateEgyptianPhone`, `validateEmail`, `validatePassword`, `getErrorMessage` (بتعدّي الرسائل العربية الجاهزة كما هي).

**`core/auth.js`:** `getSession()`, `signInWithGoogle(nextPath)`, `signInWithEmail(email, password)`, `signUpWithEmail(email, password, { fullName, phone })`, `resetPassword(email)` (مش مستخدمة), `updateMyProfile({ fullName, phone })` ← بترجع الـ profile، `consumeNextPath()`, `signOut(redirectPath?)` (بتحوّل للمسار أو للرئيسية)، `getMyProfile(forceRefresh)`, `isAdmin()`, `getDisplayName(profile, session)`, `onAuthChange(callback)`.

**`core/guard.js`:** `requireAuth()` ← session أو null، `requireAdmin()` ← `{ session, profile }` أو null، `redirectIfAuthenticated()` ← true لو حصل تحويل.

**`services/courses-service.js`:** `getPublishedCourse()`, `getFreeVideo(courseId)`, `getVideosCount(courseId)`, `getCourseById(courseId)` (بدون id بترجع الأحدث منشور، وبتفلتر `is_published`). شكل المادة: `{ id, title, description, price_egp, access_until, modules: [{ id, title, sort_order, videos: [{ id, title, is_free, sort_order, video_sources: { youtube_id } | null }] }] }`.

**`services/subscriptions-service.js`:** `getMySubscriptions()`, `getMyOrders()`, `checkCourseAccess(courseId)` (بتنادي `has_access`)، و`checkAccess` اسم قديم لنفسها.

**`services/orders-service.js`:** `createOrder(courseId, method)` ← `{ order_id, amount }`، `uploadReceiptProof(userId, orderId, file)` ← مسار (وبترمي خطأ لو فشل)، `submitPayment(orderId, txRef, proofPath, extra)`, `getOrder(orderId)`, `getActivePendingOrder(courseId)` (بترمي خطأ لو فشل الاستعلام).

**`components/navbar.js`:** `initNavbar({ activePage })`.

**`components/player.js`:** `createSecurePlayer({ containerId, videoId, studentEmail, studentName, onReady, onError })`, `changeVideo(videoId)`.

**`components/toast.js`:** `showToast(message, type, duration)`.

**`services/admin-service.js`:** `getPendingOrders()`, `getAllOrders()`, `approveOrder(orderId)`, `rejectOrder(orderId, reason)`, `getAllSubscriptions()`, `createManualSubscription(userId, courseId, endsAt)`, `updateSubscriptionEnd(subId, endsAt)`, `getAllStudents()`, `getCourseTree()`, `createCourse(...)`, `createModule(...)`, `createVideo(...)`, `updateCourse(...)`, `updateVideo(...)`, `deleteVideo(videoId)`.

**`Edge Functions` (`supabase/functions/`):**
- `notify-telegram`: إشعار الأدمن في تليجرام عند رفع إيصال دفع جديد بزر تفاعلي وتنسيق آمن ضد أخطاء الـ HTML.
- `send-activation-email`: إرسال بريد تفعيل احترافي للطالب عند قبول طلبه من الأدمن عبر Resend API.

---

## 9. حالة الملفات (النموذج الجديد: البراند وإدارة التسجيلات)

| الملف | الحالة |
|---|---|
| `index.html`, `home-page.js` | مكتمل كصفحة هبوط رسمية للبراند واستعراض المراجعات |
| `revisions.html`, `revisions-page.js` | مكتمل لعرض شبكة كل المراجعات المتاحة للزوار ديناميكياً |
| `revision.html`, `revision-page.js` | مكتمل لعرض تفاصيل مراجعة محددة والسعر وزر التسجيل |
| `register.html`, `register-page.js` | مكتمل لتسجيل بيانات الطالب بدون حساب والتحقق من الهاتف والفرع |
| `payment.html`, `payment-page.js` | مكتمل لعرض كود التسجيل (AMT-1001) وإرشادات الدفع وزر واتساب التفاعلي |
| `admin/login.html`, `admin-login-page.js` | مكتمل كشاشة دخول مخصصة للأدمن فقط ومعزولة عن الموقع العام |
| `admin/index.html`, `admin-home-page.js` | مكتمل لعرض الإحصائيات الحية وأحدث طلبات التسجيل |
| `admin/registrations.html`, `admin-registrations-page.js` | مكتمل لإدارة التسجيلات، البحث، الفلاتر، وتأكيد الدفع (Approve) |
| `admin/revisions.html`, `admin-revisions-page.js` | مكتمل لإضافة وتعديل المراجعات والأسعار وتعيين روابط Drive |
| `admin/reports.html`, `admin-reports-page.js` | مكتمل لتصدير كشف الطلاب بـ CSV يدعم العربي في Excel ودليل Sheets |
| `revisions-service.js`, `admin-service.js` | مكتملان ومطابقان لدوال RPC والسياسات الأمنية في الداتابيز |
| `12_new_direction_registrations_v1.sql` | سكريبت قاعدة البيانات للنموذج الجديد جاهز ومنفذ |
| `utils.js`, `auth.js` | اتكتبوا من جديد وراجعتهم (الإصدار الأخير في الشات) |
| `login.html`, `login-page.js` | اتكتبوا من جديد (إيميل + جوجل، من غير نسيت كلمة المرور) |
| `checkout.html`, `checkout-page.js` | اتكتبوا من جديد (بيانات الطالب، اختيار الوسيلة قبل الطلب، رفع الإيصال) |
| `courses-service.js`, `subscriptions-service.js`, `orders-service.js` | اتكتبوا من جديد ومطابقين للداتابيز |
| `course.html`, `dashboard.html`, `watch.html`, `index.html` وملفات الـ JS | اتراجعوا واتحدثوا بالكامل (مطابقين للداتابيز، وإصلاح مسارات التوجيه، ومشغل المشاهدة الآمن) |
| `player.js`, `toast.js` | اتراجعوا واتحدثوا (مشغل nocookie مع علامة مائية عائمة وثابتة بإيميل الطالب، وtoast معقم بـ escapeHtml) |
| `admin-service.js` وكل صفحات `admin/` | اتراجعوا واتحدثوا بالكامل (توحيد القوائم، تصحيح حالة الطلبات `paid`، السعر `price_egp`، منع قبول الطلب بدون مرجع) |
| `base.css`, `layout.css`, `admin.css` | مضبوطين ومدعومين بقاعدة `[hidden] { display: none !important; }` |
| `components.css` | اتراجع، وتمت إضافة `.badge--warning` و`.badge--danger` و`.badge--muted` |
| `_headers`, `.gitignore` | جاهزان للرفع على Cloudflare Pages بحماية ضد التضمين والتجسس وتخزين مؤقت لـ assets |
| `09b_create_order_require_profile_v1.sql` | جاهز للإلزام الصارم لاكتمال بيانات الطالب في الداتابيز |
| `11_unpublish_test_course_v1.sql` | جاهز لإخفاء المادة التجريبية الثانية وإبقاء مادة واحدة منشورة |

---

## 10. الإعداد من الصفر

1. **Supabase:** أنشئ مشروع، وشغّل `07` ثم `09` ثم `02` في SQL Editor، وبعدها `08` وتأكد إن كله `true`.
2. **Authentication ← Providers ← Email:** اقفل **Confirm email**. ومن Providers فعّل **Google** وضيف Client ID وSecret.
3. **`assets/js/core/config.js`:** `SUPABASE_URL` والمفتاح **العلني** فقط، وأرقام الاستلام في `PAYMENT_ACCOUNTS` (شكلها `{ label, account }`).
4. **Authentication ← URL Configuration:** Site URL `http://127.0.0.1:5500`، وRedirect URLs فيها `http://127.0.0.1:5500/login.html`.
5. **التشغيل محليًا:** Live Server على `http://127.0.0.1:5500` (لا تبدّل بين `127.0.0.1` و`localhost`، لأن الجلسة منفصلة بينهم).
6. **سجّل حساب من الموقع، ثم شغّل `03_make_admin_v1.sql`** بإيميلك.
7. **CSS:** في `base.css` أضف `[hidden] { display: none !important; }`، وفي `components.css` أضف `.badge--warning`.

---

## 11. الاختبارات

### 11.1 اختبار الأمان من المتصفح بصفة زائر
افتح `F12 ← Console`، اكتب `allow pasting` مرة واحدة، والصق:

```js
// test_rls_anon_v1.js
// اختبار سياسات الأمان بصفة زائر (anon)

let SUPABASE_URL = 'https://wsoazfbpdsmspygrofjf.supabase.co';
let ANON_KEY = 'sb_publishable_Y1tmeibp1DPVfyuBLixPTw_7WLA0mNv';

// دالة تنادي على جدول وتطبع النتيجة
async function callTable(path) {
  let res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY }
  });
  let data = await res.json();
  console.log('TABLE:', path, '| STATUS:', res.status);
  console.log(JSON.stringify(data, null, 2));
}

async function runTests() {
  await callTable('videos?select=title,is_free,video_sources(youtube_id)&order=sort_order');
  await callTable('video_sources?select=*');
  await callTable('orders?select=*');
  await callTable('subscriptions?select=*');
  await callTable('profiles?select=*');
}

runTests();
```

**المتوقع:** المجاني فقط معاه `youtube_id` (والمدفوع `video_sources: null`)، و`video_sources` فيها صفوف المجاني بس (صف لكل مادة منشورة)، والباقي `[]`. **لو الدرس المدفوع ظهر له ID، وقّف فورًا.** (لسه ما اتعملش.)

### 11.2 اختبار الدورة الكاملة بحساب طالب تجريبي
1. سجّل حساب جديد (اسم وموبايل وإيميل).
2. تأكد في `profiles` إن `full_name` و`phone` اتحفظوا و`profile_complete = true`.
3. اختار المادة ← اشترك ← اختار الوسيلة ← متابعة ← يظهر المبلغ الفريد ورقم الاستلام الصح للوسيلة.
4. ادخل رقم عملية (4 خانات+)، وارفع إيصال، وأكّد.
5. من حسابك كأدمن: الطلب يظهر ← قبول.
6. الطالب يشوف الاشتراك ويفتح الفيديو المدفوع.
7. جرّب: إعادة تحميل صفحة الدفع بعد الإرسال (لازم تعرض "قيد المراجعة")، ورقم عملية مكرر، وإيصال أكبر من 5 ميجا.

### 11.3 اختبار دمج جوجل والإيميل (مرة واحدة)
1. سجّل بإيميل وباسورد بحساب Gmail تجريبي.
2. اخرج، وادخل بزر جوجل بنفس الإيميل.
3. شوف في Authentication ← Users: هل ظهر حساب واحد (مدمج) ولا اتنين؟ سجّل النتيجة هنا واتخذ القرار (القسم 5).

### 11.4 دخول جوجل من غير موبايل
ادخل بجوجل بحساب جديد → اختار مادة → لازم تظهر "بياناتك للتواصل" قبل إنشاء الطلب.

---

## 12. المشاكل اللي قابلتنا وحلولها

| # | المشكلة | السبب | الحل |
|---|---|---|---|
| 1 | فولدر جوه فولدر | تشغيل السكريبت في مكان غلط | فتح الفولدر الداخلي أو نقل المحتوى لفوق |
| 2 | اختبار RLS في SQL Editor ما أثبتش حاجة | المحرر يعرض آخر استعلام فقط، والجداول فاضية | اختبار من المتصفح (11.1) |
| 3 | `favicon.ico` 404 | المتصفح بيطلبها تلقائيًا | غير ضار، `<link rel="icon" href="data:,">` |
| 4 | `login.html` فاضي (0 bytes) | الكود ما اتحفظش | فحص الأحجام بـ PowerShell و`Ctrl + S` |
| 5 | صفحة بيضاء مع ظهور الخلفية | سطر `<script>` ناقص و`guard-pending` شغالة | استكمال آخر الملف |
| 6 | `Unexpected identifier 'pasting'` | كتابة `allow pasting` مرتين | غير ضار |
| 7 | الأدمن بيتحول كطالب | الكود بيطلب أعمدة مش موجودة فالطلب بيفشل 400 | إضافة الأعمدة (السكريبت `07`) |
| 8 | `subscriptions.created_at` و`orders.amount` غير موجودين | كود الواجهة افترض أعمدة ناقصة | إضافتهم في `07` |
| 9 | `create_order` هتفشل | الواجهة تبعت `p_payment_method` والداتابيز `p_method` | `09_fix_create_order_v1.sql` |
| 10 | `refresh_token` 400 وجلسة ضايعة | الجلسة القديمة انتهت | تسجيل دخول جديد |
| 11 | إيميلات التسجيل مش هتوصل | خدمة Supabase الافتراضية للفريق فقط | قفل Confirm email (القسم 5) |
| 12 | عربي مشوّه في التيرمنال | ترميز PowerShell فقط | `-Encoding UTF8` |
| 13 | `column "price" does not exist` عند الـ seed | الـ seed v1 كتب على هيكل قديم | `02_seed_test_data_v2.sql` (`price_egp`، من غير `duration_sec`، مع `course_id`، و`video_sources` من غير `id`) |
| 14 | صفحة الدفع بيضاء بعد التعديل | `checkout-page.js` بيستورد `checkCourseAccess` والملف كان بيصدّر `checkAccess` | الاسمين موجودين دلوقتي (القسم 8) |
| 15 | "المادة غير متاحة" في الدفع | `courses-service.js` بيطلب `price` و`duration_sec` فالاستعلام 400 | استعلام جديد بـ `price_egp` |
| 16 | صناديق خطأ فاضية ظاهرة | `.alert` و`.btn` بـ `display: flex` بتغلب `hidden` | `[hidden] { display: none !important; }` |
| 17 | إنستاباي يعرض رقم فودافون | الكود بيدوّر على `number` وconfig فيه `account` | قراءة `entry.account` |
| 18 | إيصالات ما بتترفعش | رفع بـ `upsert: true` ومفيش سياسة UPDATE، والكود كان بيبلع الخطأ | `upsert: false` وبيرمي الخطأ |
| 19 | رقم عملية 3 خانات بيترفض | `submit_payment` بتطلب 4 | الواجهة بقت 4 |
| 20 | الأدمن بيشوف طلبات كل الطلاب في الـ checkout | استعلامات الطلبات من غير فلتر `user_id` | فلتر `user_id` في `getActivePendingOrder` و`getMyOrders` |
| 21 | `permission denied` بدل سبب الخطأ في تعديل البيانات | fallback مباشر على `profiles` بيترفض بالـ RLS | اتشال، `updateMyProfile` بتنادي الدالة بس |

### تشخيص سريع لأي صفحة بيضاء
1. `Ctrl + U`: هل الملف فيه محتوى كامل؟
2. `document.documentElement.className`: لو `guard-pending` فالـ JS ما كملش.
3. Network ← JS ← `Ctrl + Shift + R`: ابحث عن أي طلب أحمر.
4. أول سطر أحمر في الـ Console هو غالبًا السبب (غالبًا import/export غلط أو عمود مش موجود).

---

## 13. الرفع (Cloudflare Pages)

- **Cloudflare Pages:** باندويدث غير محدود للملفات الثابتة، والاستخدام التجاري مسموح، و500 build في الشهر.
- **ما نستخدمهوش:** Vercel Hobby (غير تجاري)، GitHub Pages (يمنع المواقع التجارية)، Netlify (رصيد شهري وبيوقف الموقع لما يخلص).
- الخطوات: ارفع على GitHub ← Cloudflare ← Workers & Pages ← Connect to Git ← من غير build command.
- **بعد الرفع:** ضيف رابط `xxxx.pages.dev` في Supabase (Site URL وRedirect URLs)، وفي إعدادات Google OAuth (Authorized redirect URI بتاع Supabase بيفضل زي ما هو).
- **`BASE_PATH`** في `config.js` يفضل فاضي طالما الموقع على الجذر.

---

## 14. حالة التقدم

- [x] تحليل البريف والقرارات
- [x] قاعدة البيانات والدوال وRLS (`07`) ومتحققة (`08` كله `true`، وكود الدوال والسياسات اتراجع)
- [x] `09` اتشغّل
- [x] الأدمن مضبوط، ولوحة الأدمن بتفتح
- [x] هيكل المشروع و`core/` والـ CSS
- [x] seed: مادة منشورة بدرسين
- [x] مطابقة استدعاءات `rpc` مع الداتابيز
- [x] صلاحيات `profiles` متأكد منها
- [x] إعادة كتابة: login وcheckout وauth وutils وservices الثلاثة
- [x] مسار رفع الإيصال يبدأ بـ `<user_id>/`
- [x] تطبيق الملفات الجديدة على المشروع والتأكد إن مفيش أخطاء في الـ Console
- [x] إضافات CSS (`[hidden]` و`.badge--warning` و`.badge--danger`)
- [x] تعديلات نصوص `checkout.html` (الحجز ساعة، التأكد من عدم وجود هيدر مكرر، وتنبيه إكمال الهاتف)
- [x] قرار المادة الثانية المنشورة (سكريبت `11_unpublish_test_course_v1.sql` جاهز)
- [ ] قفل Confirm email في لوحة Supabase (لو لسه مقفلتش) وتأكيد إن Google provider شغال
- [ ] اختبار دمج جوجل/إيميل (11.3) واختبار جوجل من غير موبايل (11.4)
- [x] **مراجعة صفحات الطالب:** `course` ثم `dashboard` ثم `watch` + `player.js` ثم `index`
- [x] **مراجعة الأدمن:** `admin-service.js` وصفحات `admin/` (زر القبول لازم يمر على `approve_order` فقط وبشرط وجود مرجع للطلب)
- [x] علامة مائية في المشغل (عائمة متغيرة وثابتة بإيميل الطالب)
- [ ] اختبار الدورة الكاملة (11.2)
- [ ] اختبار الأمان من المتصفح (11.1)
- [x] `09b`: إلزام البيانات من الداتابيز (سكريبت `09b_create_order_require_profile_v1.sql` جاهز)
- [x] إشعار تليجرام (`notify-telegram`) وإيميل التفعيل (`send-activation-email`)
- [x] `_headers` و`.gitignore` جاهزان للرفع على Cloudflare Pages
- [ ] طبقة (ب): المطابقة التلقائية بـ SMS (بعد ما يشتغل كل ما سبق)

---

## 15. نقاط مفتوحة وللمراجعة قبل الإطلاق

- **مادتين منشورتين دلوقتي:** CS101 (من الـ seed) وNetwork Routing & Switching (من `07`، وفيها `FREE_VIDEO_ID` و`PAID_VIDEO_ID` placeholders). القرار الأصلي مادة واحدة. تم تجهيز سكريبت `11_unpublish_test_course_v1.sql` لإخفائها بـ `is_published = false` وإبقاء CS101 فقط. `getPublishedCourse()` بترجع الأحدث منشور.
- **حجز الطلب 60 دقيقة** قبل الإرسال و12 ساعة بعده. لو طالب حوّل وقفل الصفحة وجه بعد ساعة هياخد مبلغ جديد والتحويل القديم هيبقى يتيم. نص صفحة الدفع لازم يوضّح ده.
- **المبلغ الفريد من 1 لـ 99 قرش:** أقصى 99 طلب معلق في نفس الوقت لنفس السعر.
- **`approve_order` مش بتفحص** إن الطلب فيه رقم عملية ولا إنه مش `rejected`/`expired`. زر القبول في لوحة الأدمن لازم يظهر بس للطلبات اللي فيها `tx_reference` وحالتها `pending`.
- **`has_access` للأدمن = false**، اختبر الشراء بحساب طالب تجريبي.
- **نسخة Supabase JS** مثبتة `2.110.1` (من jsDelivr)، شغالة حاليًا.
- **إيميل التفعيل** عبر Apps Script: الحد اليومي لحساب Gmail العادي حوالي 100 إيميل (تأكد من الحد الحالي).
- **Supabase المجاني** بيوقف المشروع عند عدم النشاط لفترة، راجع الشرط الحالي.
- **خيار (ج) Kashier:** رسومه حسب موقعهم 2.85% + 3 جنيه للعملية بدون رسوم شهرية، وده بعد التأكد من المستندات ودعم المحافظ والـ Webhook.
- **الحذف:** حذف مستخدم بيحذف طلباته واشتراكاته (cascade)، فاحتفظ بنسخة قبل أي حذف.
- أرقام الاستلام وعنوان إنستاباي في `config.js` علنية (طبيعي لأنها بتظهر للطالب).

---

## 16. قواعد الكتابة

- `let` بدل `const`، وfunction declarations بدل arrow functions، و`async/await` بدل `.then()`.
- التعليقات بالعربي، واللوجات (`console`) بالإنجليزي، والنصوص اللي بتظهر للمستخدم بالعربي.
- أسماء الملفات والسكريبتات بإصدار (`_v1`, `_v2`) عشان ما نمسحش نسخة شغالة.
- كل ملف JS يتسلّم كامل، واسم الملف فوقه.
- أي دالة جديدة بتتكلم مع Supabase تتحط في `services/` وتتسجل في القسم 8.