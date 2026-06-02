# SharePassword

Selbst-gehostetes One-Time-Secret-Tool von [BYTEXX IT](https://bytexx.de). Ende-zu-Ende-verschlüsselt im Browser — der Server sieht den Klartext zu keinem Zeitpunkt.

- **Live:** [secret.bytexx.de](https://secret.bytexx.de)
- **Stack:** Node.js + Fastify + MariaDB · kein Build-Step · Lato lokal gehostet (CSP-konform)
- **Sicherheits-Übersicht:** [secret.bytexx.de/sicherheit.html](https://secret.bytexx.de/sicherheit.html)

## Features

- AES-256-GCM im Browser (Web Crypto API) — Schlüssel landet ausschließlich im URL-Fragment
- Optionale Passphrase (PBKDF2-SHA256, 600 000 Iterationen)
- One-Time-Read oder Ablaufzeit (1 h / 1 Tag / 1 Woche / 30 Tage)
- Datei-Anhänge bis 5 MB (verschlüsselt im selben Cipher-Block)
- E-Mail-Benachrichtigung an Absender beim Abruf (mailto-Share-Button im UI)
- Rate-Limits, 24-Geheimnisse-pro-IP-Tageslimit, Honeypot, Brute-Force-Lock
- Optional: Cloudflare-Turnstile-Captcha (plug-and-play via `.env`)
- Light/Dark-Mode mit Theme-Toggle, deutsche + englische Oberfläche

## Lokal entwickeln

```bash
npm install
cp .env.example .env       # Werte ausfüllen
npm start
```

Ohne MariaDB lokal? In der `.env` `SP_NO_DB=1` setzen — dann läuft ein In-Memory-Storage (nur Dev, keine Persistenz).

## Tests

```bash
npm test                   # 19 Tests ohne DB
SP_TEST_DB=1 npm test      # alle 28 Tests gegen ein lokales MariaDB-Test-Schema
```

## Lizenz

Proprietär — © BYTEXX IT. Quellcode öffentlich zur Transparenz; Nutzung außerhalb von BYTEXX bitte anfragen.
