// Light/Dark-Mode-Toggle. Drei Zustände: 'light', 'dark', 'auto'.
// 'auto' folgt prefers-color-scheme. localStorage persistiert die Wahl.

const KEY = 'sp.theme';

export function currentTheme() {
  return localStorage.getItem(KEY) || 'dark';   // BYTEXX-Default: Dark
}

export function effectiveTheme() {
  const t = currentTheme();
  if (t === 'light' || t === 'dark') return t;
  // 'auto' ist möglich (über JS gesetzt), folgt dann System
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  // theme: 'light' | 'dark' | 'auto'
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem(KEY, theme);
}

export function toggleTheme() {
  // Toggle zwischen light und dark (auto fällt raus nach erstem Klick)
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  updateButton();
}

function updateButton() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const dark = effectiveTheme() === 'dark';
  btn.setAttribute('aria-label', dark ? 'Light Mode' : 'Dark Mode');
  btn.innerHTML = dark
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

export function initThemeToggle() {
  // Theme früh anwenden, bevor das DOM rendert — Flicker vermeiden
  const t = currentTheme();
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
  }
  // Button hooks
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
      updateButton();
    }
  });
}
