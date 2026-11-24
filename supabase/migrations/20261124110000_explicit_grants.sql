-- Explicit API grants.
--
-- The earlier migrations relied on Supabase granting the API roles access to every new
-- table automatically. Projects created without that setting ("Automatically expose new
-- tables") gave signed-in users no table access at all. These grants state the intended
-- privileges directly, so the result no longer depends on a project setting.
--
-- They only restore table-level access that row level security then narrows. Columns that
-- earlier migrations hid (costs, purchase prices) or made read-only are deliberately absent:
-- their column grants already exist. Running this again, or on a project that does grant
-- automatically, changes nothing. anon and service_role receive nothing here.
--
-- New tables must grant their own access in the migration that creates them; a database
-- test compares projects with and without automatic grants.

-- These grants are safe only because row level security guards every table; stop otherwise.
do $$
declare
  v_open text;
begin
  select string_agg(relname, ', ' order by relname) into v_open
    from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  if v_open is not null then
    raise exception 'Row level security is off on: %. Apply the earlier migrations first; nothing was changed.', v_open;
  end if;
end;
$$;

grant usage on schema public to authenticated;

-- Reading: every table whose columns are all visible to holders of the RLS permission.
grant select on
  public.accounting_periods, public.app_settings, public.audit_logs, public.chart_of_accounts,
  public.customer_payment_allocations, public.customer_payments, public.customers, public.deliveries,
  public.delivery_items, public.document_sequences, public.drivers, public.employee_advances,
  public.employee_salaries, public.employees, public.expense_categories, public.expenses,
  public.financial_account_bank_details, public.financial_accounts, public.fund_transfers,
  public.goods_receipt_items, public.goods_receipts, public.inventory_valuation, public.journal_entries,
  public.journal_entry_lines, public.payroll_items, public.payroll_runs, public.permissions,
  public.product_categories, public.products, public.profiles, public.purchase_order_items,
  public.purchase_orders, public.role_permissions, public.roles, public.salary_payments,
  public.sales_order_items, public.sales_orders, public.sol_jobs, public.sol_trips, public.stock_balances,
  public.stock_count_items, public.stock_counts, public.stock_transfer_items, public.stock_transfers,
  public.supplier_contacts, public.supplier_invoice_receipts, public.supplier_invoices,
  public.supplier_payment_allocations, public.supplier_payments, public.supplier_return_items,
  public.supplier_returns, public.suppliers, public.units, public.vehicles, public.warehouses
to authenticated;

-- Reading: views (security invoker, or secure_* views that check costs.view themselves).
grant select on
  public.secure_customer_return_costs, public.secure_customer_return_item_costs,
  public.secure_product_unit_costs, public.secure_sales_invoice_costs, public.secure_sales_invoice_item_costs,
  public.secure_sol_job_profitability, public.secure_sol_trip_profitability,
  public.secure_stock_adjustment_item_values, public.secure_stock_adjustment_values,
  public.secure_stock_movement_values, public.v_access_audit, public.v_account_balances,
  public.v_company_ledger, public.v_customer_balances, public.v_customer_ledger, public.v_employee_balances,
  public.v_financial_account_balances, public.v_inventory_valuation, public.v_posted_journal_lines,
  public.v_purchase_receipt_discrepancies, public.v_salary_balances, public.v_sales_invoice_balances,
  public.v_sol_job_summary, public.v_stock_on_hand, public.v_supplier_balances,
  public.v_supplier_invoice_balances, public.v_supplier_ledger
to authenticated;

-- Deleting: drafts and master data; RLS decides which rows.
grant delete on
  public.accounting_periods, public.app_settings, public.chart_of_accounts, public.customer_payments,
  public.customer_return_items, public.customer_returns, public.customers, public.deliveries,
  public.delivery_items, public.document_sequences, public.drivers, public.employee_advances,
  public.employee_salaries, public.employees, public.expense_categories, public.expenses,
  public.financial_account_bank_details, public.financial_accounts, public.fund_transfers,
  public.goods_receipt_items, public.goods_receipts, public.payroll_items, public.payroll_runs,
  public.product_categories, public.product_units, public.products, public.profiles,
  public.purchase_order_items, public.purchase_orders, public.role_permissions, public.roles,
  public.salary_payments, public.sales_invoice_items, public.sales_invoices, public.sales_order_items,
  public.sales_orders, public.sol_jobs, public.sol_trips, public.stock_adjustment_items,
  public.stock_adjustments, public.stock_count_items, public.stock_counts, public.stock_transfer_items,
  public.stock_transfers, public.supplier_contacts, public.supplier_invoice_receipts,
  public.supplier_invoices, public.supplier_payments, public.supplier_return_items, public.supplier_returns,
  public.suppliers, public.units, public.vehicles, public.warehouses
to authenticated;

-- role_permissions is written directly by the role editor (toggle = insert or delete).
grant insert, update on public.role_permissions to authenticated;

-- Views are never written through.
revoke insert, update, delete on
  public.v_access_audit, public.v_account_balances, public.v_company_ledger, public.v_customer_balances,
  public.v_customer_ledger, public.v_employee_balances, public.v_financial_account_balances,
  public.v_inventory_valuation, public.v_posted_journal_lines, public.v_purchase_receipt_discrepancies,
  public.v_salary_balances, public.v_sales_invoice_balances, public.v_sol_job_summary, public.v_stock_on_hand,
  public.v_supplier_balances, public.v_supplier_invoice_balances, public.v_supplier_ledger
from authenticated;
