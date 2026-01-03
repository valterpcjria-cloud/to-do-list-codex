-- Nexus CRM Pro - PRODUÇÃO (RLS)
-- Execute APÓS rodar `modern-todo/supabase/schema.sql`.
-- Objetivo: exigir login (role authenticated) e isolar dados por workspace == auth.uid().

create or replace function public.crm_workspace_is_owner(workspace text)
returns boolean
language sql
stable
as $$
  select workspace = auth.uid()::text
$$;

do $$
declare
  tables text[] := array[
    'public.crm_kv',
    'public.crm_leads',
    'public.crm_deals',
    'public.crm_companies',
    'public.crm_contacts',
    'public.crm_tasks',
    'public.crm_automations',
    'public.crm_ai_messages'
  ];
  t text;
begin
  foreach t in array tables loop
    if to_regclass(t) is null then
      continue;
    end if;

    execute format('alter table %s enable row level security', t);

    execute format('drop policy if exists crm_workspace_select on %s', t);
    execute format(
      'create policy crm_workspace_select on %s for select to authenticated using (public.crm_workspace_is_owner(workspace))',
      t
    );

    execute format('drop policy if exists crm_workspace_insert on %s', t);
    execute format(
      'create policy crm_workspace_insert on %s for insert to authenticated with check (public.crm_workspace_is_owner(workspace))',
      t
    );

    execute format('drop policy if exists crm_workspace_update on %s', t);
    execute format(
      'create policy crm_workspace_update on %s for update to authenticated using (public.crm_workspace_is_owner(workspace)) with check (public.crm_workspace_is_owner(workspace))',
      t
    );

    execute format('drop policy if exists crm_workspace_delete on %s', t);
    execute format(
      'create policy crm_workspace_delete on %s for delete to authenticated using (public.crm_workspace_is_owner(workspace))',
      t
    );

    execute format('revoke all on table %s from anon', t);
    execute format('grant select, insert, update, delete on table %s to authenticated', t);
  end loop;
end $$;

