-- 0115: fecha P4, P11 e P13 da auditoria de 30/10/2026.
--
-- P4: ~50 tabelas da base tinham uma policy FOR ALL que só conferia se a pessoa
--     era membro da org. Corretor ou leitor reescrevia agente de IA, credencial
--     de IA, sessão de WhatsApp e apagava mensagem pelo PostgREST.
--     Agora: leitura segue para o membro; escrita de configuração só gerente+;
--     escrita operacional só corretor+ e exclusão só gerente+.
--     O worker e as rotinas usam service_role, que não passa por RLS.
-- P11: roleta e configuração regravavam o settings inteiro (ler, mesclar no app,
--     gravar). Pausa de corretor se perdia se entrasse lead no mesmo instante.
-- P13: URL do site e fotos do imóvel aceitavam qualquer domínio.

-- ---------------------------------------------------------------------------
-- P4. Policies por papel
-- ---------------------------------------------------------------------------
do $$
declare
  -- Configuração e registros do sistema: só gerente ou admin escreve.
  config text[] := array[
    'ai_agent_runs','ai_agent_versions','ai_faq_items','ai_provider_credentials',
    'ai_router_decisions','ai_router_members','ai_routers','before_send_traces',
    'channel_knobs','channel_session_health','channel_sessions','channel_session_warmup',
    'cron_jobs','disclosure_template_pointers','disclosure_template_versions',
    'flywheel_distiller_proposals','flywheel_judge_verdicts',
    'followup_flow_pointers','followup_flow_versions','judge_alignment_pool',
    'knowledge_searches','lead_state_transitions','llm_calls','meta_templates','metrics',
    'org_memory_entries','org_memory_pointers','org_memory_versions','outbound_copies',
    'pacing_ledger','playbook_pointers','playbook_versions','promise_table_pointers',
    'promise_table_versions','reentry_knob_pointers','reentry_knob_versions',
    'reentry_template_pointers','reentry_template_versions','send_ledger',
    'skill_activations','skill_pointers','skill_versions'
  ];
  -- Trabalho do dia: corretor escreve, só gerente apaga.
  operacional text[] := array[
    'agent_cases','agent_inbox_items','crm_lead_reactivations','crm_lead_risk_states',
    'crm_lead_scores','followup_enrollment_events','followup_enrollments','idempotency_keys',
    'job_queue','lead_checkpoints','lead_notes','lead_state','storage_redaction_queue'
  ];
  t text;
  pol record;
  membro constant text := '(organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())';
begin
  foreach t in array config || operacional loop
    if to_regclass('public.' || t) is null then
      raise notice '0115: tabela % não existe, pulando', t;
      continue;
    end if;
    -- Remove as policies de escrita/ALL antigas (as de SELECT ficam).
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t and cmd in ('ALL','INSERT','UPDATE','DELETE')
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'SELECT') then
      execute format('create policy %I on public.%I for select to authenticated using %s', t || '_select', t, membro);
    end if;

    if t = any(config) then
      execute format(
        'create policy %I on public.%I for all to authenticated
           using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, ''manager''))
           with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, ''manager''))',
        t || '_write_gestor', t);
    else
      execute format(
        'create policy %I on public.%I for insert to authenticated
           with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, ''agent''))',
        t || '_insert', t);
      execute format(
        'create policy %I on public.%I for update to authenticated
           using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, ''agent''))
           with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, ''agent''))',
        t || '_update', t);
      execute format(
        'create policy %I on public.%I for delete to authenticated
           using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, ''manager''))',
        t || '_delete', t);
    end if;
  end loop;
end $$;

-- agent_case_events é trilha: corretor registra, ninguém da sessão altera nem apaga.
do $$
begin
  if to_regclass('public.agent_case_events') is not null then
    drop policy if exists tenant_isolation_agent_case_events_insert on public.agent_case_events;
    drop policy if exists agent_case_events_insert on public.agent_case_events;
    create policy agent_case_events_insert on public.agent_case_events for insert to authenticated
      with check (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'agent'));
  end if;
end $$;

-- Mensagens: só quem vê a conversa altera; só gerente apaga.
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (
    public.fn_is_platform_admin()
    or (public.fn_role_at_least(organization_id, 'agent')
        and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
  )
  with check (
    public.fn_is_platform_admin()
    or (public.fn_role_at_least(organization_id, 'agent')
        and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
  );

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'manager'));

-- ---------------------------------------------------------------------------
-- P11. Roleta e configuração atômicas
-- ---------------------------------------------------------------------------

-- Próximo corretor da roleta, com a linha da org travada: duas entradas ao
-- mesmo tempo não pegam o mesmo corretor nem apagam a pausa de alguém.
create or replace function public.fn_opa_proximo_da_roleta(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opa jsonb;
  v_roleta text[];
  v_pausados text[];
  v_ultimo text;
  v_i int;
  v_passo int;
  v_n int;
  v_proximo text;
begin
  select coalesce(settings->'opa', '{}'::jsonb) into v_opa
  from public.organizations where id = p_org
  for update;
  if not found then
    raise exception 'Organização não encontrada' using errcode = 'P0002';
  end if;

  v_roleta := array(select jsonb_array_elements_text(coalesce(v_opa->'roleta', '[]'::jsonb)));
  v_pausados := array(select jsonb_array_elements_text(coalesce(v_opa->'roleta_pausados', '[]'::jsonb)));
  v_n := coalesce(array_length(v_roleta, 1), 0);
  v_ultimo := v_opa->>'roleta_ultimo';
  v_i := coalesce(array_position(v_roleta, v_ultimo), 0);

  for v_passo in 1..v_n loop
    v_i := (v_i % v_n) + 1;
    if not (v_roleta[v_i] = any(v_pausados)) then
      v_proximo := v_roleta[v_i];
      exit;
    end if;
  end loop;

  if v_proximo is null then
    raise exception 'Roleta da OPA vazia ou toda pausada (organizations.settings.opa.roleta).' using errcode = 'P0001';
  end if;

  update public.organizations
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{opa,roleta_ultimo}', to_jsonb(v_proximo), true)
  where id = p_org;

  return v_proximo::uuid;
end;
$$;

-- Mescla parte da configuração em settings.opa numa instrução só.
create or replace function public.fn_opa_mesclar_config(p_org uuid, p_parcial jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.organizations
  set settings = jsonb_set(
    coalesce(settings, '{}'::jsonb),
    '{opa}',
    coalesce(settings->'opa', '{}'::jsonb) || coalesce(p_parcial, '{}'::jsonb),
    true
  )
  where id = p_org;
$$;

-- Garante os motivos de perda no funil sem regravar o settings inteiro.
create or replace function public.fn_opa_garantir_motivos(p_pipeline uuid, p_motivos text[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.crm_pipelines
  set settings = jsonb_set(
    coalesce(settings, '{}'::jsonb),
    '{lost_reasons}',
    to_jsonb(array(
      select distinct m from (
        select jsonb_array_elements_text(coalesce(settings->'lost_reasons', '[]'::jsonb)) as m
        union
        select unnest(p_motivos)
      ) x where m is not null and m <> ''
    )),
    true
  )
  where id = p_pipeline;
$$;

-- Só o servidor (service_role) chama: quem chama já conferiu o papel.
revoke all on function public.fn_opa_proximo_da_roleta(uuid) from public, anon, authenticated;
revoke all on function public.fn_opa_mesclar_config(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_opa_garantir_motivos(uuid, text[]) from public, anon, authenticated;
grant execute on function public.fn_opa_proximo_da_roleta(uuid) to service_role;
grant execute on function public.fn_opa_mesclar_config(uuid, jsonb) to service_role;
grant execute on function public.fn_opa_garantir_motivos(uuid, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- P13. Domínios aceitos no imóvel
-- ---------------------------------------------------------------------------

-- URL: https obrigatório; com settings.opa.dominios_imovel preenchido, o host
-- tem de ser um deles ou subdomínio deles. Vale também para a importação.
-- Foto: o CRM guarda o NOME do arquivo do site ("imagens_523107") e monta o
-- endereço em lib/opa/imoveis.ts (fotoUrl). Nome simples passa; endereço
-- completo segue a regra da URL; javascript:, data: e afins são recusados.
create or replace function public.fn_url_de_imovel_ok(p_url text, p_dominios text[])
returns boolean
language sql
immutable
as $$
  select p_url is null or p_url = '' or (
    p_url ~* '^https://[a-z0-9.-]+(:[0-9]+)?(/|$)'
    and (
      coalesce(array_length(p_dominios, 1), 0) = 0
      or exists (
        select 1 from unnest(p_dominios) d
        where lower(substring(p_url from '^https://([^/:]+)')) = lower(d)
           or lower(substring(p_url from '^https://([^/:]+)')) like '%.' || lower(d)
      )
    )
  );
$$;

create or replace function public.fn_valida_urls_do_imovel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dominios text[];
  v_url text;
begin
  select array(select jsonb_array_elements_text(coalesce(settings->'opa'->'dominios_imovel', '[]'::jsonb)))
  into v_dominios
  from public.organizations where id = new.organization_id;

  if not public.fn_url_de_imovel_ok(new.url_site, v_dominios) then
    raise exception 'URL do imóvel fora dos domínios aceitos: %', new.url_site using errcode = 'P0001';
  end if;
  foreach v_url in array coalesce(new.fotos, '{}'::text[]) loop
    if v_url !~ '^[A-Za-z0-9_.-]{1,160}$' and not public.fn_url_de_imovel_ok(v_url, v_dominios) then
      raise exception 'Foto do imóvel fora dos domínios aceitos: %', v_url using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_valida_urls_do_imovel on public.imoveis;
create trigger trg_valida_urls_do_imovel
  before insert or update of url_site, fotos on public.imoveis
  for each row execute function public.fn_valida_urls_do_imovel();

revoke all on function public.fn_valida_urls_do_imovel() from public, anon, authenticated;

-- Domínios da OPA (o site e o armazenamento de fotos). Só preenche se ainda não houver.
update public.organizations
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb), '{opa,dominios_imovel}',
  '["opailhabela.com.br","r2.dev","r2.cloudflarestorage.com"]'::jsonb, true)
where settings ? 'opa' and not (settings->'opa' ? 'dominios_imovel');
