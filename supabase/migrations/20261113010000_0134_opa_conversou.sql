-- 0134 · Etiqueta "conversou" na primeira mensagem do cliente (13/11/2026)
--
-- Pedido do Allyson: medir os leads do site que viraram conversa, com dado do
-- CRM, sem poluir a medição com clique no botão de WhatsApp.
--
-- Quando chega mensagem do cliente no WhatsApp (ou quando o lead do site nasce
-- e a mensagem chegou antes), o card aberto desse contato ganha a etiqueta
-- "conversou". Vale só para card que entrou pelo painel (source site, meta ou
-- linkbio) e uma vez por card: quem já tem a etiqueta não é tocado. O app avisa
-- o motor com lead.tag_added, a regra de automação manda o card ao painel de
-- tracking, e o painel dispara a conversão conversa_iniciada (GA4 working_lead)
-- uma vez por negócio.
--
-- Conta só mensagem a partir de 30 minutos antes do card: conversa antiga de
-- quem volta pelo site não vira conversão nova.
--
-- O UPDATE com "not ('conversou' = any(tags))" reavalia a condição depois do
-- bloqueio da linha: duas mensagens ao mesmo tempo devolvem o card uma vez só.
--
-- Pode rodar de novo sem estragar.

create or replace function public.fn_opa_marcar_conversou(p_org uuid, p_contact uuid)
returns table (lead_id uuid, tags text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org is null or p_contact is null then
    return;
  end if;
  return query
  update public.crm_leads l
     set tags = array_append(coalesce(l.tags, '{}'::text[]), 'conversou')
   where l.organization_id = p_org
     and l.contact_id = p_contact
     and l.status = 'open'
     and l.source in ('site', 'meta', 'linkbio')
     and not ('conversou' = any(coalesce(l.tags, '{}'::text[])))
     and exists (
       select 1
         from public.messages m
        where m.organization_id = p_org
          and m.contact_id = p_contact
          and m.direction = 'inbound'
          and m.created_at >= l.created_at - interval '30 minutes'
     )
  returning l.id, l.tags;
end;
$$;

revoke all on function public.fn_opa_marcar_conversou(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_opa_marcar_conversou(uuid, uuid) to service_role;
