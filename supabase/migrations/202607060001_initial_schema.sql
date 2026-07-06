create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  company text,
  role text,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  variables text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.campaign_status as enum ('draft', 'drafts_created', 'sent', 'failed');

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  template_id uuid not null references public.templates(id) on delete restrict,
  selected_contact_ids uuid[] not null,
  status public.campaign_status not null default 'draft',
  unsubscribe_footer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_max_50_contacts check (array_length(selected_contact_ids, 1) <= 50)
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  email text not null,
  status text not null default 'pending',
  gmail_draft_id text,
  gmail_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create table if not exists public.email_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  recipient_email text not null,
  action text not null check (action in ('draft_created', 'sent', 'failed')),
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  google_email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expiry_date timestamptz,
  scope text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

drop trigger if exists templates_updated_at on public.templates;
create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

drop trigger if exists campaigns_updated_at on public.campaigns;
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

drop trigger if exists campaign_recipients_updated_at on public.campaign_recipients;
create trigger campaign_recipients_updated_at before update on public.campaign_recipients
  for each row execute function public.set_updated_at();

drop trigger if exists gmail_connections_updated_at on public.gmail_connections;
create trigger gmail_connections_updated_at before update on public.gmail_connections
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.email_activity enable row level security;
alter table public.gmail_connections enable row level security;

create policy "Profiles are owned by user" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "Contacts are owned by user" on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Templates are owned by user" on public.templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Campaigns are owned by user" on public.campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Campaign recipients are owned by user" on public.campaign_recipients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Email activity is owned by user" on public.email_activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Gmail connections are owned by user" on public.gmail_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists contacts_user_email_idx on public.contacts(user_id, email);
create index if not exists templates_user_created_idx on public.templates(user_id, created_at desc);
create index if not exists campaigns_user_created_idx on public.campaigns(user_id, created_at desc);
create index if not exists campaign_recipients_campaign_idx on public.campaign_recipients(campaign_id);
create index if not exists email_activity_user_created_idx on public.email_activity(user_id, created_at desc);
