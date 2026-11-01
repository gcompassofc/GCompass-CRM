-- 0118: gravação segura em crm_leads.custom_fields (revisão de 31/10/2026, ponto E1).
--
-- Antes, cada ação lia o objeto inteiro de custom_fields, trocava uma chave no
-- servidor e gravava o objeto de volta. Duas ações no mesmo lead (o corretor toca
-- "Respondi" enquanto o copiloto termina de ler, ou uma ligação registrada no
-- meio de um salvar de campos) faziam a segunda apagar o que a primeira gravou.
--
-- fn_opa_mesclar_campos faz a mescla DENTRO de um único UPDATE: o Postgres trava
-- a linha, relê a versão mais nova e aplica só as chaves do patch. Nenhuma outra
-- chave é tocada.
--
--   p_patch    chaves a gravar; o valor novo substitui o antigo
--   p_mesclar  chaves cujo valor é objeto e deve ser mesclado um nível abaixo
--              (ex.: "opa" recebe {finalidade: ...} sem apagar "regiao")
--   p_remover  chaves a tirar do objeto
--   p_atividade, quando informado, atualiza last_activity_at
--   p_org      quando informado, exige que o lead seja dessa org (uso do cliente
--              admin, que não passa pelas regras de RLS)
--
-- security invoker: quem chama só mexe no lead que as regras de RLS deixam. Devolve
-- o custom_fields novo, ou null se o lead não existe ou não está visível.

create or replace function public.fn_opa_mesclar_campos(
  p_lead uuid,
  p_patch jsonb,
  p_mesclar text[] default '{}',
  p_remover text[] default '{}',
  p_atividade timestamptz default null,
  p_org uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_novo jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch precisa ser um objeto' using errcode = '22023';
  end if;

  update public.crm_leads l
     set custom_fields = (coalesce(l.custom_fields, '{}'::jsonb) - coalesce(p_remover, '{}'::text[]))
           || coalesce((
                select jsonb_object_agg(
                         e.key,
                         case
                           when e.key = any (coalesce(p_mesclar, '{}'::text[]))
                                and jsonb_typeof(e.value) = 'object'
                                and jsonb_typeof(l.custom_fields -> e.key) = 'object'
                           then (l.custom_fields -> e.key) || e.value
                           else e.value
                         end)
                  from jsonb_each(p_patch) e
              ), '{}'::jsonb),
         last_activity_at = coalesce(p_atividade, l.last_activity_at)
   where l.id = p_lead
     and (p_org is null or l.organization_id = p_org)
  returning l.custom_fields into v_novo;

  return v_novo;
end;
$$;

revoke all on function public.fn_opa_mesclar_campos(uuid, jsonb, text[], text[], timestamptz, uuid) from public, anon;
grant execute on function public.fn_opa_mesclar_campos(uuid, jsonb, text[], text[], timestamptz, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
