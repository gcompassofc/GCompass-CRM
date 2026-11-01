/**
 * Números do Início da OPA: leads novos e "respondidos no prazo".
 *
 * Regras (revisão de 31/10/2026, F3):
 *  - lead novo é todo lead criado no período, aberto, ganho ou perdido (antes só
 *    contava o que ainda estava aberto, e o número encolhia com o tempo);
 *  - a primeira resposta é a primeira mensagem do corretor, a primeira ligação
 *    registrada ou o "Respondi" depois do início da espera;
 *  - lead sem conversa e sem resposta conta como não respondido quando o prazo
 *    acaba, nunca como respondido; dentro do prazo ainda não entra na conta;
 *  - prazo e minutos seguem Configurações (prazos e horário de atendimento).
 */
import { createClient } from "@/lib/supabase/server";

import { esperaEmMinutos } from "./atendimento";
import type { ConfigOpa } from "./config";
import { todasAsPaginas } from "./lotes";

export interface LeadParaPrazo {
  id: string;
  pago: boolean;
  /** Criação do lead (ms): início da espera quando o banco não achou mensagem. */
  criadoEm: number;
}

export interface RespostaDoLead {
  /** Desde quando o lead espera (ms). */
  inicio: number;
  /** Primeira resposta (ms), ou null se ainda não houve. */
  resposta: number | null;
}

export interface ResumoDoPrazo {
  /** Leads que já podem ser julgados: responderam, ou o prazo acabou sem resposta. */
  avaliados: number;
  noPrazo: number;
  /** Ainda dentro do prazo, sem resposta: fora da conta por enquanto. */
  pendentes: number;
}

export function resumirPrazo(
  leads: LeadParaPrazo[],
  respostas: Map<string, RespostaDoLead>,
  config: Pick<ConfigOpa, "prazos" | "horario">,
  agora: number,
): ResumoDoPrazo {
  let avaliados = 0;
  let noPrazo = 0;
  let pendentes = 0;
  for (const l of leads) {
    const prazo = l.pago ? config.prazos.pago_min : config.prazos.organico_min;
    const r = respostas.get(l.id);
    const inicio = r?.inicio ?? l.criadoEm;
    if (r?.resposta != null) {
      avaliados++;
      if (esperaEmMinutos(inicio, r.resposta, config.horario) <= prazo) noPrazo++;
    } else if (esperaEmMinutos(inicio, agora, config.horario) > prazo) {
      avaliados++;
    } else {
      pendentes++;
    }
  }
  return { avaliados, noPrazo, pendentes };
}

/** Início e primeira resposta de cada lead, calculados no banco (migration 0119). */
export async function carregarRespostasDosLeads(orgId: string, leadIds: string[]): Promise<Map<string, RespostaDoLead>> {
  const mapa = new Map<string, RespostaDoLead>();
  if (leadIds.length === 0) return mapa;
  const supabase = await createClient();
  const TAMANHO = 500;
  const lotes: string[][] = [];
  for (let i = 0; i < leadIds.length; i += TAMANHO) lotes.push(leadIds.slice(i, i + TAMANHO));
  const respostas = await Promise.all(lotes.map((lote) => supabase.rpc("fn_opa_resposta_do_lead", { p_org: orgId, p_leads: lote })));
  for (const { data, error } of respostas) {
    if (error) throw new Error(`carregarRespostasDosLeads: ${error.message}`);
    for (const [id, v] of Object.entries((data ?? {}) as Record<string, { inicio: string; resposta: string | null }>)) {
      mapa.set(id, { inicio: Date.parse(v.inicio), resposta: v.resposta ? Date.parse(v.resposta) : null });
    }
  }
  return mapa;
}

export interface NumerosDoInicio extends ResumoDoPrazo {
  novos: number;
  novosAntes: number;
}

/**
 * Leads novos do período e do período anterior (todos os status, funil de
 * compradores) e o resumo do prazo de resposta dos novos. Lê pela sessão: o RLS
 * mostra ao corretor só os leads dele.
 */
export async function carregarNumerosDoInicio(
  orgId: string,
  periodo: { de: number; ate: number; anterior: { de: number; ate: number } },
  config: Pick<ConfigOpa, "prazos" | "horario">,
  opts: { corretor?: string | null; agora?: number } = {},
): Promise<NumerosDoInicio> {
  const supabase = await createClient();
  const agora = opts.agora ?? Date.now();
  const { data: funil } = await supabase.from("crm_pipelines").select("id").eq("organization_id", orgId).eq("slug", "compradores").maybeSingle();
  if (!funil) return { novos: 0, novosAntes: 0, avaliados: 0, noPrazo: 0, pendentes: 0 };

  const linhas = await todasAsPaginas((de, ate) => {
    let c = supabase
      .from("crm_leads")
      .select("id, source, tags, created_at")
      .eq("organization_id", orgId)
      .eq("pipeline_id", (funil as { id: string }).id)
      .gte("created_at", new Date(periodo.anterior.de).toISOString())
      .lt("created_at", new Date(periodo.ate).toISOString());
    if (opts.corretor) c = c.eq("owner_user_id", opts.corretor);
    return c.order("created_at", { ascending: false }).order("id").range(de, ate);
  }).catch((e) => {
    throw new Error(`carregarNumerosDoInicio: ${e instanceof Error ? e.message : String(e)}`);
  });

  const leads = (linhas as unknown as Array<{ id: string; source: string | null; tags: string[] | null; created_at: string }>).map((l) => ({
    id: l.id,
    pago: l.source === "meta" || (l.tags ?? []).includes("pago"),
    criadoEm: Date.parse(l.created_at),
  }));
  const novos = leads.filter((l) => l.criadoEm >= periodo.de && l.criadoEm < periodo.ate);
  const novosAntes = leads.length - novos.length;
  const respostas = await carregarRespostasDosLeads(orgId, novos.map((l) => l.id));
  return { novos: novos.length, novosAntes, ...resumirPrazo(novos, respostas, config, agora) };
}
