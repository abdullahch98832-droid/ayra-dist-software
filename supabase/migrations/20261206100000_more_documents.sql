-- Printable papers for Ayra purchase returns, company money entries, cash vouchers and cash deposits,
-- and the people who paid or received (with how much each) on every receipt and voucher that has them.
insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261206100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

-- The people on a document, amounts as exact text.
create function private.doc_people(p_people jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', c ->> 'name', 'amount', (c ->> 'amount')::numeric(18,2)::text)), '[]'::jsonb)
    from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) c;
$$;

create or replace function private.doc_customer_receipt(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'people', private.doc_people(p.contributors), 'number', p.doc_no, 'date', p.payment_date, 'status', p.status, 'method', p.method, 'reference', p.reference, 'payer_account', p.payer_account, 'notes', p.notes, 'void_reason', p.void_reason,
    'party', private.doc_customer(p.customer_id), 'account', (select f.name from public.financial_accounts f where f.id = p.financial_account_id), 'collector', private.employee_label(p.collected_by),
    'recorded_by', private.user_label(p.created_by),
    'job', (select jsonb_build_object('number', j.doc_no, 'contract', j.contract_value::text) || private.doc_sol_balance(j.id) from public.sol_jobs j where j.id = p.sol_job_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('number', coalesce(i.doc_no, j.doc_no), 'date', coalesce(i.invoice_date, j.job_date), 'invoice_total', coalesce(i.total_amount, j.contract_value)::text,
                'amount', a.amount::text) order by coalesce(i.invoice_date, j.job_date), coalesce(i.doc_no, j.doc_no)), '[]')
                from public.customer_payment_allocations a left join public.sales_invoices i on i.id = a.sales_invoice_id left join public.sol_jobs j on j.id = a.sol_job_id where a.customer_payment_id = p.id),
    'totals', (select jsonb_build_object('total', p.amount::text, 'allocated', coalesce(sum(a.amount), 0)::numeric(18,2)::text, 'unallocated', (p.amount - coalesce(sum(a.amount), 0))::numeric(18,2)::text)
                 from public.customer_payment_allocations a where a.customer_payment_id = p.id),
    'balance', private.doc_customer_balance(p.customer_id))
    from public.customer_payments p where p.id = p_id;
$$;

create or replace function private.doc_supplier_receipt(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'people', private.doc_people(p.contributors), 'number', p.doc_no, 'date', p.payment_date, 'status', p.status, 'method', p.method, 'reference', p.reference, 'notes', p.notes,
    'party', private.doc_supplier(p.supplier_id), 'account', (select f.name from public.financial_accounts f where f.id = p.financial_account_id), 'recorded_by', private.user_label(p.created_by),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('number', b.invoice_number, 'doc_no', b.doc_no, 'date', b.invoice_date, 'invoice_total', b.amount::text, 'amount', a.amount::text) order by b.invoice_date, b.doc_no), '[]')
                from public.supplier_payment_allocations a join public.supplier_invoices b on b.id = a.supplier_invoice_id where a.supplier_payment_id = p.id),
    'totals', (select jsonb_build_object('total', p.amount::text, 'allocated', coalesce(sum(a.amount), 0)::numeric(18,2)::text, 'unallocated', (p.amount - coalesce(sum(a.amount), 0))::numeric(18,2)::text)
                 from public.supplier_payment_allocations a where a.supplier_payment_id = p.id),
    'balance', case when private.can_supplier(p.supplier_id, 'view') then (select b.balance::numeric(18,2)::text from public.v_supplier_balances b where b.supplier_id = p.supplier_id) end)
    from public.supplier_payments p where p.id = p_id;
$$;

create or replace function private.doc_expense(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'people', private.doc_people(e.contributors), 'number', e.doc_no, 'date', e.expense_date, 'status', case when e.status = 'void' and e.journal_entry_id is null then 'rejected' else e.status::text end, 'method', e.method, 'reference', e.reference,
    'payee', e.payee, 'description', e.description, 'void_reason', e.void_reason, 'receipt', e.receipt_path is not null, 'no_receipt_reason', e.no_receipt_reason,
    'category', (select jsonb_build_object('en', c.name_en, 'ur', c.name_ur) from public.expense_categories c where c.id = e.category_id),
    'account', (select f.name from public.financial_accounts f where f.id = e.financial_account_id),
    'vehicle', (select concat_ws(' · ', v.registration_no, v.name) from public.vehicles v where v.id = e.vehicle_id), 'job', (select j.doc_no from public.sol_jobs j where j.id = e.sol_job_id),
    'recorded_by', private.user_label(e.created_by), 'approved_by', case when e.status = 'posted' then private.user_label(e.posted_by) end,
    'totals', jsonb_build_object('total', e.amount::text))
    from public.expenses e where e.id = p_id;
$$;

create function private.doc_supplier_return(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', r.doc_no, 'date', r.return_date, 'status', r.status, 'notes', r.reason,
    'party', private.doc_supplier(r.supplier_id), 'warehouse', private.doc_warehouse(r.warehouse_id),
    'receipts', (select coalesce(jsonb_agg(g.doc_no), '[]') from public.goods_receipts g where g.id = r.goods_receipt_id),
    'recorded_by', private.user_label(r.created_by),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'sku', p.sku, 'en', p.name_en, 'ur', p.name_ur, 'unit', jsonb_build_object('en', u.name_en, 'ur', u.name_ur), 'quantity', l.quantity, 'price', l.unit_price::text,
                'total', l.line_total::text) order by p.name_en, l.id), '[]')
                from public.supplier_return_items l left join public.products p on p.id = l.product_id left join public.units u on u.id = l.unit_id where l.supplier_return_id = r.id),
    'totals', (select jsonb_build_object('lines', coalesce(sum(l.line_total), 0)::numeric(18,2)::text) from public.supplier_return_items l where l.supplier_return_id = r.id)
              || jsonb_build_object('total', r.total_amount::text))
    from public.supplier_returns r where r.id = p_id;
$$;

create function private.doc_company_money(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', x.doc_no, 'date', (x.paid_at at time zone 'Asia/Karachi')::date, 'status', x.status, 'description', x.name, 'direction', x.direction, 'type_key', x.kind,
    'method', x.method, 'reference', x.reference, 'notes', x.notes, 'void_reason', x.void_reason, 'people', private.doc_people(x.contributors),
    'account', (select f.name from public.financial_accounts f where f.id = x.financial_account_id), 'recorded_by', private.user_label(x.created_by),
    'totals', jsonb_build_object('total', x.amount::text))
    from public.company_extra_payments x where x.id = p_id;
$$;

create function private.doc_cash_voucher(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', v.doc_no, 'date', v.voucher_date, 'status', v.status, 'direction', case v.kind when 'receipt' then 'in' else 'out' end, 'description', v.description,
    'payee', v.party_name, 'method', v.method, 'reference', v.reference, 'void_reason', v.void_reason, 'people', private.doc_people(v.contributors),
    'account', (select f.name from public.financial_accounts f where f.id = v.financial_account_id),
    'category', (select jsonb_build_object('en', c.code || ' · ' || c.name_en, 'ur', c.code || ' · ' || coalesce(c.name_ur, c.name_en)) from public.chart_of_accounts c where c.id = v.counter_account_id),
    'recorded_by', private.user_label(v.created_by),
    'totals', jsonb_build_object('total', v.amount::text))
    from public.cash_vouchers v where v.id = p_id;
$$;

create function private.doc_cash_deposit(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', d.doc_no, 'date', d.deposit_date, 'status', d.status, 'reference', d.reference, 'notes', d.notes, 'void_reason', d.void_reason,
    'taker', private.employee_label(d.employee_id), 'people', private.doc_people(d.contributors),
    'account', (select f.name from public.financial_accounts f where f.id = d.financial_account_id), 'recorded_by', private.user_label(d.created_by),
    'approved_by', case when d.status = 'posted' then private.user_label(d.posted_by) end,
    'totals', jsonb_build_object('total', d.amount::text))
    from public.cash_deposits d where d.id = p_id;
$$;

create or replace function public.document_data(p_kind text, p_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  case p_kind
    when 'sales_invoice' then return private.doc_sales_invoice(p_id);
    when 'purchase_order' then return private.doc_purchase_order(p_id);
    when 'goods_receipt' then return private.doc_goods_receipt(p_id);
    when 'purchase_invoice' then return private.doc_purchase_invoice(p_id);
    when 'delivery_challan' then return private.doc_delivery(p_id);
    when 'sol_challan' then return private.doc_sol_delivery(p_id);
    when 'sol_invoice' then return private.doc_sol_invoice(p_id);
    when 'customer_receipt' then return private.doc_customer_receipt(p_id);
    when 'supplier_receipt' then return private.doc_supplier_receipt(p_id);
    when 'expense_voucher' then return private.doc_expense(p_id);
    when 'salary_slip' then return private.doc_salary_slip(p_id);
    when 'supplier_return' then return private.doc_supplier_return(p_id);
    when 'company_money' then return private.doc_company_money(p_id);
    when 'cash_voucher' then return private.doc_cash_voucher(p_id);
    when 'cash_deposit' then return private.doc_cash_deposit(p_id);
    -- Every slip of a payroll.
    when 'salary_slips' then return (select jsonb_agg(private.doc_salary_slip(i.id) order by i.employee_id) from public.payroll_items i where i.payroll_run_id = p_id);
    else raise exception 'Unknown document %', p_kind using errcode = '22023';
  end case;
end;
$$;

-- They run as the reader; the private schema is not reachable through the API.
revoke execute on function private.doc_people(jsonb), private.doc_supplier_return(uuid), private.doc_company_money(uuid), private.doc_cash_voucher(uuid), private.doc_cash_deposit(uuid) from public, anon;
grant execute on function private.doc_people(jsonb), private.doc_supplier_return(uuid), private.doc_company_money(uuid), private.doc_cash_voucher(uuid), private.doc_cash_deposit(uuid) to authenticated;
