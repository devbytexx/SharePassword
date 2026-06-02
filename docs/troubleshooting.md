# Troubleshooting

> Bekannte Fehler + Diagnose + Fix. Pro Fehlertyp ein Block. Wird bei Auftreten erweitert.

## Service startet nicht

**Diagnose:**
```bash
systemctl status sharepassword
journalctl -u sharepassword -n 50 --no-pager
```

**Typische Ursachen:**
- Port 3000 schon belegt → `ss -tlnp | grep ':3000'`, Port in `.env` ändern, nginx-vhost anpassen
- DB-Pass falsch in `.env` → `mariadb -u sharepass -p` testen
- Node-Module fehlen → `cd /opt/sharepassword/app && sudo -u sharepass npm ci --omit=dev`
- `.env` falsche Permissions → `chown sharepass:sharepass /opt/sharepassword/.env && chmod 0600 ...`

## TLS-Renewal schlägt fehl

```bash
certbot renew --dry-run
```
Häufig: nginx-Reload nach Renewal nicht konfiguriert → in `/etc/letsencrypt/renewal-hooks/deploy/` Script `systemctl reload nginx` ablegen.

## Mail-Versand klappt nicht

- Logs prüfen: `journalctl -u sharepassword | grep -i smtp`
- SMTP-Test:
  ```bash
  swaks --to test@bytexx.de --from noreply@bytexx.de \
        --server mail.bytexx.de:587 --auth-user <user> --auth-password <pass>
  ```
- Fehler-Versand ist Fire-and-Forget → User-seitig kein Hinweis, nur in Logs sichtbar.

## Secret nicht abrufbar (404)

Normalfall:
- Abgelaufen (Event Scheduler hat gelöscht)
- Bereits einmal abgerufen mit `burnAfterRead=true`

Prüfen ob Event Scheduler an:
```sql
SHOW VARIABLES LIKE 'event_scheduler';
```
Wenn `OFF`: `SET GLOBAL event_scheduler = ON;` UND in `/etc/mysql/mariadb.conf.d/50-server.cnf` permanent setzen.

## Brute-Force-Sperre lässt nicht nach

```sql
DELETE FROM brute_log WHERE token = UNHEX('...');
```
(Token als Hex angeben — base64url im URL ist nicht direkt hex.)

## Disk voll wegen Logs

```bash
du -sh /var/log/sharepassword/
logrotate -f /etc/logrotate.d/sharepassword
```
Falls logrotate fehlt: Config aus `deploy/logrotate.d/` deployen.

## Passbolt beeinträchtigt

Darf nicht passieren. Wenn doch:
- nginx-Configs prüfen: `nginx -T | grep -E 'server_name|listen'` — keine Überschneidung
- MariaDB-Process-Last: `SHOW PROCESSLIST` — SharePassword-Queries sollten <1 ms sein
- systemd-Last: `systemctl status sharepassword` — Memory < 200 MB normal
