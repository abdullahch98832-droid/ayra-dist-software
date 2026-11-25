# Expenses, Payroll and Accounting

> **Status:** implemented in `supabase/migrations/20261128100000_finance.sql` and the screens under `/expenses`, `/payroll`, `/cash-bank`, `/accounting`. Postings are listed in [ACCOUNTING_RULES.md](ACCOUNTING_RULES.md).

## Screens

| Screen | Contents | Permission |
|---|---|---|
| `/expenses` | Register with filters, new voucher, approval, categories | `expenses.view`; `expenses.create` for own vouchers; `expenses.post` to approve, reject and void |
| `/payroll` | Payroll of a month, payments, employees' statements, advances | `payroll.view`; `payroll.manage`, `payroll.post`, `payroll.pay` |
| `/cash-bank` | Accounts, cash and bank books, transfers, vouchers, daily closing | `cash_bank.view`; `cash_bank.manage`, `cash_bank.transfer`, `cash_bank.close`, `cash_bank.reconcile`; vouchers need `accounting.journal` |
| `/accounting` | Chart of accounts, general ledger, journal, trial balance, profit and loss, balance sheet, cash flow, periods, checks | `accounting.view`, `reports.financial`, `accounting.journal`, `accounting.close` |
| `/reports/expenses`, `/reports/payroll` | Reports with print and CSV | as above |

## Expenses

A voucher has a number, category, description, amount, date, payee, payment method, cash or bank account, receipt, the user who recorded it, the user who approved it and a status.

- **Pending → approved → void**, or **pending → rejected**. Only an approved voucher is in the accounts. Rejecting and voiding need a reason.
- Approval needs a description, a payee, a method, and a receipt or a stated reason for having none. A receipt can be added later but never replaced.
- A voucher recorded by someone who may approve is approved at once.
- Writes go through functions only. The creator can change or delete a pending voucher.
- Categories: Guard, Sweeper, Servant, Salaries, Electricity, Gas, Water, Snacks, Rent, Petrol, Vehicle repairs, Other expenses, and those that existed before. More can be added.
- **Salaries** is filled by payroll. A voucher cannot use it, so a salary is never counted twice.

## Payroll

One payroll per month. It is prepared from the salaries of active employees, changed while it is a draft, then posted and paid.

| Figure | Meaning |
|---|---|
| Gross | salary + allowances + bonus |
| Net | gross − deductions − advance recovered |
| Paid | posted salary payments of that payroll |
| Pending | net − paid |

- Posting is dated at the end of the month, or today if the month is not over.
- Not more than an employee's open advance can be recovered, and not more than the pending amount can be paid.
- Paying several employees at once succeeds or fails as a whole.
- A payroll is voided only after its payments, an advance only while it is not recovered.

## Cash and bank

Each account shows opening balance, receipts, payments, deposits, withdrawals, transfers and current balance, always from posted entries. Money out is shown as a negative amount, so the columns add up to the closing balance. Deposits and withdrawals are transfers between cash and bank; transfers are those between two accounts of one kind.

- **Opening balance:** once per account, against Opening balance equity.
- **Vouchers** (RV/PV) are for money that has no other document: capital, drawings, loans, other income, fixed assets, taxes. They cannot use customers, suppliers, the company, employees, inventory, sales or expense accounts.

### Daily cash closing

Count the cash, compare it with the ledger, explain any difference. The difference is booked to **Cash over and short** only if that is chosen. A closed day, and every day before it, accepts no entries in that account. Only the latest closing can be reopened, with a reason.

### Bank reconciliation

A bank statement is compared with the ledger: tick what the bank has seen and complete when the difference is zero. Only the newest can be reopened, with a reason. Nothing is posted. See REPORTS.md.

### Period closing

Months are closed in order after a checklist: no drafts dated in the month, cash counted, checks agree. A closed month accepts no entries. The latest closed month can be reopened with a reason. Posting and closing use one lock, so an entry cannot slip into a day or month while it is being closed.

## Statements

| Statement | Rule |
|---|---|
| General ledger, cash book, bank book | Balance brought forward, lines, running balance |
| Trial balance | Opening, movement and closing per account; debits equal credits |
| Profit and loss | Income − cost of sales − expenses of the period |
| Balance sheet | Assets = liabilities + equity + result to date. A customer who paid in advance is a liability, a supplier paid in advance an asset |
| Cash flow | Direct method, from the other side of every cash and bank entry |

## Checks

`/accounting/checks` compares the ledger with the documents: balanced entries, trial balance, customers, company, suppliers, inventory, cash with order takers, advances, salaries payable, sales, returns, SOL revenue, expenses, cash and bank, balance sheet. Two more must always be zero: **receipts booked as revenue** and **payments booked as purchases or expenses**.

## Tests

`supabase/tests/finance.test.ts` includes a random run of 260 operations in which every statement is recalculated from the raw journal lines and compared; run it with other numbers with `SEED=123 npm run test:db`.
