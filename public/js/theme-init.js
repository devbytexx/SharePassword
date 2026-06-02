// Sehr klein, sehr früh — vermeidet Theme-Flash beim Laden.
// Default ist DARK (BYTEXX-CI).
(function () {
  try {
    var t = localStorage.getItem('sp.theme') || 'dark';
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (_) { /* localStorage kann in privatem Modus fehlen */ }
})();
