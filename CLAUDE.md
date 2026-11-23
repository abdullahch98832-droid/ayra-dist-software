@AGENTS.md

# AYRA HAPPINESS DMS — Project Rules

Distribution Management System for AYRA HAPPINESS. Brand is "AYRA HAPPINESS / Distribution Management System"; Webcore Solutions appears only in the footer ("Developed by Webcore Solutions" + `/branding/webcore-solutions-logo.png`).

## Stack
Next.js 16 App Router (`src/proxy.ts`, not `middleware.ts`), React 19, TypeScript strict + `noUncheckedIndexedAccess`, Tailwind 4, shadcn/ui (base-ui), Supabase (Postgres, Auth, Storage, RLS), React Hook Form + Zod, Vitest.

## Commands
`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` (unit) · `npm run test:db` (database, embedded Postgres 17, no Docker) · `npm run test:api` (opt-in, separate Supabase test project) · `npm run db:types` · `npm run db:push` · `npm run db:check` · `npm run admin:bootstrap -- --email …`

## Non-negotiable rules
- Money: Postgres `numeric(18,2)`; in TS convert with `toPaisa()` to `bigint` paisa (`src/lib/utils/money.ts`) before arithmetic, `toDbAmount()` to write. Never `number` arithmetic on money.
- Stock quantities: `bigint` base units. Stock changes only via `private.move_stock` inside posting functions.
- Schema changes: new file in `supabase/migrations/` only; run `npm run test:db`, then `npm run db:types`. Never edit an applied migration.
- Confidential columns (costs, purchase prices, stock values) are not selectable by clients: never `select('*')` on product_units, sales_invoices(+_items), customer_returns(+_items), stock_movements, stock_adjustments(+_items); read costs via `secure_*` views. Salaries live in `employee_salaries`, bank details in `financial_account_bank_details`.
- Server actions: `await authorize("<permission>")` first, Zod-validate, then use the caller's Supabase client (RLS applies). `createAdminClient()` (secret key) only for Supabase Auth admin calls, after authorization.
- Pages: `requireActiveSession()` then `can(ctx, permission)`; render `<Forbidden />` when missing.
- State changes (approve/post/dispatch/void) are SECURITY DEFINER functions that call `private.require_permission` first and set `search_path = ''`. Clients only write drafts.
- New tables: enable RLS + policies + column privileges in a migration (tests enforce RLS on every table and permission checks in every public definer function).
- Journal entries must balance; posted entries are immutable (reverse, don't edit).
- `SUPABASE_SECRET_KEY` is server-only. No hardcoded credentials.
- Every user-facing string goes through `src/i18n/en.ts` and `src/i18n/ur.ts` (the `Dictionary` type enforces parity). Use logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) so RTL works. Locale comes from the `ayra_locale` cookie and is rendered on the server.
- No fake data in dashboards or reports.
- Business rules not yet confirmed are listed in `docs/BUSINESS_REQUIREMENTS.md` — do not invent them; ask.

## Docs
See `docs/` for architecture, database design, accounting, inventory, security and roadmap.
