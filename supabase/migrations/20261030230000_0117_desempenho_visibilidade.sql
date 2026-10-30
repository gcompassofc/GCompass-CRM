-- 0117: desempenho com a base grande (teste de carga de 30/10/2026: 1.500 leads
-- abertos e 30 mil mensagens).
--
-- 1. As regras de leitura de leads, conversas e contatos chamavam uma função por
--    LINHA (fn_can_view_lead e afins), e cada chamada consultava o papel e a
--    configuração da org de novo: 370 ms só para filtrar 1.500 leads. Agora o
--    escopo de quem vê o quê é calculado UMA vez por consulta (fn_escopo_visao,
--    sem argumento, numa subconsulta que o Postgres resolve uma vez) e a linha só
--    compara colunas. O resultado é o mesmo de antes, conferido por pessoa.
-- 2. Índice de mensagens por contato (a conta de primeira resposta varria a tabela).
-- 3. fn_opa_primeira_resposta: a conta sai pronta do banco, num objeto só, sem a
--    lista de contatos no endereço (que estourava o limite com algumas centenas)
--    e sem o corte de 5.000 mensagens.

-- ---------------------------------------------------------------------------
-- 1. Escopo de visão do usuário logado, por org
-- ---------------------------------------------------------------------------
-- ve_tudo: leitor, gerente ou admin; ou org com visibility_mode = 'all'.
-- ve_sem_dono: org em 'own_and_unassigned' (o padrão quando não configurado).
-- O que é do próprio usuário (dono ou atribuído) ele vê em toda org de que é membro.
create or replace function public.fn_escopo_visao()
returns table(org uuid, ve_tudo boolean, ve_sem_dono boolean)
language sql
stable
security definer
set search_path = public
as $$
  select uo.organization_id,
         uo.role in ('viewer', 'manager', 'admin')
           or coalesce(o.settings->>'visibility_mode', 'own_and_unassigned') = 'all',
         coalesce(o.settings->>'visibility_mode', 'own_and_unassigned') = 'own_and_unassigned'
  from public.user_organizations uo
  join public.organizations o on o.id = uo.organization_id
  where uo.user_id = auth.uid()
    and uo.revoked_at is null;
$$;

revoke all on function public.fn_escopo_visao() from public, anon;
grant execute on function public.fn_escopo_visao() to authenticated, service_role;

-- Leads: mesma regra de fn_can_view_lead, calculada uma vez.
drop policy if exists crm_leads_select on public.crm_leads;
create policy crm_leads_select on public.crm_leads for select to authenticated
using (
  (select public.fn_is_platform_admin())
  or organization_id in (select e.org from public.fn_escopo_visao() e where e.ve_tudo)
  or (owner_user_id = (select auth.uid()) and organization_id in (select e.org from public.fn_escopo_visao() e))
  or (owner_user_id is null and organization_id in (select e.org from public.fn_escopo_visao() e where e.ve_sem_dono))
);

-- Conversas: mesma regra de fn_can_view_conversation.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
using (
  (select public.fn_is_platform_admin())
  or organization_id in (select e.org from public.fn_escopo_visao() e where e.ve_tudo)
  or (assigned_to_user_id = (select auth.uid()) and organization_id in (select e.org from public.fn_escopo_visao() e))
  or (assigned_to_user_id is null and organization_id in (select e.org from public.fn_escopo_visao() e where e.ve_sem_dono))
);

-- Contatos: mesma regra de fn_can_view_contact. Os EXISTS passam pelas regras
-- (já rápidas) de leads e conversas, que são exatamente o "lead ou conversa
-- visível" da função antiga.
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
using (
  (select public.fn_is_platform_admin())
  or organization_id in (select e.org from public.fn_escopo_visao() e where e.ve_tudo)
  or (
    organization_id in (select e.org from public.fn_escopo_visao() e)
    and (
      created_by_user_id = (select auth.uid())
      or exists (select 1 from public.crm_leads l
                  where l.organization_id = contacts.organization_id and l.contact_id = contacts.id)
      or exists (select 1 from public.conversations c
                  where c.organization_id = contacts.organization_id and c.contact_id = contacts.id)
    )
  )
);

-- Atividades e vínculos do lead: visíveis quando o lead é visível (a regra de
-- leads se aplica dentro do EXISTS).
drop policy if exists crm_lead_activities_select on public.crm_lead_activities;
create policy crm_lead_activities_select on public.crm_lead_activities for select to authenticated
using (exists (select 1 from public.crm_leads l where l.id = crm_lead_activities.lead_id));

drop policy if exists crm_lead_links_select on public.crm_lead_links;
create policy crm_lead_links_select on public.crm_lead_links for select to authenticated
using (exists (select 1 from public.crm_leads l where l.id = crm_lead_links.lead_id));

-- ---------------------------------------------------------------------------
-- 2. Índice de mensagens por contato
-- ---------------------------------------------------------------------------
create index if not exists idx_messages_org_contact_sent
  on public.messages (organization_id, contact_id, sent_at);

-- ---------------------------------------------------------------------------
-- 3. Primeira resposta por contato, pronta no banco
-- ---------------------------------------------------------------------------
-- Minutos entre a primeira mensagem do cliente e a primeira do corretor depois
-- dela, por contato. Roda com as regras de quem chama (security invoker): cada
-- um só conta o que pode ver. Devolve um objeto {contato: minutos|null}.
create or replace function public.fn_opa_primeira_resposta(p_org uuid, p_contatos uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with entrada as (
    select m.contact_id, min(m.sent_at) as em
    from public.messages m
    where m.organization_id = p_org
      and m.contact_id = any(p_contatos)
      and m.direction = 'inbound'
    group by m.contact_id
  )
  select coalesce(jsonb_object_agg(e.contact_id, (
    select round(extract(epoch from (min(r.sent_at) - e.em)) / 60)::int
    from public.messages r
    where r.organization_id = p_org
      and r.contact_id = e.contact_id
      and r.direction = 'outbound'
      and r.sent_at > e.em
  )), '{}'::jsonb)
  from entrada e;
$$;

revoke all on function public.fn_opa_primeira_resposta(uuid, uuid[]) from public, anon;
grant execute on function public.fn_opa_primeira_resposta(uuid, uuid[]) to authenticated, service_role;
