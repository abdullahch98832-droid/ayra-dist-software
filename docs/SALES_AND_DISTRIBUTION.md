# Sales and Distribution

Customers, order takers, orders, deliveries, collections and receivables. Stock moves through the same engine as purchasing and every amount comes from the general ledger. Migration: `20261126100000_sales_distribution.sql`. Rules: [INVENTORY_RULES.md](INVENTORY_RULES.md), [ACCOUNTING_RULES.md](ACCOUNTING_RULES.md).

## Screens

| Screen | Content | Needs |
|---|---|---|
| `/customers` | Shop, owner, contact, WhatsApp, address, city, credit limit, terms, order taker, ledger | `customers.view`; balances `receivables.view`; editing `customers.manage` |
| `/order-takers` | Picture, phone, territory, status, performance, customers, cash held | `sales.view`; editing `sales.team` |
| `/sales` | Overview, orders, deliveries, invoices, returns | `sales.view` or `sales.view_all` |
| `/inventory/dispatch` | Picking and dispatch | `sales.dispatch` |
| `/receivables` | Outstanding, payments, cash with order takers, credit and debit notes | `receivables.view` or `receivables.collect` |
| `/reports/*` | Daily and monthly sales, customers, products, order takers, receivables, deliveries, collections | `reports.view` and the report's own permission |

Without `sales.view_all` or `customers.manage`, a user sees only customers assigned to them, with their orders and invoices. Drivers see only deliveries assigned to them.

## Order workflow

| Step | Action | Permission | Effect |
|---|---|---|---|
| Draft | Save | `sales.create` | None |
| Submitted | Submit (order taker's own, or `sales.view_all`) | `sales.create` | Waits for approval |
| Approved | Approve; or send back with a reason | `sales.approve` | Checks stock and the credit limit; reserves stock |
| Picking | Start picking | `sales.dispatch` | Order can be dispatched |
| Dispatched | Dispatch all or part | `sales.dispatch` | Stock out, invoice posted, reservation released |
| Delivered | Confirm delivery, recording goods brought back | Assigned driver or `sales.dispatch`; returns `sales.return` | Undelivered goods become a posted return |
| Completed | Automatic | — | Delivered and every invoice settled |

- The status after picking is derived from the deliveries and settlements, so voiding a payment reopens a completed order.
- A partly dispatched order can be closed with a reason; its remaining reservation is released. An order with nothing dispatched is cancelled instead.
- Exceeding the credit limit needs `sales.credit_override`. Approvals of one customer queue, so two orders cannot pass the limit together.
- Invoice due date = invoice date + the customer's payment terms. Customers without terms have no due date.

## Customer payments and cash with order takers

| Case | Result |
|---|---|
| Order taker records cash | Posted at once; held in their name (account 1180) |
| Order taker records another method | Draft until someone with `receivables.post` confirms the account and posts it |
| Office records a payment | Posted into the chosen cash or bank account |

A payment can settle several invoices, or stay on account. An order taker records a deposit; their cash falls only when the office confirms it. Deposits cannot exceed the cash held. A cash count stores expected, counted and difference; it posts nothing.

## Customer ledger

Brought forward, opening balance, invoices, payments, returns, credit notes, debit notes, reversals and a running balance, from posted AR lines. Each row names its journal entry. Opening balances are entered with the customer or as a note.

## Reports

Sales reports agree with the Sales and Sales returns accounts. Product figures exclude credit and debit notes, which have no product. Receivables agree with AR at any date; ageing applies credits to the oldest debts first. Collections include posted payments only.

## Tests

`supabase/tests/distribution.test.ts` covers the workflow, permissions, cash, notes and reports, and runs 500 random operations (seed in `SEED`) while checking that journals balance, stock equals movements, receivables equal AR and held cash equals account 1180.
