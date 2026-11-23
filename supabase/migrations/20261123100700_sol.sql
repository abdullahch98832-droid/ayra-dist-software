-- SOL covers two activities (confirmed by the business):
--   1. sol_jobs:  transport/logistics jobs for clients (no warehouse stock).
--   2. sol_trips: selling stock from a vehicle. Stock is loaded with a transfer
--      into the vehicle's warehouse, sold with direct sales invoices from that
--      warehouse, and unsold stock is transferred back.
-- SOL clients are rows in customers, so their balances sit in the receivables ledger.

create table public.sol_jobs (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  customer_id uuid not null references public.customers (id),
  job_date date not null default current_date,
  vehicle_id uuid references public.vehicles (id),
  driver_id uuid references public.drivers (id),
  pickup_location text,
  delivery_location text,
  cargo_description text,
  contract_value numeric(18,2) not null check (contract_value >= 0),
  status public.sol_job_status not null default 'draft',
  started_at timestamptz,
  completed_at timestamptz,
  proof_path text,
  notes text,
  journal_entry_id uuid references public.journal_entries (id),
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index sol_jobs_customer_idx on public.sol_jobs (customer_id, job_date);
create index sol_jobs_vehicle_idx on public.sol_jobs (vehicle_id, job_date);

create trigger sol_jobs_doc_no
  before insert on public.sol_jobs
  for each row execute function private.assign_doc_no('SOLJ');

-- Completing a job recognises its revenue as a receivable from the client.
create function public.complete_sol_job(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sol_jobs%rowtype;
  v_je uuid;
begin
  perform private.require_permission('sol.post');
  select * into v_doc from public.sol_jobs where id = p_id for update;
  if v_doc.id is null then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if v_doc.status not in ('confirmed', 'in_progress') then
    raise exception 'SOL job % is %', v_doc.doc_no, v_doc.status using errcode = '23514';
  end if;

  if v_doc.contract_value > 0 then
    v_je := private.post_journal(current_date, 'SOL job ' || v_doc.doc_no, 'sol_job', v_doc.id,
      jsonb_build_array(
        jsonb_build_object('account', 'AR', 'debit', v_doc.contract_value, 'customer_id', v_doc.customer_id),
        jsonb_build_object('account', 'SOL_REVENUE', 'credit', v_doc.contract_value, 'customer_id', v_doc.customer_id)));
  end if;

  update public.sol_jobs
     set status = 'completed', completed_at = now(), journal_entry_id = v_je
   where id = p_id;
  return p_id;
end;
$$;

-- Status changes other than completion (confirm, start, cancel). Cancelling a
-- completed job is not allowed because revenue has been booked.
create function public.set_sol_job_status(p_id uuid, p_status public.sol_job_status) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_current public.sol_job_status;
begin
  perform private.require_permission('sol.manage');
  select status into v_current from public.sol_jobs where id = p_id for update;
  if v_current is null then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if not (
       (v_current = 'draft' and p_status in ('confirmed', 'cancelled'))
    or (v_current = 'confirmed' and p_status in ('in_progress', 'cancelled'))
    or (v_current = 'in_progress' and p_status = 'cancelled')
  ) then
    raise exception 'Cannot change SOL job from % to %', v_current, p_status using errcode = '23514';
  end if;
  if p_status = 'cancelled' and exists (
       select 1 from public.customer_payment_allocations where sol_job_id = p_id) then
    raise exception 'Remove payment allocations before cancelling' using errcode = '23514';
  end if;
  update public.sol_jobs
     set status = p_status,
         started_at = case when p_status = 'in_progress' then now() else started_at end
   where id = p_id;
  return p_id;
end;
$$;

-- Payments for SOL jobs are customer payments allocated to the job.
alter table public.customer_payment_allocations
  add column sol_job_id uuid references public.sol_jobs (id),
  add constraint customer_payment_allocations_one_target check (num_nonnulls(sales_invoice_id, sol_job_id) = 1),
  add constraint customer_payment_allocations_payment_job_key unique (customer_payment_id, sol_job_id);
create index customer_payment_allocations_job_idx on public.customer_payment_allocations (sol_job_id);

create function public.allocate_payment_to_sol_job(p_payment_id uuid, p_job_id uuid, p_amount numeric)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.customer_payments%rowtype;
  v_job public.sol_jobs%rowtype;
  v_paid numeric;
  v_id uuid;
begin
  perform private.require_permission('receivables.post');
  if p_amount is null or p_amount <= 0 then
    raise exception 'Allocation amount must be positive' using errcode = '22023';
  end if;
  select * into v_payment from public.customer_payments where id = p_payment_id for update;
  select * into v_job from public.sol_jobs where id = p_job_id for update;
  if v_payment.id is null or v_job.id is null then
    raise exception 'Payment or SOL job not found' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'posted' then
    raise exception 'Only posted payments can be allocated' using errcode = '23514';
  end if;
  if v_job.status in ('draft', 'cancelled') then
    raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514';
  end if;
  if v_payment.customer_id <> v_job.customer_id then
    raise exception 'Payment and SOL job belong to different clients' using errcode = '23514';
  end if;
  if p_amount > private.payment_unallocated(p_payment_id) then
    raise exception 'Allocation exceeds the unallocated payment amount (%)', private.payment_unallocated(p_payment_id)
      using errcode = '23514';
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.customer_payment_allocations where sol_job_id = p_job_id;
  if v_paid + p_amount > v_job.contract_value then
    raise exception 'Allocation exceeds the job balance (%)', v_job.contract_value - v_paid using errcode = '23514';
  end if;

  insert into public.customer_payment_allocations (customer_payment_id, sol_job_id, amount)
  values (p_payment_id, p_job_id, p_amount)
  on conflict (customer_payment_id, sol_job_id)
  do update set amount = public.customer_payment_allocations.amount + excluded.amount
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vehicle stock-selling trips
-- ---------------------------------------------------------------------------
create table public.sol_trips (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  vehicle_id uuid not null references public.vehicles (id),
  driver_id uuid references public.drivers (id),
  warehouse_id uuid not null references public.warehouses (id),
  trip_date date not null default current_date,
  route text,
  status public.sol_trip_status not null default 'open',
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index sol_trips_vehicle_idx on public.sol_trips (vehicle_id, trip_date);

create trigger sol_trips_doc_no
  before insert on public.sol_trips
  for each row execute function private.assign_doc_no('SOLT');

create function private.validate_sol_trip() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.warehouses
                  where id = new.warehouse_id and warehouse_type = 'vehicle' and vehicle_id = new.vehicle_id) then
    raise exception 'Trip warehouse must be the vehicle''s own warehouse' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger sol_trips_validate
  before insert or update of vehicle_id, warehouse_id on public.sol_trips
  for each row execute function private.validate_sol_trip();

alter table public.stock_transfers add column sol_trip_id uuid references public.sol_trips (id);
alter table public.sales_invoices add column sol_trip_id uuid references public.sol_trips (id);
create index stock_transfers_trip_idx on public.stock_transfers (sol_trip_id);
create index sales_invoices_trip_idx on public.sales_invoices (sol_trip_id);

create function public.close_sol_trip(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('sol.manage');
  update public.sol_trips set status = 'closed', closed_at = now() where id = p_id and status = 'open';
  if not found then
    raise exception 'Only open trips can be closed' using errcode = '23514';
  end if;
  return p_id;
end;
$$;
