-- 0112: cifra de dados pessoais em repouso, fase 1 (colunas ao lado).
--
-- Objetivo: dump do banco não entrega nome, telefone, e-mail e conversa dos leads.
-- A cifra é feita no servidor Next (lib/crypto/dados-pessoais.ts, AES-256-GCM,
-- chave fora do banco). O banco só vê `pii1.v1.<base64url>`.
--
-- Fases (cada uma é uma migration revisada à parte):
--   1. (esta) colunas cifradas + índice cego ao lado das de texto puro;
--      scripts/cifrar-dados-pessoais.ts preenche. Nada deixa de funcionar.
--   2. o app passa a gravar e ler pelas colunas cifradas (camada de dados
--      decifra para quem a RLS já deixou ver); busca por telefone/e-mail
--      vai para o índice cego.
--   3. texto puro vira NULL e um trigger recusa gravar texto puro de novo.
--
-- Busca por nome em fase 3: decifrar no servidor a lista que a RLS libera
-- (centenas a poucos milhares por org) e filtrar em memória.

alter table public.contacts
  add column if not exists nome_cifrado text,
  add column if not exists telefone_cifrado text,
  add column if not exists email_cifrado text,
  add column if not exists telefone_indice text,
  add column if not exists email_indice text,
  add column if not exists cifrado_em timestamptz;

comment on column public.contacts.nome_cifrado is 'pii1: AES-256-GCM, AAD org|nome. Abrir só no servidor (lib/crypto/dados-pessoais.ts).';
comment on column public.contacts.telefone_indice is 'HMAC-SHA256 do telefone normalizado (55+DDD+número) com chave própria e org; busca exata e dedupe.';

-- O check só aceita o formato cifrado: um bug que grave texto puro aqui falha alto.
alter table public.contacts drop constraint if exists contacts_pii_formato;
alter table public.contacts add constraint contacts_pii_formato check (
  (nome_cifrado is null or nome_cifrado like 'pii1.%')
  and (telefone_cifrado is null or telefone_cifrado like 'pii1.%')
  and (email_cifrado is null or email_cifrado like 'pii1.%')
);

create index if not exists contacts_telefone_indice_idx on public.contacts (organization_id, telefone_indice) where telefone_indice is not null;
create index if not exists contacts_email_indice_idx on public.contacts (organization_id, email_indice) where email_indice is not null;

alter table public.messages
  add column if not exists corpo_cifrado text;

alter table public.messages drop constraint if exists messages_pii_formato;
alter table public.messages add constraint messages_pii_formato check (corpo_cifrado is null or corpo_cifrado like 'pii1.%');
