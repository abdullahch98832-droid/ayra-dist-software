# Dashboard

Every figure is calculated in the database (`supabase/migrations/20261124120000_dashboard.sql`) from posted journal entries, stock balances and posted documents. The application only formats them. Covered by `supabase/tests/dashboard.test.ts`, which compares the figures with hand calculations, the ledgers, the trial balance and the profit and loss statement.

## Figures

| Figure | Source | Permission |
|---|---|---|
| Total stock | `stock_balances`, per base unit, all warehouses (damaged shown separately) | `inventory.view` |
| Inventory value | `inventory_valuation` (equals GL 1300) | `costs.view` |
| Today's sales, Sales | Ledger: Sales revenue − Sales returns, before sales tax | `sales.view_all`; order takers see only their own invoices |
| Today's purchases, Purchases | Ledger: inventory value of posted goods receipts | `purchasing.view` |
| Cash, Bank | Ledger: accounts of `financial_accounts` (cash still with order takers is not included) | `cash_bank.view` |
| Customer receivables | Ledger: AR (customers and SOL clients) | `receivables.view` |
| Supplier payables | Ledger: AP_SUPPLIERS | `payables.view` |
| Ayra company outstanding | Ledger: AP_PRINCIPAL | `company.view` |
| Expenses | Ledger: expense accounts outside Cost of Sales | `reports.financial`; with only `expenses.view`, expense documents without payroll |
| Gross profit | Sales − every account under Cost of Sales (`COST_OF_SALES`: COGS, variances, write-offs) | `reports.financial` |
| Net profit | All income − all expense; always equals `profit_and_loss()` | `reports.financial` |
| SOL revenue | Ledger: SOL_REVENUE (completed jobs). Vehicle route sales are part of Sales and shown as a note | `sol.view` and (`sales.view_all` or `reports.financial`) |
| Pending SOL payments | Completed jobs: contract value − allocated payments | `sol.view` and `receivables.view` |
| Low stock | On hand − reserved, excluding damaged warehouses, at or below the reorder level | `inventory.view` |
| Overdue balances | Posted invoices past their due date, less allocations, returns and credit notes | `receivables.view`, `payables.view`, `company.view` |
| Orders, deliveries, transactions, own records, open work | Documents visible under row level security | RLS |

A figure the user may not see is **absent** from the database response, not zero or hidden in the browser.

Balances are current and ignore the date filter. The filter (kept in the URL) applies to Performance; the comparison is with the period of equal length immediately before. Charts use days up to 31 days, weeks up to 120, then months. The business day follows Asia/Karachi.

## Layouts (`src/features/dashboard/layout.ts`)

| Role | Order |
|---|---|
| Super Admin | Balances, performance, work and alerts, recent lists |
| Manager | Work and deliveries first, then every authorized figure |
| Data Entry User | Quick entry, waiting work, own records, operational information; no financial totals |
| Viewer | Stock, sales, operational lists |
| Custom roles | Manager layout with `reports.financial`, entry layout with any entry permission, otherwise viewer |

"Waiting for you" is derived from documents: own drafts, documents the user may approve or post, and deliveries assigned to them as driver. There is no task-assignment feature.

## Loading, errors, performance

Each section is one database call, streams in on its own with a skeleton, and fails on its own with a retry. If the migration is missing, sections say so. On 480,000 journal lines and 120,000 invoices: balances 60 ms, one month 35 ms, twelve months 240 ms, overdue 320 ms, lists under 10 ms.
