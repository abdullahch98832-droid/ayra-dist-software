-- Dashboard figures, calculated from posted ledgers and stock balances.
--
-- dashboard_position, dashboard_performance, dashboard_overdue and dashboard_low_stock
-- total whole ledgers, so they run as definer and check a permission for every figure:
-- a figure the caller may not see is left out of the result, never returned as zero.
-- The list functions run as invoker, so row level security decides which rows appear.
--
-- Definitions (see docs/DASHBOARD.md):
--   net sales    = Sales revenue - Sales returns (before sales tax)
--   gross profit = net sales - every account under "Cost of Sales"
--   expenses     = every other expense account
--   net profit   = all income - all expense, exactly as profit_and_loss()
--   purchases    = inventory value received on posted goods receipts
-- Money is returned as text with two decimals so it stays exact.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The business day in Pakistan; the database clock runs in UTC.
create function private.business_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Karachi')::date;
$$;

create function private.money_text(p_amount numeric) returns text
language sql immutable set search_path = '' as $$
  select coalesce(p_amount, 0)::numeric(18,2)::text;
$$;

-- A stable key for the header that separates cost of sales from operating expenses.
update public.chart_of_accounts set system_key = 'COST_OF_SALES' where code = '5000' and system_key is null;

create function private.cost_of_sales_accounts() returns setof uuid
language sql stable security definer set search_path = '' as $$
  with recursive tree as (
    select id from public.chart_of_accounts where system_key = 'COST_OF_SALES'
    union
    select c.id from public.chart_of_accounts c join tree t on c.parent_id = t.id
  )
  select id from tree;
$$;

-- ---------------------------------------------------------------------------
-- Balances now, and today's activity
-- ---------------------------------------------------------------------------
create function public.dashboard_position() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today constant date := private.business_today();
  v_cash_bank constant boolean := private.has_permission('cash_bank.view');
  v_receivables constant boolean := private.has_permission('receivables.view');
  v_payables constant boolean := private.has_permission('payables.view');
  v_company constant boolean := private.has_permission('company.view');
  v_sales_all constant boolean := private.has_permission('sales.view_all');
  v_sales_own constant boolean := not v_sales_all and private.has_permission('sales.view') and private.has_permission('sales.create');
  v_me constant uuid := private.current_employee_id();
  v_accounts uuid[];
  v_result jsonb;
  v_row record;
begin
  perform private.require_permission('dashboard.view');
  v_result := jsonb_build_object('today', v_today);

  -- All ledger balances in one pass over the permitted accounts only.
  select array_agg(a.id) into v_accounts
    from public.chart_of_accounts a
    left join public.financial_accounts fa on fa.gl_account_id = a.id
   where (v_cash_bank and fa.id is not null)
      or (v_receivables and a.system_key = 'AR')
      or (v_payables and a.system_key = 'AP_SUPPLIERS')
      or (v_company and a.system_key = 'AP_PRINCIPAL');

  if v_accounts is not null or v_cash_bank then
    select coalesce(sum(l.debit - l.credit) filter (where fa.account_type = 'cash'), 0) as cash,
           coalesce(sum(l.debit - l.credit) filter (where fa.account_type = 'bank'), 0) as bank,
           coalesce(sum(l.debit - l.credit) filter (where a.system_key = 'AR'), 0) as receivables,
           coalesce(sum(l.credit - l.debit) filter (where a.system_key = 'AP_SUPPLIERS'), 0) as payables,
           coalesce(sum(l.credit - l.debit) filter (where a.system_key = 'AP_PRINCIPAL'), 0) as company
      into v_row
      from public.journal_entry_lines l
      join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
      join public.chart_of_accounts a on a.id = l.account_id
      left join public.financial_accounts fa on fa.gl_account_id = l.account_id
     where l.account_id = any (v_accounts);
    v_result := v_result || jsonb_strip_nulls(jsonb_build_object(
      'cash', case when v_cash_bank then private.money_text(v_row.cash) end,
      'bank', case when v_cash_bank then private.money_text(v_row.bank) end,
      'receivables', case when v_receivables then private.money_text(v_row.receivables) end,
      'supplier_payables', case when v_payables then private.money_text(v_row.payables) end,
      'company_outstanding', case when v_company then private.money_text(v_row.company) end));
  end if;

  if private.has_permission('inventory.view') then
    v_result := v_result || jsonb_build_object(
      'stock', jsonb_build_object(
        'products', (select count(distinct product_id) from public.stock_balances where on_hand > 0),
        'units', coalesce((
          select jsonb_agg(jsonb_build_object('name_en', t.name_en, 'name_ur', t.name_ur, 'on_hand', t.on_hand::text,
                                              'reserved', t.reserved::text, 'damaged', t.damaged::text) order by t.on_hand desc)
            from (select u.name_en, u.name_ur, sum(sb.on_hand) as on_hand, sum(sb.reserved) as reserved,
                         coalesce(sum(sb.on_hand) filter (where w.warehouse_type = 'damaged'), 0) as damaged
                    from public.stock_balances sb
                    join public.warehouses w on w.id = sb.warehouse_id
                    join public.products p on p.id = sb.product_id
                    join public.units u on u.id = p.base_unit_id
                   where sb.on_hand > 0
                   group by u.id) t), '[]'::jsonb)));
  end if;

  if private.has_permission('costs.view') then
    v_result := v_result || jsonb_build_object('inventory_value',
      private.money_text((select sum(total_value) from public.inventory_valuation)));
  end if;

  if v_sales_all then
    select coalesce(sum(l.credit - l.debit), 0) as net,
           coalesce(sum(l.debit - l.credit) filter (where a.system_key = 'SALES_RETURNS'), 0) as returned
      into v_row
      from public.journal_entries e
      join public.journal_entry_lines l on l.journal_entry_id = e.id
      join public.chart_of_accounts a on a.id = l.account_id and a.system_key in ('SALES', 'SALES_RETURNS')
     where e.status = 'posted' and e.entry_date = v_today;
    v_result := v_result || jsonb_build_object('today_sales', jsonb_build_object(
      'scope', 'all', 'net', private.money_text(v_row.net), 'returns', private.money_text(v_row.returned),
      'invoices', (select count(*) from public.sales_invoices where status = 'posted' and invoice_date = v_today)));
  elsif v_sales_own then
    v_result := v_result || jsonb_build_object('today_sales', jsonb_build_object(
      'scope', 'own', 'returns', '0.00',
      'net', private.money_text((select sum(subtotal) from public.sales_invoices
                                  where status = 'posted' and invoice_date = v_today and order_taker_id = v_me)),
      'invoices', (select count(*) from public.sales_invoices
                    where status = 'posted' and invoice_date = v_today and order_taker_id = v_me)));
  end if;

  if private.has_permission('purchasing.view') then
    v_result := v_result || jsonb_build_object('today_purchases', jsonb_build_object(
      'total', private.money_text((
        select sum(l.debit - l.credit)
          from public.journal_entries e
          join public.journal_entry_lines l on l.journal_entry_id = e.id
          join public.chart_of_accounts a on a.id = l.account_id and a.system_key = 'INVENTORY'
         where e.status = 'posted' and e.source_type = 'goods_receipt' and e.entry_date = v_today)),
      'receipts', (select count(*) from public.goods_receipts where status = 'posted' and receipt_date = v_today)));
  end if;

  -- Completed jobs whose contract value is not fully covered by allocated payments.
  if private.has_permission('sol.view') and v_receivables then
    select coalesce(sum(j.contract_value - coalesce(pa.received, 0)), 0) as amount, count(*) as jobs
      into v_row
      from public.sol_jobs j
      left join (select sol_job_id, sum(amount) as received from public.customer_payment_allocations
                  where sol_job_id is not null group by sol_job_id) pa on pa.sol_job_id = j.id
     where j.status = 'completed' and j.contract_value > coalesce(pa.received, 0);
    v_result := v_result || jsonb_build_object('sol_pending',
      jsonb_build_object('amount', private.money_text(v_row.amount), 'jobs', v_row.jobs));
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Performance for a date range, with the previous range of equal length
-- ---------------------------------------------------------------------------
create function public.dashboard_performance(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days integer;
  v_prev_from date;
  v_bucket text;
  v_financial constant boolean := private.has_permission('reports.financial');
  -- Expense documents only, without payroll and other ledger expenses.
  v_expenses constant boolean := v_financial or private.has_permission('expenses.view');
  v_purchases constant boolean := private.has_permission('purchasing.view');
  v_sales_all constant boolean := private.has_permission('sales.view_all');
  v_sales_own constant boolean := not v_sales_all and private.has_permission('sales.view') and private.has_permission('sales.create');
  v_sales constant boolean := v_sales_all or v_sales_own;
  -- A company total, so seeing individual SOL jobs (drivers) is not enough.
  v_sol constant boolean := private.has_permission('sol.view') and (v_sales_all or v_financial);
  v_stock constant boolean := private.has_permission('inventory.view');
  v_me constant uuid := private.current_employee_id();
  v_result jsonb;
begin
  perform private.require_permission('dashboard.view');
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'Choose a valid date range of at most three years' using errcode = '22023';
  end if;
  v_days := p_to - p_from + 1;
  v_prev_from := p_from - v_days;
  v_bucket := case when v_days <= 31 then 'day' when v_days <= 120 then 'week' else 'month' end;

  with accounts as (
    select a.id,
           case when a.system_key = 'SALES' then 'sales'
                when a.system_key = 'SALES_RETURNS' then 'returns'
                when a.system_key = 'SOL_REVENUE' then 'sol'
                when a.account_type = 'income' then 'other_income'
                when a.system_key = 'INVENTORY' then 'inventory'
                when a.id in (select private.cost_of_sales_accounts()) then 'cost'
                else 'expense' end as kind
      from public.chart_of_accounts a
     where a.account_type in ('income', 'expense') or a.system_key = 'INVENTORY'
  ),
  -- The only scan of the ledger; everything below reads this daily summary.
  ledger as materialized (
    select e.entry_date as day,
           coalesce(sum(l.credit - l.debit) filter (where a.kind = 'sales' and v_sales_all), 0) as sales,
           coalesce(sum(l.debit - l.credit) filter (where a.kind = 'returns' and v_sales_all), 0) as returns,
           coalesce(sum(l.credit - l.debit) filter (where a.kind in ('sales', 'returns')), 0) as revenue,
           coalesce(sum(l.credit - l.debit) filter (where a.kind = 'sol'), 0) as sol,
           coalesce(sum(l.credit - l.debit) filter (where a.kind = 'other_income'), 0) as other_income,
           coalesce(sum(l.debit - l.credit) filter (where a.kind = 'cost'), 0) as cost,
           coalesce(sum(l.debit - l.credit) filter (where a.kind = 'expense' and (v_financial or e.source_type = 'expense')), 0) as expense,
           coalesce(sum(l.debit - l.credit) filter (where a.kind = 'inventory' and e.source_type = 'goods_receipt'), 0) as purchases
      from public.journal_entries e
      join public.journal_entry_lines l on l.journal_entry_id = e.id
      join accounts a on a.id = l.account_id
     where e.status = 'posted' and e.entry_date between v_prev_from and p_to
     group by e.entry_date
  ),
  -- Order takers see only their own invoices, never the company's sales.
  own as (
    select i.invoice_date as day, i.subtotal as sales, 0::numeric as returns
      from public.sales_invoices i
     where v_sales_own and i.status = 'posted' and i.order_taker_id = v_me and i.invoice_date between v_prev_from and p_to
    union all
    select r.return_date, 0, r.subtotal
      from public.customer_returns r
      join public.sales_invoices i on i.id = r.sales_invoice_id and i.order_taker_id = v_me
     where v_sales_own and r.status = 'posted' and r.return_date between v_prev_from and p_to
  ),
  daily as materialized (
    select day, sales, returns, revenue, sol, other_income, cost, expense, purchases from ledger
    union all
    select day, sales, returns, 0, 0, 0, 0, 0, 0 from own
  ),
  totals as (
    select day >= p_from as is_current,
           sum(sales) as sales, sum(returns) as returns, sum(revenue) as revenue, sum(sol) as sol,
           sum(other_income) as other_income, sum(cost) as cost, sum(expense) as expense, sum(purchases) as purchases
      from daily group by 1
  ),
  total_objects as (
    select t.is_current, jsonb_strip_nulls(jsonb_build_object(
             'sales', case when v_sales then private.money_text(t.sales - t.returns) end,
             'returns', case when v_sales then private.money_text(t.returns) end,
             'purchases', case when v_purchases then private.money_text(t.purchases) end,
             'expenses', case when v_expenses then private.money_text(t.expense) end,
             'gross_profit', case when v_financial then private.money_text(t.revenue - t.cost) end,
             'net_profit', case when v_financial then private.money_text(t.revenue + t.sol + t.other_income - t.cost - t.expense) end,
             'sol_revenue', case when v_sol then private.money_text(t.sol) end)) as obj
      from (select p.is_current, coalesce(t.sales, 0) as sales, coalesce(t.returns, 0) as returns, coalesce(t.revenue, 0) as revenue,
                   coalesce(t.sol, 0) as sol, coalesce(t.other_income, 0) as other_income, coalesce(t.cost, 0) as cost,
                   coalesce(t.expense, 0) as expense, coalesce(t.purchases, 0) as purchases
              from (values (true), (false)) p(is_current) left join totals t on t.is_current = p.is_current) t
  ),
  buckets as (
    select distinct date_trunc(v_bucket, d)::date as start
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  ),
  movements as (
    select date_trunc(v_bucket, m.movement_date::timestamp)::date as start,
           sum(m.quantity) filter (where m.quantity > 0) as qty_in,
           -sum(m.quantity) filter (where m.quantity < 0) as qty_out
      from public.stock_movements m
     where v_stock and m.movement_date between p_from and p_to
       and m.movement_type not in ('transfer_in', 'transfer_out')
     group by 1
  ),
  series as (
    select b.start,
           coalesce(sum(d.sales), 0) as sales, coalesce(sum(d.returns), 0) as returns, coalesce(sum(d.revenue), 0) as revenue,
           coalesce(sum(d.sol), 0) as sol, coalesce(sum(d.other_income), 0) as other_income,
           coalesce(sum(d.cost), 0) as cost, coalesce(sum(d.expense), 0) as expense
      from buckets b
      left join daily d on d.day between p_from and p_to and date_trunc(v_bucket, d.day::timestamp)::date = b.start
     group by b.start
  ),
  expense_accounts as (
    select a.name_en, a.name_ur, sum(l.debit - l.credit) as amount
      from public.journal_entries e
      join public.journal_entry_lines l on l.journal_entry_id = e.id
      join accounts k on k.id = l.account_id and k.kind = 'expense'
      join public.chart_of_accounts a on a.id = l.account_id
     where v_expenses and e.status = 'posted' and e.entry_date between p_from and p_to
       and (v_financial or e.source_type = 'expense')
     group by a.id
    having sum(l.debit - l.credit) <> 0
  )
  select jsonb_strip_nulls(jsonb_build_object(
           'from', p_from, 'to', p_to, 'days', v_days, 'bucket', v_bucket,
           'sales_scope', case when v_sales_all then 'all' when v_sales_own then 'own' end,
           'expense_scope', case when v_financial then 'ledger' when v_expenses then 'documents' end,
           'current', (select obj from total_objects where is_current),
           'previous', (select obj from total_objects where not is_current),
           'sol_route_sales', case when v_sol and v_sales_all then private.money_text((
             select sum(i.subtotal) from public.sales_invoices i
              where i.status = 'posted' and i.sol_trip_id is not null and i.invoice_date between p_from and p_to)) end,
           'series', (
             select jsonb_agg(jsonb_build_object(
                      'start', greatest(s.start, p_from),
                      'sales', case when v_sales then private.money_text(s.sales - s.returns) end,
                      'expenses', case when v_expenses then private.money_text(s.expense) end,
                      'gross_profit', case when v_financial then private.money_text(s.revenue - s.cost) end,
                      'net_profit', case when v_financial then private.money_text(s.revenue + s.sol + s.other_income - s.cost - s.expense) end,
                      'stock_in', case when v_stock then coalesce(m.qty_in, 0)::text end,
                      'stock_out', case when v_stock then coalesce(m.qty_out, 0)::text end) order by s.start)
               from series s left join movements m on m.start = s.start),
           'expense_accounts', case when v_expenses then coalesce((
             select jsonb_agg(jsonb_build_object('name_en', x.name_en, 'name_ur', x.name_ur, 'amount', private.money_text(x.amount)) order by x.amount desc)
               from expense_accounts x), '[]'::jsonb) end))
    into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------

-- Posted invoices past their due date with a balance left after allocations and returns.
-- Invoices without a due date are never overdue.
create function public.dashboard_overdue(p_limit integer default 5) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today constant date := private.business_today();
  v_limit constant integer := least(greatest(coalesce(p_limit, 5), 0), 50);
  v_payables constant boolean := private.has_permission('payables.view');
  v_company constant boolean := private.has_permission('company.view');
  v_result jsonb := '{}'::jsonb;
begin
  perform private.require_permission('dashboard.view');

  if private.has_permission('receivables.view') then
    with open_invoices as (
      select i.doc_no, i.due_date, c.name as party, c.name_ur as party_ur,
             i.total_amount
               - coalesce((select sum(a.amount) from public.customer_payment_allocations a where a.sales_invoice_id = i.id), 0)
               - coalesce((select sum(r.total_amount) from public.customer_returns r where r.sales_invoice_id = i.id and r.status = 'posted'), 0) as outstanding
        from public.sales_invoices i
        join public.customers c on c.id = i.customer_id
       where i.status = 'posted' and i.due_date < v_today
    ), overdue as (select * from open_invoices where outstanding > 0)
    select v_result || jsonb_build_object('receivables', jsonb_build_object(
             'total', private.money_text(sum(outstanding)), 'count', count(*),
             'items', coalesce((select jsonb_agg(to_jsonb(t)) from (
               select doc_no, party, party_ur, due_date, v_today - due_date as days, private.money_text(outstanding) as outstanding
                 from overdue order by due_date, doc_no limit v_limit) t), '[]'::jsonb)))
      into v_result from overdue;
  end if;

  if v_payables or v_company then
    with open_invoices as (
      select i.doc_no, i.due_date, s.name as party, s.name_ur as party_ur,
             i.amount - coalesce((select sum(a.amount) from public.supplier_payment_allocations a where a.supplier_invoice_id = i.id), 0) as outstanding
        from public.supplier_invoices i
        join public.suppliers s on s.id = i.supplier_id
       where i.status = 'posted' and i.due_date < v_today
         and case when s.is_principal then v_company else v_payables end
    ), overdue as (select * from open_invoices where outstanding > 0)
    select v_result || jsonb_build_object('payables', jsonb_build_object(
             'total', private.money_text(sum(outstanding)), 'count', count(*),
             'items', coalesce((select jsonb_agg(to_jsonb(t)) from (
               select doc_no, party, party_ur, due_date, v_today - due_date as days, private.money_text(outstanding) as outstanding
                 from overdue order by due_date, doc_no limit v_limit) t), '[]'::jsonb)))
      into v_result from overdue;
  end if;
  return v_result;
end;
$$;

-- Active products at or below their reorder level. Available = on hand - reserved in every
-- warehouse except damaged goods. Products without a reorder level are not monitored.
create function public.dashboard_low_stock(p_limit integer default 8) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit constant integer := least(greatest(coalesce(p_limit, 8), 0), 50);
  v_result jsonb;
begin
  perform private.require_permission('inventory.view');
  with low as (
    select p.sku, p.name_en, p.name_ur, u.name_en as unit_en, u.name_ur as unit_ur,
           coalesce(s.available, 0) as available, p.reorder_level
      from public.products p
      join public.units u on u.id = p.base_unit_id
      left join (select sb.product_id, sum(sb.on_hand - sb.reserved) as available
                   from public.stock_balances sb
                   join public.warehouses w on w.id = sb.warehouse_id and w.warehouse_type <> 'damaged'
                  group by sb.product_id) s on s.product_id = p.id
     where p.is_active and p.reorder_level > 0 and coalesce(s.available, 0) <= p.reorder_level
  )
  select jsonb_build_object(
           'count', (select count(*) from low),
           'monitored', (select count(*) from public.products where is_active and reorder_level > 0),
           'items', coalesce((select jsonb_agg(to_jsonb(t)) from (
             select sku, name_en, name_ur, unit_en, unit_ur, available::text as available, reorder_level::text as reorder_level
               from low order by low.available::numeric / low.reorder_level, sku limit v_limit) t), '[]'::jsonb))
    into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lists (row level security applies)
-- ---------------------------------------------------------------------------
create function public.dashboard_recent_orders(p_limit integer default 6)
returns table (doc_no text, order_date date, status public.sales_order_status, total_amount numeric, customer text, customer_ur text)
language sql stable security invoker set search_path = '' as $$
  select o.doc_no, o.order_date, o.status, o.total_amount, c.name, c.name_ur
    from public.sales_orders o
    left join public.customers c on c.id = o.customer_id
   order by o.created_at desc
   limit least(greatest(coalesce(p_limit, 6), 0), 50);
$$;

create function public.dashboard_pending_deliveries(p_limit integer default 6)
returns table (doc_no text, delivery_date date, status public.delivery_status, order_no text, customer text, customer_ur text,
               vehicle text, total_count bigint)
language sql stable security invoker set search_path = '' as $$
  select d.doc_no, d.delivery_date, d.status, o.doc_no, c.name, c.name_ur, v.registration_no, count(*) over ()
    from public.deliveries d
    left join public.sales_orders o on o.id = d.sales_order_id
    left join public.customers c on c.id = o.customer_id
    left join public.vehicles v on v.id = d.vehicle_id
   where d.status in ('draft', 'dispatched')
   order by d.delivery_date, d.doc_no
   limit least(greatest(coalesce(p_limit, 6), 0), 50);
$$;

-- Latest posted documents of every kind the caller can see. The permission test in each
-- branch lets Postgres skip tables the caller cannot read at all.
create function public.dashboard_recent_transactions(p_limit integer default 8)
returns table (kind text, doc_no text, txn_date date, amount numeric, party text, party_ur text, posted_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select t.* from (
    (select 'sales_invoice'::text as kind, i.doc_no, i.invoice_date, i.total_amount, c.name, c.name_ur, i.posted_at
       from public.sales_invoices i left join public.customers c on c.id = i.customer_id
      where i.status = 'posted' and (select private.has_permission('sales.view'))
      order by i.posted_at desc, i.doc_no desc limit 20)
    union all
    (select 'customer_return', r.doc_no, r.return_date, r.total_amount, c.name, c.name_ur, r.posted_at
       from public.customer_returns r left join public.customers c on c.id = r.customer_id
      where r.status = 'posted' and (select private.has_permission('sales.view'))
      order by r.posted_at desc, r.doc_no desc limit 20)
    union all
    (select 'customer_payment', p.doc_no, p.payment_date, p.amount, c.name, c.name_ur, p.posted_at
       from public.customer_payments p left join public.customers c on c.id = p.customer_id
      where p.status = 'posted'
        and ((select private.has_permission('receivables.view')) or (select private.has_permission('receivables.collect')))
      order by p.posted_at desc, p.doc_no desc limit 20)
    union all
    (select 'goods_receipt', g.doc_no, g.receipt_date, g.total_amount, s.name, s.name_ur, g.posted_at
       from public.goods_receipts g left join public.suppliers s on s.id = g.supplier_id
      where g.status = 'posted' and (select private.has_permission('purchasing.view'))
      order by g.posted_at desc, g.doc_no desc limit 20)
    union all
    (select 'supplier_payment', p.doc_no, p.payment_date, p.amount, s.name, s.name_ur, p.posted_at
       from public.supplier_payments p left join public.suppliers s on s.id = p.supplier_id
      where p.status = 'posted'
        and ((select private.has_permission('payables.view')) or (select private.has_permission('company.view')))
      order by p.posted_at desc, p.doc_no desc limit 20)
    union all
    (select 'expense', x.doc_no, x.expense_date, x.amount, ec.name_en, ec.name_ur, x.posted_at
       from public.expenses x left join public.expense_categories ec on ec.id = x.category_id
      where x.status = 'posted' and (select private.has_permission('expenses.view'))
      order by x.posted_at desc, x.doc_no desc limit 20)
    union all
    (select 'fund_transfer', f.doc_no, f.transfer_date, f.amount, null::text, null::text, f.updated_at
       from public.fund_transfers f
      where f.status = 'posted' and (select private.has_permission('cash_bank.view'))
      order by f.updated_at desc, f.doc_no desc limit 20)
  ) t(kind, doc_no, txn_date, amount, party, party_ur, posted_at)
  order by t.posted_at desc, t.txn_date desc, t.doc_no desc
  limit least(greatest(coalesce(p_limit, 8), 0), 20);
$$;

-- The caller's own latest documents, in any status.
create function public.dashboard_my_records(p_limit integer default 8)
returns table (kind text, doc_no text, status text, record_date date, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select t.* from (
    (select 'sales_order'::text, o.doc_no, o.status::text, o.order_date, o.created_at
       from public.sales_orders o where o.created_by = (select auth.uid()) order by o.created_at desc limit 20)
    union all
    (select 'purchase_order', o.doc_no, o.status::text, o.order_date, o.created_at
       from public.purchase_orders o where o.created_by = (select auth.uid()) order by o.created_at desc limit 20)
    union all
    (select 'goods_receipt', g.doc_no, g.status::text, g.receipt_date, g.created_at
       from public.goods_receipts g where g.created_by = (select auth.uid()) order by g.created_at desc limit 20)
    union all
    (select 'customer_payment', p.doc_no, p.status::text, p.payment_date, p.created_at
       from public.customer_payments p where p.created_by = (select auth.uid()) order by p.created_at desc limit 20)
    union all
    (select 'expense', x.doc_no, x.status::text, x.expense_date, x.created_at
       from public.expenses x where x.created_by = (select auth.uid()) order by x.created_at desc limit 20)
    union all
    (select 'stock_count', k.doc_no, k.status::text, k.count_date, k.created_at
       from public.stock_counts k where k.created_by = (select auth.uid()) order by k.created_at desc limit 20)
    union all
    (select 'stock_transfer', k.doc_no, k.status::text, k.transfer_date, k.created_at
       from public.stock_transfers k where k.created_by = (select auth.uid()) order by k.created_at desc limit 20)
  ) t(kind, doc_no, status, record_date, created_at)
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 8), 0), 20);
$$;

-- Work waiting on the caller: their own unfinished drafts, documents they may approve or
-- post, and deliveries assigned to them as driver.
create function public.dashboard_open_work()
returns table (scope text, kind text, waiting bigint)
language sql stable security invoker set search_path = '' as $$
  select t.* from (
    select 'mine'::text, 'sales_order'::text, count(*) from public.sales_orders where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'purchase_order', count(*) from public.purchase_orders where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'goods_receipt', count(*) from public.goods_receipts where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'customer_payment', count(*) from public.customer_payments where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'expense', count(*) from public.expenses where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'stock_count', count(*) from public.stock_counts where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'stock_transfer', count(*) from public.stock_transfers where status = 'draft' and created_by = (select auth.uid())
    union all select 'review', 'sales_order', count(*) from public.sales_orders
               where status = 'submitted' and (select private.has_permission('sales.approve'))
    union all select 'review', 'purchase_order', count(*) from public.purchase_orders
               where status = 'draft' and (select private.has_permission('purchasing.approve'))
    union all select 'review', 'goods_receipt', count(*) from public.goods_receipts
               where status = 'draft' and (select private.has_permission('purchasing.post'))
    union all select 'review', 'supplier_invoice', count(*) from public.supplier_invoices
               where status = 'draft' and (select private.has_permission('purchasing.post'))
    union all select 'review', 'customer_payment', count(*) from public.customer_payments
               where status = 'draft' and (select private.has_permission('receivables.post'))
    union all select 'review', 'supplier_payment', count(*) from public.supplier_payments
               where status = 'draft' and ((select private.has_permission('payables.pay')) or (select private.has_permission('company.pay')))
    union all select 'review', 'expense', count(*) from public.expenses
               where status = 'draft' and (select private.has_permission('expenses.post'))
    union all select 'review', 'stock_count', count(*) from public.stock_counts
               where status = 'draft' and (select private.has_permission('inventory.adjust'))
    union all select 'review', 'dispatch', count(*) from public.sales_orders
               where status in ('approved', 'partially_dispatched') and (select private.has_permission('sales.dispatch'))
    union all select 'assigned', 'delivery', count(*) from public.deliveries
               where status in ('draft', 'dispatched') and driver_id = (select private.current_driver_id())
  ) t(scope, kind, waiting)
  where t.waiting > 0;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  private.business_today(), private.money_text(numeric), private.cost_of_sales_accounts(),
  public.dashboard_position(), public.dashboard_performance(date, date), public.dashboard_overdue(integer),
  public.dashboard_low_stock(integer), public.dashboard_recent_orders(integer), public.dashboard_pending_deliveries(integer),
  public.dashboard_recent_transactions(integer), public.dashboard_my_records(integer), public.dashboard_open_work()
from public, anon, authenticated;

grant execute on function
  public.dashboard_position(), public.dashboard_performance(date, date), public.dashboard_overdue(integer),
  public.dashboard_low_stock(integer), public.dashboard_recent_orders(integer), public.dashboard_pending_deliveries(integer),
  public.dashboard_recent_transactions(integer), public.dashboard_my_records(integer), public.dashboard_open_work()
to authenticated;

-- ---------------------------------------------------------------------------
-- Indexes for the queries above
-- ---------------------------------------------------------------------------
-- Balances: totals per account without visiting the table.
create index jel_account_totals_idx on public.journal_entry_lines (account_id) include (journal_entry_id, debit, credit);
drop index public.jel_account_idx;
create index sales_invoices_posted_date_idx on public.sales_invoices (invoice_date) where status = 'posted';
create index goods_receipts_posted_date_idx on public.goods_receipts (receipt_date) where status = 'posted';
create index stock_movements_date_idx on public.stock_movements (movement_date);
create index sales_invoices_due_idx on public.sales_invoices (due_date) where status = 'posted' and due_date is not null;
create index supplier_invoices_due_idx on public.supplier_invoices (due_date) where status = 'posted' and due_date is not null;
create index sol_jobs_completed_idx on public.sol_jobs (id) where status = 'completed';
create index deliveries_pending_idx on public.deliveries (delivery_date) where status in ('draft', 'dispatched');
create index sales_orders_created_idx on public.sales_orders (created_at desc);

-- Latest posted documents.
create index sales_invoices_posted_at_idx on public.sales_invoices (posted_at desc) where status = 'posted';
create index customer_returns_posted_at_idx on public.customer_returns (posted_at desc) where status = 'posted';
create index customer_payments_posted_at_idx on public.customer_payments (posted_at desc) where status = 'posted';
create index goods_receipts_posted_at_idx on public.goods_receipts (posted_at desc) where status = 'posted';
create index supplier_payments_posted_at_idx on public.supplier_payments (posted_at desc) where status = 'posted';
create index expenses_posted_at_idx on public.expenses (posted_at desc) where status = 'posted';

-- Own records and drafts.
create index sales_orders_creator_idx on public.sales_orders (created_by, created_at desc);
create index purchase_orders_creator_idx on public.purchase_orders (created_by, created_at desc);
create index goods_receipts_creator_idx on public.goods_receipts (created_by, created_at desc);
create index customer_payments_creator_idx on public.customer_payments (created_by, created_at desc);
create index expenses_creator_idx on public.expenses (created_by, created_at desc);
create index stock_counts_creator_idx on public.stock_counts (created_by, created_at desc);
create index stock_transfers_creator_idx on public.stock_transfers (created_by, created_at desc);
create index goods_receipts_draft_idx on public.goods_receipts (id) where status = 'draft';
create index supplier_invoices_draft_idx on public.supplier_invoices (id) where status = 'draft';
create index customer_payments_draft_idx on public.customer_payments (id) where status = 'draft';
create index supplier_payments_draft_idx on public.supplier_payments (id) where status = 'draft';
create index expenses_draft_idx on public.expenses (id) where status = 'draft';
