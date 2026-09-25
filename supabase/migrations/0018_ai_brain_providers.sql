-- Multi-provider AI brain (Claude / OpenAI / Gemini) with admin-controlled model routing.
-- Provider API keys reuse the existing integrations + Vault architecture (0004).

-- 1) New API-key integrations.
alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('google_drive', 'meta', 'claude', 'openai', 'gemini', 'fal', 'inworld', 'tiktok', 'youtube'));

-- 2) Usage log: new providers + task, duration and fallback tracking.
alter table public.ai_generation_logs drop constraint ai_generation_logs_provider_check;
alter table public.ai_generation_logs add constraint ai_generation_logs_provider_check
  check (provider in ('anthropic', 'openai', 'gemini', 'fal'));
alter table public.ai_generation_logs
  add column task text check (task in ('strategy', 'content', 'campaign_intelligence', 'analytics_report', 'creative_brief')),
  add column duration_ms integer check (duration_ms >= 0),
  add column fallback_used boolean not null default false;

-- 3) Models discovered from each provider's API (never invented). Rows are never deleted:
--    models no longer returned are marked unavailable, so saved selections stay consistent.
create table public.ai_provider_models (
  provider text not null check (provider in ('claude', 'openai', 'gemini')),
  model_id text not null check (char_length(model_id) between 1 and 200 and model_id ~ '^[A-Za-z0-9._:/-]+$'),
  display_name text not null check (char_length(display_name) between 1 and 300),
  is_available boolean not null default true,
  supports_structured boolean,          -- null = not reported by the provider
  supports_adaptive_thinking boolean,   -- Claude only; null = not reported
  fetched_at timestamptz not null default now(),
  primary key (provider, model_id)
);

-- 4) Per-provider default model.
create table public.ai_provider_settings (
  provider text primary key check (provider in ('claude', 'openai', 'gemini')),
  enabled boolean not null default true,
  default_model text,
  updated_by uuid references public.admin_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (provider, default_model) references public.ai_provider_models (provider, model_id) on delete restrict
);

-- 5) Global brain settings (single row): default provider + optional fallback (OFF by default).
create table public.ai_brain_settings (
  id boolean primary key default true check (id),
  default_provider text not null default 'claude' check (default_provider in ('claude', 'openai', 'gemini')),
  fallback_enabled boolean not null default false,
  fallback_provider text check (fallback_provider in ('claude', 'openai', 'gemini')),
  fallback_model text,
  updated_by uuid references public.admin_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (fallback_provider, fallback_model) references public.ai_provider_models (provider, model_id) on delete restrict,
  check (not fallback_enabled or (fallback_provider is not null and fallback_model is not null))
);

-- 6) Task-specific routing; a task without an enabled row uses the default provider/model.
create table public.ai_task_models (
  task text primary key check (task in ('strategy', 'content', 'campaign_intelligence', 'analytics_report', 'creative_brief')),
  provider text not null check (provider in ('claude', 'openai', 'gemini')),
  model text not null,
  enabled boolean not null default true,
  updated_by uuid references public.admin_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- the composite FK makes a provider/model mismatch impossible
  foreign key (provider, model) references public.ai_provider_models (provider, model_id) on delete restrict
);

create index ai_provider_settings_model_idx on public.ai_provider_settings (provider, default_model);
create index ai_brain_settings_fallback_idx on public.ai_brain_settings (fallback_provider, fallback_model);
create index ai_task_models_model_idx on public.ai_task_models (provider, model);
create index ai_generation_logs_task_idx on public.ai_generation_logs (client_id, task, created_at desc) where task is not null;

-- 7) RLS: AI brain configuration is super-admin only. The server reads routing with the
--    service role after its own permission checks, so sub-admins can still run AI tasks
--    without being able to read or change the configuration.
alter table public.ai_provider_models enable row level security;
alter table public.ai_provider_settings enable row level security;
alter table public.ai_brain_settings enable row level security;
alter table public.ai_task_models enable row level security;

create policy "super admins manage ai provider models" on public.ai_provider_models for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "super admins manage ai provider settings" on public.ai_provider_settings for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "super admins manage ai brain settings" on public.ai_brain_settings for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "super admins manage ai task models" on public.ai_task_models for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
