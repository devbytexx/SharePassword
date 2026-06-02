# SharePassword — Projekt-Memory

## Quick Facts

- **Zweck:** Selbst-gehostetes One-Time-Secret-Tool (vgl. one-time-secret.de), E2E-verschlüsselt im Browser
- **Domain:** `secret.bytexx.de`
- **Co-Host:** läuft neben Passbolt auf dem Passbolt-Server (nginx, MariaDB vorhanden — werden mitbenutzt)
- **Stack:** Node.js + Fastify + MariaDB + Vanilla-JS-Frontend
- **Deployment:** bare-metal, systemd-Unit, **kein Docker**
- **Zielgruppe:** BYTEXX + Kunden, öffentlich erreichbar
- **Sprache UI:** Deutsch (default), Englisch als Switch
- **Repo-Pfad:** `D:\PROJECTS\Bytexx-Projekte\SharePassword\`

## Wichtigste Verweise

- **Design-Spec (Stand 2026-06-02):** [docs/superpowers/specs/2026-06-02-sharepassword-design.md](docs/superpowers/specs/2026-06-02-sharepassword-design.md)
- **Implementierungs-Plan:** [docs/superpowers/plans/2026-06-02-sharepassword-implementation.md](docs/superpowers/plans/2026-06-02-sharepassword-implementation.md)
- **Architektur:** [docs/architecture.md](docs/architecture.md)
- **Installation (Disaster-Recovery):** [docs/installation.md](docs/installation.md)
- **Konfiguration:** [docs/configuration.md](docs/configuration.md)
- **Betrieb:** [docs/operations.md](docs/operations.md)
- **Troubleshooting:** [docs/troubleshooting.md](docs/troubleshooting.md)
- **Lessons Learned:** [docs/lessons-learned.md](docs/lessons-learned.md)
- **Assets-Adressbuch (IPs, Zugangswege):** [docs/assets.md](docs/assets.md)
- **Security:** [docs/security.md](docs/security.md)

## Goldene Regeln

- **Klartext und Krypto-Schlüssel erreichen den Server NIE** — sonst ist das ganze Design hinfällig
- **Backup MUSS Tabelle `secrets` ausschließen** (`mysqldump --ignore-table=sharepassword.secrets`) — sonst Ephemeralität gebrochen
- **Passbolt-Konfig wird nicht angefasst** — eigener nginx-vhost, eigener Linux-User, eigene DB
- **Sensible Daten (.env, SMTP-Creds, DB-Pass)** liegen nur in `/opt/sharepassword/.env` (mode 0600), niemals im Repo
- **CSP ohne `unsafe-inline`/`unsafe-eval`** — alle Skripte als separate Files

## Status

- [x] Design-Spec geschrieben und freigegeben
- [x] Implementierungs-Plan geschrieben
- [x] Implementierung — Tasks 1–20 fertig, 19/19 nicht-DB-Tests grün, 9 DB-Tests warten auf `SP_TEST_DB=1` gegen lokale MariaDB
- [ ] Lokale End-to-End-Verifikation mit MariaDB (`SP_TEST_DB=1 npm test` + manueller Browser-Test)
- [ ] Deployment auf Passbolt-Server (Schritte in [docs/installation.md](docs/installation.md))
- [ ] Hardening-Backlog abarbeiten (siehe TaskList in der Entwicklungs-Session)

## Komponenten-Übersicht

| Bereich         | Files                                                          |
| --------------- | -------------------------------------------------------------- |
| Backend         | `app.js`, `server.js`, `routes/secret.js`, `routes/pages.js`   |
| Bibliotheken    | `lib/config.js`, `lib/db.js`, `lib/crypto-utils.js`, `lib/mailer.js` |
| Frontend        | `public/index.html`, `public/s.html`, `public/js/{crypto,create,view,i18n}.js`, `public/css/style.css` |
| Übersetzungen   | `i18n/de.json`, `i18n/en.json`                                 |
| DB              | `sql/001-init.sql`, `sql/002-grants.sql.example`               |
| Deployment      | `deploy/systemd/`, `deploy/nginx/`, `deploy/logrotate.d/`      |
| Tests           | `tests/*.test.js` (28 Tests gesamt — 19 ohne DB, 9 brauchen `SP_TEST_DB=1`) |

## Test-Befehle

- Ohne DB: `npm test` (19 pass, 9 skip — Standardmodus, kein Setup nötig)
- Mit DB: `SP_TEST_DB=1 npm test` (alle 28 Tests laufen — braucht MariaDB mit Schema `sharepassword_test` + User `sharepass_test/sharepass_test`)
