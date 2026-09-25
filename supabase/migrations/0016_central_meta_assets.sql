-- Central Meta asset pool (managed by super admins) + per-client assignments.
-- Replaces the single-row client_meta_assets model (kept, read-only legacy) without
-- deleting any data. Pool rows are never deleted: assets that disappear from the Meta
-- connection are marked inactive; removing an assignment never touches the pool.

-- ---------------------------------------------------------------------------
-- Central pool
-- ---------------------------------------------------------------------------

create table public.meta_business_managers (
  business_id text primary key check (business_id ~ '^[0-9]+$'),
  name text not null check (char_length(name) between 1 and 300),
  is_active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.meta_ad_accounts (
  business_id text not null references public.meta_business_managers (business_id) on delete restrict,
  ad_account_id text not null check (ad_account_id ~ '^act_[0-9]+$'),
  name text not null check (char_length(name) between 1 and 300),
  relationship text not null default 'owned' check (relationship in ('owned', 'client')),
  is_active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (business_id, ad_account_id)
);
create index meta_ad_accounts_account_idx on public.meta_ad_accounts (ad_account_id);

create table public.meta_pages (
  business_id text not null references public.meta_business_managers (business_id) on delete restrict,
  page_id text not null check (page_id ~ '^[0-9]+$'),
  name text not null check (char_length(name) between 1 and 300),
  relationship text not null default 'owned' check (relationship in ('owned', 'client')),
  is_active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (business_id, page_id)
);
create index meta_pages_page_idx on public.meta_pages (page_id);

-- Instagram kept in the same model (connection scope is opt-in via META_INSTAGRAM_ENABLED).
create table public.meta_instagram_accounts (
  business_id text not null references public.meta_business_managers (business_id) on delete restrict,
  instagram_account_id text not null check (instagram_account_id ~ '^[0-9]+$'),
  username text not null check (char_length(username) between 1 and 300),
  relationship text not null default 'owned' check (relationship in ('owned', 'client')),
  is_active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (business_id, instagram_account_id)
);
create index meta_instagram_accounts_account_idx on public.meta_instagram_accounts (instagram_account_id);

-- ---------------------------------------------------------------------------
-- Client assignments. An asset can only be assigned together with its Business Manager
-- (composite FK), and removing a client's BM removes that client's assets under it.
-- ---------------------------------------------------------------------------

create table public.client_meta_business_managers (
  client_id uuid not null references public.clients (id) on delete cascade,
  business_id text not null references public.meta_business_managers (business_id) on delete restrict,
  assigned_by uuid references public.admin_users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (client_id, business_id)
);
create index client_meta_bm_business_idx on public.client_meta_business_managers (business_id);

create table public.client_meta_ad_accounts (
  client_id uuid not null,
  business_id text not null,
  ad_account_id text not null,
  assigned_by uuid references public.admin_users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (client_id, ad_account_id),
  foreign key (client_id, business_id) references public.client_meta_business_managers (client_id, business_id) on delete cascade,
  foreign key (business_id, ad_account_id) references public.meta_ad_accounts (business_id, ad_account_id) on delete restrict
);
create index client_meta_ad_accounts_pool_idx on public.client_meta_ad_accounts (business_id, ad_account_id);
create index client_meta_ad_accounts_client_bm_idx on public.client_meta_ad_accounts (client_id, business_id);

create table public.client_meta_pages (
  client_id uuid not null,
  business_id text not null,
  page_id text not null,
  assigned_by uuid references public.admin_users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (client_id, page_id),
  foreign key (client_id, business_id) references public.client_meta_business_managers (client_id, business_id) on delete cascade,
  foreign key (business_id, page_id) references public.meta_pages (business_id, page_id) on delete restrict
);
create index client_meta_pages_pool_idx on public.client_meta_pages (business_id, page_id);
create index client_meta_pages_client_bm_idx on public.client_meta_pages (client_id, business_id);

create table public.client_meta_instagram_accounts (
  client_id uuid not null,
  business_id text not null,
  instagram_account_id text not null,
  assigned_by uuid references public.admin_users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (client_id, instagram_account_id),
  foreign key (client_id, business_id) references public.client_meta_business_managers (client_id, business_id) on delete cascade,
  foreign key (business_id, instagram_account_id) references public.meta_instagram_accounts (business_id, instagram_account_id) on delete restrict
);
create index client_meta_ig_pool_idx on public.client_meta_instagram_accounts (business_id, instagram_account_id);
create index client_meta_ig_client_bm_idx on public.client_meta_instagram_accounts (client_id, business_id);

-- ---------------------------------------------------------------------------
-- Migrate existing single-row assignments (no data deleted, no duplicates)
-- ---------------------------------------------------------------------------

insert into public.meta_business_managers (business_id, name)
select distinct on (business_id) business_id, coalesce(nullif(business_name, ''), business_id)
from public.client_meta_assets
on conflict (business_id) do nothing;

insert into public.meta_ad_accounts (business_id, ad_account_id, name)
select distinct on (business_id, ad_account_id) business_id, ad_account_id, coalesce(nullif(ad_account_name, ''), ad_account_id)
from public.client_meta_assets where ad_account_id is not null
on conflict do nothing;

insert into public.meta_pages (business_id, page_id, name)
select distinct on (business_id, facebook_page_id) business_id, facebook_page_id, coalesce(nullif(facebook_page_name, ''), facebook_page_id)
from public.client_meta_assets where facebook_page_id is not null
on conflict do nothing;

insert into public.meta_instagram_accounts (business_id, instagram_account_id, username)
select distinct on (business_id, instagram_account_id) business_id, instagram_account_id, coalesce(nullif(instagram_username, ''), instagram_account_id)
from public.client_meta_assets where instagram_account_id is not null
on conflict do nothing;

insert into public.client_meta_business_managers (client_id, business_id, assigned_by, assigned_at)
select client_id, business_id, updated_by, updated_at from public.client_meta_assets
on conflict do nothing;

insert into public.client_meta_ad_accounts (client_id, business_id, ad_account_id, assigned_by, assigned_at)
select client_id, business_id, ad_account_id, updated_by, updated_at from public.client_meta_assets where ad_account_id is not null
on conflict do nothing;

insert into public.client_meta_pages (client_id, business_id, page_id, assigned_by, assigned_at)
select client_id, business_id, facebook_page_id, updated_by, updated_at from public.client_meta_assets where facebook_page_id is not null
on conflict do nothing;

insert into public.client_meta_instagram_accounts (client_id, business_id, instagram_account_id, assigned_by, assigned_at)
select client_id, business_id, instagram_account_id, updated_by, updated_at from public.client_meta_assets where instagram_account_id is not null
on conflict do nothing;

comment on table public.client_meta_assets is
  'LEGACY (pre-0016). Superseded by meta_* pool + client_meta_* assignment tables. Retained for history; no longer written by the app.';

-- ---------------------------------------------------------------------------
-- Integrity: campaigns and audiences may only reference assets assigned to their client
-- ---------------------------------------------------------------------------

create or replace function public.campaigns_enforce_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

  -- Meta asset references must be assets assigned to this client.
  if (tg_op = 'INSERT' or new.meta_ad_account_id is distinct from old.meta_ad_account_id
      or new.meta_page_id is distinct from old.meta_page_id
      or new.meta_instagram_account_id is distinct from old.meta_instagram_account_id) then
    if (new.meta_ad_account_id is not null and not exists (
          select 1 from public.client_meta_ad_accounts a where a.client_id = new.client_id and a.ad_account_id = new.meta_ad_account_id))
       or (new.meta_page_id is not null and not exists (
          select 1 from public.client_meta_pages p where p.client_id = new.client_id and p.page_id = new.meta_page_id))
       or (new.meta_instagram_account_id is not null and not exists (
          select 1 from public.client_meta_instagram_accounts i where i.client_id = new.client_id and i.instagram_account_id = new.meta_instagram_account_id))
    then
      raise exception 'Meta assets must be assigned to this client' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.audiences_enforce_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

  -- A Meta audience must live in an ad account assigned to this client.
  if new.meta_ad_account_id is not null and (tg_op = 'INSERT' or new.meta_ad_account_id is distinct from old.meta_ad_account_id)
     and not exists (select 1 from public.client_meta_ad_accounts a
                     where a.client_id = new.client_id and a.ad_account_id = new.meta_ad_account_id) then
    raise exception 'Audience ad account must be assigned to this client' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: pool = super admin; sub-admins may read only pool rows assigned to their clients.
-- Assignments = super admin manage; sub-admins read-only for assigned clients.
-- ---------------------------------------------------------------------------

create or replace function public.staff_is_assigned_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() and exists (
    select 1 from public.client_assignments ca
    where ca.client_id = p_client_id and ca.admin_user_id = auth.uid()
  );
$$;
revoke all on function public.staff_is_assigned_client(uuid) from public, anon;
grant execute on function public.staff_is_assigned_client(uuid) to authenticated;

alter table public.meta_business_managers enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_pages enable row level security;
alter table public.meta_instagram_accounts enable row level security;
alter table public.client_meta_business_managers enable row level security;
alter table public.client_meta_ad_accounts enable row level security;
alter table public.client_meta_pages enable row level security;
alter table public.client_meta_instagram_accounts enable row level security;

create policy "super admins manage meta business managers" on public.meta_business_managers for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view assigned meta business managers" on public.meta_business_managers for select to authenticated
  using (exists (select 1 from public.client_meta_business_managers c
                 where c.business_id = meta_business_managers.business_id and public.staff_is_assigned_client(c.client_id)));

create policy "super admins manage meta ad accounts" on public.meta_ad_accounts for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view assigned meta ad accounts" on public.meta_ad_accounts for select to authenticated
  using (exists (select 1 from public.client_meta_ad_accounts c
                 where c.business_id = meta_ad_accounts.business_id and c.ad_account_id = meta_ad_accounts.ad_account_id
                   and public.staff_is_assigned_client(c.client_id)));

create policy "super admins manage meta pages" on public.meta_pages for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view assigned meta pages" on public.meta_pages for select to authenticated
  using (exists (select 1 from public.client_meta_pages c
                 where c.business_id = meta_pages.business_id and c.page_id = meta_pages.page_id
                   and public.staff_is_assigned_client(c.client_id)));

create policy "super admins manage meta instagram accounts" on public.meta_instagram_accounts for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view assigned meta instagram accounts" on public.meta_instagram_accounts for select to authenticated
  using (exists (select 1 from public.client_meta_instagram_accounts c
                 where c.business_id = meta_instagram_accounts.business_id and c.instagram_account_id = meta_instagram_accounts.instagram_account_id
                   and public.staff_is_assigned_client(c.client_id)));

create policy "super admins manage client meta business managers" on public.client_meta_business_managers for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view client meta business managers" on public.client_meta_business_managers for select to authenticated
  using (public.staff_is_assigned_client(client_id));

create policy "super admins manage client meta ad accounts" on public.client_meta_ad_accounts for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view client meta ad accounts" on public.client_meta_ad_accounts for select to authenticated
  using (public.staff_is_assigned_client(client_id));

create policy "super admins manage client meta pages" on public.client_meta_pages for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view client meta pages" on public.client_meta_pages for select to authenticated
  using (public.staff_is_assigned_client(client_id));

create policy "super admins manage client meta instagram accounts" on public.client_meta_instagram_accounts for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "staff view client meta instagram accounts" on public.client_meta_instagram_accounts for select to authenticated
  using (public.staff_is_assigned_client(client_id));
