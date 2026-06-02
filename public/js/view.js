import { currentLang, setLang, loadStrings, apply } from '/js/i18n.js';
import { initThemeToggle } from '/js/theme.js';
initThemeToggle();
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

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function render(json) {
  document.getElementById('plaintext').textContent = json.text || '';

  // Rückwärtskompatibel: alte Payload-Form { file: {…} } in Array überführen
  const files = Array.isArray(json.files)
    ? json.files
    : (json.file ? [json.file] : []);

  if (files.length > 0) {
    const list = document.getElementById('files-list');
    list.innerHTML = '';
    for (const f of files) {
      const bytes = base64ToBytes(f.data);
      const blob = new Blob([bytes], { type: f.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      const li = document.createElement('li');

      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

      const meta = document.createElement('div');
      meta.className = 'file-meta';
      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = f.name || 'datei';
      const size = document.createElement('div');
      size.className = 'file-size';
      size.textContent = formatSize(bytes.length);
      meta.append(name, size);

      const dl = document.createElement('a');
      dl.href = url;
      dl.download = f.name || 'download';
      dl.className = 'btn btn--secondary file-dl';
      dl.textContent = strings['view.fileDownload'] || 'Herunterladen';

      li.append(icon, meta, dl);
      list.appendChild(li);
    }
    document.getElementById('files-section').hidden = false;
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
