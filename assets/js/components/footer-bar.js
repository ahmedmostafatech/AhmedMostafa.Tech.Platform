// ============================================================
// footer-bar.js — الفوتر الكريتيف المشترك + مزامنة الستارة
// الاستخدام: <footer id="site-footer"></footer> ثم السكربت
// البانر (CTA) بيتغير تلقائياً حسب الصفحة.
// اختياري: data-cta="off" أو data-cta="<variant>" على الـ <footer> لتغييره يدوياً.
// ============================================================
(function () {
  var mount = document.getElementById('site-footer');
  if (!mount) return;

  var WA = 'https://wa.me/201558905710';
  var WA_GROUP = 'https://chat.whatsapp.com/BdKGIHxS8hv6cJugkr5HMg';
  var year = new Date().getFullYear();

  // ── ستايل إضافي صغير (للأيقونات في وسائل الدفع) ──
  if (!document.getElementById('cf-extra-style')) {
    var st = document.createElement('style');
    st.id = 'cf-extra-style';
    st.textContent =
      '.cf-pay span::before{display:none !important;}' +
      '.cf-pay span svg{width:18px;height:18px;flex-shrink:0;display:block;}' +
      '.cf-logo-icon{background:none !important;border:none !important;box-shadow:none !important;width:auto !important;height:44px;}' +
      '.cf-logo-icon svg{height:100%;width:auto;display:block;}';
    document.head.appendChild(st);
  }

  // ── أيقونات الدفع ──
  var ICON_VODAFONE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 0A12 12 0 0 0 0 12A12 12 0 0 0 12 24A12 12 0 0 0 24 12A12 12 0 0 0 12 0M16.25 1.12C16.57 1.12 16.9 1.15 17.11 1.22C14.94 1.67 13.21 3.69 13.22 6C13.22 6.05 13.22 6.11 13.23 6.17C16.87 7.06 18.5 9.25 18.5 12.28C18.54 15.31 16.14 18.64 12.09 18.65C8.82 18.66 5.41 15.86 5.39 11.37C5.38 8.4 7 5.54 9.04 3.85C11.04 2.19 13.77 1.13 16.25 1.12Z" fill="#E60000"></path></svg>';

  var ICON_INSTAPAY =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true" style="color:#c084fc">' +
    '<path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="m21.36 15.869l4.546 7.887l-9.278 8.322m-1.874-16.21l4.547 7.888l-9.278 8.322m21.099-14.913h8.13c2.81 0 4.669 1.96 4.166 4.397c-.504 2.436-3.173 4.397-5.984 4.397h-9.762l-1.896 6.173M9.383 16.016l-.936 3.087m-.995 3.287L4.5 32.132"/></svg>';

  var LOGO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="395 350 250 400" aria-hidden="true">' +
    '<path fill="#ffffff" d="M603.7,589.26c-19.66,0.07-38.85,2.04-57.41,5.71l-21.55-52.49l-26.43,66.27c-28.68,10.93-55.13,26.14-78.51,44.82l73.77-184.99l0,0l60.49-0.22l0.12,0.3L603.7,589.26z"/>' +
    '<path fill="#365aa2" d="M638.42,673.8c0.37,0.89-0.5,1.78-1.4,1.44c-17.03-6.31-35.45-9.75-54.67-9.75c-2.36,0-4.7,0.05-7.03,0.16c-45.12,1.98-85.31,22.97-112.75,55.16c-1.14,1.34-2.79,2.13-4.55,2.13l-5.26,0.02l-56.92,0.2c-1.49,0.01-2.48-1.57-1.8-2.9c20.69-40.44,54.88-73.26,96.87-92.94c18.99-8.91,39.57-15.13,61.22-18.14c9.86-1.38,19.94-2.09,30.2-2.09c9.6,0,19.04,0.62,28.29,1.83c0.75,0.1,1.4,0.6,1.68,1.3L638.42,673.8z"/>' +
    '</svg>';

  // ── الشريط المائل ──
  var stripItems = [
    'تسجيل فوري وسريع', 'دفع آمن ومعتمد', 'رابط مباشر بجودة Full HD',
    'شرح عملي ليلة الامتحان', 'دعم متواصل على مدار اليوم', 'فودافون كاش',
    'إنستاباي', 'مراجعات حاسبات وهندسة', 'نماذج امتحانات السنوات السابقة'
  ];
  var stripHtml = stripItems.concat(stripItems).map(function (t) {
    return '<span class="cf-strip-item">' + t + '</span>';
  }).join('');

  // ── تعريف أزرار جاهزة ──
  var BTN = {
    revisions: { href: 'revisions.html', cls: 'cf-btn--solid', icon: 'fa-solid fa-graduation-cap', label: 'احجز مكانك' },
    browse: { href: 'revisions.html', cls: 'cf-btn--solid', icon: 'fa-solid fa-book-open', label: 'شوف المراجعات' },
    track: { href: 'track.html', cls: 'cf-btn--solid', icon: 'fa-solid fa-magnifying-glass', label: 'طلبي وصل فين؟' },
    wa: { href: WA, ext: true, cls: 'cf-btn--wa', icon: 'fa-brands fa-whatsapp', label: 'كلّمني واتساب' },
    waHelp: { href: WA, ext: true, cls: 'cf-btn--wa', icon: 'fa-brands fa-whatsapp', label: 'كلّمني واتساب' },
    group: { href: WA_GROUP, ext: true, cls: 'cf-btn--solid', icon: 'fa-solid fa-users', label: 'جروب الطلاب' }
  };

  // ── أنواع البانر (CTA) ──
  var CTA = {
    default: {
      badge: 'يلا بينا',
      title: 'ابدأ مراجعتك <span>قبل ما الوقت يجري</span>',
      text: 'سجّل في دقيقة، حوّل، والرابط يوصلك على طول. انضم لزمايلك اللي عدّوا امتحاناتهم.',
      btns: [BTN.revisions, BTN.wa]
    },
    browse: {
      badge: 'محتار؟',
      title: 'مش لاقي <span>مادتك</span>؟',
      text: 'كلّمني على واتساب وأنا أساعدك تختار المراجعة المناسبة لمادتك وفرعك.',
      btns: [BTN.waHelp, BTN.group]
    },
    details: {
      badge: 'عندك سؤال؟',
      title: 'لسه <span>محتار</span> قبل ما تشترك؟',
      text: 'اسأل في أي حاجة عن المراجعة أو طريقة الاشتراك، وأنا برد عليك في أقرب وقت.',
      btns: [BTN.waHelp, BTN.browse]
    },
    payment: {
      badge: 'محتاج مساعدة؟',
      title: 'الدفع عمل معاك <span>مشكلة</span>؟',
      text: 'ابعتلي واتساب ومعاك كود التسجيل، وهنحلها سوا.',
      btns: [BTN.waHelp]
    },
    track: {
      badge: 'محتاج مساعدة؟',
      title: 'طلبك محتاج <span>مساعدة</span>؟',
      text: 'لو طلبك اتأخر في المراجعة أو عندك أي سؤال، كلّمني واتساب ومعاك كود التسجيل.',
      btns: [BTN.waHelp, BTN.group]
    }
  };

  // ── تحديد الصفحة الحالية ──
  var file = (location.pathname.split('/').pop() || 'index').replace(/\.html?$/i, '').toLowerCase();
  if (!file) file = 'index';

  // خريطة الصفحة ← نوع البانر (null = بدون بانر)
  var PAGE_CTA = {
    index: 'default',
    revisions: 'browse',
    revision: 'details',
    course: 'details',
    payment: 'payment',
    track: 'track',
    register: null
  };

  var override = mount.getAttribute('data-cta');
  var ctaKey;
  if (override === 'off') ctaKey = null;
  else if (override && CTA[override]) ctaKey = override;
  else ctaKey = Object.prototype.hasOwnProperty.call(PAGE_CTA, file) ? PAGE_CTA[file] : 'default';

  var ctaHtml = '';
  if (ctaKey && CTA[ctaKey]) {
    var c = CTA[ctaKey];
    var btnsHtml = c.btns.map(function (b) {
      var ext = b.ext ? ' target="_blank" rel="noopener"' : '';
      return '<a href="' + b.href + '"' + ext + ' class="cf-btn ' + b.cls + ' magnetic-btn">' +
        '<i class="' + b.icon + '"></i> ' + b.label + '</a>';
    }).join('');

    ctaHtml =
      '<div class="cf-cta">' +
      '<div>' +
      '<span class="cf-badge"><i class="fa-solid fa-sparkles"></i> ' + c.badge + '</span>' +
      '<h2>' + c.title + '</h2>' +
      '<p>' + c.text + '</p>' +
      '</div>' +
      '<div class="cf-cta-btns">' + btnsHtml + '</div>' +
      '</div>';
  }

  mount.className = 'cf';
  mount.innerHTML = `
    <div class="cf-bg">
      <div class="cf-aurora-1"></div>
      <div class="cf-aurora-2"></div>
      <div class="cf-grid-bg"></div>
    </div>
    <div class="cf-strip"><div class="cf-strip-track">${stripHtml}</div></div>
    <div class="cf-giant" aria-hidden="true">AHMED MOSTAFA TECH</div>

    <div class="container cf-inner">

      ${ctaHtml}

      <div class="cf-grid">

        <div class="cf-brand">
          <a class="cf-logo" href="index.html">
            <span class="cf-logo-icon">${LOGO_SVG}</span>
            <span>أحمد مصطفى <b>تك</b></span>
          </a>
          <p class="cf-about">مراجعات مسجلة ومركّزة لطلاب الحاسبات والمعلومات. تسجيل سريع من غير تعقيد، وأنا موجود لو احتجت أي حاجة.</p>
          <div class="cf-social">
            <a href="https://www.youtube.com/@ahmedmostafatech" target="_blank" rel="noopener" title="يوتيوب" style="--c:#ef4444"><i class="fa-brands fa-youtube"></i></a>
            <a href="${WA_GROUP}" target="_blank" rel="noopener" title="جروب واتساب" style="--c:#25d366"><i class="fa-brands fa-whatsapp"></i></a>
            <a href="https://www.linkedin.com/in/ahmed-mostafatech/" target="_blank" rel="noopener" title="لينكدإن" style="--c:#0a66c2"><i class="fa-brands fa-linkedin-in"></i></a>
          </div>
        </div>

        <nav class="cf-col" aria-label="روابط الموقع">
          <h4>روابط الموقع</h4>
          <div class="cf-links">
            <a class="cf-link" href="index.html"><i class="fa-solid fa-house"></i> الرئيسية</a>
            <a class="cf-link" href="revisions.html"><i class="fa-solid fa-book-open"></i> المراجعات</a>
            <a class="cf-link" href="register.html"><i class="fa-solid fa-pen-to-square"></i> التسجيل</a>
            <a class="cf-link" href="track.html"><i class="fa-solid fa-magnifying-glass"></i> طلبي وصل فين؟</a>
            <a class="cf-link" href="index.html#how-it-works"><i class="fa-solid fa-route"></i> إزاي أشترك؟</a>
            <a class="cf-link" href="${WA}" target="_blank" rel="noopener"><i class="fa-solid fa-headset"></i> كلّمني</a>
          </div>
        </nav>

        <div class="cf-col">
          <h4>كلّمني</h4>
          <a class="cf-contact" href="${WA}" target="_blank" rel="noopener">
            <span class="cf-contact-icon"><i class="fa-brands fa-whatsapp"></i></span>
            <span><strong>كلّمني على واتساب</strong><small>+20 155 890 5710</small></span>
          </a>
          <a class="cf-contact" href="${WA_GROUP}" target="_blank" rel="noopener">
            <span class="cf-contact-icon"><i class="fa-solid fa-users"></i></span>
            <span><strong>جروب الطلاب</strong><small>انضم وناقش مع زمايلك</small></span>
          </a>
          <div class="cf-pay">
            <span>${ICON_VODAFONE} فودافون كاش</span>
            <span>${ICON_INSTAPAY} إنستاباي</span>
          </div>
        </div>

      </div>

      <div class="cf-bottom">
        <span>© ${year} <em>Ahmed Mostafa Tech</em> — جميع الحقوق محفوظة</span>
        <button type="button" class="cf-top-btn" id="cf-top-btn" title="اطلع فوق" aria-label="اطلع فوق">
          <i class="fa-solid fa-arrow-up"></i>
        </button>
      </div>

    </div>
  `;

  // زر الرجوع للأعلى
  var topBtn = document.getElementById('cf-top-btn');
  if (topBtn) {
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // مزامنة الستارة: بتظبط margin-bottom على حسب ارتفاع الفوتر
  var curtain = document.getElementById('main-curtain');

  function sync() {
    if (!curtain) {
      mount.classList.add('cf--static');
      return;
    }
    mount.classList.remove('cf--static');
    var h = mount.offsetHeight;

    // لو الفوتر أطول من الشاشة، نرجعه عادي بدل ما ينقطع
    if (h > window.innerHeight - 60) {
      mount.classList.add('cf--static');
      curtain.style.marginBottom = '0px';
    } else {
      curtain.style.marginBottom = h + 'px';
    }
  }

  sync();
  window.addEventListener('load', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
})();