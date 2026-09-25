-- Simplify the AI brain to ONE globally selected provider + ONE model for every AI brain
-- operation (strategy, content, campaign intelligence / AI Agent, analytics report,
-- creative brief). No per-task routing, no automatic fallback between providers.
-- Fal.ai (image/video) is unaffected. Provider integrations and discovered models stay.
-- (At the time of writing ai_task_models / ai_provider_settings / fallback held no rows.)

-- 1) The selected model lives on the single settings row. The composite FK guarantees the
--    model belongs to the selected provider and was discovered from that provider's API.
alter table public.ai_brain_settings add column default_model text;

update public.ai_brain_settings b
set default_model = p.default_model
from public.ai_provider_settings p
where p.provider = b.default_provider and p.default_model is not null;

alter table public.ai_brain_settings
  add constraint ai_brain_settings_model_fkey
  foreign key (default_provider, default_model) references public.ai_provider_models (provider, model_id) on delete restrict;

-- 2) Remove fallback.
drop index if exists public.ai_brain_settings_fallback_idx;
alter table public.ai_brain_settings
  drop column fallback_enabled,
  drop column fallback_provider,
  drop column fallback_model;

-- 3) Remove per-task routing and per-provider defaults.
drop table public.ai_task_models;
drop table public.ai_provider_settings;

create index ai_brain_settings_model_idx on public.ai_brain_settings (default_provider, default_model);

-- RLS on ai_brain_settings / ai_provider_models is unchanged (super admins only).
-- ai_generation_logs keeps its task / duration columns; fallback_used stays for history
-- and is always false from now on.
