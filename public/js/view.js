import { currentLang, setLang, loadStrings, apply } from '/js/i18n.js';
import { initThemeToggle } from '/js/theme.js';
initThemeToggle();
import {
  decryptBytes, deriveKekFromPassphrase, unwrapKey,
  base64UrlToBytes, base64ToBytes
} from '/js/crypto.js';
import { classifyPreview } from '/js/preview-util.js';
import { buildZipBlob } from '/js/zip-util.js';

let strings = {};
let meta = null;
let keyMaterial = null;

(async () => {
  const lang = currentLang();
  strings = await loadStrings(lang);
  apply(strings);
  document.body.classList.add('security-hint-active');   // Footer-Sprechblase

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

  const modal = document.getElementById('preview-modal');
  if (modal) {
    document.getElementById('preview-modal-close')
      .addEventListener('click', () => modal.close());
    // Body beim Schließen leeren (stoppt z. B. PDF-Rendering im iframe).
    // Das close-Event feuert asynchron — nur leeren, wenn das Modal wirklich
    // geschlossen bleibt, damit ein sofortiges Wieder-Öffnen nicht geleert wird.
    modal.addEventListener('close', () => {
      if (!modal.open) document.getElementById('preview-modal-body').innerHTML = '';
    });
  }
})();

async function onShow(token) {
  const btn = document.getElementById('show-btn');
  // Ohne eingegebene Passphrase nichts tun (Button bleibt aktiv).
  if (meta.hasPassphrase && !document.getElementById('passphrase').value) return;

  // Button sperren + Hinweis anzeigen, damit nicht doppelt geklickt wird und
  // klar ist, dass gerade entschlüsselt wird (bei großen Dateien dauert das).
  const origLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = strings['view.decrypting'] || 'Entschlüssele …';
  // Einen Tick warten, damit der Button-State sichtbar wird, bevor die
  // (bei großen Dateien blockierende) Entschlüsselung läuft.
  await new Promise((r) => setTimeout(r, 30));

  const resetButton = () => { btn.disabled = false; btn.textContent = origLabel; };

  try {
    let rawKey = keyMaterial;
    if (meta.hasPassphrase) {
      const pass = document.getElementById('passphrase').value;
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
      resetButton();
      showError(strings['view.error.wrongPassphrase']); return;
    }
    const json = JSON.parse(new TextDecoder().decode(plaintextBytes));
    render(json);   // versteckt den Button

    if (meta.burnAfterRead) {
      fetch(`/api/secret/${token}/burn`, { method: 'POST' }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    resetButton();
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
    const section = document.getElementById('files-section');

    // Alle Anhänge einmal dekodieren — bytes für Vorschau/ZIP, url für Download.
    const decoded = files.map((f) => {
      const bytes = base64ToBytes(f.data);
      const type = f.type || 'application/octet-stream';
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      const kind = classifyPreview(type, f.name);
      // Bilder als data:-URL — in der CSP immer erlaubt, also unabhängig vom
      // blob:-CSP-Stand. f.data ist bereits die Base64-Form der Datei.
      const dataUrl = kind === 'image' ? `data:${type};base64,${f.data}` : null;
      return { name: f.name || 'datei', type, bytes, url, kind, dataUrl };
    });

    // "Alle als ZIP herunterladen" — nur ab 2 Dateien.
    const existingZip = document.getElementById('files-zip-btn');
    if (existingZip) existingZip.remove();
    if (decoded.length >= 2) {
      const zipBtn = document.createElement('button');
      zipBtn.id = 'files-zip-btn';
      zipBtn.type = 'button';
      zipBtn.className = 'btn btn--secondary files-zip';
      zipBtn.textContent = strings['view.fileDownloadAllZip'] || 'Alle als ZIP herunterladen';
      zipBtn.addEventListener('click', () => downloadZip(decoded, zipBtn));
      section.insertBefore(zipBtn, list);
    }

    for (const d of decoded) {
      const li = document.createElement('li');

      let icon;
      if (d.kind === 'image' && d.dataUrl) {
        icon = document.createElement('img');
        icon.className = 'file-thumb';
        icon.src = d.dataUrl;
        icon.alt = '';
      } else {
        icon = document.createElement('span');
        icon.className = 'file-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      }

      const metaEl = document.createElement('div');
      metaEl.className = 'file-meta';
      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = d.name;
      const size = document.createElement('div');
      size.className = 'file-size';
      size.textContent = formatSize(d.bytes.length);
      metaEl.append(name, size);

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      const kind = d.kind;
      if (kind) {
        const pv = document.createElement('button');
        pv.type = 'button';
        pv.className = 'btn btn--ghost file-preview';
        pv.textContent = strings['view.filePreview'] || 'Vorschau';
        pv.addEventListener('click', () => openPreview(d, kind));
        actions.appendChild(pv);
      }

      const dl = document.createElement('a');
      dl.href = d.url;
      dl.download = d.name;
      dl.className = 'btn btn--secondary file-dl';
      dl.textContent = strings['view.fileDownload'] || 'Herunterladen';
      actions.appendChild(dl);

      li.append(icon, metaEl, actions);
      list.appendChild(li);
    }
    section.hidden = false;
  }

  document.getElementById('result').hidden = false;
  document.getElementById('show-btn').hidden = true;
  document.getElementById('passphrase-section').hidden = true;
}

function openPreview(d, kind) {
  const modal = document.getElementById('preview-modal');
  const body = document.getElementById('preview-modal-body');
  document.getElementById('preview-modal-name').textContent = d.name;
  body.innerHTML = '';

  if (kind === 'image') {
    const img = document.createElement('img');
    img.src = d.dataUrl || d.url;
    img.alt = d.name;
    body.appendChild(img);
  } else if (kind === 'pdf') {
    const frame = document.createElement('iframe');
    frame.src = d.url;
    frame.title = d.name;
    // KEIN sandbox: sandbox ohne allow-same-origin blockiert das Laden der
    // blob:-URL (gehört der Parent-Origin) → das PDF bliebe leer.
    body.appendChild(frame);
  } else if (kind === 'text') {
    const pre = document.createElement('pre');
    pre.textContent = new TextDecoder().decode(d.bytes);
    body.appendChild(pre);
  }
  modal.showModal();
}

function downloadZip(decoded, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = strings['view.zipBuilding'] || 'ZIP wird erzeugt …';
  // Kurzer Tick, damit der Button-State rendert, bevor zipSync den Main-Thread belegt.
  setTimeout(() => {
    try {
      const blob = buildZipBlob(decoded.map((d) => ({ name: d.name, bytes: d.bytes })));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = strings['view.zipName'] || 'dateien.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error(err);
      showError(strings['view.error.zipFailed'] || 'ZIP konnte nicht erstellt werden. Bitte Dateien einzeln herunterladen.');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }, 30);
}

function showError(msg) {
  const e = document.getElementById('error');
  e.textContent = msg; e.hidden = false;
  document.getElementById('show-btn').hidden = true;
}
