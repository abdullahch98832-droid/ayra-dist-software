-- Foundation: private helper schema, enums, document numbering, settings, audit log.
-- Conventions: money numeric(18,2); stock quantities bigint in product base units.

create schema if not exists private;
revoke all on schema private from public;
-- RLS policies evaluate private.* helpers as the calling role, so it needs USAGE (not table access).
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.document_status as enum ('draft', 'posted', 'void');
create type public.purchase_order_status as enum ('draft', 'approved', 'partially_received', 'received', 'cancelled');
create type public.sales_order_status as enum ('draft', 'submitted', 'approved', 'partially_dispatched', 'dispatched', 'cancelled');
create type public.delivery_status as enum ('draft', 'dispatched', 'delivered', 'cancelled');
create type public.sol_job_status as enum ('draft', 'confirmed', 'in_progress', 'completed', 'cancelled');
create type public.sol_trip_status as enum ('open', 'closed');
create type public.employment_status as enum ('active', 'on_leave', 'terminated');
create type public.account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');
create type public.warehouse_type as enum ('main', 'vehicle', 'damaged');
create type public.financial_account_type as enum ('cash', 'bank');
create type public.payment_method as enum ('cash', 'bank_transfer', 'cheque', 'online', 'other');
create type public.stock_movement_type as enum (
  'opening', 'purchase_receipt', 'purchase_return', 'sale', 'sales_return',
  'transfer_out', 'transfer_in', 'adjustment_in', 'adjustment_out', 'write_off'
);
create type public.adjustment_kind as enum ('opening', 'count', 'write_off', 'other');
create type public.item_condition as enum ('saleable', 'damaged');
create type public.period_status as enum ('open', 'closed');
create type public.journal_status as enum ('draft', 'posted');
create type public.vehicle_ownership as enum ('owned', 'rented');

-- ---------------------------------------------------------------------------
-- Generic trigger: maintain updated_at / updated_by
-- ---------------------------------------------------------------------------
create function private.touch_updated() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Application settings (key/value)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create function private.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.app_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Document sequences. The UPDATE row lock serialises concurrent callers and a
-- rollback also rolls back the increment, so numbers are unique and gap-free.
-- ---------------------------------------------------------------------------
create table public.document_sequences (
  doc_type text primary key,
  prefix text not null,
  next_value bigint not null default 1 check (next_value > 0),
  padding smallint not null default 6 check (padding between 1 and 12),
  description text,
  updated_at timestamptz not null default now()
);

create function private.next_document_number(p_doc_type text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
  v_value bigint;
  v_padding smallint;
begin
  update public.document_sequences
     set next_value = next_value + 1, updated_at = now()
   where doc_type = p_doc_type
  returning prefix, next_value - 1, padding into v_prefix, v_value, v_padding;

  if not found then
    raise exception 'Unknown document type: %', p_doc_type using errcode = 'P0002';
  end if;
  return v_prefix || lpad(v_value::text, v_padding, '0');
end;
$$;

-- BEFORE INSERT trigger: fills doc_no from the sequence named in TG_ARGV[0].
create function private.assign_doc_no() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.doc_no is null then
    new.doc_no := private.next_document_number(tg_argv[0]);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_user_idx on public.audit_logs (user_id, occurred_at desc);

create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;

  insert into public.audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key', v_new ->> 'code', v_old ->> 'code'),
    tg_op,
    v_old,
    v_new
  );
  return null;
end;
$$;

create function private.prevent_modification() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '42501';
end;
$$;

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function private.prevent_modification();
