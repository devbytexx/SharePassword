# Betrieb

## Service-Steuerung

```bash
systemctl status sharepassword
systemctl restart sharepassword
journalctl -u sharepassword -f
```

## Logs

- Access: `/var/log/sharepassword/access.log`
- Error:  `/var/log/sharepassword/error.log`
- nginx:  `/var/log/nginx/access.log`, `error.log`
- Rotation: täglich, 14 Tage Retention (siehe `/etc/logrotate.d/sharepassword`)

## Updates

```bash
cd /opt/sharepassword/app
sudo -u sharepass git pull
sudo -u sharepass npm ci --omit=dev
# evtl. Migration einspielen wenn neue sql/*.sql
systemctl restart sharepassword
```

## Backup

- **Code + Config:** `git` + `/etc`-Backup
- **DB-Schema sharepassword OHNE secrets-Tabelle:**
  ```bash
  mysqldump --ignore-table=sharepassword.secrets sharepassword > backup-sharepassword-$(date +%F).sql
  ```
- **`secrets`-Tabelle wird BEWUSST NICHT gesichert** — sonst untergräbt das Backup die Ephemeralität (gelöschte Secrets würden in Backups weiterleben).
- **`.env`:** außerhalb von Git, separat verschlüsselt sichern (1Password, GPG-File auf USB-Stick im Safe, o.ä.)

## Monitoring

- `systemctl is-active sharepassword` für Uptime-Check
- HTTP-Health: `curl -fsS https://secret.bytexx.de/api/health` (Endpoint folgt in Impl.)
- Disk-Belegung `/var/log/sharepassword/`
- MariaDB-Belegung Schema `sharepassword`: `SELECT table_name, table_rows, data_length FROM information_schema.tables WHERE table_schema='sharepassword';`

## TLS-Zertifikat

certbot läuft als Cron, Auto-Renewal alle 12 h. Manuell prüfen:
```bash
certbot certificates
```

## Event-Scheduler (Auto-Cleanup) prüfen

```sql
SHOW VARIABLES LIKE 'event_scheduler';   -- ON
SHOW EVENTS FROM sharepassword;
```
