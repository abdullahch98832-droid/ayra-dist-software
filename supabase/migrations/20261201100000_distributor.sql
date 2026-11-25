-- A distributor of Ayra Happiness: wording, and orders of distributors of other cities in SOL.
-- The call is recorded, the goods are ordered from Ayra for that order, received, supplied and paid. Its profit uses the price paid to Ayra for it.

insert into public.app_settings (key, value, description) values
  ('schema_version', '"20261201100000"', 'Newest database migration applied')
on conflict (key) do update set value = excluded.value;

-- ===========================================================================
-- 1. Wording: Ayra is the company the goods are bought from
-- ===========================================================================
update public.chart_of_accounts set name_en = 'Payable — Ayra company', name_ur = 'واجب الادا — آئرا کمپنی'
 where system_key = 'AP_PRINCIPAL' and name_en = 'Payable — Ayra Happiness (Main Company)';
update public.permissions set description_en = replace(replace(replace(description_en, 'the main company (Ayra Happiness)', 'the Ayra company'), 'the main company', 'the Ayra company'), 'main company', 'Ayra company'),
       description_ur = replace(replace(description_ur, 'مرکزی کمپنی (آئرا ہیپینیس)', 'آئرا کمپنی'), 'مرکزی کمپنی', 'آئرا کمپنی')
 where description_en like '%main company%' or description_ur like '%مرکزی کمپنی%';

-- ===========================================================================
-- 2. Orders of distributors of other cities
-- ===========================================================================
alter table public.sol_job_types add column is_order boolean not null default false;
create unique index sol_job_types_one_order on public.sol_job_types (is_order) where is_order;
select private.restrict_columns('sol_job_types', array['created_at', 'created_by', 'updated_at', 'updated_by', 'is_order']);
insert into public.sol_job_types (name_en, name_ur, uses_services, uses_products, uses_deliveries, is_order) values
  ('Distributor order', 'ڈسٹری بیوٹر آرڈر', false, true, true, true)
on conflict (name_en) do update set uses_services = false, uses_products = true, uses_deliveries = true, is_active = true, is_order = true;

-- Ayra orders placed for one SOL order.
alter table public.purchase_orders add column sol_job_id uuid references public.sol_jobs (id);
create index purchase_orders_sol_job_idx on public.purchase_orders (sol_job_id) where sol_job_id is not null;

-- Value that left the stock, and the part of a line that Ayra delivered for this order (in base units) with its price.
alter table public.sol_delivery_items
  add column stock_cost numeric(18,2) not null default 0,
  add column returned_stock_cost numeric(18,2) not null default 0,
  add column order_quantity bigint not null default 0,
  add column returned_order_quantity bigint not null default 0,
  add column order_cost numeric(18,2) not null default 0;
update public.sol_delivery_items set stock_cost = cost_amount, returned_stock_cost = returned_cost;
do $$
declare
  v_hidden text[];
begin
  -- New cost columns stay as hidden from clients as the ones beside them.
  select array_agg(a.attname::text) into v_hidden from pg_attribute a
   where a.attrelid = 'public.sol_delivery_items'::regclass and a.attname in ('stock_cost', 'returned_stock_cost', 'order_cost', 'order_quantity', 'returned_order_quantity')
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'select');
  if v_hidden is not null then raise exception 'Cost columns are readable: %', v_hidden; end if;
end;
$$;

create function private.is_sol_order(p_job_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sol_jobs j join public.sol_job_types t on t.id = j.job_type_id and t.is_order where j.id = p_job_id);
$$;

create function private.guard_sol_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new boolean := coalesce((select is_order from public.sol_job_types where id = new.job_type_id), false);
begin
  if coalesce((select is_order from public.sol_job_types where id = old.job_type_id), false) <> v_new then
    raise exception 'An order cannot become a job, nor a job an order' using errcode = '23514';
  end if;
  if v_new and new.status <> old.status and new.status in ('confirmed', 'in_progress', 'completed') then
    if not exists (select 1 from public.sol_job_items where sol_job_id = new.id) then raise exception 'The order has no products' using errcode = '23514'; end if;
    if new.contract_value <> (select sum(line_total) from public.sol_job_items where sol_job_id = new.id) then
      raise exception 'The amount of the order differs from its products' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_order before update on public.sol_jobs for each row execute function private.guard_sol_order();

create function private.guard_order_type() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_order and (new.is_order, new.is_active, new.uses_products, new.uses_deliveries, new.uses_services) is distinct from (true, true, true, true, false) then
    raise exception 'The type of distributor orders is fixed' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_order_type before update on public.sol_job_types for each row execute function private.guard_order_type();

-- An order is a job of products; its amount is the sum of its lines.
create function public.save_sol_order(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric(18,2);
  v_type uuid := (select id from public.sol_job_types where is_order);
begin
  perform private.require_permission('sol.manage');
  if p_id is not null and not private.is_sol_order(p_id) then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'The order has no products' using errcode = '23514'; end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) as l(product_id uuid, unit_id uuid, quantity numeric, unit_price numeric)
              where l.product_id is null or l.unit_id is null or coalesce(l.quantity, 0) <= 0 or l.quantity <> trunc(l.quantity) or coalesce(l.unit_price, 0) <= 0) then
    raise exception 'Every product needs a whole quantity and a price' using errcode = '22023';
  end if;
  select sum(round(l.quantity * l.unit_price, 2)) into v_total from jsonb_to_recordset(p_lines) as l(quantity numeric, unit_price numeric);
  return public.save_sol_job(p_id, p_doc || jsonb_build_object('job_type_id', v_type, 'contract_value', v_total),
                             (select jsonb_agg(x.doc || '{"kind": "product"}'::jsonb order by x.n) from jsonb_array_elements(p_lines) with ordinality as x(doc, n)));
end;
$$;

-- The goods of an order are ordered from Ayra: a draft purchase order, approved and received on its usual screens.
create function public.order_sol_goods(p_job_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.sol_jobs%rowtype;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_supplier uuid;
  v_id uuid;
begin
  perform private.require_permission('sol.manage');
  perform private.require_permission('purchasing.create');
  select * into v_job from public.sol_jobs where id = p_job_id for update;
  if v_job.id is null or not private.sees_sol_job(p_job_id) or not private.is_sol_order(p_job_id) then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_request is not null then
    select id into v_id from public.purchase_orders where client_request_id = v_request and sol_job_id = p_job_id;
    if v_id is not null then return v_id; end if;
  end if;
  if v_job.status not in ('confirmed', 'in_progress') then raise exception 'SOL job % is %', v_job.doc_no, v_job.status using errcode = '23514'; end if;
  select id into v_supplier from public.suppliers where is_principal and is_active limit 1;
  if v_supplier is null then raise exception 'Supplier not found' using errcode = 'P0002'; end if;
  perform private.require_lines(p_lines);
  if exists (select 1 from jsonb_to_recordset(p_lines) as l(product_id uuid, unit_id uuid, quantity bigint, unit_price numeric)
              where coalesce(l.quantity, 0) <= 0 or l.unit_price is null or l.unit_price < 0
                 or not exists (select 1 from public.sol_job_items i where i.sol_job_id = p_job_id and i.product_id = l.product_id)
                 or not exists (select 1 from public.product_units u where u.product_id = l.product_id and u.unit_id = l.unit_id)) then
    raise exception 'A product does not belong to this order' using errcode = '23514';
  end if;
  insert into public.purchase_orders (supplier_id, warehouse_id, order_date, expected_date, notes, client_request_id, sol_job_id)
  values (v_supplier, (p_doc ->> 'warehouse_id')::uuid, coalesce((p_doc ->> 'date')::date, private.business_today()), (p_doc ->> 'expected_date')::date,
          nullif(trim(p_doc ->> 'notes'), ''), v_request, p_job_id)
  returning id into v_id;
  insert into public.purchase_order_items (purchase_order_id, product_id, unit_id, quantity, unit_price)
  select v_id, l.product_id, l.unit_id, l.quantity, l.unit_price from jsonb_to_recordset(p_lines) as l(product_id uuid, unit_id uuid, quantity bigint, unit_price numeric);
  return v_id;
end;
$$;

-- What Ayra delivered in good condition for an order and what is left of it, in base units, with its price.
create function private.sol_order_goods(p_job_id uuid, p_product_id uuid) returns table (quantity bigint, value numeric)
language sql stable security definer set search_path = '' as $$
  select greatest(coalesce(r.q, 0) - coalesce(u.q, 0), 0)::bigint, greatest(coalesce(r.v, 0) - coalesce(u.v, 0), 0)
    from (select sum(i.quantity * i.factor) as q, sum(round(i.quantity * i.unit_cost, 2)) as v
            from public.purchase_orders po
            join public.goods_receipts g on g.purchase_order_id = po.id and g.status = 'posted'
            join public.goods_receipt_items i on i.goods_receipt_id = g.id and i.product_id = p_product_id
           where po.sol_job_id = p_job_id) r
   cross join (select sum(di.order_quantity - di.returned_order_quantity) as q,
                      sum(di.order_cost - case when di.order_quantity > 0 then round(di.order_cost * di.returned_order_quantity / di.order_quantity, 2) else 0 end) as v
                 from public.sol_delivery_items di
                 join public.sol_deliveries d on d.id = di.sol_delivery_id and d.sol_job_id = p_job_id
                 join public.sol_job_items ji on ji.id = di.sol_job_item_id and ji.product_id = p_product_id) u;
$$;

create or replace function private.move_stock(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity bigint,
  p_type public.stock_movement_type,
  p_date date,
  p_source_type text,
  p_source_id uuid,
  p_source_line_id uuid default null,
  p_value numeric default null,
  p_affects_value boolean default true,
  p_release_reserved bigint default 0
) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v_balance public.stock_balances%rowtype;
  v_valuation public.inventory_valuation%rowtype;
  v_value_change numeric(18,2) := 0;
  v_in_value numeric(18,2);
  v_new_on_hand bigint;
  v_new_reserved bigint;
  v_new_quantity bigint;
  v_issue bigint;
  v_override boolean := false;
  v_sku text;
  v_wh text;
begin
  if p_quantity = 0 then
    raise exception 'Movement quantity cannot be zero' using errcode = '22023';
  end if;
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and is_active) then
    raise exception 'Warehouse is missing or inactive' using errcode = '23503';
  end if;

  insert into public.stock_balances (product_id, warehouse_id)
  values (p_product_id, p_warehouse_id) on conflict do nothing;
  select * into v_balance from public.stock_balances
   where product_id = p_product_id and warehouse_id = p_warehouse_id for update;

  v_new_on_hand := v_balance.on_hand + p_quantity;
  v_new_reserved := v_balance.reserved - p_release_reserved;

  if v_new_reserved < 0 then
    raise exception 'Cannot release more stock than is reserved' using errcode = '23514';
  end if;
  if p_quantity < 0 and v_new_on_hand < 0 then
    v_override := p_type in ('sale', 'transfer_out', 'purchase_return')
                  and v_new_reserved = 0 and private.negative_stock_allowed();
    if not v_override then
      select sku into v_sku from public.products where id = p_product_id;
      select code into v_wh from public.warehouses where id = p_warehouse_id;
      raise exception 'Insufficient stock for % in %: on hand %, required %',
        v_sku, v_wh, v_balance.on_hand, -p_quantity using errcode = '23514';
    end if;
  end if;
  if p_quantity < 0 and v_new_reserved > 0 and v_new_on_hand < v_new_reserved then
    select sku into v_sku from public.products where id = p_product_id;
    raise exception 'Stock of % is reserved for approved orders (available %, required %)',
      v_sku, v_balance.on_hand - v_balance.reserved, -p_quantity using errcode = '23514';
  end if;

  if p_affects_value then
    insert into public.inventory_valuation (product_id) values (p_product_id) on conflict do nothing;
    select * into v_valuation from public.inventory_valuation where product_id = p_product_id for update;
    v_new_quantity := v_valuation.quantity + p_quantity;

    if p_quantity > 0 then
      if p_value is not null then
        if p_value < 0 then
          raise exception 'Inbound value cannot be negative' using errcode = '23514';
        end if;
        v_in_value := round(p_value, 2);
      elsif v_valuation.quantity > 0 then
        v_in_value := round(p_quantity * v_valuation.total_value / v_valuation.quantity, 2);
      elsif v_valuation.last_unit_cost is not null then
        v_in_value := round(p_quantity * v_valuation.last_unit_cost, 2);
      else
        select sku into v_sku from public.products where id = p_product_id;
        raise exception 'No average cost for % (no stock on hand); a value must be supplied', v_sku
          using errcode = '22023';
      end if;

      if v_valuation.quantity >= 0 then
        v_value_change := v_in_value;
      elsif v_new_quantity = 0 then
        v_value_change := -v_valuation.total_value;
      elsif v_new_quantity < 0 then
        -- Still short: settle earlier issues at the cost they were issued at.
        v_value_change := round(p_quantity * v_valuation.total_value / v_valuation.quantity, 2);
      else
        -- The units left after settling the shortage carry the incoming cost.
        v_value_change := round(v_in_value * v_new_quantity / p_quantity, 2) - v_valuation.total_value;
      end if;
    else
      v_issue := -p_quantity;
      if p_type = 'sol_issue' and p_value is not null and v_valuation.quantity > v_issue then
        -- Goods bought for one SOL order leave at the price paid for them; what stays keeps its own value.
        v_value_change := -least(round(p_value, 2), greatest(v_valuation.total_value, 0));
      elsif v_valuation.quantity > v_issue then
        v_value_change := -round(v_issue * v_valuation.total_value / v_valuation.quantity, 2);
      elsif v_valuation.quantity = v_issue then
        -- Removing the last units takes the remaining value exactly, so no rounding residue is left.
        v_value_change := -v_valuation.total_value;
      else
        if not v_override and not exists (
             select 1 from public.stock_balances where product_id = p_product_id and on_hand < 0) then
          raise exception 'Valuation quantity out of sync for product %', p_product_id using errcode = 'XX000';
        end if;
        if v_valuation.quantity <> 0 then
          v_value_change := -(v_valuation.total_value
            + round((v_issue - v_valuation.quantity) * (v_valuation.total_value / v_valuation.quantity), 2));
          if v_valuation.quantity < 0 then
            v_value_change := -round(v_issue * v_valuation.total_value / v_valuation.quantity, 2);
          end if;
        elsif v_valuation.last_unit_cost is not null then
          v_value_change := -round(v_issue * v_valuation.last_unit_cost, 2);
        else
          select sku into v_sku from public.products where id = p_product_id;
          raise exception 'No cost is known for %; receive it once before issuing it', v_sku using errcode = '23514';
        end if;
      end if;
    end if;

    update public.inventory_valuation
       set quantity = v_new_quantity,
           total_value = total_value + v_value_change,
           last_unit_cost = case when v_new_quantity > 0
                                 then round((total_value + v_value_change) / v_new_quantity, 6) else last_unit_cost end,
           updated_at = now()
     where product_id = p_product_id;
  end if;

  update public.stock_balances
     set on_hand = v_new_on_hand, reserved = v_new_reserved, updated_at = now()
   where product_id = p_product_id and warehouse_id = p_warehouse_id;

  insert into public.stock_movements
    (movement_date, product_id, warehouse_id, movement_type, quantity, value_change,
     balance_after, source_type, source_id, source_line_id, negative_override)
  values
    (p_date, p_product_id, p_warehouse_id, p_type, p_quantity, v_value_change,
     v_new_on_hand, p_source_type, p_source_id, p_source_line_id, v_override);

  return v_value_change;
end;
$$;

create or replace function public.dispatch_sol_delivery(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.sol_deliveries%rowtype;
  v_job public.sol_jobs%rowtype;
  v_line record;
  v_cost numeric(18,2);
  v_total numeric(18,2) := 0;
  v_stock numeric(18,2);
  v_stock_total numeric(18,2) := 0;
  v_base bigint;
  v_own bigint;
  v_rest numeric(18,2);
  v_own_cost numeric(18,2);
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
      v_base := (v_line.quantity * v_line.factor)::bigint;
      -- First what Ayra delivered for this order, at its price; anything else at average cost.
      select least(o.quantity, v_base), case when o.quantity > 0 then round(o.value * least(o.quantity, v_base) / o.quantity, 2) else 0 end
        into v_own, v_own_cost from private.sol_order_goods(v_job.id, v_line.product_id) o;
      v_stock := 0;
      v_cost := 0;
      if v_own > 0 then
        v_stock := -private.move_stock(v_line.product_id, v_delivery.warehouse_id, -v_own, 'sol_issue', private.business_today(), 'sol_delivery', p_id, v_line.id, v_own_cost);
        v_cost := v_own_cost;
      end if;
      if v_base > v_own then
        v_rest := -private.move_stock(v_line.product_id, v_delivery.warehouse_id, v_own - v_base, 'sol_issue', private.business_today(), 'sol_delivery', p_id, v_line.id);
        v_stock := v_stock + v_rest;
        v_cost := v_cost + v_rest;
      end if;
      update public.sol_delivery_items set cost_amount = v_cost, stock_cost = v_stock, order_quantity = v_own, order_cost = case when v_own > 0 then v_own_cost else 0 end where id = v_line.id;
      v_total := v_total + v_cost;
      v_stock_total := v_stock_total + v_stock;
    end if;
    update public.sol_job_items set delivered_quantity = delivered_quantity + v_line.quantity where id = v_line.job_item_id;
  end loop;
  if v_total > 0 or v_stock_total <> 0 then
    v_je := private.post_journal(private.business_today(), 'SOL delivery ' || v_delivery.doc_no || ' for ' || v_job.doc_no, 'sol_delivery', p_id,
      jsonb_build_array(jsonb_build_object('account', 'SOL_COSTS', 'debit', v_total),
        -- Differs only when the last units leave and other sales took part of their value before.
        jsonb_build_object('account', 'INVENTORY_VARIANCE', 'debit', greatest(v_stock_total - v_total, 0), 'credit', greatest(v_total - v_stock_total, 0)),
        jsonb_build_object('account', 'INVENTORY', 'credit', v_stock_total)));
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

create or replace function private.return_sol_goods(p_delivery_id uuid, p_warehouse_id uuid, p_reason text, p_lines jsonb, p_request uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.sol_deliveries%rowtype;
  v_id uuid;
  v_line record;
  v_cost numeric(18,2);
  v_stock numeric(18,2);
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
    select di.id, l.quantity, di.quantity as sent, di.returned_quantity, di.cost_amount, di.returned_cost, di.stock_cost, di.returned_stock_cost, di.order_quantity, i.id as job_item_id, i.kind, i.product_id, i.factor
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
    v_stock := 0;
    if v_line.kind = 'product' then
      if v_line.quantity <> trunc(v_line.quantity) then raise exception 'Products are delivered in whole units' using errcode = '23514'; end if;
      if p_warehouse_id is null then raise exception 'Choose the warehouse the products return to' using errcode = '22023'; end if;
      v_cost := round(v_line.cost_amount * (v_line.returned_quantity + v_line.quantity) / v_line.sent, 2) - v_line.returned_cost;
      -- Into stock with the value that left it.
      v_stock := round(v_line.stock_cost * (v_line.returned_quantity + v_line.quantity) / v_line.sent, 2) - v_line.returned_stock_cost;
      perform private.move_stock(v_line.product_id, p_warehouse_id, (v_line.quantity * v_line.factor)::bigint, 'sol_return',
                                 private.business_today(), 'sol_return', v_id, v_line.id, v_stock);
    end if;
    insert into public.sol_return_items (sol_return_id, sol_delivery_item_id, quantity, cost_amount) values (v_id, v_line.id, v_line.quantity, v_cost);
    update public.sol_delivery_items set returned_quantity = returned_quantity + v_line.quantity, returned_cost = returned_cost + v_cost, returned_stock_cost = returned_stock_cost + v_stock,
           returned_order_quantity = least(v_line.order_quantity, ((v_line.returned_quantity + v_line.quantity) * coalesce(v_line.factor, 1))::bigint) where id = v_line.id;
    update public.sol_job_items set delivered_quantity = delivered_quantity - v_line.quantity where id = v_line.job_item_id;
    v_total := v_total + v_cost;
  end loop;
  if not exists (select 1 from public.sol_return_items where sol_return_id = v_id) then
    raise exception 'Enter at least one quantity' using errcode = '22023';
  end if;
  -- Goods that settle stock issued below zero are valued at that issue; the difference is an inventory variance.
  select coalesce(sum(value_change), 0) into v_booked from public.stock_movements where source_type = 'sol_return' and source_id = v_id;
  if v_total > 0 or v_booked <> 0 then
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

-- Every order from the call to the payment. Amounts of Ayra need costs.view, payments a receivables permission.
create function public.report_sol_orders(p_from date default null, p_to date default null, p_status text default null, p_job_id uuid default null)
returns table (job_id uuid, doc_no text, job_date date, customer_id uuid, customer text, customer_ur text, city text, contact_name text, contact_phone text, status public.sol_job_status, step text, due_date date,
               needed bigint, ordered bigint, received bigint, supplied bigint, sale numeric, paid numeric, pending numeric, goods_cost numeric, other_costs numeric, vehicle_expenses numeric, profit numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_permission('sol.view');
  return query
  select r.job_id, r.doc_no, r.job_date, r.customer_id, r.customer, r.customer_ur, c.city, j.contact_name, j.contact_phone, r.status,
         case when r.status in ('draft', 'cancelled') then r.status::text
              when r.status = 'completed' then case when r.pending <= 0 then 'paid' else 'completed' end
              when i.supplied >= i.needed then 'supplied'
              when coalesce(b.received, 0) >= i.needed - i.supplied and coalesce(b.received, 0) > 0 then 'received'
              when coalesce(b.ordered, 0) > 0 then 'ordered' else 'call' end,
         r.due_date, i.needed, coalesce(b.ordered, 0), coalesce(b.received, 0), i.supplied, case when r.status = 'cancelled' then 0 else r.contract_value end, r.received, r.pending,
         r.product_costs, r.other_costs, r.vehicle_expenses, r.profit
    from public.report_sol_jobs(p_from, p_to, p_status, null, (select t.id from public.sol_job_types t where t.is_order), p_job_id) r
    join public.sol_jobs j on j.id = r.job_id
    join public.customers c on c.id = r.customer_id
    cross join lateral (select coalesce(sum(x.quantity * x.factor), 0)::bigint as needed, coalesce(sum(x.delivered_quantity * x.factor), 0)::bigint as supplied from public.sol_job_items x where x.sol_job_id = r.job_id) i
    left join lateral (select sum(x.base_quantity) filter (where po.status::text in ('approved', 'partially_received', 'received'))::bigint as ordered,
                              (select sum(gi.quantity * gi.factor) from public.purchase_orders p2 join public.goods_receipts g on g.purchase_order_id = p2.id and g.status = 'posted'
                                 join public.goods_receipt_items gi on gi.goods_receipt_id = g.id where p2.sol_job_id = r.job_id)::bigint as received
                         from public.purchase_orders po join public.purchase_order_items x on x.purchase_order_id = po.id where po.sol_job_id = r.job_id) b on true
   order by r.job_date desc, r.doc_no desc;
end;
$$;

-- ===========================================================================
-- 3. Privileges
-- ===========================================================================
revoke execute on function private.is_sol_order(uuid), private.guard_sol_order(), private.guard_order_type(), private.sol_order_goods(uuid, uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['public.save_sol_order(uuid, jsonb, jsonb)', 'public.order_sol_goods(uuid, jsonb, jsonb)', 'public.report_sol_orders(date, date, text, uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
