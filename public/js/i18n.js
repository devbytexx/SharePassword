const LANG_KEY = 'sp.lang';
// Bei jeder Änderung an de.json/en.json hochzählen, damit Browser/Proxy die
// neuen Strings laden statt eine gecachte Version auszuliefern.
const I18N_VERSION = '20260604-9';

export function currentLang(defaultLang = 'de') {
  return localStorage.getItem(LANG_KEY) || defaultLang;
}

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  location.reload();
}

export async function loadStrings(lang) {
  const res = await fetch(`/i18n/${lang}.json?v=${I18N_VERSION}`);
  if (!res.ok) throw new Error('i18n load failed');
  return res.json();
}

export function apply(strings, root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const k = el.getAttribute('data-i18n');
    if (strings[k]) el.textContent = strings[k];
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    const k = el.getAttribute('data-i18n-placeholder');
    if (strings[k]) el.placeholder = strings[k];
  }
}
