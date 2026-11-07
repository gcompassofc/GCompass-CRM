-- 0130 · CRM da OPA: boas-vindas pelo número do corretor e anúncio de WhatsApp
-- (pedidos do Kallyl de 06/11/2026, tarefas #498 e #516 da Central).
--
-- 1. fn_opa_resposta_do_lead: a mensagem de boas-vindas automática
--    (messages.metadata.boas_vindas = true) não conta como primeira resposta do
--    corretor. Mesmo corpo da 0122, com um filtro a mais.
-- 2. Leads que nasceram de conversa no WhatsApp do corretor (atividade
--    lead_do_whatsapp) ganham custom_fields.origem.via = 'whatsapp'. Com isso o
--    lead de anúncio de clique para WhatsApp aparece como "Anúncio de WhatsApp",
--    e não como "Formulário Meta" (que é só o que passa pelo painel).
--    Só acrescenta a chave; nada mais do lead muda.

-- ---------------------------------------------------------------------------
-- 1. Primeira resposta sem a boas-vindas
-- ---------------------------------------------------------------------------
create or replace function public.fn_opa_resposta_do_lead(p_org uuid, p_leads uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select l.id, l.contact_id, l.created_at, l.assigned_at,
           case when l.custom_fields ->> 'respondido_em' ~ '^\d{4}-\d{2}-\d{2}T'
                then (l.custom_fields ->> 'respondido_em')::timestamptz end as respondido_em
    from public.crm_leads l
    where l.organization_id = p_org and l.id = any(p_leads)
  ),
  chegada as (
    select b.*,
           least(b.created_at, coalesce((
             select min(m.sent_at) from public.messages m
             where m.organization_id = p_org and m.contact_id = b.contact_id
               and m.direction = 'inbound' and m.sent_at >= b.created_at - interval '1 day'
           ), b.created_at)) as chegou
    from base b
  ),
  ini as (
    -- A entrega inicial (atribuição no instante da criação) não muda nada; quem
    -- recebeu o lead depois começa a contar quando recebeu.
    select c.*,
           case when c.assigned_at is not null and c.assigned_at > c.created_at + interval '1 minute'
                then greatest(c.chegou, c.assigned_at) else c.chegou end as inicio
    from chegada c
  )
  select coalesce(jsonb_object_agg(i.id, jsonb_build_object(
    'inicio', i.inicio,
    'resposta', (
      select min(t) from (
        select min(m.sent_at) as t from public.messages m
         where m.organization_id = p_org and m.contact_id = i.contact_id
           and m.direction = 'outbound' and m.sent_at > i.inicio
           -- A boas-vindas automática sai do número do corretor, mas não é resposta dele (#498).
           and coalesce(m.metadata ->> 'boas_vindas', '') <> 'true'
        union all
        select min(a.performed_at) from public.crm_lead_activities a
         where a.organization_id = p_org and a.lead_id = i.id
           and a.type in ('ligacao', 'respondido') and a.performed_at > i.inicio
        union all
        select i.respondido_em where i.respondido_em > i.inicio
      ) x
    )
  )), '{}'::jsonb)
  from ini i;
$$;

revoke all on function public.fn_opa_resposta_do_lead(uuid, uuid[]) from public, anon;
grant execute on function public.fn_opa_resposta_do_lead(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Origem dos leads que vieram do WhatsApp do corretor
-- ---------------------------------------------------------------------------
update public.crm_leads l
   set custom_fields = coalesce(l.custom_fields, '{}'::jsonb)
         || jsonb_build_object('origem', coalesce(l.custom_fields -> 'origem', jsonb_build_object('canal', l.source)) || '{"via": "whatsapp"}'::jsonb)
 where exists (
         select 1 from public.crm_lead_activities a
          where a.lead_id = l.id and a.organization_id = l.organization_id and a.type = 'lead_do_whatsapp'
       )
   and coalesce(l.custom_fields #>> '{origem,via}', '') = '';

notify pgrst, 'reload schema';
