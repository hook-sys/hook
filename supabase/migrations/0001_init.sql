-- Hook Marketing AI Marketing Command Center — initial schema
-- Run against a Supabase project (SQL editor or `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Leads (public application form submissions)
-- ---------------------------------------------------------------------------

create type lead_status as enum ('new', 'contacted', 'qualified', 'converted', 'not_interested');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(business_name) between 1 and 200),
  mobile text not null check (char_length(mobile) between 1 and 20),
  facebook_page_url text,
  website_url text,
  current_situation text not null check (char_length(current_situation) between 1 and 4000),
  status lead_status not null default 'new',
  admin_note text check (char_length(admin_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_status_idx on public.leads (status);
create index leads_created_at_idx on public.leads (created_at desc);

-- ---------------------------------------------------------------------------
-- Admin / sub-admin accounts
-- Insert a row here (matching the auth.users id) after manually creating the
-- account in Supabase Auth to grant that user Command Center access.
-- ---------------------------------------------------------------------------

create table public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'admin' check (role in ('admin', 'sub_admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Role / permission foundation (schema-ready, UI not built yet)
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- Clients (internal agency roster, managed manually by admins)
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  website text,
  phone text,
  facebook_page_url text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  drive_folder_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (admin_user_id, client_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.leads enable row level security;
alter table public.admin_users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.clients enable row level security;
alter table public.client_assignments enable row level security;

-- security definer helper: table owner bypasses RLS, avoiding recursion
-- when this function is used inside admin_users' own policies.
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.admin_users where id = auth.uid()
  );
$$ language sql stable security definer set search_path = public;

-- Leads: public can only insert new, unreviewed leads. Only admins can read
-- or update. No one is granted delete.
create policy "public can submit leads"
  on public.leads for insert
  to anon, authenticated
  with check (status = 'new' and admin_note is null);

create policy "admins can view leads"
  on public.leads for select
  to authenticated
  using (public.is_admin());

create policy "admins can update leads"
  on public.leads for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admin/roles/clients tables: readable by authenticated admins only, for now.
create policy "admins can view admin_users"
  on public.admin_users for select
  to authenticated
  using (public.is_admin());

create policy "admins can view roles"
  on public.roles for select
  to authenticated
  using (public.is_admin());

create policy "admins can view permissions"
  on public.permissions for select
  to authenticated
  using (public.is_admin());

create policy "admins can view role_permissions"
  on public.role_permissions for select
  to authenticated
  using (public.is_admin());

create policy "admins can view clients"
  on public.clients for select
  to authenticated
  using (public.is_admin());

create policy "admins can view client_assignments"
  on public.client_assignments for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Manual step after running this migration:
--   1. Create the admin user in Supabase Auth (Dashboard > Authentication).
--   2. insert into public.admin_users (id, email, full_name, role)
--      values ('<auth-user-uuid>', 'admin@example.com', 'Admin Name', 'admin');
-- ---------------------------------------------------------------------------
