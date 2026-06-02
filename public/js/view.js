import { currentLang, setLang, loadStrings, apply } from '/js/i18n.js';
import {
  decryptBytes, deriveKekFromPassphrase, unwrapKey,
  base64UrlToBytes, base64ToBytes
} from '/js/crypto.js';

let strings = {};
let meta = null;
let keyMaterial = null;

(async () => {
  const lang = currentLang();
  strings = await loadStrings(lang);
  apply(strings);

  document.getElementById('lang-toggle').addEventListener('click', () => {
    setLang(lang === 'de' ? 'en' : 'de');
  });

  const token = location.pathname.split('/').pop();
  const frag = location.hash.slice(1);
  if (!token || !frag) {
    showError(strings['view.error.notFound']); return;
  }
  keyMaterial = base64UrlToBytes(frag);

  try {
    const res = await fetch(`/api/secret/${token}`);
    if (res.status === 404) { showError(strings['view.error.notFound']); return; }
    if (res.status === 423) { showError(strings['view.error.locked']); return; }
    if (!res.ok) { showError(strings['view.error.network']); return; }
    meta = await res.json();
  } catch {
    showError(strings['view.error.network']); return;
  }

  if (meta.senderHint) {
    const e = document.getElementById('sender-hint');
    e.textContent = meta.senderHint; e.hidden = false;
  }
  if (meta.hasPassphrase) {
    document.getElementById('passphrase-section').hidden = false;
  }

  document.getElementById('show-btn').addEventListener('click', () => onShow(token));
})();

async function onShow(token) {
  try {
    let rawKey = keyMaterial;
    if (meta.hasPassphrase) {
      const pass = document.getElementById('passphrase').value;
      if (!pass) return;
      const salt = base64ToBytes(meta.passphraseSalt);
      const kek = await deriveKekFromPassphrase(pass, salt);
      rawKey = unwrapKey(keyMaterial, kek);
    }
    const cryptoKey = await crypto.subtle.importKey(
      'raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']
    );
    const ct = base64ToBytes(meta.ciphertext);
    let plaintextBytes;
    try {
      plaintextBytes = await decryptBytes(ct, cryptoKey);
    } catch {
      fetch(`/api/secret/${token}/attempt`, { method: 'POST' }).catch(() => {});
      showError(strings['view.error.wrongPassphrase']); return;
    }
    const json = JSON.parse(new TextDecoder().decode(plaintextBytes));
    render(json);

    if (meta.burnAfterRead) {
      fetch(`/api/secret/${token}/burn`, { method: 'POST' }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    showError(String(err));
  }
}

function render(json) {
  document.getElementById('plaintext').textContent = json.text || '';
  if (json.file) {
    const link = document.getElementById('file-link');
    const bytes = base64ToBytes(json.file.data);
    const blob = new Blob([bytes], { type: json.file.type || 'application/octet-stream' });
    link.href = URL.createObjectURL(blob);
    link.download = json.file.name || 'download';
    document.getElementById('file-section').hidden = false;
  }
  document.getElementById('result').hidden = false;
  document.getElementById('show-btn').hidden = true;
  document.getElementById('passphrase-section').hidden = true;
}

function showError(msg) {
  const e = document.getElementById('error');
  e.textContent = msg; e.hidden = false;
  document.getElementById('show-btn').hidden = true;
}
