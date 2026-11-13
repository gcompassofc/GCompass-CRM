/**
 * Etiqueta "conversou" na primeira mensagem do cliente (13/11/2026).
 *
 * O banco decide e marca em um passo só (fn_opa_marcar_conversou, migração
 * 0134): card aberto do contato, vindo do painel (site, Meta, linkbio), sem a
 * etiqueta, com mensagem do cliente a partir de 30 min antes do card. Cada card
 * marcado agora gera um lead.tag_added, que a regra de automação leva ao painel
 * de tracking; lá vira a conversão conversa_iniciada, uma vez por negócio.
 *
 * Chamado em dois momentos, porque a ordem não é garantida: quando a mensagem
 * chega (lib/waha/ingest.ts) e quando o lead do site nasce
 * (lib/opa/entrada.ts), para a mensagem que chegou antes do card.
 *
 * Nunca lança: falha aqui fica no log e não atrapalha a mensagem nem o lead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { avisarTagsNovas } from "./eventos-lead";

export const ETIQUETA_CONVERSOU = "conversou";

export async function marcarConversou(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  origem: string,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc("fn_opa_marcar_conversou", { p_org: orgId, p_contact: contactId });
    if (error) {
      console.error("[opa.conversou] etiqueta não marcada", { contactId, origem, code: error.code });
      return 0;
    }
    const marcados = (Array.isArray(data) ? data : []) as Array<{ lead_id: string; tags: string[] | null }>;
    for (const m of marcados) {
      await avisarTagsNovas(admin, orgId, m.lead_id, [ETIQUETA_CONVERSOU], m.tags ?? [ETIQUETA_CONVERSOU], origem);
    }
    return marcados.length;
  } catch (e) {
    console.error("[opa.conversou] etiqueta não marcada", { contactId, origem, erro: (e as Error).message });
    return 0;
  }
}
