-- Master data: parties, catalog, units, fleet, warehouses.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) > 0),
  name_ur text,
  owner_name text,
  phone text,
  alt_phone text,
  address text,
  area text,
  ntn text,
  -- NULL = no credit limit enforced.
  credit_limit numeric(18,2) check (credit_limit is null or credit_limit >= 0),
  order_taker_id uuid references public.employees (id) on delete set null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index customers_order_taker_idx on public.customers (order_taker_id);
create index customers_area_idx on public.customers (area);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(trim(name)) > 0),
  name_ur text,
  -- The main company (Ayra Happiness). Its payable uses a separate control account.
  is_principal boolean not null default false,
  phone text,
  email text,
  address text,
  ntn text,
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index suppliers_single_principal on public.suppliers (is_principal) where is_principal;

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  designation text,
  phone text,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index supplier_contacts_supplier_idx on public.supplier_contacts (supplier_id);
create unique index supplier_contacts_one_primary on public.supplier_contacts (supplier_id) where is_primary;

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name_en text not null,
  name_ur text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ur text,
  parent_id uuid references public.product_categories (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (parent_id, name_en),
  check (parent_id is distinct from id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text unique,
  name_en text not null check (length(trim(name_en)) > 0),
  name_ur text,
  category_id uuid references public.product_categories (id),
  -- Smallest unit tracked (usually Piece). All stock is stored in this unit.
  base_unit_id uuid not null references public.units (id),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  reorder_level bigint not null default 0 check (reorder_level >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index products_category_idx on public.products (category_id);

-- Units a product can be bought/sold in, with how many base units each contains.
create table public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  unit_id uuid not null references public.units (id),
  factor bigint not null check (factor > 0),
  sale_price numeric(18,2) check (sale_price is null or sale_price >= 0),
  purchase_price numeric(18,2) check (purchase_price is null or purchase_price >= 0),
  barcode text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (product_id, unit_id)
);

-- The base unit row (factor 1) is created automatically and cannot be changed.
create function private.create_base_product_unit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.product_units (product_id, unit_id, factor)
  values (new.id, new.base_unit_id, 1);
  return new;
end;
$$;

create trigger products_base_unit
  after insert on public.products
  for each row execute function private.create_base_product_unit();

create function private.guard_product_base_unit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.base_unit_id is distinct from old.base_unit_id then
    raise exception 'The base unit of a product cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger products_guard_base_unit
  before update on public.products
  for each row execute function private.guard_product_base_unit();

create function private.guard_product_unit() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_base uuid;
begin
  select base_unit_id into v_base from public.products where id = coalesce(new.product_id, old.product_id);
  if tg_op = 'DELETE' then
    if old.unit_id = v_base then
      raise exception 'The base unit row cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;
  if new.unit_id = v_base and new.factor <> 1 then
    raise exception 'The base unit must have factor 1' using errcode = '23514';
  end if;
  if new.unit_id <> v_base and new.factor = 1 then
    raise exception 'Only the base unit may have factor 1' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger product_units_guard
  before insert or update or delete on public.product_units
  for each row execute function private.guard_product_unit();

-- Line tables store a snapshot of the conversion factor. This trigger always
-- overwrites it from product_units so clients cannot supply their own.
create function private.set_line_factor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select pu.factor into new.factor
    from public.product_units pu
   where pu.product_id = new.product_id and pu.unit_id = new.unit_id and pu.is_active;
  if new.factor is null then
    raise exception 'Unit is not configured for this product' using errcode = '23503';
  end if;
  return new;
end;
$$;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_no text not null unique,
  name text not null,
  vehicle_type text,
  capacity text,
  ownership public.vehicle_ownership not null default 'owned',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.employees (id),
  license_number text,
  license_expiry date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- A "vehicle" warehouse holds stock loaded onto that vehicle for SOL route sales.
-- A "damaged" warehouse quarantines damaged goods (still valued) until written off or returned.
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_ur text,
  warehouse_type public.warehouse_type not null default 'main',
  vehicle_id uuid unique references public.vehicles (id),
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check ((warehouse_type = 'vehicle') = (vehicle_id is not null))
);
