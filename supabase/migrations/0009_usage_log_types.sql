-- Phases 10/12/14: new AI generation types in the usage log.
alter table public.ai_generation_logs drop constraint ai_generation_logs_generation_type_check;
alter table public.ai_generation_logs add constraint ai_generation_logs_generation_type_check
  check (generation_type in ('creative_brief', 'campaign_strategy', 'image', 'video',
                             'content_calendar', 'calendar_item', 'marketing_report', 'agent'));
create index ai_generation_logs_client_provider_idx on public.ai_generation_logs (client_id, provider, created_at desc);
