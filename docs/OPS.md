# Operations & Handoff Checklist

Ops hardening added on the `ops-hardening` branch: health checks, CI/CD, DB backups,
Sentry, plus the email + migration-cutover runbooks. This file lists the **manual
config steps** that need real credentials / a maintenance window — the code is in
place and no-ops safely until these are done.

---

## 1. Email (SMTP) — makes password reset & invites actually send

The code is ready (`MailService`, Settings → Email tab, `POST /api/mail/test`). In
production, reset/invite links are built from `appBaseUrl` → falls back to
`CORS_ORIGIN` (`https://translate.fancyshark.com`), so links resolve correctly.

**Do this:** log in as admin → **Settings → Email** → enter your provider's SMTP
host / port / user / pass / from address → **Save** → **Send test email**.
(SendGrid, Mailgun, Amazon SES, or your host's SMTP all work.)

- Until this is set, `forgot-password` returns a generic message but sends nothing —
  i.e. password reset does not work in prod.
- Alternatively set env vars in the server ecosystem (`SMTP_HOST`, `SMTP_PORT`,
  `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_BASE_URL`) — these
  override the Settings values.

## 2. Sentry — error tracking (env-gated, no-op without a DSN)

Wired on both sides; nothing is sent until a DSN is configured.

**Do this:**
1. Create a Sentry project (one for Node, one for Browser, or reuse one DSN).
2. Backend: add `SENTRY_DSN` to the server ecosystem `env` block for `ta-backend`,
   then `pm2 delete ta-backend & pm2 start ecosystem.config.cjs --only ta-backend & pm2 save`.
3. Frontend: set `NEXT_PUBLIC_SENTRY_DSN` at **build time** (it's baked into the
   client bundle), then rebuild + redeploy the frontend.

## 3. CI/CD (GitHub Actions)

- **CI** (`.github/workflows/ci.yml`) runs automatically on PRs and pushes to `main`
  (backend build + unit + security e2e; frontend build). No setup needed.
- **Deploy** (`.github/workflows/deploy.yml`) is **manual** (Actions tab → "Deploy
  (manual)" → Run workflow). Add these repo secrets first
  (**Settings → Secrets and variables → Actions**):
  - `DEPLOY_HOST` = `144.91.89.20`
  - `DEPLOY_USER` = `samer`
  - `DEPLOY_SSH_KEY` = a private key whose public half is in the server's
    `authorized_keys` (generate a dedicated deploy keypair; don't reuse a personal key).
- The deploy job uses `pm2 restart` (code only). **If you changed the ecosystem env
  block, deploy won't reload it** — do a manual `pm2 delete` + `pm2 start` for env changes.

## 4. Automated DB backups

`scripts/backup-db.ps1` does a nightly `mysqldump` + zip + 14-day rotation.

**Do this (once, on the server, elevated):** copy the script to
`C:\apps\translation-assistant\scripts\backup-db.ps1`, then register the task:

```
schtasks /Create /TN "TA DB Backup" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST ^
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\translation-assistant\scripts\backup-db.ps1"
schtasks /Run /TN "TA DB Backup"   REM test it now
```

Backups land in `C:\apps\translation-assistant\db-backups\`.

## 5. Migration cutover (get prod off `DB_SYNCHRONIZE=true`)

**Why:** `synchronize` auto-alters the schema on boot. It's safe for *additive*
changes (the pattern so far) but could drop/alter data if an entity's column type
changes or a column is removed. Migrations make schema changes explicit + reviewable.

**Current state:** prod runs `DB_SYNCHRONIZE:'true'`. The baseline migration
(`src/migrations/*-InitialBaseline.ts`) is **missing the post-baseline columns**:
`users.businessName/businessAddress/logo` and `app_settings.smtp*` + `appBaseUrl`.
So a top-up migration is required before cutover, or the baseline must be regenerated.

**Do this (in a maintenance window, after a fresh backup):**

1. **Generate the top-up migration** (local, against a scratch DB so the diff only
   contains the missing columns):
   ```
   cd backend && npm run build
   # create an empty scratch DB, run the baseline into it, then:
   npm run migration:generate -- src/migrations/PostBaselineBrandingSmtp
   # verify a second generate produces an empty migration (schema == entities)
   ```
   Commit the new migration file.

2. **Stamp the prod DB as already-migrated** (its schema already matches via
   synchronize, so migrations must NOT try to recreate tables). Create the
   `migrations` table and insert one row per migration (baseline + the top-up) with
   their `(timestamp, name)` so `migrationsRun` treats them as applied.

3. **Flip prod to migrations:** set `DB_SYNCHRONIZE:'false'` (or `NODE_ENV=production`
   without the override) in the ecosystem, then `pm2 delete` + `pm2 start` `ta-backend`.
   On boot, `migrationsRun` will find nothing pending (all stamped) and stop syncing.

4. From then on, schema changes = new migration files, run via `migration:run` on deploy.

> This is a sensitive live-DB operation — do it deliberately with a backup and a
> rollback plan (`DB_SYNCHRONIZE:'true'` restores the old behavior). Not urgent while
> changes remain additive.

---

## Quick reference — server facts

- Host `144.91.89.20`, SSH (key-based) as `samer`, shell is **cmd.exe**.
- PM2 apps: `ta-backend` (3005), `ta-frontend` (3080). **Never touch `mj-wedding`.**
- Env lives **inline** in `C:\apps\translation-assistant\ecosystem.config.cjs` (not a
  `.env`). PM2 caches it → env changes need `pm2 delete` + `pm2 start`, not `restart`.
- MariaDB 11.4 on port `33777`; binaries in `C:\Program Files\MariaDB 11.4\bin`.
- Health probes: `GET /api/health` (liveness), `GET /api/health/ready` (DB check).
