// Grobe Passphrase-Stärke-Schätzung — rein clientseitig, DOM-frei, in Node testbar.
//
// WICHTIG zum Bedrohungsmodell: Der „5-Fehlversuche-Lock" auf dem Server schützt
// NICHT gegen einen ernsthaften Angreifer. Wer den Link hat, holt sich Ciphertext
// und passphraseSalt mit EINEM Abruf und probiert die Passphrase danach OFFLINE
// (Millionen Versuche/Sekunde) — am Server vorbei. Der einzige reale Schutz ist
// daher eine STARKE Passphrase (plus die teuren 600k PBKDF2-Iterationen pro
// Versuch). Diese Anzeige soll Nutzer genau dazu anleiten.
//
// Heuristik: Shannon-Entropie ≈ Länge · log2(Alphabetgröße), wobei die
// Alphabetgröße aus den tatsächlich genutzten Zeichenklassen geschätzt wird.

function charsetSize(pw) {
  let size = 0;
  if (/[a-z]/.test(pw)) size += 26;
  if (/[A-Z]/.test(pw)) size += 26;
  if (/[0-9]/.test(pw)) size += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) size += 32; // grobe Annahme für Sonderzeichen
  return size;
}

// Liefert { level: 'empty'|'weak'|'medium'|'strong', bits: number }.
export function passphraseStrength(input) {
  const pw = String(input || '');
  if (pw.length === 0) return { level: 'empty', bits: 0 };

  const bits = pw.length * Math.log2(charsetSize(pw) || 1);

  let level;
  if (bits < 40) level = 'weak';
  else if (bits < 70) level = 'medium';
  else level = 'strong';

  return { level, bits };
}
