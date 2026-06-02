import { currentLang, setLang, loadStrings, apply } from '/js/i18n.js';
import {
  generateKey, encryptBytes, deriveKekFromPassphrase, wrapKey,
  bytesToBase64Url, bytesToBase64
} from '/js/crypto.js';
import { initThemeToggle } from '/js/theme.js';

initThemeToggle();

const MAX_TOTAL_BYTES = 25 * 1024 * 1024;   // Summe aller Dateien

let strings = {};
let currentLangCode = 'de';
let turnstileWidgetId = null;
let turnstileSiteKey = null;
let selectedFiles = [];   // Array von File-Objekten

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
  setupHoneypot();
  setupPassphraseSuggest();
})();

// Erzeugt eine 12-stellige Passphrase aus alphanumerisch + simplen
// Sonderzeichen. Ähnlich-aussehende Zeichen (0/O, 1/l/I) ausgeschlossen.
function generatePassphrase(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_=?';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

function setupPassphraseSuggest() {
  const codeEl  = document.getElementById('pass-suggest-text');
  const applyBtn = document.getElementById('pass-apply');
  const regenBtn = document.getElementById('pass-regen');
  const input   = document.getElementById('passphrase');
  if (!codeEl || !applyBtn || !regenBtn || !input) return;

  const regen = () => { codeEl.textContent = generatePassphrase(12); };
  regen();
  regenBtn.addEventListener('click', regen);

  applyBtn.addEventListener('click', () => {
    input.value = codeEl.textContent;
    // Kurz im Klartext zeigen, damit der User sieht was übernommen wurde
    input.type = 'text';
    setTimeout(() => { input.type = 'password'; }, 1800);
    input.focus();
  });
}

function setupHoneypot() {
  // Browser/Passwort-Manager schreiben gelegentlich trotz autocomplete=off
  // in das versteckte Feld. Wir leeren es einmal kurz nach Laden — der
  // tatsächliche Bot-Submit füllt es nach dieser Sekunde aus und fliegt
  // damit korrekt raus, echte Nutzer haben das Feld nie gesehen.
  const hp = document.getElementById('website');
  if (!hp) return;
  setTimeout(() => { hp.value = ''; }, 500);
  // Plus: kurz vor dem Submit nochmal leeren wenn der Wert nach Autofill
  // exakt einer typischen E-Mail entspricht (häufiges Autofill-Pattern).
  document.getElementById('create-form').addEventListener('submit', () => {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(hp.value)) hp.value = '';
  }, true);   // capture-Phase: läuft vor unserem normalen submit-Handler
}

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

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function setupDropzone() {
  const zone = document.getElementById('dropzone');
  const input = document.getElementById('file');
  const list = document.getElementById('dropzone-files');
  if (!zone || !input) return;

  function renderList() {
    list.innerHTML = '';
    if (selectedFiles.length === 0) {
      list.hidden = true;
      zone.classList.remove('has-file');
      return;
    }
    const total = selectedFiles.reduce((s, f) => s + f.size, 0);
    selectedFiles.forEach((file, idx) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = file.name;
      const size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = formatSize(file.size);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'file-remove';
      rm.setAttribute('aria-label', 'Entfernen');
      rm.textContent = '×';
      rm.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedFiles.splice(idx, 1);
        renderList();
      });
      li.append(name, size, rm);
      list.appendChild(li);
    });
    // Gesamtsumme als kleiner Hinweis
    const totalLi = document.createElement('li');
    totalLi.className = 'dropzone__total' + (total > MAX_TOTAL_BYTES ? ' is-over' : '');
    totalLi.textContent =
      (strings['create.dropzoneTotal'] || 'Gesamt')
      + `: ${formatSize(total)} / ${formatSize(MAX_TOTAL_BYTES)}`;
    list.appendChild(totalLi);
    list.hidden = false;
    zone.classList.add('has-file');
  }

  function addFiles(fileList) {
    for (const f of fileList) {
      // Doppelte vermeiden (gleicher Name + Größe)
      if (!selectedFiles.some(x => x.name === f.name && x.size === f.size)) {
        selectedFiles.push(f);
      }
    }
    renderList();
  }

  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = '';   // damit derselbe File erneut wählbar bleibt
  });

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
    if (dt && dt.files && dt.files.length) addFiles(dt.files);
  });
}

async function handleSubmit() {
  // Honeypot: echte Nutzer sehen das Feld nicht → muss leer sein.
  // ID="website" + Anti-Autofill-Attribute halten Passwort-Manager fern.
  const hp = document.getElementById('website');
  const honeypotValue = hp && hp.value ? hp.value : '';

  const text = document.getElementById('plaintext').value;
  const expiresIn = parseInt(document.getElementById('expires').value, 10);
  const burn = document.getElementById('burn').checked;
  const passphrase = document.getElementById('passphrase').value;
  const notifyEmail = document.getElementById('notify-email').value.trim() || null;
  const senderHint = document.getElementById('sender-hint').value.trim() || null;
  const senderName = document.getElementById('sender-name').value.trim() || null;
  const recipientName = document.getElementById('recipient-name').value.trim() || null;

  if (!text && selectedFiles.length === 0) {
    showError(strings['create.error.empty'] || 'Bitte Text oder Datei angeben.');
    return;
  }

  // Dateien einlesen + Gesamtgröße prüfen
  const totalSize = selectedFiles.reduce((s, f) => s + f.size, 0);
  if (totalSize > MAX_TOTAL_BYTES) {
    showError(strings['create.error.fileTooLarge'] || 'Dateien zu groß (max. 25 MB gesamt).');
    return;
  }
  const filesPayload = [];
  for (const f of selectedFiles) {
    const buf = new Uint8Array(await f.arrayBuffer());
    filesPayload.push({ name: f.name, type: f.type, data: bytesToBase64(buf) });
  }

  const payload = JSON.stringify({ text, files: filesPayload });
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

  showResult(url, expiresAt, {
    hasPassphrase: !!passphrase,
    burnAfterRead: burn,
    senderHint,
    senderName,
    recipientName
  });
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
  const subject = strings['create.mailSubject'] || 'Sicheres Geheimnis von secret.bytexx.de';

  // Anrede: persönlich wenn Empfänger-Name angegeben
  const greeting = opts.recipientName
    ? (strings['create.mailGreetingWithName'] || 'Hallo {name},').replace('{name}', opts.recipientName)
    : (strings['create.mailGreeting'] || 'Hallo,');

  // Datum hervorgehoben mit ▶ ◀ Markern
  const whenStr = expiresDate.toLocaleString(locale);
  const expiresLine = (strings['create.mailExpires'] || '⏱️  GÜLTIG BIS:  ▶  {when}  ◀\n')
    .replace('{when}', whenStr);

  const burnLine = opts.burnAfterRead
    ? (strings['create.mailBurn'] || '🔥 Der Link funktioniert nur ein einziges Mal — wer ihn nach Ihnen öffnet, sieht nichts mehr.\n')
    : '';
  const passLine = opts.hasPassphrase
    ? (strings['create.mailPassphrase'] || '🔑 Zum Öffnen benötigen Sie zusätzlich die Passphrase, die ich Ihnen über einen separaten Kanal zukommen lasse.\n')
    : '';
  // Hint als hervorgehobener Block (mehrzeilig)
  const hintLine = opts.senderHint
    ? (strings['create.mailHint'] || '\n  ┃ 💡 Hinweis vom Absender:\n  ┃ {hint}\n  ┃\n').replace('{hint}', opts.senderHint)
    : '';
  const senderSig = opts.senderName ? (opts.senderName + '\n') : '';

  const bodyTpl = strings['create.mailBody'] || '';
  const body = bodyTpl
    .replace('{greeting}', greeting)
    .replace('{url}', url)
    .replace('{hintLine}', hintLine)
    .replace('{expiresLine}', expiresLine)
    .replace('{burnLine}', burnLine)
    .replace('{passphraseLine}', passLine)
    .replace('{senderSignature}', senderSig);

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
