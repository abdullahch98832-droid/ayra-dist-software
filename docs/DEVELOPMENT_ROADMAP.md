# Development Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Project initialization, design system, i18n shell, docs | **Done** |
| 2 | Database: full schema, posting functions, RLS, audit, migrations, tests, types | **Done locally** — not yet pushed to a Supabase project |
| 3 | Authentication, roles & permissions, confidential data, user administration, employees | **Done locally** — needs a Supabase project for sign-in |
| 3b | Settings screen (company details, role limits), payroll screens | Next |
| 4 | Products, units, warehouses, stock movements | Planned |
| 5 | Main company purchases + ledger, suppliers, payables | Planned |
| 6 | Accounting core: chart of accounts, journal, cash/bank | Planned |
| 7 | Customers, order takers, orders, approval, deliveries, collections | Planned |
| 8 | Expenses, employees, payroll, advances | Planned |
| 9 | SOL and vehicles | Planned |
| 10 | Invoices and PDF reports (English + Urdu) | Planned |
| 11 | Dashboard, P&L, reports | Planned |
| 12 | Hardening, testing, deployment to Vercel + Supabase | Planned |

Each phase ends with typecheck, lint, tests and a production build passing.
