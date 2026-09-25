-- Per-client Google Drive sources (image/video assets only) and Drive-sourced creatives.

-- 1) A client can have many Drive sources: a folder (its image/video files) or a single file.
create table public.client_drive_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  drive_url text not null check (drive_url ~* '^https://(drive|docs)\.google\.com/' and char_length(drive_url) <= 2000),
  drive_id text not null check (drive_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  item_kind text not null check (item_kind in ('folder', 'file')),
  media_type text not null check (media_type in ('image', 'video', 'mixed')),
  status text not null default 'unchecked' check (status in ('available', 'unavailable', 'unchecked')),
  status_detail text check (char_length(status_detail) <= 300),
  checked_at timestamptz,
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, drive_id),
  unique (id, client_id)
);

create index client_drive_sources_client_idx on public.client_drive_sources (client_id, created_at);
create index client_drive_sources_created_by_idx on public.client_drive_sources (created_by);

create trigger client_drive_sources_set_updated_at
  before update on public.client_drive_sources
  for each row execute function public.set_updated_at();

alter table public.client_drive_sources enable row level security;
-- Super admins manage sources; staff assigned to the client (content or campaigns access) can
-- see them to pick assets. Drive itself is only ever accessed server-side.
create policy "super admins manage client drive sources" on public.client_drive_sources for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view client drive sources" on public.client_drive_sources for select to authenticated
  using (public.staff_can_access_client(client_id, 'content') or public.staff_can_access_client(client_id, 'campaigns'));

-- 2) Creatives can be an existing Drive image/video (no Fal.ai generation, no cost).
alter table public.creatives drop constraint creatives_provider_check;
alter table public.creatives add constraint creatives_provider_check check (provider in ('fal', 'drive'));
alter table public.creatives
  add column source text not null default 'generated' check (source in ('generated', 'drive')),
  add column drive_source_id uuid,
  add column drive_file_name text check (char_length(drive_file_name) <= 500);
alter table public.creatives
  add constraint creatives_drive_source_fkey foreign key (drive_source_id, client_id)
    references public.client_drive_sources (id, client_id) on delete set null (drive_source_id);
create index creatives_drive_source_idx on public.creatives (drive_source_id, client_id) where drive_source_id is not null;

-- A Drive creative is "ready" from the start, lives in Drive, and has no provider job.
alter table public.creatives add constraint creatives_drive_source_shape check (
  source <> 'drive' or (
    provider = 'drive' and drive_file_id is not null and drive_mime_type is not null
    and provider_request_id is null and provider_status_url is null and provider_response_url is null
  )
);
alter table public.creatives add constraint creatives_generated_provider check (source <> 'generated' or provider = 'fal');
-- Existing Drive videos have their own length; only generated videos use the fixed durations.
alter table public.creatives drop constraint creatives_check;
alter table public.creatives add constraint creatives_check check (source = 'drive' or ((media = 'video') = (duration_seconds is not null)));
