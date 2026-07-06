grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.templates to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_recipients to authenticated;
grant select, insert, update, delete on public.email_activity to authenticated;
grant select, insert, update, delete on public.gmail_connections to authenticated;

grant all on public.profiles to service_role;
grant all on public.contacts to service_role;
grant all on public.templates to service_role;
grant all on public.campaigns to service_role;
grant all on public.campaign_recipients to service_role;
grant all on public.email_activity to service_role;
grant all on public.gmail_connections to service_role;

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.email_activity enable row level security;
alter table public.gmail_connections enable row level security;

drop policy if exists "Profiles are owned by user" on public.profiles;
create policy "Profiles are owned by user" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Contacts are owned by user" on public.contacts;
create policy "Contacts are owned by user" on public.contacts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Templates are owned by user" on public.templates;
create policy "Templates are owned by user" on public.templates
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Campaigns are owned by user" on public.campaigns;
create policy "Campaigns are owned by user" on public.campaigns
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Campaign recipients are owned by user" on public.campaign_recipients;
create policy "Campaign recipients are owned by user" on public.campaign_recipients
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Email activity is owned by user" on public.email_activity;
create policy "Email activity is owned by user" on public.email_activity
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Gmail connections are owned by user" on public.gmail_connections;
create policy "Gmail connections are owned by user" on public.gmail_connections
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
