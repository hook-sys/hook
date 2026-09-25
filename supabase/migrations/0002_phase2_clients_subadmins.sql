-- Phase 2 — Client Management + Sub-Admin foundation

-- ---------------------------------------------------------------------------
-- admin_users: add active/inactive flag (used to deactivate sub-admins)
-- ---------------------------------------------------------------------------

alter table public.admin_users add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- Per-sub-admin module permissions (direct grant, no role-template layer yet)
-- ---------------------------------------------------------------------------

create table public.admin_user_permissions (
  admin_user_id uuid not null references public.admin_users (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_user_id, permission_id)
);

alter table public.admin_user_permissions enable row level security;

insert into public.permissions (name, description)
select v.name, v.description from (values
  ('dashboard', 'Dashboard overview'),
  ('leads', 'Leads management'),
  ('clients', 'Client management'),
  ('meta', 'Meta integration'),
  ('ai_ads', 'AI Ad Manager'),
  ('campaigns', 'Campaigns'),
  ('content', 'Content Studio & Calendar'),
  ('analytics', 'Analytics & AI Reports'),
  ('settings', 'Settings'),
  ('sub_admin_management', 'Sub-Admin management')
) as v(name, description)
where not exists (select 1 from public.permissions p where p.name = v.name);

-- ---------------------------------------------------------------------------
-- Demo clients
-- ---------------------------------------------------------------------------

insert into public.clients (business_name, status)
select v.business_name, 'active' from (values
  ('Demo Business'),
  ('ABC Fashion'),
  ('Vertex Lifestyle'),
  ('Urban Electronics'),
  ('Jolchhap Craft')
) as v(business_name)
where not exists (select 1 from public.clients c where c.business_name = v.business_name);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

-- Any active staff member (admin or sub-admin).
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.admin_users where id = auth.uid() and is_active
  );
$$ language sql stable security definer set search_path = public;

-- Full admin only (role = 'admin'), active.
create or replace function public.is_super_admin()
returns boolean as $$
  select exists (
    select 1 from public.admin_users where id = auth.uid() and role = 'admin' and is_active
  );
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- RLS: clients — admin-only management
-- ---------------------------------------------------------------------------

drop policy if exists "admins can view clients" on public.clients;

create policy "admins can view clients"
  on public.clients for select
  to authenticated
  using (public.is_super_admin());

create policy "admins can insert clients"
  on public.clients for insert
  to authenticated
  with check (public.is_super_admin());

create policy "admins can update clients"
  on public.clients for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- RLS: admin_users — self can read own row (for session/profile), admin-only
-- to manage sub-admin accounts
-- ---------------------------------------------------------------------------

drop policy if exists "admins can view admin_users" on public.admin_users;

create policy "admins can view admin_users"
  on public.admin_users for select
  to authenticated
  using (public.is_super_admin() or id = auth.uid());

create policy "admins can insert admin_users"
  on public.admin_users for insert
  to authenticated
  with check (public.is_super_admin());

create policy "admins can update admin_users"
  on public.admin_users for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- RLS: client_assignments — admin-only to manage, staff can see their own
-- ---------------------------------------------------------------------------

drop policy if exists "admins can view client_assignments" on public.client_assignments;

create policy "admins can view client_assignments"
  on public.client_assignments for select
  to authenticated
  using (public.is_super_admin() or admin_user_id = auth.uid());

create policy "admins can insert client_assignments"
  on public.client_assignments for insert
  to authenticated
  with check (public.is_super_admin());

create policy "admins can delete client_assignments"
  on public.client_assignments for delete
  to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- RLS: admin_user_permissions — admin-only to grant/revoke, staff can see own
-- ---------------------------------------------------------------------------

create policy "staff can view own permissions, admins view all"
  on public.admin_user_permissions for select
  to authenticated
  using (public.is_super_admin() or admin_user_id = auth.uid());

create policy "admins can grant permissions"
  on public.admin_user_permissions for insert
  to authenticated
  with check (public.is_super_admin());

create policy "admins can revoke permissions"
  on public.admin_user_permissions for delete
  to authenticated
  using (public.is_super_admin());
