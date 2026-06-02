# Konfiguration

> Detail: Design-Spec [Abschnitt 9.8](superpowers/specs/2026-06-02-sharepassword-design.md).

## .env (`/opt/sharepassword/.env`, mode 0600)

| Variable           | Beschreibung                                                          | Beispiel                       |
| ------------------ | --------------------------------------------------------------------- | ------------------------------ |
| `NODE_ENV`         | `production`                                                          | `production`                   |
| `PORT`             | Listen-Port (nur lokal)                                               | `3000`                         |
| `BIND`             | Bind-Adresse                                                          | `127.0.0.1`                    |
| `DB_HOST`          | MariaDB-Host                                                          | `127.0.0.1`                    |
| `DB_PORT`          | MariaDB-Port                                                          | `3306`                         |
| `DB_NAME`          | Datenbank                                                             | `sharepassword`                |
| `DB_USER`          | DB-User                                                               | `sharepass`                    |
| `DB_PASS`          | DB-Passwort (32 Zeichen random)                                       | `<random>`                     |
| `SMTP_HOST`        | SMTP-Server                                                           | `mail.bytexx.de`               |
| `SMTP_PORT`        | SMTP-Port                                                             | `587`                          |
| `SMTP_USER`        | SMTP-Benutzer                                                         | `<...>`                        |
| `SMTP_PASS`        | SMTP-Passwort                                                         | `<...>`                        |
| `SMTP_FROM`        | Absender-Adresse                                                      | `noreply@bytexx.de`            |
| `IP_HASH_PEPPER`   | 64-Zeichen-Random, **niemals wechseln** nach Init                     | `<random>`                     |
| `BASE_URL`         | Öffentliche Basis-URL                                                 | `https://secret.bytexx.de`     |
| `DEFAULT_LANGUAGE` | UI-Default-Sprache                                                    | `de`                           |

## Wo liegt was?

- **App-Code:** `/opt/sharepassword/app/`
- **.env:** `/opt/sharepassword/.env`
- **systemd-Unit:** `/etc/systemd/system/sharepassword.service`
- **nginx-vhost:** `/etc/nginx/sites-available/secret.bytexx.de`
- **TLS-Zertifikat:** `/etc/letsencrypt/live/secret.bytexx.de/`
- **Logs:** `/var/log/sharepassword/{access,error}.log`
- **logrotate:** `/etc/logrotate.d/sharepassword`
