-- Integrations: non-secret connection state + Vault-backed credential storage

create table public.integrations (
  provider text primary key
    check (provider in ('google_drive', 'meta', 'claude', 'fal', 'inworld', 'tiktok', 'youtube')),
  status text not null default 'not_connected'
    check (status in ('not_connected', 'configured', 'connected', 'error')),
  -- Non-secret metadata only (masked key hint, account email, business id, last test result...).
  config jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.admin_users (id) on delete set null
);

create trigger integrations_set_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

alter table public.integrations enable row level security;

-- Super admins can read connection state. There are deliberately no insert/update/delete
-- policies: all writes happen server-side with the service role after an app-level
-- super-admin check. Sub-admins and anon get nothing.
create policy "super admins can view integrations"
  on public.integrations for select
  to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Credentials (API keys, OAuth token sets) live encrypted in Supabase Vault under
-- the name 'integration:<provider>'. Only the service role can call these.
-- ---------------------------------------------------------------------------

create or replace function public.integration_secret_set(p_provider text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text := 'integration:' || p_provider;
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret, v_name, 'Hook Marketing integration credential');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

create or replace function public.integration_secret_get(p_provider text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'integration:' || p_provider;
$$;

create or replace function public.integration_secret_delete(p_provider text)
returns void
language sql
security definer
set search_path = public, vault
as $$
  delete from vault.secrets where name = 'integration:' || p_provider;
$$;

revoke all on function public.integration_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.integration_secret_get(text) from public, anon, authenticated;
revoke all on function public.integration_secret_delete(text) from public, anon, authenticated;

grant execute on function public.integration_secret_set(text, text) to service_role;
grant execute on function public.integration_secret_get(text) to service_role;
grant execute on function public.integration_secret_delete(text) to service_role;
