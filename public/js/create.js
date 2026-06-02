import { currentLang, setLang, loadStrings, apply } from '/js/i18n.js';
import {
  generateKey, encryptBytes, deriveKekFromPassphrase, wrapKey,
  bytesToBase64Url, bytesToBase64
} from '/js/crypto.js';
import { initThemeToggle } from '/js/theme.js';

initThemeToggle();

const MAX_FILE_BYTES = 5 * 1024 * 1024;

let strings = {};
let currentLangCode = 'de';

(async () => {
  currentLangCode = currentLang();
  strings = await loadStrings(currentLangCode);
  apply(strings);

  document.getElementById('lang-toggle').addEventListener('click', () => {
    setLang(currentLangCode === 'de' ? 'en' : 'de');
  });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await handleSubmit();
    } catch (err) {
      console.error(err);
      showError(err.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('new-btn').addEventListener('click', () => {
    location.reload();
  });
})();

async function handleSubmit() {
  const text = document.getElementById('plaintext').value;
  const file = document.getElementById('file').files[0] || null;
  const expiresIn = parseInt(document.getElementById('expires').value, 10);
  const burn = document.getElementById('burn').checked;
  const passphrase = document.getElementById('passphrase').value;
  const notifyEmail = document.getElementById('notify-email').value.trim() || null;
  const senderHint = document.getElementById('sender-hint').value.trim() || null;

  if (!text && !file) {
    showError(strings['create.error.empty'] || 'Bitte Text oder Datei angeben.');
    return;
  }

  let filePayload = null;
  if (file) {
    if (file.size > MAX_FILE_BYTES) {
      showError(strings['create.error.fileTooLarge'] || 'Datei zu groß (max. 5 MB).');
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    filePayload = { name: file.name, type: file.type, data: bytesToBase64(buf) };
  }

  const payload = JSON.stringify({ text, file: filePayload });
  const payloadBytes = new TextEncoder().encode(payload);

  const key = await generateKey();
  const ciphertext = await encryptBytes(payloadBytes, key);

  let keyForUrl;
  let passphraseSaltB64 = null;
  if (passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await deriveKekFromPassphrase(passphrase, salt);
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    keyForUrl = wrapKey(rawKey, kek);
    passphraseSaltB64 = bytesToBase64(salt);
  } else {
    keyForUrl = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  }

  const body = {
    ciphertext: bytesToBase64(ciphertext),
    expiresIn,
    burnAfterRead: burn,
    hasPassphrase: !!passphrase,
    passphraseSalt: passphraseSaltB64,
    notifyEmail,
    senderHint
  };

  const res = await fetch('/api/secret', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error(strings['create.error.rateLimit'] || 'Rate-Limit erreicht. Bitte später erneut.');
    throw new Error(`Fehler ${res.status}`);
  }
  const { token, expiresAt } = await res.json();
  const url = `${location.origin}/s/${token}#${bytesToBase64Url(keyForUrl)}`;

  showResult(url, expiresAt, { hasPassphrase: !!passphrase, burnAfterRead: burn });
}

function showResult(url, expiresAt, opts) {
  document.getElementById('form-section').hidden = true;
  document.getElementById('result-section').hidden = false;

  const urlField = document.getElementById('result-url');
  urlField.value = url;

  const expiresDate = new Date(expiresAt * 1000);
  const locale = currentLangCode === 'de' ? 'de-DE' : 'en-US';
  document.getElementById('result-expires').textContent = expiresDate.toLocaleString(locale);

  // Copy-Button
  document.getElementById('copy-btn').onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(strings['create.copied'] || 'Kopiert!');
    } catch {
      urlField.select();
      document.execCommand('copy');
      toast(strings['create.copied'] || 'Kopiert!');
    }
  };

  // Mail-Button (mailto:)
  const subject = strings['create.mailSubject'] || 'Sicheres Geheimnis für dich';
  const expiresLine = (strings['create.mailExpires'] || 'Gültig bis: {when}\n')
    .replace('{when}', expiresDate.toLocaleString(locale));
  const burnLine = opts.burnAfterRead
    ? (strings['create.mailBurn'] || 'Der Link funktioniert nur ein einziges Mal.\n')
    : '';
  const passLine = opts.hasPassphrase
    ? (strings['create.mailPassphrase'] || 'Zum Öffnen brauchst du zusätzlich die Passphrase, die ich dir separat zukommen lasse.\n')
    : '';
  const bodyTpl = strings['create.mailBody'] ||
    ('Hallo,\n\nÜber folgenden Link erreichst du das geteilte Geheimnis:\n\n{url}\n\n' +
     '{expiresLine}{burnLine}{passphraseLine}\nDer Link wurde mit SharePassword (secret.bytexx.de) erzeugt.\n');
  const body = bodyTpl
    .replace('{url}', url)
    .replace('{expiresLine}', expiresLine)
    .replace('{burnLine}', burnLine)
    .replace('{passphraseLine}', passLine);

  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  document.getElementById('mail-btn').setAttribute('href', mailto);
}

function showError(msg) {
  let el = document.getElementById('form-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'form-error';
    el.className = 'error';
    const form = document.getElementById('create-form');
    form.insertBefore(el, form.firstChild);
  }
  el.textContent = msg;
  el.hidden = false;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1600);
}
