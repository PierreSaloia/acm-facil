-- SignEng online schema
-- Login remains disabled. Anonymous rows are scoped by installation_id until auth is enabled.

create extension if not exists pgcrypto;

create table if not exists public.plugin_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  download_url text,
  changelog text,
  is_latest boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists plugin_versions_latest_idx
  on public.plugin_versions (is_latest)
  where is_latest = true;

create table if not exists public.public_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null,
  name text,
  document text,
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb,
  logo_data text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id)
);

create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null,
  kind text not null,
  name text,
  folder text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists presets_lookup_idx
  on public.presets (installation_id, kind, updated_at desc);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  email text unique,
  name text,
  role text not null default 'user',
  status text not null default 'active',
  modules jsonb not null default '[]'::jsonb,
  plan text,
  plan_period text,
  plan_ends_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null default 'trial',
  status text not null default 'active',
  paid boolean not null default false,
  expires_at timestamptz,
  max_machines integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  machine_hash text not null unique,
  machine_name text,
  os text,
  plugin_version text,
  status text not null default 'active',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.plugin_versions enable row level security;
alter table public.public_settings enable row level security;
alter table public.companies enable row level security;
alter table public.presets enable row level security;
alter table public.users enable row level security;
alter table public.licenses enable row level security;
alter table public.machines enable row level security;

-- Public read-only data required by the no-login client.
create policy "public can read latest plugin version"
  on public.plugin_versions for select to anon, authenticated
  using (is_latest = true);

create policy "public can read public settings"
  on public.public_settings for select to anon, authenticated
  using (true);

-- Temporary anonymous storage. Replace these policies when Supabase Auth is enabled.
create policy "anonymous can read own company"
  on public.companies for select to anon, authenticated
  using (installation_id = current_setting('request.headers', true)::json->>'x-signeng-installation');

create policy "anonymous can insert own company"
  on public.companies for insert to anon, authenticated
  with check (installation_id = current_setting('request.headers', true)::json->>'x-signeng-installation');

create policy "anonymous can update own company"
  on public.companies for update to anon, authenticated
  using (installation_id = current_setting('request.headers', true)::json->>'x-signeng-installation')
  with check (installation_id = current_setting('request.headers', true)::json->>'x-signeng-installation');

create policy "anonymous can manage own presets"
  on public.presets for all to anon, authenticated
  using (installation_id = current_setting('request.headers', true)::json->>'x-signeng-installation')
  with check (installation_id = current_setting('request.headers', true)::json->>'x-signeng-installation');

-- User/license/machine tables are server-managed and not exposed to anon clients.
comment on table public.users is 'Server-managed identity data; login is currently disabled.';
comment on table public.licenses is 'Server-managed licensing data.';
comment on table public.machines is 'Server-managed machine activations.';

insert into public.public_settings (key, value)
values ('site', jsonb_build_object('url', 'https://signeng.online', 'login_required', false))
on conflict (key) do update
set value = excluded.value, updated_at = now();

insert into public.plugin_versions (version, download_url, changelog, is_latest)
values ('1.9.32', 'https://signeng.online/downloads/SignEng.rbz', 'Migração para SignEng e modo online sem login.', true)
on conflict do nothing;
