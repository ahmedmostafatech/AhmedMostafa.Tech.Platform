# Ahmed Mostafa Tech — منصة المراجعات التعليمية

منصة لبيع مراجعات مسجلة لطلاب الجامعات (EELU أولًا) باشتراك لكل مادة. الهدف أن يعمل الموقع بأتمتة قدر الإمكان، بحيث يصل الطالب لمراجعته حتى لو صاحب المنصة نايم أو مش بيرد على الواتس.

**آخر تحديث:** 2026-11-03

---

## 1. القرارات الأساسية

| البند | القرار |
|---|---|
| البداية | مادة واحدة فقط |
| سعر الاشتراك | 120 جنيه |
| مدة الاشتراك | لحد آخر الترم (تاريخ `access_until` في جدول المواد) |
| الدرس المجاني | درس واحد مفتوح من غير تسجيل |
| الأدمن | شخص واحد (صاحب المنصة) |
| التكلفة | صفر، من غير أي خدمة مدفوعة أو دومين |
| الفيديو | يوتيوب Unlisted مدمج في الصفحة، والتحميل أوفلاين غير مطلوب |
| الدفع | فودافون كاش وإنستاباي (حسابين منفصلين) |
| خطة الدفع | **أ)** قبول يدوي بضغطة زر أولًا، ثم **ب)** مطابقة تلقائية برسالة SMS كطبقة فوقه |
| اللغة والأرقام | واجهة عربية RTL، وأرقام لاتينية (120.37) |
| التقنيات | HTML/CSS/JS عادي (ES Modules) + Supabase، من غير build ولا framework |
| الاستضافة المقترحة | Cloudflare Pages أو Netlify |

### ملاحظات صريحة على القرارات
- **حماية رابط الفيديو غير ممكنة 100% مع يوتيوب.** الـ video ID لازم يوصل لمتصفح الطالب عشان الفيديو يشتغل. بنقلل الخطر بثلاث طبقات: تخزين الـ ID في جدول محمي بـ RLS، وعلامة مائية بإيميل الطالب فوق الفيديو، وفيديو Unlisted مش Public. السعر قليل فالخسارة الفعلية صغيرة.
- **أتمتة كاملة 100% مع دفع يدوي مستحيلة.** مفيش API مجاني يقول للموقع إن الفلوس وصلت. لذلك: (أ) ثم (ب) مع (أ) كخطة احتياطية.
- **خيار (ج) بوابة دفع (Kashier):** حسب موقعهم الرسمي الرسوم 2.85% + 3 جنيه للعملية (حوالي 6.42 جنيه على 120 جنيه) من غير رسوم شهرية. لسه محتاج التأكد من: المستندات المطلوبة للتفعيل (هل فريلانسر من غير سجل تجاري يقدر؟)، ودعم فودافون كاش وإنستاباي (صفحتهم بتقول كروت فقط والمحافظ "قريبًا"، وممكن تكون قديمة)، وتوفر الـ Webhook.
- **Vercel Hobby** للاستخدام غير التجاري حسب علمي، فاخترنا Cloudflare/Netlify. راجع الشروط الحالية قبل النشر.

---

## 2. هيكل المشروع

```text
AhmedMostaf.Tech.Platform/
├── index.html, course.html, login.html
├── checkout.html, dashboard.html, watch.html
├── admin/ (index, orders, students, subscriptions, content).html
├── assets/
│   ├── css/    base.css, layout.css, components.css, admin.css
│   ├── img/
│   └── js/
│       ├── core/        config, supabase-client, auth, guard, utils
│       ├── services/    courses, orders, subscriptions, admin
│       ├── components/  navbar, player, toast
│       └── pages/       ملف لكل صفحة (+ admin/)
├── supabase/
│   ├── sql/        01_schema, 02_seed, 03_make_admin
│   └── functions/  notify-telegram, send-activation-email (لسه)
├── _headers, .gitignore, README.md
```

### قاعدة الطبقات
```text
صفحة HTML  ←  pages/xxx-page.js  ←  services/xxx-service.js  ←  supabase-client.js
```
- الصفحة تتعامل مع الـ DOM فقط.
- كل الكلام مع Supabase يتم داخل `services/` فقط.
- `guard.js` تجربة مستخدم فقط، **الحماية الحقيقية هي RLS في قاعدة البيانات**.

---

## 3. قاعدة البيانات (Supabase)

**الملفات:** `supabase/sql/01_schema_ahmed_mostafa_tech_v1.sql` و`02_seed_test_data_v1.sql` و`03_make_admin_v1.sql`.

**الجداول:** `profiles` و`courses` و`modules` و`videos` و`video_sources` و`orders` و`subscriptions`.

**نقاط الأمان:**
- روابط اليوتيوب في `video_sources` (جدول منفصل). تظهر للأدمن، أو للدرس المجاني، أو لصاحب اشتراك ساري فقط.
- `profiles`: المستخدم يعدّل `full_name` فقط، ولا يقدر يعدّل `is_admin`.
- كل عمليات الدفع تمر من دوال `security definer` فقط: `create_order` و`submit_payment` و`approve_order` و`reject_order`.
- صور الإيصالات في Bucket خاص `payment-proofs`، كل طالب في فولدر باسم الـ id بتاعه.
- انتهاء الاشتراك أوتوماتيك: `has_access()` بتقارن `ends_at` بالوقت الحالي، فمفيش مهمة مجدولة.

**تدفق الدفع:**
1. الطالب يضغط اشترك فيتم إنشاء طلب بـ **مبلغ فريد** (مثلًا 120.37)، متحجوز 60 دقيقة.
2. يحوّل المبلغ ويكتب رقم العملية (UNIQUE في الداتابيز) ويرفع صورة الإيصال. الحجز يتمدد 12 ساعة.
3. الأدمن يقارن المبلغ والرقم بإشعار محفظته **الحقيقي** (مش بالصورة) ويضغط قبول.
4. `approve_order` تفعّل الاشتراك لحد نهاية يوم `access_until` بتوقيت القاهرة.

---

## 4. إعداد المشروع من الصفر

1. **Supabase:** أنشئ مشروع، وشغّل ملفي `01` و`02` في SQL Editor.
2. **`assets/js/core/config.js`:** ضع `SUPABASE_URL` والمفتاح **العلني فقط** (anon أو publishable)، وأرقام استلام الفلوس في `PAYMENT_ACCOUNTS`.
   - ممنوع منعًا باتًا وضع `service_role` أو أي مفتاح secret. الكود نفسه بيرفضه.
3. **Google Cloud Console:** أنشئ OAuth client من نوع Web application، وخلي حالة التطبيق **In production** (وإلا غيرك لن يقدر يدخل). Redirect URI هو الـ Callback URL اللي تنسخه من صفحة Google provider في Supabase.
4. **Supabase ← Authentication ← Providers ← Google:** فعّله والصق Client ID وSecret.
5. **Supabase ← Authentication ← URL Configuration:**
   - Site URL: `http://127.0.0.1:5500`
   - Redirect URLs: `http://127.0.0.1:5500/login.html` و`http://localhost:5500/login.html`
6. **التشغيل محليًا:** Live Server على `http://127.0.0.1:5500/login.html`. الكود يأخذ الرابط من `window.location.origin` فلازم تفتح من نفس العنوان المسجّل دايمًا.
7. **بعد أول تسجيل دخول:** شغّل `03_make_admin_v1.sql` بعد وضع جيميلك.

---

## 5. حالة التقدم

- [x] تحليل البريف و"المحكمة" واتخاذ القرارات
- [x] قاعدة البيانات والدوال وسياسات RLS (اتشغّلت في Supabase بدون أخطاء)
- [x] هيكل المشروع وتهيئة Git
- [x] ملفات `core/` الخمسة: config, supabase-client, utils, auth, guard
- [x] `base.css` و`layout.css` و`components.css`
- [x] `login.html` و`login-page.js` (الكود جاهز)
- [x] إعداد Supabase والاتصال شغّال (`supabase-client.js` بيتحمّل بدون خطأ)
- [ ] **قيد الحل:** التأكد إن `login-page.js` بيتحمّل في الصفحة وإن صفحة الدخول بتظهر
- [ ] إعداد Google OAuth وتجربة الدخول فعليًا
- [ ] ترقية الحساب لأدمن
- [ ] **اختبار RLS من المتصفح** (انظر القسم 7)
- [ ] ملء أرقام الاستلام في `config.js`

---

## 6. المشاكل اللي قابلتنا وحلولها

| # | المشكلة | السبب | الحل |
|---|---|---|---|
| 1 | الملفات اتعملت جوه فولدر داخل فولدر | تم تشغيل السكريبت داخل فولدر جديد | فتح الفولدر الداخلي كجذر، أو نقل المحتوى لفوق بسكريبت PowerShell |
| 2 | اختبار RLS في SQL Editor ما أثبتش حاجة | المحرر بيعرض نتيجة آخر استعلام فقط، والجداول كانت فاضية، و`set local role` برا transaction مش موثوق | استبداله باختبار من المتصفح بصفة زائر (انظر القسم 7) |
| 3 | `favicon.ico` 404 في الـ Console | المتصفح بيطلب الأيقونة تلقائيًا | غير ضار. أضفنا `<link rel="icon" href="data:,">` |
| 4 | صفحة `login.html` بيضاء | الملف كان **0 bytes** (الكود ما اتلصقش أو ما اتحفظش) | تشخيص بـ `Get-ChildItem` وقراءة الأحجام، ثم لصق الكود و`Ctrl + S` |
| 5 | الصفحة ظاهرة بالخلفية لكن المحتوى مخفي | سطر `<script type="module">` ناقص (قايمة `document.scripts` فيها inline فقط) والـ `guard-pending` فضلت شغالة | إعادة لصق الجزء الأخير من الملف مع إغلاق `</section>` و`</main>` |
| 6 | `Unexpected identifier 'pasting'` | كتابة `allow pasting` مرة تانية بعد تفعيل اللصق | غير ضار. تُكتب مرة واحدة في كل جلسة DevTools |
| 7 | أوامر PowerShell متعددة الأسطر مفيش نتيجة | PowerShell بيستنى Enter إضافي بعد اللصق | ضغط Enter، أو استخدام أمر في سطر واحد |

### طريقة تشخيص سريعة لأي صفحة بيضاء
1. `Ctrl + U`: هل الملف فيه محتوى وكامل؟
2. Console: `document.documentElement.className` (لو `guard-pending` فالـ JS ما كملش).
3. Console: `Array.from(document.scripts).map(function (s) { return s.src || 'inline'; })`.
4. Network ← فلتر JS ← `Ctrl + Shift + R`: ابحث عن أي طلب أحمر أو 404.
5. أول سطر أحمر في الـ Console هو غالبًا السبب والباقي نتايج له.

---

## 7. اختبار RLS من المتصفح (لسه ما اتعملش)

افتح أي تبويب، `F12 ← Console`، واكتب `allow pasting` (مرة واحدة) ثم الصق:

```js
// test_rls_anon_v1.js
// اختبار سياسات الأمان من المتصفح بصفة زائر (anon)

let SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
let ANON_KEY = 'YOUR_PUBLIC_KEY';

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

**النتيجة الصحيحة (بعد تشغيل ملف `02` وفيه بيانات):**
- `videos`: الدرسين ظاهرين، والمجاني فقط معاه `youtube_id`، والمدفوع `video_sources: null`.
- `video_sources`: صف واحد فقط (المجاني).
- `orders` و`subscriptions` و`profiles`: `[]`.

**لو الدرس المدفوع ظهر له `youtube_id`: وقّف وراجع سياسات RLS قبل أي خطوة.**

---

## 8. اللي لسه هنعمله (بالترتيب)

1. إنهاء تسجيل الدخول بجوجل واختباره، وترقية الحساب لأدمن، واختبار RLS.
2. **العرض:** `index.html` و`course.html` والدرس المجاني.
3. **الدفع:** `checkout.html` و`orders-service.js` (المبلغ الفريد، رقم العملية، رفع الإيصال، حالة الطلب).
4. **أدمن الطلبات:** `admin/orders.html` (قبول ورفض).
5. **الطالب:** `dashboard.html` و`watch.html` مع العلامة المائية.
6. **باقي الأدمن:** الإحصائيات والطلاب والاشتراكات والمحتوى.
7. **الأتمتة:** إشعار تليجرام بزر قبول (Edge Function) وإيميل التفعيل.
8. **النشر** على Cloudflare Pages، وإضافة رابط `pages.dev` لإعدادات Supabase وGoogle.
9. **طبقة (ب):** مطابقة الدفع تلقائيًا بـ SMS (انظر القسم 9).
10. ملف `_headers` (Security headers وCSP)، و`.gitignore`، وأول commit.

---

## 9. طبقة (ب): المطابقة التلقائية بـ SMS (لاحقًا)

**الفكرة:** موبايل أندرويد قديم متوصل بالشاحن والنت، فيه تطبيق يلتقط رسالة استلام الفلوس ويبعتها لـ Supabase Edge Function. الدالة تقرأ المبلغ، وتدوّر على طلب معلق بنفس المبلغ بالظبط خلال آخر 60 دقيقة، وتفعّل الاشتراك وتبعت الإيميل.

**قبل ما نبنيها:**
- **جرّب أولًا:** حوّل 5 جنيه لنفسك على فودافون كاش وإنستاباي، وشوف هل بتوصل رسالة SMS وشكلها إيه. مش كل جهة بتبعت SMS عند استلام تحويل إنستاباي.
- **الأمان:** فلتر التطبيق يرسل فقط رسائل "استلام مبلغ"، لأن إرسال كل الرسائل معناه وصول أكواد OTP للمحفظة والبنك للسيرفر.
- **خط ومحفظة مخصصين** للمنصة، مش الرقم الشخصي.
- **راجع حدود الاستلام الشهرية** للمحفظة.
- **الـ endpoint** محمي بمفتاح سري (token) في الـ header.
- **خطة احتياطية دايمًا:** أي طلب ما اتطابقش (الموبايل مقفول أو المبلغ غلط) ينزل لتليجرام بزر قبول يدوي.

---

## 10. نقاط للمراجعة والتأكد قبل الإطلاق

- **نسخة Supabase JS:** مثبتة على `2.110.1` من مصدر غير رسمي. لو ظهر 404 على رابط الـ CDN، غيّرها لـ `@2` في `supabase-client.js`.
- **الإيميل:** Gmail عن طريق Apps Script له حد يومي (حوالي 100 إيميل للحساب العادي حسب علمي). تأكد من الحد الحالي.
- **Supabase المجاني** بيوقف المشروع لو مفيش نشاط لفترة، فراجع الشرط الحالي وفكر في ping دوري.
- **علامة مائية بإيميل الطالب** فوق الفيديو (في `player.js`)، وهي أهم رادع ضد التسريب.
- **بدون دومين:** الموقع هيشتغل على `pages.dev`. ده مقبول للبداية، لكن ثقة الطالب قبل الدفع تحتاج درس مجاني وصفحة حالة واضحة للطلب.

---

## 11. قواعد الكتابة في المشروع

- `let` بدل `const`، وfunction declarations بدل arrow functions، و`async/await` بدل `.then()`.
- التعليقات بالعربي، ورسائل الـ console واللوجات بالإنجليزي.
- الحاجات اللي بتظهر للمستخدم بالعربي.
- أسماء الملفات والسكريبتات مميزة بإصدار (`_v1`, `_v2`) عشان ما نمسحش نسخة شغالة. الـ SQL بالذات.
- أي نص ديناميكي يتحط في `innerHTML` لازم يتمرر على `escapeHtml()`.
- ممنوع أي سر (مفاتيح، توكن تليجرام) في الواجهة. مكانه Edge Functions secrets.