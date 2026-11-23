# Inventory Rules

> **Status:** implemented in `supabase/migrations/…100400_inventory.sql`; covered by `inventory.test.ts`, `sales.test.ts` and `concurrency.test.ts`.

## Decisions (confirmed by the business, 2026-11-23)

- **Costing:** weighted average.
- **Reservation:** approved sales orders reserve stock until dispatch (setting `reserve_stock_on_approval`, default `true`).

## Units

- Each product has one **base unit** (usually Piece). All stock is stored in base units as integers.
- Further units (Packet, Box, Carton, or any unit added to `units`) are configured per product in `product_units` with an integer `factor` (base units per unit), e.g. Box = 12, Carton = 72. Levels can be skipped.
- The base-unit row (factor 1) is created automatically and cannot be changed or removed; the base unit of a product cannot change.
- Document lines record the unit and quantity entered; the factor is copied from `product_units` by a trigger (clients cannot supply it), and `base_quantity` is computed.

## Ledger-based stock

- Stock is never edited directly. Every change is a row in `stock_movements` (immutable): `opening`, `purchase_receipt`, `purchase_return`, `sale`, `sales_return`, `transfer_out/in`, `adjustment_in/out`, `write_off`.
- `stock_balances` (per product per warehouse) holds `on_hand` and `reserved`; constraints guarantee `0 ≤ reserved ≤ on_hand`. **Negative stock is impossible.**
- `inventory_valuation` (per product) holds total quantity and total value; it always equals the Inventory GL account.

## Weighted average costing

- One cost pool per product across all warehouses (transfers do not change value).
- Receipts add their exact line value. Average = total value ÷ quantity.
- Issues are costed at `round(qty × value ÷ quantity, 2)`; issuing the last units takes the remaining value exactly, so no rounding residue accumulates.
- Customer returns linked to an invoice come back at the cost recorded on that sale; unlinked returns at the current average.
- Increasing stock when none is on hand (opening stock, count gains) requires a unit cost.

## Order lifecycle

1. Draft / submitted order: no stock effect.
2. Approved: stock **reserved** (fails if available = on hand − reserved is insufficient).
3. Delivery dispatched: reservation released and stock issued in the same transaction; the sales invoice is created and posted. Partial dispatches are supported.
4. Cancelled: remaining reservation released.
5. Reserved stock cannot be sold directly, transferred or written off.

## Warehouses

- `main` — normal storage (seeded: MAIN).
- `damaged` — quarantine for damaged goods, still valued (seeded: DAMAGED). Damaged customer returns go here; stock leaves via write-off (expense) or supplier return.
- `vehicle` — one per vehicle, holding stock loaded for SOL route sales.

## Physical counts

A count records counted quantities (system quantity is snapshotted for reference). Posting compares with on-hand **at posting time** and posts a `count` adjustment for the differences.

## Concurrency

All stock functions lock the balance row, then the valuation row, processing lines ordered by product. Concurrent documents queue instead of overselling (verified with parallel transactions).
