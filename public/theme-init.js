// Theme initialization — kept in an external file so the CSP script-src can
// stay 'self' (no 'unsafe-inline'). Deliberately render-blocking so the theme
// applies before first paint and there is no light/dark flash. Without a saved
// choice the theme follows the operating system.
(function () {
  let theme = 'light';
  try {
    theme =
      localStorage.getItem('erp_theme') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light');
  } catch (_e) {
    /* storage unavailable — keep the light theme */
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
