/**
 * Etapa que anda sozinha (pedido do Allyson em 07/11/2026). Três movimentos, só
 * no funil Compradores e só para frente:
 *
 *  1. Primeira resposta do corretor (mensagem que não é a boas-vindas automática,
 *     "Respondi" ou ligação atendida)        -> Primeiro contato
 *  2. 2 dos 4 campos do diagnóstico preenchidos -> Diagnóstico feito (2 de 4 desde 12/11/2026)
 *  3. Seleção enviada pela ficha             -> Seleção enviada
 *
 * Por que aqui e não nas Automações da tela: card movido por regra não dispara
 * outra regra (anti-loop do motor), então o painel de tracking não seria avisado
 * e a Meta não receberia o evento. Aqui o aviso sai pelo mesmo caminho da ficha
 * (avisarMudancaDeEtapa), e a trava do diagnóstico vale igual.
 *
 * Nunca volta o card, nunca mexe em Sem momento, ganho ou perdido. Fica no
 * histórico como "Etapa mudou sozinha". Melhor esforço: nunca lança.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { avisarMudancaDeEtapa } from "./eventos-lead";

export const CAMPOS_DO_DIAGNOSTICO = ["finalidade", "regiao", "momento", "inegociavel"] as const;

/**
 * Quantos dos 4 campos bastam para o "Diagnóstico feito" (pedido do Allyson, 12/11/2026).
 * O banco confere o mesmo número em `crm_stages.campos_minimo` (migration 0133).
 */
export const MINIMO_DO_DIAGNOSTICO = 2;

export type MotivoAvanco = "primeira_resposta" | "diagnostico_completo" | "selecao_enviada";

export const DESTINO_DO_MOTIVO: Record<MotivoAvanco, string> = {
  primeira_resposta: "primeiro-contato",
  diagnostico_completo: "diagnostico",
  selecao_enviada: "selecao",
};

const TEXTO_DO_MOTIVO: Record<MotivoAvanco, string> = {
  primeira_resposta: "o corretor respondeu o lead",
  diagnostico_completo: "o diagnóstico ficou feito (2 dos 4 campos)",
  selecao_enviada: "a seleção de imóveis foi enviada pela ficha",
};

export interface EtapaSimples {
  id: string;
  slug: string;
  nome: string;
  posicao: number;
  ganho: boolean;
  perdido: boolean;
}

export function camposDoDiagnosticoPreenchidos(opa: Record<string, unknown> | null | undefined): number {
  return CAMPOS_DO_DIAGNOSTICO.filter((k) => String(opa?.[k] ?? "").trim() !== "").length;
}

export function diagnosticoFeito(opa: Record<string, unknown> | null | undefined): boolean {
  return camposDoDiagnosticoPreenchidos(opa) >= MINIMO_DO_DIAGNOSTICO;
}

/**
 * Para qual etapa o card vai, ou null se fica onde está. Separado do banco para
 * testar a regra inteira: só para frente, nunca de Sem momento, ganho ou perdido,
 * e nada passa de "Diagnóstico feito" sem 2 dos 4 campos (a mesma trava da ficha).
 */
export function decidirAvanco(p: {
  etapas: EtapaSimples[];
  atualId: string;
  destinoSlug: string;
  status: string;
  diagnosticoCompleto: boolean;
}): EtapaSimples | null {
  if (p.status !== "open") return null;
  const atual = p.etapas.find((e) => e.id === p.atualId);
  const destino = p.etapas.find((e) => e.slug === p.destinoSlug);
  if (!atual || !destino) return null;
  if (atual.ganho || atual.perdido || atual.slug === "sem-momento") return null;
  if (destino.posicao <= atual.posicao) return null;
  const diag = p.etapas.find((e) => e.slug === "diagnostico");
  if (diag && destino.posicao >= diag.posicao && !p.diagnosticoCompleto) return null;
  return destino;
}

/** Leva o card para a etapa do motivo, se a regra deixar. Devolve a etapa nova ou null. */
export async function avancarEtapa(
  admin: SupabaseClient,
  orgId: string,
  leadId: string,
  motivo: MotivoAvanco,
  detalhe: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const { data: lead } = await admin
      .from("crm_leads")
      .select("id, status, pipeline_id, stage_id, contact_id, custom_fields, crm_pipelines(slug)")
      .eq("organization_id", orgId)
      .eq("id", leadId)
      .maybeSingle();
    const l = lead as unknown as {
      status: string;
      pipeline_id: string;
      stage_id: string;
      contact_id: string | null;
      custom_fields: Record<string, unknown> | null;
      crm_pipelines: { slug: string } | null;
    } | null;
    if (!l || l.crm_pipelines?.slug !== "compradores") return null;

    const { data: linhas } = await admin
      .from("crm_stages")
      .select("id, slug, name, position, is_won, is_lost")
      .eq("pipeline_id", l.pipeline_id);
    const etapas = ((linhas ?? []) as Array<{ id: string; slug: string; name: string; position: number; is_won: boolean; is_lost: boolean }>).map((e) => ({
      id: e.id,
      slug: e.slug,
      nome: e.name,
      posicao: Number(e.position),
      ganho: e.is_won,
      perdido: e.is_lost,
    }));
    const destino = decidirAvanco({
      etapas,
      atualId: l.stage_id,
      destinoSlug: DESTINO_DO_MOTIVO[motivo],
      status: l.status,
      diagnosticoCompleto: diagnosticoFeito(l.custom_fields?.opa as Record<string, unknown> | undefined),
    });
    if (!destino) return null;

    const agora = new Date().toISOString();
    // Só move se ninguém mexeu no meio (o corretor arrastou enquanto isso): não passa por cima.
    const { data: mudou, error } = await admin
      .from("crm_leads")
      .update({ stage_id: destino.id, stage_changed_at: agora, last_activity_at: agora })
      .eq("organization_id", orgId)
      .eq("id", leadId)
      .eq("stage_id", l.stage_id)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (error || !mudou) return null;

    const de = etapas.find((e) => e.id === l.stage_id);
    await admin.from("crm_lead_activities").insert({
      organization_id: orgId,
      lead_id: leadId,
      contact_id: l.contact_id,
      source_module: "opa",
      type: "etapa_automatica",
      payload: { de: de?.nome ?? null, para: destino.nome, motivo, ...detalhe },
      performed_at: agora,
      actor_kind: "system",
      reason: `Etapa mudou sozinha para ${destino.nome}: ${TEXTO_DO_MOTIVO[motivo]}.`,
    });
    await avisarMudancaDeEtapa(admin, orgId, leadId, l.stage_id, `opa.auto.${motivo}`);
    return destino.slug;
  } catch (e) {
    console.error("[opa.avanco] não avançou", { leadId, motivo, erro: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * Leads em "Lead recebido" que já tiveram a primeira resposta do corretor:
 * mensagem enviada depois da entrada (fora a boas-vindas automática), "Respondi"
 * ou ligação atendida ou com pedido de retorno. Ligação não atendida não é
 * contato. Roda na rotina de cada minuto; devolve quantos andaram.
 */
export async function avancarRespondidos(admin: SupabaseClient, orgId: string, agora = Date.now()): Promise<number> {
  const { data: funil } = await admin.from("crm_pipelines").select("id").eq("organization_id", orgId).eq("slug", "compradores").maybeSingle();
  if (!funil) return 0;
  const { data: entrada } = await admin
    .from("crm_stages")
    .select("id")
    .eq("pipeline_id", (funil as { id: string }).id)
    .eq("slug", "lead-recebido")
    .maybeSingle();
  if (!entrada) return 0;
  // Janela de 30 dias: lead mais velho parado na entrada é caso para a gestão olhar, não para a rotina.
  const { data: leads } = await admin
    .from("crm_leads")
    .select("id, contact_id, created_at, custom_fields")
    .eq("organization_id", orgId)
    .eq("status", "open")
    .eq("stage_id", (entrada as { id: string }).id)
    .gte("created_at", new Date(agora - 30 * 86_400_000).toISOString())
    .limit(500);

  let andaram = 0;
  for (const l of (leads ?? []) as Array<{ id: string; contact_id: string | null; created_at: string; custom_fields: Record<string, unknown> | null }>) {
    const bv = (l.custom_fields?.boas_vindas as { em?: string } | undefined)?.em;
    // A boas-vindas e o eco dela chegam até 1 minuto depois da hora gravada.
    const depoisDe = new Date(Math.max(Date.parse(l.created_at), bv ? Date.parse(bv) + 60_000 : 0)).toISOString();
    let como: string | null = null;
    if (l.contact_id) {
      const { data: msg } = await admin
        .from("messages")
        .select("id, metadata")
        .eq("organization_id", orgId)
        .eq("contact_id", l.contact_id)
        .eq("direction", "outbound")
        .neq("status", "failed")
        .gt("sent_at", depoisDe)
        .limit(5);
      if (((msg ?? []) as Array<{ metadata: Record<string, unknown> | null }>).some((m) => m.metadata?.boas_vindas !== true)) como = "mensagem";
    }
    if (!como) {
      const { data: atividades } = await admin
        .from("crm_lead_activities")
        .select("type, payload")
        .eq("organization_id", orgId)
        .eq("lead_id", l.id)
        .in("type", ["respondido", "ligacao"])
        .gt("performed_at", l.created_at)
        .limit(20);
      const lista = (atividades ?? []) as Array<{ type: string; payload: { resultado?: string } | null }>;
      if (lista.some((a) => a.type === "respondido")) como = "respondi";
      else if (lista.some((a) => a.type === "ligacao" && (a.payload?.resultado === "atendeu" || a.payload?.resultado === "retorno"))) como = "ligacao";
    }
    if (como && (await avancarEtapa(admin, orgId, l.id, "primeira_resposta", { como }))) andaram++;
  }
  return andaram;
}
