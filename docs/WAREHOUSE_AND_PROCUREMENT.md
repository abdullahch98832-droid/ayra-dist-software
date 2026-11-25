# Warehouse and Procurement

Screens for products, stock and purchasing. Every figure comes from posted documents and ledgers; saving writes a draft, and only posting changes stock and accounts. Rules: [INVENTORY_RULES.md](INVENTORY_RULES.md), [ACCOUNTING_RULES.md](ACCOUNTING_RULES.md).


## Extra payments to the Ayra company

Purchases from Ayra → Extra payments (`company.view`; changes `company.pay`). Each has a name, date and time, amount, account, method and a type: *extra* is a cost (account `AYRA_EXTRA`), *account* reduces what is owed for goods. Everything can be corrected: when amount, date, account or type changes, the old entry is reversed **on its own date** and the corrected one is posted; a closed day or month refuses it. Names, times of day and notes do not touch the accounts. Voiding reverses today. Every change is in the audit log. Report: `company-extra`.

Goods are bought only from the Ayra company. The screens for other companies (**vendors**) exist but are hidden by `OTHER_VENDORS` in `src/config/vendors.ts`: `/purchasing/suppliers` and `/suppliers` answer 404 (except Ayra's own record), `/payables` leads to the Ayra account. Set `NEXT_PUBLIC_OTHER_VENDORS=true` and build again to show them. Permissions and data are not changed; a vendor balance that is not zero stays visible on the dashboard and in accounting.

## Purchase workflows

| | Ayra Happiness (Ayra company) | External suppliers |
|---|---|---|
| Screens | `/purchasing/company` | `/purchasing/suppliers` |
| Payable account | 2100 `AP_PRINCIPAL` | 2200 `AP_SUPPLIERS` |
| See the account | `company.view` | `payables.view` |
| Pay | `company.pay` | `payables.pay` |

Both use the same screens (`purchasing/[flow]`), documents and database functions, but never mix: a document of one workflow cannot be opened in the other.

Order → approve → receive (any number of partial receipts) → bill → payment. Receiving without an order is possible.

| Tracked | Where |
|---|---|
| Ordered, received, accepted, damaged, rejected, remaining | Order page, purchase report |
| Purchase cost | Order, receipt, purchase report |
| Amount paid, remaining payable | Receipt, bill, supplier account, payables, purchase and supplier reports |

| Action | Permission |
|---|---|
| Prepare orders, receipts, bills, returns (drafts) | `purchasing.create` |
| Approve, cancel or close orders | `purchasing.approve` |
| Post receipts, bills, returns | `purchasing.post` |

## Warehouse work (`/inventory`)

| Tab | Does | Permission to act |
|---|---|---|
| Stock | On hand, reserved, available, damaged, value; compares the valuation with the Inventory account | `costs.view` for values |
| Movements | Every stock change with its document, user and balance after | — |
| Transfers | Between warehouses, including into Damaged | `inventory.transfer` |
| Physical counts | Count sheet, differences, reconciliation | `inventory.count`; posting `inventory.adjust` |
| Opening and adjustments | Opening stock, write-offs, corrections | `inventory.adjust` |
| Damaged goods | Return to supplier or write off | `purchasing.create` / `inventory.adjust` |
| Reservations | Stock held for approved sales orders | — |
| Dispatch | Start picking, full or partial dispatch | `sales.dispatch` |

Orders come from [SALES_AND_DISTRIBUTION.md](SALES_AND_DISTRIBUTION.md). An approved order must be in picking before it can be dispatched.

## Reports (`/reports`, `reports.view` plus the report's own permission)

Stock, purchases, suppliers, stock movement history, low stock, damaged stock, product profitability. CSV export and print include every row, not only the visible page. Movement history shows at most the latest 5,000 movements of a selection and says so.

## Tests

`supabase/tests/procurement.test.ts` covers each workflow, permissions and reports, and runs 600 random operations while checking that journals balance, balances equal movements, and the valuation equals the Inventory account to the paisa.
