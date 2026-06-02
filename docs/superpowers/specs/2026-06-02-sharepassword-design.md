# SharePassword — Design-Spec

**Datum:** 2026-06-02
**Autor:** BYTEXX IT (info@bytexx.de)
**Status:** Entwurf, ausstehende Freigabe
**Ziel-Domain:** `secret.bytexx.de`

---

## 1. Ziel und Abgrenzung

SharePassword ist ein selbst-gehostetes Tool zum **einmaligen, verschlüsselten Teilen von Geheimnissen** (Passwörter, Tokens, kleine Dateien) über einen Link. Vergleichbar mit `one-time-secret.de`, aber unter BYTEXX-Kontrolle, mit Ende-zu-Ende-Verschlüsselung im Browser und ephemerer Speicherung.

**In Scope:**

- Erstellung verschlüsselter Secrets im Browser
- Abruf über Link, optional mit Passphrase
- Selbstzerstörung nach erstem Abruf (one-time view) oder Ablaufzeit
- Datei-Anhänge bis 5 MB
- E-Mail-Benachrichtigung an den Absender bei Abruf
- Öffentlich erreichbar für BYTEXX + Kunden
- Co-Hosting auf dem bestehenden Passbolt-Server (kein Konflikt mit Passbolt)

**Out of Scope:**

- Benutzer-Accounts / Login / Historie (anonyme Nutzung)
- API-Schlüssel oder Programmier-API für Drittsysteme
- Backups der Secret-Daten (ephemer, by design)
- Mobile-App (rein Web)
- Mehrfach-Abruf mit Quota
- Audit-Log über Inhalte (nur Metadaten ohne Klartext)

---

## 2. Architektur

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Absender)                  Browser (Empfänger)         │
│  ───────────────────                 ──────────────────           │
│  1. Klartext + ggf. Datei            1. Lädt URL /s/<token>      │
│  2. Erzeugt AES-256-Key (zufällig)   2. Holt Ciphertext via API  │
│  3. Verschlüsselt im Browser         3. Entschlüsselt im Browser │
│  4. POST { ciphertext, meta }           mit Key aus URL-Fragment │
│  5. Erhält token zurück              4. Zeigt Klartext + Datei   │
│  6. Baut URL: /s/<token>#<key>       5. Burn-Call an Server      │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  nginx (TLS, Let's Encrypt) — vhost secret.bytexx.de             │
│  Co-Existenz mit bestehendem Passbolt-vhost, getrennte Configs   │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Node.js + Fastify (systemd: sharepassword.service)              │
│  Lauscht NUR auf 127.0.0.1:3000                                  │
│  • Routes: POST /api/secret, GET /api/secret/:token, …           │
│  • Rate-Limit (IP-basiert)                                        │
│  • Schema-Validierung, Größenlimits                              │
│  • Mail-Versand via nodemailer (BYTEXX-SMTP)                     │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  MariaDB (bestehende Instanz)                                     │
│  Schema: sharepassword                                            │
│  • Tabelle secrets (token, ciphertext, meta, expires_at, …)      │
│  • Tabelle brute_log (Passphrase-Fehlversuche, IP-Hash)          │
│  • Event Scheduler: minütliches DELETE abgelaufener Secrets      │
└──────────────────────────────────────────────────────────────────┘
```

**Kernprinzip:** Der Server sieht **niemals** den Klartext oder den Verschlüsselungs-Key. Der Key liegt im URL-Fragment (`#…`) — Browser senden Fragmente nie an Server. Selbst bei Kompromittierung des Servers sind die Secrets nutzlos, solange der Angreifer nicht zusätzlich die geteilten URLs besitzt.

---

## 3. Krypto-Schema

### 3.1 Symmetrische Verschlüsselung

| Element       | Wert / Verfahren                                         |
| ------------- | -------------------------------------------------------- |
| Algorithmus   | AES-256-GCM (Web Crypto API: `crypto.subtle`)            |
| Key           | 256 Bit, zufällig (`crypto.getRandomValues`)             |
| IV / Nonce    | 96 Bit, zufällig pro Secret, vorne an Ciphertext         |
| Auth-Tag      | 128 Bit (von GCM, automatisch)                           |
| Encoding      | Ciphertext base64-encoded für Transport                  |

### 3.2 URL-Format

```
https://secret.bytexx.de/s/<token>#<base64url-key>
                          └─────┘ └────────────────┘
                          Server-     nur im Fragment,
                          Token       NIE an Server
```

- `token` = 16 Bytes zufällig, base64url → 22 Zeichen, dient als Datenbank-Primärschlüssel
- `key` = 32 Bytes Key in base64url, **ausschließlich im URL-Fragment**

### 3.3 Optionale Passphrase

Wenn der Absender eine Passphrase setzt, wird der eigentliche Verschlüsselungs-Key wie folgt geschützt:

1. Passphrase + 16-Byte-Salt → PBKDF2-SHA256, **600 000 Iterationen** → 256-Bit-KEK (Key-Encryption-Key)
2. AES-Key wird mit der KEK XOR-verkettet, das XOR-Ergebnis ersetzt den Key im URL-Fragment
3. Salt wird im Server gespeichert (kein Geheimnis), bei GET zurückgegeben
4. Empfänger gibt Passphrase ein → leitet KEK aus Salt+Passphrase ab → XOR rückwärts → AES-Key → entschlüsselt

Effekt: Wer nur die URL hat, kommt **ohne Passphrase nicht ran**, auch wenn er das Fragment kennt.

### 3.4 Datei-Anhänge

- Maximal **5 MB nach Verschlüsselung** (entspricht ~5 MB Klartext, GCM-Overhead vernachlässigbar)
- Datei wird **gemeinsam** mit dem Text in einem einzigen JSON-Klartext verschlüsselt:
  ```json
  {
    "text": "...",
    "file": { "name": "kunde.docx", "type": "application/...", "data": "<base64>" }
  }
  ```
- Nach Entschlüsselung baut der Empfänger-Browser einen Blob + Download-Link

---

## 4. Datenmodell (MariaDB)

### Schema und User

```sql
CREATE DATABASE sharepassword
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'sharepass'@'localhost' IDENTIFIED BY '<random-32-char>';
GRANT SELECT, INSERT, DELETE, UPDATE ON sharepassword.* TO 'sharepass'@'localhost';
-- bewusst kein DROP/ALTER für Runtime-User
```

### Tabellen

```sql
CREATE TABLE secrets (
  token              VARBINARY(16)    NOT NULL PRIMARY KEY,
  ciphertext         LONGBLOB         NOT NULL,
  burn_after_read    TINYINT(1)       NOT NULL DEFAULT 1,
  has_passphrase     TINYINT(1)       NOT NULL DEFAULT 0,
  passphrase_salt    VARBINARY(16)    NULL,
  notify_email       VARCHAR(255)     NULL,
  sender_hint        VARCHAR(120)     NULL,
  expires_at         DATETIME         NOT NULL,
  created_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  size_bytes         INT UNSIGNED     NOT NULL,
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE brute_log (
  token              VARBINARY(16)    NOT NULL,
  ip_hash            BINARY(32)       NOT NULL,   -- SHA-256(IP + Pepper)
  attempt_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token_time (token, attempt_at)
) ENGINE=InnoDB;
```

### Auto-Cleanup via Event Scheduler

```sql
SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS purge_expired_secrets
  ON SCHEDULE EVERY 1 MINUTE
  DO
    DELETE FROM secrets WHERE expires_at < NOW();

CREATE EVENT IF NOT EXISTS purge_brute_log
  ON SCHEDULE EVERY 1 HOUR
  DO
    DELETE FROM brute_log WHERE attempt_at < NOW() - INTERVAL 24 HOUR;
```

### Backup-Strategie

Vorhandene mysqldump-Backups MÜSSEN die Tabelle `secrets` ausschließen:

```bash
mysqldump --ignore-table=sharepassword.secrets sharepassword > backup.sql
```

Sonst untergräbt das Backup die Ephemeralität (gelöschte Secrets bleiben im Backup).

---

## 5. API

Alle Routen unter `/api`. JSON-Body, JSON-Response. Validierung via Fastify-Schema.

### 5.1 POST `/api/secret` — Secret erstellen

**Request:**

```json
{
  "ciphertext": "<base64>",
  "expiresIn": 3600,
  "burnAfterRead": true,
  "hasPassphrase": false,
  "passphraseSalt": null,
  "notifyEmail": "absender@firma.de",
  "senderHint": "Zugangsdaten Kunde X"
}
```

Validierung:

- `ciphertext`: base64-String, max 7 MB nach Encoding (entspricht ~5 MB binär + Overhead)
- `expiresIn` ∈ { 3600, 86400, 604800, 2592000 } (1h, 1d, 7d, 30d)
- `passphraseSalt`: base64-String von genau 16 Byte; pflicht wenn `hasPassphrase=true`, sonst null
- `notifyEmail`: optional, RFC-5322-Format, max 255 Zeichen
- `senderHint`: max 120 Zeichen, wird unverschlüsselt gespeichert (= sichtbar für Empfänger vor Entschlüsselung)
- Alle base64-Felder werden vom Server beim Persist in `VARBINARY` / `LONGBLOB` konvertiert; beim GET wieder als base64-String ausgeliefert.

**Response:**

```json
{ "token": "abc...22zeichen", "expiresAt": 1717420800 }
```

### 5.2 GET `/api/secret/:token` — Metadaten + Ciphertext laden

**Response 200:**

```json
{
  "ciphertext": "<base64>",
  "hasPassphrase": false,
  "passphraseSalt": null,
  "senderHint": "Zugangsdaten Kunde X",
  "burnAfterRead": true,
  "expiresAt": 1717420800
}
```

**Response 404:** `{ "error": "not_found_or_expired" }`

**Response 423 (locked):** wenn brute_log ≥ 5 Versuche in letzten 15 Minuten → `{ "error": "locked", "retryAfter": <seconds> }`

**Wichtig:** GET löscht das Secret **NICHT** sofort. Burn passiert in separatem Call (siehe 5.3). Begründung: ein abgebrochener Download oder Crypto-Fehler im Browser würde sonst das Secret vernichten, ohne dass der Empfänger es gesehen hat.

### 5.3 POST `/api/secret/:token/burn` — Selbstzerstörung

Vom Client aufgerufen, nachdem die Entschlüsselung im Browser erfolgreich war.

**Response 204:** Secret gelöscht.

**Side-Effect:** Wenn `notifyEmail` gesetzt war, wird Mail asynchron versendet (nicht blockierend für Response).

### 5.4 POST `/api/secret/:token/attempt` — Passphrase-Fehlversuch melden

Wenn der Empfänger eine falsche Passphrase eingibt (Crypto-Fehler im Browser), meldet der Client dies an den Server. Server inkrementiert `brute_log`. Bei ≥ 5 Versuchen in 15 Minuten wird der Token gesperrt (423).

**Response 204** bei Erfolg.

---

## 6. Rate-Limiting

| Endpoint                                | Limit                              |
| --------------------------------------- | ---------------------------------- |
| `POST /api/secret`                      | 10 / Minute / IP                   |
| `GET /api/secret/:token`                | 30 / Minute / IP                   |
| `POST /api/secret/:token/attempt`       | 5 / 15 Minuten / Token (s.o.)      |
| Globaler `body-limit`                   | 7 MB (fastify)                     |

Implementierung via `@fastify/rate-limit` (in-memory ist ok für single-instance).

Bei Überschreitung: HTTP 429, `Retry-After`-Header.

IPs werden **gehasht** geloggt (SHA-256(IP + Server-Pepper)), nie im Klartext.

---

## 7. UI / Frontend

### 7.1 Stack

- **Vanilla JavaScript** (kein Framework, kein Build-Step)
- HTML5, CSS3, ES2022, Web Crypto API (verfügbar in allen aktuellen Browsern)
- Keine externen CDNs — alles selbst hosten (Datenschutz, CSP)
- Keine Tracking-Scripts, kein Analytics
- i18n via einfachem JSON-Dictionary, default Deutsch, EN als Switch

### 7.2 Seiten

**`/` — Erstellseite**

- Textarea „Was möchten Sie teilen?"
- Datei-Upload (optional, max 5 MB)
- Dropdown Ablaufzeit: 1h / 1 Tag / 1 Woche / 30 Tage
- Checkbox „Nach erstem Abruf löschen" (default an)
- Aufklappbar „Erweiterte Optionen":
  - Passphrase (optional)
  - Eigene E-Mail für Abruf-Benachrichtigung
  - Hinweis-Text (sichtbar vor Entschlüsselung)
- Button „Link erzeugen"
- Nach Erfolg: Anzeige der URL mit Copy-Button, Ablaufzeit, optional QR-Code

**`/s/<token>` — Abrufseite**

- Sender-Hint anzeigen (falls vorhanden)
- Wenn `hasPassphrase`: Passphrase-Eingabe + Button
- Button „Geheimnis anzeigen"
- Bei Erfolg: Klartext + Download-Link (falls Datei)
- Hinweis „Dieses Geheimnis wurde gelöscht und ist nicht erneut abrufbar"
- Bei Fehler: klarer Hinweis (abgelaufen, gesperrt, falsche Passphrase)

**`/impressum`** und **`/datenschutz`** — statische Pflicht-Seiten mit BYTEXX als Betreiber

### 7.3 Design

- Schlicht, BYTEXX-Branding (Logo + Akzentfarbe)
- Responsive, mobile-first
- Dark-Mode via `prefers-color-scheme`

---

## 8. E-Mail-Benachrichtigung

Wenn `notifyEmail` gesetzt UND Secret erfolgreich abgerufen:

- Versand via `nodemailer` über BYTEXX-SMTP-Server (Credentials in `.env`)
- Absender: `noreply@bytexx.de` (oder vom SMTP konfiguriert)
- Inhalt:
  - Hinweis, dass das Secret abgerufen wurde
  - Zeitstempel (UTC + lokal)
  - IP-Hash (zur Korrelation, nicht zur Identifikation)
  - Sender-Hint (falls gesetzt) zur Identifikation, welches Secret
  - **Kein Klartext, kein Token, kein Link**
- Mail-Versand passiert **asynchron** (Fire-and-Forget), Fehler werden geloggt aber nicht an Client zurückgemeldet (Datenschutz)

---

## 9. Deployment & Ops

### 9.1 Filesystem-Layout

```
/opt/sharepassword/
├── app/                  # Node-Code (deployed via git pull)
│   ├── server.js
│   ├── routes/
│   ├── lib/
│   ├── public/           # Statische Assets (HTML, CSS, JS, Bilder)
│   └── i18n/
├── .env                  # Secrets: DB-Pass, SMTP, Pepper. mode 0600, owner sharepass
├── node_modules/
└── package.json

/etc/systemd/system/sharepassword.service
/etc/nginx/sites-available/secret.bytexx.de
/etc/nginx/sites-enabled/secret.bytexx.de -> ../sites-available/...
/var/log/sharepassword/access.log
/var/log/sharepassword/error.log
/etc/logrotate.d/sharepassword
```

### 9.2 Linux-User

```bash
useradd --system --home /opt/sharepassword --shell /usr/sbin/nologin sharepass
chown -R sharepass:sharepass /opt/sharepassword /var/log/sharepassword
chmod 0600 /opt/sharepassword/.env
```

### 9.3 systemd-Unit

```ini
[Unit]
Description=SharePassword Service
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=sharepass
Group=sharepass
WorkingDirectory=/opt/sharepassword/app
EnvironmentFile=/opt/sharepassword/.env
ExecStart=/usr/bin/node /opt/sharepassword/app/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/sharepassword/access.log
StandardError=append:/var/log/sharepassword/error.log

# Härtung
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/sharepassword

[Install]
WantedBy=multi-user.target
```

### 9.4 nginx-vhost

```nginx
server {
    listen 443 ssl http2;
    server_name secret.bytexx.de;

    ssl_certificate     /etc/letsencrypt/live/secret.bytexx.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/secret.bytexx.de/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    # Security-Header
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    client_max_body_size 7m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}

server {
    listen 80;
    server_name secret.bytexx.de;
    return 301 https://$host$request_uri;
}
```

### 9.5 Co-Existenz mit Passbolt

- **Eigener Port:** Node lauscht auf `127.0.0.1:3000`. Vor Install prüfen: `ss -tlnp | grep ':3000'` — falls belegt, alternativer Port (z.B. 3010) in `.env` und nginx-Config.
- **Eigener nginx-vhost:** separate Datei `/etc/nginx/sites-available/secret.bytexx.de`. Passbolt-Config wird NICHT angefasst.
- **Eigene MariaDB-DB + User:** Schema `sharepassword`, User `sharepass`@`localhost`. Passbolt-DB unberührt.
- **Eigene systemd-Unit, eigener Linux-User, eigenes Log-Verzeichnis.**
- **Updates:** Passbolt-Updates und SharePassword-Updates sind komplett unabhängig.

### 9.6 DNS

A-Record `secret.bytexx.de` → IP des Passbolt-Servers. Vor Install setzen, sonst schlägt Let's-Encrypt-DNS-Challenge fehl.

### 9.7 TLS / Let's Encrypt

```bash
certbot certonly --nginx -d secret.bytexx.de
```

certbot kennt die bestehende Passbolt-Config schon — der zusätzliche Domain-Eintrag stört Passbolt nicht. Auto-Renewal-Cron läuft bereits.

### 9.8 Konfiguration via .env

```ini
NODE_ENV=production
PORT=3000
BIND=127.0.0.1

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=sharepassword
DB_USER=sharepass
DB_PASS=<32-char-random>

SMTP_HOST=mail.bytexx.de
SMTP_PORT=587
SMTP_USER=<...>
SMTP_PASS=<...>
SMTP_FROM=noreply@bytexx.de

IP_HASH_PEPPER=<64-char-random>     # serverseitig, niemals wechseln (sonst brechen brute_log-Lookups)
BASE_URL=https://secret.bytexx.de
DEFAULT_LANGUAGE=de
```

---

## 10. Threat-Model (Kurz)

| Angriffsszenario                                | Schutz                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Server-DB wird kompromittiert                   | Nur Ciphertext liegt vor — Schlüssel war nie auf dem Server. Wertlos ohne URL-Fragmente.            |
| URL leakt im Mail-Subject / Logs                | Optionale Passphrase schützt zusätzlich; ohne Passphrase Risiko bewusst (Verantwortung beim Sender).|
| Brute-Force auf Passphrase                      | Rate-Limit auf `/attempt`, Token-Sperre nach 5 Versuchen, PBKDF2 mit 600k Iterationen.              |
| Man-in-the-Middle                               | HTTPS-only (HSTS), strikte CSP, kein Mixed-Content möglich.                                         |
| XSS / Script-Injection in eigenem Frontend      | CSP ohne `unsafe-inline`/`unsafe-eval`, Textanzeige via `textContent` (nie `innerHTML`).            |
| Session-/Token-Erraten                          | 128 Bit Entropie pro Token (16 zufällige Bytes). Practically unguessable.                            |
| Replay / Token-Wiederverwendung                 | Bei `burnAfterRead`: nach erstem Burn weg. Sonst TTL.                                               |
| Server-Operator liest Klartext                  | Klartext erreicht den Server nie. Server-Op sieht nur Ciphertext + Metadaten + Hint.                |
| Browser-Cache / History speichert URL           | Bewusste Limitation — wird in Datenschutz-Hinweis kommuniziert. Empfehlung: Passphrase nutzen.       |

**Restrisiko Nutzer-seitig:** Wer den Link weiterleitet oder veröffentlicht, untergräbt das System. SharePassword ist ein Werkzeug, kein DLP.

---

## 11. Projekt-Struktur (Repo)

```
/d/PROJECTS/Bytexx-Projekte/SharePassword/
├── CLAUDE.md                # Memory-Index für künftige Sessions
├── README.md                # Kurzbeschreibung
├── .gitignore
├── package.json
├── server.js                # Fastify-Entry
├── routes/
│   ├── secret.js            # POST /api/secret, GET /:token, burn, attempt
│   └── pages.js             # Statische Routen
├── lib/
│   ├── db.js                # MariaDB-Pool
│   ├── mailer.js            # nodemailer-Wrapper
│   ├── crypto-utils.js      # IP-Hash, Token-Generator
│   └── rate-limit.js
├── public/
│   ├── index.html
│   ├── secret.html
│   ├── impressum.html
│   ├── datenschutz.html
│   ├── css/style.css
│   ├── js/
│   │   ├── create.js        # Browser-seitige Verschlüsselung
│   │   ├── view.js          # Browser-seitige Entschlüsselung
│   │   └── crypto.js        # AES-GCM + PBKDF2 Helpers
│   └── img/                 # Logo
├── i18n/
│   ├── de.json
│   └── en.json
├── sql/
│   ├── 001-init.sql         # Schema + Events
│   └── 002-grants.sql       # User + Grants (separat, sensible Werte)
├── deploy/
│   ├── systemd/sharepassword.service
│   ├── nginx/secret.bytexx.de.conf
│   └── logrotate.d/sharepassword
├── docs/
│   ├── architecture.md
│   ├── installation.md
│   ├── configuration.md
│   ├── operations.md
│   ├── troubleshooting.md
│   ├── lessons-learned.md
│   ├── assets.md
│   ├── security.md
│   └── superpowers/specs/2026-06-02-sharepassword-design.md   ← diese Datei
└── tests/
    ├── api.test.js          # Routen-Tests (in-memory MariaDB-Mock oder Test-Schema)
    └── crypto-roundtrip.test.js
```

---

## 12. Erfolgskriterien

Die Implementierung gilt als erfolgreich, wenn:

1. **Funktional:** Ein Secret kann erzeugt, geteilt, mit/ohne Passphrase abgerufen, mit Datei-Anhang versendet und automatisch nach Burn oder Ablauf gelöscht werden.
2. **Sicher:** Server-Logs und DB-Dump enthalten zu keinem Zeitpunkt Klartext-Geheimnisse oder Verschlüsselungs-Keys.
3. **Stabil:** Service läuft als systemd-Unit, übersteht Reboots, restartet bei Crash, kollidiert nicht mit Passbolt.
4. **Erreichbar:** `https://secret.bytexx.de/` lädt mit gültigem Zertifikat, A+-Rating bei SSL-Labs.
5. **Dokumentiert:** Alle `docs/*.md`-Files sind gefüllt; Disaster-Recovery (Server neu aufsetzen) ist Schritt-für-Schritt nachvollziehbar.

---

## 13. Offene Punkte (nach diesem Design zu klären)

- **Exakter SMTP-Host / -Port / -User** für BYTEXX-Mail (kommt beim Deployment)
- **Akzentfarbe / Logo-Datei** für Branding (Fallback: neutrales Layout)
- **Impressum + Datenschutz-Text** (Vorlage aus anderen Bytexx-Projekten übernehmen)
- **Backup-Skript** des Passbolt-Servers anpassen (`--ignore-table=sharepassword.secrets`)
