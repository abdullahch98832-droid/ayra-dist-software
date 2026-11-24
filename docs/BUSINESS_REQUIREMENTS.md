# Business Requirements

> Status: draft. Items marked **OPEN** need a decision from the business owner. Items marked **ASSUMPTION** are proposed defaults that will be configurable and can be changed.

## A. Main Company Purchases (Ayra Happiness)
- Record goods received: product, quantity (any unit level), purchase cost.
- Track amount paid and amount pending per receipt.
- Record returns and discrepancies (short / excess / damaged on arrival).
- Maintain a running company ledger (what we owe, what we paid).

## B. External Suppliers
- Supplier profiles and multiple contacts per supplier.
- Goods supplied, quantity received, purchase value.
- Supplier invoices (number, date, attachment).
- Payments made and outstanding balance per supplier.

## C. Warehouse
- Products with a unit hierarchy: Carton → Box → Packet → Piece.
- Opening stock, incoming, outgoing, damaged, returns.
- Stock valuation and physical stock count reconciliation.

## D. Sales
- Customers/shops, order takers, orders, approval, deliveries.
- Collections, outstanding balances, sales invoices.

## E. SOL
- SOL jobs/transactions, clients, contract value.
- Payments, payment methods, account references.
- Vehicles, drivers, delivery records, pending amounts, profitability.

## F. Financial Management
- Expenses: guard, sweeper, servant, salaries, electricity, gas, water, snacks, rent, petrol, vehicle repairs, other.
- Payroll: salary, advances, bonuses, deductions, paid and pending amounts per month.
- Cash and bank accounts, double-entry accounting, statements, daily cash closing and period closing.

## G. Employees
- Profiles with picture, contact info, job title, employment status.
- Optional linked user account with role and permissions.

## Decisions

Confirmed by the business on 2026-11-23:
1. **Costing:** weighted average.
2. **SOL** covers both (a) transport/logistics jobs for outside clients (no stock; profit = contract value − linked costs) and (b) selling stock from a vehicle on a route (load, sell, return unsold).
3. **Reservation:** approved sales orders reserve stock until dispatch. Stock leaves at dispatch.

Instructed by the Phase 2 brief: money stored as `NUMERIC`; separate ledgers for the main company, suppliers and customers.

Phase 3 brief (2026-11-24):
- Roles: Super Admin, Manager, Data Entry User, Viewer, plus custom roles. Initial Super Admin is the owner's email (provisioned by invitation; not stored in the repository).
- "Initially support two managers" is implemented as a limit of **two active Manager accounts**, configurable in `app_settings.role_user_limits` (ASSUMPTION about intent — confirm or ask to remove the limit).
- "Company accounts" is interpreted as the **main company (Ayra Happiness) account** and gets its own permissions (`company.view`, `company.pay`). (ASSUMPTION — confirm; cash and bank accounts have separate permissions.)
- Confidential for non-managers: purchase costs, profit margins, salaries, bank information, financial reports, user administration.

Phase 5 brief (2026-11-24), dashboard definitions (ASSUMPTION — confirm; see DASHBOARD.md):
- Gross profit = sales less returns less everything under Cost of Sales (including stock variances and write-offs). SOL transport revenue and other income are outside gross profit and inside net profit.
- Sales are shown before sales tax. Purchases are the value of goods received, not supplier invoices.
- Pending SOL payments count completed jobs only.
- Low stock compares the reorder level with available stock in all warehouses except damaged.
- Only invoices with a due date can be overdue; due dates are not set automatically (depends on question 6, credit terms).
- "Assigned tasks" for data entry are their own drafts and documents awaiting them. A task-assignment feature would be new scope.
- The business day is Pakistan time. Document dates default to Pakistan's date in the database (fixed in `20261125100000`) and entry screens always send the date.

Phase 6 brief (2026-11-24), inventory and procurement (ASSUMPTION — confirm; see WAREHOUSE_AND_PROCUREMENT.md):
- "Approved costing method" is the weighted average confirmed on 2026-11-23.
- Goods damaged on arrival are kept in the damaged warehouse, valued and payable, until returned to the supplier or written off. Rejected goods are sent back at the door: not in stock, not payable, and still due on the order.
- Receiving more than was ordered is allowed, with a warning. A partly received order can be closed short with a reason.
- A bill may differ from its receipts; the difference goes to inventory variance.
- A supplier return is credited at the agreed price; the difference from average cost goes to inventory variance.
- The negative-stock override is off, needs its own permission (Super Admin only by default) and never applies to reserved stock, adjustments or counts.
- A physical count cannot be posted after its products moved; it must be checked and saved again.
- Receiving at a new price does not change the purchase cost stored on the product.
- Data entry users prepare drafts; approving and posting needs `purchasing.approve` / `purchasing.post`. They do not see approved orders, so they receive goods without linking an order unless given `purchasing.view`.

Phase 7 brief (2026-11-24), sales and distribution (ASSUMPTION — confirm; see SALES_AND_DISTRIBUTION.md):
- Order takers see only customers assigned to them.
- Cash recorded by an order taker posts at once and stays in their name until the office confirms a deposit. Other methods wait for the office.
- Completed means delivered and every invoice settled.
- Picking is required before dispatch, and only submitted orders can be approved.
- The price on an order may differ from the list price; the approver sees the difference.
- Credit notes reduce and debit notes increase net sales, without sales tax.
- The due date of an invoice follows the customer's payment terms.
- Pending collections of an order taker are the balances of the customers assigned to them today.
- A driver confirms their own deliveries; recording goods brought back needs `sales.return`.
- A cash count records a shortage without posting it. **OPEN** — should a shortage be recovered from salary, or expensed?

Phase 8 brief (2026-11-24), SOL and vehicles (ASSUMPTION — confirm; see SOL_AND_VEHICLES.md):
- SOL clients are customers, with one account for sales and SOL.
- The contract amount is entered; the items may add up to another amount. No sales tax on jobs.
- Income is booked when a job is completed. Advances are credits of the client until then.
- Expenses of a vehicle for a job count as that job's vehicle expenses; others are not shared out over jobs.
- Products are taken from stock at dispatch and are not reserved for a job.
- Account identifiers are kept as their last four characters.
- Selling stock from a vehicle on a route (decision 2b above) keeps its tables but has no screens; the brief did not ask for it.
- **OPEN** — May drivers see the contract amount of the jobs they deliver? (They do.)
- **OPEN** — Refunding an advance in cash after a cancellation. (Not modelled; the money stays on account.)
- **OPEN** — Who besides managers should create jobs? (`sol.manage` can be given to any role.)

Phase 9 brief (2026-11-24), expenses, payroll and accounting (ASSUMPTION — confirm; see FINANCE.md):
- A voucher of someone who may approve is approved at once; all others wait for approval.
- A receipt is required, or the reason why there is none.
- The Salaries category is filled by payroll only. Guard, Sweeper and Servant are for people paid without payroll; a person on payroll must not also be paid by a voucher.
- One payroll per month, dated at its end. A deduction reduces the salary expense.
- Deposits and withdrawals are transfers between cash and bank.
- A cash difference is booked only if chosen. Closing a day locks it and all earlier days of that cash account.
- Months are closed in order; the latest can be reopened with a reason.
- Cash and bank may show a negative balance; payments are not blocked.
- Cash with order takers is shown apart and is not part of cash.
- **OPEN** — Bank reconciliation against bank statements was not asked for and is not built.
- **OPEN** — Must the approver be a different person from the one who recorded the voucher?
- **OPEN** — Depreciation of fixed assets and income tax. (Manual journals.)

## Open Questions

Items marked ASSUMPTION are implemented as safe, configurable defaults and can be changed without restructuring.

### Inventory
4. **OPEN** — One warehouse or several? (ASSUMPTION: any number; MAIN and DAMAGED seeded; vehicles get their own.)
5. **OPEN** — Unit conversions: confirmed structure is per-product with optional levels — please confirm real factors when loading products.

### Sales and credit
6. **OPEN** — Can shops buy on credit, and with what limits? (ASSUMPTION: credit allowed; optional per-customer limit, blank = no limit; managers can override.)
7. **OPEN** — Do order takers earn commission? On sales or collections? (Not modelled.)
8. **OPEN** — Customer returns: credit note only, or also replacement / cash refund? (ASSUMPTION: credit note against the customer's balance.)
9. **OPEN** — Trade schemes / free goods from the main company (e.g. 12+1)? (Zero-price lines work; no scheme engine.)

### Purchasing
10. **OPEN** — Supplier credit terms? (ASSUMPTION: optional `payment_terms_days` per supplier.)
11. **OPEN** — How is the main company account settled (per shipment, monthly, running balance)? (ASSUMPTION: running balance; payments allocated to invoices.)

### Finance
12. **OPEN** — Number of cash and bank accounts? (ASSUMPTION: any number, user-defined.)
13. **OPEN** — Sales tax / GST / withholding? (ASSUMPTION: per-product sales tax rate, default 0%; no purchase tax.)
14. **OPEN** — Currency PKR only? (ASSUMPTION: yes.)
15. **OPEN** — Fiscal year (e.g. July–June)? Needed for year-end closing and reports. (Until then the result to date is shown in the balance sheet and nothing is moved to retained earnings.)
