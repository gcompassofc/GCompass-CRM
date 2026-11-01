-- 0123 · CRM da OPA: contatos pessoais do WhatsApp do corretor (pedido do Allyson, 01/11/2026).
--
-- O corretor liga o próprio WhatsApp. Tudo o que já existia no aparelho é pessoal:
-- o CRM não guarda a conversa e a IA não lê. Só vira lead (e só então é guardado e
-- lido) o contato que chega por campanha ou pelo site, o que já é lead no CRM, ou o
-- que o corretor marca como lead (etiqueta do WhatsApp Business ou botão no CRM).
--
-- 1. whatsapp_contatos_numero: uma linha por contato de cada número de corretor,
--    com a situação (pessoal, lead, a_classificar). A identidade fica só como
--    índice cego (HMAC com chave fora do banco, lib/crypto/dados-pessoais.ts).
--    Telefone, nome e chat ficam cifrados e só para lead e a_classificar: o
--    contato pessoal não deixa nada além do índice.
-- 2. channel_sessions ganha o controle da importação dos pessoais e os ids das
--    etiquetas "Lead OPA" e "Pessoal" do WhatsApp Business daquele número.
--
-- Leitura: só o dono do número (o corretor) vê as linhas dele, e só as que não
-- são pessoais. Escrita: só o servidor (service role), depois de conferir o dono.

-- ---------------------------------------------------------------------------
-- 1. whatsapp_contatos_numero
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_contatos_numero (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  chave text not null,
  situacao text not null,
  origem text not null,
  telefone_cifrado text,
  nome_cifrado text,
  chat_cifrado text,
  mensagens_ignoradas integer not null default 0,
  ultimo_contato_em timestamptz,
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_contatos_numero_situacao_check check (situacao in ('pessoal', 'lead', 'a_classificar')),
  constraint whatsapp_contatos_numero_origem_check
    check (origem in ('importacao', 'etiqueta', 'corretor', 'campanha', 'site', 'lead_do_crm', 'novo')),
  -- Contato pessoal não guarda dado nenhum além do índice cego.
  constraint whatsapp_contatos_numero_pessoal_sem_dado
    check (situacao <> 'pessoal' or (telefone_cifrado is null and nome_cifrado is null and chat_cifrado is null)),
  constraint whatsapp_contatos_numero_unico unique (channel_session_id, chave)
);

comment on table public.whatsapp_contatos_numero is
  'Contatos do WhatsApp de cada corretor (0123): pessoal não é guardado nem lido pela IA; lead é; a_classificar espera o corretor decidir.';
comment on column public.whatsapp_contatos_numero.chave is
  'Índice cego da identidade do chat (telefone ou lid), HMAC com chave fora do banco e com a org no meio.';

create index if not exists whatsapp_contatos_numero_sessao_situacao_idx
  on public.whatsapp_contatos_numero (channel_session_id, situacao);
create index if not exists whatsapp_contatos_numero_org_idx
  on public.whatsapp_contatos_numero (organization_id);

drop trigger if exists trg_whatsapp_contatos_numero_updated_at on public.whatsapp_contatos_numero;
create trigger trg_whatsapp_contatos_numero_updated_at
  before update on public.whatsapp_contatos_numero
  for each row execute function public.fn_set_updated_at();

alter table public.whatsapp_contatos_numero enable row level security;

drop policy if exists whatsapp_contatos_numero_dono_le on public.whatsapp_contatos_numero;
create policy whatsapp_contatos_numero_dono_le on public.whatsapp_contatos_numero
  for select to authenticated
  using (
    situacao <> 'pessoal'
    and organization_id in (select public.fn_user_org_ids())
    and exists (
      select 1 from public.channel_sessions s
       where s.id = whatsapp_contatos_numero.channel_session_id
         and s.owner_user_id = auth.uid()
    )
  );

revoke all on table public.whatsapp_contatos_numero from public, anon;
grant select on table public.whatsapp_contatos_numero to authenticated;
grant all on table public.whatsapp_contatos_numero to service_role;

-- ---------------------------------------------------------------------------
-- 2. channel_sessions: importação dos pessoais e etiquetas do WhatsApp Business
-- ---------------------------------------------------------------------------
alter table public.channel_sessions
  add column if not exists pessoais_import_inicio timestamptz,
  add column if not exists pessoais_importados_em timestamptz,
  add column if not exists pessoais_importados integer,
  add column if not exists etiqueta_lead_id text,
  add column if not exists etiqueta_pessoal_id text;

comment on column public.channel_sessions.pessoais_importados_em is
  'Quando as conversas que já estavam no aparelho do corretor foram marcadas como pessoais (0123). Nulo = ainda não importou.';
comment on column public.channel_sessions.etiqueta_lead_id is
  'Id da etiqueta "Lead OPA" no WhatsApp Business deste número (0123).';

notify pgrst, 'reload schema';
