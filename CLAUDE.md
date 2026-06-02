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
- [ ] Implementierungs-Plan
- [ ] Implementierung
- [ ] Deployment auf Passbolt-Server
