-- Row Level Security, column privileges, triggers, storage.
--
-- Model:
--   * Clients (role "authenticated") may read rows their permissions allow and
--     create/edit DRAFT documents. Every state change (approve, post, dispatch,
--     void...) goes through a SECURITY DEFINER function that checks permissions.
--   * Column privileges stop clients writing system-managed columns (status,
--     totals, costs, posting links, document numbers, audit columns).
--   * Ledgers (stock, journal, audit) are read-only to clients.
--   * "anon" has no access to any table.

create function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active and role_id is not null);
$$;

create function private.current_driver_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select d.id from public.drivers d
   join public.profiles p on p.employee_id = d.employee_id
  where p.id = auth.uid() and p.is_active;
$$;


-- SQL expression snippet: "(select private.has_permission('x'))". Wrapping in a
-- sub-select lets Postgres evaluate it once per statement instead of per row.
create function private.p(p_code text) returns text
language sql immutable set search_path = '' as $$
  select format('(select private.has_permission(%L))', p_code);
$$;

create function private.me() returns text
language sql immutable set search_path = '' as $$
  select '(select private.current_employee_id())';
$$;

-- Enables RLS and creates one policy per command. NULL expression = no policy (denied).
create function private.apply_policies(
  p_table text, p_select text, p_insert text, p_update text, p_delete text
) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  if p_select is not null then
    execute format('create policy "select" on public.%I for select to authenticated using (%s)', p_table, p_select);
  end if;
  if p_insert is not null then
    execute format('create policy "insert" on public.%I for insert to authenticated with check (%s)', p_table, p_insert);
  end if;
  if p_update is not null then
    execute format('create policy "update" on public.%I for update to authenticated using (%s) with check (%s)',
                   p_table, p_update, p_update);
  end if;
  if p_delete is not null then
    execute format('create policy "delete" on public.%I for delete to authenticated using (%s)', p_table, p_delete);
  end if;
end;
$$;

-- Expression: the line's parent header is visible (and optionally in an editable status).
create function private.parent_expr(p_parent text, p_fk text, p_statuses text[] default null) returns text
language sql immutable set search_path = '' as $$
  select format('exists (select 1 from public.%I h where h.id = %I%s)', p_parent, p_fk,
    case when p_statuses is null then ''
         else format(' and h.status::text = any (%L::text[])', p_statuses) end);
$$;

-- Grants INSERT/UPDATE to authenticated on every column except the protected
-- ones (and generated/identity columns, which cannot be written anyway).
create function private.restrict_columns(p_table text, p_protected text[]) returns void
language plpgsql set search_path = '' as $$
declare
  v_cols text;
begin
  execute format('revoke insert, update on public.%I from authenticated', p_table);
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = format('public.%I', p_table)::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attgenerated = '' and a.attidentity <> 'a'
     and a.attname <> all (p_protected);
  if v_cols is not null then
    execute format('grant insert (%s), update (%s) on public.%I to authenticated', v_cols, v_cols, p_table);
  end if;
end;
$$;

create function private.read_only(p_table text) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('revoke insert, update, delete, truncate on public.%I from authenticated', p_table);
end;
$$;

revoke all on function private.apply_policies(text, text, text, text, text) from public;
revoke all on function private.restrict_columns(text, text[]) from public;
revoke all on function private.read_only(text) from public;

-- ---------------------------------------------------------------------------
-- Baseline grants
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Columns maintained by the system on every document/line table.
do $$
declare
  v_doc_protected constant text[] := array[
    'doc_no', 'status', 'journal_entry_id', 'posted_at', 'posted_by', 'approved_at', 'approved_by',
    'created_at', 'created_by', 'updated_at', 'updated_by',
    'total_amount', 'subtotal', 'tax_total', 'cost_total', 'cost_amount', 'value_change', 'value_total',
    'reserved_base_quantity', 'dispatched_base_quantity', 'received_base_quantity', 'factor', 'tax_rate'];
  v_master_protected constant text[] := array['created_at', 'created_by', 'updated_at', 'updated_by'];
  t text;
begin
  foreach t in array array[
    'purchase_orders', 'purchase_order_items', 'goods_receipts', 'goods_receipt_items',
    'supplier_payments', 'supplier_returns', 'supplier_return_items',
    'sales_orders', 'sales_order_items', 'sales_invoices', 'sales_invoice_items',
    'delivery_items', 'customer_returns', 'customer_return_items', 'customer_payments',
    'stock_adjustments', 'stock_adjustment_items', 'stock_count_items', 'stock_transfers', 'stock_transfer_items',
    'fund_transfers', 'expenses', 'employee_advances', 'payroll_runs', 'payroll_items', 'salary_payments',
    'supplier_invoice_receipts']
  loop
    perform private.restrict_columns(t, v_doc_protected);
  end loop;

  perform private.restrict_columns('deliveries', v_doc_protected || array['sales_invoice_id', 'dispatched_at', 'dispatched_by', 'delivered_at']);
  perform private.restrict_columns('supplier_invoices', v_doc_protected || array['receipts_total', 'variance']);
  perform private.restrict_columns('stock_counts', v_doc_protected || array['stock_adjustment_id']);
  perform private.restrict_columns('sol_jobs', v_doc_protected || array['started_at', 'completed_at']);
  perform private.restrict_columns('sol_trips', v_doc_protected || array['closed_at']);

  foreach t in array array[
    'customers', 'suppliers', 'supplier_contacts', 'units', 'product_categories', 'products', 'product_units',
    'vehicles', 'drivers', 'warehouses', 'employees', 'expense_categories', 'roles']
  loop
    perform private.restrict_columns(t, v_master_protected);
  end loop;

  perform private.restrict_columns('app_settings', array['key', 'updated_at', 'updated_by']);

  perform private.restrict_columns('chart_of_accounts', v_master_protected || array['system_key']);
  perform private.restrict_columns('financial_accounts', v_master_protected || array['gl_account_id']);
  perform private.restrict_columns('accounting_periods', v_master_protected || array['closed_at', 'closed_by']);
  perform private.restrict_columns('profiles', array['id', 'created_at', 'updated_at', 'updated_by']);
  perform private.restrict_columns('document_sequences', array['doc_type', 'next_value', 'updated_at']);

  foreach t in array array[
    'stock_balances', 'inventory_valuation', 'stock_movements', 'journal_entries', 'journal_entry_lines',
    'audit_logs', 'permissions', 'supplier_payment_allocations', 'customer_payment_allocations']
  loop
    perform private.read_only(t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
do $$
declare
  p_ text;
begin
  -- Identity & access
  perform private.apply_policies('profiles',
    format('id = (select auth.uid()) or %s', private.p('users.view')),
    null,
    format('id = (select auth.uid()) or %s', private.p('users.manage')),
    null);
  perform private.apply_policies('roles', format('%s or %s', private.p('users.view'), 'id = (select role_id from public.profiles where id = (select auth.uid()))'),
    private.p('users.manage'), private.p('users.manage') || ' and not is_system', private.p('users.manage') || ' and not is_system');
  perform private.apply_policies('permissions', private.p('users.view'), null, null, null);
  perform private.apply_policies('role_permissions', private.p('users.view'), private.p('users.manage'), null, private.p('users.manage'));
  perform private.apply_policies('app_settings', '(select private.is_active_user())', null, private.p('settings.manage'), null);
  perform private.apply_policies('document_sequences', private.p('settings.manage'), null, private.p('settings.manage'), null);
  perform private.apply_policies('audit_logs', private.p('audit.view'), null, null, null);

  -- Master data
  perform private.apply_policies('employees', private.p('employees.view'), private.p('employees.manage'), private.p('employees.manage'), private.p('employees.manage'));
  perform private.apply_policies('customers', private.p('customers.view'), private.p('customers.manage'), private.p('customers.manage'), private.p('customers.manage'));
  perform private.apply_policies('suppliers', private.p('suppliers.view'), private.p('suppliers.manage'), private.p('suppliers.manage'), private.p('suppliers.manage'));
  perform private.apply_policies('supplier_contacts', private.p('suppliers.view'), private.p('suppliers.manage'), private.p('suppliers.manage'), private.p('suppliers.manage'));
  foreach p_ in array array['units', 'product_categories', 'products', 'product_units'] loop
    perform private.apply_policies(p_, private.p('products.view'), private.p('products.manage'), private.p('products.manage'), private.p('products.manage'));
  end loop;
  perform private.apply_policies('vehicles', private.p('vehicles.view'), private.p('vehicles.manage'), private.p('vehicles.manage'), private.p('vehicles.manage'));
  perform private.apply_policies('drivers', private.p('vehicles.view'), private.p('vehicles.manage'), private.p('vehicles.manage'), private.p('vehicles.manage'));
  perform private.apply_policies('warehouses', private.p('warehouses.view') || ' or ' || private.p('sales.create'),
    private.p('warehouses.manage'), private.p('warehouses.manage'), private.p('warehouses.manage'));

  -- Accounting
  perform private.apply_policies('chart_of_accounts', '(select private.is_active_user())',
    private.p('accounting.manage'), private.p('accounting.manage'), private.p('accounting.manage'));
  perform private.apply_policies('financial_accounts',
    format('%s or %s or %s or %s or %s', private.p('cash_bank.view'), private.p('receivables.collect'),
           private.p('payables.pay'), private.p('expenses.create'), private.p('payroll.pay')),
    private.p('cash_bank.manage'), private.p('cash_bank.manage'), null);
  perform private.apply_policies('accounting_periods', private.p('accounting.view'),
    private.p('accounting.manage'), private.p('accounting.manage'), private.p('accounting.manage') || ' and status = ''open''');
  perform private.apply_policies('journal_entry_lines',
    format('%s or (customer_id is not null and %s) or (supplier_id is not null and %s) or (employee_id is not null and %s)',
           private.p('accounting.view'), private.p('receivables.view'), private.p('payables.view'), private.p('payroll.view')),
    null, null, null);
  perform private.apply_policies('journal_entries',
    format('%s or exists (select 1 from public.journal_entry_lines l where l.journal_entry_id = journal_entries.id)', private.p('accounting.view')),
    null, null, null);
  perform private.apply_policies('fund_transfers', private.p('cash_bank.view'),
    private.p('cash_bank.transfer'), private.p('cash_bank.transfer') || ' and status = ''draft''', private.p('cash_bank.transfer') || ' and status = ''draft''');

  -- Inventory
  perform private.apply_policies('stock_balances', private.p('inventory.view') || ' or ' || private.p('sales.create'), null, null, null);
  perform private.apply_policies('inventory_valuation', private.p('inventory.view'), null, null, null);
  perform private.apply_policies('stock_movements', private.p('inventory.view'), null, null, null);
  perform private.apply_policies('stock_adjustments', private.p('inventory.view'),
    private.p('inventory.adjust'), private.p('inventory.adjust') || ' and status = ''draft''', private.p('inventory.adjust') || ' and status = ''draft''');
  perform private.apply_policies('stock_adjustment_items', private.parent_expr('stock_adjustments', 'stock_adjustment_id'),
    private.p('inventory.adjust') || ' and ' || private.parent_expr('stock_adjustments', 'stock_adjustment_id', array['draft']),
    private.p('inventory.adjust') || ' and ' || private.parent_expr('stock_adjustments', 'stock_adjustment_id', array['draft']),
    private.p('inventory.adjust') || ' and ' || private.parent_expr('stock_adjustments', 'stock_adjustment_id', array['draft']));
  perform private.apply_policies('stock_counts', private.p('inventory.view'),
    private.p('inventory.count'), private.p('inventory.count') || ' and status = ''draft''', private.p('inventory.count') || ' and status = ''draft''');
  perform private.apply_policies('stock_count_items', private.parent_expr('stock_counts', 'stock_count_id'),
    private.p('inventory.count') || ' and ' || private.parent_expr('stock_counts', 'stock_count_id', array['draft']),
    private.p('inventory.count') || ' and ' || private.parent_expr('stock_counts', 'stock_count_id', array['draft']),
    private.p('inventory.count') || ' and ' || private.parent_expr('stock_counts', 'stock_count_id', array['draft']));
  perform private.apply_policies('stock_transfers', private.p('inventory.view'),
    private.p('inventory.transfer'), private.p('inventory.transfer') || ' and status = ''draft''', private.p('inventory.transfer') || ' and status = ''draft''');
  perform private.apply_policies('stock_transfer_items', private.parent_expr('stock_transfers', 'stock_transfer_id'),
    private.p('inventory.transfer') || ' and ' || private.parent_expr('stock_transfers', 'stock_transfer_id', array['draft']),
    private.p('inventory.transfer') || ' and ' || private.parent_expr('stock_transfers', 'stock_transfer_id', array['draft']),
    private.p('inventory.transfer') || ' and ' || private.parent_expr('stock_transfers', 'stock_transfer_id', array['draft']));

  -- Purchasing
  perform private.apply_policies('purchase_orders', private.p('purchasing.view'),
    private.p('purchasing.create'), private.p('purchasing.create') || ' and status = ''draft''', private.p('purchasing.create') || ' and status = ''draft''');
  perform private.apply_policies('purchase_order_items', private.parent_expr('purchase_orders', 'purchase_order_id'),
    private.p('purchasing.create') || ' and ' || private.parent_expr('purchase_orders', 'purchase_order_id', array['draft']),
    private.p('purchasing.create') || ' and ' || private.parent_expr('purchase_orders', 'purchase_order_id', array['draft']),
    private.p('purchasing.create') || ' and ' || private.parent_expr('purchase_orders', 'purchase_order_id', array['draft']));
  perform private.apply_policies('goods_receipts', private.p('purchasing.view'),
    private.p('purchasing.create'), private.p('purchasing.create') || ' and status = ''draft''', private.p('purchasing.create') || ' and status = ''draft''');
  perform private.apply_policies('goods_receipt_items', private.parent_expr('goods_receipts', 'goods_receipt_id'),
    private.p('purchasing.create') || ' and ' || private.parent_expr('goods_receipts', 'goods_receipt_id', array['draft']),
    private.p('purchasing.create') || ' and ' || private.parent_expr('goods_receipts', 'goods_receipt_id', array['draft']),
    private.p('purchasing.create') || ' and ' || private.parent_expr('goods_receipts', 'goods_receipt_id', array['draft']));
  perform private.apply_policies('supplier_invoices', private.p('purchasing.view') || ' or ' || private.p('payables.view'),
    private.p('purchasing.create'), private.p('purchasing.create') || ' and status = ''draft''', private.p('purchasing.create') || ' and status = ''draft''');
  perform private.apply_policies('supplier_invoice_receipts', private.parent_expr('supplier_invoices', 'supplier_invoice_id'),
    private.p('purchasing.create') || ' and ' || private.parent_expr('supplier_invoices', 'supplier_invoice_id', array['draft']),
    null,
    private.p('purchasing.create') || ' and ' || private.parent_expr('supplier_invoices', 'supplier_invoice_id', array['draft']));
  perform private.apply_policies('supplier_payments', private.p('payables.view'),
    private.p('payables.pay'), private.p('payables.pay') || ' and status = ''draft''', private.p('payables.pay') || ' and status = ''draft''');
  perform private.apply_policies('supplier_payment_allocations', private.parent_expr('supplier_payments', 'supplier_payment_id'), null, null, null);
  perform private.apply_policies('supplier_returns', private.p('purchasing.view'),
    private.p('purchasing.create'), private.p('purchasing.create') || ' and status = ''draft''', private.p('purchasing.create') || ' and status = ''draft''');
  perform private.apply_policies('supplier_return_items', private.parent_expr('supplier_returns', 'supplier_return_id'),
    private.p('purchasing.create') || ' and ' || private.parent_expr('supplier_returns', 'supplier_return_id', array['draft']),
    private.p('purchasing.create') || ' and ' || private.parent_expr('supplier_returns', 'supplier_return_id', array['draft']),
    private.p('purchasing.create') || ' and ' || private.parent_expr('supplier_returns', 'supplier_return_id', array['draft']));

  -- Sales. Users without sales.view_all (order takers) only see their own orders and invoices.
  perform private.apply_policies('sales_orders',
    format('%s or (%s and order_taker_id = %s)', private.p('sales.view_all'), private.p('sales.view'), private.me()),
    format('%s and (%s or order_taker_id = %s)', private.p('sales.create'), private.p('sales.view_all'), private.me()),
    format('%s and status in (''draft'', ''submitted'') and (%s or order_taker_id = %s)', private.p('sales.create'), private.p('sales.view_all'), private.me()),
    format('%s and status in (''draft'', ''submitted'') and (%s or order_taker_id = %s)', private.p('sales.create'), private.p('sales.view_all'), private.me()));
  perform private.apply_policies('sales_order_items', private.parent_expr('sales_orders', 'sales_order_id'),
    private.p('sales.create') || ' and ' || private.parent_expr('sales_orders', 'sales_order_id', array['draft', 'submitted']),
    private.p('sales.create') || ' and ' || private.parent_expr('sales_orders', 'sales_order_id', array['draft', 'submitted']),
    private.p('sales.create') || ' and ' || private.parent_expr('sales_orders', 'sales_order_id', array['draft', 'submitted']));
  perform private.apply_policies('sales_invoices',
    format('%s or (%s and order_taker_id = %s)', private.p('sales.view_all'), private.p('sales.view'), private.me()),
    private.p('sales.invoice') || ' and sales_order_id is null',
    private.p('sales.invoice') || ' and sales_order_id is null and status = ''draft''',
    private.p('sales.invoice') || ' and sales_order_id is null and status = ''draft''');
  perform private.apply_policies('sales_invoice_items', private.parent_expr('sales_invoices', 'sales_invoice_id'),
    private.p('sales.invoice') || ' and ' || private.parent_expr('sales_invoices', 'sales_invoice_id', array['draft']),
    private.p('sales.invoice') || ' and ' || private.parent_expr('sales_invoices', 'sales_invoice_id', array['draft']),
    private.p('sales.invoice') || ' and ' || private.parent_expr('sales_invoices', 'sales_invoice_id', array['draft']));
  perform private.apply_policies('deliveries',
    format('%s or driver_id = (select private.current_driver_id()) or (%s and %s)',
           private.p('sales.view_all'), private.p('sales.view'), private.parent_expr('sales_orders', 'sales_order_id')),
    private.p('sales.dispatch'), private.p('sales.dispatch') || ' and status = ''draft''', private.p('sales.dispatch') || ' and status = ''draft''');
  perform private.apply_policies('delivery_items', private.parent_expr('deliveries', 'delivery_id'),
    private.p('sales.dispatch') || ' and ' || private.parent_expr('deliveries', 'delivery_id', array['draft']),
    private.p('sales.dispatch') || ' and ' || private.parent_expr('deliveries', 'delivery_id', array['draft']),
    private.p('sales.dispatch') || ' and ' || private.parent_expr('deliveries', 'delivery_id', array['draft']));
  perform private.apply_policies('customer_returns', private.p('sales.view_all') || ' or ' || private.p('sales.return'),
    private.p('sales.return'), private.p('sales.return') || ' and status = ''draft''', private.p('sales.return') || ' and status = ''draft''');
  perform private.apply_policies('customer_return_items', private.parent_expr('customer_returns', 'customer_return_id'),
    private.p('sales.return') || ' and ' || private.parent_expr('customer_returns', 'customer_return_id', array['draft']),
    private.p('sales.return') || ' and ' || private.parent_expr('customer_returns', 'customer_return_id', array['draft']),
    private.p('sales.return') || ' and ' || private.parent_expr('customer_returns', 'customer_return_id', array['draft']));
  -- Collectors see and draft their own collections; posting is a separate permission.
  perform private.apply_policies('customer_payments',
    format('%s or %s or (%s and collected_by = %s)', private.p('receivables.post'), private.p('sales.view_all'), private.p('receivables.collect'), private.me()),
    format('%s and (%s or collected_by = %s)', private.p('receivables.collect'), private.p('receivables.post'), private.me()),
    format('%s and status = ''draft'' and (%s or collected_by = %s)', private.p('receivables.collect'), private.p('receivables.post'), private.me()),
    format('%s and status = ''draft'' and (%s or collected_by = %s)', private.p('receivables.collect'), private.p('receivables.post'), private.me()));
  perform private.apply_policies('customer_payment_allocations', private.parent_expr('customer_payments', 'customer_payment_id'), null, null, null);

  -- SOL
  perform private.apply_policies('sol_jobs', private.p('sol.view'),
    private.p('sol.manage'), private.p('sol.manage') || ' and status in (''draft'', ''confirmed'', ''in_progress'')', private.p('sol.manage') || ' and status = ''draft''');
  perform private.apply_policies('sol_trips', private.p('sol.view'),
    private.p('sol.manage'), private.p('sol.manage') || ' and status = ''open''', null);

  -- Expenses & payroll
  perform private.apply_policies('expense_categories', '(select private.is_active_user())',
    private.p('expenses.post'), private.p('expenses.post'), null);
  perform private.apply_policies('expenses', private.p('expenses.view'),
    private.p('expenses.create'), private.p('expenses.create') || ' and status = ''draft''', private.p('expenses.create') || ' and status = ''draft''');
  perform private.apply_policies('employee_advances', private.p('payroll.view'),
    private.p('payroll.manage'), private.p('payroll.manage') || ' and status = ''draft''', private.p('payroll.manage') || ' and status = ''draft''');
  perform private.apply_policies('payroll_runs', private.p('payroll.view'),
    private.p('payroll.manage'), private.p('payroll.manage') || ' and status = ''draft''', private.p('payroll.manage') || ' and status = ''draft''');
  perform private.apply_policies('payroll_items', private.parent_expr('payroll_runs', 'payroll_run_id'),
    private.p('payroll.manage') || ' and ' || private.parent_expr('payroll_runs', 'payroll_run_id', array['draft']),
    private.p('payroll.manage') || ' and ' || private.parent_expr('payroll_runs', 'payroll_run_id', array['draft']),
    private.p('payroll.manage') || ' and ' || private.parent_expr('payroll_runs', 'payroll_run_id', array['draft']));
  perform private.apply_policies('salary_payments', private.p('payroll.view'),
    private.p('payroll.pay'), private.p('payroll.pay') || ' and status = ''draft''', private.p('payroll.pay') || ' and status = ''draft''');
end;
$$;

-- Closing a period records who closed it.
create function private.stamp_period_close() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then
    new.closed_at := now();
    new.closed_by := auth.uid();
  elsif new.status = 'open' then
    new.closed_at := null;
    new.closed_by := null;
  end if;
  return new;
end;
$$;

create trigger accounting_periods_close
  before update of status on public.accounting_periods
  for each row execute function private.stamp_period_close();

-- ---------------------------------------------------------------------------
-- updated_at/updated_by and audit triggers on every applicable table
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where c.relkind = 'r'
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'updated_at' and not a.attisdropped)
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'updated_by' and not a.attisdropped)
  loop
    execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()', t.relname);
  end loop;

  -- Ledger tables are append-only and record their own author; auditing them would only duplicate data.
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where c.relkind = 'r'
       and c.relname not in ('audit_logs', 'stock_movements', 'stock_balances', 'inventory_valuation',
                             'journal_entry_lines', 'document_sequences')
  loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit_row()', t.relname);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Functions: callable by signed-in users only. Every RPC checks its own permission.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- Storage: private buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('employee-photos', 'employee-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('attachments', 'attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- attachments/<module>/<...>: the first folder decides which permission applies.
create function private.attachment_permission(p_folder text, p_write boolean) returns text
language sql immutable set search_path = '' as $$
  select case p_folder
    when 'expenses' then case when p_write then 'expenses.create' else 'expenses.view' end
    when 'purchasing' then case when p_write then 'purchasing.create' else 'purchasing.view' end
    when 'sol' then case when p_write then 'sol.manage' else 'sol.view' end
    when 'sales' then case when p_write then 'sales.return' else 'sales.view_all' end
    when 'payables' then case when p_write then 'payables.pay' else 'payables.view' end
    when 'receivables' then case when p_write then 'receivables.collect' else 'receivables.view' end
  end;
$$;

create policy "employee photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'employee-photos' and (select private.has_permission('employees.view')));
create policy "employee photos: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-photos' and (select private.has_permission('employees.manage')));
create policy "employee photos: update" on storage.objects for update to authenticated
  using (bucket_id = 'employee-photos' and (select private.has_permission('employees.manage')));
create policy "employee photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-photos' and (select private.has_permission('employees.manage')));

create policy "attachments: read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and private.has_permission(private.attachment_permission((storage.foldername(name))[1], false)));
create policy "attachments: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
              and private.has_permission(private.attachment_permission((storage.foldername(name))[1], true)));
create policy "attachments: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and private.has_permission(private.attachment_permission((storage.foldername(name))[1], true)));

-- Private helpers: only those referenced by RLS policies are executable by clients.
revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;
grant execute on function
  private.has_permission(text),
  private.current_employee_id(),
  private.is_active_user(),
  private.current_driver_id(),
  private.attachment_permission(text, boolean)
to authenticated, service_role;
