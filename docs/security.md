# Security

> Detail-Referenz: Design-Spec [Abschnitt 3 (Krypto) und Abschnitt 10 (Threat-Model)](superpowers/specs/2026-06-02-sharepassword-design.md).

## Kerngarantien

1. **Klartext und Verschlüsselungs-Key erreichen den Server NIE.** Verschlüsselung passiert im Browser via Web Crypto API. Der Key liegt im URL-Fragment (`#…`), das Browser nicht an Server senden.
2. **Datenbank-Dump enthält keine nutzbaren Daten.** Nur Ciphertext (AES-256-GCM), Metadaten und optionaler Passphrase-Salt.
3. **Selbstzerstörung:** entweder nach erstem Abruf (`burnAfterRead`) oder nach Ablauf (MariaDB Event Scheduler).

## Krypto-Parameter

| Komponente             | Verfahren                           |
| ---------------------- | ----------------------------------- |
| Symmetrisch            | AES-256-GCM, 96-Bit-IV              |
| Key-Derivation         | PBKDF2-SHA256, 600 000 Iterationen  |
| Salt                   | 16 Byte zufällig                    |
| Token (DB-Key)         | 16 Byte zufällig (128 Bit Entropie) |
| Random-Quelle Browser  | `crypto.getRandomValues`            |
| Random-Quelle Server   | `crypto.randomBytes`                |

## HTTP-Header (nginx)

- `Strict-Transport-Security`: HSTS 2 Jahre, `includeSubDomains`
- `Content-Security-Policy`: `default-src 'self'`, **kein** `unsafe-inline`, **kein** `unsafe-eval`
- `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy`: geolocation/camera/microphone explizit aus

## Rate-Limiting

| Endpoint                     | Limit                |
| ---------------------------- | -------------------- |
| `POST /api/secret`           | 10 / min / IP        |
| `GET /api/secret/:token`     | 30 / min / IP        |
| Passphrase-Fehlversuche      | 5 / 15 min / Token   |

Nach Überschreitung: HTTP 429, Token-Sperre 15 min bei Brute-Force.

## Logging

- IPs werden **nur gehasht** geloggt (`SHA-256(IP + IP_HASH_PEPPER)`)
- **Niemals** wird Ciphertext, Token, Passphrase, Salt, Sender-Hint oder Mail-Adresse geloggt
- Access-Logs enthalten: Methode, Pfad **ohne Token**, Status, IP-Hash, Timestamp

## Updates / Patches

- Node-Dependencies regelmäßig via `npm audit fix` prüfen
- TLS-Zertifikat-Renewal automatisch via certbot
- nginx + MariaDB folgen Server-Update-Zyklus (Debian-Patches)

## Bekannte Restrisiken

- Sender, der den Link unverschlüsselt per E-Mail an Empfänger schickt, kann die Mail nicht zurückziehen. Empfehlung: **immer Passphrase nutzen** und separat (anderer Kanal, z.B. Telefon/Signal) übermitteln.
- Browser-History / Disk-Cache der Empfänger-Maschine kann den Link speichern. Hinweistext im UI weist darauf hin.
- Mail an `notifyEmail` wird unverschlüsselt versendet — enthält bewusst keine sensiblen Daten (keine Tokens, keine Klartexte).
