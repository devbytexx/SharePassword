// Klassifiziert eine Datei für die Inline-Vorschau im View-Modal.
// Rein funktional, DOM-frei → in Node testbar.
// Rückgabe: 'image' | 'pdf' | 'text' | null  (null = keine Vorschau möglich)

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'csv', 'log', 'xml', 'yml', 'yaml', 'ini', 'conf'
]);
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'
]);

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function classifyPreview(type, name) {
  const t = (type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf') return 'pdf';
  if (t.startsWith('text/')) return 'text';

  // Fallback über Dateiendung, wenn MIME-Typ fehlt oder generisch ist.
  const ext = extOf(name);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}
