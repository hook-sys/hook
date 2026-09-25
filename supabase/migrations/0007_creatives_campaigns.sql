-- Phase 8/9: AI creatives, generation usage log, Meta campaign drafts.

-- One access check for client-scoped marketing data: super admins always; sub-admins
-- only for assigned clients AND when granted the given module permission.
create or replace function public.staff_can_access_client(p_client_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or (
    public.has_permission(p_permission) and exists (
      select 1 from public.client_assignments ca
      where ca.client_id = p_client_id and ca.admin_user_id = auth.uid()
    )
  );
$$;

revoke all on function public.staff_can_access_client(uuid, text) from public, anon;
grant execute on function public.staff_can_access_client(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Creatives: generated assets are referenced by URL, never stored in the database.
-- ---------------------------------------------------------------------------

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  product_id uuid not null,
  media text not null check (media in ('image', 'video')),
  creative_type text not null,
  hatog_stage text not null check (hatog_stage in ('hook', 'feature', 'trust', 'offer', 'gift')),
  format text not null check (format in ('9:16', '1:1', '16:9')),
  duration_seconds smallint check (duration_seconds in (5, 10, 15, 30)),
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed', 'archived')),
  brief jsonb not null default '{}'::jsonb,
  prompt text not null check (char_length(prompt) <= 5000),
  negative_prompt text check (char_length(negative_prompt) <= 2000),
  reference_image_url text check (reference_image_url ~* '^https://'),
  provider text not null default 'fal' check (provider in ('fal')),
  provider_model text not null check (char_length(provider_model) <= 200),
  provider_request_id text check (char_length(provider_request_id) <= 200),
  provider_status_url text check (provider_status_url ~* '^https://queue\.fal\.run/'),
  provider_response_url text check (provider_response_url ~* '^https://queue\.fal\.run/'),
  asset_url text check (asset_url ~* '^https://'),
  thumbnail_url text check (thumbnail_url ~* '^https://'),
  error text check (char_length(error) <= 1000),
  -- Reserved: set when an approved creative is saved to the client's Drive (later phase).
  drive_file_id text check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (product_id, client_id) references public.products (id, client_id) on delete cascade,
  unique (id, client_id),
  check ((media = 'video') = (duration_seconds is not null)),
  check (
    (media = 'image' and creative_type in ('product_showcase', 'product_feature', 'lifestyle', 'offer_promotion'))
    or (media = 'video' and creative_type in ('product_showcase', 'feature_demo', 'problem_solution', 'lifestyle',
                                              'offer_promotion', 'ugc_presentation', 'cinematic'))
  ),
  check (status <> 'ready' or asset_url is not null)
);

create index creatives_client_status_idx on public.creatives (client_id, status, created_at desc);
create index creatives_client_product_idx on public.creatives (client_id, product_id);
create index creatives_generating_idx on public.creatives (client_id) where status = 'generating';

create trigger creatives_set_updated_at
  before update on public.creatives
  for each row execute function public.set_updated_at();

-- generating -> ready | failed ; ready -> archived ; failed -> archived
create or replace function public.creatives_enforce_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status and not (
    (old.status = 'generating' and new.status in ('ready', 'failed'))
    or (old.status in ('ready', 'failed') and new.status = 'archived')
  ) then
    raise exception 'Invalid creative status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger creatives_status_transition
  before update of status on public.creatives
  for each row execute function public.creatives_enforce_status_transition();

-- ---------------------------------------------------------------------------
-- Campaign drafts (internal). Meta IDs are a snapshot of the client's assigned assets.
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  product_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  objective text not null check (objective in ('OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT',
                                               'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_APP_PROMOTION')),
  hatog_stage text check (hatog_stage in ('hook', 'feature', 'trust', 'offer', 'gift')),
  status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'approved', 'published', 'paused', 'archived')),
  strategy jsonb not null default '{}'::jsonb,
  daily_budget numeric(12, 2) check (daily_budget > 0),
  budget_currency text not null default 'BDT' check (budget_currency ~ '^[A-Z]{3}$'),
  meta_ad_account_id text check (meta_ad_account_id ~ '^act_[0-9]+$'),
  meta_page_id text check (meta_page_id ~ '^[0-9]+$'),
  meta_instagram_account_id text check (meta_instagram_account_id ~ '^[0-9]+$'),
  meta_campaign_id text check (meta_campaign_id ~ '^[0-9]+$'),
  meta_adset_id text check (meta_adset_id ~ '^[0-9]+$'),
  meta_ad_ids text[] not null default '{}',
  published_at timestamptz,
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (product_id, client_id) references public.products (id, client_id) on delete cascade,
  unique (id, client_id),
  -- "Published"/"Paused" can only exist once Meta returned real IDs: never faked.
  check (status not in ('published', 'paused') or (meta_campaign_id is not null and meta_adset_id is not null))
);

create index campaigns_client_status_idx on public.campaigns (client_id, status, created_at desc);
create index campaigns_client_product_idx on public.campaigns (client_id, product_id);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create or replace function public.campaigns_enforce_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  assigned public.client_meta_assets%rowtype;
begin
  -- Status transitions.
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('ready_for_review', 'archived'))
    or (old.status = 'ready_for_review' and new.status in ('draft', 'approved', 'archived'))
    or (old.status = 'approved' and new.status in ('draft', 'published', 'archived'))
    or (old.status = 'published' and new.status = 'paused')
    or (old.status = 'paused' and new.status in ('published', 'archived'))
    or (old.status = 'archived' and new.status = 'draft')
  ) then
    raise exception 'Invalid campaign status transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Campaigns must be created as drafts' using errcode = 'check_violation';
  end if;

  -- Meta asset references must be the client's own assigned assets.
  if (tg_op = 'INSERT' or new.meta_ad_account_id is distinct from old.meta_ad_account_id
      or new.meta_page_id is distinct from old.meta_page_id
      or new.meta_instagram_account_id is distinct from old.meta_instagram_account_id)
     and (new.meta_ad_account_id is not null or new.meta_page_id is not null or new.meta_instagram_account_id is not null)
  then
    select * into assigned from public.client_meta_assets where client_id = new.client_id;
    if not found
       or (new.meta_ad_account_id is not null and new.meta_ad_account_id is distinct from assigned.ad_account_id)
       or (new.meta_page_id is not null and new.meta_page_id is distinct from assigned.facebook_page_id)
       or (new.meta_instagram_account_id is not null and new.meta_instagram_account_id is distinct from assigned.instagram_account_id)
    then
      raise exception 'Meta assets must match the assets assigned to this client' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger campaigns_rules
  before insert or update on public.campaigns
  for each row execute function public.campaigns_enforce_rules();

-- Selected creatives. Composite FKs guarantee campaign and creative belong to the same client.
create table public.campaign_creatives (
  campaign_id uuid not null,
  creative_id uuid not null,
  client_id uuid not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (campaign_id, creative_id),
  foreign key (campaign_id, client_id) references public.campaigns (id, client_id) on delete cascade,
  foreign key (creative_id, client_id) references public.creatives (id, client_id) on delete cascade
);

create index campaign_creatives_creative_idx on public.campaign_creatives (creative_id, client_id);
create index campaign_creatives_campaign_client_idx on public.campaign_creatives (campaign_id, client_id);

-- ---------------------------------------------------------------------------
-- AI usage log (basis for future per-client cost reporting; no billing).
-- ---------------------------------------------------------------------------

create table public.ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  creative_id uuid references public.creatives (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  provider text not null check (provider in ('anthropic', 'fal')),
  model text not null check (char_length(model) <= 200),
  generation_type text not null check (generation_type in ('creative_brief', 'campaign_strategy', 'image', 'video')),
  status text not null check (status in ('succeeded', 'failed', 'submitted')),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  units numeric(10, 2) check (units >= 0),
  estimated_cost_usd numeric(10, 4) check (estimated_cost_usd >= 0),
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index ai_generation_logs_client_idx on public.ai_generation_logs (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.creatives enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_creatives enable row level security;
alter table public.ai_generation_logs enable row level security;

-- Creatives: `content` permission on an assigned client (super admins always).
create policy "staff view creatives" on public.creatives for select to authenticated
  using (public.staff_can_access_client(client_id, 'content'));
create policy "staff create creatives" on public.creatives for insert to authenticated
  with check (public.staff_can_access_client(client_id, 'content'));
create policy "staff update creatives" on public.creatives for update to authenticated
  using (public.staff_can_access_client(client_id, 'content'))
  with check (public.staff_can_access_client(client_id, 'content'));
create policy "super admins delete creatives" on public.creatives for delete to authenticated
  using ((select public.is_super_admin()));

-- Campaigns: `campaigns` permission on an assigned client. Sub-admins can only create and
-- edit unpublished drafts; approval, publishing and Meta IDs are super-admin only.
create policy "staff view campaigns" on public.campaigns for select to authenticated
  using (public.staff_can_access_client(client_id, 'campaigns'));
create policy "staff create campaign drafts" on public.campaigns for insert to authenticated
  with check (
    public.staff_can_access_client(client_id, 'campaigns')
    and ((select public.is_super_admin()) or meta_campaign_id is null)
  );
create policy "staff update campaign drafts" on public.campaigns for update to authenticated
  using (
    public.staff_can_access_client(client_id, 'campaigns')
    and ((select public.is_super_admin()) or status in ('draft', 'ready_for_review'))
  )
  with check (
    public.staff_can_access_client(client_id, 'campaigns')
    and ((select public.is_super_admin())
         or (status in ('draft', 'ready_for_review') and meta_campaign_id is null and meta_adset_id is null))
  );
create policy "super admins delete campaigns" on public.campaigns for delete to authenticated
  using ((select public.is_super_admin()));

create policy "staff view campaign creatives" on public.campaign_creatives for select to authenticated
  using (public.staff_can_access_client(client_id, 'campaigns'));
create policy "staff add campaign creatives" on public.campaign_creatives for insert to authenticated
  with check (
    public.staff_can_access_client(client_id, 'campaigns')
    and ((select public.is_super_admin()) or exists (
      select 1 from public.campaigns c
      where c.id = campaign_creatives.campaign_id and c.status in ('draft', 'ready_for_review')
    ))
  );
create policy "staff remove campaign creatives" on public.campaign_creatives for delete to authenticated
  using (
    public.staff_can_access_client(client_id, 'campaigns')
    and ((select public.is_super_admin()) or exists (
      select 1 from public.campaigns c
      where c.id = campaign_creatives.campaign_id and c.status in ('draft', 'ready_for_review')
    ))
  );

-- Usage log: super admins read; rows are written server-side with the service role.
create policy "super admins view ai usage" on public.ai_generation_logs for select to authenticated
  using ((select public.is_super_admin()));
