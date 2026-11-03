// ============================================================
// navbar.js
// شريط الملاحة العام للعلامة التجارية Ahmed Mostafa Tech
// (مبسط بدون حسابات طلاب، مع دعم ظهور لوحة الأدمن للأدمن فقط)
// ============================================================

import { getSession, getMyProfile } from '../core/auth.js';
import { escapeHtml, sitePath } from '../core/utils.js';
import { ROUTES, APP_CONFIG } from '../core/config.js';

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
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M18 4L30 26H22L18 18L14 26H6L18 4Z" fill="white" opacity="0.9"/>
              <path d="M8 28C10 23 26 23 28 28C25 31 11 31 8 28Z" fill="#4a72bf"/>
            </svg>
            <span class="navbar__brand-name">أحمد مصطفى <span>تك</span></span>
          </a>

          <!-- روابط التنقل الأساسية -->
          <div class="navbar__nav" role="list">
            ${navLink(ROUTES.HOME, 'الرئيسية', 'home')}
            ${navLink(ROUTES.REVISIONS, 'المراجعات المتاحة', 'revisions')}
            <a href="${escapeHtml(sitePath(ROUTES.HOME))}#how-it-works" class="navbar__link">كيفية الاشتراك</a>
            <a href="https://wa.me/${APP_CONFIG.WHATSAPP_INTL}" target="_blank" rel="noopener" class="navbar__link" style="color:#25d366;">
              تواصل واتساب 💬
            </a>
          </div>

          <!-- الأزرار التفاعلية -->
          <div class="navbar__actions">
            ${isAdmin ? `
              <a href="${escapeHtml(sitePath(ROUTES.ADMIN_HOME))}" class="btn btn--secondary btn--sm" style="color:#fcd34d; border-color:rgba(252,211,77,0.4); font-size:0.8rem; min-height:36px; padding:0 12px; gap:4px;">
                👑 لوحة الأدمن
              </a>
            ` : ''}

            <a href="${escapeHtml(sitePath(ROUTES.REVISIONS))}" class="btn btn--accent btn--sm" style="font-size:0.875rem; min-height:38px; font-weight:700;">
              احجز مراجعتك الآن
            </a>
          </div>

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
  }
}
