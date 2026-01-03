-- Nexus CRM (MVP) - Storage via Supabase (KV)
-- Execute no Supabase SQL Editor.

create table if not exists public.crm_kv (
  workspace text not null default 'default',
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (workspace, key)
);

-- Para desenvolvimento rápido (sem autenticação):
alter table public.crm_kv disable row level security;
grant select, insert, update, delete on table public.crm_kv to anon, authenticated;

-- ============================================================
-- CRM Pro (tabelas normalizadas - opcional)
-- Obs: o app hoje sincroniza via `crm_kv`.
-- ============================================================

create extension if not exists pgcrypto;

create or replace function public.crm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crm_kv_touch_updated_at on public.crm_kv;
create trigger crm_kv_touch_updated_at
before update on public.crm_kv
for each row
execute function public.crm_touch_updated_at();

create table if not exists public.crm_leads (
  id uuid not null default gen_random_uuid(),
  workspace text not null default 'default',
  name text not null,
  company text,
  email text,
  phone text,
  origin text,
  score integer not null default 0,
  stage_id text not null default 'new',
  value numeric not null default 0,
  last_touch text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint crm_leads_score_range check (score >= 0 and score <= 100)
);

create index if not exists crm_leads_workspace_idx on public.crm_leads (workspace);
create index if not exists crm_leads_workspace_stage_idx on public.crm_leads (workspace, stage_id);
create index if not exists crm_leads_workspace_email_idx on public.crm_leads (workspace, email);
create index if not exists crm_leads_workspace_phone_idx on public.crm_leads (workspace, phone);

drop trigger if exists crm_leads_touch_updated_at on public.crm_leads;
create trigger crm_leads_touch_updated_at
before update on public.crm_leads
for each row
execute function public.crm_touch_updated_at();

create table if not exists public.crm_deals (
  id uuid not null default gen_random_uuid(),
  workspace text not null default 'default',
  title text not null,
  company text,
  stage_id text not null default 'discovery',
  amount numeric not null default 0,
  probability integer not null default 0,
  close_date text,
  initials text,
  lead_id uuid references public.crm_leads (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint crm_deals_probability_range check (probability >= 0 and probability <= 100)
);

create index if not exists crm_deals_workspace_idx on public.crm_deals (workspace);
create index if not exists crm_deals_workspace_stage_idx on public.crm_deals (workspace, stage_id);
create index if not exists crm_deals_workspace_lead_idx on public.crm_deals (workspace, lead_id);

drop trigger if exists crm_deals_touch_updated_at on public.crm_deals;
create trigger crm_deals_touch_updated_at
before update on public.crm_deals
for each row
execute function public.crm_touch_updated_at();

create table if not exists public.crm_companies (
  id uuid not null default gen_random_uuid(),
  workspace text not null default 'default',
  name text not null,
  status text not null default 'active',
  industry text,
  employee_range text,
  city text,
  state text,
  revenue_yearly numeric,
  website text,
  phone text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id)
);

create index if not exists crm_companies_workspace_idx on public.crm_companies (workspace);
create index if not exists crm_companies_workspace_status_idx on public.crm_companies (workspace, status);

drop trigger if exists crm_companies_touch_updated_at on public.crm_companies;
create trigger crm_companies_touch_updated_at
before update on public.crm_companies
for each row
execute function public.crm_touch_updated_at();

create table if not exists public.crm_contacts (
  id uuid not null default gen_random_uuid(),
  workspace text not null default 'default',
  name text not null,
  title text,
  company_id uuid references public.crm_companies (id) on delete set null,
  company_name text,
  email text,
  phone text,
  channels text[] not null default '{}'::text[],
  favorite boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id)
);

create index if not exists crm_contacts_workspace_idx on public.crm_contacts (workspace);
create index if not exists crm_contacts_workspace_company_idx on public.crm_contacts (workspace, company_id);
create index if not exists crm_contacts_workspace_email_idx on public.crm_contacts (workspace, email);

drop trigger if exists crm_contacts_touch_updated_at on public.crm_contacts;
create trigger crm_contacts_touch_updated_at
before update on public.crm_contacts
for each row
execute function public.crm_touch_updated_at();

create table if not exists public.crm_tasks (
  id uuid not null default gen_random_uuid(),
  workspace text not null default 'default',
  title text not null,
  note text,
  type text,
  due_at timestamptz,
  due_label text,
  overdue boolean not null default false,
  priority text not null default 'medium',
  related text,
  done boolean not null default false,
  lead_id uuid references public.crm_leads (id) on delete set null,
  deal_id uuid references public.crm_deals (id) on delete set null,
  contact_id uuid references public.crm_contacts (id) on delete set null,
  company_id uuid references public.crm_companies (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id)
);

create index if not exists crm_tasks_workspace_idx on public.crm_tasks (workspace);
create index if not exists crm_tasks_workspace_done_idx on public.crm_tasks (workspace, done);
create index if not exists crm_tasks_workspace_overdue_idx on public.crm_tasks (workspace, overdue);
create index if not exists crm_tasks_workspace_priority_idx on public.crm_tasks (workspace, priority);
create index if not exists crm_tasks_workspace_lead_idx on public.crm_tasks (workspace, lead_id);

drop trigger if exists crm_tasks_touch_updated_at on public.crm_tasks;
create trigger crm_tasks_touch_updated_at
before update on public.crm_tasks
for each row
execute function public.crm_touch_updated_at();

create table if not exists public.crm_automations (
  id uuid not null default gen_random_uuid(),
  workspace text not null default 'default',
  name text not null,
  active boolean not null default true,
  trigger text not null default 'new_lead',
  steps jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id)
);

create index if not exists crm_automations_workspace_idx on public.crm_automations (workspace);
create index if not exists crm_automations_workspace_active_idx on public.crm_automations (workspace, active);
create index if not exists crm_automations_workspace_trigger_idx on public.crm_automations (workspace, trigger);

drop trigger if exists crm_automations_touch_updated_at on public.crm_automations;
create trigger crm_automations_touch_updated_at
before update on public.crm_automations
for each row
execute function public.crm_touch_updated_at();

create table if not exists public.crm_ai_messages (
  id uuid not null default gen_random_uuid(),
  workspace text not null default 'default',
  channel text not null default 'whatsapp',
  role text not null default 'user',
  author text,
  peer text,
  source text,
  text text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (id)
);

create index if not exists crm_ai_messages_workspace_idx on public.crm_ai_messages (workspace);
create index if not exists crm_ai_messages_workspace_channel_idx on public.crm_ai_messages (workspace, channel);
create index if not exists crm_ai_messages_workspace_created_idx on public.crm_ai_messages (workspace, created_at desc);

-- DEV MODE (sem autenticacao): desabilita RLS e libera acesso para anon/authenticated.
-- Em producao, habilite RLS e crie politicas por usuario/workspace.
alter table public.crm_leads disable row level security;
alter table public.crm_deals disable row level security;
alter table public.crm_companies disable row level security;
alter table public.crm_contacts disable row level security;
alter table public.crm_tasks disable row level security;
alter table public.crm_automations disable row level security;
alter table public.crm_ai_messages disable row level security;

grant select, insert, update, delete on table public.crm_leads to anon, authenticated;
grant select, insert, update, delete on table public.crm_deals to anon, authenticated;
grant select, insert, update, delete on table public.crm_companies to anon, authenticated;
grant select, insert, update, delete on table public.crm_contacts to anon, authenticated;
grant select, insert, update, delete on table public.crm_tasks to anon, authenticated;
grant select, insert, update, delete on table public.crm_automations to anon, authenticated;
grant select, insert, update, delete on table public.crm_ai_messages to anon, authenticated;
