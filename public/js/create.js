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
let turnstileWidgetId = null;
let turnstileSiteKey = null;

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

  setupDropzone();
  setupTurnstile();
  setupSecurityHint();
})();

function setupSecurityHint() {
  // Blase ist immer sichtbar — markiere den Footer-Link als hervorgehoben.
  document.body.classList.add('security-hint-active');
}

async function setupTurnstile() {
  try {
    const res = await fetch('/api/public-config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (!cfg.turnstileSiteKey) return;       // Captcha deaktiviert → fertig
    turnstileSiteKey = cfg.turnstileSiteKey;

    const slot = document.getElementById('turnstile-slot');
    slot.hidden = false;

    // Cloudflare-Skript on-demand laden
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady&render=explicit';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);

    window.onTurnstileReady = () => {
      turnstileWidgetId = window.turnstile.render('#turnstile-slot', {
        sitekey: turnstileSiteKey,
        theme: 'auto',
        size: 'flexible'
      });
    };
  } catch (_) { /* offline / non-blocking */ }
}

function getTurnstileToken() {
  if (!turnstileSiteKey || !window.turnstile || turnstileWidgetId == null) return null;
  return window.turnstile.getResponse(turnstileWidgetId) || null;
}

function setupDropzone() {
  const zone = document.getElementById('dropzone');
  const input = document.getElementById('file');
  const fileLabel = document.getElementById('dropzone-file');
  if (!zone || !input) return;

  function showFile(file) {
    if (!file) {
      fileLabel.hidden = true;
      fileLabel.textContent = '';
      zone.classList.remove('has-file');
      return;
    }
    const kb = file.size / 1024;
    const sizeStr = kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb.toFixed(0) + ' KB';
    fileLabel.textContent = `${file.name} · ${sizeStr}`;
    fileLabel.hidden = false;
    zone.classList.add('has-file');
  }

  input.addEventListener('change', () => showFile(input.files[0] || null));

  ['dragenter', 'dragover'].forEach(ev => {
    zone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(ev => {
    zone.addEventListener(ev, e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('is-dragover');
    });
  });
  zone.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) {
      input.files = dt.files;
      showFile(dt.files[0]);
    }
  });
}

async function handleSubmit() {
  // Honeypot: echte Nutzer sehen das Feld nicht → muss leer sein
  const hp = document.getElementById('hp_email');
  const honeypotValue = hp && hp.value ? hp.value : '';

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
    senderHint,
    honeypot: honeypotValue,
    turnstileToken: getTurnstileToken()
  };

  const res = await fetch('/api/secret', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    if (res.status === 429) {
      const err = await res.json().catch(() => ({}));
      if (err.error === 'daily_limit') {
        throw new Error(strings['create.error.dailyLimit'] || 'Tageslimit erreicht.');
      }
      throw new Error(strings['create.error.rateLimit'] || 'Rate-Limit erreicht. Bitte später erneut.');
    }
    if (res.status === 400) {
      const err = await res.json().catch(() => ({}));
      if (err.error === 'honeypot') throw new Error(strings['create.error.honeypot'] || 'Anfrage abgelehnt.');
    }
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
