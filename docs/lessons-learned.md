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

## (Impl) HMAC ist die richtige Primitive für Peppered Hash

**Was:** Erste Implementation nutzte `SHA-256(pepper || ip)` — Standard-Hash mit angehängtem Geheimnis.

**Warum schlecht:** Anfällig für Length-Extension-Angriffe, falls die Hashes je nach außen gegeben werden (Logs, Debug-Endpoint, etc.). Plus Separator-Kollisions-Risiko bei `pepper||ip`.

**Wie vermeiden:** Für jeden Peppered/Keyed-Hash IMMER HMAC nutzen: `createHmac('sha256', pepper).update(ip).digest()`. HMAC ist die kryptographisch saubere Konstruktion und macht das Schlüsselmaterial nicht angreifbar.

## (Impl) senderHint ist anonyme Nutzereingabe und landet in einer Mail

**Was:** Der "Hinweis für den Empfänger" wird vom anonymen Creator gesetzt und 1:1 in den Klartext-Body der Burn-Benachrichtigungs-Mail eingefügt.

**Warum schlecht:** Ohne Säuberung kann CR/LF eingeschleust werden → Body-Splitting, Fake-Signature-Block, Header-Injection-artige Effekte. Mail-Empfänger ist meist der Secret-Ersteller selbst, aber bei delegierten Workflows könnte er den Hinweis als vertrauenswürdig einstufen.

**Wie vermeiden:** Vor dem Einfügen `\r\n` strippen und auf 200 Zeichen kappen. Im Test verifizieren, dass nur ein RFC-3676-Signaturtrenner `-- \n` im Body vorkommt.

## (Impl) RFC 3676 Signatur-Trenner braucht den Space hinter `--`

**Was:** Editoren / Linter / `prettier` strippen oft trailing whitespace. Der RFC-3676-Trenner ist aber `-- ` (Dash-Dash-Space), nicht `--`.

**Warum schlecht:** Ohne den Space erkennen MUAs (Outlook, Thunderbird, Gmail, Apple Mail) die Signatur nicht und zitieren sie in Replies mit. Optisch unauffällig, semantisch falsch.

**Wie vermeiden:** In Template-Literalen den Space ausdrücklich machen — z.B. mit `${'-- '}` statt nackt `-- ` am Zeilenende. Macht den load-bearing Whitespace reviewer-sichtbar und immun gegen Editor-Cleanups. Im Test mit `/\n-- \nsignatur/` pinnen.

## (Impl) `node --test PATH/` ist unter Node 22 broken

**Was:** Erst-Bootstrap hatte `"test": "node --test --test-reporter=spec tests/"` — interpretiert `tests/` als Script-Path und crashed mit `ERR_MODULE_NOT_FOUND`.

**Warum schlecht:** Blockiert komplette TDD-Pipeline.

**Wie vermeiden:** Path-Argument weglassen — `node --test --test-reporter=spec` discovered `**/*.test.js` automatisch. Für gezielte Single-File-Runs `npm test -- tests/foo.test.js` nutzen.

## (Impl) Singleton-Initializer brauchen Double-Init-Guard

**Was:** `let pool = null; export function initPool(...) { pool = ... }` — wenn versehentlich zweimal aufgerufen, leakt der erste Pool (TCP-Verbindungen bis Idle-Timeout).

**Warum schlecht:** Klassischer "stiller Fehler" — sichtbar erst unter Last oder mit langen Test-Läufen.

**Wie vermeiden:** `if (pool) throw new Error('already initialized; call closePool first')` am Anfang von `initPool`. Symmetrische `closePool()` exportieren. Gleiches Pattern für jeden anderen Singleton (Mailer-Transporter usw.).
