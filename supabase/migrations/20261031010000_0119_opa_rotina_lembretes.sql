-- 0119 · CRM da OPA: rotina de lembretes, avisos de prazo e repasse da roleta.
--
-- Revisão de 31/10/2026 (F1, F3). Até aqui os lembretes e os avisos apareciam
-- nas telas, mas nenhuma rotina os executava.
--
-- 1. lembretes_agendados ganha tentativas, erro e hora do envio, e o status
--    'falhou'. Quem envia reserva as linhas vencidas com fn_opa_reservar_lembretes
--    (FOR UPDATE SKIP LOCKED): dois ciclos da rotina nunca mandam o mesmo lembrete.
-- 2. opa_avisos: o que a rotina já mandou por lead (aviso aos 20 min, repasse,
--    escalada, negócio parado). A chave única é o que impede repetir o aviso a
--    cada minuto: o primeiro INSERT vence, os seguintes não fazem nada.
-- 3. fn_opa_resposta_do_lead: desde quando cada lead espera e quando o corretor
--    respondeu (mensagem, ligação ou "Respondi"), para o "respondidos no prazo"
--    do Início contar por lead, e não por contato.

-- ---------------------------------------------------------------------------
-- 1. lembretes_agendados
-- ---------------------------------------------------------------------------
alter table public.lembretes_agendados add column if not exists tentativas smallint not null default 0;
alter table public.lembretes_agendados add column if not exists erro text;
alter table public.lembretes_agendados add column if not exists enviado_em timestamptz;

alter table public.lembretes_agendados drop constraint if exists lembretes_status_check;
alter table public.lembretes_agendados add constraint lembretes_status_check
  check (status in ('pendente', 'enviado', 'cancelado', 'falhou'));

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

  return query
  update public.lembretes_agendados l
     set status = 'enviado', enviado_em = now(), tentativas = l.tentativas + 1
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
-- 2. opa_avisos
-- ---------------------------------------------------------------------------
create table if not exists public.opa_avisos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  -- Quem recebeu o aviso (corretor ou gestor).
  user_id uuid references auth.users(id) on delete set null,
  -- aviso_<minutos>, repasse, repasse_perdeu, escala, parado
  tipo text not null,
  -- Identifica a espera ou a etapa: o aviso não repete dentro dela e volta
  -- quando uma espera nova começa (cliente escreveu de novo, lead repassado).
  marca text not null,
  status text not null default 'enviado',
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint opa_avisos_status_check check (status in ('enviado', 'falhou', 'sem_numero'))
);

create unique index if not exists opa_avisos_uma_vez_uq
  on public.opa_avisos (lead_id, tipo, marca, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists opa_avisos_lead_idx on public.opa_avisos (lead_id, tipo, created_at desc);
create index if not exists opa_avisos_org_idx on public.opa_avisos (organization_id, created_at desc);

-- Só a rotina (service_role) escreve e lê: sem política para o app.
alter table public.opa_avisos enable row level security;
revoke all on public.opa_avisos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Início e primeira resposta por lead
-- ---------------------------------------------------------------------------
-- Início da espera: a criação do lead, ou a primeira mensagem do cliente se ela
-- chegou até um dia antes (conversa do WhatsApp que virou lead depois).
-- Resposta: a primeira mensagem do corretor, a primeira ligação registrada ou o
-- "Respondi" (custom_fields.respondido_em) depois do início. Roda com as regras
-- de quem chama: cada um só conta os leads que pode ver.
create or replace function public.fn_opa_resposta_do_lead(p_org uuid, p_leads uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select l.id, l.contact_id, l.created_at,
           case when l.custom_fields ->> 'respondido_em' ~ '^\d{4}-\d{2}-\d{2}T'
                then (l.custom_fields ->> 'respondido_em')::timestamptz end as respondido_em
    from public.crm_leads l
    where l.organization_id = p_org and l.id = any(p_leads)
  ),
  ini as (
    select b.*,
           least(b.created_at, coalesce((
             select min(m.sent_at) from public.messages m
             where m.organization_id = p_org and m.contact_id = b.contact_id
               and m.direction = 'inbound' and m.sent_at >= b.created_at - interval '1 day'
           ), b.created_at)) as inicio
    from base b
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
           and a.type = 'ligacao' and a.performed_at > i.inicio
        union all
        select i.respondido_em where i.respondido_em > i.inicio
      ) x
    )
  )), '{}'::jsonb)
  from ini i;
$$;

revoke all on function public.fn_opa_resposta_do_lead(uuid, uuid[]) from public, anon;
grant execute on function public.fn_opa_resposta_do_lead(uuid, uuid[]) to authenticated, service_role;

create index if not exists crm_lead_activities_ligacao_idx
  on public.crm_lead_activities (lead_id, performed_at) where type = 'ligacao';

notify pgrst, 'reload schema';
