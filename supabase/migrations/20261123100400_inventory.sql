-- Inventory: balances per warehouse, weighted-average valuation per product,
-- immutable movement ledger, reservations, adjustments, counts and transfers.

create table public.stock_balances (
  product_id uuid not null references public.products (id),
  warehouse_id uuid not null references public.warehouses (id),
  on_hand bigint not null default 0 check (on_hand >= 0),
  reserved bigint not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, warehouse_id),
  check (reserved <= on_hand)
);
create index stock_balances_warehouse_idx on public.stock_balances (warehouse_id);

-- Company-wide weighted average: one cost pool per product across all warehouses.
-- total_value always equals the Inventory GL contribution of the product.
create table public.inventory_valuation (
  product_id uuid primary key references public.products (id),
  quantity bigint not null default 0 check (quantity >= 0),
  total_value numeric(18,2) not null default 0 check (total_value >= 0),
  avg_unit_cost numeric(18,6) generated always as
    (case when quantity > 0 then round(total_value / quantity, 6) else 0 end) stored,
  updated_at timestamptz not null default now(),
  check (quantity > 0 or total_value = 0)
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  movement_date date not null,
  product_id uuid not null references public.products (id),
  warehouse_id uuid not null references public.warehouses (id),
  movement_type public.stock_movement_type not null,
  quantity bigint not null check (quantity <> 0),
  -- Signed change in inventory value (0 for transfers).
  value_change numeric(18,2) not null default 0,
  balance_after bigint not null,
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (
    (movement_type in ('opening', 'purchase_receipt', 'sales_return', 'transfer_in', 'adjustment_in') and quantity > 0)
    or (movement_type in ('purchase_return', 'sale', 'transfer_out', 'adjustment_out', 'write_off') and quantity < 0)
  )
);
create index stock_movements_product_idx on public.stock_movements (product_id, movement_date);
create index stock_movements_warehouse_idx on public.stock_movements (warehouse_id, movement_date);
create index stock_movements_source_idx on public.stock_movements (source_type, source_id);

create trigger stock_movements_immutable
  before update or delete on public.stock_movements
  for each row execute function private.prevent_modification();

-- ---------------------------------------------------------------------------
-- Core movement function. Locks the balance row then the valuation row (always
-- in that order) so concurrent documents serialise instead of overselling.
--
-- p_quantity: signed base units.
-- p_value:    for inbound movements, the exact value added (e.g. purchase line total).
--             NULL = use the current average cost.
-- p_affects_value: false for transfers (stock moves between warehouses, value pool unchanged).
-- p_release_reserved: base units of reservation consumed by this outbound movement.
-- Returns the signed value change (negative = cost of goods removed).
-- ---------------------------------------------------------------------------
create function private.move_stock(
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
  v_new_on_hand bigint;
  v_new_reserved bigint;
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

  if v_new_on_hand < 0 then
    select sku into v_sku from public.products where id = p_product_id;
    select code into v_wh from public.warehouses where id = p_warehouse_id;
    raise exception 'Insufficient stock for % in %: on hand %, required %',
      v_sku, v_wh, v_balance.on_hand, -p_quantity using errcode = '23514';
  end if;
  if v_new_reserved < 0 then
    raise exception 'Cannot release more stock than is reserved' using errcode = '23514';
  end if;
  if v_new_on_hand < v_new_reserved then
    select sku into v_sku from public.products where id = p_product_id;
    raise exception 'Stock of % is reserved for approved orders (available %, required %)',
      v_sku, v_balance.on_hand - v_balance.reserved, -p_quantity using errcode = '23514';
  end if;

  if p_affects_value then
    insert into public.inventory_valuation (product_id) values (p_product_id) on conflict do nothing;
    select * into v_valuation from public.inventory_valuation where product_id = p_product_id for update;

    if p_quantity > 0 then
      if p_value is not null then
        if p_value < 0 then
          raise exception 'Inbound value cannot be negative' using errcode = '23514';
        end if;
        v_value_change := round(p_value, 2);
      elsif v_valuation.quantity > 0 then
        v_value_change := round(p_quantity * v_valuation.total_value / v_valuation.quantity, 2);
      else
        select sku into v_sku from public.products where id = p_product_id;
        raise exception 'No average cost for % (no stock on hand); a value must be supplied', v_sku
          using errcode = '22023';
      end if;
    else
      if v_valuation.quantity < -p_quantity then
        raise exception 'Valuation quantity out of sync for product %', p_product_id using errcode = 'XX000';
      end if;
      -- Removing the last units takes the remaining value exactly, so no rounding residue is left.
      if v_valuation.quantity = -p_quantity then
        v_value_change := -v_valuation.total_value;
      else
        v_value_change := -round(-p_quantity * v_valuation.total_value / v_valuation.quantity, 2);
      end if;
    end if;

    update public.inventory_valuation
       set quantity = quantity + p_quantity,
           total_value = total_value + v_value_change,
           updated_at = now()
     where product_id = p_product_id;
  end if;

  update public.stock_balances
     set on_hand = v_new_on_hand, reserved = v_new_reserved, updated_at = now()
   where product_id = p_product_id and warehouse_id = p_warehouse_id;

  insert into public.stock_movements
    (movement_date, product_id, warehouse_id, movement_type, quantity, value_change,
     balance_after, source_type, source_id, source_line_id)
  values
    (p_date, p_product_id, p_warehouse_id, p_type, p_quantity, v_value_change,
     v_new_on_hand, p_source_type, p_source_id, p_source_line_id);

  return v_value_change;
end;
$$;

create function private.reserve_stock(p_product_id uuid, p_warehouse_id uuid, p_quantity bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_balance public.stock_balances%rowtype;
  v_sku text;
begin
  if p_quantity <= 0 then
    raise exception 'Reservation quantity must be positive' using errcode = '22023';
  end if;
  insert into public.stock_balances (product_id, warehouse_id)
  values (p_product_id, p_warehouse_id) on conflict do nothing;
  select * into v_balance from public.stock_balances
   where product_id = p_product_id and warehouse_id = p_warehouse_id for update;
  if v_balance.on_hand - v_balance.reserved < p_quantity then
    select sku into v_sku from public.products where id = p_product_id;
    raise exception 'Insufficient available stock for %: available %, required %',
      v_sku, v_balance.on_hand - v_balance.reserved, p_quantity using errcode = '23514';
  end if;
  update public.stock_balances set reserved = reserved + p_quantity, updated_at = now()
   where product_id = p_product_id and warehouse_id = p_warehouse_id;
end;
$$;

create function private.release_stock(p_product_id uuid, p_warehouse_id uuid, p_quantity bigint)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_quantity <= 0 then
    return;
  end if;
  update public.stock_balances set reserved = reserved - p_quantity, updated_at = now()
   where product_id = p_product_id and warehouse_id = p_warehouse_id and reserved >= p_quantity;
  if not found then
    raise exception 'Cannot release more stock than is reserved' using errcode = '23514';
  end if;
end;
$$;

-- Header totals maintained from lines. TG_ARGV: header table, FK column on line table.
create function private.recalc_header_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_header_id uuid;
begin
  v_header_id := coalesce(to_jsonb(new) ->> tg_argv[1], to_jsonb(old) ->> tg_argv[1])::uuid;
  execute format(
    'update public.%I set total_amount = (select coalesce(sum(line_total), 0) from public.%I where %I = $1) where id = $1',
    tg_argv[0], tg_table_name, tg_argv[1])
  using v_header_id;
  if tg_op = 'UPDATE' and (to_jsonb(old) ->> tg_argv[1])::uuid is distinct from v_header_id then
    execute format(
      'update public.%I set total_amount = (select coalesce(sum(line_total), 0) from public.%I where %I = $1) where id = $1',
      tg_argv[0], tg_table_name, tg_argv[1])
    using (to_jsonb(old) ->> tg_argv[1])::uuid;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stock adjustments: opening stock, count differences, write-offs, other.
-- ---------------------------------------------------------------------------
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  warehouse_id uuid not null references public.warehouses (id),
  adjustment_date date not null default current_date,
  kind public.adjustment_kind not null,
  reason text,
  status public.document_status not null default 'draft',
  value_total numeric(18,2),
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create trigger stock_adjustments_doc_no
  before insert on public.stock_adjustments
  for each row execute function private.assign_doc_no('ADJ');

create table public.stock_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  stock_adjustment_id uuid not null references public.stock_adjustments (id) on delete cascade,
  product_id uuid not null references public.products (id),
  unit_id uuid not null references public.units (id),
  factor bigint not null,
  -- Signed: positive adds stock, negative removes it.
  quantity bigint not null check (quantity <> 0),
  base_quantity bigint generated always as (quantity * factor) stored,
  -- Required for increases when no average cost exists (e.g. opening stock). Per unit.
  unit_cost numeric(18,2) check (unit_cost is null or unit_cost >= 0),
  value_change numeric(18,2),
  notes text
);
create index stock_adjustment_items_header_idx on public.stock_adjustment_items (stock_adjustment_id);

create trigger stock_adjustment_items_factor
  before insert or update of product_id, unit_id on public.stock_adjustment_items
  for each row execute function private.set_line_factor();

create function public.post_stock_adjustment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.stock_adjustments%rowtype;
  v_item record;
  v_change numeric(18,2);
  v_total numeric(18,2) := 0;
  v_offset text;
  v_je uuid;
begin
  perform private.require_permission('inventory.adjust');
  select * into v_doc from public.stock_adjustments where id = p_id for update;
  if v_doc.id is null then raise exception 'Adjustment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Adjustment % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.stock_adjustment_items where stock_adjustment_id = p_id) then
    raise exception 'Adjustment has no lines' using errcode = '23514';
  end if;
  if v_doc.kind = 'opening' and exists (select 1 from public.stock_adjustment_items where stock_adjustment_id = p_id and (quantity < 0 or unit_cost is null)) then
    raise exception 'Opening stock lines must be increases with a unit cost' using errcode = '23514';
  end if;
  if v_doc.kind = 'write_off' and exists (select 1 from public.stock_adjustment_items where stock_adjustment_id = p_id and quantity > 0) then
    raise exception 'Write-off lines must be decreases' using errcode = '23514';
  end if;

  for v_item in
    select * from public.stock_adjustment_items where stock_adjustment_id = p_id order by product_id, id
  loop
    v_change := private.move_stock(
      v_item.product_id, v_doc.warehouse_id, v_item.base_quantity,
      case
        when v_doc.kind = 'opening' then 'opening'
        when v_doc.kind = 'write_off' then 'write_off'
        when v_item.quantity > 0 then 'adjustment_in'
        else 'adjustment_out'
      end::public.stock_movement_type,
      v_doc.adjustment_date, 'stock_adjustment', v_doc.id, v_item.id,
      case when v_item.quantity > 0 and v_item.unit_cost is not null then v_item.quantity * v_item.unit_cost end);
    update public.stock_adjustment_items set value_change = v_change where id = v_item.id;
    v_total := v_total + v_change;
  end loop;

  v_offset := case v_doc.kind
    when 'opening' then 'OPENING_EQUITY'
    when 'write_off' then 'STOCK_WRITE_OFF'
    else 'INVENTORY_VARIANCE' end;

  if v_total <> 0 then
    v_je := private.post_journal(v_doc.adjustment_date, 'Stock adjustment ' || v_doc.doc_no, 'stock_adjustment', v_doc.id,
      case when v_total > 0 then jsonb_build_array(
        jsonb_build_object('account', 'INVENTORY', 'debit', v_total),
        jsonb_build_object('account', v_offset, 'credit', v_total))
      else jsonb_build_array(
        jsonb_build_object('account', v_offset, 'debit', -v_total),
        jsonb_build_object('account', 'INVENTORY', 'credit', -v_total))
      end);
  end if;

  update public.stock_adjustments
     set status = 'posted', value_total = v_total, journal_entry_id = v_je,
         posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Physical stock counts. Posting compares counted quantity with on-hand at the
-- time of posting and creates a 'count' adjustment for the differences.
-- ---------------------------------------------------------------------------
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  warehouse_id uuid not null references public.warehouses (id),
  count_date date not null default current_date,
  notes text,
  status public.document_status not null default 'draft',
  stock_adjustment_id uuid references public.stock_adjustments (id),
  posted_at timestamptz,
  posted_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create trigger stock_counts_doc_no
  before insert on public.stock_counts
  for each row execute function private.assign_doc_no('CNT');

create table public.stock_count_items (
  id uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references public.stock_counts (id) on delete cascade,
  product_id uuid not null references public.products (id),
  system_quantity bigint not null default 0,
  counted_quantity bigint not null check (counted_quantity >= 0),
  difference bigint generated always as (counted_quantity - system_quantity) stored,
  notes text,
  unique (stock_count_id, product_id)
);

create function private.snapshot_count_quantity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(sb.on_hand, 0) into new.system_quantity
    from public.stock_counts sc
    left join public.stock_balances sb on sb.warehouse_id = sc.warehouse_id and sb.product_id = new.product_id
   where sc.id = new.stock_count_id;
  new.system_quantity := coalesce(new.system_quantity, 0);
  return new;
end;
$$;

create trigger stock_count_items_snapshot
  before insert or update of product_id on public.stock_count_items
  for each row execute function private.snapshot_count_quantity();

create function public.post_stock_count(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.stock_counts%rowtype;
  v_adj_id uuid;
  v_item record;
  v_lines integer := 0;
begin
  perform private.require_permission('inventory.adjust');
  select * into v_doc from public.stock_counts where id = p_id for update;
  if v_doc.id is null then raise exception 'Count not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Count % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  insert into public.stock_adjustments (warehouse_id, adjustment_date, kind, reason)
  values (v_doc.warehouse_id, v_doc.count_date, 'count', 'Physical count ' || v_doc.doc_no)
  returning id into v_adj_id;

  for v_item in
    select ci.product_id, ci.counted_quantity - coalesce(sb.on_hand, 0) as diff, p.base_unit_id
      from public.stock_count_items ci
      join public.products p on p.id = ci.product_id
      left join public.stock_balances sb on sb.product_id = ci.product_id and sb.warehouse_id = v_doc.warehouse_id
     where ci.stock_count_id = p_id
  loop
    continue when v_item.diff = 0;
    insert into public.stock_adjustment_items (stock_adjustment_id, product_id, unit_id, quantity)
    values (v_adj_id, v_item.product_id, v_item.base_unit_id, v_item.diff);
    v_lines := v_lines + 1;
  end loop;

  if v_lines > 0 then
    perform public.post_stock_adjustment(v_adj_id);
  else
    delete from public.stock_adjustments where id = v_adj_id;
    v_adj_id := null;
  end if;

  update public.stock_counts
     set status = 'posted', stock_adjustment_id = v_adj_id, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_adj_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transfers between warehouses (including loading/unloading vehicles).
-- ---------------------------------------------------------------------------
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  from_warehouse_id uuid not null references public.warehouses (id),
  to_warehouse_id uuid not null references public.warehouses (id),
  transfer_date date not null default current_date,
  notes text,
  status public.document_status not null default 'draft',
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (from_warehouse_id <> to_warehouse_id)
);

create trigger stock_transfers_doc_no
  before insert on public.stock_transfers
  for each row execute function private.assign_doc_no('TRF');

create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  stock_transfer_id uuid not null references public.stock_transfers (id) on delete cascade,
  product_id uuid not null references public.products (id),
  unit_id uuid not null references public.units (id),
  factor bigint not null,
  quantity bigint not null check (quantity > 0),
  base_quantity bigint generated always as (quantity * factor) stored
);
create index stock_transfer_items_header_idx on public.stock_transfer_items (stock_transfer_id);

create trigger stock_transfer_items_factor
  before insert or update of product_id, unit_id on public.stock_transfer_items
  for each row execute function private.set_line_factor();

create function public.post_stock_transfer(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.stock_transfers%rowtype;
  v_item record;
begin
  perform private.require_permission('inventory.transfer');
  select * into v_doc from public.stock_transfers where id = p_id for update;
  if v_doc.id is null then raise exception 'Transfer not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Transfer % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.stock_transfer_items where stock_transfer_id = p_id) then
    raise exception 'Transfer has no lines' using errcode = '23514';
  end if;

  for v_item in
    select * from public.stock_transfer_items where stock_transfer_id = p_id order by product_id, id
  loop
    perform private.move_stock(v_item.product_id, v_doc.from_warehouse_id, -v_item.base_quantity, 'transfer_out',
      v_doc.transfer_date, 'stock_transfer', v_doc.id, v_item.id, null, false);
    perform private.move_stock(v_item.product_id, v_doc.to_warehouse_id, v_item.base_quantity, 'transfer_in',
      v_doc.transfer_date, 'stock_transfer', v_doc.id, v_item.id, null, false);
  end loop;

  update public.stock_transfers set status = 'posted', posted_at = now(), posted_by = auth.uid() where id = p_id;
  return p_id;
end;
$$;
