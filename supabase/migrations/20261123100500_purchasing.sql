-- Purchasing: purchase orders, goods receipts, supplier invoices, payments, returns.
-- The main company (suppliers.is_principal) uses the AP_PRINCIPAL control account,
-- giving it a ledger separate from other suppliers.

create function private.payable_account(p_supplier_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when is_principal then 'AP_PRINCIPAL' else 'AP_SUPPLIERS' end
    from public.suppliers where id = p_supplier_id;
$$;

-- ---------------------------------------------------------------------------
-- Purchase orders
-- ---------------------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  supplier_id uuid not null references public.suppliers (id),
  warehouse_id uuid not null references public.warehouses (id),
  order_date date not null default current_date,
  expected_date date,
  status public.purchase_order_status not null default 'draft',
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
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id, order_date);

create trigger purchase_orders_doc_no
  before insert on public.purchase_orders
  for each row execute function private.assign_doc_no('PO');

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  unit_id uuid not null references public.units (id),
  factor bigint not null,
  quantity bigint not null check (quantity > 0),
  base_quantity bigint generated always as (quantity * factor) stored,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  line_total numeric(18,2) generated always as (quantity * unit_price) stored,
  received_base_quantity bigint not null default 0 check (received_base_quantity >= 0)
);
create index purchase_order_items_header_idx on public.purchase_order_items (purchase_order_id);

create trigger purchase_order_items_factor
  before insert or update of product_id, unit_id on public.purchase_order_items
  for each row execute function private.set_line_factor();
create trigger purchase_order_items_total
  after insert or update or delete on public.purchase_order_items
  for each row execute function private.recalc_header_total('purchase_orders', 'purchase_order_id');

create function public.approve_purchase_order(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.purchase_order_status;
begin
  perform private.require_permission('purchasing.approve');
  select status into v_status from public.purchase_orders where id = p_id for update;
  if v_status is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_status <> 'draft' then raise exception 'Only draft purchase orders can be approved' using errcode = '23514'; end if;
  if not exists (select 1 from public.purchase_order_items where purchase_order_id = p_id) then
    raise exception 'Purchase order has no lines' using errcode = '23514';
  end if;
  update public.purchase_orders set status = 'approved', approved_at = now(), approved_by = auth.uid() where id = p_id;
  return p_id;
end;
$$;

create function public.cancel_purchase_order(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.purchase_order_status;
begin
  perform private.require_permission('purchasing.approve');
  select status into v_status from public.purchase_orders where id = p_id for update;
  if v_status is null then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_status not in ('draft', 'approved') then
    raise exception 'Purchase order with status % cannot be cancelled', v_status using errcode = '23514';
  end if;
  update public.purchase_orders set status = 'cancelled' where id = p_id;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Goods receipts. Posting adds stock at the line value and raises the payable.
-- ---------------------------------------------------------------------------
create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  supplier_id uuid not null references public.suppliers (id),
  purchase_order_id uuid references public.purchase_orders (id),
  warehouse_id uuid not null references public.warehouses (id),
  receipt_date date not null default current_date,
  -- Supplier delivery challan / company dispatch note number.
  supplier_reference text,
  status public.document_status not null default 'draft',
  total_amount numeric(18,2) not null default 0,
  notes text,
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  client_request_id uuid unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index goods_receipts_supplier_idx on public.goods_receipts (supplier_id, receipt_date);

create trigger goods_receipts_doc_no
  before insert on public.goods_receipts
  for each row execute function private.assign_doc_no('GRN');

create table public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts (id) on delete cascade,
  purchase_order_item_id uuid references public.purchase_order_items (id),
  product_id uuid not null references public.products (id),
  unit_id uuid not null references public.units (id),
  factor bigint not null,
  -- Quantity stated on the supplier's document; NULL if not provided.
  expected_quantity bigint check (expected_quantity is null or expected_quantity >= 0),
  quantity bigint not null check (quantity > 0),
  base_quantity bigint generated always as (quantity * factor) stored,
  unit_cost numeric(18,2) not null check (unit_cost >= 0),
  line_total numeric(18,2) generated always as (quantity * unit_cost) stored,
  notes text
);
create index goods_receipt_items_header_idx on public.goods_receipt_items (goods_receipt_id);

create trigger goods_receipt_items_factor
  before insert or update of product_id, unit_id on public.goods_receipt_items
  for each row execute function private.set_line_factor();
create trigger goods_receipt_items_total
  after insert or update or delete on public.goods_receipt_items
  for each row execute function private.recalc_header_total('goods_receipts', 'goods_receipt_id');

create function public.post_goods_receipt(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.goods_receipts%rowtype;
  v_item record;
  v_po_status public.purchase_order_status;
  v_je uuid;
begin
  perform private.require_permission('purchasing.post');
  select * into v_doc from public.goods_receipts where id = p_id for update;
  if v_doc.id is null then raise exception 'Goods receipt not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Goods receipt % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.goods_receipt_items where goods_receipt_id = p_id) then
    raise exception 'Goods receipt has no lines' using errcode = '23514';
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
    perform private.move_stock(v_item.product_id, v_doc.warehouse_id, v_item.base_quantity, 'purchase_receipt',
      v_doc.receipt_date, 'goods_receipt', v_doc.id, v_item.id, v_item.line_total);

    if v_item.purchase_order_item_id is not null then
      update public.purchase_order_items
         set received_base_quantity = received_base_quantity + v_item.base_quantity
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
         then 'received' else 'partially_received' end::public.purchase_order_status
     where po.id = v_doc.purchase_order_id;
  end if;

  if v_doc.total_amount > 0 then
    v_je := private.post_journal(v_doc.receipt_date, 'Goods receipt ' || v_doc.doc_no, 'goods_receipt', v_doc.id,
      jsonb_build_array(
        jsonb_build_object('account', 'INVENTORY', 'debit', v_doc.total_amount),
        jsonb_build_object('account', private.payable_account(v_doc.supplier_id), 'credit', v_doc.total_amount,
                           'supplier_id', v_doc.supplier_id)));
  end if;

  update public.goods_receipts
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier invoices: the supplier's bill, matched to posted receipts. Any
-- difference to the receipts' value is posted to inventory variance so the
-- payable equals what the supplier actually billed.
-- ---------------------------------------------------------------------------
create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  supplier_id uuid not null references public.suppliers (id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  amount numeric(18,2) not null check (amount > 0),
  receipts_total numeric(18,2),
  variance numeric(18,2),
  attachment_path text,
  notes text,
  status public.document_status not null default 'draft',
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  posted_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (supplier_id, invoice_number),
  check (due_date is null or due_date >= invoice_date)
);

create trigger supplier_invoices_doc_no
  before insert on public.supplier_invoices
  for each row execute function private.assign_doc_no('SBL');

create table public.supplier_invoice_receipts (
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  goods_receipt_id uuid not null unique references public.goods_receipts (id),
  primary key (supplier_invoice_id, goods_receipt_id)
);

create function public.post_supplier_invoice(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.supplier_invoices%rowtype;
  v_receipts numeric(18,2);
  v_variance numeric(18,2);
  v_ap text;
  v_je uuid;
begin
  perform private.require_permission('purchasing.post');
  select * into v_doc from public.supplier_invoices where id = p_id for update;
  if v_doc.id is null then raise exception 'Supplier invoice not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Supplier invoice % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.supplier_invoice_receipts where supplier_invoice_id = p_id) then
    raise exception 'Link at least one goods receipt to the invoice' using errcode = '23514';
  end if;
  if exists (select 1 from public.supplier_invoice_receipts sir
               join public.goods_receipts gr on gr.id = sir.goods_receipt_id
              where sir.supplier_invoice_id = p_id
                and (gr.supplier_id <> v_doc.supplier_id or gr.status <> 'posted')) then
    raise exception 'Linked receipts must be posted receipts of the same supplier' using errcode = '23514';
  end if;

  select coalesce(sum(gr.total_amount), 0) into v_receipts
    from public.supplier_invoice_receipts sir
    join public.goods_receipts gr on gr.id = sir.goods_receipt_id
   where sir.supplier_invoice_id = p_id;
  v_variance := v_doc.amount - v_receipts;
  v_ap := private.payable_account(v_doc.supplier_id);

  if v_variance <> 0 then
    v_je := private.post_journal(v_doc.invoice_date,
      'Invoice difference ' || v_doc.invoice_number || ' (' || v_doc.doc_no || ')', 'supplier_invoice', v_doc.id,
      case when v_variance > 0 then jsonb_build_array(
        jsonb_build_object('account', 'INVENTORY_VARIANCE', 'debit', v_variance),
        jsonb_build_object('account', v_ap, 'credit', v_variance, 'supplier_id', v_doc.supplier_id))
      else jsonb_build_array(
        jsonb_build_object('account', v_ap, 'debit', -v_variance, 'supplier_id', v_doc.supplier_id),
        jsonb_build_object('account', 'INVENTORY_VARIANCE', 'credit', -v_variance))
      end);
  end if;

  update public.supplier_invoices
     set status = 'posted', receipts_total = v_receipts, variance = v_variance,
         journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier payments and allocation to invoices (partial payments supported).
-- ---------------------------------------------------------------------------
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  supplier_id uuid not null references public.suppliers (id),
  payment_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  financial_account_id uuid not null references public.financial_accounts (id),
  method public.payment_method not null,
  reference text,
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
create index supplier_payments_supplier_idx on public.supplier_payments (supplier_id, payment_date);

create trigger supplier_payments_doc_no
  before insert on public.supplier_payments
  for each row execute function private.assign_doc_no('SPAY');

create table public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  supplier_payment_id uuid not null references public.supplier_payments (id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices (id),
  amount numeric(18,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (supplier_payment_id, supplier_invoice_id)
);
create index supplier_payment_allocations_invoice_idx on public.supplier_payment_allocations (supplier_invoice_id);

create function public.post_supplier_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.supplier_payments%rowtype;
  v_je uuid;
begin
  perform private.require_permission('payables.pay');
  select * into v_doc from public.supplier_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Payment % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;

  v_je := private.post_journal(v_doc.payment_date, 'Supplier payment ' || v_doc.doc_no, 'supplier_payment', v_doc.id,
    jsonb_build_array(
      jsonb_build_object('account', private.payable_account(v_doc.supplier_id), 'debit', v_doc.amount,
                         'supplier_id', v_doc.supplier_id),
      jsonb_build_object('account_id', private.financial_gl(v_doc.financial_account_id), 'credit', v_doc.amount)));

  update public.supplier_payments
     set status = 'posted', journal_entry_id = v_je, posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return v_je;
end;
$$;

-- Allocate part of a posted payment to a posted invoice. Locks both rows so
-- concurrent allocations cannot over-allocate either side.
create function public.allocate_supplier_payment(p_payment_id uuid, p_invoice_id uuid, p_amount numeric)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.supplier_payments%rowtype;
  v_invoice public.supplier_invoices%rowtype;
  v_payment_used numeric;
  v_invoice_paid numeric;
  v_id uuid;
begin
  perform private.require_permission('payables.pay');
  if p_amount is null or p_amount <= 0 then
    raise exception 'Allocation amount must be positive' using errcode = '22023';
  end if;
  select * into v_payment from public.supplier_payments where id = p_payment_id for update;
  select * into v_invoice from public.supplier_invoices where id = p_invoice_id for update;
  if v_payment.id is null or v_invoice.id is null then
    raise exception 'Payment or invoice not found' using errcode = 'P0002';
  end if;
  if v_payment.status <> 'posted' or v_invoice.status <> 'posted' then
    raise exception 'Only posted payments and invoices can be allocated' using errcode = '23514';
  end if;
  if v_payment.supplier_id <> v_invoice.supplier_id then
    raise exception 'Payment and invoice belong to different suppliers' using errcode = '23514';
  end if;

  select coalesce(sum(amount), 0) into v_payment_used from public.supplier_payment_allocations where supplier_payment_id = p_payment_id;
  select coalesce(sum(amount), 0) into v_invoice_paid from public.supplier_payment_allocations where supplier_invoice_id = p_invoice_id;
  if v_payment_used + p_amount > v_payment.amount then
    raise exception 'Allocation exceeds the unallocated payment amount (%)', v_payment.amount - v_payment_used using errcode = '23514';
  end if;
  if v_invoice_paid + p_amount > v_invoice.amount then
    raise exception 'Allocation exceeds the invoice balance (%)', v_invoice.amount - v_invoice_paid using errcode = '23514';
  end if;

  insert into public.supplier_payment_allocations (supplier_payment_id, supplier_invoice_id, amount)
  values (p_payment_id, p_invoice_id, p_amount)
  on conflict (supplier_payment_id, supplier_invoice_id)
  do update set amount = public.supplier_payment_allocations.amount + excluded.amount
  returning id into v_id;
  return v_id;
end;
$$;

create function public.void_supplier_payment(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.supplier_payments%rowtype;
  v_rev uuid;
begin
  perform private.require_permission('payables.pay');
  select * into v_doc from public.supplier_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'posted' then raise exception 'Only posted payments can be voided' using errcode = '23514'; end if;
  delete from public.supplier_payment_allocations where supplier_payment_id = p_id;
  v_rev := private.reverse_journal(v_doc.journal_entry_id, current_date, p_reason);
  update public.supplier_payments set status = 'void' where id = p_id;
  return v_rev;
end;
$$;

-- ---------------------------------------------------------------------------
-- Supplier returns (debit notes). Stock leaves at average cost; the payable is
-- reduced by the agreed credit; any difference goes to inventory variance.
-- ---------------------------------------------------------------------------
create table public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,
  supplier_id uuid not null references public.suppliers (id),
  warehouse_id uuid not null references public.warehouses (id),
  goods_receipt_id uuid references public.goods_receipts (id),
  return_date date not null default current_date,
  reason text,
  status public.document_status not null default 'draft',
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

create trigger supplier_returns_doc_no
  before insert on public.supplier_returns
  for each row execute function private.assign_doc_no('SRET');

create table public.supplier_return_items (
  id uuid primary key default gen_random_uuid(),
  supplier_return_id uuid not null references public.supplier_returns (id) on delete cascade,
  product_id uuid not null references public.products (id),
  unit_id uuid not null references public.units (id),
  factor bigint not null,
  quantity bigint not null check (quantity > 0),
  base_quantity bigint generated always as (quantity * factor) stored,
  -- Credit agreed with the supplier, per unit.
  unit_price numeric(18,2) not null check (unit_price >= 0),
  line_total numeric(18,2) generated always as (quantity * unit_price) stored,
  cost_amount numeric(18,2)
);
create index supplier_return_items_header_idx on public.supplier_return_items (supplier_return_id);

create trigger supplier_return_items_factor
  before insert or update of product_id, unit_id on public.supplier_return_items
  for each row execute function private.set_line_factor();
create trigger supplier_return_items_total
  after insert or update or delete on public.supplier_return_items
  for each row execute function private.recalc_header_total('supplier_returns', 'supplier_return_id');

create function public.post_supplier_return(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.supplier_returns%rowtype;
  v_item record;
  v_cost numeric(18,2);
  v_cost_total numeric(18,2) := 0;
  v_diff numeric(18,2);
  v_ap text;
  v_lines jsonb;
  v_je uuid;
begin
  perform private.require_permission('purchasing.post');
  select * into v_doc from public.supplier_returns where id = p_id for update;
  if v_doc.id is null then raise exception 'Supplier return not found' using errcode = 'P0002'; end if;
  if v_doc.status <> 'draft' then raise exception 'Supplier return % is already %', v_doc.doc_no, v_doc.status using errcode = '23514'; end if;
  if not exists (select 1 from public.supplier_return_items where supplier_return_id = p_id) then
    raise exception 'Supplier return has no lines' using errcode = '23514';
  end if;

  for v_item in
    select * from public.supplier_return_items where supplier_return_id = p_id order by product_id, id
  loop
    v_cost := -private.move_stock(v_item.product_id, v_doc.warehouse_id, -v_item.base_quantity, 'purchase_return',
      v_doc.return_date, 'supplier_return', v_doc.id, v_item.id);
    update public.supplier_return_items set cost_amount = v_cost where id = v_item.id;
    v_cost_total := v_cost_total + v_cost;
  end loop;

  v_ap := private.payable_account(v_doc.supplier_id);
  v_diff := v_doc.total_amount - v_cost_total;
  v_lines := jsonb_build_array(
    jsonb_build_object('account', v_ap, 'debit', v_doc.total_amount, 'supplier_id', v_doc.supplier_id),
    jsonb_build_object('account', 'INVENTORY', 'credit', v_cost_total));
  if v_diff > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'INVENTORY_VARIANCE', 'credit', v_diff));
  elsif v_diff < 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account', 'INVENTORY_VARIANCE', 'debit', -v_diff));
  end if;

  if v_doc.total_amount > 0 or v_cost_total > 0 then
    v_je := private.post_journal(v_doc.return_date, 'Supplier return ' || v_doc.doc_no, 'supplier_return', v_doc.id, v_lines);
  end if;

  update public.supplier_returns
     set status = 'posted', cost_total = v_cost_total, journal_entry_id = v_je,
         posted_at = now(), posted_by = auth.uid()
   where id = p_id;
  return p_id;
end;
$$;
