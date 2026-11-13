# Translation Assistant

## Project Overview
Multi-tenant web application for translators and translation offices. Two core modules:
1. **Freelance Job Management** — clients, contacts, jobs, invoicing, calendar, reporting
2. **Document Translation** — template-based system with document designer and Word export

Each **organization (tenant)** has its own users, clients, jobs, documents, templates, invoices and settings. A **platform admin** (no tenant) creates/approves/suspends organizations and manages platform settings, but never sees organization data. See **Multi-tenancy** below.

## Multi-tenancy
- **Model**: `Tenant` (name, status `pending|active|suspended`, source `platform|signup`, `plan` reserved for pricing). `tenant_id` (NOT NULL) on clients, jobs, documents, invoices, templates, freeform_job_types, invite_tokens, tenant_settings; nullable on users (NULL = platform admin), languages and label_options (NULL = global list; tenant-owned rows are reserved for a later "add your own" feature). Child tables (emails, line items, field values, payments…) belong to their parent — every child endpoint checks the parent first.
- **Every query is scoped**: services take an `Actor` (`common/tenancy/actor.ts`: `{ userId, tenantId, isAdmin }`, `@CurrentActor()`, `actorOf(user)`). `verifyClientAccess/verifyJobAccess/verifyDocumentAccess/verifyInvoiceAccess` and `JobAccessGuard` check the tenant first for everyone (admins included) — another tenant's id answers **404**, never 403. Lists, search, reports, calendar add `tenant_id = :tenantId`. Referenced ids (client, contact, template, language, assigned user, linked job/file, clone source) must be in the caller's tenant (global languages allowed). `isAdmin` means the tenant's Admin — sees everything **in their tenant**.
- **Safety net**: `TenantIsolationSubscriber` (TypeORM `afterLoad`) throws 404 + logs `[TENANT_ISOLATION_VIOLATION]` if an entity with another tenant's `tenantId` is loaded during a tenant request. The request tenant lives in AsyncLocalStorage (`tenant-context.ts`): opened by `TenantContextMiddleware` (Nest module middleware, after body parsers), bound by `JwtStrategy` / `actorForFileToken`. Not covered: raw/aggregate queries and partial selects without tenantId — scope those explicitly. Cron jobs and platform/public requests have no tenant bound.
- **Platform admin**: role `Platform Admin`, `tenantId` NULL, permissions `platform:*` + notifications read/update only — so every tenant endpoint 403s for it (`PermissionsGuard`; `actorOf` also refuses). `/api/platform/*` is guarded by `PlatformAdminGuard` (role name + no tenant). It sees organizations' user accounts (names/emails/roles) to help with lockouts, never business data.
- **Fixed roles**: Admin / Translator / Viewer (shared rows; the user's tenant comes from `users.tenant_id`) + Platform Admin. Permissions are enforced by the seed on **every boot** (`ROLE_DEFINITIONS` in `config/seed.ts`) — change permissions there, no migration. `/api/roles` is read-only and lists only the 3 tenant roles; tenant admins can't assign Platform Admin (users, invites).
- **Per tenant**: `TenantSettings` (branding, currency, invoice prefix, upload limits, Google Translate key — each tenant pays its own, no platform fallback); job/invoice numbering (`UQ_jobs_tenant_number`, `UQ_invoices_tenant_number`; each starts at JOB-0001/INV-0001, serialized by `lockTenantSettings()` on the tenant's settings row); uploads in `uploads/<tenantId>/{jobs,passports,templates}` (`tenantDiskStorage()`); upload limits read via the request tenant in `FileValidationPipe`.
- **Status**: pending (sign-up awaiting approval) / suspended → login refused with a clear message, `JwtStrategy` rejects existing access tokens, refresh refused; suspending revokes all its sessions.
- **Sign-up** (`/signup`, public): `POST /auth/signup` creates a pending tenant + its Admin (email unverified) and emails a 24 h link (`EmailVerificationToken`); same answer for an already-registered email (that address gets an "you already have an account" mail). `POST /auth/verify-email` → platform admins get an in-app `tenant_signup` notification + email; approval → the admin is emailed. Turnstile bot check when `TURNSTILE_SECRET_KEY`/`TURNSTILE_SITE_KEY` are set (site key served by `GET /auth/signup-status`); throttled 5/h per IP; honeypot. Platform settings `signupsEnabled` switch. Unconfirmed sign-ups are deleted after 7 days (`SignupCleanupScheduler`, 03:30). Non-production returns the verification token (like password reset).
- **Deletion** (`platform/tenant-deletion.service.ts`): the organization's Admin only *requests* it (`POST /organization/deletion-request`: typed org name + password + optional reason; withdraw with `DELETE`) → platform admins get a `tenant_deletion_request` notification + email. The platform admin approves (`POST /platform/tenants/:id/delete`, also without a request) or declines (`/decline-deletion`, emails the requester). Approve: **empty** (no clients/jobs/documents/invoices/templates — users don't count) → purged at once; otherwise status **`closing`** (login refused, sessions revoked, admins emailed) with `deleteAfter` = now + `AppSettings.deletionGraceDays` (default 30, 1–365, Settings → Email & Sign-ups); `/restore` → active, `/purge` → now. `TenantPurgeScheduler` (03:45) purges due ones. Purge deletes rows in FK-safe order (invoices → documents → jobs → templates → clients → tenant lists → invites → users + their tokens/sessions/notifications → settings → tenant), then `uploads/<tenantId>`. The platform admin sees only `dataCounts`, never records. Pending sign-ups are rejected, not deleted. **Billing (later)**: a request doesn't stop billing; approval (→ closing) cancels/doesn't renew; restore resumes.
- **Invites carry an optional first/last name** (`InviteToken.firstName/lastName`; all three invite forms). `POST /auth/invite-details {token}` (public, 20/min) returns email, names, organization and role for a usable invite; `/register` shows the organization, locks the email (server still enforces the match) and pre-fills the editable names.
- **Tests**: `node scripts/test-tenancy.mjs` (live, ~240 checks: every endpoint with another tenant's ids, lists/search/reports, cross-references, roles, platform boundaries, per-tenant settings/limits, file tokens, suspension, sign-up/approval, invite pre-fill, deletion request/decline/approve/restore/purge) — runs in CI against MariaDB (`tenancy` job).

## Tech Stack
- **Runtime:** Node ≥ 22.12 (backend `engines`). NestJS 12 packages are ESM-only; the backend compiles to CommonJS and loads them via native `require(esm)`. Jest needs `--experimental-vm-modules` for the same, so `npm test`/`test:e2e` invoke jest through `node` with that flag.
- **Backend:** NestJS 12 (TypeScript 6) — `./backend/`
- **Frontend:** React 19 + Next.js 16 — `./frontend/`
- **Database:** MariaDB (Docker, or local WAMP MariaDB on 3306)
- **ORM:** TypeORM 1.x — find options use object syntax (`relations: { role: { permissions: true } }`, never string arrays); `loadRelationCountAndMap` is gone, use `attachRelationCount()` (`common/utils/relation-count.ts`); null/undefined in find `where` throws
- **Auth:** JWT + refresh tokens, RBAC
- **File uploads:** Local disk, validated by magic bytes (no image compression)
- **Word export:** `docx` npm library
- **PDF export:** `pdfkit` library (invoice export). Text goes through `PdfText` (`invoices/pdf-text.ts`): embedded Noto Sans + Noto Sans Arabic (npm `@expo-google-fonts/*`, OFL), own line wrapping, and Unicode bidi via `bidi-js` — each line is drawn as direction runs on one alphabetic baseline (fontkit shapes Arabic but does no bidi, and pdfkit wrapping drops spaces between Arabic words). Never use `doc.text` / Helvetica directly for user data. Rows are measured, pages break with a repeated table header, totals stay together, page numbers when >1 page. Not covered: CJK, Hebrew, Thai, Devanagari; `→`-style symbols missing from Noto Sans
- **Translation helper:** Google Cloud Translation API. Key set per organization by its admin in Settings > General (`TenantSettings.googleTranslateApiKey`, never returned — only `googleTranslateKeySet`); no platform-wide fallback (each organization pays its own). No key → `POST /translate` is a 503 (never fake text); Google errors/timeouts are 502/504. `GET /translate/status` drives the document page's "not set up" banner
- **Charts:** `recharts` (reporting page)
- **Scheduling:** `@nestjs/schedule` (notification cron jobs)
- **Containerization:** Docker + Docker Compose

## Project Structure
```
translation-assistant/
├── backend/              # NestJS API
│   ├── src/
│   │   ├── modules/      # Feature modules (auth, users, clients, jobs, etc.)
│   │   ├── common/       # Guards, decorators, pipes, filters
│   │   └── config/       # Configuration
│   └── test/
├── frontend/             # Next.js web app
│   ├── src/
│   │   ├── app/          # Next.js app router pages
│   │   ├── components/   # Reusable UI components
│   │   ├── lib/          # Utilities, API client, hooks
│   │   └── styles/       # Global styles, theme
│   └── public/
├── docs/                 # OPS.md (ops handoff/runbooks), design/ (original design spec + palettes)
├── scripts/              # backup-db.ps1 (DB + uploads), test-integration.sh
├── docker-compose.yml    # MariaDB + app services
└── CLAUDE.md
```

## Commands
- `npm run dev` — Start both backend + frontend (from project root)
- `cd backend && npm run start:dev` — Start backend only (port 3005)
- `cd frontend && npm run dev` — Start frontend only (port 3080)
- `docker compose up -d` — Start MariaDB
- `docker compose down` — Stop all containers
- `cd backend && npm test` — unit tests; `npm run test:e2e` — DB-free security e2e suite (both run in CI)
- `bash scripts/test-integration.sh` — live integration suite (~172 checks; needs backend on :3005 + frontend on :3080 + a scratch DB; creates its own organization as the platform admin, then runs as that organization's admin)
- `node scripts/test-tenancy.mjs` — live cross-tenant isolation suite (~200 checks; backend on :3005, non-production, scratch DB; also in CI)

## Dependencies
- Dependabot (`.github/dependabot.yml`): weekly grouped minor/patch per app, majors as separate PRs. TypeScript 7 majors ignored (no JS API; ts-jest/typescript-eslint unsupported).
- `multer` pinned to a patched version via `overrides` in `backend/package.json` (platform-express pins an older one) — drop when Nest catches up.

## Auth
- JWT access tokens (15 min TTL, returned in body → localStorage) + refresh tokens (7 days)
- **Refresh token delivered as an httpOnly, SameSite=Strict cookie** (`refresh_token`, path `/api/auth`, `secure` in prod) — never exposed in the response body. Requires `cookie-parser` (wired in `main.ts`) and CORS `credentials: true`.
- Refresh token rotation (SHA-256 hash in `Session`). **Reuse detection**: a session keeps `previousRefreshTokenHash`; presenting an already-rotated token revokes that session (thief and user both have to log in again)
- A session's IP / user-agent changing on refresh is logged (`SESSION_FINGERPRINT_CHANGE`) and recorded, **not** revoked — Wi-Fi↔mobile, Cloudflare edge changes and browser updates are normal
- **Session tracking**: each login/refresh records a `Session` (IP, user-agent, lastUsed). Users can list active sessions (`GET /auth/sessions`, the caller's own marked `current`), revoke one (`DELETE /auth/sessions/:id`), or `logout-everywhere` (revokes all + clears cookie). Password reset and password change revoke all sessions (the change-password modal then signs the user out). Refresh JWTs carry a random `jti`, so concurrent logins never share a session hash.
- **Real client IP behind Cloudflare**: with `TRUST_CLOUDFLARE=true` (prod), `cloudflareClientIpMiddleware` (`common/utils/client-ip.ts`) sets `req.ip` from `CF-Connecting-IP` — only when the TCP peer is loopback (IIS) **and** the last `X-Forwarded-For` hop is a Cloudflare range, so a direct hit on the origin can't spoof it. Everything (throttler, lockout, sessions) reads `req.ip`
- **Admin password reset**: `POST /users/:id/reset-password` (`@AdminOnly`, not self, 10/hr) returns a one-time temporary password, sets `mustChangePassword`, revokes the user's sessions — the fallback when email reset isn't available
- **Password reset flow**: `forgot-password` → `verify-reset-token` → `reset-password`. Tokens are 32-byte random, single-use, 30-min expiry (`PasswordResetToken`). No email service yet — in **non-production** the token is returned in the response for testing; in production only a generic message is returned (see `requestPasswordReset` TODO to wire email).
- Seeded **platform admin**: `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD` (defaults `admin@translation-assistant.com` / `admin123!` with `mustChangePassword` — banner until changed). Seeded when no platform admin exists. First run also seeds global en/ar/fr languages and label options. No organization is seeded; the dashboard shows organization admins a Getting started checklist
- Fixed roles (see Multi-tenancy): Admin (everything in its organization), Translator (create/read/update on clients/jobs/documents/files/calendar/notifications, **read-only templates** — shared by the organization's documents — + `settings:read`), Viewer (read-only), Platform Admin (`platform:*`)
- RBAC uses `@RequirePermissions('resource:action')` decorator + `PermissionsGuard`
- **`@AdminOnly()` + `AdminGuard`**: hard role-name check (`Admin` = the organization's admin) on top of RBAC for privilege-sensitive tenant endpoints (users, invites, settings writes). Platform endpoints use `PlatformAdminGuard` instead
- Roles can't be created, renamed or edited through the API (fixed set, permissions from the seed)
- `JwtStrategy` accepts only `type: 'access'` tokens — refresh and file-access tokens (same secret; file tokens travel in URLs) are refused as API bearers
- Joining an organization is by invite: its admin (`POST /api/auth/invite`) or the platform admin (`POST /api/platform/tenants/:id/invite`, default role Admin). New organizations come from the platform admin (`POST /api/platform/tenants` — invites the first admin) or public sign-up (approval required)
- Invite tokens are email-bound (case-insensitive), one-time use, 7-day expiry, and carry the tenant. The role is resolved when the invite is created (tenant roles only): none picked = Translator; an unknown role id is a 400 then, not at registration. Registering is refused once the organization isn't active

## Security
- All IDs are UUIDs (not sequential integers) — prevents enumeration
- JWT secret required via env var in production (crashes on startup if missing)
- Password complexity enforced: uppercase, lowercase, number, special character required
- Job access control: `JobAccessGuard` checks user assignment, admins bypass
- View-only users blocked from write operations on jobs, documents and invoices (`verifyJobAccess`/`verifyDocumentAccess`/`verifyInvoiceAccess` take a `'view' | 'edit'` level — pass `'edit'` on every write)
- `User.password` and `User.refreshToken` are `select: false` — never returned by any query (JobUser.user is eager). Code that needs the hash selects it explicitly (`loadPasswordHash`, `changePassword`)
- Emailing an invoice needs `invoices:update` + edit access, rate-limited to 10/hour (it sends branded mail to any address)
- Settings responses never include `smtpPass` (platform settings → `smtpPassSet`) or `googleTranslateApiKey` / `tenantId` (tenant settings → `googleTranslateKeySet`, admins)
- Download headers go through `contentDisposition()` (`common/utils/content-disposition.ts`): ASCII `filename` + RFC 5987 `filename*`, exposed via CORS `exposedHeaders`; document exports download as `JOB-0001 Template name.docx`
- Non-admin job list filtered to only assigned jobs (innerJoin on job_users)
- ALL document endpoints verify job access via `verifyDocumentAccess()`/`verifyJobAccess()`
- ALL invoice endpoints verify access via `verifyInvoiceAccess()` (creator or linked job access)
- Document clone validates access to both source and target jobs
- Document search-for-clone filtered by user's accessible jobs
- File linking validates access to source job
- File uploads validated against allowed types and max size; multer hard cap `UPLOAD_HARD_LIMIT_BYTES` (100 MB) on disk uploads
- `UploadCleanupInterceptor` (global) deletes multer disk uploads whenever the request fails — rejected/unauthorized uploads never stay on disk
- Filenames sanitized in Content-Disposition headers (`replace(/[^\w.\-]/g, '_')`)
- JWT token for file viewing passed via query param (not stored in URLs)
- Pagination limits enforced server-side (max 100)
- Deletes blocked by a non-cascading FK are refused up front with a clear 400 (no generic FK error): client with jobs or invoices, job on an invoice, template used by documents, template field with document values
- Job creation validates all referenced entities (client, language, template) exist
- Job user assignment validates user exists before creating assignment
- Invoice creation requires at least 1 line item; due date ≥ issue date
- **A job is billed once**: a job can't be linked on a second invoice unless the other is cancelled (create, edit, and reviving a cancelled invoice). Checked inside the `app_settings` lock, so concurrent invoices can't both pass
- Search terms are LIKE-escaped with `likeContains()` (`common/utils/like.ts`) — `%`/`_` match literally. Use it for every `LIKE` built from input
- Request bodies over 1 MB → 413; deletes blocked by an FK the service doesn't pre-check → 409 with a "still used by other records" message (`GlobalExceptionFilter`)
- Word template uploads rejected if no valid placeholders found
- **Client visibility** (non-admins): clients they created (`Client.createdByUserId`) or have a job with — one SQL rule, `clientVisibleSql()` (`clients/client-access.ts`), used by the client list/detail checks, search and job creation (a non-admin can't open a job on a client they can't see)
- Search access control: non-admins only see clients they created or have jobs with, only active templates; each result type is dropped unless the caller has that resource's `:read` permission (Translators get no invoices)
- Translate endpoint: language code validation, 5000 char limit, 10s timeout, 30/min rate limit
- **Global guard chain (registration order in `app.module.ts`)**: `HoneypotGuard` (rejects writes with a filled hidden `_hp` field — bot trap) → `AbuseDetectionGuard` (blocks SQL-injection / XSS payloads in JSON bodies — not query/params, and multipart fields are not parsed yet when global guards run) → `ThrottlerGuard` (global 300 req/min) → `WriteThrottleGuard` (120 write ops/min per user or IP). `AdminGuard` is applied per-controller (needs `req.user`).
- **`GlobalExceptionFilter`** (`main.ts`): logs full technical details server-side, returns only sanitized messages to clients (no stack traces, SQL, or file paths); maps TypeORM `QueryFailedError`/`EntityNotFoundError` to safe 409/404/400
- **Common-password blocklist**: registration/password-change reject the top ~550 breached passwords via `@IsNotCommonPassword` validator — also their stems with digits/symbols/leetspeak stripped (`Password1!`, `Welcome1!`, `P@ssw0rd2024`)
- Password reset and invite tokens are single-use, claimed with a conditional `UPDATE … WHERE used = false` (safe under concurrent requests); reset revokes all sessions
- Rate limiting: login (15/min), register (10/min), refresh (10/min), forgot-password (3/min), verify-reset (10/min), reset-password (5/min), change-password (5/min), invite (5/hr). Global fallback 300/min + 120 writes/min per identity.
- Centralized frontend logger (ready for Sentry/external service)
- Frontend: `ErrorBoundary` component wraps the app (`layout.tsx`) — graceful fallback UI on render errors
- Frontend: sidebar items hidden based on user permissions (no Invoices/Reports for Translator role); pages wrapped in `RequirePermission` (`components/RequirePermission.tsx`) show a no-access state instead of failing requests (invoices, reports)
- Frontend: dashboard gracefully handles 403 for non-admin users
- Frontend: unsaved changes warning on document fill page — `useUnsavedChangesGuard(dirty)` (`lib/unsaved-changes.ts`) covers browser close and in-app links; shell code that navigates with `router.push` (Topbar search/notifications) calls `confirmLeave()` first
- Frontend: status transitions enforced (only valid next states selectable)
- Frontend: fully responsive (mobile hamburger menu, table scroll, stacked forms)

## Database & Performance
- **Schema management**: dev uses TypeORM `synchronize` (auto-sync entities→schema); **production runs migrations** (`synchronize: false`, `migrationsRun: true` on boot). Gated by `NODE_ENV`, overridable via `DB_SYNCHRONIZE=true|false`. Config in `database.config.ts`; CLI DataSource in `config/data-source.ts`.
  - Migration scripts (in `backend/`): `npm run migration:generate -- src/migrations/Name`, `migration:run`, `migration:revert`, `migration:show`. All build first (CLI runs against compiled `dist/`).
  - `src/migrations/*-InitialBaseline.ts` is the baseline (full current schema, validated: generates zero diff against the live schema).
  - Migrations build the **complete** schema (checked 2026-11: fresh DB from migrations alone boots; `migration:generate` finds no drift). `*-GoLiveFixes` is idempotent (`ADD COLUMN/INDEX IF NOT EXISTS`) so it runs safely on prod's synchronize-built schema.
  - **Prod cutover runbook**: docs/OPS.md §0 + §5 (stamp the first five migrations, `DB_SYNCHRONIZE=false`, deploy — GoLiveFixes then runs). Every schema change after that is a new migration file.
  - Seed always creates the single `app_settings` (platform) row; every tenant gets its `tenant_settings` row when created (numbering locks it — `lockTenantSettings()` self-heals a missing one).
  - `*-MultiTenancy` moves any pre-existing data into one "Default organization" (old app settings become its settings); on an empty DB it creates no tenant.
- Connection pool: 20 max, 10s connect timeout, 30s idle timeout (configurable via env)
- Graceful shutdown: `app.enableShutdownHooks()` drains pool on SIGTERM/SIGINT
- Transactions: job creation, invoice creation/update and document save-values wrapped in a transaction. Invoice **and job** numbers: `MAX()+1` (invoices: for the current prefix), per tenant, generated inside the create transaction after locking the tenant's `tenant_settings` row (serializes concurrent creates in that tenant only). Prefix max 15 chars (invoiceNumber is varchar(20))
- Never `save()` an entity loaded with a `cascade: true` relation after replacing that relation's rows separately — TypeORM writes the stale loaded rows back. Use `update()` for the scalars (see `InvoicesService.update`)
- No eager loading on entities — all relations loaded explicitly per query
- List endpoints use `attachRelationCount()` for counts (not full relation joins)
- N+1 eliminated: batch `IN()` queries, `Promise.all` for parallel validation
- `recalculateTotal` uses DB `SUM()` aggregation (not in-memory)
- Cron job overlap prevention: in-memory lock + error handling + logging
- `job_users` has a unique `(job_id, user_id)` index; `assignUser` turns a lost race (ER_DUP_ENTRY) into a permission update
- Indexes on filter columns: `jobs.status`, `jobs.deadline`, `invoices.status`, `invoices.dueDate`, `notifications(user_id, isRead)`, `invoice_payments.paidAt` (declared with `@Index` on the entities so synchronize and migrations agree)
- Overdue invoice check: single batch `UPDATE` (not N individual saves)

## File Management
- Uploads go to `uploads/<tenantId>/<jobs|passports|templates>/` (`tenantDiskStorage()`)
- Physical files deleted on entity removal (job files, passport copies, templates) — always **after** the DB delete succeeds, never before
- Linked job files share the original's `filePath`; `unlinkUnreferencedFiles()` (jobs.service) deletes a file only when no `JobFile` row references it any more
- Export files (PDF/DOCX) deleted from disk after streaming to client
- Old word template files deleted when replaced with new upload (after the new path is saved)
- Document save-values only accepts field ids from the document's own template

## Deployment
- Server: `translate.fancyshark.com` (144.91.89.20)
- **Behind Cloudflare** (proxied DNS). Origin setup — origin cert, per-hostname Full (strict), origin restricted to Cloudflare IPs, `TRUST_CLOUDFLARE=true` — in docs/OPS.md §6
- IIS reverse proxy: `/api/*` → localhost:3005, `/*` → localhost:3080
- PM2 manages backend + frontend processes
- `npm run deploy` — builds, packages, uploads, **backs up DB + uploads on the server first** (aborts if that fails; `SKIP_BACKUP=1` to bypass), restarts
- Backups: `scripts/backup-db.ps1` (DB dump + uploads zip + optional off-site copy via `BACKUP_OFFSITE_DIR`, 14-day rotation) as a nightly scheduled task — docs/OPS.md §4
- Frontend uses Next.js standalone output (~4MB deploy)
- PM2 auto-resurrect on reboot via Windows Scheduled Task

## Conventions
- **Lint is clean** (backend 0/0, frontend 0 errors) — keep it that way: `npm run lint` in each app. Backend tests relax `no-unsafe-*` (supertest bodies are `any`).
- Config factories (`config/app.config.ts`, `config/database.config.ts`) read `process.env` inside the function, never at module load — `.env` is loaded by `ConfigModule.forRoot` after these files are imported.
- `GlobalExceptionFilter` logs every database error server-side (error level) even when it is mapped to a 400 for the client.
- Admins cannot change their own role or active status (`PATCH /users/:id`, `/deactivate`); deactivating by any route revokes the user's sessions.
- Backend request typing: `getRequest<AuthenticatedRequest>()` behind the `jwt` guard, `MaybeAuthenticatedRequest` in global guards (they run before auth, so `req.user` is absent there), `RefreshRequest` on `/auth/refresh` — all in `common/types/authenticated-request.ts`. Raw queries: always `getRawOne<{...}>()` + `Number()`.
- Temp export downloads: `streamThenDelete(filePath, res)` (deletes on success, error and client abort).
- Frontend: no setState directly in effects or `Date.now()` in render (React Compiler lint) — derive state, use `useNow()` + `formatTimeAgo()`, `uid()` for client ids, `useSyncExternalStore` for module stores (see `lib/toast.tsx`, `lib/confirm.tsx`). `api.*` resolves empty response bodies as `undefined`.
- Frontend API calls: always `api.*` — including uploads (`api.upload(path, formData, 'POST')`) and file exports (`api.download(path, fallbackName)`); never raw `fetch` with the token, which skips refresh. `authedFetch` refreshes at most once at a time (shared promise + `navigator.locks` across tabs, because refresh tokens are one-time use) and never refreshes on `/auth/login|register|…` (there a 401 means bad credentials). `ApiError.message` is always a string (validation arrays joined).
- Async click/submit handlers: `try/catch/finally` — busy flags reset in `finally`, errors shown (`toast.error` or the form's error area). Client fields use `<ClientPicker>` (`components/ui/ClientPicker.tsx`): a searchable combobox that queries `/clients?search=` as you type — never a `<select>` of a fetched list (the API caps pages at 100). `useClient(id)` (`lib/use-client.ts`) loads one client by id.
- All API routes prefixed with `/api/`
- RBAC permissions follow `resource:action` format (e.g., `clients:create`)
- Database migrations managed via ORM (synchronize in dev, migrations in prod)
- All tables searchable and sortable
- File uploads validated against allowed types and max size (configurable in settings)
- Security-first: input validation, parameterized queries, rate limiting, CSRF protection
- Font: Plus Jakarta Sans (body), JetBrains Mono (code/monospace)

## Color Palettes
Eight palettes (user selects in Settings > Appearance; saved per user in `colorPalette`):
Indigo Minimal (default) `#4F46E5`, Ocean Blue `#1D4ED8`, Teal Focus `#0D9488`, Slate & Amber `#334155`, Violet `#7C3AED`, Orchid `#A21CAF`, Copper `#C2410C`, Forest `#15803D`.
- A palette only sets `--brand`, `--brand-hover`, `--brand-accent` (`globals.css` `[data-palette]`); all tints, dark-mode lifts and text-on-tint colours are derived. Adding one = a CSS line + `PALETTE_OPTIONS` (`lib/theme-context.tsx`) + the `@IsIn` list in `UpdateUserDto`.
- Light + dark mode supported (separate toggle from palette). Text on a tinted background uses `text-primary-text` / tone classes, never `text-primary` (unreadable in dark mode).

## UI Kit (`frontend/src/components/ui/`)
- Use these instead of hand-written class strings: `Button`/`buttonClass()` (primary/secondary/ghost/danger; Cancel = secondary), `Input`/`Select`/`Textarea`/`SearchInput`/`Field`, `Badge`, `PageHeader`, `EmptyState`, `Alert`, `SegmentedControl` (≤4 options), `TableCard`/`SortableTh`/`RowChevron`/`Pagination` (`DataTable.tsx`), `ClientPicker`, outline icons in `icons.tsx`.
- CSS component classes behind them live in `globals.css` `@layer components` (`.btn*`, `.input`, `.card`, `.data-table`, `.badge`, `.tone-*`, `.segmented`). Status colours: `lib/status.ts` maps → tone classes.
- Clickable table rows: `<tr data-href onClick=…>` + `<RowChevron />` as the last cell.
- Overdue = open job (`OPEN_JOB_STATUSES`) past its deadline: `isJobOverdue(job, todayLocal(useNow()))` from `lib/status.ts`. Keys → labels: `humanize()` (`lib/format.ts`).
- Fully on React kit components: app shell (Sidebar/Topbar), dashboard, Clients/Jobs/Invoices/Templates lists, Settings > Appearance. All other pages use the kit's CSS classes directly (`className="btn btn-primary"`, `input`, `card`, `data-table`, `tone tone-*`) — swap to the React components when you touch them; never reintroduce hand-written button/input class strings.

## Database Entities

### Auth & Users
- **Tenant** — name, status (pending/active/suspended/closing), source (platform/signup), plan (reserved), approvedAt, deletionRequestedAt/ByUserId/Reason, deleteAfter
- **TenantSettings** — tenantId (1:1), companyName, companyAddress, companyLogo, baseCurrency, invoicePrefix, maxUploadSizeMb, allowedFileTypes (JSON), googleTranslateApiKey. Invoice exports use the creator's My Business details, falling back to these
- **User** — email (unique platform-wide), password (bcrypt), firstName, lastName, avatar, isActive, emailVerified, colorPalette, darkMode, mustChangePassword, roleId, tenantId (NULL = platform admin), refreshToken
- **EmailVerificationToken** — token, userId, expiresAt, used (self sign-up, 24 h)
- **Role** — name, description. M2M with Permission via `role_permissions`
- **Permission** — resource, action (e.g., `clients:create`)
- **InviteToken** — token, email, firstName, lastName (optional, pre-fill), roleId, tenantId, expiresAt, used, usedByUserId
- **Session** — userId, refreshTokenHash, ip, userAgent, lastUsedAt, revoked. One row per active login; powers session list/revoke and logout-everywhere.
- **PasswordResetToken** — token, userId, expiresAt, used. 32-byte single-use, 30-min expiry.

### Settings
- **AppSettings** (platform, one row) — smtpHost/Port/Secure/User/Pass/From, appBaseUrl, signupsEnabled, deletionGraceDays
- **Language** — code, name, direction (ltr/rtl), isActive, tenantId (NULL = global, managed by the platform admin; unique (tenant, code), global codes unique via the service)
- **LabelOption** — category (email/phone/address), value, sortOrder, tenantId (NULL = global). Configurable labels for client contact info.
- **FreeformJobType** — name, description, prices, isActive, tenantId (per organization)

### Clients
- **Client** — type (company/person), name, taxId, notes, createdByUserId
- **ClientEmail** — email, label, isPrimary. Multiple per client.
- **ClientPhone** — phone, label, isPrimary. Multiple per client.
- **ClientAddress** — address, label, isPrimary. Multiple per client.
- **Contact** — firstName, lastName, email, phone, role, notes. Only on company-type clients.
- **PassportCopy** — label, filePath, originalName, mimeType, fileSize. Reference images for name spellings.

### Templates
- **Template** — type (designer/word/simple), name, description, pricePerPage, discountedPricePerPage, layoutJson, wordFilePath, wordFileName, isActive
  - **Designer type**: layout built with block-based designer, stored in layoutJson
  - **Word type**: .docx file uploaded, placeholders like `{field_name}` replaced on export
    - Repeatable groups: `{#group_key}` … `{/group_key}` repeats the enclosed paragraphs/table row once per entry (no nesting). One scanner (`templates/word-placeholders.ts`) validates upload + preview; "Create Fields for All" puts fields found inside a loop into that group; preview warns when a loop field has a different `groupKey`. A group field used outside any loop exports its first entry
  - **Designer type** export: `field`/`field-row` blocks showing group fields repeat once per entry (`collectFieldValues()` in export.service); labels come from the target language (`fieldLabelResolver()`). An empty layout exports a default document: title, fixed fields in sortOrder, one table per group
  - **Simple type**: pricing only, no fields or layout (used for freeform jobs)
- **TemplateField** — fieldKey, fieldType (text/textarea/number/date/image), sortOrder, required, groupKey. Keys (and group keys) must match the Word placeholder rule `/^[a-zA-Z_][a-zA-Z0-9_]*$/` (`FIELD_KEY_PATTERN`)
  - Fields with same `groupKey` form a repeatable set (e.g., family extract rows)
  - Fields with no `groupKey` are fixed (appear once)
- **TemplateFieldLabel** — label text per language per field (M2O to Language)

### Jobs
- **Job** — jobNumber (auto: JOB-0001), type (template/freeform), title, description, clientId, contactId, sourceLanguageId, targetLanguageId (nullable for non-translation), status, deadline, calculatedTotal, finalPrice, isFreeOfCharge, freeOfChargeReason, paymentCurrency, paymentAmount, notes
  - Status flow: quote → accepted → in_progress → delivered → invoiced → paid (+ lost, cancelled)
  - Locked when delivered/invoiced/paid — reopen to edit. The lock covers the job's files and documents too (reads/exports still allowed; invoicing is unaffected)
  - Documents auto-created for non-simple template line items
- **JobLineItem** — jobId, templateId, description, pageCount, pricePerPage, discountedPricePerPage, useDiscountedPrice, lineTotal
- **JobUser** — jobId, userId, permissionLevel (view/edit). Controls job access.
- **JobFile** — jobId, category (source/translated), fileName, filePath, fileSize, mimeType, linkedFromJobId

### Documents
- **Document** — jobId, templateId, status (draft/completed), clonedFromId
- **DocumentFieldValue** — documentId, templateFieldId, pageNumber, entryIndex, value

### Invoices
- **Invoice** — invoiceNumber (auto: INV-0001), clientId, status (draft/sent/paid/overdue/cancelled), issueDate, dueDate, subtotal, taxRate, taxAmount, total, notes, currency, paidAt, paidAmount, createdByUserId
  - Status flow: draft → sent → paid (or overdue → paid). Any → cancelled. Cancelled → draft.
  - **'paid' is never set by hand** — only by recording payments. Partial payments keep the invoice sent/overdue (UI: "partially paid") until the balance is 0; then paid, paidAt = last payment date. Deleting a payment reopens a paid invoice (sent, or overdue past due date). Can't cancel an invoice with payments.
  - Sending invoice transitions linked jobs to 'invoiced'. Paid in full → jobs 'paid'; reopened → back to 'invoiced'.
  - paidAmount = sum of payments (null when none); paidAt = date fully paid (null otherwise)
- **InvoiceItem** — invoiceId, jobId (optional link), description, quantity, unitPrice, lineTotal, sortOrder
- **InvoicePayment** — invoiceId (cascade), amount, paidAt (date), method, note, createdByUserId. Recorded in a transaction with a row lock on the invoice (no overpayment races); amounts above the balance are refused

### Notifications
- **Notification** — userId, type (job_status_change/deadline_approaching/invoice_overdue/job_assigned), title, message, link, isRead
  - Auto-created on: job status changes, user assignment, deadline within 3 days, invoice overdue
  - Daily cron at 8 AM checks deadlines and overdue invoices (@nestjs/schedule)

## API Endpoints

### Auth (`/api/auth`)
- `POST /login` — Login; returns `{ user, accessToken }`, sets `refresh_token` httpOnly cookie
- `POST /register` — Register with invite token (same response/cookie as login)
- `POST /refresh` — Rotate tokens (reads `refresh_token` cookie via `jwt-refresh` strategy)
- `POST /logout` — Invalidate refresh token + clear cookie
- `POST /logout-everywhere` — Revoke all sessions + clear cookie
- `GET /sessions` — List active sessions
- `DELETE /sessions/:sessionId` — Revoke a specific session
- `GET /profile` — Get current user
- `POST /invite` — Generate invite token (admin only, `@AdminOnly()`; optional firstName/lastName)
- `POST /invite-details` — Public: email/names/organization/role of a usable invite (pre-fills `/register`)
- `POST /file-token` — Short-lived token for file viewing
- `POST /forgot-password` — Request a password reset token
- `POST /verify-reset-token` — Check a reset token is valid (returns masked email)
- `POST /reset-password` — Set a new password with a valid token

### Organization (`/api/organization`) — the caller's own (Admin)
- `GET/POST/DELETE /deletion-request` — status / request (confirmName, password, reason?) / withdraw

### Users (`/api/users`)
- Full CRUD + `PATCH /:id/activate`, `PATCH /:id/deactivate`, `POST /:id/reset-password` (admin: one-time temporary password)
- `GET /profile/me` + `PATCH /profile/me` — Read / self-update own profile, no `users:*` permission needed (no role/active change)
- `POST /change-password`

### Roles (`/api/roles`) — read-only
- `GET /`, `GET /:id`, `GET /permissions` — the 3 tenant roles and the (non-platform) permission catalogue

### Settings (`/api/settings`) — the caller's organization
- `GET /` + `PATCH /` — organization settings (PATCH: Admin)
- `GET /languages`, `GET /labels`, `GET /labels/:category` — global + the organization's own (read)
- CRUD `/freeform-job-types` (writes: Admin)

### Platform (`/api/platform`) — platform admin only
- `GET /tenants?status=&search=` (with user counts, admins, status counts), `GET /tenants/:id` (+ accounts), `POST /tenants` (name, adminEmail → invite), `PATCH /tenants/:id`
- `POST /tenants/:id/approve|suspend|reactivate|reject` (reject = delete a pending sign-up), `POST /tenants/:id/invite` (optional firstName/lastName)
- `POST /tenants/:id/delete` (empty → purge now, else closing), `/decline-deletion`, `/restore`, `/purge`; `GET /tenants/:id` adds `dataCounts` + `deletionGraceDays`
- `POST /users/:id/reset-password`, `PATCH /users/:id/activate|deactivate` (tenant users only)
- `GET/PATCH /settings` (SMTP, app URL, signupsEnabled), CRUD `/languages`, CRUD `/labels` (global lists)
- `POST /api/mail/test` — SMTP test (platform admin)

### Clients (`/api/clients`)
- Full CRUD with search, type filter, sort, pagination
- `POST/PATCH/DELETE /:id/emails/:emailId` — Client emails
- `POST/PATCH/DELETE /:id/phones/:phoneId` — Client phones
- `POST/PATCH/DELETE /:id/addresses/:addressId` — Client addresses
- CRUD `/:id/contacts` — Contacts (company clients only)
- `POST/GET/DELETE /:id/passports` — Passport copy uploads
- `GET /:id/passports/:copyId/file` — Serve passport file (token via query param)

### Templates (`/api/templates`)
- Full CRUD with search, isActive filter, sort
- `POST/PATCH/DELETE /:id/fields/:fieldId` — Template fields
- `PATCH /:id/fields/reorder` — Reorder fields
- `POST /:id/upload-word` — Upload Word template file
- `GET /:id/word-preview` — Get HTML preview + placeholder validation
- `POST /:id/word-placeholders` — Auto-create fields from placeholders

### Jobs (`/api/jobs`)
- Full CRUD with search, status filter (one status or comma-separated), `hasDeadline=true`, client filter, sort, pagination
- `PATCH /:id/status` — Update job status
- `POST /:id/reopen` — Reopen a locked job
- `POST/DELETE /:id/users/:userId` — Assign/remove users
- `POST/PATCH/DELETE /:id/line-items/:itemId` — Job line items
- `POST /:id/files` — Upload source/translated files (with FileValidationPipe)
- `GET /:id/files/:fileId/download` — Download a job file (attachment, `application/octet-stream`; view-only assignees allowed)
- `POST /:id/files/link` — Link file from another job
- `DELETE /:id/files/:fileId` — Remove file

### Documents (`/api/documents`)
- `GET /by-job/:jobId` — List documents for a job
- `GET /search-clone` — Search completed documents for cloning
- `GET /:id` — Get document with template fields and values
- `POST /` — Create document (with optional cloneFromId)
- `POST /:id/save-values` — Save all field values (replace)
- `PATCH /:id/status` — Mark draft/completed
- `POST /:id/clone` — Clone document to another job
- `POST /:id/export` — Export to .docx (designer: generate, word: replace placeholders)
- `DELETE /:id` — Remove document

### Translate (`/api/translate`)
- `GET /status` — `{ configured }` (is a key set)
- `POST /` — Google Translate proxy (text, from, to). Validated: language codes (ISO 639-1), max 5000 chars, 10s timeout, 30 req/min. 503 when no key

### Invoices (`/api/invoices`)
- Full CRUD with search, status/client/date filters, sort, pagination
- `GET /by-job/:jobId` — List invoices linked to a job
- `PATCH /:id/status` — Update invoice status (validated transitions)
- `POST /:id/record-payment` — Record a (partial) payment: `paidAmount`, optional `paidAt`, `method`, `note`; ≤ balance due
- `DELETE /:id/payments/:paymentId` — Delete a payment (recomputes paidAmount/status)
- `POST /:id/export-pdf` — Export invoice as PDF
- `POST /:id/export-word` — Export invoice as Word (.docx)

### Notifications (`/api/notifications`)
- `GET /` — List notifications (filterable by isRead, paginated)
- `GET /unread-count` — Get unread count
- `PATCH /:id/read` — Mark as read
- `POST /mark-all-read` — Mark all read

### Calendar (`/api/calendar`)
- `GET /events?month=5&year=2026` — Get events (job deadlines + invoice due dates)

### Reports (`/api/reports`)
- `GET /dashboard-stats` — Active jobs, monthly revenue, pending invoices, due this week
- `GET /revenue?period=monthly&from=2026-01&to=2026-05` — Revenue over time (sum of payments by payment date — partial payments count when received). `from`/`to`: `YYYY-MM` (whole month) or `YYYY-MM-DD`, inclusive, else 400. Monthly results include every month in range (0 when no payments)
- `GET /by-client` — Revenue per client
- `GET /job-status` — Jobs by status breakdown

### Search (`/api/search`)
- `GET /?q=term` — Global search across clients, jobs, templates, invoices (min 2 chars)

## Frontend Pages
- `/login` — Login page (public, links to Forgot Password and — when sign-ups are open — Create an account; offers to resend the confirmation email)
- `/signup` — Public sign-up (organization + first admin, terms/privacy consent, Turnstile when configured)
- `/verify-email?token=` — Confirms a sign-up's email
- `/terms`, `/privacy` — Draft legal pages (`NEXT_PUBLIC_LEGAL_OPERATOR` / `NEXT_PUBLIC_LEGAL_CONTACT`) — **review before opening sign-ups**
- `/platform` — Organizations (platform admin): status filter, pending approvals, approve/reject, create + invite
- `/platform/tenants/:id` — Organization detail: rename, approve/reject/suspend/reactivate, accounts (reset password, (de)activate), invite another admin
- `/forgot-password` — Request a reset link (public). In dev shows the generated reset link directly (no email service).
- `/reset-password?token=` — Verify token and set a new password (public)
- `/` — Dashboard: summary cards (reports:read), Upcoming deadlines (open jobs, overdue in red), admin Getting started checklist. The platform admin is redirected to `/platform`
- `/clients` — Client list with search, type filter, sort, pagination
- `/clients/:id` — Client detail (Overview with info/emails/phones/addresses cards, Contacts tab, Passport Copies tab, Jobs tab)
- `/templates` — Template list (table + card view toggle, search, status filter, sort)
- `/templates/:id` — Template detail (Fields tab with inline table editor, Layout Designer tab, Word Template tab, Settings tab)
- `/jobs` — Jobs list with search, status filter, sort, pagination
- `/jobs/new` — Create job form (type, client, languages, line items with template selection, pricing, deadline)
- `/jobs/:id` — Job detail (Details tab, Documents tab, Source Files, Translated Files, linked invoice display, "Create Invoice" button on delivered jobs)
- `/documents/:id` — Document fill page (template fields, GT popup, save/complete/export)
- `/invoices` — Invoice list with search, status/client filters, sort, pagination
- `/invoices/new` — Create invoice form (client, dates, tax rate, line items with job linking). Supports `?jobId=` query param for pre-fill from job detail page
- `/invoices/:id` — Invoice detail (status workflow, edit mode for drafts, Record Payment modal for partial/full payments, payments list with delete, balance due, line items with job links, PDF/Word export buttons)
- `/calendar` — Month grid calendar (job deadlines + invoice due dates, day detail panel)
- `/notifications` — Full notifications list with read/unread filter
- `/reports` — Reports page (Revenue line chart, By Client bar chart, Job Status donut chart via recharts — charts live in `reports/charts.tsx`, loaded with `next/dynamic` so recharts stays off other pages)
- `/settings` — Settings. Organization admin: General, File Uploads, Appearance, My Business, Security, Freeform Types, Users, Roles (read-only). Platform admin: Email & Sign-ups, Languages, Labels (global), Appearance, Security

## File Upload Validation
- `FileValidationPipe` checks every upload against:
  - `maxUploadSizeMb` from the uploader's organization settings
  - `allowedFileTypes` from the organization settings (if list is non-empty, only those extensions accepted)
- Applied to passport copy uploads and job file uploads
- Word template uploads additionally validated for placeholders (reject if none or malformed)

## Build Phases
- [x] Phase 1: Project setup
- [x] Phase 2: Auth & Users (JWT, RBAC, login, user/role management, seeder)
- [x] Phase 3: Settings (app config, languages, file upload limits)
- [x] Phase 4: Clients (companies/persons, contacts, passport uploads, search/sort/paginate)
- [x] Phase 5: Templates (CRUD, field definitions, labels per language)
- [x] Phase 6: Document Designer (block-based + Word template with placeholders)
- [x] Phase 7: Jobs (CRUD, status workflow, pricing, files, user assignment)
- [x] Phase 8: Documents (fill templates, GT popup, clone, repeatable groups)
- [x] Phase 9: Word Export (designer layout + Word placeholder replacement)
- [x] Phase 10: Invoicing (multi-job invoices, payment recording, status workflow)
- [x] Phase 11: Calendar (month grid, job deadlines + invoice due dates)
- [x] Phase 12: Notifications (in-app, bell badge, deadline/overdue cron)
- [x] Phase 13: Reporting (revenue charts, client breakdown, job status, dashboard stats)
- [x] Phase 14: Search (global search across clients, jobs, templates, invoices)
- [x] Phase 15: Multi-tenancy (organizations, platform admin, sign-up + approval) — plans/pricing later
