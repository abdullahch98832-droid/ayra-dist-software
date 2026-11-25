-- CLEARS ALL ENTERED DATA. THIS CANNOT BE UNDONE. Take a backup first.
--
-- Not a migration. Run it by hand in the Supabase SQL Editor, once, after looking at clear-all-data-preview.sql.
-- It is one transaction: if anything is wrong, nothing is changed.
--
-- Cleared: sales, purchases, payments, stock, SOL, expenses, payroll, accounts, products, customers, employees, order
--          takers, suppliers, vehicles, cash and bank accounts, vendors, access history, and every login but one.
-- Stays:   the active Super Admin, settings, roles, chart of accounts, units, expense categories, SOL job types, the
--          Main and Damaged warehouses and the record of the Ayra company. Document numbers start at 1 again.
--
-- To run: write CLEAR between the quotes of v_confirm.
do $clear$
declare
  v_confirm text := '';
  -- Only needed when there is more than one active Super Admin: the email of the one that stays.
  v_keep_email text := '';
  v_name constant text := 'Abdullah Chattha';

  v_stay constant text[] := array[
    'app_settings', 'chart_of_accounts', 'document_sequences', 'expense_categories', 'permissions', 'profiles', 'roles',
    'role_permissions', 'sol_job_types', 'supplier_contacts', 'suppliers', 'units', 'warehouses'];
  v_clear constant text[] := array[
    'account_openings', 'accounting_periods', 'audit_logs', 'bank_reconciliation_lines', 'bank_reconciliations', 'brands',
    'cash_closings', 'cash_deposits', 'cash_reconciliations', 'cash_vouchers', 'company_extra_payments', 'customer_notes',
    'customer_payment_allocations', 'customer_payments', 'customer_return_items', 'customer_returns', 'customers',
    'deliveries', 'delivery_items', 'employee_advances', 'employee_salaries', 'expenses',
    'financial_account_bank_details', 'financial_accounts', 'fund_transfers', 'goods_receipt_items', 'goods_receipts',
    'inventory_valuation', 'journal_entries', 'journal_entry_lines', 'order_takers', 'payroll_items', 'payroll_runs',
    'product_categories', 'product_units', 'products', 'purchase_order_items', 'purchase_orders', 'salary_payments',
    'sales_invoice_items', 'sales_invoices', 'sales_order_items', 'sales_orders', 'sol_deliveries', 'sol_delivery_items',
    'sol_job_items', 'sol_jobs', 'sol_return_items', 'sol_returns', 'sol_services', 'sol_trips', 'stock_adjustment_items',
    'stock_adjustments', 'stock_balances', 'stock_count_items', 'stock_counts', 'stock_movements', 'stock_transfer_items',
    'stock_transfers', 'supplier_invoice_receipts', 'supplier_invoices', 'supplier_payment_allocations',
    'supplier_payments', 'supplier_return_items', 'supplier_returns'];
  -- Tables that stay refer to these, so their rows are deleted instead.
  v_delete constant text[] := array['drivers', 'employees', 'vehicles'];
  v_admins uuid[];
  v_keep uuid;
  v_unknown text;
  v_tables text;
begin
  if v_confirm <> 'CLEAR' then
    raise exception 'Nothing was changed. To clear all data, write CLEAR between the quotes of v_confirm.';
  end if;

  -- A table nobody has decided about stops the script.
  select string_agg(tablename, ', ') into v_unknown from pg_tables
   where schemaname = 'public' and tablename <> all (v_stay || v_clear || v_delete);
  if v_unknown is not null then raise exception 'Nothing was changed. Unknown tables: %', v_unknown; end if;

  select array_agg(p.id) into v_admins
    from public.profiles p
    join public.roles r on r.id = p.role_id and r.code = 'super_admin'
    join auth.users u on u.id = p.id
   where p.is_active and (v_keep_email = '' or lower(u.email) = lower(trim(v_keep_email)));
  if coalesce(cardinality(v_admins), 0) <> 1 then
    raise exception 'Nothing was changed. Exactly one active Super Admin must be found, but there are %. Write the email of the one that stays in v_keep_email.', coalesce(cardinality(v_admins), 0);
  end if;
  v_keep := v_admins[1];

  -- Truncating is all or nothing and does not fire the rules that protect posted records one by one.
  update public.profiles set employee_id = null where employee_id is not null;
  select string_agg(format('public.%I', t), ', ') into v_tables from unnest(v_clear) t where to_regclass(format('public.%I', t)) is not null;
  execute 'truncate table ' || v_tables;
  delete from public.suppliers where not is_principal;
  delete from public.warehouses where code not in ('MAIN', 'DAMAGED');
  update public.warehouses set vehicle_id = null where vehicle_id is not null;
  delete from public.vehicles where true;
  delete from public.drivers where true;
  delete from public.employees where true;
  -- The ledger accounts of the cash and bank accounts.
  delete from public.chart_of_accounts
   where system_key is null
     and parent_id in (select id from public.chart_of_accounts where system_key in ('CASH_PARENT', 'BANK_PARENT'));
  update public.document_sequences set next_value = 1 where true;

  -- Profiles, sessions and identities go with the login.
  delete from auth.users where id <> v_keep;
  update public.profiles set full_name = v_name where id = v_keep;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name) where id = v_keep;

  -- The steps above wrote history of their own.
  truncate table public.audit_logs;
end
$clear$;

select (select count(*) from auth.users) as logins,
       (select full_name from public.profiles limit 1) as super_admin,
       (select count(*) from public.journal_entries) as entries,
       (select count(*) from public.products) as products,
       (select count(*) from public.customers) as customers,
       (select count(*) from public.employees) as employees,
       (select count(*) from public.audit_logs) as history;
