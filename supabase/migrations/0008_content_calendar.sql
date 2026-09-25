-- Phase 10: client-scoped AI content calendar.

create table public.content_calendars (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  start_date date not null,
  days smallint not null check (days between 7 and 31),
  platforms text[] not null check (platforms <@ array['facebook', 'instagram']::text[] and cardinality(platforms) > 0),
  focus_notes text check (char_length(focus_notes) <= 1000),
  model text check (char_length(model) <= 200),
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, client_id)
);

create index content_calendars_client_idx on public.content_calendars (client_id, created_at desc);

create table public.content_calendar_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  calendar_id uuid not null,
  product_id uuid,
  scheduled_date date not null,
  content_type text not null check (content_type in (
    'product_post', 'product_image_ad', 'product_video', 'educational', 'problem_solution',
    'trust_social_proof', 'offer', 'retargeting', 'engagement', 'seasonal_promotional')),
  platform text not null check (platform in ('facebook', 'instagram')),
  hatog_stage text not null check (hatog_stage in ('hook', 'feature', 'trust', 'offer', 'gift')),
  hook text not null check (char_length(hook) between 1 and 500),
  concept text not null check (char_length(concept) between 1 and 1000),
  caption text not null check (char_length(caption) between 1 and 2200),
  cta text not null check (char_length(cta) between 1 and 200),
  creative_direction text not null check (char_length(creative_direction) between 1 and 1500),
  suggested_format text not null check (suggested_format in ('single_image', 'carousel', 'video', 'reel', 'story')),
  aspect_ratio text not null check (aspect_ratio in ('9:16', '1:1', '16:9', '4:5')),
  duration_seconds smallint check (duration_seconds between 5 and 90),
  status text not null default 'draft' check (status in ('draft', 'approved', 'scheduled', 'published', 'failed', 'archived')),
  notes text check (char_length(notes) <= 1000),
  -- A human-recorded link to the live post. Nothing is posted automatically.
  post_url text check (post_url ~* '^https://([a-z0-9-]+\.)*(facebook\.com|instagram\.com|fb\.com)/'),
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (calendar_id, client_id) references public.content_calendars (id, client_id) on delete cascade,
  foreign key (product_id, client_id) references public.products (id, client_id) on delete set null (product_id),
  check ((suggested_format in ('video', 'reel')) = (duration_seconds is not null)),
  check (status <> 'published' or post_url is not null)
);

create index content_calendar_items_client_date_idx on public.content_calendar_items (client_id, scheduled_date);
create index content_calendar_items_calendar_idx on public.content_calendar_items (calendar_id, client_id);
create index content_calendar_items_product_idx on public.content_calendar_items (product_id, client_id) where product_id is not null;

create trigger content_calendar_items_set_updated_at
  before update on public.content_calendar_items
  for each row execute function public.set_updated_at();

-- draft -> approved|archived ; approved -> draft|scheduled|archived ;
-- scheduled -> approved|published|failed|archived ; failed -> scheduled|archived ;
-- published -> archived ; archived -> draft
create or replace function public.content_items_enforce_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Calendar items must be created as drafts' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('approved', 'archived'))
    or (old.status = 'approved' and new.status in ('draft', 'scheduled', 'archived'))
    or (old.status = 'scheduled' and new.status in ('approved', 'published', 'failed', 'archived'))
    or (old.status = 'failed' and new.status in ('scheduled', 'archived'))
    or (old.status = 'published' and new.status = 'archived')
    or (old.status = 'archived' and new.status = 'draft')
  ) then
    raise exception 'Invalid calendar item status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger content_items_status_transition
  before insert or update on public.content_calendar_items
  for each row execute function public.content_items_enforce_status_transition();

alter table public.content_calendars enable row level security;
alter table public.content_calendar_items enable row level security;

create policy "staff view content calendars" on public.content_calendars for select to authenticated
  using (public.staff_can_access_client(client_id, 'content'));
create policy "staff create content calendars" on public.content_calendars for insert to authenticated
  with check (public.staff_can_access_client(client_id, 'content'));
create policy "super admins delete content calendars" on public.content_calendars for delete to authenticated
  using ((select public.is_super_admin()));

create policy "staff view calendar items" on public.content_calendar_items for select to authenticated
  using (public.staff_can_access_client(client_id, 'content'));
create policy "staff create calendar items" on public.content_calendar_items for insert to authenticated
  with check (public.staff_can_access_client(client_id, 'content'));
-- Sub-admins edit, approve and archive; scheduling and recording published/failed posts is
-- super-admin only.
create policy "staff update calendar items" on public.content_calendar_items for update to authenticated
  using (
    public.staff_can_access_client(client_id, 'content')
    and ((select public.is_super_admin()) or status in ('draft', 'approved', 'archived'))
  )
  with check (
    public.staff_can_access_client(client_id, 'content')
    and ((select public.is_super_admin()) or status in ('draft', 'approved', 'archived'))
  );
create policy "super admins delete calendar items" on public.content_calendar_items for delete to authenticated
  using ((select public.is_super_admin()));
