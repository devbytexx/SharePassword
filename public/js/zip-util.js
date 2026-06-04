// Clientseitige ZIP-Erzeugung aus bereits entschlüsselten Anhängen.
// Nutzt ausschließlich die SYNCHRONE fflate-API (zipSync) — kein Web-Worker,
// kein eval/Function → keine CSP-Lockerung nötig.
// dedupeFileNames/zipFiles sind DOM-frei und in Node testbar.

import { zipSync } from './vendor/fflate.module.js';

// Macht Dateinamen eindeutig: "a.txt", "a.txt" → "a.txt", "a (2).txt".
export function dedupeFileNames(names) {
  const counts = new Map();
  const out = [];
  for (const original of names) {
    const name = original || 'datei';
    if (!counts.has(name)) {
      counts.set(name, 1);
      out.push(name);
      continue;
    }
    const n = counts.get(name) + 1;
    counts.set(name, n);
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    out.push(`${base} (${n})${ext}`);
  }
  return out;
}

// files: [{ name: string, bytes: Uint8Array }] → ZIP als Uint8Array.
// level 0 = STORE (keine Kompression); bei bereits binären Daten bringt
// Kompression kaum etwas und kostet nur Zeit.
export function zipFiles(files) {
  const names = dedupeFileNames(files.map((f) => f.name));
  const entries = {};
  files.forEach((f, i) => { entries[names[i]] = f.bytes; });
  return zipSync(entries, { level: 0 });
}

// Browser-Helfer: ZIP als Blob fürs Herunterladen.
export function buildZipBlob(files) {
  return new Blob([zipFiles(files)], { type: 'application/zip' });
}
