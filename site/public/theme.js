// Applies the theme picked on an earlier visit before the page is drawn, so it doesn't flash in the system colors.
// Kept in sync with THEME_KEY in App.jsx. Without a saved choice the page follows the system setting.
try {
  const mode = window.localStorage.getItem('startup-name-checker:color-mode');
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.colorMode = mode;
} catch {
  // Storage can be blocked (for example in some private modes); the system setting is used then.
}
