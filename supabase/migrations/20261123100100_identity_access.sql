-- Employees, roles, permissions, user profiles and permission helpers.

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null check (length(trim(full_name)) > 0),
  full_name_ur text,
  father_name text,
  cnic text unique check (cnic is null or cnic ~ '^[0-9]{5}-?[0-9]{7}-?[0-9]$'),
  phone text,
  alt_phone text,
  email text,
  address text,
  job_title text,
  department text,
  hire_date date,
  termination_date date,
  status public.employment_status not null default 'active',
  photo_path text,
  base_salary numeric(18,2) not null default 0 check (base_salary >= 0),
  emergency_contact text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (termination_date is null or hire_date is null or termination_date >= hire_date)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_en text not null,
  name_ur text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  description_en text not null,
  description_ur text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role_id, permission_code)
);
create index role_permissions_permission_idx on public.role_permissions (permission_code);

-- One profile per auth user. A new user has no role and therefore no access
-- until an administrator assigns one.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  locale text not null default 'en' check (locale in ('en', 'ur')),
  role_id uuid references public.roles (id),
  employee_id uuid unique references public.employees (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index profiles_role_idx on public.profiles (role_id);

create function private.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Permission helpers. STABLE + SECURITY DEFINER so RLS policies can call them
-- without the caller needing read access to roles/profiles.
-- ---------------------------------------------------------------------------
create function private.has_permission(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.profiles p
      join public.role_permissions rp on rp.role_id = p.role_id
     where p.id = auth.uid()
       and p.is_active
       and rp.permission_code = p_code
  );
$$;

create function private.require_permission(p_code text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_permission(p_code) then
    raise exception 'Permission denied: %', p_code using errcode = '42501';
  end if;
end;
$$;

create function private.current_employee_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select employee_id from public.profiles where id = auth.uid() and is_active;
$$;

revoke all on function private.has_permission(text) from public;
revoke all on function private.require_permission(text) from public;
revoke all on function private.current_employee_id() from public;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.current_employee_id() to authenticated;

-- Users may edit their own name/phone/locale, but only holders of users.manage
-- may change role, employee link or active flag. Calls with no JWT (SQL editor,
-- migrations, service role) are trusted.
create function private.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.role_id is distinct from old.role_id
      or new.employee_id is distinct from old.employee_id
      or new.is_active is distinct from old.is_active
      or new.id is distinct from old.id)
     and auth.uid() is not null
     and not private.has_permission('users.manage') then
    raise exception 'Only administrators can change role, employee link or status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- RPC: permissions of the signed-in user, for building the UI.
create function public.my_permissions() returns setof text
language sql stable security definer set search_path = '' as $$
  select rp.permission_code
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
   where p.id = auth.uid() and p.is_active
   order by 1;
$$;
