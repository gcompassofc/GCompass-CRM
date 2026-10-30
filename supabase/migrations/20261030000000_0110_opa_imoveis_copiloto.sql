-- 0110 · CRM da OPA: imóveis e copiloto de IA.
--
-- imoveis: o acervo da imobiliária dentro do CRM, para o lead nascer ligado ao
-- imóvel de entrada e para o cruzamento lead x imóvel. Na OPA a fonte é o Painel
-- (D1 opa-imoveis); aqui fica a cópia que o CRM lê. Chave natural: (org, codigo).
--
-- copiloto_sugestoes: o que a IA leu na conversa do WhatsApp e propõe gravar no
-- lead (finalidade, região, momento...). Nada entra no lead sem o corretor
-- confirmar: a sugestão nasce 'pendente' e vira 'aceita' ou 'recusada'.
-- `evidencia` guarda o trecho da conversa que sustenta a sugestão, para o
-- corretor decidir sem reler a conversa inteira.

create table if not exists public.imoveis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  codigo text not null,
  slug text,
  titulo text not null,
  tipo text,
  finalidade text,
  preco_venda_cents bigint,
  preco_locacao_cents bigint,
  condominio_cents bigint,
  iptu_cents bigint,
  bairro text,
  regiao text,
  area_m2 numeric,
  area_terreno_m2 numeric,
  dormitorios integer,
  suites integer,
  vagas integer,
  descricao text,
  caracteristicas text[] not null default '{}',
  fotos text[] not null default '{}',
  url_site text,
  off_market boolean not null default false,
  status text not null default 'ativo',
  captador_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imoveis_status_check check (status in ('ativo', 'reservado', 'vendido', 'inativo'))
);

create unique index if not exists imoveis_org_codigo_uq on public.imoveis (organization_id, codigo);
create index if not exists imoveis_org_bairro_idx on public.imoveis (organization_id, bairro);

alter table public.imoveis enable row level security;

drop policy if exists imoveis_select_member on public.imoveis;
create policy imoveis_select_member on public.imoveis for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists imoveis_write_member on public.imoveis;
create policy imoveis_write_member on public.imoveis for all to authenticated
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

create table if not exists public.copiloto_sugestoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  campo text not null,
  valor text not null,
  evidencia text,
  confianca numeric,
  origem text not null default 'ia',
  status text not null default 'pendente',
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  constraint copiloto_status_check check (status in ('pendente', 'aceita', 'recusada'))
);

-- Uma sugestão pendente por campo e lead: a análise nova substitui a anterior.
create unique index if not exists copiloto_pendente_uq
  on public.copiloto_sugestoes (lead_id, campo) where status = 'pendente';
create index if not exists copiloto_org_status_idx on public.copiloto_sugestoes (organization_id, status);

alter table public.copiloto_sugestoes enable row level security;

-- Vê a sugestão quem vê o lead: o EXISTS roda sob o RLS de crm_leads
-- (fn_can_view_lead), então o corretor só enxerga as sugestões dos leads dele.
drop policy if exists copiloto_member on public.copiloto_sugestoes;
create policy copiloto_member on public.copiloto_sugestoes for all to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and exists (select 1 from public.crm_leads l where l.id = copiloto_sugestoes.lead_id)
  )
  with check (
    organization_id in (select public.fn_user_org_ids())
    and exists (select 1 from public.crm_leads l where l.id = copiloto_sugestoes.lead_id)
  );

-- Trava por etapa: campos do lead (custom_fields -> 'opa') que precisam estar
-- confirmados para o negócio ENTRAR na etapa. Fica no banco para valer em
-- qualquer porta (quadro arrastado, ficha, API, MCP). Lista explícita por etapa,
-- sem herança: "Sem momento" e "Perdido" ficam sem trava de propósito.
alter table public.crm_stages add column if not exists campos_obrigatorios text[] not null default '{}';

create or replace function public.fn_trava_campos_da_etapa()
returns trigger
language plpgsql
as $$
declare
  exigidos text[];
  faltando text[];
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select campos_obrigatorios into exigidos from public.crm_stages where id = new.stage_id;
  if exigidos is null or cardinality(exigidos) = 0 then
    return new;
  end if;
  select coalesce(array_agg(c), '{}') into faltando
    from unnest(exigidos) as c
   where coalesce(nullif(trim(new.custom_fields -> 'opa' ->> c), ''), null) is null;
  if cardinality(faltando) > 0 then
    raise exception 'Para avançar, confirme antes: %.', array_to_string(faltando, ', ')
      using errcode = 'P0001', hint = 'trava_campos_etapa';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trava_campos_da_etapa on public.crm_leads;
create trigger trg_trava_campos_da_etapa
  before update of stage_id on public.crm_leads
  for each row execute function public.fn_trava_campos_da_etapa();
