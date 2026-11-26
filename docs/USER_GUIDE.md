# User Guide — Ayra Happiness Distributor Management System

This guide says what every part of the software is for and how to use it. It is written for the owner and the staff, in the order the work happens.

**What the business is:** a distributor. Goods are taken from the Ayra company, order takers bring the orders of the shops, suppliers (our staff) take the goods to the shops and receive the money. In SOL, distributors of other cities order through us.

**Words used in the software**

| Word | Meaning |
|---|---|
| Ayra company | The company the goods are bought from |
| Order taker | Staff who visit shops and write their orders |
| Supplier | Staff who take the goods to the shop and receive the money |
| Customer | A shop, or a distributor of another city |
| Draft / Posted | A draft changes nothing. Posted is final and is in the accounts |
| Void | Cancels a posted paper. The accounts are corrected and the history is kept |

---

## 1. First set-up (once)

Do these in this order.

1. **Settings** — address, phone and NTN for the printed papers.
2. **Cash & bank → Add account** — your cash box and bank accounts, then **Set opening balance**.
3. **Warehouses** — at least one normal warehouse and one for damaged goods.
4. **Products** — categories, brands and units under *Categories, brands and units*, then each product with its units, purchase cost, selling price and minimum stock.
5. **Employees** — every person who works for you.
6. **Order takers** and **Suppliers** — choose the employee, or create a new one there.
7. **Customers** — every shop, its order taker, credit limit and opening balance. Distributors of other cities are customers too.
8. **Inventory → Opening and adjustments** — the stock you already have, with its cost.
9. **Users** — invite the people who sign in, with a role.

## 2. Every day: from Ayra to the shop

| Step | Where | What you do |
|---|---|---|
| 1. Order from Ayra | Purchases from Ayra → Purchase orders | New order, products, prices, **Approve** |
| 2. Goods arrive | Purchases from Ayra → Goods received | Open the order, **Receive against this order**, enter good, damaged and rejected, **Post**. Stock goes up and what you owe Ayra goes up |
| 3. Bill of Ayra | Purchases from Ayra → Bills | Enter the bill number and match the receipts |
| 4. Shop orders | Sales → Orders | The order taker makes the order and submits it |
| 5. Approve | Sales → Orders | Office approves. The stock is kept for this shop |
| 6. Pack | Inventory → Dispatch | **Start picking**, print the pick list |
| 7. Send | Inventory → Dispatch | **Choose the supplier**, vehicle and driver, **Dispatch**. The invoice is made by itself |
| 8. Shop receives | Sales → Deliveries | **Confirm delivery**: who received it, what came back, **money received** |
| 9. Cash to office | Receivables → Cash with staff | **Record deposit** when the supplier or order taker hands the cash over |
| 10. Close the day | Cash & bank → Daily closing | Count the cash and close |

### Example: AM Mart

1. The order taker takes AM Mart's order (Sales → Orders) and submits it. The office approves it.
2. In Inventory → Dispatch, choose the supplier Akram and press **Dispatch**.
3. Akram brings the goods to AM Mart. On his phone, or in the office, open the delivery and press **Confirm delivery**. *Received by: AM Mart.* *Amount received: 700* (or **Full amount**). *Cash, held by the supplier.*
4. The delivery now says: supplied by Akram, received by AM Mart, 700 received, 300 still to pay.
5. The 700 stays in Akram's name until he hands it over: Receivables → Cash with staff → **Record deposit**.

If the shop pays into the bank, choose the bank account instead and enter the reference.

## 3. What each part is for

### Overview
- **Dashboard** — today's figures, what waits for you, low stock, overdue payments, and how the business works.

### Sales & delivery
- **Sales** — *Overview* figures; *Orders* of shops; *Deliveries* with their supplier and money; *Invoices*; *Returns* of goods.
- **Customers** — shops with address, credit limit, balance and full ledger. Statement as PDF.
- **Order takers** — who they are, their area, orders, sales, collections and cash held.
- **Suppliers** — your staff who deliver: deliveries, shops served, value supplied, money received and cash held. Open one to see every shop he served.
- **Receivables** — *Outstanding*: what every shop owes and for how long; *Payments*: record or check payments; *Cash with staff*: cash held by order takers and suppliers, and its hand-over; *Credit and debit notes*.

### Purchasing
- **Purchases from Ayra** — *Purchase orders*, *Goods received*, *Bills*, *Returns*, *Payments* for goods, **Company money** (money received or paid beside the goods), and *Account* with everything owed. **Ayra details** on the Account page changes Ayra's phone, address and payment terms.

### Stock
- **Products** — list, units, prices, picture, minimum stock.
- **Warehouses** — places where stock is kept.
- **Inventory** — *Stock* now; *Movements* history; *Transfers* between warehouses; *Physical counts*; *Opening and adjustments*; *Damaged goods*; *Reservations* kept for orders; *Dispatch*.

### SOL & fleet
- **SOL → Distributor orders** — orders of distributors of other cities (section 5).
- **SOL → Jobs** — other work with a contract; *Deliveries*, *Payments*, *Setup*.
- **Vehicles** — vehicles, drivers, trips and their costs.

### Finance
- **Cash & bank** — accounts, cash and bank books, transfers, receipts and payments, daily closing, bank reconciliation.
- **Expenses** — vouchers with receipt and approval, by category.
- **Accounting** — chart of accounts, ledger, journal, trial balance, profit and loss, balance sheet, cash flow, month closing, checks.

### People
- **Employees** — records and photos. **Payroll** — salaries, advances, bonuses, payment, slips.

### Insights and administration
- **Reports** — all reports (section 7).
- **Users, Roles, Access history, Settings** — who signs in, what they may do, what was changed.

## 4. Payments

| You want to record | Go to |
|---|---|
| Money from a shop at delivery | the delivery → **Confirm delivery** |
| Money from a shop later | Receivables → Payments → **Record payment** |
| Cash handed over by a supplier or order taker | Receivables → Cash with staff → **Record deposit** |
| Payment to Ayra for goods | Purchases from Ayra → Payments |
| **Investment received, or extra money paid to Ayra** | Purchases from Ayra → **Company money** |
| Petrol, rent, food and so on | Expenses → New voucher |
| Salary | Payroll |
| Money between cash and bank | Cash & bank → Transfers |
| Owner's money in or out, loans | Cash & bank → Receipts and payments |

### Company money (received and paid)

**Purchases from Ayra → Company money** records money that moves beside the bills of goods. Press **Add entry** and first choose **money in or out**:

- **Money received (in)** — cash put into the business, such as the owner's investment. Choose the account it was **received into**. Under **Given by** you can list the people who gave it and how much each; the amounts must add up to the total. The money goes to owner's capital.
- **Money paid (out)** — extra money paid to Ayra. Choose the account it was **paid from** and, under *Counts as*, whether it is an **extra cost** (does not change what you owe for goods) or **part of what we owe for goods** (reduces what you owe Ayra).

Every entry has a name, a **date** (no time of day), an amount, an account and a method. To change one press the **pencil**; the accounts are corrected and the old values stay in the history. **Void** cancels an entry with a reason. Closed days and months must be reopened first. You need at least one cash or bank account (add one under **Cash & bank**) before recording here.

## 5. SOL: distributors of other cities

1. **SOL → Distributor orders → New distributor order** — who called, the number, date, products, your price to them and Ayra's price. Save, then **Confirm order**.
2. **Order from Ayra** — makes the purchase order for this order. Approve it and receive the goods in Purchases from Ayra.
3. **Supply goods** — vehicle, driver and quantity, then dispatch and confirm the arrival.
4. **Record payment** — before or after. Money before completion is an advance.
5. **Complete order** — the profit appears: *amount − price paid to Ayra for this order − transport − other expenses*. Use **Add cost** for transport and other costs of the order.

The line at the top always shows the step: call received → ordered from Ayra → goods received → supplied → completed → paid.

## 6. Correcting mistakes

- **Draft:** edit or delete it.
- **Posted:** it cannot be edited. **Void** or **reverse** it and enter it again. Extra payments to Ayra can be edited directly.
- **Goods came back:** at the delivery, or later under Sales → Returns.
- **Stock is wrong:** Inventory → Physical counts.
- **Wrong supplier:** open the delivery while it is on the way and change the supplier.

## 7. Reports

Open **Reports**, choose one, choose the dates (today, yesterday, this week, this month, last month, this year or your own), then **PDF**, **Excel** or **CSV**.

| Group | Examples |
|---|---|
| Inventory | Current stock, stock valuation, fast and slow moving, low stock, damaged, product-wise profit |
| Sales | Daily, monthly, customer-wise, product-wise, order takers, **supplier performance**, **supplier deliveries**, territories, pending collections |
| Ayra company | Total purchases, purchase history, delivery performance, goods received, account, payments, **company money (received and paid)**, returns, adjustments, dues |
| SOL | **Distributor orders**, job register, contracts, payments, expenses, profitability |
| Financial | Daily and monthly profit and loss, cash flow, expenses, receivables and payables aging, bank reconciliation |
| Operations | Deliveries, expenses, payroll, vehicles |

A green line **Agrees with the general ledger** means the report equals the accounts. If it is ever red, do not use the figures and tell your developer.

## 8. Printed papers

Every invoice, challan, receipt, purchase order, statement, slip and report has **Print / PDF** and can be English, Urdu or both.

## 9. Who may do what

| Role | May |
|---|---|
| Super Admin | Everything, also users and settings |
| Manager | All business work, no users or settings (two people) |
| Data Entry User | Prepares drafts. No costs, profit or salaries |
| Viewer | Reads stock, sales and shops. No money matters |
| Order Taker | His own shops, orders and collections |
| **Supplier** | His own deliveries, and the money he receives |
| Driver | His own deliveries |
| Accountant, Warehouse | Accounts; stock and dispatch |

Roles can be changed under **Roles**. For a supplier who uses the phone: **Users → Invite**, role *Supplier*, and link him to his employee record.

## 10. Useful habits

- Every evening: confirm all deliveries, take the cash from suppliers and order takers, close the day.
- Every week: look at *Pending collections* and *Low stock*.
- Every month: payroll, bank reconciliation, then close the month under Accounting → Periods.
- The language is changed at the top of the screen. The search box at the top finds any shop, order or page.
