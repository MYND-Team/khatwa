/**
 * Khatwa Platform — Global UI Interactions
 * Handles nav toggles, tabs, password toggles, quiz stepper, FAQ, and notifications.
 * Dynamic page data is handled per-page via inline scripts that use window.KhatwaAPI.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ─── Mobile nav toggle ─────────────────────────────────────────────────────
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  // ─── Password show/hide ────────────────────────────────────────────────────
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      if (!input) return;
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      const isEn = window.KhatwaI18n?.getLanguage() === 'en';
      btn.textContent = hidden ? (isEn ? 'Hide' : 'إخفاء') : (isEn ? 'Show' : 'إظهار');
    });
  });

  // ─── Tab panels ───────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-row').forEach(row => {
    const tabs = row.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const scope = row.closest('[data-tab-scope]') || document;
        scope.querySelectorAll('.tab-panel').forEach(p => {
          p.style.display = p.id === tab.dataset.target ? 'block' : 'none';
        });
      });
    });
  });

  // ─── Quiz / exam option select ─────────────────────────────────────────────
  document.querySelectorAll('.opt').forEach(opt => {
    opt.addEventListener('click', (e) => {
      const input = opt.querySelector('input');
      if (input && e.target !== input) input.checked = true;
      const group = opt.closest('.q-block');
      if (group) group.querySelectorAll('.opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // ─── Exam question stepper ─────────────────────────────────────────────────
  document.querySelectorAll('.exam-shell').forEach(shell => {
    const qs = shell.querySelectorAll('.q-block');
    if (!qs.length) return;
    let idx = 0;
    const total = qs.length;
    const progress = shell.querySelector('.progress > span');
    const label = shell.querySelector('.exam-progress .progress-label span:first-child');
    const prevBtn = shell.querySelector('.exam-prev');
    const nextBtn = shell.querySelector('.exam-next');
    const submitBtn = shell.querySelector('.exam-submit');

    function render() {
      qs.forEach((q, i) => q.style.display = i === idx ? 'block' : 'none');
      if (progress) progress.style.width = `${((idx + 1) / total) * 100}%`;
      if (label) {
        const isEn = window.KhatwaI18n?.getLanguage() === 'en';
        label.textContent = isEn ? `Question ${idx + 1} of ${total}` : `سؤال ${idx + 1} من ${total}`;
      }
      if (prevBtn) prevBtn.disabled = idx === 0;
      if (nextBtn) nextBtn.style.display = idx === total - 1 ? 'none' : 'inline-flex';
      if (submitBtn) submitBtn.style.display = idx === total - 1 ? 'inline-flex' : 'none';
    }
    prevBtn?.addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
    nextBtn?.addEventListener('click', () => { if (idx < total - 1) { idx++; render(); } });
    render();
  });

  // ─── FAQ accordion ─────────────────────────────────────────────────────────
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-q');
    q?.addEventListener('click', () => item.classList.toggle('open'));
  });

  // ─── Notification: mark all read ──────────────────────────────────────────
  document.querySelectorAll('[data-mark-read]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.notif-item.unread').forEach(n => n.classList.remove('unread'));
      const dot = document.querySelector('[data-unread-count]');
      if (dot) dot.textContent = '0';
    });
  });

  // ─── Clear error state on input ───────────────────────────────────────────
  document.querySelectorAll('.field input').forEach(inp => {
    inp.addEventListener('input', () => inp.closest('.field')?.classList.remove('has-error'));
  });

  // ─── Modal backdrop close on outside click ────────────────────────────────
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('show');
    });
  });

  // ─── Global logout handler (any element with #logoutBtn) ──────────────────
  // (Individual pages handle their own logout button; this is a global fallback)
  document.querySelectorAll('a[href="#logout"], #logoutBtn').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      if (window.KhatwaAPI?.auth?.logout) await window.KhatwaAPI.auth.logout();
      else if (window.KhatwaAPI?.logout) await window.KhatwaAPI.logout();
      else window.location.href = 'index.html';
    });
  });

  // ─── Global Floating WhatsApp Support Widget ─────────────────────────────
  initWhatsAppSupport();

  // ─── Khatwa 2.0 Visual Engine (Mesh Background, Collapsible Taskbar, Dark Mode) ──
  initBackgroundMesh();
  initDarkMode();
  initCollapsibleTaskbar();
  initTransparentLogos();

});

/**
 * Ensures brand logos use transparent background version as requested in PDF Page 2
 */
function initTransparentLogos() {
  document.querySelectorAll('img.brand-logo, .brand img, #platformLogoPreview img, .modal-head img, .khatwa-taskbar-logo').forEach(img => {
    const src = img.getAttribute('src');
    if (src && (src.includes('logo-khatwa.png') || src.includes('logo-khatwa.jpeg') || src.includes('logo-khatwa-transparent.png'))) {
      img.src = 'logo/logo-khatwa-transparent.png';
      img.onerror = function() { this.src = 'logo/logo-khatwa-transparent.png'; };
    }
  });
}

/**
 * DecorativeBackground — خطوة Platform
 *
 * Injects 4 stacked decorative layers behind all content:
 *   Layer 1 — Blobs   : 3 large radial glows (float animation, colors from --primary/--accent/--secondary)
 *   Layer 2 — Dots    : repeating dot grid fading at edges (color from --ink)
 *   Layer 3 — Doodles : educational line-art SVGs scattered at angles (currentColor → --ink)
 *   Layer 4 — Path    : dashed winding SVG path referencing "خطوة" (step/path)
 *
 * ALL colors come from CSS custom properties — zero hardcoded hex values.
 * theme changes (data-theme="dark") are picked up automatically via CSS transitions.
 */
function initBackgroundMesh() {
  // Idempotent guard — only inject once per page
  if (document.querySelector('.khatwa-deco-bg')) return;

  // ── Educational doodle SVG definitions ──────────────────────────────────
  // Each doodle: [top%, inset-inline-start%, size, rotation_deg, SVG_path_data]
  const DOODLES = [
    // Book
    {
      top: '8%', start: '5%', size: 44, rot: -18,
      svg: `<svg width="44" height="44" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`
    },
    // Pencil
    {
      top: '14%', start: '90%', size: 40, rot: 25,
      svg: `<svg width="40" height="40" viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`
    },
    // Light Bulb
    {
      top: '45%', start: '3%', size: 42, rot: 10,
      svg: `<svg width="42" height="42" viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="3"/><path d="M12 5a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 16.47 5 14.38 5 12a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>`
    },
    // Atom
    {
      top: '65%', start: '88%', size: 46, rot: -12,
      svg: `<svg width="46" height="46" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9C11.18 3.8 5.83 1.7 3.8 3.8c-2.06 2.05-.04 7.38 4.5 11.9 4.52 4.52 9.85 6.56 11.9 4.5z"/><path d="M3.8 20.2c2.05 2.06 7.38.04 11.9-4.5 4.52-4.52 6.54-9.85 4.5-11.9"/></svg>`
    },
    // Graduation cap
    {
      top: '78%', start: '12%', size: 44, rot: 8,
      svg: `<svg width="44" height="44" viewBox="0 0 24 24"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`
    },
    // Pi symbol / math
    {
      top: '30%', start: '94%', size: 38, rot: -20,
      svg: `<svg width="38" height="38" viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="9" y1="7" x2="9" y2="20"/><path d="M14 7v7a3 3 0 0 0 6 0V7"/></svg>`
    },
    // Ruler
    {
      top: '55%', start: '6%', size: 40, rot: 40,
      svg: `<svg width="40" height="40" viewBox="0 0 24 24"><path d="M3 3h18v5H3z"/><line x1="7" y1="3" x2="7" y2="8"/><line x1="11" y1="3" x2="11" y2="6"/><line x1="15" y1="3" x2="15" y2="8"/><line x1="19" y1="3" x2="19" y2="6"/></svg>`
    },
    // Flask
    {
      top: '20%', start: '48%', size: 36, rot: -6,
      svg: `<svg width="36" height="36" viewBox="0 0 24 24"><path d="M9 3h6v8l4.5 8.5A2 2 0 0 1 17.78 22H6.22a2 2 0 0 1-1.72-2.5L9 11V3z"/><line x1="9" y1="3" x2="15" y2="3"/></svg>`
    },
    // Star / award
    {
      top: '88%', start: '72%', size: 36, rot: 15,
      svg: `<svg width="36" height="36" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    },
  ];

  // ── Winding dashed path (خطوة = steps/journey) ──────────────────────────
  // An organic cubic-bezier path that snakes across the viewport.
  // Uses percentages via viewBox so it adapts to any screen size.
  const PATH_D = [
    'M -20 80',
    'C 60 20, 120 140, 200 80',
    'C 280 20, 340 150, 430 90',
    'C 520 30, 580 160, 680 100',
    'C 780 40, 840 170, 940 110',
    'C 1040 50, 1100 180, 1200 120',
  ].join(' ');

  // ── Build the component HTML ─────────────────────────────────────────────
  const deco = document.createElement('div');
  deco.className = 'khatwa-deco-bg';
  deco.setAttribute('aria-hidden', 'true');
  deco.setAttribute('role', 'presentation');

  deco.innerHTML = `
    <!-- Layer 1: Blobs -->
    <div class="khatwa-deco-blob khatwa-deco-blob-1"></div>
    <div class="khatwa-deco-blob khatwa-deco-blob-2"></div>
    <div class="khatwa-deco-blob khatwa-deco-blob-3"></div>

    <!-- Layer 2: Dot grid -->
    <div class="khatwa-deco-dots"></div>

    <!-- Layer 3: Educational doodles -->
    <div class="khatwa-deco-doodles">
      ${DOODLES.map(d => `
        <span class="khatwa-deco-doodle"
          style="top:${d.top};inset-inline-start:${d.start};width:${d.size}px;height:${d.size}px;transform:rotate(${d.rot}deg);">
          ${d.svg}
        </span>
      `).join('')}
    </div>

    <!-- Layer 4: Dashed winding path -->
    <svg class="khatwa-deco-path"
         viewBox="0 0 1200 200"
         preserveAspectRatio="none"
         xmlns="http://www.w3.org/2000/svg">
      <path d="${PATH_D}"/>
    </svg>
  `;

  // Insert as the very first child of <body>
  document.body.prepend(deco);

  // ── Keep old .khatwa-bg-mesh guard compatible (backward compat) ──────────
  deco.classList.add('khatwa-bg-mesh');
}

/**
 * Initializes and manages Dark Mode with local persistence
 */
function initDarkMode() {
  const savedTheme = localStorage.getItem('khatwa_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

  if (isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-mode');
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.body.classList.remove('dark-mode');
  }

  // Update button text and attach click listener if not already in HTML
  const isEn = window.KhatwaI18n?.getLanguage() === 'en';
  document.querySelectorAll('[data-dark-toggle]').forEach(btn => {
    btn.textContent = isDark
      ? (isEn ? '☀️ Light' : '☀️ المضيء')
      : (isEn ? '🌙 Dark' : '🌙 الليلي');
    if (!btn.hasAttribute('onclick') && !btn._hasDarkListener) {
      btn._hasDarkListener = true;
      btn.addEventListener('click', toggleDarkMode);
    }
  });
}

function toggleDarkMode() {
  const isCurrentlyDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-mode');
  const newDark = !isCurrentlyDark;

  if (newDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-mode');
    localStorage.setItem('khatwa_theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.body.classList.remove('dark-mode');
    localStorage.setItem('khatwa_theme', 'light');
  }

  document.querySelectorAll('[data-dark-toggle]').forEach(btn => {
    const isEn = window.KhatwaI18n?.getLanguage() === 'en';
    btn.textContent = newDark ? (isEn ? '☀️ Light' : '☀️ المضيء') : (isEn ? '🌙 Dark' : '🌙 الليلي');
  });
}

const TASKBAR_NAV_DEFS = {
  ADMIN: [
    { id: 'tabStudents', icon: '🎓', ar: 'الطلاب', en: 'Students', action: "switchAdminTab && switchAdminTab('tabStudents')" },
    { id: 'tabTeachers', icon: '👨‍🏫', ar: 'المدرسين', en: 'Teachers', action: "switchAdminTab && switchAdminTab('tabTeachers')" },
    { id: 'tabSubscriptions', icon: '🔑', ar: 'الاشتراكات', en: 'Subscriptions', action: "switchAdminTab && switchAdminTab('tabSubscriptions')" },
    { id: 'tabPayments', icon: '💳', ar: 'السجل المالي', en: 'Finance', action: "switchAdminTab && switchAdminTab('tabPayments')" },
    { id: 'tabStages', icon: '🏫', ar: 'المراحل', en: 'Stages', action: "switchAdminTab && switchAdminTab('tabStages')" },
    { id: 'tabAppearance', icon: '🎨', ar: 'المظهر والألوان', en: 'Appearance & Theme', action: "switchAdminTab && switchAdminTab('tabAppearance')" },
    { id: 'tabAccessCodes', icon: '🎟️', ar: 'أكواد الشحن', en: 'Voucher Codes', action: "switchAdminTab && switchAdminTab('tabAccessCodes')" },
    { id: 'tabPointRequests', icon: '💰', ar: 'طلبات الشحن', en: 'Recharge Requests', action: "switchAdminTab && switchAdminTab('tabPointRequests')" },
    { id: 'tabOfflineRequests', icon: '🏢', ar: 'طلبات الأوفلاين', en: 'Offline Requests', action: "switchAdminTab && switchAdminTab('tabOfflineRequests')" },
    { id: 'tabProfileRequests', icon: '📋', ar: 'طلبات البيانات', en: 'Profile Edits', action: "switchAdminTab && switchAdminTab('tabProfileRequests')" },
    { id: 'tabSecurity', icon: '🛡️', ar: 'الأمان والنظام', en: 'Security', action: "switchAdminTab && switchAdminTab('tabSecurity')" },
  ],
  TEACHER: [
    { href: 'teacher-dashboard.html', id: 'view-courses', icon: '📊', ar: 'الكورسات والمحاضرات', en: 'Studio & Courses', action: "if(window.switchMainView){window.switchMainView('view-courses');}" },
    { href: 'teacher-dashboard.html', id: 'view-students', icon: '👨‍🎓', ar: 'طلاب المرحلة', en: 'Students', action: "if(window.switchMainView){window.switchMainView('view-students');}" },
    { href: 'teacher-dashboard.html', id: 'view-revenue', icon: '💵', ar: 'الرصيد والأرباح', en: 'Earnings & Wallet', action: "if(window.switchMainView){window.switchMainView('view-revenue');}" },
    { href: 'teacher-dashboard.html', id: 'view-calendar', icon: '📅', ar: 'تقويم المحاضرات', en: 'Schedule Calendar', action: "if(window.switchMainView){window.switchMainView('view-calendar');}" },
    { href: 'courses.html', icon: '🔍', ar: 'تصفح المنصة كطالب', en: 'Browse Platform' },
  ],
  STUDENT: [
    { href: 'dashboard.html', icon: '🏠', ar: 'الرئيسية', en: 'Home' },
    { href: 'profile.html', icon: '👤', ar: 'الملف الشخصي', en: 'Profile' },
    { href: 'courses.html', icon: '📚', ar: 'محاضراتي والكورسات', en: 'My Courses' },
    { href: 'points.html', icon: '💳', ar: 'المحفظة والرصيد', en: 'Wallet & Balance' },
    { href: 'request-points.html', icon: '⚡', ar: 'طلب شحن رصيد', en: 'Request Balance' },
    { href: 'request-offline.html', icon: '🏢', ar: 'طلب سنتر / أوفلاين', en: 'Center Request' },
    { href: 'results.html', icon: '📊', ar: 'النتائج والتقارير', en: 'Grades & Results' },
  ],
  GUEST: [
    { href: 'index.html', icon: '🏠', ar: 'الرئيسية', en: 'Home' },
    { href: 'courses.html', icon: '📚', ar: 'الكورسات والمحاضرات', en: 'Courses' },
    { href: 'login.html', icon: '🔑', ar: 'تسجيل الدخول', en: 'Login' },
    { href: 'signup.html', icon: '✨', ar: 'إنشاء حساب جديد', en: 'Sign Up' },
    { href: 'help.html', icon: '❓', ar: 'الأسئلة الشائعة', en: 'FAQ' },
  ]
};

function updateTaskbarLanguage(lang) {
  const taskbar = document.getElementById('khatwaTaskbar');
  if (!taskbar) return;
  const isEn = (lang || window.KhatwaI18n?.getLanguage?.() || 'ar') === 'en';
  const role = taskbar.dataset.role || 'STUDENT';

  // 1. Update Brand title
  const brandTitleEl = taskbar.querySelector('.khatwa-taskbar-title');
  if (brandTitleEl) {
    brandTitleEl.textContent = role === 'ADMIN'
      ? (isEn ? 'Khatwa Admin' : 'إدارة خطوة')
      : (role === 'TEACHER' ? (isEn ? 'Khatwa Studio' : 'استوديو خطوة') : (isEn ? 'Khatwa Platform' : 'منصة خطوة'));
  }

  // 2. Update navigation items
  const items = TASKBAR_NAV_DEFS[role] || [];
  taskbar.querySelectorAll('.khatwa-taskbar-item').forEach((el) => {
    const targetId = el.getAttribute('data-target-id');
    const href = el.getAttribute('href');
    const item = items.find(it => (targetId && it.id === targetId) || (href && it.href === href));
    if (!item) return;
    const label = isEn ? item.en : item.ar;
    const labelEl = el.querySelector('.khatwa-taskbar-label');
    if (labelEl) labelEl.textContent = label;
    el.setAttribute('data-tooltip', label);
  });

  // 3. Update footer buttons
  const darkModeLabel = taskbar.querySelector('[data-taskbar-dark-label]');
  if (darkModeLabel) {
    darkModeLabel.textContent = isEn ? 'Dark / Light Mode' : 'الوضع الليلي / النهاري';
    const darkBtn = darkModeLabel.closest('.khatwa-taskbar-foot-btn') || darkModeLabel.parentElement;
    if (darkBtn) darkBtn.title = isEn ? 'Toggle Dark Mode' : 'تبديل الوضع الليلي';
  }

  // Update any navbar or page dark-mode toggle buttons
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-mode');
  document.querySelectorAll('[data-dark-toggle]').forEach(btn => {
    btn.textContent = isDark
      ? (isEn ? '☀️ Light' : '☀️ المضيء')
      : (isEn ? '🌙 Dark' : '🌙 الليلي');
    btn.title = isEn ? 'Toggle Dark Mode' : 'تبديل الوضع الليلي/النهاري';
  });

  const langLabel = taskbar.querySelector('[data-taskbar-lang-label]');
  if (langLabel) {
    langLabel.textContent = isEn ? 'العربية' : 'English';
    const langBtn = langLabel.closest('.khatwa-taskbar-foot-btn') || langLabel.parentElement;
    if (langBtn) langBtn.title = isEn ? 'Switch Language' : 'تغيير اللغة';
  }

  const logoutLabel = taskbar.querySelector('[data-taskbar-logout-label]');
  if (logoutLabel) {
    const isGuest = role === 'GUEST';
    logoutLabel.textContent = isGuest ? (isEn ? 'Login' : 'تسجيل الدخول') : (isEn ? 'Logout' : 'تسجيل الخروج');
    const logoutBtn = logoutLabel.closest('.khatwa-taskbar-foot-btn') || logoutLabel.parentElement;
    if (logoutBtn) logoutBtn.title = isGuest ? (isEn ? 'Login' : 'تسجيل الدخول') : (isEn ? 'Logout' : 'تسجيل الخروج');
  }

  const pinBtn = document.getElementById('taskbarPinBtn');
  if (pinBtn) pinBtn.title = isEn ? 'Pin / Unpin Sidebar' : 'تثبيت / إلغاء تثبيت القائمة';
}

/**
 * Initializes the Responsive Collapsible Side Taskbar for all user roles
 * (Admin, Teacher, Student, Guest) across all pages.
 */
function initCollapsibleTaskbar() {
  if (document.getElementById('khatwaTaskbar')) return;

  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const user = window.KhatwaAPI?.getUser?.();
  const isAdminPage = currentPath === 'admin.html';
  const isTeacherPage = currentPath === 'teacher-dashboard.html';

  let role = 'STUDENT';
  if (isAdminPage || user?.role === 'ADMIN' || user?.username === 'sameryasser-khatwa') {
    role = 'ADMIN';
  } else if (isTeacherPage || user?.role === 'TEACHER') {
    role = 'TEACHER';
  } else if (!user) {
    role = 'GUEST';
  }

  // Create Taskbar Container
  const taskbar = document.createElement('aside');
  taskbar.id = 'khatwaTaskbar';
  taskbar.className = 'khatwa-taskbar';
  taskbar.dataset.role = role;
  taskbar.setAttribute('aria-label', 'شريط المهام والتنقل الجانبي');

  // Check pinned state
  const isPinned = localStorage.getItem('khatwa_taskbar_pinned') === 'true';
  if (isPinned) {
    taskbar.classList.add('expanded');
    document.body.classList.add('taskbar-pinned');
  }
  document.body.classList.add('has-khatwa-taskbar');

  // Add hover behavior to dynamically expand body padding so taskbar NEVER overlaps website content
  taskbar.addEventListener('mouseenter', () => {
    if (!taskbar.classList.contains('expanded')) {
      document.body.classList.add('taskbar-hovered');
    }
  });
  taskbar.addEventListener('mouseleave', () => {
    document.body.classList.remove('taskbar-hovered');
  });

  // Backdrop for mobile
  const backdrop = document.createElement('div');
  backdrop.className = 'khatwa-taskbar-backdrop';
  backdrop.addEventListener('click', () => {
    taskbar.classList.remove('mobile-open');
    backdrop.classList.remove('show');
  });
  document.body.appendChild(backdrop);

  // Define Navigation Items based on user role
  const isEn = window.KhatwaI18n?.getLanguage() === 'en';
  const navItems = TASKBAR_NAV_DEFS[role] || [];

  // Build Taskbar Inner HTML
  const brandTitle = role === 'ADMIN'
    ? (isEn ? 'Khatwa Admin' : 'إدارة خطوة')
    : (role === 'TEACHER' ? (isEn ? 'Khatwa Studio' : 'استوديو خطوة') : (isEn ? 'Khatwa Platform' : 'منصة خطوة'));
  const logoSrc = 'logo/logo-khatwa-transparent.png';

  taskbar.innerHTML = `
    <div>
      <div class="khatwa-taskbar-head">
        <a href="${role === 'ADMIN' ? 'admin.html' : (role === 'TEACHER' ? 'teacher-dashboard.html' : (role === 'GUEST' ? 'index.html' : 'dashboard.html'))}" class="khatwa-taskbar-brand">
          <img src="${logoSrc}" alt="خطوة" class="khatwa-taskbar-logo" onerror="this.src='logo/logo-khatwa-transparent.png'">
          <span class="khatwa-taskbar-title" data-taskbar-brand-title>${brandTitle}</span>
        </a>
        <button type="button" class="khatwa-taskbar-pin-btn" id="taskbarPinBtn" title="${isEn ? 'Pin / Unpin Sidebar' : 'تثبيت / إلغاء تثبيت القائمة'}">
          ${isPinned ? '📌' : '📍'}
        </button>
      </div>

      <nav class="khatwa-taskbar-nav">
        ${navItems.map(item => {
          let isActive = false;
          if (role === 'ADMIN') {
            isActive = item.id === 'tabStudents';
          } else if (role === 'TEACHER') {
            isActive = item.id === 'view-courses'; // default active view
          } else if (item.href) {
            isActive = currentPath === item.href.split('#')[0];
          }

          const label = isEn ? item.en : item.ar;
          // For items with an action: use a smarter onclick that prevents page reload if already on the right page
          let actionAttr = '';
          if (item.action) {
            const targetHref = item.href || '';
            const targetPage = targetHref.split('#')[0];
            if (targetPage && targetPage !== '' && targetPage !== currentPath) {
              // Different page: navigate then the action will run on load
              actionAttr = `onclick="window.location.href='${targetHref}'"`;
            } else {
              // Same page or no href: run action and prevent default
              actionAttr = `onclick="event.preventDefault();${item.action}"`;
            }
          }
          const hrefAttr = item.href ? `href="${item.href}"` : 'href="javascript:void(0)"';

          return `
            <a ${hrefAttr} ${actionAttr} class="khatwa-taskbar-item ${isActive ? 'active' : ''}" data-target-id="${item.id || ''}" data-tooltip="${label}">
              <span class="khatwa-taskbar-icon">${item.icon}</span>
              <span class="khatwa-taskbar-label">${label}</span>
              ${item.badge ? `<span class="khatwa-taskbar-badge">${item.badge}</span>` : ''}
            </a>
          `;
        }).join('')}
      </nav>
    </div>

    <div class="khatwa-taskbar-foot">
      <button type="button" class="khatwa-taskbar-foot-btn" onclick="toggleDarkMode()" title="${isEn ? 'Toggle Dark Mode' : 'تبديل الوضع الليلي'}">
        <span class="khatwa-taskbar-icon">🌓</span>
        <span class="khatwa-taskbar-label" data-taskbar-dark-label>${isEn ? 'Dark / Light Mode' : 'الوضع الليلي / النهاري'}</span>
      </button>

      <button type="button" class="khatwa-taskbar-foot-btn" onclick="window.KhatwaI18n && window.KhatwaI18n.toggleLanguage()" title="${isEn ? 'Switch Language' : 'تغيير اللغة'}">
        <span class="khatwa-taskbar-icon">🌐</span>
        <span class="khatwa-taskbar-label" data-taskbar-lang-label>${isEn ? 'العربية' : 'English'}</span>
      </button>

      ${role === 'GUEST' ? `
      <a href="login.html" class="khatwa-taskbar-foot-btn" title="${isEn ? 'Login' : 'تسجيل الدخول'}">
        <span class="khatwa-taskbar-icon">🔑</span>
        <span class="khatwa-taskbar-label" data-taskbar-logout-label>${isEn ? 'Login' : 'تسجيل الدخول'}</span>
      </a>
      ` : `
      <a href="#logout" class="khatwa-taskbar-foot-btn" onclick="window.KhatwaAPI && window.KhatwaAPI.auth && window.KhatwaAPI.auth.logout()" style="color:var(--err);" title="${isEn ? 'Logout' : 'تسجيل الخروج'}">
        <span class="khatwa-taskbar-icon">🚪</span>
        <span class="khatwa-taskbar-label" data-taskbar-logout-label>${isEn ? 'Logout' : 'تسجيل الخروج'}</span>
      </a>
      `}
    </div>
  `;

  document.body.appendChild(taskbar);

  // Pin Toggle Logic
  const pinBtn = document.getElementById('taskbarPinBtn');
  if (pinBtn) {
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentlyPinned = taskbar.classList.contains('expanded');
      if (currentlyPinned) {
        taskbar.classList.remove('expanded');
        document.body.classList.remove('taskbar-pinned');
        localStorage.setItem('khatwa_taskbar_pinned', 'false');
        pinBtn.textContent = '📍';
      } else {
        taskbar.classList.add('expanded');
        document.body.classList.add('taskbar-pinned');
        localStorage.setItem('khatwa_taskbar_pinned', 'true');
        pinBtn.textContent = '📌';
      }
    });
  }

  // Hook mobile toggle button if on page
  const navToggle = document.querySelector('.nav-toggle');
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      taskbar.classList.toggle('mobile-open');
      backdrop.classList.toggle('show');
    });
  }

  // Keep admin active item synced when clicking tabs
  if (role === 'ADMIN') {
    window.addEventListener('admin-tab-changed', (e) => {
      const activeTabId = e.detail?.tabId;
      if (!activeTabId) return;
      taskbar.querySelectorAll('.khatwa-taskbar-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-target-id') === activeTabId);
      });
    });
  }

  // Listen for language changes to update taskbar dynamically
  window.addEventListener('khatwa:langchange', (e) => {
    updateTaskbarLanguage(e.detail?.lang);
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'khatwa_lang') {
      updateTaskbarLanguage(e.newValue);
    }
  });
}

/**
 * Checks if a lecture is newly published (less than 24 hours ago)
 * as requested in PDF Page 9.
 */
function isLectureNew(publishDateStr) {
  if (!publishDateStr) return false;
  const pTime = new Date(publishDateStr).getTime();
  if (isNaN(pTime)) return false;
  const ageMs = Date.now() - pTime;
  return ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
}

window.KhatwaUI = {
  toggleDarkMode,
  initBackgroundMesh,
  initCollapsibleTaskbar,
  isLectureNew,
};

/**
 * Initializes the floating WhatsApp Technical Support button
 * Directs to the platform's support number: 01111343693
 */
function initWhatsAppSupport() {
  if (document.getElementById('khatwaWhatsAppFloat')) return;

  const phone = '201111343693';
  let defaultMsg = 'مرحبًا، أحتاج إلى مساعدة أو دعم فني بخصوص منصة خطوة التعليمية.';

  try {
    const user = window.KhatwaAPI?.getUser?.();
    if (user?.role === 'TEACHER') {
      defaultMsg = `مرحبًا، أنا المعلم (${user.name || user.username || ''}) في منصة خطوة وأحتاج إلى دعم فني.`;
    } else if (user?.role === 'STUDENT') {
      defaultMsg = `مرحبًا، أنا الطالب (${user.name || user.username || ''}) في منصة خطوة وأحتاج إلى مساعدة.`;
    }
  } catch (e) {
    // Fallback to default message
  }

  const encodedMsg = encodeURIComponent(defaultMsg);
  const waUrl = `https://wa.me/${phone}?text=${encodedMsg}`;

  const floatBtn = document.createElement('a');
  floatBtn.id = 'khatwaWhatsAppFloat';
  floatBtn.className = 'khatwa-whatsapp-float';
  floatBtn.href = waUrl;
  floatBtn.target = '_blank';
  floatBtn.rel = 'noopener noreferrer';
  floatBtn.setAttribute('aria-label', 'تواصل مع الدعم الفني عبر واتساب 01111343693');
  floatBtn.title = 'الدعم الفني عبر واتساب: 01111343693';

  floatBtn.innerHTML = `
    <div class="khatwa-whatsapp-btn">
      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2a13.93 13.93 0 0 0-12.08 20.94L2 30l7.25-1.9A13.93 13.93 0 1 0 16 2zm0 25.5a11.5 11.5 0 0 1-5.88-1.6l-.42-.25-4.34 1.14 1.16-4.23-.28-.44A11.54 11.54 0 1 1 16 27.5zm6.34-8.67c-.35-.17-2.06-1-2.38-1.12s-.55-.17-.79.17-.91 1.12-1.12 1.35-.41.26-.76.09a9.55 9.55 0 0 1-2.81-1.73 10.53 10.53 0 0 1-1.94-2.42c-.2-.35 0-.54.15-.71s.35-.41.52-.61a2.38 2.38 0 0 0 .35-.58.64.64 0 0 0 0-.61c-.09-.17-.79-1.9-1.08-2.61s-.58-.6-.79-.61h-.68a1.3 1.3 0 0 0-.94.44 3.94 3.94 0 0 0-1.23 2.93 6.87 6.87 0 0 0 1.44 3.64 15.77 15.77 0 0 0 6 5.34c3.58 1.55 3.58 1 4.22 1a3.61 3.61 0 0 0 2.37-1.65 3 3 0 0 0 .21-1.65c-.09-.17-.32-.26-.67-.44z"/>
      </svg>
    </div>
    <span class="khatwa-whatsapp-label">
      <span>الدعم الفني</span>
      <span style="font-size:0.75rem;opacity:0.85;">(واتساب)</span>
    </span>
  `;

  document.body.appendChild(floatBtn);
}

