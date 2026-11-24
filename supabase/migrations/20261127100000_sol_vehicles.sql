-- Phase 8: SOL jobs (types, services, items, deliveries, costs, payments) and vehicles.

-- ===========================================================================
-- 0. Completes the Phase 7 migration on databases that received an early copy of it.
--    Changes nothing where the final version was applied.
-- ===========================================================================
-- What was paid, returned and credited per invoice. Runs as definer because row level security shows a caller
-- only some payments (an order taker their own, for example), which would make a settled invoice look unpaid.
create or replace function private.invoice_settlements()
returns table (invoice_id uuid, paid numeric, returned numeric, credited numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, sum(x.paid), sum(x.returned), sum(x.credited)
    from (select a.sales_invoice_id as id, a.amount as paid, 0::numeric as returned, 0::numeric as credited
            from public.customer_payment_allocations a where a.sales_invoice_id is not null
          union all
          select r.sales_invoice_id, 0, r.total_amount, 0 from public.customer_returns r where r.status = 'posted' and r.sales_invoice_id is not null
          union all
          select n.sales_invoice_id, 0, 0, n.amount from public.customer_notes n where n.status = 'posted' and n.kind = 'credit' and n.sales_invoice_id is not null) x
   group by x.id;
$$;

-- Paid and outstanding are NULL for callers who neither see nor collect receivables, instead of a misleading figure.
create or replace function private.sees_settlements() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is null or private.has_permission('receivables.view') or private.has_permission('receivables.collect') or private.has_permission('receivables.post');
$$;

create or replace view public.v_sales_invoice_balances with (security_invoker = true) as
select i.id as sales_invoice_id, i.doc_no, i.customer_id, i.order_taker_id, i.invoice_date, i.due_date, i.total_amount,
       case when v.sees then coalesce(x.paid, 0) end as paid_amount,
       case when v.sees then coalesce(x.returned, 0) end as returned_amount,
       case when v.sees then greatest(i.total_amount - coalesce(x.paid, 0) - coalesce(x.returned, 0) - coalesce(x.credited, 0), 0) end as outstanding,
       case
         when not v.sees then null
         when i.total_amount - coalesce(x.paid, 0) - coalesce(x.returned, 0) - coalesce(x.credited, 0) <= 0 then 'paid'
         when coalesce(x.paid, 0) + coalesce(x.returned, 0) + coalesce(x.credited, 0) > 0 then 'partially_paid'
         else 'unpaid'
       end as payment_status,
       case when v.sees then coalesce(x.credited, 0) end as credited_amount,
       i.sales_order_id
from public.sales_invoices i
cross join (select private.sees_settlements() as sees) v
left join private.invoice_settlements() x on x.invoice_id = i.id
where i.status = 'posted';

revoke execute on function private.invoice_settlements(), private.sees_settlements() from public, anon, authenticated;
grant execute on function private.invoice_settlements(), private.sees_settlements() to authenticated;

drop function if exists public.report_collections(date, date, uuid, text);
create function public.report_collections(p_from date, p_to date, p_collector_id uuid default null, p_method text default null)
returns table (payment_id uuid, doc_no text, payment_date date, customer_id uuid, customer text, customer_ur text, method public.payment_method, reference text,
               collector_en text, collector_ur text, destination text, held boolean, amount numeric, settled numeric, on_account numeric, invoices text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid;
begin
  if not (private.has_permission('receivables.post') or (private.has_permission('receivables.view') and private.has_permission('sales.view_all'))) then
    perform private.require_permission('receivables.collect');
    v_own := coalesce(private.current_employee_id(), '00000000-0000-0000-0000-000000000000');
  end if;
  return query
  select p.id, p.doc_no, p.payment_date, c.id, c.name, c.name_ur, p.method, p.reference, e.full_name, e.full_name_ur, fa.name,
         p.financial_account_id is null, p.amount, coalesce(a.settled, 0), p.amount - coalesce(a.settled, 0), a.invoices
    from public.customer_payments p
    join public.customers c on c.id = p.customer_id
    left join public.employees e on e.id = p.collected_by
    left join public.financial_accounts fa on fa.id = p.financial_account_id
    left join (select pa.customer_payment_id, sum(pa.amount) as settled, string_agg(coalesce(i.doc_no, j.doc_no), ', ' order by coalesce(i.doc_no, j.doc_no)) as invoices
                 from public.customer_payment_allocations pa
                 left join public.sales_invoices i on i.id = pa.sales_invoice_id
                 left join public.sol_jobs j on j.id = pa.sol_job_id
                group by pa.customer_payment_id) a on a.customer_payment_id = p.id
   where p.payment_date between p_from and p_to and p.status = 'posted'
     and (v_own is null or p.collected_by = v_own)
     and (p_collector_id is null or p.collected_by = p_collector_id)
     and (p_method is null or p.method::text = p_method)
   order by p.payment_date desc, p.doc_no desc;
end;
$$;

revoke execute on function public.report_collections(date, date, uuid, text) from public, anon;
grant execute on function public.report_collections(date, date, uuid, text) to authenticated;

-- ===========================================================================
-- 1. Permissions, version, numbering, accounts
-- ===========================================================================
insert into public.permissions (code, module, description_en, description_ur) values
  ('sol.view_all', 'sol', 'View every SOL job (otherwise only jobs assigned to the user)', 'تمام ایس او ایل کام دیکھیں (ورنہ صرف اپنے سپرد کام)'),
  ('sol.dispatch', 'sol', 'Dispatch SOL deliveries, issue and return products', 'ایس او ایل ڈیلیوری روانہ کریں، مال جاری اور واپس کریں');

-- Everyone who saw all jobs until now keeps seeing them. Drivers now see the jobs they deliver.
insert into public.role_permissions (role_id, permission_code)
select rp.role_id, 'sol.view_all'
  from public.role_permissions rp join public.roles r on r.id = rp.role_id
 where rp.permission_code = 'sol.view' and r.code <> 'driver'
on conflict do nothing;
insert into public.role_permissions (role_id, permission_code)
select r.id, 'sol.dispatch' from public.roles r where r.code in ('manager', 'warehouse')
on conflict do nothing;

insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261127100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

insert into public.document_sequences (doc_type, prefix, padding, description) values
  ('SOLD', 'SOLD-', 6, 'SOL delivery'),
  ('SOLR', 'SOLR-', 6, 'SOL return of products');
update public.document_sequences set description = 'SOL job' where doc_type = 'SOLJ';

-- SOL is not limited to transport.
update public.chart_of_accounts set name_en = 'SOL Revenue', name_ur = 'ایس او ایل آمدنی'
 where system_key = 'SOL_REVENUE' and name_en = 'SOL Transport Revenue';

insert into public.chart_of_accounts (code, name_en, name_ur, account_type, is_postable, system_key, parent_id)
select v.code, v.name_en, v.name_ur, 'expense', true, v.system_key, (select id from public.chart_of_accounts where code = '6000')
  from (values
    ('6150', 'SOL Direct Costs', 'ایس او ایل براہ راست اخراجات', 'SOL_COSTS'),
    ('6650', 'Vehicle Repairs', 'گاڑیوں کی خرابی کی مرمت', 'VEHICLE_REPAIRS'),
    ('6660', 'Other Vehicle Expenses', 'گاڑیوں کے دیگر اخراجات', 'VEHICLE_OTHER')
  ) as v(code, name_en, name_ur, system_key);

alter table public.expense_categories
  -- How the category counts in vehicle reports.
  add column vehicle_kind text check (vehicle_kind in ('fuel', 'maintenance', 'repair', 'other'));
select private.restrict_columns('expense_categories', array['created_at', 'created_by', 'updated_at', 'updated_by']);
update public.expense_categories set vehicle_kind = 'fuel' where code = 'FUEL';
update public.expense_categories set vehicle_kind = 'maintenance' where code = 'VEHICLE_MAINTENANCE';
insert into public.expense_categories (code, name_en, name_ur, gl_account_id, vehicle_kind) values
  ('VEHICLE_REPAIRS', 'Vehicle Repairs', 'گاڑی کی خرابی کی مرمت', private.account_id('VEHICLE_REPAIRS'), 'repair'),
  ('VEHICLE_OTHER', 'Other Vehicle Expenses', 'گاڑی کے دیگر اخراجات', private.account_id('VEHICLE_OTHER'), 'other'),
  ('SOL_DIRECT', 'SOL Direct Costs', 'ایس او ایل براہ راست اخراجات', private.account_id('SOL_COSTS'), null);

-- A document has at most one entry in force; a reversed entry can be followed by a new one.
drop index public.journal_entries_one_per_source;
create unique index journal_entries_one_per_source on public.journal_entries (source_type, source_id)
  where source_id is not null and reversal_of is null and reversed_by is null;

-- Last four characters only: enough to recognise an account, useless to anyone else.
create function private.mask_account(p_value text) returns text
language sql immutable set search_path = '' as $$
  select case when x.v = '' then null else '****' || right(x.v, 4) end
    from (select regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g') as v) x;
$$;

-- ===========================================================================
-- 2. Vehicles and drivers
-- ===========================================================================
alter table public.vehicles
  add column make text,
  add column model text,
  add column driver_id uuid references public.drivers (id),
  add column fuel_type text check (fuel_type in ('petrol', 'diesel', 'cng', 'electric', 'hybrid', 'other')),
  add column status text not null default 'active' check (status in ('active', 'maintenance', 'out_of_service', 'retired'));
update public.vehicles set status = 'out_of_service' where not is_active;
create index vehicles_driver_idx on public.vehicles (driver_id);
select private.restrict_columns('vehicles', array['created_at', 'created_by', 'updated_at', 'updated_by', 'is_active']);

-- Only vehicles in service can be chosen on documents.
create function private.sync_vehicle_active() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.is_active := new.status = 'active';
  return new;
end;
$$;
create trigger vehicles_active before insert or update of status on public.vehicles
  for each row execute function private.sync_vehicle_active();

drop policy "select" on public.vehicles;
create policy "select" on public.vehicles for select to authenticated using (
  (select private.has_permission('vehicles.view')) or (select private.has_permission('sol.view')) or (select private.has_permission('sales.dispatch')));

drop function public.list_drivers();
create function public.list_drivers()
returns table (driver_id uuid, full_name text, full_name_ur text, license_number text, phone text, license_expiry date, is_active boolean, employee_id uuid)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (private.has_permission('sales.dispatch') or private.has_permission('sol.view') or private.has_permission('sol.manage') or private.has_permission('sol.dispatch')) then
    perform private.require_permission('vehicles.view');
  end if;
  return query
  select d.id, e.full_name, e.full_name_ur, d.license_number, e.phone, d.license_expiry, d.is_active and e.status::text <> 'terminated', e.id
    from public.drivers d join public.employees e on e.id = d.employee_id
   order by e.full_name;
end;
$$;

-- Names only, to choose a responsible employee or a driver without opening employee records.
create function public.list_staff()
returns table (employee_id uuid, code text, full_name text, full_name_ur text, is_active boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (private.has_permission('sol.view') or private.has_permission('sol.manage') or private.has_permission('vehicles.manage')) then
    perform private.require_permission('employees.view');
  end if;
  return query select e.id, e.employee_code, e.full_name, e.full_name_ur, e.status::text <> 'terminated' from public.employees e order by e.full_name;
end;
$$;

-- ===========================================================================
-- 3. Job types and services
-- ===========================================================================
create table public.sol_job_types (
  id uuid primary key default gen_random_uuid(),
  name_en text not null unique check (trim(name_en) <> ''),
  name_ur text,
  uses_services boolean not null default true,
  uses_products boolean not null default true,
  uses_deliveries boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table public.sol_services (
  id uuid primary key default gen_random_uuid(),
  name_en text not null unique check (trim(name_en) <> ''),
  name_ur text,
  unit_label text,
  unit_label_ur text,
  default_price numeric(18,2) check (default_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
do $$
declare
  t text;
begin
  foreach t in array array['sol_job_types', 'sol_services'] loop
    perform private.apply_policies(t, private.p('sol.view') || ' or ' || private.p('sol.manage'), private.p('sol.manage'), private.p('sol.manage'), null);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    perform private.restrict_columns(t, array['created_at', 'created_by', 'updated_at', 'updated_by']);
    execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit_row()', t);
  end loop;
end;
$$;
insert into public.sol_job_types (name_en, name_ur) values ('General', 'عمومی');

-- ===========================================================================
-- 4. Jobs
-- ===========================================================================
alter table public.sol_jobs
  add column job_type_id uuid references public.sol_job_types (id),
  add column contact_name text,
  add column contact_phone text,
  add column address text,
  add column description text,
  add column responsible_employee_id uuid references public.employees (id),
  add column start_date date,
  add column due_date date,
  add column completion_date date,
  add column cancel_reason text,
  add column reopen_reason text,
  add constraint sol_jobs_due_after_start check (due_date is null or start_date is null or due_date >= start_date);
update public.sol_jobs
   set description = cargo_description,
       address = coalesce(delivery_location, pickup_location),
       completion_date = (completed_at at time zone 'Asia/Karachi')::date,
       start_date = (started_at at time zone 'Asia/Karachi')::date,
       job_type_id = (select id from public.sol_job_types where name_en = 'General');
create index sol_jobs_responsible_idx on public.sol_jobs (responsible_employee_id);
create index sol_jobs_type_idx on public.sol_jobs (job_type_id);
create index sol_jobs_date_idx on public.sol_jobs (job_date);

alter table public.customers add column is_sol_client boolean not null default false;
select private.restrict_columns('customers', array['created_at', 'created_by', 'updated_at', 'updated_by', 'is_sol_client']);
update public.customers set is_sol_client = true where id in (select customer_id from public.sol_jobs);

-- Jobs are written only by the functions below.
drop policy "insert" on public.sol_jobs;
drop policy "update" on public.sol_jobs;
drop policy "delete" on public.sol_jobs;
select private.read_only('sol_jobs');
-- read_only() leaves column privileges of earlier migrations in place.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(attname), ', ') into v_cols from pg_attribute
   where attrelid = 'public.sol_jobs'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke insert (%s), update (%s) on public.sol_jobs from authenticated', v_cols, v_cols);
end;
$$;

create table public.sol_job_items (
  id uuid primary key default gen_random_uuid(),
  sol_job_id uuid not null references public.sol_jobs (id) on delete cascade,
  line_no integer not null,
  kind text not null check (kind in ('service', 'product', 'other')),
  service_id uuid references public.sol_services (id),
  product_id uuid references public.products (id),
  unit_id uuid references public.units (id),
  factor integer not null default 1 check (factor > 0),
  description text,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(18,2) not null default 0 check (unit_price >= 0),
  -- Expected cost per unit, confidential. Actual costs come from stock and expenses.
  unit_cost numeric(18,2) check (unit_cost >= 0),
  line_total numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  -- Sent out and not brought back.
  delivered_quantity numeric(12,2) not null default 0 check (delivered_quantity >= 0 and delivered_quantity <= quantity),
  check ((kind = 'service') = (service_id is not null)),
  check ((kind = 'product') = (product_id is not null)),
  check ((kind = 'product') = (unit_id is not null)),
  check (kind <> 'other' or coalesce(trim(description), '') <> ''),
  check (kind <> 'product' or quantity = trunc(quantity))
);
create index sol_job_items_job_idx on public.sol_job_items (sol_job_id, line_no);
create index sol_job_items_product_idx on public.sol_job_items (product_id);
create index sol_job_items_service_idx on public.sol_job_items (service_id);

create table public.sol_deliveries (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  sol_job_id uuid not null references public.sol_jobs (id),
  vehicle_id uuid references public.vehicles (id),
  driver_id uuid references public.drivers (id),
  -- Products leave from here.
  warehouse_id uuid references public.warehouses (id),
  delivery_date date not null default private.business_today(),
  destination text not null check (trim(destination) <> ''),
  -- draft = planned: the vehicle and driver are assigned to the job.
  status public.delivery_status not null default 'draft',
  dispatched_at timestamptz,
  dispatched_by uuid,
  delivered_at timestamptz,
  delivered_by uuid,
  received_by text,
  delivery_note text,
  odometer_start bigint check (odometer_start >= 0),
  odometer_end bigint,
  notes text,
  cost_total numeric(18,2) not null default 0,
  journal_entry_id uuid references public.journal_entries (id),
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (odometer_end is null or odometer_start is null or odometer_end >= odometer_start)
);
create index sol_deliveries_job_idx on public.sol_deliveries (sol_job_id);
create index sol_deliveries_vehicle_idx on public.sol_deliveries (vehicle_id, delivery_date);
create index sol_deliveries_driver_idx on public.sol_deliveries (driver_id) where status in ('draft', 'dispatched');

create table public.sol_delivery_items (
  id uuid primary key default gen_random_uuid(),
  sol_delivery_id uuid not null references public.sol_deliveries (id) on delete cascade,
  sol_job_item_id uuid not null references public.sol_job_items (id),
  quantity numeric(12,2) not null check (quantity > 0),
  returned_quantity numeric(12,2) not null default 0 check (returned_quantity >= 0 and returned_quantity <= quantity),
  cost_amount numeric(18,2) not null default 0,
  returned_cost numeric(18,2) not null default 0,
  unique (sol_delivery_id, sol_job_item_id)
);
create index sol_delivery_items_item_idx on public.sol_delivery_items (sol_job_item_id);

create table public.sol_returns (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  sol_delivery_id uuid not null references public.sol_deliveries (id),
  warehouse_id uuid references public.warehouses (id),
  return_date date not null default private.business_today(),
  reason text not null check (trim(reason) <> ''),
  cost_total numeric(18,2) not null default 0,
  journal_entry_id uuid references public.journal_entries (id),
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index sol_returns_delivery_idx on public.sol_returns (sol_delivery_id);

create table public.sol_return_items (
  id uuid primary key default gen_random_uuid(),
  sol_return_id uuid not null references public.sol_returns (id) on delete cascade,
  sol_delivery_item_id uuid not null references public.sol_delivery_items (id),
  quantity numeric(12,2) not null check (quantity > 0),
  cost_amount numeric(18,2) not null default 0
);
create index sol_return_items_return_idx on public.sol_return_items (sol_return_id);
create index sol_return_items_item_idx on public.sol_return_items (sol_delivery_item_id);

create trigger sol_deliveries_doc_no before insert on public.sol_deliveries for each row execute function private.assign_doc_no('SOLD');
create trigger sol_returns_doc_no before insert on public.sol_returns for each row execute function private.assign_doc_no('SOLR');

-- Without sol.view_all: jobs one is responsible for, created, or delivers.
create function private.sees_sol_job(p_job_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission('sol.view')
     and (private.has_permission('sol.view_all')
          or exists (select 1 from public.sol_jobs j where j.id = p_job_id
                       and (j.responsible_employee_id = private.current_employee_id() or j.created_by = auth.uid()
                            or j.driver_id = private.current_driver_id()))
          or exists (select 1 from public.sol_deliveries d where d.sol_job_id = p_job_id and d.status::text <> 'cancelled'
                       and d.driver_id = private.current_driver_id()));
$$;
create function private.sees_sol_client(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sol_jobs j where j.customer_id = p_customer_id and private.sees_sol_job(j.id));
$$;

drop policy "select" on public.sol_jobs;
create policy "select" on public.sol_jobs for select to authenticated using (
  (select private.has_permission('sol.view')) and ((select private.has_permission('sol.view_all')) or private.sees_sol_job(id)));

do $$
declare
  v_job constant text := '(select private.has_permission(''sol.view'')) and ((select private.has_permission(''sol.view_all'')) or private.sees_sol_job(%s))';
begin
  perform private.apply_policies('sol_job_items', format(v_job, 'sol_job_id'), null, null, null);
  perform private.apply_policies('sol_deliveries', format(v_job, 'sol_job_id'), null, null, null);
end;
$$;
select private.apply_policies('sol_delivery_items', private.parent_expr('sol_deliveries', 'sol_delivery_id'), null, null, null);
select private.apply_policies('sol_returns', private.parent_expr('sol_deliveries', 'sol_delivery_id'), null, null, null);
select private.apply_policies('sol_return_items', private.parent_expr('sol_returns', 'sol_return_id'), null, null, null);

revoke all on public.sol_job_items, public.sol_deliveries, public.sol_delivery_items, public.sol_returns, public.sol_return_items from anon, authenticated;
-- Costs are not readable: unit_cost, cost_total, cost_amount, returned_cost.
grant select (id, sol_job_id, line_no, kind, service_id, product_id, unit_id, factor, description, quantity, unit_price, line_total, delivered_quantity)
  on public.sol_job_items to authenticated;
grant select (id, doc_no, sol_job_id, vehicle_id, driver_id, warehouse_id, delivery_date, destination, status, dispatched_at, dispatched_by, delivered_at, delivered_by,
              received_by, delivery_note, odometer_start, odometer_end, notes, journal_entry_id, client_request_id, created_at, created_by, updated_at, updated_by)
  on public.sol_deliveries to authenticated;
grant select (id, sol_delivery_id, sol_job_item_id, quantity, returned_quantity) on public.sol_delivery_items to authenticated;
grant select (id, doc_no, sol_delivery_id, warehouse_id, return_date, reason, journal_entry_id, client_request_id, created_at, created_by, updated_at, updated_by)
  on public.sol_returns to authenticated;
grant select (id, sol_return_id, sol_delivery_item_id, quantity) on public.sol_return_items to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['sol_job_items', 'sol_deliveries', 'sol_delivery_items', 'sol_returns', 'sol_return_items'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.audit_row()', t);
  end loop;
  foreach t in array array['sol_deliveries', 'sol_returns'] loop
    execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()', t);
  end loop;
end;
$$;

-- Names on jobs: clients, products, units and warehouses.
drop policy "select" on public.customers;
create policy "select" on public.customers for select to authenticated using (
  ((select private.has_permission('customers.view'))
   and ((select private.has_permission('sales.view_all')) or (select private.has_permission('customers.manage'))
        or order_taker_id = (select private.current_employee_id())))
  or ((select private.current_driver_id()) is not null and private.driver_sees_customer(id))
  or (is_sol_client and (select private.has_permission('sol.view'))
      and ((select private.has_permission('sol.view_all')) or private.sees_sol_client(id))));
do $$
declare
  t text;
begin
  foreach t in array array['products', 'units'] loop
    execute format('drop policy "select" on public.%I', t);
    execute format('create policy "select" on public.%I for select to authenticated using (%s)', t,
      (select string_agg(private.p(x), ' or ') from unnest(array['products.view', 'sales.view', 'sales.view_all', 'inventory.view', 'purchasing.view', 'purchasing.create', 'sol.view', 'sol.manage']) x));
  end loop;
end;
$$;
drop policy "select" on public.warehouses;
create policy "select" on public.warehouses for select to authenticated using (
  (select private.has_permission('warehouses.view')) or (select private.has_permission('sales.create')) or (select private.has_permission('sales.view'))
  or (select private.has_permission('sales.view_all')) or (select private.has_permission('inventory.view'))
  or (select private.has_permission('purchasing.view')) or (select private.has_permission('purchasing.create'))
  or (select private.has_permission('sol.view')) or (select private.has_permission('sol.dispatch')));

-- ===========================================================================
-- 5. Saving a job and its life cycle
-- ===========================================================================
create function private.sol_job_received(p_job_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0) from public.customer_payment_allocations where sol_job_id = p_job_id;
$$;

-- p_lines: [{ "id"?, "kind", "service_id"?, "product_id"?, "unit_id"?, "description"?, "quantity", "unit_price", "unit_cost"? }]
-- Lines that were delivered keep their identity and cannot fall below what was delivered.
create function public.save_sol_job(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
  v_type public.sol_job_types%rowtype;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_customer uuid := (p_doc ->> 'customer_id')::uuid;
  v_value numeric(18,2) := (p_doc ->> 'contract_value')::numeric;
  v_responsible uuid := (p_doc ->> 'responsible_employee_id')::uuid;
  v_costs constant boolean := private.has_permission('costs.view');
  v_line record;
  v_keep uuid[] := '{}';
  v_factor integer;
  v_id uuid := p_id;
begin
  perform private.require_permission('sol.manage');
  if v_id is null and v_request is not null then
    select id into v_id from public.sol_jobs where client_request_id = v_request and created_by = auth.uid();
    if v_id is not null then return v_id; end if;
  end if;
  if v_id is not null then
    select * into v_job from public.sol_jobs where id = v_id for update;
    if v_job.id is null or not private.sees_sol_job(v_id) then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
    if v_job.status not in ('draft', 'confirmed', 'in_progress') then
      raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514';
    end if;
    if v_job.status <> 'draft' and v_job.customer_id <> v_customer then
      raise exception 'The client of a confirmed job cannot be changed' using errcode = '23514';
    end if;
  end if;
  if not exists (select 1 from public.customers where id = v_customer and (is_active or id = v_job.customer_id)) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  select * into v_type from public.sol_job_types where id = (p_doc ->> 'job_type_id')::uuid and (is_active or id = v_job.job_type_id);
  if v_type.id is null then raise exception 'Choose a job type' using errcode = '22023'; end if;
  if v_value is null or v_value < 0 then raise exception 'The contract amount is missing' using errcode = '22023'; end if;
  if v_value < coalesce(private.sol_job_received(v_id), 0) then
    raise exception 'The contract amount is below what was already received (%)', private.sol_job_received(v_id) using errcode = '23514';
  end if;
  if v_responsible is not null and v_responsible is distinct from v_job.responsible_employee_id
     and not exists (select 1 from public.employees where id = v_responsible and status::text <> 'terminated') then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  if v_id is null then
    insert into public.sol_jobs (customer_id, job_type_id, contract_value, client_request_id)
    values (v_customer, v_type.id, v_value, v_request) returning id into v_id;
  end if;
  update public.sol_jobs
     set customer_id = v_customer, job_type_id = v_type.id, contract_value = v_value, responsible_employee_id = v_responsible,
         job_date = coalesce((p_doc ->> 'date')::date, job_date), start_date = (p_doc ->> 'start_date')::date, due_date = (p_doc ->> 'due_date')::date,
         contact_name = nullif(trim(p_doc ->> 'contact_name'), ''), contact_phone = nullif(trim(p_doc ->> 'contact_phone'), ''),
         address = nullif(trim(p_doc ->> 'address'), ''), description = nullif(trim(p_doc ->> 'description'), ''), notes = nullif(trim(p_doc ->> 'notes'), '')
   where id = v_id;
  update public.customers set is_sol_client = true where id = v_customer and not is_sol_client;

  for v_line in
    select l.*, x.ordinality::integer as line_no
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality x(doc, ordinality),
           jsonb_to_record(x.doc) as l(id uuid, kind text, service_id uuid, product_id uuid, unit_id uuid, description text, quantity numeric, unit_price numeric, unit_cost numeric)
  loop
    if (v_line.kind = 'service' and not v_type.uses_services) or (v_line.kind = 'product' and not v_type.uses_products) then
      raise exception 'This job type does not use %', case v_line.kind when 'service' then 'services' else 'products' end using errcode = '23514';
    end if;
    v_factor := 1;
    if v_line.kind = 'product' then
      select pu.factor into v_factor from public.product_units pu where pu.product_id = v_line.product_id and pu.unit_id = v_line.unit_id;
      if v_factor is null then raise exception 'Unit is not configured for this product' using errcode = '23503'; end if;
    end if;
    if v_line.id is not null then
      if exists (select 1 from public.sol_job_items i where i.id = v_line.id and i.sol_job_id = v_id
                    and exists (select 1 from public.sol_delivery_items di where di.sol_job_item_id = i.id)
                    and (i.kind, i.service_id, i.product_id, i.unit_id) is distinct from (v_line.kind, v_line.service_id, v_line.product_id, v_line.unit_id)) then
        raise exception 'A line that is on a delivery can only change its quantity and price' using errcode = '23514';
      end if;
      if exists (select 1 from public.sol_job_items i where i.id = v_line.id and i.sol_job_id = v_id and v_line.quantity < i.delivered_quantity) then
        raise exception 'The quantity is below what was already delivered' using errcode = '23514';
      end if;
      update public.sol_job_items
         set line_no = v_line.line_no, kind = v_line.kind, service_id = v_line.service_id, product_id = v_line.product_id, unit_id = v_line.unit_id,
             factor = case when product_id is not distinct from v_line.product_id and unit_id is not distinct from v_line.unit_id then factor else v_factor end,
             description = nullif(trim(v_line.description), ''), quantity = v_line.quantity, unit_price = coalesce(v_line.unit_price, 0),
             -- Someone who cannot see costs cannot overwrite them.
             unit_cost = case when v_costs then v_line.unit_cost else unit_cost end
       where id = v_line.id and sol_job_id = v_id;
      if not found then raise exception 'A line does not belong to this job' using errcode = '23514'; end if;
      v_keep := v_keep || v_line.id;
    else
      insert into public.sol_job_items (sol_job_id, line_no, kind, service_id, product_id, unit_id, factor, description, quantity, unit_price, unit_cost)
      values (v_id, v_line.line_no, v_line.kind, v_line.service_id, v_line.product_id, v_line.unit_id, v_factor, nullif(trim(v_line.description), ''),
              v_line.quantity, coalesce(v_line.unit_price, 0), v_line.unit_cost)
      returning id into v_line.id;
      v_keep := v_keep || v_line.id;
    end if;
  end loop;
  if exists (select 1 from public.sol_job_items i join public.sol_delivery_items di on di.sol_job_item_id = i.id
              where i.sol_job_id = v_id and i.id <> all (v_keep)) then
    raise exception 'A line that is on a delivery cannot be removed' using errcode = '23514';
  end if;
  delete from public.sol_job_items where sol_job_id = v_id and id <> all (v_keep);
  return v_id;
end;
$$;

create function public.delete_sol_job(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('sol.manage');
  if not private.sees_sol_job(p_id) then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  delete from public.sol_jobs where id = p_id and status = 'draft';
  if not found then raise exception 'Only draft jobs can be deleted' using errcode = '23514'; end if;
  return p_id;
end;
$$;

-- Confirm and start. Completing and cancelling have their own functions.
create or replace function public.set_sol_job_status(p_id uuid, p_status public.sol_job_status) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
begin
  perform private.require_permission('sol.manage');
  select * into v_job from public.sol_jobs where id = p_id for update;
  if v_job.id is null or not private.sees_sol_job(p_id) then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if not ((v_job.status = 'draft' and p_status = 'confirmed') or (v_job.status = 'confirmed' and p_status = 'in_progress')) then
    raise exception 'Cannot change SOL job from % to %', v_job.status, p_status using errcode = '23514';
  end if;
  update public.sol_jobs
     set status = p_status,
         started_at = case when p_status = 'in_progress' then now() else started_at end,
         -- A job started after its due date keeps that date, so it stays visible as late.
         start_date = case when p_status = 'in_progress' and (due_date is null or due_date >= private.business_today())
                           then coalesce(start_date, private.business_today()) else start_date end
   where id = p_id;
  return p_id;
end;
$$;

-- Received money stays on the client's account.
create function public.cancel_sol_job(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
begin
  perform private.require_permission('sol.manage');
  select * into v_job from public.sol_jobs where id = p_id for update;
  if v_job.id is null or not private.sees_sol_job(p_id) then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if v_job.status not in ('draft', 'confirmed', 'in_progress') then
    raise exception 'Cannot change SOL job from % to %', v_job.status, 'cancelled' using errcode = '23514';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if exists (select 1 from public.sol_deliveries where sol_job_id = p_id and status = 'dispatched') then
    raise exception 'A delivery of this job is on the way; complete it first' using errcode = '23514';
  end if;
  if exists (select 1 from public.customer_payment_allocations where sol_job_id = p_id) then
    if not private.has_permission('receivables.post') then
      raise exception 'Payments were received for this job; someone who posts payments must cancel it' using errcode = '23514';
    end if;
    delete from public.customer_payment_allocations where sol_job_id = p_id;
  end if;
  update public.sol_deliveries set status = 'cancelled' where sol_job_id = p_id and status = 'draft';
  update public.sol_jobs set status = 'cancelled', cancel_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

-- Completing a job recognises its contract amount as a receivable from the client.
drop function public.complete_sol_job(uuid);
create function public.complete_sol_job(p_id uuid, p_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
  v_date date := coalesce(p_date, private.business_today());
  v_je uuid;
begin
  perform private.require_permission('sol.post');
  select * into v_job from public.sol_jobs where id = p_id for update;
  if v_job.id is null then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if v_job.status not in ('confirmed', 'in_progress') then
    raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514';
  end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if v_date < v_job.job_date then raise exception 'The completion date is before the job date' using errcode = '22023'; end if;
  if exists (select 1 from public.sol_deliveries where sol_job_id = p_id and status in ('draft', 'dispatched')) then
    raise exception 'A delivery of this job is planned or on the way; complete or cancel it first' using errcode = '23514';
  end if;
  if v_job.contract_value > 0 then
    v_je := private.post_journal(v_date, 'SOL job ' || v_job.doc_no, 'sol_job', v_job.id,
      jsonb_build_array(
        jsonb_build_object('account', 'AR', 'debit', v_job.contract_value, 'customer_id', v_job.customer_id),
        jsonb_build_object('account', 'SOL_REVENUE', 'credit', v_job.contract_value, 'customer_id', v_job.customer_id)));
  end if;
  update public.sol_jobs
     set status = 'completed', completed_at = now(), completion_date = v_date, journal_entry_id = v_je, reopen_reason = null
   where id = p_id;
  return p_id;
end;
$$;

-- Undo a completion, for example to correct the contract amount. Payments stay allocated, as advances.
create function public.reopen_sol_job(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
begin
  perform private.require_permission('sol.post');
  select * into v_job from public.sol_jobs where id = p_id for update;
  if v_job.id is null then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if v_job.status <> 'completed' then raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if v_job.journal_entry_id is not null then
    perform private.reverse_journal(v_job.journal_entry_id, greatest(private.business_today(), v_job.completion_date), trim(p_reason));
  end if;
  update public.sol_jobs
     set status = 'in_progress', completed_at = null, completion_date = null, journal_entry_id = null, reopen_reason = trim(p_reason),
         started_at = coalesce(started_at, now())
   where id = p_id;
  return p_id;
end;
$$;

-- ===========================================================================
-- 6. Deliveries: vehicle and driver assignment, dispatch, arrival, goods brought back
-- ===========================================================================
alter type public.stock_movement_type add value if not exists 'sol_issue';
alter type public.stock_movement_type add value if not exists 'sol_return';
-- Compared as text: new enum values cannot be used in the transaction that adds them.
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.stock_movements'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%write_off%';
  execute format('alter table public.stock_movements drop constraint %I', v_name);
end;
$$;
alter table public.stock_movements add constraint stock_movements_direction check (
  (movement_type::text in ('opening', 'purchase_receipt', 'sales_return', 'transfer_in', 'adjustment_in', 'sol_return') and quantity > 0)
  or (movement_type::text in ('purchase_return', 'sale', 'transfer_out', 'adjustment_out', 'write_off', 'sol_issue') and quantity < 0));

-- Plans a delivery: which vehicle and driver take what, where. p_lines: [{ "job_item_id", "quantity" }], may be empty.
create function public.save_sol_delivery(p_id uuid, p_job_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
  v_delivery public.sol_deliveries%rowtype;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_id uuid := p_id;
  v_vehicle uuid := (p_doc ->> 'vehicle_id')::uuid;
  v_driver uuid := (p_doc ->> 'driver_id')::uuid;
begin
  if not private.has_permission('sol.dispatch') then
    perform private.require_permission('sol.manage');
  end if;
  select * into v_job from public.sol_jobs where id = p_job_id for update;
  if v_job.id is null or not private.sees_sol_job(p_job_id) then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if v_id is null and v_request is not null then
    select id into v_id from public.sol_deliveries where client_request_id = v_request and sol_job_id = p_job_id;
    if v_id is not null then return v_id; end if;
  end if;
  if v_job.status not in ('confirmed', 'in_progress') then
    raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514';
  end if;
  if exists (select 1 from public.sol_job_types where id = v_job.job_type_id and not uses_deliveries) then
    raise exception 'This job type does not use deliveries' using errcode = '23514';
  end if;
  if v_vehicle is not null and not exists (select 1 from public.vehicles where id = v_vehicle and is_active) then
    raise exception 'The vehicle is not in service' using errcode = '23514';
  end if;
  if v_driver is not null and not exists (select 1 from public.drivers where id = v_driver and is_active) then
    raise exception 'The driver is not active' using errcode = '23514';
  end if;
  if v_id is null then
    insert into public.sol_deliveries (sol_job_id, destination, client_request_id)
    values (p_job_id, coalesce(nullif(trim(p_doc ->> 'destination'), ''), v_job.address), v_request) returning id into v_id;
  else
    select * into v_delivery from public.sol_deliveries where id = v_id and sol_job_id = p_job_id for update;
    if v_delivery.id is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
    if v_delivery.status <> 'draft' then raise exception 'Only planned deliveries can be changed' using errcode = '23514'; end if;
  end if;
  update public.sol_deliveries
     set vehicle_id = v_vehicle, driver_id = v_driver, warehouse_id = (p_doc ->> 'warehouse_id')::uuid,
         delivery_date = coalesce((p_doc ->> 'date')::date, delivery_date), destination = coalesce(nullif(trim(p_doc ->> 'destination'), ''), v_job.address),
         odometer_start = (p_doc ->> 'odometer_start')::bigint, notes = nullif(trim(p_doc ->> 'notes'), '')
   where id = v_id;
  delete from public.sol_delivery_items where sol_delivery_id = v_id;
  insert into public.sol_delivery_items (sol_delivery_id, sol_job_item_id, quantity)
  select v_id, i.id, l.quantity
    from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as l(job_item_id uuid, quantity numeric)
    left join public.sol_job_items i on i.id = l.job_item_id and i.sol_job_id = p_job_id
   where l.quantity > 0;
  if exists (select 1 from public.sol_delivery_items di join public.sol_job_items i on i.id = di.sol_job_item_id
              where di.sol_delivery_id = v_id and i.kind = 'product' and di.quantity <> trunc(di.quantity)) then
    raise exception 'Products are delivered in whole units' using errcode = '23514';
  end if;
  return v_id;
end;
$$;

create function public.cancel_sol_delivery(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.sol_deliveries%rowtype;
begin
  if not private.has_permission('sol.dispatch') then
    perform private.require_permission('sol.manage');
  end if;
  select * into v_delivery from public.sol_deliveries where id = p_id for update;
  if v_delivery.id is null or not private.sees_sol_job(v_delivery.sol_job_id) then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if v_delivery.status <> 'draft' then raise exception 'Only planned deliveries can be cancelled' using errcode = '23514'; end if;
  update public.sol_deliveries set status = 'cancelled' where id = p_id;
  return p_id;
end;
$$;

-- Dispatch: products leave the warehouse and become a direct cost of the job.
create function public.dispatch_sol_delivery(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.sol_deliveries%rowtype;
  v_job public.sol_jobs%rowtype;
  v_line record;
  v_cost numeric(18,2);
  v_total numeric(18,2) := 0;
  v_je uuid;
begin
  perform private.require_permission('sol.dispatch');
  select sol_job_id into v_delivery.sol_job_id from public.sol_deliveries where id = p_id;
  select * into v_job from public.sol_jobs where id = v_delivery.sol_job_id for update;
  select * into v_delivery from public.sol_deliveries where id = p_id for update;
  if v_delivery.id is null or not private.sees_sol_job(v_job.id) then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if v_delivery.status <> 'draft' then raise exception 'Delivery % is already %', v_delivery.doc_no, v_delivery.status using errcode = '23514'; end if;
  if v_job.status not in ('confirmed', 'in_progress') then
    raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514';
  end if;
  if v_delivery.vehicle_id is not null and not exists (select 1 from public.vehicles where id = v_delivery.vehicle_id and is_active) then
    raise exception 'The vehicle is not in service' using errcode = '23514';
  end if;

  for v_line in
    select di.id, di.quantity, i.id as job_item_id, i.kind, i.product_id, i.factor, i.quantity - i.delivered_quantity as remaining
      from public.sol_delivery_items di join public.sol_job_items i on i.id = di.sol_job_item_id
     where di.sol_delivery_id = p_id
     order by i.product_id, i.id
  loop
    if v_line.quantity > v_line.remaining then
      raise exception 'More than the job still needs (remaining %)', v_line.remaining using errcode = '23514';
    end if;
    if v_line.kind = 'product' then
      if v_delivery.warehouse_id is null then raise exception 'Choose the warehouse the products leave from' using errcode = '22023'; end if;
      v_cost := -private.move_stock(v_line.product_id, v_delivery.warehouse_id, -(v_line.quantity * v_line.factor)::bigint, 'sol_issue',
                                    private.business_today(), 'sol_delivery', p_id, v_line.id);
      update public.sol_delivery_items set cost_amount = v_cost where id = v_line.id;
      v_total := v_total + v_cost;
    end if;
    update public.sol_job_items set delivered_quantity = delivered_quantity + v_line.quantity where id = v_line.job_item_id;
  end loop;
  if v_total > 0 then
    v_je := private.post_journal(private.business_today(), 'SOL delivery ' || v_delivery.doc_no || ' for ' || v_job.doc_no, 'sol_delivery', p_id,
      jsonb_build_array(jsonb_build_object('account', 'SOL_COSTS', 'debit', v_total), jsonb_build_object('account', 'INVENTORY', 'credit', v_total)));
  end if;
  update public.sol_deliveries
     set status = 'dispatched', dispatched_at = now(), dispatched_by = auth.uid(), cost_total = v_total, journal_entry_id = v_je
   where id = p_id;
  if v_job.status = 'confirmed' then
    update public.sol_jobs
       set status = 'in_progress', started_at = coalesce(started_at, now()),
           start_date = case when due_date is null or due_date >= private.business_today() then coalesce(start_date, private.business_today()) else start_date end
     where id = v_job.id;
  end if;
  return p_id;
end;
$$;

-- Goods come back at the cost they were issued at. Rounding is cumulative, so returning everything reverses the exact cost.
create function private.return_sol_goods(p_delivery_id uuid, p_warehouse_id uuid, p_reason text, p_lines jsonb, p_request uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.sol_deliveries%rowtype;
  v_id uuid;
  v_line record;
  v_cost numeric(18,2);
  v_total numeric(18,2) := 0;
  v_booked numeric(18,2);
  v_je uuid;
begin
  select * into v_delivery from public.sol_deliveries where id = p_delivery_id for update;
  if v_delivery.status not in ('dispatched', 'delivered') then raise exception 'Nothing was sent with this delivery' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if p_request is not null then
    select id into v_id from public.sol_returns where client_request_id = p_request;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.sol_returns (sol_delivery_id, warehouse_id, reason, client_request_id)
  values (p_delivery_id, p_warehouse_id, trim(p_reason), p_request) returning id into v_id;
  for v_line in
    select di.id, l.quantity, di.quantity as sent, di.returned_quantity, di.cost_amount, di.returned_cost, i.id as job_item_id, i.kind, i.product_id, i.factor
      from jsonb_to_recordset(p_lines) as l(delivery_item_id uuid, quantity numeric)
      left join public.sol_delivery_items di on di.id = l.delivery_item_id and di.sol_delivery_id = p_delivery_id
      left join public.sol_job_items i on i.id = di.sol_job_item_id
     order by i.product_id, i.id
  loop
    if v_line.id is null then raise exception 'A returned line does not belong to this delivery' using errcode = '23514'; end if;
    if v_line.quantity <= 0 then raise exception 'Quantities must be positive' using errcode = '22023'; end if;
    if v_line.returned_quantity + v_line.quantity > v_line.sent then
      raise exception 'More is returned than was sent (%)', v_line.sent - v_line.returned_quantity using errcode = '23514';
    end if;
    v_cost := 0;
    if v_line.kind = 'product' then
      if v_line.quantity <> trunc(v_line.quantity) then raise exception 'Products are delivered in whole units' using errcode = '23514'; end if;
      if p_warehouse_id is null then raise exception 'Choose the warehouse the products return to' using errcode = '22023'; end if;
      v_cost := round(v_line.cost_amount * (v_line.returned_quantity + v_line.quantity) / v_line.sent, 2) - v_line.returned_cost;
      perform private.move_stock(v_line.product_id, p_warehouse_id, (v_line.quantity * v_line.factor)::bigint, 'sol_return',
                                 private.business_today(), 'sol_return', v_id, v_line.id, v_cost);
    end if;
    insert into public.sol_return_items (sol_return_id, sol_delivery_item_id, quantity, cost_amount) values (v_id, v_line.id, v_line.quantity, v_cost);
    update public.sol_delivery_items set returned_quantity = returned_quantity + v_line.quantity, returned_cost = returned_cost + v_cost where id = v_line.id;
    update public.sol_job_items set delivered_quantity = delivered_quantity - v_line.quantity where id = v_line.job_item_id;
    v_total := v_total + v_cost;
  end loop;
  if not exists (select 1 from public.sol_return_items where sol_return_id = v_id) then
    raise exception 'Enter at least one quantity' using errcode = '22023';
  end if;
  if v_total > 0 then
    -- Goods that settle stock issued below zero are valued at that issue; the difference is an inventory variance.
    select coalesce(sum(value_change), 0) into v_booked from public.stock_movements where source_type = 'sol_return' and source_id = v_id;
    v_je := private.post_journal(private.business_today(), 'SOL return to ' || v_delivery.doc_no, 'sol_return', v_id,
      jsonb_build_array(
        jsonb_build_object('account', 'INVENTORY', 'debit', greatest(v_booked, 0), 'credit', greatest(-v_booked, 0)),
        jsonb_build_object('account', 'INVENTORY_VARIANCE', 'debit', greatest(v_total - v_booked, 0), 'credit', greatest(v_booked - v_total, 0)),
        jsonb_build_object('account', 'SOL_COSTS', 'credit', v_total)));
  end if;
  update public.sol_returns set cost_total = v_total, journal_entry_id = v_je where id = v_id;
  return v_id;
end;
$$;

-- The goods arrived. The assigned driver may confirm; recording goods brought back needs sol.dispatch.
create function public.complete_sol_delivery(p_id uuid, p_doc jsonb default '{}'::jsonb, p_returns jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.sol_deliveries%rowtype;
begin
  select sol_job_id into v_delivery.sol_job_id from public.sol_deliveries where id = p_id;
  perform 1 from public.sol_jobs where id = v_delivery.sol_job_id for update;
  select * into v_delivery from public.sol_deliveries where id = p_id for update;
  if not private.has_permission('sol.dispatch')
     and (v_delivery.id is null or v_delivery.driver_id is null or v_delivery.driver_id is distinct from private.current_driver_id()) then
    perform private.require_permission('sol.dispatch');
  end if;
  if v_delivery.id is null or not private.sees_sol_job(v_delivery.sol_job_id) then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if v_delivery.status <> 'dispatched' then raise exception 'Only dispatched deliveries can be confirmed' using errcode = '23514'; end if;
  if jsonb_array_length(coalesce(p_returns, '[]'::jsonb)) > 0 then
    perform private.require_permission('sol.dispatch');
    perform private.return_sol_goods(p_id, coalesce((p_doc ->> 'warehouse_id')::uuid, v_delivery.warehouse_id), p_doc ->> 'return_reason', p_returns);
  end if;
  update public.sol_deliveries
     set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(), received_by = nullif(trim(p_doc ->> 'received_by'), ''),
         delivery_note = nullif(trim(p_doc ->> 'notes'), ''), odometer_end = (p_doc ->> 'odometer_end')::bigint
   where id = p_id;
  return p_id;
end;
$$;

create function public.return_sol_goods(p_delivery_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job uuid;
begin
  perform private.require_permission('sol.dispatch');
  select sol_job_id into v_job from public.sol_deliveries where id = p_delivery_id and status = 'delivered';
  if v_job is null or not private.sees_sol_job(v_job) then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  perform 1 from public.sol_jobs where id = v_job for update;
  return private.return_sol_goods(p_delivery_id, (p_doc ->> 'warehouse_id')::uuid, p_doc ->> 'reason', p_lines, (p_doc ->> 'client_request_id')::uuid);
end;
$$;

-- ===========================================================================
-- 7. Payments of SOL clients
-- ===========================================================================
alter table public.customer_payments
  -- The job the payment was received for; allocated to it when posted.
  add column sol_job_id uuid references public.sol_jobs (id),
  -- Account, card or cheque the client paid from: last four characters only.
  add column payer_account text;
create index customer_payments_sol_job_idx on public.customer_payments (sol_job_id) where sol_job_id is not null;
select private.restrict_columns('customer_payments', array[
  'doc_no', 'status', 'journal_entry_id', 'posted_at', 'posted_by', 'created_at', 'created_by', 'updated_at', 'updated_by',
  'requested_allocations', 'void_reason', 'sol_job_id']);
update public.customer_payments p set sol_job_id = x.job
  from (select customer_payment_id, (array_agg(sol_job_id))[1] as job from public.customer_payment_allocations
         group by customer_payment_id having count(*) = 1 and count(sol_job_id) = 1) x
 where x.customer_payment_id = p.id;

create function private.mask_payer_account() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.payer_account := private.mask_account(new.payer_account);
  return new;
end;
$$;
create trigger customer_payments_mask before insert or update of payer_account on public.customer_payments
  for each row execute function private.mask_payer_account();

create function private.allocate_payment_to_sol_job(p_payment_id uuid, p_job_id uuid, p_amount numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.customer_payments%rowtype;
  v_job public.sol_jobs%rowtype;
  v_balance numeric(18,2);
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Allocation amount must be positive' using errcode = '22023'; end if;
  select * into v_payment from public.customer_payments where id = p_payment_id for update;
  select * into v_job from public.sol_jobs where id = p_job_id for update;
  if v_payment.id is null or v_job.id is null then raise exception 'Payment or SOL job not found' using errcode = 'P0002'; end if;
  if v_payment.status <> 'posted' then raise exception 'Only posted payments can be allocated' using errcode = '23514'; end if;
  if v_job.status in ('draft', 'cancelled') then raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514'; end if;
  if v_payment.customer_id <> v_job.customer_id then
    raise exception 'Payment and SOL job belong to different clients' using errcode = '23514';
  end if;
  if p_amount > private.payment_unallocated(p_payment_id) then
    raise exception 'Allocation exceeds the unallocated payment amount (%)', private.payment_unallocated(p_payment_id) using errcode = '23514';
  end if;
  v_balance := v_job.contract_value - private.sol_job_received(p_job_id);
  if p_amount > v_balance then raise exception 'Allocation exceeds the job balance (%)', v_balance using errcode = '23514'; end if;
  insert into public.customer_payment_allocations (customer_payment_id, sol_job_id, amount)
  values (p_payment_id, p_job_id, p_amount)
  on conflict (customer_payment_id, sol_job_id)
  do update set amount = public.customer_payment_allocations.amount + excluded.amount
  returning id into v_id;
  return v_id;
end;
$$;
create or replace function public.allocate_payment_to_sol_job(p_payment_id uuid, p_job_id uuid, p_amount numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('receivables.post');
  return private.allocate_payment_to_sol_job(p_payment_id, p_job_id, p_amount);
end;
$$;

-- Takes a payment off a job; it stays on the client's account.
create function public.release_sol_payment(p_payment_id uuid, p_job_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('receivables.post');
  perform 1 from public.customer_payments where id = p_payment_id for update;
  delete from public.customer_payment_allocations where customer_payment_id = p_payment_id and sol_job_id = p_job_id;
  if not found then raise exception 'This payment is not allocated to the job' using errcode = 'P0002'; end if;
  return p_payment_id;
end;
$$;

-- As before, and a payment received for a job is allocated to it.
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
    jsonb_build_array(
      case when v_doc.financial_account_id is null
           then jsonb_build_object('account', 'CASH_WITH_COLLECTORS', 'debit', v_doc.amount, 'employee_id', v_doc.collected_by)
           else jsonb_build_object('account_id', private.financial_gl(v_doc.financial_account_id), 'debit', v_doc.amount) end,
      jsonb_build_object('account', 'AR', 'credit', v_doc.amount, 'customer_id', v_doc.customer_id)));

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

-- An advance, part or final payment for a job. Posted at once by someone with receivables.post; otherwise it waits for them.
create function public.record_sol_payment(p_job_id uuid, p_doc jsonb) returns uuid
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
  insert into public.customer_payments (customer_id, sol_job_id, payment_date, amount, financial_account_id, method, reference, payer_account, collected_by, notes, client_request_id)
  values (v_job.customer_id, p_job_id, v_date, v_amount, (p_doc ->> 'financial_account_id')::uuid, (p_doc ->> 'method')::public.payment_method,
          nullif(trim(p_doc ->> 'reference'), ''), p_doc ->> 'payer_account', private.current_employee_id(), nullif(trim(p_doc ->> 'notes'), ''), v_request)
  returning id into v_id;
  if private.has_permission('receivables.post') then
    perform private.post_customer_payment(v_id);
  end if;
  return v_id;
end;
$$;

-- Accounts money can be received in or paid from, recognisable without showing the number.
create function public.list_payment_accounts()
returns table (account_id uuid, name text, account_type public.financial_account_type, masked text, is_active boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (private.has_permission('receivables.collect') or private.has_permission('receivables.post') or private.has_permission('payables.pay')
          or private.has_permission('company.pay') or private.has_permission('expenses.create') or private.has_permission('expenses.view')) then
    perform private.require_permission('cash_bank.view');
  end if;
  return query
  select fa.id, fa.name, fa.account_type, private.mask_account(coalesce(b.account_number, b.iban)), fa.is_active
    from public.financial_accounts fa left join public.financial_account_bank_details b on b.financial_account_id = fa.id
   order by fa.account_type, fa.name;
end;
$$;

-- Creates or renames a cash or bank account; the type is fixed once created. Row level security asks for cash_bank.manage.
create function public.save_financial_account(p_id uuid, p_doc jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_type public.financial_account_type := (p_doc ->> 'account_type')::public.financial_account_type;
begin
  if p_id is null then
    insert into public.financial_accounts (id, name, account_type, notes) values (v_id, trim(p_doc ->> 'name'), v_type, p_doc ->> 'notes');
  else
    update public.financial_accounts set name = trim(p_doc ->> 'name'), notes = p_doc ->> 'notes', is_active = coalesce((p_doc ->> 'is_active')::boolean, true)
     where id = v_id returning account_type into v_type;
    if not found then raise exception 'Account not found' using errcode = 'P0002'; end if;
  end if;
  if v_type = 'bank' then
    insert into public.financial_account_bank_details (financial_account_id, bank_name, account_title, account_number, iban, branch)
    values (v_id, coalesce(nullif(trim(p_doc ->> 'bank_name'), ''), trim(p_doc ->> 'name')), p_doc ->> 'account_title', p_doc ->> 'account_number', p_doc ->> 'iban', p_doc ->> 'branch')
    on conflict (financial_account_id) do update
      set bank_name = excluded.bank_name, account_title = excluded.account_title, account_number = excluded.account_number, iban = excluded.iban, branch = excluded.branch;
  end if;
  return v_id;
end;
$$;

-- ===========================================================================
-- 8. Expenses of jobs and vehicles
-- ===========================================================================
alter table public.expenses
  add column method public.payment_method,
  add column reference text,
  add column litres numeric(10,2) check (litres > 0),
  add column odometer bigint check (odometer >= 0),
  add column void_reason text;
select private.restrict_columns('expenses', array[
  'doc_no', 'status', 'journal_entry_id', 'posted_at', 'posted_by', 'created_at', 'created_by', 'updated_at', 'updated_by', 'void_reason']);

-- Costs belong to confirmed jobs; a cancelled job takes no new costs.
create function private.validate_expense_job() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
begin
  if new.sol_job_id is not null and (tg_op = 'INSERT' or new.sol_job_id is distinct from old.sol_job_id or (new.status = 'posted' and old.status = 'draft')) then
    select * into v_job from public.sol_jobs where id = new.sol_job_id;
    if v_job.status in ('draft', 'cancelled') then
      raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger expenses_validate_job before insert or update of sol_job_id, status on public.expenses
  for each row execute function private.validate_expense_job();

-- Whoever prepares an expense needs the names of the categories.
drop policy "select" on public.expense_categories;
create policy "select" on public.expense_categories for select to authenticated using (
  (select private.has_permission('expenses.view')) or (select private.has_permission('expenses.create')) or (select private.has_permission('expenses.post'))
  or (select private.has_permission('vehicles.view')));

-- Records an expense; posted at once by someone with expenses.post, otherwise a draft that waits for them.
create function public.record_expense(p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_job uuid := (p_doc ->> 'sol_job_id')::uuid;
  v_date date := coalesce((p_doc ->> 'date')::date, private.business_today());
  v_id uuid;
begin
  perform private.require_permission('expenses.create');
  select id into v_id from public.expenses where client_request_id = v_request and created_by = auth.uid();
  if v_id is not null then return v_id; end if;
  if v_job is not null and not private.sees_sol_job(v_job) then raise exception 'SOL job not found' using errcode = 'P0002'; end if;
  if v_date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if not exists (select 1 from public.expense_categories where id = (p_doc ->> 'category_id')::uuid and is_active) then
    raise exception 'Expense category is inactive' using errcode = '23514';
  end if;
  if not exists (select 1 from public.financial_accounts where id = (p_doc ->> 'financial_account_id')::uuid and is_active) then
    raise exception 'Choose the account that paid' using errcode = '22023';
  end if;
  insert into public.expenses (expense_date, category_id, amount, financial_account_id, method, reference, payee, description, vehicle_id, sol_job_id, litres, odometer, client_request_id)
  values (v_date, (p_doc ->> 'category_id')::uuid, (p_doc ->> 'amount')::numeric, (p_doc ->> 'financial_account_id')::uuid, (p_doc ->> 'method')::public.payment_method,
          nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'payee'), ''), nullif(trim(p_doc ->> 'description'), ''), (p_doc ->> 'vehicle_id')::uuid, v_job,
          (p_doc ->> 'litres')::numeric, (p_doc ->> 'odometer')::bigint, v_request)
  returning id into v_id;
  if private.has_permission('expenses.post') then
    perform public.post_expense(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.void_expense(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.expenses%rowtype;
  v_rev uuid;
begin
  perform private.require_permission('expenses.post');
  select * into v_doc from public.expenses where id = p_id for update;
  if v_doc.id is null then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted expenses can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  v_rev := private.reverse_journal(v_doc.journal_entry_id, greatest(private.business_today(), v_doc.expense_date), trim(p_reason));
  update public.expenses set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return v_rev;
end;
$$;

-- ===========================================================================
-- 9. Figures and reports
-- ===========================================================================
-- Actual costs of each job: products issued less returned, other posted expenses, posted expenses of a vehicle.
create function private.sol_job_costs()
returns table (job_id uuid, products numeric, other_costs numeric, vehicle_expenses numeric)
language sql stable security definer set search_path = '' as $$
  select x.job_id, sum(x.products), sum(x.other_costs), sum(x.vehicle)
    from (select d.sol_job_id as job_id, d.cost_total as products, 0::numeric as other_costs, 0::numeric as vehicle from public.sol_deliveries d where d.cost_total <> 0
          union all
          select d.sol_job_id, -r.cost_total, 0, 0 from public.sol_returns r join public.sol_deliveries d on d.id = r.sol_delivery_id
          union all
          select e.sol_job_id, 0, case when e.vehicle_id is null then e.amount else 0 end, case when e.vehicle_id is not null then e.amount else 0 end
            from public.expenses e where e.status = 'posted' and e.sol_job_id is not null) x
   group by x.job_id;
$$;
create function private.sol_receipts() returns table (job_id uuid, received numeric)
language sql stable security definer set search_path = '' as $$
  select sol_job_id, sum(amount) from public.customer_payment_allocations where sol_job_id is not null group by sol_job_id;
$$;

drop view public.secure_sol_job_profitability;
drop view public.v_sol_job_summary;
create view public.v_sol_job_summary with (security_invoker = true) as
select j.id as sol_job_id, j.doc_no, j.customer_id, j.job_date, j.status, j.contract_value,
       case when s.sees then coalesce(r.received, 0) end as received_amount,
       case when s.sees and j.status not in ('draft', 'cancelled') then j.contract_value - coalesce(r.received, 0) end as pending_amount
  from public.sol_jobs j
  cross join (select private.sees_settlements() as sees) s
  left join private.sol_receipts() r on r.job_id = j.id;
revoke all on public.v_sol_job_summary from anon, authenticated;
grant select on public.v_sol_job_summary to authenticated;

-- Profit is known when a job is completed or cancelled; until then only its costs so far are.
create function public.report_sol_jobs(p_from date default null, p_to date default null, p_status text default null, p_customer_id uuid default null,
                                       p_type_id uuid default null, p_job_id uuid default null)
returns table (job_id uuid, doc_no text, job_date date, customer_id uuid, customer text, customer_ur text, type_en text, type_ur text,
               responsible_en text, responsible_ur text, status public.sol_job_status, start_date date, due_date date, completion_date date,
               contract_value numeric, received numeric, pending numeric, estimated_cost numeric, product_costs numeric, other_costs numeric,
               direct_costs numeric, vehicle_expenses numeric, profit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_costs constant boolean := private.has_permission('costs.view');
  v_paid constant boolean := private.sees_settlements();
  v_all constant boolean := private.has_permission('sol.view_all');
begin
  perform private.require_permission('sol.view');
  return query
  select j.id, j.doc_no, j.job_date, c.id, c.name, c.name_ur, ty.name_en, ty.name_ur, e.full_name, e.full_name_ur, j.status, j.start_date, j.due_date, j.completion_date,
         j.contract_value,
         case when v_paid then coalesce(r.received, 0) end,
         case when v_paid then case when j.status in ('draft', 'cancelled') then 0 else j.contract_value - coalesce(r.received, 0) end end,
         case when v_costs then (select sum(round(i.quantity * i.unit_cost, 2)) from public.sol_job_items i where i.sol_job_id = j.id) end,
         case when v_costs then coalesce(k.products, 0) end,
         case when v_costs then coalesce(k.other_costs, 0) end,
         case when v_costs then coalesce(k.products, 0) + coalesce(k.other_costs, 0) end,
         case when v_costs then coalesce(k.vehicle_expenses, 0) end,
         case when v_costs and j.status in ('completed', 'cancelled')
              then case when j.status = 'completed' then j.contract_value else 0 end
                   - coalesce(k.products, 0) - coalesce(k.other_costs, 0) - coalesce(k.vehicle_expenses, 0) end
    from public.sol_jobs j
    join public.customers c on c.id = j.customer_id
    left join public.sol_job_types ty on ty.id = j.job_type_id
    left join public.employees e on e.id = j.responsible_employee_id
    left join private.sol_receipts() r on r.job_id = j.id
    left join private.sol_job_costs() k on k.job_id = j.id
   where (v_all or private.sees_sol_job(j.id))
     and (p_job_id is null or j.id = p_job_id)
     and (p_from is null or j.job_date >= p_from) and (p_to is null or j.job_date <= p_to)
     and (p_customer_id is null or c.id = p_customer_id) and (p_type_id is null or j.job_type_id = p_type_id)
     and (p_status is null or j.status::text = p_status or (p_status = 'pending' and j.status in ('confirmed', 'in_progress')))
   order by j.job_date desc, j.doc_no desc;
end;
$$;

-- Jobs dated in the period. Drafts are not jobs yet; cancelled jobs count only their costs.
create function public.sol_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform private.require_permission('sol.view');
  select jsonb_strip_nulls(jsonb_build_object(
      'total_jobs', count(*) filter (where status <> 'draft'),
      'completed_jobs', count(*) filter (where status = 'completed'),
      'pending_jobs', count(*) filter (where status in ('confirmed', 'in_progress')),
      'cancelled_jobs', count(*) filter (where status = 'cancelled'),
      'draft_jobs', count(*) filter (where status = 'draft'),
      'overdue_jobs', count(*) filter (where status in ('confirmed', 'in_progress') and due_date < private.business_today()),
      'contract_value', private.money_text(coalesce(sum(contract_value) filter (where status in ('confirmed', 'in_progress', 'completed')), 0)),
      'received', case when private.sees_settlements() then private.money_text(coalesce(sum(received), 0)) end,
      'advances', case when private.sees_settlements() then private.money_text(coalesce(sum(received) filter (where status in ('confirmed', 'in_progress')), 0)) end,
      'pending_payments', case when private.sees_settlements() then private.money_text(coalesce(sum(pending), 0)) end,
      'due_now', case when private.sees_settlements() then private.money_text(coalesce(sum(pending) filter (where status = 'completed'), 0)) end,
      'direct_costs', case when private.has_permission('costs.view') then private.money_text(coalesce(sum(direct_costs), 0)) end,
      'vehicle_expenses', case when private.has_permission('costs.view') then private.money_text(coalesce(sum(vehicle_expenses), 0)) end,
      'profit', case when private.has_permission('costs.view') then private.money_text(coalesce(sum(profit), 0)) end))
    into v from public.report_sol_jobs(p_from, p_to);
  return v;
end;
$$;

-- Use and running costs of each vehicle. Costs need expenses.view.
create function public.report_vehicles(p_from date, p_to date, p_vehicle_id uuid default null)
returns table (vehicle_id uuid, registration_no text, name text, vehicle_type text, status text, driver_en text, driver_ur text,
               jobs bigint, sol_deliveries bigint, sales_deliveries bigint, distance bigint,
               fuel numeric, litres numeric, maintenance numeric, repairs numeric, other numeric, total numeric, for_jobs numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_costs constant boolean := private.has_permission('expenses.view');
begin
  perform private.require_permission('vehicles.view');
  return query
  select v.id, v.registration_no, v.name, v.vehicle_type, v.status, e.full_name, e.full_name_ur,
         coalesce(s.jobs, 0), coalesce(s.deliveries, 0), coalesce(d.deliveries, 0), coalesce(s.distance, 0)::bigint,
         case when v_costs then coalesce(x.fuel, 0) end, case when v_costs then coalesce(x.litres, 0) end, case when v_costs then coalesce(x.maintenance, 0) end,
         case when v_costs then coalesce(x.repairs, 0) end, case when v_costs then coalesce(x.other, 0) end, case when v_costs then coalesce(x.total, 0) end,
         case when v_costs then coalesce(x.for_jobs, 0) end
    from public.vehicles v
    left join public.drivers dr on dr.id = v.driver_id
    left join public.employees e on e.id = dr.employee_id
    left join (select sd.vehicle_id, count(distinct sd.sol_job_id) as jobs, count(*) as deliveries, sum(sd.odometer_end - sd.odometer_start) as distance
                 from public.sol_deliveries sd where sd.status in ('dispatched', 'delivered') and sd.delivery_date between p_from and p_to group by sd.vehicle_id) s on s.vehicle_id = v.id
    left join (select de.vehicle_id, count(*) as deliveries
                 from public.deliveries de where de.status in ('dispatched', 'delivered') and de.delivery_date between p_from and p_to group by de.vehicle_id) d on d.vehicle_id = v.id
    left join (select ex.vehicle_id, sum(ex.amount) as total, sum(ex.litres) as litres,
                      sum(ex.amount) filter (where c.vehicle_kind = 'fuel') as fuel,
                      sum(ex.amount) filter (where c.vehicle_kind = 'maintenance') as maintenance,
                      sum(ex.amount) filter (where c.vehicle_kind = 'repair') as repairs,
                      sum(ex.amount) filter (where coalesce(c.vehicle_kind, 'other') = 'other') as other,
                      sum(ex.amount) filter (where ex.sol_job_id is not null) as for_jobs
                 from public.expenses ex join public.expense_categories c on c.id = ex.category_id
                where ex.status = 'posted' and ex.expense_date between p_from and p_to group by ex.vehicle_id) x on x.vehicle_id = v.id
   where p_vehicle_id is null or v.id = p_vehicle_id
   order by v.registration_no;
end;
$$;

-- Where each vehicle went: SOL deliveries and deliveries of sales orders. Drivers see their own trips.
create function public.report_vehicle_log(p_from date, p_to date, p_vehicle_id uuid default null)
returns table (kind text, delivery_id uuid, doc_no text, delivery_date date, vehicle_id uuid, registration_no text, driver_en text, driver_ur text,
               source_id uuid, source_no text, client text, client_ur text, destination text, status public.delivery_status,
               dispatched_at timestamptz, delivered_at timestamptz, odometer_start bigint, odometer_end bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_me constant uuid := private.current_driver_id();
  v_manage constant boolean := private.has_permission('vehicles.manage');
  v_sol constant boolean := v_manage or private.has_permission('sol.view_all');
  v_sales constant boolean := v_manage or private.has_permission('sales.view_all');
begin
  perform private.require_permission('vehicles.view');
  return query
  select * from (
    select 'sol'::text, d.id, d.doc_no, d.delivery_date, v.id, v.registration_no, e.full_name, e.full_name_ur, j.id, j.doc_no, c.name, c.name_ur, d.destination,
           d.status, d.dispatched_at, d.delivered_at, d.odometer_start, d.odometer_end
      from public.sol_deliveries d
      join public.vehicles v on v.id = d.vehicle_id
      join public.sol_jobs j on j.id = d.sol_job_id
      join public.customers c on c.id = j.customer_id
      left join public.drivers dr on dr.id = d.driver_id left join public.employees e on e.id = dr.employee_id
     where d.delivery_date between p_from and p_to and (p_vehicle_id is null or v.id = p_vehicle_id) and d.status::text <> 'cancelled'
       and (v_sol or d.driver_id = v_me)
    union all
    select 'sales', d.id, d.doc_no, d.delivery_date, v.id, v.registration_no, e.full_name, e.full_name_ur, o.id, o.doc_no, c.name, c.name_ur,
           nullif(concat_ws(', ', c.address, c.city), ''), d.status, d.dispatched_at, d.delivered_at, null::bigint, null::bigint
      from public.deliveries d
      join public.vehicles v on v.id = d.vehicle_id
      join public.sales_orders o on o.id = d.sales_order_id
      join public.customers c on c.id = o.customer_id
      left join public.drivers dr on dr.id = d.driver_id left join public.employees e on e.id = dr.employee_id
     where d.delivery_date between p_from and p_to and (p_vehicle_id is null or v.id = p_vehicle_id) and d.status::text <> 'cancelled'
       and (v_sales or d.driver_id = v_me)
  ) x(kind, delivery_id, doc_no, delivery_date, vehicle_id, registration_no, driver_en, driver_ur, source_id, source_no, client, client_ur, destination, status,
      dispatched_at, delivered_at, odometer_start, odometer_end)
  order by x.delivery_date desc, x.doc_no desc;
end;
$$;

-- Estimated unit costs of a job's lines, for whoever sees costs.
create view public.secure_sol_item_costs with (security_barrier = true) as
select i.id as sol_job_item_id, i.sol_job_id, i.unit_cost from public.sol_job_items i
 where (select private.has_permission('costs.view')) and (select private.has_permission('sol.view'))
   and ((select private.has_permission('sol.view_all')) or private.sees_sol_job(i.sol_job_id));
revoke all on public.secure_sol_item_costs from anon, authenticated;
grant select on public.secure_sol_item_costs to authenticated;

-- Movements of SOL documents name their document.
do $$
declare
  v_def text := pg_get_functiondef('public.report_stock_movements(date, date, uuid, uuid, text, integer, integer)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def, 'sa.doc_no, st.doc_no)', 'sa.doc_no, st.doc_no, sd.doc_no, sol_r.doc_no)');
  v_new := replace(v_new, 'and st.id = pg.source_id', 'and st.id = pg.source_id
    left join public.sol_deliveries sd on pg.source_type = ''sol_delivery'' and sd.id = pg.source_id
    left join public.sol_returns sol_r on pg.source_type = ''sol_return'' and sol_r.id = pg.source_id');
  if v_new = v_def or v_new not like '%sol_r.id = pg.source_id%' then
    raise exception 'report_stock_movements() is not the expected version; apply the earlier migrations first';
  end if;
  execute v_new;
end;
$$;

-- SOL work on the dashboard.
do $$
declare
  v_def text := pg_get_functiondef('public.dashboard_open_work()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def, 'union all select ''assigned'', ''delivery''', 'union all select ''mine'', ''sol_job'', count(*) from public.sol_jobs where status = ''draft'' and created_by = (select auth.uid())
    union all select ''review'', ''sol_delivery'', count(*) from public.sol_deliveries
               where status = ''draft'' and (select private.has_permission(''sol.dispatch''))
    union all select ''assigned'', ''sol_delivery'', count(*) from public.sol_deliveries
               where status in (''draft'', ''dispatched'') and driver_id = (select private.current_driver_id())
    union all select ''assigned'', ''sol_job'', count(*) from public.sol_jobs
               where status in (''confirmed'', ''in_progress'') and responsible_employee_id = (select private.current_employee_id())
    union all select ''assigned'', ''delivery''');
  if v_new = v_def then
    raise exception 'dashboard_open_work() is not the expected version; apply the earlier migrations first';
  end if;
  execute v_new;
end;
$$;

-- ===========================================================================
-- 10. Privileges
-- ===========================================================================
revoke execute on function
  private.mask_account(text), private.sync_vehicle_active(), private.sees_sol_job(uuid), private.sees_sol_client(uuid), private.sol_job_received(uuid),
  private.return_sol_goods(uuid, uuid, text, jsonb, uuid), private.mask_payer_account(), private.allocate_payment_to_sol_job(uuid, uuid, numeric),
  private.validate_expense_job(), private.sol_job_costs(), private.sol_receipts(), private.post_customer_payment(uuid)
from public, anon, authenticated;
-- Used inside row level security policies, security_invoker views and triggers.
grant execute on function private.sees_sol_job(uuid), private.sees_sol_client(uuid), private.sol_receipts(), private.mask_account(text) to authenticated;

revoke execute on function
  public.list_drivers(), public.list_staff(), public.save_sol_job(uuid, jsonb, jsonb), public.delete_sol_job(uuid), public.cancel_sol_job(uuid, text),
  public.complete_sol_job(uuid, date), public.reopen_sol_job(uuid, text), public.save_sol_delivery(uuid, uuid, jsonb, jsonb), public.cancel_sol_delivery(uuid),
  public.dispatch_sol_delivery(uuid), public.complete_sol_delivery(uuid, jsonb, jsonb), public.return_sol_goods(uuid, jsonb, jsonb),
  public.release_sol_payment(uuid, uuid), public.record_sol_payment(uuid, jsonb), public.list_payment_accounts(), public.save_financial_account(uuid, jsonb),
  public.record_expense(jsonb), public.report_sol_jobs(date, date, text, uuid, uuid, uuid), public.sol_summary(date, date),
  public.report_vehicles(date, date, uuid), public.report_vehicle_log(date, date, uuid)
from public, anon;
grant execute on function
  public.list_drivers(), public.list_staff(), public.save_sol_job(uuid, jsonb, jsonb), public.delete_sol_job(uuid), public.cancel_sol_job(uuid, text),
  public.complete_sol_job(uuid, date), public.reopen_sol_job(uuid, text), public.save_sol_delivery(uuid, uuid, jsonb, jsonb), public.cancel_sol_delivery(uuid),
  public.dispatch_sol_delivery(uuid), public.complete_sol_delivery(uuid, jsonb, jsonb), public.return_sol_goods(uuid, jsonb, jsonb),
  public.release_sol_payment(uuid, uuid), public.record_sol_payment(uuid, jsonb), public.list_payment_accounts(), public.save_financial_account(uuid, jsonb),
  public.record_expense(jsonb), public.report_sol_jobs(date, date, text, uuid, uuid, uuid), public.sol_summary(date, date),
  public.report_vehicles(date, date, uuid), public.report_vehicle_log(date, date, uuid)
to authenticated;
