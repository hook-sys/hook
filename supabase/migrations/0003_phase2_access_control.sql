-- Phase 2 — enforce sub-admin client scope and module permissions at the DB layer

-- True for active super admins, or active staff granted the named permission.
create or replace function public.has_permission(permission_name text)
returns boolean as $$
  select public.is_super_admin() or exists (
    select 1
    from public.admin_users au
    join public.admin_user_permissions aup on aup.admin_user_id = au.id
    join public.permissions p on p.id = aup.permission_id
    where au.id = auth.uid() and au.is_active and p.name = permission_name
  );
$$ language sql stable security definer set search_path = public;

-- Leads: staff need the 'leads' permission (super admins always pass).
drop policy if exists "admins can view leads" on public.leads;
drop policy if exists "admins can update leads" on public.leads;

create policy "staff with leads permission can view leads"
  on public.leads for select
  to authenticated
  using (public.has_permission('leads'));

create policy "staff with leads permission can update leads"
  on public.leads for update
  to authenticated
  using (public.has_permission('leads'))
  with check (public.has_permission('leads'));

-- Clients: active sub-admins can read only the clients assigned to them.
-- Insert/update remain super-admin only (policies from 0002 unchanged).
create policy "sub-admins can view assigned clients"
  on public.clients for select
  to authenticated
  using (
    public.is_admin() and exists (
      select 1 from public.client_assignments ca
      where ca.client_id = clients.id and ca.admin_user_id = auth.uid()
    )
  );
