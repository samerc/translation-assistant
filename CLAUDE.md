# Translation Assistant

## Project Overview
Internal multi-user web application for freelance translators. Two core modules:
1. **Freelance Job Management** — clients, contacts, jobs, invoicing, calendar, reporting
2. **Document Translation** — template-based system with document designer and Word export

## Tech Stack
- **Backend:** NestJS (TypeScript) — `./backend/`
- **Frontend:** React + Next.js — `./frontend/`
- **Database:** MariaDB (via Docker)
- **ORM:** TypeORM
- **Auth:** JWT + refresh tokens, RBAC
- **File uploads:** Local disk, compressed with `sharp` (images)
- **Word export:** `docx` npm library
- **PDF export:** `pdfkit` library (invoice export)
- **Translation helper:** Google Cloud Translation API
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
├── docker-compose.yml    # MariaDB + app services
└── CLAUDE.md
```

## Commands
- `npm run dev` — Start both backend + frontend (from project root)
- `cd backend && npm run start:dev` — Start backend only (port 3005)
- `cd frontend && npm run dev` — Start frontend only (port 3000)
- `docker compose up -d` — Start MariaDB
- `docker compose down` — Stop all containers

## Auth
- JWT access tokens (15 min TTL) + refresh tokens (7 days)
- Refresh token rotation with bcrypt hashing
- Default admin: `admin@translation-assistant.com` / `admin123!` (seeded on first run)
- 3 default roles: Admin (all permissions), Translator (CRUD on core resources), Viewer (read-only)
- RBAC uses `@RequirePermissions('resource:action')` decorator + `PermissionsGuard`
- Auth endpoints rate-limited (5 login attempts / 3 register attempts per minute)
- Invite-only registration: admin generates invite tokens via `POST /api/auth/invite`
- Invite tokens are email-bound, one-time use, 7-day expiry

## Security
- All IDs are UUIDs (not sequential integers) — prevents enumeration
- JWT secret required via env var in production (crashes on startup if missing)
- Password complexity enforced: uppercase, lowercase, number, special character required
- Job access control: `JobAccessGuard` checks user assignment, admins bypass
- View-only users blocked from write operations on jobs
- Non-admin job list filtered to only assigned jobs (innerJoin on job_users)
- ALL document endpoints verify job access via `verifyDocumentAccess()`/`verifyJobAccess()`
- ALL invoice endpoints verify access via `verifyInvoiceAccess()` (creator or linked job access)
- Document clone validates access to both source and target jobs
- Document search-for-clone filtered by user's accessible jobs
- File linking validates access to source job
- File uploads validated against allowed types and max size
- Filenames sanitized in Content-Disposition headers (`replace(/[^\w.\-]/g, '_')`)
- JWT token for file viewing passed via query param (not stored in URLs)
- Pagination limits enforced server-side (max 100)
- Client deletion prevented when jobs are linked
- Job creation validates all referenced entities (client, language, template) exist
- Job user assignment validates user exists before creating assignment
- Invoice creation requires at least 1 line item
- Word template uploads rejected if no valid placeholders found
- Search access control: non-admins only see clients they have jobs with, only active templates
- Translate endpoint: language code validation, 5000 char limit, 10s timeout, 30/min rate limit
- Rate limiting: login (5/min), register (3/min), refresh (10/min), password change (3/hr), invite (5/hr)
- Centralized frontend logger (ready for Sentry/external service)
- Frontend: sidebar items hidden based on user permissions (no Invoices/Reports for Translator role)
- Frontend: dashboard gracefully handles 403 for non-admin users
- Frontend: unsaved changes warning on document fill page
- Frontend: status transitions enforced (only valid next states selectable)
- Frontend: fully responsive (mobile hamburger menu, table scroll, stacked forms)

## Database & Performance
- Connection pool: 20 max, 10s connect timeout, 30s idle timeout (configurable via env)
- Graceful shutdown: `app.enableShutdownHooks()` drains pool on SIGTERM/SIGINT
- Transactions: job creation and invoice creation wrapped in `dataSource.transaction()`
- No eager loading on entities — all relations loaded explicitly per query
- List endpoints use `loadRelationCountAndMap` for counts (not full relation joins)
- N+1 eliminated: batch `IN()` queries, `Promise.all` for parallel validation
- `recalculateTotal` uses DB `SUM()` aggregation (not in-memory)
- Cron job overlap prevention: in-memory lock + error handling + logging
- Overdue invoice check: single batch `UPDATE` (not N individual saves)

## File Management
- Physical files deleted on entity removal (job files, passport copies, templates)
- Linked files (`linkedFromJobId`) skipped during deletion (shared with source job)
- Export files (PDF/DOCX) deleted from disk after streaming to client
- Old word template files deleted when replaced with new upload

## Deployment
- Server: `translate.fancyshark.com` (144.91.89.20)
- IIS reverse proxy: `/api/*` → localhost:3005, `/*` → localhost:3080
- PM2 manages backend + frontend processes
- `npm run deploy` — builds, packages, uploads, restarts on server
- Frontend uses Next.js standalone output (~4MB deploy)
- PM2 auto-resurrect on reboot via Windows Scheduled Task

## Conventions
- All API routes prefixed with `/api/`
- RBAC permissions follow `resource:action` format (e.g., `clients:create`)
- Database migrations managed via ORM (synchronize in dev, migrations in prod)
- All tables searchable and sortable
- File uploads validated against allowed types and max size (configurable in settings)
- Security-first: input validation, parameterized queries, rate limiting, CSRF protection
- Font: Plus Jakarta Sans (body), JetBrains Mono (code/monospace)

## Color Palettes
Four palettes available (user selects in Settings > Appearance):
- **Indigo Minimal** (default): Primary `#4F46E5`, Accent `#818CF8`
- **Ocean Blue**: Primary `#1E40AF`, Accent `#3B82F6`
- **Teal Focus**: Primary `#0D9488`, Accent `#2DD4BF`
- **Slate & Amber**: Primary `#334155`, Accent `#F59E0B`

Light + dark mode supported (separate toggle from palette).

## Database Entities

### Auth & Users
- **User** — email, password (bcrypt), firstName, lastName, avatar, isActive, colorPalette, darkMode, roleId, refreshToken
- **Role** — name, description. M2M with Permission via `role_permissions`
- **Permission** — resource, action (e.g., `clients:create`)
- **InviteToken** — token, email, roleId, expiresAt, used, usedByUserId

### Settings
- **AppSettings** — companyName, companyAddress, companyLogo, baseCurrency, invoicePrefix, maxUploadSizeMb, allowedFileTypes (JSON)
- **Language** — code, name, direction (ltr/rtl), isActive
- **LabelOption** — category (email/phone/address), value, sortOrder. Configurable labels for client contact info.

### Clients
- **Client** — type (company/person), name, taxId, notes
- **ClientEmail** — email, label, isPrimary. Multiple per client.
- **ClientPhone** — phone, label, isPrimary. Multiple per client.
- **ClientAddress** — address, label, isPrimary. Multiple per client.
- **Contact** — firstName, lastName, email, phone, role, notes. Only on company-type clients.
- **PassportCopy** — label, filePath, originalName, mimeType, fileSize. Reference images for name spellings.

### Templates
- **Template** — type (designer/word/simple), name, description, pricePerPage, discountedPricePerPage, layoutJson, wordFilePath, wordFileName, isActive
  - **Designer type**: layout built with block-based designer, stored in layoutJson
  - **Word type**: .docx file uploaded, placeholders like `{field_name}` replaced on export
  - **Simple type**: pricing only, no fields or layout (used for freeform jobs)
- **TemplateField** — fieldKey, fieldType (text/textarea/number/date/image), sortOrder, required, groupKey
  - Fields with same `groupKey` form a repeatable set (e.g., family extract rows)
  - Fields with no `groupKey` are fixed (appear once)
- **TemplateFieldLabel** — label text per language per field (M2O to Language)

### Jobs
- **Job** — jobNumber (auto: JOB-0001), type (template/freeform), title, description, clientId, contactId, sourceLanguageId, targetLanguageId (nullable for non-translation), status, deadline, calculatedTotal, finalPrice, isFreeOfCharge, freeOfChargeReason, paymentCurrency, paymentAmount, notes
  - Status flow: quote → accepted → in_progress → delivered → invoiced → paid (+ lost, cancelled)
  - Locked when delivered/invoiced/paid — reopen to edit
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
  - Sending invoice transitions linked jobs to 'invoiced'. Payment transitions to 'paid'.
- **InvoiceItem** — invoiceId, jobId (optional link), description, quantity, unitPrice, lineTotal, sortOrder

### Notifications
- **Notification** — userId, type (job_status_change/deadline_approaching/invoice_overdue/job_assigned), title, message, link, isRead
  - Auto-created on: job status changes, user assignment, deadline within 3 days, invoice overdue
  - Daily cron at 8 AM checks deadlines and overdue invoices (@nestjs/schedule)

## API Endpoints

### Auth (`/api/auth`)
- `POST /login` — Login, returns JWT tokens
- `POST /register` — Register with invite token
- `POST /refresh` — Refresh access token
- `POST /logout` — Invalidate refresh token
- `GET /profile` — Get current user
- `POST /invite` — Generate invite token (admin only)

### Users (`/api/users`)
- Full CRUD + `PATCH /:id/activate`, `PATCH /:id/deactivate`
- `PATCH /profile/me` — Self-update (no role/active change)
- `POST /change-password`

### Roles (`/api/roles`)
- Full CRUD + `GET /permissions` — List all permissions

### Settings (`/api/settings`)
- `GET /` + `PATCH /` — App settings
- CRUD `/languages` — Language management
- CRUD `/labels` + `GET /labels/:category` — Configurable label options

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
- Full CRUD with search, status filter, client filter, sort, pagination
- `PATCH /:id/status` — Update job status
- `POST /:id/reopen` — Reopen a locked job
- `POST/DELETE /:id/users/:userId` — Assign/remove users
- `POST/PATCH/DELETE /:id/line-items/:itemId` — Job line items
- `POST /:id/files` — Upload source/translated files (with FileValidationPipe)
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
- `POST /` — Google Translate proxy (text, from, to). Validated: language codes (ISO 639-1), max 5000 chars, 10s timeout, 30 req/min

### Invoices (`/api/invoices`)
- Full CRUD with search, status/client/date filters, sort, pagination
- `GET /by-job/:jobId` — List invoices linked to a job
- `PATCH /:id/status` — Update invoice status (validated transitions)
- `POST /:id/record-payment` — Record payment (sets paidAmount, paidAt, transitions to paid)
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
- `GET /revenue?period=monthly&from=2026-01&to=2026-05` — Revenue over time
- `GET /by-client` — Revenue per client
- `GET /job-status` — Jobs by status breakdown

### Search (`/api/search`)
- `GET /?q=term` — Global search across clients, jobs, templates, invoices (min 2 chars)

## Frontend Pages
- `/login` — Login page (public)
- `/` — Dashboard with summary cards
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
- `/invoices/:id` — Invoice detail (status workflow, edit mode for drafts, payment recording modal, line items with job links, PDF/Word export buttons)
- `/calendar` — Month grid calendar (job deadlines + invoice due dates, day detail panel)
- `/notifications` — Full notifications list with read/unread filter
- `/reports` — Reports page (Revenue line chart, By Client bar chart, Job Status donut chart via recharts)
- `/settings` — Settings page (General, Languages, Labels, File Uploads, Appearance tabs)

## File Upload Validation
- `FileValidationPipe` checks every upload against:
  - `maxUploadSizeMb` from AppSettings
  - `allowedFileTypes` from AppSettings (if list is non-empty, only those extensions accepted)
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
