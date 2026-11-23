-- Phase 3: roles (Super Admin, Manager, Data Entry, Viewer, custom), confidential
-- data restrictions, company-account permissions, user lifecycle, provisioning.

-- ===========================================================================
-- 1. Permissions
-- ===========================================================================
insert into public.permissions (code, module, description_en, description_ur) values
  ('company.view', 'company', 'View the main company (Ayra Happiness) ledger, invoices and payments', 'مرکزی کمپنی (آئرا ہیپینیس) کا لیجر، انوائس اور ادائیگیاں دیکھیں'),
  ('company.pay', 'company', 'Record and post payments to the main company', 'مرکزی کمپنی کو ادائیگیاں درج اور پوسٹ کریں'),
  ('costs.view', 'costs', 'View purchase costs, purchase prices, inventory value, cost of sales and profit margins', 'خریداری لاگت، قیمت خرید، انوینٹری مالیت، فروخت کی لاگت اور منافع کا مارجن دیکھیں');

update public.permissions set module = 'salaries' where module = 'payroll';
update public.permissions set
  description_en = 'View purchase orders, receipts and supplier invoices, including purchase costs (confidential)',
  description_ur = 'خریداری آرڈر، وصولیاں اور سپلائر انوائس بشمول قیمت خرید دیکھیں (خفیہ)'
 where code = 'purchasing.view';
update public.permissions set
  description_en = 'Create purchasing drafts (own drafts only are visible without purchasing.view)',
  description_ur = 'خریداری کے مسودے بنائیں (خریداری دیکھنے کی اجازت کے بغیر صرف اپنے مسودے نظر آئیں گے)'
 where code = 'purchasing.create';
update public.permissions set description_en = 'View supplier ledgers and payments (excluding the main company)',
  description_ur = 'سپلائر لیجر اور ادائیگیاں دیکھیں (مرکزی کمپنی کے علاوہ)' where code = 'payables.view';
update public.permissions set description_en = 'Record and post supplier payments (excluding the main company)',
  description_ur = 'سپلائر ادائیگیاں درج اور پوسٹ کریں (مرکزی کمپنی کے علاوہ)' where code = 'payables.pay';
update public.permissions set description_en = 'View salaries, payroll, advances and salary balances (confidential)',
  description_ur = 'تنخواہیں، پے رول، ایڈوانس اور بیلنس دیکھیں (خفیہ)' where code = 'payroll.view';
update public.permissions set description_en = 'Set salaries; prepare payroll and advances',
  description_ur = 'تنخواہ مقرر کریں؛ پے رول اور ایڈوانس تیار کریں' where code = 'payroll.manage';
update public.permissions set description_en = 'View cash and bank accounts, balances and bank details (confidential)',
  description_ur = 'نقد اور بینک اکاؤنٹس، بیلنس اور بینک تفصیلات دیکھیں (خفیہ)' where code = 'cash_bank.view';
update public.permissions set description_en = 'View confidential financial reports (profit and loss, trial balance)',
  description_ur = 'خفیہ مالیاتی رپورٹس دیکھیں (نفع و نقصان، ٹرائل بیلنس)' where code = 'reports.financial';
update public.permissions set description_en = 'Invite users, assign roles, suspend, reactivate and remove access; manage roles',
  description_ur = 'صارفین کو مدعو کریں، کردار دیں، معطل، بحال اور رسائی ختم کریں؛ کرداروں کا انتظام' where code = 'users.manage';

-- ===========================================================================
-- 2. Roles
-- ===========================================================================
update public.roles
   set code = 'super_admin', name_en = 'Super Admin', name_ur = 'سپر ایڈمن',
       description = 'Full access including user administration and settings'
 where code = 'admin';

insert into public.roles (code, name_en, name_ur, description, is_system) values
  ('data_entry', 'Data Entry User', 'ڈیٹا انٹری صارف',
   'Enters records; cannot see costs, margins, salaries, bank details or financial reports', true);

-- Earlier presets become editable custom roles.
update public.roles set is_system = false where code in ('accountant', 'warehouse', 'order_taker', 'driver');

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code from public.roles r cross join public.permissions p where r.code = 'super_admin'
on conflict do nothing;

delete from public.role_permissions where role_id in (select id from public.roles where code in ('manager', 'data_entry', 'viewer'));

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
  from public.roles r
  join public.permissions p on
       (r.code = 'manager' and p.code not in ('users.view', 'users.manage', 'settings.manage'))
    or (r.code = 'data_entry' and p.code in (
          'dashboard.view', 'products.view', 'warehouses.view', 'customers.view', 'suppliers.view', 'vehicles.view',
          'inventory.view', 'inventory.transfer', 'inventory.count',
          'purchasing.create', 'sales.view', 'sales.view_all', 'sales.create',
          'receivables.collect', 'expenses.create', 'sol.view'))
    or (r.code = 'viewer' and p.code in (
          'dashboard.view', 'products.view', 'warehouses.view', 'inventory.view', 'customers.view',
          'suppliers.view', 'sales.view', 'sales.view_all', 'sol.view', 'vehicles.view', 'reports.view'));

insert into public.role_permissions (role_id, permission_code)
select r.id, p from public.roles r, unnest(array['company.view', 'company.pay', 'costs.view']) p
 where r.code = 'accountant'
on conflict do nothing;

-- Super Admin always holds every permission.
create function private.guard_role_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and exists (
       select 1 from public.roles where id = coalesce(new.role_id, old.role_id) and code = 'super_admin') then
    raise exception 'Super Admin permissions cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger role_permissions_guard
  before insert or delete on public.role_permissions
  for each row execute function private.guard_role_permissions();

create function private.grant_permission_to_super_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (role_id, permission_code)
  select id, new.code from public.roles where code = 'super_admin'
  on conflict do nothing;
  return new;
end;
$$;

create trigger permissions_super_admin
  after insert on public.permissions
  for each row execute function private.grant_permission_to_super_admin();

-- Maximum active users per role. Initially two managers; editable in settings.
insert into public.app_settings (key, value, description) values
  ('role_user_limits', '{"manager": 2}', 'Maximum number of active users per role code');

-- ===========================================================================
-- 3. Profiles: suspension, removal, safeguards
-- ===========================================================================
alter table public.profiles add column removed_at timestamptz;
alter table public.profiles add constraint profiles_removed_has_no_access
  check (removed_at is null or (not is_active and role_id is null));

create or replace function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := auth.uid();
  v_super uuid;
  v_role_code text;
  v_limit integer;
  v_count integer;
begin
  if new.id is distinct from old.id then
    raise exception 'Profile id cannot change' using errcode = '42501';
  end if;
  if new.role_id is not distinct from old.role_id
     and new.employee_id is not distinct from old.employee_id
     and new.is_active is not distinct from old.is_active
     and new.removed_at is not distinct from old.removed_at then
    return new;
  end if;

  select id into v_super from public.roles where code = 'super_admin';

  -- Calls without a user JWT (migrations, SQL editor, service role) are trusted.
  if v_caller is not null then
    if not private.has_permission('users.manage') then
      raise exception 'Only administrators can change role, employee link or status' using errcode = '42501';
    end if;
    if new.id = v_caller and (new.role_id is distinct from old.role_id
                              or new.is_active is distinct from old.is_active
                              or new.removed_at is distinct from old.removed_at) then
      raise exception 'You cannot change your own role or access' using errcode = '42501';
    end if;
    if (new.role_id = v_super or old.role_id = v_super) and new.role_id is distinct from old.role_id
       and not exists (select 1 from public.profiles where id = v_caller and role_id = v_super and is_active) then
      raise exception 'Only a Super Admin can grant or revoke the Super Admin role' using errcode = '42501';
    end if;
  end if;

  if old.role_id = v_super and old.is_active and not (new.role_id = v_super and new.is_active)
     and not exists (select 1 from public.profiles where role_id = v_super and is_active and id <> old.id) then
    raise exception 'At least one active Super Admin is required' using errcode = '23514';
  end if;

  if new.is_active and new.role_id is not null
     and (new.role_id is distinct from old.role_id or not old.is_active) then
    -- Serialise concurrent assignments to the same role.
    select code into v_role_code from public.roles where id = new.role_id for update;
    v_limit := (private.setting('role_user_limits') ->> v_role_code)::integer;
    if v_limit is not null then
      select count(*) into v_count from public.profiles
       where role_id = new.role_id and is_active and id <> new.id;
      if v_count >= v_limit then
        raise exception 'The % role is limited to % active users', v_role_code, v_limit using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create function public.admin_list_users()
returns table (
  id uuid, email text, full_name text, phone text, locale text,
  role_id uuid, role_code text, role_name_en text, role_name_ur text,
  employee_id uuid, employee_name text,
  status text, is_active boolean, removed_at timestamptz,
  invited_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('users.view');
  return query
  select p.id, u.email::text, p.full_name, p.phone, p.locale,
         r.id, r.code, r.name_en, r.name_ur,
         e.id, e.full_name,
         case when p.removed_at is not null then 'removed'
              when not p.is_active then 'suspended'
              when p.role_id is null then 'no_role'
              when u.last_sign_in_at is null then 'invited'
              else 'active' end,
         p.is_active, p.removed_at,
         u.invited_at, u.email_confirmed_at, u.last_sign_in_at, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.roles r on r.id = p.role_id
    left join public.employees e on e.id = p.employee_id
   order by p.created_at;
end;
$$;

create function public.admin_assign_role(p_user_id uuid, p_role_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('users.manage');
  if p_role_id is null then
    raise exception 'A role is required; use removal to revoke access' using errcode = '22023';
  end if;
  update public.profiles set role_id = p_role_id where id = p_user_id and removed_at is null;
  if not found then
    raise exception 'User not found or access removed' using errcode = 'P0002';
  end if;
  return p_user_id;
end;
$$;

-- Omit p_employee_id to unlink.
create function public.admin_link_employee(p_user_id uuid, p_employee_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_permission('users.manage');
  update public.profiles set employee_id = p_employee_id where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  return p_user_id;
end;
$$;

-- p_status: 'active' (reactivate; p_role_id required when restoring a removed user),
--           'suspended' (temporarily blocked), 'removed' (access revoked, role cleared).
create function public.admin_set_user_status(p_user_id uuid, p_status text, p_role_id uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform private.require_permission('users.manage');
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile.id is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if p_status = 'active' then
    if coalesce(p_role_id, v_profile.role_id) is null then
      raise exception 'Assign a role to reactivate this user' using errcode = '22023';
    end if;
    update public.profiles
       set is_active = true, removed_at = null, role_id = coalesce(p_role_id, role_id)
     where id = p_user_id;
  elsif p_status = 'suspended' then
    if v_profile.removed_at is not null then
      raise exception 'Access has been removed; reactivate instead' using errcode = '23514';
    end if;
    update public.profiles set is_active = false where id = p_user_id;
  elsif p_status = 'removed' then
    update public.profiles set is_active = false, role_id = null, removed_at = now() where id = p_user_id;
  else
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;
  return p_user_id;
end;
$$;

-- First administrator. Callable only with the secret (service role) key or from
-- the SQL editor, and only while no active Super Admin exists.
create function public.bootstrap_super_admin(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if exists (select 1 from public.profiles p join public.roles r on r.id = p.role_id
              where r.code = 'super_admin' and p.is_active) then
    raise exception 'A Super Admin already exists; add administrators from the application' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No user with that email; invite the user first' using errcode = 'P0002';
  end if;
  update public.profiles
     set role_id = (select id from public.roles where code = 'super_admin'), is_active = true, removed_at = null
   where id = v_user;
  return v_user;
end;
$$;

-- ===========================================================================
-- 4. Employees: WhatsApp; salaries moved to a confidential table
-- ===========================================================================
alter table public.employees add column whatsapp text;

create table public.employee_salaries (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  base_salary numeric(18,2) not null default 0 check (base_salary >= 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.employee_salaries (employee_id, base_salary)
select id, base_salary from public.employees where base_salary > 0;
alter table public.employees drop column base_salary;

-- ===========================================================================
-- 5. Bank details moved to a confidential table
-- ===========================================================================
drop view public.v_financial_account_balances;

create table public.financial_account_bank_details (
  financial_account_id uuid primary key references public.financial_accounts (id) on delete cascade,
  bank_name text not null,
  account_title text,
  account_number text,
  iban text,
  branch text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.financial_account_bank_details (financial_account_id, bank_name, account_title, account_number, branch)
select id, coalesce(bank_name, name), account_title, account_number, branch
  from public.financial_accounts where account_type = 'bank';

alter table public.financial_accounts drop constraint financial_accounts_check;
alter table public.financial_accounts
  drop column bank_name, drop column account_title, drop column account_number, drop column branch;

create function private.validate_bank_details() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.financial_accounts where id = new.financial_account_id and account_type = 'bank') then
    raise exception 'Bank details can only be attached to bank accounts' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger financial_account_bank_details_validate
  before insert or update on public.financial_account_bank_details
  for each row execute function private.validate_bank_details();

create view public.v_financial_account_balances with (security_invoker = true) as
select fa.id as financial_account_id, fa.name, fa.account_type, fa.is_active,
       coalesce(sum(jl.debit - jl.credit), 0) as balance
from public.financial_accounts fa
left join public.v_posted_journal_lines jl on jl.account_id = fa.gl_account_id
where (select private.has_permission('cash_bank.view'))
group by fa.id;

-- ===========================================================================
-- 6. Confidential columns: costs and purchase prices are not selectable by
--    clients; holders of costs.view read them through secure_* views.
-- ===========================================================================
create function private.restrict_select(p_table text, p_hidden text[]) returns void
language plpgsql set search_path = '' as $$
declare
  v_cols text;
begin
  execute format('revoke select on public.%I from authenticated', p_table);
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = format('public.%I', p_table)::regclass
     and a.attnum > 0 and not a.attisdropped and a.attname <> all (p_hidden);
  execute format('grant select (%s) on public.%I to authenticated', v_cols, p_table);
end;
$$;
revoke all on function private.restrict_select(text, text[]) from public;

-- Views that read restricted columns must be replaced before the columns are hidden.
drop view public.v_sol_trip_summary;
drop view public.v_sol_job_summary;

select private.restrict_select('product_units', array['purchase_price']);
select private.restrict_select('sales_invoices', array['cost_total']);
select private.restrict_select('sales_invoice_items', array['cost_amount']);
select private.restrict_select('customer_returns', array['cost_total']);
select private.restrict_select('customer_return_items', array['cost_amount']);
select private.restrict_select('stock_movements', array['value_change']);
select private.restrict_select('stock_adjustments', array['value_total']);
select private.restrict_select('stock_adjustment_items', array['unit_cost', 'value_change']);

-- Secure views run with the owner's rights, so each one filters on the caller's
-- permission itself. security_barrier stops predicates leaking rows past the filter.
create view public.secure_product_unit_costs with (security_barrier = true) as
select pu.id as product_unit_id, pu.product_id, pu.unit_id, pu.purchase_price
  from public.product_units pu
 where (select private.has_permission('costs.view'));

create view public.secure_sales_invoice_costs with (security_barrier = true) as
select i.id as sales_invoice_id, i.cost_total, i.subtotal - coalesce(i.cost_total, 0) as gross_profit
  from public.sales_invoices i
 where i.status = 'posted' and (select private.has_permission('costs.view'));

create view public.secure_sales_invoice_item_costs with (security_barrier = true) as
select it.id as sales_invoice_item_id, it.sales_invoice_id, it.cost_amount,
       it.line_net - coalesce(it.cost_amount, 0) as gross_profit
  from public.sales_invoice_items it
 where (select private.has_permission('costs.view'));

create view public.secure_customer_return_costs with (security_barrier = true) as
select r.id as customer_return_id, r.cost_total
  from public.customer_returns r
 where (select private.has_permission('costs.view'));

create view public.secure_customer_return_item_costs with (security_barrier = true) as
select it.id as customer_return_item_id, it.customer_return_id, it.cost_amount
  from public.customer_return_items it
 where (select private.has_permission('costs.view'));

create view public.secure_stock_movement_values with (security_barrier = true) as
select m.id as stock_movement_id, m.product_id, m.warehouse_id, m.movement_date, m.value_change
  from public.stock_movements m
 where (select private.has_permission('costs.view'));

create view public.secure_stock_adjustment_values with (security_barrier = true) as
select a.id as stock_adjustment_id, a.value_total
  from public.stock_adjustments a
 where (select private.has_permission('costs.view'));

create view public.secure_stock_adjustment_item_values with (security_barrier = true) as
select it.id as stock_adjustment_item_id, it.stock_adjustment_id, it.unit_cost, it.value_change
  from public.stock_adjustment_items it
 where (select private.has_permission('costs.view'));

create view public.secure_sol_trip_profitability with (security_barrier = true) as
select t.id as sol_trip_id, t.doc_no, t.vehicle_id, t.driver_id, t.trip_date, t.status,
       coalesce(s.sales, 0) as sales_amount,
       coalesce(s.cost, 0) as cost_of_goods,
       coalesce(ex.expenses, 0) as expenses,
       coalesce(s.sales, 0) - coalesce(s.cost, 0) - coalesce(ex.expenses, 0) as profit
  from public.sol_trips t
  left join (select sol_trip_id, sum(subtotal) sales, sum(cost_total) cost from public.sales_invoices
              where status = 'posted' and sol_trip_id is not null group by sol_trip_id) s on s.sol_trip_id = t.id
  left join (select sol_trip_id, sum(amount) expenses from public.expenses
              where status = 'posted' and sol_trip_id is not null group by sol_trip_id) ex on ex.sol_trip_id = t.id
 where (select private.has_permission('sol.view')) and (select private.has_permission('costs.view'));

create view public.secure_sol_job_profitability with (security_barrier = true) as
select j.id as sol_job_id, j.doc_no, j.customer_id, j.job_date, j.status, j.contract_value,
       coalesce(ex.expenses, 0) as expenses,
       j.contract_value - coalesce(ex.expenses, 0) as profit
  from public.sol_jobs j
  left join (select sol_job_id, sum(amount) expenses from public.expenses
              where status = 'posted' and sol_job_id is not null group by sol_job_id) ex on ex.sol_job_id = j.id
 where (select private.has_permission('sol.view')) and (select private.has_permission('costs.view'));

create view public.v_sol_job_summary with (security_invoker = true) as
select j.id as sol_job_id, j.doc_no, j.customer_id, j.job_date, j.status, j.vehicle_id, j.driver_id,
       j.contract_value,
       coalesce(pa.received, 0) as received_amount,
       j.contract_value - coalesce(pa.received, 0) as pending_amount
from public.sol_jobs j
left join (select sol_job_id, sum(amount) received from public.customer_payment_allocations
            where sol_job_id is not null group by sol_job_id) pa on pa.sol_job_id = j.id;

-- Valuation is entirely cost data.
drop policy "select" on public.inventory_valuation;
create policy "select" on public.inventory_valuation for select to authenticated
  using ((select private.has_permission('costs.view')));

-- Account balances are a financial report.
create or replace view public.v_account_balances with (security_invoker = true) as
select
  a.id as account_id, a.code, a.name_en, a.name_ur, a.account_type, a.parent_id, a.is_postable,
  coalesce(sum(jl.debit), 0) as total_debit,
  coalesce(sum(jl.credit), 0) as total_credit,
  case when a.account_type in ('asset', 'expense')
       then coalesce(sum(jl.debit - jl.credit), 0)
       else coalesce(sum(jl.credit - jl.debit), 0) end as balance
from public.chart_of_accounts a
left join public.v_posted_journal_lines jl on jl.account_id = a.id
where (select private.has_permission('accounting.view'))
group by a.id;

-- Financial reports read the whole ledger, so they require reports.financial explicitly.
create or replace function public.trial_balance(p_as_of date)
returns table (account_id uuid, code text, name_en text, account_type public.account_type,
               total_debit numeric, total_credit numeric, balance_debit numeric, balance_credit numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('reports.financial');
  return query
  select a.id, a.code, a.name_en, a.account_type,
         sum(jl.debit), sum(jl.credit),
         greatest(sum(jl.debit - jl.credit), 0),
         greatest(sum(jl.credit - jl.debit), 0)
    from public.v_posted_journal_lines jl
    join public.chart_of_accounts a on a.id = jl.account_id
   where jl.entry_date <= p_as_of
   group by a.id
   order by a.code;
end;
$$;

create or replace function public.profit_and_loss(p_from date, p_to date)
returns table (account_id uuid, code text, name_en text, account_type public.account_type, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_permission('reports.financial');
  return query
  select a.id, a.code, a.name_en, a.account_type,
         case when a.account_type = 'income' then sum(jl.credit - jl.debit) else sum(jl.debit - jl.credit) end
    from public.v_posted_journal_lines jl
    join public.chart_of_accounts a on a.id = jl.account_id
   where a.account_type in ('income', 'expense') and jl.entry_date between p_from and p_to
   group by a.id
   order by a.code;
end;
$$;

-- ===========================================================================
-- 7. Company account (main company) separated from other suppliers
-- ===========================================================================
create function private.supplier_permission(p_supplier_id uuid, p_action text) returns text
language sql stable security definer set search_path = '' as $$
  select case when s.is_principal then 'company.' else 'payables.' end || p_action
    from public.suppliers s where s.id = p_supplier_id;
$$;

create function private.can_supplier(p_supplier_id uuid, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.has_permission(private.supplier_permission(p_supplier_id, p_action)), false);
$$;

drop policy "select" on public.journal_entry_lines;
create policy "select" on public.journal_entry_lines for select to authenticated using (
  (select private.has_permission('accounting.view'))
  or (customer_id is not null and (select private.has_permission('receivables.view')))
  or (supplier_id is not null and private.can_supplier(supplier_id, 'view'))
  or (employee_id is not null and (select private.has_permission('payroll.view')))
  or ((select private.has_permission('cash_bank.view'))
      and exists (select 1 from public.financial_accounts fa where fa.gl_account_id = journal_entry_lines.account_id))
);

drop policy "select" on public.supplier_payments;
drop policy "insert" on public.supplier_payments;
drop policy "update" on public.supplier_payments;
drop policy "delete" on public.supplier_payments;
create policy "select" on public.supplier_payments for select to authenticated
  using (private.can_supplier(supplier_id, 'view'));
create policy "insert" on public.supplier_payments for insert to authenticated
  with check (private.can_supplier(supplier_id, 'pay'));
create policy "update" on public.supplier_payments for update to authenticated
  using (private.can_supplier(supplier_id, 'pay') and status = 'draft')
  with check (private.can_supplier(supplier_id, 'pay') and status = 'draft');
create policy "delete" on public.supplier_payments for delete to authenticated
  using (private.can_supplier(supplier_id, 'pay') and status = 'draft');

create or replace function public.post_supplier_payment(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.supplier_payments%rowtype;
  v_je uuid;
begin
  select * into v_doc from public.supplier_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  perform private.require_permission(private.supplier_permission(v_doc.supplier_id, 'pay'));
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

create or replace function public.allocate_supplier_payment(p_payment_id uuid, p_invoice_id uuid, p_amount numeric)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.supplier_payments%rowtype;
  v_invoice public.supplier_invoices%rowtype;
  v_payment_used numeric;
  v_invoice_paid numeric;
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Allocation amount must be positive' using errcode = '22023';
  end if;
  select * into v_payment from public.supplier_payments where id = p_payment_id for update;
  select * into v_invoice from public.supplier_invoices where id = p_invoice_id for update;
  if v_payment.id is null or v_invoice.id is null then
    raise exception 'Payment or invoice not found' using errcode = 'P0002';
  end if;
  perform private.require_permission(private.supplier_permission(v_payment.supplier_id, 'pay'));
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

create or replace function public.void_supplier_payment(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.supplier_payments%rowtype;
  v_rev uuid;
begin
  select * into v_doc from public.supplier_payments where id = p_id for update;
  if v_doc.id is null then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  perform private.require_permission(private.supplier_permission(v_doc.supplier_id, 'pay'));
  if v_doc.status <> 'posted' then raise exception 'Only posted payments can be voided' using errcode = '23514'; end if;
  delete from public.supplier_payment_allocations where supplier_payment_id = p_id;
  v_rev := private.reverse_journal(v_doc.journal_entry_id, current_date, p_reason);
  update public.supplier_payments set status = 'void' where id = p_id;
  return v_rev;
end;
$$;

-- ===========================================================================
-- 8. Data entry: creators see their own drafts without the module's view permission
-- ===========================================================================
drop policy "select" on public.purchase_orders;
create policy "select" on public.purchase_orders for select to authenticated using (
  (select private.has_permission('purchasing.view'))
  or (created_by = (select auth.uid()) and status = 'draft'));

drop policy "select" on public.goods_receipts;
create policy "select" on public.goods_receipts for select to authenticated using (
  (select private.has_permission('purchasing.view'))
  or (created_by = (select auth.uid()) and status = 'draft'));

drop policy "select" on public.supplier_returns;
create policy "select" on public.supplier_returns for select to authenticated using (
  (select private.has_permission('purchasing.view'))
  or (created_by = (select auth.uid()) and status = 'draft'));

drop policy "select" on public.supplier_invoices;
create policy "select" on public.supplier_invoices for select to authenticated using (
  (select private.has_permission('purchasing.view'))
  or private.can_supplier(supplier_id, 'view')
  or (created_by = (select auth.uid()) and status = 'draft'));

drop policy "select" on public.expenses;
create policy "select" on public.expenses for select to authenticated using (
  (select private.has_permission('expenses.view'))
  or (created_by = (select auth.uid()) and status = 'draft'));

drop policy "select" on public.customer_payments;
create policy "select" on public.customer_payments for select to authenticated using (
  (select private.has_permission('receivables.view'))
  or (select private.has_permission('receivables.post'))
  or ((select private.has_permission('receivables.collect'))
      and (collected_by = (select private.current_employee_id()) or created_by = (select auth.uid()))));
drop policy "insert" on public.customer_payments;
create policy "insert" on public.customer_payments for insert to authenticated with check (
  (select private.has_permission('receivables.collect')));
drop policy "update" on public.customer_payments;
create policy "update" on public.customer_payments for update to authenticated
  using ((select private.has_permission('receivables.collect')) and status = 'draft'
         and ((select private.has_permission('receivables.post')) or created_by = (select auth.uid())
              or collected_by = (select private.current_employee_id())))
  with check (status = 'draft');
drop policy "delete" on public.customer_payments;
create policy "delete" on public.customer_payments for delete to authenticated
  using ((select private.has_permission('receivables.collect')) and status = 'draft'
         and ((select private.has_permission('receivables.post')) or created_by = (select auth.uid())
              or collected_by = (select private.current_employee_id())));

-- ===========================================================================
-- 9. RLS, privileges and triggers for the new tables
-- ===========================================================================
select private.apply_policies('employee_salaries', private.p('payroll.view'),
  private.p('payroll.manage'), private.p('payroll.manage'), private.p('payroll.manage'));
select private.apply_policies('financial_account_bank_details', private.p('cash_bank.view'),
  private.p('cash_bank.manage'), private.p('cash_bank.manage'), private.p('cash_bank.manage'));

select private.restrict_columns('employee_salaries', array['created_at', 'created_by', 'updated_at', 'updated_by']);
select private.restrict_columns('financial_account_bank_details', array['created_at', 'created_by', 'updated_at', 'updated_by']);
-- Re-grant so the new WhatsApp column is writable.
select private.restrict_columns('employees', array['created_at', 'created_by', 'updated_at', 'updated_by']);

create trigger touch_updated before update on public.employee_salaries
  for each row execute function private.touch_updated();
create trigger touch_updated before update on public.financial_account_bank_details
  for each row execute function private.touch_updated();
create trigger audit after insert or update or delete on public.employee_salaries
  for each row execute function private.audit_row();
create trigger audit after insert or update or delete on public.financial_account_bank_details
  for each row execute function private.audit_row();

-- Access history for the user administration screen.
create view public.v_access_audit with (security_invoker = true) as
select a.id, a.occurred_at, a.user_id as actor_id, p.full_name as actor_name,
       a.table_name, a.record_id, a.action, a.old_data, a.new_data
  from public.audit_logs a
  left join public.profiles p on p.id = a.user_id
 where a.table_name in ('profiles', 'roles', 'role_permissions');

-- ===========================================================================
-- 10. Grants
-- ===========================================================================
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on
  public.secure_product_unit_costs, public.secure_sales_invoice_costs, public.secure_sales_invoice_item_costs,
  public.secure_customer_return_costs, public.secure_customer_return_item_costs, public.secure_stock_movement_values,
  public.secure_stock_adjustment_values, public.secure_stock_adjustment_item_values,
  public.secure_sol_trip_profitability, public.secure_sol_job_profitability
from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.bootstrap_super_admin(text) from authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.has_permission(text),
  private.current_employee_id(),
  private.is_active_user(),
  private.current_driver_id(),
  private.attachment_permission(text, boolean),
  private.can_supplier(uuid, text)
to authenticated, service_role;

-- ===========================================================================
-- 11. Employee codes (EMP-0001) assigned automatically when not supplied
-- ===========================================================================
insert into public.document_sequences (doc_type, prefix, padding, description)
values ('EMP', 'EMP-', 4, 'Employee code');

create function private.assign_employee_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.employee_code is null or trim(new.employee_code) = '' then
    new.employee_code := private.next_document_number('EMP');
  end if;
  return new;
end;
$$;
revoke execute on function private.assign_employee_code() from public, anon, authenticated;

create trigger employees_code
  before insert on public.employees
  for each row execute function private.assign_employee_code();
