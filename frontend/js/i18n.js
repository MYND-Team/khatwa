/**
 * Khatwa Platform — Pure Arabic Engine
 * Enforces pure Arabic (RTL) across the entire platform.
 * Disables partial/mixed English translations and guarantees clean Arabic text.
 */
(function (window) {
  // Always reset stored language to Arabic
  try {
    localStorage.setItem('khatwa_lang', 'ar');
  } catch (e) {}

  function applyLanguage() {
    if (document.documentElement) {
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLanguage);
  } else {
    applyLanguage();
  }

  function formatDate(dateInput) {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Safe backward-compatible API (no-ops for translation, pure Arabic defaults)
  window.KhatwaI18n = {
    t: function (key) { return key; },
    formatDate: formatDate,
    getLanguage: function () { return 'ar'; },
    setLanguage: function () {},
    toggleLanguage: function () {},
    applyLanguage: applyLanguage,
    translateElement: function () {},
    translateString: function (s) { return s; },
    DICTIONARY: {},
    REVERSE_DICT: {}
  };
})(window);
