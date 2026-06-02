# Assets — Adressbuch

> Wird beim Deployment konkretisiert. IPs, URLs, Credentials-Standorte. **Keine Passwörter im Klartext hier.**

## Domains

| Domain                | Zweck                                     | DNS-Provider          |
| --------------------- | ----------------------------------------- | --------------------- |
| `secret.bytexx.de`    | SharePassword öffentlich                  | _(eintragen)_         |

## Server

| Host                  | Rolle                                     | IP                    |
| --------------------- | ----------------------------------------- | --------------------- |
| Passbolt-Server       | Co-Host für SharePassword                 | _(eintragen)_         |

## Services auf dem Server

| Service               | Port (intern)     | systemd-Unit              |
| --------------------- | ----------------- | ------------------------- |
| nginx                 | 80, 443           | `nginx.service`           |
| MariaDB               | 3306 (localhost)  | `mariadb.service`         |
| Passbolt              | _(bekannt)_       | _(bekannt)_               |
| SharePassword         | 3000 (localhost)  | `sharepassword.service`   |

## SMTP

| Setting               | Wert                                      |
| --------------------- | ----------------------------------------- |
| Host                  | `mail.bytexx.de` _(prüfen)_              |
| Port                  | 587 (STARTTLS)                            |
| User                  | _(in .env)_                               |
| Absender              | `noreply@bytexx.de`                       |

## Credentials-Standorte

| Was                            | Wo                                                        |
| ------------------------------ | --------------------------------------------------------- |
| DB-Passwort `sharepass`        | `/opt/sharepassword/.env` auf dem Server                  |
| SMTP-Credentials               | `/opt/sharepassword/.env`                                 |
| IP-Hash-Pepper                 | `/opt/sharepassword/.env`                                 |
| `.env`-Backup                  | _(z.B. Passbolt-Tresor BYTEXX-Operations, eintragen)_     |
| TLS Privkey                    | `/etc/letsencrypt/live/secret.bytexx.de/privkey.pem`      |

## Git-Remote

_(eintragen sobald Repo angelegt — Gitea / GitHub / GitLab Bytexx)_
