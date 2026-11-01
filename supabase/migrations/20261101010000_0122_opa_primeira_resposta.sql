-- 0122 · CRM da OPA: primeira resposta, envio confirmado do lembrete e etiquetas
-- sem perda (pendências de 01/11/2026: C2, C3, C8).
--
-- 1. lembretes_agendados ganha o status 'enviando'. fn_opa_reservar_lembretes
--    reserva as linhas como 'enviando' (antes já marcava 'enviado' antes de o
--    WhatsApp aceitar). A rotina grava 'enviado' só depois do envio. Linha que
--    ficou 'enviando' por mais de 10 minutos (o processo caiu no meio) vira
--    'falhou' com aviso para conferir: não é reenviada sozinha, porque não dá para
--    saber se saiu.
-- 2. fn_opa_resposta_do_lead: o início da espera passa a ser o maior entre a
--    chegada do lead e a atribuição ao corretor atual (quando ele recebeu o lead
--    depois, por repasse ou troca do gerente). A resposta conta o "Respondi"
--    gravado como atividade (type 'respondido', que nunca se sobrescreve), além de
--    mensagem e ligação; o custom_fields.respondido_em fica como reserva para os
--    leads de antes desta versão.
-- 3. fn_opa_anexar_etiquetas: acrescenta etiquetas num único UPDATE, sem ler e
--    regravar a lista (uma etiqueta gravada no meio não se perde).

-- ---------------------------------------------------------------------------
-- 1. lembretes_agendados: 'enviando'
-- ---------------------------------------------------------------------------
alter table public.lembretes_agendados drop constraint if exists lembretes_status_check;
alter table public.lembretes_agendados add constraint lembretes_status_check
  check (status in ('pendente', 'enviando', 'enviado', 'cancelado', 'falhou'));

create or replace function public.fn_opa_reservar_lembretes(p_limite int default 50)
returns setof public.lembretes_agendados
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Passou de dois dias parado (rotina fora do ar): não manda lembrete velho.
  update public.lembretes_agendados
     set status = 'falhou', erro = 'Passou de 2 dias sem envio.'
   where status = 'pendente' and quando < now() - interval '2 days';

  -- Reservado e nunca confirmado: o processo caiu entre a reserva e o envio.
  -- Pode ter saído ou não; reenviar arriscaria mensagem em dobro.
  update public.lembretes_agendados
     set status = 'falhou', erro = 'O envio não foi confirmado. Confira com a pessoa antes de agendar de novo.'
   where status = 'enviando' and enviado_em < now() - interval '10 minutes';

  return query
  update public.lembretes_agendados l
     set status = 'enviando', enviado_em = now(), tentativas = l.tentativas + 1
   where l.id in (
     select id from public.lembretes_agendados
      where status = 'pendente' and quando <= now()
      order by quando
      limit greatest(1, least(coalesce(p_limite, 50), 200))
      for update skip locked
   )
  returning l.*;
end;
$$;

revoke all on function public.fn_opa_reservar_lembretes(int) from public, anon, authenticated;
grant execute on function public.fn_opa_reservar_lembretes(int) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Início e primeira resposta por lead
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

create index if not exists crm_lead_activities_respondido_idx
  on public.crm_lead_activities (lead_id, performed_at) where type = 'respondido';

-- ---------------------------------------------------------------------------
-- 3. Etiquetas acrescentadas sem perda
-- ---------------------------------------------------------------------------
create or replace function public.fn_opa_anexar_etiquetas(p_lead uuid, p_tags text[], p_org uuid default null)
returns text[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tags text[];
begin
  update public.crm_leads l
     set tags = (
           select coalesce(array_agg(distinct t order by t), '{}'::text[])
             from unnest(coalesce(l.tags, '{}'::text[]) || coalesce(p_tags, '{}'::text[])) t
            where t is not null and t <> ''
         )
   where l.id = p_lead
     and (p_org is null or l.organization_id = p_org)
  returning l.tags into v_tags;
  return v_tags;
end;
$$;

revoke all on function public.fn_opa_anexar_etiquetas(uuid, text[], uuid) from public, anon;
grant execute on function public.fn_opa_anexar_etiquetas(uuid, text[], uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
