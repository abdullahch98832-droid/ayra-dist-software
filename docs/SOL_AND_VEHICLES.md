# SOL and Vehicles

Jobs for clients with services, products, deliveries, costs and payments, and the vehicles that serve them and the sales deliveries. "SOL" is used as a name only; nothing depends on what it stands for. Migration: `20261127100000_sol_vehicles.sql`.

## Screens

| Screen | Content | Needs |
|---|---|---|
| `/sol` | Figures of a period, open jobs | `sol.view` |
| `/sol/jobs` | Jobs; details, items, deliveries, payments, costs, profit | `sol.view`; editing `sol.manage` |
| `/sol/deliveries` | Planned, travelling and completed deliveries | `sol.view` |
| `/sol/payments` | Advances and payments of jobs | a receivables permission |
| `/sol/setup` | Job types and services | `sol.manage` |
| `/vehicles` | Vehicles, trips, drivers, running costs | `vehicles.view`; editing `vehicles.manage`; costs `expenses.view` |
| `/expenses` | Costs of jobs and vehicles, other expenses | `expenses.view` / `.create` / `.post` |
| `/cash-bank` | Accounts payments are received in and paid from | `cash_bank.view`; editing `cash_bank.manage` |
| `/reports/sol-jobs`, `/vehicles`, `/vehicle-trips` | Reports with CSV and print | `reports.view` and the module's permission |

Without `sol.view_all`, a user sees jobs they are responsible for, created or deliver. Costs and profit need `costs.view`; received and outstanding amounts need a receivables permission.

## Distributor orders

Distributors of other cities order goods through us (`20261201100000_distributor.sql`). An order is a SOL job whose type is the fixed *Distributor order*: products only, its amount is the sum of its lines, and it can never become a job or the other way round.

| Step | What happens | Where |
|---|---|---|
| Call received | Who called, number, date, what was agreed, products with the price to the distributor and the expected Ayra price. Confirm | `/sol/orders/new` (`sol.manage`) |
| Ordered from Ayra | A purchase order at Ayra for this order, at the price for it | `/sol/orders/[id]/buy` (`sol.manage` and `purchasing.create`), approved as any purchase order |
| Goods received | Received into our warehouse on the purchase order | Purchases from Ayra |
| Supplied | Delivery with vehicle and driver; goods can come back | as for jobs |
| Completed | The amount becomes income and is owed by the distributor | `sol.post` |
| Paid | Nothing is left to pay; advances count | payments of jobs |

**Profit = amount from the distributor − price paid to Ayra for the goods of this order − transport − other expenses of the order.** Goods that Ayra delivered for the order (accepted, on receipts of its purchase orders) leave stock at exactly their price, so other stock keeps its value; anything beyond them leaves at average cost. When other sales have already taken part of that value, the order still costs what was paid and the rest is an inventory variance, so the ledger stays exact. Returns reverse both sides exactly.

Not included: differences of the later supplier bill, and goods returned to Ayra after receipt. Goods received for an order are not reserved. Orders are excluded from the list of jobs; both count in the SOL overview and reports. Report: `/reports/sol-orders`.

## Jobs

| Step | Permission | Effect |
|---|---|---|
| Draft | `sol.manage` | None; can be deleted |
| Confirmed | `sol.manage` | Payments, deliveries and costs can be recorded; the client is fixed |
| In progress | `sol.manage`, or the first dispatch | — |
| Completed | `sol.post` | Contract amount becomes income and a receivable |
| Reopened | `sol.post` | Income entry reversed; payments stay as advances |
| Cancelled | `sol.manage` | Planned deliveries cancelled; money received stays on the client's account (needs `receivables.post`) |

- A job type decides whether a job uses services, products and deliveries.
- The contract amount is what counts. Items may add up to something else; the form says so.
- The contract amount cannot fall below the money received, nor a quantity below what was delivered.

## Deliveries

Planning assigns vehicle, driver and destination. Dispatch takes products out of the warehouse at average cost; a delivery without goods is a trip. The assigned driver confirms arrival. Goods brought back, then or later, return at the exact cost they left with. Planned products are not reserved, and negative stock is never allowed for jobs.

## Payments

Cash, bank transfer, cheque or other, with the payment account, the client's account identifier and the reference (required for transfers and cheques). Identifiers are stored as their last four characters. A payment before completion is an advance: it credits the client and is not income. Payments never exceed the balance of the job, counting payments that wait to be posted. Without `receivables.post` a payment waits for the office.

## Figures

| Figure | Definition |
|---|---|
| Total jobs | All except drafts |
| Pending jobs | Confirmed and in progress |
| Contract value | Confirmed, in progress and completed |
| Pending payments | Contract value − received |
| Direct costs | Products issued less returned + posted job expenses without a vehicle |
| Vehicle expenses | Posted expenses of a vehicle for the job. Other vehicle expenses are in the vehicle report |
| Profit | Completed: contract − direct − vehicle. Cancelled: minus its costs. Unknown before |

## Tests

`supabase/tests/sol.test.ts`: workflow, permissions, payments, deliveries, vehicles, reports, and 400 random operations (seed in `SEED`) checking journals, stock, revenue, costs and allocations.
