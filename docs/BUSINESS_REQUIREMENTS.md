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
- Expenses: salaries, advances, petrol, rent, utilities, snacks, other.
- Cash and bank accounts, income, profit and loss.

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
15. **OPEN** — Fiscal year (e.g. July–June)? Needed for year-end closing and reports.
