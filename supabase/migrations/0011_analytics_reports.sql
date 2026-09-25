-- Phase 12: cached Meta insights snapshots + AI marketing report history.
-- Both are written only by the server (service role) after an app-level permission check,
-- so metrics and reports can never be fabricated through the API.

create table public.meta_insight_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  ad_account_id text not null check (ad_account_id ~ '^act_[0-9]+$'),
  range_key text not null check (char_length(range_key) <= 60),
  since date not null,
  until date not null,
  data jsonb not null,
  currency text check (currency ~ '^[A-Z]{3}$'),
  fetched_at timestamptz not null default now(),
  fetched_by uuid references public.admin_users (id) on delete set null,
  unique (client_id, ad_account_id, range_key),
  check (until >= since)
);

create index meta_insight_snapshots_client_idx on public.meta_insight_snapshots (client_id, fetched_at desc);

create table public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  ad_account_id text not null check (ad_account_id ~ '^act_[0-9]+$'),
  range_key text not null check (char_length(range_key) <= 60),
  since date not null,
  until date not null,
  facts jsonb not null,
  report jsonb not null,
  model text not null check (char_length(model) <= 200),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_cost_usd numeric(10, 4) check (estimated_cost_usd >= 0),
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (until >= since)
);

create index ai_reports_client_idx on public.ai_reports (client_id, created_at desc);

alter table public.meta_insight_snapshots enable row level security;
alter table public.ai_reports enable row level security;

create policy "staff view insight snapshots" on public.meta_insight_snapshots for select to authenticated
  using (public.staff_can_access_client(client_id, 'analytics'));
create policy "staff view ai reports" on public.ai_reports for select to authenticated
  using (public.staff_can_access_client(client_id, 'analytics'));
create policy "super admins delete ai reports" on public.ai_reports for delete to authenticated
  using ((select public.is_super_admin()));
