-- Phase 15: RLS/query performance. Same policy semantics; auth.uid() and helper calls are
-- wrapped in (select ...) so Postgres evaluates them once per statement, not per row.

alter policy "staff can view own permissions, admins view all" on public.admin_user_permissions
  using ((select public.is_super_admin()) or admin_user_id = (select auth.uid()));
alter policy "admins can view admin_users" on public.admin_users
  using ((select public.is_super_admin()) or id = (select auth.uid()));
alter policy "admins can view client_assignments" on public.client_assignments
  using ((select public.is_super_admin()) or admin_user_id = (select auth.uid()));
alter policy "sub-admins view ai knowledge of assigned clients" on public.client_ai_knowledge
  using ((select public.is_admin()) and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = client_ai_knowledge.client_id and ca.admin_user_id = (select auth.uid())));
alter policy "sub-admins view meta assets of assigned clients" on public.client_meta_assets
  using ((select public.is_admin()) and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = client_meta_assets.client_id and ca.admin_user_id = (select auth.uid())));
alter policy "sub-admins can view assigned clients" on public.clients
  using ((select public.is_admin()) and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = clients.id and ca.admin_user_id = (select auth.uid())));
alter policy "sub-admins view product assets of assigned clients" on public.product_assets
  using ((select public.is_admin()) and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = product_assets.client_id and ca.admin_user_id = (select auth.uid())));
alter policy "sub-admins view products of assigned clients" on public.products
  using ((select public.is_admin()) and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = products.client_id and ca.admin_user_id = (select auth.uid())));

-- Covering indexes for foreign keys on join / cascade paths.
create index if not exists campaigns_product_client_idx on public.campaigns (product_id, client_id);
create index if not exists creatives_product_client_fk_idx on public.creatives (product_id, client_id);
create index if not exists product_assets_product_client_idx on public.product_assets (product_id, client_id);
create index if not exists client_assignments_client_idx on public.client_assignments (client_id);
create index if not exists admin_user_permissions_permission_idx on public.admin_user_permissions (permission_id);
create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id);
