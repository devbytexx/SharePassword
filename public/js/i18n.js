const LANG_KEY = 'sp.lang';

export function currentLang(defaultLang = 'de') {
  return localStorage.getItem(LANG_KEY) || defaultLang;
}

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  location.reload();
}

export async function loadStrings(lang) {
  const res = await fetch(`/i18n/${lang}.json`);
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
