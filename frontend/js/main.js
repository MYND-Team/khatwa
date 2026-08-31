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
      btn.textContent = hidden ? 'إخفاء' : 'إظهار';
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
      if (label) label.textContent = `سؤال ${idx + 1} من ${total}`;
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

});
