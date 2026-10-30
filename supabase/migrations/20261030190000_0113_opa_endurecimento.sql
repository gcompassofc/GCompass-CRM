-- 0113: endurecimento da camada OPA (auditoria de segurança de 30/10/2026).
--
-- Achados confirmados com ataque real no Supabase local:
--   A1  token do webhook de entrada legível por qualquer membro (organizations.settings)
--   A2  corretor alterava preço e apagava a carteira inteira (policy `for all` em imoveis)
--   A3  valor da "Venda realizada" (que vai ao Meta) forjável gravando custom_fields.venda
--   M1  viewer escrevia em visitas, sugestões e lembretes
--   M3  ganhar negócio sem trava (duas abas = duas vendas, dois leads no mesmo imóvel)
--   M9  corretor via e assumia lead sem dono (visibility_mode padrão)
--   B1  lembrete pessoal de um corretor visível e cancelável pelos colegas
--   B2  linha com organization_id diferente da do lead
--   B7  trava de etapa só no update e sem search_path

-- ── A1: segredo da org fora de settings ─────────────────────────────────────
create table if not exists public.opa_segredos (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  entrada_token text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.opa_segredos enable row level security;
-- Sem policy nenhuma: só o service_role (servidor) lê e grava.
revoke all on public.opa_segredos from anon, authenticated;

insert into public.opa_segredos (organization_id, entrada_token)
select id, settings->'opa'->>'entrada_token'
from public.organizations
where settings->'opa'->>'entrada_token' is not null
on conflict (organization_id) do update set entrada_token = excluded.entrada_token, atualizado_em = now();

update public.organizations
set settings = jsonb_set(settings, '{opa}', (settings->'opa') - 'entrada_token')
where settings->'opa' ? 'entrada_token';

-- ── A2: carteira de imóveis, leitura para a equipe, escrita só gestor ─────
drop policy if exists imoveis_write_member on public.imoveis;
drop policy if exists imoveis_write_gestor on public.imoveis;
create policy imoveis_write_gestor on public.imoveis for all to authenticated
  using (public.fn_role_at_least(organization_id, 'manager'))
  with check (public.fn_role_at_least(organization_id, 'manager'));

-- ── M1 + B2: escrever exige papel de atendente e a mesma org do lead ───────
drop policy if exists copiloto_member on public.copiloto_sugestoes;
drop policy if exists copiloto_select on public.copiloto_sugestoes;
drop policy if exists copiloto_write on public.copiloto_sugestoes;
create policy copiloto_select on public.copiloto_sugestoes for select to authenticated
  using (exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = copiloto_sugestoes.organization_id));
create policy copiloto_write on public.copiloto_sugestoes for all to authenticated
  using (
    public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = copiloto_sugestoes.organization_id)
  )
  with check (
    public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = copiloto_sugestoes.organization_id)
  );

drop policy if exists visitas_member on public.visitas;
drop policy if exists visitas_select on public.visitas;
drop policy if exists visitas_write on public.visitas;
create policy visitas_select on public.visitas for select to authenticated
  using (exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = visitas.organization_id));
create policy visitas_write on public.visitas for all to authenticated
  using (
    public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = visitas.organization_id)
  )
  with check (
    public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = visitas.organization_id)
  );

-- B1: lembrete sem lead é pessoal (de quem recebe ou de quem criou); gestor vê todos.
drop policy if exists lembretes_member on public.lembretes_agendados;
drop policy if exists lembretes_select on public.lembretes_agendados;
drop policy if exists lembretes_write on public.lembretes_agendados;
create policy lembretes_select on public.lembretes_agendados for select to authenticated
  using (
    case when lead_id is null
      then organization_id in (select public.fn_user_org_ids())
        and (para_user_id = auth.uid() or criado_por = auth.uid() or public.fn_role_at_least(organization_id, 'manager'))
      else exists (select 1 from public.crm_leads l where l.id = lead_id and l.organization_id = lembretes_agendados.organization_id)
    end
  );
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
    end
  );

-- ── A3: custom_fields.venda só muda pela função de ganho ──────────────────
-- Quem chama pelo PostgREST (authenticated) não grava nem apaga a venda.
-- Rotinas do servidor (service_role) podem regravar custom_fields, mas não
-- derrubam uma venda já registrada (corrida do copiloto, achado M5).
create or replace function public.fn_protege_venda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.custom_fields->'venda') is not distinct from (old.custom_fields->'venda') then
    return new;
  end if;
  if current_user in ('authenticated', 'anon') then
    raise exception 'A venda só é registrada pelo botão Ganhar negócio.' using errcode = '42501';
  end if;
  if old.custom_fields ? 'venda' and not (coalesce(new.custom_fields, '{}'::jsonb) ? 'venda') then
    new.custom_fields := jsonb_set(coalesce(new.custom_fields, '{}'::jsonb), '{venda}', old.custom_fields->'venda');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_venda on public.crm_leads;
create trigger trg_protege_venda before update of custom_fields on public.crm_leads
  for each row execute function public.fn_protege_venda();

-- ── A3 + M3: ganhar negócio atômico ───────────────────────────────────────
create or replace function public.fn_opa_ganhar_negocio(
  p_lead uuid,
  p_imovel_codigo text,
  p_valor_cents bigint default null,
  p_data date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lead record;
  v_imovel record;
  v_etapa uuid;
  v_vgv bigint;
  v_comissao bigint;
  v_fechado timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessão expirada.' using errcode = '42501';
  end if;

  select id, organization_id, pipeline_id, contact_id, owner_user_id, status, custom_fields
    into v_lead
    from crm_leads where id = p_lead
    for update;
  if not found
     or not public.fn_can_view_lead(v_lead.organization_id, v_lead.owner_user_id)
     or not public.fn_role_at_least(v_lead.organization_id, 'agent') then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;
  if v_lead.status <> 'open' then
    raise exception 'Este negócio já foi encerrado.' using errcode = 'P0001';
  end if;

  select id, codigo, preco_venda_cents, status into v_imovel
    from imoveis
    where organization_id = v_lead.organization_id and codigo = p_imovel_codigo
    for update;
  if not found then
    raise exception 'Escolha o imóvel vendido.' using errcode = 'P0001';
  end if;
  if v_imovel.status = 'vendido' then
    raise exception 'Esse imóvel já está como vendido no acervo.' using errcode = 'P0001';
  end if;

  if p_data is null or p_data > current_date + 1 or p_data < current_date - 365 then
    raise exception 'Data da venda fora do intervalo (até um ano atrás, nunca no futuro).' using errcode = 'P0001';
  end if;

  v_vgv := coalesce(p_valor_cents, v_imovel.preco_venda_cents);
  if v_vgv is null or v_vgv <= 0 then
    raise exception 'O imóvel não tem valor pedido: marque “fechou por outro valor”.' using errcode = 'P0001';
  end if;
  -- Comissão da OPA: 3% do VGV, calculada aqui, nunca recebida do navegador.
  v_comissao := round(v_vgv * 0.03);

  select id into v_etapa from crm_stages
    where organization_id = v_lead.organization_id and pipeline_id = v_lead.pipeline_id and is_won
    order by position limit 1;
  if v_etapa is null then
    raise exception 'O funil não tem etapa de venda.' using errcode = 'P0001';
  end if;

  v_fechado := (p_data::text || ' 12:00:00-03')::timestamptz;
  update crm_leads set
    stage_id = v_etapa,
    status = 'won',
    closed_at = v_fechado,
    value_cents = v_vgv,
    stage_changed_at = v_fechado,
    last_activity_at = now(),
    custom_fields = coalesce(custom_fields, '{}'::jsonb) || jsonb_build_object('venda', jsonb_build_object(
      'imovel_codigo', v_imovel.codigo,
      'vgv_cents', v_vgv,
      'valor_pedido_cents', v_imovel.preco_venda_cents,
      'outro_valor', p_valor_cents is not null,
      'comissao_cents', v_comissao,
      'data', p_data::text,
      'registrado_por', v_uid
    ))
  where id = v_lead.id;

  update imoveis set status = 'vendido', updated_at = now() where id = v_imovel.id;

  insert into crm_lead_activities (organization_id, lead_id, contact_id, source_module, type, payload, performed_by_user_id)
  values (v_lead.organization_id, v_lead.id, v_lead.contact_id, 'opa', 'venda_realizada', jsonb_build_object(
    'imovel_codigo', v_imovel.codigo,
    'vgv_cents', v_vgv,
    'comissao_cents', v_comissao,
    'evento_meta', jsonb_build_object('nome', 'Venda realizada', 'valor_cents', v_comissao, 'status', 'na_fila')
  ), v_uid);

  return jsonb_build_object('vgv_cents', v_vgv, 'comissao_cents', v_comissao, 'imovel_codigo', v_imovel.codigo);
end;
$$;

revoke all on function public.fn_opa_ganhar_negocio(uuid, text, bigint, date) from public, anon;
grant execute on function public.fn_opa_ganhar_negocio(uuid, text, bigint, date) to authenticated;

-- ── B7: trava de etapa também no insert, com search_path fixo ─────────────
-- No insert, só vale para quem entra pelo PostgREST (corretor pulando etapa);
-- entrada de lead e seed rodam como service_role.
create or replace function public.fn_trava_campos_da_etapa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  exigidos text[];
  faltando text[];
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  if tg_op = 'INSERT' and current_user not in ('authenticated', 'anon') then
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
create trigger trg_trava_campos_da_etapa before insert or update of stage_id on public.crm_leads
  for each row execute function public.fn_trava_campos_da_etapa();

-- ── M9: na OPA o corretor vê só os próprios leads ─────────────────────────
update public.organizations
set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{visibility_mode}', '"own"')
where slug = 'opa';
