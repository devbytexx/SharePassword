import { currentLang, setLang, loadStrings, apply } from '/js/i18n.js';
import {
  generateKey, encryptBytes, deriveKekFromPassphrase, wrapKey,
  bytesToBase64Url, bytesToBase64
} from '/js/crypto.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

(async () => {
  const lang = currentLang();
  const strings = await loadStrings(lang);
  apply(strings);

  document.getElementById('lang-toggle').addEventListener('click', () => {
    setLang(lang === 'de' ? 'en' : 'de');
  });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await handleSubmit(strings);
    } catch (err) {
      console.error(err);
      alert(err.message || String(err));
    } finally {
      btn.disabled = false;
    }
  });
})();

async function handleSubmit(strings) {
  const text = document.getElementById('plaintext').value;
  const file = document.getElementById('file').files[0] || null;
  const expiresIn = parseInt(document.getElementById('expires').value, 10);
  const burn = document.getElementById('burn').checked;
  const passphrase = document.getElementById('passphrase').value;
  const notifyEmail = document.getElementById('notify-email').value.trim() || null;
  const senderHint = document.getElementById('sender-hint').value.trim() || null;

  let filePayload = null;
  if (file) {
    if (file.size > MAX_FILE_BYTES) {
      alert('Datei zu groß (max. 5 MB).');
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
    const wrapped = wrapKey(rawKey, kek);
    keyForUrl = wrapped;
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
    if (res.status === 429) throw new Error('Rate-Limit erreicht. Bitte später erneut.');
    throw new Error(`Fehler ${res.status}`);
  }
  const { token, expiresAt } = await res.json();

  const url = `${location.origin}/s/${token}#${bytesToBase64Url(keyForUrl)}`;
  document.getElementById('result-url').value = url;
  document.getElementById('result-expires').textContent =
    new Date(expiresAt * 1000).toLocaleString();
  document.getElementById('result').hidden = false;

  document.getElementById('copy-btn').onclick = async () => {
    await navigator.clipboard.writeText(url);
    document.getElementById('copy-btn').textContent = strings['create.copied'] || 'OK';
  };
}
