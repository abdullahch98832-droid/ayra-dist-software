# AYRA HAPPINESS — Distribution Management System

Business management for a distribution company: purchases from the main company and suppliers, warehouse and inventory, sales and deliveries, SOL, expenses, payroll, cash/bank and accounting. English and Urdu (RTL).

**Status:** Phase 3 — database, authentication, roles and permissions, user administration, employee management, and the complete UI design system. Business module screens are not built yet; see [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).

## Requirements
- Node.js 20.9+ (developed on Node 26)
- npm
- A Supabase project — see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). The shell and the database tests run without one.

## Setup
```bash
npm install
cp .env.example .env.local   # fill in Supabase values
npm run dev                  # http://localhost:3000
```

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (strict) |
| `npm test` | Unit tests |
| `npm run test:db` | Database tests on a throwaway local Postgres 17 (no Docker needed) |
| `npm run test:api` | REST API tests per role against a separate Supabase test project (opt-in) |
| `npm run db:types` | Regenerate `src/types/database.ts` from the migrations |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:check` | Verify Supabase URL, key, Auth and migrations |
| `npm run admin:bootstrap -- --email …` | Invite the first Super Admin (one time) |

## Environment variables
| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Publishable key; data protected by RLS |
| `NEXT_PUBLIC_SITE_URL` | Public | App URL used in invitation and reset emails |
| `SUPABASE_SECRET_KEY` | Server only | User administration; never expose to the browser |

## Documentation
[Overview](docs/PROJECT_OVERVIEW.md) · [Business requirements](docs/BUSINESS_REQUIREMENTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE_DESIGN.md) · [Accounting](docs/ACCOUNTING_RULES.md) · [Inventory](docs/INVENTORY_RULES.md) · [Security](docs/SECURITY_PLAN.md) · [Supabase setup](docs/SUPABASE_SETUP.md) · [Design system](docs/DESIGN_SYSTEM.md) · [Roadmap](docs/DEVELOPMENT_ROADMAP.md)

---
Developed by Webcore Solutions.
