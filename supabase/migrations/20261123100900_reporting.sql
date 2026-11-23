-- Reporting views and functions. Views use security_invoker so the caller's
-- RLS on the underlying tables applies.

create view public.v_stock_on_hand with (security_invoker = true) as
select
  sb.product_id,
  p.sku,
  p.name_en as product_name_en,
  p.name_ur as product_name_ur,
  sb.warehouse_id,
  w.code as warehouse_code,
  w.warehouse_type,
  sb.on_hand,
  sb.reserved,
  sb.on_hand - sb.reserved as available,
  coalesce(iv.avg_unit_cost, 0) as avg_unit_cost,
  round(sb.on_hand * coalesce(iv.avg_unit_cost, 0), 2) as estimated_value,
  p.reorder_level,
  (sb.on_hand - sb.reserved) <= p.reorder_level as below_reorder_level
from public.stock_balances sb
join public.products p on p.id = sb.product_id
join public.warehouses w on w.id = sb.warehouse_id
-- Left join: users without inventory.view (order takers) see availability but no cost.
left join public.inventory_valuation iv on iv.product_id = sb.product_id;

create view public.v_inventory_valuation with (security_invoker = true) as
select iv.product_id, p.sku, p.name_en as product_name_en, iv.quantity, iv.total_value, iv.avg_unit_cost
from public.inventory_valuation iv
join public.products p on p.id = iv.product_id;

create view public.v_posted_journal_lines with (security_invoker = true) as
select
  l.id as line_id,
  e.id as journal_entry_id,
  e.doc_no,
  e.entry_date,
  e.description as entry_description,
  e.source_type,
  e.source_id,
  l.line_no,
  l.account_id,
  a.code as account_code,
  a.name_en as account_name_en,
  a.account_type,
  a.system_key,
  l.debit,
  l.credit,
  l.customer_id,
  l.supplier_id,
  l.employee_id,
  l.description
from public.journal_entry_lines l
join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
join public.chart_of_accounts a on a.id = l.account_id;

create view public.v_account_balances with (security_invoker = true) as
select
  a.id as account_id, a.code, a.name_en, a.name_ur, a.account_type, a.parent_id, a.is_postable,
  coalesce(sum(jl.debit), 0) as total_debit,
  coalesce(sum(jl.credit), 0) as total_credit,
  case when a.account_type in ('asset', 'expense')
       then coalesce(sum(jl.debit - jl.credit), 0)
       else coalesce(sum(jl.credit - jl.debit), 0) end as balance
from public.chart_of_accounts a
left join public.v_posted_journal_lines jl on jl.account_id = a.id
group by a.id;

-- Customer ledger (receivables). Positive balance = customer owes us.
create view public.v_customer_ledger with (security_invoker = true) as
select
  jl.customer_id, jl.entry_date, jl.doc_no, jl.entry_description, jl.source_type, jl.source_id,
  jl.debit, jl.credit,
  sum(jl.debit - jl.credit) over (partition by jl.customer_id order by jl.entry_date, jl.doc_no, jl.line_no
                                  rows unbounded preceding) as running_balance
from public.v_posted_journal_lines jl
where jl.system_key = 'AR';

create view public.v_customer_balances with (security_invoker = true) as
select c.id as customer_id, c.code, c.name, c.area, c.credit_limit, c.order_taker_id,
       coalesce(sum(jl.debit - jl.credit), 0) as balance
from public.customers c
left join public.v_posted_journal_lines jl on jl.customer_id = c.id and jl.system_key = 'AR'
group by c.id;

-- Supplier ledgers (payables). Positive balance = we owe the supplier.
-- The main company (AP_PRINCIPAL) and other suppliers (AP_SUPPLIERS) are kept apart.
create view public.v_supplier_ledger with (security_invoker = true) as
select
  jl.supplier_id, jl.system_key as payable_account, jl.entry_date, jl.doc_no, jl.entry_description,
  jl.source_type, jl.source_id, jl.debit, jl.credit,
  sum(jl.credit - jl.debit) over (partition by jl.supplier_id order by jl.entry_date, jl.doc_no, jl.line_no
                                  rows unbounded preceding) as running_balance
from public.v_posted_journal_lines jl
where jl.system_key in ('AP_PRINCIPAL', 'AP_SUPPLIERS');

create view public.v_company_ledger with (security_invoker = true) as
select l.* from public.v_supplier_ledger l where l.payable_account = 'AP_PRINCIPAL';

create view public.v_supplier_balances with (security_invoker = true) as
select s.id as supplier_id, s.code, s.name, s.is_principal,
       coalesce(sum(jl.credit - jl.debit), 0) as balance
from public.suppliers s
left join public.v_posted_journal_lines jl
       on jl.supplier_id = s.id and jl.system_key in ('AP_PRINCIPAL', 'AP_SUPPLIERS')
group by s.id;

create view public.v_employee_balances with (security_invoker = true) as
select e.id as employee_id, e.employee_code, e.full_name,
       coalesce(sum(jl.debit - jl.credit) filter (where jl.system_key = 'EMPLOYEE_ADVANCES'), 0) as advances_outstanding,
       coalesce(sum(jl.credit - jl.debit) filter (where jl.system_key = 'SALARIES_PAYABLE'), 0) as salary_payable
from public.employees e
left join public.v_posted_journal_lines jl on jl.employee_id = e.id
group by e.id;

create view public.v_financial_account_balances with (security_invoker = true) as
select fa.id as financial_account_id, fa.name, fa.account_type, fa.bank_name, fa.account_number, fa.is_active,
       coalesce(sum(jl.debit - jl.credit), 0) as balance
from public.financial_accounts fa
left join public.v_posted_journal_lines jl on jl.account_id = fa.gl_account_id
group by fa.id;

create view public.v_sales_invoice_balances with (security_invoker = true) as
select i.id as sales_invoice_id, i.doc_no, i.customer_id, i.order_taker_id, i.invoice_date, i.due_date, i.total_amount,
       coalesce(pa.paid, 0) as paid_amount,
       coalesce(cr.returned, 0) as returned_amount,
       greatest(i.total_amount - coalesce(pa.paid, 0) - coalesce(cr.returned, 0), 0) as outstanding,
       case
         when i.total_amount - coalesce(pa.paid, 0) - coalesce(cr.returned, 0) <= 0 then 'paid'
         when coalesce(pa.paid, 0) + coalesce(cr.returned, 0) > 0 then 'partially_paid'
         else 'unpaid'
       end as payment_status
from public.sales_invoices i
left join (select sales_invoice_id, sum(amount) paid from public.customer_payment_allocations
            where sales_invoice_id is not null group by sales_invoice_id) pa on pa.sales_invoice_id = i.id
left join (select sales_invoice_id, sum(total_amount) returned from public.customer_returns
            where status = 'posted' and sales_invoice_id is not null group by sales_invoice_id) cr on cr.sales_invoice_id = i.id
where i.status = 'posted';

create view public.v_supplier_invoice_balances with (security_invoker = true) as
select si.id as supplier_invoice_id, si.doc_no, si.supplier_id, si.invoice_number, si.invoice_date, si.due_date,
       si.amount, coalesce(pa.paid, 0) as paid_amount,
       si.amount - coalesce(pa.paid, 0) as outstanding,
       case when si.amount - coalesce(pa.paid, 0) <= 0 then 'paid'
            when coalesce(pa.paid, 0) > 0 then 'partially_paid' else 'unpaid' end as payment_status
from public.supplier_invoices si
left join (select supplier_invoice_id, sum(amount) paid from public.supplier_payment_allocations
            group by supplier_invoice_id) pa on pa.supplier_invoice_id = si.id
where si.status = 'posted';

create view public.v_sol_job_summary with (security_invoker = true) as
select j.id as sol_job_id, j.doc_no, j.customer_id, j.job_date, j.status, j.vehicle_id, j.driver_id,
       j.contract_value,
       coalesce(pa.received, 0) as received_amount,
       j.contract_value - coalesce(pa.received, 0) as pending_amount,
       coalesce(ex.expenses, 0) as expenses,
       j.contract_value - coalesce(ex.expenses, 0) as profit
from public.sol_jobs j
left join (select sol_job_id, sum(amount) received from public.customer_payment_allocations
            where sol_job_id is not null group by sol_job_id) pa on pa.sol_job_id = j.id
left join (select sol_job_id, sum(amount) expenses from public.expenses
            where status = 'posted' and sol_job_id is not null group by sol_job_id) ex on ex.sol_job_id = j.id;

create view public.v_sol_trip_summary with (security_invoker = true) as
select t.id as sol_trip_id, t.doc_no, t.vehicle_id, t.driver_id, t.trip_date, t.status,
       coalesce(s.sales, 0) as sales_amount,
       coalesce(s.cost, 0) as cost_of_goods,
       coalesce(ex.expenses, 0) as expenses,
       coalesce(s.sales, 0) - coalesce(s.cost, 0) - coalesce(ex.expenses, 0) as profit
from public.sol_trips t
left join (select sol_trip_id, sum(subtotal) sales, sum(cost_total) cost from public.sales_invoices
            where status = 'posted' and sol_trip_id is not null group by sol_trip_id) s on s.sol_trip_id = t.id
left join (select sol_trip_id, sum(amount) expenses from public.expenses
            where status = 'posted' and sol_trip_id is not null group by sol_trip_id) ex on ex.sol_trip_id = t.id;

create view public.v_salary_balances with (security_invoker = true) as
select pi.id as payroll_item_id, pr.period_month, pi.employee_id, pi.net_pay,
       coalesce(sp.paid, 0) as paid_amount, pi.net_pay - coalesce(sp.paid, 0) as due_amount
from public.payroll_items pi
join public.payroll_runs pr on pr.id = pi.payroll_run_id and pr.status = 'posted'
left join (select payroll_item_id, sum(amount) paid from public.salary_payments
            where status = 'posted' group by payroll_item_id) sp on sp.payroll_item_id = pi.id;

create view public.v_purchase_receipt_discrepancies with (security_invoker = true) as
select gr.id as goods_receipt_id, gr.doc_no, gr.supplier_id, gr.receipt_date, gri.product_id,
       gri.expected_quantity, gri.quantity as received_quantity,
       gri.quantity - gri.expected_quantity as difference
from public.goods_receipt_items gri
join public.goods_receipts gr on gr.id = gri.goods_receipt_id
where gri.expected_quantity is not null and gri.expected_quantity <> gri.quantity;

-- Trial balance as of a date.
create function public.trial_balance(p_as_of date)
returns table (account_id uuid, code text, name_en text, account_type public.account_type,
               total_debit numeric, total_credit numeric, balance_debit numeric, balance_credit numeric)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.code, a.name_en, a.account_type,
         sum(jl.debit), sum(jl.credit),
         greatest(sum(jl.debit - jl.credit), 0),
         greatest(sum(jl.credit - jl.debit), 0)
    from public.v_posted_journal_lines jl
    join public.chart_of_accounts a on a.id = jl.account_id
   where jl.entry_date <= p_as_of
   group by a.id
   order by a.code;
$$;

-- Profit and loss for a date range: income positive, expenses positive.
create function public.profit_and_loss(p_from date, p_to date)
returns table (account_id uuid, code text, name_en text, account_type public.account_type, amount numeric)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.code, a.name_en, a.account_type,
         case when a.account_type = 'income' then sum(jl.credit - jl.debit) else sum(jl.debit - jl.credit) end
    from public.v_posted_journal_lines jl
    join public.chart_of_accounts a on a.id = jl.account_id
   where a.account_type in ('income', 'expense') and jl.entry_date between p_from and p_to
   group by a.id
   order by a.code;
$$;
