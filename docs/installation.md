# Installation — Disaster Recovery

Schritt-für-Schritt zum Neuaufsetzen auf einem Debian-basierten Server, der bereits Passbolt + nginx + MariaDB betreibt.

> Wird beim Erst-Deployment final ausgefüllt. Aktueller Stand: Gerüst.

## Voraussetzungen

- Debian-Server mit nginx ≥ 1.18, MariaDB ≥ 10.5, certbot, Node.js ≥ 20 LTS
- DNS-Record `secret.bytexx.de` → Server-IP (A-Record), TTL ≤ 1 h für Erst-Setup
- Port 3000 auf `localhost` frei (`ss -tlnp | grep ':3000'`)
- SMTP-Zugangsdaten (`mail.bytexx.de`)

## Schritte (Übersicht)

1. **Node.js installieren** (falls nicht vorhanden): `curl -fsSL https://deb.nodesource.com/setup_20.x | bash -` + `apt install nodejs`
2. **Linux-User anlegen:** `useradd --system --home /opt/sharepassword --shell /usr/sbin/nologin sharepass`
3. **Verzeichnisse:** `/opt/sharepassword/`, `/var/log/sharepassword/`
4. **Repo clonen** nach `/opt/sharepassword/app/` (oder Code-Drop)
5. **`npm ci --omit=dev`** als User `sharepass`
6. **MariaDB:** `sql/001-init.sql` einspielen, dann `sql/002-grants.sql` mit gesetztem Passwort
7. **`.env`** anlegen, mode 0600, owner `sharepass:sharepass`
8. **systemd-Unit** kopieren nach `/etc/systemd/system/`, `daemon-reload`, `enable --now`
9. **DNS prüfen:** `dig +short secret.bytexx.de`
10. **TLS-Zertifikat:** `certbot certonly --nginx -d secret.bytexx.de`
11. **nginx-vhost** kopieren nach `/etc/nginx/sites-available/`, symlinken nach `sites-enabled/`, `nginx -t`, `systemctl reload nginx`
12. **Smoke-Test:** `curl -I https://secret.bytexx.de/` → 200, gültiges Zert
13. **Backup-Skript** des Servers anpassen: `--ignore-table=sharepassword.secrets`

Detaillierte Befehle folgen beim ersten realen Deployment.
