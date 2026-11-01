-- 0121: brechas achadas depois de colocar o CRM no ar (01/11/2026,
-- docs/PENDENCIAS-2026-11-01.md, itens A1, A3, A4, A5 e C5).
--
--   A1  O gerente alterava qualquer número de WhatsApp pela API (regra de escrita
--       da 0115, gerente para cima): trocava o dono, o telefone ou arquivava o OPA
--       Lembretes. Agora só o administrador grava; o corretor liga o próprio número
--       pela tela Meu WhatsApp, que roda no servidor (service role).
--   A3  Funções SECURITY DEFINER executáveis pela anon key. No Supabase hospedado a
--       própria plataforma dá EXECUTE direto a anon em toda função nova do postgres,
--       e `revoke ... from public` não tira esse grant: em produção ficaram 5 abertas
--       (fn_decrypt_oauth, fn_encrypt_oauth, fn_lgpd_cascade_redact_contact,
--       activate_kb_version, fn_update_budget_consumption). O Postgres local dos
--       testes não tem esse padrão, por isso a varredura não acusava.
--   A4  Etiquetas de regra (proprio, pago, organico) mudam a roleta e o prazo: o
--       corretor não as grava nem tira. Só o servidor e gerente para cima.
--   A5  Lembrete de lead saía do número oficial para qualquer colega, com texto livre.
--       Agora vai para quem agenda ou para o dono do lead, salvo gerente para cima.
--   C5  Mensagem só se apaga pelo administrador, e a sessão do usuário não reescreve
--       o conteúdo (corpo, tipo, conversa, autor, data): só o andamento do envio.
--
-- Service role, postgres e rotinas do servidor passam direto (não são
-- `authenticated`), como nos gatilhos da 0114.

-- ---------------------------------------------------------------------------
-- A3. Nenhuma SECURITY DEFINER de public executável por anon
-- ---------------------------------------------------------------------------
-- Varredura em vez de lista: cobre as 5 de hoje e qualquer outra que o padrão da
-- plataforma tenha aberto. Duas origens de EXECUTE (grant direto a anon e grant a
-- PUBLIC), daí `from public, anon`. Quem já executava como authenticated ou
-- service_role (às vezes só por PUBLIC) recebe o grant direto antes, para nada
-- que funciona logado quebrar.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    if f.logado then execute format('grant execute on function %s to authenticated', f.assinatura); end if;
    if f.servidor then execute format('grant execute on function %s to service_role', f.assinatura); end if;
    execute format('revoke execute on function %s from public, anon', f.assinatura);
  end loop;
end $$;

-- Só o servidor chama estas (todos os chamadores usam o cliente de service role;
-- fn_update_budget_consumption é função de gatilho e o disparo não consulta EXECUTE).
revoke execute on function public.fn_decrypt_oauth(bytea) from authenticated;
revoke execute on function public.fn_encrypt_oauth(text) from authenticated;
revoke execute on function public.fn_lgpd_cascade_redact_contact(uuid, uuid, uuid) from authenticated;
revoke execute on function public.activate_kb_version(uuid, uuid) from authenticated;
revoke execute on function public.fn_update_budget_consumption() from authenticated;
grant execute on function public.fn_decrypt_oauth(bytea) to service_role;
grant execute on function public.fn_encrypt_oauth(text) to service_role;
grant execute on function public.fn_lgpd_cascade_redact_contact(uuid, uuid, uuid) to service_role;
grant execute on function public.activate_kb_version(uuid, uuid) to service_role;
grant execute on function public.fn_update_budget_consumption() to service_role;

-- Helpers de RLS: as regras rodam com o papel de quem consulta, então
-- authenticated precisa deles. Mesmo re-grant da 0108, repetido por segurança.
grant execute on function public.fn_is_platform_admin() to authenticated, service_role;
grant execute on function public.fn_user_org_ids() to authenticated, service_role;
grant execute on function public.fn_user_role_in_org(uuid) to authenticated, service_role;
grant execute on function public.fn_user_role_in(uuid) to authenticated, service_role;
grant execute on function public.fn_role_at_least(uuid, text) to authenticated, service_role;

-- Função nova não nasce mais executável por anon. São duas portas: o grant direto
-- do padrão do schema (plataforma e pg_dump) e o EXECUTE que o próprio Postgres dá a
-- PUBLIC em toda função. A segunda só sai no padrão global (sem IN SCHEMA).
-- authenticated e service_role seguem recebendo pelo padrão do schema public.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- A1. Número de WhatsApp: só o administrador grava
-- ---------------------------------------------------------------------------
-- A 0115 já tinha trocado a regra antiga (FOR ALL de membro) por escrita de
-- gerente para cima (channel_sessions_write_gestor): o gerente ainda trocava dono,
-- telefone e arquivava. Sai também.
drop policy if exists channel_sessions_tenant_isolation_all on public.channel_sessions;
drop policy if exists channel_sessions_write_gestor on public.channel_sessions;
drop policy if exists channel_sessions_select on public.channel_sessions;
drop policy if exists channel_sessions_admin_insert on public.channel_sessions;
drop policy if exists channel_sessions_admin_update on public.channel_sessions;
drop policy if exists channel_sessions_admin_delete on public.channel_sessions;

create policy channel_sessions_select on public.channel_sessions for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

create policy channel_sessions_admin_insert on public.channel_sessions for insert to authenticated
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'))
  );

create policy channel_sessions_admin_update on public.channel_sessions for update to authenticated
  using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'))
  )
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'))
  );

create policy channel_sessions_admin_delete on public.channel_sessions for delete to authenticated
  using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'))
  );

-- Segunda trava, para o caso de uma regra futura afrouxar a de cima: dono,
-- telefone, nome da sessão, arquivamento e empresa não mudam pela sessão de quem
-- não é administrador.
create or replace function public.fn_protege_numero_whatsapp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.fn_is_platform_admin() or public.fn_role_at_least(new.organization_id, 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT'
     or new.owner_user_id is distinct from old.owner_user_id
     or new.phone_number is distinct from old.phone_number
     or new.waha_session_name is distinct from old.waha_session_name
     or new.archived_at is distinct from old.archived_at
     or new.organization_id is distinct from old.organization_id then
    raise exception 'Só o administrador muda o dono, o telefone ou o arquivamento de um número de WhatsApp.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_numero_whatsapp on public.channel_sessions;
create trigger trg_protege_numero_whatsapp before insert or update on public.channel_sessions
  for each row execute function public.fn_protege_numero_whatsapp();
revoke all on function public.fn_protege_numero_whatsapp() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A4. Etiquetas de regra: proprio, pago, organico
-- ---------------------------------------------------------------------------
create or replace function public.fn_protege_etiquetas_reservadas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reservadas constant text[] := array['proprio', 'pago', 'organico'];
  antes text[];
  depois text[];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.fn_is_platform_admin() or public.fn_role_at_least(new.organization_id, 'manager') then
    return new;
  end if;
  depois := array(select distinct t from unnest(coalesce(new.tags, '{}')) t where t = any(reservadas) order by t);
  antes := case when tg_op = 'INSERT' then '{}'::text[]
                else array(select distinct t from unnest(coalesce(old.tags, '{}')) t where t = any(reservadas) order by t) end;
  if depois is distinct from antes then
    raise exception 'As etiquetas lead próprio, pago e orgânico são da regra da roleta: só o gerente muda.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_etiquetas_reservadas on public.crm_leads;
create trigger trg_protege_etiquetas_reservadas before insert or update of tags on public.crm_leads
  for each row execute function public.fn_protege_etiquetas_reservadas();
revoke all on function public.fn_protege_etiquetas_reservadas() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A5. Lembrete de lead: para quem agenda ou para o dono do lead
-- ---------------------------------------------------------------------------
drop policy if exists lembretes_write on public.lembretes_agendados;
create policy lembretes_write on public.lembretes_agendados for all to authenticated
  using (
    public.fn_role_at_least(organization_id, 'agent')
    and case when lead_id is null
      then para_user_id = auth.uid() or criado_por = auth.uid() or public.fn_role_at_least(organization_id, 'manager')
      else exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = lembretes_agendados.organization_id)
    end
  )
  with check (
    public.fn_role_at_least(organization_id, 'agent')
    and case when lead_id is null
      then para_user_id = auth.uid() or public.fn_role_at_least(organization_id, 'manager')
      else exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = lembretes_agendados.organization_id)
        and (
          para_user_id = auth.uid()
          or public.fn_role_at_least(organization_id, 'manager')
          or exists (select 1 from public.crm_leads l where l.id = lead_id and l.owner_user_id = lembretes_agendados.para_user_id)
        )
    end
  );

-- ---------------------------------------------------------------------------
-- C5. Mensagens: o histórico fica
-- ---------------------------------------------------------------------------
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'))
  );

-- A sessão do usuário só anda com o envio (status, ack, erro, id externo,
-- metadata, horários de entrega e leitura, template). O conteúdo e a origem não
-- mudam: mídia e direção já eram travadas pela 0114.
create or replace function public.fn_protege_conteudo_da_mensagem()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.body is distinct from old.body
     or new.corpo_cifrado is distinct from old.corpo_cifrado
     or new.type is distinct from old.type
     or new.organization_id is distinct from old.organization_id
     or new.conversation_id is distinct from old.conversation_id
     or new.contact_id is distinct from old.contact_id
     or new.channel_session_id is distinct from old.channel_session_id
     or new.sent_at is distinct from old.sent_at
     or new.sent_by_user_id is distinct from old.sent_by_user_id
     or new.sent_via is distinct from old.sent_via
     or new.media_mime is distinct from old.media_mime
     or new.media_size_bytes is distinct from old.media_size_bytes
     or new.created_at is distinct from old.created_at then
    raise exception 'O conteúdo da mensagem não muda: o histórico da conversa fica como foi.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_conteudo_da_mensagem on public.messages;
create trigger trg_protege_conteudo_da_mensagem before update on public.messages
  for each row execute function public.fn_protege_conteudo_da_mensagem();
revoke all on function public.fn_protege_conteudo_da_mensagem() from public, anon, authenticated;

notify pgrst, 'reload schema';
