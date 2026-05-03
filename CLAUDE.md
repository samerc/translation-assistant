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

## Conventions
- All API routes prefixed with `/api/`
- RBAC permissions follow `resource:action` format (e.g., `clients:create`)
- Database migrations managed via ORM
- All tables searchable and sortable
- File uploads validated against allowed types and max size (configurable in settings)
- Security-first: input validation, parameterized queries, rate limiting, CSRF protection

## Color Palettes
Four palettes available (user selects in profile settings):
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
- **Template** — type (designer/word), name, description, pricePerPage, discountedPricePerPage, layoutJson, wordFilePath, wordFileName, isActive
  - **Designer type**: layout built with block-based designer, stored in layoutJson
  - **Word type**: .docx file uploaded, placeholders like `{field_name}` replaced on export
- **TemplateField** — fieldKey, fieldType (text/textarea/number/date/image), sortOrder, required, groupKey
  - Fields with same `groupKey` form a repeatable set (e.g., family extract rows)
  - Fields with no `groupKey` are fixed (appear once)
- **TemplateFieldLabel** — label text per language per field (M2O to Language)

## API Endpoints

### Auth (`/api/auth`)
- `POST /login` — Login, returns JWT tokens
- `POST /register` — Register with invite token
- `POST /refresh` — Refresh access token
- `POST /logout` — Invalidate refresh token
- `GET /profile` — Get current user

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

## Frontend Pages
- `/login` — Login page (public)
- `/` — Dashboard with summary cards, theme preview
- `/clients` — Client list with search, type filter, sort, pagination
- `/clients/:id` — Client detail (Overview with info/emails/phones/addresses cards, Contacts tab, Passport Copies tab, Jobs tab placeholder)
- `/templates` — Template list as card grid
- `/templates/:id` — Template detail (Fields tab with grouped display, Settings tab)
- `/settings` — Settings page (General, Languages, Labels, File Uploads tabs)

## File Upload Validation
- `FileValidationPipe` checks every upload against:
  - `maxUploadSizeMb` from AppSettings
  - `allowedFileTypes` from AppSettings (if list is non-empty, only those extensions accepted)
- Applied to passport copy uploads (and future upload endpoints)

## Build Phases
- [x] Phase 1: Project setup
- [x] Phase 2: Auth & Users (JWT, RBAC, login, user/role management, seeder)
- [x] Phase 3: Settings (app config, languages, file upload limits)
- [x] Phase 4: Clients (companies/persons, contacts, passport uploads, search/sort/paginate)
- [x] Phase 5: Templates (CRUD, field definitions, labels per language)
- [x] Phase 6: Document Designer (block-based + Word template with placeholders)
- [ ] Phase 7: Jobs
- [ ] Phase 8: Documents
- [ ] Phase 9: Word Export
- [ ] Phase 10: Invoicing
- [ ] Phase 11: Calendar
- [ ] Phase 12: Notifications
- [ ] Phase 13: Reporting
- [ ] Phase 14: Search
