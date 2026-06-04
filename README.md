# ShareSecret

Selbst-gehostetes One-Time-Secret-Tool von [BYTEXX IT](https://bytexx.de). Ende-zu-Ende-verschlüsselt im Browser — der Server sieht den Klartext zu keinem Zeitpunkt.

- **Live:** [secret.bytexx.de](https://secret.bytexx.de)
- **Stack:** Node.js + Fastify + MariaDB · kein Build-Step · Lato lokal gehostet (CSP-konform)
- **Sicherheits-Übersicht:** [secret.bytexx.de/sicherheit.html](https://secret.bytexx.de/sicherheit.html)
- **Datenschutz:** [secret.bytexx.de/datenschutz.html](https://secret.bytexx.de/datenschutz.html) (DSGVO Art. 13/14)

## Features

### Sicherheit
- **AES-256-GCM** im Browser via Web Crypto API — Schlüssel landet ausschließlich im URL-Fragment (`#…`) und wird nie an den Server gesendet
- **Optionale Passphrase** (PBKDF2-SHA256, 600 000 Iterationen) als zweite Verschlüsselungsschicht
- **One-Time-Read** oder Ablaufzeit (1 h / 3 h / 12 h / 1 Tag / 7 Tage / 14 Tage)
- **HMAC-SHA256-IP-Hash** für Brute-Force-Schutz — Klartext-IP wird nie gespeichert
- **Rate-Limits**, 24-Geheimnisse-pro-IP-Tageslimit, Honeypot (autofill-resistent), Brute-Force-Lock nach 5 Passphrase-Fehlversuchen
- **Optional Cloudflare Turnstile** (plug-and-play via `.env`)
- **Strikte CSP**, HSTS, X-Frame-Options DENY, kein Tracking, keine Drittanbieter-Inhalte

### UX
- **Multi-File-Upload** bis 25 MB gesamt — Drag & Drop oder Klick, mit Live-Größencounter und Einzeldatei-Entfernen
- **Upload-Fortschritt** mit Phasen: „Verschlüsseln" (unbestimmt) → „Hochladen" mit echtem Prozent-Balken (via XHR), plus „bitte warten"-Hinweis
- **Datei-Vorschau im Browser**: Bilder, PDFs und Textdateien vor dem Download in einem Modal ansehen — vollständig clientseitig (CSP-konform via `blob:`)
- **„Alle als ZIP herunterladen"** ab zwei Anhängen — ZIP wird clientseitig erzeugt (fflate `zipSync`, kein Server-Roundtrip)
- **Passphrase-Generator**: 12-Zeichen-Vorschlag im UI mit „Übernehmen"- und „Neu"-Button (kuratiertes Zeichen-Set ohne verwechselbare Zeichen 0/O/1/l/I), plus Anzeigen/Verbergen-Toggle am Eingabefeld
- **„Per E-Mail teilen"-Button** öffnet das Mailprogramm mit vorausgefülltem Body inkl. Link, Ablauf, Hinweistext, persönlicher Anrede (Sender-/Empfänger-Name optional)
- **E-Mail-Benachrichtigung** an den Absender beim ersten Abruf
- **BYTEXX Corporate Identity** — Lato-Schrift, BYTEXX-Blau + Orange, animierter Hexagon-Hintergrund, Glaseffekt-Cards
- **Light/Dark-Mode** mit Theme-Toggle (Default Dark)
- **Deutsch + Englisch** über Sprach-Toggle, JSON-basiertes i18n

## Screenshots

| Geheimnis erstellen | Datei-Vorschau | Empfänger-Ansicht |
| :---: | :---: | :---: |
| ![Erstellen-Formular mit Upload](screenshots/create.png) | ![Vorschau-Modal für eine Datei](screenshots/preview.png) | ![Empfänger sieht Geheimnis + Dateien](screenshots/view.png) |

> Die Bilder liegen im Ordner [`screenshots/`](screenshots/). Zum Aktualisieren einfach die PNGs unter gleichem Namen ersetzen.

## Lokal entwickeln

```bash
git clone https://github.com/devbytexx/ShareSecret.git
cd ShareSecret
npm install
cp .env.example .env       # Werte ausfüllen
npm start
```

Ohne MariaDB lokal? In der `.env` `SP_NO_DB=1` setzen — dann läuft ein In-Memory-Storage (nur Dev, keine Persistenz).

## Tests

```bash
npm test                   # 31 Tests ohne DB (9 DB-Tests werden übersprungen)
SP_TEST_DB=1 npm test      # alle 40 Tests gegen ein lokales MariaDB-Test-Schema
```

## Deployment

Bare-metal auf Debian-/Ubuntu-Server mit nginx + MariaDB + systemd, ohne Docker. Schritt-für-Schritt-Anleitung im Wiki (interne BYTEXX-Doku).

Kurzfassung:
1. `apt install -y git nodejs` (Node ≥ 20)
2. `useradd --system sharepass`, Verzeichnisse anlegen, `git clone`, `npm ci --omit=dev`
3. MariaDB-Schema aus `sql/001-init.sql` einspielen, User aus `sql/002-grants.sql.example` anlegen
4. `.env` befüllen (mode 0600), systemd-Unit aus `deploy/systemd/` aktivieren
5. nginx-vhost aus `deploy/nginx/` einspielen, Let's-Encrypt-Zertifikat besorgen
6. Backup-Script muss `--ignore-table=sharepassword.secrets` enthalten (Ephemeralität!)

## Lizenz

Proprietär — © BYTEXX IT, Inh. Rico Becker. Quellcode öffentlich zur Transparenz und zur Nachvollziehbarkeit der Sicherheitsversprechen; produktive Nutzung außerhalb von BYTEXX bitte vorher anfragen unter [info@bytexx.de](mailto:info@bytexx.de).
