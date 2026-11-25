-- Phase 11: reports and analytics. Figures come from posted journal lines wherever the ledger has them, so they reconcile in every period.

insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261130100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;
insert into public.permissions (code, module, description_en, description_ur) values
  ('cash_bank.reconcile', 'cash_bank', 'Reconcile bank accounts with their statements', 'بینک اکاؤنٹس کو اسٹیٹمنٹ سے ملائیں'),
  ('reports.export', 'reports', 'Export reports as PDF, Excel and CSV', 'رپورٹس پی ڈی ایف، ایکسل اور سی ایس وی میں برآمد کریں');
insert into public.role_permissions (role_id, permission_code)
select r.id, 'cash_bank.reconcile' from public.roles r where r.code in ('manager', 'accountant')
on conflict do nothing;
-- Whoever had a page with an export until now keeps it; exporting can be taken away separately.
insert into public.role_permissions (role_id, permission_code)
select distinct rp.role_id, 'reports.export' from public.role_permissions rp
 where rp.permission_code in ('reports.view', 'reports.financial', 'accounting.view', 'cash_bank.view', 'receivables.view', 'receivables.collect', 'payables.view', 'company.view', 'payroll.view')
on conflict do nothing;

-- ===========================================================================
-- 1. The ledger side of every reconciliation
-- ===========================================================================
-- Credits less debits of some accounts in a period (p_from NULL: since the beginning), of some kinds of document (NULL: all).
-- An account is named by its system key; 'type:expense' stands for every account of a type.
create function public.ledger_total(p_keys text[], p_from date, p_to date, p_sources text[] default null) returns numeric
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('reports.financial');
  return (select coalesce(sum(l.credit - l.debit), 0)::numeric(18,2)
            from public.journal_entry_lines l
            join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
            join public.chart_of_accounts a on a.id = l.account_id and (a.system_key = any (p_keys) or 'type:' || a.account_type::text = any (p_keys))
           where (p_from is null or e.entry_date >= p_from) and e.entry_date <= p_to and (p_sources is null or e.source_type = any (p_sources)));
end;
$$;

-- Called before a report is exported: the permission is checked here too, and the export is written to the audit log.
create function public.record_report_export(p_report text, p_format text, p_filters jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('reports.export');
  if p_format not in ('pdf', 'xlsx', 'csv') then raise exception 'Unknown format' using errcode = '22023'; end if;
  insert into public.audit_logs (user_id, table_name, record_id, action, new_data)
  values (auth.uid(), 'report_exports', left(p_report, 60), 'INSERT', jsonb_build_object('format', p_format, 'filters', p_filters));
end;
$$;

-- Exports are part of the access history.
create or replace view public.v_access_audit with (security_invoker = true) as
select a.id, a.occurred_at, a.user_id as actor_id, p.full_name as actor_name,
       a.table_name, a.record_id, a.action, a.old_data, a.new_data
  from public.audit_logs a
  left join public.profiles p on p.id = a.user_id
 where a.table_name in ('profiles', 'roles', 'role_permissions', 'report_exports');

-- ===========================================================================
-- 2. Sales. Notes and collections are read from the ledger: a note voided in a later month is undone in that month.
-- ===========================================================================
create function private.note_lines(p_from date, p_to date)
returns table (entry_date date, customer_id uuid, order_taker_id uuid, credit_note numeric, debit_note numeric)
language sql stable security definer set search_path = '' as $$
  select e.entry_date, n.customer_id, i.order_taker_id,
         case when n.kind::text = 'credit' then l.debit - l.credit else 0 end, case when n.kind::text = 'debit' then l.credit - l.debit else 0 end
    from public.journal_entries e
    join public.journal_entry_lines l on l.journal_entry_id = e.id
    join public.chart_of_accounts a on a.id = l.account_id and a.system_key in ('SALES', 'SALES_RETURNS')
    join public.customer_notes n on n.id = e.source_id
    left join public.sales_invoices i on i.id = n.sales_invoice_id
   where e.status = 'posted' and e.source_type = 'customer_note' and e.entry_date between p_from and p_to;
$$;
create function private.collection_lines(p_from date, p_to date)
returns table (entry_date date, customer_id uuid, collected_by uuid, amount numeric)
language sql stable security definer set search_path = '' as $$
  select e.entry_date, p.customer_id, p.collected_by, l.credit - l.debit
    from public.journal_entries e
    join public.journal_entry_lines l on l.journal_entry_id = e.id
    join public.chart_of_accounts a on a.id = l.account_id and a.system_key = 'AR'
    join public.customer_payments p on p.id = e.source_id
   where e.status = 'posted' and e.source_type = 'customer_payment' and e.entry_date between p_from and p_to;
$$;

create or replace function public.report_sales(p_from date, p_to date, p_bucket text default 'day')
returns table (period date, invoices bigint, gross numeric, discounts numeric, net numeric, tax numeric, returns numeric,
               credit_notes numeric, debit_notes numeric, net_sales numeric, collected numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
  v_bucket constant text := case when p_bucket = 'month' then 'month' else 'day' end;
  v_collections constant boolean := private.has_permission('receivables.view') or private.has_permission('receivables.post') or private.has_permission('receivables.collect');
begin
  return query
  with facts as (
    select i.invoice_date as d, 1 as n, t.gross, t.disc, t.net, t.tax, 0::numeric as ret, 0::numeric as cn, 0::numeric as dn, 0::numeric as col
      from public.sales_invoices i
      join (select it.sales_invoice_id, sum(it.quantity * it.unit_price) as gross, sum(it.discount_amount) as disc, sum(it.line_net) as net, sum(it.tax_amount) as tax
              from public.sales_invoice_items it group by it.sales_invoice_id) t on t.sales_invoice_id = i.id
     where i.status = 'posted' and i.invoice_date between p_from and p_to and (v_own is null or i.order_taker_id = v_own)
    union all
    select r.return_date, 0, 0, 0, 0, 0, r.subtotal, 0, 0, 0
      from public.customer_returns r
      left join public.sales_invoices i on i.id = r.sales_invoice_id
     where r.status = 'posted' and r.return_date between p_from and p_to and (v_own is null or i.order_taker_id = v_own)
    union all
    select n.entry_date, 0, 0, 0, 0, 0, 0, n.credit_note, n.debit_note, 0
      from private.note_lines(p_from, p_to) n where v_own is null or n.order_taker_id = v_own
    union all
    select c.entry_date, 0, 0, 0, 0, 0, 0, 0, 0, c.amount
      from private.collection_lines(p_from, p_to) c where v_collections and (v_own is null or c.collected_by = v_own)
  )
  select date_trunc(v_bucket, f.d)::date, sum(f.n)::bigint, sum(f.gross), sum(f.disc), sum(f.net), sum(f.tax), sum(f.ret), sum(f.cn), sum(f.dn),
         sum(f.net) - sum(f.ret) - sum(f.cn) + sum(f.dn), case when v_collections then sum(f.col) end
    from facts f
   group by 1
   order by 1 desc;
end;
$$;

create or replace function public.report_sales_by_customer(p_from date, p_to date, p_order_taker_id uuid default null)
returns table (customer_id uuid, code text, name text, name_ur text, city text, taker_en text, taker_ur text, orders bigint, invoices bigint,
               net numeric, tax numeric, returns numeric, notes numeric, net_sales numeric, collected numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
  v_receivables constant boolean := private.has_permission('receivables.view');
begin
  return query
  select c.id, c.code, c.name, c.name_ur, c.city, e.full_name, e.full_name_ur, coalesce(o.n, 0)::bigint, coalesce(i.n, 0)::bigint,
         coalesce(i.net, 0), coalesce(i.tax, 0), coalesce(r.net, 0), coalesce(nt.net, 0), coalesce(i.net, 0) - coalesce(r.net, 0) + coalesce(nt.net, 0),
         case when v_receivables then coalesce(p.paid, 0) end, case when v_receivables then private.customer_balance(c.id) end
    from public.customers c
    left join public.employees e on e.id = c.order_taker_id
    left join (select so.customer_id, count(*) as n from public.sales_orders so
                where so.order_date between p_from and p_to and so.status::text not in ('draft', 'cancelled') and (v_own is null or so.order_taker_id = v_own)
                group by so.customer_id) o on o.customer_id = c.id
    left join (select si.customer_id, count(*) as n, sum(si.subtotal) as net, sum(si.tax_total) as tax from public.sales_invoices si
                where si.status = 'posted' and si.invoice_date between p_from and p_to and (v_own is null or si.order_taker_id = v_own)
                group by si.customer_id) i on i.customer_id = c.id
    left join (select cr.customer_id, sum(cr.subtotal) as net from public.customer_returns cr
                 left join public.sales_invoices si on si.id = cr.sales_invoice_id
                where cr.status = 'posted' and cr.return_date between p_from and p_to and (v_own is null or si.order_taker_id = v_own)
                group by cr.customer_id) r on r.customer_id = c.id
    left join (select n.customer_id, sum(n.debit_note - n.credit_note) as net from private.note_lines(p_from, p_to) n
                where v_own is null or n.order_taker_id = v_own group by n.customer_id) nt on nt.customer_id = c.id
    left join (select cl.customer_id, sum(cl.amount) as paid from private.collection_lines(p_from, p_to) cl group by cl.customer_id) p on p.customer_id = c.id
   where (p_order_taker_id is null or c.order_taker_id = p_order_taker_id)
     and (v_own is null or c.order_taker_id = v_own or i.n is not null or o.n is not null)
     and (o.n is not null or i.n is not null or r.net is not null or nt.net is not null or (v_receivables and p.paid is not null))
   order by coalesce(i.net, 0) - coalesce(r.net, 0) + coalesce(nt.net, 0) desc, c.name;
end;
$$;

-- Sales of the customers of a territory (of the order taker assigned to them), a city or an area.
create function public.report_territories(p_from date, p_to date, p_by text default 'territory')
returns table (territory text, customers bigint, buyers bigint, orders bigint, invoices bigint, net_sales numeric, collected numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
  v_receivables constant boolean := private.has_permission('receivables.view');
begin
  return query
  with who as (
    select c.id, c.is_active, nullif(trim(case p_by when 'city' then c.city when 'area' then c.area else ot.territory end), '') as place
      from public.customers c left join public.order_takers ot on ot.employee_id = c.order_taker_id
     where v_own is null or c.order_taker_id = v_own
  ), sold as (select s.customer_id, s.orders, s.invoices, s.net_sales, s.collected from public.report_sales_by_customer(p_from, p_to) s)
  select w.place, count(*) filter (where w.is_active), count(*) filter (where s.invoices > 0), coalesce(sum(s.orders), 0)::bigint, coalesce(sum(s.invoices), 0)::bigint,
         coalesce(sum(s.net_sales), 0), case when v_receivables then coalesce(sum(s.collected), 0) end, case when v_receivables then coalesce(sum(private.customer_balance(w.id)), 0) end
    from who w left join sold s on s.customer_id = w.id
   group by w.place
   order by coalesce(sum(s.net_sales), 0) desc, w.place nulls last;
end;
$$;

-- Collections as the ledger has them: a voided payment is undone on the day it was voided.
drop function public.report_collections(date, date, uuid, text);
create function public.report_collections(p_from date, p_to date, p_collector_id uuid default null, p_method text default null)
returns table (entry_id uuid, payment_id uuid, doc_no text, payment_date date, customer_id uuid, customer text, customer_ur text, method public.payment_method, reference text,
               collector_en text, collector_ur text, destination text, held boolean, is_reversal boolean, amount numeric, settled numeric, on_account numeric, invoices text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid;
begin
  if not (private.has_permission('receivables.post') or (private.has_permission('receivables.view') and private.has_permission('sales.view_all'))) then
    perform private.require_permission('receivables.collect');
    v_own := coalesce(private.current_employee_id(), '00000000-0000-0000-0000-000000000000');
  end if;
  return query
  select je.id, p.id, p.doc_no, je.entry_date, c.id, c.name, c.name_ur, p.method, p.reference, e.full_name, e.full_name_ur, fa.name,
         p.financial_account_id is null, je.reversal_of is not null, l.amount, case when p.status = 'posted' then coalesce(a.settled, 0) else 0 end,
         l.amount - case when p.status = 'posted' then coalesce(a.settled, 0) else 0 end, case when p.status = 'posted' then a.invoices end
    from public.journal_entries je
    join public.customer_payments p on p.id = je.source_id
    join public.customers c on c.id = p.customer_id
    join lateral (select sum(x.credit - x.debit) as amount from public.journal_entry_lines x where x.journal_entry_id = je.id and x.account_id = private.account_id('AR')) l on l.amount is not null
    left join public.employees e on e.id = p.collected_by
    left join public.financial_accounts fa on fa.id = p.financial_account_id
    left join (select pa.customer_payment_id, sum(pa.amount) as settled, string_agg(coalesce(i.doc_no, j.doc_no), ', ' order by coalesce(i.doc_no, j.doc_no)) as invoices
                 from public.customer_payment_allocations pa
                 left join public.sales_invoices i on i.id = pa.sales_invoice_id
                 left join public.sol_jobs j on j.id = pa.sol_job_id
                group by pa.customer_payment_id) a on a.customer_payment_id = p.id
   where je.status = 'posted' and je.source_type = 'customer_payment' and je.entry_date between p_from and p_to
     and (v_own is null or p.collected_by = v_own)
     and (p_collector_id is null or p.collected_by = p_collector_id)
     and (p_method is null or p.method::text = p_method)
   order by je.entry_date desc, p.doc_no desc, je.doc_no desc;
end;
$$;

-- ===========================================================================
-- 3. Inventory
-- ===========================================================================
-- How fast each product leaves: sold and issued to SOL jobs, less what came back, from the stock movements.
create function public.report_product_movement(p_from date, p_to date, p_category_id uuid default null)
returns table (product_id uuid, sku text, name_en text, name_ur text, unit_en text, unit_ur text, category_en text, category_ur text,
               quantity_out bigint, per_day numeric, net_sales numeric, on_hand bigint, days_of_cover numeric, stock_value numeric, last_out date)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_costs constant boolean := private.has_permission('costs.view');
  v_days constant integer := p_to - p_from + 1;
begin
  perform private.require_permission('inventory.view');
  if p_to < p_from then raise exception 'The dates are in the wrong order' using errcode = '22023'; end if;
  return query
  with moved as (
    select m.product_id, sum(-m.quantity) filter (where m.movement_date between p_from and p_to) as q,
           max(m.movement_date) filter (where m.movement_type::text in ('sale', 'sol_issue') and m.movement_date <= p_to) as last_out
      from public.stock_movements m
     where m.movement_type::text in ('sale', 'sales_return', 'sol_issue', 'sol_return') group by m.product_id
  ), sold as (
    select x.product_id, sum(x.net) as net
      from (select it.product_id, it.line_net as net from public.sales_invoice_items it join public.sales_invoices i on i.id = it.sales_invoice_id and i.status = 'posted' where i.invoice_date between p_from and p_to
            union all
            select ri.product_id, -ri.line_net from public.customer_return_items ri join public.customer_returns r on r.id = ri.customer_return_id and r.status = 'posted' where r.return_date between p_from and p_to) x
     group by x.product_id
  ), held as (select sb.product_id, sum(sb.on_hand) as n from public.stock_balances sb group by sb.product_id)
  select p.id, p.sku, p.name_en, p.name_ur, u.name_en, u.name_ur, c.name_en, c.name_ur, coalesce(m.q, 0)::bigint, round(coalesce(m.q, 0)::numeric / v_days, 2), coalesce(s.net, 0)::numeric(18,2),
         coalesce(h.n, 0)::bigint, case when coalesce(m.q, 0) > 0 then round(greatest(coalesce(h.n, 0), 0)::numeric * v_days / m.q, 1) end,
         case when v_costs then coalesce(iv.total_value, 0) end, m.last_out
    from public.products p
    join public.units u on u.id = p.base_unit_id
    left join public.product_categories c on c.id = p.category_id
    left join moved m on m.product_id = p.id
    left join sold s on s.product_id = p.id
    left join held h on h.product_id = p.id
    left join public.inventory_valuation iv on iv.product_id = p.id
   where (p_category_id is null or p.category_id = p_category_id) and (coalesce(m.q, 0) <> 0 or coalesce(h.n, 0) <> 0)
   order by coalesce(m.q, 0) desc, p.name_en;
end;
$$;

-- ===========================================================================
-- 4. Suppliers and the main company
-- ===========================================================================
-- Which suppliers a caller may see the account of.
create function private.payable_scope(p_principal boolean) returns table (supplier_id uuid)
language sql stable security definer set search_path = '' as $$
  select s.id from public.suppliers s
   where (p_principal is null or s.is_principal = p_principal)
     and case when s.is_principal then private.has_permission('company.view') else private.has_permission('payables.view') end;
$$;

-- Payments as the ledger has them: a voided payment is undone on the day it was voided.
create function public.report_supplier_payments(p_from date, p_to date, p_supplier_id uuid default null, p_principal boolean default null)
returns table (entry_id uuid, entry_date date, doc_no text, supplier_id uuid, supplier text, supplier_ur text, is_principal boolean, method public.payment_method, reference text, account text,
               is_reversal boolean, amount numeric, settled numeric, on_account numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission('payables.view') then perform private.require_permission('company.view'); end if;
  return query
  select e.id, e.entry_date, p.doc_no, s.id, s.name, s.name_ur, s.is_principal, p.method, p.reference, fa.name, e.reversal_of is not null, l.debit - l.credit,
         case when p.status = 'posted' then coalesce(x.settled, 0) else 0 end, l.debit - l.credit - case when p.status = 'posted' then coalesce(x.settled, 0) else 0 end
    from public.journal_entries e
    join public.journal_entry_lines l on l.journal_entry_id = e.id and l.supplier_id is not null
    join public.supplier_payments p on p.id = e.source_id
    join public.suppliers s on s.id = p.supplier_id
    left join public.financial_accounts fa on fa.id = p.financial_account_id
    left join (select a.supplier_payment_id, sum(a.amount) as settled from public.supplier_payment_allocations a group by 1) x on x.supplier_payment_id = p.id
   where e.status = 'posted' and e.source_type = 'supplier_payment' and e.entry_date between p_from and p_to
     and s.id in (select supplier_id from private.payable_scope(p_principal)) and (p_supplier_id is null or s.id = p_supplier_id)
   order by e.entry_date desc, e.doc_no desc;
end;
$$;

-- What is owed to every supplier, by age of the goods: payments and returns settle the oldest first. Agrees with the ledger on any date.
create function public.report_payables_aging(p_as_of date, p_principal boolean default null)
returns table (supplier_id uuid, code text, name text, name_ur text, is_principal boolean, phone text, balance numeric, days_30 numeric, days_60 numeric, days_90 numeric, older numeric,
               advance numeric, overdue numeric, last_payment date)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission('payables.view') then perform private.require_permission('company.view'); end if;
  return query
  with lines as (
    select l.supplier_id as sid, e.entry_date as d, e.doc_no, l.line_no, l.debit, l.credit
      from public.journal_entry_lines l
      join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date <= p_as_of
      join public.chart_of_accounts a on a.id = l.account_id and a.system_key in ('AP_PRINCIPAL', 'AP_SUPPLIERS')
      left join public.journal_entries rv on rv.id = e.reversed_by
     where l.supplier_id in (select supplier_id from private.payable_scope(p_principal)) and e.reversal_of is null and (rv.id is null or rv.entry_date > p_as_of)
  ), totals as (select sid, sum(credit - debit) as balance, sum(debit) as debits from lines group by sid
  ), owed as (
    select x.sid, x.d, greatest(0, least(x.credit, sum(x.credit) over (partition by x.sid order by x.d, x.doc_no, x.line_no) - t.debits)) as open
      from lines x join totals t on t.sid = x.sid where x.credit > 0
  ), ages as (
    select sid, sum(open) filter (where p_as_of - d <= 30) as a, sum(open) filter (where p_as_of - d between 31 and 60) as b,
           sum(open) filter (where p_as_of - d between 61 and 90) as c, sum(open) filter (where p_as_of - d > 90) as o
      from owed group by sid
  )
  select s.id, s.code, s.name, s.name_ur, s.is_principal, s.phone, t.balance, coalesce(g.a, 0), coalesce(g.b, 0), coalesce(g.c, 0), coalesce(g.o, 0), greatest(-t.balance, 0),
         coalesce((select sum(greatest(b.amount - coalesce((select sum(pa.amount) from public.supplier_payment_allocations pa where pa.supplier_invoice_id = b.id), 0), 0))
                     from public.supplier_invoices b where b.supplier_id = s.id and b.status = 'posted' and b.due_date < p_as_of), 0),
         (select max(p.payment_date) from public.supplier_payments p where p.supplier_id = s.id and p.status = 'posted' and p.payment_date <= p_as_of)
    from totals t join public.suppliers s on s.id = t.sid left join ages g on g.sid = t.sid
   where t.balance <> 0
   order by t.balance desc, s.name;
end;
$$;

-- Every line of goods received.
create function public.report_purchase_lines(p_from date, p_to date, p_supplier_id uuid default null, p_principal boolean default null, p_product_id uuid default null)
returns table (line_id uuid, receipt_id uuid, doc_no text, receipt_date date, supplier text, supplier_ur text, is_principal boolean, order_no text, product_id uuid, sku text, name_en text, name_ur text,
               unit_en text, unit_ur text, accepted bigint, damaged bigint, rejected bigint, unit_cost numeric, total numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('purchasing.view');
  return query
  select i.id, g.id, g.doc_no, g.receipt_date, s.name, s.name_ur, s.is_principal, po.doc_no, p.id, p.sku, p.name_en, p.name_ur, u.name_en, u.name_ur,
         i.quantity, i.damaged_quantity, i.rejected_quantity, i.unit_cost, i.line_total
    from public.goods_receipt_items i
    join public.goods_receipts g on g.id = i.goods_receipt_id and g.status = 'posted'
    join public.suppliers s on s.id = g.supplier_id
    join public.products p on p.id = i.product_id
    join public.units u on u.id = i.unit_id
    left join public.purchase_orders po on po.id = g.purchase_order_id
   where g.receipt_date between p_from and p_to and (p_supplier_id is null or s.id = p_supplier_id) and (p_principal is null or s.is_principal = p_principal)
     and (p_product_id is null or p.id = p_product_id)
   order by g.receipt_date desc, g.doc_no desc, p.name_en;
end;
$$;

-- How well suppliers deliver what was ordered in the period. Late: not everything arrived by the expected date.
create function public.report_supplier_delivery(p_from date, p_to date, p_principal boolean default null)
returns table (supplier_id uuid, code text, name text, name_ur text, is_principal boolean, orders bigint, completed bigint, dated_orders bigint, on_time bigint, late bigint, days_late numeric, lead_days numeric,
               ordered bigint, accepted bigint, damaged bigint, rejected bigint, fill_percent numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_today constant date := private.business_today();
begin
  perform private.require_permission('purchasing.view');
  return query
  with po as (
    select o.id, o.supplier_id, o.order_date, o.expected_date, o.status::text as status, o.closed_at is not null as short, q.ordered, r.first_date, r.last_date,
           coalesce(r.accepted, 0) as accepted, coalesce(r.damaged, 0) as damaged, coalesce(r.rejected, 0) as rejected
      from public.purchase_orders o
      join (select i.purchase_order_id, sum(i.base_quantity) as ordered from public.purchase_order_items i group by 1) q on q.purchase_order_id = o.id
      left join (select g.purchase_order_id, min(g.receipt_date) as first_date, max(g.receipt_date) as last_date, sum(gi.base_quantity) as accepted,
                        sum(gi.damaged_quantity * gi.factor) as damaged, sum(gi.rejected_quantity * gi.factor) as rejected
                   from public.goods_receipts g join public.goods_receipt_items gi on gi.goods_receipt_id = g.id
                  where g.status = 'posted' and g.purchase_order_id is not null group by 1) r on r.purchase_order_id = o.id
     where o.status::text in ('approved', 'partially_received', 'received') and o.order_date between p_from and p_to
  ), judged as (
    select po.*, case when expected_date is null then null when status = 'received' and not short then last_date <= expected_date when short or expected_date < v_today then false end as punctual,
           case when status = 'received' then last_date else v_today end as until_date
      from po
  )
  select s.id, s.code, s.name, s.name_ur, s.is_principal, count(*), count(*) filter (where j.status = 'received'), count(j.punctual), count(*) filter (where j.punctual), count(*) filter (where not j.punctual),
         round(avg(greatest(j.until_date - j.expected_date, 0)) filter (where not j.punctual), 1), round(avg(j.first_date - j.order_date), 1),
         sum(j.ordered)::bigint, sum(j.accepted)::bigint, sum(j.damaged)::bigint, sum(j.rejected)::bigint, round(sum(j.accepted) * 100.0 / nullif(sum(j.ordered), 0), 1)
    from judged j join public.suppliers s on s.id = j.supplier_id
   where p_principal is null or s.is_principal = p_principal
   group by s.id order by s.is_principal desc, s.name;
end;
$$;

-- The account of the main company, month by month, from the ledger.
create function public.report_company(p_from date, p_to date)
returns table (month date, opening numeric, goods numeric, receipts bigint, adjustments numeric, returns numeric, payments numeric, other numeric, closing numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('company.view');
  return query
  with lines as (
    select e.entry_date as d, e.source_type as k, e.reversal_of, l.credit - l.debit as v
      from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date <= p_to
     where l.account_id = private.account_id('AP_PRINCIPAL')
  ), months as (select generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month')::date as m
  ), spans as (select m, greatest(m, p_from) as a, least((m + interval '1 month - 1 day')::date, p_to) as b from months)
  select s.m, coalesce(sum(l.v) filter (where l.d < s.a), 0), coalesce(sum(l.v) filter (where l.d >= s.a and l.k = 'goods_receipt'), 0),
         count(*) filter (where l.d >= s.a and l.k = 'goods_receipt' and l.reversal_of is null),
         coalesce(sum(l.v) filter (where l.d >= s.a and l.k = 'supplier_invoice'), 0), coalesce(-sum(l.v) filter (where l.d >= s.a and l.k = 'supplier_return'), 0),
         coalesce(-sum(l.v) filter (where l.d >= s.a and l.k = 'supplier_payment'), 0),
         coalesce(sum(l.v) filter (where l.d >= s.a and l.k not in ('goods_receipt', 'supplier_invoice', 'supplier_return', 'supplier_payment')), 0), coalesce(sum(l.v), 0)
    from spans s left join lines l on l.d <= s.b
   group by s.m, s.a, s.b order by s.m;
end;
$$;

-- ===========================================================================
-- 5. SOL
-- ===========================================================================
-- Money received for SOL jobs, from the ledger. A payment that also settled invoices counts with its SOL part.
create function public.report_sol_payments(p_from date, p_to date)
returns table (entry_id uuid, entry_date date, payment_id uuid, doc_no text, customer text, customer_ur text, jobs text, method public.payment_method, reference text, is_reversal boolean, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('sol.view');
  if not (private.has_permission('sol.view_all') and private.sees_settlements()) then perform private.require_permission('receivables.view'); end if;
  return query
  select e.id, e.entry_date, p.id, p.doc_no, c.name, c.name_ur, coalesce(x.jobs, oj.doc_no), p.method, p.reference, e.reversal_of is not null,
         case when e.reversal_of is null then 1 else -1 end * case when p.sol_job_id is not null then p.amount else x.part end
    from public.journal_entries e
    join public.customer_payments p on p.id = e.source_id
    join public.customers c on c.id = p.customer_id
    left join public.sol_jobs oj on oj.id = p.sol_job_id
    left join lateral (select sum(a.amount) as part, string_agg(distinct j.doc_no, ', ' order by j.doc_no) as jobs
                         from public.customer_payment_allocations a join public.sol_jobs j on j.id = a.sol_job_id where a.customer_payment_id = p.id) x on true
   where e.status = 'posted' and e.source_type = 'customer_payment' and e.entry_date between p_from and p_to and (p.sol_job_id is not null or x.part is not null)
   order by e.entry_date desc, e.doc_no desc;
end;
$$;

-- Costs of SOL jobs, from the ledger: goods issued (less brought back) and expenses recorded for a job.
create function public.report_sol_costs(p_from date, p_to date)
returns table (entry_id uuid, entry_date date, kind text, doc_no text, job_id uuid, job_no text, customer text, customer_ur text, category_en text, category_ur text, payee text, vehicle text, is_reversal boolean, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('costs.view');
  perform private.require_permission('sol.view');
  return query
  select e.id, e.entry_date, x.kind, x.doc_no, j.id, j.doc_no, c.name, c.name_ur, x.category_en, x.category_ur, x.payee, x.vehicle, e.reversal_of is not null, l.debit - l.credit
    from public.journal_entries e
    join public.journal_entry_lines l on l.journal_entry_id = e.id
    join public.chart_of_accounts a on a.id = l.account_id and a.account_type = 'expense'
    join lateral (
      select 'goods'::text as kind, d.doc_no, d.sol_job_id, null::text as category_en, null::text as category_ur, null::text as payee, null::text as vehicle
        from public.sol_deliveries d where e.source_type = 'sol_delivery' and d.id = e.source_id
      union all
      select 'returned', r.doc_no, d.sol_job_id, null, null, null, null from public.sol_returns r join public.sol_deliveries d on d.id = r.sol_delivery_id where e.source_type = 'sol_return' and r.id = e.source_id
      union all
      select case when ex.vehicle_id is null then 'expense' else 'vehicle' end, ex.doc_no, ex.sol_job_id, ec.name_en, ec.name_ur, ex.payee, v.registration_no
        from public.expenses ex join public.expense_categories ec on ec.id = ex.category_id left join public.vehicles v on v.id = ex.vehicle_id
       where e.source_type = 'expense' and ex.id = e.source_id and ex.sol_job_id is not null) x on true
    join public.sol_jobs j on j.id = x.sol_job_id
    join public.customers c on c.id = j.customer_id
   where e.status = 'posted' and e.entry_date between p_from and p_to and e.source_type in ('sol_delivery', 'sol_return', 'expense')
   order by e.entry_date desc, e.doc_no desc;
end;
$$;

-- ===========================================================================
-- 6. Finance
-- ===========================================================================
create function public.report_profit_and_loss(p_from date, p_to date, p_bucket text default 'day')
returns table (period date, sales numeric, returns numeric, net_sales numeric, cost_of_sales numeric, gross_profit numeric, other_income numeric, expenses numeric, net_profit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_bucket constant text := case when p_bucket = 'month' then 'month' else 'day' end;
begin
  perform private.require_permission('reports.financial');
  return query
  with x as (
    select date_trunc(v_bucket, e.entry_date)::date as d, l.credit - l.debit as v,
           case when a.system_key = 'SALES' then 'sales' when a.system_key = 'SALES_RETURNS' then 'returns' when a.account_type = 'income' then 'other' when g.code = '5000' then 'cost' else 'expense' end as k
      from public.journal_entry_lines l
      join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date between p_from and p_to
      join public.chart_of_accounts a on a.id = l.account_id and a.account_type in ('income', 'expense')
      left join public.chart_of_accounts g on g.id = a.parent_id
  ), s as (
    select d, coalesce(sum(v) filter (where k = 'sales'), 0) as sales, coalesce(-sum(v) filter (where k = 'returns'), 0) as returns, coalesce(-sum(v) filter (where k = 'cost'), 0) as cost,
           coalesce(sum(v) filter (where k = 'other'), 0) as other, coalesce(-sum(v) filter (where k = 'expense'), 0) as expense
      from x group by d)
  select d, sales, returns, sales - returns, cost, sales - returns - cost, other, expense, sales - returns - cost + other - expense from s order by d desc;
end;
$$;

-- Operating expenses by ledger account, beside the period of equal length before.
create function public.report_expense_accounts(p_from date, p_to date)
returns table (account_id uuid, code text, name_en text, name_ur text, amount numeric, previous numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_days constant integer := p_to - p_from + 1;
begin
  perform private.require_permission('reports.financial');
  return query
  select a.id, a.code, a.name_en, a.name_ur, coalesce(sum(l.debit - l.credit) filter (where e.entry_date >= p_from), 0), coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0)
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date between p_from - v_days and p_to
    join public.chart_of_accounts a on a.id = l.account_id and a.account_type = 'expense'
    left join public.chart_of_accounts g on g.id = a.parent_id
   where g.code is distinct from '5000'
   group by a.id having coalesce(sum(l.debit - l.credit) filter (where e.entry_date >= p_from), 0) <> 0 or coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0) <> 0
   order by 5 desc, a.code;
end;
$$;

-- By category, from the ledger: a voucher voided later is undone on the day it was voided. Salaries come from posted payrolls.
create or replace function public.report_expenses(p_from date, p_to date)
returns table (category_id uuid, code text, name_en text, name_ur text, is_payroll boolean, vouchers bigint, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('expenses.view');
  return query
  select c.id, c.code, c.name_en, c.name_ur, c.is_payroll,
         case when c.is_payroll then coalesce(p.runs, 0) else coalesce(x.n, 0) end,
         case when c.is_payroll then case when private.has_permission('payroll.view') then coalesce(p.amount, 0) end else coalesce(x.amount, 0) end
    from public.expense_categories c
    left join (select ex.category_id, count(*) filter (where je.reversal_of is null and je.reversed_by is null) as n, sum(l.debit - l.credit) as amount
                 from public.journal_entries je
                 join public.journal_entry_lines l on l.journal_entry_id = je.id
                 join public.chart_of_accounts a on a.id = l.account_id and a.account_type = 'expense'
                 join public.expenses ex on ex.id = je.source_id
                where je.status = 'posted' and je.source_type = 'expense' and je.entry_date between p_from and p_to group by ex.category_id) x on x.category_id = c.id
    left join (select count(distinct je.id) filter (where je.reversal_of is null and je.reversed_by is null) as runs, sum(l.debit - l.credit) as amount
                 from public.journal_entries je join public.journal_entry_lines l on l.journal_entry_id = je.id
                where je.status = 'posted' and je.source_type = 'payroll_run' and je.entry_date between p_from and p_to
                  and l.account_id = private.account_id('SALARIES_EXPENSE')) p on c.is_payroll
   order by c.name_en;
end;
$$;

-- ===========================================================================
-- 7. Bank reconciliation
-- ===========================================================================
create table public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  financial_account_id uuid not null references public.financial_accounts (id),
  statement_date date not null,
  statement_balance numeric(18,2) not null,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  notes text,
  -- Ledger balance, uncleared receipts and payments when it was completed.
  totals jsonb,
  completed_at timestamptz,
  completed_by uuid,
  reopen_reason text,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (financial_account_id, statement_date)
);
create unique index bank_reconciliations_one_draft on public.bank_reconciliations (financial_account_id) where status = 'draft';
insert into public.document_sequences (doc_type, prefix, padding, description) values ('BRC', 'BRC-', 6, 'Bank reconciliation');
create trigger bank_reconciliations_doc_no before insert on public.bank_reconciliations for each row execute function private.assign_doc_no('BRC');
-- A ledger line is cleared once.
create table public.bank_reconciliation_lines (
  journal_entry_line_id uuid primary key references public.journal_entry_lines (id),
  bank_reconciliation_id uuid not null references public.bank_reconciliations (id) on delete cascade
);
create index bank_reconciliation_lines_idx on public.bank_reconciliation_lines (bank_reconciliation_id);
do $$
declare
  t text;
begin
  perform private.apply_policies('bank_reconciliations', private.p('cash_bank.view') || ' or ' || private.p('cash_bank.reconcile'), null, null, null);
  perform private.apply_policies('bank_reconciliation_lines', private.p('cash_bank.view') || ' or ' || private.p('cash_bank.reconcile'), null, null, null);
  foreach t in array array['bank_reconciliations', 'bank_reconciliation_lines'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;
create trigger touch_updated before update on public.bank_reconciliations for each row execute function private.touch_updated();
create trigger audit after insert or update or delete on public.bank_reconciliations for each row execute function private.audit_row();

-- Lines of the bank account up to the statement that no earlier reconciliation cleared.
create function private.bank_lines(p_id uuid)
returns table (line_id uuid, entry_id uuid, entry_date date, entry_no text, source_type text, source_no text, is_reversal boolean, description text, party text, party_ur text, amount numeric, cleared boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, e.id, e.entry_date, e.doc_no, e.source_type, private.source_number(e.source_type, e.source_id), e.reversal_of is not null, coalesce(l.description, e.description), p.name, p.name_ur,
         l.debit - l.credit, c.bank_reconciliation_id is not distinct from r.id
    from public.bank_reconciliations r
    join public.financial_accounts fa on fa.id = r.financial_account_id
    join public.journal_entry_lines l on l.account_id = fa.gl_account_id
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date <= r.statement_date
    left join public.bank_reconciliation_lines c on c.journal_entry_line_id = l.id
    left join public.bank_reconciliations o on o.id = c.bank_reconciliation_id
    left join lateral private.entry_party(e.id) p on true
   where r.id = p_id and (o.id is null or o.id = r.id or o.statement_date > r.statement_date);
$$;

create function private.bank_totals(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ledger', private.money_text(x.ledger), 'uncleared_in', private.money_text(x.unclear_in), 'uncleared_out', private.money_text(x.unclear_out),
                            'adjusted', private.money_text(x.ledger - x.unclear_in + x.unclear_out), 'statement', private.money_text(r.statement_balance),
                            'difference', private.money_text(r.statement_balance - (x.ledger - x.unclear_in + x.unclear_out)))
    from public.bank_reconciliations r
    join public.financial_accounts fa on fa.id = r.financial_account_id
    cross join lateral (select private.gl_balance(fa.gl_account_id, r.statement_date) as ledger, coalesce(sum(b.amount) filter (where not b.cleared and b.amount > 0), 0) as unclear_in,
                               coalesce(-sum(b.amount) filter (where not b.cleared and b.amount < 0), 0) as unclear_out from private.bank_lines(r.id) b) x
   where r.id = p_id;
$$;

create function public.start_bank_reconciliation(p_account_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_date date := (p_doc ->> 'statement_date')::date;
  v_account public.financial_accounts%rowtype;
  v_id uuid;
begin
  perform private.require_permission('cash_bank.reconcile');
  select id into v_id from public.bank_reconciliations where client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  select * into v_account from public.financial_accounts where id = p_account_id for no key update;
  if v_account.id is null then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if v_account.account_type <> 'bank' then raise exception 'Only bank accounts are reconciled with a statement' using errcode = '23514'; end if;
  if v_date is null or v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if (p_doc ->> 'statement_balance') is null then raise exception 'The amount is missing' using errcode = '22023'; end if;
  if exists (select 1 from public.bank_reconciliations where financial_account_id = p_account_id and status = 'draft') then
    raise exception 'Finish the open reconciliation of this account first' using errcode = '23514';
  end if;
  if v_date <= (select max(statement_date) from public.bank_reconciliations where financial_account_id = p_account_id) then
    raise exception 'This account is already reconciled until %', (select max(statement_date) from public.bank_reconciliations where financial_account_id = p_account_id) using errcode = '23514';
  end if;
  insert into public.bank_reconciliations (financial_account_id, statement_date, statement_balance, client_request_id)
  values (p_account_id, v_date, (p_doc ->> 'statement_balance')::numeric, v_request) returning id into v_id;
  return v_id;
end;
$$;

create function public.save_bank_reconciliation(p_id uuid, p_doc jsonb, p_lines uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bank_reconciliations%rowtype;
begin
  perform private.require_permission('cash_bank.reconcile');
  select * into v_row from public.bank_reconciliations where id = p_id for update;
  if v_row.id is null then raise exception 'Reconciliation not found' using errcode = 'P0002'; end if;
  if v_row.status <> 'draft' then raise exception 'Reconciliation % is already completed', v_row.doc_no using errcode = '23514'; end if;
  if exists (select 1 from unnest(coalesce(p_lines, '{}')) x where x not in (select line_id from private.bank_lines(p_id))) then
    raise exception 'A line does not belong to this account and date' using errcode = '23514';
  end if;
  update public.bank_reconciliations set statement_balance = coalesce((p_doc ->> 'statement_balance')::numeric, statement_balance), notes = nullif(trim(p_doc ->> 'notes'), '') where id = p_id;
  delete from public.bank_reconciliation_lines where bank_reconciliation_id = p_id and journal_entry_line_id <> all (coalesce(p_lines, '{}'));
  insert into public.bank_reconciliation_lines (journal_entry_line_id, bank_reconciliation_id) select distinct x, p_id from unnest(coalesce(p_lines, '{}')) x
  on conflict (journal_entry_line_id) do nothing;
  return p_id;
end;
$$;

-- Completed only when the statement and the ledger agree after the uncleared lines.
create function public.complete_bank_reconciliation(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bank_reconciliations%rowtype;
  v_totals jsonb;
begin
  perform private.require_permission('cash_bank.reconcile');
  -- Nothing is posted between the comparison and its result.
  perform pg_advisory_xact_lock(771109);
  select * into v_row from public.bank_reconciliations where id = p_id for update;
  if v_row.id is null then raise exception 'Reconciliation not found' using errcode = 'P0002'; end if;
  if v_row.status <> 'draft' then raise exception 'Reconciliation % is already completed', v_row.doc_no using errcode = '23514'; end if;
  v_totals := private.bank_totals(p_id);
  if (v_totals ->> 'difference')::numeric <> 0 then raise exception 'The statement differs from the ledger by %', v_totals ->> 'difference' using errcode = '23514'; end if;
  update public.bank_reconciliations set status = 'completed', totals = v_totals, completed_at = now(), completed_by = auth.uid(), reopen_reason = null where id = p_id;
  return p_id;
end;
$$;

-- The latest reconciliation of an account can be opened again.
create function public.reopen_bank_reconciliation(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.bank_reconciliations%rowtype;
begin
  perform private.require_permission('cash_bank.reconcile');
  select * into v_row from public.bank_reconciliations where id = p_id for update;
  if v_row.id is null then raise exception 'Reconciliation not found' using errcode = 'P0002'; end if;
  if v_row.status <> 'completed' then raise exception 'This reconciliation is already open' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if exists (select 1 from public.bank_reconciliations where financial_account_id = v_row.financial_account_id and statement_date > v_row.statement_date) then
    raise exception 'Reopen the later reconciliations first' using errcode = '23514';
  end if;
  update public.bank_reconciliations set status = 'draft', totals = null, completed_at = null, completed_by = null, reopen_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

create function public.delete_bank_reconciliation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('cash_bank.reconcile');
  delete from public.bank_reconciliations where id = p_id and status = 'draft';
  if not found then raise exception 'Only an open reconciliation can be deleted' using errcode = '23514'; end if;
end;
$$;

create function public.bank_reconciliation(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission('cash_bank.reconcile') then perform private.require_permission('cash_bank.view'); end if;
  return (select jsonb_build_object('id', r.id, 'doc_no', r.doc_no, 'account_id', fa.id, 'account', fa.name, 'statement_date', r.statement_date, 'status', r.status, 'notes', r.notes, 'reopen_reason', r.reopen_reason,
            'completed_at', r.completed_at, 'completed_by', (select p.full_name from public.profiles p where p.id = r.completed_by), 'totals', private.bank_totals(r.id), 'saved_totals', r.totals,
            'latest', not exists (select 1 from public.bank_reconciliations x where x.financial_account_id = r.financial_account_id and x.statement_date > r.statement_date),
            'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', b.line_id, 'entry_id', b.entry_id, 'date', b.entry_date, 'entry', b.entry_no, 'type', b.source_type, 'number', b.source_no, 'reversal', b.is_reversal,
                        'description', b.description, 'party', b.party, 'party_ur', b.party_ur, 'amount', private.money_text(b.amount), 'cleared', b.cleared) order by b.entry_date, b.entry_no), '[]') from private.bank_lines(r.id) b))
            from public.bank_reconciliations r join public.financial_accounts fa on fa.id = r.financial_account_id where r.id = p_id);
end;
$$;

-- Names of the bank accounts, without their numbers.
create function public.list_bank_accounts() returns table (id uuid, name text, is_active boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission('cash_bank.reconcile') then perform private.require_permission('cash_bank.view'); end if;
  return query select fa.id, fa.name, fa.is_active from public.financial_accounts fa where fa.account_type = 'bank' order by fa.name;
end;
$$;

create function public.list_bank_reconciliations(p_account_id uuid default null)
returns table (id uuid, doc_no text, account_id uuid, account text, statement_date date, statement_balance numeric, status text, difference numeric, ledger numeric, completed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission('cash_bank.reconcile') then perform private.require_permission('cash_bank.view'); end if;
  return query
  select r.id, r.doc_no, fa.id, fa.name, r.statement_date, r.statement_balance, r.status, (t.x ->> 'difference')::numeric, (t.x ->> 'ledger')::numeric, r.completed_at
    from public.bank_reconciliations r join public.financial_accounts fa on fa.id = r.financial_account_id
    cross join lateral (select private.bank_totals(r.id) as x) t
   where p_account_id is null or fa.id = p_account_id
   order by r.statement_date desc, r.doc_no desc;
end;
$$;

-- ===========================================================================
-- 8. Privileges
-- ===========================================================================
revoke execute on function
  private.note_lines(date, date), private.collection_lines(date, date), private.payable_scope(boolean), private.bank_lines(uuid), private.bank_totals(uuid)
from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.ledger_total(text[], date, date, text[])', 'public.record_report_export(text, text, jsonb)', 'public.report_collections(date, date, uuid, text)', 'public.report_territories(date, date, text)', 'public.report_product_movement(date, date, uuid)',
    'public.report_supplier_payments(date, date, uuid, boolean)', 'public.report_payables_aging(date, boolean)', 'public.report_purchase_lines(date, date, uuid, boolean, uuid)',
    'public.report_supplier_delivery(date, date, boolean)', 'public.report_company(date, date)', 'public.report_sol_payments(date, date)', 'public.report_sol_costs(date, date)',
    'public.report_profit_and_loss(date, date, text)', 'public.report_expense_accounts(date, date)', 'public.start_bank_reconciliation(uuid, jsonb)',
    'public.save_bank_reconciliation(uuid, jsonb, uuid[])', 'public.complete_bank_reconciliation(uuid)', 'public.reopen_bank_reconciliation(uuid, text)', 'public.delete_bank_reconciliation(uuid)',
    'public.bank_reconciliation(uuid)', 'public.list_bank_accounts()', 'public.list_bank_reconciliations(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
