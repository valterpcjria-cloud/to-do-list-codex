-- Nexus CRM Pro - RESET (limpa o banco)
-- Execute no Supabase SQL Editor.
-- ATENÇÃO: apaga dados de TODOS os workspaces.

do $$
declare
  tables text[] := array[
    'public.crm_ai_messages',
    'public.crm_automations',
    'public.crm_tasks',
    'public.crm_contacts',
    'public.crm_companies',
    'public.crm_deals',
    'public.crm_leads',
    'public.crm_kv'
  ];
  t text;
begin
  foreach t in array tables loop
    if to_regclass(t) is not null then
      execute format('truncate table %s restart identity cascade', t);
    end if;
  end loop;
end $$;

