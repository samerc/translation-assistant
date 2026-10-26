# Translation Assistant

A multi-user web app for freelance translators: manage clients, jobs, invoices and
deadlines, and produce translated documents from reusable templates with Word export.

- **Job management:** clients and contacts, a job workflow from quote to paid, file
  handling, a calendar, notifications and revenue reports.
- **Invoicing:** multi-job invoices, payment recording, PDF and Word export, and
  sending invoices to clients by email.
- **Document translation:** template designer or Word templates with placeholders,
  repeatable field groups, Google Translate assist, and RTL support.
- **Security:** invite-only accounts with roles and permissions, rotating refresh
  tokens in httpOnly cookies, session management, rate limiting and audited access
  control.

**Stack:** NestJS 12 · TypeORM 1 · MariaDB · Next.js 16 / React 19 · Tailwind 4

## Running locally

Requires **Node ≥ 22.12** and a MariaDB instance (Docker or a local install).

```bash
docker compose up -d                  # MariaDB (or point backend/.env at your own)
cp backend/.env.example backend/.env  # then adjust DB credentials
cp frontend/.env.example frontend/.env.local
npm install && npm run install:all
npm run dev                           # backend :3005, frontend :3080
```

On first run the schema is created and an admin account is seeded
(`admin@translation-assistant.com` / `admin123!`, or `ADMIN_INITIAL_PASSWORD`).
**Change that password immediately.**

## Tests

```bash
cd backend && npm test && npm run test:e2e   # unit + security e2e (no DB needed)
bash scripts/test-integration.sh             # full live suite (backend + frontend running)
```

## Docs

- [`CLAUDE.md`](CLAUDE.md): architecture, entities, the full API surface and
  security model
- [`docs/OPS.md`](docs/OPS.md): deployment, email, Sentry, backups and the
  migration runbook
- [`docs/design/`](docs/design/): the original design spec and colour palettes
