# Operations & Handoff Checklist

Ops hardening added on the `ops-hardening` branch: health checks, CI/CD, DB backups,
Sentry, plus the email + migration-cutover runbooks. This file lists the **manual
config steps** that need real credentials / a maintenance window — the code is in
place and no-ops safely until these are done.

---

## 0. Go-live deploy (fix/golive-blockers): do these in order

This release also moves prod from `synchronize` to migrations. Do it in a quiet
moment; it takes ~15 minutes.

1. **Back up** (DB + uploads): set up section 4 first, then run
   `schtasks /Run /TN "TA Backup"` and check `db-backups\backup.log`.
2. **Duplicate assignments check** (informational; the migration removes them,
   keeping the least-privileged row):
   ```sql
   SELECT job_id, user_id, COUNT(*) FROM job_users GROUP BY job_id, user_id HAVING COUNT(*) > 1;
   ```
3. **Earlier data steps.** Both are idempotent and harmless to re-run:
   - `INVOICE_PAYMENTS_BACKFILL` from `backend/src/migrations/1793015124357-InvoicePayments.ts`
   - the `up()` SQL of `backend/src/migrations/1793100000000-TranslatorSettingsRead.ts`
4. **Stamp the migrations prod already has via synchronize** (section 5).
5. **Edit the ecosystem env** (`C:\apps\translation-assistant\ecosystem.config.cjs`,
   `ta-backend`):
   - `DB_SYNCHRONIZE: 'false'`
   - `TRUST_CLOUDFLARE: 'true'` (section 6)
6. **Deploy:** `npm run deploy` (it now takes a backup first and aborts if that fails).
   Then on the server: `pm2 delete ta-backend` + `pm2 start ecosystem.config.cjs --only ta-backend`
   + `pm2 save` (PM2 caches env, so `restart` won't pick up step 5).
   On boot, `GoLiveFixes1793300000000` runs: missing columns (idempotent), job_users
   dedupe + unique index, filter indexes, refresh-reuse column, Translator templates
   read-only.
7. **Check:** `SELECT name FROM migrations;` lists 6 rows; log in; open **Settings →
   Security → Active Sessions**: the IP must be **your**
   public IP, not a `162.158.x` / `172.6x.x` / `104.x` Cloudflare address or 127.0.0.1.
   If it shows a Cloudflare IP, ARR isn't adding `X-Forwarded-For`: IIS Manager →
   server → Application Request Routing Cache → Server Proxy Settings → tick
   "Preserve client IP in the following header: X-Forwarded-For".

Rollback: restore the step-1 backup and redeploy the previous build with
`DB_SYNCHRONIZE: 'true'`.

---

## 1. Email (SMTP) — makes password reset & invites actually send

The code is ready (`MailService`, Settings → Email tab, `POST /api/mail/test`). In
production, reset/invite links are built from `appBaseUrl` → falls back to
`CORS_ORIGIN` (`https://translate.fancyshark.com`), so links resolve correctly.

**Do this:** log in as admin → **Settings → Email** → enter your provider's SMTP
host / port / user / pass / from address → **Save** → **Send test email**.
(SendGrid, Mailgun, Amazon SES, or your host's SMTP all work.)

- **Mailgun:** host `smtp.mailgun.org` (EU region: `smtp.eu.mailgun.org`), port `587`,
  secure off (STARTTLS), user = the domain's SMTP login (Sending → Domain settings →
  SMTP credentials), from e.g. `Translation Assistant <noreply@mg.fancyshark.com>`.
  Verify the sending domain first (SPF + DKIM DNS records, in Cloudflare DNS, set
  to **DNS only**, grey cloud) or mail lands in spam.
- If email ever breaks, an admin can still unlock a user: **Settings → Users →
  Reset password** gives a one-time temporary password (user must change it).
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
- **Dependabot** (`.github/dependabot.yml`) opens weekly grouped minor/patch PRs per
  app and individual PRs for majors. Also enable **Settings → Code security →
  Dependabot alerts + security updates** so vulnerability fixes arrive immediately.
- **Deploy** (`.github/workflows/deploy.yml`) is **manual** (Actions tab → "Deploy
  (manual)" → Run workflow). Add these repo secrets first
  (**Settings → Secrets and variables → Actions**):
  - `DEPLOY_HOST` = `144.91.89.20`
  - `DEPLOY_USER` = `samer`
  - `DEPLOY_SSH_KEY` = a private key whose public half is in the server's
    `authorized_keys` (generate a dedicated deploy keypair; don't reuse a personal key).
- The deploy job uses `pm2 restart` (code only). **If you changed the ecosystem env
  block, deploy won't reload it** — do a manual `pm2 delete` + `pm2 start` for env changes.
- **Always delete `frontend\.next\standalone` (and `backend\dist`) before extracting a new
  build** — `deploy.sh` and the workflow do this. Next.js 16 writes a runtime page cache to
  `.next\standalone\frontend\.next\server\route-cache\`; extracting over the old folder
  leaves it in place and the server keeps serving the **previous build's HTML** (old CSS
  hashes) even after a restart.

## 4. Automated backups (DB + uploads, off-site)

`scripts/backup-db.ps1` dumps the DB **and** zips `backend\uploads` (passport copies,
job files, Word templates, which the DB only points to), copies both off-site if
`BACKUP_OFFSITE_DIR` is set, rotates (14 days), and logs to `db-backups\backup.log`.
`npm run deploy` runs it before every deploy.

**Do this once, on the server, in an elevated PowerShell:**

```powershell
Copy-Item <repo>\scripts\backup-db.ps1 C:\apps\translation-assistant\scripts\backup-db.ps1
[Environment]::SetEnvironmentVariable('DB_BACKUP_PASSWORD', '<db password>', 'Machine')
[Environment]::SetEnvironmentVariable('BACKUP_OFFSITE_DIR', '<off-site folder>', 'Machine')
schtasks /Create /TN "TA Backup" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\translation-assistant\scripts\backup-db.ps1"
schtasks /Run /TN "TA Backup"
Get-Content C:\apps\translation-assistant\db-backups\backup.log -Tail 5
```

- **Off-site** = anything not on this server: a folder synced by OneDrive/Google
  Drive/Dropbox, a NAS share, or an rclone-mounted S3/B2 bucket. The task runs as
  SYSTEM, so a network share needs access for the computer account (or run the task
  as a user with `/RU <user> /RP`).
- Restart the `sshd` service once after setting the machine variables so the
  pre-deploy backup (run over SSH) sees them.
- **Test a restore once** into a scratch database (see the end of the script).

## 5. Migration cutover (get prod off `DB_SYNCHRONIZE=true`)

**Why:** `synchronize` auto-alters the schema on boot and can drop or alter data when
an entity changes. Migrations make schema changes explicit and reviewable. Since
`GoLiveFixes1793300000000` the migrations build the full schema (checked: a fresh
DB from migrations alone boots, and `migration:generate` finds no drift).

**Stamp** the migrations whose effect prod already has (synchronize created the
schema; the data steps are re-run in section 0 step 3), so they are not run again.
`GoLiveFixes` is **not** stamped: it is idempotent and must run.

```sql
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` int NOT NULL AUTO_INCREMENT, `timestamp` bigint NOT NULL,
  `name` varchar(255) NOT NULL, PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `migrations` (`timestamp`, `name`) VALUES
  (1783760966727, 'InitialBaseline1783760966727'),
  (1793004815347, 'TypeormV1JoinTableFk1793004815347'),
  (1793015124357, 'InvoicePayments1793015124357'),
  (1793100000000, 'TranslatorSettingsRead1793100000000'),
  (1793200000000, 'ClientCreatorTranslateKey1793200000000');
```

Then `DB_SYNCHRONIZE: 'false'` and deploy (section 0). From then on every schema
change is a new migration file (`npm run migration:generate -- src/migrations/Name`),
applied automatically on boot.

## 6. Cloudflare + origin (translate.fancyshark.com only)

Prod is proxied by Cloudflare. Configure it **per hostname** so other sites on the
server and other fancyshark.com subdomains are unaffected.

1. **Origin certificate:** Cloudflare → SSL/TLS → Origin Server → Create certificate.
   The default hostnames (`*.fancyshark.com`, `fancyshark.com`), RSA 2048 and 15 years
   are fine; the wildcard can be reused by other proxied subdomains on this server.
   Key format **PEM**; save the certificate as `origin.pem` and the private key as
   `origin.key` **before closing the page** (the key is shown only once). IIS needs a
   PFX: `openssl pkcs12 -export -out fancyshark-origin.pfx -inkey origin.key -in origin.pem`
   (Git Bash has openssl; set an export password). Then delete `origin.key`.
   On the server: IIS Manager → server node → Server Certificates → Import → the PFX
   (store: Web Hosting). Add an **https** binding on 443 to the Translation Assistant
   site with **host name `translate.fancyshark.com`, "Require Server Name Indication"
   ticked**, certificate = the imported one. SNI keeps it from touching other sites.
2. **Encrypt Cloudflare → origin:** Rules → Configuration Rules → Create rule:
   hostname equals `translate.fancyshark.com` → SSL: **Full (strict)**. (Changing the
   zone-wide SSL mode instead would apply to every subdomain.)
3. **Force HTTPS for visitors:** SSL/TLS → Edge Certificates → **Always Use HTTPS**
   is zone-wide but only redirects visitors at Cloudflare's edge, so it only matters
   for proxied (orange-cloud) hostnames. If some other proxied subdomain must stay on
   http, use a Redirect Rule for just this hostname instead.
4. **Stop direct-to-origin access** for this site only: in IIS, remove any binding of
   the site that has no host name (that's what answers `http://144.91.89.20`), and
   under the site's **IP Address and Domain Restrictions** allow only Cloudflare's
   ranges (cloudflare.com/ips) plus 127.0.0.1, with "Access for unspecified clients:
   Deny". Don't firewall the whole server unless every site on it is behind Cloudflare.
5. `TRUST_CLOUDFLARE: 'true'` in the backend env: the app then uses `CF-Connecting-IP`
   for rate limits, lockouts and the sessions list, but only on requests that really
   came through Cloudflare (`common/utils/client-ip.ts`).

---

## Quick reference — server facts

- Host `144.91.89.20`, SSH (key-based) as `samer`, shell is **cmd.exe**.
- **Node ≥ 22.12 required** (NestJS 12 is ESM-only; the CJS backend loads it via
  native `require(esm)`, which older Node lacks). Check with `node -v` before deploying.
- PM2 apps: `ta-backend` (3005), `ta-frontend` (3080). **Never touch `mj-wedding`.**
- Env lives **inline** in `C:\apps\translation-assistant\ecosystem.config.cjs` (not a
  `.env`). PM2 caches it → env changes need `pm2 delete` + `pm2 start`, not `restart`.
- MariaDB 11.4 on port `33777`; binaries in `C:\Program Files\MariaDB 11.4\bin`.
- Health probes: `GET /api/health` (liveness), `GET /api/health/ready` (DB check).
