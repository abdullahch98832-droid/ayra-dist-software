# Development Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Project initialization, design system, i18n shell, docs | **Done** |
| 2 | Database: full schema, posting functions, RLS, audit, migrations, tests, types | **Done locally** — not yet pushed to a Supabase project |
| 3 | Authentication, roles & permissions, confidential data, user administration, employees | **Done locally** — needs a Supabase project for sign-in |
| UI | Design system, application shell, English/Urdu and responsive design ("Phase 4 UI/UX") | **Done locally** |
| Dashboard | Role dashboards from live ledgers, date filters, alerts ("Phase 5") | **Done locally** — needs migration `20261124120000_dashboard.sql` |
| Inventory and procurement | Products, units, warehouses, both purchase workflows, payables, warehouse work, reports, negative-stock setting ("Phase 6") | **Done** |
| Sales and distribution | Customers, order takers, orders to delivery, payments, held cash, ledger, sales reports ("Phase 7") | **Done** |
| SOL and vehicles | Jobs, services, deliveries, payments, vehicles, drivers, expenses, cash and bank accounts, reports ("Phase 8") | **Done** |
| Expenses, payroll and accounting | Vouchers with approval, payroll, cash and bank, daily closing, period closing, ledgers, statements, checks ("Phase 9") | **Done locally** — needs migration `20261128100000_finance.sql` |
| 3b | Settings: company details, role limits | Next |
| 10 | Invoices and PDF reports (English + Urdu) | Planned |
| 11 | Year-end closing (needs the fiscal year), bank reconciliation | Planned |
| 12 | Hardening, testing, deployment to Vercel + Supabase | Planned |

Each phase ends with typecheck, lint, tests and a production build passing.
