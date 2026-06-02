# SharePassword

Selbst-gehostetes One-Time-Secret-Tool. E2E-Verschlüsselung im Browser.

- **Domain:** `secret.bytexx.de`
- **Stack:** Node.js + Fastify + MariaDB, kein Build-Step
- **Doku:** [CLAUDE.md](CLAUDE.md), [docs/](docs/)
- **Design-Spec:** [docs/superpowers/specs/2026-06-02-sharepassword-design.md](docs/superpowers/specs/2026-06-02-sharepassword-design.md)
- **Implementierungsplan:** [docs/superpowers/plans/2026-06-02-sharepassword-implementation.md](docs/superpowers/plans/2026-06-02-sharepassword-implementation.md)

## Lokal entwickeln

```bash
npm install
cp .env.example .env       # Werte ausfüllen
# MariaDB-Schema einspielen (siehe docs/installation.md)
npm start
```

## Tests

```bash
npm test
```
