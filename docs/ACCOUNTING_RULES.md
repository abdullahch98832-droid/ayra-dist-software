# Accounting Rules

> **Status:** implemented in `supabase/migrations/…100300_accounting.sql` and the posting functions; covered by `supabase/tests/accounting.test.ts`, `purchasing.test.ts`, `sales.test.ts`.

## Principles (enforced by the database)

1. **Money is exact.** Postgres stores `numeric(18,2)`. In TypeScript, amounts are converted with `toPaisa()` into integer paisa (`bigint`) before any arithmetic; never add JS `number`s representing money.
2. **Double entry.** An entry can only move from `draft` to `posted` if it has ≥ 2 lines and total debit = total credit. Each line is either a debit or a credit, never both, never negative.
3. **Immutable postings.** Posted entries and their lines cannot be updated or deleted (trigger, applies even to the database owner). Corrections are reversing entries (`reverse_manual_journal`, or voiding a payment/expense).
4. **One entry per document.** A unique index on `(source_type, source_id)` prevents a document from being posted twice.
5. **Atomic.** A document's stock movements, journal entry and status change happen in one transaction inside its posting function.
6. **Period locking.** Postings dated inside a `closed` accounting period are rejected. Periods cannot overlap. (If no period covers a date, posting is allowed.)
7. **Sub-ledger integrity.** Lines on the receivables account must name a customer; payables lines a supplier (and the main company may only use its own account); employee advance/salary lines an employee. Header accounts cannot receive postings.

## Separate ledgers

| Ledger | Control account | View |
|---|---|---|
| Main company (Ayra Happiness) | 2100 `AP_PRINCIPAL` | `v_company_ledger` |
| Other suppliers | 2200 `AP_SUPPLIERS` | `v_supplier_ledger`, `v_supplier_balances` |
| Customers and SOL clients | 1200 `AR` | `v_customer_ledger`, `v_customer_balances` |
| Employees | 1400 `EMPLOYEE_ADVANCES`, 2400 `SALARIES_PAYABLE` | `v_employee_balances` |

The main company is the single supplier with `is_principal = true`.

## Chart of accounts (seeded, editable)

Headers: 1000 Assets, 2000 Liabilities, 3000 Equity, 4000 Income, 5000 Cost of Sales, 6000 Operating Expenses.
Postable: 1100.xxx cash accounts and 1150.xxx bank accounts (created automatically per cash/bank account), 1200 AR, 1300 Inventory, 1400 Employee advances, 1600 Fixed assets, 2100/2200 payables, 2300 Sales tax payable, 2400 Salaries payable, 3100 Capital, 3200 Drawings, 3300 Opening balance equity, 3900 Retained earnings, 4100 Sales, 4150 Sales returns, 4200 SOL transport revenue, 4900 Other income, 5100 COGS, 5200 Inventory variance, 5300 Damaged stock written off, 6100–6900 operating expenses.

System accounts (with a `system_key`) cannot be deleted or have their type changed.

## Postings

| Event | Debit | Credit |
|---|---|---|
| Goods receipt | Inventory | Payable (main company or supplier) |
| Supplier invoice above receipts | Inventory variance | Payable |
| Supplier invoice below receipts | Payable | Inventory variance |
| Supplier payment | Payable | Cash/Bank |
| Supplier return | Payable (agreed credit) | Inventory (average cost); difference to variance |
| Sales invoice / dispatch | AR (total); COGS | Sales (net), Sales tax payable (tax); Inventory |
| Customer return | Sales returns (net), Sales tax payable; Inventory | AR (total); COGS |
| Customer payment | Cash/Bank | AR |
| SOL job completed | AR | SOL transport revenue |
| Opening stock | Inventory | Opening balance equity |
| Count difference / other adjustment | Inventory or variance | Variance or inventory |
| Write-off | Damaged stock written off | Inventory |
| Expense | Expense category account | Cash/Bank |
| Employee advance | Employee advances | Cash/Bank |
| Payroll run | Salaries (gross − deductions) | Employee advances (recovery), Salaries payable (net) |
| Salary payment | Salaries payable | Cash/Bank |
| Fund transfer | Destination cash/bank | Source cash/bank |
| Manual journal | any postable accounts (capital, drawings, other income, opening balances, corrections) | |

## Partial payments

Payments are posted against the party's ledger first, then **allocated** to invoices (or SOL jobs) in any number of parts. Allocations lock the payment and the invoice, and are rejected if they exceed either the unallocated payment amount or the invoice's outstanding balance. Outstanding = total − allocations − posted returns against that invoice (`v_sales_invoice_balances`, `v_supplier_invoice_balances`).

## Not yet decided (configurable later)

- Sales tax: products carry a `tax_rate` (default 0%). Purchase-side (input) tax is not modelled.
- Order-taker commission: not modelled.
- Fiscal year start and year-end closing to retained earnings: not automated.
