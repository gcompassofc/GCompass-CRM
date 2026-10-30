-- 0114: endurecimento da base (auditoria de segurança de 30/10/2026).
--
--   C1  mídia forjada: corretor gravava mensagem "recebida" com media_url
--       apontando para fora; o servidor buscava levando a chave da WAHA e
--       devolvia HTML na origem do CRM (reproduzido no Supabase local).
--   A2  emit_event / fn_log_event aceitavam org de outro tenant.
--   M1  retrieve_top_k_chunks devolvia a base de conhecimento de outro tenant.
--   M2  toda função nova nascia executável pela anon key.
--   M4  bucket lgpd-exports legível por qualquer membro (não só admin).
--   M6  contatos fora do modo de visibilidade: corretor lia nome e telefone
--       da carteira inteira (reproduzido: corretora via os 23 contatos).

-- ── C1: mensagem recebida só nasce pelo servidor (webhook da WAHA/Meta) ─────
create or replace function public.fn_protege_midia_da_mensagem()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' and new.direction = 'inbound' then
    raise exception 'Mensagem recebida só entra pelo canal do WhatsApp.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    new.media_url is distinct from old.media_url
    or new.media_storage_path is distinct from old.media_storage_path
    or new.direction is distinct from old.direction
  ) then
    raise exception 'Mídia e direção da mensagem não mudam pela sessão do usuário.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_midia_da_mensagem on public.messages;
create trigger trg_protege_midia_da_mensagem before insert or update on public.messages
  for each row execute function public.fn_protege_midia_da_mensagem();

-- ── A2: evento só na org de quem chama ─────────────────────────────────────
create or replace function public.emit_event(
  p_event_type text,
  p_entity_kind text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_organization_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_event_id uuid;
begin
  v_org_id := p_organization_id;
  if v_org_id is null then
    -- Try to resolve from caller's first org (best-effort; trigger callers MUST pass it)
    select organization_id into v_org_id
      from public.user_organizations
      where user_id = auth.uid() and revoked_at is null
      limit 1;
  end if;
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatorio';
  end if;
  -- Sessão de usuário só emite na própria org (antes: qualquer org, disparando
  -- automações e IA de outro tenant). Servidor e triggers sem sessão seguem livres.
  if auth.uid() is not null
     and not public.fn_is_platform_admin()
     and v_org_id not in (select public.fn_user_org_ids()) then
    raise exception 'emit_event: organização fora do seu acesso' using errcode = '42501';
  end if;

  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb),
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())))
  returning id into v_event_id;

  return v_event_id;
end $function$;

-- ── M1: base de conhecimento só da própria org, k limitado ─────────────────
create or replace function public.retrieve_top_k_chunks(
  p_organization_id uuid,
  p_kb_version_id uuid,
  p_embedding vector,
  p_k integer default 5,
  p_threshold real default 0.40
)
returns table(chunk_id uuid, knowledge_source_id uuid, content text, similarity real, metadata jsonb)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    c.id as chunk_id,
    c.knowledge_source_id,
    c.content,
    (1 - (c.embedding <=> p_embedding))::real as similarity,
    c.metadata
  from public.ai_chunks c
  where c.organization_id = p_organization_id
    and c.kb_version_id   = p_kb_version_id
    and (auth.uid() is null
         or public.fn_is_platform_admin()
         or p_organization_id in (select public.fn_user_org_ids()))
    and (1 - (c.embedding <=> p_embedding)) >= p_threshold
  order by c.embedding <=> p_embedding asc
  limit least(greatest(p_k, 0), 50);
$function$;

-- ── M2: função nova não nasce aberta para a anon key ───────────────────────
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
-- Função de gatilho: o disparo não consulta EXECUTE, então ninguém da sessão precisa dele.
revoke execute on function public.fn_evento_meta_da_etapa() from public, anon, authenticated;
revoke execute on function public.fn_protege_venda() from public, anon;
revoke execute on function public.fn_protege_midia_da_mensagem() from public, anon;
revoke execute on function public.fn_trava_campos_da_etapa() from public, anon;

-- ── M4: exportação LGPD só para o admin da org ─────────────────────────────
drop policy if exists tenant_read_lgpd_exports on storage.objects;
create policy tenant_read_lgpd_exports on storage.objects for select to authenticated
  using (
    bucket_id = 'lgpd-exports'
    and public.fn_role_at_least((split_part(name, '/', 1))::uuid, 'admin')
  );

-- ── M6: contato segue a visibilidade do lead e da conversa ─────────────────
-- Gestor e leitura veem a org toda (como em fn_can_view_lead). O atendente vê
-- o contato de um lead ou conversa que ele pode ver, ou o que ele mesmo criou.
create or replace function public.fn_can_view_contact(p_contact uuid, p_org uuid, p_criado_por uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.fn_is_platform_admin() then true
    when public.fn_user_role_in_org(p_org) is null then false
    when public.fn_user_role_in_org(p_org) <> 'agent' then true
    when p_criado_por = auth.uid() then true
    when coalesce((select settings->>'visibility_mode' from public.organizations where id = p_org), 'own_and_unassigned') = 'all' then true
    else exists (
      select 1 from public.crm_leads l
       where l.contact_id = p_contact and l.organization_id = p_org
         and public.fn_can_view_lead(p_org, l.owner_user_id)
    ) or exists (
      select 1 from public.conversations c
       where c.contact_id = p_contact and c.organization_id = p_org
         and public.fn_can_view_conversation(p_org, c.assigned_to_user_id)
    )
  end;
$$;
revoke execute on function public.fn_can_view_contact(uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_can_view_contact(uuid, uuid, uuid) to authenticated;

drop policy if exists tenant_isolation_contacts_all on public.contacts;
drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
drop policy if exists contacts_delete on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (public.fn_can_view_contact(id, organization_id, created_by_user_id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (
    (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
    or public.fn_is_platform_admin()
  );
create policy contacts_update on public.contacts for update to authenticated
  using (public.fn_role_at_least(organization_id, 'agent') and public.fn_can_view_contact(id, organization_id, created_by_user_id))
  with check (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.fn_role_at_least(organization_id, 'manager') or public.fn_is_platform_admin());

-- ── Lead não se apaga pelo atendente: perde-se com motivo (fica o histórico).
-- Antes o corretor apagava o próprio lead pelo PostgREST (reproduzido).
drop policy if exists crm_leads_delete on public.crm_leads;
create policy crm_leads_delete on public.crm_leads for delete to authenticated
  using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager'))
  );
