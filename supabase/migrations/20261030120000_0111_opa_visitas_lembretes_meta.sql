-- 0111 · CRM da OPA: visitas, mensagens agendadas e eventos do Meta.
--
-- visitas: ficha de visita do protótipo (interesse 1 a 5, gostou, não gostou,
-- objeção, próximo passo). Agendada ou feita.
--
-- lembretes_agendados: "Agendar mensagem" da ficha e os avisos do OPA
-- Lembretes. Sai pelo número OPA Lembretes quando o envio for ligado; até lá
-- fica na fila com status.
--
-- eventos_meta: o que vai para a API de Conversões. Nasce por gatilho quando o
-- negócio entra numa etapa com evento (crm_stages.evento_meta), uma vez por
-- negócio e evento (mover o mesmo card duas vezes não manda duas vezes).
-- "Venda realizada" leva o valor da comissão, nunca o VGV.

create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  imovel_codigo text,
  status text not null default 'feita',
  quando timestamptz not null,
  quem text,
  chegada text,
  interesse smallint,
  gostou text,
  nao_gostou text,
  objecao text,
  proximo_passo text,
  observacoes text,
  registrada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint visitas_status_check check (status in ('agendada', 'feita', 'cancelada')),
  constraint visitas_interesse_check check (interesse is null or interesse between 1 and 5)
);
create index if not exists visitas_lead_idx on public.visitas (lead_id, quando desc);

alter table public.visitas enable row level security;
drop policy if exists visitas_member on public.visitas;
create policy visitas_member on public.visitas for all to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and exists (select 1 from public.crm_leads l where l.id = visitas.lead_id)
  )
  with check (
    organization_id in (select public.fn_user_org_ids())
    and exists (select 1 from public.crm_leads l where l.id = visitas.lead_id)
  );

create table if not exists public.lembretes_agendados (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete cascade,
  para_user_id uuid references auth.users(id) on delete set null,
  quando timestamptz not null,
  mensagem text not null,
  origem text not null default 'manual',
  status text not null default 'pendente',
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lembretes_status_check check (status in ('pendente', 'enviado', 'cancelado'))
);
create index if not exists lembretes_org_quando_idx on public.lembretes_agendados (organization_id, status, quando);

alter table public.lembretes_agendados enable row level security;
drop policy if exists lembretes_member on public.lembretes_agendados;
create policy lembretes_member on public.lembretes_agendados for all to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and (lead_id is null or exists (select 1 from public.crm_leads l where l.id = lembretes_agendados.lead_id))
  )
  with check (
    organization_id in (select public.fn_user_org_ids())
    and (lead_id is null or exists (select 1 from public.crm_leads l where l.id = lembretes_agendados.lead_id))
  );

alter table public.crm_stages add column if not exists evento_meta text;

create table if not exists public.eventos_meta (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  evento text not null,
  valor_cents bigint,
  status text not null default 'na_fila',
  resposta text,
  created_at timestamptz not null default now(),
  enviado_em timestamptz,
  constraint eventos_meta_status_check check (status in ('na_fila', 'enviado', 'aceito', 'recusado'))
);
create unique index if not exists eventos_meta_uma_vez_uq on public.eventos_meta (lead_id, evento);
create index if not exists eventos_meta_org_idx on public.eventos_meta (organization_id, created_at desc);

alter table public.eventos_meta enable row level security;
drop policy if exists eventos_meta_member on public.eventos_meta;
create policy eventos_meta_member on public.eventos_meta for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and exists (select 1 from public.crm_leads l where l.id = eventos_meta.lead_id)
  );

create or replace function public.fn_evento_meta_da_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev text;
  valor bigint;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select evento_meta into ev from public.crm_stages where id = new.stage_id;
  if ev is null or ev = '' then
    return new;
  end if;
  valor := case
    when ev = 'Venda realizada' then nullif(new.custom_fields -> 'venda' ->> 'comissao_cents', '')::bigint
    else null
  end;
  insert into public.eventos_meta (organization_id, lead_id, evento, valor_cents)
  values (new.organization_id, new.id, ev, valor)
  on conflict (lead_id, evento) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_evento_meta_da_etapa on public.crm_leads;
create trigger trg_evento_meta_da_etapa
  after insert or update of stage_id on public.crm_leads
  for each row execute function public.fn_evento_meta_da_etapa();
