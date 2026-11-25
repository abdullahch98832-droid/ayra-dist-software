-- Suppliers are our own staff who take the goods to the shops: each delivery names its supplier, the shop's receipt and the money received.
-- Extra payments to the Ayra company: own names, date and time, amounts that can be corrected. External companies are vendors.

insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261202100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

-- ===========================================================================
-- 1. Wording: companies goods are bought from are vendors
-- ===========================================================================
update public.chart_of_accounts set name_en = 'Payable — Vendors', name_ur = 'واجب الادا — وینڈرز' where system_key = 'AP_SUPPLIERS' and name_en = 'Payable — Suppliers';
update public.permissions set description_en = replace(replace(description_en, 'supplier', 'vendor'), 'Supplier', 'Vendor'), description_ur = replace(description_ur, 'سپلائر', 'وینڈر')
 where description_en ilike '%supplier%' or description_ur like '%سپلائر%';

-- ===========================================================================
-- 2. Suppliers: staff who supply the shops
-- ===========================================================================
-- Order takers and suppliers are the same kind of people for cash: what they collect is held in their name until it is handed over.
alter table public.order_takers
  add column takes_orders boolean not null default true,
  add column is_supplier boolean not null default false,
  add column supplier_active boolean not null default true,
  add column supplier_notes text,
  add constraint order_takers_role check (takes_orders or is_supplier);
select private.restrict_columns('order_takers', array['created_at', 'created_by', 'updated_at', 'updated_by']);

alter table public.deliveries add column supplied_by uuid references public.order_takers (employee_id);
create index deliveries_supplied_by_idx on public.deliveries (supplied_by, delivery_date) where supplied_by is not null;
select private.restrict_columns('deliveries', array[
  'doc_no', 'status', 'created_at', 'created_by', 'updated_at', 'updated_by', 'sales_invoice_id', 'dispatched_at', 'dispatched_by',
  'delivered_at', 'delivered_by', 'received_by', 'delivery_note']);
alter table public.customer_payments add column delivery_id uuid references public.deliveries (id);
create index customer_payments_delivery_idx on public.customer_payments (delivery_id) where delivery_id is not null;
select private.restrict_columns('customer_payments', array[
  'doc_no', 'status', 'journal_entry_id', 'posted_at', 'posted_by', 'created_at', 'created_by', 'updated_at', 'updated_by',
  'requested_allocations', 'void_reason', 'sol_job_id', 'delivery_id']);

create function private.guard_supplied_by() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.supplied_by is not null and (tg_op = 'INSERT' or new.supplied_by is distinct from old.supplied_by)
     and not exists (select 1 from public.order_takers where employee_id = new.supplied_by and is_supplier and supplier_active) then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
create trigger guard_supplied_by before insert or update of supplied_by on public.deliveries for each row execute function private.guard_supplied_by();

-- Names and contacts of suppliers, without the confidential employee record.
create function public.list_supply_staff()
returns table (employee_id uuid, code text, full_name text, full_name_ur text, phone text, whatsapp text, photo_path text, employment_status public.employment_status, is_active boolean, notes text, open_deliveries bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not (private.has_permission('sales.team') or private.has_permission('sales.view') or private.has_permission('sales.dispatch') or private.has_permission('receivables.collect')) then
    perform private.require_permission('sales.view');
  end if;
  return query
  select e.id, e.employee_code, e.full_name, e.full_name_ur, e.phone, e.whatsapp, e.photo_path, e.status, ot.supplier_active and e.status::text <> 'terminated', ot.supplier_notes,
         (select count(*) from public.deliveries d where d.supplied_by = e.id and d.status::text = 'dispatched')
    from public.order_takers ot join public.employees e on e.id = ot.employee_id
   where ot.is_supplier
   order by e.full_name;
end;
$$;

create function public.save_supply_staff(p_employee_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_employee_id;
begin
  perform private.require_permission('sales.team');
  if v_id is null or p_doc ? 'full_name' then
    perform private.require_permission('employees.manage');
    if coalesce(trim(p_doc ->> 'full_name'), '') = '' then raise exception 'A name is required' using errcode = '22023'; end if;
  end if;
  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.employees (id, employee_code, full_name, full_name_ur, phone, whatsapp, job_title, status)
    values (v_id, '', trim(p_doc ->> 'full_name'), p_doc ->> 'full_name_ur', p_doc ->> 'phone', p_doc ->> 'whatsapp', 'Supplier', coalesce((p_doc ->> 'status')::public.employment_status, 'active'));
  elsif p_doc ? 'full_name' then
    update public.employees set full_name = trim(p_doc ->> 'full_name'), full_name_ur = p_doc ->> 'full_name_ur', phone = p_doc ->> 'phone', whatsapp = p_doc ->> 'whatsapp',
           status = coalesce((p_doc ->> 'status')::public.employment_status, status)
     where id = v_id;
    if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  elsif not exists (select 1 from public.employees where id = v_id) then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  insert into public.order_takers (employee_id, takes_orders, is_supplier, supplier_active, supplier_notes)
  values (v_id, false, true, coalesce((p_doc ->> 'is_active')::boolean, true), nullif(trim(p_doc ->> 'notes'), ''))
  on conflict (employee_id) do update set is_supplier = true, supplier_active = excluded.supplier_active, supplier_notes = excluded.supplier_notes;
  return v_id;
end;
$$;

-- A supplier sees the deliveries assigned to them, with their orders and shops.
create or replace function private.driver_sees_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deliveries d
                  where d.sales_order_id = p_order_id and (d.driver_id = private.current_driver_id() or d.supplied_by = private.current_employee_id()) and d.status::text <> 'cancelled');
$$;
create or replace function private.driver_sees_customer(p_customer_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.deliveries d
                   join public.sales_orders o on o.id = d.sales_order_id
                  where o.customer_id = p_customer_id and (d.driver_id = private.current_driver_id() or d.supplied_by = private.current_employee_id()) and d.status::text <> 'cancelled');
$$;
create function private.is_supplier() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.order_takers where employee_id = private.current_employee_id() and is_supplier and supplier_active);
$$;
drop policy "select" on public.customers;
create policy "select" on public.customers for select to authenticated using (
  ((select private.has_permission('customers.view'))
   and ((select private.has_permission('sales.view_all')) or (select private.has_permission('customers.manage'))
        or order_taker_id = (select private.current_employee_id())))
  or (((select private.current_driver_id()) is not null or (select private.is_supplier())) and private.driver_sees_customer(id))
  or (is_sol_client and (select private.has_permission('sol.view'))
      and ((select private.has_permission('sol.view_all')) or private.sees_sol_client(id))));
drop policy "select" on public.sales_orders;
create policy "select" on public.sales_orders for select to authenticated using (
  (select private.has_permission('sales.view_all'))
  or ((select private.has_permission('sales.view')) and order_taker_id = (select private.current_employee_id()))
  or (((select private.current_driver_id()) is not null or (select private.is_supplier())) and private.driver_sees_order(id)));
drop policy "select" on public.deliveries;
create policy "select" on public.deliveries for select to authenticated using (
  (select private.has_permission('sales.view_all'))
  or driver_id = (select private.current_driver_id())
  or ((select private.is_supplier()) and supplied_by = (select private.current_employee_id()))
  or ((select private.has_permission('sales.view'))
      and exists (select 1 from public.sales_orders h where h.id = sales_order_id and h.order_taker_id = (select private.current_employee_id()))));

-- What the shop has to pay for a delivery and what was received with it, for those who hand it over or see payments.
create function public.delivery_money(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.deliveries%rowtype;
begin
  select * into v from public.deliveries where id = p_id;
  if v.id is null or not (coalesce(v.supplied_by = private.current_employee_id(), false) or (private.sees_settlements() and private.has_permission('sales.view_all'))) then
    perform private.require_permission('receivables.view');
  end if;
  if v.sales_invoice_id is null then return null; end if;
  return (select jsonb_build_object('total', private.money_text(i.total_amount), 'outstanding', private.money_text(private.sales_invoice_outstanding(i.id)),
            'received', private.money_text(coalesce((select sum(p.amount) from public.customer_payments p where p.delivery_id = p_id and p.status = 'posted'), 0)),
            'waiting', private.money_text(coalesce((select sum(p.amount) from public.customer_payments p where p.delivery_id = p_id and p.status = 'draft'), 0)),
            'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'number', p.doc_no, 'date', p.payment_date, 'amount', private.money_text(p.amount), 'method', p.method, 'status', p.status,
                           'held', p.financial_account_id is null) order by p.created_at), '[]') from public.customer_payments p where p.delivery_id = p_id))
            from public.sales_invoices i where i.id = v.sales_invoice_id);
end;
$$;

-- The office may change the supplier until the goods have arrived.
create function public.assign_supplier(p_delivery_id uuid, p_employee_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('sales.dispatch');
  update public.deliveries set supplied_by = p_employee_id where id = p_delivery_id and status::text in ('draft', 'dispatched');
  if not found then raise exception 'Only deliveries on the way can change their supplier' using errcode = '23514'; end if;
  return p_delivery_id;
end;
$$;

-- Every delivery to a shop: who took the order, who supplied it, who received it, and the money.
create function public.report_supply(p_from date, p_to date, p_supplier_id uuid default null)
returns table (delivery_id uuid, doc_no text, delivery_date date, status public.delivery_status, supplier_id uuid, supplier_en text, supplier_ur text, taker_en text, taker_ur text, customer_id uuid, customer text, customer_ur text, city text,
               delivered_at timestamptz, received_by text, invoice_no text, amount numeric, money_received numeric, outstanding numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_own uuid := private.sales_scope();
  v_paid constant boolean := private.sees_settlements();
begin
  return query
  select d.id, d.doc_no, d.delivery_date, d.status, s.id, s.full_name, s.full_name_ur, te.full_name, te.full_name_ur, c.id, c.name, c.name_ur, c.city, d.delivered_at, d.received_by, i.doc_no,
         i.total_amount - coalesce((select sum(r.total_amount) from public.customer_returns r where r.delivery_id = d.id and r.status = 'posted'), 0),
         case when v_paid then coalesce((select sum(p.amount) from public.customer_payments p where p.delivery_id = d.id and p.status = 'posted'), 0) end,
         case when v_paid and i.id is not null then private.sales_invoice_outstanding(i.id) end
    from public.deliveries d
    join public.sales_orders o on o.id = d.sales_order_id
    join public.customers c on c.id = o.customer_id
    left join public.employees s on s.id = d.supplied_by
    left join public.employees te on te.id = o.order_taker_id
    left join public.sales_invoices i on i.id = d.sales_invoice_id
   where d.delivery_date between p_from and p_to and d.status::text in ('dispatched', 'delivered') and (p_supplier_id is null or d.supplied_by = p_supplier_id)
     and (v_own is null or o.order_taker_id = v_own)
   order by d.delivery_date desc, d.doc_no desc;
end;
$$;

-- What each supplier did in a period, and the cash they hold now.
create function public.report_suppliers_work(p_from date, p_to date)
returns table (employee_id uuid, code text, full_name text, full_name_ur text, is_active boolean, deliveries bigint, delivered bigint, on_the_way bigint, shops bigint, amount numeric, money_received numeric, cash_held numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_cash constant boolean := private.has_permission('receivables.post') or private.has_permission('receivables.view');
begin
  if not private.has_permission('sales.view_all') then perform private.require_permission('sales.team'); end if;
  return query
  select ot.employee_id, e.employee_code, e.full_name, e.full_name_ur, ot.supplier_active and e.status::text <> 'terminated',
         count(r.delivery_id), count(r.delivery_id) filter (where r.status::text = 'delivered'), count(r.delivery_id) filter (where r.status::text = 'dispatched'),
         count(distinct r.customer_id) filter (where r.status::text = 'delivered'), coalesce(sum(r.amount) filter (where r.status::text = 'delivered'), 0), case when v_cash then coalesce(sum(r.money_received), 0) end,
         case when v_cash then private.collector_held(ot.employee_id) end
    from public.order_takers ot
    join public.employees e on e.id = ot.employee_id
    left join lateral (
      select d.id as delivery_id, d.status, o.customer_id,
             i.total_amount - coalesce((select sum(x.total_amount) from public.customer_returns x where x.delivery_id = d.id and x.status = 'posted'), 0) as amount,
             (select sum(p.amount) from public.customer_payments p where p.delivery_id = d.id and p.status = 'posted') as money_received
        from public.deliveries d join public.sales_orders o on o.id = d.sales_order_id left join public.sales_invoices i on i.id = d.sales_invoice_id
       where d.supplied_by = ot.employee_id and d.delivery_date between p_from and p_to and d.status::text in ('dispatched', 'delivered')) r on true
   where ot.is_supplier
   group by ot.employee_id, e.id
   order by e.full_name;
end;
$$;

-- A role for suppliers who sign in: their own deliveries, and the cash they receive.
insert into public.roles (code, name_en, name_ur, description, is_system) values ('supplier', 'Supplier', 'سپلائر', 'Assigned deliveries and the money received with them', false) on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r join public.permissions p on p.code in ('dashboard.view', 'sales.view', 'receivables.collect') where r.code = 'supplier'
on conflict do nothing;

-- ===========================================================================
-- 3. Extra payments to the Ayra company
-- ===========================================================================
insert into public.chart_of_accounts (code, name_en, name_ur, account_type, is_postable, system_key, parent_id)
select (select g::text from generate_series(6960, 6999) g where not exists (select 1 from public.chart_of_accounts c where c.code = g::text) order by g limit 1), 'Extra Payments to Ayra', 'آئرا کو اضافی ادائیگیاں', 'expense', true, 'AYRA_EXTRA', id from public.chart_of_accounts where code = '6000';
insert into public.document_sequences (doc_type, prefix, padding, description) values ('AXP', 'AXP-', 6, 'Extra payment to the Ayra company');
create table public.company_extra_payments (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  -- What the payment is for, or who received it, in the owner's words.
  name text not null check (trim(name) <> ''),
  paid_at timestamptz not null,
  amount numeric(18,2) not null check (amount > 0),
  -- extra: a cost beside the goods; account: part of what is owed for goods.
  kind text not null check (kind in ('extra', 'account')),
  financial_account_id uuid not null references public.financial_accounts (id),
  method public.payment_method not null default 'cash',
  reference text,
  notes text,
  status text not null default 'posted' check (status in ('posted', 'void')),
  void_reason text,
  journal_entry_id uuid references public.journal_entries (id),
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index company_extra_payments_date_idx on public.company_extra_payments (paid_at);
create trigger company_extra_payments_doc_no before insert on public.company_extra_payments for each row execute function private.assign_doc_no('AXP');
select private.apply_policies('company_extra_payments', private.p('company.view'), null, null, null);
revoke all on public.company_extra_payments from anon, authenticated;
grant select on public.company_extra_payments to authenticated;
create trigger touch_updated before update on public.company_extra_payments for each row execute function private.touch_updated();
create trigger audit after insert or update or delete on public.company_extra_payments for each row execute function private.audit_row();

create function private.post_company_extra(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.company_extra_payments%rowtype;
begin
  select * into v from public.company_extra_payments where id = p_id;
  return private.post_journal((v.paid_at at time zone 'Asia/Karachi')::date, 'Extra payment to Ayra ' || v.doc_no || ': ' || v.name, 'company_extra', v.id, jsonb_build_array(
    case when v.kind = 'extra' then jsonb_build_object('account', 'AYRA_EXTRA', 'debit', v.amount)
         else jsonb_build_object('account', 'AP_PRINCIPAL', 'debit', v.amount, 'supplier_id', (select id from public.suppliers where is_principal limit 1)) end,
    jsonb_build_object('account_id', private.financial_gl(v.financial_account_id), 'credit', v.amount)));
end;
$$;

-- Records a payment, or corrects one: the old entry is reversed on its date and the corrected one is posted.
create function public.save_company_extra_payment(p_id uuid, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.company_extra_payments%rowtype;
  v_new public.company_extra_payments%rowtype;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_paid timestamptz := (p_doc ->> 'paid_at')::timestamptz;
  v_id uuid := p_id;
begin
  perform private.require_permission('company.pay');
  if v_id is null and v_request is not null then
    select id into v_id from public.company_extra_payments where client_request_id = v_request and created_by = auth.uid();
    if v_id is not null then return v_id; end if;
  end if;
  if v_paid is null or (v_paid at time zone 'Asia/Karachi')::date > private.business_today() then raise exception 'The date cannot be in the future' using errcode = '22023'; end if;
  if coalesce(trim(p_doc ->> 'name'), '') = '' then raise exception 'A name is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.financial_accounts where id = (p_doc ->> 'financial_account_id')::uuid) then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if v_id is null then
    insert into public.company_extra_payments (name, paid_at, amount, kind, financial_account_id, method, reference, notes, client_request_id)
    values (trim(p_doc ->> 'name'), v_paid, (p_doc ->> 'amount')::numeric, coalesce(p_doc ->> 'kind', 'extra'), (p_doc ->> 'financial_account_id')::uuid, coalesce(p_doc ->> 'method', 'cash')::public.payment_method,
            nullif(trim(p_doc ->> 'reference'), ''), nullif(trim(p_doc ->> 'notes'), ''), v_request)
    returning id into v_id;
    update public.company_extra_payments set journal_entry_id = private.post_company_extra(v_id) where id = v_id;
    return v_id;
  end if;
  select * into v_old from public.company_extra_payments where id = v_id for update;
  if v_old.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_old.status <> 'posted' then raise exception 'A voided payment cannot be changed' using errcode = '23514'; end if;
  update public.company_extra_payments
     set name = trim(p_doc ->> 'name'), paid_at = v_paid, amount = (p_doc ->> 'amount')::numeric, kind = coalesce(p_doc ->> 'kind', kind), financial_account_id = (p_doc ->> 'financial_account_id')::uuid,
         method = coalesce(p_doc ->> 'method', method::text)::public.payment_method, reference = nullif(trim(p_doc ->> 'reference'), ''), notes = nullif(trim(p_doc ->> 'notes'), '')
   where id = v_id returning * into v_new;
  -- A new name, time of day, method or note does not touch the accounts.
  if (v_new.amount, v_new.kind, v_new.financial_account_id, (v_new.paid_at at time zone 'Asia/Karachi')::date) is distinct from (v_old.amount, v_old.kind, v_old.financial_account_id, (v_old.paid_at at time zone 'Asia/Karachi')::date) then
    perform private.reverse_journal(v_old.journal_entry_id, (v_old.paid_at at time zone 'Asia/Karachi')::date, 'Corrected');
    update public.company_extra_payments set journal_entry_id = private.post_company_extra(v_id) where id = v_id;
  end if;
  return v_id;
end;
$$;

create function public.void_company_extra_payment(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.company_extra_payments%rowtype;
begin
  perform private.require_permission('company.pay');
  select * into v from public.company_extra_payments where id = p_id for update;
  if v.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v.status <> 'posted' then raise exception 'Only posted payments can be voided' using errcode = '23514'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required' using errcode = '22023'; end if;
  perform private.reverse_journal(v.journal_entry_id, private.business_today(), trim(p_reason));
  update public.company_extra_payments set status = 'void', void_reason = trim(p_reason) where id = p_id;
  return p_id;
end;
$$;

-- As the ledger has them, one line per payment and day; a payment voided on another day is undone on that day.
create function public.report_company_extra(p_from date, p_to date)
returns table (payment_id uuid, doc_no text, entry_date date, name text, paid_at timestamptz, kind text, account text, method public.payment_method, reference text, notes text, status text, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('company.view');
  return query
  select x.id, x.doc_no, e.entry_date, x.name, x.paid_at, x.kind, fa.name, x.method, x.reference, x.notes, x.status, sum(l.debit - l.credit)
    from public.journal_entries e
    join public.journal_entry_lines l on l.journal_entry_id = e.id
    join public.chart_of_accounts a on a.id = l.account_id and a.system_key in ('AYRA_EXTRA', 'AP_PRINCIPAL')
    join public.company_extra_payments x on x.id = e.source_id
    join public.financial_accounts fa on fa.id = x.financial_account_id
   where e.status = 'posted' and e.source_type = 'company_extra' and e.entry_date between p_from and p_to
   group by x.id, e.entry_date, fa.name having sum(l.debit - l.credit) <> 0
   order by e.entry_date desc, x.paid_at desc, x.doc_no desc;
end;
$$;

-- ===========================================================================
-- 4. Functions that learn about suppliers and extra payments
-- ===========================================================================
create or replace function public.save_delivery(p_order_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  select id into v_id from public.deliveries where client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.deliveries (sales_order_id, vehicle_id, driver_id, supplied_by, delivery_date, notes, client_request_id)
  values (p_order_id, (p_doc ->> 'vehicle_id')::uuid, (p_doc ->> 'driver_id')::uuid, (p_doc ->> 'supplied_by')::uuid, (p_doc ->> 'date')::date, p_doc ->> 'notes', v_request)
  returning id into v_id;
  insert into public.delivery_items (delivery_id, sales_order_item_id, quantity)
  select v_id, l.sales_order_item_id, l.quantity
    from jsonb_to_recordset(p_lines) as l(sales_order_item_id uuid, quantity bigint);
  return v_id;
end;
$$;

create or replace function public.complete_delivery(p_id uuid, p_doc jsonb default '{}'::jsonb, p_returns jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.sales_orders%rowtype;
  v_return uuid;
  v_line record;
  v_damaged uuid;
  v_me constant uuid := private.current_employee_id();
  v_supplier uuid;
  v_amount numeric(18,2) := coalesce((p_doc ->> 'amount')::numeric, 0);
  v_method public.payment_method := coalesce(p_doc ->> 'method', 'cash')::public.payment_method;
  v_account uuid := (p_doc ->> 'financial_account_id')::uuid;
  v_payment uuid;
  v_due numeric(18,2);
begin
  select * into v_delivery from public.deliveries where id = p_id for update;
  -- The assigned supplier or driver may confirm their own delivery.
  if not private.has_permission('sales.dispatch')
     and not coalesce(v_delivery.driver_id = private.current_driver_id(), false) and not coalesce(v_delivery.supplied_by = v_me, false) then
    perform private.require_permission('sales.dispatch');
  end if;
  if v_delivery.id is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if v_delivery.status <> 'dispatched' then raise exception 'Only dispatched deliveries can be confirmed' using errcode = '23514'; end if;
  select * into v_order from public.sales_orders where id = v_delivery.sales_order_id for update;
  -- Whoever hands the goods over may be corrected by the office, not by the supplier.
  v_supplier := case when private.has_permission('sales.dispatch') then coalesce((p_doc ->> 'supplied_by')::uuid, v_delivery.supplied_by) else v_delivery.supplied_by end;
  if v_supplier is not null and v_supplier is distinct from v_delivery.supplied_by
     and not exists (select 1 from public.order_takers where employee_id = v_supplier and is_supplier and supplier_active) then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;
  if v_amount < 0 then raise exception 'The amount cannot be negative' using errcode = '22023'; end if;
  if v_amount > 0 then
    if v_account is null and (v_method <> 'cash' or v_supplier is null) then
      raise exception 'Choose the account that received the payment, or the supplier who holds the cash' using errcode = '22023';
    end if;
    if v_account is not null and not exists (select 1 from public.financial_accounts where id = v_account and is_active) then raise exception 'Account not found' using errcode = 'P0002'; end if;
    -- A supplier keeps what they received in their own name; others need to be allowed to collect.
    if not coalesce(v_supplier = v_me, false) and not private.has_permission('receivables.post') then perform private.require_permission('receivables.collect'); end if;
  end if;

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
         supplied_by = v_supplier, received_by = nullif(trim(p_doc ->> 'received_by'), ''), delivery_note = nullif(trim(p_doc ->> 'notes'), '')
   where id = p_id;
  if v_amount > 0 then
    v_due := private.sales_invoice_outstanding(v_delivery.sales_invoice_id);
    insert into public.customer_payments (customer_id, payment_date, amount, financial_account_id, method, reference, collected_by, delivery_id, requested_allocations)
    values (v_order.customer_id, private.business_today(), v_amount, v_account, v_method, nullif(trim(p_doc ->> 'reference'), ''), v_supplier, p_id,
            case when least(v_amount, v_due) > 0 then jsonb_build_array(jsonb_build_object('invoice_id', v_delivery.sales_invoice_id, 'amount', least(v_amount, v_due))) end)
    returning id into v_payment;
    -- The supplier's own cash, and whatever the office records, is posted at once; the rest waits for the office.
    if private.has_permission('receivables.post') or (v_account is null and v_supplier = v_me) then
      perform private.post_customer_payment(v_payment);
    end if;
  end if;
  perform private.refresh_sales_order(v_order.id);
  return p_id;
end;
$$;

create or replace function public.collector_cash()
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
  select ot.employee_id, e.full_name, e.full_name_ur, (ot.takes_orders and ot.is_active) or (ot.is_supplier and ot.supplier_active), private.collector_held(ot.employee_id),
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

create or replace function public.list_order_takers()
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
   where ot.takes_orders
   order by e.full_name;
end;
$$;

create or replace function public.report_order_takers(p_from date, p_to date)
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
   where ot.takes_orders and (v_own is null or ot.employee_id = v_own)
   order by coalesce(s.net, 0) - coalesce(r.net, 0) - coalesce(cn.net, 0) desc, e.full_name;
end;
$$;

create or replace function public.save_order_taker(p_employee_id uuid, p_doc jsonb) returns uuid
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
    set takes_orders = true, territory = excluded.territory, is_active = excluded.is_active, notes = excluded.notes;
  return v_id;
end;
$$;

create or replace function private.source_number(p_type text, p_id uuid) returns text
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
    when 'company_extra' then (select doc_no from public.company_extra_payments where id = p_id)
    when 'sol_return' then (select doc_no from public.sol_returns where id = p_id)
  end;
$$;

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
       + case when k.principal then coalesce((select sum(x.amount) from public.company_extra_payments x where x.status = 'posted' and x.kind = 'account'), 0) else 0 end
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
       - coalesce((select sum(amount) from public.company_extra_payments where status = 'posted'), 0)
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

create or replace function private.doc_delivery(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'number', d.doc_no, 'date', d.delivery_date, 'status', d.status, 'notes', d.notes, 'received_by', d.received_by, 'delivery_note', d.delivery_note, 'delivered_at', d.delivered_at,
    'order', o.doc_no, 'invoice', (select i.doc_no from public.sales_invoices i where i.id = d.sales_invoice_id),
    'party', private.doc_customer(o.customer_id), 'warehouse', private.doc_warehouse(o.warehouse_id),
    'vehicle', (select concat_ws(' · ', v.registration_no, v.name) from public.vehicles v where v.id = d.vehicle_id), 'driver', private.driver_label(d.driver_id),
    'supplier_man', (select jsonb_build_object('en', e.full_name, 'ur', e.full_name_ur) from public.employees e where e.id = d.supplied_by),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('sku', p.sku, 'en', p.name_en, 'ur', p.name_ur, 'unit', jsonb_build_object('en', u.name_en, 'ur', u.name_ur),
                'quantity', l.quantity, 'returned', l.returned_quantity) order by p.name_en, l.id), '[]')
                from public.delivery_items l join public.sales_order_items s on s.id = l.sales_order_item_id
                left join public.products p on p.id = s.product_id left join public.units u on u.id = s.unit_id where l.delivery_id = d.id))
    from public.deliveries d join public.sales_orders o on o.id = d.sales_order_id where d.id = p_id;
$$;

-- ===========================================================================
-- 5. Privileges
-- ===========================================================================
revoke execute on function private.guard_supplied_by(), private.is_supplier(), private.post_company_extra(uuid) from public, anon, authenticated;
grant execute on function private.is_supplier() to authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['public.list_supply_staff()', 'public.save_supply_staff(uuid, jsonb)', 'public.delivery_money(uuid)', 'public.assign_supplier(uuid, uuid)', 'public.report_supply(date, date, uuid)', 'public.report_suppliers_work(date, date)',
    'public.save_company_extra_payment(uuid, jsonb)', 'public.void_company_extra_payment(uuid, text)', 'public.report_company_extra(date, date)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
