-- 0124 · CRM da OPA: conversa guardada enquanto o corretor decide (decisão do Allyson, 02/11/2026).
--
-- Na 0123, contato novo sem sinal ficava "a classificar" sem nada da conversa: o
-- corretor via "Número protegido pelo WhatsApp" e "3 mensagens" e não tinha como
-- decidir, e ao tocar "É lead" a ficha abria vazia (o histórico do WAHA NOWEB não
-- funciona sem o store, que fica desligado por privacidade).
--
-- Agora, para contato a_classificar, o servidor guarda as mensagens (entrada e
-- saída), cifradas, só para o dono do número ver, até ele decidir:
--   - "É lead": o servidor leva as mensagens para a conversa normal (messages) e
--     apaga daqui;
--   - "Pessoal": apaga tudo daqui (gatilho abaixo, venha a decisão de onde vier);
--   - sem decisão: a rotina de minuto em minuto apaga o que tem mais de 7 dias.
-- Continua sem guardar nada de pessoal, grupo, status, transmissão, canal e do que
-- sincroniza nos 15 minutos depois do QR.
--
-- Acesso: RLS ligada e NENHUMA policy. anon e authenticated não leem nem gravam;
-- só o service role, pelo servidor, depois de conferir o dono do número.

create table if not exists public.whatsapp_mensagens_a_classificar (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  contato_numero_id uuid not null references public.whatsapp_contatos_numero(id) on delete cascade,
  -- Id da mensagem no WhatsApp SEM o chat (a parte depois do último "_"): o id
  -- completo leva o telefone em claro, e aqui o telefone só existe cifrado.
  mensagem_wa_id text not null,
  direcao text not null,
  tipo text not null default 'text',
  corpo_cifrado text,
  mensagem_em timestamptz not null,
  created_at timestamptz not null default now(),
  constraint whatsapp_mensagens_a_classificar_direcao_check check (direcao in ('entrada', 'saida')),
  constraint whatsapp_mensagens_a_classificar_tipo_check
    check (tipo in ('text', 'audio', 'image', 'video', 'document', 'sticker', 'location', 'contact')),
  -- Só o formato cifrado entra: um bug que grave texto puro aqui falha alto.
  constraint whatsapp_mensagens_a_classificar_corpo_formato check (corpo_cifrado is null or corpo_cifrado like 'pii1.%'),
  -- Texto sem corpo não é mensagem (presença, protocolo); mídia pode vir sem legenda.
  constraint whatsapp_mensagens_a_classificar_tem_conteudo check (tipo <> 'text' or corpo_cifrado is not null),
  constraint whatsapp_mensagens_a_classificar_unica unique (channel_session_id, mensagem_wa_id)
);

comment on table public.whatsapp_mensagens_a_classificar is
  'Mensagens de contato a classificar do WhatsApp do corretor (0124), cifradas, até ele decidir: lead leva para messages, pessoal apaga, sem decisão some em 7 dias. Máximo de 20 por contato. Só o service role acessa.';
comment on column public.whatsapp_mensagens_a_classificar.corpo_cifrado is
  'pii1: AES-256-GCM, AAD org|mensagem (lib/crypto/dados-pessoais.ts). Mídia não é baixada: só o tipo, e a legenda se houver.';

create index if not exists whatsapp_mensagens_a_classificar_contato_idx
  on public.whatsapp_mensagens_a_classificar (contato_numero_id, mensagem_em desc);
create index if not exists whatsapp_mensagens_a_classificar_criada_idx
  on public.whatsapp_mensagens_a_classificar (created_at);

alter table public.whatsapp_mensagens_a_classificar enable row level security;

revoke all on table public.whatsapp_mensagens_a_classificar from public, anon, authenticated;
grant all on table public.whatsapp_mensagens_a_classificar to service_role;

-- ---------------------------------------------------------------------------
-- Antes de gravar: só entra mensagem de contato que AINDA está a classificar, e
-- do mesmo número e organização da linha do contato. Contato que virou pessoal ou
-- lead no meio do caminho não recebe nada (a linha é descartada sem erro). O
-- `for share` espera a decisão em andamento terminar antes de conferir.
-- ---------------------------------------------------------------------------
create or replace function public.fn_whatsapp_espera_confere()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_situacao text;
  v_org uuid;
  v_sessao uuid;
begin
  select c.situacao, c.organization_id, c.channel_session_id
    into v_situacao, v_org, v_sessao
    from public.whatsapp_contatos_numero c
   where c.id = new.contato_numero_id
     for share;
  if not found then
    return new; -- a FK recusa
  end if;
  if v_org is distinct from new.organization_id or v_sessao is distinct from new.channel_session_id then
    raise exception 'mensagem em espera de outro número ou organização' using errcode = '23514';
  end if;
  if v_situacao <> 'a_classificar' then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_espera_confere on public.whatsapp_mensagens_a_classificar;
create trigger trg_whatsapp_espera_confere
  before insert on public.whatsapp_mensagens_a_classificar
  for each row execute function public.fn_whatsapp_espera_confere();

-- Depois de gravar: fica no máximo as 20 mais recentes do contato.
create or replace function public.fn_whatsapp_espera_limita()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.whatsapp_mensagens_a_classificar m
   where m.contato_numero_id = new.contato_numero_id
     and m.id not in (
       select r.id
         from public.whatsapp_mensagens_a_classificar r
        where r.contato_numero_id = new.contato_numero_id
        order by r.mensagem_em desc, r.created_at desc, r.id desc
        limit 20
     );
  return null;
end;
$$;

drop trigger if exists trg_whatsapp_espera_limita on public.whatsapp_mensagens_a_classificar;
create trigger trg_whatsapp_espera_limita
  after insert on public.whatsapp_mensagens_a_classificar
  for each row execute function public.fn_whatsapp_espera_limita();

-- Contato que vira pessoal: some tudo o que estava em espera, venha a decisão de
-- onde vier (botão, etiqueta do WhatsApp Business, servidor).
create or replace function public.fn_whatsapp_espera_apaga_pessoal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  delete from public.whatsapp_mensagens_a_classificar where contato_numero_id = new.id;
  return null;
end;
$$;

drop trigger if exists trg_whatsapp_contatos_numero_pessoal_apaga_espera on public.whatsapp_contatos_numero;
create trigger trg_whatsapp_contatos_numero_pessoal_apaga_espera
  after update of situacao on public.whatsapp_contatos_numero
  for each row
  when (new.situacao = 'pessoal' and old.situacao is distinct from 'pessoal')
  execute function public.fn_whatsapp_espera_apaga_pessoal();

notify pgrst, 'reload schema';
