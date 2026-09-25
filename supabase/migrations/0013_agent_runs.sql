-- Phase 14: AI Marketing Agent activity log. Written only by the server (service role) so the
-- audit trail can't be edited; tool inputs/outputs are stored redacted and truncated.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid references public.admin_users (id) on delete set null,
  request text not null check (char_length(request) between 1 and 2000),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'stopped')),
  tool_calls jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_calls) = 'array'),
  result text check (char_length(result) <= 20000),
  error text check (char_length(error) <= 1000),
  turns smallint not null default 0 check (turns >= 0),
  duration_ms integer check (duration_ms >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_cost_usd numeric(10, 4) check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index agent_runs_client_idx on public.agent_runs (client_id, created_at desc);
create index agent_runs_user_idx on public.agent_runs (user_id, created_at desc);

alter table public.agent_runs enable row level security;

-- Super admins see every run; sub-admins see their own runs on assigned clients with ai_ads.
create policy "staff view agent runs" on public.agent_runs for select to authenticated
  using (
    (select public.is_super_admin())
    or (user_id = (select auth.uid()) and public.staff_can_access_client(client_id, 'ai_ads'))
  );
