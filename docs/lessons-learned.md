# Lessons Learned

> Anti-Patterns und Knackpunkte. Pro Erkenntnis ein Block. Wird bei jedem realen Vorfall ergänzt.

## (Init) Backup der `secrets`-Tabelle ist Anti-Pattern

**Was:** Beim normalen `mysqldump <db>` würde die Tabelle `sharepassword.secrets` mitgesichert.

**Warum schlecht:** Ein gelöschtes Secret lebt im Backup weiter — die zugesicherte Ephemeralität ist gebrochen, ohne dass es jemand merkt.

**Wie vermeiden:** Backup-Skript MUSS `--ignore-table=sharepassword.secrets` enthalten. Beim Server-Aufsetzen prüfen.

## (Init) Server-seitiger Klartext ist Tabu

**Was:** Verlockung, im Server zu validieren („ist das ein gültiges Passwort-Format?")

**Warum schlecht:** Verstößt gegen Kerndesign — Server darf den Klartext nie sehen. Validierung gehört in den Browser.

**Wie vermeiden:** Bei Code-Reviews konsequent prüfen: kommt irgendwo Klartext in eine Server-Funktion? Alarm.

## (Init) Burn-on-GET ist verlockend, aber falsch

**Was:** Erst-Idee, das Secret schon beim GET zu löschen.

**Warum schlecht:** Abgebrochener Download oder Crypto-Fehler im Browser → Secret weg, ohne dass Empfänger es je gesehen hat.

**Wie vermeiden:** Burn erfolgt in separatem `POST /api/secret/:token/burn`, vom Client gemeldet nach erfolgreicher Entschlüsselung.
