-- Phase 7: customers, order takers, the sales order workflow, deliveries, collections,
-- cash held by order takers, opening balances, credit and debit notes, sales reports.

-- ===========================================================================
-- 1. Permissions, version, numbering, order states
-- ===========================================================================
insert into public.permissions (code, module, description_en, description_ur) values
  ('sales.team', 'sales', 'Manage order takers and their territories', 'آرڈر ٹیکرز اور ان کے علاقوں کا انتظام'),
  ('receivables.adjust', 'receivables', 'Post customer opening balances, credit notes and debit notes',
   'گاہک کا ابتدائی بیلنس، کریڈٹ نوٹ اور ڈیبٹ نوٹ پوسٹ کریں');

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
  from public.roles r
  join (values ('manager', 'sales.team'), ('manager', 'receivables.adjust'), ('accountant', 'receivables.adjust')) as p(role, code) on p.role = r.code
on conflict do nothing;

-- The newest migration applied; the application compares it with the one it needs.
insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261126100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

insert into public.document_sequences (doc_type, prefix, padding, description) values
  ('CUS', 'CUS-', 4, 'Customer code'),
  ('DEP', 'DEP-', 6, 'Cash deposit'),
  ('OB', 'OB-', 6, 'Customer opening balance'),
  ('CN', 'CN-', 6, 'Credit note'),
  ('DN', 'DN-', 6, 'Debit note');

-- New values cannot be used in the transaction that adds them, so below they appear only
-- inside plpgsql bodies or in comparisons with the status as text.
alter type public.sales_order_status add value if not exists 'picking' after 'approved';
alter type public.sales_order_status add value if not exists 'delivered' after 'dispatched';
alter type public.sales_order_status add value if not exists 'completed' after 'delivered';

-- ===========================================================================
-- 2. Customers
-- ===========================================================================
alter table public.customers
  add column whatsapp text,
  add column city text,
  -- Days until an invoice is due. NULL = invoices have no due date.
  add column payment_terms_days integer check (payment_terms_days between 0 and 365);
select private.restrict_columns('customers', array['created_at', 'created_by', 'updated_at', 'updated_by']);
create index customers_city_idx on public.customers (city);
create trigger customers_code before insert on public.customers
  for each row execute function private.assign_code('code', 'CUS');

-- Users without sales.view_all work with the customers assigned to them.
create function private.sees_customer(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission('sales.view_all') or private.has_permission('customers.manage')
      or exists (select 1 from public.customers c where c.id = p_customer_id and c.order_taker_id = private.current_employee_id());
$$;

-- A driver sees the orders and shops of the deliveries assigned to them.
create function private.driver_sees_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deliveries d
                  where d.sales_order_id = p_order_id and d.driver_id = private.current_driver_id() and d.status::text <> 'cancelled');
$$;
create function private.driver_sees_customer(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deliveries d
                   join public.sales_orders o on o.id = d.sales_order_id
                  where o.customer_id = p_customer_id and d.driver_id = private.current_driver_id() and d.status::text <> 'cancelled');
$$;

drop policy "select" on public.customers;
create policy "select" on public.customers for select to authenticated using (
  ((select private.has_permission('customers.view'))
   and ((select private.has_permission('sales.view_all')) or (select private.has_permission('customers.manage'))
        or order_taker_id = (select private.current_employee_id())))
  or ((select private.current_driver_id()) is not null and private.driver_sees_customer(id)));

-- Documents name their products, units and warehouses, so whoever may see the documents may see those names.
-- Costs stay protected: they are not in these tables, or not in readable columns.
do $$
declare
  t text;
begin
  foreach t in array array['products', 'units'] loop
    execute format('drop policy "select" on public.%I', t);
    execute format('create policy "select" on public.%I for select to authenticated using (%s)', t,
      (select string_agg(private.p(x), ' or ') from unnest(array['products.view', 'sales.view', 'sales.view_all', 'inventory.view', 'purchasing.view', 'purchasing.create']) x));
  end loop;
end;
$$;
drop policy "select" on public.warehouses;
create policy "select" on public.warehouses for select to authenticated using (
  (select private.has_permission('warehouses.view')) or (select private.has_permission('sales.create')) or (select private.has_permission('sales.view'))
  or (select private.has_permission('sales.view_all')) or (select private.has_permission('inventory.view'))
  or (select private.has_permission('purchasing.view')) or (select private.has_permission('purchasing.create')));

-- ===========================================================================
-- 3. Order takers: employees who sell and collect
-- ===========================================================================
create table public.order_takers (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  territory text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
select private.apply_policies('order_takers',
  private.p('sales.team') || ' or ' || private.p('sales.view') || ' or ' || private.p('customers.view') || ' or ' || private.p('receivables.collect'),
  private.p('sales.team'), private.p('sales.team'), private.p('sales.team'));
revoke all on public.order_takers from anon, authenticated;
grant select, delete on public.order_takers to authenticated;
select private.restrict_columns('order_takers', array['created_at', 'created_by', 'updated_at', 'updated_by']);
create trigger touch_updated before update on public.order_takers for each row execute function private.touch_updated();
create trigger audit after insert or update or delete on public.order_takers for each row execute function private.audit_row();

-- Everyone already used as one.
insert into public.order_takers (employee_id)
select order_taker_id from public.customers where order_taker_id is not null
union select order_taker_id from public.sales_orders where order_taker_id is not null
union select order_taker_id from public.sales_invoices where order_taker_id is not null;

-- Names and contact details of order takers, without the confidential employee record.
create function public.list_order_takers()
returns table (employee_id uuid, code text, full_name text, full_name_ur text, phone text, whatsapp text, photo_path text,
               territory text, employment_status public.employment_status, is_active boolean, notes text, customers bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (private.has_permission('sales.team') or private.has_permission('sales.view') or private.has_permission('customers.view')
          or private.has_permission('receivables.collect')) then
    perform private.require_permission('sales.view');
  end if;
  return query
  select e.id, e.employee_code, e.full_name, e.full_name_ur, e.phone, e.whatsapp, e.photo_path, ot.territory, e.status,
         ot.is_active and e.status::text <> 'terminated', ot.notes,
         (select count(*) from public.customers c where c.order_taker_id = e.id and c.is_active)
    from public.order_takers ot
    join public.employees e on e.id = ot.employee_id
   order by e.full_name;
end;
$$;

-- Drivers to choose from when dispatching.
create function public.list_drivers()
returns table (driver_id uuid, full_name text, full_name_ur text, license_number text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission('sales.dispatch') then
    perform private.require_permission('vehicles.view');
  end if;
  return query
  select d.id, e.full_name, e.full_name_ur, d.license_number
    from public.drivers d join public.employees e on e.id = d.employee_id
   where d.is_active and e.status::text <> 'terminated'
   order by e.full_name;
end;
$$;

-- Pictures of order takers are visible wherever their names are.
create function private.is_order_taker_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.order_takers ot join public.employees e on e.id = ot.employee_id where e.photo_path = p_name);
$$;
create policy "order taker photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'employee-photos'
         and ((select private.has_permission('sales.view')) or (select private.has_permission('sales.team')) or (select private.has_permission('customers.view')))
         and private.is_order_taker_photo(name));

-- Creates or updates an order taker, with a new employee when none is chosen.
-- Employee fields are only touched when present, and need employees.manage.
create function public.save_order_taker(p_employee_id uuid, p_doc jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_employee_id;
begin
  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.employees (id, employee_code, full_name, full_name_ur, phone, whatsapp, job_title, status)
    values (v_id, '', p_doc ->> 'full_name', p_doc ->> 'full_name_ur', p_doc ->> 'phone', p_doc ->> 'whatsapp', 'Order Taker',
            coalesce((p_doc ->> 'status')::public.employment_status, 'active'));
  elsif p_doc ? 'full_name' then
    update public.employees
       set full_name = p_doc ->> 'full_name', full_name_ur = p_doc ->> 'full_name_ur', phone = p_doc ->> 'phone',
           whatsapp = p_doc ->> 'whatsapp', status = (p_doc ->> 'status')::public.employment_status
     where id = v_id;
    if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  end if;
  insert into public.order_takers (employee_id, territory, is_active, notes)
  values (v_id, p_doc ->> 'territory', coalesce((p_doc ->> 'is_active')::boolean, true), p_doc ->> 'notes')
  on conflict (employee_id) do update
    set territory = excluded.territory, is_active = excluded.is_active, notes = excluded.notes;
  return v_id;
end;
$$;

-- ===========================================================================
-- 4. Accounting: cash held by order takers
-- ===========================================================================
insert into public.chart_of_accounts (code, name_en, name_ur, account_type, is_postable, system_key, parent_id)
select (select min(c)::text from generate_series(1180, 1199) c where not exists (select 1 from public.chart_of_accounts a where a.code = c::text)),
       'Cash with Order Takers', 'آرڈر ٹیکرز کے پاس نقد', 'asset', true, 'CASH_WITH_COLLECTORS',
       (select id from public.chart_of_accounts where code = '1000');

create or replace function private.validate_journal_line() returns trigger
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
  if v_account.system_key in ('EMPLOYEE_ADVANCES', 'SALARIES_PAYABLE', 'CASH_WITH_COLLECTORS') and new.employee_id is null then
    raise exception 'Employee balance lines require an employee' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Customer ledger lines follow the customers a user works with.
drop policy "select" on public.journal_entry_lines;
create policy "select" on public.journal_entry_lines for select to authenticated using (
  (select private.has_permission('accounting.view'))
  or (customer_id is not null and (select private.has_permission('receivables.view'))
      and ((select private.has_permission('sales.view_all')) or (select private.has_permission('customers.manage'))
           or customer_id in (select c.id from public.customers c where c.order_taker_id = (select private.current_employee_id()))))
  or (supplier_id is not null and private.can_supplier(supplier_id, 'view'))
  or (employee_id is not null and (select private.has_permission('payroll.view')))
  or ((select private.has_permission('cash_bank.view'))
      and exists (select 1 from public.financial_accounts fa where fa.gl_account_id = journal_entry_lines.account_id))
);

create function private.collector_held(p_employee_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.debit - l.credit), 0)
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
   where l.account_id = private.account_id('CASH_WITH_COLLECTORS') and l.employee_id = p_employee_id;
$$;

-- ===========================================================================
-- 5. Opening balances, credit notes and debit notes
-- ===========================================================================
create type public.customer_note_kind as enum ('opening', 'credit', 'debit');

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  kind public.customer_note_kind not null,
  customer_id uuid not null references public.customers (id),
  -- A credit note can reduce one invoice.
  sales_invoice_id uuid references public.sales_invoices (id),
  note_date date not null default private.business_today(),
  -- Opening balances are signed: positive = the customer owes us.
  amount numeric(18,2) not null,
  reason text,
  status public.document_status not null default 'posted',
  void_reason text,
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (case when kind = 'opening' then amount <> 0 else amount > 0 end),
  check (sales_invoice_id is null or kind = 'credit')
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, note_date);
create index customer_notes_invoice_idx on public.customer_notes (sales_invoice_id) where sales_invoice_id is not null;
create unique index customer_notes_one_opening on public.customer_notes (customer_id) where kind = 'opening' and status = 'posted';

create function private.assign_note_no() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.doc_no := private.next_document_number(case new.kind when 'opening' then 'OB' when 'credit' then 'CN' else 'DN' end);
  return new;
end;
$$;
create trigger customer_notes_doc_no before insert on public.customer_notes for each row execute function private.assign_note_no();
create trigger touch_updated before update on public.customer_notes for each row execute function private.touch_updated();
create trigger audit after insert or update or delete on public.customer_notes for each row execute function private.audit_row();

select private.apply_policies('customer_notes',
  private.p('receivables.adjust') || ' or (' || private.p('receivables.view') || ' and (' || private.p('sales.view_all') || ' or ' || private.p('customers.manage')
    || ' or customer_id in (select c.id from public.customers c where c.order_taker_id = ' || private.me() || ')))',
  null, null, null);
revoke all on public.customer_notes from anon, authenticated;
grant select on public.customer_notes to authenticated;

-- Outstanding = total - allocations - posted returns - posted credit notes for the invoice.
create or replace function private.sales_invoice_outstanding(p_invoice_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select i.total_amount
       - coalesce((select sum(a.amount) from public.customer_payment_allocations a where a.sales_invoice_id = i.id), 0)
       - coalesce((select sum(r.total_amount) from public.customer_returns r
                    where r.sales_invoice_id = i.id and r.status = 'posted'), 0)
       - coalesce((select sum(n.amount) from public.customer_notes n
                    where n.sales_invoice_id = i.id and n.kind = 'credit' and n.status = 'posted'), 0)
    from public.sales_invoices i where i.id = p_invoice_id;
$$;

-- What was paid, returned and credited per invoice. Runs as definer because row level security shows a caller
-- only some payments (an order taker their own, for example), which would make a settled invoice look unpaid.
create function private.invoice_settlements()
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
create function private.sees_settlements() returns boolean
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

-- Record and post a note in one step.
create function public.record_customer_note(p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_kind public.customer_note_kind := (p_doc ->> 'kind')::public.customer_note_kind;
  v_customer uuid := (p_doc ->> 'customer_id')::uuid;
  v_invoice uuid := (p_doc ->> 'sales_invoice_id')::uuid;
  v_amount numeric(18,2) := (p_doc ->> 'amount')::numeric;
  v_doc public.customer_notes%rowtype;
  v_outstanding numeric;
  v_je uuid;
begin
  perform private.require_permission('receivables.adjust');
  select id into v_id from public.customer_notes where client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  if not exists (select 1 from public.customers where id = v_customer) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  if v_kind::text <> 'opening' and coalesce(trim(p_doc ->> 'reason'), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if v_kind::text = 'opening' and exists (select 1 from public.customer_notes where customer_id = v_customer and kind = 'opening' and status = 'posted') then
    raise exception 'This customer already has an opening balance; void it first' using errcode = '23514';
  end if;
  if v_invoice is not null then
    perform 1 from public.sales_invoices where id = v_invoice and customer_id = v_customer and status = 'posted' for update;
    if not found then raise exception 'Choose a posted invoice of this customer' using errcode = '23514'; end if;
    v_outstanding := private.sales_invoice_outstanding(v_invoice);
    if v_amount > v_outstanding then
      raise exception 'The credit note exceeds the invoice balance (%)', v_outstanding using errcode = '23514';
    end if;
  end if;

  insert into public.customer_notes (kind, customer_id, sales_invoice_id, note_date, amount, reason, client_request_id)
  values (v_kind, v_customer, v_invoice, coalesce((p_doc ->> 'date')::date, private.business_today()), v_amount, nullif(trim(p_doc ->> 'reason'), ''), v_request)
  returning * into v_doc;

  -- Credit notes reduce net sales and debit notes increase it, like returns and invoices.
  v_je := private.post_journal(v_doc.note_date,
    case v_kind when 'opening' then 'Opening balance ' when 'credit' then 'Credit note ' else 'Debit note ' end || v_doc.doc_no
      || coalesce(': ' || v_doc.reason, ''),
    'customer_note', v_doc.id,
    case when v_kind::text = 'credit' then jsonb_build_array(
           jsonb_build_object('account', 'SALES_RETURNS', 'debit', v_amount, 'customer_id', v_customer),
           jsonb_build_object('account', 'AR', 'credit', v_amount, 'customer_id', v_customer))
         when v_kind::text = 'debit' then jsonb_build_array(
           jsonb_build_object('account', 'AR', 'debit', v_amount, 'customer_id', v_customer),
           jsonb_build_object('account', 'SALES', 'credit', v_amount, 'customer_id', v_customer))
         else jsonb_build_array(
           jsonb_build_object('account', 'AR', 'debit', greatest(v_amount, 0), 'credit', greatest(-v_amount, 0), 'customer_id', v_customer),
           jsonb_build_object('account', 'OPENING_EQUITY', 'debit', greatest(-v_amount, 0), 'credit', greatest(v_amount, 0))) end);

  update public.customer_notes set journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid() where id = v_doc.id;
  return v_doc.id;
end;
$$;

create function public.void_customer_note(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.customer_notes%rowtype;
begin
  perform private.require_permission('receivables.adjust');
  select * into v_doc from public.customer_notes where id = p_id for update;
  if v_doc.id is null then raise exception 'Note not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted notes can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.reverse_journal(v_doc.journal_entry_id, private.business_today(), trim(p_reason));
  update public.customer_notes set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

create function public.save_customer(p_id uuid, p_doc jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.customers (id, code, name, name_ur, owner_name, phone, alt_phone, whatsapp, address, area, city, ntn, credit_limit,
                                  payment_terms_days, order_taker_id, is_active, notes)
    values (v_id, coalesce(p_doc ->> 'code', ''), p_doc ->> 'name', p_doc ->> 'name_ur', p_doc ->> 'owner_name', p_doc ->> 'phone', p_doc ->> 'alt_phone',
            p_doc ->> 'whatsapp', p_doc ->> 'address', p_doc ->> 'area', p_doc ->> 'city', p_doc ->> 'ntn', (p_doc ->> 'credit_limit')::numeric,
            (p_doc ->> 'payment_terms_days')::integer, (p_doc ->> 'order_taker_id')::uuid, coalesce((p_doc ->> 'is_active')::boolean, true), p_doc ->> 'notes');
    -- Checks receivables.adjust itself; the customer is not created without it.
    if (p_doc ->> 'opening_balance')::numeric <> 0 then
      perform public.record_customer_note(jsonb_build_object('kind', 'opening', 'customer_id', v_id, 'amount', p_doc ->> 'opening_balance', 'date', p_doc ->> 'opening_date'));
    end if;
  else
    update public.customers
       set code = coalesce(nullif(trim(p_doc ->> 'code'), ''), code), name = p_doc ->> 'name', name_ur = p_doc ->> 'name_ur',
           owner_name = p_doc ->> 'owner_name', phone = p_doc ->> 'phone', alt_phone = p_doc ->> 'alt_phone', whatsapp = p_doc ->> 'whatsapp',
           address = p_doc ->> 'address', area = p_doc ->> 'area', city = p_doc ->> 'city', ntn = p_doc ->> 'ntn',
           credit_limit = (p_doc ->> 'credit_limit')::numeric, payment_terms_days = (p_doc ->> 'payment_terms_days')::integer,
           order_taker_id = (p_doc ->> 'order_taker_id')::uuid, is_active = coalesce((p_doc ->> 'is_active')::boolean, true), notes = p_doc ->> 'notes'
     where id = v_id;
    if not found then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

-- ===========================================================================
-- 6. Sales orders
-- ===========================================================================
alter table public.sales_orders
  add column submitted_at timestamptz, add column submitted_by uuid,
  add column sent_back_reason text,
  add column picking_at timestamptz, add column picking_by uuid,
  add column delivered_at timestamptz, add column completed_at timestamptz,
  add column cancelled_at timestamptz, add column cancelled_by uuid, add column cancel_reason text,
  add column closed_at timestamptz, add column closed_by uuid, add column close_reason text;
select private.restrict_columns('sales_orders', array[
  'doc_no', 'status', 'approved_at', 'approved_by', 'created_at', 'created_by', 'updated_at', 'updated_by', 'total_amount',
  'submitted_at', 'submitted_by', 'sent_back_reason', 'picking_at', 'picking_by', 'delivered_at', 'completed_at',
  'cancelled_at', 'cancelled_by', 'cancel_reason', 'closed_at', 'closed_by', 'close_reason']);

drop policy "select" on public.sales_orders;
create policy "select" on public.sales_orders for select to authenticated using (
  (select private.has_permission('sales.view_all'))
  or ((select private.has_permission('sales.view')) and order_taker_id = (select private.current_employee_id()))
  or ((select private.current_driver_id()) is not null and private.driver_sees_order(id)));

-- Drafts belong to whoever prepares them. A submitted order can only be corrected by an approver.
drop policy "update" on public.sales_orders;
create policy "update" on public.sales_orders for update to authenticated
  using (((select private.has_permission('sales.create')) and status = 'draft'
          and ((select private.has_permission('sales.view_all')) or order_taker_id = (select private.current_employee_id())))
         or ((select private.has_permission('sales.approve')) and status = 'submitted'))
  with check (((select private.has_permission('sales.create')) and status = 'draft'
          and ((select private.has_permission('sales.view_all')) or order_taker_id = (select private.current_employee_id())))
         or ((select private.has_permission('sales.approve')) and status = 'submitted'));
drop policy "delete" on public.sales_orders;
create policy "delete" on public.sales_orders for delete to authenticated
  using ((select private.has_permission('sales.create')) and status = 'draft'
         and ((select private.has_permission('sales.view_all')) or order_taker_id = (select private.current_employee_id())));

create function private.can_edit_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sales_orders o
                  where o.id = p_order_id
                    and ((o.status = 'draft' and private.has_permission('sales.create')
                          and (private.has_permission('sales.view_all') or o.order_taker_id = private.current_employee_id()))
                         or (o.status = 'submitted' and private.has_permission('sales.approve'))));
$$;
drop policy "insert" on public.sales_order_items;
drop policy "update" on public.sales_order_items;
drop policy "delete" on public.sales_order_items;
create policy "insert" on public.sales_order_items for insert to authenticated with check (private.can_edit_order(sales_order_id));
create policy "update" on public.sales_order_items for update to authenticated
  using (private.can_edit_order(sales_order_id)) with check (private.can_edit_order(sales_order_id));
create policy "delete" on public.sales_order_items for delete to authenticated using (private.can_edit_order(sales_order_id));

create function public.save_sales_order(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  if v_id is null then
    select id into v_id from public.sales_orders where client_request_id = v_request;
    if v_id is not null then return v_id; end if;
    insert into public.sales_orders (customer_id, order_taker_id, warehouse_id, order_date, required_date, notes, client_request_id)
    values ((p_doc ->> 'customer_id')::uuid, (p_doc ->> 'order_taker_id')::uuid, (p_doc ->> 'warehouse_id')::uuid, (p_doc ->> 'date')::date,
            (p_doc ->> 'required_date')::date, p_doc ->> 'notes', v_request)
    returning id into v_id;
  else
    update public.sales_orders
       set customer_id = (p_doc ->> 'customer_id')::uuid, order_taker_id = (p_doc ->> 'order_taker_id')::uuid,
           warehouse_id = (p_doc ->> 'warehouse_id')::uuid, order_date = (p_doc ->> 'date')::date,
           required_date = (p_doc ->> 'required_date')::date, notes = p_doc ->> 'notes'
     where id = v_id and status in ('draft', 'submitted');
    perform private.require_draft(found);
    delete from public.sales_order_items where sales_order_id = v_id;
  end if;
  insert into public.sales_order_items (sales_order_id, product_id, unit_id, quantity, unit_price, discount_amount)
  select v_id, l.product_id, l.unit_id, l.quantity, l.unit_price, coalesce(l.discount_amount, 0)
    from jsonb_to_recordset(p_lines) as l(product_id uuid, unit_id uuid, quantity bigint, unit_price numeric, discount_amount numeric);
  return v_id;
end;
$$;

create or replace function private.check_credit_limit(p_customer_id uuid, p_additional numeric, p_override boolean)
returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit numeric;
  v_open_orders numeric;
  v_exposure numeric;
begin
  select credit_limit into v_limit from public.customers where id = p_customer_id;
  if v_limit is null then
    return;
  end if;
  select coalesce(sum(i.line_total * (i.base_quantity - i.dispatched_base_quantity) / i.base_quantity), 0)
    into v_open_orders
    from public.sales_order_items i
    join public.sales_orders o on o.id = i.sales_order_id
   where o.customer_id = p_customer_id and o.status::text in ('approved', 'picking', 'partially_dispatched');
  v_exposure := private.customer_balance(p_customer_id) + v_open_orders + p_additional;
  if v_exposure > v_limit then
    if p_override and private.has_permission('sales.credit_override') then
      return;
    end if;
    raise exception 'Credit limit exceeded: limit %, exposure would be %', v_limit, round(v_exposure, 2)
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.submit_sales_order(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
begin
  perform private.require_permission('sales.create');
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null
     -- coalesce: an order without an order taker, or a user without an employee, must not count as a match.
     or not (private.has_permission('sales.view_all') or coalesce(v_doc.order_taker_id = private.current_employee_id(), false)) then
    raise exception 'Sales order not found' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'Only draft orders can be submitted' using errcode = '23514';
  end if;
  if not exists (select 1 from public.sales_order_items where sales_order_id = p_id) then
    raise exception 'Sales order has no lines' using errcode = '23514';
  end if;
  if not exists (select 1 from public.customers where id = v_doc.customer_id and is_active) then
    raise exception 'Customer is inactive' using errcode = '23514';
  end if;
  update public.sales_orders set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(), sent_back_reason = null where id = p_id;
  return p_id;
end;
$$;

-- An approver sends a submitted order back for correction.
create function public.send_back_sales_order(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.sales_order_status;
begin
  perform private.require_permission('sales.approve');
  select status into v_status from public.sales_orders where id = p_id for update;
  if v_status is null then raise exception 'Sales order not found' using errcode = 'P0002'; end if;
  if v_status <> 'submitted' then raise exception 'Only submitted orders can be sent back' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  update public.sales_orders set status = 'draft', sent_back_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

create or replace function public.approve_sales_order(p_id uuid, p_override_credit boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
  v_item record;
  v_reserve boolean;
begin
  perform private.require_permission('sales.approve');
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null then raise exception 'Sales order not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'submitted' then
    raise exception 'Only submitted orders can be approved; % is %', v_doc.doc_no, v_doc.status using errcode = '23514';
  end if;
  if not exists (select 1 from public.sales_order_items where sales_order_id = p_id) then
    raise exception 'Sales order has no lines' using errcode = '23514';
  end if;
  if not exists (select 1 from public.customers where id = v_doc.customer_id and is_active) then
    raise exception 'Customer is inactive' using errcode = '23514';
  end if;

  -- One approval per customer at a time, so two orders cannot both use the same remaining credit.
  perform 1 from public.customers where id = v_doc.customer_id for no key update;
  perform private.check_credit_limit(v_doc.customer_id, v_doc.total_amount, p_override_credit);

  v_reserve := coalesce((private.setting('reserve_stock_on_approval'))::boolean, true);
  if v_reserve then
    for v_item in
      select id, product_id, base_quantity from public.sales_order_items
       where sales_order_id = p_id order by product_id, id
    loop
      perform private.reserve_stock(v_item.product_id, v_doc.warehouse_id, v_item.base_quantity);
      update public.sales_order_items set reserved_base_quantity = v_item.base_quantity where id = v_item.id;
    end loop;
  end if;

  update public.sales_orders set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = p_id;
  return p_id;
end;
$$;

-- Warehouse starts collecting the goods.
create function public.start_picking(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
begin
  perform private.require_permission('sales.dispatch');
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null then raise exception 'Sales order not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'approved' then raise exception 'Only approved orders can be picked; % is %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  update public.sales_orders set status = 'picking', picking_at = now(), picking_by = auth.uid() where id = p_id;
  return p_id;
end;
$$;

create function private.release_order_stock(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item record;
begin
  for v_item in
    select i.id, i.product_id, i.reserved_base_quantity, o.warehouse_id
      from public.sales_order_items i join public.sales_orders o on o.id = i.sales_order_id
     where i.sales_order_id = p_order_id and i.reserved_base_quantity > 0 order by i.product_id, i.id
  loop
    perform private.release_stock(v_item.product_id, v_item.warehouse_id, v_item.reserved_base_quantity);
    update public.sales_order_items set reserved_base_quantity = 0 where id = v_item.id;
  end loop;
end;
$$;

drop function public.cancel_sales_order(uuid);
create function public.cancel_sales_order(p_id uuid, p_reason text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
begin
  perform private.require_permission('sales.approve');
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null then raise exception 'Sales order not found' using errcode = 'P0002'; end if;
  if v_doc.status::text not in ('draft', 'submitted', 'approved', 'picking') then
    raise exception 'Sales order % is %; close the remaining quantity instead', v_doc.doc_no, v_doc.status using errcode = '23514';
  end if;
  if exists (select 1 from public.deliveries where sales_order_id = p_id and status = 'draft') then
    raise exception 'Delete draft deliveries of this order first' using errcode = '23514';
  end if;
  perform private.release_order_stock(p_id);
  update public.sales_orders
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(trim(p_reason), '')
   where id = p_id;
  return p_id;
end;
$$;

-- Dispatched, delivered and completed follow from the facts: what has left, what has arrived
-- and whether the invoices are settled. Voiding a payment therefore reopens a completed order.
create function private.refresh_sales_order(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
  v_remaining boolean;
  v_dispatched boolean;
  v_new text;
begin
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null or v_doc.status::text not in ('approved', 'picking', 'partially_dispatched', 'dispatched', 'delivered', 'completed') then
    return;
  end if;
  select coalesce(bool_or(dispatched_base_quantity < base_quantity), false), coalesce(bool_or(dispatched_base_quantity > 0), false)
    into v_remaining, v_dispatched from public.sales_order_items where sales_order_id = p_id;
  if not v_dispatched then
    return;
  end if;
  v_new := case
    when v_remaining and v_doc.closed_at is null then 'partially_dispatched'
    when exists (select 1 from public.deliveries where sales_order_id = p_id and status = 'dispatched') then 'dispatched'
    when exists (select 1 from public.sales_invoices i where i.sales_order_id = p_id and i.status = 'posted'
                   and private.sales_invoice_outstanding(i.id) > 0) then 'delivered'
    else 'completed' end;
  if v_new <> v_doc.status::text then
    update public.sales_orders
       set status = v_new::public.sales_order_status,
           delivered_at = case when v_new in ('delivered', 'completed') then coalesce(delivered_at, now()) end,
           completed_at = case when v_new = 'completed' then now() end
     where id = p_id;
  end if;
end;
$$;

-- Close a partly delivered order whose remaining quantity will not be supplied.
create function public.close_sales_order(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
begin
  perform private.require_permission('sales.approve');
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null then raise exception 'Sales order not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'partially_dispatched' then
    raise exception 'Only partly dispatched orders can be closed; cancel orders with nothing dispatched' using errcode = '23514';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  if exists (select 1 from public.deliveries where sales_order_id = p_id and status = 'draft') then
    raise exception 'Delete draft deliveries of this order first' using errcode = '23514';
  end if;
  perform private.release_order_stock(p_id);
  update public.sales_orders set closed_at = now(), closed_by = auth.uid(), close_reason = trim(p_reason) where id = p_id;
  perform private.refresh_sales_order(p_id);
  return p_id;
end;
$$;

-- ===========================================================================
-- 7. Dispatch, delivery and returns
-- ===========================================================================
-- Seeing an order does not show a driver the deliveries of other drivers.
drop policy "select" on public.deliveries;
create policy "select" on public.deliveries for select to authenticated using (
  (select private.has_permission('sales.view_all'))
  or driver_id = (select private.current_driver_id())
  or ((select private.has_permission('sales.view'))
      and exists (select 1 from public.sales_orders h where h.id = sales_order_id and h.order_taker_id = (select private.current_employee_id()))));

alter table public.deliveries
  add column delivered_by uuid, add column received_by text, add column delivery_note text;
select private.restrict_columns('deliveries', array[
  'doc_no', 'status', 'created_at', 'created_by', 'updated_at', 'updated_by', 'sales_invoice_id', 'dispatched_at', 'dispatched_by',
  'delivered_at', 'delivered_by', 'received_by', 'delivery_note']);
alter table public.delivery_items
  -- Refused or damaged at the door, in the unit of the order line.
  add column returned_quantity bigint not null default 0 check (returned_quantity >= 0),
  add constraint delivery_items_returned_within_dispatched check (returned_quantity <= quantity);
select private.restrict_columns('delivery_items', array['returned_quantity']);

alter table public.customer_returns add column delivery_id uuid references public.deliveries (id);
create index customer_returns_delivery_idx on public.customer_returns (delivery_id) where delivery_id is not null;
grant select (delivery_id) on public.customer_returns to authenticated;

-- Returned lines carry the invoice's discount and tax, so returning everything credits exactly the invoice.
alter table public.customer_return_items drop column line_total;
alter table public.customer_return_items drop column line_net;
alter table public.customer_return_items alter column tax_amount drop expression;
update public.customer_return_items set tax_amount = 0 where tax_amount is null;
alter table public.customer_return_items
  alter column tax_amount set default 0,
  alter column tax_amount set not null,
  add column discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0),
  add column line_net numeric(18,2) generated always as (quantity * unit_price - discount_amount) stored,
  add column line_total numeric(18,2) generated always as (quantity * unit_price - discount_amount + tax_amount) stored,
  add constraint customer_return_items_discount check (discount_amount <= quantity * unit_price);
select private.restrict_columns('customer_return_items', array['factor', 'tax_rate', 'tax_amount', 'discount_amount', 'cost_amount']);
grant select (tax_amount, discount_amount, line_net, line_total) on public.customer_return_items to authenticated;

-- Lines of an invoice are credited at their share of that invoice line (cumulative rounding);
-- other lines at the entered price.
create function private.value_return_line() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.sales_invoice_items%rowtype;
  v_before bigint;
  v_after bigint;
begin
  if new.sales_invoice_item_id is null then
    new.discount_amount := 0;
    new.tax_amount := round(new.quantity * new.unit_price * new.tax_rate / 100, 2);
    return new;
  end if;
  select * into v_inv from public.sales_invoice_items where id = new.sales_invoice_item_id;
  select coalesce(sum(ri.base_quantity), 0) into v_before
    from public.customer_return_items ri
    join public.customer_returns r on r.id = ri.customer_return_id
   where ri.sales_invoice_item_id = new.sales_invoice_item_id and ri.id <> new.id
     and (r.status = 'posted' or (r.id = new.customer_return_id and ri.cost_amount is not null));
  v_before := least(v_before, v_inv.base_quantity);
  v_after := least(v_before + new.quantity * new.factor, v_inv.base_quantity);
  new.tax_rate := v_inv.tax_rate;
  new.unit_price := ceil(v_inv.unit_price * new.factor * 100 / v_inv.factor) / 100;
  new.discount_amount := greatest(new.quantity * new.unit_price
    - (round(v_inv.line_net * v_after / v_inv.base_quantity, 2) - round(v_inv.line_net * v_before / v_inv.base_quantity, 2)), 0);
  new.tax_amount := round(v_inv.tax_amount * v_after / v_inv.base_quantity, 2) - round(v_inv.tax_amount * v_before / v_inv.base_quantity, 2);
  return new;
end;
$$;
-- Runs after the factor and tax-rate triggers (alphabetical order).
create trigger customer_return_items_value before insert or update on public.customer_return_items
  for each row execute function private.value_return_line();

create function private.post_customer_return(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.customer_returns%rowtype;
  v_item record;
  v_inv_item public.sales_invoice_items%rowtype;
  v_already bigint;
  v_value numeric(18,2);
  v_cost_total numeric(18,2) := 0;
  v_wh uuid;
  v_je uuid;
begin
  select * into v_doc from public.customer_returns where id = p_id for update;
  if v_doc.id is null then raise exception 'Customer return not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Customer return % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.customer_return_items where customer_return_id = p_id) then
    raise exception 'Customer return has no lines' using errcode = '23514';
  end if;
  if v_doc.sales_invoice_id is not null and not exists (
       select 1 from public.sales_invoices
        where id = v_doc.sales_invoice_id and customer_id = v_doc.customer_id and status = 'posted') then
    raise exception 'Return must reference a posted invoice of the same customer' using errcode = '23514';
  end if;
  if exists (select 1 from public.warehouses where id = v_doc.warehouse_id and warehouse_type = 'damaged') then
    raise exception 'Saleable goods return to a normal warehouse; damaged goods have their own' using errcode = '23514';
  end if;

  for v_item in
    select * from public.customer_return_items where customer_return_id = p_id order by product_id, id
  loop
    v_value := null;
    if v_item.sales_invoice_item_id is not null then
      select * into v_inv_item from public.sales_invoice_items
       where id = v_item.sales_invoice_item_id and sales_invoice_id = v_doc.sales_invoice_id
         and product_id = v_item.product_id
         for update;
      if v_inv_item.id is null then
        raise exception 'Return line does not match the referenced invoice' using errcode = '23514';
      end if;
      -- Lines of this return that were handled before count as well, so one invoice line can be split by condition.
      select coalesce(sum(ri.base_quantity), 0) into v_already
        from public.customer_return_items ri
        join public.customer_returns r on r.id = ri.customer_return_id
       where ri.sales_invoice_item_id = v_inv_item.id
         and (r.status = 'posted' or (r.id = p_id and ri.cost_amount is not null));
      if v_already + v_item.base_quantity > v_inv_item.base_quantity then
        raise exception 'Returned quantity exceeds the invoiced quantity' using errcode = '23514';
      end if;
      -- Return at the cost recorded when the goods were sold.
      v_value := round(v_inv_item.cost_amount * (v_already + v_item.base_quantity) / v_inv_item.base_quantity, 2)
               - round(v_inv_item.cost_amount * v_already / v_inv_item.base_quantity, 2);
    end if;

    if v_item.condition = 'damaged' then
      if v_doc.damaged_warehouse_id is null then
        raise exception 'A damaged-goods warehouse is required for damaged returns' using errcode = '23514';
      end if;
      v_wh := v_doc.damaged_warehouse_id;
    else
      v_wh := v_doc.warehouse_id;
    end if;

    v_value := private.move_stock(v_item.product_id, v_wh, v_item.base_quantity, 'sales_return',
      v_doc.return_date, 'customer_return', v_doc.id, v_item.id, v_value);
    update public.customer_return_items set cost_amount = v_value where id = v_item.id;
    v_cost_total := v_cost_total + v_value;
  end loop;

  -- Re-read: the lines were valued again against what had been returned by now.
  select * into v_doc from public.customer_returns where id = p_id;
  if v_doc.total_amount > 0 or v_cost_total > 0 then
    v_je := private.post_journal(v_doc.return_date, 'Customer return ' || v_doc.doc_no, 'customer_return', v_doc.id,
      jsonb_build_array(
        jsonb_build_object('account', 'SALES_RETURNS', 'debit', v_doc.subtotal, 'customer_id', v_doc.customer_id),
        jsonb_build_object('account', 'TAX_OUTPUT', 'debit', v_doc.tax_total),
        jsonb_build_object('account', 'AR', 'credit', v_doc.total_amount, 'customer_id', v_doc.customer_id),
        jsonb_build_object('account', 'INVENTORY', 'debit', v_cost_total),
        jsonb_build_object('account', 'COGS', 'credit', v_cost_total)));
  end if;

  update public.customer_returns
     set status = 'posted', cost_total = v_cost_total, journal_entry_id = v_je,
         posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return p_id;
end;
$$;

create or replace function public.post_customer_return(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('sales.return');
  return private.post_customer_return(p_id);
end;
$$;

create function public.save_customer_return(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  if v_id is null then
    select id into v_id from public.customer_returns where client_request_id = v_request;
    if v_id is not null then return v_id; end if;
    insert into public.customer_returns (customer_id, sales_invoice_id, warehouse_id, damaged_warehouse_id, return_date, reason, client_request_id)
    values ((p_doc ->> 'customer_id')::uuid, (p_doc ->> 'sales_invoice_id')::uuid, (p_doc ->> 'warehouse_id')::uuid,
            (p_doc ->> 'damaged_warehouse_id')::uuid, (p_doc ->> 'date')::date, p_doc ->> 'reason', v_request)
    returning id into v_id;
  else
    update public.customer_returns
       set warehouse_id = (p_doc ->> 'warehouse_id')::uuid, damaged_warehouse_id = (p_doc ->> 'damaged_warehouse_id')::uuid,
           return_date = (p_doc ->> 'date')::date, reason = p_doc ->> 'reason'
     where id = v_id and status = 'draft';
    perform private.require_draft(found);
    delete from public.customer_return_items where customer_return_id = v_id;
  end if;
  insert into public.customer_return_items (customer_return_id, sales_invoice_item_id, product_id, unit_id, quantity, unit_price, condition)
  select v_id, l.sales_invoice_item_id, l.product_id, l.unit_id, l.quantity, coalesce(l.unit_price, 0), coalesce(l.condition, 'saleable')::public.item_condition
    from jsonb_to_recordset(p_lines) as l(sales_invoice_item_id uuid, product_id uuid, unit_id uuid, quantity bigint, unit_price numeric, condition text);
  return v_id;
end;
$$;

-- Dispatching follows picking, sets the due date from the customer's terms, and leaves the status to the facts.
create or replace function public.dispatch_delivery(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.sales_orders%rowtype;
  v_line record;
  v_base bigint;
  v_release bigint;
  v_discount numeric(18,2);
  v_terms integer;
  v_invoice_id uuid;
begin
  perform private.require_permission('sales.dispatch');
  select * into v_delivery from public.deliveries where id = p_id for update;
  if v_delivery.id is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if v_delivery.status <> 'draft' then raise exception 'Delivery % is already %', v_delivery.doc_no, v_delivery.status using errcode = '23514'; end if;

  select * into v_order from public.sales_orders where id = v_delivery.sales_order_id for update;
  if v_order.status::text not in ('picking', 'partially_dispatched') then
    raise exception 'Sales order % is %; start picking before dispatch', v_order.doc_no, v_order.status using errcode = '23514';
  end if;
  if not exists (select 1 from public.delivery_items where delivery_id = p_id) then
    raise exception 'Delivery has no lines' using errcode = '23514';
  end if;
  if exists (select 1 from public.delivery_items di
               left join public.sales_order_items soi on soi.id = di.sales_order_item_id and soi.sales_order_id = v_order.id
              where di.delivery_id = p_id and soi.id is null) then
    raise exception 'Delivery lines must belong to the delivery''s sales order' using errcode = '23514';
  end if;

  select payment_terms_days into v_terms from public.customers where id = v_order.customer_id;
  insert into public.sales_invoices (customer_id, warehouse_id, invoice_date, due_date, sales_order_id, order_taker_id)
  values (v_order.customer_id, v_order.warehouse_id, v_delivery.delivery_date, v_delivery.delivery_date + v_terms, v_order.id, v_order.order_taker_id)
  returning id into v_invoice_id;

  for v_line in
    select di.quantity as qty, soi.*
      from public.delivery_items di
      join public.sales_order_items soi on soi.id = di.sales_order_item_id
     where di.delivery_id = p_id
     order by soi.product_id, soi.id
     for update of soi
  loop
    v_base := v_line.qty * v_line.factor;
    if v_line.dispatched_base_quantity + v_base > v_line.base_quantity then
      raise exception 'Dispatch exceeds the ordered quantity' using errcode = '23514';
    end if;

    -- Cumulative rounding so partial dispatches add up to the line discount exactly.
    v_discount := round(v_line.discount_amount * (v_line.dispatched_base_quantity + v_base) / v_line.base_quantity, 2)
                - round(v_line.discount_amount * v_line.dispatched_base_quantity / v_line.base_quantity, 2);

    insert into public.sales_invoice_items
      (sales_invoice_id, sales_order_item_id, product_id, unit_id, quantity, unit_price, discount_amount)
    values (v_invoice_id, v_line.id, v_line.product_id, v_line.unit_id, v_line.qty, v_line.unit_price, v_discount);

    v_release := least(v_line.reserved_base_quantity, v_base);
    perform private.release_stock(v_line.product_id, v_order.warehouse_id, v_release);
    update public.sales_order_items
       set dispatched_base_quantity = dispatched_base_quantity + v_base,
           reserved_base_quantity = reserved_base_quantity - v_release
     where id = v_line.id;
  end loop;

  perform private.post_sales_invoice(v_invoice_id);

  update public.deliveries
     set status = 'dispatched', sales_invoice_id = v_invoice_id, dispatched_at = now(), dispatched_by = auth.uid()
   where id = p_id;
  perform private.refresh_sales_order(v_order.id);
  return v_invoice_id;
end;
$$;

-- The goods arrived. p_returns: [{ "delivery_item_id", "quantity", "condition" }] refused or damaged at the
-- door; they come back into stock and are credited against the invoice in the same transaction.
create function public.complete_delivery(p_id uuid, p_doc jsonb default '{}'::jsonb, p_returns jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.sales_orders%rowtype;
  v_return uuid;
  v_line record;
  v_damaged uuid;
begin
  select * into v_delivery from public.deliveries where id = p_id for update;
  -- The assigned driver may confirm their own delivery.
  if not private.has_permission('sales.dispatch')
     and (v_delivery.id is null or v_delivery.driver_id is null or v_delivery.driver_id is distinct from private.current_driver_id()) then
    perform private.require_permission('sales.dispatch');
  end if;
  if v_delivery.id is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if v_delivery.status <> 'dispatched' then raise exception 'Only dispatched deliveries can be confirmed' using errcode = '23514'; end if;
  select * into v_order from public.sales_orders where id = v_delivery.sales_order_id for update;

  if jsonb_array_length(coalesce(p_returns, '[]'::jsonb)) > 0 then
    perform private.require_permission('sales.return');
    select coalesce((p_doc ->> 'damaged_warehouse_id')::uuid,
                    (select id from public.warehouses where warehouse_type = 'damaged' and is_active order by code limit 1)) into v_damaged;
    insert into public.customer_returns (customer_id, sales_invoice_id, warehouse_id, damaged_warehouse_id, return_date, reason, delivery_id)
    values (v_order.customer_id, v_delivery.sales_invoice_id, v_order.warehouse_id, v_damaged, private.business_today(),
            coalesce(nullif(trim(p_doc ->> 'return_reason'), ''), 'Returned on delivery ' || v_delivery.doc_no), p_id)
    returning id into v_return;
    for v_line in
      select r.delivery_item_id, r.quantity, coalesce(r.condition, 'saleable') as condition, ii.id as invoice_item_id, ii.product_id, ii.unit_id, ii.unit_price
        from jsonb_to_recordset(p_returns) as r(delivery_item_id uuid, quantity bigint, condition text)
        left join public.delivery_items di on di.id = r.delivery_item_id and di.delivery_id = p_id
        left join public.sales_invoice_items ii on ii.sales_invoice_id = v_delivery.sales_invoice_id and ii.sales_order_item_id = di.sales_order_item_id
    loop
      if v_line.invoice_item_id is null then
        raise exception 'A returned line does not belong to this delivery' using errcode = '23514';
      end if;
      insert into public.customer_return_items (customer_return_id, sales_invoice_item_id, product_id, unit_id, quantity, unit_price, condition)
      values (v_return, v_line.invoice_item_id, v_line.product_id, v_line.unit_id, v_line.quantity, v_line.unit_price, v_line.condition::public.item_condition);
      update public.delivery_items set returned_quantity = returned_quantity + v_line.quantity where id = v_line.delivery_item_id;
    end loop;
    perform private.post_customer_return(v_return);
  end if;

  update public.deliveries
     set status = 'delivered', delivered_at = now(), delivered_by = auth.uid(),
         received_by = nullif(trim(p_doc ->> 'received_by'), ''), delivery_note = nullif(trim(p_doc ->> 'notes'), '')
   where id = p_id;
  perform private.refresh_sales_order(v_order.id);
  return p_id;
end;
$$;

create or replace function public.confirm_delivery(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('sales.dispatch');
  return public.complete_delivery(p_id);
end;
$$;

-- Settling, returning or crediting an invoice can complete its order, and undoing that reopens it.
create function private.refresh_order_of_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid;
begin
  for v_order in
    select distinct i.sales_order_id from public.sales_invoices i
     where i.sales_order_id is not null
       and i.id in ((to_jsonb(new) ->> 'sales_invoice_id')::uuid, (to_jsonb(old) ->> 'sales_invoice_id')::uuid)
  loop
    perform private.refresh_sales_order(v_order);
  end loop;
  return null;
end;
$$;
create trigger refresh_order after insert or update or delete on public.customer_payment_allocations
  for each row execute function private.refresh_order_of_invoice();
create trigger refresh_order after update of status on public.customer_returns
  for each row execute function private.refresh_order_of_invoice();
create trigger refresh_order after insert or update of status on public.customer_notes
  for each row execute function private.refresh_order_of_invoice();

-- ===========================================================================
-- 8. Collections
-- ===========================================================================
-- Without a cash or bank account the collector holds the cash.
alter table public.customer_payments
  alter column financial_account_id drop not null,
  -- Invoices the collector asked to settle, applied when the payment is posted.
  add column requested_allocations jsonb,
  add column void_reason text,
  add constraint customer_payments_destination check (
    financial_account_id is not null or (method = 'cash' and collected_by is not null));
select private.restrict_columns('customer_payments', array[
  'doc_no', 'status', 'journal_entry_id', 'posted_at', 'posted_by', 'created_at', 'created_by', 'updated_at', 'updated_by',
  'requested_allocations', 'void_reason']);

drop policy "select" on public.customer_payments;
create policy "select" on public.customer_payments for select to authenticated using (
  (select private.has_permission('receivables.post'))
  or ((select private.has_permission('receivables.view'))
      and ((select private.has_permission('sales.view_all')) or (select private.has_permission('customers.manage'))
           or customer_id in (select c.id from public.customers c where c.order_taker_id = (select private.current_employee_id()))))
  or ((select private.has_permission('receivables.collect'))
      and (collected_by = (select private.current_employee_id()) or created_by = (select auth.uid()))));

create function private.allocate_customer_payment(p_payment_id uuid, p_invoice_id uuid, p_amount numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.customer_payments%rowtype;
  v_invoice public.sales_invoices%rowtype;
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Allocation amount must be positive' using errcode = '22023';
  end if;
  select * into v_payment from public.customer_payments where id = p_payment_id for update;
  select * into v_invoice from public.sales_invoices where id = p_invoice_id for update;
  if v_payment.id is null or v_invoice.id is null then
    raise exception 'Payment or invoice not found' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'posted' or v_invoice.status <> 'posted' then
    raise exception 'Only posted payments and invoices can be allocated' using errcode = '23514';
  end if;
  if v_payment.customer_id <> v_invoice.customer_id then
    raise exception 'Payment and invoice belong to different customers' using errcode = '23514';
  end if;
  if p_amount > private.payment_unallocated(p_payment_id) then
    raise exception 'Allocation exceeds the unallocated payment amount (%)', private.payment_unallocated(p_payment_id)
      using errcode = '23514';
  end if;
  if p_amount > private.sales_invoice_outstanding(p_invoice_id) then
    raise exception 'Allocation exceeds the invoice balance (%)', private.sales_invoice_outstanding(p_invoice_id)
      using errcode = '23514';
  end if;

  insert into public.customer_payment_allocations (customer_payment_id, sales_invoice_id, amount)
  values (p_payment_id, p_invoice_id, p_amount)
  on conflict (customer_payment_id, sales_invoice_id)
  do update set amount = public.customer_payment_allocations.amount + excluded.amount
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.allocate_customer_payment(p_payment_id uuid, p_invoice_id uuid, p_amount numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('receivables.post');
  return private.allocate_customer_payment(p_payment_id, p_invoice_id, p_amount);
end;
$$;

-- Settles several invoices with one posted payment: all of them or none.
create function public.settle_invoices(p_payment_id uuid, p_allocations jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_allocation record;
begin
  perform private.require_permission('receivables.post');
  for v_allocation in select * from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as a(invoice_id uuid, amount numeric) loop
    perform private.allocate_customer_payment(p_payment_id, v_allocation.invoice_id, v_allocation.amount);
  end loop;
  return p_payment_id;
end;
$$;

create function private.post_customer_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.customer_payments%rowtype;
  v_request record;
  v_amount numeric(18,2);
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

  -- Settle what was asked for, as far as the invoices still have a balance; the rest stays on account.
  for v_request in
    select r.invoice_id, r.amount from jsonb_to_recordset(coalesce(v_doc.requested_allocations, '[]'::jsonb)) as r(invoice_id uuid, amount numeric)
  loop
    v_amount := least(v_request.amount, private.payment_unallocated(p_id), private.sales_invoice_outstanding(v_request.invoice_id));
    if v_amount > 0 then
      perform private.allocate_customer_payment(p_id, v_request.invoice_id, v_amount);
    end if;
  end loop;
  return v_je;
end;
$$;

create or replace function public.post_customer_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('receivables.post');
  return private.post_customer_payment(p_id);
end;
$$;

-- Records a collection. An order taker's own cash is posted at once and held in their name until deposited;
-- everything else is posted by someone with receivables.post, or waits for them as a draft.
-- p_allocations: [{ "invoice_id": uuid, "amount": numeric }], may be empty (payment on account).
create function public.record_customer_payment(p_doc jsonb, p_allocations jsonb default '[]'::jsonb) returns uuid
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
                                        requested_allocations)
  values (v_customer, coalesce((p_doc ->> 'date')::date, private.business_today()), v_amount, v_account, v_method,
          nullif(trim(p_doc ->> 'reference'), ''), v_collector, nullif(trim(p_doc ->> 'notes'), ''), v_request, nullif(p_allocations, '[]'::jsonb))
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

create or replace function public.void_customer_payment(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.customer_payments%rowtype;
  v_rev uuid;
begin
  perform private.require_permission('receivables.post');
  select * into v_doc from public.customer_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted payments can be voided' using errcode = '23514'; end if;
  if v_doc.financial_account_id is null then
    perform 1 from public.order_takers where employee_id = v_doc.collected_by for update;
    if private.collector_held(v_doc.collected_by) < v_doc.amount then
      raise exception 'This cash was already deposited; void the deposit first' using errcode = '23514';
    end if;
  end if;
  delete from public.customer_payment_allocations where customer_payment_id = p_id;
  v_rev := private.reverse_journal(v_doc.journal_entry_id, private.business_today(), p_reason);
  update public.customer_payments set status = 'void', void_reason = p_reason where id = p_id;
  return v_rev;
end;
$$;

-- ===========================================================================
-- 9. Deposits and reconciliation of cash held by order takers
-- ===========================================================================
create table public.cash_deposits (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  employee_id uuid not null references public.order_takers (employee_id),
  deposit_date date not null default private.business_today(),
  amount numeric(18,2) not null check (amount > 0),
  financial_account_id uuid not null references public.financial_accounts (id),
  reference text,
  notes text,
  status public.document_status not null default 'draft',
  void_reason text,
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index cash_deposits_employee_idx on public.cash_deposits (employee_id, deposit_date);
create trigger cash_deposits_doc_no before insert on public.cash_deposits for each row execute function private.assign_doc_no('DEP');
create trigger touch_updated before update on public.cash_deposits for each row execute function private.touch_updated();
create trigger audit after insert or update or delete on public.cash_deposits for each row execute function private.audit_row();
select private.apply_policies('cash_deposits',
  private.p('receivables.post') || ' or (' || private.p('receivables.view') || ' and ' || private.p('sales.view_all') || ') or (' || private.p('receivables.collect') || ' and employee_id = ' || private.me() || ')',
  null, null,
  'status = ''draft'' and (' || private.p('receivables.post') || ' or (' || private.p('receivables.collect') || ' and employee_id = ' || private.me() || '))');
revoke all on public.cash_deposits from anon, authenticated;
grant select, delete on public.cash_deposits to authenticated;

create function private.post_cash_deposit(p_id uuid) returns uuid
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
    jsonb_build_array(
      jsonb_build_object('account_id', private.financial_gl(v_doc.financial_account_id), 'debit', v_doc.amount),
      jsonb_build_object('account', 'CASH_WITH_COLLECTORS', 'credit', v_doc.amount, 'employee_id', v_doc.employee_id)));
  update public.cash_deposits set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid() where id = p_id;
  return v_je;
end;
$$;

-- An order taker hands cash in as a draft; someone with receivables.post confirms it (or records it directly).
create function public.record_cash_deposit(p_doc jsonb) returns uuid
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
  insert into public.cash_deposits (employee_id, deposit_date, amount, financial_account_id, reference, notes, client_request_id)
  values (v_employee, coalesce((p_doc ->> 'date')::date, private.business_today()), (p_doc ->> 'amount')::numeric, (p_doc ->> 'financial_account_id')::uuid,
          nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'notes'), ''), v_request)
  returning id into v_id;
  if v_poster then
    perform private.post_cash_deposit(v_id);
  end if;
  return v_id;
end;
$$;

create function public.post_cash_deposit(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('receivables.post');
  return private.post_cash_deposit(p_id);
end;
$$;

create function public.void_cash_deposit(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.cash_deposits%rowtype;
begin
  perform private.require_permission('receivables.post');
  select * into v_doc from public.cash_deposits where id = p_id for update;
  if v_doc.id is null then raise exception 'Deposit not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted deposits can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.reverse_journal(v_doc.journal_entry_id, private.business_today(), trim(p_reason));
  update public.cash_deposits set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

-- A count of the cash an order taker holds. It records the difference; it does not post anything.
create table public.cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.order_takers (employee_id),
  reconciled_on date not null default private.business_today(),
  expected_amount numeric(18,2) not null,
  counted_amount numeric(18,2) not null check (counted_amount >= 0),
  difference numeric(18,2) generated always as (counted_amount - expected_amount) stored,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index cash_reconciliations_employee_idx on public.cash_reconciliations (employee_id, created_at desc);
create trigger audit after insert or update or delete on public.cash_reconciliations for each row execute function private.audit_row();
select private.apply_policies('cash_reconciliations',
  private.p('receivables.post') || ' or (' || private.p('receivables.view') || ' and ' || private.p('sales.view_all') || ') or (' || private.p('receivables.collect') || ' and employee_id = ' || private.me() || ')',
  null, null, null);
revoke all on public.cash_reconciliations from anon, authenticated;
grant select on public.cash_reconciliations to authenticated;

create function public.reconcile_collector_cash(p_employee_id uuid, p_counted numeric, p_notes text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_permission('receivables.post');
  perform 1 from public.order_takers where employee_id = p_employee_id for update;
  if not found then raise exception 'Order taker not found' using errcode = 'P0002'; end if;
  insert into public.cash_reconciliations (employee_id, expected_amount, counted_amount, notes)
  values (p_employee_id, private.collector_held(p_employee_id), p_counted, nullif(trim(p_notes), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Cash per order taker: held in the ledger, collections and deposits still waiting, last count.
create function public.collector_cash()
returns table (employee_id uuid, full_name text, full_name_ur text, is_active boolean, held numeric, waiting_collections numeric, waiting_deposits numeric,
               last_deposit date, last_count date, last_counted numeric, last_difference numeric)
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
  select ot.employee_id, e.full_name, e.full_name_ur, ot.is_active, private.collector_held(ot.employee_id),
         coalesce((select sum(p.amount) from public.customer_payments p
                    where p.collected_by = ot.employee_id and p.financial_account_id is null and p.status = 'draft'), 0),
         coalesce((select sum(d.amount) from public.cash_deposits d where d.employee_id = ot.employee_id and d.status = 'draft'), 0),
         (select max(d.deposit_date) from public.cash_deposits d where d.employee_id = ot.employee_id and d.status = 'posted'),
         r.reconciled_on, r.counted_amount, r.difference
    from public.order_takers ot
    join public.employees e on e.id = ot.employee_id
    left join lateral (select x.reconciled_on, x.counted_amount, x.difference from public.cash_reconciliations x
                        where x.employee_id = ot.employee_id order by x.created_at desc limit 1) r on true
   where v_own is null or ot.employee_id = v_own
   order by private.collector_held(ot.employee_id) desc, e.full_name;
end;
$$;

-- Movements of the cash one order taker holds, oldest first, with the running balance.
create function public.collector_statement(p_employee_id uuid, p_from date, p_to date)
returns table (entry_date date, kind text, source_id uuid, doc_no text, party text, party_ur text, is_reversal boolean,
               received numeric, handed_over numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (private.has_permission('receivables.post') or (private.has_permission('receivables.view') and private.has_permission('sales.view_all'))
          or (private.has_permission('receivables.collect') and coalesce(p_employee_id = private.current_employee_id(), false))) then
    perform private.require_permission('receivables.post');
  end if;
  return query
  select t.entry_date, t.source_type, t.source_id, t.doc_no, t.name, t.name_ur, t.reversal, t.debit, t.credit, t.running
    from (select e.entry_date, e.source_type, e.source_id, coalesce(p.doc_no, d.doc_no, e.doc_no) as doc_no, c.name, c.name_ur,
                 e.reversal_of is not null as reversal, l.debit, l.credit,
                 sum(l.debit - l.credit) over (order by e.entry_date, e.doc_no, l.line_no) as running, e.doc_no as journal
            from public.journal_entry_lines l
            join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
            left join public.customer_payments p on e.source_type = 'customer_payment' and p.id = e.source_id
            left join public.customers c on c.id = p.customer_id
            left join public.cash_deposits d on e.source_type = 'cash_deposit' and d.id = e.source_id
           where l.account_id = private.account_id('CASH_WITH_COLLECTORS') and l.employee_id = p_employee_id) t
   where t.entry_date between p_from and p_to
   order by t.entry_date, t.journal;
end;
$$;

-- ===========================================================================
-- 10. Customer account
-- ===========================================================================
-- Every line of the customer's ledger in a period with its document; the first row brings the earlier balance forward.
create function public.customer_statement(p_customer_id uuid, p_from date, p_to date)
returns table (entry_date date, kind text, source_id uuid, doc_no text, journal_no text, description text, is_reversal boolean,
               debit numeric, credit numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_opening numeric(18,2);
begin
  perform private.require_permission('receivables.view');
  if not private.sees_customer(p_customer_id) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  select coalesce(sum(l.debit - l.credit), 0) into v_opening
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date < p_from
   where l.account_id = private.account_id('AR') and l.customer_id = p_customer_id;
  return query select p_from, 'brought_forward'::text, null::uuid, null::text, null::text, null::text, false, 0::numeric, 0::numeric, v_opening::numeric;
  return query
  select e.entry_date,
         case e.source_type when 'customer_note' then case n.kind::text when 'opening' then 'opening' when 'credit' then 'credit_note' else 'debit_note' end
                            else e.source_type end,
         e.source_id, coalesce(si.doc_no, cp.doc_no, cr.doc_no, n.doc_no, sj.doc_no), e.doc_no, e.description, e.reversal_of is not null,
         l.debit, l.credit,
         v_opening + sum(l.debit - l.credit) over (order by e.entry_date, e.doc_no, l.line_no)
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date between p_from and p_to
    left join public.sales_invoices si on e.source_type = 'sales_invoice' and si.id = e.source_id
    left join public.customer_payments cp on e.source_type = 'customer_payment' and cp.id = e.source_id
    left join public.customer_returns cr on e.source_type = 'customer_return' and cr.id = e.source_id
    left join public.customer_notes n on e.source_type = 'customer_note' and n.id = e.source_id
    left join public.sol_jobs sj on e.source_type = 'sol_job' and sj.id = e.source_id
   where l.account_id = private.account_id('AR') and l.customer_id = p_customer_id
   order by e.entry_date, e.doc_no, l.line_no;
end;
$$;

create function public.customer_summary(p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_receivables constant boolean := private.has_permission('receivables.view');
  v_limit numeric;
  v_balance numeric;
  v_open numeric;
begin
  if not v_receivables then
    perform private.require_permission('customers.view');
  end if;
  if not private.sees_customer(p_customer_id) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  select credit_limit into v_limit from public.customers where id = p_customer_id;
  v_balance := private.customer_balance(p_customer_id);
  select coalesce(sum(i.line_total * (i.base_quantity - i.dispatched_base_quantity) / i.base_quantity), 0) into v_open
    from public.sales_order_items i
    join public.sales_orders o on o.id = i.sales_order_id
   where o.customer_id = p_customer_id and o.status::text in ('approved', 'picking', 'partially_dispatched');
  return jsonb_strip_nulls(jsonb_build_object(
    'open_orders', private.money_text(v_open),
    'credit_limit', case when v_limit is not null then private.money_text(v_limit) end,
    'balance', case when v_receivables then private.money_text(v_balance) end,
    'credit_available', case when v_receivables and v_limit is not null then private.money_text(v_limit - v_balance - v_open) end,
    'unallocated', case when v_receivables then private.money_text((
        select sum(private.payment_unallocated(p.id)) from public.customer_payments p where p.customer_id = p_customer_id and p.status = 'posted')) end,
    'overdue', case when v_receivables then private.money_text((
        select sum(greatest(private.sales_invoice_outstanding(i.id), 0)) from public.sales_invoices i
         where i.customer_id = p_customer_id and i.status = 'posted' and i.due_date < private.business_today())) end,
    'last_payment', case when v_receivables then (select max(payment_date) from public.customer_payments where customer_id = p_customer_id and status = 'posted') end,
    'last_order', (select max(order_date) from public.sales_orders where customer_id = p_customer_id and status::text <> 'cancelled')));
end;
$$;

-- ===========================================================================
-- 11. Reports
-- ===========================================================================
-- NULL = everything; an employee = only their own. Raises without permission.
create function private.sales_scope() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.has_permission('sales.view_all') then return null; end if;
  perform private.require_permission('sales.view');
  return coalesce(private.current_employee_id(), '00000000-0000-0000-0000-000000000000'::uuid);
end;
$$;

-- Sales per day or month. Net sales = invoices - returns - credit notes + debit notes, before sales tax.
create function public.report_sales(p_from date, p_to date, p_bucket text default 'day')
returns table (period date, invoices bigint, gross numeric, discounts numeric, net numeric, tax numeric, returns numeric,
               credit_notes numeric, debit_notes numeric, net_sales numeric, collected numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
  v_bucket constant text := case when p_bucket = 'month' then 'month' else 'day' end;
  v_collections constant boolean := private.has_permission('receivables.view') or private.has_permission('receivables.post') or private.has_permission('receivables.collect');
begin
  return query
  with facts as (
    select i.invoice_date as d, 1 as n, t.gross, t.disc, t.net, t.tax, 0::numeric as ret, 0::numeric as cn, 0::numeric as dn, 0::numeric as col
      from public.sales_invoices i
      join (select it.sales_invoice_id, sum(it.quantity * it.unit_price) as gross, sum(it.discount_amount) as disc, sum(it.line_net) as net, sum(it.tax_amount) as tax
              from public.sales_invoice_items it group by it.sales_invoice_id) t on t.sales_invoice_id = i.id
     where i.status = 'posted' and i.invoice_date between p_from and p_to and (v_own is null or i.order_taker_id = v_own)
    union all
    select r.return_date, 0, 0, 0, 0, 0, r.subtotal, 0, 0, 0
      from public.customer_returns r
      left join public.sales_invoices i on i.id = r.sales_invoice_id
     where r.status = 'posted' and r.return_date between p_from and p_to and (v_own is null or i.order_taker_id = v_own)
    union all
    select n.note_date, 0, 0, 0, 0, 0, 0, case when n.kind = 'credit' then n.amount else 0 end, case when n.kind = 'debit' then n.amount else 0 end, 0
      from public.customer_notes n
      left join public.sales_invoices i on i.id = n.sales_invoice_id
     where n.status = 'posted' and n.kind in ('credit', 'debit') and n.note_date between p_from and p_to and (v_own is null or i.order_taker_id = v_own)
    union all
    select p.payment_date, 0, 0, 0, 0, 0, 0, 0, 0, p.amount
      from public.customer_payments p
     where v_collections and p.status = 'posted' and p.payment_date between p_from and p_to and (v_own is null or p.collected_by = v_own)
  )
  select date_trunc(v_bucket, f.d)::date, sum(f.n)::bigint, sum(f.gross), sum(f.disc), sum(f.net), sum(f.tax), sum(f.ret), sum(f.cn), sum(f.dn),
         sum(f.net) - sum(f.ret) - sum(f.cn) + sum(f.dn), case when v_collections then sum(f.col) end
    from facts f
   group by 1
   order by 1 desc;
end;
$$;

create function public.report_sales_by_customer(p_from date, p_to date, p_order_taker_id uuid default null)
returns table (customer_id uuid, code text, name text, name_ur text, city text, taker_en text, taker_ur text, orders bigint, invoices bigint,
               net numeric, tax numeric, returns numeric, notes numeric, net_sales numeric, collected numeric, balance numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
  v_receivables constant boolean := private.has_permission('receivables.view');
begin
  return query
  select c.id, c.code, c.name, c.name_ur, c.city, e.full_name, e.full_name_ur, coalesce(o.n, 0)::bigint, coalesce(i.n, 0)::bigint,
         coalesce(i.net, 0), coalesce(i.tax, 0), coalesce(r.net, 0), coalesce(nt.net, 0), coalesce(i.net, 0) - coalesce(r.net, 0) + coalesce(nt.net, 0),
         case when v_receivables then coalesce(p.paid, 0) end, case when v_receivables then private.customer_balance(c.id) end
    from public.customers c
    left join public.employees e on e.id = c.order_taker_id
    left join (select so.customer_id, count(*) as n from public.sales_orders so
                where so.order_date between p_from and p_to and so.status::text not in ('draft', 'cancelled') and (v_own is null or so.order_taker_id = v_own)
                group by so.customer_id) o on o.customer_id = c.id
    left join (select si.customer_id, count(*) as n, sum(si.subtotal) as net, sum(si.tax_total) as tax from public.sales_invoices si
                where si.status = 'posted' and si.invoice_date between p_from and p_to and (v_own is null or si.order_taker_id = v_own)
                group by si.customer_id) i on i.customer_id = c.id
    left join (select cr.customer_id, sum(cr.subtotal) as net from public.customer_returns cr
                 left join public.sales_invoices si on si.id = cr.sales_invoice_id
                where cr.status = 'posted' and cr.return_date between p_from and p_to and (v_own is null or si.order_taker_id = v_own)
                group by cr.customer_id) r on r.customer_id = c.id
    left join (select cn.customer_id, sum(case when cn.kind = 'debit' then cn.amount else -cn.amount end) as net from public.customer_notes cn
                 left join public.sales_invoices si on si.id = cn.sales_invoice_id
                where cn.status = 'posted' and cn.kind in ('credit', 'debit') and cn.note_date between p_from and p_to and (v_own is null or si.order_taker_id = v_own)
                group by cn.customer_id) nt on nt.customer_id = c.id
    left join (select cp.customer_id, sum(cp.amount) as paid from public.customer_payments cp
                where cp.status = 'posted' and cp.payment_date between p_from and p_to group by cp.customer_id) p on p.customer_id = c.id
   where (p_order_taker_id is null or c.order_taker_id = p_order_taker_id)
     and (v_own is null or c.order_taker_id = v_own or i.n is not null or o.n is not null)
     and (o.n is not null or i.n is not null or r.net is not null or nt.net is not null or (v_receivables and p.paid is not null))
   order by coalesce(i.net, 0) - coalesce(r.net, 0) + coalesce(nt.net, 0) desc, c.name;
end;
$$;

-- Quantities in base units.
create function public.report_sales_by_product(p_from date, p_to date, p_category_id uuid default null)
returns table (product_id uuid, sku text, name_en text, name_ur text, unit_en text, unit_ur text, category_en text, category_ur text, invoices bigint,
               quantity bigint, gross numeric, discounts numeric, net numeric, returned_quantity bigint, returns numeric, net_quantity bigint, net_sales numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
begin
  return query
  select p.id, p.sku, p.name_en, p.name_ur, u.name_en, u.name_ur, c.name_en, c.name_ur, coalesce(s.n, 0)::bigint,
         coalesce(s.qty, 0)::bigint, coalesce(s.gross, 0), coalesce(s.disc, 0), coalesce(s.net, 0), coalesce(r.qty, 0)::bigint, coalesce(r.net, 0),
         (coalesce(s.qty, 0) - coalesce(r.qty, 0))::bigint, coalesce(s.net, 0) - coalesce(r.net, 0)
    from public.products p
    join public.units u on u.id = p.base_unit_id
    left join public.product_categories c on c.id = p.category_id
    left join (select it.product_id, count(distinct i.id) as n, sum(it.base_quantity) as qty, sum(it.quantity * it.unit_price) as gross,
                      sum(it.discount_amount) as disc, sum(it.line_net) as net
                 from public.sales_invoice_items it
                 join public.sales_invoices i on i.id = it.sales_invoice_id and i.status = 'posted'
                where i.invoice_date between p_from and p_to and (v_own is null or i.order_taker_id = v_own)
                group by it.product_id) s on s.product_id = p.id
    left join (select ri.product_id, sum(ri.base_quantity) as qty, sum(ri.line_net) as net
                 from public.customer_return_items ri
                 join public.customer_returns cr on cr.id = ri.customer_return_id and cr.status = 'posted'
                 left join public.sales_invoices i on i.id = cr.sales_invoice_id
                where cr.return_date between p_from and p_to and (v_own is null or i.order_taker_id = v_own)
                group by ri.product_id) r on r.product_id = p.id
   where (s.product_id is not null or r.product_id is not null) and (p_category_id is null or p.category_id = p_category_id)
   order by coalesce(s.net, 0) - coalesce(r.net, 0) desc, p.name_en;
end;
$$;

-- What each order taker did in a period, and what is open now (customers, pending collections, cash held).
create function public.report_order_takers(p_from date, p_to date)
returns table (employee_id uuid, code text, full_name text, full_name_ur text, territory text, employment_status public.employment_status, is_active boolean,
               customers bigint, orders bigint, order_value numeric, delivered_orders bigint, cancelled_orders bigint, open_orders bigint,
               total_sales numeric, collected numeric, pending_collections numeric, cash_held numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
  v_receivables constant boolean := private.has_permission('receivables.view');
  v_cash constant boolean := private.has_permission('receivables.post') or v_receivables;
begin
  return query
  select ot.employee_id, e.employee_code, e.full_name, e.full_name_ur, ot.territory, e.status, ot.is_active,
         (select count(*) from public.customers c where c.order_taker_id = ot.employee_id and c.is_active),
         coalesce(o.n, 0)::bigint, coalesce(o.value, 0), coalesce(o.delivered, 0)::bigint, coalesce(o.cancelled, 0)::bigint, coalesce(o.open, 0)::bigint,
         coalesce(s.net, 0) - coalesce(r.net, 0) - coalesce(cn.net, 0),
         case when v_cash or ot.employee_id = v_own then coalesce(pay.amount, 0) end,
         case when v_receivables then coalesce((
           select sum(l.debit - l.credit)
             from public.journal_entry_lines l
             join public.journal_entries je on je.id = l.journal_entry_id and je.status = 'posted'
             join public.customers c on c.id = l.customer_id and c.order_taker_id = ot.employee_id
            where l.account_id = private.account_id('AR')), 0) end,
         case when v_cash or ot.employee_id = v_own then private.collector_held(ot.employee_id) end
    from public.order_takers ot
    join public.employees e on e.id = ot.employee_id
    left join (select so.order_taker_id, count(*) filter (where so.status::text <> 'draft') as n,
                      sum(so.total_amount) filter (where so.status::text not in ('draft', 'cancelled')) as value,
                      count(*) filter (where so.status::text in ('delivered', 'completed')) as delivered,
                      count(*) filter (where so.status::text = 'cancelled') as cancelled,
                      count(*) filter (where so.status::text in ('submitted', 'approved', 'picking', 'partially_dispatched', 'dispatched')) as open
                 from public.sales_orders so where so.order_date between p_from and p_to group by so.order_taker_id) o on o.order_taker_id = ot.employee_id
    left join (select i.order_taker_id, sum(i.subtotal) as net from public.sales_invoices i
                where i.status = 'posted' and i.invoice_date between p_from and p_to group by i.order_taker_id) s on s.order_taker_id = ot.employee_id
    left join (select i.order_taker_id, sum(cr.subtotal) as net from public.customer_returns cr
                 join public.sales_invoices i on i.id = cr.sales_invoice_id
                where cr.status = 'posted' and cr.return_date between p_from and p_to group by i.order_taker_id) r on r.order_taker_id = ot.employee_id
    left join (select i.order_taker_id, sum(n.amount) as net from public.customer_notes n
                 join public.sales_invoices i on i.id = n.sales_invoice_id
                where n.status = 'posted' and n.kind = 'credit' and n.note_date between p_from and p_to group by i.order_taker_id) cn on cn.order_taker_id = ot.employee_id
    left join (select p.collected_by, sum(p.amount) as amount from public.customer_payments p
                where p.status = 'posted' and p.payment_date between p_from and p_to group by p.collected_by) pay on pay.collected_by = ot.employee_id
   where v_own is null or ot.employee_id = v_own
   order by coalesce(s.net, 0) - coalesce(r.net, 0) - coalesce(cn.net, 0) desc, e.full_name;
end;
$$;

-- What every customer owes on a date, by age. Credits settle the oldest debits first, so the ages add up to the
-- ledger balance exactly. An entry and its reversal cancel out instead of looking like a new debt.
create function public.report_receivables(p_as_of date, p_order_taker_id uuid default null)
returns table (customer_id uuid, code text, name text, name_ur text, phone text, area text, city text, taker_en text, taker_ur text,
               credit_limit numeric, balance numeric, days_30 numeric, days_60 numeric, days_90 numeric, older numeric, advance numeric,
               overdue numeric, last_payment date)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
begin
  perform private.require_permission('receivables.view');
  return query
  with lines as (
    select l.customer_id as cid, e.entry_date as d, e.doc_no, l.line_no, l.debit, l.credit
      from public.journal_entry_lines l
      join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' and e.entry_date <= p_as_of
      left join public.journal_entries rv on rv.id = e.reversed_by
     where l.account_id = private.account_id('AR') and e.reversal_of is null and (rv.id is null or rv.entry_date > p_as_of)
  ), totals as (
    select cid, sum(debit - credit) as balance, sum(credit) as credits from lines group by cid
  ), debts as (
    select x.cid, x.d, greatest(0, least(x.debit, sum(x.debit) over (partition by x.cid order by x.d, x.doc_no, x.line_no) - t.credits)) as open
      from lines x join totals t on t.cid = x.cid
     where x.debit > 0
  ), ages as (
    select cid,
           sum(open) filter (where p_as_of - d <= 30) as a, sum(open) filter (where p_as_of - d between 31 and 60) as b,
           sum(open) filter (where p_as_of - d between 61 and 90) as c, sum(open) filter (where p_as_of - d > 90) as o
      from debts group by cid
  )
  select cu.id, cu.code, cu.name, cu.name_ur, cu.phone, cu.area, cu.city, em.full_name, em.full_name_ur, cu.credit_limit, t.balance,
         coalesce(g.a, 0), coalesce(g.b, 0), coalesce(g.c, 0), coalesce(g.o, 0), greatest(-t.balance, 0),
         coalesce((select sum(greatest(private.sales_invoice_outstanding(i.id), 0)) from public.sales_invoices i
                    where i.customer_id = cu.id and i.status = 'posted' and i.due_date < p_as_of), 0),
         (select max(p.payment_date) from public.customer_payments p where p.customer_id = cu.id and p.status = 'posted' and p.payment_date <= p_as_of)
    from totals t
    join public.customers cu on cu.id = t.cid
    left join ages g on g.cid = t.cid
    left join public.employees em on em.id = cu.order_taker_id
   where t.balance <> 0
     and (v_own is null or private.has_permission('customers.manage') or cu.order_taker_id = v_own)
     and (p_order_taker_id is null or cu.order_taker_id = p_order_taker_id)
   order by t.balance desc, cu.name;
end;
$$;

create function public.report_deliveries(p_from date, p_to date, p_status text default null)
returns table (delivery_id uuid, doc_no text, delivery_date date, status public.delivery_status, order_id uuid, order_no text, customer text, customer_ur text,
               city text, taker_en text, taker_ur text, vehicle text, driver_en text, driver_ur text, dispatched_at timestamptz, delivered_at timestamptz,
               received_by text, lines bigint, dispatched_quantity bigint, returned_quantity bigint, invoice_id uuid, invoice_no text, amount numeric, returned_amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
begin
  return query
  select d.id, d.doc_no, d.delivery_date, d.status, o.id, o.doc_no, c.name, c.name_ur, c.city, te.full_name, te.full_name_ur, v.registration_no,
         de.full_name, de.full_name_ur, d.dispatched_at, d.delivered_at, d.received_by, q.n, q.out, q.back, i.id, i.doc_no, i.total_amount,
         coalesce((select sum(r.total_amount) from public.customer_returns r where r.delivery_id = d.id and r.status = 'posted'), 0)
    from public.deliveries d
    join public.sales_orders o on o.id = d.sales_order_id
    join public.customers c on c.id = o.customer_id
    left join public.employees te on te.id = o.order_taker_id
    left join public.vehicles v on v.id = d.vehicle_id
    left join public.drivers dr on dr.id = d.driver_id
    left join public.employees de on de.id = dr.employee_id
    left join public.sales_invoices i on i.id = d.sales_invoice_id
    cross join lateral (select count(*) as n, coalesce(sum(di.quantity * soi.factor), 0)::bigint as out, coalesce(sum(di.returned_quantity * soi.factor), 0)::bigint as back
                          from public.delivery_items di join public.sales_order_items soi on soi.id = di.sales_order_item_id where di.delivery_id = d.id) q
   where d.delivery_date between p_from and p_to and d.status::text in ('dispatched', 'delivered') and (p_status is null or d.status::text = p_status)
     and (v_own is null or o.order_taker_id = v_own)
   order by d.delivery_date desc, d.doc_no desc;
end;
$$;

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

-- Counts and amounts for the sales overview.
create function public.sales_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_own uuid := private.sales_scope();
  v_month constant date := date_trunc('month', private.business_today())::date;
  v_today constant date := private.business_today();
  v_orders jsonb;
  v_sales record;
begin
  select jsonb_object_agg(x.status, x.n) into v_orders
    from (select o.status::text as status, count(*) as n from public.sales_orders o
           where (v_own is null or o.order_taker_id = v_own) and o.status::text not in ('completed', 'cancelled') group by o.status) x;
  select coalesce(sum(i.subtotal) filter (where i.invoice_date = v_today), 0) as today, coalesce(sum(i.subtotal), 0) as month, count(*) as invoices into v_sales
    from public.sales_invoices i
   where i.status = 'posted' and i.invoice_date between v_month and v_today and (v_own is null or i.order_taker_id = v_own);
  return jsonb_strip_nulls(jsonb_build_object(
    'orders', coalesce(v_orders, '{}'::jsonb),
    'in_transit', (select count(*) from public.deliveries d join public.sales_orders o on o.id = d.sales_order_id
                    where d.status = 'dispatched' and (v_own is null or o.order_taker_id = v_own)),
    'today', private.money_text(v_sales.today), 'month', private.money_text(v_sales.month), 'month_invoices', v_sales.invoices,
    'waiting_approval', private.money_text((select sum(o.total_amount) from public.sales_orders o where o.status = 'submitted' and (v_own is null or o.order_taker_id = v_own))),
    'collected_month', case when private.has_permission('receivables.view') or private.has_permission('receivables.collect') then private.money_text((
        select sum(p.amount) from public.customer_payments p where p.status = 'posted' and p.payment_date between v_month and v_today and (v_own is null or p.collected_by = v_own))) end));
end;
$$;

-- ===========================================================================
-- 12. Dashboard: new states, credit notes, and only a user's own customers
-- ===========================================================================
create or replace function public.dashboard_overdue(p_limit integer default 5) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today constant date := private.business_today();
  v_limit constant integer := least(greatest(coalesce(p_limit, 5), 0), 50);
  v_payables constant boolean := private.has_permission('payables.view');
  v_company constant boolean := private.has_permission('company.view');
  v_all constant boolean := private.has_permission('sales.view_all') or private.has_permission('customers.manage') or private.has_permission('receivables.post');
  v_me constant uuid := private.current_employee_id();
  v_result jsonb := '{}'::jsonb;
begin
  perform private.require_permission('dashboard.view');

  if private.has_permission('receivables.view') then
    with open_invoices as (
      select i.doc_no, i.due_date, c.name as party, c.name_ur as party_ur, private.sales_invoice_outstanding(i.id) as outstanding
        from public.sales_invoices i
        join public.customers c on c.id = i.customer_id
       where i.status = 'posted' and i.due_date < v_today and (v_all or c.order_taker_id = v_me)
    ), overdue as (select * from open_invoices where outstanding > 0)
    select v_result || jsonb_build_object('receivables', jsonb_build_object(
             'total', private.money_text(sum(outstanding)), 'count', count(*),
             'items', coalesce((select jsonb_agg(to_jsonb(t)) from (
               select doc_no, party, party_ur, due_date, v_today - due_date as days, private.money_text(outstanding) as outstanding
                 from overdue order by due_date, doc_no limit v_limit) t), '[]'::jsonb)))
      into v_result from overdue;
  end if;

  if v_payables or v_company then
    with open_invoices as (
      select i.doc_no, i.due_date, s.name as party, s.name_ur as party_ur,
             i.amount - coalesce((select sum(a.amount) from public.supplier_payment_allocations a where a.supplier_invoice_id = i.id), 0) as outstanding
        from public.supplier_invoices i
        join public.suppliers s on s.id = i.supplier_id
       where i.status = 'posted' and i.due_date < v_today
         and case when s.is_principal then v_company else v_payables end
    ), overdue as (select * from open_invoices where outstanding > 0)
    select v_result || jsonb_build_object('payables', jsonb_build_object(
             'total', private.money_text(sum(outstanding)), 'count', count(*),
             'items', coalesce((select jsonb_agg(to_jsonb(t)) from (
               select doc_no, party, party_ur, due_date, v_today - due_date as days, private.money_text(outstanding) as outstanding
                 from overdue order by due_date, doc_no limit v_limit) t), '[]'::jsonb)))
      into v_result from overdue;
  end if;
  return v_result;
end;
$$;

create or replace function public.dashboard_open_work()
returns table (scope text, kind text, waiting bigint)
language sql stable security invoker set search_path = '' as $$
  select t.* from (
    select 'mine'::text, 'sales_order'::text, count(*) from public.sales_orders where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'purchase_order', count(*) from public.purchase_orders where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'goods_receipt', count(*) from public.goods_receipts where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'customer_payment', count(*) from public.customer_payments where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'expense', count(*) from public.expenses where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'stock_count', count(*) from public.stock_counts where status = 'draft' and created_by = (select auth.uid())
    union all select 'mine', 'stock_transfer', count(*) from public.stock_transfers where status = 'draft' and created_by = (select auth.uid())
    union all select 'review', 'sales_order', count(*) from public.sales_orders
               where status = 'submitted' and (select private.has_permission('sales.approve'))
    union all select 'review', 'purchase_order', count(*) from public.purchase_orders
               where status = 'draft' and (select private.has_permission('purchasing.approve'))
    union all select 'review', 'goods_receipt', count(*) from public.goods_receipts
               where status = 'draft' and (select private.has_permission('purchasing.post'))
    union all select 'review', 'supplier_invoice', count(*) from public.supplier_invoices
               where status = 'draft' and (select private.has_permission('purchasing.post'))
    union all select 'review', 'customer_payment', count(*) from public.customer_payments
               where status = 'draft' and (select private.has_permission('receivables.post'))
    union all select 'review', 'cash_deposit', count(*) from public.cash_deposits
               where status = 'draft' and (select private.has_permission('receivables.post'))
    union all select 'review', 'supplier_payment', count(*) from public.supplier_payments
               where status = 'draft' and ((select private.has_permission('payables.pay')) or (select private.has_permission('company.pay')))
    union all select 'review', 'expense', count(*) from public.expenses
               where status = 'draft' and (select private.has_permission('expenses.post'))
    union all select 'review', 'stock_count', count(*) from public.stock_counts
               where status = 'draft' and (select private.has_permission('inventory.adjust'))
    union all select 'review', 'dispatch', count(*) from public.sales_orders
               where status::text in ('approved', 'picking', 'partially_dispatched') and (select private.has_permission('sales.dispatch'))
    union all select 'assigned', 'delivery', count(*) from public.deliveries
               where status in ('draft', 'dispatched') and driver_id = (select private.current_driver_id())
  ) t(scope, kind, waiting)
  where t.waiting > 0;
$$;

-- Total receivables are for users who work with every customer; others see their own customers' total.
do $$
declare
  v_def text := pg_get_functiondef('public.dashboard_position()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def, 'v_receivables constant boolean := private.has_permission(''receivables.view'');',
    'v_receivables constant boolean := private.has_permission(''receivables.view'')
    and (private.has_permission(''sales.view_all'') or private.has_permission(''customers.manage'') or private.has_permission(''receivables.post''));');
  if v_new = v_def then
    raise exception 'dashboard_position() is not the expected version; apply the earlier migrations first';
  end if;
  execute v_new;
end;
$$;

-- ===========================================================================
-- 13. Privileges
-- ===========================================================================
revoke execute on function
  private.invoice_settlements(), private.sees_settlements(), private.is_order_taker_photo(text), private.collector_held(uuid), private.assign_note_no(), private.release_order_stock(uuid), private.refresh_sales_order(uuid),
  private.value_return_line(), private.post_customer_return(uuid), private.refresh_order_of_invoice(), private.allocate_customer_payment(uuid, uuid, numeric),
  private.post_customer_payment(uuid), private.post_cash_deposit(uuid), private.sales_scope(), private.sees_customer(uuid),
  private.driver_sees_order(uuid), private.driver_sees_customer(uuid), private.can_edit_order(uuid)
from public, anon, authenticated;
-- Used inside row level security policies and security_invoker views.
grant execute on function
  private.invoice_settlements(), private.sees_settlements(), private.is_order_taker_photo(text), private.driver_sees_order(uuid), private.driver_sees_customer(uuid), private.can_edit_order(uuid)
to authenticated;

revoke execute on function
  public.list_order_takers(), public.list_drivers(), public.save_order_taker(uuid, jsonb), public.record_customer_note(jsonb), public.void_customer_note(uuid, text),
  public.save_customer(uuid, jsonb), public.save_sales_order(uuid, jsonb, jsonb), public.send_back_sales_order(uuid, text), public.start_picking(uuid),
  public.cancel_sales_order(uuid, text), public.close_sales_order(uuid, text), public.save_customer_return(uuid, jsonb, jsonb), public.complete_delivery(uuid, jsonb, jsonb),
  public.record_customer_payment(jsonb, jsonb), public.settle_invoices(uuid, jsonb), public.record_cash_deposit(jsonb), public.post_cash_deposit(uuid), public.void_cash_deposit(uuid, text),
  public.reconcile_collector_cash(uuid, numeric, text), public.collector_cash(), public.collector_statement(uuid, date, date), public.customer_statement(uuid, date, date),
  public.customer_summary(uuid), public.report_sales(date, date, text), public.report_sales_by_customer(date, date, uuid), public.report_sales_by_product(date, date, uuid),
  public.report_order_takers(date, date), public.report_receivables(date, uuid), public.report_deliveries(date, date, text),
  public.report_collections(date, date, uuid, text), public.sales_summary()
from public, anon;
grant execute on function
  public.list_order_takers(), public.list_drivers(), public.save_order_taker(uuid, jsonb), public.record_customer_note(jsonb), public.void_customer_note(uuid, text),
  public.save_customer(uuid, jsonb), public.save_sales_order(uuid, jsonb, jsonb), public.send_back_sales_order(uuid, text), public.start_picking(uuid),
  public.cancel_sales_order(uuid, text), public.close_sales_order(uuid, text), public.save_customer_return(uuid, jsonb, jsonb), public.complete_delivery(uuid, jsonb, jsonb),
  public.record_customer_payment(jsonb, jsonb), public.settle_invoices(uuid, jsonb), public.record_cash_deposit(jsonb), public.post_cash_deposit(uuid), public.void_cash_deposit(uuid, text),
  public.reconcile_collector_cash(uuid, numeric, text), public.collector_cash(), public.collector_statement(uuid, date, date), public.customer_statement(uuid, date, date),
  public.customer_summary(uuid), public.report_sales(date, date, text), public.report_sales_by_customer(date, date, uuid), public.report_sales_by_product(date, date, uuid),
  public.report_order_takers(date, date), public.report_receivables(date, uuid), public.report_deliveries(date, date, text),
  public.report_collections(date, date, uuid, text), public.sales_summary()
to authenticated;

create index sales_orders_open_idx on public.sales_orders (customer_id) where status in ('submitted', 'approved', 'partially_dispatched', 'dispatched');
