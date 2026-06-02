# Installation — Disaster Recovery

Schritt-für-Schritt auf einem Debian-Server mit nginx + MariaDB + certbot.

## 0. Voraussetzungen

- DNS A-Record `secret.bytexx.de` → Server-IP gesetzt (TTL ≤ 1h für Erst-Setup)
- Port 3000 frei: `ss -tlnp | grep ':3000'` → keine Ausgabe
- Node.js ≥ 20 installiert: `node -v`
- SMTP-Zugang zu `mail.bytexx.de` bekannt

## 1. Node.js und git (falls fehlt)

```bash
# git ist auf minimalen Debian-Installationen NICHT vorbelegt — vor dem Clone installieren!
sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # erwartet v20.x
git --version
```

## 2. Linux-User + Verzeichnisse

```bash
sudo useradd --system --home /opt/sharepassword --shell /usr/sbin/nologin sharepass
sudo mkdir -p /opt/sharepassword /var/log/sharepassword
sudo chown -R sharepass:sharepass /opt/sharepassword /var/log/sharepassword
# WICHTIG: /opt/sharepassword/app NICHT von Hand anlegen — git clone macht das selbst.
# Falls schon vorhanden und leer: `sudo rmdir /opt/sharepassword/app` davor.
```

## 3. Repo deployen

```bash
sudo -u sharepass git clone https://github.com/devbytexx/SharePassword.git /opt/sharepassword/app
cd /opt/sharepassword/app
sudo -u sharepass npm ci --omit=dev
```

## 4. MariaDB

```bash
# Schema + Events
sudo mariadb < /opt/sharepassword/app/sql/001-init.sql

# Grant — Passwort generieren
PASS=$(openssl rand -base64 32)
echo "DB-Passwort: $PASS"   # gleich in .env eintragen
sudo mariadb -e "CREATE USER IF NOT EXISTS 'sharepass'@'localhost' IDENTIFIED BY '$PASS';
                 GRANT SELECT, INSERT, UPDATE, DELETE ON sharepassword.* TO 'sharepass'@'localhost';
                 FLUSH PRIVILEGES;"

# Event Scheduler permanent aktivieren
sudo sed -i '/\[mysqld\]/a event_scheduler=ON' /etc/mysql/mariadb.conf.d/50-server.cnf
sudo systemctl restart mariadb
```

## 5. .env

```bash
sudo -u sharepass cp /opt/sharepassword/app/.env.example /opt/sharepassword/.env
sudo chmod 0600 /opt/sharepassword/.env
sudo nano /opt/sharepassword/.env
# Werte eintragen — DB_PASS (oben), SMTP_*, IP_HASH_PEPPER (siehe Kommentar im File)
```

## 6. systemd

```bash
sudo cp /opt/sharepassword/app/deploy/systemd/sharepassword.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sharepassword
sudo systemctl status sharepassword
curl -fsS http://127.0.0.1:3000/api/health   # erwartet {"status":"ok"}
```

## 7. TLS

```bash
sudo certbot certonly --nginx -d secret.bytexx.de
```

## 8. nginx

```bash
sudo cp /opt/sharepassword/app/deploy/nginx/secret.bytexx.de.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/secret.bytexx.de.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
curl -I https://secret.bytexx.de/   # erwartet 200, gültiges Zert
```

## 9. logrotate

```bash
sudo cp /opt/sharepassword/app/deploy/logrotate.d/sharepassword /etc/logrotate.d/
sudo logrotate --debug /etc/logrotate.d/sharepassword
```

## 10. Backup-Skript anpassen

Im bestehenden Server-Backup-Skript (oder neu anlegen): mysqldump für `sharepassword` MUSS die `secrets`-Tabelle ausschließen.

```bash
mysqldump --ignore-table=sharepassword.secrets sharepassword > /backup/sharepassword-$(date +%F).sql
```

## 11. Funktions-Smoke-Test

1. Browser → `https://secret.bytexx.de/` → Seite lädt
2. Text eingeben, Link erzeugen
3. Link in privatem Tab öffnen → Text wird gezeigt
4. Link nochmal öffnen → "nicht gefunden" (Burn funktioniert)
5. SSL Labs: `https://www.ssllabs.com/ssltest/analyze.html?d=secret.bytexx.de` → Rating A oder besser
