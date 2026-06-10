-- ShareSecret schema. Idempotent. Run as DB admin.
CREATE DATABASE IF NOT EXISTS sharepassword
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE sharepassword;

CREATE TABLE IF NOT EXISTS secrets (
  token              VARBINARY(16)    NOT NULL PRIMARY KEY,
  ciphertext         LONGBLOB         NOT NULL,
  burn_after_read    TINYINT(1)       NOT NULL DEFAULT 1,
  has_passphrase     TINYINT(1)       NOT NULL DEFAULT 0,
  passphrase_salt    VARBINARY(16)    NULL,
  notify_email       VARCHAR(255)     NULL,
  sender_hint        VARCHAR(120)     NULL,
  expires_at         DATETIME         NOT NULL,
  created_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  size_bytes         INT UNSIGNED     NOT NULL,
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS brute_log (
  token              VARBINARY(16)    NOT NULL,
  ip_hash            BINARY(32)       NOT NULL,
  attempt_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token_time (token, attempt_at)
) ENGINE=InnoDB;

-- Anonyme Nutzungszähler. Nur Gesamtzahlen, keine PII, kein Bezug zu einzelnen
-- Secrets — bleibt mit der Ephemeralität vereinbar und darf im Backup bleiben.
CREATE TABLE IF NOT EXISTS counters (
  name               VARCHAR(32)      NOT NULL PRIMARY KEY,
  value              BIGINT UNSIGNED  NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT IGNORE INTO counters (name, value) VALUES ('created', 0), ('viewed', 0);

SET GLOBAL event_scheduler = ON;

DROP EVENT IF EXISTS purge_expired_secrets;
CREATE EVENT purge_expired_secrets
  ON SCHEDULE EVERY 1 MINUTE
  DO
    DELETE FROM secrets WHERE expires_at < NOW();

DROP EVENT IF EXISTS purge_brute_log;
CREATE EVENT purge_brute_log
  ON SCHEDULE EVERY 1 HOUR
  DO
    DELETE FROM brute_log WHERE attempt_at < NOW() - INTERVAL 24 HOUR;
