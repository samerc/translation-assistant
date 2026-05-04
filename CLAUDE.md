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
- **Translation helper:** Google Cloud Translation API
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
- Job access control: `JobAccessGuard` checks user assignment, admins bypass
- View-only users blocked from write operations on jobs
- File uploads validated against allowed types and max size
- Filenames sanitized (basename extraction) to prevent path traversal
- JWT token for file viewing passed via query param (not stored in URLs)
- Pagination limits enforced server-side (max 100)
- Client deletion prevented when jobs are linked
- Centralized frontend logger (ready for Sentry/external service)

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
- `POST /` — Google Translate proxy (text, from, to)

## Frontend Pages
- `/login` — Login page (public)
- `/` — Dashboard with summary cards
- `/clients` — Client list with search, type filter, sort, pagination
- `/clients/:id` — Client detail (Overview with info/emails/phones/addresses cards, Contacts tab, Passport Copies tab, Jobs tab)
- `/templates` — Template list (table + card view toggle, search, status filter, sort)
- `/templates/:id` — Template detail (Fields tab with inline table editor, Layout Designer tab, Word Template tab, Settings tab)
- `/jobs` — Jobs list with search, status filter, sort, pagination
- `/jobs/new` — Create job form (type, client, languages, line items with template selection, pricing, deadline)
- `/jobs/:id` — Job detail (Details tab, Documents tab, Source Files, Translated Files)
- `/documents/:id` — Document fill page (template fields, GT popup, save/complete/export)
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
- [ ] Phase 10: Invoicing
- [ ] Phase 11: Calendar
- [ ] Phase 12: Notifications
- [ ] Phase 13: Reporting
- [ ] Phase 14: Search
