// ============================================================
// navbar.js
// مكوّن الـ Navbar المشترك بين كل الصفحات
// ============================================================

import { getSession, getMyProfile, signOut } from '../core/auth.js';
import { escapeHtml, sitePath } from '../core/utils.js';
import { ROUTES } from '../core/config.js';

// ========== HTML الـ Navbar ==========

function buildNavHTML(opts) {
  let isLoggedIn = opts && opts.session;
  let profile    = opts && opts.profile;
  let activePage = opts && opts.activePage;

  let displayName = '';
  if (profile && profile.full_name) {
    displayName = profile.full_name.split(' ')[0]; // الاسم الأول فقط
  } else if (isLoggedIn) {
    displayName = isLoggedIn.user.email.split('@')[0];
  }

  let initials = displayName ? displayName.charAt(0).toUpperCase() : '؟';

  function navLink(href, label, key) {
    let isActive = activePage === key ? ' navbar__link--active' : '';
    return `<a href="${escapeHtml(sitePath(href))}" class="navbar__link${isActive}">${escapeHtml(label)}</a>`;
  }

  return `
    <nav class="navbar" id="main-navbar" role="navigation" aria-label="القائمة الرئيسية">
      <div class="container">
        <div class="navbar__inner">

          <!-- البراند -->
          <a href="${escapeHtml(sitePath(ROUTES.HOME))}" class="navbar__brand" aria-label="الرئيسية">
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M18 4L30 26H22L18 18L14 26H6L18 4Z" fill="white" opacity="0.9"/>
              <path d="M8 28C10 23 26 23 28 28C25 31 11 31 8 28Z" fill="#4a72bf"/>
            </svg>
            <span class="navbar__brand-name">أحمد مصطفى <span>تك</span></span>
          </a>

          <!-- روابط تنقل (شاشات كبيرة) -->
          <div class="navbar__nav" role="list">
            ${navLink(ROUTES.HOME,   'الرئيسية',   'home')}
            ${navLink(ROUTES.COURSE, 'المراجعات',  'course')}
          </div>

          <!-- أزرار اليمين -->
          <div class="navbar__actions">
            ${isLoggedIn ? `
              ${profile && profile.is_admin ? `
                <a href="${escapeHtml(sitePath(ROUTES.ADMIN_HOME))}" class="btn btn--secondary btn--sm" style="color:#fcd34d; border-color:rgba(252,211,77,0.4); font-size:0.8rem; min-height:36px; padding:0 12px; gap:4px;">
                  👑 لوحة الأدمن
                </a>
              ` : ''}
              <a href="${escapeHtml(sitePath(ROUTES.DASHBOARD))}" class="navbar__user" aria-label="لوحة التحكم">
                <div class="navbar__avatar" aria-hidden="true">${escapeHtml(initials)}</div>
                <span class="navbar__user-name">${escapeHtml(displayName)}</span>
              </a>
              <button type="button" id="navbar-signout-btn" class="btn btn--ghost btn--sm" style="font-size:0.8rem; min-height:36px; padding:0 14px;">
                خروج
              </button>
            ` : `
              <a href="${escapeHtml(sitePath(ROUTES.LOGIN))}" class="btn btn--ghost btn--sm" style="font-size:0.875rem; min-height:38px;">
                تسجيل الدخول
              </a>
              <a href="${escapeHtml(sitePath(ROUTES.COURSE))}" class="btn btn--accent btn--sm" style="font-size:0.875rem; min-height:38px;">
                اشترك دلوقتي
              </a>
            `}
          </div>

        </div>
      </div>
    </nav>
  `;
}

// ========== تركيب الـ Navbar ==========

export async function initNavbar(opts) {
  let activePage = opts && opts.activePage ? opts.activePage : '';

  // جلب الجلسة في الخلفية
  let session = null;
  let profile  = null;

  try {
    session = await getSession();
    if (session) {
      profile = await getMyProfile(false);
    }
  } catch (err) {
    console.warn('Navbar: failed to load session', err);
  }

  // إنشاء العنصر وحقنه في أول الصفحة
  let wrapper = document.createElement('div');
  wrapper.innerHTML = buildNavHTML({ session, profile, activePage });
  let navEl = wrapper.firstElementChild;

  document.body.prepend(navEl);

  // تأثير scroll
  function handleScroll() {
    if (window.scrollY > 20) {
      navEl.classList.add('navbar--scrolled');
    } else {
      navEl.classList.remove('navbar--scrolled');
    }
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // زر الخروج
  let signOutBtn = document.getElementById('navbar-signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      signOutBtn.disabled = true;
      signOutBtn.textContent = '...';
      await signOut();
    });
  }

  return navEl;
}
