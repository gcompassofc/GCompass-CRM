"use server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarImoveis, carregarLeads, ROTULO_ORIGEM } from "@/lib/opa/dados";
import { fotoUrl } from "@/lib/opa/imoveis";
import { createClient } from "@/lib/supabase/server";

export interface ResumoDoLead {
  id: string;
  nome: string;
  /** Viewer só lê: o lápis do nome nem aparece. */
  podeEditar: boolean;
  proprio: boolean;
  origem: string;
  telefone: string | null;
  etapaId: string;
  etapas: Array<{ id: string; nome: string }>;
  proximo: string | null;
  sugestao: string | null;
  tentativas: number;
  imovel: { codigo: string; titulo: string; foto: string | null } | null;
  atividades: Array<{ quando: string; texto: string }>;
}

/**
 * O que o painel lateral mostra de um lead. Lê com a sessão de quem pediu: lead
 * fora do alcance da pessoa volta null, pela mesma RLS da ficha.
 */
export async function resumoDoLead(leadId: string): Promise<ResumoDoLead | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  const [lead] = await carregarLeads(org.orgId, { leadId });
  if (!lead) return null;

  const supabase = await createClient();
  const [imoveis, { data: etapas }, { data: atividades }] = await Promise.all([
    carregarImoveis(org.orgId),
    supabase
      .from("crm_stages")
      .select("id, name, is_won, is_lost")
      .eq("organization_id", org.orgId)
      .eq("pipeline_id", lead.pipelineId)
      .eq("is_archived", false)
      .order("position"),
    supabase
      .from("crm_lead_activities")
      .select("type, performed_at, reason")
      .eq("lead_id", leadId)
      .not("reason", "is", null)
      .order("performed_at", { ascending: false })
      .limit(3),
  ]);
  const im = imoveis.find((i) => i.codigo === lead.imovelCodigo);

  return {
    id: lead.id,
    nome: lead.nome,
    podeEditar: org.role !== "viewer",
    proprio: lead.proprio,
    origem: ROTULO_ORIGEM[lead.origem.canal ?? ""] ?? lead.origem.canal ?? "Origem",
    telefone: lead.telefone ?? null,
    etapaId: lead.etapa.id,
    etapas: ((etapas ?? []) as Array<{ id: string; name: string; is_won: boolean; is_lost: boolean }>)
      .filter((e) => !e.is_won && !e.is_lost)
      .map((e) => ({ id: e.id, nome: e.name })),
    proximo: lead.copiloto.proximoPasso ?? null,
    sugestao: lead.copiloto.mensagem ?? null,
    tentativas: lead.tentativasLigacao,
    imovel: im ? { codigo: im.codigo, titulo: im.titulo, foto: fotoUrl(im) } : null,
    atividades: ((atividades ?? []) as Array<{ performed_at: string; reason: string }>).map((a) => ({
      quando: new Date(a.performed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).replace(".", ""),
      texto: a.reason,
    })),
  };
}
