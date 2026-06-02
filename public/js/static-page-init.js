// Header-Init für statische Seiten (Impressum, Datenschutz, Sicherheit):
//   - Theme-Toggle (Sonne/Mond)
//   - Sprach-Toggle (DE ↔ EN). Da die statischen Seiten nicht i18n-übersetzt
//     sind, navigiert ein Sprachwechsel zur Startseite, wo die Sprache greift.

import { initThemeToggle } from '/js/theme.js';

initThemeToggle();

(function setupLangToggle() {
  const KEY = 'sp.lang';
  const btn = document.getElementById('lang-toggle');
  if (!btn) return;
  const current = localStorage.getItem(KEY) || 'de';
  btn.textContent = current === 'de' ? 'EN' : 'DE';
  btn.addEventListener('click', () => {
    const next = current === 'de' ? 'en' : 'de';
    try { localStorage.setItem(KEY, next); } catch (_) {}
    // Statische Seiten gibt es nur auf Deutsch — Wechsel führt zur
    // Startseite, wo die UI dann auf Englisch erscheint.
    location.href = '/';
  });
})();
