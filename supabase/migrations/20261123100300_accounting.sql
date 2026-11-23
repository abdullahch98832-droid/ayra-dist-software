-- Double-entry accounting core.

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9][0-9.]*$'),
  name_en text not null,
  name_ur text not null,
  account_type public.account_type not null,
  parent_id uuid references public.chart_of_accounts (id),
  -- Header accounts group others and cannot receive postings.
  is_postable boolean not null default true,
  -- Stable identifier used by posting logic (e.g. 'AR', 'INVENTORY').
  system_key text unique check (system_key is null or system_key ~ '^[A-Z][A-Z_]*$'),
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (parent_id is distinct from id)
);
create index chart_of_accounts_parent_idx on public.chart_of_accounts (parent_id);

create function private.account_id(p_system_key text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from public.chart_of_accounts where system_key = p_system_key;
  if v_id is null then
    raise exception 'System account % is not configured', p_system_key using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

create function private.guard_system_account() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.system_key is not null then
      raise exception 'System account % cannot be deleted', old.code using errcode = '42501';
    end if;
    return old;
  end if;
  if old.system_key is not null
     and (new.system_key is distinct from old.system_key
          or new.account_type is distinct from old.account_type
          or new.is_postable is distinct from old.is_postable) then
    raise exception 'Type, posting flag and key of system account % cannot change', old.code
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger chart_of_accounts_guard
  before update or delete on public.chart_of_accounts
  for each row execute function private.guard_system_account();

-- ---------------------------------------------------------------------------
-- Cash and bank accounts. Each has its own GL account, created automatically.
-- ---------------------------------------------------------------------------
create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  account_type public.financial_account_type not null,
  bank_name text,
  account_title text,
  account_number text,
  branch text,
  gl_account_id uuid not null unique references public.chart_of_accounts (id),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (account_type = 'bank' or (bank_name is null and account_number is null))
);

create function private.create_financial_gl_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parent public.chart_of_accounts%rowtype;
  v_seq integer;
begin
  if new.gl_account_id is not null then
    return new;
  end if;
  select * into v_parent from public.chart_of_accounts
   where system_key = case new.account_type when 'cash' then 'CASH_PARENT' else 'BANK_PARENT' end
     for update;
  if v_parent.id is null then
    raise exception 'Cash/bank parent account is not configured' using errcode = 'P0002';
  end if;
  select count(*) + 1 into v_seq from public.chart_of_accounts where parent_id = v_parent.id;
  insert into public.chart_of_accounts (code, name_en, name_ur, account_type, parent_id)
  values (v_parent.code || '.' || lpad(v_seq::text, 3, '0'), new.name, new.name, 'asset', v_parent.id)
  returning id into new.gl_account_id;
  return new;
end;
$$;

create trigger financial_accounts_gl
  before insert on public.financial_accounts
  for each row execute function private.create_financial_gl_account();

-- ---------------------------------------------------------------------------
-- Accounting periods. Posting into a closed period is rejected.
-- ---------------------------------------------------------------------------
create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  status public.period_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (end_date >= start_date),
  exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

-- ---------------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------------
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  entry_date date not null,
  description text not null,
  source_type text not null default 'manual',
  source_id uuid,
  status public.journal_status not null default 'draft',
  reversal_of uuid unique references public.journal_entries (id),
  reversed_by uuid unique references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
-- A business document can produce at most one original journal entry.
create unique index journal_entries_one_per_source
  on public.journal_entries (source_type, source_id)
  where source_id is not null and reversal_of is null;
create index journal_entries_date_idx on public.journal_entries (entry_date);

create trigger journal_entries_doc_no
  before insert on public.journal_entries
  for each row execute function private.assign_doc_no('JV');

create table public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  line_no integer not null check (line_no > 0),
  account_id uuid not null references public.chart_of_accounts (id),
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  customer_id uuid references public.customers (id),
  supplier_id uuid references public.suppliers (id),
  employee_id uuid references public.employees (id),
  description text,
  unique (journal_entry_id, line_no),
  check ((debit > 0) <> (credit > 0))
);
create index jel_account_idx on public.journal_entry_lines (account_id);
create index jel_customer_idx on public.journal_entry_lines (customer_id) where customer_id is not null;
create index jel_supplier_idx on public.journal_entry_lines (supplier_id) where supplier_id is not null;
create index jel_employee_idx on public.journal_entry_lines (employee_id) where employee_id is not null;

-- Lines: only on drafts, only to postable accounts, and control accounts need their party.
create function private.validate_journal_line() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_status public.journal_status;
  v_account public.chart_of_accounts%rowtype;
  v_is_principal boolean;
begin
  select status into v_status from public.journal_entries
   where id = coalesce(new.journal_entry_id, old.journal_entry_id);
  if v_status = 'posted' then
    raise exception 'Lines of a posted journal entry cannot be changed' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  select * into v_account from public.chart_of_accounts where id = new.account_id;
  if not v_account.is_postable or not v_account.is_active then
    raise exception 'Account % does not accept postings', v_account.code using errcode = '23514';
  end if;

  if v_account.system_key = 'AR' and new.customer_id is null then
    raise exception 'Receivable lines require a customer' using errcode = '23514';
  end if;
  if v_account.system_key in ('AP_PRINCIPAL', 'AP_SUPPLIERS') then
    if new.supplier_id is null then
      raise exception 'Payable lines require a supplier' using errcode = '23514';
    end if;
    select is_principal into v_is_principal from public.suppliers where id = new.supplier_id;
    if v_is_principal <> (v_account.system_key = 'AP_PRINCIPAL') then
      raise exception 'The main company must use the main company payable account; other suppliers the supplier payable account'
        using errcode = '23514';
    end if;
  end if;
  if v_account.system_key in ('EMPLOYEE_ADVANCES', 'SALARIES_PAYABLE') and new.employee_id is null then
    raise exception 'Employee balance lines require an employee' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger journal_entry_lines_validate
  before insert or update or delete on public.journal_entry_lines
  for each row execute function private.validate_journal_line();

-- Entries: created as draft; posting checks balance and period; posted entries
-- are immutable except for linking the reversing entry.
create function private.guard_journal_entry() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_debit numeric;
  v_credit numeric;
  v_lines integer;
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
    new.posted_at := now();
    new.posted_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger journal_entries_guard
  before insert or update or delete on public.journal_entries
  for each row execute function private.guard_journal_entry();

-- Internal: create and post a balanced entry in one call.
-- p_lines: [{ "account": "<system_key>" | "account_id": "<uuid>", "debit": n, "credit": n,
--             "customer_id", "supplier_id", "employee_id", "description" }]
-- Lines where both debit and credit are zero are skipped.
create function private.post_journal(
  p_date date,
  p_description text,
  p_source_type text,
  p_source_id uuid,
  p_lines jsonb,
  p_reversal_of uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entry_id uuid;
  v_line jsonb;
  v_line_no integer := 0;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
begin
  insert into public.journal_entries (entry_date, description, source_type, source_id, reversal_of)
  values (p_date, p_description, p_source_type, p_source_id, p_reversal_of)
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_debit := coalesce((v_line ->> 'debit')::numeric, 0);
    v_credit := coalesce((v_line ->> 'credit')::numeric, 0);
    if v_debit < 0 or v_credit < 0 then
      raise exception 'Journal amounts cannot be negative' using errcode = '23514';
    end if;
    continue when v_debit = 0 and v_credit = 0;
    v_line_no := v_line_no + 1;
    insert into public.journal_entry_lines
      (journal_entry_id, line_no, account_id, debit, credit, customer_id, supplier_id, employee_id, description)
    values (
      v_entry_id,
      v_line_no,
      coalesce((v_line ->> 'account_id')::uuid, private.account_id(v_line ->> 'account')),
      v_debit,
      v_credit,
      (v_line ->> 'customer_id')::uuid,
      (v_line ->> 'supplier_id')::uuid,
      (v_line ->> 'employee_id')::uuid,
      v_line ->> 'description'
    );
  end loop;

  update public.journal_entries set status = 'posted' where id = v_entry_id;
  return v_entry_id;
end;
$$;

-- Internal: post a mirror-image entry and link it to the original.
create function private.reverse_journal(p_entry_id uuid, p_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_entry public.journal_entries%rowtype;
  v_lines jsonb;
  v_reversal_id uuid;
begin
  select * into v_entry from public.journal_entries where id = p_entry_id for update;
  if v_entry.id is null then
    raise exception 'Journal entry not found' using errcode = 'P0002';
  end if;
  if v_entry.status <> 'posted' then
    raise exception 'Only posted entries can be reversed' using errcode = '23514';
  end if;
  if v_entry.reversed_by is not null or v_entry.reversal_of is not null then
    raise exception 'Entry % is already reversed or is itself a reversal', v_entry.doc_no using errcode = '23514';
  end if;

  select jsonb_agg(jsonb_build_object(
           'account_id', account_id, 'debit', credit, 'credit', debit,
           'customer_id', customer_id, 'supplier_id', supplier_id, 'employee_id', employee_id,
           'description', description) order by line_no)
    into v_lines
    from public.journal_entry_lines where journal_entry_id = p_entry_id;

  v_reversal_id := private.post_journal(
    p_date, 'Reversal of ' || v_entry.doc_no || coalesce(': ' || p_reason, ''),
    v_entry.source_type, v_entry.source_id, v_lines, p_entry_id);

  update public.journal_entries set reversed_by = v_reversal_id where id = p_entry_id;
  return v_reversal_id;
end;
$$;

-- RPC: manual journal voucher (capital, drawings, other income, opening balances, corrections).
create function public.create_manual_journal(p_date date, p_description text, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('accounting.journal');
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'At least two lines are required' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where l ? 'account') then
    raise exception 'Manual journals must reference accounts by account_id' using errcode = '22023';
  end if;
  return private.post_journal(p_date, p_description, 'manual', null, p_lines);
end;
$$;

-- RPC: reverse a manual journal. Document entries are reversed by voiding the document.
create function public.reverse_manual_journal(p_entry_id uuid, p_date date, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('accounting.journal');
  if not exists (select 1 from public.journal_entries where id = p_entry_id and source_type = 'manual') then
    raise exception 'Only manual journal entries can be reversed directly' using errcode = '23514';
  end if;
  return private.reverse_journal(p_entry_id, p_date, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfers between cash and bank accounts
-- ---------------------------------------------------------------------------
create table public.fund_transfers (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  transfer_date date not null default current_date,
  from_account_id uuid not null references public.financial_accounts (id),
  to_account_id uuid not null references public.financial_accounts (id),
  amount numeric(18,2) not null check (amount > 0),
  reference text,
  notes text,
  status public.document_status not null default 'draft',
  journal_entry_id uuid references public.journal_entries (id),
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (from_account_id <> to_account_id)
);

create trigger fund_transfers_doc_no
  before insert on public.fund_transfers
  for each row execute function private.assign_doc_no('FTR');

create function private.financial_gl(p_financial_account_id uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_gl uuid;
begin
  select gl_account_id into v_gl from public.financial_accounts
   where id = p_financial_account_id and is_active;
  if v_gl is null then
    raise exception 'Cash/bank account is missing or inactive' using errcode = '23503';
  end if;
  return v_gl;
end;
$$;

create function public.post_fund_transfer(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.fund_transfers%rowtype;
  v_je uuid;
begin
  perform private.require_permission('cash_bank.transfer');
  select * into v_doc from public.fund_transfers where id = p_id for update;
  if v_doc.id is null then raise exception 'Transfer not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Transfer % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  v_je := private.post_journal(v_doc.transfer_date, 'Fund transfer ' || v_doc.doc_no, 'fund_transfer', v_doc.id,
    jsonb_build_array(
      jsonb_build_object('account_id', private.financial_gl(v_doc.to_account_id), 'debit', v_doc.amount),
      jsonb_build_object('account_id', private.financial_gl(v_doc.from_account_id), 'credit', v_doc.amount)));

  update public.fund_transfers set status = 'posted', journal_entry_id = v_je where id = p_id;
  return v_je;
end;
$$;
