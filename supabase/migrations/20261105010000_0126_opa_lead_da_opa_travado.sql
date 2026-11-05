-- 0126: lead que veio por ação da OPA (decisão do Allyson, 05/11/2026).
--
-- Lead da OPA é todo lead sem a etiqueta `proprio`, que só o servidor e o gerente
-- gravam (0121). O corretor não o encerra como "Contato pessoal" nem desliga os avisos
-- de prazo: as duas coisas tiravam o lead do repasse da roleta. Esta é a segunda camada,
-- para quem chamar o banco direto; as telas e as ações já recusam com a mensagem certa.
--
-- Service role, postgres e rotinas do servidor passam direto (não são `authenticated`),
-- como na 0121. O servidor confere o papel antes de encerrar como pessoal.
-- Pode rodar de novo sem estragar.

create or replace function public.fn_protege_lead_da_opa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if 'proprio' = any(coalesce(old.tags, '{}')) then
    return new;
  end if;
  if public.fn_is_platform_admin() or public.fn_role_at_least(new.organization_id, 'manager') then
    return new;
  end if;
  if new.lost_reason = 'Contato pessoal' and new.lost_reason is distinct from old.lost_reason then
    raise exception 'Este lead veio por ação da OPA. Se for mesmo pessoal, peça ao gestor.'
      using errcode = '42501';
  end if;
  if coalesce(new.custom_fields ->> 'lembretes_desligados', '') = 'true'
     and coalesce(old.custom_fields ->> 'lembretes_desligados', '') <> 'true' then
    raise exception 'Este lead veio por ação da OPA: só o gestor desliga os avisos.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protege_lead_da_opa on public.crm_leads;
create trigger trg_protege_lead_da_opa before update of lost_reason, custom_fields on public.crm_leads
  for each row execute function public.fn_protege_lead_da_opa();
revoke all on function public.fn_protege_lead_da_opa() from public, anon, authenticated;
