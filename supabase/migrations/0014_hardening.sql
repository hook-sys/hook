-- Phase 15: production hardening.

-- 1) Creatives integrity: signed-in users (REST/API) can only create "generating"/"failed"
--    rows and archive creatives. Ready results, asset URLs and Drive state are written only
--    by the server (service role) after the provider/Drive confirmed them — never faked.
create or replace function public.creatives_guard_client_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('generating', 'failed')
       or new.asset_url is not null or new.thumbnail_url is not null or new.completed_at is not null
       or new.drive_file_id is not null or new.drive_upload_status <> 'not_uploaded' then
      raise exception 'Creatives are created as generating/failed; results are recorded by the server'
        using errcode = 'insufficient_privilege';
    end if;
  elsif (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at')
        or (new.status is distinct from old.status and new.status <> 'archived') then
    raise exception 'Only archiving is allowed from the API' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger creatives_guard_client_writes
  before insert or update on public.creatives
  for each row execute function public.creatives_guard_client_writes();

-- 2) Campaigns: Meta IDs, publish state and the publish claim are server-only.
alter table public.campaigns add column publish_started_at timestamptz;

create or replace function public.campaigns_guard_client_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.status in ('published', 'paused')
     or (tg_op = 'INSERT' and (new.meta_campaign_id is not null or new.meta_adset_id is not null
                               or cardinality(new.meta_ad_ids) > 0 or new.published_at is not null or new.publish_started_at is not null))
     or (tg_op = 'UPDATE' and (new.meta_campaign_id is distinct from old.meta_campaign_id
                               or new.meta_adset_id is distinct from old.meta_adset_id
                               or new.meta_ad_ids is distinct from old.meta_ad_ids
                               or new.published_at is distinct from old.published_at
                               or new.publish_started_at is distinct from old.publish_started_at)) then
    raise exception 'Publishing state is recorded by the server only' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger campaigns_guard_client_writes
  before insert or update on public.campaigns
  for each row execute function public.campaigns_guard_client_writes();

-- 3) Public lead form flood protection (applies to direct REST inserts too).
create or replace function public.leads_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- (security definer: counts all leads regardless of the caller's RLS visibility)
  if (select count(*) from public.leads where mobile = new.mobile and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.leads where created_at > now() - interval '5 minutes') >= 30 then
    raise exception 'lead_rate_limited' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.leads_rate_limit() from public, anon, authenticated;

create trigger leads_rate_limit
  before insert on public.leads
  for each row execute function public.leads_rate_limit();

create index if not exists leads_mobile_created_idx on public.leads (mobile, created_at desc);

-- 4) Helper functions are only needed by signed-in policies; anonymous callers can't use them.
revoke execute on function public.is_admin() from anon, public;
revoke execute on function public.is_super_admin() from anon, public;
revoke execute on function public.has_permission(text) from anon, public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

-- 5) Indexes for foreign keys used in joins / cascades.
create index if not exists ai_generation_logs_creative_idx on public.ai_generation_logs (creative_id) where creative_id is not null;
create index if not exists ai_generation_logs_campaign_idx on public.ai_generation_logs (campaign_id) where campaign_id is not null;
create index if not exists ai_generation_logs_product_idx on public.ai_generation_logs (product_id) where product_id is not null;
