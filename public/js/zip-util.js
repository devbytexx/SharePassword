// Clientseitige ZIP-Erzeugung aus bereits entschlüsselten Anhängen.
// Nutzt ausschließlich die SYNCHRONE fflate-API (zipSync) — kein Web-Worker,
// kein eval/Function → keine CSP-Lockerung nötig.
// dedupeFileNames/zipFiles sind DOM-frei und in Node testbar.

import { zipSync } from './vendor/fflate.module.js';

// Zip-Slip-Schutz: Dateinamen stammen aus dem entschlüsselten Payload und sind
// damit vom Ersteller frei wählbar — ein bösartiger Name wie "..\\..\\evil.bat"
// würde sonst wörtlich als ZIP-Eintragspfad landen und bei naiven Entpackern
// außerhalb des Zielordners schreiben. Auf den reinen Basename reduzieren;
// ":" deckt Windows-Laufwerks-Präfixe ("C:evil.bat") ab.
export function sanitizeFileName(name) {
  const base = String(name || '').split(/[\\/:]/).pop();
  return (base === '.' || base === '..') ? '' : base;
}

// Macht Dateinamen eindeutig: "a.txt", "a.txt" → "a.txt", "a (2).txt".
// Prüft gegen die bereits VERGEBENEN Namen (nicht nur die Eingaben), damit ein
// generierter Name nicht mit einem vorhandenen Eingabe-Namen kollidiert und
// fflate eine Datei still überschreibt.
export function dedupeFileNames(names) {
  const seen = new Set();
  return names.map((original) => {
    const name = sanitizeFileName(original) || 'datei';
    if (!seen.has(name)) { seen.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 2;
    let candidate;
    do { candidate = `${base} (${n++})${ext}`; } while (seen.has(candidate));
    seen.add(candidate);
    return candidate;
  });
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
