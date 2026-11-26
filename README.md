# AM TRADERS — Distribution Management System

Business management for a distribution company: purchases from the Ayra company and suppliers, warehouse and inventory, sales and deliveries, SOL, expenses, payroll, cash/bank and accounting. English and Urdu (RTL).

**Status:** database, sign-in, roles and user administration, employees, role dashboards, inventory and procurement, sales and distribution, SOL and vehicles, expenses, payroll and accounting, PDF documents in English and Urdu, business reports with PDF, Excel and CSV. See [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).

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
**[User guide](docs/USER_GUIDE.md)** — how to use the software · [Overview](docs/PROJECT_OVERVIEW.md) · [Business requirements](docs/BUSINESS_REQUIREMENTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE_DESIGN.md) · [Accounting](docs/ACCOUNTING_RULES.md) · [Inventory](docs/INVENTORY_RULES.md) · [Warehouse and procurement](docs/WAREHOUSE_AND_PROCUREMENT.md) · [Sales and distribution](docs/SALES_AND_DISTRIBUTION.md) · [SOL and vehicles](docs/SOL_AND_VEHICLES.md) · [Finance](docs/FINANCE.md) · [Documents](docs/DOCUMENTS.md) · [Reports](docs/REPORTS.md) · [Security](docs/SECURITY_PLAN.md) · [Supabase setup](docs/SUPABASE_SETUP.md) · [Dashboard](docs/DASHBOARD.md) · [Design system](docs/DESIGN_SYSTEM.md) · [Roadmap](docs/DEVELOPMENT_ROADMAP.md)

---
Developed by Webcore Solutions.
