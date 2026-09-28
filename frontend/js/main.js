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
  document.querySelectorAll('a[href="#logout"]').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      if (window.KhatwaAPI?.auth?.logout) await window.KhatwaAPI.auth.logout();
      else window.location.href = 'index.html';
    });
  });

  // ─── Global Floating WhatsApp Support Widget ─────────────────────────────
  initWhatsAppSupport();

});

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

