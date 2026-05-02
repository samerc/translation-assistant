# Translation Assistant

## Project Overview
Internal multi-user web application for freelance translators. Two core modules:
1. **Freelance Job Management** — clients, contacts, jobs, invoicing, calendar, reporting
2. **Document Translation** — template-based system with document designer and Word export

## Tech Stack
- **Backend:** NestJS (TypeScript) — `./backend/`
- **Frontend:** React + Next.js — `./frontend/`
- **Database:** MariaDB (via Docker)
- **ORM:** TBD (Prisma or TypeORM)
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
- `cd backend && npm run start:dev` — Start backend in dev mode
- `cd frontend && npm run dev` — Start frontend in dev mode
- `docker compose up -d` — Start MariaDB
- `docker compose down` — Stop all containers

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

## Build Phases
- [x] Phase 1: Project setup
- [ ] Phase 2: Auth & Users
- [ ] Phase 3: Settings
- [ ] Phase 4: Clients
- [ ] Phase 5: Templates
- [ ] Phase 6: Document Designer
- [ ] Phase 7: Jobs
- [ ] Phase 8: Documents
- [ ] Phase 9: Word Export
- [ ] Phase 10: Invoicing
- [ ] Phase 11: Calendar
- [ ] Phase 12: Notifications
- [ ] Phase 13: Reporting
- [ ] Phase 14: Search
