-- 0116: cifra dos dados pessoais, fase 2 (escrita).
--
-- A chave fica fora do banco, então quem cifra é o app: a rotina
-- /api/v1/cron/cifrar-dados (a cada minuto) pega o que está pendente e grava as
-- colunas *_cifrado da 0112. Vale para tudo que entra, venha do WhatsApp, do
-- webhook do site, da tela ou da base.
--
-- Estes gatilhos garantem que o cifrado nunca fique velho: se o texto puro mudar
-- sem o cifrado mudar junto, o cifrado é apagado e a linha volta para a fila.
-- A fase 3 (apagar o texto puro) só vem depois que a leitura usar o cifrado.

create or replace function public.fn_contato_cifra_pendente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Linha nova sem cifrado vai para a fila.
    if new.nome_cifrado is null and new.telefone_cifrado is null and new.email_cifrado is null then
      new.cifrado_em := null;
    end if;
    return new;
  end if;

  if new.name is distinct from old.name and new.nome_cifrado is not distinct from old.nome_cifrado then
    new.nome_cifrado := null;
    new.cifrado_em := null;
  end if;
  if new.phone_number is distinct from old.phone_number and new.telefone_cifrado is not distinct from old.telefone_cifrado then
    new.telefone_cifrado := null;
    new.telefone_indice := null;
    new.cifrado_em := null;
  end if;
  if new.email is distinct from old.email and new.email_cifrado is not distinct from old.email_cifrado then
    new.email_cifrado := null;
    new.email_indice := null;
    new.cifrado_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contato_cifra_pendente on public.contacts;
create trigger trg_contato_cifra_pendente
  before insert or update of name, phone_number, email on public.contacts
  for each row execute function public.fn_contato_cifra_pendente();

create or replace function public.fn_mensagem_cifra_pendente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is distinct from old.body and new.corpo_cifrado is not distinct from old.corpo_cifrado then
    new.corpo_cifrado := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mensagem_cifra_pendente on public.messages;
create trigger trg_mensagem_cifra_pendente
  before update of body on public.messages
  for each row execute function public.fn_mensagem_cifra_pendente();

revoke all on function public.fn_contato_cifra_pendente() from public, anon, authenticated;
revoke all on function public.fn_mensagem_cifra_pendente() from public, anon, authenticated;

-- Fila: índices parciais só com o que falta cifrar.
create index if not exists contacts_cifra_pendente_idx
  on public.contacts (created_at) where cifrado_em is null;
create index if not exists messages_cifra_pendente_idx
  on public.messages (created_at) where corpo_cifrado is null and body is not null;
