/**
 * admin-nav.js
 * Hamburger menu toggle for admin pages (mobile responsive)
 */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.querySelector('.admin-sidebar');
    if (!sidebar) return;

    // Create overlay
    let overlay = document.querySelector('.admin-sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'admin-sidebar-overlay';
      document.body.appendChild(overlay);
    }

    // Create toggle button and inject into topbar
    const topbar = document.querySelector('.admin-topbar');
    if (topbar) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.id = 'admin-nav-toggle';
      toggleBtn.className = 'nav-toggle';
      toggleBtn.setAttribute('aria-label', 'قائمة التنقل');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
      topbar.insertBefore(toggleBtn, topbar.firstChild);

      function openSidebar() {
        sidebar.classList.add('open');
        overlay.classList.add('visible');
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        document.body.style.overflow = 'hidden';
      }

      function closeSidebar() {
        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        document.body.style.overflow = '';
      }

      toggleBtn.addEventListener('click', function () {
        if (sidebar.classList.contains('open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });

      overlay.addEventListener('click', closeSidebar);

      // Close on Escape key
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
          closeSidebar();
        }
      });

      // Close when clicking any nav link on mobile
      sidebar.querySelectorAll('.admin-nav-link').forEach(function (link) {
        link.addEventListener('click', function () {
          if (window.innerWidth <= 768) {
            closeSidebar();
          }
        });
      });
    }
  });
})();

