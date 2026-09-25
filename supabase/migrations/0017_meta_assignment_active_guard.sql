-- New client assignments may only reference ACTIVE central-pool assets (defense in depth for
-- the server-side validation). Existing assignments are unaffected if an asset later
-- becomes inactive.

create or replace function public.meta_assignment_requires_active()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active boolean;
begin
  if tg_table_name = 'client_meta_business_managers' then
    select is_active into active from public.meta_business_managers where business_id = new.business_id;
  elsif tg_table_name = 'client_meta_ad_accounts' then
    select is_active into active from public.meta_ad_accounts where business_id = new.business_id and ad_account_id = new.ad_account_id;
  elsif tg_table_name = 'client_meta_pages' then
    select is_active into active from public.meta_pages where business_id = new.business_id and page_id = new.page_id;
  elsif tg_table_name = 'client_meta_instagram_accounts' then
    select is_active into active from public.meta_instagram_accounts
      where business_id = new.business_id and instagram_account_id = new.instagram_account_id;
  end if;
  if active is distinct from true then
    raise exception 'Only active Meta assets from the central pool can be assigned' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger client_meta_bm_requires_active before insert on public.client_meta_business_managers
  for each row execute function public.meta_assignment_requires_active();
create trigger client_meta_ad_accounts_requires_active before insert on public.client_meta_ad_accounts
  for each row execute function public.meta_assignment_requires_active();
create trigger client_meta_pages_requires_active before insert on public.client_meta_pages
  for each row execute function public.meta_assignment_requires_active();
create trigger client_meta_ig_requires_active before insert on public.client_meta_instagram_accounts
  for each row execute function public.meta_assignment_requires_active();
