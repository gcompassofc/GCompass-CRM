-- 0129: uma pessoa, um lead aberto (pedido do Allyson, 06/11/2026).
--
-- A entrada do lead já procura o aberto antes de criar, mas nada no banco garantia
-- isso: duas entradas ao mesmo tempo, ou o mesmo número em dois contatos (telefone e
-- @lid do WhatsApp), criavam dois. Gatilho e não índice único: um índice falharia na
-- migration se já houver duplicado em produção. O gatilho só barra o que é novo, e o
-- que já existe aparece na tela Duplicados para o administrador resolver.

create or replace function public.fn_um_lead_aberto_por_pessoa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indice text;
  v_telefone text;
begin
  if new.status <> 'open' or new.contact_id is null then
    return new;
  end if;

  select c.telefone_indice, c.phone_number into v_indice, v_telefone
  from public.contacts c
  where c.id = new.contact_id;

  -- Duas entradas ao mesmo tempo esperam uma pela outra, em vez de passarem juntas.
  perform pg_advisory_xact_lock(
    hashtextextended(new.organization_id::text || coalesce(v_indice, v_telefone, new.contact_id::text), 0)
  );

  if exists (
    select 1
    from public.crm_leads l
    join public.contacts c on c.id = l.contact_id
    where l.organization_id = new.organization_id
      and l.status = 'open'
      and l.id <> new.id
      and (
        l.contact_id = new.contact_id
        or (v_indice is not null and c.telefone_indice = v_indice)
        or (v_telefone is not null and c.phone_number = v_telefone)
      )
  ) then
    raise exception 'Esta pessoa já tem um negócio aberto. Use o que já existe em vez de criar outro.'
      using errcode = 'P0001', hint = 'lead_duplicado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_um_lead_aberto_por_pessoa on public.crm_leads;
create trigger trg_um_lead_aberto_por_pessoa
  before insert or update of status on public.crm_leads
  for each row execute function public.fn_um_lead_aberto_por_pessoa();

revoke all on function public.fn_um_lead_aberto_por_pessoa() from public, anon, authenticated;

-- O lead aberto da pessoa, olhando também o outro contato do mesmo número.
create or replace function public.fn_lead_aberto_da_pessoa(p_org uuid, p_contato uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from public.contacts eu
  join public.contacts c
    on c.organization_id = eu.organization_id
   and (c.id = eu.id or c.telefone_indice = eu.telefone_indice or c.phone_number = eu.phone_number)
  join public.crm_leads l on l.contact_id = c.id and l.organization_id = eu.organization_id and l.status = 'open'
  where eu.organization_id = p_org and eu.id = p_contato
  order by l.created_at
  limit 1;
$$;
revoke all on function public.fn_lead_aberto_da_pessoa(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_lead_aberto_da_pessoa(uuid, uuid) to service_role;

-- Quando saiu a primeira mensagem de cada conversa: é o que diz quem falou primeiro.
create or replace function public.fn_primeira_mensagem_das_conversas(p_org uuid, p_conversas uuid[])
returns table (conversation_id uuid, primeira timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.conversation_id, min(coalesce(m.sent_at, m.created_at))
  from public.messages m
  where m.organization_id = p_org and m.conversation_id = any (p_conversas)
  group by m.conversation_id;
$$;
revoke all on function public.fn_primeira_mensagem_das_conversas(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.fn_primeira_mensagem_das_conversas(uuid, uuid[]) to service_role;
