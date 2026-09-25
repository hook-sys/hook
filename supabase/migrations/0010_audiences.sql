-- Phase 11: Meta Custom Audience definitions. Internal definitions are separate from the
-- Meta audience ID, which only the server (service role) records after Meta returns it.

create table public.audiences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  audience_type text not null check (audience_type in (
    'website_visitors', 'video_viewers', 'page_engagers', 'instagram_engagers', 'customer_list',
    'add_to_cart', 'initiate_checkout', 'purchase', 'lead', 'retargeting')),
  -- Pixel ID for website/event audiences; Page/Instagram IDs come from the client's assignment.
  source text check (char_length(source) <= 200),
  description text check (char_length(description) <= 1000),
  hatog_stage text check (hatog_stage in ('hook', 'feature', 'trust', 'offer', 'gift')),
  retention_days smallint not null check (retention_days in (7, 14, 30, 60, 90, 180)),
  status text not null default 'draft' check (status in ('draft', 'active', 'error', 'archived')),
  meta_audience_id text check (meta_audience_id ~ '^[0-9]+$'),
  meta_ad_account_id text check (meta_ad_account_id ~ '^act_[0-9]+$'),
  approximate_count_lower bigint check (approximate_count_lower >= 0),
  approximate_count_upper bigint check (approximate_count_upper >= 0),
  delivery_status_code integer,
  delivery_status_description text check (char_length(delivery_status_description) <= 500),
  operation_status_code integer,
  last_synced_at timestamptz,
  error text check (char_length(error) <= 1000),
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, client_id),
  unique (client_id, meta_audience_id),
  check (status <> 'active' or (meta_audience_id is not null and meta_ad_account_id is not null)),
  check (meta_audience_id is null or meta_ad_account_id is not null)
);

create index audiences_client_status_idx on public.audiences (client_id, status, created_at desc);

create trigger audiences_set_updated_at
  before update on public.audiences
  for each row execute function public.set_updated_at();

create or replace function public.audiences_enforce_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  assigned_account text;
begin
  -- Meta references and sync results are recorded only by the server after Meta confirms
  -- them (service role). Signed-in users can never set or fake them through the API.
  if current_user in ('authenticated', 'anon') and (
    (tg_op = 'INSERT' and (new.meta_audience_id is not null or new.meta_ad_account_id is not null
                           or new.status not in ('draft') or new.last_synced_at is not null))
    or (tg_op = 'UPDATE' and (
      new.meta_audience_id is distinct from old.meta_audience_id
      or new.meta_ad_account_id is distinct from old.meta_ad_account_id
      or new.approximate_count_lower is distinct from old.approximate_count_lower
      or new.approximate_count_upper is distinct from old.approximate_count_upper
      or new.delivery_status_code is distinct from old.delivery_status_code
      or new.operation_status_code is distinct from old.operation_status_code
      or new.last_synced_at is distinct from old.last_synced_at
      or (new.status is distinct from old.status and new.status in ('active', 'error'))))
  ) then
    raise exception 'Meta audience fields are set by the server only' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('active', 'error', 'archived'))
    or (old.status = 'active' and new.status in ('error', 'archived'))
    or (old.status = 'error' and new.status in ('draft', 'active', 'archived'))
    or (old.status = 'archived' and new.status = 'draft')
  ) then
    raise exception 'Invalid audience status transition: % -> %', old.status, new.status using errcode = 'check_violation';
  end if;

  -- A Meta audience must live in the client's own assigned ad account.
  if new.meta_ad_account_id is not null and (tg_op = 'INSERT' or new.meta_ad_account_id is distinct from old.meta_ad_account_id) then
    select ad_account_id into assigned_account from public.client_meta_assets where client_id = new.client_id;
    if assigned_account is null or assigned_account <> new.meta_ad_account_id then
      raise exception 'Audience ad account must match the client''s assigned ad account' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger audiences_rules
  before insert or update on public.audiences
  for each row execute function public.audiences_enforce_rules();

alter table public.audiences enable row level security;

create policy "staff view audiences" on public.audiences for select to authenticated
  using (public.staff_can_access_client(client_id, 'ai_ads'));
create policy "staff create audiences" on public.audiences for insert to authenticated
  with check (public.staff_can_access_client(client_id, 'ai_ads'));
create policy "staff update audiences" on public.audiences for update to authenticated
  using (public.staff_can_access_client(client_id, 'ai_ads'))
  with check (public.staff_can_access_client(client_id, 'ai_ads'));
create policy "super admins delete audiences" on public.audiences for delete to authenticated
  using ((select public.is_super_admin()));
