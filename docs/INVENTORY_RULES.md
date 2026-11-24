# Inventory Rules

> **Status:** implemented in `supabase/migrations/…100400_inventory.sql` and `20261125100000_inventory_procurement.sql`; covered by `inventory.test.ts`, `procurement.test.ts`, `sales.test.ts`, `distribution.test.ts`, `sol.test.ts` and `concurrency.test.ts`. Screens and workflows: [WAREHOUSE_AND_PROCUREMENT.md](WAREHOUSE_AND_PROCUREMENT.md).

## Decisions (confirmed by the business, 2026-11-23)

- **Costing:** weighted average.
- **Reservation:** approved sales orders reserve stock until dispatch (setting `reserve_stock_on_approval`, default `true`).

## Units

- Each product has one **base unit** (usually Piece). All stock is stored in base units as integers.
- Further units (Packet, Box, Carton, or any unit added to `units`) are configured per product in `product_units` with an integer `factor` (base units per unit), e.g. Box = 12, Carton = 72. Levels can be skipped.
- The base-unit row (factor 1) is created automatically and cannot be changed or removed; the base unit of a product cannot change.
- Document lines record the unit and quantity entered; the factor is copied from `product_units` by a trigger (clients cannot supply it), and `base_quantity` is computed.

## Ledger-based stock

- Stock is never edited directly. Every change is a row in `stock_movements` (immutable): `opening`, `purchase_receipt`, `purchase_return`, `sale`, `sales_return`, `transfer_out/in`, `adjustment_in/out`, `write_off`, `sol_issue`, `sol_return`.
- `stock_balances` (per product per warehouse) holds `on_hand` and `reserved`. Negative stock is refused unless the override below applies.
- `inventory_valuation` (per product) holds total quantity and total value; it always equals the Inventory GL account.

## Negative-stock override

- Off by default. An issue below zero is allowed only when **all** of these hold: the setting `allow_negative_stock` is on (Settings screen, `settings.manage`), the user holds `inventory.negative_override` (Super Admin only unless granted to another role), the movement is a sale, a transfer out or a supplier return, and no reserved stock of the product is touched. Adjustments, write-offs and counts can never go below zero.
- Each use is marked in `stock_movements.negative_override` and shown in the movement history.
- Stock issued below zero is costed at the current average, or the last known unit cost when nothing is on hand. A product that was never received cannot be issued.
- When the shortage is received at a different price, the difference goes to Inventory variance, so the valuation and the Inventory account stay equal.

## Weighted average costing

- One cost pool per product across all warehouses (transfers do not change value).
- Receipts add their exact line value. Average = total value ÷ quantity.
- Issues are costed at `round(qty × value ÷ quantity, 2)`; issuing the last units takes the remaining value exactly, so no rounding residue accumulates.
- Customer returns linked to an invoice come back at the cost recorded on that sale; unlinked returns at the current average.
- Opening stock requires a unit cost. Other increases when none is on hand (count gains) use the last known unit cost; a product without one is refused.
- A product's purchase cost is the suggested price on new documents. Receiving at another price does not change it.

## Order lifecycle

1. Draft / submitted order: no stock effect.
2. Approved: stock **reserved** (fails if available = on hand − reserved is insufficient).
3. Picking: stock stays reserved. Only an order in picking, or partly dispatched, can be dispatched.
4. Delivery dispatched: reservation released and stock issued in the same transaction; the sales invoice is created and posted. Partial dispatches are supported.
5. Delivery confirmed: goods brought back are posted as a customer return into the chosen warehouse, at the cost and invoice price of that sale.
6. Cancelled or closed: remaining reservation released.
7. Reserved stock cannot be sold directly, transferred or written off.

## Warehouses

- `main` — normal storage (seeded: MAIN).
- `damaged` — quarantine for damaged goods, still valued (seeded: DAMAGED). Damaged customer returns go here; stock leaves via write-off (expense) or supplier return.
- `vehicle` — one per vehicle, holding stock loaded for SOL route sales.

## Physical counts

A count records counted quantities in base units together with the stock on hand at that moment. Posting (reconciliation) books the differences as a `count` adjustment. **If stock of a counted product moved after the count was saved, posting is refused** until the count is checked and saved again; otherwise goods sold in between would be put back into stock.

## Concurrency

All stock functions lock the balance row, then the valuation row, processing lines ordered by product. Concurrent documents queue instead of overselling (verified with parallel transactions).
