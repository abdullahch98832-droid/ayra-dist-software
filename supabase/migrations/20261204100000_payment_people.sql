-- Who paid or received, how much each: an optional split of people on every money-in and money-out entry.
-- The breakdown is a record only; it never changes the accounts, but the people's amounts must add up to the total.
insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261204100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

-- ===========================================================================
-- 1. Shared validator: clean a list of {name, amount} that must total p_total
-- ===========================================================================
create function private.clean_contributors(p_contrib jsonb, p_total numeric) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v jsonb := coalesce(p_contrib, '[]'::jsonb);
begin
  if jsonb_typeof(v) <> 'array' then raise exception 'Invalid list of people' using errcode = '22023'; end if;
  if jsonb_array_length(v) = 0 then return '[]'::jsonb; end if;
  if exists (select 1 from jsonb_array_elements(v) c where coalesce(trim(c ->> 'name'), '') = '' or coalesce((c ->> 'amount')::numeric, 0) <= 0) then
    raise exception 'Each person needs a name and an amount above zero' using errcode = '22023';
  end if;
  if (select coalesce(sum((c ->> 'amount')::numeric), 0) from jsonb_array_elements(v) c) <> p_total then
    raise exception 'The people''s amounts must add up to the total' using errcode = '22023';
  end if;
  return (select jsonb_agg(jsonb_build_object('name', trim(c ->> 'name'), 'amount', round((c ->> 'amount')::numeric, 2))) from jsonb_array_elements(v) c);
end;
$$;
revoke all on function private.clean_contributors(jsonb, numeric) from public, anon;
grant execute on function private.clean_contributors(jsonb, numeric) to authenticated;

-- ===========================================================================
-- 2. A contributors column on every money-in / money-out table
-- ===========================================================================
alter table public.customer_payments add column contributors jsonb not null default '[]'::jsonb;
alter table public.customer_payments add constraint customer_payments_contributors_array check (jsonb_typeof(contributors) = 'array');
alter table public.cash_deposits add column contributors jsonb not null default '[]'::jsonb;
alter table public.cash_deposits add constraint cash_deposits_contributors_array check (jsonb_typeof(contributors) = 'array');
alter table public.supplier_payments add column contributors jsonb not null default '[]'::jsonb;
alter table public.supplier_payments add constraint supplier_payments_contributors_array check (jsonb_typeof(contributors) = 'array');
alter table public.expenses add column contributors jsonb not null default '[]'::jsonb;
alter table public.expenses add constraint expenses_contributors_array check (jsonb_typeof(contributors) = 'array');
alter table public.cash_vouchers add column contributors jsonb not null default '[]'::jsonb;
alter table public.cash_vouchers add constraint cash_vouchers_contributors_array check (jsonb_typeof(contributors) = 'array');

-- ===========================================================================
-- 3. Record functions store the split (written by these definer functions only)
-- ===========================================================================
create or replace function public.record_customer_payment(p_doc jsonb, p_allocations jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_customer uuid := (p_doc ->> 'customer_id')::uuid;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_account uuid := (p_doc ->> 'financial_account_id')::uuid;
  v_collector uuid := (p_doc ->> 'collected_by')::uuid;
  v_method public.payment_method := (p_doc ->> 'method')::public.payment_method;
  v_amount numeric(18,2) := (p_doc ->> 'amount')::numeric;
  v_poster constant boolean := private.has_permission('receivables.post');
  v_me constant uuid := private.current_employee_id();
  v_allocation record;
  v_total numeric(18,2) := 0;
begin
  perform private.require_permission('receivables.collect');
  if not private.sees_customer(v_customer) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  select id into v_id from public.customer_payments where client_request_id = v_request and customer_id = v_customer;
  if v_id is not null then return v_id; end if;

  -- Order takers collect in their own name.
  if not v_poster and not private.has_permission('sales.view_all') then
    if v_me is null then
      raise exception 'Your user is not linked to an employee' using errcode = '23514';
    end if;
    v_collector := v_me;
  end if;
  if v_account is null then
    if v_method <> 'cash' then
      raise exception 'Choose the account that received the payment' using errcode = '22023';
    end if;
    if not exists (select 1 from public.order_takers where employee_id = v_collector) then
      raise exception 'Choose the cash account, or the order taker who holds the cash' using errcode = '22023';
    end if;
  end if;

  for v_allocation in select * from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as a(invoice_id uuid, amount numeric) loop
    if not exists (select 1 from public.sales_invoices where id = v_allocation.invoice_id and customer_id = v_customer and status = 'posted') then
      raise exception 'Payment and invoice belong to different customers' using errcode = '23514';
    end if;
    v_total := v_total + v_allocation.amount;
  end loop;
  if v_total > v_amount then
    raise exception 'Allocation exceeds the unallocated payment amount (%)', v_amount using errcode = '23514';
  end if;

  insert into public.customer_payments (customer_id, payment_date, amount, financial_account_id, method, reference, collected_by, notes, client_request_id,
                                        requested_allocations, contributors)
  values (v_customer, coalesce((p_doc ->> 'date')::date, private.business_today()), v_amount, v_account, v_method,
          nullif(trim(p_doc ->> 'reference'), ''), v_collector, nullif(trim(p_doc ->> 'notes'), ''), v_request, nullif(p_allocations, '[]'::jsonb), private.clean_contributors(p_doc -> 'contributors', v_amount))
  returning id into v_id;

  if v_poster or (v_account is null and v_collector = v_me) then
    update public.customer_payments set requested_allocations = null where id = v_id;
    perform private.post_customer_payment(v_id);
    for v_allocation in select * from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as a(invoice_id uuid, amount numeric) loop
      perform private.allocate_customer_payment(v_id, v_allocation.invoice_id, v_allocation.amount);
    end loop;
  end if;
  return v_id;
end;
$$;

create or replace function public.record_sol_payment(p_job_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_amount numeric(18,2) := (p_doc ->> 'amount')::numeric;
  v_balance numeric(18,2);
  v_date date := coalesce((p_doc ->> 'date')::date, private.business_today());
  v_id uuid;
begin
  if not private.has_permission('receivables.post') then
    perform private.require_permission('receivables.collect');
  end if;
  select * into v_job from public.sol_jobs where id = p_job_id for update;
  if v_job.id is null or not private.sees_sol_job(p_job_id) then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  select id into v_id from public.customer_payments where client_request_id = v_request and sol_job_id = p_job_id;
  if v_id is not null then return v_id; end if;
  if v_job.status not in ('confirmed', 'in_progress', 'completed') then
    raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514';
  end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'The amount must be positive' using errcode = '22023'; end if;
  -- Payments still waiting to be posted count, so two people cannot collect the same balance.
  v_balance := v_job.contract_value - private.sol_job_received(p_job_id)
    - coalesce((select sum(amount) from public.customer_payments where sol_job_id = p_job_id and status = 'draft'), 0);
  if v_amount > v_balance then raise exception 'The payment exceeds the job balance (%)', v_balance using errcode = '23514'; end if;
  if (p_doc ->> 'financial_account_id') is null then
    raise exception 'Choose the account that received the payment' using errcode = '22023';
  end if;
  insert into public.customer_payments (customer_id, sol_job_id, payment_date, amount, financial_account_id, method, reference, payer_account, collected_by, notes, client_request_id, contributors)
  values (v_job.customer_id, p_job_id, v_date, v_amount, (p_doc ->> 'financial_account_id')::uuid, (p_doc ->> 'method')::public.payment_method,
          nullif(trim(p_doc ->> 'reference'), ''), p_doc ->> 'payer_account', private.current_employee_id(), nullif(trim(p_doc ->> 'notes'), ''), v_request, private.clean_contributors(p_doc -> 'contributors', v_amount))
  returning id into v_id;
  if private.has_permission('receivables.post') then
    perform private.post_customer_payment(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.record_cash_deposit(p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_employee uuid := (p_doc ->> 'employee_id')::uuid;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_poster constant boolean := private.has_permission('receivables.post');
begin
  if not v_poster then
    perform private.require_permission('receivables.collect');
    v_employee := private.current_employee_id();
  end if;
  if v_employee is null or not exists (select 1 from public.order_takers where employee_id = v_employee) then
    raise exception 'Order taker not found' using errcode = 'P0002';
  end if;
  select id into v_id from public.cash_deposits where client_request_id = v_request and employee_id = v_employee;
  if v_id is not null then return v_id; end if;
  insert into public.cash_deposits (employee_id, deposit_date, amount, financial_account_id, reference, notes, client_request_id, contributors)
  values (v_employee, coalesce((p_doc ->> 'date')::date, private.business_today()), (p_doc ->> 'amount')::numeric, (p_doc ->> 'financial_account_id')::uuid,
          nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'notes'), ''), v_request, private.clean_contributors(p_doc -> 'contributors', (p_doc ->> 'amount')::numeric))
  returning id into v_id;
  if v_poster then
    perform private.post_cash_deposit(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.record_supplier_payment(p_doc jsonb, p_allocations jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_supplier uuid := (p_doc ->> 'supplier_id')::uuid;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_allocation record;
begin
  perform private.require_permission(private.supplier_permission(v_supplier, 'pay'));
  select id into v_id from public.supplier_payments where client_request_id = v_request and supplier_id = v_supplier;
  if v_id is not null then return v_id; end if;
  insert into public.supplier_payments (supplier_id, payment_date, amount, financial_account_id, method, reference, notes, client_request_id, contributors)
  values (v_supplier, coalesce((p_doc ->> 'date')::date, private.business_today()), (p_doc ->> 'amount')::numeric,
          (p_doc ->> 'financial_account_id')::uuid, (p_doc ->> 'method')::public.payment_method,
          p_doc ->> 'reference', p_doc ->> 'notes', v_request, private.clean_contributors(p_doc -> 'contributors', (p_doc ->> 'amount')::numeric))
  returning id into v_id;
  perform public.post_supplier_payment(v_id);
  for v_allocation in select * from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as a(invoice_id uuid, amount numeric) loop
    perform public.allocate_supplier_payment(v_id, v_allocation.invoice_id, v_allocation.amount);
  end loop;
  return v_id;
end;
$$;

create or replace function public.record_expense(p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_id uuid;
begin
  perform private.require_permission('expenses.create');
  select id into v_id from public.expenses where client_request_id = v_request and created_by = auth.uid();
  if v_id is not null then return v_id; end if;
  perform private.check_expense_input(p_doc);
  insert into public.expenses (expense_date, category_id, amount, financial_account_id, method, reference, payee, description, vehicle_id, sol_job_id, litres, odometer,
                               receipt_path, no_receipt_reason, client_request_id, contributors)
  values (coalesce((p_doc ->> 'date')::date, private.business_today()), (p_doc ->> 'category_id')::uuid, (p_doc ->> 'amount')::numeric, (p_doc ->> 'financial_account_id')::uuid,
          (p_doc ->> 'method')::public.payment_method, nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'payee'), ''), nullif(trim(p_doc ->> 'description'), ''),
          (p_doc ->> 'vehicle_id')::uuid, (p_doc ->> 'sol_job_id')::uuid, (p_doc ->> 'litres')::numeric, (p_doc ->> 'odometer')::bigint,
          nullif(p_doc ->> 'receipt_path', ''), nullif(trim(p_doc ->> 'no_receipt_reason'), ''), v_request, private.clean_contributors(p_doc -> 'contributors', (p_doc ->> 'amount')::numeric))
  returning id into v_id;
  if private.has_permission('expenses.post') then
    perform public.post_expense(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.record_cash_voucher(p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_kind text := p_doc ->> 'kind';
  v_date date := coalesce((p_doc ->> 'date')::date, private.business_today());
  v_amount numeric(18,2) := (p_doc ->> 'amount')::numeric;
  v_account public.chart_of_accounts%rowtype;
  v_row public.cash_vouchers%rowtype;
  v_gl uuid;
  v_je uuid;
begin
  perform private.require_permission('accounting.journal');
  select * into v_row from public.cash_vouchers where client_request_id = v_request;
  if v_row.id is not null then return v_row.id; end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  select * into v_account from public.chart_of_accounts where id = (p_doc ->> 'counter_account_id')::uuid;
  if v_account.id is null or not private.voucher_account_ok(v_account, v_kind) then
    raise exception 'This account has its own document; it cannot be used on a voucher' using errcode = '23514';
  end if;
  v_gl := private.financial_gl((p_doc ->> 'financial_account_id')::uuid);
  insert into public.cash_vouchers (kind, voucher_date, financial_account_id, counter_account_id, amount, party_name, method, reference, description, client_request_id, contributors)
  values (v_kind, v_date, (p_doc ->> 'financial_account_id')::uuid, v_account.id, v_amount, nullif(trim(p_doc ->> 'party_name'), ''), (p_doc ->> 'method')::public.payment_method,
          nullif(trim(p_doc ->> 'reference'), ''), p_doc ->> 'description', v_request, private.clean_contributors(p_doc -> 'contributors', v_amount))
  returning * into v_row;
  v_je := private.post_journal(v_date, case v_kind when 'receipt' then 'Receipt ' else 'Payment ' end || v_row.doc_no || ': ' || v_row.description, 'cash_voucher', v_row.id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_gl, case v_kind when 'receipt' then 'debit' else 'credit' end, v_amount),
      jsonb_build_object('account_id', v_account.id, case v_kind when 'receipt' then 'credit' else 'debit' end, v_amount)));
  update public.cash_vouchers set journal_entry_id = v_je where id = v_row.id;
  return v_row.id;
end;
$$;
