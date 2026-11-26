-- Company money in/out: the "Extra payments to Ayra" screen now records money received as well as paid,
-- drops the time of day (date only), and keeps who gave how much when several people contribute.
insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261203100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

-- ===========================================================================
-- 1. New columns: direction (in/out) and the people who gave the money
-- ===========================================================================
alter table public.company_extra_payments
  add column direction text not null default 'out',
  add column contributors jsonb not null default '[]'::jsonb;

-- Money out is an extra cost or a payment toward goods; money in is owner's investment (capital).
alter table public.company_extra_payments drop constraint if exists company_extra_payments_kind_check;
alter table public.company_extra_payments add constraint company_extra_payments_kind_check
  check ((direction = 'out' and kind in ('extra', 'account')) or (direction = 'in' and kind = 'capital'));
alter table public.company_extra_payments add constraint company_extra_payments_direction_check
  check (direction in ('in', 'out'));
alter table public.company_extra_payments add constraint company_extra_payments_contributors_array
  check (jsonb_typeof(contributors) = 'array');

-- ===========================================================================
-- 2. Posting: the account side depends on the direction
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
    v_cash := jsonb_build_object('account_id', private.financial_gl(v.financial_account_id), 'debit', v.amount);
    v_counter := jsonb_build_object('account', 'CAPITAL', 'credit', v.amount);
  else
    v_cash := jsonb_build_object('account_id', private.financial_gl(v.financial_account_id), 'credit', v.amount);
    v_counter := case when v.kind = 'extra' then jsonb_build_object('account', 'AYRA_EXTRA', 'debit', v.amount)
                      else jsonb_build_object('account', 'AP_PRINCIPAL', 'debit', v.amount, 'supplier_id', (select id from public.suppliers where is_principal limit 1)) end;
  end if;
  return private.post_journal((v.paid_at at time zone 'Asia/Karachi')::date,
    case when v.direction = 'in' then 'Money received ' else 'Extra payment to Ayra ' end || v.doc_no || ': ' || v.name,
    'company_extra', v.id, jsonb_build_array(v_counter, v_cash));
end;
$$;

-- ===========================================================================
-- 3. Save / correct: no time of day; validates the contributors add up
-- ===========================================================================
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
  if jsonb_typeof(v_contrib) <> 'array' then raise exception 'Invalid contributors' using errcode = '22023'; end if;
  if jsonb_array_length(v_contrib) > 0 then
    if exists (select 1 from jsonb_array_elements(v_contrib) c where coalesce(trim(c ->> 'name'), '') = '' or coalesce((c ->> 'amount')::numeric, 0) <= 0) then
      raise exception 'Each person needs a name and an amount above zero' using errcode = '22023';
    end if;
    if (select coalesce(sum((c ->> 'amount')::numeric), 0) from jsonb_array_elements(v_contrib) c) <> v_amount then
      raise exception 'The people''s amounts must add up to the total' using errcode = '22023';
    end if;
  end if;
  -- Store the contributors with trimmed names and money rounded to paisa.
  v_contrib := (select coalesce(jsonb_agg(jsonb_build_object('name', trim(c ->> 'name'), 'amount', round((c ->> 'amount')::numeric, 2))), '[]'::jsonb)
                  from jsonb_array_elements(v_contrib) c);

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
  -- A new name, people, method or note does not touch the accounts.
  if (v_new.amount, v_new.direction, v_new.kind, v_new.financial_account_id, (v_new.paid_at at time zone 'Asia/Karachi')::date)
     is distinct from (v_old.amount, v_old.direction, v_old.kind, v_old.financial_account_id, (v_old.paid_at at time zone 'Asia/Karachi')::date) then
    perform private.reverse_journal(v_old.journal_entry_id, (v_old.paid_at at time zone 'Asia/Karachi')::date, 'Corrected');
    update public.company_extra_payments set journal_entry_id = private.post_company_extra(v_id) where id = v_id;
  end if;
  return v_id;
end;
$$;

-- ===========================================================================
-- 4. Report: as the ledger has it, with direction and the people
-- ===========================================================================
drop function if exists public.report_company_extra(date, date);
create function public.report_company_extra(p_from date, p_to date)
returns table (payment_id uuid, doc_no text, entry_date date, name text, paid_at timestamptz, direction text, kind text,
               account text, method public.payment_method, reference text, notes text, contributors jsonb, status text, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('company.view');
  return query
  select x.id, x.doc_no, e.entry_date, x.name, x.paid_at, x.direction, x.kind, fa.name, x.method, x.reference, x.notes, x.contributors, x.status,
         sum(case when x.direction = 'in' then l.credit - l.debit else l.debit - l.credit end)
    from public.journal_entries e
    join public.journal_entry_lines l on l.journal_entry_id = e.id
    join public.chart_of_accounts a on a.id = l.account_id and a.system_key in ('AYRA_EXTRA', 'AP_PRINCIPAL', 'CAPITAL')
    join public.company_extra_payments x on x.id = e.source_id
    join public.financial_accounts fa on fa.id = x.financial_account_id
   where e.status = 'posted' and e.source_type = 'company_extra' and e.entry_date between p_from and p_to
   group by x.id, e.entry_date, fa.name having sum(case when x.direction = 'in' then l.credit - l.debit else l.debit - l.credit end) <> 0
   order by e.entry_date desc, x.paid_at desc, x.doc_no desc;
end;
$$;

-- ===========================================================================
-- 5. Reconciliation: money received adds to cash, money paid takes from it
-- ===========================================================================
create or replace function private.ledger_checks() returns table (check_code text, ledger numeric, documents numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
  select 'entries_balanced', coalesce((select sum(abs(x.d)) from (select sum(l.debit - l.credit) as d from public.journal_entry_lines l
           join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' group by l.journal_entry_id) x), 0), 0::numeric
  union all
  select 'trial_balance', coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
  union all
  select 'receivables', private.gl_balance(private.account_id('AR')),
         coalesce((select sum(total_amount) from public.sales_invoices where status = 'posted'), 0)
       + coalesce((select sum(case kind::text when 'credit' then -amount else amount end) from public.customer_notes where status = 'posted'), 0)
       + coalesce((select sum(contract_value) from public.sol_jobs where status = 'completed'), 0)
       - coalesce((select sum(amount) from public.customer_payments where status = 'posted'), 0)
       - coalesce((select sum(total_amount) from public.customer_returns where status = 'posted'), 0)
       + private.source_effect('AR', array['manual'])
  union all
  select k.check_code, private.gl_balance(private.account_id(k.system_key)),
       - coalesce((select sum(g.total_amount) from public.goods_receipts g join public.suppliers s on s.id = g.supplier_id where g.status = 'posted' and s.is_principal = k.principal), 0)
       - coalesce((select sum(b.amount - coalesce((select sum(g.total_amount) from public.supplier_invoice_receipts r join public.goods_receipts g on g.id = r.goods_receipt_id where r.supplier_invoice_id = b.id), 0))
                     from public.supplier_invoices b join public.suppliers s on s.id = b.supplier_id where b.status = 'posted' and s.is_principal = k.principal), 0)
       + coalesce((select sum(p.amount) from public.supplier_payments p join public.suppliers s on s.id = p.supplier_id where p.status = 'posted' and s.is_principal = k.principal), 0)
       + coalesce((select sum(r.total_amount) from public.supplier_returns r join public.suppliers s on s.id = r.supplier_id where r.status = 'posted' and s.is_principal = k.principal), 0)
       + case when k.principal then coalesce((select sum(x.amount) from public.company_extra_payments x where x.status = 'posted' and x.direction = 'out' and x.kind = 'account'), 0) else 0 end
       + private.source_effect(k.system_key, array['manual'])
    from (values ('payable_company', 'AP_PRINCIPAL', true), ('payable_suppliers', 'AP_SUPPLIERS', false)) as k(check_code, system_key, principal)
  union all
  select 'inventory', private.gl_balance(private.account_id('INVENTORY')), coalesce((select sum(total_value) from public.inventory_valuation), 0)
  union all
  select 'collector_cash', private.gl_balance(private.account_id('CASH_WITH_COLLECTORS')),
         coalesce((select sum(amount) from public.customer_payments where status = 'posted' and financial_account_id is null), 0)
       - coalesce((select sum(amount) from public.cash_deposits where status = 'posted'), 0)
  union all
  select 'employee_advances', private.gl_balance(private.account_id('EMPLOYEE_ADVANCES')),
         coalesce((select sum(amount) from public.employee_advances where status = 'posted'), 0)
       - coalesce((select sum(i.advance_recovery) from public.payroll_items i join public.payroll_runs r on r.id = i.payroll_run_id where r.status = 'posted'), 0)
       + private.source_effect('EMPLOYEE_ADVANCES', array['manual'])
  union all
  select 'salaries_payable', private.gl_balance(private.account_id('SALARIES_PAYABLE')),
         coalesce((select sum(amount) from public.salary_payments where status = 'posted'), 0)
       - coalesce((select sum(i.net_pay) from public.payroll_items i join public.payroll_runs r on r.id = i.payroll_run_id where r.status = 'posted'), 0)
       + private.source_effect('SALARIES_PAYABLE', array['manual'])
  union all
  select 'sales', private.gl_balance(private.account_id('SALES')),
       - coalesce((select sum(subtotal) from public.sales_invoices where status = 'posted'), 0)
       - coalesce((select sum(amount) from public.customer_notes where status = 'posted' and kind::text = 'debit'), 0)
       + private.source_effect('SALES', array['manual'])
  union all
  select 'sales_returns', private.gl_balance(private.account_id('SALES_RETURNS')),
         coalesce((select sum(subtotal) from public.customer_returns where status = 'posted'), 0)
       + coalesce((select sum(amount) from public.customer_notes where status = 'posted' and kind::text = 'credit'), 0)
       + private.source_effect('SALES_RETURNS', array['manual'])
  union all
  select 'sol_revenue', private.gl_balance(private.account_id('SOL_REVENUE')),
       - coalesce((select sum(contract_value) from public.sol_jobs where status = 'completed'), 0) + private.source_effect('SOL_REVENUE', array['manual'])
  union all
  select 'expenses', coalesce((select sum(l.debit - l.credit) from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
                                 join public.chart_of_accounts a on a.id = l.account_id and a.account_type = 'expense' where e.source_type = 'expense'), 0),
         coalesce((select sum(amount) from public.expenses where status = 'posted'), 0)
  union all
  select 'cash_and_bank', coalesce((select sum(private.gl_balance(gl_account_id)) from public.financial_accounts), 0),
         coalesce((select sum(amount) from public.account_openings where status = 'posted'), 0)
       + coalesce((select sum(amount) from public.customer_payments where status = 'posted' and financial_account_id is not null), 0)
       + coalesce((select sum(amount) from public.cash_deposits where status = 'posted'), 0)
       + coalesce((select sum(case kind when 'receipt' then amount else -amount end) from public.cash_vouchers where status = 'posted'), 0)
       - coalesce((select sum(amount) from public.supplier_payments where status = 'posted'), 0)
       + coalesce((select sum(case direction when 'in' then amount else -amount end) from public.company_extra_payments where status = 'posted'), 0)
       - coalesce((select sum(amount) from public.expenses where status = 'posted'), 0)
       - coalesce((select sum(amount) from public.employee_advances where status = 'posted'), 0)
       - coalesce((select sum(amount) from public.salary_payments where status = 'posted'), 0)
       + coalesce((select sum(difference) from public.cash_closings where status = 'closed' and difference_entry_id is not null), 0)
       + coalesce((select sum(l.debit - l.credit) from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
                    where e.source_type = 'manual' and l.account_id in (select gl_account_id from public.financial_accounts)), 0)
  union all
  select 'receipts_not_revenue', coalesce((select sum(abs(l.debit - l.credit)) from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
                                             join public.chart_of_accounts a on a.id = l.account_id and a.account_type in ('income', 'expense')
                                            where e.source_type in ('customer_payment', 'cash_deposit', 'fund_transfer', 'account_opening')), 0), 0::numeric
  union all
  select 'payments_not_purchases', coalesce((select sum(abs(l.debit - l.credit)) from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
                                               join public.chart_of_accounts a on a.id = l.account_id and (a.account_type = 'expense' or a.system_key = 'INVENTORY')
                                              where e.source_type in ('supplier_payment', 'salary_payment', 'employee_advance')), 0), 0::numeric
  union all
  select 'balance_sheet', coalesce(sum(case when a.account_type = 'asset' then l.debit - l.credit end), 0),
         coalesce(sum(case when a.account_type <> 'asset' then l.credit - l.debit end), 0)
    from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' join public.chart_of_accounts a on a.id = l.account_id;
end;
$$;

-- report_company_extra was recreated, so re-apply its privileges (authenticated only).
revoke execute on function public.report_company_extra(date, date) from public, anon;
grant execute on function public.report_company_extra(date, date) to authenticated;
