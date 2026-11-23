-- Expenses, employee advances, payroll.

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name_en text not null,
  name_ur text not null,
  gl_account_id uuid not null references public.chart_of_accounts (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create function private.validate_expense_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.chart_of_accounts
                  where id = new.gl_account_id and account_type = 'expense' and is_postable) then
    raise exception 'Expense categories must map to a postable expense account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger expense_categories_validate
  before insert or update of gl_account_id on public.expense_categories
  for each row execute function private.validate_expense_category();

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  expense_date date not null default current_date,
  category_id uuid not null references public.expense_categories (id),
  amount numeric(18,2) not null check (amount > 0),
  financial_account_id uuid not null references public.financial_accounts (id),
  payee text,
  description text,
  vehicle_id uuid references public.vehicles (id),
  sol_job_id uuid references public.sol_jobs (id),
  sol_trip_id uuid references public.sol_trips (id),
  employee_id uuid references public.employees (id),
  receipt_path text,
  status public.document_status not null default 'draft',
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index expenses_date_idx on public.expenses (expense_date);
create index expenses_category_idx on public.expenses (category_id, expense_date);
create index expenses_vehicle_idx on public.expenses (vehicle_id) where vehicle_id is not null;
create index expenses_sol_job_idx on public.expenses (sol_job_id) where sol_job_id is not null;
create index expenses_sol_trip_idx on public.expenses (sol_trip_id) where sol_trip_id is not null;

create trigger expenses_doc_no
  before insert on public.expenses
  for each row execute function private.assign_doc_no('EXP');

create function public.post_expense(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.expenses%rowtype;
  v_gl uuid;
  v_je uuid;
begin
  perform private.require_permission('expenses.post');
  select * into v_doc from public.expenses where id = p_id for update;
  if v_doc.id is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Expense % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  select gl_account_id into v_gl from public.expense_categories where id = v_doc.category_id and is_active;
  if v_gl is null then raise exception 'Expense category is inactive' using errcode = '23514'; end if;

  v_je := private.post_journal(v_doc.expense_date,
    'Expense ' || v_doc.doc_no || coalesce(': ' || v_doc.description, ''), 'expense', v_doc.id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_gl, 'debit', v_doc.amount, 'employee_id', v_doc.employee_id),
      jsonb_build_object('account_id', private.financial_gl(v_doc.financial_account_id), 'credit', v_doc.amount)));

  update public.expenses
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

create function public.void_expense(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.expenses%rowtype;
  v_rev uuid;
begin
  perform private.require_permission('expenses.post');
  select * into v_doc from public.expenses where id = p_id for update;
  if v_doc.id is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted expenses can be voided' using errcode = '23514'; end if;
  v_rev := private.reverse_journal(v_doc.journal_entry_id, current_date, p_reason);
  update public.expenses set status = 'void' where id = p_id;
  return v_rev;
end;
$$;

-- ---------------------------------------------------------------------------
-- Employee advances (recovered through payroll deductions)
-- ---------------------------------------------------------------------------
create table public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  employee_id uuid not null references public.employees (id),
  advance_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  financial_account_id uuid not null references public.financial_accounts (id),
  reason text,
  status public.document_status not null default 'draft',
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index employee_advances_employee_idx on public.employee_advances (employee_id, advance_date);

create trigger employee_advances_doc_no
  before insert on public.employee_advances
  for each row execute function private.assign_doc_no('ADV');

create function public.post_employee_advance(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.employee_advances%rowtype;
  v_je uuid;
begin
  perform private.require_permission('payroll.pay');
  select * into v_doc from public.employee_advances where id = p_id for update;
  if v_doc.id is null then raise exception 'Advance not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Advance % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  v_je := private.post_journal(v_doc.advance_date, 'Employee advance ' || v_doc.doc_no, 'employee_advance', v_doc.id,
    jsonb_build_array(
      jsonb_build_object('account', 'EMPLOYEE_ADVANCES', 'debit', v_doc.amount, 'employee_id', v_doc.employee_id),
      jsonb_build_object('account_id', private.financial_gl(v_doc.financial_account_id), 'credit', v_doc.amount)));

  update public.employee_advances
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

create function private.employee_account_balance(p_employee_id uuid, p_system_key text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.debit - l.credit), 0)
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
    join public.chart_of_accounts a on a.id = l.account_id and a.system_key = p_system_key
   where l.employee_id = p_employee_id;
$$;

-- ---------------------------------------------------------------------------
-- Payroll. Posting books salary expense, recovers advances and creates a
-- salaries-payable balance per employee; salaries are paid separately.
-- ---------------------------------------------------------------------------
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  period_month date not null unique check (extract(day from period_month) = 1),
  status public.document_status not null default 'draft',
  notes text,
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create trigger payroll_runs_doc_no
  before insert on public.payroll_runs
  for each row execute function private.assign_doc_no('PAY');

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id uuid not null references public.employees (id),
  basic_salary numeric(18,2) not null default 0 check (basic_salary >= 0),
  allowances numeric(18,2) not null default 0 check (allowances >= 0),
  bonus numeric(18,2) not null default 0 check (bonus >= 0),
  deductions numeric(18,2) not null default 0 check (deductions >= 0),
  advance_recovery numeric(18,2) not null default 0 check (advance_recovery >= 0),
  gross_pay numeric(18,2) generated always as (basic_salary + allowances + bonus) stored,
  net_pay numeric(18,2) generated always as
    (basic_salary + allowances + bonus - deductions - advance_recovery) stored,
  notes text,
  unique (payroll_run_id, employee_id),
  check (basic_salary + allowances + bonus - deductions - advance_recovery >= 0)
);

create function public.post_payroll_run(p_id uuid) returns uuid
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
  v_date := (v_doc.period_month + interval '1 month - 1 day')::date;

  for v_item in
    select * from public.payroll_items where payroll_run_id = p_id order by employee_id
  loop
    if v_item.advance_recovery > private.employee_account_balance(v_item.employee_id, 'EMPLOYEE_ADVANCES') then
      raise exception 'Advance recovery exceeds the outstanding advance of an employee' using errcode = '23514';
    end if;
    v_expense := v_expense + v_item.gross_pay - v_item.deductions;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account', 'EMPLOYEE_ADVANCES', 'credit', v_item.advance_recovery, 'employee_id', v_item.employee_id),
      jsonb_build_object('account', 'SALARIES_PAYABLE', 'credit', v_item.net_pay, 'employee_id', v_item.employee_id));
  end loop;

  v_je := private.post_journal(v_date, 'Payroll ' || to_char(v_doc.period_month, 'YYYY-MM') || ' (' || v_doc.doc_no || ')',
    'payroll_run', v_doc.id,
    jsonb_build_array(jsonb_build_object('account', 'SALARIES_EXPENSE', 'debit', v_expense)) || v_lines);

  update public.payroll_runs
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

create table public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  payroll_item_id uuid not null references public.payroll_items (id),
  payment_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  financial_account_id uuid not null references public.financial_accounts (id),
  method public.payment_method not null,
  reference text,
  status public.document_status not null default 'draft',
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index salary_payments_item_idx on public.salary_payments (payroll_item_id);

create trigger salary_payments_doc_no
  before insert on public.salary_payments
  for each row execute function private.assign_doc_no('SAL');

create function public.post_salary_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.salary_payments%rowtype;
  v_item public.payroll_items%rowtype;
  v_run_status public.document_status;
  v_paid numeric;
  v_je uuid;
begin
  perform private.require_permission('payroll.pay');
  select * into v_doc from public.salary_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Salary payment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Salary payment % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  select * into v_item from public.payroll_items where id = v_doc.payroll_item_id for update;
  select status into v_run_status from public.payroll_runs where id = v_item.payroll_run_id;
  if v_run_status <> 'posted' then
    raise exception 'Payroll run must be posted before paying salaries' using errcode = '23514';
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.salary_payments
   where payroll_item_id = v_item.id and status = 'posted';
  if v_paid + v_doc.amount > v_item.net_pay then
    raise exception 'Payment exceeds the salary due (%)', v_item.net_pay - v_paid using errcode = '23514';
  end if;

  v_je := private.post_journal(v_doc.payment_date, 'Salary payment ' || v_doc.doc_no, 'salary_payment', v_doc.id,
    jsonb_build_array(
      jsonb_build_object('account', 'SALARIES_PAYABLE', 'debit', v_doc.amount, 'employee_id', v_item.employee_id),
      jsonb_build_object('account_id', private.financial_gl(v_doc.financial_account_id), 'credit', v_doc.amount)));

  update public.salary_payments
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;
