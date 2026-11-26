# Reports and analytics

> **Status:** implemented in `supabase/migrations/20261130100000_reports.sql`, `src/features/reports` (definitions, exports) and `/reports/[slug]`.

Reports are offered under **Reports**, in the areas below. Each has a screen, a PDF (English, Urdu or both), an Excel workbook and a CSV file.

| Area | Reports |
|---|---|
| Inventory | Current stock, Stock valuation, Fast-moving, Slow-moving, Low stock, Damaged stock, Product-wise profit, Stock movement history |
| Sales | Daily, Monthly, Customer-wise, Product-wise, Order taker performance, Supplier performance, Supplier deliveries, Territory performance, Pending collections, Collections |
| Vendors | Total purchases, Supplier payments, Supplier balances, Delivery performance, Purchase history |
| Ayra company | Goods received, Purchase value and account, Payments made, Company money (received and paid), Returns, Adjustments, Pending company dues |
| SOL | Distributor orders, Job register, Total contracts, Payments received, Pending payments, Job expenses, Profitability |
| Financial | Daily and Monthly profit and loss, Cash flow, Expense breakdown, Receivables aging, Payables aging, Bank reconciliation |
| Operations | Deliveries, Expenses, Payroll, Vehicles, Vehicle trips |

**Dates:** Today, Yesterday, This week (from Monday), This month, Last month, This year (from 1 January), last 7 and 30 days, last 12 months, or custom dates. Aging reports take one day; stock and pending reports show the present.

## One definition for every format

A report is one object in `src/features/reports/definitions/*.ts`: its permissions, filters and a `load()` that returns a `ReportModel` (figures, charts, tables, notes, checks). The screen (`components/reports/report-body.tsx`), the PDF, Excel and CSV (`features/reports/export.ts`) are made from that model, so they cannot show different figures. Totals are added on the server in whole paisa.

To add a report: write its definition, give it a place in `definitions/`, and put its title and hint in `i18n/modules/analytics.*`. The hub, page and exports follow.

## Agreement with the general ledger

Reports of money are calculated from **posted journal lines** where the ledger has the detail: a document voided later is undone on the day it was voided, so every past period keeps its figures. Each such report shows its totals beside the ledger:

- *This report* + *other entries of the same accounts* (other documents, manual entries) = *general ledger*. Green when equal to the paisa; opened and red when not.
- The ledger side comes from `ledger_total()`, which reads the journal directly and not through the report. Profit and loss is also compared with the profit and loss statement, cash flow with the balances of the cash and bank accounts.
- The comparison is shown to those with `reports.financial`, when no filter leaves anything out. Excel and PDF carry it too.

| Report | Agrees with |
|---|---|
| Daily, monthly, customer-wise, territory sales | Sales + Sales Returns |
| Product-wise sales and profit | the same accounts from invoices and returns; notes are shown beside it; cost with Cost of Goods Sold |
| Collections | Receivables, entries of customer payments |
| Receivables aging, Pending collections | Receivables on that day |
| Payables aging, Supplier balances, Pending dues | Payables on that day |
| Purchases, Purchase history, Goods received | Payables, entries of goods receipts |
| Supplier payments, Payments made, Returns, Adjustments | Payables, entries of those documents |
| Company money (received/paid) | received as owner's capital, extra cost and Ayra payable |
| Purchase value and account | opening, movement and closing of the company's account |
| Stock valuation | Inventory |
| Distributor orders, Job register, Total contracts, Profitability | SOL income of completed jobs |
| Job expenses | SOL cost of goods used |
| Daily and monthly profit and loss | all income and expense accounts, and the profit and loss statement |
| Cash flow | closing cash and bank balances |
| Expense breakdown, Expenses | expense accounts; vouchers and payrolls |
| Bank reconciliation | balance of the bank account |

Reports of quantities, orders or performance (movement, delivery, order takers, vehicles, payroll by month) have no account to agree with.

## Permissions

- A report needs `reports.view` **and** its own permission. Costs, values and balances are left out for those who may not see them, in every format.
- Every export (PDF, Excel, CSV, also the CSV of other lists) needs **`reports.export`**. `loadReport()` is the only way to the figures and refuses before anything is read; `record_report_export()` checks the permission again in the database and writes who exported what, in which format and with which filters, to the audit log. The report functions themselves check again as well.
- The migration gives `reports.export` to every role that had a page with an export until now; take it away under Roles.

## Files

- **Excel** (`src/lib/xlsx`): real numbers and dates, filters, frozen head, print setup, right-to-left sheets in Urdu. Text is never a formula. Totals are formulas that follow the filters and carry the exact total. Extra sheets: further tables, figures, agreement with the ledger. Times are Pakistan time.
- **CSV:** UTF-8 with BOM, one header row, exact decimals, ISO dates; cells that a spreadsheet would run are made harmless.
- **PDF:** see DOCUMENTS.md. A few columns that are only details are left out so that a page stays readable; Excel and CSV have every column.

## Bank reconciliation

**Cash & bank → Reconciliation** (`cash_bank.reconcile`; managers and accountants). Enter the date and closing balance of a bank statement, tick the movements that are on it, and complete when the difference is zero:

> balance in the books − deposits not yet at the bank + payments not yet at the bank = balance on the statement

A movement is cleared once. The database compares the totals again on completion. Only the newest reconciliation of an account can be reopened (with a reason); an open one can be deleted. Nothing is posted: bank charges and profit are booked under *Receipts and payments*. Entries added later to a reconciled period are pointed out.

## Tests

- `supabase/tests/reports.test.ts`: every function against the ledger, in and across periods, with voids; scopes; permissions; reconciliation.
- `src/lib/xlsx/workbook.test.ts`, `src/features/reports/export.test.ts`.

## Vendors hidden

Goods are bought only from Ayra, so (with `NEXT_PUBLIC_OTHER_VENDORS` unset) Total purchases, Purchase history and Delivery performance are in the Ayra company group, without vendor columns and filters; Vendor payments and Vendor balances are hidden because Payments made and the Ayra account say the same.
