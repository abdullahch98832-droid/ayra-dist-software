-- Phase 6: product details, receiving with accepted/damaged/rejected quantities,
-- controlled negative-stock override, atomic document saving, procurement and stock reports.

-- ===========================================================================
-- 1. Business dates in Pakistan time
-- ===========================================================================
grant execute on function private.business_today() to authenticated;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('stock_adjustments', 'adjustment_date'), ('stock_counts', 'count_date'), ('stock_transfers', 'transfer_date'),
      ('purchase_orders', 'order_date'), ('goods_receipts', 'receipt_date'), ('supplier_payments', 'payment_date'),
      ('supplier_returns', 'return_date'), ('fund_transfers', 'transfer_date'), ('sales_orders', 'order_date'),
      ('sales_invoices', 'invoice_date'), ('deliveries', 'delivery_date'), ('customer_returns', 'return_date'),
      ('customer_payments', 'payment_date'), ('expenses', 'expense_date'), ('employee_advances', 'advance_date'),
      ('salary_payments', 'payment_date'), ('sol_jobs', 'job_date'), ('sol_trips', 'trip_date')) as v(tab, col)
  loop
    execute format('alter table public.%I alter column %I set default private.business_today()', t.tab, t.col);
  end loop;
end;
$$;

-- These post with current_date, which follows the function's time zone.
alter function public.complete_sol_job(uuid) set timezone to 'Asia/Karachi';
alter function public.void_customer_payment(uuid, text) set timezone to 'Asia/Karachi';
alter function public.void_supplier_payment(uuid, text) set timezone to 'Asia/Karachi';
alter function public.void_expense(uuid, text) set timezone to 'Asia/Karachi';

-- ===========================================================================
-- 2. Permissions and settings
-- ===========================================================================
insert into public.permissions (code, module, description_en, description_ur) values
  ('inventory.negative_override', 'inventory',
   'Issue stock below zero while the negative-stock override is switched on in settings',
   'جب ترتیبات میں منفی اسٹاک کی اجازت آن ہو تو صفر سے کم اسٹاک جاری کریں');

insert into public.app_settings (key, value, description) values
  ('allow_negative_stock', 'false', 'Lets users with inventory.negative_override issue more than is on hand');

-- ===========================================================================
-- 3. Product details
-- ===========================================================================
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name_en text not null unique check (length(trim(name_en)) > 0),
  name_ur text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
select private.apply_policies('brands', private.p('products.view'), private.p('products.manage'), private.p('products.manage'), private.p('products.manage'));
revoke all on public.brands from anon, authenticated;
grant select, delete on public.brands to authenticated;
select private.restrict_columns('brands', array['created_at', 'created_by', 'updated_at', 'updated_by']);
create trigger touch_updated before update on public.brands for each row execute function private.touch_updated();
create trigger audit after insert or update or delete on public.brands for each row execute function private.audit_row();

alter table public.products
  add column brand_id uuid references public.brands (id),
  add column default_supplier_id uuid references public.suppliers (id),
  add column image_path text;
create index products_brand_idx on public.products (brand_id);
create index products_supplier_idx on public.products (default_supplier_id);
select private.restrict_columns('products', array['created_at', 'created_by', 'updated_at', 'updated_by']);

-- Codes assigned automatically when left blank.
insert into public.document_sequences (doc_type, prefix, padding, description) values
  ('SKU', 'SKU-', 5, 'Product SKU'),
  ('SUP', 'SUP-', 4, 'Supplier code');

create function private.assign_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(to_jsonb(new) ->> tg_argv[0]), '') = '' then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], private.next_document_number(tg_argv[1])));
  end if;
  return new;
end;
$$;
create trigger products_sku before insert on public.products
  for each row execute function private.assign_code('sku', 'SKU');
create trigger suppliers_code before insert on public.suppliers
  for each row execute function private.assign_code('code', 'SUP');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "product images: read" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select private.has_permission('products.view')));
create policy "product images: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select private.has_permission('products.manage')));
create policy "product images: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select private.has_permission('products.manage')));

-- ===========================================================================
-- 4. Stock engine: controlled override for negative stock
-- ===========================================================================
-- Stock can only go below zero through move_stock, with the setting on, by a user holding
-- inventory.negative_override, and never into reserved stock.
alter table public.stock_balances drop constraint stock_balances_on_hand_check;
alter table public.stock_balances drop constraint stock_balances_check;
alter table public.stock_balances add constraint stock_balances_reserved_within_stock
  check (reserved = 0 or reserved <= on_hand);

alter table public.inventory_valuation drop constraint inventory_valuation_quantity_check;
alter table public.inventory_valuation drop constraint inventory_valuation_total_value_check;
alter table public.inventory_valuation drop constraint inventory_valuation_check;
alter table public.inventory_valuation
  -- Cost of the last units on hand; values issues and gains while nothing is on hand.
  add column last_unit_cost numeric(18,6),
  add constraint inventory_valuation_sign check (
    (quantity > 0 and total_value >= 0) or (quantity = 0 and total_value = 0) or (quantity < 0 and total_value <= 0));
update public.inventory_valuation set last_unit_cost = round(total_value / quantity, 6) where quantity > 0;
-- Sold out already: the cost of its latest movement.
update public.inventory_valuation iv
   set last_unit_cost = m.unit_cost
  from (select distinct on (product_id) product_id, round(abs(value_change) / abs(quantity), 6) as unit_cost
          from public.stock_movements where value_change <> 0 order by product_id, id desc) m
 where m.product_id = iv.product_id and iv.last_unit_cost is null;

alter table public.stock_movements add column negative_override boolean not null default false;
grant select (negative_override) on public.stock_movements to authenticated;

create function private.negative_stock_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((private.setting('allow_negative_stock'))::boolean, false)
     and private.has_permission('inventory.negative_override');
$$;

-- Same contract as before, plus the override. For inbound movements that settle a shortage
-- the returned value change can differ from p_value; the caller books the difference to
-- inventory variance so the Inventory account always equals the valuation.
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
      if v_valuation.quantity > v_issue then
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

-- ===========================================================================
-- 5. Receiving: accepted, damaged and rejected quantities
-- ===========================================================================
-- quantity          accepted into the receiving warehouse
-- damaged_quantity  kept in the damaged warehouse: valued and payable until returned or written off
-- rejected_quantity refused at the door: never in stock, never payable, still due from the order
alter table public.goods_receipts add column damaged_warehouse_id uuid references public.warehouses (id);
select private.restrict_columns('goods_receipts', array[
  'doc_no', 'status', 'journal_entry_id', 'posted_at', 'posted_by', 'approved_at', 'approved_by', 'created_at', 'created_by',
  'updated_at', 'updated_by', 'total_amount']);

alter table public.goods_receipt_items drop constraint goods_receipt_items_quantity_check;
alter table public.goods_receipt_items
  add column damaged_quantity bigint not null default 0 check (damaged_quantity >= 0),
  add column rejected_quantity bigint not null default 0 check (rejected_quantity >= 0),
  add constraint goods_receipt_items_quantities check (quantity >= 0 and quantity + damaged_quantity + rejected_quantity > 0);
alter table public.goods_receipt_items drop column line_total;
alter table public.goods_receipt_items add column line_total numeric(18,2)
  generated always as ((quantity + damaged_quantity) * unit_cost) stored;
select private.restrict_columns('goods_receipt_items', array['factor']);

create or replace view public.v_purchase_receipt_discrepancies with (security_invoker = true) as
select gr.id as goods_receipt_id, gr.doc_no, gr.supplier_id, gr.receipt_date, gri.product_id,
       gri.expected_quantity, gri.quantity + gri.damaged_quantity + gri.rejected_quantity as received_quantity,
       gri.quantity + gri.damaged_quantity + gri.rejected_quantity - gri.expected_quantity as difference,
       gri.damaged_quantity, gri.rejected_quantity
from public.goods_receipt_items gri
join public.goods_receipts gr on gr.id = gri.goods_receipt_id
where (gri.expected_quantity is not null and gri.expected_quantity <> gri.quantity + gri.damaged_quantity + gri.rejected_quantity)
   or gri.damaged_quantity > 0 or gri.rejected_quantity > 0;

create or replace function public.post_goods_receipt(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.goods_receipts%rowtype;
  v_item record;
  v_po_status public.purchase_order_status;
  v_inventory numeric(18,2) := 0;
  v_variance numeric(18,2);
  v_je uuid;
begin
  perform private.require_permission('purchasing.post');
  select * into v_doc from public.goods_receipts where id = p_id for update;
  if v_doc.id is null then raise exception 'Goods receipt not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Goods receipt % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.goods_receipt_items where goods_receipt_id = p_id) then
    raise exception 'Goods receipt has no lines' using errcode = '23514';
  end if;
  if exists (select 1 from public.warehouses where id = v_doc.warehouse_id and warehouse_type = 'damaged') then
    raise exception 'Receive into a normal warehouse; damaged goods have their own column' using errcode = '23514';
  end if;
  if exists (select 1 from public.goods_receipt_items where goods_receipt_id = p_id and damaged_quantity > 0)
     and not exists (select 1 from public.warehouses where id = v_doc.damaged_warehouse_id and warehouse_type = 'damaged' and is_active) then
    raise exception 'Choose a damaged-goods warehouse for the damaged quantity' using errcode = '23514';
  end if;

  if v_doc.purchase_order_id is not null then
    select status into v_po_status from public.purchase_orders
     where id = v_doc.purchase_order_id and supplier_id = v_doc.supplier_id for update;
    if v_po_status is null or v_po_status not in ('approved', 'partially_received') then
      raise exception 'Purchase order is not open for receiving' using errcode = '23514';
    end if;
  end if;

  for v_item in
    select * from public.goods_receipt_items where goods_receipt_id = p_id order by product_id, id
  loop
    if v_item.quantity > 0 then
      v_inventory := v_inventory + private.move_stock(v_item.product_id, v_doc.warehouse_id, v_item.quantity * v_item.factor,
        'purchase_receipt', v_doc.receipt_date, 'goods_receipt', v_doc.id, v_item.id, v_item.quantity * v_item.unit_cost);
    end if;
    if v_item.damaged_quantity > 0 then
      v_inventory := v_inventory + private.move_stock(v_item.product_id, v_doc.damaged_warehouse_id, v_item.damaged_quantity * v_item.factor,
        'purchase_receipt', v_doc.receipt_date, 'goods_receipt', v_doc.id, v_item.id, v_item.damaged_quantity * v_item.unit_cost);
    end if;

    if v_item.purchase_order_item_id is not null then
      update public.purchase_order_items
         set received_base_quantity = received_base_quantity + (v_item.quantity + v_item.damaged_quantity) * v_item.factor
       where id = v_item.purchase_order_item_id
         and purchase_order_id = v_doc.purchase_order_id
         and product_id = v_item.product_id;
      if not found then
        raise exception 'Receipt line does not match the purchase order line' using errcode = '23514';
      end if;
    end if;
  end loop;

  if v_doc.purchase_order_id is not null then
    update public.purchase_orders po
       set status = case
         when not exists (select 1 from public.purchase_order_items i
                           where i.purchase_order_id = po.id and i.received_base_quantity < i.base_quantity)
         then 'received'
         when exists (select 1 from public.purchase_order_items i
                       where i.purchase_order_id = po.id and i.received_base_quantity > 0)
         then 'partially_received'
         else po.status::text end::public.purchase_order_status
     where po.id = v_doc.purchase_order_id;
  end if;

  -- Differs from the bill only when the receipt settles stock that was issued below zero.
  v_variance := v_doc.total_amount - v_inventory;
  if v_doc.total_amount > 0 or v_inventory <> 0 then
    v_je := private.post_journal(v_doc.receipt_date, 'Goods receipt ' || v_doc.doc_no, 'goods_receipt', v_doc.id,
      jsonb_build_array(
        jsonb_build_object('account', 'INVENTORY', 'debit', greatest(v_inventory, 0), 'credit', greatest(-v_inventory, 0)),
        jsonb_build_object('account', 'INVENTORY_VARIANCE', 'debit', greatest(v_variance, 0), 'credit', greatest(-v_variance, 0)),
        jsonb_build_object('account', private.payable_account(v_doc.supplier_id), 'credit', v_doc.total_amount,
                           'supplier_id', v_doc.supplier_id)));
  end if;

  update public.goods_receipts
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return p_id;
end;
$$;

-- Close an order whose remaining quantity will not be delivered.
alter table public.purchase_orders add column closed_at timestamptz, add column closed_by uuid, add column close_reason text;
select private.restrict_columns('purchase_orders', array[
  'doc_no', 'status', 'approved_at', 'approved_by', 'created_at', 'created_by', 'updated_at', 'updated_by', 'total_amount',
  'closed_at', 'closed_by', 'close_reason']);

create function public.close_purchase_order(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.purchase_order_status;
begin
  perform private.require_permission('purchasing.approve');
  select status into v_status from public.purchase_orders where id = p_id for update;
  if v_status is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_status <> 'partially_received' then
    raise exception 'Only partially received orders can be closed; cancel orders with nothing received' using errcode = '23514';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  update public.purchase_orders
     set status = 'received', closed_at = now(), closed_by = auth.uid(), close_reason = trim(p_reason)
   where id = p_id;
  return p_id;
end;
$$;

-- Ordered, accepted, damaged, rejected and remaining per order line (base units).
create view public.v_purchase_order_progress with (security_invoker = true) as
select i.id as purchase_order_item_id, i.purchase_order_id, i.product_id, i.unit_id, i.factor, i.quantity as ordered_quantity,
       i.base_quantity as ordered_base, i.unit_price, i.line_total,
       coalesce(r.accepted_base, 0) as accepted_base,
       coalesce(r.damaged_base, 0) as damaged_base,
       coalesce(r.rejected_base, 0) as rejected_base,
       greatest(i.base_quantity - coalesce(r.accepted_base, 0) - coalesce(r.damaged_base, 0), 0) as remaining_base
from public.purchase_order_items i
left join (
  select gi.purchase_order_item_id,
         sum(gi.quantity * gi.factor)::bigint as accepted_base,
         sum(gi.damaged_quantity * gi.factor)::bigint as damaged_base,
         sum(gi.rejected_quantity * gi.factor)::bigint as rejected_base
    from public.goods_receipt_items gi
    join public.goods_receipts g on g.id = gi.goods_receipt_id and g.status = 'posted'
   where gi.purchase_order_item_id is not null
   group by gi.purchase_order_item_id) r on r.purchase_order_item_id = i.id;
create index goods_receipt_items_po_item_idx on public.goods_receipt_items (purchase_order_item_id) where purchase_order_item_id is not null;

-- Bills with what was paid. Paid and outstanding are NULL for callers who may not see the
-- supplier's account, instead of a misleading zero.
create view public.v_supplier_invoice_status with (security_invoker = true) as
select si.id as supplier_invoice_id, si.doc_no, si.supplier_id, s.name as supplier_name, s.name_ur as supplier_name_ur, s.is_principal,
       si.invoice_number, si.invoice_date, si.due_date, si.amount, si.receipts_total, si.variance, si.status, si.notes, si.created_at,
       case when private.can_supplier(si.supplier_id, 'view') then coalesce(pa.paid, 0) end as paid_amount,
       case when private.can_supplier(si.supplier_id, 'view') and si.status = 'posted' then si.amount - coalesce(pa.paid, 0) end as outstanding
from public.supplier_invoices si
join public.suppliers s on s.id = si.supplier_id
left join (select supplier_invoice_id, sum(amount) as paid from public.supplier_payment_allocations group by supplier_invoice_id) pa
       on pa.supplier_invoice_id = si.id;

-- Posted receipts that are not on any bill.
create view public.v_unbilled_receipts with (security_invoker = true) as
select g.id as goods_receipt_id, g.doc_no, g.receipt_date, g.supplier_id, g.supplier_reference, g.total_amount, s.is_principal
from public.goods_receipts g
join public.suppliers s on s.id = g.supplier_id
where g.status = 'posted' and g.total_amount > 0
  and not exists (select 1 from public.supplier_invoice_receipts sir where sir.goods_receipt_id = g.id);

revoke all on public.v_purchase_order_progress, public.v_supplier_invoice_status, public.v_unbilled_receipts from anon, authenticated;
grant select on public.v_purchase_order_progress, public.v_supplier_invoice_status, public.v_unbilled_receipts to authenticated;

-- ===========================================================================
-- 6. Atomic saving of drafts (row level security and column privileges apply)
-- ===========================================================================
create function private.require_lines(p_lines jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one line' using errcode = '22023';
  end if;
end;
$$;

create function private.require_draft(p_found boolean) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if not p_found then
    raise exception 'The draft was not found or has already been processed' using errcode = 'P0002';
  end if;
end;
$$;
grant execute on function private.require_lines(jsonb), private.require_draft(boolean) to authenticated;

create function public.save_purchase_order(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  if v_id is null then
    select id into v_id from public.purchase_orders where client_request_id = v_request;
    if v_id is not null then return v_id; end if;
    insert into public.purchase_orders (supplier_id, warehouse_id, order_date, expected_date, notes, client_request_id)
    values ((p_doc ->> 'supplier_id')::uuid, (p_doc ->> 'warehouse_id')::uuid, (p_doc ->> 'date')::date,
            (p_doc ->> 'expected_date')::date, p_doc ->> 'notes', v_request)
    returning id into v_id;
  else
    update public.purchase_orders
       set supplier_id = (p_doc ->> 'supplier_id')::uuid, warehouse_id = (p_doc ->> 'warehouse_id')::uuid,
           order_date = (p_doc ->> 'date')::date, expected_date = (p_doc ->> 'expected_date')::date, notes = p_doc ->> 'notes'
     where id = v_id and status = 'draft';
    perform private.require_draft(found);
    delete from public.purchase_order_items where purchase_order_id = v_id;
  end if;
  insert into public.purchase_order_items (purchase_order_id, product_id, unit_id, quantity, unit_price)
  select v_id, l.product_id, l.unit_id, l.quantity, l.unit_price
    from jsonb_to_recordset(p_lines) as l(product_id uuid, unit_id uuid, quantity bigint, unit_price numeric);
  return v_id;
end;
$$;

create function public.save_goods_receipt(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  if v_id is null then
    select id into v_id from public.goods_receipts where client_request_id = v_request;
    if v_id is not null then return v_id; end if;
    insert into public.goods_receipts (supplier_id, purchase_order_id, warehouse_id, damaged_warehouse_id, receipt_date, supplier_reference, notes, client_request_id)
    values ((p_doc ->> 'supplier_id')::uuid, (p_doc ->> 'purchase_order_id')::uuid, (p_doc ->> 'warehouse_id')::uuid,
            (p_doc ->> 'damaged_warehouse_id')::uuid, (p_doc ->> 'date')::date, p_doc ->> 'supplier_reference', p_doc ->> 'notes', v_request)
    returning id into v_id;
  else
    update public.goods_receipts
       set supplier_id = (p_doc ->> 'supplier_id')::uuid, warehouse_id = (p_doc ->> 'warehouse_id')::uuid,
           damaged_warehouse_id = (p_doc ->> 'damaged_warehouse_id')::uuid, receipt_date = (p_doc ->> 'date')::date,
           supplier_reference = p_doc ->> 'supplier_reference', notes = p_doc ->> 'notes'
     where id = v_id and status = 'draft';
    perform private.require_draft(found);
    delete from public.goods_receipt_items where goods_receipt_id = v_id;
  end if;
  insert into public.goods_receipt_items
    (goods_receipt_id, purchase_order_item_id, product_id, unit_id, expected_quantity, quantity, damaged_quantity, rejected_quantity, unit_cost, notes)
  select v_id, l.purchase_order_item_id, l.product_id, l.unit_id, l.expected_quantity, coalesce(l.quantity, 0),
         coalesce(l.damaged_quantity, 0), coalesce(l.rejected_quantity, 0), l.unit_cost, l.notes
    from jsonb_to_recordset(p_lines) as l(purchase_order_item_id uuid, product_id uuid, unit_id uuid, expected_quantity bigint,
         quantity bigint, damaged_quantity bigint, rejected_quantity bigint, unit_cost numeric, notes text);
  return v_id;
end;
$$;

create function public.save_supplier_invoice(p_id uuid, p_doc jsonb, p_receipts jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  perform private.require_lines(p_receipts);
  if v_id is null then
    insert into public.supplier_invoices (supplier_id, invoice_number, invoice_date, due_date, amount, notes)
    values ((p_doc ->> 'supplier_id')::uuid, trim(p_doc ->> 'invoice_number'), (p_doc ->> 'date')::date, (p_doc ->> 'due_date')::date,
            (p_doc ->> 'amount')::numeric, p_doc ->> 'notes')
    returning id into v_id;
  else
    update public.supplier_invoices
       set invoice_number = trim(p_doc ->> 'invoice_number'), invoice_date = (p_doc ->> 'date')::date,
           due_date = (p_doc ->> 'due_date')::date, amount = (p_doc ->> 'amount')::numeric, notes = p_doc ->> 'notes'
     where id = v_id and status = 'draft';
    perform private.require_draft(found);
    delete from public.supplier_invoice_receipts where supplier_invoice_id = v_id;
  end if;
  insert into public.supplier_invoice_receipts (supplier_invoice_id, goods_receipt_id)
  select v_id, r.value::uuid from jsonb_array_elements_text(p_receipts) r;
  return v_id;
end;
$$;

create function public.save_supplier_return(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  if v_id is null then
    select id into v_id from public.supplier_returns where client_request_id = v_request;
    if v_id is not null then return v_id; end if;
    insert into public.supplier_returns (supplier_id, warehouse_id, goods_receipt_id, return_date, reason, client_request_id)
    values ((p_doc ->> 'supplier_id')::uuid, (p_doc ->> 'warehouse_id')::uuid, (p_doc ->> 'goods_receipt_id')::uuid,
            (p_doc ->> 'date')::date, p_doc ->> 'reason', v_request)
    returning id into v_id;
  else
    update public.supplier_returns
       set supplier_id = (p_doc ->> 'supplier_id')::uuid, warehouse_id = (p_doc ->> 'warehouse_id')::uuid,
           return_date = (p_doc ->> 'date')::date, reason = p_doc ->> 'reason'
     where id = v_id and status = 'draft';
    perform private.require_draft(found);
    delete from public.supplier_return_items where supplier_return_id = v_id;
  end if;
  insert into public.supplier_return_items (supplier_return_id, product_id, unit_id, quantity, unit_price)
  select v_id, l.product_id, l.unit_id, l.quantity, l.unit_price
    from jsonb_to_recordset(p_lines) as l(product_id uuid, unit_id uuid, quantity bigint, unit_price numeric);
  return v_id;
end;
$$;

create function public.save_stock_transfer(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  if v_id is null then
    select id into v_id from public.stock_transfers where client_request_id = v_request;
    if v_id is not null then return v_id; end if;
    insert into public.stock_transfers (from_warehouse_id, to_warehouse_id, transfer_date, notes, client_request_id)
    values ((p_doc ->> 'from_warehouse_id')::uuid, (p_doc ->> 'to_warehouse_id')::uuid, (p_doc ->> 'date')::date, p_doc ->> 'notes', v_request)
    returning id into v_id;
  else
    update public.stock_transfers
       set from_warehouse_id = (p_doc ->> 'from_warehouse_id')::uuid, to_warehouse_id = (p_doc ->> 'to_warehouse_id')::uuid,
           transfer_date = (p_doc ->> 'date')::date, notes = p_doc ->> 'notes'
     where id = v_id and status = 'draft';
    perform private.require_draft(found);
    delete from public.stock_transfer_items where stock_transfer_id = v_id;
  end if;
  insert into public.stock_transfer_items (stock_transfer_id, product_id, unit_id, quantity)
  select v_id, l.product_id, l.unit_id, l.quantity
    from jsonb_to_recordset(p_lines) as l(product_id uuid, unit_id uuid, quantity bigint);
  return v_id;
end;
$$;

-- Opening stock, write-offs and other adjustments. Quantities are signed.
create function public.save_stock_adjustment(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  if p_doc ->> 'kind' = 'count' then
    raise exception 'Count adjustments are created by posting a stock count' using errcode = '22023';
  end if;
  if v_id is null then
    select id into v_id from public.stock_adjustments where client_request_id = v_request;
    if v_id is not null then return v_id; end if;
    insert into public.stock_adjustments (warehouse_id, adjustment_date, kind, reason, client_request_id)
    values ((p_doc ->> 'warehouse_id')::uuid, (p_doc ->> 'date')::date, (p_doc ->> 'kind')::public.adjustment_kind, p_doc ->> 'reason', v_request)
    returning id into v_id;
  else
    update public.stock_adjustments
       set warehouse_id = (p_doc ->> 'warehouse_id')::uuid, adjustment_date = (p_doc ->> 'date')::date,
           kind = (p_doc ->> 'kind')::public.adjustment_kind, reason = p_doc ->> 'reason'
     where id = v_id and status = 'draft';
    perform private.require_draft(found);
    delete from public.stock_adjustment_items where stock_adjustment_id = v_id;
  end if;
  insert into public.stock_adjustment_items (stock_adjustment_id, product_id, unit_id, quantity, unit_cost, notes)
  select v_id, l.product_id, l.unit_id, l.quantity, l.unit_cost, l.notes
    from jsonb_to_recordset(p_lines) as l(product_id uuid, unit_id uuid, quantity bigint, unit_cost numeric, notes text);
  return v_id;
end;
$$;

-- Counted quantities in base units. Lines already saved keep their original system snapshot.
create function public.save_stock_count(p_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  perform private.require_lines(p_lines);
  if v_id is null then
    insert into public.stock_counts (warehouse_id, count_date, notes)
    values ((p_doc ->> 'warehouse_id')::uuid, (p_doc ->> 'date')::date, p_doc ->> 'notes')
    returning id into v_id;
  else
    update public.stock_counts set count_date = (p_doc ->> 'date')::date, notes = p_doc ->> 'notes'
     where id = v_id and status = 'draft';
    perform private.require_draft(found);
    delete from public.stock_count_items
     where stock_count_id = v_id
       and product_id not in (select l.product_id from jsonb_to_recordset(p_lines) as l(product_id uuid));
  end if;
  insert into public.stock_count_items (stock_count_id, product_id, counted_quantity, notes)
  select v_id, l.product_id, l.counted_quantity, l.notes
    from jsonb_to_recordset(p_lines) as l(product_id uuid, counted_quantity bigint, notes text)
  -- Writing product_id takes a new snapshot of the stock on hand, so a saved count is always compared with the stock it was checked against.
  on conflict (stock_count_id, product_id)
  do update set product_id = excluded.product_id, counted_quantity = excluded.counted_quantity, notes = excluded.notes;
  return v_id;
end;
$$;

-- A count is only valid for the stock it was compared with. Goods sold or received between counting
-- and posting would otherwise be put back or taken out again.
create or replace function public.post_stock_count(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.stock_counts%rowtype;
  v_adj_id uuid;
  v_item record;
  v_moved text;
  v_lines integer := 0;
begin
  perform private.require_permission('inventory.adjust');
  select * into v_doc from public.stock_counts where id = p_id for update;
  if v_doc.id is null then raise exception 'Count not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Count % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  perform 1 from public.stock_balances sb
    where sb.warehouse_id = v_doc.warehouse_id
      and sb.product_id in (select ci.product_id from public.stock_count_items ci where ci.stock_count_id = p_id)
    order by sb.product_id for update;

  select string_agg(p.sku, ', ' order by p.sku) into v_moved
    from public.stock_count_items ci
    join public.products p on p.id = ci.product_id
    left join public.stock_balances sb on sb.product_id = ci.product_id and sb.warehouse_id = v_doc.warehouse_id
   where ci.stock_count_id = p_id and ci.system_quantity <> coalesce(sb.on_hand, 0);
  if v_moved is not null then
    raise exception 'Stock moved since it was counted: %. Check these products and save the count again', v_moved using errcode = '23514';
  end if;

  insert into public.stock_adjustments (warehouse_id, adjustment_date, kind, reason)
  values (v_doc.warehouse_id, v_doc.count_date, 'count', 'Physical count ' || v_doc.doc_no)
  returning id into v_adj_id;

  for v_item in
    select ci.product_id, ci.difference, p.base_unit_id
      from public.stock_count_items ci
      join public.products p on p.id = ci.product_id
     where ci.stock_count_id = p_id and ci.difference <> 0
     order by ci.product_id
  loop
    insert into public.stock_adjustment_items (stock_adjustment_id, product_id, unit_id, quantity)
    values (v_adj_id, v_item.product_id, v_item.base_unit_id, v_item.difference);
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

-- A delivery for a sales order, from the warehouse side; dispatch_delivery posts it.
create function public.save_delivery(p_order_id uuid, p_doc jsonb, p_lines jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
begin
  perform private.require_lines(p_lines);
  select id into v_id from public.deliveries where client_request_id = v_request;
  if v_id is not null then return v_id; end if;
  insert into public.deliveries (sales_order_id, vehicle_id, driver_id, delivery_date, notes, client_request_id)
  values (p_order_id, (p_doc ->> 'vehicle_id')::uuid, (p_doc ->> 'driver_id')::uuid, (p_doc ->> 'date')::date, p_doc ->> 'notes', v_request)
  returning id into v_id;
  insert into public.delivery_items (delivery_id, sales_order_item_id, quantity)
  select v_id, l.sales_order_item_id, l.quantity
    from jsonb_to_recordset(p_lines) as l(sales_order_item_id uuid, quantity bigint);
  return v_id;
end;
$$;

-- Product with its units and prices. Prices are only touched when their key is present,
-- so a user who cannot see purchase prices never overwrites them.
create function public.save_product(p_id uuid, p_doc jsonb, p_units jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_base uuid;
  v_unit record;
begin
  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.products (id, sku, barcode, name_en, name_ur, category_id, brand_id, default_supplier_id, base_unit_id, tax_rate, reorder_level, is_active, notes)
    values (v_id, coalesce(p_doc ->> 'sku', ''), nullif(trim(p_doc ->> 'barcode'), ''), p_doc ->> 'name_en', p_doc ->> 'name_ur',
            (p_doc ->> 'category_id')::uuid, (p_doc ->> 'brand_id')::uuid, (p_doc ->> 'default_supplier_id')::uuid,
            (p_doc ->> 'base_unit_id')::uuid, coalesce((p_doc ->> 'tax_rate')::numeric, 0), coalesce((p_doc ->> 'reorder_level')::bigint, 0),
            coalesce((p_doc ->> 'is_active')::boolean, true), p_doc ->> 'notes');
  else
    update public.products
       set sku = coalesce(nullif(trim(p_doc ->> 'sku'), ''), sku), barcode = nullif(trim(p_doc ->> 'barcode'), ''),
           name_en = p_doc ->> 'name_en', name_ur = p_doc ->> 'name_ur', category_id = (p_doc ->> 'category_id')::uuid,
           brand_id = (p_doc ->> 'brand_id')::uuid, default_supplier_id = (p_doc ->> 'default_supplier_id')::uuid,
           tax_rate = coalesce((p_doc ->> 'tax_rate')::numeric, 0), reorder_level = coalesce((p_doc ->> 'reorder_level')::bigint, 0),
           is_active = coalesce((p_doc ->> 'is_active')::boolean, true), notes = p_doc ->> 'notes'
     where id = v_id;
    if not found then raise exception 'Product not found' using errcode = 'P0002'; end if;
  end if;
  select base_unit_id into v_base from public.products where id = v_id;

  delete from public.product_units
   where product_id = v_id and unit_id <> v_base
     and unit_id not in (select (u ->> 'unit_id')::uuid from jsonb_array_elements(coalesce(p_units, '[]')) u);

  for v_unit in select u as doc, (u ->> 'unit_id')::uuid as unit_id from jsonb_array_elements(coalesce(p_units, '[]')) u loop
    if not exists (select 1 from public.product_units where product_id = v_id and unit_id = v_unit.unit_id) then
      insert into public.product_units (product_id, unit_id, factor) values (v_id, v_unit.unit_id, (v_unit.doc ->> 'factor')::bigint);
    elsif v_unit.unit_id <> v_base then
      update public.product_units set factor = (v_unit.doc ->> 'factor')::bigint where product_id = v_id and unit_id = v_unit.unit_id;
    end if;
    update public.product_units set barcode = nullif(trim(v_unit.doc ->> 'barcode'), '') where product_id = v_id and unit_id = v_unit.unit_id;
    if v_unit.doc ? 'sale_price' then
      update public.product_units set sale_price = (v_unit.doc ->> 'sale_price')::numeric where product_id = v_id and unit_id = v_unit.unit_id;
    end if;
    if v_unit.doc ? 'purchase_price' then
      update public.product_units set purchase_price = (v_unit.doc ->> 'purchase_price')::numeric where product_id = v_id and unit_id = v_unit.unit_id;
    end if;
  end loop;
  return v_id;
end;
$$;

create function public.save_supplier(p_id uuid, p_doc jsonb, p_contacts jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null then
    v_id := gen_random_uuid();
    insert into public.suppliers (id, code, name, name_ur, phone, email, address, ntn, payment_terms_days, is_active, notes)
    values (v_id, coalesce(p_doc ->> 'code', ''), p_doc ->> 'name', p_doc ->> 'name_ur', p_doc ->> 'phone', p_doc ->> 'email', p_doc ->> 'address',
            p_doc ->> 'ntn', (p_doc ->> 'payment_terms_days')::integer, coalesce((p_doc ->> 'is_active')::boolean, true), p_doc ->> 'notes');
  else
    update public.suppliers
       set code = coalesce(nullif(trim(p_doc ->> 'code'), ''), code), name = p_doc ->> 'name', name_ur = p_doc ->> 'name_ur',
           phone = p_doc ->> 'phone', email = p_doc ->> 'email', address = p_doc ->> 'address', ntn = p_doc ->> 'ntn',
           payment_terms_days = (p_doc ->> 'payment_terms_days')::integer, is_active = coalesce((p_doc ->> 'is_active')::boolean, true),
           notes = p_doc ->> 'notes'
     where id = v_id;
    if not found then raise exception 'Supplier not found' using errcode = 'P0002'; end if;
    delete from public.supplier_contacts where supplier_id = v_id;
  end if;
  insert into public.supplier_contacts (supplier_id, name, designation, phone, email, is_primary)
  select v_id, c.name, c.designation, c.phone, c.email, coalesce(c.is_primary, false)
    from jsonb_to_recordset(coalesce(p_contacts, '[]'::jsonb)) as c(name text, designation text, phone text, email text, is_primary boolean);
  return v_id;
end;
$$;

-- Record, post and allocate a supplier payment in one transaction.
-- p_allocations: [{ "invoice_id": uuid, "amount": numeric }], may be empty (payment on account).
create function public.record_supplier_payment(p_doc jsonb, p_allocations jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_supplier uuid := (p_doc ->> 'supplier_id')::uuid;
  v_request uuid := (p_doc ->> 'client_request_id')::uuid;
  v_allocation record;
begin
  perform private.require_permission(private.supplier_permission(v_supplier, 'pay'));
  select id into v_id from public.supplier_payments where client_request_id = v_request and supplier_id = v_supplier;
  if v_id is not null then return v_id; end if;
  insert into public.supplier_payments (supplier_id, payment_date, amount, financial_account_id, method, reference, notes, client_request_id)
  values (v_supplier, coalesce((p_doc ->> 'date')::date, private.business_today()), (p_doc ->> 'amount')::numeric,
          (p_doc ->> 'financial_account_id')::uuid, (p_doc ->> 'method')::public.payment_method,
          p_doc ->> 'reference', p_doc ->> 'notes', v_request)
  returning id into v_id;
  perform public.post_supplier_payment(v_id);
  for v_allocation in select * from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as a(invoice_id uuid, amount numeric) loop
    perform public.allocate_supplier_payment(v_id, v_allocation.invoice_id, v_allocation.amount);
  end loop;
  return v_id;
end;
$$;

-- ===========================================================================
-- 7. Reports
-- ===========================================================================

-- Current stock per product, optionally for one warehouse. Cost columns need costs.view.
create function public.report_stock(p_warehouse_id uuid default null, p_category_id uuid default null)
returns table (product_id uuid, sku text, barcode text, name_en text, name_ur text, category_en text, category_ur text,
               brand_en text, brand_ur text, unit_en text, unit_ur text, on_hand bigint, reserved bigint, available bigint,
               damaged bigint, reorder_level bigint, unit_cost numeric, stock_value numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_costs constant boolean := private.has_permission('costs.view');
begin
  perform private.require_permission('inventory.view');
  return query
  select p.id, p.sku, p.barcode, p.name_en, p.name_ur, c.name_en, c.name_ur, b.name_en, b.name_ur, u.name_en, u.name_ur,
         coalesce(s.on_hand, 0)::bigint, coalesce(s.reserved, 0)::bigint, coalesce(s.available, 0)::bigint, coalesce(s.damaged, 0)::bigint,
         p.reorder_level,
         case when v_costs then coalesce(iv.avg_unit_cost, 0) end,
         case when not v_costs then null
              when p_warehouse_id is null then coalesce(iv.total_value, 0)
              else round(coalesce(s.on_hand, 0) * coalesce(nullif(iv.avg_unit_cost, 0), iv.last_unit_cost, 0), 2) end
    from public.products p
    join public.units u on u.id = p.base_unit_id
    left join public.product_categories c on c.id = p.category_id
    left join public.brands b on b.id = p.brand_id
    left join public.inventory_valuation iv on iv.product_id = p.id
    left join (select sb.product_id, sum(sb.on_hand) as on_hand, sum(sb.reserved) as reserved,
                      sum(sb.on_hand - sb.reserved) filter (where w.warehouse_type <> 'damaged') as available,
                      sum(sb.on_hand) filter (where w.warehouse_type = 'damaged') as damaged
                 from public.stock_balances sb
                 join public.warehouses w on w.id = sb.warehouse_id
                where p_warehouse_id is null or sb.warehouse_id = p_warehouse_id
                group by sb.product_id) s on s.product_id = p.id
   where (p_category_id is null or p.category_id = p_category_id)
     and (p.is_active or coalesce(s.on_hand, 0) <> 0)
     and (p_warehouse_id is null or s.product_id is not null)
   order by p.name_en, p.sku;
end;
$$;

-- Does the stock agree with itself and with the Inventory account?
create function public.inventory_reconciliation() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_valuation numeric(18,2);
  v_ledger numeric(18,2);
begin
  perform private.require_permission('costs.view');
  select coalesce(sum(total_value), 0) into v_valuation from public.inventory_valuation;
  select coalesce(sum(l.debit - l.credit), 0) into v_ledger
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
   where l.account_id = private.account_id('INVENTORY');
  return jsonb_build_object(
    'valuation', private.money_text(v_valuation),
    'ledger', private.money_text(v_ledger),
    'difference', private.money_text(v_valuation - v_ledger),
    'quantity_mismatches', (
      select count(*) from public.inventory_valuation iv
       where iv.quantity <> coalesce((select sum(sb.on_hand) from public.stock_balances sb where sb.product_id = iv.product_id), 0)
          or iv.quantity <> coalesce((select sum(m.quantity) from public.stock_movements m where m.product_id = iv.product_id), 0)));
end;
$$;

create function public.report_stock_movements(
  p_from date, p_to date, p_product_id uuid default null, p_warehouse_id uuid default null, p_type text default null,
  p_limit integer default 50, p_offset integer default 0)
returns table (id bigint, movement_date date, product_id uuid, sku text, name_en text, name_ur text, unit_en text, unit_ur text,
               warehouse_en text, warehouse_ur text, movement_type public.stock_movement_type, quantity bigint, balance_after bigint,
               value_change numeric, negative_override boolean, source_type text, doc_no text, created_at timestamptz, created_by_name text,
               total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_costs constant boolean := private.has_permission('costs.view');
begin
  perform private.require_permission('inventory.view');
  return query
  with page as (
    select m.*, count(*) over () as total
      from public.stock_movements m
     where m.movement_date between p_from and p_to
       and (p_product_id is null or m.product_id = p_product_id)
       and (p_warehouse_id is null or m.warehouse_id = p_warehouse_id)
       and (p_type is null or m.movement_type::text = p_type)
     order by m.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 5000) offset greatest(coalesce(p_offset, 0), 0)
  )
  select pg.id, pg.movement_date, pg.product_id, p.sku, p.name_en, p.name_ur, u.name_en, u.name_ur, w.name_en, w.name_ur,
         pg.movement_type, pg.quantity, pg.balance_after, case when v_costs then pg.value_change end, pg.negative_override, pg.source_type,
         coalesce(gr.doc_no, sr.doc_no, si.doc_no, cr.doc_no, sa.doc_no, st.doc_no), pg.created_at, pr.full_name, pg.total
    from page pg
    join public.products p on p.id = pg.product_id
    join public.units u on u.id = p.base_unit_id
    join public.warehouses w on w.id = pg.warehouse_id
    left join public.profiles pr on pr.id = pg.created_by
    left join public.goods_receipts gr on pg.source_type = 'goods_receipt' and gr.id = pg.source_id
    left join public.supplier_returns sr on pg.source_type = 'supplier_return' and sr.id = pg.source_id
    left join public.sales_invoices si on pg.source_type = 'sales_invoice' and si.id = pg.source_id
    left join public.customer_returns cr on pg.source_type = 'customer_return' and cr.id = pg.source_id
    left join public.stock_adjustments sa on pg.source_type = 'stock_adjustment' and sa.id = pg.source_id
    left join public.stock_transfers st on pg.source_type = 'stock_transfer' and st.id = pg.source_id
   order by pg.id desc;
end;
$$;

-- Posted receipts with what was received and, for callers who may see it, what was paid.
create function public.report_purchases(p_from date, p_to date, p_supplier_id uuid default null, p_principal boolean default null)
returns table (goods_receipt_id uuid, doc_no text, receipt_date date, supplier_en text, supplier_ur text, is_principal boolean,
               order_no text, ordered_base bigint, received_base bigint, accepted_base bigint, damaged_base bigint, rejected_base bigint,
               total_cost numeric, invoice_no text, invoice_amount numeric, paid_amount numeric, remaining numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_payables constant boolean := private.has_permission('payables.view');
  v_company constant boolean := private.has_permission('company.view');
begin
  perform private.require_permission('purchasing.view');
  return query
  select g.id, g.doc_no, g.receipt_date, s.name, s.name_ur, s.is_principal, po.doc_no,
         (select sum(poi.base_quantity)::bigint from public.purchase_order_items poi where poi.purchase_order_id = po.id),
         (i.accepted + i.damaged + i.rejected)::bigint, i.accepted::bigint, i.damaged::bigint, i.rejected::bigint, g.total_amount,
         b.invoice_number, b.bill_share,
         case when v.visible then b.paid_share end,
         case when v.visible then coalesce(b.bill_share - b.paid_share, g.total_amount) end
    from public.goods_receipts g
    join public.suppliers s on s.id = g.supplier_id
    cross join lateral (select case when s.is_principal then v_company else v_payables end as visible) v
    cross join lateral (select coalesce(sum(gi.quantity * gi.factor), 0) as accepted, coalesce(sum(gi.damaged_quantity * gi.factor), 0) as damaged,
                               coalesce(sum(gi.rejected_quantity * gi.factor), 0) as rejected
                          from public.goods_receipt_items gi where gi.goods_receipt_id = g.id) i
    left join public.purchase_orders po on po.id = g.purchase_order_id
    -- A bill may cover several receipts. Its amount and what was paid are split by the receipts' value with
    -- cumulative rounding, so the rows add up to the bill exactly and nothing is counted twice.
    left join (
      select x.goods_receipt_id, x.invoice_number,
             coalesce(round(x.amount * x.upto / x.total, 2) - round(x.amount * (x.upto - x.own) / x.total, 2),
                      case when x.position = 1 then x.amount else 0 end) as bill_share,
             coalesce(round(x.paid * x.upto / x.total, 2) - round(x.paid * (x.upto - x.own) / x.total, 2),
                      case when x.position = 1 then x.paid else 0 end) as paid_share
        from (
          select sir.goods_receipt_id, inv.invoice_number, inv.amount, coalesce(pa.paid, 0) as paid, gr.total_amount as own,
                 sum(gr.total_amount) over w as upto,
                 nullif(sum(gr.total_amount) over (partition by inv.id), 0) as total,
                 row_number() over w as position
            from public.supplier_invoice_receipts sir
            join public.supplier_invoices inv on inv.id = sir.supplier_invoice_id and inv.status = 'posted'
            join public.goods_receipts gr on gr.id = sir.goods_receipt_id
            left join (select a.supplier_invoice_id, sum(a.amount) as paid from public.supplier_payment_allocations a group by a.supplier_invoice_id) pa
                   on pa.supplier_invoice_id = inv.id
          window w as (partition by inv.id order by gr.receipt_date, gr.doc_no)) x) b on b.goods_receipt_id = g.id
   where g.status = 'posted' and g.receipt_date between p_from and p_to
     and (p_supplier_id is null or g.supplier_id = p_supplier_id)
     and (p_principal is null or s.is_principal = p_principal)
   order by g.receipt_date desc, g.doc_no desc;
end;
$$;

-- Supplier accounts for a period, from the payables ledger.
create function public.report_suppliers(p_from date, p_to date)
returns table (supplier_id uuid, code text, name text, name_ur text, is_principal boolean, opening numeric, purchases numeric,
               bill_differences numeric, returns numeric, payments numeric, other numeric, closing numeric, open_orders numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_payables constant boolean := private.has_permission('payables.view');
  v_company constant boolean := private.has_permission('company.view');
  v_purchasing constant boolean := private.has_permission('purchasing.view');
begin
  if not v_company then
    perform private.require_permission('payables.view');
  end if;
  return query
  select s.id, s.code, s.name, s.name_ur, s.is_principal,
         coalesce(l.opening, 0), coalesce(l.purchases, 0), coalesce(l.differences, 0), coalesce(l.returned, 0), coalesce(l.paid, 0),
         coalesce(l.closing - l.opening - l.purchases - l.differences + l.returned + l.paid, 0), coalesce(l.closing, 0),
         case when v_purchasing then coalesce(o.open_value, 0) end
    from public.suppliers s
    left join (
      select jl.supplier_id,
             coalesce(sum(jl.credit - jl.debit) filter (where e.entry_date < p_from), 0) as opening,
             coalesce(sum(jl.credit - jl.debit) filter (where e.entry_date >= p_from and e.source_type = 'goods_receipt'), 0) as purchases,
             coalesce(sum(jl.credit - jl.debit) filter (where e.entry_date >= p_from and e.source_type = 'supplier_invoice'), 0) as differences,
             coalesce(sum(jl.debit - jl.credit) filter (where e.entry_date >= p_from and e.source_type = 'supplier_return'), 0) as returned,
             coalesce(sum(jl.debit - jl.credit) filter (where e.entry_date >= p_from and e.source_type = 'supplier_payment'), 0) as paid,
             coalesce(sum(jl.credit - jl.debit), 0) as closing
        from public.journal_entry_lines jl
        join public.journal_entries e on e.id = jl.journal_entry_id and e.status = 'posted' and e.entry_date <= p_to
        join public.chart_of_accounts a on a.id = jl.account_id and a.system_key in ('AP_PRINCIPAL', 'AP_SUPPLIERS')
       where jl.supplier_id is not null
       group by jl.supplier_id) l on l.supplier_id = s.id
    left join (
      select po.supplier_id, sum(greatest(poi.base_quantity - poi.received_base_quantity, 0) * poi.unit_price / poi.factor)::numeric(18,2) as open_value
        from public.purchase_orders po
        join public.purchase_order_items poi on poi.purchase_order_id = po.id
       where po.status in ('approved', 'partially_received')
       group by po.supplier_id) o on o.supplier_id = s.id
   where case when s.is_principal then v_company else v_payables end
     and (s.is_active or coalesce(l.closing, 0) <> 0)
   order by s.is_principal desc, s.name;
end;
$$;

create function public.report_low_stock()
returns table (product_id uuid, sku text, name_en text, name_ur text, unit_en text, unit_ur text, available bigint, reorder_level bigint,
               shortage bigint, on_order bigint, supplier_en text, supplier_ur text, last_received date)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('inventory.view');
  return query
  select p.id, p.sku, p.name_en, p.name_ur, u.name_en, u.name_ur, coalesce(s.available, 0)::bigint, p.reorder_level,
         (p.reorder_level - coalesce(s.available, 0))::bigint, coalesce(o.on_order, 0)::bigint, sup.name, sup.name_ur,
         (select max(m.movement_date) from public.stock_movements m where m.product_id = p.id and m.movement_type = 'purchase_receipt')
    from public.products p
    join public.units u on u.id = p.base_unit_id
    left join public.suppliers sup on sup.id = p.default_supplier_id
    left join (select sb.product_id, sum(sb.on_hand - sb.reserved) as available
                 from public.stock_balances sb
                 join public.warehouses w on w.id = sb.warehouse_id and w.warehouse_type <> 'damaged'
                group by sb.product_id) s on s.product_id = p.id
    left join (select poi.product_id, sum(greatest(poi.base_quantity - poi.received_base_quantity, 0)) as on_order
                 from public.purchase_order_items poi
                 join public.purchase_orders po on po.id = poi.purchase_order_id and po.status in ('approved', 'partially_received')
                group by poi.product_id) o on o.product_id = p.id
   where p.is_active and p.reorder_level > 0 and coalesce(s.available, 0) <= p.reorder_level
   order by coalesce(s.available, 0)::numeric / p.reorder_level, p.name_en;
end;
$$;

-- Damaged goods now, and how they came in and left during the period (base units).
create function public.report_damaged_stock(p_from date, p_to date)
returns table (product_id uuid, sku text, name_en text, name_ur text, unit_en text, unit_ur text, on_hand bigint, stock_value numeric,
               received_damaged bigint, customer_returns bigint, moved_in bigint, written_off bigint, returned_to_supplier bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_costs constant boolean := private.has_permission('costs.view');
begin
  perform private.require_permission('inventory.view');
  return query
  select p.id, p.sku, p.name_en, p.name_ur, u.name_en, u.name_ur, coalesce(b.on_hand, 0)::bigint,
         case when v_costs then round(coalesce(b.on_hand, 0) * coalesce(nullif(iv.avg_unit_cost, 0), iv.last_unit_cost, 0), 2) end,
         coalesce(m.received, 0)::bigint, coalesce(m.customer, 0)::bigint, coalesce(m.moved, 0)::bigint,
         coalesce(m.written_off, 0)::bigint, coalesce(m.to_supplier, 0)::bigint
    from public.products p
    join public.units u on u.id = p.base_unit_id
    left join public.inventory_valuation iv on iv.product_id = p.id
    left join (select sb.product_id, sum(sb.on_hand) as on_hand from public.stock_balances sb
                 join public.warehouses w on w.id = sb.warehouse_id and w.warehouse_type = 'damaged' group by sb.product_id) b on b.product_id = p.id
    left join (select sm.product_id,
                      sum(sm.quantity) filter (where sm.movement_type = 'purchase_receipt') as received,
                      sum(sm.quantity) filter (where sm.movement_type = 'sales_return') as customer,
                      sum(sm.quantity) filter (where sm.movement_type = 'transfer_in') as moved,
                      -sum(sm.quantity) filter (where sm.movement_type = 'write_off') as written_off,
                      -sum(sm.quantity) filter (where sm.movement_type = 'purchase_return') as to_supplier
                 from public.stock_movements sm
                 join public.warehouses w on w.id = sm.warehouse_id and w.warehouse_type = 'damaged'
                where sm.movement_date between p_from and p_to
                group by sm.product_id) m on m.product_id = p.id
   where coalesce(b.on_hand, 0) <> 0 or m.product_id is not null
   order by p.name_en, p.sku;
end;
$$;

-- Sales, cost and margin per product from posted invoices and returns, before sales tax.
create function public.report_product_profitability(p_from date, p_to date)
returns table (product_id uuid, sku text, name_en text, name_ur text, unit_en text, unit_ur text, quantity bigint,
               net_sales numeric, cost numeric, gross_profit numeric, margin_percent numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('costs.view');
  return query
  select p.id, p.sku, p.name_en, p.name_ur, u.name_en, u.name_ur, t.qty::bigint, t.sales, t.cogs, t.sales - t.cogs,
         case when t.sales <> 0 then round((t.sales - t.cogs) * 100 / t.sales, 1) end
    from (
      select x.pid, sum(x.qty) as qty, sum(x.sales)::numeric(18,2) as sales, sum(x.cogs)::numeric(18,2) as cogs
        from (
          select it.product_id as pid, it.base_quantity as qty, it.line_net as sales, coalesce(it.cost_amount, 0) as cogs
            from public.sales_invoice_items it
            join public.sales_invoices i on i.id = it.sales_invoice_id and i.status = 'posted'
           where i.invoice_date between p_from and p_to
          union all
          select ri.product_id, -ri.base_quantity, -ri.line_net, -coalesce(ri.cost_amount, 0)
            from public.customer_return_items ri
            join public.customer_returns r on r.id = ri.customer_return_id and r.status = 'posted'
           where r.return_date between p_from and p_to) x
       group by x.pid) t
    join public.products p on p.id = t.pid
    join public.units u on u.id = p.base_unit_id
   order by t.sales - t.cogs desc, p.name_en;
end;
$$;

-- Headline figures for one procurement workflow (main company or external suppliers).
create function public.procurement_summary(p_principal boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_account constant boolean := private.has_permission(case when p_principal then 'company.view' else 'payables.view' end);
  v_month constant date := date_trunc('month', private.business_today())::date;
  v_open record;
  v_unbilled record;
  v_bills record;
  v_ledger record;
begin
  perform private.require_permission('purchasing.view');
  select count(distinct po.id) as orders,
         coalesce(sum(greatest(i.base_quantity - i.received_base_quantity, 0) * i.unit_price / i.factor), 0) as remaining
    into v_open
    from public.purchase_orders po
    join public.suppliers s on s.id = po.supplier_id and s.is_principal = p_principal
    join public.purchase_order_items i on i.purchase_order_id = po.id
   where po.status in ('approved', 'partially_received');
  select count(*) as receipts, coalesce(sum(g.total_amount), 0) as amount into v_unbilled
    from public.goods_receipts g
    join public.suppliers s on s.id = g.supplier_id and s.is_principal = p_principal
   where g.status = 'posted' and not exists (select 1 from public.supplier_invoice_receipts sir where sir.goods_receipt_id = g.id);
  select count(*) filter (where b.outstanding > 0) as unpaid, coalesce(sum(b.outstanding) filter (where b.outstanding > 0), 0) as amount into v_bills
    from (select si.amount - coalesce((select sum(a.amount) from public.supplier_payment_allocations a where a.supplier_invoice_id = si.id), 0) as outstanding
            from public.supplier_invoices si
            join public.suppliers s on s.id = si.supplier_id and s.is_principal = p_principal
           where si.status = 'posted') b;
  select coalesce(sum(l.credit - l.debit), 0) as balance,
         coalesce(sum(l.credit - l.debit) filter (where e.source_type = 'goods_receipt' and e.entry_date >= v_month), 0) as purchased,
         coalesce(sum(l.debit - l.credit) filter (where e.source_type = 'supplier_payment' and e.entry_date >= v_month), 0) as paid
    into v_ledger
    from public.journal_entry_lines l
    join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
   where l.account_id = private.account_id(case when p_principal then 'AP_PRINCIPAL' else 'AP_SUPPLIERS' end);

  return jsonb_strip_nulls(jsonb_build_object(
    'open_orders', v_open.orders, 'open_value', private.money_text(v_open.remaining),
    'unbilled_receipts', v_unbilled.receipts, 'unbilled_amount', private.money_text(v_unbilled.amount),
    'purchased_month', private.money_text(v_ledger.purchased),
    'balance', case when v_account then private.money_text(v_ledger.balance) end,
    'paid_month', case when v_account then private.money_text(v_ledger.paid) end,
    'unpaid_bills', case when v_account then v_bills.unpaid end,
    'unpaid_amount', case when v_account then private.money_text(v_bills.amount) end));
end;
$$;

-- Someone who may pay only the main company needs to choose the account it is paid from.
drop policy "select" on public.financial_accounts;
create policy "select" on public.financial_accounts for select to authenticated using (
  (select private.has_permission('cash_bank.view')) or (select private.has_permission('receivables.collect'))
  or (select private.has_permission('payables.pay')) or (select private.has_permission('company.pay'))
  or (select private.has_permission('expenses.create')) or (select private.has_permission('payroll.pay')));

-- ===========================================================================
-- 8. Privileges and indexes
-- ===========================================================================
revoke execute on function
  private.assign_code(), private.negative_stock_allowed(), private.move_stock(uuid, uuid, bigint, public.stock_movement_type, date, text, uuid, uuid, numeric, boolean, bigint)
from public, anon, authenticated;
revoke execute on function private.require_lines(jsonb), private.require_draft(boolean) from public, anon;

revoke execute on function
  public.close_purchase_order(uuid, text), public.save_purchase_order(uuid, jsonb, jsonb), public.save_goods_receipt(uuid, jsonb, jsonb),
  public.save_supplier_invoice(uuid, jsonb, jsonb), public.save_supplier_return(uuid, jsonb, jsonb), public.save_stock_transfer(uuid, jsonb, jsonb),
  public.save_stock_adjustment(uuid, jsonb, jsonb), public.save_stock_count(uuid, jsonb, jsonb), public.save_delivery(uuid, jsonb, jsonb),
  public.save_product(uuid, jsonb, jsonb), public.save_supplier(uuid, jsonb, jsonb), public.record_supplier_payment(jsonb, jsonb), public.report_stock(uuid, uuid),
  public.inventory_reconciliation(), public.report_stock_movements(date, date, uuid, uuid, text, integer, integer),
  public.report_purchases(date, date, uuid, boolean), public.report_suppliers(date, date), public.report_low_stock(),
  public.report_damaged_stock(date, date), public.report_product_profitability(date, date), public.procurement_summary(boolean)
from public, anon;
grant execute on function
  public.close_purchase_order(uuid, text), public.save_purchase_order(uuid, jsonb, jsonb), public.save_goods_receipt(uuid, jsonb, jsonb),
  public.save_supplier_invoice(uuid, jsonb, jsonb), public.save_supplier_return(uuid, jsonb, jsonb), public.save_stock_transfer(uuid, jsonb, jsonb),
  public.save_stock_adjustment(uuid, jsonb, jsonb), public.save_stock_count(uuid, jsonb, jsonb), public.save_delivery(uuid, jsonb, jsonb),
  public.save_product(uuid, jsonb, jsonb), public.save_supplier(uuid, jsonb, jsonb), public.record_supplier_payment(jsonb, jsonb), public.report_stock(uuid, uuid),
  public.inventory_reconciliation(), public.report_stock_movements(date, date, uuid, uuid, text, integer, integer),
  public.report_purchases(date, date, uuid, boolean), public.report_suppliers(date, date), public.report_low_stock(),
  public.report_damaged_stock(date, date), public.report_product_profitability(date, date), public.procurement_summary(boolean)
to authenticated;

create index stock_movements_recent_idx on public.stock_movements (product_id, id desc);
create index goods_receipts_order_idx on public.goods_receipts (purchase_order_id) where purchase_order_id is not null;
create index purchase_orders_open_idx on public.purchase_orders (supplier_id) where status in ('approved', 'partially_received');
create index sales_order_items_reserved_idx on public.sales_order_items (product_id) where reserved_base_quantity > 0;
