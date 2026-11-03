/**
 * Avisos ao motor de automações (lib/automation) pelos caminhos da OPA.
 *
 * O motor reage a eventos do event_log. A API v1 já emitia `lead.created`,
 * `lead.stage_changed` e `lead.tag_added`, mas a entrada de lead do site, a ficha
 * (mudar etapa, ganhar, perder, reabrir) e as etiquetas da OPA gravam o lead
 * direto, e nenhuma automação disparava para lead da OPA (03/11/2026). O formato
 * do payload é o mesmo da API (app/api/v1/leads/_handler.ts): as condições das
 * regras leem os mesmos campos venha o lead de onde vier.
 *
 * Nunca lança: falha no aviso fica no log e não desfaz o que o corretor fez.
 * Sempre pelo service role, com a org já resolvida de fonte confiável.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

async function emitir(
  admin: SupabaseClient,
  orgId: string,
  tipo: "lead.created" | "lead.stage_changed" | "lead.tag_added",
  leadId: string,
  payload: Record<string, unknown>,
  origem: string,
): Promise<void> {
  try {
    const { error } = await admin.rpc("emit_event", {
      p_event_type: tipo,
      p_entity_kind: "crm_lead",
      p_entity_id: leadId,
      p_payload: payload,
      p_metadata: { origem },
      p_organization_id: orgId,
    });
    if (error) console.error(`[opa.eventos] ${tipo} não emitido`, { leadId, origem, code: error.code });
  } catch (e) {
    console.error(`[opa.eventos] ${tipo} não emitido`, { leadId, origem, erro: (e as Error).message });
  }
}

export async function avisarLeadCriado(
  admin: SupabaseClient,
  orgId: string,
  lead: { id: string; pipeline_id: string; stage_id: string; title: string },
  origem: string,
): Promise<void> {
  await emitir(admin, orgId, "lead.created", lead.id, {
    pipeline_id: lead.pipeline_id,
    stage_id: lead.stage_id,
    title: lead.title,
  }, origem);
}

/** Etapa atual do lead, para guardar o "de onde" antes de mudar. */
export async function etapaAtual(admin: SupabaseClient, orgId: string, leadId: string): Promise<string | null> {
  try {
    const { data } = await admin
      .from("crm_leads")
      .select("stage_id")
      .eq("organization_id", orgId)
      .eq("id", leadId)
      .maybeSingle();
    return (data as { stage_id: string | null } | null)?.stage_id ?? null;
  } catch {
    return null;
  }
}

/** Lê como o lead ficou e avisa se a etapa mudou de fato. */
export async function avisarMudancaDeEtapa(
  admin: SupabaseClient,
  orgId: string,
  leadId: string,
  deEtapa: string | null,
  origem: string,
): Promise<void> {
  let data: unknown = null;
  try {
    ({ data } = await admin
      .from("crm_leads")
      .select("pipeline_id, stage_id, status, position_in_stage")
      .eq("organization_id", orgId)
      .eq("id", leadId)
      .maybeSingle());
  } catch (e) {
    console.error("[opa.eventos] etapa não lida", { leadId, origem, erro: (e as Error).message });
    return;
  }
  const lead = data as { pipeline_id: string; stage_id: string; status: string; position_in_stage: number | null } | null;
  if (!lead || lead.stage_id === deEtapa) return;
  await emitir(admin, orgId, "lead.stage_changed", leadId, {
    pipeline_id: lead.pipeline_id,
    from_stage_id: deEtapa,
    to_stage_id: lead.stage_id,
    position_in_stage: lead.position_in_stage,
    status: lead.status,
  }, origem);
}

export async function avisarTagsNovas(
  admin: SupabaseClient,
  orgId: string,
  leadId: string,
  novas: string[],
  todas: string[],
  origem: string,
): Promise<void> {
  if (novas.length === 0) return;
  await emitir(admin, orgId, "lead.tag_added", leadId, { added_tags: novas, tags: todas }, origem);
}
