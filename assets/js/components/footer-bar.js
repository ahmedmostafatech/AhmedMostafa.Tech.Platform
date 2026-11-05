// ============================================================
// footer-bar.js — الفوتر الكريتيف المشترك + مزامنة الستارة
// الاستخدام: <footer id="site-footer"></footer> ثم السكربت
// ============================================================
(function () {
  var mount = document.getElementById('site-footer');
  if (!mount) return;

  var WA = 'https://wa.me/201558905710';
  var WA_GROUP = 'https://chat.whatsapp.com/BdKGIHxS8hv6cJugkr5HMg';
  var year = new Date().getFullYear();

  var stripItems = [
    'تسجيل فوري وسريع', 'دفع آمن ومعتمد', 'رابط مباشر بجودة Full HD',
    'شرح عملي ليلة الامتحان', 'دعم متواصل على مدار اليوم', 'فودافون كاش',
    'إنستاباي', 'مراجعات حاسبات وهندسة', 'نماذج امتحانات السنوات السابقة'
  ];
  var stripHtml = stripItems.concat(stripItems).map(function (t) {
    return '<span class="cf-strip-item">' + t + '</span>';
  }).join('');

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

      <div class="cf-cta">
        <div>
          <span class="cf-badge"><i class="fa-solid fa-sparkles"></i> جاهز تبدأ؟</span>
          <h2>ابدأ مراجعتك <span>دلوقتي</span> واضمن النجاح</h2>
          <p>سجّل في دقيقة، حوّل، واستلم رابط المراجعة على طول. انضم لمئات الطلاب اللي اجتازوا امتحاناتهم.</p>
        </div>
        <div class="cf-cta-btns">
          <a href="revisions.html" class="cf-btn cf-btn--solid magnetic-btn">
            <i class="fa-solid fa-graduation-cap"></i> احجز مراجعتك
          </a>
          <a href="${WA}" target="_blank" rel="noopener" class="cf-btn cf-btn--wa magnetic-btn">
            <i class="fa-brands fa-whatsapp"></i> تواصل واتساب
          </a>
        </div>
      </div>

      <div class="cf-grid">

        <div class="cf-brand">
          <a class="cf-logo" href="index.html">
            <span class="cf-logo-icon"><i class="fa-solid fa-graduation-cap"></i></span>
            <span>أحمد مصطفى <b>تك</b></span>
          </a>
          <p class="cf-about">مراجعات مسجلة مكثفة لطلاب الحاسبات والمعلومات، تسجيل سريع بدون تعقيد ودعم مباشر.</p>
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
            <a class="cf-link" href="track.html"><i class="fa-solid fa-magnifying-glass"></i> متابعة طلبي</a>
            <a class="cf-link" href="index.html#how-it-works"><i class="fa-solid fa-route"></i> كيفية الاشتراك</a>
            <a class="cf-link" href="${WA}" target="_blank" rel="noopener"><i class="fa-solid fa-headset"></i> الدعم الفني</a>
          </div>
        </nav>

        <div class="cf-col">
          <h4>تواصل معنا</h4>
          <a class="cf-contact" href="${WA}" target="_blank" rel="noopener">
            <span class="cf-contact-icon"><i class="fa-brands fa-whatsapp"></i></span>
            <span><strong>الدعم الفني على واتساب</strong><small>+20 155 890 5710</small></span>
          </a>
          <a class="cf-contact" href="${WA_GROUP}" target="_blank" rel="noopener">
            <span class="cf-contact-icon"><i class="fa-solid fa-users"></i></span>
            <span><strong>جروب الطلاب</strong><small>انضم وناقش مع زمايلك</small></span>
          </a>
          <div class="cf-pay">
            <span style="--d:#ef4444">فودافون كاش</span>
            <span style="--d:#a855f7">إنستاباي</span>
          </div>
        </div>

      </div>

      <div class="cf-bottom">
        <span>© ${year} <em>Ahmed Mostafa Tech</em> — جميع الحقوق محفوظة</span>
        <button type="button" class="cf-top-btn" id="cf-top-btn" title="الرجوع للأعلى" aria-label="الرجوع للأعلى">
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