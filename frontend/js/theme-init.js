/**
 * Khatwa Platform — Pre-render Theme & Branding Initializer
 * Runs synchronously in <head> to eliminate color/theme flashes before page paint.
 */
(function () {
  try {
    // 1. Dark Mode Pre-render State
    const savedTheme = localStorage.getItem('khatwa_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (document.body) document.body.classList.add('dark-mode');
    }

    // 2. Custom Branding Palette & Ambient Lighting Pre-render State
    const cached = localStorage.getItem('khatwa_branding_cache');
    if (cached) {
      const d = JSON.parse(cached);
      const r = document.documentElement;

      if (d.primaryColor) {
        r.style.setProperty('--primary', d.primaryColor);
        r.style.setProperty('--primary-hover', d.primaryColor);
        r.style.setProperty('--gold', d.primaryColor);
        r.style.setProperty('--gold-light', d.primaryColor);

        let h = d.primaryColor.replace('#', '').trim();
        if (h.length === 3) h = h.split('').map(x => x + x).join('');
        if (h.length === 6) {
          const num = parseInt(h, 16);
          const rgb = `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
          r.style.setProperty('--primary-rgb', rgb);
          r.style.setProperty('--glass-active-bg', `rgba(${rgb}, 0.22)`);
          r.style.setProperty('--glass-active-border', `rgba(${rgb}, 0.55)`);
          r.style.setProperty('--primary-faint', `rgba(${rgb}, 0.08)`);
          r.style.setProperty('--primary-border', `rgba(${rgb}, 0.28)`);
        }
      }

      if (d.secondaryColor) {
        r.style.setProperty('--secondary', d.secondaryColor);
        r.style.setProperty('--secondary-color', d.secondaryColor);
      }
      if (d.accentColor) {
        r.style.setProperty('--accent', d.accentColor);
        r.style.setProperty('--accent-color', d.accentColor);
      }

      const bg = d.gradEnd || d.backgroundColor || '#edf4fa';
      const start = d.gradStart || '#9db3cc';
      const mid = d.gradMid || '#c7d8e8';
      const ang = d.waveAngle || '135deg';

      r.style.setProperty('--bg', bg);
      r.style.setProperty('--bg-grad-start', start);
      r.style.setProperty('--bg-grad-mid', mid);
      r.style.setProperty('--bg-grad-end', bg);
      r.style.setProperty('--bg-gradient', `linear-gradient(${ang}, ${start} 0%, ${mid} 50%, ${bg} 100%)`);
    }
  } catch (_) {}
})();
