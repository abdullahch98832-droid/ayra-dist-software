# Security Plan

> **Status:** implemented in migrations `…101000_security.sql` and `…20261124100000_access_control.sql`, the Next.js proxy and server actions. Verified by 95 database tests (`npm run test:db`) and 21 unit tests including server-action authorization (`npm test`). HTTP-level tests against a real Supabase project exist (`npm run test:api`) but have **not been run yet** — they need a separate test project.

## Roles

| Role | Type | Summary |
|---|---|---|
| Super Admin | system | Everything. Permissions fixed. Only role with user administration and settings. |
| Manager | system | All business modules including confidential data; no user administration or settings. **Limited to 2 active users** (`app_settings.role_user_limits`, editable). |
| Data Entry User | system | Creates drafts (orders, receipts, expenses, collections, stock counts/transfers). Sees stock quantities and sales, never costs, margins, salaries, bank details, ledgers or financial reports. After a manager posts a confidential document, it disappears from the data entry user's view. |
| Viewer | system | Read-only operational modules (products, stock quantities, customers, suppliers, sales, SOL, vehicles, reports). No confidential data. |
| Custom roles | custom | Created by the Super Admin with any permission set. Accountant, Warehouse Staff, Order Taker and Driver are pre-made custom roles that can be edited or deleted. |

System roles cannot be renamed or deleted. There are 59 permissions (`module.action`); changes take effect on the next request.

## Confidential data

| Data | How it is protected |
|---|---|
| Purchase costs (POs, receipts, supplier invoices/returns) | Whole documents need `purchasing.view`; creators see only their own drafts |
| Purchase prices, cost of sales, stock value, margins | Columns not readable by any client (column privileges); read through `secure_*` views that require `costs.view`; `inventory_valuation` requires `costs.view` |
| Salaries | Separate table `employee_salaries` (`payroll.view` / `payroll.manage`); payroll tables need `payroll.view` |
| Bank information | Separate table `financial_account_bank_details` (`cash_bank.view`); balances need `cash_bank.view` |
| Company account (Ayra Happiness) | Separate permissions `company.view` / `company.pay`, distinct from other suppliers (`payables.*`) |
| Financial reports | `trial_balance`, `profit_and_loss` require `reports.financial`; account balances require `accounting.view` |
| User administration | `admin_*` functions require `users.view` / `users.manage`; only Super Admin has them |

Because clients cannot read hidden columns, `select=*` on `product_units`, `sales_invoices`, `sales_invoice_items`, `customer_returns(+_items)`, `stock_movements`, `stock_adjustments(+_items)` is rejected — always list columns. Generated types omit hidden columns.

## Enforcement layers

1. **UI** hides navigation and controls the user cannot use (convenience only).
2. **Server actions** call `authorize(permission)` first and validate input with Zod; the secret key is used only after authorization and only for Supabase Auth operations.
3. **Database (authoritative):** RLS on every table, column privileges, permission checks in every `SECURITY DEFINER` function, guard triggers.

## Accounts and sessions

- Login: email + password (Supabase Auth). One error message for every failure (no account enumeration). Public sign-up disabled.
- **Invitations:** the Super Admin invites by email; the user sets their own password through a one-time link. If role assignment fails, the invitation is rolled back.
- **Password reset:** "Forgot password" (response never reveals whether the email exists) and administrator-triggered reset emails. Minimum 10 characters with letters and digits.
- **Suspend / reactivate / remove access:** the database blocks all data access immediately (`is_active`, role cleared on removal); Supabase Auth additionally bans sign-in and token refresh. Records and history are kept.
- **Safeguards:** users cannot change their own role or status; at least one active Super Admin must remain; only a Super Admin can grant or revoke Super Admin; role seat limits are enforced under a lock.
- **Session expiration:** signed out after **30 minutes of inactivity** or **12 hours** after sign-in (`src/config/auth.ts`), enforced on the server by the proxy; Supabase access tokens expire after 1 hour.
- **Employees ≠ logins:** employees exist without accounts; a login can optionally be linked to one employee. Removing access never deletes the employee.

## First administrator

`npm run admin:bootstrap -- --email <owner email>` (needs `SUPABASE_SECRET_KEY` in `.env.local`): sends a Supabase invitation and grants Super Admin through `bootstrap_super_admin`, which only the secret key can call and which refuses once an active Super Admin exists. No password is passed, stored or transmitted by the script.

## Audit

Every insert/update/delete on business and access tables goes to `audit_logs` (who, when, before/after). Access History (`v_access_audit`) shows user, role and permission changes. Audit rows cannot be modified.

## Storage

Private buckets: `employee-photos` (read `employees.view`, write `employees.manage`, images ≤ 5 MB) and `attachments` (permission by first folder). Files are shown through signed URLs valid for one hour.
