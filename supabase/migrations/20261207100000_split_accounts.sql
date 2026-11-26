-- Money paid or received by more than one person: each person is the cash or bank account
-- their share came from or went to, so every account's balance carries exactly its own share.
-- A list of people is [{account_id, name, amount}]; the name is the account's, kept for display.
insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261207100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

-- ===========================================================================
-- 1. The people: one account each, amounts adding up to the total
-- ===========================================================================
create or replace function private.clean_contributors(p_contrib jsonb, p_total numeric) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v jsonb := coalesce(p_contrib, '[]'::jsonb);
begin
  if jsonb_typeof(v) <> 'array' then raise exception 'Invalid list of people' using errcode = '22023'; end if;
  if jsonb_array_length(v) = 0 then return '[]'::jsonb; end if;
  if jsonb_array_length(v) = 1 then raise exception 'List two people or more, or choose the one account' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(v) c
              where not exists (select 1 from public.financial_accounts f where f.id::text = c ->> 'account_id')
                 or coalesce((c ->> 'amount')::numeric, 0) <= 0) then
    raise exception 'Choose the account of each person and an amount above zero' using errcode = '22023';
  end if;
  if (select count(distinct c ->> 'account_id') from jsonb_array_elements(v) c) <> jsonb_array_length(v) then
    raise exception 'Each person can be listed once' using errcode = '22023';
  end if;
  if (select sum((c ->> 'amount')::numeric) from jsonb_array_elements(v) c) <> p_total then
    raise exception 'The people''s amounts must add up to the total' using errcode = '22023';
  end if;
  return (select jsonb_agg(jsonb_build_object('account_id', f.id, 'name', f.name, 'amount', round((c ->> 'amount')::numeric, 2)) order by o)
            from jsonb_array_elements(v) with ordinality as x(c, o) join public.financial_accounts f on f.id = (c ->> 'account_id')::uuid);
end;
$$;

-- The cash or bank side of an entry: one line per person's account, or one line for the account.
-- Lists saved before people had accounts (names only) keep the one account.
create function private.money_lines(p_account uuid, p_people jsonb, p_side text, p_amount numeric) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_lines jsonb;
begin
  if p_side not in ('debit', 'credit') then raise exception 'Invalid side %', p_side using errcode = '22023'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) c where c ? 'account_id') then
    return jsonb_build_array(jsonb_build_object('account_id', private.financial_gl(p_account), p_side, p_amount));
  end if;
  if (select sum((c ->> 'amount')::numeric) from jsonb_array_elements(p_people) c) <> p_amount then
    raise exception 'The people''s amounts must add up to the total' using errcode = '23514';
  end if;
  select jsonb_agg(jsonb_build_object('account_id', private.financial_gl((c ->> 'account_id')::uuid), p_side, (c ->> 'amount')::numeric))
    into v_lines from jsonb_array_elements(p_people) c;
  return v_lines;
end;
$$;

-- The document's own account is the first person's, so screens that show one account stay true.
create function private.first_person_account() returns trigger
language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(new.contributors) = 'array' and new.contributors -> 0 ? 'account_id' then
    new.financial_account_id := (new.contributors -> 0 ->> 'account_id')::uuid;
  end if;
  return new;
end;
$$;
create trigger first_person_account before insert or update of contributors, financial_account_id on public.customer_payments for each row execute function private.first_person_account();
create trigger first_person_account before insert or update of contributors, financial_account_id on public.cash_deposits for each row execute function private.first_person_account();
create trigger first_person_account before insert or update of contributors, financial_account_id on public.supplier_payments for each row execute function private.first_person_account();
create trigger first_person_account before insert or update of contributors, financial_account_id on public.expenses for each row execute function private.first_person_account();
create trigger first_person_account before insert or update of contributors, financial_account_id on public.cash_vouchers for each row execute function private.first_person_account();
create trigger first_person_account before insert or update of contributors, financial_account_id on public.company_extra_payments for each row execute function private.first_person_account();

revoke execute on function private.money_lines(uuid, jsonb, text, numeric), private.first_person_account() from public, anon;
grant execute on function private.money_lines(uuid, jsonb, text, numeric) to authenticated;

-- ===========================================================================
-- 2. Posting: each person's share reaches their own account
-- ===========================================================================
create or replace function private.post_company_extra(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.company_extra_payments%rowtype;
  v_cash jsonb;
  v_counter jsonb;
begin
  select * into v from public.company_extra_payments where id = p_id;
  if v.direction = 'in' then
    -- The money comes into the cash or bank account; the other side is owner's capital.
    v_cash := private.money_lines(v.financial_account_id, v.contributors, 'debit', v.amount);
    v_counter := jsonb_build_object('account', 'CAPITAL', 'credit', v.amount);
  else
    v_cash := private.money_lines(v.financial_account_id, v.contributors, 'credit', v.amount);
    v_counter := case when v.kind = 'extra' then jsonb_build_object('account', 'AYRA_EXTRA', 'debit', v.amount)
                      else jsonb_build_object('account', 'AP_PRINCIPAL', 'debit', v.amount, 'supplier_id', (select id from public.suppliers where is_principal limit 1)) end;
  end if;
  return private.post_journal((v.paid_at at time zone 'Asia/Karachi')::date,
    case when v.direction = 'in' then 'Money received ' else 'Extra payment to Ayra ' end || v.doc_no || ': ' || v.name,
    'company_extra', v.id, jsonb_build_array(v_counter) || v_cash);
end;
$$;

create or replace function public.save_company_extra_payment(p_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.company_extra_payments%rowtype;
  v_new public.company_extra_payments%rowtype;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  -- A date, kept at noon so the day never shifts across time zones.
  v_date date := (coalesce(p_doc ->> 'paid_on', left(p_doc ->> 'paid_at', 10)))::date;
  v_paid timestamptz := ((v_date + time '12:00') at time zone 'Asia/Karachi');
  v_amount numeric(18,2) := (p_doc ->> 'amount')::numeric;
  v_direction text := coalesce(p_doc ->> 'direction', 'out');
  v_kind text := case when v_direction = 'in' then 'capital' else coalesce(p_doc ->> 'kind', 'extra') end;
  v_contrib jsonb := coalesce(p_doc -> 'contributors', '[]'::jsonb);
  v_id uuid := p_id;
begin
  perform private.require_permission('company.pay');
  if v_id is null and v_request is not null then
    select id into v_id from public.company_extra_payments where client_request_id = v_request and created_by = auth.uid();
    if v_id is not null then return v_id; end if;
  end if;
  if v_date is null or v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if coalesce(trim(p_doc ->> 'name'), '') = '' then raise exception 'A name is required' using errcode = '22023'; end if;
  if v_direction not in ('in', 'out') then raise exception 'Choose money in or money out' using errcode = '22023'; end if;
  if not exists (select 1 from public.financial_accounts where id = (p_doc ->> 'financial_account_id')::uuid) then raise exception 'Account not found' using errcode = 'P0002'; end if;
  -- Each person is the cash or bank account their share came from or went to.
  v_contrib := private.clean_contributors(v_contrib, v_amount);

  if v_id is null then
    insert into public.company_extra_payments (name, paid_at, amount, direction, kind, contributors, financial_account_id, method, reference, notes, client_request_id)
    values (trim(p_doc ->> 'name'), v_paid, v_amount, v_direction, v_kind, v_contrib, (p_doc ->> 'financial_account_id')::uuid,
            coalesce(p_doc ->> 'method', 'cash')::public.payment_method, nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'notes'), ''), v_request)
    returning id into v_id;
    update public.company_extra_payments set journal_entry_id = private.post_company_extra(v_id) where id = v_id;
    return v_id;
  end if;

  select * into v_old from public.company_extra_payments where id = v_id for update;
  if v_old.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_old.status <> 'posted' then raise exception 'A voided payment cannot be changed' using errcode = '23514'; end if;
  update public.company_extra_payments
     set name = trim(p_doc ->> 'name'), paid_at = v_paid, amount = v_amount, direction = v_direction, kind = v_kind, contributors = v_contrib,
         financial_account_id = (p_doc ->> 'financial_account_id')::uuid, method = coalesce(p_doc ->> 'method', method::text)::public.payment_method,
         reference = nullif(trim(p_doc ->> 'reference'), ''), notes = nullif(trim(p_doc ->> 'notes'), '')
   where id = v_id returning * into v_new;
  -- A new name, method or note does not touch the accounts; the people do, as each has an account.
  if (v_new.amount, v_new.direction, v_new.kind, v_new.financial_account_id, v_new.contributors, (v_new.paid_at at time zone 'Asia/Karachi')::date)
     is distinct from (v_old.amount, v_old.direction, v_old.kind, v_old.financial_account_id, v_old.contributors, (v_old.paid_at at time zone 'Asia/Karachi')::date) then
    perform private.reverse_journal(v_old.journal_entry_id, (v_old.paid_at at time zone 'Asia/Karachi')::date, 'Corrected');
    update public.company_extra_payments set journal_entry_id = private.post_company_extra(v_id) where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.post_expense(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.expenses%rowtype;
  v_gl uuid;
  v_je uuid;
  v_problem text;
begin
  perform private.require_permission('expenses.post');
  select * into v_doc from public.expenses where id = p_id for update;
  if v_doc.id is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Expense % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  v_problem := private.expense_problem(v_doc);
  if v_problem is not null then raise exception '%', v_problem using errcode = '23514'; end if;
  select gl_account_id into v_gl from public.expense_categories where id = v_doc.category_id;

  v_je := private.post_journal(v_doc.expense_date,
    'Expense ' || v_doc.doc_no || ': ' || v_doc.description, 'expense', v_doc.id,
    jsonb_build_array(jsonb_build_object('account_id', v_gl, 'debit', v_doc.amount, 'employee_id', v_doc.employee_id))
      || private.money_lines(v_doc.financial_account_id, v_doc.contributors, 'credit', v_doc.amount));
  update public.expenses
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

create or replace function public.update_expense(p_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.expenses%rowtype;
  v_new public.expenses%rowtype;
  v_problem text;
  v_gl uuid;
  v_je uuid;
begin
  if not private.has_permission('expenses.post') then
    perform private.require_permission('expenses.create');
  end if;
  select * into v_old from public.expenses where id = p_id for update;
  if v_old.id is null or not (private.has_permission('expenses.post') or coalesce(v_old.created_by = auth.uid(), false)) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if v_old.status <> 'draft' and not (v_old.status = 'posted' and private.has_permission('expenses.post')) then
    raise exception 'Expense % is already %', v_old.doc_no, v_old.status using errcode = '23514';
  end if;
  perform private.check_expense_input(p_doc);
  if (p_doc ->> 'date')::date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;

  update public.expenses
     set expense_date = coalesce((p_doc ->> 'date')::date, expense_date), category_id = (p_doc ->> 'category_id')::uuid, amount = (p_doc ->> 'amount')::numeric,
         financial_account_id = (p_doc ->> 'financial_account_id')::uuid, method = (p_doc ->> 'method')::public.payment_method, reference = nullif(trim(p_doc ->> 'reference'), ''),
         payee = nullif(trim(p_doc ->> 'payee'), ''), description = nullif(trim(p_doc ->> 'description'), ''), vehicle_id = (p_doc ->> 'vehicle_id')::uuid,
         sol_job_id = (p_doc ->> 'sol_job_id')::uuid, litres = (p_doc ->> 'litres')::numeric, odometer = (p_doc ->> 'odometer')::bigint,
         receipt_path = coalesce(nullif(p_doc ->> 'receipt_path', ''), receipt_path), no_receipt_reason = nullif(trim(p_doc ->> 'no_receipt_reason'), ''),
         contributors = private.clean_contributors(p_doc -> 'contributors', (p_doc ->> 'amount')::numeric)
   where id = p_id
  returning * into v_new;

  if v_old.status = 'posted' then
    v_problem := private.expense_problem(v_new);
    if v_problem is not null then raise exception '%', v_problem using errcode = '23514'; end if;
    -- Payee, notes or a receipt do not touch the accounts; the money side and the people's accounts do.
    if (v_new.amount, v_new.category_id, v_new.financial_account_id, v_new.contributors, v_new.expense_date, v_new.description)
       is distinct from (v_old.amount, v_old.category_id, v_old.financial_account_id, v_old.contributors, v_old.expense_date, v_old.description) then
      perform private.reverse_journal(v_old.journal_entry_id, v_old.expense_date, 'Corrected');
      select gl_account_id into v_gl from public.expense_categories where id = v_new.category_id;
      v_je := private.post_journal(v_new.expense_date,
        'Expense ' || v_new.doc_no || ': ' || v_new.description, 'expense', v_new.id,
        jsonb_build_array(jsonb_build_object('account_id', v_gl, 'debit', v_new.amount, 'employee_id', v_new.employee_id))
          || private.money_lines(v_new.financial_account_id, v_new.contributors, 'credit', v_new.amount));
      update public.expenses set journal_entry_id = v_je where id = p_id;
    end if;
  end if;
  return p_id;
end;
$$;

create or replace function public.post_supplier_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.supplier_payments%rowtype;
  v_je uuid;
begin
  select * into v_doc from public.supplier_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  perform private.require_permission(private.supplier_permission(v_doc.supplier_id, 'pay'));
  if v_doc.status <> 'draft' then raise exception 'Payment % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  v_je := private.post_journal(v_doc.payment_date, 'Supplier payment ' || v_doc.doc_no, 'supplier_payment', v_doc.id,
    jsonb_build_array(jsonb_build_object('account', private.payable_account(v_doc.supplier_id), 'debit', v_doc.amount, 'supplier_id', v_doc.supplier_id))
      || private.money_lines(v_doc.financial_account_id, v_doc.contributors, 'credit', v_doc.amount));

  update public.supplier_payments
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

create or replace function private.post_customer_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.customer_payments%rowtype;
  v_request record;
  v_amount numeric(18,2);
  v_job public.sol_jobs%rowtype;
  v_je uuid;
begin
  select * into v_doc from public.customer_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Payment % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  v_je := private.post_journal(v_doc.payment_date, 'Customer payment ' || v_doc.doc_no, 'customer_payment', v_doc.id,
    case when v_doc.financial_account_id is null
         then jsonb_build_array(jsonb_build_object('account', 'CASH_WITH_COLLECTORS', 'debit', v_doc.amount, 'employee_id', v_doc.collected_by))
         else private.money_lines(v_doc.financial_account_id, v_doc.contributors, 'debit', v_doc.amount) end
      || jsonb_build_array(jsonb_build_object('account', 'AR', 'credit', v_doc.amount, 'customer_id', v_doc.customer_id)));

  update public.customer_payments
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;

  -- Settle what was asked for, as far as there still is a balance; the rest stays on account.
  for v_request in
    select r.invoice_id, r.amount from jsonb_to_recordset(coalesce(v_doc.requested_allocations, '[]'::jsonb)) as r(invoice_id uuid, amount numeric)
  loop
    v_amount := least(v_request.amount, private.payment_unallocated(p_id), private.sales_invoice_outstanding(v_request.invoice_id));
    if v_amount > 0 then
      perform private.allocate_customer_payment(p_id, v_request.invoice_id, v_amount);
    end if;
  end loop;
  if v_doc.sol_job_id is not null then
    select * into v_job from public.sol_jobs where id = v_doc.sol_job_id for update;
    v_amount := least(private.payment_unallocated(p_id), v_job.contract_value - private.sol_job_received(v_job.id));
    if v_amount > 0 and v_job.status not in ('draft', 'cancelled') then
      perform private.allocate_payment_to_sol_job(p_id, v_job.id, v_amount);
    end if;
  end if;
  return v_je;
end;
$$;

create or replace function private.post_cash_deposit(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_deposits%rowtype;
  v_held numeric;
  v_je uuid;
begin
  select * into v_doc from public.cash_deposits where id = p_id for update;
  if v_doc.id is null then raise exception 'Deposit not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Deposit % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  perform 1 from public.order_takers where employee_id = v_doc.employee_id for update;
  v_held := private.collector_held(v_doc.employee_id);
  if v_doc.amount > v_held then
    raise exception 'The deposit exceeds the cash held (%)', v_held using errcode = '23514';
  end if;
  v_je := private.post_journal(v_doc.deposit_date, 'Cash deposit ' || v_doc.doc_no, 'cash_deposit', v_doc.id,
    private.money_lines(v_doc.financial_account_id, v_doc.contributors, 'debit', v_doc.amount)
      || jsonb_build_array(jsonb_build_object('account', 'CASH_WITH_COLLECTORS', 'credit', v_doc.amount, 'employee_id', v_doc.employee_id)));
  update public.cash_deposits set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid() where id = p_id;
  return v_je;
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
    private.money_lines(v_row.financial_account_id, v_row.contributors, case v_kind when 'receipt' then 'debit' else 'credit' end, v_amount)
      || jsonb_build_array(jsonb_build_object('account_id', v_account.id, case v_kind when 'receipt' then 'credit' else 'debit' end, v_amount)));
  update public.cash_vouchers set journal_entry_id = v_je where id = v_row.id;
  return v_row.id;
end;
$$;

-- ===========================================================================
-- 3. Reports name the people where more than one paid
-- ===========================================================================
create function private.people_names(p_people jsonb) returns text
language sql immutable set search_path = '' as $$
  select nullif(string_agg(c ->> 'name', ', '), '') from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) c;
$$;
revoke execute on function private.people_names(jsonb) from public, anon;
grant execute on function private.people_names(jsonb) to authenticated;

create or replace function public.expense_register(p_from date, p_to date, p_category_id uuid default null, p_status text default null)
returns table (expense_id uuid, doc_no text, expense_date date, category_en text, category_ur text, description text, payee text, method public.payment_method, reference text,
               account text, vehicle text, job_no text, amount numeric, has_receipt boolean, status text, recorded_by text, decided_by text, decided_at timestamptz, reason text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('expenses.view');
  return query
  select e.id, e.doc_no, e.expense_date, c.name_en, c.name_ur, e.description, e.payee, e.method, e.reference, coalesce(private.people_names(e.contributors), fa.name), v.registration_no, j.doc_no, e.amount, e.receipt_path is not null,
         x.state, r.full_name, d.full_name, e.posted_at, e.void_reason
    from public.expenses e
    cross join lateral (select case when e.status = 'void' and e.journal_entry_id is null then 'rejected' else e.status::text end as state) x
    join public.expense_categories c on c.id = e.category_id
    join public.financial_accounts fa on fa.id = e.financial_account_id
    left join public.vehicles v on v.id = e.vehicle_id
    left join public.sol_jobs j on j.id = e.sol_job_id
    left join public.profiles r on r.id = e.created_by
    left join public.profiles d on d.id = e.posted_by
   where e.expense_date between p_from and p_to
     and (p_category_id is null or c.id = p_category_id) and (p_status is null or x.state = p_status)
   order by e.expense_date desc, e.doc_no desc;
end;
$$;

create or replace function public.report_supplier_payments(p_from date, p_to date, p_supplier_id uuid default null, p_principal boolean default null)
returns table (entry_id uuid, entry_date date, doc_no text, supplier_id uuid, supplier text, supplier_ur text, is_principal boolean, method public.payment_method, reference text, account text,
               is_reversal boolean, amount numeric, settled numeric, on_account numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission('payables.view') then perform private.require_permission('company.view'); end if;
  return query
  select e.id, e.entry_date, p.doc_no, s.id, s.name, s.name_ur, s.is_principal, p.method, p.reference, coalesce(private.people_names(p.contributors), fa.name), e.reversal_of is not null, l.debit - l.credit,
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
