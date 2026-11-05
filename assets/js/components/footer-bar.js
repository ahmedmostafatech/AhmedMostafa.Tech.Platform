(function () {
  var mount = document.getElementById('footer-bar');
  if (!mount) return;

  mount.className = 'ub';
  mount.innerHTML =
    '<div class="container">' +
    '<div class="ub-top">' +
    '<div>' +
    '<a class="ub-logo" href="index.html">' +
    '<span class="ub-logo-icon"><i class="fa-solid fa-graduation-cap"></i></span>' +
    '<span>أحمد مصطفى <b>تك</b></span>' +
    '</a>' +
    '<p class="ub-about">مراجعات مسجلة مكثفة لطلاب الحاسبات والمعلومات، تسجيل سريع بدون تعقيد ودعم مباشر.</p>' +
    '</div>' +
    '<nav class="ub-col">' +
    '<h4>روابط سريعة</h4>' +
    '<a class="ub-link" href="revisions.html">المراجعات</a>' +
    '<a class="ub-link" href="register.html">التسجيل</a>' +
    '<a class="ub-link" href="track.html">تتبع طلبك</a>' +
    '<a class="ub-link" href="index.html#how-it-works">كيفية الاشتراك</a>' +
    '</nav>' +
    '<div class="ub-col">' +
    '<h4>تواصل معنا</h4>' +
    '<a class="ub-link" href="https://wa.me/201558905710" target="_blank" rel="noopener">الدعم الفني على واتساب</a>' +
    '<div class="ub-social">' +
    '<a href="https://www.youtube.com/@ahmedmostafatech" target="_blank" rel="noopener" title="يوتيوب"><i class="fa-brands fa-youtube"></i></a>' +
    '<a href="https://chat.whatsapp.com/BdKGIHxS8hv6cJugkr5HMg" target="_blank" rel="noopener" title="مجموعة واتساب"><i class="fa-brands fa-whatsapp"></i></a>' +
    '<a href="https://www.linkedin.com/in/ahmed-mostafatech/" target="_blank" rel="noopener" title="لينكدإن"><i class="fa-brands fa-linkedin"></i></a>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="ub-bottom">' +
    '<span>© 2026 Ahmed Mostaf Tech — جميع الحقوق محفوظة</span>' +
    '<button type="button" class="ub-top-btn" id="ub-top-btn" title="الرجوع للأعلى"><i class="fa-solid fa-arrow-up"></i></button>' +
    '</div>' +
    '</div>';

  var topBtn = document.getElementById('ub-top-btn');
  if (topBtn) {
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
