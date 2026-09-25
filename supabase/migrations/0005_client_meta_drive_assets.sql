-- Phase 4/5: client-level Meta asset assignment + Google Drive subfolder IDs

-- One assignment per client. IDs are only written after server-side validation against
-- the connected Business Manager; names are display metadata captured at assignment time.
create table public.client_meta_assets (
  client_id uuid primary key references public.clients (id) on delete cascade,
  business_id text not null check (business_id ~ '^[0-9]+$'),
  business_name text,
  ad_account_id text check (ad_account_id ~ '^act_[0-9]+$'),
  ad_account_name text,
  facebook_page_id text check (facebook_page_id ~ '^[0-9]+$'),
  facebook_page_name text,
  instagram_account_id text check (instagram_account_id ~ '^[0-9]+$'),
  instagram_username text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users (id) on delete set null,
  check (ad_account_id is not null or facebook_page_id is not null or instagram_account_id is not null)
);

create trigger client_meta_assets_set_updated_at
  before update on public.client_meta_assets
  for each row execute function public.set_updated_at();

alter table public.client_meta_assets enable row level security;

create policy "super admins manage client meta assets"
  on public.client_meta_assets for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "sub-admins view meta assets of assigned clients"
  on public.client_meta_assets for select
  to authenticated
  using (
    public.is_admin() and exists (
      select 1 from public.client_assignments ca
      where ca.client_id = client_meta_assets.client_id and ca.admin_user_id = auth.uid()
    )
  );

-- Drive: drive_folder_id already exists. Add the subfolder map
-- ({ products, images, videos, logos, brand_assets } -> folder ID) and last sync time.
-- Covered by the existing clients RLS (super admin writes, sub-admins read assigned rows).
alter table public.clients
  add column drive_subfolder_ids jsonb not null default '{}'::jsonb
    check (jsonb_typeof(drive_subfolder_ids) = 'object'),
  add column drive_synced_at timestamptz;
