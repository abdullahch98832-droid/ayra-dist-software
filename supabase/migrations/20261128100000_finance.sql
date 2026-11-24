-- Phase 9: expense vouchers and their approval, payroll, cash and bank, daily cash closing, period closing, ledgers and statements.

-- ===========================================================================
-- 1. Permissions, version, numbering, accounts
-- ===========================================================================
insert into public.permissions (code, module, description_en, description_ur) values
  ('cash_bank.close', 'cash_bank', 'Close and reopen the cash of a day', 'دن کا نقد بند کریں اور دوبارہ کھولیں'),
  ('accounting.close', 'accounting', 'Close and reopen accounting periods', 'مالی ادوار بند کریں اور دوبارہ کھولیں');
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join (values ('cash_bank.close'), ('accounting.close')) as p(code)
 where r.code in ('manager', 'accountant')
on conflict do nothing;
update public.permissions set description_en = 'Approve, reject and void expenses', description_ur = 'اخراجات منظور، مسترد اور کالعدم کریں' where code = 'expenses.post';

insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261128100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

insert into public.document_sequences (doc_type, prefix, padding, description) values
  ('RV', 'RV-', 6, 'Receipt voucher'),
  ('PV', 'PV-', 6, 'Payment voucher'),
  ('AOB', 'AOB-', 6, 'Cash or bank opening balance'),
  ('CDC', 'CDC-', 6, 'Daily cash closing');

insert into public.chart_of_accounts (code, name_en, name_ur, account_type, is_postable, system_key, parent_id)
select v.code, v.name_en, v.name_ur, 'expense', true, v.system_key, (select id from public.chart_of_accounts where code = '6000')
  from (values
    ('6110', 'Guard', 'چوکیدار', null),
    ('6120', 'Sweeper', 'صفائی والا', null),
    ('6130', 'Servant', 'ملازم (خدمت گار)', null),
    ('6410', 'Electricity', 'بجلی', null),
    ('6420', 'Gas', 'گیس', null),
    ('6430', 'Water', 'پانی', null),
    ('6950', 'Cash Over and Short', 'نقد کی کمی بیشی', 'CASH_OVER_SHORT')
  ) as v(code, name_en, name_ur, system_key);

alter table public.expense_categories
  -- Salaries of employees are booked by payroll only, so that they are counted once.
  add column is_payroll boolean not null default false;
select private.restrict_columns('expense_categories', array['created_at', 'created_by', 'updated_at', 'updated_by', 'is_payroll']);
insert into public.expense_categories (code, name_en, name_ur, gl_account_id, is_payroll)
select v.code, v.name_en, v.name_ur, (select id from public.chart_of_accounts where code = v.account), v.payroll
  from (values
    ('GUARD', 'Guard', 'چوکیدار', '6110', false),
    ('SWEEPER', 'Sweeper', 'صفائی والا', '6120', false),
    ('SERVANT', 'Servant', 'ملازم (خدمت گار)', '6130', false),
    ('SALARIES', 'Salaries', 'تنخواہیں', '6100', true),
    ('ELECTRICITY', 'Electricity', 'بجلی', '6410', false),
    ('GAS', 'Gas', 'گیس', '6420', false),
    ('WATER', 'Water', 'پانی', '6430', false)
  ) as v(code, name_en, name_ur, account, payroll);
update public.expense_categories set name_en = 'Petrol' where code = 'FUEL' and name_en = 'Petrol / Fuel';
update public.expense_categories set name_en = 'Snacks', name_ur = 'چائے پانی اور اسنیکس' where code = 'REFRESHMENTS' and name_en = 'Snacks / Refreshments';
update public.expense_categories set name_en = 'Other expenses', name_ur = 'دیگر اخراجات' where code = 'MISC' and name_en = 'Miscellaneous';

-- ===========================================================================
-- 2. Locks: closed cash days and closed periods accept no entries
-- ===========================================================================
-- Posting holds this lock shared, closing holds it alone, so an entry can never slip into a day while it is being closed.
-- Taken before the entry gets its number, so that posting and closing cannot wait for each other.
create function private.lock_posting() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock_shared(771109);
  return new;
end;
$$;
create trigger aaa_lock_posting before insert on public.journal_entries for each row execute function private.lock_posting();

create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  financial_account_id uuid not null references public.financial_accounts (id),
  closing_date date not null,
  opening_balance numeric(18,2) not null,
  receipts numeric(18,2) not null,
  payments numeric(18,2) not null,
  expected numeric(18,2) not null,
  counted numeric(18,2) not null check (counted >= 0),
  difference numeric(18,2) generated always as (counted - expected) stored,
  -- Set when the difference was booked to Cash over and short.
  difference_entry_id uuid references public.journal_entries (id),
  -- Notes and coins: { "5000": 3, "1000": 12, ... }
  denominations jsonb,
  notes text,
  status text not null default 'closed' check (status in ('closed', 'reopened')),
  reopen_reason text,
  reopened_at timestamptz,
  reopened_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index cash_closings_one_per_day on public.cash_closings (financial_account_id, closing_date) where status = 'closed';
create trigger cash_closings_doc_no before insert on public.cash_closings for each row execute function private.assign_doc_no('CDC');

create function private.cash_closed_until(p_financial_account_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select max(closing_date) from public.cash_closings where financial_account_id = p_financial_account_id and status = 'closed';
$$;

create or replace function private.guard_journal_entry() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_debit numeric;
  v_credit numeric;
  v_lines integer;
  v_name text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Journal entries must be created as draft' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception 'Posted journal entries cannot be deleted; reverse them instead' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.status = 'posted' then
    if new.status = 'posted'
       and old.reversed_by is null and new.reversed_by is not null
       and (to_jsonb(new) - 'reversed_by' - 'updated_at' - 'updated_by')
         = (to_jsonb(old) - 'reversed_by' - 'updated_at' - 'updated_by') then
      return new;
    end if;
    raise exception 'Posted journal entries are immutable; reverse them instead' using errcode = '42501';
  end if;

  if new.status = 'posted' then
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
      into v_debit, v_credit, v_lines
      from public.journal_entry_lines where journal_entry_id = new.id;
    if v_lines < 2 then
      raise exception 'A journal entry needs at least two lines' using errcode = '23514';
    end if;
    if v_debit <> v_credit then
      raise exception 'Journal entry is not balanced (debit %, credit %)', v_debit, v_credit
        using errcode = '23514';
    end if;
    if exists (select 1 from public.accounting_periods
                where status = 'closed' and new.entry_date between start_date and end_date) then
      raise exception 'Accounting period for % is closed', new.entry_date using errcode = '23514';
    end if;
    select fa.name into v_name
      from public.journal_entry_lines l
      join public.financial_accounts fa on fa.gl_account_id = l.account_id
     where l.journal_entry_id = new.id
       and exists (select 1 from public.cash_closings c where c.financial_account_id = fa.id and c.status = 'closed' and c.closing_date >= new.entry_date)
     limit 1;
    if v_name is not null then
      raise exception 'The cash of % is closed for %', v_name, new.entry_date using errcode = '23514';
    end if;
    new.posted_at := now();
    new.posted_by := auth.uid();
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 3. Expense vouchers
-- ===========================================================================
alter table public.expenses add column no_receipt_reason text;
select private.restrict_columns('expenses', array[
  'doc_no', 'status', 'journal_entry_id', 'posted_at', 'posted_by', 'created_at', 'created_by', 'updated_at', 'updated_by', 'void_reason']);
-- Vouchers are written by the functions below, so that none skips the checks.
drop policy "insert" on public.expenses;
drop policy "update" on public.expenses;
select private.read_only('expenses');
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(attname), ', ') into v_cols from pg_attribute
   where attrelid = 'public.expenses'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke insert (%s), update (%s) on public.expenses from authenticated', v_cols, v_cols);
end;
$$;
grant delete on public.expenses to authenticated;

drop policy "delete" on public.expenses;
create policy "delete" on public.expenses for delete to authenticated using (
  status = 'draft' and ((select private.has_permission('expenses.post'))
                        or ((select private.has_permission('expenses.create')) and created_by = (select auth.uid()))));
-- Whoever recorded a voucher may follow it, also after it was decided.
drop policy "select" on public.expenses;
create policy "select" on public.expenses for select to authenticated using (
  (select private.has_permission('expenses.view')) or (select private.has_permission('expenses.post'))
  or (created_by = (select auth.uid()) and (status = 'draft' or (status = 'void' and journal_entry_id is null))));

-- What a voucher needs before it can be approved. Returns the first thing that is missing, or NULL.
create function private.expense_problem(p public.expenses) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_category public.expense_categories%rowtype;
begin
  select * into v_category from public.expense_categories where id = p.category_id;
  if v_category.id is null or not v_category.is_active then return 'Expense category is inactive'; end if;
  if v_category.is_payroll then return 'Salaries are recorded in Payroll, so that they are counted once'; end if;
  if coalesce(trim(p.description), '') = '' then return 'The description is missing'; end if;
  if coalesce(trim(p.payee), '') = '' then return 'Who was paid is missing'; end if;
  if p.method is null then return 'The payment method is missing'; end if;
  if p.receipt_path is null and coalesce(trim(p.no_receipt_reason), '') = '' then return 'Attach the receipt, or say why there is none'; end if;
  return null;
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
    jsonb_build_array(
      jsonb_build_object('account_id', v_gl, 'debit', v_doc.amount, 'employee_id', v_doc.employee_id),
      jsonb_build_object('account_id', private.financial_gl(v_doc.financial_account_id), 'credit', v_doc.amount)));
  update public.expenses
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

-- A voucher that is not approved is kept, with the reason, and never reaches the accounts.
create function public.reject_expense(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('expenses.post');
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.expenses set status = 'void', void_reason = trim(p_reason), posted_at = now(), posted_by = auth.uid() where id = p_id and status = 'draft';
  if not found then raise exception 'Only vouchers that wait for approval can be rejected' using errcode = '23514'; end if;
  return p_id;
end;
$$;

create function private.check_expense_input(p_doc jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_job uuid := (p_doc ->> 'sol_job_id')::uuid;
  v_receipt text := nullif(p_doc ->> 'receipt_path', '');
begin
  if v_job is not null and not private.sees_sol_job(v_job) then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if coalesce((p_doc ->> 'date')::date, private.business_today()) > private.business_today() then
    raise exception 'The date cannot be in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from public.expense_categories where id = (p_doc ->> 'category_id')::uuid and is_active) then
    raise exception 'Expense category is inactive' using errcode = '23514';
  end if;
  if exists (select 1 from public.expense_categories where id = (p_doc ->> 'category_id')::uuid and is_payroll) then
    raise exception 'Salaries are recorded in Payroll, so that they are counted once' using errcode = '23514';
  end if;
  if not exists (select 1 from public.financial_accounts where id = (p_doc ->> 'financial_account_id')::uuid and is_active) then
    raise exception 'Choose the account that paid' using errcode = '22023';
  end if;
  if v_receipt is not null and (v_receipt not like 'expenses/%' or v_receipt like '%..%') then
    raise exception 'The receipt is not in the right folder' using errcode = '22023';
  end if;
end;
$$;

-- Records a voucher. Whoever may approve approves it at once; otherwise it waits for approval.
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
                               receipt_path, no_receipt_reason, client_request_id)
  values (coalesce((p_doc ->> 'date')::date, private.business_today()), (p_doc ->> 'category_id')::uuid, (p_doc ->> 'amount')::numeric, (p_doc ->> 'financial_account_id')::uuid,
          (p_doc ->> 'method')::public.payment_method, nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'payee'), ''), nullif(trim(p_doc ->> 'description'), ''),
          (p_doc ->> 'vehicle_id')::uuid, (p_doc ->> 'sol_job_id')::uuid, (p_doc ->> 'litres')::numeric, (p_doc ->> 'odometer')::bigint,
          nullif(p_doc ->> 'receipt_path', ''), nullif(trim(p_doc ->> 'no_receipt_reason'), ''), v_request)
  returning id into v_id;
  if private.has_permission('expenses.post') then
    perform public.post_expense(v_id);
  end if;
  return v_id;
end;
$$;

-- Corrects a voucher that waits for approval: whoever recorded it, or may approve it.
create function public.update_expense(p_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.expenses%rowtype;
begin
  if not private.has_permission('expenses.post') then
    perform private.require_permission('expenses.create');
  end if;
  select * into v_doc from public.expenses where id = p_id for update;
  if v_doc.id is null or not (private.has_permission('expenses.post') or coalesce(v_doc.created_by = auth.uid(), false)) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'draft' then raise exception 'Expense % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  perform private.check_expense_input(p_doc);
  update public.expenses
     set expense_date = coalesce((p_doc ->> 'date')::date, expense_date), category_id = (p_doc ->> 'category_id')::uuid, amount = (p_doc ->> 'amount')::numeric,
         financial_account_id = (p_doc ->> 'financial_account_id')::uuid, method = (p_doc ->> 'method')::public.payment_method, reference = nullif(trim(p_doc ->> 'reference'), ''),
         payee = nullif(trim(p_doc ->> 'payee'), ''), description = nullif(trim(p_doc ->> 'description'), ''), vehicle_id = (p_doc ->> 'vehicle_id')::uuid,
         sol_job_id = (p_doc ->> 'sol_job_id')::uuid, litres = (p_doc ->> 'litres')::numeric, odometer = (p_doc ->> 'odometer')::bigint,
         receipt_path = coalesce(nullif(p_doc ->> 'receipt_path', ''), receipt_path), no_receipt_reason = nullif(trim(p_doc ->> 'no_receipt_reason'), '')
   where id = p_id;
  return p_id;
end;
$$;

-- Adds a receipt to a voucher that has none yet, also after its approval. A receipt is never replaced.
create function public.attach_expense_receipt(p_id uuid, p_path text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.expenses%rowtype;
begin
  if not private.has_permission('expenses.post') then
    perform private.require_permission('expenses.create');
  end if;
  select * into v_doc from public.expenses where id = p_id for update;
  if v_doc.id is null or not (private.has_permission('expenses.post') or coalesce(v_doc.created_by = auth.uid(), false)) then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if p_path is null or p_path not like 'expenses/%' or p_path like '%..%' then raise exception 'The receipt is not in the right folder' using errcode = '22023'; end if;
  if v_doc.receipt_path is not null and v_doc.status <> 'draft' then raise exception 'This voucher already has a receipt' using errcode = '23514'; end if;
  update public.expenses set receipt_path = p_path where id = p_id;
  return p_id;
end;
$$;

create function private.is_own_receipt(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.expenses where receipt_path = p_name and created_by = auth.uid());
$$;
create policy "own expense receipts: read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.is_own_receipt(name));

-- Names of users on documents (recorded by, approved by).
create function public.user_names(p_ids uuid[]) returns table (user_id uuid, full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('dashboard.view');
  return query select p.id, p.full_name from public.profiles p where p.id = any (p_ids);
end;
$$;

-- Vouchers with the names of who recorded and decided them.
create function public.expense_register(p_from date, p_to date, p_category_id uuid default null, p_status text default null)
returns table (expense_id uuid, doc_no text, expense_date date, category_en text, category_ur text, description text, payee text, method public.payment_method, reference text,
               account text, vehicle text, job_no text, amount numeric, has_receipt boolean, status text, recorded_by text, decided_by text, decided_at timestamptz, reason text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('expenses.view');
  return query
  select e.id, e.doc_no, e.expense_date, c.name_en, c.name_ur, e.description, e.payee, e.method, e.reference, fa.name, v.registration_no, j.doc_no, e.amount, e.receipt_path is not null,
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

-- Expenses by category from approved vouchers; salaries come from posted payrolls.
create function public.report_expenses(p_from date, p_to date)
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
    left join (select e.category_id, count(*) as n, sum(e.amount) as amount from public.expenses e
                where e.status = 'posted' and e.expense_date between p_from and p_to group by e.category_id) x on x.category_id = c.id
    left join (select count(distinct je.id) filter (where je.reversal_of is null and je.reversed_by is null) as runs, sum(l.debit - l.credit) as amount
                 from public.journal_entries je join public.journal_entry_lines l on l.journal_entry_id = je.id
                where je.status = 'posted' and je.source_type = 'payroll_run' and je.entry_date between p_from and p_to
                  and l.account_id = private.account_id('SALARIES_EXPENSE')) p on c.is_payroll
   order by c.name_en;
end;
$$;

-- ===========================================================================
-- 4. Payroll
-- ===========================================================================
alter table public.payroll_runs add column void_reason text;
alter table public.payroll_runs drop constraint payroll_runs_period_month_key;
create unique index payroll_runs_one_per_month on public.payroll_runs (period_month) where status <> 'void';
alter table public.salary_payments add column void_reason text;
alter table public.employee_advances add column void_reason text, add column method public.payment_method, add column reference text;
do $$
declare
  t text;
  v_cols text;
begin
  -- Written by the functions below only.
  foreach t in array array['payroll_runs', 'payroll_items', 'salary_payments', 'employee_advances'] loop
    execute format('drop policy "insert" on public.%I', t);
    execute format('drop policy "update" on public.%I', t);
    perform private.read_only(t);
    select string_agg(quote_ident(attname), ', ') into v_cols from pg_attribute
     where attrelid = format('public.%I', t)::regclass and attnum > 0 and not attisdropped;
    execute format('revoke insert (%s), update (%s) on public.%I from authenticated', v_cols, v_cols, t);
  end loop;
  grant delete on public.payroll_runs, public.employee_advances to authenticated;
end;
$$;

-- A draft payroll of a month with every employee who has a salary.
create function public.prepare_payroll(p_month date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_id uuid;
begin
  perform private.require_permission('payroll.manage');
  if v_month > private.business_today() then raise exception 'The salary period is in the future' using errcode = '22023'; end if;
  if exists (select 1 from public.payroll_runs where period_month = v_month and status <> 'void') then
    raise exception 'There already is a payroll for %', to_char(v_month, 'YYYY-MM') using errcode = '23514';
  end if;
  insert into public.payroll_runs (period_month) values (v_month) returning id into v_id;
  insert into public.payroll_items (payroll_run_id, employee_id, basic_salary)
  select v_id, e.id, s.base_salary
    from public.employees e join public.employee_salaries s on s.employee_id = e.id
   where e.status::text <> 'terminated' and s.base_salary > 0 and (e.hire_date is null or e.hire_date < (v_month + interval '1 month')::date);
  return v_id;
end;
$$;

-- p_lines: [{ "employee_id", "basic_salary", "allowances", "bonus", "deductions", "advance_recovery", "notes" }]
create function public.save_payroll(p_id uuid, p_lines jsonb, p_notes text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.payroll_runs%rowtype;
begin
  perform private.require_permission('payroll.manage');
  select * into v_run from public.payroll_runs where id = p_id for update;
  if v_run.id is null then raise exception 'Payroll run not found' using errcode = 'P0002'; end if;
  if v_run.status <> 'draft' then raise exception 'Payroll run % is already %', v_run.doc_no, v_run.status using errcode = '23514'; end if;
  delete from public.payroll_items where payroll_run_id = p_id;
  insert into public.payroll_items (payroll_run_id, employee_id, basic_salary, allowances, bonus, deductions, advance_recovery, notes)
  select p_id, l.employee_id, coalesce(l.basic_salary, 0), coalesce(l.allowances, 0), coalesce(l.bonus, 0), coalesce(l.deductions, 0), coalesce(l.advance_recovery, 0), nullif(trim(l.notes), '')
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb))
      as l(employee_id uuid, basic_salary numeric, allowances numeric, bonus numeric, deductions numeric, advance_recovery numeric, notes text);
  update public.payroll_runs set notes = nullif(trim(p_notes), '') where id = p_id;
  return p_id;
end;
$$;

-- Books the salaries of a month. Dated at the end of the month, or today while the month is running.
drop function public.post_payroll_run(uuid);
create function public.post_payroll_run(p_id uuid, p_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.payroll_runs%rowtype;
  v_item record;
  v_lines jsonb := '[]'::jsonb;
  v_expense numeric(18,2) := 0;
  v_date date;
  v_je uuid;
begin
  perform private.require_permission('payroll.post');
  select * into v_doc from public.payroll_runs where id = p_id for update;
  if v_doc.id is null then raise exception 'Payroll run not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Payroll run % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.payroll_items where payroll_run_id = p_id) then
    raise exception 'Payroll run has no employees' using errcode = '23514';
  end if;
  v_date := coalesce(p_date, least((v_doc.period_month + interval '1 month - 1 day')::date, private.business_today()));
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if v_date < v_doc.period_month then raise exception 'The date is before the salary period' using errcode = '22023'; end if;
  -- Two payrolls must not recover the same advance.
  perform 1 from public.employees e where e.id in (select employee_id from public.payroll_items where payroll_run_id = p_id) order by e.id for update;

  for v_item in select * from public.payroll_items where payroll_run_id = p_id order by employee_id loop
    if v_item.advance_recovery > private.employee_account_balance(v_item.employee_id, 'EMPLOYEE_ADVANCES') then
      raise exception 'Advance recovery exceeds the outstanding advance of an employee' using errcode = '23514';
    end if;
    v_expense := v_expense + v_item.gross_pay - v_item.deductions;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account', 'EMPLOYEE_ADVANCES', 'credit', v_item.advance_recovery, 'employee_id', v_item.employee_id),
      jsonb_build_object('account', 'SALARIES_PAYABLE', 'credit', v_item.net_pay, 'employee_id', v_item.employee_id));
  end loop;
  if v_expense <= 0 then raise exception 'The payroll has no amount' using errcode = '23514'; end if;

  v_je := private.post_journal(v_date, 'Payroll ' || to_char(v_doc.period_month, 'YYYY-MM') || ' (' || v_doc.doc_no || ')', 'payroll_run', v_doc.id,
    jsonb_build_array(jsonb_build_object('account', 'SALARIES_EXPENSE', 'debit', v_expense)) || v_lines);
  update public.payroll_runs
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

create function public.void_payroll_run(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.payroll_runs%rowtype;
begin
  perform private.require_permission('payroll.post');
  select * into v_doc from public.payroll_runs where id = p_id for update;
  if v_doc.id is null then raise exception 'Payroll run not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted payrolls can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if exists (select 1 from public.salary_payments sp join public.payroll_items i on i.id = sp.payroll_item_id where i.payroll_run_id = p_id and sp.status = 'posted') then
    raise exception 'Salaries of this payroll were paid; void those payments first' using errcode = '23514';
  end if;
  perform private.reverse_journal(v_doc.journal_entry_id, private.business_today(), trim(p_reason));
  update public.payroll_runs set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

-- Pays several salaries of one payroll, in full or in part: all of them or none. p_lines: [{ "payroll_item_id", "amount" }]
create function public.pay_salaries(p_run_id uuid, p_doc jsonb, p_lines jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.payroll_runs%rowtype;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_date date := coalesce((p_doc ->> 'date')::date, private.business_today());
  v_line record;
  v_id uuid;
  v_count integer := 0;
begin
  perform private.require_permission('payroll.pay');
  select * into v_run from public.payroll_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'Payroll run not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.salary_payments where client_request_id = v_request) then return 0; end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  for v_line in select * from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as l(payroll_item_id uuid, amount numeric) where l.amount <> 0 order by l.payroll_item_id loop
    if not exists (select 1 from public.payroll_items where id = v_line.payroll_item_id and payroll_run_id = p_run_id) then
      raise exception 'A salary does not belong to this payroll' using errcode = '23514';
    end if;
    insert into public.salary_payments (payroll_item_id, payment_date, amount, financial_account_id, method, reference, client_request_id)
    values (v_line.payroll_item_id, v_date, v_line.amount, (p_doc ->> 'financial_account_id')::uuid, (p_doc ->> 'method')::public.payment_method,
            nullif(trim(p_doc ->> 'reference'), ''), case when v_count = 0 then v_request end)
    returning id into v_id;
    perform public.post_salary_payment(v_id);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'Enter at least one amount' using errcode = '22023'; end if;
  return v_count;
end;
$$;

create function public.void_salary_payment(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.salary_payments%rowtype;
begin
  perform private.require_permission('payroll.pay');
  select * into v_doc from public.salary_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Salary payment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted payments can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.reverse_journal(v_doc.journal_entry_id, private.business_today(), trim(p_reason));
  update public.salary_payments set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

create function public.record_advance(p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_date date := coalesce((p_doc ->> 'date')::date, private.business_today());
  v_id uuid;
begin
  if not private.has_permission('payroll.pay') then
    perform private.require_permission('payroll.manage');
  end if;
  select id into v_id from public.employee_advances where client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if not exists (select 1 from public.employees where id = (p_doc ->> 'employee_id')::uuid and status::text <> 'terminated') then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  insert into public.employee_advances (employee_id, advance_date, amount, financial_account_id, method, reference, reason, client_request_id)
  values ((p_doc ->> 'employee_id')::uuid, v_date, (p_doc ->> 'amount')::numeric, (p_doc ->> 'financial_account_id')::uuid, (p_doc ->> 'method')::public.payment_method,
          nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'reason'), ''), v_request)
  returning id into v_id;
  if private.has_permission('payroll.pay') then
    perform public.post_employee_advance(v_id);
  end if;
  return v_id;
end;
$$;

create function public.void_advance(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.employee_advances%rowtype;
begin
  perform private.require_permission('payroll.pay');
  select * into v_doc from public.employee_advances where id = p_id for update;
  if v_doc.id is null then raise exception 'Advance not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted advances can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform 1 from public.employees where id = v_doc.employee_id for update;
  if private.employee_account_balance(v_doc.employee_id, 'EMPLOYEE_ADVANCES') < v_doc.amount then
    raise exception 'This advance was already recovered from a salary' using errcode = '23514';
  end if;
  perform private.reverse_journal(v_doc.journal_entry_id, private.business_today(), trim(p_reason));
  update public.employee_advances set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

-- Salary, outstanding advances and unpaid salaries of every employee, from the ledger.
create function public.payroll_employees()
returns table (employee_id uuid, code text, full_name text, full_name_ur text, job_title text, is_active boolean, base_salary numeric, advances numeric, payable numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('payroll.view');
  return query
  select e.id, e.employee_code, e.full_name, e.full_name_ur, e.job_title, e.status::text <> 'terminated', coalesce(s.base_salary, 0),
         private.employee_account_balance(e.id, 'EMPLOYEE_ADVANCES'), -private.employee_account_balance(e.id, 'SALARIES_PAYABLE')
    from public.employees e left join public.employee_salaries s on s.employee_id = e.id
   order by e.full_name;
end;
$$;

create function public.report_payroll(p_from date, p_to date, p_employee_id uuid default null)
returns table (payroll_item_id uuid, payroll_run_id uuid, doc_no text, period_month date, status public.document_status, employee_id uuid, code text, full_name text, full_name_ur text,
               basic_salary numeric, allowances numeric, bonus numeric, deductions numeric, advance_recovery numeric, gross_pay numeric, net_pay numeric, paid numeric, pending numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('payroll.view');
  return query
  select i.id, r.id, r.doc_no, r.period_month, r.status, e.id, e.employee_code, e.full_name, e.full_name_ur, i.basic_salary, i.allowances, i.bonus, i.deductions, i.advance_recovery,
         i.gross_pay, i.net_pay, coalesce(p.paid, 0), case when r.status = 'posted' then i.net_pay - coalesce(p.paid, 0) else 0 end
    from public.payroll_items i
    join public.payroll_runs r on r.id = i.payroll_run_id
    join public.employees e on e.id = i.employee_id
    left join (select sp.payroll_item_id, sum(sp.amount) as paid from public.salary_payments sp where sp.status = 'posted' group by sp.payroll_item_id) p on p.payroll_item_id = i.id
   where r.period_month between date_trunc('month', p_from)::date and p_to and r.status <> 'void'
     and (p_employee_id is null or e.id = p_employee_id)
   order by r.period_month desc, e.full_name;
end;
$$;

-- ===========================================================================
-- 5. Cash and bank
-- ===========================================================================
create table public.account_openings (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  financial_account_id uuid not null references public.financial_accounts (id),
  opening_date date not null,
  -- Negative for an overdrawn bank account.
  amount numeric(18,2) not null check (amount <> 0),
  status public.document_status not null default 'posted',
  journal_entry_id uuid references public.journal_entries (id),
  void_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index account_openings_one_per_account on public.account_openings (financial_account_id) where status = 'posted';
create trigger account_openings_doc_no before insert on public.account_openings for each row execute function private.assign_doc_no('AOB');

create table public.cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  kind text not null check (kind in ('receipt', 'payment')),
  voucher_date date not null default private.business_today(),
  financial_account_id uuid not null references public.financial_accounts (id),
  counter_account_id uuid not null references public.chart_of_accounts (id),
  amount numeric(18,2) not null check (amount > 0),
  party_name text,
  method public.payment_method not null,
  reference text,
  description text not null check (trim(description) <> ''),
  status public.document_status not null default 'posted',
  journal_entry_id uuid references public.journal_entries (id),
  void_reason text,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index cash_vouchers_account_idx on public.cash_vouchers (financial_account_id, voucher_date);
create index cash_vouchers_counter_idx on public.cash_vouchers (counter_account_id);
create function private.assign_voucher_no() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.doc_no := private.next_document_number(case new.kind when 'receipt' then 'RV' else 'PV' end);
  return new;
end;
$$;
create trigger cash_vouchers_doc_no before insert on public.cash_vouchers for each row execute function private.assign_voucher_no();

alter table public.fund_transfers add column void_reason text, add column method public.payment_method;
drop policy "insert" on public.fund_transfers;
drop policy "update" on public.fund_transfers;
drop policy if exists "delete" on public.fund_transfers;
select private.read_only('fund_transfers');
do $$
declare
  t text;
  v_cols text;
begin
  select string_agg(quote_ident(attname), ', ') into v_cols from pg_attribute
   where attrelid = 'public.fund_transfers'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke insert (%s), update (%s) on public.fund_transfers from authenticated', v_cols, v_cols);
  perform private.apply_policies('account_openings', private.p('cash_bank.view') || ' or ' || private.p('accounting.view'), null, null, null);
  perform private.apply_policies('cash_vouchers', private.p('cash_bank.view') || ' or ' || private.p('accounting.view'), null, null, null);
  perform private.apply_policies('cash_closings', private.p('cash_bank.view') || ' or ' || private.p('cash_bank.close'), null, null, null);
  foreach t in array array['account_openings', 'cash_vouchers', 'cash_closings'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit_row()', t);
  end loop;
end;
$$;

create function public.record_account_opening(p_account_id uuid, p_amount numeric, p_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_account public.financial_accounts%rowtype;
  v_date date := coalesce(p_date, private.business_today());
  v_id uuid;
  v_je uuid;
begin
  perform private.require_permission('cash_bank.manage');
  select * into v_account from public.financial_accounts where id = p_account_id for no key update;
  if v_account.id is null then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'The amount is missing' using errcode = '22023'; end if;
  if v_account.account_type = 'cash' and p_amount < 0 then raise exception 'Cash cannot be negative' using errcode = '22023'; end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if exists (select 1 from public.account_openings where financial_account_id = p_account_id and status = 'posted') then
    raise exception 'This account already has an opening balance; void it first' using errcode = '23514';
  end if;
  insert into public.account_openings (financial_account_id, opening_date, amount) values (p_account_id, v_date, p_amount) returning id into v_id;
  v_je := private.post_journal(v_date, 'Opening balance of ' || v_account.name, 'account_opening', v_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_account.gl_account_id, 'debit', greatest(p_amount, 0), 'credit', greatest(-p_amount, 0)),
      jsonb_build_object('account', 'OPENING_EQUITY', 'debit', greatest(-p_amount, 0), 'credit', greatest(p_amount, 0))));
  update public.account_openings set journal_entry_id = v_je where id = v_id;
  return v_id;
end;
$$;

create function public.void_account_opening(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.account_openings%rowtype;
begin
  perform private.require_permission('cash_bank.manage');
  select * into v_doc from public.account_openings where id = p_id for update;
  if v_doc.id is null then raise exception 'Opening balance not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'The opening balance is already void' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.reverse_journal(v_doc.journal_entry_id, v_doc.opening_date, trim(p_reason));
  update public.account_openings set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

-- Deposit (cash to bank), withdrawal (bank to cash) or transfer between two accounts of a kind.
create function public.record_fund_transfer(p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_date date := coalesce((p_doc ->> 'date')::date, private.business_today());
  v_id uuid;
begin
  perform private.require_permission('cash_bank.transfer');
  select id into v_id from public.fund_transfers where client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  insert into public.fund_transfers (transfer_date, from_account_id, to_account_id, amount, method, reference, notes, client_request_id)
  values (v_date, (p_doc ->> 'from_account_id')::uuid, (p_doc ->> 'to_account_id')::uuid, (p_doc ->> 'amount')::numeric, (p_doc ->> 'method')::public.payment_method,
          nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'notes'), ''), v_request)
  returning id into v_id;
  perform public.post_fund_transfer(v_id);
  return v_id;
end;
$$;

create function public.void_fund_transfer(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.fund_transfers%rowtype;
begin
  perform private.require_permission('cash_bank.transfer');
  select * into v_doc from public.fund_transfers where id = p_id for update;
  if v_doc.id is null then raise exception 'Transfer not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted transfers can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.reverse_journal(v_doc.journal_entry_id, private.business_today(), trim(p_reason));
  update public.fund_transfers set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

-- Accounts a receipt or payment voucher may use. Everything that has its own document is excluded, so that money
-- from a customer can never become revenue a second time, nor money to a supplier a second purchase or an expense.
create function private.voucher_account_ok(p_account public.chart_of_accounts, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_account.is_postable and p_account.is_active
     and not exists (select 1 from public.financial_accounts fa where fa.gl_account_id = p_account.id)
     and case
           when p_account.system_key in ('AR', 'AP_PRINCIPAL', 'AP_SUPPLIERS', 'EMPLOYEE_ADVANCES', 'SALARIES_PAYABLE', 'CASH_WITH_COLLECTORS', 'INVENTORY',
                                         'SALES', 'SALES_RETURNS', 'SOL_REVENUE', 'OPENING_EQUITY', 'RETAINED_EARNINGS') then false
           when p_account.account_type = 'expense' then false
           when p_account.account_type = 'income' then p_kind = 'receipt'
           else true
         end;
$$;

create function public.list_voucher_accounts(p_kind text)
returns table (account_id uuid, code text, name_en text, name_ur text, account_type public.account_type)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('accounting.journal');
  return query select a.id, a.code, a.name_en, a.name_ur, a.account_type from public.chart_of_accounts a where private.voucher_account_ok(a, p_kind) order by a.code;
end;
$$;

-- Money that belongs to no other document: owner's capital and drawings, loans, other income, fixed assets, taxes paid.
create function public.record_cash_voucher(p_doc jsonb) returns uuid
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
  insert into public.cash_vouchers (kind, voucher_date, financial_account_id, counter_account_id, amount, party_name, method, reference, description, client_request_id)
  values (v_kind, v_date, (p_doc ->> 'financial_account_id')::uuid, v_account.id, v_amount, nullif(trim(p_doc ->> 'party_name'), ''), (p_doc ->> 'method')::public.payment_method,
          nullif(trim(p_doc ->> 'reference'), ''), p_doc ->> 'description', v_request)
  returning * into v_row;
  v_je := private.post_journal(v_date, case v_kind when 'receipt' then 'Receipt ' else 'Payment ' end || v_row.doc_no || ': ' || v_row.description, 'cash_voucher', v_row.id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_gl, case v_kind when 'receipt' then 'debit' else 'credit' end, v_amount),
      jsonb_build_object('account_id', v_account.id, case v_kind when 'receipt' then 'credit' else 'debit' end, v_amount)));
  update public.cash_vouchers set journal_entry_id = v_je where id = v_row.id;
  return v_row.id;
end;
$$;

create function public.void_cash_voucher(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_vouchers%rowtype;
begin
  perform private.require_permission('accounting.journal');
  select * into v_doc from public.cash_vouchers where id = p_id for update;
  if v_doc.id is null then raise exception 'Voucher not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted vouchers can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.reverse_journal(v_doc.journal_entry_id, private.business_today(), trim(p_reason));
  update public.cash_vouchers set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

-- Balance of a ledger account up to and including a date.
create function private.gl_balance(p_account_id uuid, p_date date default 'infinity') returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.debit - l.credit), 0)
    from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
   where l.account_id = p_account_id and e.entry_date <= p_date;
$$;

-- What each account had, took in, gave out and has. Each column is its effect on the balance, so the row adds up.
create function public.report_cash_accounts(p_from date, p_to date)
returns table (account_id uuid, name text, account_type public.financial_account_type, is_active boolean, opening numeric, receipts numeric, payments numeric,
               deposits numeric, withdrawals numeric, transfers numeric, closing numeric, closed_until date)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission('accounting.view') then
    perform private.require_permission('cash_bank.view');
  end if;
  return query
  with lines as (
    select fa.id, l.debit - l.credit as effect, e.entry_date, e.source_type,
           -- A reversal undoes the original movement instead of being a movement the other way.
           case when e.reversal_of is null then l.debit > 0 else l.credit > 0 end as incoming,
           case when e.source_type = 'fund_transfer' then (
             select case when f.account_type = 'cash' and t.account_type = 'bank' then 'deposit' when f.account_type = 'bank' and t.account_type = 'cash' then 'withdrawal' else 'transfer' end
               from public.fund_transfers ft join public.financial_accounts f on f.id = ft.from_account_id join public.financial_accounts t on t.id = ft.to_account_id
              where ft.id = e.source_id) end as transfer_kind
      from public.financial_accounts fa
      join public.journal_entry_lines l on l.account_id = fa.gl_account_id
      join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date <= p_to
  ), s as (
    select id,
           coalesce(sum(effect) filter (where entry_date < p_from or source_type = 'account_opening'), 0) as opening,
           coalesce(sum(effect) filter (where entry_date >= p_from and transfer_kind is null and source_type is distinct from 'account_opening' and incoming), 0) as receipts,
           coalesce(sum(effect) filter (where entry_date >= p_from and transfer_kind is null and source_type is distinct from 'account_opening' and not incoming), 0) as payments,
           coalesce(sum(effect) filter (where entry_date >= p_from and transfer_kind = 'deposit'), 0) as deposits,
           coalesce(sum(effect) filter (where entry_date >= p_from and transfer_kind = 'withdrawal'), 0) as withdrawals,
           coalesce(sum(effect) filter (where entry_date >= p_from and transfer_kind = 'transfer'), 0) as transfers,
           sum(effect) as closing
      from lines group by id)
  select fa.id, fa.name, fa.account_type, fa.is_active, coalesce(s.opening, 0), coalesce(s.receipts, 0), coalesce(s.payments, 0), coalesce(s.deposits, 0), coalesce(s.withdrawals, 0),
         coalesce(s.transfers, 0), coalesce(s.closing, 0), private.cash_closed_until(fa.id)
    from public.financial_accounts fa left join s on s.id = fa.id
   order by fa.account_type, fa.name;
end;
$$;

-- ===========================================================================
-- 6. Daily cash closing
-- ===========================================================================
-- What the books say the cash box holds at the end of a day.
create function private.cash_day(p_account_id uuid, p_date date)
returns table (opened_after date, opening numeric, receipts numeric, payments numeric, expected numeric)
language sql stable security definer set search_path = '' as $$
  select c.until, private.gl_balance(fa.gl_account_id, coalesce(c.until, '-infinity')),
         coalesce(x.receipts, 0), coalesce(x.payments, 0), private.gl_balance(fa.gl_account_id, p_date)
    from public.financial_accounts fa
    cross join lateral (select private.cash_closed_until(fa.id) as until) c
    left join lateral (
      select sum(l.debit) as receipts, sum(l.credit) as payments
        from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
       where l.account_id = fa.gl_account_id and e.entry_date <= p_date and (c.until is null or e.entry_date > c.until)) x on true
   where fa.id = p_account_id;
$$;

create function public.cash_day(p_account_id uuid, p_date date)
returns table (opened_after date, opening numeric, receipts numeric, payments numeric, expected numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission('cash_bank.close') then
    perform private.require_permission('cash_bank.view');
  end if;
  return query select * from private.cash_day(p_account_id, p_date);
end;
$$;

create function public.close_cash_day(p_account_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_account public.financial_accounts%rowtype;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_date date := coalesce((p_doc ->> 'date')::date, private.business_today());
  v_counted numeric(18,2) := (p_doc ->> 'counted')::numeric;
  v_notes text := nullif(trim(p_doc ->> 'notes'), '');
  v_day record;
  v_id uuid := gen_random_uuid();
  v_existing uuid;
  v_je uuid;
  v_diff numeric(18,2);
begin
  perform private.require_permission('cash_bank.close');
  -- Nothing is posted while the day is counted and closed.
  perform pg_advisory_xact_lock(771109);
  select id into v_existing from public.cash_closings where client_request_id = v_request;
  if v_existing is not null then return v_existing; end if;
  -- No row lock: a voucher being posted holds its account and waits for the lock above.
  select * into v_account from public.financial_accounts where id = p_account_id;
  if v_account.id is null then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if v_account.account_type <> 'cash' then raise exception 'Only cash accounts are closed daily' using errcode = '23514'; end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if v_counted is null or v_counted < 0 then raise exception 'Enter the counted cash' using errcode = '22023'; end if;
  if v_date <= private.cash_closed_until(p_account_id) then
    raise exception 'This cash is already closed until %', private.cash_closed_until(p_account_id) using errcode = '23514';
  end if;
  select * into v_day from private.cash_day(p_account_id, v_date);
  v_diff := v_counted - v_day.expected;
  if v_diff <> 0 and v_notes is null then raise exception 'Explain the difference of %', v_diff using errcode = '22023'; end if;
  if v_diff <> 0 and coalesce((p_doc ->> 'post_difference')::boolean, false) then
    v_je := private.post_journal(v_date, 'Cash difference of ' || v_account.name || ': ' || v_notes, 'cash_closing', v_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_account.gl_account_id, 'debit', greatest(v_diff, 0), 'credit', greatest(-v_diff, 0)),
        jsonb_build_object('account', 'CASH_OVER_SHORT', 'debit', greatest(-v_diff, 0), 'credit', greatest(v_diff, 0))));
  end if;
  insert into public.cash_closings (id, financial_account_id, closing_date, opening_balance, receipts, payments, expected, counted, difference_entry_id, denominations, notes, client_request_id)
  values (v_id, p_account_id, v_date, v_day.opening, v_day.receipts, v_day.payments, v_day.expected, v_counted, v_je, p_doc -> 'denominations', v_notes, v_request);
  return v_id;
end;
$$;

-- Only the latest closing of an account can be reopened. A booked difference is reversed on the same day.
create function public.reopen_cash_day(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_closings%rowtype;
begin
  perform private.require_permission('cash_bank.close');
  perform pg_advisory_xact_lock(771109);
  select * into v_doc from public.cash_closings where id = p_id for update;
  if v_doc.id is null then raise exception 'Closing not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'closed' then raise exception 'This day is already open' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if v_doc.closing_date <> private.cash_closed_until(v_doc.financial_account_id) then
    raise exception 'Reopen the later days first' using errcode = '23514';
  end if;
  if exists (select 1 from public.accounting_periods where status = 'closed' and v_doc.closing_date between start_date and end_date) then
    raise exception 'Accounting period for % is closed', v_doc.closing_date using errcode = '23514';
  end if;
  update public.cash_closings set status = 'reopened', reopen_reason = trim(p_reason), reopened_at = now(), reopened_by = auth.uid() where id = p_id;
  if v_doc.difference_entry_id is not null then
    perform private.reverse_journal(v_doc.difference_entry_id, v_doc.closing_date, trim(p_reason));
  end if;
  return p_id;
end;
$$;

-- ===========================================================================
-- 7. Chart of accounts and manual journals
-- ===========================================================================
alter table public.chart_of_accounts
  -- Section of the cash flow statement; by default derived from the type.
  add column cash_flow text check (cash_flow in ('operating', 'investing', 'financing'));
update public.chart_of_accounts set cash_flow = 'investing' where code = '1600';
update public.chart_of_accounts set cash_flow = 'operating' where system_key = 'TAX_OUTPUT';
select private.restrict_columns('chart_of_accounts', array['created_at', 'created_by', 'updated_at', 'updated_by', 'system_key']);

create or replace function private.guard_system_account() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_parent public.chart_of_accounts%rowtype;
  v_used boolean;
begin
  if tg_op = 'DELETE' then
    if old.system_key is not null then
      raise exception 'System account % cannot be deleted', old.code using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.system_key is not null
       and (new.system_key is distinct from old.system_key
            or new.account_type is distinct from old.account_type
            or new.is_postable is distinct from old.is_postable) then
      raise exception 'Type, posting flag and key of system account % cannot change', old.code
        using errcode = '42501';
    end if;
    v_used := exists (select 1 from public.journal_entry_lines where account_id = old.id);
    if v_used and (new.account_type is distinct from old.account_type or (old.is_postable and not new.is_postable)) then
      raise exception 'Account % has entries; its type cannot change', old.code using errcode = '23514';
    end if;
    if old.is_active and not new.is_active then
      if old.system_key is not null then raise exception 'System account % cannot be deactivated', old.code using errcode = '42501'; end if;
      if v_used and private.gl_balance(old.id) <> 0 then raise exception 'Account % still has a balance', old.code using errcode = '23514'; end if;
    end if;
  end if;
  if new.parent_id is not null then
    select * into v_parent from public.chart_of_accounts where id = new.parent_id;
    if v_parent.account_type <> new.account_type then raise exception 'An account has the type of its group' using errcode = '23514'; end if;
    if v_parent.is_postable then raise exception 'Account % is not a group', v_parent.code using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
drop trigger chart_of_accounts_guard on public.chart_of_accounts;
create trigger chart_of_accounts_guard before insert or update or delete on public.chart_of_accounts
  for each row execute function private.guard_system_account();

-- Renaming a cash or bank account renames its ledger account.
create function private.sync_financial_gl_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.chart_of_accounts set name_en = new.name, name_ur = new.name where id = new.gl_account_id;
  return new;
end;
$$;
create trigger financial_accounts_rename after update of name on public.financial_accounts
  for each row when (old.name is distinct from new.name) execute function private.sync_financial_gl_name();

-- Accounts that only documents may change, so that they always equal their documents.
create function private.document_account(p_account_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select system_key in ('SALES', 'SALES_RETURNS', 'SOL_REVENUE', 'INVENTORY', 'COGS', 'CASH_WITH_COLLECTORS', 'SALARIES_PAYABLE', 'EMPLOYEE_ADVANCES')
                     from public.chart_of_accounts where id = p_account_id), false);
$$;

create or replace function public.create_manual_journal(p_date date, p_description text, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_request uuid;
  v_id uuid;
  v_code text;
begin
  perform private.require_permission('accounting.journal');
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'At least two lines are required' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where l ? 'account') then
    raise exception 'Manual journals must reference accounts by account_id' using errcode = '22023';
  end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'The description is missing' using errcode = '22023'; end if;
  if p_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  select a.code into v_code from jsonb_array_elements(p_lines) l join public.chart_of_accounts a on a.id = (l ->> 'account_id')::uuid
   where private.document_account(a.id) limit 1;
  if v_code is not null then
    raise exception 'Account % is changed by its documents only', v_code using errcode = '23514';
  end if;
  -- The request of the form, so that a repeated submission does not post twice.
  v_request := (p_lines -> 0 ->> 'client_request_id')::uuid;
  if v_request is not null then
    select id into v_id from public.journal_entries where source_type = 'manual' and source_id = v_request and reversal_of is null;
    if v_id is not null then return v_id; end if;
  end if;
  return private.post_journal(p_date, trim(p_description), 'manual', v_request, p_lines);
end;
$$;

create or replace function public.reverse_manual_journal(p_entry_id uuid, p_date date, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('accounting.journal');
  if not exists (select 1 from public.journal_entries where id = p_entry_id and source_type = 'manual') then
    raise exception 'Only manual journal entries can be reversed directly' using errcode = '23514';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  return private.reverse_journal(p_entry_id, p_date, trim(p_reason));
end;
$$;

-- ===========================================================================
-- 8. Ledgers and books
-- ===========================================================================
-- Number of the document behind an entry.
create function private.source_number(p_type text, p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'sales_invoice' then (select doc_no from public.sales_invoices where id = p_id)
    when 'customer_payment' then (select doc_no from public.customer_payments where id = p_id)
    when 'customer_return' then (select doc_no from public.customer_returns where id = p_id)
    when 'customer_note' then (select doc_no from public.customer_notes where id = p_id)
    when 'cash_deposit' then (select doc_no from public.cash_deposits where id = p_id)
    when 'goods_receipt' then (select doc_no from public.goods_receipts where id = p_id)
    when 'supplier_invoice' then (select doc_no from public.supplier_invoices where id = p_id)
    when 'supplier_payment' then (select doc_no from public.supplier_payments where id = p_id)
    when 'supplier_return' then (select doc_no from public.supplier_returns where id = p_id)
    when 'stock_adjustment' then (select doc_no from public.stock_adjustments where id = p_id)
    when 'expense' then (select doc_no from public.expenses where id = p_id)
    when 'employee_advance' then (select doc_no from public.employee_advances where id = p_id)
    when 'payroll_run' then (select doc_no from public.payroll_runs where id = p_id)
    when 'salary_payment' then (select doc_no from public.salary_payments where id = p_id)
    when 'fund_transfer' then (select doc_no from public.fund_transfers where id = p_id)
    when 'account_opening' then (select doc_no from public.account_openings where id = p_id)
    when 'cash_voucher' then (select doc_no from public.cash_vouchers where id = p_id)
    when 'cash_closing' then (select doc_no from public.cash_closings where id = p_id)
    when 'sol_job' then (select doc_no from public.sol_jobs where id = p_id)
    when 'sol_delivery' then (select doc_no from public.sol_deliveries where id = p_id)
    when 'sol_return' then (select doc_no from public.sol_returns where id = p_id)
  end;
$$;

-- Customer, supplier or employee an entry is about.
create function private.entry_party(p_entry_id uuid) returns table (name text, name_ur text)
language sql stable security definer set search_path = '' as $$
  select coalesce(c.name, s.name, e.full_name), coalesce(c.name_ur, s.name_ur, e.full_name_ur)
    from public.journal_entry_lines l
    left join public.customers c on c.id = l.customer_id
    left join public.suppliers s on s.id = l.supplier_id
    left join public.employees e on e.id = l.employee_id
   where l.journal_entry_id = p_entry_id and num_nonnulls(l.customer_id, l.supplier_id, l.employee_id) > 0
   order by l.line_no limit 1;
$$;

create function private.account_lines(p_account_id uuid, p_from date, p_to date)
returns table (entry_id uuid, entry_date date, doc_no text, source_type text, source_id uuid, source_no text, is_reversal boolean, description text, party text, party_ur text,
               debit numeric, credit numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_opening numeric := private.gl_balance(p_account_id, p_from - 1);
begin
  return query select null::uuid, p_from, null::text, 'brought_forward'::text, null::uuid, null::text, false, null::text, null::text, null::text, 0::numeric, 0::numeric, v_opening;
  return query
  select e.id, e.entry_date, e.doc_no, e.source_type, e.source_id, private.source_number(e.source_type, e.source_id), e.reversal_of is not null, coalesce(l.description, e.description),
         p.name, p.name_ur, l.debit, l.credit, v_opening + sum(l.debit - l.credit) over (order by e.entry_date, e.doc_no, l.line_no)
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date between p_from and p_to
    left join lateral private.entry_party(e.id) p on true
   where l.account_id = p_account_id
   order by e.entry_date, e.doc_no, l.line_no;
end;
$$;

create function public.general_ledger(p_account_id uuid, p_from date, p_to date)
returns table (entry_id uuid, entry_date date, doc_no text, source_type text, source_id uuid, source_no text, is_reversal boolean, description text, party text, party_ur text,
               debit numeric, credit numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('accounting.view');
  return query select * from private.account_lines(p_account_id, p_from, p_to);
end;
$$;

-- Cash book and bank book.
create function public.account_book(p_financial_account_id uuid, p_from date, p_to date)
returns table (entry_id uuid, entry_date date, doc_no text, source_type text, source_id uuid, source_no text, is_reversal boolean, description text, party text, party_ur text,
               debit numeric, credit numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_gl uuid;
begin
  if not private.has_permission('accounting.view') then
    perform private.require_permission('cash_bank.view');
  end if;
  select gl_account_id into v_gl from public.financial_accounts where id = p_financial_account_id;
  if v_gl is null then raise exception 'Account not found' using errcode = 'P0002'; end if;
  return query select * from private.account_lines(v_gl, p_from, p_to);
end;
$$;

create function public.list_journal(p_from date, p_to date, p_source text default null, p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (entry_id uuid, entry_date date, doc_no text, source_type text, source_id uuid, source_no text, description text, amount numeric, reversal_of uuid, reversed_by uuid, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('accounting.view');
  return query
  with page as (
    select e.*, count(*) over () as total
      from public.journal_entries e
     where e.status = 'posted' and e.entry_date between p_from and p_to
       and (p_source is null or e.source_type = p_source)
       and (p_search is null or e.doc_no ilike '%' || p_search || '%' or e.description ilike '%' || p_search || '%')
     order by e.entry_date desc, e.doc_no desc
     limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0))
  select p.id, p.entry_date, p.doc_no, p.source_type, p.source_id, private.source_number(p.source_type, p.source_id), p.description,
         (select sum(l.debit) from public.journal_entry_lines l where l.journal_entry_id = p.id), p.reversal_of, p.reversed_by, p.total
    from page p order by p.entry_date desc, p.doc_no desc;
end;
$$;

create function public.journal_lines(p_entry_id uuid)
returns table (line_no integer, account_id uuid, code text, name_en text, name_ur text, party text, party_ur text, description text, debit numeric, credit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('accounting.view');
  return query
  select l.line_no, a.id, a.code, a.name_en, a.name_ur, coalesce(c.name, s.name, e.full_name), coalesce(c.name_ur, s.name_ur, e.full_name_ur), l.description, l.debit, l.credit
    from public.journal_entry_lines l
    join public.chart_of_accounts a on a.id = l.account_id
    left join public.customers c on c.id = l.customer_id
    left join public.suppliers s on s.id = l.supplier_id
    left join public.employees e on e.id = l.employee_id
   where l.journal_entry_id = p_entry_id order by l.line_no;
end;
$$;

-- ===========================================================================
-- 9. Statements. Every figure is read from posted journal lines.
-- ===========================================================================
create function public.report_trial_balance(p_from date, p_to date)
returns table (account_id uuid, code text, name_en text, name_ur text, account_type public.account_type, opening_debit numeric, opening_credit numeric, debit numeric, credit numeric,
               closing_debit numeric, closing_credit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('reports.financial');
  return query
  select a.id, a.code, a.name_en, a.name_ur, a.account_type, greatest(x.opening, 0), greatest(-x.opening, 0), x.debit, x.credit,
         greatest(x.opening + x.debit - x.credit, 0), greatest(-(x.opening + x.debit - x.credit), 0)
    from (select l.account_id as id,
                 coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0) as opening,
                 coalesce(sum(l.debit) filter (where e.entry_date >= p_from), 0) as debit,
                 coalesce(sum(l.credit) filter (where e.entry_date >= p_from), 0) as credit
            from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
           where e.entry_date <= p_to group by l.account_id) x
    join public.chart_of_accounts a on a.id = x.id
   order by a.code;
end;
$$;

-- section: sales, cost, other_income (SOL and other), expense. Amounts are positive when they are usual for the section.
create function public.income_statement(p_from date, p_to date)
returns table (section text, account_id uuid, code text, name_en text, name_ur text, system_key text, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('reports.financial');
  return query
  select case when a.system_key in ('SALES', 'SALES_RETURNS') then 'sales'
              when a.account_type = 'income' then 'other_income'
              when g.code = '5000' then 'cost' else 'expense' end,
         a.id, a.code, a.name_en, a.name_ur, a.system_key,
         case when a.account_type = 'income' then sum(l.credit - l.debit) else sum(l.debit - l.credit) end
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date between p_from and p_to
    join public.chart_of_accounts a on a.id = l.account_id and a.account_type in ('income', 'expense')
    left join public.chart_of_accounts g on g.id = a.parent_id
   group by a.id, g.code
  having sum(l.debit) <> 0 or sum(l.credit) <> 0
   order by a.code;
end;
$$;

-- Party balances the other way round are shown on the other side: an advance of a customer is a liability, an overdrawn
-- bank account too. The result of the business so far is part of equity.
create function public.balance_sheet(p_as_of date)
returns table (section text, code text, account_id uuid, name_en text, name_ur text, system_key text, flipped boolean, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('reports.financial');
  return query
  with lines as (
    select a.id, a.code, a.name_en, a.name_ur, a.system_key, a.account_type, l.debit - l.credit as net,
           case when a.system_key in ('AR', 'AP_PRINCIPAL', 'AP_SUPPLIERS', 'EMPLOYEE_ADVANCES', 'SALARIES_PAYABLE', 'CASH_WITH_COLLECTORS')
                then coalesce(l.customer_id, l.supplier_id, l.employee_id) end as party,
           (a.system_key in ('AR', 'AP_PRINCIPAL', 'AP_SUPPLIERS', 'EMPLOYEE_ADVANCES', 'SALARIES_PAYABLE', 'CASH_WITH_COLLECTORS')
            or exists (select 1 from public.financial_accounts fa where fa.gl_account_id = a.id)) is true as split
      from public.journal_entry_lines l
      join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date <= p_as_of
      join public.chart_of_accounts a on a.id = l.account_id
  ), parties as (
    select id, code, name_en, name_ur, system_key, account_type, split, sum(net) as net from lines where account_type in ('asset', 'liability', 'equity') group by 1, 2, 3, 4, 5, 6, 7, party
  ), sides as (
    select p.*, case when p.split then case when p.net > 0 then 'asset' else 'liability' end else p.account_type::text end as side from parties p where p.net <> 0
  )
  select s.side, s.code, s.id, s.name_en, s.name_ur, s.system_key, s.side <> s.account_type::text, sum(case when s.side = 'asset' then s.net else -s.net end)
    from sides s group by s.side, s.code, s.id, s.name_en, s.name_ur, s.system_key, s.account_type
  having sum(s.net) <> 0
  union all
  select 'equity', '9999', null, 'Result to date', 'اب تک کا نتیجہ', 'RESULT', false, coalesce(sum(-l.net), 0) from lines l where l.account_type in ('income', 'expense')
  order by 1, 2;
end;
$$;

-- Direct method. An entry that moves cash is explained by its other lines: their credits less debits are exactly the change in cash.
create function public.cash_flow(p_from date, p_to date)
returns table (section text, line text, account_id uuid, code text, name_en text, name_ur text, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('reports.financial');
  return query
  with cash as (select gl_account_id as id from public.financial_accounts),
  entries as (
    select distinct e.id from public.journal_entries e join public.journal_entry_lines l on l.journal_entry_id = e.id
     where e.status = 'posted' and e.entry_date between p_from and p_to and l.account_id in (select id from cash)),
  contra as (
    select a.*, l.credit - l.debit as effect
      from entries n join public.journal_entry_lines l on l.journal_entry_id = n.id and l.account_id not in (select id from cash)
      join public.chart_of_accounts a on a.id = l.account_id),
  flows as (
    select case when c.system_key = 'OPENING_EQUITY' then 'opening_balances'
                when c.cash_flow is not null then c.cash_flow
                when c.account_type = 'equity' then 'financing'
                when c.account_type = 'liability' and c.system_key is null then 'financing'
                else 'operating' end as section,
           case when c.system_key in ('AR', 'CASH_WITH_COLLECTORS') then 'customers'
                when c.system_key = 'AP_PRINCIPAL' then 'company' when c.system_key = 'AP_SUPPLIERS' then 'suppliers'
                when c.system_key = 'SALARIES_PAYABLE' then 'salaries' when c.system_key = 'EMPLOYEE_ADVANCES' then 'advances'
                when c.account_type = 'expense' then 'expenses' else 'account' end as line,
           c.id, c.code, c.name_en, c.name_ur, c.effect
      from contra c)
  select 'opening', 'opening', null::uuid, null::text, null::text, null::text, coalesce(sum(private.gl_balance(c.id, p_from - 1)), 0) from cash c
  union all
  select f.section, f.line, case when f.line in ('account', 'expenses') then f.id end, case when f.line in ('account', 'expenses') then f.code end,
         case when f.line in ('account', 'expenses') then f.name_en end, case when f.line in ('account', 'expenses') then f.name_ur end, sum(f.effect)
    from flows f group by 1, 2, 3, 4, 5, 6 having sum(f.effect) <> 0
  union all
  select 'closing', 'closing', null, null, null, null, coalesce(sum(private.gl_balance(c.id, p_to)), 0) from cash c;
end;
$$;

-- ===========================================================================
-- 10. Checks: the ledger against the documents
-- ===========================================================================
create function private.source_effect(p_system_key text, p_sources text[]) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.debit - l.credit), 0)
    from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
   where l.account_id = private.account_id(p_system_key) and e.source_type = any (p_sources);
$$;

-- `ledger` and `documents` must be equal in every row.
create function private.ledger_checks() returns table (check_code text, ledger numeric, documents numeric)
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
       - coalesce((select sum(amount) from public.expenses where status = 'posted'), 0)
       - coalesce((select sum(amount) from public.employee_advances where status = 'posted'), 0)
       - coalesce((select sum(amount) from public.salary_payments where status = 'posted'), 0)
       + coalesce((select sum(difference) from public.cash_closings where status = 'closed' and difference_entry_id is not null), 0)
       + coalesce((select sum(l.debit - l.credit) from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
                    where e.source_type = 'manual' and l.account_id in (select gl_account_id from public.financial_accounts)), 0)
  union all
  -- Receiving money for a sale is not revenue; paying for a purchase is neither a purchase nor an expense.
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

create function public.ledger_checks() returns table (check_code text, ledger numeric, documents numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission('accounting.view') then
    perform private.require_permission('reports.financial');
  end if;
  return query select * from private.ledger_checks();
end;
$$;

-- ===========================================================================
-- 11. Accounting periods
-- ===========================================================================
alter table public.accounting_periods
  add column reopen_reason text,
  add column reopened_at timestamptz,
  add column reopened_by uuid,
  -- Totals at the time of closing: debit, credit, result.
  add column closing_totals jsonb;
drop policy "insert" on public.accounting_periods;
drop policy "update" on public.accounting_periods;
drop policy if exists "delete" on public.accounting_periods;
drop policy "select" on public.accounting_periods;
create policy "select" on public.accounting_periods for select to authenticated using (
  (select private.has_permission('accounting.view')) or (select private.has_permission('accounting.close')) or (select private.has_permission('reports.financial')));
select private.read_only('accounting_periods');
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(attname), ', ') into v_cols from pg_attribute
   where attrelid = 'public.accounting_periods'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke insert (%s), update (%s) on public.accounting_periods from authenticated', v_cols, v_cols);
end;
$$;

create function public.create_period(p_month date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_id uuid;
begin
  perform private.require_permission('accounting.close');
  if exists (select 1 from public.accounting_periods where daterange(start_date, end_date, '[]') && daterange(v_start, (v_start + interval '1 month - 1 day')::date, '[]')) then
    raise exception 'A period for % already exists', to_char(v_start, 'YYYY-MM') using errcode = '23514';
  end if;
  insert into public.accounting_periods (name, start_date, end_date)
  values (to_char(v_start, 'YYYY-MM'), v_start, (v_start + interval '1 month - 1 day')::date) returning id into v_id;
  return v_id;
end;
$$;

-- What stands in the way of closing a period. `found` must be 0 for each.
create function private.period_checklist(p_id uuid) returns table (check_code text, found bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.accounting_periods%rowtype;
begin
  select * into v from public.accounting_periods where id = p_id;
  return query
  select 'not_ended', (v.end_date >= private.business_today())::integer::bigint
  union all
  select 'earlier_open', (select count(*) from public.journal_entries e where e.status = 'posted' and e.entry_date < v.start_date
                             and not exists (select 1 from public.accounting_periods p where p.status = 'closed' and e.entry_date between p.start_date and p.end_date))
  union all select 'draft_expenses', (select count(*) from public.expenses where status = 'draft' and expense_date between v.start_date and v.end_date)
  union all select 'draft_customer_payments', (select count(*) from public.customer_payments where status = 'draft' and payment_date between v.start_date and v.end_date)
  union all select 'draft_supplier_payments', (select count(*) from public.supplier_payments where status = 'draft' and payment_date between v.start_date and v.end_date)
  union all select 'draft_cash_deposits', (select count(*) from public.cash_deposits where status = 'draft' and deposit_date between v.start_date and v.end_date)
  union all select 'draft_receipts', (select count(*) from public.goods_receipts where status = 'draft' and receipt_date between v.start_date and v.end_date)
  union all select 'draft_bills', (select count(*) from public.supplier_invoices where status = 'draft' and invoice_date between v.start_date and v.end_date)
  union all select 'draft_returns', (select count(*) from public.customer_returns where status = 'draft' and return_date between v.start_date and v.end_date)
                                  + (select count(*) from public.supplier_returns where status = 'draft' and return_date between v.start_date and v.end_date)
  union all select 'draft_adjustments', (select count(*) from public.stock_adjustments where status = 'draft' and adjustment_date between v.start_date and v.end_date)
  union all select 'draft_advances', (select count(*) from public.employee_advances where status = 'draft' and advance_date between v.start_date and v.end_date)
  union all select 'draft_payroll', (select count(*) from public.payroll_runs where status = 'draft' and period_month between v.start_date and v.end_date)
  union all
  -- Cash that moved in the period and was not counted at its end.
  select 'cash_not_closed', (select count(*) from public.financial_accounts fa where fa.account_type = 'cash'
           and exists (select 1 from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
                        where l.account_id = fa.gl_account_id and e.entry_date <= v.end_date and e.entry_date > coalesce(private.cash_closed_until(fa.id), '-infinity')))
  union all
  select 'checks_failed', (select count(*) from private.ledger_checks() c where c.ledger <> c.documents);
end;
$$;

create function public.period_checklist(p_id uuid) returns table (check_code text, found bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('accounting.close');
  return query select * from private.period_checklist(p_id);
end;
$$;

create function public.close_period(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.accounting_periods%rowtype;
  v_problem text;
begin
  perform private.require_permission('accounting.close');
  -- Nothing is posted while the checks run and the period closes.
  perform pg_advisory_xact_lock(771109);
  select * into v from public.accounting_periods where id = p_id for update;
  if v.id is null then raise exception 'Period not found' using errcode = 'P0002'; end if;
  if v.status = 'closed' then raise exception 'Period % is already closed', v.name using errcode = '23514'; end if;
  select string_agg(c.check_code || ' (' || c.found || ')', ', ') into v_problem from private.period_checklist(p_id) c where c.found <> 0;
  if v_problem is not null then raise exception 'Period % cannot be closed yet: %', v.name, v_problem using errcode = '23514'; end if;
  update public.accounting_periods
     set status = 'closed', reopen_reason = null,
         closing_totals = (select jsonb_build_object(
             'debit', private.money_text(coalesce(sum(l.debit), 0)), 'credit', private.money_text(coalesce(sum(l.credit), 0)),
             'result', private.money_text(coalesce(sum(l.credit - l.debit) filter (where a.account_type in ('income', 'expense')), 0)))
           from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
           join public.chart_of_accounts a on a.id = l.account_id where e.entry_date between v.start_date and v.end_date)
   where id = p_id;
  return p_id;
end;
$$;

create function public.reopen_period(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.accounting_periods%rowtype;
begin
  perform private.require_permission('accounting.close');
  perform pg_advisory_xact_lock(771109);
  select * into v from public.accounting_periods where id = p_id for update;
  if v.id is null then raise exception 'Period not found' using errcode = 'P0002'; end if;
  if v.status <> 'closed' then raise exception 'Period % is open', v.name using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if exists (select 1 from public.accounting_periods where status = 'closed' and start_date > v.end_date) then
    raise exception 'Reopen the later periods first' using errcode = '23514';
  end if;
  update public.accounting_periods set status = 'open', reopen_reason = trim(p_reason), reopened_at = now(), reopened_by = auth.uid() where id = p_id;
  return p_id;
end;
$$;

-- ===========================================================================
-- 12. Privileges
-- ===========================================================================
revoke execute on function
  private.lock_posting(), private.cash_closed_until(uuid), private.expense_problem(public.expenses), private.check_expense_input(jsonb), private.is_own_receipt(text),
  private.assign_voucher_no(), private.voucher_account_ok(public.chart_of_accounts, text), private.gl_balance(uuid, date), private.cash_day(uuid, date),
  private.sync_financial_gl_name(), private.document_account(uuid), private.source_number(text, uuid), private.entry_party(uuid), private.account_lines(uuid, date, date),
  private.source_effect(text, text[]), private.ledger_checks(), private.period_checklist(uuid)
from public, anon, authenticated;
-- Used inside policies and triggers that run as the caller.
grant execute on function private.is_own_receipt(text), private.gl_balance(uuid, date) to authenticated;

revoke execute on function
  public.reject_expense(uuid, text), public.update_expense(uuid, jsonb), public.attach_expense_receipt(uuid, text), public.user_names(uuid[]),
  public.expense_register(date, date, uuid, text), public.report_expenses(date, date), public.prepare_payroll(date), public.save_payroll(uuid, jsonb, text),
  public.post_payroll_run(uuid, date), public.void_payroll_run(uuid, text), public.pay_salaries(uuid, jsonb, jsonb), public.void_salary_payment(uuid, text),
  public.record_advance(jsonb), public.void_advance(uuid, text), public.payroll_employees(), public.report_payroll(date, date, uuid),
  public.record_account_opening(uuid, numeric, date), public.void_account_opening(uuid, text), public.record_fund_transfer(jsonb), public.void_fund_transfer(uuid, text),
  public.list_voucher_accounts(text), public.record_cash_voucher(jsonb), public.void_cash_voucher(uuid, text), public.report_cash_accounts(date, date),
  public.cash_day(uuid, date), public.close_cash_day(uuid, jsonb), public.reopen_cash_day(uuid, text), public.general_ledger(uuid, date, date),
  public.account_book(uuid, date, date), public.list_journal(date, date, text, text, integer, integer), public.journal_lines(uuid), public.report_trial_balance(date, date),
  public.income_statement(date, date), public.balance_sheet(date), public.cash_flow(date, date), public.ledger_checks(), public.create_period(date),
  public.period_checklist(uuid), public.close_period(uuid), public.reopen_period(uuid, text)
from public, anon;
grant execute on function
  public.reject_expense(uuid, text), public.update_expense(uuid, jsonb), public.attach_expense_receipt(uuid, text), public.user_names(uuid[]),
  public.expense_register(date, date, uuid, text), public.report_expenses(date, date), public.prepare_payroll(date), public.save_payroll(uuid, jsonb, text),
  public.post_payroll_run(uuid, date), public.void_payroll_run(uuid, text), public.pay_salaries(uuid, jsonb, jsonb), public.void_salary_payment(uuid, text),
  public.record_advance(jsonb), public.void_advance(uuid, text), public.payroll_employees(), public.report_payroll(date, date, uuid),
  public.record_account_opening(uuid, numeric, date), public.void_account_opening(uuid, text), public.record_fund_transfer(jsonb), public.void_fund_transfer(uuid, text),
  public.list_voucher_accounts(text), public.record_cash_voucher(jsonb), public.void_cash_voucher(uuid, text), public.report_cash_accounts(date, date),
  public.cash_day(uuid, date), public.close_cash_day(uuid, jsonb), public.reopen_cash_day(uuid, text), public.general_ledger(uuid, date, date),
  public.account_book(uuid, date, date), public.list_journal(date, date, text, text, integer, integer), public.journal_lines(uuid), public.report_trial_balance(date, date),
  public.income_statement(date, date), public.balance_sheet(date), public.cash_flow(date, date), public.ledger_checks(), public.create_period(date),
  public.period_checklist(uuid), public.close_period(uuid), public.reopen_period(uuid, text)
to authenticated;
