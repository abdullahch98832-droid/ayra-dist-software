-- Sales: orders, reservations, deliveries, invoices, customer payments, returns.

-- Receivable balance of a customer from the general ledger.
create function private.customer_balance(p_customer_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.debit - l.credit), 0)
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
    join public.chart_of_accounts a on a.id = l.account_id and a.system_key = 'AR'
   where l.customer_id = p_customer_id;
$$;

-- ---------------------------------------------------------------------------
-- Sales orders
-- ---------------------------------------------------------------------------
create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  customer_id uuid not null references public.customers (id),
  order_taker_id uuid references public.employees (id),
  warehouse_id uuid not null references public.warehouses (id),
  order_date date not null default current_date,
  required_date date,
  status public.sales_order_status not null default 'draft',
  total_amount numeric(18,2) not null default 0,
  notes text,
  approved_at timestamptz,
  approved_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index sales_orders_customer_idx on public.sales_orders (customer_id, order_date);
create index sales_orders_order_taker_idx on public.sales_orders (order_taker_id, order_date);
create index sales_orders_status_idx on public.sales_orders (status);

create trigger sales_orders_doc_no
  before insert on public.sales_orders
  for each row execute function private.assign_doc_no('SO');

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  unit_id uuid not null references public.units (id),
  factor bigint not null,
  quantity bigint not null check (quantity > 0),
  base_quantity bigint generated always as (quantity * factor) stored,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0),
  line_total numeric(18,2) generated always as (quantity * unit_price - discount_amount) stored,
  reserved_base_quantity bigint not null default 0 check (reserved_base_quantity >= 0),
  dispatched_base_quantity bigint not null default 0 check (dispatched_base_quantity >= 0),
  check (discount_amount <= quantity * unit_price),
  check (dispatched_base_quantity <= quantity * factor)
);
create index sales_order_items_header_idx on public.sales_order_items (sales_order_id);

create trigger sales_order_items_factor
  before insert or update of product_id, unit_id on public.sales_order_items
  for each row execute function private.set_line_factor();
create trigger sales_order_items_total
  after insert or update or delete on public.sales_order_items
  for each row execute function private.recalc_header_total('sales_orders', 'sales_order_id');

-- Exposure = ledger balance + value of approved orders not yet dispatched.
create function private.check_credit_limit(p_customer_id uuid, p_additional numeric, p_override boolean)
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
   where o.customer_id = p_customer_id and o.status in ('approved', 'partially_dispatched');
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

-- Order taker hands a draft over for approval.
create function public.submit_sales_order(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
begin
  perform private.require_permission('sales.create');
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null
     or not (private.has_permission('sales.view_all') or v_doc.order_taker_id = private.current_employee_id()) then
    raise exception 'Sales order not found' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'Only draft orders can be submitted' using errcode = '23514';
  end if;
  if not exists (select 1 from public.sales_order_items where sales_order_id = p_id) then
    raise exception 'Sales order has no lines' using errcode = '23514';
  end if;
  update public.sales_orders set status = 'submitted' where id = p_id;
  return p_id;
end;
$$;

create function public.approve_sales_order(p_id uuid, p_override_credit boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
  v_item record;
  v_reserve boolean;
begin
  perform private.require_permission('sales.approve');
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null then raise exception 'Sales order not found' using errcode = 'P0002'; end if;
  if v_doc.status not in ('draft', 'submitted') then
    raise exception 'Sales order % is %', v_doc.doc_no, v_doc.status using errcode = '23514';
  end if;
  if not exists (select 1 from public.sales_order_items where sales_order_id = p_id) then
    raise exception 'Sales order has no lines' using errcode = '23514';
  end if;
  if not exists (select 1 from public.customers where id = v_doc.customer_id and is_active) then
    raise exception 'Customer is inactive' using errcode = '23514';
  end if;

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

create function public.cancel_sales_order(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_orders%rowtype;
  v_item record;
begin
  perform private.require_permission('sales.approve');
  select * into v_doc from public.sales_orders where id = p_id for update;
  if v_doc.id is null then raise exception 'Sales order not found' using errcode = 'P0002'; end if;
  if v_doc.status in ('dispatched', 'cancelled') then
    raise exception 'Sales order % is %', v_doc.doc_no, v_doc.status using errcode = '23514';
  end if;
  if exists (select 1 from public.deliveries where sales_order_id = p_id and status = 'draft') then
    raise exception 'Delete draft deliveries of this order first' using errcode = '23514';
  end if;

  for v_item in
    select id, product_id, reserved_base_quantity from public.sales_order_items
     where sales_order_id = p_id and reserved_base_quantity > 0 order by product_id, id
  loop
    perform private.release_stock(v_item.product_id, v_doc.warehouse_id, v_item.reserved_base_quantity);
    update public.sales_order_items set reserved_base_quantity = 0 where id = v_item.id;
  end loop;

  update public.sales_orders set status = 'cancelled' where id = p_id;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sales invoices. Created by dispatching a delivery, or directly (counter sales,
-- vehicle/route sales). Posting removes stock at average cost and books revenue.
-- ---------------------------------------------------------------------------
create table public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  customer_id uuid not null references public.customers (id),
  warehouse_id uuid not null references public.warehouses (id),
  invoice_date date not null default current_date,
  due_date date,
  sales_order_id uuid references public.sales_orders (id),
  order_taker_id uuid references public.employees (id),
  status public.document_status not null default 'draft',
  subtotal numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  cost_total numeric(18,2),
  notes text,
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (due_date is null or due_date >= invoice_date)
);
create index sales_invoices_customer_idx on public.sales_invoices (customer_id, invoice_date);
create index sales_invoices_order_taker_idx on public.sales_invoices (order_taker_id, invoice_date);
create index sales_invoices_order_idx on public.sales_invoices (sales_order_id);

create trigger sales_invoices_doc_no
  before insert on public.sales_invoices
  for each row execute function private.assign_doc_no('INV');

create table public.sales_invoice_items (
  id uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.sales_invoices (id) on delete cascade,
  sales_order_item_id uuid references public.sales_order_items (id),
  product_id uuid not null references public.products (id),
  unit_id uuid not null references public.units (id),
  factor bigint not null,
  quantity bigint not null check (quantity > 0),
  base_quantity bigint generated always as (quantity * factor) stored,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_net numeric(18,2) generated always as (quantity * unit_price - discount_amount) stored,
  tax_amount numeric(18,2) generated always as
    (round((quantity * unit_price - discount_amount) * tax_rate / 100, 2)) stored,
  line_total numeric(18,2) generated always as
    (quantity * unit_price - discount_amount + round((quantity * unit_price - discount_amount) * tax_rate / 100, 2)) stored,
  cost_amount numeric(18,2),
  check (discount_amount <= quantity * unit_price)
);
create index sales_invoice_items_header_idx on public.sales_invoice_items (sales_invoice_id);
create index sales_invoice_items_order_item_idx on public.sales_invoice_items (sales_order_item_id);

create trigger sales_invoice_items_factor
  before insert or update of product_id, unit_id on public.sales_invoice_items
  for each row execute function private.set_line_factor();

-- Tax rate is always taken from the product, so clients cannot change it.
create function private.set_line_tax_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select tax_rate into new.tax_rate from public.products where id = new.product_id;
  return new;
end;
$$;

create trigger sales_invoice_items_tax
  before insert or update of product_id, tax_rate on public.sales_invoice_items
  for each row execute function private.set_line_tax_rate();

create function private.recalc_invoice_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_header_id uuid;
begin
  v_header_id := coalesce(to_jsonb(new) ->> tg_argv[1], to_jsonb(old) ->> tg_argv[1])::uuid;
  execute format(
    'update public.%I h set subtotal = t.net, tax_total = t.tax, total_amount = t.total
       from (select coalesce(sum(line_net), 0) net, coalesce(sum(tax_amount), 0) tax, coalesce(sum(line_total), 0) total
               from public.%I where %I = $1) t
      where h.id = $1', tg_argv[0], tg_table_name, tg_argv[1])
  using v_header_id;
  return null;
end;
$$;

create trigger sales_invoice_items_total
  after insert or update or delete on public.sales_invoice_items
  for each row execute function private.recalc_invoice_totals('sales_invoices', 'sales_invoice_id');

create function private.post_sales_invoice(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_invoices%rowtype;
  v_item record;
  v_cost numeric(18,2);
  v_cost_total numeric(18,2) := 0;
  v_je uuid;
begin
  select * into v_doc from public.sales_invoices where id = p_id for update;
  if v_doc.id is null then raise exception 'Sales invoice not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Sales invoice % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.sales_invoice_items where sales_invoice_id = p_id) then
    raise exception 'Sales invoice has no lines' using errcode = '23514';
  end if;

  for v_item in
    select * from public.sales_invoice_items where sales_invoice_id = p_id order by product_id, id
  loop
    v_cost := -private.move_stock(v_item.product_id, v_doc.warehouse_id, -v_item.base_quantity, 'sale',
      v_doc.invoice_date, 'sales_invoice', v_doc.id, v_item.id);
    update public.sales_invoice_items set cost_amount = v_cost where id = v_item.id;
    v_cost_total := v_cost_total + v_cost;
  end loop;

  if v_doc.total_amount > 0 or v_cost_total > 0 then
    v_je := private.post_journal(v_doc.invoice_date, 'Sales invoice ' || v_doc.doc_no, 'sales_invoice', v_doc.id,
      jsonb_build_array(
        jsonb_build_object('account', 'AR', 'debit', v_doc.total_amount, 'customer_id', v_doc.customer_id),
        jsonb_build_object('account', 'SALES', 'credit', v_doc.subtotal, 'customer_id', v_doc.customer_id),
        jsonb_build_object('account', 'TAX_OUTPUT', 'credit', v_doc.tax_total),
        jsonb_build_object('account', 'COGS', 'debit', v_cost_total),
        jsonb_build_object('account', 'INVENTORY', 'credit', v_cost_total)));
  end if;

  update public.sales_invoices
     set status = 'posted', cost_total = v_cost_total, journal_entry_id = v_je,
         posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return p_id;
end;
$$;

-- RPC for direct invoices (not created from a sales order).
create function public.post_sales_invoice(p_id uuid, p_override_credit boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.sales_invoices%rowtype;
begin
  perform private.require_permission('sales.invoice');
  select * into v_doc from public.sales_invoices where id = p_id for update;
  if v_doc.id is null then raise exception 'Sales invoice not found' using errcode = 'P0002'; end if;
  if v_doc.sales_order_id is not null then
    raise exception 'Invoices for sales orders are posted by dispatching a delivery' using errcode = '23514';
  end if;
  if not exists (select 1 from public.customers where id = v_doc.customer_id and is_active) then
    raise exception 'Customer is inactive' using errcode = '23514';
  end if;
  perform private.check_credit_limit(v_doc.customer_id, v_doc.total_amount, p_override_credit);
  return private.post_sales_invoice(p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Deliveries. Dispatching creates and posts the sales invoice for the
-- dispatched quantities and converts the reservation into a stock issue.
-- ---------------------------------------------------------------------------
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  sales_order_id uuid not null references public.sales_orders (id),
  vehicle_id uuid references public.vehicles (id),
  driver_id uuid references public.drivers (id),
  delivery_date date not null default current_date,
  status public.delivery_status not null default 'draft',
  sales_invoice_id uuid unique references public.sales_invoices (id),
  notes text,
  dispatched_at timestamptz,
  dispatched_by uuid,
  delivered_at timestamptz,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index deliveries_order_idx on public.deliveries (sales_order_id);
create index deliveries_driver_idx on public.deliveries (driver_id, delivery_date);

create trigger deliveries_doc_no
  before insert on public.deliveries
  for each row execute function private.assign_doc_no('DLV');

create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items (id),
  -- In the unit of the sales order line.
  quantity bigint not null check (quantity > 0),
  unique (delivery_id, sales_order_item_id)
);

create function public.dispatch_delivery(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.sales_orders%rowtype;
  v_line record;
  v_base bigint;
  v_release bigint;
  v_discount numeric(18,2);
  v_invoice_id uuid;
begin
  perform private.require_permission('sales.dispatch');
  select * into v_delivery from public.deliveries where id = p_id for update;
  if v_delivery.id is null then raise exception 'Delivery not found' using errcode = 'P0002'; end if;
  if v_delivery.status <> 'draft' then raise exception 'Delivery % is already %', v_delivery.doc_no, v_delivery.status using errcode = '23514'; end if;

  select * into v_order from public.sales_orders where id = v_delivery.sales_order_id for update;
  if v_order.status not in ('approved', 'partially_dispatched') then
    raise exception 'Sales order % is not approved for dispatch', v_order.doc_no using errcode = '23514';
  end if;
  if not exists (select 1 from public.delivery_items where delivery_id = p_id) then
    raise exception 'Delivery has no lines' using errcode = '23514';
  end if;
  if exists (select 1 from public.delivery_items di
               left join public.sales_order_items soi on soi.id = di.sales_order_item_id and soi.sales_order_id = v_order.id
              where di.delivery_id = p_id and soi.id is null) then
    raise exception 'Delivery lines must belong to the delivery''s sales order' using errcode = '23514';
  end if;

  insert into public.sales_invoices (customer_id, warehouse_id, invoice_date, sales_order_id, order_taker_id)
  values (v_order.customer_id, v_order.warehouse_id, v_delivery.delivery_date, v_order.id, v_order.order_taker_id)
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

  update public.sales_orders so
     set status = case
       when not exists (select 1 from public.sales_order_items i
                         where i.sales_order_id = so.id and i.dispatched_base_quantity < i.base_quantity)
       then 'dispatched' else 'partially_dispatched' end::public.sales_order_status
   where so.id = v_order.id;

  update public.deliveries
     set status = 'dispatched', sales_invoice_id = v_invoice_id, dispatched_at = now(), dispatched_by = auth.uid()
   where id = p_id;
  return v_invoice_id;
end;
$$;

create function public.confirm_delivery(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('sales.dispatch');
  update public.deliveries set status = 'delivered', delivered_at = now()
   where id = p_id and status = 'dispatched';
  if not found then
    raise exception 'Only dispatched deliveries can be confirmed' using errcode = '23514';
  end if;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer returns (credit notes)
-- ---------------------------------------------------------------------------
create table public.customer_returns (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  customer_id uuid not null references public.customers (id),
  sales_invoice_id uuid references public.sales_invoices (id),
  warehouse_id uuid not null references public.warehouses (id),
  damaged_warehouse_id uuid references public.warehouses (id),
  return_date date not null default current_date,
  reason text,
  status public.document_status not null default 'draft',
  subtotal numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  total_amount numeric(18,2) not null default 0,
  cost_total numeric(18,2),
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index customer_returns_customer_idx on public.customer_returns (customer_id, return_date);
create index customer_returns_invoice_idx on public.customer_returns (sales_invoice_id);

create trigger customer_returns_doc_no
  before insert on public.customer_returns
  for each row execute function private.assign_doc_no('CRET');

create table public.customer_return_items (
  id uuid primary key default gen_random_uuid(),
  customer_return_id uuid not null references public.customer_returns (id) on delete cascade,
  sales_invoice_item_id uuid references public.sales_invoice_items (id),
  product_id uuid not null references public.products (id),
  unit_id uuid not null references public.units (id),
  factor bigint not null,
  quantity bigint not null check (quantity > 0),
  base_quantity bigint generated always as (quantity * factor) stored,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_net numeric(18,2) generated always as (quantity * unit_price) stored,
  tax_amount numeric(18,2) generated always as (round(quantity * unit_price * tax_rate / 100, 2)) stored,
  line_total numeric(18,2) generated always as (quantity * unit_price + round(quantity * unit_price * tax_rate / 100, 2)) stored,
  condition public.item_condition not null default 'saleable',
  cost_amount numeric(18,2)
);
create index customer_return_items_header_idx on public.customer_return_items (customer_return_id);

create trigger customer_return_items_factor
  before insert or update of product_id, unit_id on public.customer_return_items
  for each row execute function private.set_line_factor();
create trigger customer_return_items_tax
  before insert or update of product_id, tax_rate on public.customer_return_items
  for each row execute function private.set_line_tax_rate();
create trigger customer_return_items_total
  after insert or update or delete on public.customer_return_items
  for each row execute function private.recalc_invoice_totals('customer_returns', 'customer_return_id');

create function public.post_customer_return(p_id uuid) returns uuid
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
  perform private.require_permission('sales.return');
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
      select coalesce(sum(ri.base_quantity), 0) into v_already
        from public.customer_return_items ri
        join public.customer_returns r on r.id = ri.customer_return_id and r.status = 'posted'
       where ri.sales_invoice_item_id = v_inv_item.id;
      if v_already + v_item.base_quantity > v_inv_item.base_quantity then
        raise exception 'Returned quantity exceeds the invoiced quantity' using errcode = '23514';
      end if;
      -- Return at the cost recorded when the goods were sold.
      v_value := round(v_inv_item.cost_amount * v_item.base_quantity / v_inv_item.base_quantity, 2);
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

-- ---------------------------------------------------------------------------
-- Customer payments (collections) and allocation to invoices.
-- ---------------------------------------------------------------------------
create table public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  customer_id uuid not null references public.customers (id),
  payment_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  financial_account_id uuid not null references public.financial_accounts (id),
  method public.payment_method not null,
  reference text,
  collected_by uuid references public.employees (id),
  notes text,
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
create index customer_payments_customer_idx on public.customer_payments (customer_id, payment_date);
create index customer_payments_collector_idx on public.customer_payments (collected_by, payment_date);

create trigger customer_payments_doc_no
  before insert on public.customer_payments
  for each row execute function private.assign_doc_no('RCPT');

create table public.customer_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  customer_payment_id uuid not null references public.customer_payments (id) on delete cascade,
  sales_invoice_id uuid references public.sales_invoices (id),
  amount numeric(18,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (customer_payment_id, sales_invoice_id)
);
create index customer_payment_allocations_invoice_idx on public.customer_payment_allocations (sales_invoice_id);

create function public.post_customer_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.customer_payments%rowtype;
  v_je uuid;
begin
  perform private.require_permission('receivables.post');
  select * into v_doc from public.customer_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Payment % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  v_je := private.post_journal(v_doc.payment_date, 'Customer payment ' || v_doc.doc_no, 'customer_payment', v_doc.id,
    jsonb_build_array(
      jsonb_build_object('account_id', private.financial_gl(v_doc.financial_account_id), 'debit', v_doc.amount),
      jsonb_build_object('account', 'AR', 'credit', v_doc.amount, 'customer_id', v_doc.customer_id)));

  update public.customer_payments
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

-- Outstanding = invoice total - allocations - posted returns against it.
create function private.sales_invoice_outstanding(p_invoice_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select i.total_amount
       - coalesce((select sum(a.amount) from public.customer_payment_allocations a where a.sales_invoice_id = i.id), 0)
       - coalesce((select sum(r.total_amount) from public.customer_returns r
                    where r.sales_invoice_id = i.id and r.status = 'posted'), 0)
    from public.sales_invoices i where i.id = p_invoice_id;
$$;

create function private.payment_unallocated(p_payment_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select p.amount - coalesce((select sum(a.amount) from public.customer_payment_allocations a
                               where a.customer_payment_id = p.id), 0)
    from public.customer_payments p where p.id = p_payment_id;
$$;

create function public.allocate_customer_payment(p_payment_id uuid, p_invoice_id uuid, p_amount numeric)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.customer_payments%rowtype;
  v_invoice public.sales_invoices%rowtype;
  v_id uuid;
begin
  perform private.require_permission('receivables.post');
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

create function public.void_customer_payment(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.customer_payments%rowtype;
  v_rev uuid;
begin
  perform private.require_permission('receivables.post');
  select * into v_doc from public.customer_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted payments can be voided' using errcode = '23514'; end if;
  delete from public.customer_payment_allocations where customer_payment_id = p_id;
  v_rev := private.reverse_journal(v_doc.journal_entry_id, current_date, p_reason);
  update public.customer_payments set status = 'void' where id = p_id;
  return v_rev;
end;
$$;
