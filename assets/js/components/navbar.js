// ============================================================
// navbar.js
// شريط الملاحة العام للعلامة التجارية Ahmed Mostafa Tech
// (مبسط بدون حسابات طلاب، مع دعم ظهور لوحة الأدمن للأدمن فقط)
// ============================================================

import { getSession, getMyProfile } from '../core/auth.js';
import { escapeHtml, sitePath } from '../core/utils.js';
import { ROUTES, APP_CONFIG } from '../core/config.js';

const LOGO_SVG =
  '<svg class="navbar__logo" xmlns="http://www.w3.org/2000/svg" viewBox="395 350 250 400" aria-hidden="true">' +
  '<path fill="#ffffff" d="M603.7,589.26c-19.66,0.07-38.85,2.04-57.41,5.71l-21.55-52.49l-26.43,66.27c-28.68,10.93-55.13,26.14-78.51,44.82l73.77-184.99l0,0l60.49-0.22l0.12,0.3L603.7,589.26z"/>' +
  '<path fill="#365aa2" d="M638.42,673.8c0.37,0.89-0.5,1.78-1.4,1.44c-17.03-6.31-35.45-9.75-54.67-9.75c-2.36,0-4.7,0.05-7.03,0.16c-45.12,1.98-85.31,22.97-112.75,55.16c-1.14,1.34-2.79,2.13-4.55,2.13l-5.26,0.02l-56.92,0.2c-1.49,0.01-2.48-1.57-1.8-2.9c20.69-40.44,54.88-73.26,96.87-92.94c18.99-8.91,39.57-15.13,61.22-18.14c9.86-1.38,19.94-2.09,30.2-2.09c9.6,0,19.04,0.62,28.29,1.83c0.75,0.1,1.4,0.6,1.68,1.3L638.42,673.8z"/>' +
  '</svg>';

function buildNavHTML(opts) {
  let profile = opts && opts.profile;
  let activePage = opts && opts.activePage;

  function navLink(href, label, key) {
    let isActive = activePage === key ? ' navbar__link--active' : '';
    return `<a href="${escapeHtml(sitePath(href))}" class="navbar__link${isActive}">${escapeHtml(label)}</a>`;
  }

  let isAdmin = profile && profile.is_admin;

  return `
    <nav class="navbar" id="main-navbar" role="navigation" aria-label="القائمة الرئيسية">
      <div class="container">
        <div class="navbar__inner">

          <!-- البراند والشعار -->
            <a href="${escapeHtml(sitePath(ROUTES.HOME))}" class="navbar__brand" aria-label="الصفحة الرئيسية">
            ${LOGO_SVG}
            <span class="navbar__brand-name">أحمد مصطفى <span>تك</span></span>
          </a>

          <!-- روابط التنقل الأساسية (ديسكتوب) -->
          <div class="navbar__nav" role="list">
            ${navLink(ROUTES.HOME, 'الرئيسية', 'home')}
            ${navLink(ROUTES.REVISIONS, 'المراجعات المتاحة', 'revisions')}
            ${navLink(ROUTES.TRACK, 'متابعة طلبي', 'track')}
            <a href="${escapeHtml(sitePath(ROUTES.HOME))}#how-it-works" class="navbar__link">كيفية الاشتراك</a>
            <a href="https://wa.me/${APP_CONFIG.WHATSAPP_INTL}" target="_blank" rel="noopener" class="navbar__link" style="color:#25d366; display:inline-flex; align-items:center; gap:6px;">
              <i class="fa-brands fa-whatsapp"></i> تواصل واتساب
            </a>
          </div>

          <!-- الأزرار التفاعلية والهمبرجر -->
          <div class="navbar__actions">
            ${isAdmin ? `
              <a href="${escapeHtml(sitePath(ROUTES.ADMIN_HOME))}" class="btn btn--secondary btn--sm nav-admin-badge-btn" style="color:#fcd34d; border-color:rgba(252,211,77,0.4); font-size:0.8rem; min-height:36px; padding:0 12px; gap:6px; display:inline-flex; align-items:center;">
                <i class="fa-solid fa-crown"></i> لوحة الأدمن
              </a>
            ` : ''}

            <a href="${escapeHtml(sitePath(ROUTES.REVISIONS))}" class="btn btn--accent btn--sm nav-cta-book-btn" style="font-size:0.875rem; min-height:38px; font-weight:700;">
              احجز مراجعتك
            </a>

            <!-- زر فتح قائمة الموبايل -->
            <button type="button" class="navbar__mobile-toggle" id="navbar-mobile-toggle" aria-label="فتح القائمة الرئيسية" aria-expanded="false">
              <i class="fa-solid fa-bars"></i>
            </button>
          </div>

        </div>
      </div>

      <!-- قائمة الموبايل المنسدلة (Mobile Drawer) -->
      <div class="navbar__mobile-drawer" id="navbar-mobile-drawer">
        <div class="navbar__mobile-menu">
          ${navLink(ROUTES.HOME, 'الرئيسية', 'home')}
          ${navLink(ROUTES.REVISIONS, 'المراجعات المتاحة', 'revisions')}
          ${navLink(ROUTES.TRACK, 'متابعة طلبي واستلام الوصول', 'track')}
          <a href="${escapeHtml(sitePath(ROUTES.HOME))}#how-it-works" class="navbar__mobile-link">كيفية الاشتراك</a>
          <a href="https://chat.whatsapp.com/BdKGIHxS8hv6cJugkr5HMg" target="_blank" rel="noopener" class="navbar__mobile-link" style="color:#25d366;">
            <i class="fa-brands fa-whatsapp"></i> جروب واتساب المنصة
          </a>
          <a href="https://wa.me/${APP_CONFIG.WHATSAPP_INTL}" target="_blank" rel="noopener" class="navbar__mobile-link">
            <i class="fa-solid fa-headset"></i> تواصل مع الدعم الفني
          </a>
          ${isAdmin ? `
            <a href="${escapeHtml(sitePath(ROUTES.ADMIN_HOME))}" class="navbar__mobile-link" style="color:#fcd34d;">
              <i class="fa-solid fa-crown"></i> لوحة الأدمن
            </a>
          ` : ''}
        </div>
      </div>
    </nav>
  `;
}

export async function initNavbar(opts) {
  let activePage = opts && opts.activePage ? opts.activePage : '';

  let session = null;
  let profile = null;

  try {
    session = await getSession();
    if (session) {
      profile = await getMyProfile(false);
    }
  } catch (err) {
    // الزائر غير مسجل دخول وهذا طبيعي
  }

  let mount = document.getElementById('site-header');
  if (mount) {
    mount.innerHTML = buildNavHTML({ session, profile, activePage });

    // تفعيل تفاعل زر الهامبرجر للقائمة في الموبايل
    const toggleBtn = document.getElementById('navbar-mobile-toggle');
    const drawer = document.getElementById('navbar-mobile-drawer');

    if (toggleBtn && drawer) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = drawer.classList.toggle('is-open');
        toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        toggleBtn.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
      });

      // إغلاق عند النقر على أي رابط داخل القائمة
      drawer.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          drawer.classList.remove('is-open');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        });
      });

      // إغلاق عند النقر في أي مكان خارج القائمة
      document.addEventListener('click', (e) => {
        if (!drawer.contains(e.target) && !toggleBtn.contains(e.target)) {
          drawer.classList.remove('is-open');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        }
      });
    }
  }
}
