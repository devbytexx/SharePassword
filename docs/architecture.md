# Architektur

> **Detail-Referenz:** [docs/superpowers/specs/2026-06-02-sharepassword-design.md](superpowers/specs/2026-06-02-sharepassword-design.md), Abschnitt 2 und 3.

## Komponenten

- **Browser-Frontend (Vanilla JS):** verschlüsselt und entschlüsselt im Browser. Verwendet Web Crypto API (`crypto.subtle`).
- **Fastify-Backend (Node.js):** API-Routen, Rate-Limiting, Mail-Versand. Lauscht nur auf `127.0.0.1:3000`.
- **MariaDB:** Schema `sharepassword`, Tabelle `secrets` + `brute_log`. Event Scheduler löscht abgelaufene Secrets.
- **nginx:** TLS-Terminierung, Reverse-Proxy. Eigener vhost `secret.bytexx.de`.

## Datenfluss (Happy Path)

1. Absender öffnet `/` → Browser erzeugt 256-Bit-AES-Key.
2. Browser verschlüsselt Klartext (+ ggf. Datei) → AES-256-GCM, IV vorne dran.
3. POST `/api/secret` mit Ciphertext + Metadaten → Server speichert in `secrets`, gibt `token` zurück.
4. Browser baut URL: `https://secret.bytexx.de/s/<token>#<key>`.
5. Empfänger öffnet URL → Browser holt Ciphertext via GET `/api/secret/:token`.
6. Browser liest Key aus URL-Fragment → entschlüsselt → zeigt Klartext.
7. Browser ruft POST `/api/secret/:token/burn` → Server löscht Eintrag und triggert ggf. Mail.

## Netz-Topologie

```
Internet ── HTTPS ── nginx (secret.bytexx.de) ── HTTP ── 127.0.0.1:3000 (Fastify) ── localhost ── MariaDB
                                                                                  └─ SMTP ─ mail.bytexx.de
```

## Filesystem-Layout

Siehe [docs/installation.md](installation.md) und Design-Spec Abschnitt 9.1.

## Co-Existenz mit Passbolt

- **nginx:** zusätzlicher vhost, Passbolt-Config unverändert.
- **MariaDB:** zusätzliches Schema + User mit minimalen Rechten. Passbolt-DB unberührt.
- **systemd:** eigene Unit `sharepassword.service`, eigener Linux-User `sharepass`.
- **Port:** 3000 (vor Install prüfen ob frei).
