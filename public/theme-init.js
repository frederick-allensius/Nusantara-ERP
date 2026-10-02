// Theme and text-size initialization — kept in an external file so the CSP
// script-src can stay 'self' (no 'unsafe-inline'). Deliberately render-blocking
// so both apply before first paint and there is no flash. Without a saved choice
// the theme follows the operating system and the text size is "besar".
(function () {
  let theme = 'light';
  let textSize = 'besar';
  try {
    theme =
      localStorage.getItem('erp_theme') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light');
    const saved = localStorage.getItem('erp_text_size');
    if (saved === 'normal' || saved === 'besar' || saved === 'sangat-besar') {
      textSize = saved;
    }
  } catch (_e) {
    /* storage unavailable — keep the defaults */
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-text-size', textSize);
})();
