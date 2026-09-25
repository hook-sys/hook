-- Final stack: AI brain (one selected provider/model) -> Fal.ai (image/video) -> Google Drive.

-- 1) Fal.ai model selection: one model per generation mode, chosen by the Super Admin from
--    the app's verified model registry (validated in code; availability checked with fal.ai).
create table public.fal_model_settings (
  mode text primary key check (mode in ('text-to-image', 'image-to-image', 'text-to-video', 'image-to-video')),
  model_id text not null check (char_length(model_id) between 3 and 200 and model_id ~ '^[a-z0-9-]+(/[a-z0-9._-]+)+$'),
  updated_by uuid references public.admin_users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.fal_model_settings enable row level security;
create policy "super admins manage fal model settings" on public.fal_model_settings for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- 2) Product assets: Google Drive is the only source, and only images/videos are allowed.
--    (No product_assets rows existed when this was written.) The detected MIME type is stored.
alter table public.product_assets drop constraint product_assets_asset_type_check;
alter table public.product_assets add constraint product_assets_asset_type_check check (asset_type in ('image', 'video'));
alter table public.product_assets add column mime_type text
  check (mime_type ~ '^(image|video)/[a-z0-9.+-]+$' and split_part(mime_type, '/', 1) = asset_type);
alter table public.product_assets add constraint product_assets_drive_only check (drive_file_id is not null and mime_type is not null);
