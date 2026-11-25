-- Phase 10: documents (PDF). Company details for the letterhead, and what each document says, read from the saved transaction.

insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261129100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

-- ===========================================================================
-- 1. Letterhead
-- ===========================================================================
insert into public.app_settings (key, value, description) values
  ('company_address', '""', 'Business address on documents'),
  ('company_address_ur', '""', 'Business address on documents, in Urdu'),
  ('company_phone', '""', 'Business phone on documents'),
  ('company_email', '""', 'Business email on documents'),
  ('company_ntn', '""', 'National tax number on documents'),
  ('document_note', '""', 'Text at the end of invoices'),
  ('document_note_ur', '""', 'Text at the end of invoices, in Urdu')
on conflict (key) do nothing;

create function public.save_document_settings(p_doc jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
begin
  perform private.require_permission('settings.manage');
  foreach v_key in array array['company_address', 'company_address_ur', 'company_phone', 'company_email', 'company_ntn', 'document_note', 'document_note_ur'] loop
    if length(coalesce(p_doc ->> v_key, '')) > 500 then raise exception 'The text is too long' using errcode = '22023'; end if;
    update public.app_settings set value = to_jsonb(trim(coalesce(p_doc ->> v_key, ''))) where key = v_key;
  end loop;
end;
$$;

-- ===========================================================================
-- 2. Names on documents
-- ===========================================================================
-- Only called by the document functions, for a document the reader can already see.
create function private.employee_label(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('en', e.full_name, 'ur', e.full_name_ur) from public.employees e where e.id = p_id;
$$;
create function private.driver_label(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('en', e.full_name, 'ur', e.full_name_ur) from public.drivers d join public.employees e on e.id = d.employee_id where d.id = p_id;
$$;
create function private.user_label(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.full_name from public.profiles p where p.id = p_id;
$$;

-- ===========================================================================
-- 3. Documents. Each function runs as the reader, so row level security and column privileges decide what it may say.
--    Amounts are text, exactly as stored; every total is calculated here.
-- ===========================================================================
create function private.doc_customer(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('code', c.code, 'en', c.name, 'ur', c.name_ur, 'contact', c.owner_name, 'phone', c.phone,
                            'address', nullif(concat_ws(', ', nullif(c.address, ''), nullif(c.area, ''), nullif(c.city, '')), ''), 'ntn', c.ntn)
    from public.customers c where c.id = p_id;
$$;
create function private.doc_supplier(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('code', s.code, 'en', s.name, 'ur', s.name_ur, 'principal', s.is_principal, 'phone', s.phone, 'email', s.email, 'address', s.address, 'ntn', s.ntn)
    from public.suppliers s where s.id = p_id;
$$;
create function private.doc_warehouse(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('en', w.name_en, 'ur', w.name_ur) from public.warehouses w where w.id = p_id;
$$;
-- What a customer owes now, for whoever may know.
create function private.doc_customer_balance(p_id uuid) returns text
language sql stable set search_path = '' as $$
  select case when private.has_permission('receivables.view') then (select b.balance::numeric(18,2)::text from public.v_customer_balances b where b.customer_id = p_id) end;
$$;

create function private.doc_sales_invoice(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', i.doc_no, 'date', i.invoice_date, 'due_date', i.due_date, 'status', i.status, 'notes', i.notes,
    'party', private.doc_customer(i.customer_id), 'warehouse', private.doc_warehouse(i.warehouse_id), 'taker', private.employee_label(i.order_taker_id),
    'order', (select o.doc_no from public.sales_orders o where o.id = i.sales_order_id),
    'delivery', (select d.doc_no from public.deliveries d where d.sales_invoice_id = i.id limit 1),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'sku', p.sku, 'en', p.name_en, 'ur', p.name_ur, 'unit', jsonb_build_object('en', u.name_en, 'ur', u.name_ur), 'quantity', l.quantity, 'price', l.unit_price::text,
                'discount', l.discount_amount::text, 'tax_rate', l.tax_rate::text, 'tax', l.tax_amount::text, 'total', l.line_total::text) order by p.name_en, l.id), '[]')
                from public.sales_invoice_items l left join public.products p on p.id = l.product_id left join public.units u on u.id = l.unit_id where l.sales_invoice_id = i.id),
    'totals', (select jsonb_build_object('gross', coalesce(sum(round(l.quantity * l.unit_price, 2)), 0)::numeric(18,2)::text, 'discount', coalesce(sum(l.discount_amount), 0)::numeric(18,2)::text,
                        'net', coalesce(sum(l.line_net), 0)::numeric(18,2)::text, 'tax', coalesce(sum(l.tax_amount), 0)::numeric(18,2)::text, 'lines', coalesce(sum(l.line_total), 0)::numeric(18,2)::text)
                 from public.sales_invoice_items l where l.sales_invoice_id = i.id)
              || jsonb_build_object('total', i.total_amount::text)
              || coalesce((select jsonb_build_object('paid', b.paid_amount::numeric(18,2)::text, 'returned', b.returned_amount::numeric(18,2)::text, 'credited', b.credited_amount::numeric(18,2)::text,
                                                     'outstanding', b.outstanding::numeric(18,2)::text) from public.v_sales_invoice_balances b where b.sales_invoice_id = i.id), '{}'),
    'balance', private.doc_customer_balance(i.customer_id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('number', p.doc_no, 'date', p.payment_date, 'method', p.method, 'amount', a.amount::text) order by p.payment_date, p.doc_no), '[]')
                   from public.customer_payment_allocations a join public.customer_payments p on p.id = a.customer_payment_id where a.sales_invoice_id = i.id))
    from public.sales_invoices i where i.id = p_id;
$$;

create function private.doc_purchase_order(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', o.doc_no, 'date', o.order_date, 'expected_date', o.expected_date, 'status', o.status, 'notes', o.notes,
    'party', private.doc_supplier(o.supplier_id), 'warehouse', private.doc_warehouse(o.warehouse_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'sku', p.sku, 'en', p.name_en, 'ur', p.name_ur, 'unit', jsonb_build_object('en', u.name_en, 'ur', u.name_ur), 'quantity', l.quantity, 'price', l.unit_price::text,
                'total', l.line_total::text) order by p.name_en, l.id), '[]')
                from public.purchase_order_items l left join public.products p on p.id = l.product_id left join public.units u on u.id = l.unit_id where l.purchase_order_id = o.id),
    'totals', (select jsonb_build_object('lines', coalesce(sum(l.line_total), 0)::numeric(18,2)::text) from public.purchase_order_items l where l.purchase_order_id = o.id)
              || jsonb_build_object('total', o.total_amount::text))
    from public.purchase_orders o where o.id = p_id;
$$;

create function private.doc_goods_receipt(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', g.doc_no, 'date', g.receipt_date, 'status', g.status, 'reference', g.supplier_reference, 'notes', g.notes,
    'party', private.doc_supplier(g.supplier_id), 'warehouse', private.doc_warehouse(g.warehouse_id), 'damaged_warehouse', private.doc_warehouse(g.damaged_warehouse_id),
    'order', (select o.doc_no from public.purchase_orders o where o.id = g.purchase_order_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'sku', p.sku, 'en', p.name_en, 'ur', p.name_ur, 'unit', jsonb_build_object('en', u.name_en, 'ur', u.name_ur), 'expected', l.expected_quantity, 'quantity', l.quantity,
                'damaged', l.damaged_quantity, 'rejected', l.rejected_quantity, 'price', l.unit_cost::text, 'total', l.line_total::text) order by p.name_en, l.id), '[]')
                from public.goods_receipt_items l left join public.products p on p.id = l.product_id left join public.units u on u.id = l.unit_id where l.goods_receipt_id = g.id),
    'totals', (select jsonb_build_object('lines', coalesce(sum(l.line_total), 0)::numeric(18,2)::text) from public.goods_receipt_items l where l.goods_receipt_id = g.id)
              || jsonb_build_object('total', g.total_amount::text))
    from public.goods_receipts g where g.id = p_id;
$$;

-- The bill of a supplier with the goods of the receipts it covers.
create function private.doc_purchase_invoice(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', b.doc_no, 'invoice_number', b.invoice_number, 'date', b.invoice_date, 'due_date', b.due_date, 'status', b.status, 'notes', b.notes,
    'party', private.doc_supplier(b.supplier_id),
    'receipts', (select coalesce(jsonb_agg(g.doc_no order by g.doc_no), '[]') from public.supplier_invoice_receipts r join public.goods_receipts g on g.id = r.goods_receipt_id where r.supplier_invoice_id = b.id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'receipt', g.doc_no, 'sku', p.sku, 'en', p.name_en, 'ur', p.name_ur, 'unit', jsonb_build_object('en', u.name_en, 'ur', u.name_ur),
                'quantity', l.quantity + l.damaged_quantity, 'price', l.unit_cost::text, 'total', l.line_total::text) order by g.doc_no, p.name_en, l.id), '[]')
                from public.supplier_invoice_receipts r join public.goods_receipts g on g.id = r.goods_receipt_id join public.goods_receipt_items l on l.goods_receipt_id = g.id
                left join public.products p on p.id = l.product_id left join public.units u on u.id = l.unit_id
               where r.supplier_invoice_id = b.id and l.quantity + l.damaged_quantity > 0),
    'totals', (select jsonb_build_object('lines', coalesce(sum(l.line_total), 0)::numeric(18,2)::text)
                 from public.supplier_invoice_receipts r join public.goods_receipt_items l on l.goods_receipt_id = r.goods_receipt_id where r.supplier_invoice_id = b.id)
              || jsonb_build_object('total', b.amount::text)
              || coalesce((select jsonb_build_object('difference', (b.amount - coalesce((select sum(l.line_total) from public.supplier_invoice_receipts r join public.goods_receipt_items l on l.goods_receipt_id = r.goods_receipt_id
                                                                                          where r.supplier_invoice_id = b.id), 0))::numeric(18,2)::text)
                                  || case when s.paid_amount is null then '{}'::jsonb
                                          else jsonb_build_object('paid', s.paid_amount::numeric(18,2)::text, 'outstanding', coalesce(s.outstanding, b.amount - s.paid_amount)::numeric(18,2)::text) end
                             from public.v_supplier_invoice_status s where s.supplier_invoice_id = b.id), '{}'),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('number', p.doc_no, 'date', p.payment_date, 'method', p.method, 'amount', a.amount::text) order by p.payment_date, p.doc_no), '[]')
                   from public.supplier_payment_allocations a join public.supplier_payments p on p.id = a.supplier_payment_id where a.supplier_invoice_id = b.id))
    from public.supplier_invoices b where b.id = p_id;
$$;

create function private.doc_delivery(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', d.doc_no, 'date', d.delivery_date, 'status', d.status, 'notes', d.notes, 'received_by', d.received_by, 'delivery_note', d.delivery_note, 'delivered_at', d.delivered_at,
    'order', o.doc_no, 'invoice', (select i.doc_no from public.sales_invoices i where i.id = d.sales_invoice_id),
    'party', private.doc_customer(o.customer_id), 'warehouse', private.doc_warehouse(o.warehouse_id),
    'vehicle', (select concat_ws(' · ', v.registration_no, v.name) from public.vehicles v where v.id = d.vehicle_id), 'driver', private.driver_label(d.driver_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('sku', p.sku, 'en', p.name_en, 'ur', p.name_ur, 'unit', jsonb_build_object('en', u.name_en, 'ur', u.name_ur),
                'quantity', l.quantity, 'returned', l.returned_quantity) order by p.name_en, l.id), '[]')
                from public.delivery_items l join public.sales_order_items s on s.id = l.sales_order_item_id
                left join public.products p on p.id = s.product_id left join public.units u on u.id = s.unit_id where l.delivery_id = d.id))
    from public.deliveries d join public.sales_orders o on o.id = d.sales_order_id where d.id = p_id;
$$;

create function private.doc_sol_delivery(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', d.doc_no, 'date', d.delivery_date, 'status', d.status, 'notes', d.notes, 'received_by', d.received_by, 'delivery_note', d.delivery_note, 'delivered_at', d.delivered_at,
    'destination', d.destination, 'job', j.doc_no, 'party', private.doc_customer(j.customer_id), 'warehouse', private.doc_warehouse(d.warehouse_id),
    'vehicle', (select concat_ws(' · ', v.registration_no, v.name) from public.vehicles v where v.id = d.vehicle_id), 'driver', private.driver_label(d.driver_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('sku', p.sku, 'en', coalesce(p.name_en, s.name_en, i.description), 'ur', case when p.id is not null then p.name_ur when s.id is not null then s.name_ur end,
                'unit', jsonb_build_object('en', coalesce(u.name_en, s.unit_label), 'ur', coalesce(u.name_ur, s.unit_label_ur)), 'quantity', l.quantity, 'returned', l.returned_quantity) order by i.line_no), '[]')
                from public.sol_delivery_items l join public.sol_job_items i on i.id = l.sol_job_item_id
                left join public.products p on p.id = i.product_id left join public.sol_services s on s.id = i.service_id left join public.units u on u.id = i.unit_id
               where l.sol_delivery_id = d.id))
    from public.sol_deliveries d join public.sol_jobs j on j.id = d.sol_job_id where d.id = p_id;
$$;

-- Received and pending of a job, for whoever may know.
create function private.doc_sol_balance(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(case when private.has_permission('sol.view') then
    (select jsonb_strip_nulls(jsonb_build_object('paid', r.received::numeric(18,2)::text, 'outstanding', r.pending::numeric(18,2)::text)) from public.report_sol_jobs(p_job_id => p_id) r) end, '{}');
$$;

create function private.doc_sol_invoice(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', j.doc_no, 'date', coalesce(j.completion_date, j.job_date), 'job_date', j.job_date, 'due_date', j.due_date, 'completion_date', j.completion_date, 'status', j.status,
    'description', j.description, 'address', j.address, 'contact', j.contact_name, 'contact_phone', j.contact_phone, 'notes', j.notes,
    'party', private.doc_customer(j.customer_id), 'responsible', private.employee_label(j.responsible_employee_id),
    'type', (select jsonb_build_object('en', t.name_en, 'ur', t.name_ur) from public.sol_job_types t where t.id = j.job_type_id),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'sku', p.sku, 'en', coalesce(p.name_en, s.name_en, i.description), 'ur', case when p.id is not null then p.name_ur when s.id is not null then s.name_ur end,
                'note', case when p.id is not null or s.id is not null then i.description end,
                'unit', jsonb_build_object('en', coalesce(u.name_en, s.unit_label), 'ur', coalesce(u.name_ur, s.unit_label_ur)), 'quantity', i.quantity, 'price', i.unit_price::text, 'total', i.line_total::text) order by i.line_no), '[]')
                from public.sol_job_items i left join public.products p on p.id = i.product_id left join public.sol_services s on s.id = i.service_id left join public.units u on u.id = i.unit_id
               where i.sol_job_id = j.id),
    'totals', (select jsonb_build_object('lines', coalesce(sum(i.line_total), 0)::numeric(18,2)::text, 'difference', (j.contract_value - coalesce(sum(i.line_total), 0))::numeric(18,2)::text)
                 from public.sol_job_items i where i.sol_job_id = j.id)
              || jsonb_build_object('total', j.contract_value::text)
              || private.doc_sol_balance(j.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('number', p.doc_no, 'date', p.payment_date, 'method', p.method, 'amount', a.amount::text) order by p.payment_date, p.doc_no), '[]')
                   from public.customer_payment_allocations a join public.customer_payments p on p.id = a.customer_payment_id where a.sol_job_id = j.id))
    from public.sol_jobs j where j.id = p_id;
$$;

create function private.doc_customer_receipt(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', p.doc_no, 'date', p.payment_date, 'status', p.status, 'method', p.method, 'reference', p.reference, 'payer_account', p.payer_account, 'notes', p.notes, 'void_reason', p.void_reason,
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

create function private.doc_supplier_receipt(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', p.doc_no, 'date', p.payment_date, 'status', p.status, 'method', p.method, 'reference', p.reference, 'notes', p.notes,
    'party', private.doc_supplier(p.supplier_id), 'account', (select f.name from public.financial_accounts f where f.id = p.financial_account_id), 'recorded_by', private.user_label(p.created_by),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('number', b.invoice_number, 'doc_no', b.doc_no, 'date', b.invoice_date, 'invoice_total', b.amount::text, 'amount', a.amount::text) order by b.invoice_date, b.doc_no), '[]')
                from public.supplier_payment_allocations a join public.supplier_invoices b on b.id = a.supplier_invoice_id where a.supplier_payment_id = p.id),
    'totals', (select jsonb_build_object('total', p.amount::text, 'allocated', coalesce(sum(a.amount), 0)::numeric(18,2)::text, 'unallocated', (p.amount - coalesce(sum(a.amount), 0))::numeric(18,2)::text)
                 from public.supplier_payment_allocations a where a.supplier_payment_id = p.id),
    'balance', case when private.can_supplier(p.supplier_id, 'view') then (select b.balance::numeric(18,2)::text from public.v_supplier_balances b where b.supplier_id = p.supplier_id) end)
    from public.supplier_payments p where p.id = p_id;
$$;

create function private.doc_expense(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', e.doc_no, 'date', e.expense_date, 'status', case when e.status = 'void' and e.journal_entry_id is null then 'rejected' else e.status::text end, 'method', e.method, 'reference', e.reference,
    'payee', e.payee, 'description', e.description, 'void_reason', e.void_reason, 'receipt', e.receipt_path is not null, 'no_receipt_reason', e.no_receipt_reason,
    'category', (select jsonb_build_object('en', c.name_en, 'ur', c.name_ur) from public.expense_categories c where c.id = e.category_id),
    'account', (select f.name from public.financial_accounts f where f.id = e.financial_account_id),
    'vehicle', (select concat_ws(' · ', v.registration_no, v.name) from public.vehicles v where v.id = e.vehicle_id), 'job', (select j.doc_no from public.sol_jobs j where j.id = e.sol_job_id),
    'recorded_by', private.user_label(e.created_by), 'approved_by', case when e.status = 'posted' then private.user_label(e.posted_by) end,
    'totals', jsonb_build_object('total', e.amount::text))
    from public.expenses e where e.id = p_id;
$$;

create function private.doc_salary_slip(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', r.doc_no, 'date', r.period_month, 'status', r.status,
    'employee', (select jsonb_build_object('code', e.code, 'en', e.full_name, 'ur', e.full_name_ur, 'title', e.job_title, 'advances', e.advances::numeric(18,2)::text)
                   from public.payroll_employees() e where e.employee_id = i.employee_id),
    'notes', i.notes,
    'totals', jsonb_build_object('basic', i.basic_salary::text, 'allowances', i.allowances::text, 'bonus', i.bonus::text, 'gross', i.gross_pay::text, 'deductions', i.deductions::text,
                'recovery', i.advance_recovery::text, 'deducted', (i.deductions + i.advance_recovery)::numeric(18,2)::text, 'total', i.net_pay::text,
                'paid', x.paid::numeric(18,2)::text, 'outstanding', (case when r.status = 'posted' then i.net_pay - x.paid else 0 end)::numeric(18,2)::text),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('number', s.doc_no, 'date', s.payment_date, 'method', s.method, 'amount', s.amount::text) order by s.payment_date, s.doc_no), '[]')
                   from public.salary_payments s where s.payroll_item_id = i.id and s.status = 'posted'))
    from public.payroll_items i join public.payroll_runs r on r.id = i.payroll_run_id
    cross join lateral (select coalesce(sum(s.amount), 0) as paid from public.salary_payments s where s.payroll_item_id = i.id and s.status = 'posted') x
   where i.id = p_id;
$$;

-- What a document says, or NULL when the reader cannot see it.
create function public.document_data(p_kind text, p_id uuid) returns jsonb
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
    -- Every slip of a payroll.
    when 'salary_slips' then return (select jsonb_agg(private.doc_salary_slip(i.id) order by i.employee_id) from public.payroll_items i where i.payroll_run_id = p_id);
    else raise exception 'Unknown document %', p_kind using errcode = '22023';
  end case;
end;
$$;

-- ===========================================================================
-- 4. Statements of account
-- ===========================================================================
-- Lines with running balance, totals and closing balance. Customers owe us; we owe suppliers and the main company.
create function public.document_statement(p_kind text, p_party_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_lines jsonb;
  v_opening numeric(18,2);
  v_party jsonb;
begin
  if p_kind = 'customer' then
    v_party := private.doc_customer(p_party_id);
    if v_party is null then return null; end if;
    select coalesce(jsonb_agg(jsonb_build_object('date', s.entry_date, 'type', s.kind, 'number', coalesce(s.doc_no, s.journal_no), 'description', case when s.kind = 'manual' then s.description end,
             'reversal', s.is_reversal, 'debit', s.debit::numeric(18,2)::text, 'credit', s.credit::numeric(18,2)::text, 'balance', s.balance::numeric(18,2)::text) order by s.n) filter (where s.kind <> 'brought_forward'), '[]'),
           max(s.balance) filter (where s.kind = 'brought_forward')
      into v_lines, v_opening
      from public.customer_statement(p_party_id, p_from, p_to) with ordinality as s(entry_date, kind, source_id, doc_no, journal_no, description, is_reversal, debit, credit, balance, n);
  elsif p_kind = 'supplier' then
    v_party := private.doc_supplier(p_party_id);
    if v_party is null or not private.can_supplier(p_party_id, 'view') then return null; end if;
    select coalesce(sum(l.credit - l.debit), 0) into v_opening from public.v_supplier_ledger l where l.supplier_id = p_party_id and l.entry_date < p_from;
    select coalesce(jsonb_agg(jsonb_build_object('date', x.entry_date, 'type', x.source_type, 'number', coalesce(x.source_no, x.doc_no), 'description', case when x.source_type = 'manual' then x.entry_description end,
             'reversal', x.is_reversal, 'debit', x.debit::numeric(18,2)::text, 'credit', x.credit::numeric(18,2)::text, 'balance', x.balance::numeric(18,2)::text) order by x.n), '[]') into v_lines
      from (select l.entry_date, l.source_type, l.doc_no, l.entry_description, l.debit, l.credit, e.reversal_of is not null as is_reversal,
                   coalesce(g.doc_no, b.invoice_number, p.doc_no, r.doc_no) as source_no,
                   v_opening + sum(l.credit - l.debit) over w as balance, row_number() over w as n
              from public.v_supplier_ledger l
              left join public.journal_entries e on e.doc_no = l.doc_no
              left join public.goods_receipts g on l.source_type = 'goods_receipt' and g.id = l.source_id
              left join public.supplier_invoices b on l.source_type = 'supplier_invoice' and b.id = l.source_id
              left join public.supplier_payments p on l.source_type = 'supplier_payment' and p.id = l.source_id
              left join public.supplier_returns r on l.source_type = 'supplier_return' and r.id = l.source_id
             where l.supplier_id = p_party_id and l.entry_date between p_from and p_to
            window w as (order by l.entry_date, l.doc_no, l.debit, l.credit rows unbounded preceding)) x;
  else
    raise exception 'Unknown statement %', p_kind using errcode = '22023';
  end if;
  return jsonb_build_object('party', v_party, 'from', p_from, 'to', p_to, 'opening', coalesce(v_opening, 0)::numeric(18,2)::text, 'lines', v_lines,
    'totals', (select jsonb_build_object('debit', coalesce(sum((l ->> 'debit')::numeric), 0)::numeric(18,2)::text, 'credit', coalesce(sum((l ->> 'credit')::numeric), 0)::numeric(18,2)::text,
                        'closing', (coalesce(v_opening, 0) + case p_kind when 'customer' then 1 else -1 end * coalesce(sum((l ->> 'debit')::numeric - (l ->> 'credit')::numeric), 0))::numeric(18,2)::text)
                 from jsonb_array_elements(v_lines) l));
end;
$$;

-- ===========================================================================
-- 5. Privileges
-- ===========================================================================
revoke execute on function
  private.employee_label(uuid), private.driver_label(uuid), private.user_label(uuid), private.doc_customer(uuid), private.doc_supplier(uuid), private.doc_warehouse(uuid), private.doc_customer_balance(uuid), private.doc_sol_balance(uuid),
  private.doc_sales_invoice(uuid), private.doc_purchase_order(uuid), private.doc_goods_receipt(uuid), private.doc_purchase_invoice(uuid), private.doc_delivery(uuid), private.doc_sol_delivery(uuid),
  private.doc_sol_invoice(uuid), private.doc_customer_receipt(uuid), private.doc_supplier_receipt(uuid), private.doc_expense(uuid), private.doc_salary_slip(uuid)
from public, anon;
-- They run as the reader; the private schema is not reachable through the API.
grant execute on function
  private.employee_label(uuid), private.driver_label(uuid), private.user_label(uuid), private.doc_customer(uuid), private.doc_supplier(uuid), private.doc_warehouse(uuid), private.doc_customer_balance(uuid), private.doc_sol_balance(uuid),
  private.doc_sales_invoice(uuid), private.doc_purchase_order(uuid), private.doc_goods_receipt(uuid), private.doc_purchase_invoice(uuid), private.doc_delivery(uuid), private.doc_sol_delivery(uuid),
  private.doc_sol_invoice(uuid), private.doc_customer_receipt(uuid), private.doc_supplier_receipt(uuid), private.doc_expense(uuid), private.doc_salary_slip(uuid)
to authenticated;
revoke execute on function public.save_document_settings(jsonb), public.document_data(text, uuid), public.document_statement(text, uuid, date, date) from public, anon;
grant execute on function public.save_document_settings(jsonb), public.document_data(text, uuid), public.document_statement(text, uuid, date, date) to authenticated;
