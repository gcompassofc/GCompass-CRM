-- 0133 · Diagnóstico feito com 2 dos 4 campos (pedido do Allyson, 12/11/2026)
--
-- Até aqui, entrar em "Diagnóstico feito" (e nas etapas depois dela) pedia os
-- quatro campos confirmados: finalidade, região, momento e inegociável. Agora
-- bastam dois quaisquer. O corretor arrasta o card, preenche dois na janela que
-- abre ali mesmo no Funil, e o card passa; a etapa vai para a Meta como antes.
--
-- `campos_minimo` diz quantos dos `campos_obrigatorios` precisam estar
-- preenchidos. NULL = todos (o comportamento antigo, para quem não mudou).
--
-- Pode rodar de novo sem estragar.

alter table public.crm_stages add column if not exists campos_minimo integer;

alter table public.crm_stages drop constraint if exists crm_stages_campos_minimo_check;
alter table public.crm_stages add constraint crm_stages_campos_minimo_check
  check (campos_minimo is null or campos_minimo >= 1);

create or replace function public.fn_trava_campos_da_etapa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  exigidos text[];
  minimo integer;
  faltando text[];
  preenchidos integer;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  if tg_op = 'INSERT' and current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  select campos_obrigatorios, campos_minimo into exigidos, minimo from public.crm_stages where id = new.stage_id;
  if exigidos is null or cardinality(exigidos) = 0 then
    return new;
  end if;
  select coalesce(array_agg(c), '{}') into faltando
    from unnest(exigidos) as c
   where coalesce(nullif(trim(new.custom_fields -> 'opa' ->> c), ''), null) is null;
  preenchidos := cardinality(exigidos) - cardinality(faltando);
  minimo := least(coalesce(minimo, cardinality(exigidos)), cardinality(exigidos));
  if preenchidos < minimo then
    raise exception 'Para avançar, preencha % de: %.', minimo - preenchidos, array_to_string(faltando, ', ')
      using errcode = 'P0001', hint = 'trava_campos_etapa';
  end if;
  return new;
end;
$$;

-- As etapas travadas da OPA (Diagnóstico feito em diante) passam a pedir 2 dos 4.
update public.crm_stages s
   set campos_minimo = 2
  from public.organizations o
 where o.id = s.organization_id
   and o.slug = 'opa'
   and s.campos_obrigatorios @> array['finalidade', 'regiao', 'momento', 'inegociavel']::text[];

notify pgrst, 'reload schema';
