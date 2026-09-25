-- Phase 13: Drive upload tracking for Ready creatives. Only references are stored (never the
-- file). "uploaded" requires a real Drive file ID returned by Google.

alter table public.creatives
  add column drive_web_url text check (drive_web_url ~* '^https://(drive|docs)\.google\.com/'),
  add column drive_mime_type text check (drive_mime_type ~ '^(image|video)/[a-z0-9.+-]+$'),
  add column drive_folder_id text check (drive_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  add column drive_uploaded_at timestamptz,
  add column drive_upload_status text not null default 'not_uploaded'
    check (drive_upload_status in ('not_uploaded', 'uploading', 'uploaded', 'failed')),
  add column drive_upload_started_at timestamptz,
  add column drive_error text check (char_length(drive_error) <= 1000),
  add constraint creatives_drive_uploaded_has_file
    check (drive_upload_status <> 'uploaded' or (drive_file_id is not null and drive_uploaded_at is not null));

create index creatives_drive_pending_idx on public.creatives (client_id)
  where status = 'ready' and drive_upload_status in ('not_uploaded', 'failed');
